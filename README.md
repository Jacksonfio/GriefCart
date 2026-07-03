# 🚀 GriefCart – AI-Powered Financial Continuity Platform

> **Your AI-powered financial administrator that protects your loved ones when you're unable to manage your finances.**

GriefCart is a cloud-native financial continuity platform built using **AWS** and **Artificial Intelligence**. It securely stores financial documents, analyzes them using AI, creates a Financial Twin, and prepares trusted family members with recovery plans during emergencies such as hospitalization, dementia, disability, or death.

---

# ✨ Features

## 🔐 Secure Authentication

* Amazon Cognito Authentication
* User Registration & Login
* Email Verification
* Forgot Password
* Secure JWT Sessions
* Protected Routes

---

## 📂 Secure Document Vault

* Upload financial documents
* Multiple file upload
* Secure AWS S3 Storage
* Encrypted document storage
* Download & Preview files
* Persistent cloud storage

Supported files:

* PDF
* DOCX
* Images
* ZIP
* Financial Statements
* Insurance Policies

---

## 🤖 AI Financial Twin

Upload your financial documents and let AI automatically build your financial profile.

The AI identifies:

* Assets
* Liabilities
* Investments
* Insurance
* Loans
* Recurring Bills
* Financial Risks

Users can ask natural language questions like:

* What assets do I own?
* What is my biggest financial risk?
* Which documents are missing?
* What subscriptions am I paying for?

---

## 🕵️ AI Detective

Automatically scans uploaded documents and identifies:

* Missing Assets
* Hidden Subscriptions
* Missing Legal Documents
* Financial Risks
* Insurance Gaps
* Estate Planning Issues

---

## 👨‍👩‍👧 Trusted Person Management

Users can securely add trusted family members.

Features include:

* Email Invitations
* Verification
* Permission Management
* Emergency Access
* Remove Trusted Person

---

## 📋 Financial Continuity Plan

AI automatically generates a recovery roadmap including:

* First 24 Hours
* Week 1
* Month 1
* Long-Term Recovery

Each task contains:

* Priority
* Responsible Person
* Required Documents
* Action Checklist

---

## 💌 Legacy Letters

Securely create:

* Personal Letters
* Asset Instructions
* Funeral Wishes
* Digital Asset Instructions
* Final Messages

Letters remain encrypted until emergency release conditions are met.

---

## 🚨 Emergency Workflow

When activated, GriefCart automatically:

* Verifies emergency status
* Validates trusted person access
* Releases approved documents
* Shares recovery guides
* Notifies trusted contacts

---

## 📈 Continuity Score

The platform evaluates financial readiness based on:

* Uploaded Documents
* Insurance Coverage
* Legal Documents
* Trusted Persons
* AI Financial Twin
* Recovery Plan Completion

---

# ☁ AWS Cloud Architecture

GriefCart is powered by AWS cloud services.

| Service            | Purpose                            |
| ------------------ | ---------------------------------- |
| Amazon Cognito     | Authentication & User Management   |
| Amazon S3          | Secure Document Storage            |
| Amazon DynamoDB    | User & Metadata Storage            |
| AWS Lambda         | Serverless Backend                 |
| Amazon API Gateway | REST APIs                          |
| Amazon SES         | Email Verification & Notifications |
| Amazon EventBridge | Workflow Automation                |
| AWS Step Functions | Emergency Workflow                 |
| AWS IAM            | Access Control                     |
| AWS KMS            | Encryption                         |
| Amazon CloudWatch  | Monitoring & Logs                  |

---

# 🧠 AI Features

* AI Financial Twin
* AI Chat Assistant
* Financial Risk Analysis
* Smart Recommendations
* Document Summarization
* Intelligent Search
* Emergency Planning
* Recovery Guide Generation

---

# 🛠 Tech Stack

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Framer Motion

### Backend

* Python
* AWS Lambda
* REST API

### Database

* Amazon DynamoDB

### Cloud

* AWS

### AI

* Amazon Bedrock (Meta Llama 3 70B & Mistral)
* HuggingFace Inference API (Llama 3 8B fallback)
* Google Gemini (Legacy fallback)

---

# 🤖 AI Provider Setup

GriefCart uses a **multi-provider AI architecture** with automatic fallback:

`Bedrock (Llama 3 / Mistral) → HuggingFace Inference API → Gemini (legacy)`

### Option 1: AWS Bedrock — Open-Source Models (Recommended)
Uses Meta Llama 3 and Mistral models hosted natively on AWS — no external API keys needed.

1. Enable models in the [AWS Bedrock console](https://console.aws.amazon.com/bedrock/home#/modelaccess):
   - ✅ `meta.llama3-70b-instruct-v1:0` (recommended)
   - ✅ `meta.llama3-8b-instruct-v1:0` (faster)
   - ✅ `mistral.mistral-7b-instruct-v0:2`
2. Deploy with: `sam deploy` (Bedrock is the default)

See instructions: `python setup_hf_secret.py --bedrock-info`

### Option 2: HuggingFace Inference API
Direct calls to HuggingFace's hosted open-source models for use in deployment environments without AWS Bedrock access (like HuggingFace Spaces).

```bash
python setup_hf_secret.py --token hf_yourTokenHere
sam deploy --parameter-overrides LLMProvider=huggingface HuggingFaceApiKeySecretArn=arn:aws:...
```

### Option 3: Gemini (Legacy)
The original Gemini integration — still works as a final fallback.

```bash
sam deploy --parameter-overrides LLMProvider=gemini
```

---

# 📂 Project Structure

```text
frontend/
backend/
lambda/
components/
pages/
services/
api/
hooks/
utils/
aws/
public/
```

---

# 🚀 Getting Started

## Clone Repository

```bash
git clone <repository-url>
```

## Install Dependencies

```bash
npm install
```

## Configure Environment Variables

Create a `.env` file and configure:

```env
AWS_REGION=
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
S3_BUCKET_NAME=
DYNAMODB_TABLE_NAME=
SES_FROM_EMAIL=
BEDROCK_MODEL_ID=
GEMINI_API_KEY=
```

## Start Development Server

```bash
npm run dev
```

---

# 📦 Production Deployment

The application can be deployed using:

* AWS Amplify
* AWS App Runner
* AWS Lambda
* Amazon S3
* Amazon CloudFront
* Vercel (Frontend)
* Render (Backend)

---

# 🔒 Security

* JWT Authentication
* IAM Roles
* Secure S3 Buckets
* Server-Side Encryption (KMS)
* Input Validation
* Secure APIs
* Rate Limiting
* Environment Variable Protection

---

# 🎯 Project Highlights

* Production-ready architecture
* Real AWS cloud integration
* AI-powered financial intelligence
* Secure document management
* Emergency continuity planning
* Trusted person verification
* Serverless backend
* Cloud-native deployment
* Responsive modern UI
* Real-time workflows

---

# 📜 License

This project is intended for educational purposes, hackathons, and innovation challenges.

---

## ❤️ Built with AWS + AI

GriefCart empowers families by ensuring financial continuity when life takes an unexpected turn. By combining secure AWS cloud services with AI-driven insights, it transforms complex financial preparedness into an accessible, reliable, and compassionate experience.
