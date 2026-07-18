import { FieldInput, FIELD_REGISTRY, validateDecisionFieldInputs, validateEvidenceLinks, validateFieldRegistry } from './registry.ts';
import {
  ASSESS_V2_DECISION_VERSION,
  ASSESS_V2_RULE_SET_VERSION,
  ASSESS_V2_SCHEMA_VERSION,
  AgentNecessityFacts,
  ApplicationInteraction,
  AssessmentCaseV2,
  CandidateEvaluation,
  CaseFact,
  Component,
  DecisionPackV2,
  EvidenceConfidence,
  EvidenceLink,
  InteractionDecision,
  InteractionMode,
  ModernizationDisposition,
  ProcessPrimitive,
  Readiness,
  RuleTrace,
} from './types.ts';

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const modes: readonly InteractionMode[] = ['read', 'write', 'event', 'ui', 'operational'];
const agentRuleByKey = {
  irreducibleAmbiguity: 'AGENT-001',
  adaptiveNextStep: 'AGENT-002',
  toolOrPathSelection: 'AGENT-003',
  incrementalValue: 'AGENT-004',
  controllable: 'AGENT-005',
} as const;

// PR 1D has no server-authoritative attestation relation: Verified is unreachable.
const verified = (_evidence: EvidenceLink | undefined, _asOf: string, _claimId?: string): boolean => false;
const submitted = (evidence: EvidenceLink | undefined, asOf: string, claimId?: string): boolean => Boolean(
  evidence && evidence.sourceType !== 'template' && evidence.status === 'submitted' && evidence.validated === false && evidence.claimIds.length &&
  (!claimId || evidence.claimIds.includes(claimId)) && (!evidence.validUntil || Date.parse(evidence.validUntil) >= Date.parse(asOf)),
);

const evidenceAsOf = (evidence: readonly EvidenceLink[]): string => evidence.map(item => item.capturedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? '1970-01-01T00:00:00.000Z';

const allFactEvidenceIds = (facts: Record<string, CaseFact>): string[] => Object.values(facts).flatMap(item => item.evidenceIds);
const agentFactEvidenceIds = (facts: AgentNecessityFacts): string[] => Object.values(facts).flatMap(item => item.evidenceIds);
interface EvidenceRequirement { evidenceIds: readonly string[]; claimId: string }

const interactionFieldValue = (interaction: ApplicationInteraction, fieldId: string): unknown => fieldId === 'interaction.mode'
  ? interaction.mode
  : interaction.facts[fieldId.slice('interaction.'.length) as keyof ApplicationInteraction['facts']];

const interactionFieldApplicable = (interaction: ApplicationInteraction, fieldId: string, seen = new Set<string>()): boolean => {
  const contract = FIELD_REGISTRY.find(item => item.fieldId === fieldId);
  if (!contract?.applicability) return true;
  if (seen.has(fieldId)) return false;
  const nextSeen = new Set(seen).add(fieldId);
  return interactionFieldApplicable(interaction, contract.applicability.fieldId, nextSeen) &&
    interactionFieldValue(interaction, contract.applicability.fieldId) === contract.applicability.equals;
};

const requiredEvidence = (c: AssessmentCaseV2): EvidenceRequirement[] => [
  ...c.primitives.flatMap(item => [...Object.values(item.facts), ...Object.values(item.agentNecessity ?? {})].map(fact => ({ evidenceIds: fact.evidenceIds, claimId: fact.fieldId }))),
  ...Object.values(c.agentNecessity).map(fact => ({ evidenceIds: fact.evidenceIds, claimId: fact.fieldId })),
  ...c.interactions.flatMap(item => Object.keys(item.facts)
    .map(key => `interaction.${key}`)
    .filter(fieldId => FIELD_REGISTRY.find(contract => contract.fieldId === fieldId)?.evidenceRequired !== false && interactionFieldApplicable(item, fieldId))
    .map(claimId => ({ evidenceIds: item.evidenceIds, claimId }))),
  ...c.assets.flatMap(item => ['strategicLifespan', 'technicalHealth', 'businessCriticality', 'ownershipModel', 'vendorRoadmap', 'operatingStability', 'accountableOwner'].map(key => ({ evidenceIds: item.evidenceIds, claimId: `asset.${key}` }))),
];

export const deriveEvidenceConfidence = (c: AssessmentCaseV2): EvidenceConfidence => {
  const required = requiredEvidence(c);
  if (!required.length || !c.evidence.length) return 'Insufficient Evidence';
  const byId = new Map(c.evidence.map(item => [item.id, item]));
  const count = required.filter(({ evidenceIds, claimId }) => evidenceIds.some(evidenceId => submitted(byId.get(evidenceId), c.updatedAt, claimId))).length;
  return count > 0 ? 'Partially Evidenced' : c.evidence.some(item => item.status === 'suggested' || item.sourceType === 'template') ? 'Assumption-Led' : 'Insufficient Evidence';
};

const confidenceForEvidence = (ids: readonly string[], evidence: readonly EvidenceLink[], asOf = '1970-01-01T00:00:00.000Z', claimIds: readonly string[] = []): EvidenceConfidence => {
  if (!ids.length) return 'Insufficient Evidence';
  const byId = new Map(evidence.map(item => [item.id, item]));
  if (claimIds.length) {
    const submittedClaims = claimIds.filter(claimId => ids.some(id => submitted(byId.get(id), asOf, claimId))).length;
    return submittedClaims > 0 ? 'Partially Evidenced' : 'Assumption-Led';
  }
  return ids.some(id => submitted(byId.get(id), asOf)) ? 'Partially Evidenced' : 'Assumption-Led';
};

export const evaluateAgentNecessity = (primitiveId: string, facts: AgentNecessityFacts, evidence: readonly EvidenceLink[] = [], asOf = evidenceAsOf(evidence)): CandidateEvaluation => {
  const entries = Object.entries(facts) as Array<[keyof AgentNecessityFacts, CaseFact<boolean>]>;
  const fieldIds = entries.map(([, item]) => item.fieldId);
  const evidenceIds = unique(entries.flatMap(([, item]) => item.evidenceIds));
  const ruleIds = entries.map(([key]) => agentRuleByKey[key]);
  const hasFalse = entries.some(([, item]) => item.value === false);
  const hasUnknown = entries.some(([, item]) => item.value === null || item.status === 'unknown');
  const allEvidenced = entries.every(([, item]) => item.evidenceIds.some(id => {
    const link = evidence.find(candidate => candidate.id === id);
    return verified(link, asOf, item.fieldId);
  }));
  if (hasFalse) return { primitiveId, component: 'Bounded Agent', fit: 'Ineligible', confidence: confidenceForEvidence(evidenceIds, evidence, asOf), rationale: ['At least one required agent-necessity condition is proven false.'], ruleIds, fieldIds, evidenceIds };
  if (hasUnknown) return { primitiveId, component: 'Bounded Agent', fit: 'Weak Fit', confidence: confidenceForEvidence(evidenceIds, evidence, asOf), rationale: ['No condition is false, but one or more agent-necessity facts require evidence.'], ruleIds, fieldIds, evidenceIds };
  return {
    primitiveId,
    component: 'Bounded Agent',
    fit: 'Conditional Fit',
    confidence: allEvidenced ? 'Verified' : 'Assumption-Led',
    rationale: [allEvidenced
      ? 'All five necessity conditions have valid claim-linked evidence; bounded agency remains conditional on action-specific controls and human approval.'
      : 'All five conditions are asserted true but at least one remains unverified; bounded agency is assumption-led and conditional.'],
    ruleIds,
    fieldIds,
    evidenceIds,
  };
};

const componentMap: Record<ProcessPrimitive['type'], Component[]> = {
  Capture: ['Event Automation'], Extract: ['Document Intelligence', 'Validation'], Classify: ['Deterministic Rules', 'Validation'], Validate: ['Deterministic Rules', 'Validation'], Calculate: ['Deterministic Rules', 'Validation'], Reconcile: ['Deterministic Rules', 'Workflow Orchestration'], Retrieve: ['Native API Integration'], Investigate: ['Dynamic Case Management', 'GenAI Assistant', 'Human Approval'], Decide: ['Deterministic Rules', 'Human Approval'], Approve: ['Workflow Orchestration', 'Human Approval', 'Segregation of Duties'], Route: ['Workflow Orchestration'], Execute: ['Native API Integration', 'Human Approval', 'Rollback / Compensation'], Communicate: ['Workflow Orchestration', 'Human Approval'], Monitor: ['Monitoring'], Audit: ['Audit'],
};
const requirementByType: Record<ProcessPrimitive['type'], string[]> = {
  Capture: ['primitive.workflowPatternKnown'],
  Extract: ['primitive.documentQualityRepresentative', 'primitive.exceptionSamplesAvailable'],
  Classify: ['primitive.rulesStable'],
  Validate: ['primitive.rulesStable'],
  Calculate: ['primitive.rulesStable'],
  Reconcile: ['primitive.rulesStable', 'primitive.workflowPatternKnown'],
  Retrieve: ['primitive.interfaceDependencyKnown'],
  Investigate: ['primitive.ambiguityCharacterized'],
  Decide: ['primitive.rulesStable'],
  Approve: ['primitive.workflowPatternKnown'],
  Route: ['primitive.workflowPatternKnown'],
  Execute: ['primitive.interfaceDependencyKnown'],
  Communicate: ['primitive.workflowPatternKnown'],
  Monitor: ['primitive.controlRequirementsKnown'],
  Audit: ['primitive.controlRequirementsKnown'],
};

export const evaluateCandidateFit = (primitive: ProcessPrimitive, component: Component, evidence: readonly EvidenceLink[], asOf = evidenceAsOf(evidence)): CandidateEvaluation => {
  if (!componentMap[primitive.type].includes(component)) return { primitiveId: primitive.id, component, fit: 'Not Applicable', confidence: 'Insufficient Evidence', rationale: [`${component} is not a candidate for ${primitive.type}.`], ruleIds: ['CAND-001'], fieldIds: ['primitive.type'], evidenceIds: [] };
  const required = requirementByType[primitive.type];
  const facts = required.map(id => primitive.facts[id]);
  const fieldIds = ['primitive.type', ...required];
  const evidenceIds = unique(facts.flatMap(item => item?.evidenceIds ?? []));
  const evidencedClaims = required.filter((claimId, index) => (facts[index]?.evidenceIds ?? []).some(evidenceId =>
    verified(evidence.find(item => item.id === evidenceId), asOf, claimId))).length;
  const confidence: EvidenceConfidence = !evidenceIds.length
    ? 'Insufficient Evidence'
    : evidencedClaims === required.length
      ? 'Verified'
      : evidencedClaims > 0
        ? 'Partially Evidenced'
        : 'Assumption-Led';
  const fit = facts.some(item => item?.value === false) ? 'Ineligible' : facts.some(item => !item || item.value === null || item.status === 'unknown') ? 'Conditional Fit' : 'Strong Fit';
  const rationale = fit === 'Strong Fit'
    ? [`Applicable technical facts support ${component}; confidence remains separately evidence-qualified.`]
    : fit === 'Ineligible'
      ? [`A required technical condition for ${component} is proven false.`]
      : [`${component} is a candidate, but one or more required technical facts are unknown.`];
  return { primitiveId: primitive.id, component, fit, confidence, rationale, ruleIds: ['CAND-001'], fieldIds, evidenceIds };
};

const operationalReadiness = (i: ApplicationInteraction): Readiness => {
  const f = i.facts;
  if ([f.accountableOwner, f.testEnvironment, f.monitored, f.capacityKnown].some(value => value === null)) return 'Unknown';
  if (f.accountableOwner === false) return 'Prohibited';
  if (f.testEnvironment === false || f.monitored === false || f.capacityKnown === false) return 'Conditional';
  return 'Ready';
};

const apiReadiness = (i: ApplicationInteraction): Readiness => {
  const f = i.facts;
  if (f.interfaceAvailable === false || f.operationCovered === false) return 'Prohibited';
  if (f.interfaceAvailable === null || f.operationCovered === null || f.apiDocumented === null || f.errorContract === null) return 'Unknown';
  return 'Ready';
};

export const evaluateInteractionReadiness = (i: ApplicationInteraction): InteractionDecision => {
  const f = i.facts;
  const readiness: Record<InteractionMode, Readiness> = { read: 'Not Applicable', write: 'Not Applicable', event: 'Not Applicable', ui: 'Not Applicable', operational: 'Not Applicable' };
  let declared: Readiness;
  if (i.mode === 'ui') declared = f.uiStable === null ? 'Unknown' : f.uiStable ? 'Conditional' : 'Prohibited';
  else if (i.mode === 'event') declared = f.eventSemantics === null ? 'Unknown' : f.eventSemantics ? 'Ready' : 'Prohibited';
  else if (i.mode === 'operational') declared = operationalReadiness(i);
  else declared = apiReadiness(i);

  if (i.mode === 'read' && declared === 'Ready' && (f.dataClassified !== true || i.dataClassification === 'Unknown')) declared = f.dataClassified === false ? 'Prohibited' : 'Conditional';
  if (i.mode === 'write' && declared === 'Ready') {
    if (f.machineIdentity !== true || f.leastPrivilege !== true) declared = f.machineIdentity === false || f.leastPrivilege === false ? 'Prohibited' : 'Unknown';
    else if (f.highImpact && f.auditable !== true) declared = f.auditable === false ? 'Prohibited' : 'Unknown';
    else if (f.financialAction && (f.idempotent !== true || f.compensatable !== true)) declared = f.idempotent === false || f.compensatable === false ? 'Prohibited' : 'Unknown';
    else if (f.highImpact && f.rollback !== true) declared = f.rollback === false ? 'Conditional' : 'Unknown';
  }
  readiness[i.mode] = declared;

  const writeHighImpact = i.mode === 'write' && f.highImpact === true;
  const writeFinancialAction = i.mode === 'write' && f.financialAction === true;
  const controls = ['Audit correlation'];
  if (writeHighImpact || writeFinancialAction || declared === 'Conditional') controls.push('Human approval', 'Controlled execution');
  if (writeHighImpact && f.rollback !== true) controls.push('Rollback or documented compensation');
  if (f.untrustedContentWithTools) controls.push('Prompt-injection controls', 'Bounded permissions');
  if (f.dataClassified !== true || i.dataClassification === 'Unknown') controls.push('Data classification before AI access');
  if (i.mode === 'ui' && declared === 'Conditional') controls.push('Bounded UI scope', 'Change monitoring');

  const allowedActions = declared === 'Ready' ? [`${i.mode}: ${i.operationName}`] : [];
  const approvalBoundActions = declared === 'Conditional' ? [`${i.mode} with controls: ${i.operationName}`] : [];
  const prohibitedActions = declared === 'Prohibited' ? [`${i.mode}: ${i.operationName}`] : [];
  if (writeFinancialAction) prohibitedActions.push(`autonomous financial action: ${i.operationName}`);
  if (writeHighImpact && f.rollback !== true) prohibitedActions.push(`unapproved high-impact action: ${i.operationName}`);
  const evidenceGaps = Object.entries(f)
    .filter(([key, value]) => value === null && interactionFieldApplicable(i, `interaction.${key}`))
    .map(([key]) => `${key} is unknown`);
  return { interactionId: i.id, readiness, allowedActions: unique(allowedActions), approvalBoundActions: unique(approvalBoundActions), prohibitedActions: unique(prohibitedActions), requiredControls: unique(controls), evidenceGaps, ruleIds: ['INT-014', ...(i.mode === 'ui' ? ['INT-004'] : i.mode === 'event' ? ['INT-011'] : i.mode === 'operational' ? ['INT-009', 'INT-010', 'INT-012'] : ['INT-001']), ...(i.mode === 'write' ? ['INT-002', 'INT-003', ...(writeHighImpact ? ['INT-005', 'INT-007'] : []), ...(writeFinancialAction ? ['INT-006'] : [])] : []), ...((f.dataClassified !== true || i.dataClassification === 'Unknown') ? ['INT-008'] : []), ...(f.untrustedContentWithTools ? ['INT-013'] : [])] };
};

const modernization = (asset: AssessmentCaseV2['assets'][number], interactions: readonly InteractionDecision[]): { assetId: string; dispositions: ModernizationDisposition[]; rationale: string[] } => {
  const lifecycleUnknown = asset.strategicLifespan === 'unknown' || asset.technicalHealth === 'unknown' || asset.businessCriticality === 'unknown' || asset.ownershipModel === 'unknown' || asset.vendorRoadmap === 'unknown' || asset.operatingStability === 'unknown' || !asset.accountableOwner?.trim();
  if (lifecycleUnknown) return { assetId: asset.id, dispositions: ['Retain'], rationale: ['Unknown lifecycle or ownership facts prohibit destructive modernization.'] };
  const related = interactions;
  if (asset.strategicLifespan === 'long' || asset.businessCriticality === 'critical' || asset.vendorRoadmap === 'supportive') {
    const apiPossible = related.some(item => ['Ready', 'Conditional'].includes(item.readiness.read) || ['Ready', 'Conditional'].includes(item.readiness.write));
    return { assetId: asset.id, dispositions: apiPossible ? ['Retain', 'Native Integration'] : ['Retain', 'API Facade'], rationale: ['Strategic, supported, or critical lifecycle facts support retention with a controlled integration boundary.'] };
  }
  if (asset.strategicLifespan === 'short' && asset.technicalHealth === 'end-of-life' && asset.vendorRoadmap === 'end-of-life' && asset.operatingStability === 'unstable' && asset.businessCriticality === 'low') return { assetId: asset.id, dispositions: ['Replace'], rationale: ['Complete lifecycle evidence supports replacement planning; execution remains separately governed.'] };
  if (asset.technicalHealth === 'end-of-life') return { assetId: asset.id, dispositions: ['Replatform'], rationale: ['Complete lifecycle evidence supports a non-agent modernization path.'] };
  if (asset.technicalHealth === 'constrained') return { assetId: asset.id, dispositions: ['Retain', 'API Facade'], rationale: ['Constraints support a facade while preserving the current system.'] };
  return { assetId: asset.id, dispositions: ['Retain'], rationale: ['Lifecycle evidence does not justify destructive modernization.'] };
};

const inferUnit = (value: unknown): FieldInput['unit'] => typeof value === 'boolean' || value === null ? 'boolean' : typeof value === 'number' ? 'ratio' : 'category';
const materialInputs = (c: AssessmentCaseV2): FieldInput[] => [
  ...c.primitives.flatMap(item => [
    { fieldId: 'primitive.type', value: item.type, unit: 'category' as const, contextId: item.id },
    ...(item.businessDisposition ? [{ fieldId: 'primitive.businessDisposition', value: item.businessDisposition, unit: 'category' as const, contextId: item.id }] : []),
    ...Object.values(item.facts).map(fact => ({ fieldId: fact.fieldId, value: fact.value, unit: inferUnit(fact.value), contextId: item.id })),
    ...Object.values(item.agentNecessity ?? c.agentNecessity).map(fact => ({ fieldId: fact.fieldId, value: fact.value, unit: 'boolean' as const, contextId: item.id })),
  ]),
  ...c.interactions.flatMap(item => {
    const values = new Map<string, unknown>([['interaction.mode', item.mode], ...Object.entries(item.facts).map(([key, value]) => [`interaction.${key}`, value] as [string, unknown])]);
    return [{ fieldId: 'interaction.mode', value: item.mode, unit: 'category' as const, contextId: item.id }, ...Object.entries(item.facts).map(([key, value]) => {
      const fieldId = `interaction.${key}`;
      const applicability = FIELD_REGISTRY.find(contract => contract.fieldId === fieldId)?.applicability;
      const applicable = !applicability || values.get(applicability.fieldId) === applicability.equals;
      return { fieldId, value: applicable ? value : null, unit: 'boolean' as const, contextId: item.id, ...(applicability ? { applicable } : {}) };
    })];
  }),
  ...c.assets.flatMap(item => [
    { fieldId: 'asset.strategicLifespan', value: item.strategicLifespan, unit: 'category' as const },
    { fieldId: 'asset.technicalHealth', value: item.technicalHealth, unit: 'category' as const },
    { fieldId: 'asset.businessCriticality', value: item.businessCriticality, unit: 'category' as const },
    { fieldId: 'asset.ownershipModel', value: item.ownershipModel, unit: 'category' as const },
    { fieldId: 'asset.vendorRoadmap', value: item.vendorRoadmap, unit: 'category' as const },
    { fieldId: 'asset.operatingStability', value: item.operatingStability, unit: 'category' as const },
    { fieldId: 'asset.accountableOwner', value: item.accountableOwner, unit: 'text' as const },
  ]),
];

export const validateAssessmentV2 = (c: AssessmentCaseV2): string[] => {
  const errors = [...validateFieldRegistry(), ...validateEvidenceLinks(c.evidence), ...validateDecisionFieldInputs(materialInputs(c))];
  const acceptedEvidenceClaimIds = new Set([...FIELD_REGISTRY.map(item => item.fieldId), ...(c.importedFacts ?? []).map(item => item.fieldId)]);
  const importedV1EvidenceClaimIds = new Set(c.sourceV1?.importedEvidenceClaimIds ?? []);
  const acceptsEvidenceClaim = (claimId: string): boolean => claimId === claimId.trim() && Boolean(
    claimId && (acceptedEvidenceClaimIds.has(claimId) || importedV1EvidenceClaimIds.has(claimId)),
  );
  for (const item of c.evidence) for (const claimId of item.claimIds) if (!acceptsEvidenceClaim(claimId)) {
    errors.push(`${item.id}: evidence claim ${JSON.stringify(claimId)} is not a registered decision field or imported V1 claim.`);
  }
  if (c.schemaVersion !== ASSESS_V2_SCHEMA_VERSION) errors.push('Unsupported Assess V2 schema version.');
  if (c.ruleSetVersion !== ASSESS_V2_RULE_SET_VERSION) errors.push('Unsupported Assess V2 rule-set version.');
  if (!c.organizationId || !c.workspaceId || !c.ownerId || !c.sourceProcessId) errors.push('Organization, workspace, process, and owner ancestry are required.');
  if (!Number.isSafeInteger(c.version) || c.version < 1) errors.push('Case version must be a positive safe integer.');
  if (c.primitives.length < 2) errors.push('At least two meaningful process primitives are required.');
  if (!c.edges.length || !c.decisionPoints.length || !c.exceptionPaths.length || !c.assets.length || !c.interactions.length || !c.evidence.length) errors.push('An edge, decision, exception, application, interaction, and evidence link are required.');
  if (c.primitives.some(item => !item.name.trim() || !item.description.trim())) errors.push('Every primitive requires a meaningful name and description.');
  const duplicate = (label: string, ids: string[]) => { if (new Set(ids).size !== ids.length) errors.push(`${label} IDs must be unique.`); };
  duplicate('Primitive', c.primitives.map(item => item.id)); duplicate('Edge', c.edges.map(item => item.id)); duplicate('Decision', c.decisionPoints.map(item => item.id)); duplicate('Exception', c.exceptionPaths.map(item => item.id)); duplicate('Asset', c.assets.map(item => item.id)); duplicate('Interaction', c.interactions.map(item => item.id)); duplicate('Evidence', c.evidence.map(item => item.id));
  const primitives = new Set(c.primitives.map(item => item.id)); const assets = new Set(c.assets.map(item => item.id)); const evidence = new Set(c.evidence.map(item => item.id));
  for (const edge of c.edges) if (!primitives.has(edge.fromPrimitiveId) || !primitives.has(edge.toPrimitiveId)) errors.push(`${edge.id}: edge references an unknown primitive.`);
  for (const point of c.decisionPoints) if (!primitives.has(point.primitiveId)) errors.push(`${point.id}: decision references an unknown primitive.`);
  for (const path of c.exceptionPaths) if (!primitives.has(path.fromPrimitiveId) || path.resolutionPrimitiveIds.some(id => !primitives.has(id))) errors.push(`${path.id}: exception references an unknown primitive.`);
  for (const interaction of c.interactions) { if (!primitives.has(interaction.primitiveId)) errors.push(`${interaction.id}: interaction references an unknown primitive.`); if (!assets.has(interaction.assetId)) errors.push(`${interaction.id}: interaction references an unknown asset.`); }
  for (const { evidenceIds } of requiredEvidence(c)) for (const evidenceId of evidenceIds) if (!evidence.has(evidenceId)) errors.push(`${evidenceId}: referenced evidence does not exist.`);
  if (c.importedFacts?.some(item => item.source === 'v1-import' && item.status !== 'assumed' && item.status !== 'unknown')) errors.push('Imported V1 facts must be assumptions or unknown.');
  for (const item of c.evidence) if (item.sourceType === 'template' && item.validated) errors.push(`${item.id}: template suggestion cannot be verified.`);

  // Finalization is server-authoritative because buildDecisionVersionV2 invokes this
  // validator on the locked persistence projection. A UI scaffold is useful for
  // authoring, but it is not a meaningful decision until it carries substantive
  // process, lifecycle, interaction, and evidence content.
  const substantiveFact = (fact: CaseFact): boolean => fact.value !== null && fact.status !== 'unknown' && fact.source !== 'template';
  const substantiveLifecycle = (asset: AssessmentCaseV2['assets'][number]): boolean => (
    Boolean(asset.accountableOwner?.trim()) &&
    [asset.strategicLifespan, asset.technicalHealth, asset.businessCriticality, asset.ownershipModel, asset.vendorRoadmap, asset.operatingStability]
      .some(value => value !== 'unknown')
  );
  const requiredInteractionFacts: Record<InteractionMode, (keyof ApplicationInteraction['facts'])[]> = {
    read: ['interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract'],
    write: ['interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract', 'machineIdentity', 'leastPrivilege'],
    event: ['eventSemantics'],
    ui: ['uiStable'],
    operational: ['testEnvironment', 'accountableOwner', 'monitored', 'capacityKnown'],
  };
  const meaningfulDecisionPoint = c.decisionPoints.some(item => (
    item.name.trim().length > 0 && item.ruleDescription.trim().length > 0 &&
    new Set(item.outcomeLabels.map(label => label.trim()).filter(Boolean)).size >= 2
  ));
  const meaningfulExceptionPath = c.exceptionPaths.some(item => (
    item.name.trim().length > 0 && item.trigger.trim().length > 0 && item.resolutionPrimitiveIds.length > 0
  ));
  const meaningfulInteraction = c.interactions.some(item => (
    item.operationName.trim().length > 0 && item.dataClassification !== 'Unknown' &&
    requiredInteractionFacts[item.mode].every(key => item.facts[key] !== null)
  ));
  const meaningfulEvidence = c.evidence.some(item => item.sourceType !== 'template' && item.claimIds.some(acceptsEvidenceClaim));
  if (!c.edges.some(edge => edge.fromPrimitiveId !== edge.toPrimitiveId)) errors.push('A meaningful finalization requires an edge between distinct process primitives.');
  if (!meaningfulDecisionPoint) errors.push('A meaningful finalization requires a decision point with a rule and at least two distinct outcomes.');
  if (!meaningfulExceptionPath) errors.push('A meaningful finalization requires an exception path with a trigger and resolution primitive.');
  if (!c.primitives.some(item => Object.values(item.facts).some(substantiveFact))) errors.push('A meaningful finalization requires at least one substantive non-template process fact.');
  if (!c.assets.some(substantiveLifecycle)) errors.push('A meaningful finalization requires an application lifecycle fact and accountable owner.');
  if (!meaningfulInteraction) errors.push('A meaningful finalization requires declared-mode interaction facts and a data classification.');
  if (!meaningfulEvidence) errors.push('A meaningful finalization requires non-template evidence linked to an exact claim.');
  return unique(errors);
};

const claimLinkedEvidence = (ids: readonly string[], fields: readonly string[], evidence: readonly EvidenceLink[]): string[] => ids.filter(id => evidence.some(link => link.id === id && fields.some(fieldId => link.claimIds.includes(fieldId))));
const agentFieldByRule: Record<string, string> = Object.fromEntries(Object.entries(agentRuleByKey).map(([key, ruleId]) => [ruleId, `agent.${key}`]));
const candidateTrace = (item: CandidateEvaluation, evidence: readonly EvidenceLink[]): RuleTrace[] => item.ruleIds.map(ruleId => {
  const fieldIds = agentFieldByRule[ruleId] ? [agentFieldByRule[ruleId]] : item.fieldIds;
  return { ruleId, subjectId: item.primitiveId, fieldIds, evidenceIds: claimLinkedEvidence(item.evidenceIds, fieldIds, evidence), outcome: `${item.component}: ${item.fit}`, rationale: item.rationale.join(' ') };
});

const interactionRuleFields: Record<string, string[]> = {
  'INT-001': ['interaction.mode', 'interaction.interfaceAvailable', 'interaction.operationCovered', 'interaction.apiDocumented', 'interaction.errorContract'],
  'INT-002': ['interaction.mode', 'interaction.machineIdentity'], 'INT-003': ['interaction.mode', 'interaction.leastPrivilege'],
  'INT-004': ['interaction.mode', 'interaction.uiStable'], 'INT-005': ['interaction.mode', 'interaction.highImpact', 'interaction.auditable'],
  'INT-006': ['interaction.mode', 'interaction.financialAction', 'interaction.idempotent', 'interaction.compensatable'],
  'INT-007': ['interaction.mode', 'interaction.highImpact', 'interaction.rollback'], 'INT-008': ['interaction.dataClassified'],
  'INT-009': ['interaction.mode', 'interaction.testEnvironment'], 'INT-010': ['interaction.mode', 'interaction.accountableOwner'],
  'INT-011': ['interaction.mode', 'interaction.eventSemantics'], 'INT-012': ['interaction.mode', 'interaction.monitored', 'interaction.capacityKnown'],
  'INT-013': ['interaction.untrustedContentWithTools'], 'INT-014': ['interaction.mode'],
};

export const evaluateAssessmentV2 = (c: AssessmentCaseV2): DecisionPackV2 => {
  const errors = validateAssessmentV2(c);
  if (errors.length) throw new Error(`Invalid Assess V2 case: ${errors.join(' ')}`);
  const interactions = c.interactions.map(evaluateInteractionReadiness);
  const candidates = c.primitives.flatMap(primitive => {
    const base = componentMap[primitive.type].map(component => evaluateCandidateFit(primitive, component, c.evidence, c.createdAt));
    return primitive.type === 'Investigate' || primitive.type === 'Decide' ? [...base, evaluateAgentNecessity(primitive.id, primitive.agentNecessity ?? c.agentNecessity, c.evidence, c.createdAt)] : base;
  });
  const composition = c.primitives.map(primitive => {
    const compatible = candidates.filter(item => item.primitiveId === primitive.id && ['Strong Fit', 'Conditional Fit'].includes(item.fit));
    const strongest = compatible.find(item => item.fit === 'Strong Fit') ?? compatible.find(item => item.fit === 'Conditional Fit');
    const eligible: Component[] = strongest ? [strongest.component] : [];
    const owned = c.interactions.filter(item => item.primitiveId === primitive.id);
    if (owned.some(item => ['read', 'write'].includes(item.mode) && ['Ready', 'Conditional'].includes(interactions.find(result => result.interactionId === item.id)?.readiness[item.mode] ?? 'Unknown'))) eligible.push('Native API Integration');
    if (owned.some(item => item.mode === 'ui' && interactions.find(result => result.interactionId === item.id)?.readiness.ui === 'Conditional')) eligible.push('RPA / UI Automation');
    return { primitiveId: primitive.id, ...(primitive.businessDisposition ? { businessDisposition: primitive.businessDisposition } : {}), components: unique(eligible) };
  });
  const confidence = deriveEvidenceConfidence(c);
  const byId = new Map(c.evidence.map(item => [item.id, item]));
  const gaps = unique([
    ...requiredEvidence(c)
      .filter(({ evidenceIds, claimId }) => !evidenceIds.some(evidenceId => verified(byId.get(evidenceId), c.createdAt, claimId)))
      .map(({ evidenceIds, claimId }) => evidenceIds.length
        ? `${evidenceIds.join(', ')} do not provide valid evidence for ${claimId}.`
        : `${claimId} has no claim-linked evidence.`),
    ...interactions.flatMap(item => item.evidenceGaps.map(gap => `${item.interactionId}: ${gap}`)),
  ]);
  const assumptions = unique([...(c.importedFacts ?? []).filter(item => item.status === 'assumed' || item.status === 'suggested').map(item => item.fieldId), ...c.evidence.filter(item => !verified(item, c.createdAt)).map(item => item.id)]);
  const controls = unique(['Human approval for material state changes', 'Segregation of duties', 'Audit', 'Monitoring', 'Rollback / Compensation', ...interactions.flatMap(item => item.requiredControls)]);
  const modernizationResults = c.assets.map(asset => modernization(asset, c.interactions.filter(item => item.assetId === asset.id).map(item => interactions.find(result => result.interactionId === item.id)!)));
  const gateResults = interactions.flatMap(item => modes.map(mode => ({ ruleId: 'INT-014', subjectId: item.interactionId, status: item.readiness[mode] === 'Ready' ? 'pass' as const : item.readiness[mode] === 'Conditional' ? 'conditional' as const : item.readiness[mode] === 'Prohibited' ? 'fail' as const : item.readiness[mode] === 'Not Applicable' ? 'not-applicable' as const : 'unknown' as const, reason: `${mode} readiness is ${item.readiness[mode]}.` })));
  const compositionTrace: RuleTrace[] = composition.flatMap(item => item.components.map(component => {
    const selected = candidates.find(candidate => candidate.primitiveId === item.primitiveId && candidate.component === component);
    const fields = selected?.fieldIds ?? ['primitive.type'];
    return { ruleId: 'COMPOSE-001', subjectId: item.primitiveId, fieldIds: fields, evidenceIds: selected ? claimLinkedEvidence(selected.evidenceIds, fields, c.evidence) : [], outcome: `Selected ${component}`, rationale: 'Selected the first compatible least-complex component for this primitive; non-selected candidates remain alternatives.' };
  }));
  const trace: RuleTrace[] = [
    ...candidates.flatMap(item => candidateTrace(item, c.evidence)),
    ...compositionTrace,
    ...interactions.flatMap(item => item.ruleIds.map(ruleId => { const source = c.interactions.find(candidate => candidate.id === item.interactionId)!; const fields = interactionRuleFields[ruleId]; return { ruleId, subjectId: item.interactionId, fieldIds: fields, evidenceIds: claimLinkedEvidence(source.evidenceIds, fields, c.evidence), outcome: `${fields.map(fieldId => `${fieldId}=${String(fieldId === 'interaction.mode' ? source.mode : source.facts[fieldId.slice('interaction.'.length) as keyof typeof source.facts])}`).join(', ')} => ${item.readiness[source.mode]}`, rationale: `${ruleId} was applicable to the declared ${source.mode} interaction.` }; })),
    ...modernizationResults.map(item => {
      const fieldIds = ['asset.strategicLifespan', 'asset.technicalHealth', 'asset.businessCriticality', 'asset.ownershipModel', 'asset.vendorRoadmap', 'asset.operatingStability', 'asset.accountableOwner'];
      const asset = c.assets.find(candidate => candidate.id === item.assetId)!;
      return { ruleId: 'MOD-001', subjectId: item.assetId, fieldIds, evidenceIds: claimLinkedEvidence(asset.evidenceIds, fieldIds, c.evidence), outcome: item.dispositions.join(' + '), rationale: item.rationale.join(' ') };
    }),
    { ruleId: 'EVID-001', subjectId: c.id, fieldIds: ['evidence.coverage'], evidenceIds: c.evidence.map(item => item.id), outcome: confidence, rationale: 'Confidence is derived from exact claim-linked evidence and does not add technical fit.' },
  ];
  if (trace.some(item => !item.fieldIds.length || !item.subjectId || !item.ruleId)) throw new Error('Decision trace must identify rules, subjects, and fields.');
  return {
    schemaVersion: ASSESS_V2_SCHEMA_VERSION,
    ruleSetVersion: ASSESS_V2_RULE_SET_VERSION,
    decisionVersion: ASSESS_V2_DECISION_VERSION,
    caseId: c.id,
    caseVersion: c.version,
    validationStatus: 'reviewer-ready',
    executiveDecision: 'Use a controlled hybrid operating model mapped to process primitives and eligible components.',
    assessmentBoundary: `Process ${c.sourceProcessId} in workspace ${c.workspaceId}.`,
    confidence,
    processReadiness: confidence === 'Insufficient Evidence' ? 'Insufficient evidence' : gaps.length || confidence !== 'Verified' ? 'Provisional' : 'Ready for controlled design',
    candidateEvaluations: candidates,
    gateResults,
    composedOperatingModel: composition,
    interactionDecisions: interactions,
    modernization: modernizationResults,
    controlRequirements: interactions.flatMap(item => item.requiredControls.map((control, index) => ({ id: `${item.interactionId}-control-${index + 1}`, subjectId: item.interactionId, control: (control === 'Human approval' ? 'Human Approval' : control === 'Rollback or documented compensation' ? 'Rollback / Compensation' : control === 'Audit correlation' ? 'Audit' : 'Monitoring') as Component, required: true, rationale: control, ruleIds: item.ruleIds }))),
    controls,
    evidenceGaps: gaps,
    assumptions,
    alternativesConsidered: ['Human-led operation', 'Rules and workflow without bounded agency', 'GenAI assistance without tool autonomy', 'Temporary UI automation for unsupported operations'],
    openRemediationActions: gaps.map(gap => `Resolve evidence gap: ${gap}`),
    whatWouldChangeDecision: ['Validated contradictory evidence', 'Loss of accountable application ownership or least-privilege authorization', 'Evidence that deterministic rules and workflow cannot address the ambiguity', 'A verified supported interface that removes a temporary UI automation need'],
    trace,
    nonClaims: ['Not scientifically validated', 'Not production calibrated', 'No guaranteed ROI', 'No deployment, pilot, production, security, compliance, or buyer-acceptance readiness claim', 'No V2 approval or Studio handoff is authorized'],
  };
};

export const registeredDecisionFieldIds = (): ReadonlySet<string> => new Set(FIELD_REGISTRY.map(item => item.fieldId));
