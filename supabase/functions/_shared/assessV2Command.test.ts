import assert from 'node:assert/strict';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE, ASSESS_V2_CAPABILITIES, AssessmentCaseV2 } from '../../../services/assessV2/index.ts';
import { CANONICAL_AP_ASSESSMENT } from '../../../data/mockData.ts';
import type { Assessment } from '../../../types.ts';
import { ASSESS_V1_SCORE_VERSION, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION } from '../../../services/assessV1Compatibility.ts';
import { AssessV2AtomicCommand, AssessV2Dependencies, AssessV2Envelope, AssessV2Error, asAssessV2Error, assessV2ErrorBody, parseAssessV2DraftPayload, parseAssessV2Envelope } from './assessV2Command.ts';
import { executeAssessV2Command } from './assessV2Handlers.ts';
import { handleAssessV2Request } from './assessV2Router.ts';
import { assessV2RpcFailureCode, buildAssessV2RpcBody } from './assessV2Db.ts';

const org = '11111111-1111-4111-8111-111111111111';
const workspace = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const caseId = '44444444-4444-4444-8444-444444444444';
const processId = '55555555-5555-4555-8555-555555555555';
const base = { requestId: '66666666-6666-4666-8666-666666666666', idempotencyKey: 'idem-v2-0001', commandType: 'assessment_v2.create', organizationId: org, workspaceId: workspace, authorizationVersion: 7, payload: { caseId, processId, name: 'Case', description: '' } } satisfies AssessV2Envelope;
const stored: AssessmentCaseV2 = { ...structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE), id: caseId, organizationId: org, workspaceId: workspace, sourceProcessId: processId, ownerId: actor, version: 2 };
const frozenV1: Assessment = {
  ...structuredClone(CANONICAL_AP_ASSESSMENT), id: processId, processId, orgId: org, workspaceId: workspace,
  status: 'Approved', scoreVersion: ASSESS_V1_SCORE_VERSION,
  scores: { ...structuredClone(CANONICAL_AP_ASSESSMENT.scores!), scoreVersion: ASSESS_V1_SCORE_VERSION },
};
const commands: AssessV2AtomicCommand[] = [];
const deps = (): AssessV2Dependencies => ({ authenticate: async () => ({ id: actor }), loadFreshAuthority: async () => ({ actorId: actor, organizationId: org, workspaceId: workspace, authorizationVersion: 7, capabilities: Object.values(ASSESS_V2_CAPABILITIES) }), loadFrozenV1AssessmentForClone: async () => frozenV1, loadLockedCaseForFinalize: async () => stored, executeAtomicCommand: async command => { commands.push(command); return { outcome: 'committed', resource: { id: caseId, status: 'draft', version: 1 } }; } });
const req = (body: unknown) => new Request('http://local/assess-v2-command', { method: 'POST', body: JSON.stringify(body) });

const authoring = {
  caseId,
  name: 'AP invoice exception',
  description: 'Canonical authoring payload',
  primitives: stored.primitives,
  edges: stored.edges,
  decisionPoints: stored.decisionPoints,
  exceptionPaths: stored.exceptionPaths,
  applicationAssets: stored.assets,
  interactions: stored.interactions,
  evidenceLinks: stored.evidence,
  agentNecessity: stored.agentNecessity,
  candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
};

const jsonRoundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const main = async () => {
  const parsedAuthoring = parseAssessV2DraftPayload(authoring);
  assert.deepEqual(jsonRoundTrip(parsedAuthoring.primitives), jsonRoundTrip(stored.primitives));
  assert.deepEqual(parsedAuthoring.assets, stored.assets);
  assert.deepEqual(parsedAuthoring.interactions, stored.interactions);
  assert.deepEqual(parsedAuthoring.evidence, stored.evidence);
  assert.deepEqual(parsedAuthoring.agentNecessity, stored.agentNecessity);
  const nestedUnknowns = [
    { ...authoring, unknown: true },
    { ...authoring, primitives: [{ ...authoring.primitives[0], unknown: true }, ...authoring.primitives.slice(1)] },
    { ...authoring, primitives: [{ ...authoring.primitives[0], facts: { ...authoring.primitives[0].facts, [Object.keys(authoring.primitives[0].facts)[0]]: { ...Object.values(authoring.primitives[0].facts)[0], unknown: true } } }, ...authoring.primitives.slice(1)] },
    { ...authoring, applicationAssets: [{ ...authoring.applicationAssets[0], unknown: true }] },
    { ...authoring, interactions: [{ ...authoring.interactions[0], facts: { ...authoring.interactions[0].facts, unknown: true } }, ...authoring.interactions.slice(1)] },
    { ...authoring, evidenceLinks: [{ ...authoring.evidenceLinks[0], unknown: true }, ...authoring.evidenceLinks.slice(1)] },
  ];
  for (const payload of nestedUnknowns) assert.throws(() => parseAssessV2DraftPayload(payload as never), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, interactions: [{ ...authoring.interactions[0], facts: { ...authoring.interactions[0].facts, capacityKnown: undefined } }, ...authoring.interactions.slice(1)] }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, evidenceLinks: [{ ...authoring.evidenceLinks[0], sourceType: 'template', status: 'validated', validated: true }, ...authoring.evidenceLinks.slice(1)] }), /INVALID_COMMAND/);
  const firstPrimitive = authoring.primitives[0];
  const firstFactKey = Object.keys(firstPrimitive.facts)[0];
  const firstFact = Object.values(firstPrimitive.facts)[0];
  const invalidFacts = [
    { ...firstFact, status: 'unknown', value: true },
    { ...firstFact, source: 'template', status: 'known' },
    { ...firstFact, source: 'v1-import', status: 'known' },
    { ...firstFact, value: Number.NaN },
  ];
  for (const fact of invalidFacts) assert.throws(() => parseAssessV2DraftPayload({ ...authoring, primitives: [{ ...firstPrimitive, facts: { ...firstPrimitive.facts, [firstFactKey]: fact } }, ...authoring.primitives.slice(1)] }), /INVALID_COMMAND/);
  for (const evidence of [
    { ...authoring.evidenceLinks[0], status: 'submitted', validated: true },
    { ...authoring.evidenceLinks[0], status: 'validated', validated: true, owner: '', claimIds: [] },
    { ...authoring.evidenceLinks[0], capturedAt: 'not-a-date' },
    { ...authoring.evidenceLinks[0], validUntil: 'not-a-date' },
  ]) assert.throws(() => parseAssessV2DraftPayload({ ...authoring, evidenceLinks: [evidence, ...authoring.evidenceLinks.slice(1)] }), /INVALID_COMMAND/);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, primitives: [{ ...firstPrimitive, facts: { ...firstPrimitive.facts, [firstFactKey]: { ...firstFact, value: cyclic } } }, ...authoring.primitives.slice(1)] }), /INVALID_COMMAND/);
  assert.equal(assessV2RpcFailureCode({ message: 'PR1D_VERSION_CONFLICT' }), 'VERSION_CONFLICT');
  assert.equal(assessV2RpcFailureCode({ details: 'stale finalize load: PR1D_VERSION_CONFLICT' }), 'VERSION_CONFLICT');
  assert.equal(assessV2RpcFailureCode({ message: 'database unavailable' }), null);
  assert.equal(assessV2RpcFailureCode({ message: 'PR1D_READ_ONLY' }), null);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, primitives: Array.from({ length: 201 }, () => firstPrimitive) }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, primitives: [{ ...firstPrimitive, facts: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`primitive.test${index}`, firstFact])) }, ...authoring.primitives.slice(1)] }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, primitives: [{ ...firstPrimitive, facts: { ...firstPrimitive.facts, wrongKey: firstFact } }, ...authoring.primitives.slice(1)] }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, interactions: [{ ...authoring.interactions[0], facts: { ...authoring.interactions[0].facts, highImpact: null } }, ...authoring.interactions.slice(1)] }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2DraftPayload({ ...authoring, evidenceLinks: [{ ...authoring.evidenceLinks[0], validated: 'yes' }, ...authoring.evidenceLinks.slice(1)] }), /INVALID_COMMAND/);

  const created = await executeAssessV2Command(req(base), parseAssessV2Envelope(base), deps());
  assert.equal(created.outcome, 'committed'); assert.equal(commands[0].actorId, actor);
  const clone = { ...base, commandType: 'assessment_v2.clone_from_v1', payload: { caseId, sourceAssessmentId: processId, name: 'Clone', description: '' } } as AssessV2Envelope;
  assert.equal(parseAssessV2Envelope(clone).payload.sourceAssessmentId, processId);
  const validClone = deps();
  let executedClone: AssessV2AtomicCommand | undefined;
  validClone.executeAtomicCommand = async command => {
    executedClone = command;
    const projection = command.serverCloneProjection!;
    return { outcome: 'committed', resource: { id: command.payload.caseId, status: 'draft', version: 1, cloneContractVersion: projection.contractVersion, importedFactCount: projection.importedFactCount, importedEvidenceCount: projection.importedEvidenceCount } };
  };
  assert.equal((await executeAssessV2Command(req(clone), parseAssessV2Envelope(clone), validClone)).resource.cloneContractVersion, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION);
  const projection = executedClone?.serverCloneProjection;
  assert.equal(projection?.contractVersion, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION);
  assert.equal(projection?.sourceAssessmentId, processId);
  assert.equal(projection?.sourceProcessId, processId);
  assert.equal(projection?.sourceV1.scoreVersion, ASSESS_V1_SCORE_VERSION);
  assert.ok(projection?.importedFacts.length);
  assert.ok(projection?.evidence.every(item => /^[0-9a-f-]{36}$/.test(item.id) && item.validated === false));
  assert.deepEqual(Object.values(projection!.agentNecessity).map(fact => [fact.status, fact.value]), Array.from({ length: 5 }, () => ['unknown', null]));
  const rpc = buildAssessV2RpcBody(executedClone!) as Record<string, unknown>;
  assert.equal(rpc.p_source_assessment_id, processId);
  assert.equal(rpc.p_source_process_id, processId);
  assert.deepEqual(rpc.p_imported_facts, projection?.importedFacts);
  assert.deepEqual(rpc.p_imported_evidence, projection?.evidence);
  assert.deepEqual(rpc.p_agent_necessity, projection?.agentNecessity);
  assert.equal((rpc as Record<string, unknown>).serverCloneProjection, undefined);
  for (const resource of [
    { id: caseId, status: 'draft', version: 1, importedFactCount: projection!.importedFactCount, importedEvidenceCount: projection!.importedEvidenceCount },
    { id: caseId, status: 'draft', version: 1, cloneContractVersion: 'wrong-contract', importedFactCount: projection!.importedFactCount, importedEvidenceCount: projection!.importedEvidenceCount },
    { id: caseId, status: 'draft', version: 1, cloneContractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, importedFactCount: projection!.importedFactCount },
    { id: caseId, status: 'draft', version: 1, cloneContractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, importedFactCount: 12.5, importedEvidenceCount: 1 },
  ]) {
    const invalidClone = deps(); invalidClone.executeAtomicCommand = async () => ({ outcome: 'committed', resource });
    await assert.rejects(() => executeAssessV2Command(req(clone), parseAssessV2Envelope(clone), invalidClone), (error: unknown) => error instanceof AssessV2Error && error.code === 'COMMAND_UNAVAILABLE');
  }
  for (const source of [
    null,
    { ...frozenV1, orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    { ...frozenV1, workspaceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { ...frozenV1, scoreVersion: 'wrong-version', scores: undefined },
  ]) {
    const unavailable = deps(); unavailable.loadFrozenV1AssessmentForClone = async () => source;
    await assert.rejects(() => executeAssessV2Command(req(clone), parseAssessV2Envelope(clone), unavailable), (error: unknown) => error instanceof AssessV2Error && error.code === 'RESOURCE_NOT_AVAILABLE');
  }
  assert.throws(() => parseAssessV2Envelope({ ...clone, payload: { ...clone.payload, importedFacts: [{ forged: true }] } }), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  assert.throws(() => buildAssessV2RpcBody({ ...executedClone!, serverCloneProjection: { ...projection!, sourceAssessmentId: actor } }), (error: unknown) => error instanceof AssessV2Error && error.code === 'COMMAND_UNAVAILABLE');

  assert.throws(() => parseAssessV2Envelope({ ...base, commandType: 'unsupported.command' }), (error: unknown) => error instanceof AssessV2Error && error.code === 'COMMAND_NOT_SUPPORTED');
  assert.throws(() => parseAssessV2Envelope({ ...base, commandType: 7 }), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  assert.throws(() => parseAssessV2Envelope({ ...base, authorizationVersion: 0 }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2Envelope({ ...base, idempotencyKey: 'short' }), /INVALID_COMMAND/);
  assert.throws(() => parseAssessV2Envelope(null), /INVALID_COMMAND/);
  const knownError = new AssessV2Error('VERSION_CONFLICT');
  assert.equal(knownError.status, 409);
  assert.equal(asAssessV2Error(knownError), knownError);
  assert.equal(asAssessV2Error(new Error('raw')).code, 'COMMAND_UNAVAILABLE');
  assert.deepEqual(assessV2ErrorBody(knownError), { ok: false, error: { code: 'VERSION_CONFLICT', message: 'The command could not be completed.' } });
  const finalize = { ...base, commandType: 'assessment_v2.finalize', expectedVersion: 2, payload: { caseId } } satisfies AssessV2Envelope;
  assert.throws(() => parseAssessV2Envelope({ ...finalize, expectedVersion: undefined }), /INVALID_COMMAND/);
  for (const payload of [{ caseId, decision: {} }, { caseId, inputHash: 'caller' }, { caseId, outputSnapshot: {} }, { caseId, validationStatus: 'reviewer-ready' }]) assert.throws(() => parseAssessV2Envelope({ ...finalize, payload }), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  const draft = { ...base, commandType: 'assessment_v2.draft.upsert', expectedVersion: 2, payload: authoring } as AssessV2Envelope;
  const parsedDraft = parseAssessV2Envelope(draft);
  assert.equal((parsedDraft.payload.primitives as unknown[]).length, stored.primitives.length);
  assert.throws(() => parseAssessV2Envelope({ ...draft, payload: { ...authoring, candidateEvaluations: [{ forged: true }] } }), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  commands.length = 0;
  await executeAssessV2Command(req(finalize), parseAssessV2Envelope(finalize), deps());
  const decision = commands[0].serverDecision!;
  assert.equal(decision.caseId, caseId); assert.equal(decision.sourceCaseVersion, 2);
  assert.match(decision.inputHash, /^[0-9a-f]{64}$/); assert.match(decision.evidenceHash, /^[0-9a-f]{64}$/); assert.match(decision.outputHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(decision.inputCanonical).payload.interactions[0].facts.capacityKnown, true);
  assert.ok(decision.outputSnapshot.trace.every(item => item.fieldIds.length));
  assert.equal((commands[0].payload as Record<string, unknown>).decision, undefined);

  assert.throws(() => parseAssessV2Envelope({ ...base, actorId: actor }), (error: unknown) => error instanceof AssessV2Error && error.code === 'INVALID_COMMAND');
  const denied = deps(); denied.loadFreshAuthority = async () => null;
  await assert.rejects(() => executeAssessV2Command(req(base), parseAssessV2Envelope(base), denied), (error: unknown) => error instanceof AssessV2Error && error.code === 'RESOURCE_NOT_AVAILABLE');
  const raw = deps(); raw.executeAtomicCommand = async () => { throw new Error('secret database detail'); };
  const response = await handleAssessV2Request(req(base), raw); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret|database detail/);
  assert.equal((await handleAssessV2Request(new Request('http://local/assess-v2-command', { method: 'GET' }), deps())).status, 405);
  assert.equal((await handleAssessV2Request(new Request('http://local/assess-v2-command', { method: 'POST', body: '{' }), deps())).status, 400);
  assert.equal((await handleAssessV2Request(req(base), deps())).status, 200);
  const unauthenticated = deps(); unauthenticated.authenticate = async () => { throw new Error('invalid token'); };
  await assert.rejects(() => executeAssessV2Command(req(base), parseAssessV2Envelope(base), unauthenticated), (error: unknown) => error instanceof AssessV2Error && error.code === 'AUTHENTICATION_REQUIRED');
  const stale = deps(); stale.loadFreshAuthority = async () => ({ actorId: actor, organizationId: org, workspaceId: workspace, authorizationVersion: 8, capabilities: Object.values(ASSESS_V2_CAPABILITIES) });
  await assert.rejects(() => executeAssessV2Command(req(base), parseAssessV2Envelope(base), stale), (error: unknown) => error instanceof AssessV2Error && error.code === 'AUTHORITY_STALE');
  const forbidden = deps(); forbidden.loadFreshAuthority = async () => ({ actorId: actor, organizationId: org, workspaceId: workspace, authorizationVersion: 7, capabilities: [] });
  await assert.rejects(() => executeAssessV2Command(req(base), parseAssessV2Envelope(base), forbidden), (error: unknown) => error instanceof AssessV2Error && error.code === 'PERMISSION_DENIED');
  const missingLocked = deps(); missingLocked.loadLockedCaseForFinalize = async () => null;
  await assert.rejects(() => executeAssessV2Command(req(finalize), parseAssessV2Envelope(finalize), missingLocked), (error: unknown) => error instanceof AssessV2Error && error.code === 'RESOURCE_NOT_AVAILABLE');
  console.log('Assess V2 command boundary suite passed.');
};
void main();
