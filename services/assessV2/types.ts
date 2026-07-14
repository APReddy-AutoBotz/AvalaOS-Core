export const ASSESS_V2_SCHEMA_VERSION = 'assess-v2-schema-2026-07' as const;
export const ASSESS_V2_RULE_SET_VERSION = 'assess-v2-rules-2026-07' as const;
export const ASSESS_V2_DECISION_VERSION = 'assess-v2-decision-2026-07' as const;

export type EvidenceConfidence = 'Verified' | 'Partially Evidenced' | 'Assumption-Led' | 'Insufficient Evidence';
export type FitBand = 'Strong Fit' | 'Conditional Fit' | 'Weak Fit' | 'Ineligible' | 'Not Applicable';
export type PrimitiveType = 'Capture' | 'Extract' | 'Classify' | 'Validate' | 'Calculate' | 'Reconcile' | 'Retrieve' | 'Investigate' | 'Decide' | 'Approve' | 'Route' | 'Execute' | 'Communicate' | 'Monitor' | 'Audit';
export type BusinessDisposition = 'Monitor / Do Nothing' | 'Simplify' | 'Redesign' | 'Human-Led' | 'Existing Product Configuration' | 'Custom Application';
export type Component = 'Deterministic Rules' | 'Native API Integration' | 'Event Automation' | 'Workflow Orchestration' | 'Dynamic Case Management' | 'RPA / UI Automation' | 'Document Intelligence' | 'Conventional ML' | 'RAG' | 'GenAI Assistant' | 'Bounded Agent' | 'Validation' | 'Human Approval' | 'Segregation of Duties' | 'Audit' | 'Monitoring' | 'Rollback / Compensation' | 'Kill Switch';
export type InteractionMode = 'read' | 'write' | 'event' | 'ui' | 'operational';
export type Readiness = 'Ready' | 'Conditional' | 'Prohibited' | 'Unknown';
export type ModernizationDisposition = 'Retain' | 'Native Integration' | 'API Facade' | 'Semantic Bridge' | 'Event Bridge' | 'Temporary RPA Bridge' | 'Refactor' | 'Replatform' | 'Replace' | 'Incremental Rebuild' | 'Consolidate' | 'Retire';

export interface EvidenceLink {
  id: string;
  claimIds: string[];
  sourceType: 'system-record' | 'document' | 'interview' | 'observation' | 'test' | 'template';
  status: 'suggested' | 'submitted' | 'validated' | 'rejected';
  validated: boolean;
  owner?: string;
  capturedAt?: string;
  validUntil?: string;
  reviewerIds?: string[];
  contradictory?: boolean;
}

export interface CaseFact<T = unknown> { fieldId: string; value: T | null; status: 'known' | 'unknown' | 'suggested' | 'assumed'; evidenceIds: string[]; source?: 'user' | 'system' | 'template' | 'v1-import' }
export interface AgentNecessityFacts { irreducibleAmbiguity: boolean | null; adaptiveNextStep: boolean | null; toolOrPathSelection: boolean | null; incrementalValue: boolean | null; controllable: boolean | null }

export interface ProcessPrimitive {
  id: string; type: PrimitiveType; name: string; description: string; trigger?: string; inputs: string[]; outputs: string[]; owner?: string;
  volumeShare?: number | null; manualEffort?: number | null; rules: string[]; exceptionIds: string[]; evidenceIds: string[];
  facts: Record<string, CaseFact>; businessDisposition?: BusinessDisposition; agentNecessity?: AgentNecessityFacts;
}
export interface ProcessEdge { id: string; fromPrimitiveId: string; toPrimitiveId: string; condition?: string }
export interface DecisionPoint { id: string; primitiveId: string; name: string; ruleDescription: string; outcomeLabels: string[]; evidenceIds: string[] }
export interface ExceptionPath { id: string; fromPrimitiveId: string; name: string; trigger: string; resolutionPrimitiveIds: string[]; evidenceIds: string[] }

export interface ApplicationAsset {
  id: string; name: string; strategicLifespan: 'short' | 'medium' | 'long' | 'unknown'; technicalHealth: 'healthy' | 'constrained' | 'end-of-life' | 'unknown';
  businessCriticality?: 'low' | 'medium' | 'high' | 'critical' | 'unknown'; ownershipModel?: 'source-owned' | 'vendor-owned' | 'shared' | 'unknown';
  vendorRoadmap?: 'supportive' | 'constrained' | 'end-of-life' | 'unknown'; operatingStability?: 'stable' | 'variable' | 'unstable' | 'unknown';
  accountableOwner?: string; evidenceIds: string[];
}

export interface InteractionFacts {
  interfaceAvailable: boolean | null; operationCovered: boolean | null; apiDocumented: boolean | null; machineIdentity: boolean | null;
  leastPrivilege: boolean | null; dataQuality: boolean | null; dataClassified: boolean | null; auditable: boolean | null; idempotent: boolean | null;
  compensatable: boolean | null; rollback: boolean | null; testEnvironment: boolean | null; monitored: boolean | null; uiStable: boolean | null;
  eventSemantics: boolean | null; highImpact: boolean; financialAction: boolean; untrustedContentWithTools: boolean;
  errorContract?: boolean | null; capacityKnown?: boolean | null; accountableOwner?: boolean | null;
}
export interface ApplicationInteraction { id: string; assetId: string; primitiveId: string; operationName: string; mode: InteractionMode; dataClassification: 'Public' | 'Internal' | 'Confidential' | 'Restricted' | 'Unknown'; facts: InteractionFacts; evidenceIds: string[] }
export interface AssessmentCaseVersion { caseId: string; version: number; schemaVersion: typeof ASSESS_V2_SCHEMA_VERSION; ruleSetVersion: typeof ASSESS_V2_RULE_SET_VERSION; createdBy: string; createdAt: string }

export interface AssessmentCaseV2 {
  id: string; organizationId: string; workspaceId: string; sourceProcessId: string; ownerId: string; status: 'draft' | 'reviewer-ready' | 'superseded';
  version: number; schemaVersion: typeof ASSESS_V2_SCHEMA_VERSION; ruleSetVersion: typeof ASSESS_V2_RULE_SET_VERSION;
  sourceV1?: { assessmentId: string; scoreVersion: string; clonedAt: string; importedAs: 'unverified-source-facts' }; importedFacts?: CaseFact[];
  primitives: ProcessPrimitive[]; edges: ProcessEdge[]; decisionPoints?: DecisionPoint[]; exceptionPaths?: ExceptionPath[]; assets: ApplicationAsset[];
  interactions: ApplicationInteraction[]; evidence: EvidenceLink[]; agentNecessity: AgentNecessityFacts; createdAt: string; updatedAt: string; deletedAt?: string;
}

export interface RuleTrace { ruleId: string; fieldIds: string[]; outcome: string }
export interface GateResult { ruleId: string; subjectId: string; status: 'pass' | 'conditional' | 'fail' | 'unknown' | 'not-applicable'; reason: string }
export interface ControlRequirement { id: string; subjectId: string; control: Component; required: boolean; rationale: string; ruleIds: string[] }
export interface CandidateEvaluation { primitiveId: string; component: Component; fit: FitBand; rationale: string[]; ruleIds: string[] }
export interface InteractionDecision { interactionId: string; readiness: Record<InteractionMode, Readiness>; allowedActions: string[]; prohibitedActions: string[]; requiredControls: string[]; evidenceGaps: string[]; ruleIds: string[] }

export interface DecisionPackV2 {
  schemaVersion: typeof ASSESS_V2_SCHEMA_VERSION; ruleSetVersion: typeof ASSESS_V2_RULE_SET_VERSION; decisionVersion: typeof ASSESS_V2_DECISION_VERSION;
  caseId: string; caseVersion: number; validationStatus: 'reviewer-ready'; executiveDecision?: string; assessmentBoundary?: string;
  confidence: EvidenceConfidence; processReadiness: 'Ready for controlled design' | 'Provisional' | 'Insufficient evidence'; candidateEvaluations: CandidateEvaluation[];
  gateResults?: GateResult[]; composedOperatingModel: Array<{ primitiveId: string; businessDisposition?: BusinessDisposition; components: Component[] }>;
  interactionDecisions: InteractionDecision[]; modernization: Array<{ assetId: string; dispositions: ModernizationDisposition[]; rationale: string[] }>;
  controlRequirements?: ControlRequirement[]; controls: string[]; evidenceGaps: string[]; assumptions: string[]; alternativesConsidered: string[];
  openRemediationActions?: string[]; whatWouldChangeDecision: string[]; trace: RuleTrace[]; nonClaims: string[];
}

export interface ImmutableDecisionVersionV2 {
  caseId: string; sourceCaseVersion: number; ruleSetVersion: string; decisionVersion: string; inputSnapshot: AssessmentCaseV2; evidenceSnapshot: EvidenceLink[];
  outputSnapshot: DecisionPackV2; inputHash: string; evidenceHash: string; outputHash: string; supersedesDecisionId?: string; createdBy: string;
  createdAt: string; validationStatus: 'reviewer-ready';
}

export type DecisionUse = 'eligibility' | 'fit' | 'risk' | 'confidence' | 'economics' | 'context' | 'derived';
export type DecisionLayer = 'process' | 'primitive' | 'application' | 'interaction' | 'governance' | 'modernization';
export type FieldUnit = 'boolean' | 'category' | 'ratio' | 'count' | 'text';
export interface FieldContract { fieldId: string; use: DecisionUse; layer: DecisionLayer; ruleIds: string[]; polarity: 'positive' | 'negative' | 'neutral'; unit: FieldUnit; evidenceRequired: boolean; applicability?: { fieldId: string; equals: unknown }; templateVerified?: boolean; allowedDualUseReason?: string }
