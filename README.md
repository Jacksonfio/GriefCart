# GriefCart — Financial Continuity Platform

Your AI-powered financial administrator. GriefCart automatically manages your finances when you can't — whether due to death, hospitalization, dementia, or any incapacity.

## Features

### Auth
Sign in with email/password or click "Try Demo" to jump right in. Uses Amazon Cognito for secure login.

### Dashboard
Your main hub showing:
- **Readiness Score** — How prepared you are (0-100)
- **Assets Tracked** — What the AI has found in your documents
- **Open Risks** — Things that need attention
- **Recent Documents** — Your latest uploads
- **Trusted Persons** — Who's verified and ready
- **Plan Status** — What parts of your plan are complete

### Document Vault
Upload financial documents (bank statements, insurance policies, investment accounts, etc.). Files are encrypted and stored securely in AWS S3. Click the arrow button on any document to view it in your browser.

### Financial Twin
Click "Rebuild" and the AI reads all your uploaded documents, then creates a complete snapshot of your finances:
- What you own (assets)
- What you owe (liabilities)
- Insurance policies
- Recurring bills and subscriptions

Then ask it questions like "What's my biggest risk?" or "Am I missing anything?"

### AI Detective
Click "Run Scan" and the AI checks for:
- **Missing Assets** — Things you might have forgotten (old 401k, life insurance, crypto)
- **Hidden Subscriptions** — Forgotten payments still going out
- **Document Gaps** — Important documents you haven't uploaded (will, power of attorney)
- **Risk Indicators** — Patterns suggesting financial vulnerability

### Trusted Persons
Add people you trust (spouse, child, lawyer, executor). They get an email invitation. You can delete them anytime. Their phone numbers are masked for privacy.

### Continuity Plan
Click "Generate Plan" and the AI creates a step-by-step timeline:
- **Immediate** (first 24-72 hours)
- **Week 1**
- **Month 1**
- **Month 3**
- **Ongoing**

Each step has an action, who should do it, priority level, and document references.

### Recovery Guide
An AI-written guide for your trusted person explaining exactly what to do when something happens — who to call, where to find documents, which institutions to notify.

### Legacy Letters
A 6-step wizard to write letters for your loved ones:
1. Personal messages to each trusted person
2. How you want assets handled
3. Funeral and memorial wishes
4. Digital accounts (social media, crypto)
5. Final words
6. AI composes everything into a warm letter

Letters are stored encrypted and only released when the emergency workflow activates.

### Incapacity Timeline
A 4-stage timeline showing what happens at each stage:
- **Alert** — Early signs (forgetfulness, missed patterns)
- **Intervention** — Hospitalized, short-term
- **Stewardship** — Long-term care (dementia, coma)
- **Legacy** — End of life

Toggle on/off what should automatically happen at each stage.

### AI Chat
The chat bubble in the bottom-right corner. Ask anything about your finances and the AI answers using your actual data.

### Emergency Workflow
When activated, it verifies identity, checks your continuity plan, determines access level, releases documents and recovery guide to your trusted persons.

### Continuity Score
Your readiness score (0-100) is calculated from:
- Documents uploaded (25 points)
- How many document categories you've filled (20 points)
- Verified trusted persons (25 points)
- Legal documents present (10 points)
- Insurance documents present (5 points)
- Financial documents present (5 points)
- Plan exists (5 points)
- Plan is complete (5 points)

## How to Use

1. **Sign in** — Use the demo account or create your own
2. **Upload documents** — Go to Document Vault and upload bank statements, insurance policies, etc.
3. **Click Rebuild** — On the Financial Twin page to let AI analyze your documents
4. **Run a scan** — On the AI Detective page to find what's missing
5. **Add trusted persons** — People who should have access in an emergency
6. **Generate your plan** — On the Administration Plan page
7. **Ask questions** — Use the AI Chat or Ask Your Twin

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, Vite 8
- **Backend**: Python 3.12 AWS Lambda functions
- **AI**: Google Gemini 2.5 Flash
- **Auth**: Amazon Cognito
- **Database**: Amazon DynamoDB (6 tables)
- **Storage**: Amazon S3 (KMS-encrypted)
- **API**: Amazon API Gateway (REST)
- **Other**: SQS, SNS, SES, Step Functions, CloudTrail, EventBridge, KMS

## Running Locally

```bash
npm install
npm run dev
```

## Environment Variables

See `.env.example` for the required environment variables.
