import type { TenantContextProjection } from '../types';
import type {
  AgentNecessityFacts,
  ApplicationAsset,
  ApplicationInteraction,
  AssessmentCaseV2,
  DecisionPoint,
  EvidenceLink,
  ExceptionPath,
  ImmutableDecisionVersionV2,
  ProcessEdge,
  ProcessPrimitive,
} from './assessV2/types';
import { supabase } from './supabaseClient';
import { EnterpriseBoundaryError } from './enterpriseAssess';
import { isEnterpriseObject, readEnterpriseErrorCode } from './enterpriseAssessContract';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';
import { ASSESS_V2_CAPABILITIES } from './assessV2/capabilities';

export type AssessV2CommandType =
  | 'assessment_v2.create'
  | 'assessment_v2.clone_from_v1'
  | 'assessment_v2.draft.upsert'
  | 'assessment_v2.finalize';

export interface AssessV2CommandResource {
  caseId: string;
  version: number;
  status: 'draft' | 'reviewer-ready' | 'superseded';
  decisionId?: string;
  importedFactCount?: number;
  importedEvidenceCount?: number;
}

export interface AssessV2DraftInput {
  caseId: string;
  name: string;
  description: string;
  primitives: ProcessPrimitive[];
  edges: ProcessEdge[];
  decisionPoints: DecisionPoint[];
  exceptionPaths: ExceptionPath[];
  applicationAssets: ApplicationAsset[];
  interactions: ApplicationInteraction[];
  evidenceLinks: EvidenceLink[];
  agentNecessity: AgentNecessityFacts;
  candidateEvaluations: [];
  gateResults: [];
  controlRequirements: [];
  modernizationDispositions: [];
}

export interface AssessV2ReadProjection {
  case: AssessmentCaseV2;
  name: string;
  description: string;
  decision: ImmutableDecisionVersionV2 | null;
}

export const draftFromAssessmentCase = (assessment: AssessmentCaseV2, name: string, description: string): AssessV2DraftInput => ({
  caseId: assessment.id,
  name,
  description,
  primitives: assessment.primitives,
  edges: assessment.edges,
  decisionPoints: assessment.decisionPoints,
  exceptionPaths: assessment.exceptionPaths,
  applicationAssets: assessment.assets,
  interactions: assessment.interactions,
  evidenceLinks: assessment.evidence,
  agentNecessity: assessment.agentNecessity,
  candidateEvaluations: [],
  gateResults: [],
  controlRequirements: [],
  modernizationDispositions: [],
});

export interface AssessV2Transport {
  invoke(body: Record<string, unknown>): Promise<unknown>;
  readCase(caseId: string): Promise<unknown>;
  findCaseForProcess(input: { organizationId: string; workspaceId: string; processId: string }): Promise<unknown>;
}

const parseResource = (value: unknown): AssessV2CommandResource => {
  if (!isEnterpriseObject(value) || typeof value.id !== 'string' ||
      !Number.isSafeInteger(value.version) || typeof value.status !== 'string') {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  if (!['draft', 'reviewer_ready', 'superseded'].includes(value.status as string)) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return {
    caseId: value.id as string,
    version: value.version as number,
    status: value.status === 'reviewer_ready' ? 'reviewer-ready' : value.status as 'draft' | 'superseded',
    decisionId: typeof value.decisionId === 'string' ? value.decisionId : undefined,
    importedFactCount: Number.isSafeInteger(value.importedFactCount) ? value.importedFactCount as number : undefined,
    importedEvidenceCount: Number.isSafeInteger(value.importedEvidenceCount) ? value.importedEvidenceCount as number : undefined,
  };
};

export const projectImmutableCloneEvidence = (
  currentEvidence: unknown[],
  importedEvidence: unknown[],
): { evidence: unknown[]; importedEvidenceClaimIds: string[] } => {
  const asEvidenceObject = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  const evidenceId = (value: unknown): string | null => {
    const evidence = asEvidenceObject(value);
    return evidence && typeof evidence.id === 'string' ? evidence.id : null;
  };
  const importedEvidenceIds = new Set(importedEvidence.map(evidenceId).filter((id): id is string => id !== null));
  const evidence = [
    ...currentEvidence.filter(item => {
      const id = evidenceId(item);
      return id === null || !importedEvidenceIds.has(id);
    }),
    ...importedEvidence,
  ].sort((left, right) => (evidenceId(left) ?? '').localeCompare(evidenceId(right) ?? ''));
  const importedEvidenceClaimIds = Array.from(new Set(importedEvidence.flatMap(item => {
    const imported = asEvidenceObject(item);
    return imported && Array.isArray(imported.claimIds)
      ? imported.claimIds.filter((claimId): claimId is string =>
        typeof claimId === 'string' && /^v1\.evidence\.[A-Za-z0-9._:-]+$/.test(claimId))
      : [];
  }))).sort();
  return { evidence, importedEvidenceClaimIds };
};

const defaultTransport: AssessV2Transport = {
  async invoke(body) {
    const { data, error } = await supabase.functions.invoke('assess-v2-command', { body });
    if (error) {
      let payload: unknown;
      try { payload = await (error as any).context?.clone?.().json(); } catch { payload = undefined; }
      throw new EnterpriseBoundaryError(readEnterpriseErrorCode(payload, typeof navigator !== 'undefined' && !navigator.onLine));
    }
    return data;
  },
  async readCase(caseId) {
    const { data: activeCase, error: activeCaseError } = await supabase
      .from('assess_v2_cases')
      .select('id')
      .eq('id', caseId)
      .is('deleted_at', null)
      .maybeSingle();
    if (activeCaseError) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    if (!activeCase) return null;

    const { data: decision, error: decisionError } = await supabase
      .from('assess_v2_decision_versions')
      .select('case_id,source_version_id,schema_version,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,input_canonical,evidence_canonical,output_canonical,supersedes_decision_id,created_by,created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (decisionError) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    if (!decision) {
      const { data: currentCase, error: caseError } = await supabase.from('assess_v2_cases')
        .select('id,org_id,workspace_id,process_id,owner_id,status,version,schema_version,rule_set_version,source_v1_assessment_id,source_v1_score_version,created_at,updated_at,head_version_id')
        .eq('id', caseId)
        .is('deleted_at', null)
        .maybeSingle();
      if (caseError) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
      if (!currentCase) return null;
      const { data: head, error: headError } = await supabase.from('assess_v2_case_versions')
        .select('name,description,agent_necessity,imported_facts')
        .eq('id', currentCase.head_version_id).maybeSingle();
      if (headError || !head) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
      const child = async (table: string, versionId: string = currentCase.head_version_id) => {
        const { data, error } = await supabase.from(table).select('payload').eq('version_id', versionId);
        if (error) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
        return (data ?? []).map(row => row.payload);
      };
      const [primitives, edges, decisionPoints, exceptionPaths, assets, interactions, currentEvidence] = await Promise.all([
        child('assess_v2_primitives'), child('assess_v2_edges'), child('assess_v2_decision_points'), child('assess_v2_exception_paths'),
        child('assess_v2_application_assets'), child('assess_v2_application_interactions'), child('assess_v2_evidence_links'),
      ]);
      let immutableCloneVersion: { id: string; source_snapshot: unknown; created_at: string } | null = null;
      let importedEvidence: unknown[] = [];
      if (currentCase.source_v1_assessment_id) {
        const { data, error } = await supabase.from('assess_v2_case_versions')
          .select('id,source_snapshot,created_at')
          .eq('case_id', currentCase.id)
          .eq('org_id', currentCase.org_id)
          .eq('workspace_id', currentCase.workspace_id)
          .eq('version', 1)
          .eq('source_kind', 'v1_clone')
          .maybeSingle();
        if (error || !data || typeof data.id !== 'string' || typeof data.created_at !== 'string') {
          throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
        }
        immutableCloneVersion = data;
        importedEvidence = await child('assess_v2_evidence_links', immutableCloneVersion.id);
      }
      const { evidence, importedEvidenceClaimIds } = projectImmutableCloneEvidence(currentEvidence, importedEvidence);
      const cloneSource = immutableCloneVersion && isEnterpriseObject(immutableCloneVersion.source_snapshot)
        ? immutableCloneVersion.source_snapshot
        : null;
      return { case_id: caseId, name: head.name, description: head.description, case_snapshot: {
        id: currentCase.id,
        organizationId: currentCase.org_id,
        workspaceId: currentCase.workspace_id,
        sourceProcessId: currentCase.process_id,
        ownerId: currentCase.owner_id,
        status: currentCase.status === 'reviewer_ready' ? 'reviewer-ready' : currentCase.status,
        version: currentCase.version,
        schemaVersion: currentCase.schema_version,
        ruleSetVersion: currentCase.rule_set_version,
        ...(currentCase.source_v1_assessment_id ? { sourceV1: {
          assessmentId: currentCase.source_v1_assessment_id,
          scoreVersion: currentCase.source_v1_score_version,
          clonedAt: cloneSource && typeof cloneSource.clonedAt === 'string'
            ? cloneSource.clonedAt
            : immutableCloneVersion!.created_at,
          importedAs: 'unverified-source-facts',
          importedEvidenceClaimIds,
        } } : {}),
        importedFacts: head.imported_facts ?? [],
        primitives, edges, decisionPoints, exceptionPaths, assets, interactions, evidence,
        agentNecessity: head.agent_necessity,
        createdAt: currentCase.created_at,
        updatedAt: currentCase.updated_at,
      }, decision_snapshot: null };
    }
    const { data: version, error: versionError } = await supabase
      .from('assess_v2_case_versions')
      .select('name,description')
      .eq('id', decision.source_version_id)
      .maybeSingle();
    if (versionError || !version) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return {
      case_id: decision.case_id,
      name: version.name,
      description: version.description,
      case_snapshot: decision.input_snapshot,
      decision_snapshot: {
        caseId: decision.case_id,
        sourceCaseVersion: (decision.input_snapshot as AssessmentCaseV2).version,
        schemaVersion: decision.schema_version,
        ruleSetVersion: decision.rule_set_version,
        decisionVersion: decision.decision_version,
        inputSnapshot: decision.input_snapshot,
        evidenceSnapshot: decision.evidence_snapshot,
        outputSnapshot: decision.output_snapshot,
        inputHash: decision.input_hash,
        evidenceHash: decision.evidence_hash,
        outputHash: decision.output_hash,
        inputCanonical: decision.input_canonical,
        evidenceCanonical: decision.evidence_canonical,
        outputCanonical: decision.output_canonical,
        supersedesDecisionId: decision.supersedes_decision_id ?? undefined,
        createdBy: decision.created_by,
        createdAt: decision.created_at,
        validationStatus: decision.validation_status,
      },
    };
  },
  async findCaseForProcess({ organizationId, workspaceId, processId }) {
    const { data, error } = await supabase
      .from('assess_v2_cases')
      .select('id')
      .eq('org_id', organizationId)
      .eq('workspace_id', workspaceId)
      .eq('process_id', processId)
      .is('deleted_at', null)
      .in('status', ['draft', 'reviewer_ready'])
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    return data;
  },};

const command = async (
  transport: AssessV2Transport,
  context: TenantContextProjection,
  commandType: AssessV2CommandType,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion?: number,
) => {
  const body = buildAssessV2CommandEnvelope(context, commandType, payload, idempotencyKey, expectedVersion);
  const result = await transport.invoke(body);
  if (!isEnterpriseObject(result) || result.ok !== true) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  return parseResource(result.resource);
};

export const createAssessV2Case = (
  context: TenantContextProjection,
  input: { caseId: string; processId: string; name: string; description: string },
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.create', input, `assessment_v2.create:${input.caseId}`);

export const cloneAssessV1ToV2 = (
  context: TenantContextProjection,
  input: { caseId: string; sourceAssessmentId: string; name: string; description: string },
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.clone_from_v1', input, `assessment_v2.clone_from_v1:${input.caseId}`);

export const saveAssessV2Draft = (
  context: TenantContextProjection,
  draft: AssessV2DraftInput,
  expectedVersion: number,
  transport: AssessV2Transport = defaultTransport,
) => command(transport, context, 'assessment_v2.draft.upsert', { ...draft }, `assessment_v2.draft.upsert:${draft.caseId}:${expectedVersion}`, expectedVersion);

export const finalizeAssessV2Case = (
  context: TenantContextProjection,
  caseId: string,
  expectedVersion: number,
  transport: AssessV2Transport = defaultTransport,
) => command(
  transport,
  context,
  'assessment_v2.finalize',
  { caseId },
  `assessment_v2.finalize:${caseId}:${expectedVersion}`,
  expectedVersion,
);

export const assertUniqueAssessV2EvidenceIds = (caseSnapshot: unknown): void => {
  if (!isEnterpriseObject(caseSnapshot) || !Array.isArray(caseSnapshot.evidence)) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  const evidenceIds = new Set<string>();
  for (const evidence of caseSnapshot.evidence) {
    if (!isEnterpriseObject(evidence) || typeof evidence.id !== 'string' || evidenceIds.has(evidence.id)) {
      throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
    }
    evidenceIds.add(evidence.id);
  }
};

export const findAssessV2CaseForProcess = async (
  context: TenantContextProjection,
  processId: string,
  transport: AssessV2Transport = defaultTransport,
): Promise<string | null> => {
  if (!context.capabilities.includes(ASSESS_V2_CAPABILITIES.read)) {
    throw new EnterpriseBoundaryError('PERMISSION_DENIED');
  }
  if (!processId.trim()) throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  const value = await transport.findCaseForProcess({
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    processId,
  });
  if (value === null) return null;
  if (!isEnterpriseObject(value) || typeof value.id !== 'string') {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  return value.id;
};
export const readAssessV2Case = async (
  caseId: string,
  transport: AssessV2Transport = defaultTransport,
): Promise<AssessV2ReadProjection | null> => {
  const value = await transport.readCase(caseId);
  if (value === null) return null;
  if (!isEnterpriseObject(value) || value.case_id !== caseId || typeof value.name !== 'string' ||
      typeof value.description !== 'string' || !isEnterpriseObject(value.case_snapshot)) {
    throw new EnterpriseBoundaryError('COMMAND_UNAVAILABLE');
  }
  assertUniqueAssessV2EvidenceIds(value.case_snapshot);
  return {
    case: value.case_snapshot as unknown as AssessmentCaseV2,
    name: value.name,
    description: value.description,
    decision: isEnterpriseObject(value.decision_snapshot)
      ? value.decision_snapshot as unknown as ImmutableDecisionVersionV2
      : null,
  };
};
