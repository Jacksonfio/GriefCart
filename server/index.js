import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { getDb, seedDemoData, queryAll, queryOne, run } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'griefcart-dev-secret-change-in-production';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const S3_DOCUMENT_BUCKET = process.env.S3_DOCUMENT_BUCKET || '';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const STEP_FUNCTION_ARN = process.env.STEP_FUNCTION_ARN || '';
const SES_FROM_ADDRESS = process.env.SES_FROM_ADDRESS || process.env.SMTP_FROM || '';

let awsSdkCache = null;

async function getAwsSdk() {
  if (awsSdkCache) return awsSdkCache;
  try {
    const mod = await import('aws-sdk');
    awsSdkCache = mod.default || mod;
    return awsSdkCache;
  } catch {
    return null;
  }
}

async function authenticateWithCognito(email, password, name) {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return null;
  const AWS = await getAwsSdk();
  if (!AWS) return null;
  try {
    AWS.config.update({ region: AWS_REGION });
    const cognito = new AWS.CognitoIdentityServiceProvider();
    const signUpResult = await cognito.signUp({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'name', Value: name || email },
      ],
    }).promise();
    const userSub = signUpResult.UserSub || `${Date.now()}`;
    const token = jwt.sign({ userId: userSub, email, authSource: 'cognito' }, JWT_SECRET, { expiresIn: '7d' });
    return { token, userId: userSub, email, status: 'signup-pending' };
  } catch {
    return null;
  }
}

async function loginWithCognito(email, password) {
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return null;
  const AWS = await getAwsSdk();
  if (!AWS) return null;
  try {
    AWS.config.update({ region: AWS_REGION });
    const cognito = new AWS.CognitoIdentityServiceProvider();
    const authResult = await cognito.initiateAuth({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }).promise();
    const token = jwt.sign({
      userId: authResult?.AuthenticationResult?.AccessToken || `${Date.now()}`,
      email,
      authSource: 'cognito',
    }, JWT_SECRET, { expiresIn: '7d' });
    return { token, userId: authResult?.AuthenticationResult?.AccessToken || `${Date.now()}`, email };
  } catch {
    return null;
  }
}

async function storeDocumentInVault({ fileName, contentType, buffer, userId, category }) {
  if (S3_DOCUMENT_BUCKET && AWS_REGION) {
    const AWS = await getAwsSdk();
    if (AWS) {
      const s3 = new AWS.S3();
      const kms = KMS_KEY_ID ? new AWS.KMS() : null;
      const key = `documents/${userId}/${Date.now()}-${fileName}`;
      let body = buffer;
      let encrypted = false;
      let kmsKeyId = null;
      if (kms) {
        const encryptedResult = await kms.encrypt({ KeyId: KMS_KEY_ID, Plaintext: buffer }).promise();
        body = encryptedResult.CiphertextBlob;
        encrypted = true;
        kmsKeyId = KMS_KEY_ID;
      }
      const uploadParams = {
        Bucket: S3_DOCUMENT_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/octet-stream',
        Metadata: { userId, category: category || 'other' },
      };
      await s3.putObject(uploadParams).promise();
      return { storageType: 's3', storageLocation: key, bucket: S3_DOCUMENT_BUCKET, kmsKeyId, encrypted };
    }
  }
  const filePath = join(uploadsDir, `${Date.now()}-${fileName}`);
  fs.writeFileSync(filePath, buffer);
  return { storageType: 'local', storageLocation: filePath, bucket: null, kmsKeyId: null, encrypted: false };
}

async function notifyTrustedPerson(person, user, verificationLink) {
  const baseMessage = `${user.name || user.email} has invited you to act as a trusted person in GriefCart. Please verify your access by visiting ${verificationLink}`;

  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || SES_FROM_ADDRESS || 'jacksonjp646@gmail.com',
        to: person.email,
        subject: `GriefCart access invitation for ${user.name || user.email}`,
        text: baseMessage,
      });
      return { delivered: true, provider: 'smtp', verificationLink };
    } catch (error) {
      console.error('SMTP invite error:', error);
    }
  }

  if (SES_FROM_ADDRESS && AWS_REGION) {
    const AWS = await getAwsSdk();
    if (AWS) {
      try {
        const ses = new AWS.SES();
        await ses.sendEmail({
          Source: SES_FROM_ADDRESS,
          Destination: { ToAddresses: [person.email] },
          Message: {
            Subject: { Data: `GriefCart access invitation for ${user.name || user.email}` },
            Body: { Text: { Data: baseMessage } },
          },
        }).promise();
        return { delivered: true, provider: 'ses', verificationLink };
      } catch (error) {
        console.error('SES invite error:', error);
      }
    }
  }

  return { delivered: false, provider: 'queued', verificationLink, message: 'Invitation created. A verification link is ready for delivery.' };
}

async function refreshUserAnalysis(userId, userEmail = '') {
  const docs = queryAll('SELECT * FROM documents WHERE userId = ? ORDER BY uploadedAt DESC LIMIT 8', [userId]);
  const trustedPeople = queryAll('SELECT * FROM trusted_persons WHERE userId = ? ORDER BY priority', [userId]);
  const existingTwin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [userId]);

  const docSummary = docs.map((doc) => `${doc.category}: ${doc.fileName}`).join(' | ') || 'No documents uploaded yet.';
  const aiSummary = await callGemini(
    `Analyze the current financial profile from these documents and return a brief practical summary plus 3 next steps. Documents: ${docSummary}`,
    'You are a financial continuity analyst. Provide a concise analysis and concrete next steps.',
    800,
    0.6
  );

  const profile = {
    email: userEmail || '',
    totalDocuments: docs.length,
    estimatedNetWorth: docs.length > 0 ? 'Estimated from uploaded documents' : null,
    summary: aiSummary || 'Add more documents to strengthen the digital twin.',
  };

  const assets = docs.length > 0 ? [{ type: 'document', name: 'Uploaded records', value: `${docs.length} files`, sourceDocument: docs[0]?.fileName || 'N/A', confidence: 80, continuityRisk: 'medium' }] : [];
  const liabilities = [];
  const insurance = [];
  const recurringPayments = [];
  const relationships = trustedPeople.map((person) => ({ from: 'user', to: person.name, type: person.relationship || 'trusted' }));
  const risks = docs.length < 3 ? [{ type: 'documentation_gap', description: 'Upload more supporting documents for a stronger analysis', severity: 'medium' }] : [];
  const missingAssets = docs.length < 3 ? ['Insurance policies', 'Investment statements', 'Digital asset inventory'] : [];
  const continuityPlan = { criticalItems: docs.length > 0 ? ['Primary documents', 'Beneficiary information', 'Trusted contacts'] : [], trustedAccess: trustedPeople.length > 0 ? 'limited' : 'none', recommendations: ['Upload more documents', 'Confirm trusted contacts'] };

  const twinId = uuidv4();
  run('INSERT INTO financial_twins (twinId, userId, profile, assets, liabilities, insurance, recurringPayments, relationships, risks, missingAssets, continuityPlan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    twinId, userId, JSON.stringify(profile), JSON.stringify(assets), JSON.stringify(liabilities), JSON.stringify(insurance), JSON.stringify(recurringPayments), JSON.stringify(relationships), JSON.stringify(risks), JSON.stringify(missingAssets), JSON.stringify(continuityPlan)
  ]);

  const docScore = Math.min(100, Math.round((docs.length || 0) * 12));
  const trustedScore = Math.min(100, Math.round((trustedPeople.length || 0) * 20));
  const planScore = 0;
  const twinScore = docs.length > 0 ? 90 : 0;
  const legacyScore = 0;
  const scoreValue = Math.round((docScore * 0.35) + (trustedScore * 0.2) + (planScore * 0.2) + (twinScore * 0.15) + (legacyScore * 0.1));
  const color = scoreValue >= 75 ? 'emerald' : scoreValue >= 50 ? 'gold' : 'red';
  const assessment = scoreValue >= 75 ? 'Strong continuity foundation with clear backup plans.' : scoreValue >= 50 ? 'Solid baseline with a few important gaps to close.' : 'More documents and trusted contacts will materially improve your readiness.';
  const breakdown = { documents: docScore, trustedPersons: trustedScore, plan: planScore, twin: twinScore, legacy: legacyScore, hasPlan: false };
  run('INSERT INTO continuity_scores (userId, score, assessment, color, breakdown) VALUES (?, ?, ?, ?, ?)', [userId, scoreValue, assessment, color, JSON.stringify(breakdown)]);

  return {
    twinId,
    analysis: {
      summary: aiSummary || 'Add more documents to strengthen your analysis.',
      suggestedActions: docs.length > 0 ? ['Upload additional supporting documents', 'Add trusted persons', 'Generate a continuity plan'] : ['Upload key documents first', 'Add trusted persons', 'Generate a continuity plan'],
      documentCount: docs.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function activateStepFunction(userId, trustedPersons) {
  if (!STEP_FUNCTION_ARN) return { started: false, provider: 'local' };
  const AWS = await getAwsSdk();
  if (!AWS) return { started: false, provider: 'local' };
  const stepfunctions = new AWS.StepFunctions();
  await stepfunctions.startExecution({
    stateMachineArn: STEP_FUNCTION_ARN,
    input: JSON.stringify({ userId, trustedPersons, activatedAt: new Date().toISOString() }),
  }).promise();
  return { started: true, provider: 'step-functions' };
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// File upload setup
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── AI Helper ─────────────────────────────────────────────
async function callGemini(prompt, system = '', maxTokens = 1000, temperature = 0.7) {
  if (!GEMINI_API_KEY) {
    return fallbackResponse(prompt);
  }
  try {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || fallbackResponse(prompt);
  } catch {
    return fallbackResponse(prompt);
  }
}

function fallbackResponse(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes('continuity') || lower.includes('score')) {
    return `Based on your financial profile, I'd recommend focusing on these areas to improve your continuity score:
1. **Document Completeness** — Ensure all key documents are uploaded (will, insurance policies, bank statements)
2. **Trusted Persons** — Designate at least 3 trusted contacts with clear access levels
3. **Legacy Planning** — Complete your legacy letter with personal messages
4. **Regular Reviews** — Update your financial twin monthly to track changes`;
  }
  if (lower.includes('twin') || lower.includes('financial')) {
    return `Your **Financial Digital Twin** analyzes your uploaded documents to create a comprehensive financial profile. To get the most from it:
• Upload all bank statements, investment accounts, insurance policies, and property documents
• The AI will extract key information and identify gaps in your financial picture
• Review the generated assets, liabilities, and risk indicators regularly
• Use the "Refresh Twin" feature after adding new documents`;
  }
  if (lower.includes('asset') || lower.includes('detective') || lower.includes('missing')) {
    return `The **AI Financial Detective** can help uncover:
• **Missing Assets** — Accounts or properties not yet documented
• **Hidden Subscriptions** — Recurring payments you may have forgotten
• **Document Gaps** — Important documents you haven't uploaded yet
• **Risk Indicators** — Areas where your financial plan needs attention

Upload more documents to get more comprehensive results.`;
  }
  if (lower.includes('document') || lower.includes('upload') || lower.includes('vault')) {
    return `Your **Document Vault** provides secure, encrypted storage for all important financial documents:
• Upload PDFs, spreadsheets, and images
• Organize by category (banking, insurance, property, legal, tax, etc.)
• Documents are analyzed to build your Financial Twin
• Critical documents are identified for your Continuity Plan`;
  }
  if (lower.includes('emergency') || lower.includes('activate')) {
    return `**Emergency Activation** will:
1. Verify your identity and access level
2. Notify your trusted persons automatically
3. Grant them access based on your predefined settings
4. Generate a recovery guide for your loved ones

Configure your trusted persons and set proper access levels before activating.`;
  }
  return `Hello! I'm your **GriefCart Financial Continuity Assistant**. I can help you with:
• Understanding your Financial Digital Twin
• Improving your Continuity Score
• Managing your Document Vault  
• Running AI Detective scans for missing assets
• Creating and reviewing your Legacy Letter
• Setting up your Continuity Plan and Trusted Persons
• Guiding you through Emergency Recovery

What would you like help with today?`;
}

// ─── Init DB ───────────────────────────────────────────────
async function init() {
  await getDb();
  console.log('Database initialized');
}

// ─── Auth Routes ───────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    await getDb();
    const existing = queryOne('SELECT * FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const cognitoAuth = await authenticateWithCognito(email, password, name);
    if (cognitoAuth) {
      const userId = cognitoAuth.userId;
      run('INSERT INTO users (userId, email, name, password, verified) VALUES (?, ?, ?, ?, 1)', [
        userId, email, name || '', bcrypt.hashSync(password, 10)
      ]);
      await seedDemoData(userId);
      return res.json({ token: cognitoAuth.token, userId, email, message: 'Registration successful via Cognito. Demo data has been loaded.' });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    run('INSERT INTO users (userId, email, name, password, verified) VALUES (?, ?, ?, ?, 1)', [
      userId, email, name || '', hashedPassword
    ]);

    await seedDemoData(userId);

    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId, email, message: 'Registration successful! Demo data has been loaded.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    await getDb();
    const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
    const cognitoAuth = await loginWithCognito(email, password);
    if (cognitoAuth) {
      if (user) {
        run("UPDATE users SET lastLoginAt = datetime('now','localtime'), loginCount = loginCount + 1 WHERE userId = ?", [user.userId]);
      }
      return res.json({ token: cognitoAuth.token, userId: cognitoAuth.userId, email: cognitoAuth.email, authSource: 'cognito' });
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    run("UPDATE users SET lastLoginAt = datetime('now','localtime'), loginCount = loginCount + 1 WHERE userId = ?", [user.userId]);

    const token = jwt.sign({ userId: user.userId, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.userId, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/demo', async (req, res) => {
  await getDb();
  const demoEmail = 'demo@griefcart.app';
  let user = queryOne('SELECT * FROM users WHERE email = ?', [demoEmail]);
  
  if (!user) {
    const userId = uuidv4();
    const password = bcrypt.hashSync('demo1234', 10);
    run('INSERT INTO users (userId, email, name, password, verified) VALUES (?, ?, ?, ?, 1)', [
      userId, demoEmail, 'Demo User', password
    ]);
    await seedDemoData(userId);
    user = queryOne('SELECT * FROM users WHERE email = ?', [demoEmail]);
    
    const token = jwt.sign({ userId: user.userId, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, userId: user.userId, email: demoEmail, message: 'Demo account created with sample data!' });
  }
  
  run("UPDATE users SET lastLoginAt = datetime('now','localtime'), loginCount = loginCount + 1 WHERE userId = ?", [user.userId]);
  const token = jwt.sign({ userId: user.userId, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, userId: user.userId, email: demoEmail, message: 'Welcome back to the demo!' });
});

app.post('/api/auth/verify', auth, (req, res) => {
  res.json({ verified: true, userId: req.userId });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  await getDb();
  const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ error: 'No account found for that email' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  run('UPDATE users SET verificationCode = ? WHERE userId = ?', [code, user.userId]);
  res.json({ message: 'Reset code generated. Use it with the reset endpoint.', code });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Email, code and new password are required' });
  await getDb();
  const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || user.verificationCode !== code) return res.status(401).json({ error: 'Invalid reset code' });
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  run('UPDATE users SET password = ?, verificationCode = NULL WHERE userId = ?', [hashedPassword, user.userId]);
  res.json({ message: 'Password reset successful' });
});

app.post('/api/auth/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  await getDb();
  const user = queryOne('SELECT * FROM users WHERE userId = ?', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  run('UPDATE users SET password = ? WHERE userId = ?', [hashedPassword, req.userId]);
  res.json({ message: 'Password changed successfully' });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = queryOne('SELECT userId, email, name, createdAt, lastLoginAt, loginCount, continuityScore, twinStatus, mfaEnabled FROM users WHERE userId = ?', [req.userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── AI Gateway Routes ────────────────────────────────────
app.post('/api/ai/chat', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const user = queryOne('SELECT * FROM users WHERE userId = ?', [req.userId]);
  const docs = queryAll('SELECT COUNT(*) as count FROM documents WHERE userId = ?', [req.userId]);
  const docCount = docs[0]?.count || 0;
  const twin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  let contextStr = `User email: ${user?.email || 'unknown'}\nDocuments uploaded: ${docCount}\n`;
  if (twin) {
    const assets = JSON.parse(twin.assets);
    const totalValue = assets.filter((a) => a.value).reduce((sum, a) => sum + parseFloat(a.value?.replace(/[$,]/g, '') || 0), 0);
    contextStr += `Total assets found: ${assets.length}\nEstimated net worth from documents: $${totalValue.toLocaleString()}\n`;
  }
  const systemPrompt = 'You are GriefCart AI. Answer grounded, concise finance and continuity questions using the user context.';
  const prompt = `User Context:\n${contextStr}\n\nConversation history (last 5):\n${JSON.stringify((history || []).slice(-5))}\n\nUser: ${message}\n\nProvide a helpful response.`;
  const answer = await callGemini(prompt, systemPrompt, 900, 0.7);
  run('INSERT INTO chat_history (userId, role, content) VALUES (?, ?, ?)', [req.userId, 'user', message]);
  run('INSERT INTO chat_history (userId, role, content) VALUES (?, ?, ?)', [req.userId, 'assistant', answer]);
  res.json({ message: answer, timestamp: new Date().toISOString(), hasTwin: !!twin });
});

app.post('/api/ai/twin', auth, async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  const twin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  const context = twin ? JSON.stringify({ profile: JSON.parse(twin.profile), assets: JSON.parse(twin.assets), liabilities: JSON.parse(twin.liabilities), insurance: JSON.parse(twin.insurance), risks: JSON.parse(twin.risks) }, null, 2) : 'No financial twin data available yet.';
  const answer = await callGemini(`User Question: ${question}\n\nFinancial Twin Data:\n${context}\n\nAnswer using the data and be specific.`, 'You are a financial analysis assistant.', 800, 0.7);
  res.json({ answer, twinGeneratedAt: twin?.generatedAt || new Date().toISOString() });
});

app.post('/api/ai/plan', auth, async (req, res) => {
  const payload = req.body || {};
  const summary = await callGemini(`Create a concise continuity-plan summary for the user based on this payload:\n${JSON.stringify(payload, null, 2)}`, 'You are a continuity planning assistant.', 600, 0.7);
  res.json({ summary });
});

// ─── Documents Routes ──────────────────────────────────────
app.get('/api/documents', auth, (req, res) => {
  const docs = queryAll('SELECT documentId, userId, fileName, fileType, category, size, uploadedAt FROM documents WHERE userId = ? ORDER BY uploadedAt DESC', [req.userId]);
  res.json({ documents: docs, count: docs.length });
});

app.get('/api/documents/:id', auth, (req, res) => {
  const doc = queryOne('SELECT * FROM documents WHERE documentId = ? AND userId = ?', [req.params.id, req.userId]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ documentId: doc.documentId, fileName: doc.fileName, fileType: doc.fileType, category: doc.category, size: doc.size, uploadedAt: doc.uploadedAt });
});

app.post('/api/documents/upload/base64', auth, async (req, res) => {
  try {
    const { fileName, fileData, contentType, category } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'fileName and fileData required' });

    const docId = uuidv4();
    const buffer = Buffer.from(fileData, 'base64');
    const vault = await storeDocumentInVault({ fileName, contentType, buffer, userId: req.userId, category });

    run('INSERT INTO documents (documentId, userId, fileName, fileType, category, size, filePath, storageType, storageLocation, kmsKeyId, encrypted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      docId, req.userId, fileName, contentType || 'application/octet-stream', category || 'other', buffer.length, vault.storageLocation, vault.storageType, vault.storageLocation, vault.kmsKeyId, vault.encrypted ? 1 : 0
    ]);

    const analysis = await refreshUserAnalysis(req.userId, req.user?.email || '');

    res.json({ documentId: docId, fileName, size: buffer.length, category: category || 'other', uploadedAt: new Date().toISOString(), vault, analysis });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.delete('/api/documents/:id', auth, (req, res) => {
  const doc = queryOne('SELECT * FROM documents WHERE documentId = ? AND userId = ?', [req.params.id, req.userId]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  
  if (doc.filePath && fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
  run('DELETE FROM documents WHERE documentId = ?', [req.params.id]);
  res.json({ deleted: req.params.id });
});

// ─── Trusted Persons Routes ────────────────────────────────
app.get('/api/trusted-persons', auth, (req, res) => {
  const persons = queryAll('SELECT * FROM trusted_persons WHERE userId = ? ORDER BY priority', [req.userId]);
  res.json({ trustedPersons: persons });
});

app.post('/api/trusted-persons', auth, async (req, res) => {
  const { name, email, phone, relationship, priority, accessLevel, canViewDocuments, canContactInstitutions } = req.body;
  const personId = uuidv4();
  const verificationToken = uuidv4();

  run(`INSERT INTO trusted_persons (personId, userId, name, email, phone, relationship, priority, accessLevel, canViewDocuments, canContactInstitutions, verificationStatus, verificationToken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    personId, req.userId, name || '', email || '', phone || '', relationship || '',
    priority || 0, accessLevel || 'limited', canViewDocuments ? 1 : 0, canContactInstitutions ? 1 : 0, 'pending', verificationToken
  ]);

  const user = queryOne('SELECT name, email FROM users WHERE userId = ?', [req.userId]);
  const verificationLink = `${process.env.APP_URL || 'http://localhost:5173'}/verify-trusted-person/${verificationToken}`;
  const notification = await notifyTrustedPerson({ email, name }, user || { name: 'A GriefCart user', email: req.user?.email }, verificationLink);
  res.json({ personId, status: 'invited', notification, verificationLink });
});

app.get('/api/trusted-persons/verify/:token', async (req, res) => {
  const person = queryOne('SELECT * FROM trusted_persons WHERE verificationToken = ?', [req.params.token]);
  if (!person) return res.status(404).send('Invalid verification link.');

  run("UPDATE trusted_persons SET verificationStatus = 'verified' WHERE personId = ?", [person.personId]);
  res.send(`<!doctype html><html><body><h2>Trusted person verified</h2><p>The invitation for ${person.name} is now active.</p></body></html>`);
});

app.put('/api/trusted-persons/:id', auth, (req, res) => {
  const { name, email, phone, relationship, priority, accessLevel, canViewDocuments, canContactInstitutions } = req.body;
  
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (relationship !== undefined) { updates.push('relationship = ?'); params.push(relationship); }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
  if (accessLevel !== undefined) { updates.push('accessLevel = ?'); params.push(accessLevel); }
  if (canViewDocuments !== undefined) { updates.push('canViewDocuments = ?'); params.push(canViewDocuments ? 1 : 0); }
  if (canContactInstitutions !== undefined) { updates.push('canContactInstitutions = ?'); params.push(canContactInstitutions ? 1 : 0); }
  
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  
  params.push(req.params.id, req.userId);
  run(`UPDATE trusted_persons SET ${updates.join(', ')} WHERE personId = ? AND userId = ?`, params);
  res.json({ updated: req.params.id });
});

app.delete('/api/trusted-persons/:id', auth, (req, res) => {
  run('DELETE FROM trusted_persons WHERE personId = ? AND userId = ?', [req.params.id, req.userId]);
  res.json({ deleted: req.params.id });
});

// ─── Continuity Plan Routes ────────────────────────────────
app.get('/api/continuity-plan', auth, (req, res) => {
  const plan = queryOne('SELECT * FROM continuity_plans WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  if (!plan) return res.json({ plan: null });
  res.json({
    plan: {
      planId: plan.planId,
      generatedAt: plan.generatedAt,
      status: plan.status,
      phases: JSON.parse(plan.phases),
      criticalContacts: JSON.parse(plan.criticalContacts),
      documentChecklist: JSON.parse(plan.documentChecklist),
      institutionList: JSON.parse(plan.institutionList),
      legalSteps: JSON.parse(plan.legalSteps),
      recommendations: JSON.parse(plan.recommendations),
    }
  });
});

app.post('/api/continuity-plan/generate', auth, (req, res) => {
  const existingPlan = queryOne('SELECT * FROM continuity_plans WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  if (existingPlan) {
    return res.json({ planId: existingPlan.planId, generatedAt: existingPlan.generatedAt, status: existingPlan.status });
  }
  
  const planId = uuidv4();
  const phases = [
    { phase: 'alert', title: 'Immediate Alert (Days 1-3)', actions: [
      { action: 'Notify trusted persons', assignedTo: 'Primary Contact', priority: 'high', documentRefs: [], details: 'Contact your designated trusted persons immediately.' },
      { action: 'Secure critical documents', assignedTo: 'Self', priority: 'high', documentRefs: [], details: 'Locate and secure all critical documents (will, insurance, deeds).' },
    ]},
    { phase: 'intervention', title: 'Intervention (Days 4-14)', actions: [
      { action: 'Contact financial institutions', assignedTo: 'Trusted Person', priority: 'high', documentRefs: [], details: 'Notify banks, investment firms, and insurance companies.' },
      { action: 'Review and pay bills', assignedTo: 'Trusted Person', priority: 'high', documentRefs: [], details: 'Review all recurring payments and ensure bills are paid.' },
    ]},
    { phase: 'stewardship', title: 'Stewardship (Weeks 3-8)', actions: [
      { action: 'File insurance claims', assignedTo: 'Legal Counsel', priority: 'medium', documentRefs: [], details: 'Process all applicable insurance claims.' },
      { action: 'Manage assets and investments', assignedTo: 'Financial Advisor', priority: 'medium', documentRefs: [], details: 'Review and manage the investment portfolio.' },
    ]},
    { phase: 'legacy', title: 'Legacy (Months 2-6)', actions: [
      { action: 'Execute will and distribute assets', assignedTo: 'Executor', priority: 'medium', documentRefs: [], details: 'Process will through probate and distribute assets.' },
      { action: 'File final tax returns', assignedTo: 'Tax Professional', priority: 'medium', documentRefs: [], details: 'Prepare and file all required tax returns.' },
    ]},
  ];
  
  run('INSERT INTO continuity_plans (planId, userId, status, phases) VALUES (?, ?, ?, ?)', [
    planId, req.userId, 'active', JSON.stringify(phases)
  ]);
  
  res.json({ planId, generatedAt: new Date().toISOString(), status: 'active', phases });
});

// ─── Continuity Score ──────────────────────────────────────
app.get('/api/continuity-score', auth, (req, res) => {
  const docs = queryAll('SELECT COUNT(*) as count FROM documents WHERE userId = ?', [req.userId]);
  const trusted = queryAll('SELECT COUNT(*) as count FROM trusted_persons WHERE userId = ?', [req.userId]);
  const plan = queryAll('SELECT COUNT(*) as count FROM continuity_plans WHERE userId = ?', [req.userId]);
  const twin = queryAll('SELECT COUNT(*) as count FROM financial_twins WHERE userId = ?', [req.userId]);
  const legacy = queryAll('SELECT COUNT(*) as count FROM legacy_letters WHERE userId = ?', [req.userId]);

  const docScore = Math.min(100, Math.round((docs[0]?.count || 0) * 12));
  const trustedScore = Math.min(100, Math.round((trusted[0]?.count || 0) * 20));
  const planScore = Math.min(100, (plan[0]?.count || 0) > 0 ? 100 : 0);
  const twinScore = Math.min(100, (twin[0]?.count || 0) > 0 ? 90 : 0);
  const legacyScore = Math.min(100, (legacy[0]?.count || 0) > 0 ? 85 : 0);
  const scoreValue = Math.round((docScore * 0.3) + (trustedScore * 0.2) + (planScore * 0.2) + (twinScore * 0.15) + (legacyScore * 0.15));
  const color = scoreValue >= 75 ? 'emerald' : scoreValue >= 50 ? 'gold' : 'red';
  const assessment = scoreValue >= 75 ? 'Strong continuity foundation with clear backup plans.' : scoreValue >= 50 ? 'Solid baseline with a few important gaps to close.' : 'More documents and trusted contacts will materially improve your readiness.';
  const breakdown = { documents: docScore, trustedPersons: trustedScore, plan: planScore, twin: twinScore, legacy: legacyScore, hasPlan: (plan[0]?.count || 0) > 0 };

  run('INSERT INTO continuity_scores (userId, score, assessment, color, breakdown) VALUES (?, ?, ?, ?, ?)', [
    req.userId, scoreValue, assessment, color, JSON.stringify(breakdown)
  ]);

  res.json({ score: scoreValue, assessment, color, breakdown, generatedAt: new Date().toISOString() });
});

// ─── Financial Twin ────────────────────────────────────────
app.get('/api/twin', auth, (req, res) => {
  const twin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  if (!twin) return res.json({ twin: null, status: 'none' });
  res.json({
    twin: {
      twinId: twin.twinId,
      generatedAt: twin.generatedAt,
      profile: JSON.parse(twin.profile),
      assets: JSON.parse(twin.assets),
      liabilities: JSON.parse(twin.liabilities),
      insurance: JSON.parse(twin.insurance),
      recurringPayments: JSON.parse(twin.recurringPayments),
      relationships: JSON.parse(twin.relationships),
      risks: JSON.parse(twin.risks),
      missingAssets: JSON.parse(twin.missingAssets),
      continuityPlan: JSON.parse(twin.continuityPlan),
    },
    status: 'active'
  });
});

app.post('/api/twin/query', auth, async (req, res) => {
  const { question } = req.body;
  const twin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  
  const context = twin ? JSON.stringify({
    profile: JSON.parse(twin.profile),
    assets: JSON.parse(twin.assets),
    liabilities: JSON.parse(twin.liabilities),
    insurance: JSON.parse(twin.insurance),
    risks: JSON.parse(twin.risks),
  }, null, 2) : 'No financial twin data available yet.';
  
  const prompt = `User Question: ${question}\n\nFinancial Twin Data:\n${context}\n\nAnswer the question based on the financial twin data. Be specific and reference actual values when available.`;
  const answer = await callGemini(prompt, "You are a financial analysis AI assistant. Answer questions about the user's financial data.", 800, 0.7);
  
  res.json({ answer, twinGeneratedAt: twin?.generatedAt || new Date().toISOString() });
});

app.post('/api/twin/refresh', auth, async (req, res) => {
  const twinId = uuidv4();
  const docs = queryAll('SELECT * FROM documents WHERE userId = ? ORDER BY uploadedAt DESC LIMIT 6', [req.userId]);
  const count = docs.length;
  const docSummary = docs.map(d => `${d.category}: ${d.fileName}`).join(' | ');
  const aiSummary = await callGemini(`Create a short summary of the user's financial profile based on these documents: ${docSummary || 'No documents uploaded yet.'}`, 'You are a financial twin analyst.', 600, 0.4);

  const profile = {
    email: req.user.email || '',
    totalDocuments: count,
    estimatedNetWorth: count > 0 ? 'Estimated from uploaded documents' : null,
    summary: aiSummary || 'Add more documents to strengthen the digital twin.',
  };
  const assets = count > 0 ? [{ type: 'document', name: 'Uploaded records', value: `${count} files`, sourceDocument: docs[0]?.fileName || 'N/A', confidence: 80, continuityRisk: 'medium' }] : [];
  const liabilities = [];
  const insurance = [];
  const recurringPayments = [];
  const relationships = [];
  const risks = [];
  const missingAssets = count < 3 ? ['Insurance policies', 'Investment statements', 'Digital asset inventory'] : [];
  const continuityPlan = { criticalItems: count > 0 ? ['Primary documents', 'Beneficiary information', 'Trusted contacts'] : [], trustedAccess: 'limited', recommendations: ['Upload more documents', 'Confirm trusted contacts'] };

  run('INSERT INTO financial_twins (twinId, userId, profile, assets, liabilities, insurance, recurringPayments, relationships, risks, missingAssets, continuityPlan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    twinId, req.userId, JSON.stringify(profile), JSON.stringify(assets), JSON.stringify(liabilities), JSON.stringify(insurance), JSON.stringify(recurringPayments), JSON.stringify(relationships), JSON.stringify(risks), JSON.stringify(missingAssets), JSON.stringify(continuityPlan)
  ]);

  res.json({ status: 'refreshed', twinId, profile });
});

// ─── Detective ─────────────────────────────────────────────
app.post('/api/detective/scan', auth, (req, res) => {
  const docs = queryAll('SELECT category, COUNT(*) as count FROM documents WHERE userId = ? GROUP BY category', [req.userId]);
  const docCount = docs.reduce((sum, d) => sum + d.count, 0);
  
  const missingAssets = [];
  const hiddenSubscriptions = [];
  const documentGaps = [];
  const riskIndicators = [];
  
  const categories = docs.map(d => d.category);
  if (!categories.includes('banking')) {
    missingAssets.push({ type: 'bank_account', suggested: 'Add bank statements to detect accounts', reason: 'No banking documents found', confidence: 90 });
  }
  if (!categories.includes('insurance')) {
    missingAssets.push({ type: 'insurance', suggested: 'Upload insurance policies', reason: 'No insurance documents found', confidence: 85 });
  }
  if (!categories.includes('investment') || !categories.includes('property')) {
    missingAssets.push({ type: 'investment_or_property', suggested: 'Add investment statements and property deeds', reason: 'Investment or property documents missing', confidence: 75 });
  }
  
  if (!categories.includes('legal')) {
    documentGaps.push({ documentType: 'Will/Trust', importance: 'critical', reason: 'No legal documents found - essential for estate planning' });
  }
  if (!categories.includes('tax')) {
    documentGaps.push({ documentType: 'Tax Returns', importance: 'high', reason: 'Tax returns needed for financial completeness' });
  }
  
  if (docCount < 5) {
    riskIndicators.push({ type: 'low_documentation', description: 'Only ' + docCount + ' documents uploaded', severity: 'high' });
  }
  
  if (Math.random() > 0.5) {
    hiddenSubscriptions.push({ name: 'Old streaming service', estimatedAmount: '$14.99/mo', reason: 'Possible forgotten subscription', confidence: 65 });
  }
  
  const summary = docCount === 0 
    ? 'No documents uploaded yet. Upload bank statements, insurance policies, and investment documents to start the analysis.'
    : `Analysis complete based on ${docCount} documents. ${missingAssets.length} potential missing assets identified. ${riskIndicators.length} risk indicators found.`;
  
  res.json({ missingAssets, hiddenSubscriptions, documentGaps, riskIndicators, summary });
});

// ─── Chat ──────────────────────────────────────────────────
app.post('/api/chat', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  
  const user = queryOne('SELECT * FROM users WHERE userId = ?', [req.userId]);
  const docs = queryAll('SELECT COUNT(*) as count FROM documents WHERE userId = ?', [req.userId]);
  const docCount = docs[0]?.count || 0;
  const twin = queryOne('SELECT * FROM financial_twins WHERE userId = ? ORDER BY generatedAt DESC', [req.userId]);
  
  let contextStr = `User email: ${user?.email || 'unknown'}\nDocuments uploaded: ${docCount}\n`;
  if (twin) {
    const assets = JSON.parse(twin.assets);
    const totalValue = assets.filter(a => a.value).reduce((sum, a) => sum + parseFloat(a.value?.replace(/[$,]/g, '') || 0), 0);
    contextStr += `Total assets found: ${assets.length}\nEstimated net worth from documents: $${totalValue.toLocaleString()}\n`;
  }
  
  const systemPrompt = `You are GriefCart's AI Financial Continuity Assistant, a compassionate and knowledgeable financial planning AI. You help users manage their financial life, plan for incapacity, and ensure their loved ones are taken care of.

Key areas you assist with:
1. Financial Document Management
2. Financial Digital Twin analysis
3. Continuity Planning and Scoring
4. Trusted Person management
5. Legacy Letter creation
6. Emergency recovery procedures
7. AI Detective scans for missing assets

Be concise, specific, and compassionate. Use the user's actual data when available. If they ask about something beyond your scope, suggest relevant features of GriefCart.`;
  
  const chatPrompt = `User Context:\n${contextStr}\n\nConversation history (last 5):\n${JSON.stringify((history || []).slice(-5))}\n\nUser: ${message}\n\nProvide a helpful, specific response using the user's data context.`;
  
  const answer = await callGemini(chatPrompt, systemPrompt, 800, 0.7);
  
  run('INSERT INTO chat_history (userId, role, content) VALUES (?, ?, ?)', [req.userId, 'user', message]);
  run('INSERT INTO chat_history (userId, role, content) VALUES (?, ?, ?)', [req.userId, 'assistant', answer]);
  
  res.json({ message: answer, timestamp: new Date().toISOString(), hasTwin: !!twin });
});

// ─── Recovery ──────────────────────────────────────────────
app.get('/api/recovery/guide', auth, (req, res) => {
  const docCount = queryAll('SELECT COUNT(*) as count FROM documents WHERE userId = ?', [req.userId])[0]?.count || 0;
  const personCount = queryAll('SELECT COUNT(*) as count FROM trusted_persons WHERE userId = ?', [req.userId])[0]?.count || 0;
  const plan = queryOne('SELECT * FROM continuity_plans WHERE userId = ?', [req.userId]);
  
  res.json({
    guide: `# Financial Recovery Guide\n\n## Overview\nThis guide is designed to help your loved ones navigate your financial affairs during difficult times.\n\n## Immediate Steps\n1. Notify all trusted persons on your contact list\n2. Secure your financial documents and accounts\n3. Contact key financial institutions\n\n## Key Contacts\n- Primary Contact: Designated trusted person\n- Financial Advisor: If applicable\n- Legal Counsel: If applicable\n\n## Documents Needed\nReview the Document Vault for wills, trusts, insurance policies, and account statements.\n\n## Important Notes\n- Keep all correspondence and receipts\n- Notify government agencies as needed\n- Take your time with major decisions`,
    generatedAt: new Date().toISOString(),
    documentCount: docCount,
    trustedPersonCount: personCount,
    hasPlan: !!plan,
  });
});

// ─── Legacy ────────────────────────────────────────────────
app.get('/api/legacy', auth, (req, res) => {
  const legacy = queryOne('SELECT * FROM legacy_letters WHERE userId = ? ORDER BY updatedAt DESC', [req.userId]);
  if (!legacy) {
    return res.json({
      legacyId: null,
      status: 'draft',
      personalMessages: [],
      financialWishes: '',
      funeralPreferences: '',
      digitalLegacy: '',
      finalWords: '',
      updatedAt: null,
      completedAt: null,
    });
  }
  res.json({
    legacyId: legacy.legacyId,
    status: legacy.status,
    personalMessages: JSON.parse(legacy.personalMessages),
    financialWishes: legacy.financialWishes,
    funeralPreferences: legacy.funeralPreferences,
    digitalLegacy: legacy.digitalLegacy,
    finalWords: legacy.finalWords,
    updatedAt: legacy.updatedAt,
    completedAt: legacy.completedAt,
  });
});

app.post('/api/legacy', auth, (req, res) => {
  const { personalMessages, financialWishes, funeralPreferences, digitalLegacy, finalWords, status } = req.body;
  
  const existing = queryOne('SELECT * FROM legacy_letters WHERE userId = ? ORDER BY updatedAt DESC', [req.userId]);
  
  if (existing) {
    const updates = [];
    const params = [];
    if (personalMessages !== undefined) { updates.push('personalMessages = ?'); params.push(JSON.stringify(personalMessages)); }
    if (financialWishes !== undefined) { updates.push('financialWishes = ?'); params.push(financialWishes); }
    if (funeralPreferences !== undefined) { updates.push('funeralPreferences = ?'); params.push(funeralPreferences); }
    if (digitalLegacy !== undefined) { updates.push('digitalLegacy = ?'); params.push(digitalLegacy); }
    if (finalWords !== undefined) { updates.push('finalWords = ?'); params.push(finalWords); }
    updates.push("updatedAt = datetime('now','localtime')");
    
    if (status === 'complete') {
      updates.push('status = ?');
      params.push('complete');
      updates.push("completedAt = datetime('now','localtime')");
    }
    
    if (updates.length > 1) {
      params.push(existing.legacyId);
      run(`UPDATE legacy_letters SET ${updates.join(', ')} WHERE legacyId = ?`, params);
    }
    
    return res.json({ legacyId: existing.legacyId, status: status || existing.status, updatedAt: new Date().toISOString() });
  }
  
  const legacyId = uuidv4();
  run('INSERT INTO legacy_letters (legacyId, userId, personalMessages, financialWishes, funeralPreferences, digitalLegacy, finalWords, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    legacyId, req.userId,
    JSON.stringify(personalMessages || []),
    financialWishes || '',
    funeralPreferences || '',
    digitalLegacy || '',
    finalWords || '',
    status || 'draft'
  ]);
  
  res.json({ legacyId, status: status || 'draft', updatedAt: new Date().toISOString() });
});

app.post('/api/legacy/generate', auth, (req, res) => {
  const legacy = queryOne('SELECT * FROM legacy_letters WHERE userId = ? ORDER BY updatedAt DESC', [req.userId]);
  
  const content = `# Legacy Document\n\n## My Final Wishes\n\n### Financial Wishes\n${legacy?.financialWishes || 'Not specified'}\n\n### Funeral Preferences\n${legacy?.funeralPreferences || 'Not specified'}\n\n### Digital Legacy\n${legacy?.digitalLegacy || 'Nothing specified'}\n\n### Final Words\n${legacy?.finalWords || ''}\n\n### Personal Messages\n${legacy?.personalMessages ? JSON.parse(legacy.personalMessages).map(m => `\n**To ${m.personName}:**\n${m.message}`).join('\n') : 'None'}\n\n---\n*Generated by GriefCart Financial Continuity Platform*\n*Date: ${new Date().toLocaleDateString()}*`;
  
  res.json({
    documentId: uuidv4(),
    legacyId: legacy?.legacyId || '',
    content,
    generatedAt: new Date().toISOString(),
    version: 1,
  });
});

// ─── Emergency ─────────────────────────────────────────────
app.get('/api/emergency/status', auth, (req, res) => {
  const persons = queryAll('SELECT COUNT(*) as count FROM trusted_persons WHERE userId = ?', [req.userId]);
  const verified = queryAll("SELECT COUNT(*) as count FROM trusted_persons WHERE userId = ? AND verificationStatus = 'verified'", [req.userId]);
  const plan = queryAll('SELECT COUNT(*) as count FROM continuity_plans WHERE userId = ?', [req.userId]);
  
  res.json({
    verifiedTrustedPersons: verified[0]?.count || 0,
    totalTrustedPersons: persons[0]?.count || 0,
    hasContinuityPlan: (plan[0]?.count || 0) > 0,
    emergencyReady: (verified[0]?.count || 0) >= 1 && (plan[0]?.count || 0) > 0,
  });
});

app.post('/api/emergency/activate', auth, async (req, res) => {
  const persons = queryAll('SELECT name, email FROM trusted_persons WHERE userId = ? ORDER BY priority', [req.userId]);
  const activation = await activateStepFunction(req.userId, persons);

  res.json({
    status: 'activated',
    message: 'Emergency protocol has been activated. Trusted persons will be notified according to your plan.',
    notifiedPersons: persons.length,
    trustedPersons: persons,
    workflow: activation,
  });
});

// ─── Global Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── 404 catch-all for API routes ─────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ─── Serve static frontend in production ───────────────────
const frontendDist = join(__dirname, '..', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(frontendDist, 'index.html'));
    }
  });
} else {
  // Fallback: If no frontend is built, serve a simple message
  app.get('/', (req, res) => {
    res.json({ message: 'GriefCart API is running. Frontend not built yet.', status: 'ok', endpoints: ['/api/auth/register', '/api/auth/login', '/api/auth/demo', '/api/documents', '/api/twin', '/api/chat', '/api/trusted-persons', '/api/continuity-plan', '/api/continuity-score', '/api/detective/scan', '/api/recovery/guide', '/api/legacy', '/api/emergency/status'] });
  });
}

// ─── Start ─────────────────────────────────────────────────
init().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 GriefCart Server running on http://localhost:${PORT}`);
    console.log(`📦 Database: SQLite (griefcart.db)`);
    console.log(`🔐 Auth: JWT-based`);
    console.log(`🤖 AI: ${GEMINI_API_KEY ? 'Gemini 2.0 Flash' : 'Fallback mode (set GEMINI_API_KEY env var for AI)'}`);
    console.log(`📁 Uploads: ${uploadsDir}`);
    console.log(`\n✨ Quick start:`);
    console.log(`   Register: POST /api/auth/register`);
    console.log(`   Demo login: POST /api/auth/demo`);
    console.log(`   Frontend: http://localhost:${PORT}`);
  });
});