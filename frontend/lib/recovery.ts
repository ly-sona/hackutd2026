export interface Warning {
  id: string;
  entityId: string;
  name: string;
  kind: string;
  category: string;
  explanation: string;
  evidenceIds: string[];
  findingIds: string[];
  assessmentIds: string[];
  sourceEntityIds: string[];
  relationshipIds: string[];
  updatedAt: string;
  updatedBy: string;
  explicit: boolean;
}
export interface BusinessOperation {
  id: string;
  entityId: string;
  name: string;
  importance: string;
  status: string;
  explanation: string;
  operatingMode: string;
  activeExecutionId: string;
  readiness: string;
}
export interface RecoveryTemplate {
  id: string;
  templateId: string;
  version: number;
  kind: string;
  name: string;
  description: string;
  policy: string;
  steps: string;
  verificationConditions: string;
  expectedResult: string;
}
export interface RecoveryExecution {
  id: string;
  templateId: string;
  templateVersion: number;
  kind: string;
  operationId: string;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  state: string;
  failureReason: string;
  approvalId: string;
  taskId: string;
  parentExecutionId: string;
  parameters: string;
  triggerEvidenceIds: string;
  triggerAssessmentIds: string;
  result: string;
  step: number;
  attempt: number;
  retryOfExecutionId: string;
}
export interface RecoveryStep {
  id: string;
  executionId: string;
  order: number;
  type: string;
  state: string;
  startedAt: string;
  completedAt: string;
  result: string;
  evidenceId: string;
}
export interface ApprovalRequest {
  id: string;
  displayReference: string;
  title: string;
  description: string;
  operationId: string;
  executionId: string;
  actionType: string;
  policy: string;
  sensitivity: string;
  requestedBy: string;
  justification: string;
  evidenceIds: string;
  affectedEntityIds: string;
  parameters: string;
  revisionToken: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string;
  result: string;
  policyDefinition: { name: string; roles: string[]; anyRole?: boolean };
}
export interface ApprovalDecision {
  id: string;
  requestId: string;
  userId: string;
  role: string;
  decision: string;
  justification: string;
  decidedAt: string;
  eligible: boolean;
}
export interface FallbackGrant {
  id: string;
  executionId: string;
  userId: string;
  accessLevel: string;
  activatedAt: string;
  expiresAt: string;
  revokedAt: string;
  reason: string;
}
export interface SavedReport {
  id: string;
  type: string;
  version: number;
  generatedBy: string;
  generatedAt: string;
  sourceCutoff: string;
  sha256: string;
  size: string;
  status: string;
  includeLegal: boolean;
}
export interface ReportingMetadata {
  detectionSource: string;
  reportedAt: string;
  initialObservation: string;
  attackVector: string;
  actorCategory: string;
  actionCategory: string;
  assetCategory: string;
  impactCategory: string;
  classificationEvidenceIds: string;
  mitreMappings: string;
  rootCause: string;
  lessonsLearned: string;
}
export interface LegalReview {
  jurisdictions: string;
  informationCategories: string;
  obligations: string;
  notificationAssessment: string;
  legalHold: string;
  evidencePreservation: string;
  clientNotification: string;
  regulatoryNotification: string;
  confidentiality: string;
  privilegeDesignation: string;
  reviewStatus: string;
}
