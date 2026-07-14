import { EvidenceLink, FieldContract, FieldUnit } from './types';

export interface RuleContract { ruleId: string; description: string; engineeringBaseline: boolean }

export const RULE_REGISTRY: readonly RuleContract[] = [
  { ruleId: 'AGENT-001', description: 'Irreducible ambiguity is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-002', description: 'Adaptive next-step selection is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-003', description: 'Tool or investigation-path selection is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-004', description: 'Incremental value beyond simpler components is required.', engineeringBaseline: true },
  { ruleId: 'AGENT-005', description: 'Permissions, budgets, stopping rules, monitoring and rollback must be bounded.', engineeringBaseline: true },
  { ruleId: 'COMPOSE-001', description: 'Select the least-complex compatible component set per primitive.', engineeringBaseline: true },
  { ruleId: 'EVID-001', description: 'Confidence derives from claim-linked validated evidence coverage.', engineeringBaseline: true },
  { ruleId: 'EVID-002', description: 'Template suggestions and assumptions are never verified evidence.', engineeringBaseline: true },
  { ruleId: 'INT-001', description: 'Interface and operation coverage gate machine interaction.', engineeringBaseline: true },
  { ruleId: 'INT-002', description: 'Machine identity gates autonomous writes.', engineeringBaseline: true },
  { ruleId: 'INT-003', description: 'Least privilege gates state-changing actions.', engineeringBaseline: true },
  { ruleId: 'INT-004', description: 'UI stability independently gates RPA/UI readiness.', engineeringBaseline: true },
  { ruleId: 'INT-005', description: 'Auditable transactions gate high-impact writes.', engineeringBaseline: true },
  { ruleId: 'INT-006', description: 'Idempotency and compensation gate retryable financial actions.', engineeringBaseline: true },
  { ruleId: 'INT-007', description: 'Rollback absence makes high-impact execution approval-bound.', engineeringBaseline: true },
  { ruleId: 'INT-008', description: 'Classified data gates AI access.', engineeringBaseline: true },
  { ruleId: 'INT-009', description: 'Production-like testing gates any production execution claim.', engineeringBaseline: true },
  { ruleId: 'INT-010', description: 'Accountable ownership gates approval.', engineeringBaseline: true },
  { ruleId: 'INT-011', description: 'Event semantics independently gate event readiness.', engineeringBaseline: true },
  { ruleId: 'INT-012', description: 'Monitoring and capacity evidence determine operational readiness.', engineeringBaseline: true },
  { ruleId: 'INT-013', description: 'Untrusted content with tool access requires prompt-injection controls.', engineeringBaseline: true },
  { ruleId: 'MOD-001', description: 'Modernization uses lifecycle and technical-health facts independently of agent readiness.', engineeringBaseline: true },
] as const;

export const FIELD_REGISTRY: readonly FieldContract[] = [
  { fieldId: 'primitive.type', use: 'fit', layer: 'primitive', ruleIds: ['COMPOSE-001'], polarity: 'neutral', unit: 'category', evidenceRequired: false },
  { fieldId: 'primitive.businessDisposition', use: 'context', layer: 'primitive', ruleIds: [], polarity: 'neutral', unit: 'category', evidenceRequired: true },
  { fieldId: 'agent.irreducibleAmbiguity', use: 'eligibility', layer: 'primitive', ruleIds: ['AGENT-001'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'agent.adaptiveNextStep', use: 'eligibility', layer: 'primitive', ruleIds: ['AGENT-002'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'agent.toolOrPathSelection', use: 'eligibility', layer: 'primitive', ruleIds: ['AGENT-003'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'agent.incrementalValue', use: 'eligibility', layer: 'primitive', ruleIds: ['AGENT-004'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'agent.controllable', use: 'risk', layer: 'governance', ruleIds: ['AGENT-005'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.interfaceAvailable', use: 'eligibility', layer: 'interaction', ruleIds: ['INT-001'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.operationCovered', use: 'eligibility', layer: 'interaction', ruleIds: ['INT-001'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.apiDocumented', use: 'confidence', layer: 'interaction', ruleIds: ['INT-001'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.machineIdentity', use: 'risk', layer: 'interaction', ruleIds: ['INT-002'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.leastPrivilege', use: 'risk', layer: 'interaction', ruleIds: ['INT-003'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.uiStable', use: 'eligibility', layer: 'interaction', ruleIds: ['INT-004'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.auditable', use: 'risk', layer: 'interaction', ruleIds: ['INT-005'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.idempotent', use: 'risk', layer: 'interaction', ruleIds: ['INT-006'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.compensatable', use: 'risk', layer: 'interaction', ruleIds: ['INT-006'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.rollback', use: 'risk', layer: 'interaction', ruleIds: ['INT-007'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.dataClassified', use: 'risk', layer: 'interaction', ruleIds: ['INT-008'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.dataQuality', use: 'fit', layer: 'interaction', ruleIds: ['INT-001'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.testEnvironment', use: 'risk', layer: 'interaction', ruleIds: ['INT-009'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.accountableOwner', use: 'risk', layer: 'application', ruleIds: ['INT-010'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.eventSemantics', use: 'eligibility', layer: 'interaction', ruleIds: ['INT-011'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.monitored', use: 'risk', layer: 'interaction', ruleIds: ['INT-012'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.capacityKnown', use: 'risk', layer: 'interaction', ruleIds: ['INT-012'], polarity: 'positive', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.untrustedContentWithTools', use: 'risk', layer: 'interaction', ruleIds: ['INT-013'], polarity: 'negative', unit: 'boolean', evidenceRequired: true },
  { fieldId: 'interaction.highImpact', use: 'context', layer: 'interaction', ruleIds: [], polarity: 'neutral', unit: 'boolean', evidenceRequired: false },
  { fieldId: 'interaction.financialAction', use: 'context', layer: 'interaction', ruleIds: [], polarity: 'neutral', unit: 'boolean', evidenceRequired: false },
  { fieldId: 'evidence.coverage', use: 'confidence', layer: 'governance', ruleIds: ['EVID-001'], polarity: 'positive', unit: 'ratio', evidenceRequired: false },
  { fieldId: 'evidence.templateStatus', use: 'confidence', layer: 'governance', ruleIds: ['EVID-002'], polarity: 'neutral', unit: 'category', evidenceRequired: false },
  { fieldId: 'asset.strategicLifespan', use: 'context', layer: 'modernization', ruleIds: [], polarity: 'neutral', unit: 'category', evidenceRequired: true },
  { fieldId: 'asset.technicalHealth', use: 'context', layer: 'modernization', ruleIds: ['MOD-001'], polarity: 'neutral', unit: 'category', evidenceRequired: true },
] as const;

export interface FieldInput { fieldId: string; value: unknown; unit: FieldUnit; applicable?: boolean }

export const validateFieldRegistry = (registry: readonly FieldContract[] = FIELD_REGISTRY): string[] => {
  const errors: string[] = [];
  const ruleIds = new Set(RULE_REGISTRY.map(rule => rule.ruleId));
  const byId = new Map<string, FieldContract>();
  for (const field of registry) {
    const prior = byId.get(field.fieldId);
    if (prior) {
      errors.push(`${field.fieldId}: duplicate field ID`);
      if (prior.use !== field.use && !field.allowedDualUseReason && !prior.allowedDualUseReason) errors.push(`${field.fieldId}: dual decision use requires an allowed reason`);
    }
    byId.set(field.fieldId, field);
    if (field.use !== 'context' && field.ruleIds.length === 0) errors.push(`${field.fieldId}: missing rule ID`);
    for (const ruleId of field.ruleIds) if (!ruleIds.has(ruleId)) errors.push(`${field.fieldId}: unknown rule ${ruleId}`);
    if (field.templateVerified) errors.push(`${field.fieldId}: template suggestion cannot be verified`);
  }
  for (const field of registry) if (field.applicability && !byId.has(field.applicability.fieldId)) errors.push(`${field.fieldId}: applicability references unknown field ${field.applicability.fieldId}`);
  return errors;
};

export const validateDecisionFieldInputs = (inputs: readonly FieldInput[], registry: readonly FieldContract[] = FIELD_REGISTRY): string[] => {
  const errors: string[] = [];
  const contracts = new Map(registry.map(field => [field.fieldId, field]));
  const seen = new Set<string>();
  for (const input of inputs) {
    const contract = contracts.get(input.fieldId);
    if (!contract) { errors.push(`${input.fieldId}: unknown field`); continue; }
    if (seen.has(input.fieldId)) errors.push(`${input.fieldId}: duplicate input`);
    seen.add(input.fieldId);
    if (contract.unit !== input.unit) errors.push(`${input.fieldId}: expected ${contract.unit}, received ${input.unit}`);
    if (input.applicable === false && input.value !== null && input.value !== undefined) errors.push(`${input.fieldId}: value supplied when field is not applicable`);
  }
  return errors;
};

export const validateEvidenceLinks = (evidence: readonly EvidenceLink[]): string[] => evidence.flatMap(item => {
  const errors: string[] = [];
  if (item.sourceType === 'template' && (item.validated || item.status === 'validated')) errors.push(`${item.id}: template suggestion cannot be verified evidence`);
  if (item.status === 'validated' && (!item.owner?.trim() || item.claimIds.length === 0)) errors.push(`${item.id}: validated evidence requires an owner and claim links`);
  return errors;
});
