import type { Assessment } from '../../../types.ts';
import type { AgentNecessityFacts, AssessmentCaseV2, CaseFact, EvidenceLink, ImmutableDecisionVersionV2 } from '../../../services/assessV2/index.ts';
export const ASSESS_V2_COMMAND_TYPES = ['assessment_v2.create', 'assessment_v2.clone_from_v1', 'assessment_v2.draft.upsert', 'assessment_v2.finalize'] as const;
export type AssessV2CommandType = typeof ASSESS_V2_COMMAND_TYPES[number];
export type JsonObject = Record<string, unknown>;
export type AssessV2Envelope = { requestId: string; idempotencyKey: string; commandType: AssessV2CommandType; organizationId: string; workspaceId: string; authorizationVersion: number; expectedVersion?: number; payload: JsonObject };
export type AssessV2Authority = { actorId: string; organizationId: string; workspaceId: string; authorizationVersion: number; capabilities: readonly string[] };
export type AssessV2CloneProjection = Readonly<{
  contractVersion: string;
  sourceAssessmentId: string;
  sourceProcessId: string;
  sourceV1: NonNullable<AssessmentCaseV2['sourceV1']>;
  importedFacts: readonly CaseFact[];
  evidence: readonly EvidenceLink[];
  agentNecessity: AgentNecessityFacts;
  importedFactCount: number;
  importedEvidenceCount: number;
}>;
export type AssessV2AtomicCommand = AssessV2Envelope & { actorId: string; serverDecision?: ImmutableDecisionVersionV2; serverCloneProjection?: AssessV2CloneProjection };
export interface AssessV2Dependencies { authenticate(request: Request): Promise<{ id: string }>; loadFreshAuthority(input: { request: Request; actorId: string; organizationId: string; workspaceId: string }): Promise<AssessV2Authority | null>; loadFrozenV1AssessmentForClone(input: { sourceAssessmentId: string; organizationId: string; workspaceId: string }): Promise<Assessment | null>; loadLockedCaseForFinalize(input: { caseId: string; organizationId: string; workspaceId: string; expectedVersion: number }): Promise<AssessmentCaseV2 | null>; executeAtomicCommand(command: AssessV2AtomicCommand): Promise<{ outcome: 'committed' | 'replayed'; resource: JsonObject }> }
export type AssessV2ErrorCode = 'METHOD_NOT_ALLOWED' | 'AUTHENTICATION_REQUIRED' | 'INVALID_COMMAND' | 'COMMAND_NOT_SUPPORTED' | 'RESOURCE_NOT_AVAILABLE' | 'AUTHORITY_STALE' | 'PERMISSION_DENIED' | 'VERSION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'FEATURE_DISABLED' | 'READ_ONLY' | 'COMMAND_UNAVAILABLE';
const status: Record<AssessV2ErrorCode, number> = { METHOD_NOT_ALLOWED: 405, AUTHENTICATION_REQUIRED: 401, INVALID_COMMAND: 400, COMMAND_NOT_SUPPORTED: 400, RESOURCE_NOT_AVAILABLE: 404, AUTHORITY_STALE: 409, PERMISSION_DENIED: 403, VERSION_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409, FEATURE_DISABLED: 503, READ_ONLY: 503, COMMAND_UNAVAILABLE: 503 };
export class AssessV2Error extends Error { constructor(public readonly code: AssessV2ErrorCode) { super(code); } get status() { return status[this.code]; } }

const bad = (): never => { throw new AssessV2Error('INVALID_COMMAND'); };
const obj = (value: unknown): JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : bad();
const exact = (value: JsonObject, keys: readonly string[], required: readonly string[] = keys) => { if (Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !(key in value))) bad(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const uuid = (value: unknown) => typeof value === 'string' && UUID.test(value) ? value : bad();
const text = (value: unknown, limit: number, empty = false) => typeof value === 'string' && value.length <= limit && (empty || value.trim()) ? value : bad();
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : bad();
const list = <T>(value: unknown, limit: number, parse: (item: unknown) => T): T[] => Array.isArray(value) && value.length <= limit ? value.map(parse) : bad();
const enumOf = <T extends string>(value: unknown, values: readonly T[]) => typeof value === 'string' && values.includes(value as T) ? value as T : bad();
const boolNull = (value: unknown) => value === null || typeof value === 'boolean' ? value : bad();
const numNull = (value: unknown, min: number, max: number) => value === null ? null : typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : bad();
const textNull = (value: unknown, limit: number) => value === null ? null : text(value, limit);
const iso = (value: unknown) => { const parsed = text(value, 64); if (!Number.isFinite(Date.parse(parsed))) bad(); return parsed; };
const uuids = (value: unknown) => list(value, 200, uuid);
const strings = (value: unknown) => list(value, 200, item => text(item, 1000, true));
const jsonValue = (value: unknown, seen = new Set<object>()): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : bad();
  if (typeof value !== 'object' || seen.has(value)) return bad();
  seen.add(value);
  if (Array.isArray(value)) { if (value.length > 500) bad(); const result = value.map(item => jsonValue(item, seen)); seen.delete(value); return result; }
  const record = obj(value); if (Object.keys(record).length > 500) bad();
  const result = Object.fromEntries(Object.entries(record).map(([key, item]) => [text(key, 160), jsonValue(item, seen)])); seen.delete(value); return result;
};

const primitiveTypes = ['Capture', 'Extract', 'Classify', 'Validate', 'Calculate', 'Reconcile', 'Retrieve', 'Investigate', 'Decide', 'Approve', 'Route', 'Execute', 'Communicate', 'Monitor', 'Audit'] as const;
const businessDispositions = ['Monitor / Do Nothing', 'Simplify', 'Redesign', 'Human-Led', 'Existing Product Configuration', 'Custom Application'] as const;
const factSources = ['user', 'system', 'template', 'v1-import'] as const;
const parseFact = (value: unknown): CaseFact => {
  const item = obj(value); exact(item, ['fieldId', 'value', 'status', 'evidenceIds', 'source']);
  const parsedValue = jsonValue(item.value);
  const fact = { fieldId: text(item.fieldId, 160), value: parsedValue, status: enumOf(item.status, ['known', 'unknown', 'suggested', 'assumed'] as const), evidenceIds: uuids(item.evidenceIds), source: enumOf(item.source, factSources) } as CaseFact;
  if ((fact.status === 'unknown') !== (fact.value === null)) bad();
  if (fact.source === 'template' && fact.status === 'known') bad();
  if (fact.source === 'v1-import' && fact.status !== 'assumed' && fact.status !== 'unknown') bad();
  return fact;
};
const agentKeys = ['irreducibleAmbiguity', 'adaptiveNextStep', 'toolOrPathSelection', 'incrementalValue', 'controllable'] as const;
const agentFieldIds: Record<typeof agentKeys[number], string> = { irreducibleAmbiguity: 'agent.irreducibleAmbiguity', adaptiveNextStep: 'agent.adaptiveNextStep', toolOrPathSelection: 'agent.toolOrPathSelection', incrementalValue: 'agent.incrementalValue', controllable: 'agent.controllable' };
const parseAgentNecessity = (value: unknown): AgentNecessityFacts => {
  const item = obj(value); exact(item, agentKeys);
  return Object.fromEntries(agentKeys.map(key => { const fact = parseFact(item[key]) as CaseFact<boolean>; if (fact.fieldId !== agentFieldIds[key] || (fact.value !== null && typeof fact.value !== 'boolean')) bad(); return [key, fact]; })) as unknown as AgentNecessityFacts;
};
const parsePrimitive = (value: unknown) => {
  const item = obj(value); exact(item, ['id', 'type', 'name', 'description', 'trigger', 'inputs', 'outputs', 'owner', 'volumeShare', 'manualEffort', 'rules', 'exceptionIds', 'evidenceIds', 'facts', 'businessDisposition', 'agentNecessity'], ['id', 'type', 'name', 'description', 'inputs', 'outputs', 'volumeShare', 'manualEffort', 'rules', 'exceptionIds', 'evidenceIds', 'facts']);
  const facts = obj(item.facts); if (Object.keys(facts).length > 200) bad();
  return { id: uuid(item.id), type: enumOf(item.type, primitiveTypes), name: text(item.name, 200), description: text(item.description, 4000), trigger: item.trigger === undefined ? undefined : text(item.trigger, 500, true), inputs: strings(item.inputs), outputs: strings(item.outputs), owner: item.owner === undefined ? undefined : text(item.owner, 200, true), volumeShare: numNull(item.volumeShare, 0, 1), manualEffort: numNull(item.manualEffort, 0, 1e7), rules: strings(item.rules), exceptionIds: uuids(item.exceptionIds), evidenceIds: uuids(item.evidenceIds), facts: Object.fromEntries(Object.entries(facts).map(([key, fact]) => { const parsed = parseFact(fact); if (key !== parsed.fieldId) bad(); return [key, parsed]; })), businessDisposition: item.businessDisposition === undefined ? undefined : enumOf(item.businessDisposition, businessDispositions), agentNecessity: item.agentNecessity === undefined ? undefined : parseAgentNecessity(item.agentNecessity) };
};
const parseEdge = (value: unknown) => { const item = obj(value); exact(item, ['id', 'fromPrimitiveId', 'toPrimitiveId', 'condition'], ['id', 'fromPrimitiveId', 'toPrimitiveId']); return { id: uuid(item.id), fromPrimitiveId: uuid(item.fromPrimitiveId), toPrimitiveId: uuid(item.toPrimitiveId), condition: item.condition === undefined ? undefined : text(item.condition, 1000, true) }; };
const parseDecisionPoint = (value: unknown) => { const item = obj(value); exact(item, ['id', 'primitiveId', 'name', 'ruleDescription', 'outcomeLabels', 'evidenceIds']); return { id: uuid(item.id), primitiveId: uuid(item.primitiveId), name: text(item.name, 200), ruleDescription: text(item.ruleDescription, 2000), outcomeLabels: strings(item.outcomeLabels), evidenceIds: uuids(item.evidenceIds) }; };
const parseExceptionPath = (value: unknown) => { const item = obj(value); exact(item, ['id', 'fromPrimitiveId', 'name', 'trigger', 'resolutionPrimitiveIds', 'evidenceIds']); return { id: uuid(item.id), fromPrimitiveId: uuid(item.fromPrimitiveId), name: text(item.name, 200), trigger: text(item.trigger, 2000), resolutionPrimitiveIds: uuids(item.resolutionPrimitiveIds), evidenceIds: uuids(item.evidenceIds) }; };
const parseAsset = (value: unknown) => {
  const item = obj(value); exact(item, ['id', 'name', 'strategicLifespan', 'technicalHealth', 'businessCriticality', 'ownershipModel', 'vendorRoadmap', 'operatingStability', 'accountableOwner', 'evidenceIds']);
  return { id: uuid(item.id), name: text(item.name, 200), strategicLifespan: enumOf(item.strategicLifespan, ['short', 'medium', 'long', 'unknown'] as const), technicalHealth: enumOf(item.technicalHealth, ['healthy', 'constrained', 'end-of-life', 'unknown'] as const), businessCriticality: enumOf(item.businessCriticality, ['low', 'medium', 'high', 'critical', 'unknown'] as const), ownershipModel: enumOf(item.ownershipModel, ['source-owned', 'vendor-owned', 'shared', 'unknown'] as const), vendorRoadmap: enumOf(item.vendorRoadmap, ['supportive', 'constrained', 'end-of-life', 'unknown'] as const), operatingStability: enumOf(item.operatingStability, ['stable', 'variable', 'unstable', 'unknown'] as const), accountableOwner: textNull(item.accountableOwner, 200), evidenceIds: uuids(item.evidenceIds) };
};
const parseEvidence = (value: unknown) => {
  const item = obj(value); exact(item, ['id', 'claimIds', 'sourceType', 'status', 'validated', 'owner', 'capturedAt', 'validUntil', 'reviewerIds', 'contradictory'], ['id', 'claimIds', 'sourceType', 'status', 'validated']);
  const result = { id: uuid(item.id), claimIds: strings(item.claimIds), sourceType: enumOf(item.sourceType, ['system-record', 'document', 'interview', 'observation', 'test', 'template'] as const), status: enumOf(item.status, ['suggested', 'submitted', 'validated', 'rejected'] as const), validated: typeof item.validated === 'boolean' ? item.validated : bad(), owner: item.owner === undefined ? undefined : text(item.owner, 200, true), capturedAt: item.capturedAt === undefined ? undefined : iso(item.capturedAt), validUntil: item.validUntil === undefined ? undefined : iso(item.validUntil), reviewerIds: item.reviewerIds === undefined ? undefined : strings(item.reviewerIds), contradictory: item.contradictory === undefined ? undefined : typeof item.contradictory === 'boolean' ? item.contradictory : bad() };
  if (result.sourceType === 'template' && (result.validated || result.status === 'validated')) bad();
  if (result.validated !== (result.status === 'validated')) bad();
  if (result.status === 'validated' && (!result.owner?.trim() || !result.claimIds.length)) bad();
  return result;
};
const interactionFactKeys = ['interfaceAvailable', 'operationCovered', 'apiDocumented', 'machineIdentity', 'leastPrivilege', 'dataQuality', 'dataClassified', 'auditable', 'idempotent', 'compensatable', 'rollback', 'testEnvironment', 'monitored', 'uiStable', 'eventSemantics', 'errorContract', 'capacityKnown', 'accountableOwner', 'highImpact', 'financialAction', 'untrustedContentWithTools'] as const;
const parseInteraction = (value: unknown) => {
  const item = obj(value); exact(item, ['id', 'assetId', 'primitiveId', 'operationName', 'mode', 'dataClassification', 'facts', 'evidenceIds']);
  const facts = obj(item.facts); exact(facts, interactionFactKeys);
  return { id: uuid(item.id), assetId: uuid(item.assetId), primitiveId: uuid(item.primitiveId), operationName: text(item.operationName, 200), mode: enumOf(item.mode, ['read', 'write', 'event', 'ui', 'operational'] as const), dataClassification: enumOf(item.dataClassification, ['Public', 'Internal', 'Confidential', 'Restricted', 'Unknown'] as const), facts: Object.fromEntries(interactionFactKeys.map(key => [key, ['highImpact', 'financialAction', 'untrustedContentWithTools'].includes(key) ? typeof facts[key] === 'boolean' ? facts[key] : bad() : boolNull(facts[key])])), evidenceIds: uuids(item.evidenceIds) };
};

export const parseAssessV2DraftPayload = (payload: JsonObject) => {
  exact(payload, ['caseId', 'name', 'description', 'primitives', 'edges', 'decisionPoints', 'exceptionPaths', 'applicationAssets', 'interactions', 'evidenceLinks', 'agentNecessity', 'candidateEvaluations', 'gateResults', 'controlRequirements', 'modernizationDispositions']);
  for (const key of ['candidateEvaluations', 'gateResults', 'controlRequirements', 'modernizationDispositions']) if (!Array.isArray(payload[key]) || payload[key].length !== 0) bad();
  const result = { caseId: uuid(payload.caseId), name: text(payload.name, 200), description: text(payload.description, 4000, true), primitives: list(payload.primitives, 200, parsePrimitive), edges: list(payload.edges, 400, parseEdge), decisionPoints: list(payload.decisionPoints, 200, parseDecisionPoint), exceptionPaths: list(payload.exceptionPaths, 200, parseExceptionPath), assets: list(payload.applicationAssets, 100, parseAsset), interactions: list(payload.interactions, 400, parseInteraction), evidence: list(payload.evidenceLinks, 500, parseEvidence), agentNecessity: parseAgentNecessity(payload.agentNecessity) };
  if (JSON.stringify(result).length > 900000) bad();
  return result;
};

export const parseAssessV2Envelope = (value: unknown): AssessV2Envelope => {
  const item = obj(value); exact(item, ['requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'expectedVersion', 'payload'], ['requestId', 'idempotencyKey', 'commandType', 'organizationId', 'workspaceId', 'authorizationVersion', 'payload']);
  if (!ASSESS_V2_COMMAND_TYPES.includes(item.commandType as AssessV2CommandType)) throw new AssessV2Error(typeof item.commandType === 'string' ? 'COMMAND_NOT_SUPPORTED' : 'INVALID_COMMAND');
  const commandType = item.commandType as AssessV2CommandType; const rawPayload = obj(item.payload); let payload: JsonObject;
  if (commandType === 'assessment_v2.create') { exact(rawPayload, ['caseId', 'processId', 'name', 'description']); payload = { caseId: uuid(rawPayload.caseId), processId: uuid(rawPayload.processId), name: text(rawPayload.name, 200), description: text(rawPayload.description, 4000, true) }; }
  else if (commandType === 'assessment_v2.clone_from_v1') { exact(rawPayload, ['caseId', 'sourceAssessmentId', 'name', 'description']); payload = { caseId: uuid(rawPayload.caseId), sourceAssessmentId: uuid(rawPayload.sourceAssessmentId), name: text(rawPayload.name, 200), description: text(rawPayload.description, 4000, true) }; }
  else if (commandType === 'assessment_v2.draft.upsert') payload = parseAssessV2DraftPayload(rawPayload);
  else { exact(rawPayload, ['caseId']); payload = { caseId: uuid(rawPayload.caseId) }; }
  if (commandType !== 'assessment_v2.create' && commandType !== 'assessment_v2.clone_from_v1' && item.expectedVersion === undefined) bad();
  return { requestId: uuid(item.requestId), idempotencyKey: typeof item.idempotencyKey === 'string' && KEY.test(item.idempotencyKey) ? item.idempotencyKey : bad(), commandType, organizationId: uuid(item.organizationId), workspaceId: uuid(item.workspaceId), authorizationVersion: integer(item.authorizationVersion), expectedVersion: item.expectedVersion === undefined ? undefined : integer(item.expectedVersion), payload };
};
export const asAssessV2Error = (error: unknown) => error instanceof AssessV2Error ? error : new AssessV2Error('COMMAND_UNAVAILABLE');
export const assessV2ErrorBody = (error: AssessV2Error) => ({ ok: false, error: { code: error.code, message: 'The command could not be completed.' } });
