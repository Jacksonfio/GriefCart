import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'griefcart.db');

let db = null;
let SQL = null;

async function getSQL() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export async function getDb() {
  if (!db) {
    const sql = await getSQL();
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new sql.Database(buffer);
    } else {
      db = new sql.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    initSchema();
    saveDb();
  }
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function ensureColumn(tableName, columnName, definition) {
  try {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  } catch {
    // Ignore existing column errors.
  }
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      lastLoginAt TEXT,
      loginCount INTEGER DEFAULT 0,
      continuityScore REAL,
      twinStatus TEXT DEFAULT 'none',
      mfaEnabled INTEGER DEFAULT 0,
      verificationCode TEXT,
      verified INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      documentId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileType TEXT,
      category TEXT DEFAULT 'other',
      size INTEGER DEFAULT 0,
      filePath TEXT,
      storageType TEXT DEFAULT 'local',
      storageLocation TEXT,
      kmsKeyId TEXT,
      encrypted INTEGER DEFAULT 0,
      uploadedAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS trusted_persons (
      personId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      relationship TEXT,
      priority INTEGER DEFAULT 0,
      accessLevel TEXT DEFAULT 'limited',
      verificationStatus TEXT DEFAULT 'pending',
      invitedAt TEXT DEFAULT (datetime('now','localtime')),
      canViewDocuments INTEGER DEFAULT 0,
      canContactInstitutions INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS continuity_plans (
      planId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      generatedAt TEXT DEFAULT (datetime('now','localtime')),
      status TEXT DEFAULT 'draft',
      phases TEXT DEFAULT '[]',
      criticalContacts TEXT DEFAULT '[]',
      documentChecklist TEXT DEFAULT '[]',
      institutionList TEXT DEFAULT '[]',
      legalSteps TEXT DEFAULT '[]',
      recommendations TEXT DEFAULT '[]'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS financial_twins (
      twinId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      generatedAt TEXT DEFAULT (datetime('now','localtime')),
      profile TEXT DEFAULT '{}',
      assets TEXT DEFAULT '[]',
      liabilities TEXT DEFAULT '[]',
      insurance TEXT DEFAULT '[]',
      recurringPayments TEXT DEFAULT '[]',
      relationships TEXT DEFAULT '[]',
      risks TEXT DEFAULT '[]',
      missingAssets TEXT DEFAULT '[]',
      continuityPlan TEXT DEFAULT '{}'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS legacy_letters (
      legacyId TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      personalMessages TEXT DEFAULT '[]',
      financialWishes TEXT DEFAULT '',
      funeralPreferences TEXT DEFAULT '',
      digitalLegacy TEXT DEFAULT '',
      finalWords TEXT DEFAULT '',
      updatedAt TEXT DEFAULT (datetime('now','localtime')),
      completedAt TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now','localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS continuity_scores (
      scoreId INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      score REAL NOT NULL,
      assessment TEXT,
      color TEXT DEFAULT 'red',
      breakdown TEXT DEFAULT '{}',
      generatedAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  ensureColumn('documents', 'storageType', 'TEXT DEFAULT "local"');
  ensureColumn('documents', 'storageLocation', 'TEXT');
  ensureColumn('documents', 'kmsKeyId', 'TEXT');
  ensureColumn('documents', 'encrypted', 'INTEGER DEFAULT 0');

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(userId)',
    'CREATE INDEX IF NOT EXISTS idx_trusted_user ON trusted_persons(userId)',
    'CREATE INDEX IF NOT EXISTS idx_plans_user ON continuity_plans(userId)',
    'CREATE INDEX IF NOT EXISTS idx_twins_user ON financial_twins(userId)',
    'CREATE INDEX IF NOT EXISTS idx_legacy_user ON legacy_letters(userId)',
    'CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(userId)',
    'CREATE INDEX IF NOT EXISTS idx_scores_user ON continuity_scores(userId)',
  ];
  for (const idx of indexes) {
    db.run(idx);
  }
}

export function saveAndClose() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}

// Helper to run a query and return all rows as objects
export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper to run a query and return first row as object
export function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

// Helper to run a statement
export function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

export async function seedDemoData(userId) {
  await getDb();
  
  // Check if demo data already exists
  const existing = queryAll('SELECT COUNT(*) as count FROM documents WHERE userId = ?', [userId]);
  if (existing[0]?.count > 0) return;

  // Sample documents
  const docs = [
    { name: 'Bank Statement.pdf', type: 'application/pdf', cat: 'banking', size: 245000 },
    { name: 'Life Insurance Policy.pdf', type: 'application/pdf', cat: 'insurance', size: 180000 },
    { name: 'Property Deed.pdf', type: 'application/pdf', cat: 'property', size: 320000 },
    { name: 'Investment Portfolio.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cat: 'investments', size: 95000 },
    { name: 'Will and Testament.pdf', type: 'application/pdf', cat: 'legal', size: 156000 },
    { name: 'Tax Returns 2024.pdf', type: 'application/pdf', cat: 'tax', size: 412000 },
  ];
  
  for (const d of docs) {
    run('INSERT INTO documents (documentId, userId, fileName, fileType, category, size) VALUES (?, ?, ?, ?, ?, ?)', [
      uuidv4(), userId, d.name, d.type, d.cat, d.size
    ]);
  }

  // Sample trusted persons
  const persons = [
    { name: 'Sarah Johnson', email: 'sarah@example.com', rel: 'spouse', priority: 1, access: 'full', docs: 1, inst: 1 },
    { name: 'Michael Chen', email: 'michael@example.com', rel: 'brother', priority: 2, access: 'limited', docs: 0, inst: 1 },
    { name: 'Emily Williams', email: 'emily@example.com', rel: 'attorney', priority: 3, access: 'full', docs: 1, inst: 1 },
  ];
  
  for (const p of persons) {
    run('INSERT INTO trusted_persons (personId, userId, name, email, relationship, priority, accessLevel, canViewDocuments, canContactInstitutions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      uuidv4(), userId, p.name, p.email, p.rel, p.priority, p.access, p.docs, p.inst
    ]);
  }

  // Sample continuity plan
  const plan = {
    phases: [
      { phase: 'alert', title: 'Immediate Alert (Days 1-3)', actions: [
        { action: 'Notify trusted persons', assignedTo: 'Sarah Johnson', priority: 'high', documentRefs: ['trusted-contacts'], details: 'Call Sarah and Michael to inform them of the situation.' },
        { action: 'Secure critical documents', assignedTo: 'Self', priority: 'high', documentRefs: ['will', 'insurance'], details: 'Ensure all critical documents are accessible.' },
        { action: 'Activate emergency protocols', assignedTo: 'Sarah Johnson', priority: 'high', documentRefs: ['emergency-plan'], details: 'Follow the emergency activation procedure.' },
      ]},
      { phase: 'intervention', title: 'Intervention (Days 4-14)', actions: [
        { action: 'Contact financial institutions', assignedTo: 'Michael Chen', priority: 'medium', documentRefs: ['bank-accounts'], details: 'Notify banks about the situation and freeze accounts if needed.' },
        { action: 'Review insurance policies', assignedTo: 'Emily Williams', priority: 'medium', documentRefs: ['insurance'], details: 'Review all insurance policies for coverage.' },
        { action: 'Set up bill payments', assignedTo: 'Sarah Johnson', priority: 'high', documentRefs: ['recurring-bills'], details: 'Ensure all recurring bills are being paid.' },
      ]},
      { phase: 'stewardship', title: 'Stewardship (Weeks 3-8)', actions: [
        { action: 'File necessary claims', assignedTo: 'Emily Williams', priority: 'medium', documentRefs: ['insurance-claims'], details: 'File insurance claims and other benefit claims.' },
        { action: 'Manage investment portfolio', assignedTo: 'Michael Chen', priority: 'low', documentRefs: ['portfolio'], details: 'Review and manage investment portfolio.' },
        { action: 'Handle legal matters', assignedTo: 'Emily Williams', priority: 'medium', documentRefs: ['legal-docs'], details: 'Process legal documents and court filings.' },
      ]},
      { phase: 'legacy', title: 'Legacy (Months 2-6)', actions: [
        { action: 'Distribute assets', assignedTo: 'Sarah Johnson', priority: 'medium', documentRefs: ['will'], details: 'Execute the will and distribute assets.' },
        { action: 'Close accounts', assignedTo: 'Michael Chen', priority: 'low', documentRefs: ['account-list'], details: 'Close unnecessary accounts.' },
        { action: 'File final tax returns', assignedTo: 'Emily Williams', priority: 'medium', documentRefs: ['tax-returns'], details: 'Prepare and file final tax returns.' },
      ]},
    ],
    criticalContacts: [
      { name: 'Sarah Johnson', role: 'Primary Contact', phone: '+1-555-0101', email: 'sarah@example.com' },
      { name: 'Michael Chen', role: 'Financial Advisor', phone: '+1-555-0102', email: 'michael@example.com' },
      { name: 'Emily Williams', role: 'Legal Counsel', phone: '+1-555-0103', email: 'emily@example.com' },
    ],
    documentChecklist: [
      'Last Will and Testament', 'Living Trust', 'Insurance Policies',
      'Bank Account Statements', 'Investment Account Statements', 'Property Deeds',
      'Vehicle Titles', 'Tax Returns (Last 3 Years)', 'Marriage Certificate',
      'Birth Certificates', 'Social Security Cards', 'Passports',
    ],
    institutionList: [
      { name: 'Chase Bank', type: 'banking', contactInfo: '1-800-935-9935' },
      { name: 'Fidelity Investments', type: 'investment', contactInfo: '1-800-343-3548' },
      { name: 'MetLife Insurance', type: 'insurance', contactInfo: '1-800-638-5433' },
      { name: 'Wells Fargo', type: 'banking', contactInfo: '1-800-869-3557' },
    ],
    legalSteps: [
      'Obtain certified copies of death certificate (10+ copies)',
      'File will with probate court within 30 days',
      'Notify Social Security Administration',
      'Notify all financial institutions',
      "Cancel passports and driver's license",
      'File final income tax returns',
      'Transfer property titles',
    ],
    recommendations: [
      'Create a detailed inventory of all digital assets and passwords',
      'Store important documents in a fireproof safe',
      'Review and update beneficiaries annually',
      'Consider setting up a living trust',
      'Keep a list of all recurring subscriptions and automatic payments',
    ],
  };

  run(`INSERT INTO continuity_plans (planId, userId, status, phases, criticalContacts, documentChecklist, institutionList, legalSteps, recommendations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    uuidv4(), userId, 'active',
    JSON.stringify(plan.phases), JSON.stringify(plan.criticalContacts),
    JSON.stringify(plan.documentChecklist), JSON.stringify(plan.institutionList),
    JSON.stringify(plan.legalSteps), JSON.stringify(plan.recommendations)
  ]);

  // Sample financial twin
  const twin = {
    profile: { email: 'john@example.com', totalDocuments: 6, estimatedNetWorth: '$1,250,000' },
    assets: [
      { type: 'cash', name: 'Checking Account - Chase', value: '$45,000', sourceDocument: 'Bank Statement.pdf', confidence: 95, continuityRisk: 'low' },
      { type: 'cash', name: 'Savings Account - Chase', value: '$120,000', sourceDocument: 'Bank Statement.pdf', confidence: 95, continuityRisk: 'low' },
      { type: 'investment', name: '401(k) - Fidelity', value: '$520,000', sourceDocument: 'Investment Portfolio.xlsx', confidence: 90, continuityRisk: 'medium' },
      { type: 'investment', name: 'Roth IRA - Fidelity', value: '$180,000', sourceDocument: 'Investment Portfolio.xlsx', confidence: 90, continuityRisk: 'medium' },
      { type: 'property', name: 'Primary Residence', value: '$650,000', sourceDocument: 'Property Deed.pdf', confidence: 98, continuityRisk: 'low' },
      { type: 'insurance', name: 'Term Life Insurance', value: '$1,000,000', sourceDocument: 'Life Insurance Policy.pdf', confidence: 95, continuityRisk: 'medium' },
    ],
    liabilities: [
      { type: 'mortgage', name: 'Home Mortgage - Wells Fargo', amount: '$380,000', sourceDocument: 'Bank Statement.pdf', confidence: 95 },
      { type: 'credit', name: 'Credit Card - Chase', amount: '$4,200', sourceDocument: 'Bank Statement.pdf', confidence: 90 },
    ],
    insurance: [
      { type: 'life', provider: 'MetLife', coverage: '$1,000,000', expiry: '2045-06-15', sourceDocument: 'Life Insurance Policy.pdf' },
      { type: 'health', provider: 'Blue Cross', coverage: 'Family Plan', expiry: '2025-12-31', sourceDocument: '' },
      { type: 'auto', provider: 'GEICO', coverage: 'Full Coverage', expiry: '2025-08-20', sourceDocument: '' },
      { type: 'home', provider: 'State Farm', coverage: '$650,000', expiry: '2025-10-01', sourceDocument: '' },
    ],
    recurringPayments: [
      { name: 'Mortgage Payment', amount: '$2,850', frequency: 'monthly', category: 'housing' },
      { name: 'Netflix Subscription', amount: '$15.99', frequency: 'monthly', category: 'entertainment' },
      { name: 'Gym Membership', amount: '$49', frequency: 'monthly', category: 'health' },
      { name: 'Life Insurance Premium', amount: '$120', frequency: 'monthly', category: 'insurance' },
      { name: 'Property Insurance', amount: '$175', frequency: 'monthly', category: 'insurance' },
      { name: 'Car Payment', amount: '$450', frequency: 'monthly', category: 'transportation' },
    ],
    relationships: [
      { from: 'user', to: 'Sarah Johnson', type: 'spouse' },
      { from: 'user', to: 'Michael Chen', type: 'sibling' },
      { from: 'user', to: 'Emily Williams', type: 'attorney' },
    ],
    risks: [
      { type: 'coverage_gap', description: 'Health insurance has high deductible ($7,000)', severity: 'medium' },
      { type: 'concentration', description: 'High concentration in 401(k) company stock', severity: 'medium' },
      { type: 'missing_beneficiary', description: 'Roth IRA missing designated beneficiary', severity: 'high' },
    ],
    missingAssets: ['Crypto wallet credentials', 'Digital asset inventory', 'Safe deposit box location'],
    continuityPlan: { criticalItems: ['Will', 'Insurance policies', 'Bank account details'], trustedAccess: 'full', recommendations: ['Update beneficiary designations', 'Create digital asset inventory'] },
  };

  run('INSERT INTO financial_twins (twinId, userId, profile, assets, liabilities, insurance, recurringPayments, relationships, risks, missingAssets, continuityPlan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    uuidv4(), userId,
    JSON.stringify(twin.profile), JSON.stringify(twin.assets), JSON.stringify(twin.liabilities),
    JSON.stringify(twin.insurance), JSON.stringify(twin.recurringPayments), JSON.stringify(twin.relationships),
    JSON.stringify(twin.risks), JSON.stringify(twin.missingAssets), JSON.stringify(twin.continuityPlan)
  ]);

  // Legacy letter template
  run('INSERT INTO legacy_letters (legacyId, userId, status, personalMessages, financialWishes, funeralPreferences, digitalLegacy, finalWords) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    uuidv4(), userId, 'draft',
    JSON.stringify([]),
    'I want my assets to be distributed equally among my children.',
    'I prefer a simple cremation with a small memorial service.',
    'My social media accounts should be memorialized or deleted.',
    'I love you all. Thank you for everything.'
  ]);

  // Continuity score
  run('INSERT INTO continuity_scores (userId, score, assessment, color, breakdown) VALUES (?, ?, ?, ?, ?)', [
    userId, 72, 'Good foundation &mdash; a few gaps to close.', 'gold',
    JSON.stringify({ documents: 85, trustedPersons: 90, plan: 70, legacies: 50, twin: 65 })
  ]);
}