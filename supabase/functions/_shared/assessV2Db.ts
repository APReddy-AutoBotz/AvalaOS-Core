import type { Assessment } from '../../../types.ts';
import type { AssessmentCaseV2 } from '../../../services/assessV2/index.ts';
import { ASSESS_V1_SCORE_VERSION, ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION } from '../../../services/assessV1Compatibility.ts';
import { getAuthUser, supabaseEnv } from './supabase.ts';
import { resolveTenantAuthority, TenantAuthorityError } from './tenantAuthority.ts';
import { createTenantAuthorityDatabase } from './tenantAuthorityDb.ts';
import { AssessV2AtomicCommand, AssessV2Dependencies, AssessV2Error } from './assessV2Command.ts';

const rpcByCommand = { 'assessment_v2.create': 'pr1d_create_assess_v2_case', 'assessment_v2.clone_from_v1': 'pr1d_clone_assess_v2_from_v1', 'assessment_v2.draft.upsert': 'pr1d_upsert_assess_v2_draft', 'assessment_v2.finalize': 'pr1d_finalize_assess_v2_case' } as const;
export const assessV2RpcFailureCode = (body: unknown): AssessV2Error['code'] | null => {
  let serialized = '';
  try { serialized = JSON.stringify(body); } catch { return null; }
  return serialized.includes('PR1D_VERSION_CONFLICT') ? 'VERSION_CONFLICT' : null;
};
const throwAssessV2RpcFailure = async (response: Response): Promise<never> => {
  let body: unknown = null;
  try { body = await response.json(); } catch { /* Keep the public error controlled. */ }
  const code = assessV2RpcFailureCode(body);
  throw new AssessV2Error(code ?? 'COMMAND_UNAVAILABLE');
};

const serviceFetch = async (path: string, init: RequestInit = {}) => { const { url, serviceRoleKey } = supabaseEnv(); return fetch(`${url}/rest/v1/${path}`, { ...init, redirect: 'error', headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) } }); };
const controlled = (value: unknown) => {
  const result = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
  if (!result || typeof result !== 'object') throw new AssessV2Error('COMMAND_UNAVAILABLE');
  const map: Record<string, AssessV2Error['code']> = { VERSION_CONFLICT: 'VERSION_CONFLICT', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT', AUTHORIZATION_STALE: 'AUTHORITY_STALE', NOT_FOUND: 'RESOURCE_NOT_AVAILABLE', INVALID_COMMAND: 'INVALID_COMMAND', FEATURE_DISABLED: 'FEATURE_DISABLED', READ_ONLY: 'READ_ONLY' };
  if (typeof result.errorCode === 'string' && map[result.errorCode]) throw new AssessV2Error(map[result.errorCode]);
  if ((result.outcome !== 'committed' && result.outcome !== 'replayed') || !result.resource || typeof result.resource !== 'object' || Array.isArray(result.resource)) throw new AssessV2Error('COMMAND_UNAVAILABLE');
  return { outcome: result.outcome, resource: result.resource as Record<string, unknown> } as const;
};
export const buildAssessV2RpcBody = (command: AssessV2AtomicCommand) => {
  const common = { p_actor_id: command.actorId, p_org_id: command.organizationId, p_workspace_id: command.workspaceId, p_request_id: command.requestId, p_idempotency_key: command.idempotencyKey, p_authorization_version: command.authorizationVersion };
  if (command.commandType === 'assessment_v2.create') return { ...common, p_case_id: command.payload.caseId, p_process_id: command.payload.processId, p_name: command.payload.name, p_description: command.payload.description };
  if (command.commandType === 'assessment_v2.clone_from_v1') {
    const projection = command.serverCloneProjection;
    if (!projection || projection.contractVersion !== ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION ||
        projection.sourceAssessmentId !== command.payload.sourceAssessmentId ||
        projection.sourceV1.assessmentId !== projection.sourceAssessmentId ||
        projection.sourceV1.scoreVersion !== ASSESS_V1_SCORE_VERSION ||
        projection.importedFactCount !== projection.importedFacts.length ||
        projection.importedEvidenceCount !== projection.evidence.length) throw new AssessV2Error('COMMAND_UNAVAILABLE');
    return {
      ...common, p_case_id: command.payload.caseId, p_source_assessment_id: command.payload.sourceAssessmentId,
      p_name: command.payload.name, p_description: command.payload.description,
      p_source_process_id: projection.sourceProcessId, p_source_v1: projection.sourceV1,
      p_imported_facts: projection.importedFacts, p_imported_evidence: projection.evidence,
      p_agent_necessity: projection.agentNecessity, p_clone_contract_version: projection.contractVersion,
    };
  }
  if (command.commandType === 'assessment_v2.draft.upsert') return { ...common, p_case_id: command.payload.caseId, p_expected_version: command.expectedVersion, p_authoring: command.payload };
  if (!command.serverDecision) throw new AssessV2Error('COMMAND_UNAVAILABLE');
  return { ...common, p_case_id: command.payload.caseId, p_expected_version: command.expectedVersion, p_source_case: command.serverDecision.inputSnapshot, p_input_canonical: command.serverDecision.inputCanonical, p_evidence_snapshot: command.serverDecision.evidenceSnapshot, p_evidence_canonical: command.serverDecision.evidenceCanonical, p_output_snapshot: command.serverDecision.outputSnapshot, p_output_canonical: command.serverDecision.outputCanonical, p_input_hash: command.serverDecision.inputHash, p_evidence_hash: command.serverDecision.evidenceHash, p_output_hash: command.serverDecision.outputHash, p_rule_set_version: command.serverDecision.ruleSetVersion, p_decision_version: command.serverDecision.decisionVersion, p_created_at: command.serverDecision.createdAt };
};

export const buildAssessV2FinalizeReplayRpcBody = (command: AssessV2AtomicCommand) => {
  if (command.commandType !== 'assessment_v2.finalize' || command.serverDecision) throw new AssessV2Error('COMMAND_UNAVAILABLE');
  return {
    p_actor_id: command.actorId,
    p_org_id: command.organizationId,
    p_workspace_id: command.workspaceId,
    p_case_id: command.payload.caseId,
    p_expected_version: command.expectedVersion,
    p_idempotency_key: command.idempotencyKey,
    p_authorization_version: command.authorizationVersion,
  };
};

export const assessV2Dependencies: AssessV2Dependencies = {
  async authenticate(request) { return getAuthUser(request); },
  async loadFreshAuthority(input) { try { const authority = await resolveTenantAuthority(input.actorId, { organizationId: input.organizationId, workspaceId: input.workspaceId }, createTenantAuthorityDatabase(input.request)); return { actorId: authority.userId, organizationId: authority.organizationId, workspaceId: authority.workspaceId, authorizationVersion: authority.authorizationVersion, capabilities: authority.capabilities }; } catch (error) { if (error instanceof TenantAuthorityError && error.code === 'TENANT_ACCESS_DENIED') return null; throw error; } },
  async loadFrozenV1AssessmentForClone(input) {
    const query = new URLSearchParams({
      select: 'id,process_id,org_id,workspace_id,version,score_version,status,metadata,responses,evidence_items,assumptions,completion_by_section,scores',
      id: `eq.${input.sourceAssessmentId}`, org_id: `eq.${input.organizationId}`, workspace_id: `eq.${input.workspaceId}`,
      status: 'in.(Approved,Handed Off to Docs)', deleted_at: 'is.null', limit: '1',
    });
    const response = await serviceFetch(`assessments?${query}`, { method: 'GET' });
    if (!response.ok) return throwAssessV2RpcFailure(response);
    const rows = await response.json() as Array<Record<string, unknown>>;
    if (rows.length !== 1) return null;
    const row = rows[0];
    const aggregate = row.responses && typeof row.responses === 'object' && !Array.isArray(row.responses) && 'responses' in row.responses
      ? row.responses as Record<string, unknown> : null;
    const responses = aggregate?.responses ?? row.responses;
    const metadata = aggregate?.metadata ?? row.metadata;
    const evidenceItems = aggregate?.evidenceItems ?? row.evidence_items;
    const assumptions = aggregate?.assumptions ?? row.assumptions;
    const scores = aggregate?.scores ?? row.scores;
    if (typeof row.id !== 'string' || typeof row.process_id !== 'string' || typeof row.org_id !== 'string' ||
        typeof row.workspace_id !== 'string' || typeof row.status !== 'string' ||
        !responses || typeof responses !== 'object' || Array.isArray(responses) ||
        !metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
        !Array.isArray(evidenceItems) || !Array.isArray(assumptions)) return null;
    return {
      id: row.id, processId: row.process_id, orgId: row.org_id, workspaceId: row.workspace_id,
      version: typeof row.version === 'number' ? row.version : undefined,
      scoreVersion: typeof row.score_version === 'string' ? row.score_version : undefined,
      status: row.status as Assessment['status'], metadata: metadata as Assessment['metadata'],
      responses: responses as Assessment['responses'], evidenceItems: evidenceItems as Assessment['evidenceItems'],
      assumptions: assumptions as Assessment['assumptions'],
      completionBySection: (row.completion_by_section && typeof row.completion_by_section === 'object' ? row.completion_by_section : {}) as Assessment['completionBySection'],
      scores: scores && typeof scores === 'object' && !Array.isArray(scores) ? scores as Assessment['scores'] : undefined,
    };
  },
  async loadLockedCaseForFinalize(input) { const response = await serviceFetch('rpc/pr1d_load_assess_v2_case', { method: 'POST', body: JSON.stringify({ p_case_id: input.caseId, p_org_id: input.organizationId, p_workspace_id: input.workspaceId, p_expected_version: input.expectedVersion }) }); if (response.status === 404) return null; if (!response.ok) return throwAssessV2RpcFailure(response); const value = await response.json(); return (Array.isArray(value) ? value[0] : value) as AssessmentCaseV2 | null; },
  async executeAtomicCommand(command) { try {
    const finalizeReplay = command.commandType === 'assessment_v2.finalize' && !command.serverDecision;
    const rpc = finalizeReplay ? 'pr1d_replay_assess_v2_finalize' : rpcByCommand[command.commandType];
    const body = finalizeReplay ? buildAssessV2FinalizeReplayRpcBody(command) : buildAssessV2RpcBody(command);
    const response = await serviceFetch(`rpc/${rpc}`, { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) return throwAssessV2RpcFailure(response);
    return controlled(await response.json());
  } catch (error) { if (error instanceof AssessV2Error) throw error; throw new AssessV2Error('COMMAND_UNAVAILABLE'); } },
};
