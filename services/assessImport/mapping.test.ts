import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../assessV2/fixture.ts';
import type { AssessMappingTargetDescriptor } from './contracts.ts';
import { blankAgentFactsForMapping, canonicalAssessMappingValue, effectiveAssessMappingProposalValue, materializeAssessMappingSelection, validateAssessMappingValue } from './mapping.ts';
import type { AssessMappingDraft } from './targetRegistry.ts';
import { parseAssessV2DraftPayload } from '../../supabase/functions/_shared/assessV2Command.ts';

const ids = { catalog: '91000000-0000-4000-8000-000000000001', selector: '91000000-0000-4000-8000-000000000002', evidence: '91000000-0000-4000-8000-000000000003' };
const draft = (): AssessMappingDraft => ({ caseId: AP_INVOICE_EXCEPTION_V2_FIXTURE.id, name: 'Case', description: 'Manual description',
  primitives: structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.slice(0, 2)), edges: [], decisionPoints: [], exceptionPaths: [],
  applicationAssets: structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.assets), interactions: structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions.slice(0, 1)),
  evidenceLinks: [], agentNecessity: structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE.agentNecessity), candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [] });
const target = (overrides: Partial<AssessMappingTargetDescriptor>): AssessMappingTargetDescriptor => ({ selectorId: ids.selector, catalogId: ids.catalog,
  caseId: AP_INVOICE_EXCEPTION_V2_FIXTURE.id, caseVersion: 1, assessSchemaVersion: 'assess-v2-schema-2026-07', targetKind: 'case_field', operation: 'set_field',
  fieldId: 'case.description', label: 'Description', contextLabel: 'Case', valueType: 'text', currentValue: 'Manual description', currentValueHash: 'a'.repeat(64), manual: true, ...overrides });
let sequence = 10;
const apply = (mappingTarget: AssessMappingTargetDescriptor, value: never, input = draft()) => materializeAssessMappingSelection({ draft: input, target: mappingTarget, value,
  evidenceId: ids.evidence, claimId: mappingTarget.fieldId, createId: () => `92000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}` });
const assertNativeDraft = (value: AssessMappingDraft) => assert.doesNotThrow(() => parseAssessV2DraftPayload({
  caseId: value.caseId, name: value.name, description: value.description, primitives: value.primitives, edges: value.edges,
  decisionPoints: value.decisionPoints, exceptionPaths: value.exceptionPaths, applicationAssets: value.applicationAssets,
  interactions: value.interactions, evidenceLinks: value.evidenceLinks, agentNecessity: value.agentNecessity,
  candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
}));

test('canonical JSON is stable, finite and rejects invalid typed values', () => {
  assert.equal(canonicalAssessMappingValue({ b: 1, a: ['x', true] }), '{"a":["x",true],"b":1}');
  assert.equal(validateAssessMappingValue(target({ valueType: 'ratio' }), 0.25), true);
  assert.equal(validateAssessMappingValue(target({ valueType: 'ratio' }), 2), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'number' }), 10_000_000), true);
  assert.equal(validateAssessMappingValue(target({ valueType: 'number' }), Number.NaN), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'text_list' }), ['a', 'b']), true);
  assert.equal(validateAssessMappingValue(target({ valueType: 'text_list' }), Array(201).fill('x')), false);
  assert.equal(validateAssessMappingValue(target({ fieldId: 'case.name', valueType: 'text' }), 'x'.repeat(200)), true);
  assert.equal(validateAssessMappingValue(target({ fieldId: 'case.name', valueType: 'text' }), 'x'.repeat(201)), false);
  assert.equal(validateAssessMappingValue(target({ fieldId: 'primitive.trigger', valueType: 'text' }), 'x'.repeat(500)), true);
  assert.equal(validateAssessMappingValue(target({ fieldId: 'primitive.trigger', valueType: 'text' }), 'x'.repeat(501)), false);
});

test('every finite scalar and constructor value contract accepts only its native shape', () => {
  const valid: Array<[AssessMappingTargetDescriptor['valueType'], unknown]> = [
    ['boolean', true], ['primitive_type', 'Capture'], ['business_disposition', 'Simplify'], ['interaction_mode', 'read'],
    ['data_classification', 'Internal'], ['asset_strategic_lifespan', 'long'], ['asset_technical_health', 'healthy'],
    ['asset_business_criticality', 'critical'], ['asset_ownership_model', 'shared'], ['asset_vendor_roadmap', 'supportive'],
    ['asset_operating_stability', 'stable'], ['evidence', null],
    ['primitive_constructor', { name: 'Capture', description: 'Description', trigger: 'start', inputs: ['a'], outputs: ['b'], owner: 'owner', rules: ['rule'] }],
    ['asset_constructor', { name: 'ERP', accountableOwner: 'owner' }],
    ['interaction_constructor', { operationName: 'Write', mode: 'write', dataClassification: 'Restricted', highImpact: true, financialAction: true, untrustedContentWithTools: false }],
    ['decision_constructor', { name: 'Route', ruleDescription: 'If valid', outcomeLabels: ['yes'] }],
    ['exception_constructor', { name: 'Reject', trigger: 'Invalid' }],
  ];
  for (const [valueType, value] of valid) assert.equal(validateAssessMappingValue(target({ valueType, ...(valueType === 'primitive_constructor' ? { allowedValues: ['Capture'] } : { allowedValues: undefined }) }), value), true, valueType);
  for (const [valueType] of valid.filter(([kind]) => !['evidence', 'primitive_constructor', 'asset_constructor', 'interaction_constructor', 'decision_constructor', 'exception_constructor'].includes(kind))) {
    assert.equal(validateAssessMappingValue(target({ valueType }), '__invalid__'), false, valueType);
  }
  assert.equal(validateAssessMappingValue(target({ valueType: 'primitive_type', allowedValues: ['Capture'] }), 'Extract'), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'primitive_constructor', allowedValues: ['Capture'] }), { name: 'x', description: 'x', extra: true }), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'asset_constructor' }), { name: 'x', accountableOwner: 4 }), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'decision_constructor' }), { name: 'x', ruleDescription: 'x', outcomeLabels: 'yes' }), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'exception_constructor' }), { name: 'x' }), false);
  assert.equal(blankAgentFactsForMapping().controllable.value, null);
  assert.equal(effectiveAssessMappingProposalValue({ effectiveValue: 'edited' } as never), 'edited');
});

test('case, primitive, primitive fact, agent fact, asset and interaction updates preserve provenance', () => {
  let value = apply(target({}), 'Mapped description' as never);
  assert.equal(value.description, 'Mapped description'); assert.equal(value.evidenceLinks[0].validated, false);
  const primitive = value.primitives[0];
  value = apply(target({ targetKind: 'primitive_field', entityId: primitive.id, fieldId: 'primitive.manualEffort', valueType: 'number', currentValue: null }), 12 as never, value);
  assert.equal(value.primitives[0].manualEffort, 12); assert.ok(value.primitives[0].evidenceIds.includes(ids.evidence));
  const factKey = Object.keys(value.primitives[0].facts)[0];
  value = apply(target({ targetKind: 'primitive_fact', operation: 'set_fact', entityId: primitive.id, fieldId: factKey, valueType: 'boolean', currentValue: true }), false as never, value);
  assert.deepEqual(value.primitives[0].facts[factKey].evidenceIds.includes(ids.evidence), true);
  delete value.primitives[0].facts[factKey];
  value = apply(target({ targetKind: 'primitive_fact', operation: 'set_fact', entityId: primitive.id, fieldId: 'primitive.rulesStable', valueType: 'boolean', currentValue: null, manual: false }), true as never, value);
  assert.deepEqual(value.primitives[0].facts['primitive.rulesStable'], { fieldId: 'primitive.rulesStable', value: true, status: 'suggested', source: 'system', evidenceIds: [ids.evidence] });
  value = apply(target({ targetKind: 'agent_fact', operation: 'set_fact', fieldId: 'agent.controllable', valueType: 'boolean', currentValue: true }), false as never, value);
  assert.ok(value.agentNecessity.controllable.evidenceIds.includes(ids.evidence));
  value = apply(target({ targetKind: 'asset_field', entityId: value.applicationAssets[0].id, fieldId: 'asset.accountableOwner', valueType: 'text', currentValue: 'old' }), 'new owner' as never, value);
  assert.ok(value.applicationAssets[0].evidenceIds.includes(ids.evidence));
  value = apply(target({ targetKind: 'interaction_field', entityId: value.interactions[0].id, fieldId: 'interaction.operationName', valueType: 'text', currentValue: 'old' }), 'Read current data' as never, value);
  value = apply(target({ targetKind: 'interaction_fact', operation: 'set_fact', entityId: value.interactions[0].id, fieldId: 'interaction.dataQuality', valueType: 'boolean', currentValue: true }), false as never, value);
  assert.equal(value.interactions[0].facts.dataQuality, false); assert.ok(value.interactions[0].evidenceIds.includes(ids.evidence));
  assertNativeDraft(value);
});

test('bare primitive fact aliases become canonical without losing source, status or evidence', () => {
  const value = draft();
  const primitive = value.primitives[0];
  primitive.facts.ambiguityCharacterized = {
    fieldId: 'ambiguityCharacterized', value: false, status: 'known', source: 'user', evidenceIds: ['93000000-0000-4000-8000-000000000001'],
  };
  const mapped = apply(target({ targetKind: 'primitive_fact', operation: 'set_fact', entityId: primitive.id,
    fieldId: 'primitive.ambiguityCharacterized', valueType: 'boolean', currentValue: false }), true as never, value);
  assert.equal(mapped.primitives[0].facts.ambiguityCharacterized, undefined);
  assert.deepEqual(mapped.primitives[0].facts['primitive.ambiguityCharacterized'], {
    fieldId: 'primitive.ambiguityCharacterized', value: true, status: 'known', source: 'user',
    evidenceIds: [ids.evidence, '93000000-0000-4000-8000-000000000001'].sort(),
  });
});

test('duplicate bare and canonical primitive fact aliases fail closed', () => {
  const value = draft();
  const primitive = value.primitives[0];
  primitive.facts.ambiguityCharacterized = { fieldId: 'ambiguityCharacterized', value: false, status: 'suggested', source: 'user', evidenceIds: [] };
  primitive.facts['primitive.ambiguityCharacterized'] = { fieldId: 'primitive.ambiguityCharacterized', value: false, status: 'suggested', source: 'user', evidenceIds: [] };
  assert.throws(() => apply(target({ targetKind: 'primitive_fact', operation: 'set_fact', entityId: primitive.id,
    fieldId: 'primitive.ambiguityCharacterized', valueType: 'boolean', currentValue: false }), true as never, value), /FACT_ALIAS_AMBIGUOUS/);
});

test('safe constructors produce complete native objects with server IDs and evidence', () => {
  let value = draft(); const primitiveId = value.primitives[0].id; const assetId = value.applicationAssets[0].id;
  value = apply(target({ targetKind: 'create_primitive', operation: 'create_entity', fieldId: 'create.primitive:Capture', valueType: 'primitive_constructor', allowedValues: ['Capture'], currentValue: null, manual: false }), { name: 'Intake', description: 'Capture request' } as never, value);
  assert.equal(value.primitives.at(-1)?.type, 'Capture'); assert.deepEqual(value.primitives.at(-1)?.facts, {});
  value = apply(target({ targetKind: 'create_asset', operation: 'create_entity', fieldId: 'create.asset', valueType: 'asset_constructor', currentValue: null, manual: false }), { name: 'CRM' } as never, value);
  assert.equal(value.applicationAssets.at(-1)?.technicalHealth, 'unknown');
  value = apply(target({ targetKind: 'create_interaction', operation: 'create_entity', entityId: assetId, fieldId: `create.interaction:${assetId}:${primitiveId}`, valueType: 'interaction_constructor', currentValue: null, manual: false }), { operationName: 'Post payment', mode: 'write', dataClassification: 'Restricted', highImpact: true, financialAction: true, untrustedContentWithTools: false } as never, value);
  assert.equal(value.interactions.at(-1)?.facts.highImpact, true); assert.equal(value.interactions.at(-1)?.facts.financialAction, true);
  value = apply(target({ targetKind: 'create_decision_point', operation: 'create_entity', entityId: primitiveId, fieldId: `create.decision:${primitiveId}`, valueType: 'decision_constructor', currentValue: null, manual: false }), { name: 'Decision', ruleDescription: 'A rule', outcomeLabels: ['yes', 'no'] } as never, value);
  value = apply(target({ targetKind: 'create_exception_path', operation: 'create_entity', entityId: primitiveId, fieldId: `create.exception:${primitiveId}`, valueType: 'exception_constructor', currentValue: null, manual: false }), { name: 'Exception', trigger: 'Invalid input' } as never, value);
  assert.equal(value.decisionPoints.length, 1); assert.equal(value.exceptionPaths.length, 1);
  assertNativeDraft(value);
});

test('stale, arbitrary and overlong constructor targets fail closed', () => {
  assert.throws(() => apply(target({ targetKind: 'primitive_field', entityId: crypto.randomUUID(), fieldId: 'primitive.name' }), 'x' as never), /STALE/);
  assert.throws(() => apply(target({ targetKind: 'evidence_only', operation: 'link_evidence', fieldId: 'evidence.unresolved', valueType: 'evidence' }), null as never), /TARGET|VALUE/);
  assert.equal(validateAssessMappingValue(target({ valueType: 'primitive_constructor' }), { name: 'x'.repeat(201), description: 'x' }), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'interaction_constructor' }), { operationName: 'x', mode: 'invalid', dataClassification: 'Internal' }), false);
  assert.equal(validateAssessMappingValue(target({ valueType: 'interaction_constructor' }), { operationName: 'x', mode: 'read', dataClassification: 'Internal' }), false);
  assert.throws(() => apply(target({ targetKind: 'agent_fact', operation: 'set_fact', fieldId: 'agent.unknown', valueType: 'boolean' }), true as never), /STALE/);
  assert.throws(() => apply(target({ targetKind: 'asset_field', entityId: crypto.randomUUID(), fieldId: 'asset.name' }), 'x' as never), /STALE/);
  assert.throws(() => apply(target({ targetKind: 'interaction_field', entityId: crypto.randomUUID(), fieldId: 'interaction.operationName' }), 'x' as never), /STALE/);
  assert.throws(() => apply(target({ targetKind: 'create_interaction', operation: 'create_entity', fieldId: 'create.interaction:bad', valueType: 'interaction_constructor' }), { operationName: 'x', mode: 'read', dataClassification: 'Internal', highImpact: false, financialAction: false, untrustedContentWithTools: false } as never), /TARGET/);
  assert.throws(() => apply(target({ targetKind: 'create_decision_point', operation: 'create_entity', entityId: crypto.randomUUID(), fieldId: 'create.decision:bad', valueType: 'decision_constructor' }), { name: 'x', ruleDescription: 'x', outcomeLabels: ['x'] } as never), /STALE/);
  assert.throws(() => apply(target({ targetKind: 'create_exception_path', operation: 'create_entity', entityId: crypto.randomUUID(), fieldId: 'create.exception:bad', valueType: 'exception_constructor' }), { name: 'x', trigger: 'x' } as never), /STALE/);
});
