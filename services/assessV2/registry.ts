import { EvidenceLink, FieldContract, FieldUnit } from './types';

export interface RuleContract { ruleId: string; description: string; engineeringBaseline: boolean }

export const RULE_REGISTRY: readonly RuleContract[] = [
  { ruleId: 'AGENT-001', description: 'Irreducible ambiguity is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-002', description: 'Adaptive next-step selection is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-003', description: 'Tool or investigation-path selection is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'AGENT-004', description: 'Incremental value beyond simpler components is required.', engineeringBaseline: true },
  { ruleId: 'AGENT-005', description: 'Controllability is required for bounded agency.', engineeringBaseline: true },
  { ruleId: 'CAND-001', description: 'Primitive type identifies candidates but required technical facts determine fit.', engineeringBaseline: true },
  { ruleId: 'COMPOSE-001', description: 'Select the least-complex compatible component set per primitive.', engineeringBaseline: true },
  { ruleId: 'EVID-001', description: 'Verified confidence requires claim-linked independent server-authoritative attestation; submitted evidence is only partial.', engineeringBaseline: true },
  { ruleId: 'EVID-002', description: 'Template suggestions and assumptions are never verified evidence.', engineeringBaseline: true },
  { ruleId: 'INT-001', description: 'Interface and operation coverage gate the declared API mode only.', engineeringBaseline: true },
  { ruleId: 'INT-002', description: 'Machine identity gates autonomous writes.', engineeringBaseline: true },
  { ruleId: 'INT-003', description: 'Least privilege gates state-changing actions.', engineeringBaseline: true },
  { ruleId: 'INT-004', description: 'UI stability independently gates UI automation.', engineeringBaseline: true },
  { ruleId: 'INT-005', description: 'Auditable transactions gate high-impact writes.', engineeringBaseline: true },
  { ruleId: 'INT-006', description: 'Idempotency and compensation gate retryable financial actions.', engineeringBaseline: true },
  { ruleId: 'INT-007', description: 'Rollback absence makes high-impact execution approval-bound.', engineeringBaseline: true },
  { ruleId: 'INT-008', description: 'Classified data gates AI access.', engineeringBaseline: true },
  { ruleId: 'INT-009', description: 'A test environment gates controlled execution.', engineeringBaseline: true },
  { ruleId: 'INT-010', description: 'Accountable ownership gates operational readiness.', engineeringBaseline: true },
  { ruleId: 'INT-011', description: 'Event semantics independently gate event readiness.', engineeringBaseline: true },
  { ruleId: 'INT-012', description: 'Monitoring and capacity evidence determine operational readiness.', engineeringBaseline: true },
  { ruleId: 'INT-013', description: 'Untrusted content with tool access requires prompt-injection controls.', engineeringBaseline: true },
  { ruleId: 'INT-014', description: 'Declared mode is the only actionable interaction mode.', engineeringBaseline: true },
  { ruleId: 'MOD-001', description: 'Modernization uses complete lifecycle and interaction facts independently of agent readiness.', engineeringBaseline: true },
] as const;

const field = (fieldId: string, use: FieldContract['use'], layer: FieldContract['layer'], ruleIds: string[], unit: FieldUnit, evidenceRequired = true, polarity: FieldContract['polarity'] = 'positive', applicability?: FieldContract['applicability']): FieldContract => ({ fieldId, use, layer, ruleIds, polarity, unit, evidenceRequired, ...(applicability ? { applicability } : {}) });

export const FIELD_REGISTRY: readonly FieldContract[] = [
  field('primitive.type', 'eligibility', 'primitive', ['CAND-001', 'COMPOSE-001'], 'category', false, 'neutral'),
  field('primitive.businessDisposition', 'context', 'primitive', [], 'category', true, 'neutral'),
  field('primitive.documentQualityRepresentative', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.exceptionSamplesAvailable', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.rulesStable', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.interfaceDependencyKnown', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.workflowPatternKnown', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.ambiguityCharacterized', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('primitive.controlRequirementsKnown', 'fit', 'primitive', ['CAND-001'], 'boolean'),
  field('agent.irreducibleAmbiguity', 'eligibility', 'primitive', ['AGENT-001'], 'boolean'),
  field('agent.adaptiveNextStep', 'eligibility', 'primitive', ['AGENT-002'], 'boolean'),
  field('agent.toolOrPathSelection', 'eligibility', 'primitive', ['AGENT-003'], 'boolean'),
  field('agent.incrementalValue', 'eligibility', 'primitive', ['AGENT-004'], 'boolean'),
  field('agent.controllable', 'risk', 'governance', ['AGENT-005'], 'boolean'),
  field('interaction.interfaceAvailable', 'eligibility', 'interaction', ['INT-001'], 'boolean'),
  field('interaction.operationCovered', 'eligibility', 'interaction', ['INT-001'], 'boolean'),
  field('interaction.apiDocumented', 'confidence', 'interaction', ['INT-001'], 'boolean'),
  field('interaction.machineIdentity', 'risk', 'interaction', ['INT-002'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'write' }),
  field('interaction.leastPrivilege', 'risk', 'interaction', ['INT-003'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'write' }),
  field('interaction.uiStable', 'eligibility', 'interaction', ['INT-004'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'ui' }),
  field('interaction.auditable', 'risk', 'interaction', ['INT-005'], 'boolean', true, 'positive', { fieldId: 'interaction.highImpact', equals: true }),
  field('interaction.idempotent', 'risk', 'interaction', ['INT-006'], 'boolean', true, 'positive', { fieldId: 'interaction.financialAction', equals: true }),
  field('interaction.compensatable', 'risk', 'interaction', ['INT-006'], 'boolean', true, 'positive', { fieldId: 'interaction.financialAction', equals: true }),
  field('interaction.rollback', 'risk', 'interaction', ['INT-007'], 'boolean', true, 'positive', { fieldId: 'interaction.highImpact', equals: true }),
  field('interaction.dataClassified', 'risk', 'interaction', ['INT-008'], 'boolean'),
  field('interaction.dataQuality', 'confidence', 'interaction', ['INT-001'], 'boolean'),
  field('interaction.testEnvironment', 'risk', 'interaction', ['INT-009'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'operational' }),
  field('interaction.accountableOwner', 'risk', 'interaction', ['INT-010'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'operational' }),
  field('interaction.eventSemantics', 'eligibility', 'interaction', ['INT-011'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'event' }),
  field('interaction.monitored', 'risk', 'interaction', ['INT-012'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'operational' }),
  field('interaction.capacityKnown', 'risk', 'interaction', ['INT-012'], 'boolean', true, 'positive', { fieldId: 'interaction.mode', equals: 'operational' }),
  field('interaction.errorContract', 'risk', 'interaction', ['INT-001'], 'boolean'),
  field('interaction.untrustedContentWithTools', 'risk', 'interaction', ['INT-013'], 'boolean', true, 'negative'),
  field('interaction.highImpact', 'risk', 'interaction', ['INT-005', 'INT-007'], 'boolean', false, 'neutral', { fieldId: 'interaction.mode', equals: 'write' }),
  field('interaction.financialAction', 'risk', 'interaction', ['INT-006'], 'boolean', false, 'neutral', { fieldId: 'interaction.mode', equals: 'write' }),
  field('interaction.mode', 'eligibility', 'interaction', ['INT-001', 'INT-002', 'INT-003', 'INT-004', 'INT-009', 'INT-010', 'INT-011', 'INT-012', 'INT-014'], 'category', false, 'neutral'),
  field('evidence.coverage', 'confidence', 'governance', ['EVID-001'], 'ratio', false),
  field('evidence.templateStatus', 'confidence', 'governance', ['EVID-002'], 'category', false, 'neutral'),
  field('asset.strategicLifespan', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.technicalHealth', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.businessCriticality', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.ownershipModel', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.vendorRoadmap', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.operatingStability', 'context', 'modernization', ['MOD-001'], 'category'),
  field('asset.accountableOwner', 'context', 'modernization', ['MOD-001'], 'text'),
] as const;

export interface FieldInput { fieldId: string; value: unknown; unit: FieldUnit; contextId?: string; applicable?: boolean }

export const validateFieldRegistry = (registry: readonly FieldContract[] = FIELD_REGISTRY): string[] => {
  const errors: string[] = [];
  const ruleIds = new Set(RULE_REGISTRY.map(rule => rule.ruleId));
  const byId = new Map<string, FieldContract>();
  for (const item of registry) {
    const prior = byId.get(item.fieldId);
    if (prior) errors.push(`${item.fieldId}: duplicate field ID`);
    byId.set(item.fieldId, item);
    if (item.use !== 'context' && item.ruleIds.length === 0) errors.push(`${item.fieldId}: missing rule ID`);
    for (const ruleId of item.ruleIds) if (!ruleIds.has(ruleId)) errors.push(`${item.fieldId}: unknown rule ${ruleId}`);
    if (item.templateVerified) errors.push(`${item.fieldId}: template suggestion cannot be verified`);
  }
  for (const item of registry) if (item.applicability) {
    const controller = byId.get(item.applicability.fieldId);
    if (!controller) errors.push(`${item.fieldId}: applicability references unknown field ${item.applicability.fieldId}`);
    else {
      if (controller.unit !== 'boolean' && controller.unit !== 'category') errors.push(`${item.fieldId}: applicability controller must be boolean or category`);
      if (controller.use === 'context' && controller.ruleIds.length === 0) errors.push(`${item.fieldId}: applicability controller must have decision semantics`);
    }
  }
  return errors;
};

export const validateDecisionFieldInputs = (inputs: readonly FieldInput[], registry: readonly FieldContract[] = FIELD_REGISTRY): string[] => {
  const errors: string[] = [];
  const contracts = new Map(registry.map(item => [item.fieldId, item]));
  const scoped = new Map(inputs.map(input => [`${input.contextId ?? '__global'}:${input.fieldId}`, input]));
  for (const input of inputs) {
    const contract = contracts.get(input.fieldId);
    if (!contract) { errors.push(`${input.fieldId}: unknown field`); continue; }
    if (contract.unit !== input.unit) errors.push(`${input.fieldId}: expected ${contract.unit}, received ${input.unit}`);
    if (contract.applicability) {
      const controller = scoped.get(`${input.contextId ?? '__global'}:${contract.applicability.fieldId}`);
      if (!controller) errors.push(`${input.fieldId}: missing applicability controller ${contract.applicability.fieldId}`);
      else {
        const applicable = controller.value === contract.applicability.equals;
        if (input.applicable !== undefined && input.applicable !== applicable) errors.push(`${input.fieldId}: supplied applicability does not match ${contract.applicability.fieldId}`);
        if (!applicable && input.value !== null && input.value !== undefined) errors.push(`${input.fieldId}: value supplied when field is not applicable`);
      }
    } else if (input.applicable === false && input.value !== null && input.value !== undefined) errors.push(`${input.fieldId}: unconditional field cannot be marked not applicable`);
    if (input.value !== null && input.value !== undefined) {
      if (input.unit === 'boolean' && typeof input.value !== 'boolean') errors.push(`${input.fieldId}: expected boolean value`);
      if (input.unit === 'ratio' && (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0 || input.value > 1)) errors.push(`${input.fieldId}: expected finite ratio value`);
      if ((input.unit === 'category' || input.unit === 'text') && typeof input.value !== 'string') errors.push(`${input.fieldId}: expected string value`);
      if (input.unit === 'count' && (typeof input.value !== 'number' || !Number.isSafeInteger(input.value) || input.value < 0)) errors.push(`${input.fieldId}: expected non-negative integer value`);
    }
  }
  return errors;
};

export const validateEvidenceLinks = (evidence: readonly EvidenceLink[]): string[] => evidence.flatMap(item => {
  const errors: string[] = [];
  if (item.validated !== false) errors.push(`${item.id}: PR 1D author evidence cannot be validated`);
  if (item.status !== 'suggested' && item.status !== 'submitted') errors.push(`${item.id}: PR 1D author evidence must be suggested or submitted`);
  if (item.capturedAt && !Number.isFinite(Date.parse(item.capturedAt))) errors.push(`${item.id}: capturedAt must be an ISO timestamp`);
  if (item.validUntil && !Number.isFinite(Date.parse(item.validUntil))) errors.push(`${item.id}: validUntil must be an ISO timestamp`);
  return errors;
});
