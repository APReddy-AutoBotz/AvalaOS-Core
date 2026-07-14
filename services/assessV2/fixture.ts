import { ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, AssessmentCaseV2, ProcessPrimitive } from './types';

const baseFacts = {
  interfaceAvailable: true,
  operationCovered: true,
  apiDocumented: true,
  machineIdentity: true,
  leastPrivilege: true,
  dataQuality: true,
  dataClassified: true,
  auditable: true,
  idempotent: true,
  compensatable: true,
  rollback: true,
  testEnvironment: true,
  monitored: true,
  uiStable: false,
  eventSemantics: true,
  highImpact: false,
  financialAction: false,
  untrustedContentWithTools: false,
  errorContract: true,
  capacityKnown: true,
  accountableOwner: true,
};

const primitive = (id: string, type: ProcessPrimitive['type'], name: string, description: string, evidenceIds = ['ev-ops']): ProcessPrimitive => ({
  id, type, name, description, inputs: [], outputs: [], rules: [], exceptionIds: [], evidenceIds, facts: {},
});

const investigationNecessity = { irreducibleAmbiguity: true, adaptiveNextStep: true, toolOrPathSelection: true, incrementalValue: true, controllable: true } as const;

export const AP_INVOICE_EXCEPTION_V2_FIXTURE: AssessmentCaseV2 = {
  id: 'case-ap-invoice-exception-v2',
  organizationId: 'org-demo',
  workspaceId: 'workspace-finance',
  sourceProcessId: 'process-ap-invoice-exception',
  ownerId: 'finance-operations',
  status: 'draft',
  version: 1,
  schemaVersion: ASSESS_V2_SCHEMA_VERSION,
  ruleSetVersion: ASSESS_V2_RULE_SET_VERSION,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
  agentNecessity: investigationNecessity,
  evidence: [
    { id: 'ev-api-test', claimIds: ['sap-api', 'validation-rules', 'write-controls'], sourceType: 'test', status: 'validated', validated: true, owner: 'integration-owner', capturedAt: '2026-07-14T00:00:00.000Z' },
    { id: 'ev-ops', claimIds: ['exception-path', 'approval-policy', 'operating-model'], sourceType: 'interview', status: 'validated', validated: true, owner: 'ap-owner', capturedAt: '2026-07-14T00:00:00.000Z' },
  ],
  primitives: [
    primitive('intake', 'Capture', 'Invoice intake', 'Mailbox, API, or event intake.'),
    primitive('extract', 'Extract', 'Document extraction', 'Document intelligence extracts PDF and email content.'),
    primitive('validate', 'Validate', 'PO/GRN validation', 'Deterministic duplicate, tax, PO/GRN, and vendor-master validation.', ['ev-api-test']),
    { ...primitive('exception', 'Investigate', 'Exception investigation', 'Human investigation with bounded AI assistance.'), agentNecessity: investigationNecessity },
    primitive('route', 'Route', 'Exception queue and escalation', 'Dynamic case workflow manages waiting, routing, and escalation.'),
    primitive('approve', 'Approve', 'Posting and release approval', 'A human approves posting or payment release.'),
    primitive('communicate', 'Communicate', 'Vendor communication', 'A human approves external vendor communication.'),
    primitive('monitor', 'Monitor', 'Operational monitoring', 'Monitor queue age, errors, controls, and capacity.'),
    primitive('audit', 'Audit', 'Decision audit', 'Retain evidence and correlated decision traces.'),
  ],
  edges: [
    { id: 'e1', fromPrimitiveId: 'intake', toPrimitiveId: 'extract' },
    { id: 'e2', fromPrimitiveId: 'extract', toPrimitiveId: 'validate' },
    { id: 'e3', fromPrimitiveId: 'validate', toPrimitiveId: 'exception', condition: 'validation exception' },
    { id: 'e4', fromPrimitiveId: 'exception', toPrimitiveId: 'route' },
    { id: 'e5', fromPrimitiveId: 'route', toPrimitiveId: 'approve' },
    { id: 'e6', fromPrimitiveId: 'approve', toPrimitiveId: 'communicate' },
    { id: 'e7', fromPrimitiveId: 'approve', toPrimitiveId: 'audit' },
  ],
  decisionPoints: [{ id: 'dp-validation', primitiveId: 'validate', name: 'Validation outcome', ruleDescription: 'Route deterministic failures to the exception queue.', outcomeLabels: ['valid', 'exception'], evidenceIds: ['ev-api-test'] }],
  exceptionPaths: [{ id: 'xp-investigate', fromPrimitiveId: 'validate', name: 'Invoice exception', trigger: 'A deterministic validation fails or remains ambiguous.', resolutionPrimitiveIds: ['exception', 'route', 'approve'], evidenceIds: ['ev-ops'] }],
  assets: [{ id: 'sap', name: 'SAP ERP', strategicLifespan: 'long', technicalHealth: 'constrained', businessCriticality: 'critical', ownershipModel: 'vendor-owned', vendorRoadmap: 'supportive', operatingStability: 'stable', accountableOwner: 'erp-owner', evidenceIds: ['ev-api-test'] }],
  interactions: [
    { id: 'sap-read', assetId: 'sap', primitiveId: 'validate', operationName: 'Read PO, GRN, tax, and vendor-master data', mode: 'read', dataClassification: 'Confidential', facts: baseFacts, evidenceIds: ['ev-api-test'] },
    { id: 'sap-post', assetId: 'sap', primitiveId: 'approve', operationName: 'Post an approved invoice', mode: 'write', dataClassification: 'Confidential', facts: { ...baseFacts, highImpact: true, financialAction: true, rollback: false }, evidenceIds: ['ev-api-test'] },
    { id: 'sap-payment-release', assetId: 'sap', primitiveId: 'approve', operationName: 'Release payment', mode: 'write', dataClassification: 'Restricted', facts: { ...baseFacts, highImpact: true, financialAction: true, rollback: false }, evidenceIds: ['ev-api-test'] },
    { id: 'sap-vendor-communication', assetId: 'sap', primitiveId: 'communicate', operationName: 'Send vendor communication', mode: 'write', dataClassification: 'Confidential', facts: { ...baseFacts, highImpact: true, rollback: false }, evidenceIds: ['ev-ops'] },
    { id: 'sap-ui-gap', assetId: 'sap', primitiveId: 'validate', operationName: 'Unsupported UI lookup', mode: 'ui', dataClassification: 'Confidential', facts: { ...baseFacts, interfaceAvailable: false, uiStable: true }, evidenceIds: ['ev-api-test'] },
  ],
};
