export interface User {
  userId: string; email: string; createdAt: string; lastLoginAt: string;
  loginCount: number; continuityScore: number | null; twinStatus: string;
  mfaEnabled: boolean;
}

export interface Document {
  documentId: string; fileName: string; fileType: string; category: string;
  size: number; uploadedAt: string; presignedUrl?: string;
}

export interface FinancialTwin {
  twinId: string; generatedAt: string;
  profile: { email: string; totalDocuments: number; estimatedNetWorth: string | null };
  assets: TwinAsset[]; liabilities: TwinLiability[]; insurance: TwinInsurance[];
  recurringPayments: TwinRecurring[]; relationships: TwinRelationship[];
  risks: TwinRisk[]; missingAssets: string[];
  continuityPlan: { criticalItems: string[]; trustedAccess: string; recommendations: string[] };
}

export interface TwinAsset {
  type: string; name: string; value: string | null; sourceDocument: string;
  confidence: number; continuityRisk: string;
}

export interface TwinLiability {
  type: string; name: string; amount: string | null; sourceDocument: string; confidence: number;
}

export interface TwinInsurance {
  type: string; provider: string; coverage: string; expiry: string | null; sourceDocument: string;
}

export interface TwinRecurring {
  name: string; amount: string; frequency: string; category: string;
}

export interface TwinRelationship {
  from: string; to: string; type: string;
}

export interface TwinRisk {
  type: string; description: string; severity: string;
}

export interface ContinuityScore {
  score: number; assessment: string; color: string;
  breakdown: Record<string, number>; generatedAt: string;
}

export interface TrustedPerson {
  personId: string; name: string; email: string; phone: string;
  relationship: string; priority: number; accessLevel: string;
  verificationStatus: string; invitedAt: string; canViewDocuments: boolean;
  canContactInstitutions: boolean;
}

export interface ContinuityPlan {
  planId: string; generatedAt: string; status: string;
  phases: PlanPhase[]; criticalContacts: PlanContact[];
  documentChecklist: string[]; institutionList: Institution[];
  legalSteps: string[]; recommendations: string[];
}

export interface PlanPhase {
  phase: string; title: string; actions: PlanAction[];
}

export interface PlanAction {
  action: string; assignedTo: string; priority: string; documentRefs: string[]; details: string;
}

export interface PlanContact {
  name: string; role: string; phone: string; email: string;
}

export interface Institution {
  name: string; type: string; contactInfo: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant'; content: string; timestamp: string;
}

export interface DetectiveResult {
  missingAssets: Array<{ type: string; suggested: string; reason: string; confidence: number }>;
  hiddenSubscriptions: Array<{ name: string; estimatedAmount: string; reason: string; confidence: number }>;
  documentGaps: Array<{ documentType: string; importance: string; reason: string }>;
  riskIndicators: Array<{ type: string; description: string; severity: string }>;
  summary: string;
}

export interface RecoveryGuide {
  guide: string; generatedAt: string; documentCount: number;
  trustedPersonCount: number; hasPlan: boolean;
}

export interface StressTestResult {
  survivalMonths: number;
  criticalGaps: string[];
  report: string;
  actionableSteps: string[];
}

export interface LegacyAnswers {
  legacyId: string;
  userId: string;
  status: 'draft' | 'complete';
  personalMessages: LegacyPersonalMessage[];
  financialWishes: string;
  funeralPreferences: string;
  digitalLegacy: string;
  finalWords: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface LegacyPersonalMessage {
  personId: string;
  personName: string;
  message: string;
}

export interface LegacyDocument {
  documentId: string;
  legacyId: string;
  content: string;
  generatedAt: string;
  version: number;
}
