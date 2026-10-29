import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { authenticatedHostedDigest, AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS,
  AUTHENTICATED_HOSTED_PERSONAS } from './authenticatedHostedController.mjs';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { withAuthenticatedHostedDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { authenticatedHostedIdentityCategoryForStatus, authenticatedHostedIdentityUpstreamCode,
  validateAuthenticatedHostedIdentityDiagnostic } from './authenticatedHostedDiagnostics.mjs';
import { AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA,
  authenticatedHostedFixtureIdentity } from './authenticatedHostedFixtureIdentity.mjs';
import { createAuthenticatedHostedObservationReader } from './authenticatedHostedObservationAdapter.mjs';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value);
const strictUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const studioTemplateVersion = value => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/u.test(value);
const digest = value => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
const iso = value => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
const value = result => result.rows[0]?.value;
const PROVIDER_NAMES=Object.freeze(['openai','azure_openai','anthropic','gemini','groq','openai_compatible']);
const REVIEWER_IDEMPOTENCY_KEY=/^[A-Za-z0-9._:-]{8,128}$/u;
const REVIEWER_COMMANDS=Object.freeze(['assessment_v2.review.assign','assessment_v2.review.resolve']);
const reviewerRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const reviewerExactKeys=(value,keys)=>reviewerRecord(value)
  && Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

export const authenticatedHostedSystemBrdTemplateBinding = rows => {
  if (!Array.isArray(rows) || rows.length !== 1 || !reviewerExactKeys(rows[0], ['id', 'template_version'])
    || !strictUuid(rows[0].id) || !studioTemplateVersion(rows[0].template_version)) {
    throw new Error('AUTHENTICATED_HOSTED_SYSTEM_BRD_TEMPLATE_REJECTED');
  }
  return Object.freeze({ kind:'system', artifactType:'brd', templateVersionId:rows[0].id,
    version:rows[0].template_version });
};

export const AUTHENTICATED_HOSTED_SESSION_QUERY = `SELECT id,user_id,not_after,refreshed_at
        FROM auth.sessions WHERE id=$1 AND user_id=$2 AND (not_after IS NULL OR not_after>statement_timestamp())`;

export async function readAuthenticatedHostedCleanupControls(query, scope) {
  const legacyControl=await query('SELECT writes_enabled FROM public.legacy_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2',scope);
  const studioControl=await query(`SELECT publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled FROM public.studio_delivery_workspace_controls
    WHERE org_id=$1 AND workspace_id=$2`,scope);
  const workspaceFlags=await query(`SELECT unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled
    FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2`,scope);
  const assessControl=await query('SELECT enabled,read_only FROM public.assess_v2_runtime_control WHERE singleton');
  return { legacyControl, studioControl, workspaceFlags, assessControl };
}

// Revoking access does not cancel an already claimed server command. Until its
// durable attempt is terminal, neither cleanup nor a new run can be certified.
export const AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL = `(
  (SELECT count(*) FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')+
  (SELECT count(*) FROM public.studio_artifact_generation_attempts
    WHERE transport_kind='authenticated_synthetic'
      AND state NOT IN('completed','stale_completed','failed','cancelled','timed_out'))
)::int`;

const createPassword = () => `Aa7!${randomBytes(24).toString('base64url')}`;
const authHeaders = config => ({
  apikey: config.serviceRoleKey,
  authorization: `Bearer ${config.serviceRoleKey}`,
  'content-type': 'application/json',
});

export const REQUIRED_PERSONA_CAPABILITIES=Object.freeze({
  author:Object.freeze(['org.admin','operations.read','assess.read','assess.create','assess.response.write','assess.finalize',
    'assess.process.update','assess.v2.read','assess.v2.create','assess.v2.clone','assess.v2.draft.write','assess.v2.finalize',
    'studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve',
    'studio.handoffs.read','studio.handoffs.request',
    'project.read','project.manage','backlog.read','backlog.manage','monitor.read','workitems.import']),
  reviewer:Object.freeze(['assess.read','assess.v2.read','assess.v2.review','assess.v2.evidence.attest','assess.v2.approve',
    'studio.handoffs.read','studio.handoffs.review','studio.artifacts.read','studio.artifacts.review',
    'project.read','backlog.read','task.read','task.update.own','delivery.outcomes.read']),
  approver:Object.freeze(['assess.read','assess.v2.read','assess.v2.govern.resolve','assess.v2.studio.handoff',
    'studio.handoffs.read','studio.handoffs.request','studio.handoffs.approve','studio.handoffs.consume',
    'studio.artifacts.read','studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.approve',
    'project.read','project.manage','backlog.read','backlog.manage','monitor.read','workitems.import']),
  outsider:Object.freeze([]),
});
export const FORBIDDEN_PERSONA_CAPABILITIES=Object.freeze({
  author:Object.freeze(['studio.handoffs.review','studio.handoffs.approve','studio.handoffs.consume']),
  reviewer:Object.freeze(['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.v2.govern.resolve']),
  approver:Object.freeze(['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.v2.approve']),
  outsider:Object.freeze(['org.admin','byok.manage','security.manage','admin.synthetic.users.manage','assess.process.update',
    'assess.v2.create','assess.v2.draft.write','assess.v2.review','assess.v2.approve','assess.v2.govern.resolve',
    'studio.artifacts.generate','studio.artifacts.edit','studio.artifacts.review','studio.artifacts.approve','backlog.manage']),
});

export function createAuthenticatedHostedIdentityAdapter({ config, db, fetchImpl = fetch }) {
  const created = new Map();
  const unknownMutationOutcomes = new Set();
  const identityError = (operation, category, body = {}) => {
    const upstreamCode = authenticatedHostedIdentityUpstreamCode(body?.error_code ?? body?.code ?? body?.error);
    const error = new Error(`AUTHENTICATED_HOSTED_IDENTITY_${category}`);
    error.authenticatedHostedIdentityDiagnostic = validateAuthenticatedHostedIdentityDiagnostic({
      operation,
      category,
      ...(upstreamCode ? { upstreamCode } : {}),
    });
    return error;
  };
  const request = async (path, init = {}, { mutation = false } = {}) => {
    let response;
    try {
      const deadline = AbortSignal.timeout(AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS);
      const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
      response = await fetchImpl(`${config.supabaseUrl}${path}`, {
        ...init,
        signal,
        headers: { ...authHeaders(config), ...(init.headers ?? {}) },
      });
    } catch {
      if (mutation) unknownMutationOutcomes.add('PROVISION');
      throw identityError('PROVISION', 'TRANSPORT_FAILURE');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw identityError('PROVISION', authenticatedHostedIdentityCategoryForStatus(response.status), body);
    return body;
  };
  return {
    async provisionProject({ projectName, exerciseDigest, personas, signal }) {
      const result = {};
      for (const persona of personas) {
        const email = `hosted.${config.workflow.runId}.${config.workflow.attempt}.${projectName}.${persona}@example.invalid`;
        const password = createPassword();
        const body = await request('/auth/v1/admin/users', {
          method: 'POST',
          signal,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { synthetic: true, exerciseDigest, persona, browserProject: projectName },
            app_metadata: { provider: 'email', providers: ['email'], synthetic_acceptance: true },
          }),
        }, { mutation: true });
        const user = body.user ?? body;
        if (!uuid(user.id)) {
          unknownMutationOutcomes.add('PROVISION');
          throw new Error('AUTHENTICATED_HOSTED_IDENTITY_CREATE_REJECTED');
        }
        result[persona] = { id: user.id, email, password };
        created.set(user.id, { email, persona, projectName });
      }
      return result;
    },
    async verifySession({ accessToken, actorId, sessionId, signal }) {
      let response;
      try {
        const deadline = AbortSignal.timeout(AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS);
        response = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
          signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
          headers: { apikey: config.serviceRoleKey, authorization: `Bearer ${accessToken}` },
        });
      } catch { throw identityError('VERIFY_SESSION', 'TRANSPORT_FAILURE'); }
      const user = await response.json().catch(() => ({}));
      if (!response.ok) throw identityError('VERIFY_SESSION', authenticatedHostedIdentityCategoryForStatus(response.status), user);
      if (user.id !== actorId) return null;
      const session = (await db.query(AUTHENTICATED_HOSTED_SESSION_QUERY,
      [sessionId, actorId])).rows[0];
      return session ? { actorId: session.user_id, sessionId: session.id } : null;
    },
    async revokeAll() {
      const errors=[];
      const actorIds = [...created.keys()];
      if (actorIds.length)try{await db.query('DELETE FROM auth.sessions WHERE user_id=ANY($1::uuid[])', [actorIds]);}
      catch(error){errors.push(error);}
      for (const actorId of created.keys()) {
        try{
          await request(`/auth/v1/admin/users/${actorId}`, {
            method: 'PUT',
            body: JSON.stringify({ ban_duration: '876000h', user_metadata: { synthetic: true, quiesced: true } }),
          });
        }catch(error){errors.push(error);}
      }
      if(errors.length)throw new AggregateError(errors,'AUTHENTICATED_HOSTED_IDENTITY_REVOCATION_INCOMPLETE');
    },
    created,
    unknownMutationOutcomes,
  };
}

export function createAuthenticatedHostedPostgresAdapter({ config, db, verifyDeployment, verifySecretBackend,
  fetchImpl = fetch,
  observeSecretBackend = async () => { throw new Error('AUTHENTICATED_HOSTED_SECRET_OBSERVATION_REQUIRED'); },
  cleanupSecretBackend = async () => { throw new Error('AUTHENTICATED_HOSTED_SECRET_CLEANUP_REQUIRED'); } }) {
  let sequence = 0;
  const projects = new Map();
  const controlsBefore = new Map();
  const foreignOutcomeProbes = new Map();
  const controlResources = [];
  let nonExerciseStateBeforeHash = null;
  let assessControlLease = null;
  let assessControlInitial = null;
  let providerFixture = null;
  let deliveryControlsBefore = null;
  let workspaceFlagsBefore = null;
  let observationStartedAt = null;
  let immutableHistoryBeforeHash = null;
  const pendingSecretCleanup=new Map();
  const secretMaterialEvidence=new Map();
  const query = (sql, params = []) => db.query(sql, params);
  const scopeParams = () => [config.scope.organizationId, config.scope.workspaceId];
  const authority = async (name, params) => value(await query(`SELECT public.${name}(${params.map((_, index) => `$${index + 1}`).join(',')}) value`, params));
  const observationReader = createAuthenticatedHostedObservationReader({ db, config });
  const exerciseOwnership = projectRows => ({
    actorIds: [...new Set(projectRows.flatMap(project => AUTHENTICATED_HOSTED_PERSONAS
      .map(persona => project.identities?.[persona]?.id).filter(Boolean)))],
    projectIds: [...new Set(projectRows.map(project => project.projectId).filter(Boolean))],
    processIds: [...new Set(projectRows.map(project => project.processId).filter(Boolean))],
  });
  const nonExerciseState = async projectRows => observationReader.nonExerciseDigest({
    cutoff: observationStartedAt,
    ownership: exerciseOwnership(projectRows),
  });
  const immutableExerciseState = async (exerciseId,projectRows) => {
    const rows=[];
    for(const project of projectRows){
      const frame=await observationReader.capture({exerciseId,
        from:observationStartedAt,project});
      rows.push(...frame.records.filter(item=>item.classification==='immutable_history'
        && !['ai_provider_configs','ai_provider_key_refs'].includes(item.source))
        .map(item=>({source:item.source,recordHash:item.recordHash,rowHash:item.rowHash,businessRowHash:item.businessRowHash})));
    }
    return authenticatedHostedDigest(rows.toSorted((a,b)=>`${a.source}:${a.recordHash}`.localeCompare(`${b.source}:${b.recordHash}`)));
  };
  const controlCounts = async () => {
    const row=(await query(`SELECT
      (SELECT count(*)::int FROM public.ai_provider_key_refs WHERE org_id=$1) domain_writes,
      (SELECT count(*)::int FROM public.enterprise_ai_command_receipts WHERE org_id=$1) receipts,
      (SELECT count(*)::int FROM public.ai_provider_audit_events WHERE org_id=$1) audits`,[config.scope.organizationId])).rows[0];
    return {logicalMutations:row.receipts,domainWrites:row.domain_writes,receiptWrites:row.receipts,
      auditWrites:row.audits,secretWrites:row.domain_writes};
  };

  const lifecycleFrame = async project => {
    const row = (await query(`WITH project_cases AS(
      SELECT id FROM public.assess_v2_cases WHERE org_id=$1 AND workspace_id=$2 AND process_id=$3 AND deleted_at IS NULL
    ), project_artifacts AS(
      SELECT artifact.id FROM public.studio_artifact_aggregates artifact JOIN project_cases assessed ON assessed.id=artifact.case_id
    ), target AS(SELECT jsonb_build_object(
      'assessments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.assessments x WHERE x.org_id=$1 AND x.workspace_id=$2 AND x.process_id=$3 AND x.deleted_at IS NULL),
      'cases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.assess_v2_cases x JOIN project_cases s ON s.id=x.id),
      'versions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.case_id,x.version),'[]') FROM public.assess_v2_case_versions x JOIN project_cases s ON s.id=x.case_id),
      'decisions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.case_id,x.created_at,x.id),'[]') FROM public.assess_v2_decision_versions x JOIN project_cases s ON s.id=x.case_id),
      'artifacts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.studio_artifact_aggregates x JOIN project_artifacts s ON s.id=x.id),
      'artifactVersions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.artifact_id,x.version),'[]') FROM public.studio_artifact_versions x JOIN project_artifacts s ON s.id=x.artifact_id)
    ) state) SELECT
      (SELECT count(*)::int FROM public.assessments x WHERE x.org_id=$1 AND x.workspace_id=$2 AND x.process_id=$3 AND x.deleted_at IS NULL) v1_assessments,
      (SELECT coalesce(sum(x.version),0)::int FROM public.assessments x WHERE x.org_id=$1 AND x.workspace_id=$2 AND x.process_id=$3 AND x.deleted_at IS NULL) v1_versions,
      (SELECT count(*)::int FROM public.assessments x WHERE x.org_id=$1 AND x.workspace_id=$2 AND x.process_id=$3 AND x.status='Ready for Review' AND x.scores IS NOT NULL AND x.deleted_at IS NULL) v1_ready,
      (SELECT count(*)::int FROM project_cases) cases,
      (SELECT count(*)::int FROM public.assess_v2_case_versions x JOIN project_cases s ON s.id=x.case_id) case_versions,
      (SELECT count(*)::int FROM public.assess_v2_decision_versions x JOIN project_cases s ON s.id=x.case_id) decisions,
      (SELECT count(*)::int FROM public.assess_v2_review_assignments x JOIN project_cases s ON s.id=x.case_id) assignments,
      (SELECT count(*)::int FROM public.assess_v2_evidence_attestations x JOIN project_cases s ON s.id=x.case_id) attestations,
      (SELECT count(*)::int FROM public.assess_v2_review_resolutions x JOIN project_cases s ON s.id=x.case_id WHERE x.resolution='changes_requested') changes,
      (SELECT count(*)::int FROM public.assess_v2_review_resolutions x JOIN project_cases s ON s.id=x.case_id WHERE x.resolution='rejected') rejected,
      (SELECT count(*)::int FROM public.assess_v2_review_resolutions x JOIN project_cases s ON s.id=x.case_id WHERE x.resolution='approved') approved,
      (SELECT count(*)::int FROM public.assess_v2_govern_resolutions x JOIN project_cases s ON s.id=x.case_id) govern,
      (SELECT count(*)::int FROM public.assess_v2_studio_handoffs x JOIN project_cases s ON s.id=x.case_id) handoffs,
      (SELECT count(*)::int FROM public.studio_artifact_source_packages x JOIN project_artifacts s ON s.id=x.artifact_id) packages,
      (SELECT count(*)::int FROM project_artifacts) artifacts,
      (SELECT count(*)::int FROM public.studio_artifact_generation_attempts x JOIN project_artifacts s ON s.id=x.artifact_id) attempts,
      (SELECT count(*)::int FROM public.studio_artifact_versions x JOIN project_artifacts s ON s.id=x.artifact_id) artifact_versions,
      ((SELECT count(*) FROM public.assess_command_receipts WHERE org_id=$1 AND workspace_id=$2)+(SELECT count(*) FROM public.studio_artifact_command_receipts WHERE org_id=$1 AND workspace_id=$2))::int receipts,
      (SELECT count(*)::int FROM public.privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits,(SELECT state FROM target) target`,
    [config.scope.organizationId, config.scope.workspaceId, project.processId])).rows[0];
    return { v1Assessments: row.v1_assessments, v1AssessmentVersions: row.v1_versions, v1ReadyAssessments: row.v1_ready,
      cases: row.cases, caseVersions: row.case_versions, decisions: row.decisions, assignments: row.assignments,
      attestations: row.attestations, changesRequested: row.changes, rejectedReviews: row.rejected,
      approvedReviews: row.approved, governResolutions: row.govern, handoffs: row.handoffs,
      sourcePackages: row.packages, artifacts: row.artifacts, generationAttempts: row.attempts,
      artifactVersions: row.artifact_versions, receipts: row.receipts, audits: row.audits,
      targetHash: authenticatedHostedDigest(row.target) };
  };

  const processFrame = async project => {
    const row = (await query(`SELECT to_jsonb(p) target,
      (SELECT count(*)::int FROM public.assess_command_receipts WHERE org_id=$2 AND workspace_id=$3 AND command_type='process.update') receipts,
      (SELECT count(*)::int FROM public.privileged_audit_events WHERE org_id=$2 AND workspace_id=$3 AND action='process.update') audits
      FROM public.assess_processes p WHERE p.id=$1 AND p.org_id=$2 AND p.workspace_id=$3`,
    [project.processId, ...scopeParams()])).rows[0];
    return { receipts: row.receipts, audits: row.audits, targetHash: authenticatedHostedDigest(row.target) };
  };

  const verifyAssessmentFinalizeCase = async input => {
    const body=input?.requestBody;
    const response=input?.responseBody;
    const payload=body?.payload;
    const expectedEnvelopeKeys=['authorizationVersion','commandType','expectedVersion','idempotencyKey',
      'organizationId','payload','requestId','workspaceId'];
    if(input?.route!=='/functions/v1/assess-command'||input?.persona!=='author'
      ||input?.status<200||input?.status>=300||!body||typeof body!=='object'||Array.isArray(body)
      ||JSON.stringify(Object.keys(body).sort())!==JSON.stringify(expectedEnvelopeKeys)
      ||body.commandType!=='assessment.finalize'||body.organizationId!==config.scope.organizationId
      ||body.workspaceId!==config.scope.workspaceId||!Number.isSafeInteger(body.authorizationVersion)
      ||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1
      ||!payload||typeof payload!=='object'||Array.isArray(payload)
      ||JSON.stringify(Object.keys(payload).sort())!==JSON.stringify(['assessmentId'])
      ||!uuid(body.requestId)||!uuid(payload.assessmentId)
      ||typeof body.idempotencyKey!=='string'||!body.idempotencyKey
      ||input.actorId!==input.project?.identities?.author?.id||!uuid(input.sessionId)
      ||input.actorHash!==authenticatedHostedDigest(input.actorId)
      ||input.sessionHash!==authenticatedHostedDigest(input.sessionId)
      ||input.requestIdHash!==authenticatedHostedDigest(body.requestId)
      ||input.commandBindingHash!==authenticatedEvidenceDigest({requestIdHash:input.requestIdHash,
        actorHash:input.actorHash,commandType:'assessment.finalize'})
      ||input.commandIdHash!==authenticatedHostedDigest(payload.assessmentId)
      ||!response||response.ok!==true||response.outcome!=='committed'
      ||response.resource?.assessmentId!==payload.assessmentId
      ||response.resource?.version!==body.expectedVersion+1
      ||response.resource?.status!=='Ready for Review'
      ||response.resource?.scoreVersion!=='assess-core-2026-05') {
      throw new Error('AUTHENTICATED_HOSTED_ASSESSMENT_FINALIZE_PROOF_REJECTED');
    }
    const result=await query(`SELECT to_jsonb(assessment) assessment,to_jsonb(receipt) receipt,to_jsonb(audit) audit,
        authority.version::int authorization_version,session.actor_hash,session.session_hash,
        assessment.updated_at>$9::timestamptz AND assessment.updated_at<=$10::timestamptz assessment_in_window,
        receipt.completed_at>$9::timestamptz AND receipt.completed_at<=$10::timestamptz receipt_in_window,
        audit.created_at>$9::timestamptz AND audit.created_at<=$10::timestamptz audit_in_window
      FROM public.assessments assessment
      JOIN public.assess_command_receipts receipt ON receipt.org_id=assessment.org_id
        AND receipt.workspace_id=assessment.workspace_id AND receipt.actor_id=$4
        AND receipt.request_id=$5 AND receipt.command_type='assessment.finalize' AND receipt.status='succeeded'
      JOIN public.privileged_audit_events audit ON audit.org_id=assessment.org_id
        AND audit.workspace_id=assessment.workspace_id AND audit.actor_id=receipt.actor_id
        AND audit.request_id=receipt.request_id AND audit.action='assessment.finalize'
        AND audit.resource_type='assessment' AND audit.resource_id=assessment.id AND audit.outcome='succeeded'
      JOIN public.authorization_versions authority ON authority.org_id=assessment.org_id AND authority.user_id=receipt.actor_id
      JOIN public.authenticated_synthetic_actor_sessions session ON session.exercise_id=$6
        AND session.actor_id=receipt.actor_id AND session.session_id=$7 AND session.state='active'
      WHERE assessment.id=$1 AND assessment.org_id=$2 AND assessment.workspace_id=$3
        AND assessment.process_id=$8 AND assessment.deleted_at IS NULL
        AND assessment.status='Ready for Review' AND assessment.score_version='assess-core-2026-05'
        AND assessment.scores IS NOT NULL AND assessment.scores->>'scoreVersion'='assess-core-2026-05'`,
    [payload.assessmentId,config.scope.organizationId,config.scope.workspaceId,input.actorId,body.requestId,
      input.exerciseId,input.sessionId,input.project.processId,input.before?.capturedAt,input.after?.capturedAt]);
    if(result.rows.length!==1)throw new Error('AUTHENTICATED_HOSTED_ASSESSMENT_FINALIZE_PROOF_REJECTED');
    const row=result.rows[0];
    const assessment=row.assessment;const receipt=row.receipt;const audit=row.audit;
    if(row.authorization_version!==body.authorizationVersion||row.actor_hash!==input.actorHash
      ||row.session_hash!==input.sessionHash||assessment.version!==body.expectedVersion+1
      ||assessment.updated_by!==input.actorId||receipt.response?.ok!==true||receipt.response?.outcome!=='committed'
      ||receipt.response?.resource?.assessmentId!==payload.assessmentId
      ||receipt.response?.resource?.version!==assessment.version
      ||receipt.response?.resource?.status!=='Ready for Review'
      ||receipt.response?.resource?.scoreVersion!=='assess-core-2026-05'
      ||audit.resource_version!==assessment.version||audit.metadata?.scoreVersion!=='assess-core-2026-05'
      ||row.assessment_in_window!==true||row.receipt_in_window!==true||row.audit_in_window!==true) {
      throw new Error('AUTHENTICATED_HOSTED_ASSESSMENT_FINALIZE_PROOF_REJECTED');
    }
    const assessmentRecordHash=authenticatedEvidenceDigest({source:'assessments',identity:{id:assessment.id}});
    const receiptRecordHash=authenticatedEvidenceDigest({source:'assess_command_receipts',identity:{id:receipt.id}});
    const auditRecordHash=authenticatedEvidenceDigest({source:'privileged_audit_events',identity:{id:audit.id}});
    const assessmentAfterRowHash=authenticatedEvidenceDigest(assessment);
    const receiptRowHash=authenticatedEvidenceDigest(receipt);
    const auditRowHash=authenticatedEvidenceDigest(audit);
    const assessmentBefore=input.before?.records?.find(item=>item.recordHash===assessmentRecordHash);
    const assessmentAfter=input.after?.records?.find(item=>item.recordHash===assessmentRecordHash);
    const receiptAfter=input.after?.records?.find(item=>item.recordHash===receiptRecordHash);
    const auditAfter=input.after?.records?.find(item=>item.recordHash===auditRecordHash);
    if(!assessmentBefore||assessmentBefore.source!=='assessments'||assessmentBefore.rowHash===assessmentAfterRowHash
      ||assessmentAfter?.rowHash!==assessmentAfterRowHash||receiptAfter?.rowHash!==receiptRowHash
      ||auditAfter?.rowHash!==auditRowHash)throw new Error('AUTHENTICATED_HOSTED_ASSESSMENT_FINALIZE_PROOF_REJECTED');
    return Object.freeze({
      schemaVersion:'authenticated-assessment-finalize-proof-v1',verified:true,
      requestIdHash:input.requestIdHash,commandBindingHash:input.commandBindingHash,
      actorHash:input.actorHash,sessionHash:input.sessionHash,
      assessmentRecordHash,assessmentBeforeRowHash:assessmentBefore.rowHash,assessmentAfterRowHash,
      receiptRecordHash,receiptRowHash,receiptIdHash:authenticatedHostedDigest(receipt.id),
      auditRecordHash,auditRowHash,commandIdHash:authenticatedHostedDigest(assessment.id),
      expectedVersion:body.expectedVersion,committedVersion:assessment.version,scoreVersion:'assess-core-2026-05',
      beforeCapturedAt:input.before.capturedAt,afterCapturedAt:input.after.capturedAt,
    });
  };

  return {
    async verifyReviewerSelectionAction({ project, actorId, requestBody, responseBody, status }) {
      const commandType=requestBody?.commandType;
      const requestId=requestBody?.requestId;
      const idempotencyKey=requestBody?.idempotencyKey;
      const caseId=requestBody?.payload?.caseId;
      const decisionId=requestBody?.payload?.decisionId;
      const expectedVersion=requestBody?.expectedVersion;
      const authorizationVersion=requestBody?.authorizationVersion;
      const payload=requestBody?.payload;
      const envelopeKeys=['requestId','idempotencyKey','commandType','organizationId','workspaceId',
        'authorizationVersion','expectedVersion','payload'];
      const payloadKeys=commandType==='assessment_v2.review.assign'
        ? ['caseId','decisionId','reviewSequence','reviewerId']
        : ['caseId','decisionId','reviewSequence','resolution','rationale','conditions'];
      const payloadShape=commandType==='assessment_v2.review.assign'
        ? uuid(payload?.reviewerId)&&payload.reviewerId===actorId
        : ['approved','changes_requested','rejected'].includes(payload?.resolution)
          &&typeof payload?.rationale==='string'&&payload.rationale.trim().length>0&&payload.rationale.length<=4000
          &&Array.isArray(payload?.conditions)&&payload.conditions.length<=100
          &&payload.conditions.every(item=>typeof item==='string'&&item.trim().length>0&&item.length<=500);
      if(actorId!==project?.identities?.reviewer?.id
        || !REVIEWER_COMMANDS.includes(commandType)
        || !reviewerExactKeys(requestBody,envelopeKeys)||!reviewerExactKeys(payload,payloadKeys)
        || !uuid(requestId)||!REVIEWER_IDEMPOTENCY_KEY.test(idempotencyKey??'')
        || requestBody.organizationId!==config.scope.organizationId
        || requestBody.workspaceId!==config.scope.workspaceId
        || !Number.isSafeInteger(authorizationVersion)||authorizationVersion<1
        || !Number.isSafeInteger(expectedVersion)||expectedVersion<1
        || !uuid(caseId)||!uuid(decisionId)
        || !Number.isSafeInteger(payload.reviewSequence)||payload.reviewSequence<1||!payloadShape){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_BINDING_REJECTED');
      }
      const stale=status===409&&responseBody?.error?.code==='VERSION_CONFLICT';
      if(status!==200&&!stale)throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_STATUS_REJECTED');
      const receipts=(await query(`SELECT id,status,request_id,request_hash,idempotency_key,
          request_id=$5::uuid exact_request_matches,
          idempotency_key=$6 semantic_key_matches,
          response->>'caseId'=$7::text case_resource_matches,
          encode(public.digest(concat_ws('|',$4::text,$1::uuid,$2::uuid,$7::uuid,$8::uuid,$9::bigint,$10::jsonb::text),'sha256'),'hex') expected_request_hash
        FROM public.assess_command_receipts
        WHERE org_id=$1 AND workspace_id=$2 AND actor_id=$3 AND command_type=$4
          AND (request_id=$5::uuid OR idempotency_key=$6)
        ORDER BY created_at,id LIMIT 3`,[...scopeParams(),actorId,commandType,requestId,idempotencyKey,
        caseId,decisionId,expectedVersion,JSON.stringify(payload)])).rows;
      if(stale){
        if(receipts.length!==0)throw new Error('AUTHENTICATED_HOSTED_REVIEWER_STALE_WRITE_REJECTED');
        return Object.freeze({commandIdHash:null,receiptIdHash:null,reviewerSelectionProof:null});
      }
      const receipt=receipts[0];
      if(receipts.length!==1||!uuid(receipt?.id)||receipt?.semantic_key_matches!==true
        ||receipt?.idempotency_key!==idempotencyKey){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_RECEIPT_COUNT_REJECTED');
      }
      if(receipt.status!=='succeeded')throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_RECEIPT_STATUS_REJECTED');
      if(typeof receipt.request_hash!=='string'||!/^[0-9a-f]{64}$/u.test(receipt.request_hash)
        ||receipt.request_hash!==receipt.expected_request_hash){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_SEMANTIC_BINDING_REJECTED');
      }
      if(receipt.case_resource_matches!==true){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_RECEIPT_RESOURCE_REJECTED');
      }
      if(!['committed','replayed'].includes(responseBody?.outcome)){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_OUTCOME_REJECTED');
      }
      if(responseBody?.resource?.caseId!==caseId){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_RESPONSE_RESOURCE_REJECTED');
      }
      if(!uuid(receipt.request_id)
        ||(responseBody.outcome==='committed'&&(receipt.request_id!==requestId||receipt.exact_request_matches!==true))
        ||(responseBody.outcome==='replayed'&&(receipt.request_id===requestId||receipt.exact_request_matches!==false))){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_ACTION_RECEIPT_ORIGIN_REJECTED');
      }
      const { requestId: _requestId, ...semanticEnvelope }=requestBody;
      return Object.freeze({
        commandIdHash:authenticatedHostedDigest(caseId),
        receiptIdHash:authenticatedHostedDigest(receipt.id),
        reviewerSelectionProof:Object.freeze({
          receiptOriginRequestIdHash:authenticatedHostedDigest(receipt.request_id),
          semanticRequestHash:`sha256:${receipt.request_hash}`,
          idempotencyKeyHash:authenticatedHostedDigest(idempotencyKey),
          semanticEnvelopeHash:authenticatedHostedDigest(semanticEnvelope),
        }),
      });
    },
    async verifyReviewerSelectionCandidates({ project, reviewerAccessToken, reviewerActorId, signal }) {
      if (typeof reviewerAccessToken !== 'string' || reviewerAccessToken.length < 32
        || reviewerActorId !== project?.identities?.reviewer?.id) {
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_CANDIDATE_SESSION_REJECTED');
      }
      const targets=(await query(`SELECT c.id case_id,d.id decision_id
        FROM public.assess_v2_cases c
        JOIN public.assess_v2_decision_versions d ON d.case_id=c.id AND d.org_id=c.org_id AND d.workspace_id=c.workspace_id
          AND d.source_version_id=c.head_version_id
        WHERE c.org_id=$1 AND c.workspace_id=$2 AND c.process_id=$3
          AND c.owner_id=$4 AND c.status='reviewer_ready' AND c.deleted_at IS NULL
          AND d.validation_status='reviewer-ready'
        ORDER BY c.updated_at DESC,c.id DESC,d.id DESC LIMIT 2`,
      [...scopeParams(),project.processId,project.identities.author.id])).rows;
      const target=targets[0];
      if (targets.length !== 1 || !target || !uuid(target.case_id) || !uuid(target.decision_id)) {
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_CANDIDATE_TARGET_REJECTED');
      }
      const response=await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/assess_v2_eligible_reviewers`,{
        method:'POST',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS)])
          :AbortSignal.timeout(AUTHENTICATED_HOSTED_OPERATION_TIMEOUT_MS),
        headers:{apikey:config.serviceRoleKey,authorization:`Bearer ${reviewerAccessToken}`,'content-type':'application/json'},
        body:JSON.stringify({p_org_id:config.scope.organizationId,p_workspace_id:config.scope.workspaceId,
          p_case_id:target.case_id,p_decision_id:target.decision_id}),
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok||!Array.isArray(body)||body.some(item=>!item||typeof item!=='object'||Array.isArray(item)
        ||typeof item.actorId!=='string')){
        throw new Error('AUTHENTICATED_HOSTED_REVIEWER_CANDIDATE_RPC_REJECTED');
      }
      const candidateIds=body.map(item=>item.actorId);
      return Object.freeze({count:candidateIds.length,
        reviewerIncluded:candidateIds.includes(project.identities.reviewer.id),
        ownerExcluded:!candidateIds.includes(project.identities.author.id),
        approverExcluded:!candidateIds.includes(project.identities.approver.id),
        outsiderExcluded:!candidateIds.includes(project.identities.outsider.id)});
    },
    async verifyGovernStudioDiagnosticLineage({ project, actions, signal }) {
      if (signal?.aborted || !project?.processId || !project?.identities?.reviewer?.id
        || !project?.identities?.approver?.id || !Array.isArray(actions) || actions.length!==8) {
        throw new Error('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_INPUT_REJECTED');
      }
      const capability=(await query(`WITH active_roles AS(
          SELECT m.user_id,m.role_id FROM public.organization_members m
          WHERE m.org_id=$1 AND m.user_id=ANY($3::uuid[]) AND m.status='active'
            AND m.disabled_at IS NULL AND m.deleted_at IS NULL
          UNION ALL
          SELECT m.user_id,m.role_id FROM public.workspace_memberships m
          WHERE m.org_id=$1 AND m.workspace_id=$2 AND m.user_id=ANY($3::uuid[]) AND m.status='active'
            AND m.disabled_at IS NULL AND m.deleted_at IS NULL
        ) SELECT
          (SELECT count(*)::int FROM public.organization_members m WHERE m.org_id=$1 AND m.user_id=$4
            AND m.status='active' AND m.disabled_at IS NULL AND m.deleted_at IS NULL) reviewer_org_memberships,
          (SELECT count(*)::int FROM public.workspace_memberships m WHERE m.org_id=$1 AND m.workspace_id=$2
            AND m.user_id=$4 AND m.status='active' AND m.disabled_at IS NULL AND m.deleted_at IS NULL) reviewer_workspace_memberships,
          (SELECT count(*)::int FROM public.organization_members m WHERE m.org_id=$1 AND m.user_id=$5
            AND m.status='active' AND m.disabled_at IS NULL AND m.deleted_at IS NULL) approver_org_memberships,
          (SELECT count(*)::int FROM public.workspace_memberships m WHERE m.org_id=$1 AND m.workspace_id=$2
            AND m.user_id=$5 AND m.status='active' AND m.disabled_at IS NULL AND m.deleted_at IS NULL) approver_workspace_memberships,
          EXISTS(SELECT 1 FROM active_roles r JOIN public.role_capabilities rc ON rc.role_id=r.role_id
            WHERE r.user_id=$4 AND rc.capability_key='assess.v2.govern.resolve') reviewer_govern,
          EXISTS(SELECT 1 FROM active_roles r JOIN public.role_capabilities rc ON rc.role_id=r.role_id
            WHERE r.user_id=$5 AND rc.capability_key='assess.v2.govern.resolve') approver_govern`,
      [...scopeParams(),[project.identities.reviewer.id,project.identities.approver.id],
        project.identities.reviewer.id,project.identities.approver.id])).rows[0];
      const lineage=(await query(`WITH project_cases AS(
          SELECT * FROM public.assess_v2_cases
          WHERE org_id=$1 AND workspace_id=$2 AND process_id=$3 AND deleted_at IS NULL
        ), exact_lineage AS(
          SELECT c.id case_id,c.version case_version,decision.id decision_id,
            review.id review_id,review.request_id review_request_id,review.receipt_id review_receipt_id,
            review.reviewer_id,
            govern.id govern_id,govern.source_case_version,upstream.id assess_handoff_id,
            govern.request_id govern_request_id,govern.receipt_id govern_receipt_id,govern.resolver_id,
            upstream.request_id handoff_request_id,upstream.receipt_id handoff_receipt_id,upstream.handed_off_by,
            module.id module_handoff_id,package.id source_package_id,package.artifact_id,
            consumption.id consumption_id
          FROM project_cases c
          JOIN public.assess_v2_decision_versions decision ON decision.case_id=c.id
            AND decision.source_version_id=c.head_version_id
          JOIN public.assess_v2_review_resolutions review ON review.case_id=c.id AND review.decision_id=decision.id
            AND review.source_version_id=decision.source_version_id AND review.resolution='approved'
          JOIN public.assess_v2_govern_resolutions govern ON govern.case_id=c.id AND govern.decision_id=decision.id
            AND govern.review_resolution_id=review.id AND govern.source_version_id=decision.source_version_id
          JOIN public.assess_v2_studio_handoffs upstream ON upstream.case_id=c.id AND upstream.decision_id=decision.id
            AND upstream.review_resolution_id=review.id AND upstream.govern_resolution_id=govern.id
          JOIN public.enterprise_module_handoffs module ON module.org_id=c.org_id AND module.workspace_id=c.workspace_id
            AND module.upstream_handoff_id=upstream.id AND module.upstream_package_hash=upstream.package_hash
            AND module.status='consumed'
          JOIN public.enterprise_module_handoff_consumptions consumption ON consumption.handoff_id=module.id
            AND consumption.org_id=module.org_id AND consumption.workspace_id=module.workspace_id
          JOIN public.studio_artifact_source_packages package ON package.id=consumption.source_package_id
            AND package.artifact_id=consumption.artifact_id AND package.org_id=module.org_id
            AND package.workspace_id=module.workspace_id AND package.assess_handoff_id=upstream.id
            AND package.assess_package_hash=upstream.package_hash AND package.source_mode='assess_handoff'
        ) SELECT
          (SELECT count(*)::int FROM project_cases) case_count,
          (SELECT count(*)::int FROM exact_lineage) lineage_count,
          (SELECT count(*)::int FROM public.assess_v2_review_resolutions r JOIN project_cases c ON c.id=r.case_id
            WHERE r.resolution='approved') approved_reviews,
          (SELECT count(*)::int FROM public.assess_v2_govern_resolutions g JOIN project_cases c ON c.id=g.case_id) govern_resolutions,
          (SELECT count(*)::int FROM public.assess_v2_studio_handoffs h JOIN project_cases c ON c.id=h.case_id) assess_handoffs,
          (SELECT count(*)::int FROM public.enterprise_module_handoffs h JOIN exact_lineage x ON x.module_handoff_id=h.id) module_handoffs,
          (SELECT count(*)::int FROM public.studio_artifact_source_packages p JOIN exact_lineage x ON x.source_package_id=p.id) source_packages,
          (SELECT count(*)::int FROM public.studio_artifact_generation_attempts a JOIN exact_lineage x ON x.artifact_id=a.artifact_id) generation_attempts,
          (SELECT coalesce(jsonb_agg(jsonb_build_object('commandType',r.command_type,'requestId',r.request_id,
              'receiptId',r.id,'actorId',r.actor_id,'resourceId',r.resource_id)
            ORDER BY array_position(ARRAY['studio.handoff.request','studio.handoff.review.resolve',
              'studio.handoff.approval.resolve','studio.handoff.consume'],'studio.'||r.command_type)),'[]'::jsonb)
            FROM public.enterprise_module_handoff_command_receipts r CROSS JOIN exact_lineage x
            WHERE r.org_id=$1 AND r.workspace_id=$2 AND r.status='committed'
              AND r.command_type=ANY(ARRAY['handoff.request','handoff.review.resolve',
                'handoff.approval.resolve','handoff.consume'])
              AND r.response->>'handoffId'=x.module_handoff_id::text) module_receipts,
          (SELECT jsonb_build_object('case',case_id,'decision',decision_id,'review',review_id,'govern',govern_id,
            'assessHandoff',assess_handoff_id,'moduleHandoff',module_handoff_id,'sourcePackage',source_package_id,
            'artifact',artifact_id,'consumption',consumption_id,
            'reviewRequest',review_request_id,'reviewReceipt',review_receipt_id,'reviewer',reviewer_id,
            'governRequest',govern_request_id,'governReceipt',govern_receipt_id,'resolver',resolver_id,
            'handoffRequest',handoff_request_id,'handoffReceipt',handoff_receipt_id,'handoffActor',handed_off_by)
            FROM exact_lineage LIMIT 1) binding,
          (SELECT case_version>source_case_version FROM exact_lineage LIMIT 1) case_version_advanced
        `,[...scopeParams(),project.processId])).rows[0];
      const activeMemberships=capability?.reviewer_org_memberships===1&&capability?.reviewer_workspace_memberships===1
        &&capability?.approver_org_memberships===1&&capability?.approver_workspace_memberships===1;
      const binding=lineage?.binding;
      const moduleReceipts=Array.isArray(lineage?.module_receipts)?lineage.module_receipts:[];
      const actionBound=(action,row)=>row&&authenticatedHostedDigest(row.actorId)===action?.actorHash
        &&authenticatedHostedDigest(row.requestId)===action?.requestIdHash
        &&authenticatedHostedDigest(row.receiptId)===action?.response?.receiptIdHash;
      const durableBindings=[
        [actions[0],binding&&{actorId:binding.reviewer,requestId:binding.reviewRequest,receiptId:binding.reviewReceipt}],
        [actions[2],binding&&{actorId:binding.resolver,requestId:binding.governRequest,receiptId:binding.governReceipt}],
        [actions[3],binding&&{actorId:binding.handoffActor,requestId:binding.handoffRequest,receiptId:binding.handoffReceipt}],
        ...moduleReceipts.map((row,index)=>[actions[index+4],row]),
      ];
      const changedSources=action=>{
        const before=new Map((action?.before?.records??[]).map(row=>[row.recordHash,row]));
        const after=new Map((action?.after?.records??[]).map(row=>[row.recordHash,row]));
        return [...new Set([...before.keys(),...after.keys()])].filter(key=>{
          const left=before.get(key);const right=after.get(key);
          return !left||!right||left.rowHash!==right.rowHash||left.active!==right.active;
        }).map(key=>(after.get(key)??before.get(key))?.source).sort();
      };
      const denialChanges=changedSources(actions[1]);
      const governChanges=changedSources(actions[2]);
      const denialActorBound=authenticatedHostedDigest(project.identities.reviewer.id)===actions[1]?.actorHash;
      const requestResources=[binding?.case,binding?.case,binding?.case,binding?.case,
        binding?.assessHandoff,binding?.moduleHandoff,binding?.moduleHandoff,binding?.moduleHandoff];
      const requestResourcesBound=requestResources.every((resourceId,index)=>uuid(resourceId??'')
        &&authenticatedHostedDigest(resourceId)===actions[index]?.requestResourceIdHash);
      const responseResourcesBound=uuid(binding?.case??'')&&uuid(binding?.artifact??'')
        &&[0,2,3].every(index=>authenticatedHostedDigest(binding.case)===actions[index]?.response?.commandIdHash)
        &&[4,5,6].every(index=>authenticatedHostedDigest(binding.moduleHandoff)===actions[index]?.response?.commandIdHash)
        &&authenticatedHostedDigest(binding.artifact)===actions[7]?.response?.commandIdHash;
      const receiptResourcesBound=moduleReceipts.every((row,index)=>{
        const expected=index===3?binding?.artifact:binding?.moduleHandoff;
        return uuid(row.resourceId??'')&&row.resourceId===expected;
      });
      if (!activeMemberships || capability?.reviewer_govern !== false || capability?.approver_govern !== true
        || lineage?.case_count !== 1 || lineage?.lineage_count !== 1 || lineage?.approved_reviews !== 1
        || lineage?.govern_resolutions !== 1 || lineage?.assess_handoffs !== 1
        || lineage?.module_handoffs !== 1 || lineage?.source_packages !== 1
        || lineage?.generation_attempts !== 0 || lineage?.case_version_advanced !== true
        || !binding || Object.values(binding).some(item => !uuid(item))
        || moduleReceipts.length!==4
        || !moduleReceipts.every((row,index)=>`studio.${row.commandType}`===actions[index+4]?.commandType)
        || durableBindings.length!==7 || !durableBindings.every(([action,row])=>actionBound(action,row))
        || !denialActorBound || !requestResourcesBound || !responseResourcesBound || !receiptResourcesBound
        || denialChanges.length!==0
        || JSON.stringify(governChanges)!==JSON.stringify([
          'assess_command_receipts','assess_v2_cases','assess_v2_govern_resolutions','privileged_audit_events'])) {
        throw new Error('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_REJECTED');
      }
      return Object.freeze({
        schemaVersion:'authenticated-govern-studio-lineage-v1',verified:true,
        reviewerGovernCapabilityAbsent:true,approverGovernCapabilityPresent:true,
        approvedReviewCount:1,governResolutionCount:1,studioHandoffCount:1,
        moduleHandoffCount:1,studioSourcePackageCount:1,
        sameScope:true,sameCase:true,sameDecision:true,sameReviewResolution:true,
        sameGovernResolution:true,sameAssessHandoff:true,sameModuleHandoff:true,sameSourcePackage:true,
        expectedCaseVersionAdvanced:true,
        governCaseWrites:1,governResolutionWrites:1,governReceiptWrites:1,governAuditWrites:1,governOtherWrites:0,
        providerCalls:0,paidCalls:0,lineageDigest:authenticatedHostedDigest({binding,moduleReceipts}),
      });
    },
    async preflight() {
      return withAuthenticatedHostedDiagnostic('DATABASE_SCOPE_BASELINE', async () => {
      observationStartedAt=iso((await query('SELECT statement_timestamp() value')).rows[0].value);
      if(!observationStartedAt)throw new Error('AUTHENTICATED_HOSTED_CUTOFF_REJECTED');
      nonExerciseStateBeforeHash=await nonExerciseState([]);
      const deployment=await withAuthenticatedHostedDiagnostic('DEPLOYMENT_INVENTORY', verifyDeployment);
      const secret=await withAuthenticatedHostedDiagnostic('NATIVE_VAULT', verifySecretBackend);
      const dbState=await query(`SELECT
          (SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1) migration_version,
          (SELECT enabled FROM public.studio_artifact_runtime_control WHERE singleton) studio_enabled,
          (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton) studio_provider,
          (SELECT enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) ei_enabled,
          (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) ei_provider,
          (SELECT read_only FROM public.enterprise_intelligence_runtime_control WHERE singleton) ei_read_only,
          (SELECT read_only FROM public.studio_artifact_runtime_control WHERE singleton) studio_read_only,
          EXISTS(SELECT 1 FROM public.organizations WHERE id=$1 AND status='active' AND deleted_at IS NULL
            AND coalesce((settings->>'synthetic')::boolean,false)) synthetic_org,
          EXISTS(SELECT 1 FROM public.workspaces WHERE id=$2 AND org_id=$1 AND status='active' AND deleted_at IS NULL
            AND coalesce((metadata->>'synthetic')::boolean,false)) synthetic_workspace,
          (SELECT count(*)::int FROM public.roles WHERE id=ANY($3::uuid[]) AND status='active' AND deleted_at IS NULL
            AND org_id=$1 AND workspace_id IS NULL AND scope='organization') scope_roles,
          EXISTS(SELECT 1 FROM public.process_update_workspace_controls WHERE org_id=$1 AND workspace_id=$2
            AND enabled AND NOT read_only) process_update_ready,
          EXISTS(SELECT 1 FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2) workspace_flags_ready,
          EXISTS(SELECT 1 FROM public.legacy_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2) legacy_control_ready,
          EXISTS(SELECT 1 FROM public.studio_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2) studio_delivery_control_ready,
          (SELECT count(*)::int FROM public.studio_system_template_versions WHERE superseded_at IS NULL) system_templates,
          (SELECT count(*)::int FROM public.enterprise_ai_capability_routes WHERE org_id=$1 AND workspace_id=$2 AND enabled) enabled_provider_routes,
          (SELECT count(*)::int FROM public.profiles p JOIN public.organization_members m ON m.user_id=p.id AND m.org_id=$1
            WHERE coalesce((p.metadata->>'synthetic')::boolean,false)=false) customer_rows,
          ${AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL} active_residue`,
        [config.scope.organizationId,config.scope.workspaceId,Object.values(config.scope.roleIds)]);
      const capabilityState=await query(
        'SELECT role_id,capability_key FROM public.role_capabilities WHERE role_id=ANY($1::uuid[])',
        [Object.values(config.scope.roleIds)]);
      const row = dbState.rows[0];
      const capabilitiesByRole=new Map(Object.values(config.scope.roleIds).map(roleId=>[roleId,new Set()]));
      for(const capability of capabilityState.rows)capabilitiesByRole.get(capability.role_id)?.add(capability.capability_key);
      const rolesReady=AUTHENTICATED_HOSTED_PERSONAS.every(persona=>{
        const actual=capabilitiesByRole.get(config.scope.roleIds[persona]);
        return actual&&REQUIRED_PERSONA_CAPABILITIES[persona].every(item=>actual.has(item))
          &&FORBIDDEN_PERSONA_CAPABILITIES[persona].every(item=>!actual.has(item));
      });
      const runtimeReady=row.studio_enabled===true&&row.studio_read_only===false&&row.studio_provider===false
        &&row.ei_enabled===true&&row.ei_read_only===false&&row.ei_provider===false
        &&row.process_update_ready===true&&row.workspace_flags_ready===true&&row.legacy_control_ready===true
        &&row.studio_delivery_control_ready===true&&row.system_templates>0&&row.enabled_provider_routes===0;
      return { syntheticTarget: deployment.syntheticTarget, production: deployment.production,
        releaseSha: deployment.releaseSha, deploymentId: deployment.deploymentId,
        ...(deployment.executionKind === 'local_real_backend_authenticated'
          ? { executionKind: deployment.executionKind, buildDigest: deployment.buildDigest } : {}),
        backendDigest: deployment.backendDigest,
        migrationVersion: row.migration_version,
        providersEnabled: row.studio_provider || row.ei_provider,runtimeReady,
        secretBackendKind: secret.kind, secretBackendWritable: secret.writable,
        publicTargetDigest: deployment.publicTargetDigest,
        baselineDigest: nonExerciseStateBeforeHash,
        customerRows: row.customer_rows, unapprovedActiveResidue: row.active_residue,
        scopeReady:row.synthetic_org===true&&row.synthetic_workspace===true&&row.scope_roles===4&&rolesReady,
        observationStartedAt };
      });
    },
    activate: input => withAuthenticatedHostedDiagnostic('ACTIVATION', () => {
      if (config.executionKind === 'local_real_backend_authenticated') {
        if (!digest(config.buildDigest)
          || input.deploymentId !== null
          || input.origin !== 'http://127.0.0.1:4173'
          || input.profileVersion !== 'local-real-backend-authenticated-profile-v1') {
          throw new Error('AUTHENTICATED_HOSTED_LOCAL_REAL_BACKEND_ACTIVATION_IDENTITY_REJECTED');
        }
        return authority('authenticated_synthetic_local_exercise_activate', [input.exerciseId,input.releaseSha,
          config.buildDigest,input.origin,input.backendDigest,input.migrationVersion,input.migrationDigest,input.exerciseDigest,
          input.profileVersion,input.catalogDigest,input.sourceDigest,
          input.organizationId,input.workspaceId,input.expiresAt]);
      }
      if ((config.executionKind !== undefined && config.executionKind !== 'hosted_authenticated_synthetic')
        || (config.buildDigest !== undefined && config.buildDigest !== null)) {
        throw new Error('AUTHENTICATED_HOSTED_ACTIVATION_IDENTITY_REJECTED');
      }
      return authority('authenticated_synthetic_exercise_activate', [input.exerciseId,input.releaseSha,
        input.deploymentId,input.origin,input.backendDigest,input.migrationVersion,input.migrationDigest,input.exerciseDigest,
        input.profileVersion,input.catalogDigest,input.sourceDigest,
        input.organizationId,input.workspaceId,input.expiresAt]);
    }),
    bindSession: input => authority('authenticated_synthetic_bind_session',
      [input.exerciseId,input.actorId,input.sessionId,input.persona]),
    armPermit: input => authority('authenticated_synthetic_arm_permit', [input.exerciseId,input.permitId,input.kind,
      input.commandType,input.actorId,input.sessionId,input.requestId,input.payloadHash,input.expectedVersion,
      input.expiresAt]),
    quiesce: input => authority('authenticated_synthetic_quiesce', [input.exerciseId]),
    verifyAssessmentFinalizeCase,
    async setupProject({ projectName, exerciseId, identities }) {
      sequence += 1;
      const processId = randomUUID(); const projectId = randomUUID();
      const fixtureIdentity = authenticatedHostedFixtureIdentity({
        runId: config.workflow.runId,
        attempt: config.workflow.attempt,
        exerciseId,
        projectName,
      });
      let capturedDeliveryControls = null;
      let capturedWorkspaceFlags = null;
      let createdProviderFixture = null;
      let studioTemplate = null;
      await query('BEGIN');
      try {
        studioTemplate=authenticatedHostedSystemBrdTemplateBinding((await query(`SELECT id,template_version
          FROM public.studio_system_template_versions
          WHERE artifact_type='brd' AND superseded_at IS NULL FOR SHARE`)).rows);
        if(!deliveryControlsBefore){
          capturedDeliveryControls={
            legacy:(await query('SELECT writes_enabled FROM public.legacy_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2 FOR UPDATE',scopeParams())).rows[0]??null,
            studio:(await query(`SELECT publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled
              FROM public.studio_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2 FOR UPDATE`,scopeParams())).rows[0]??null,
          };
          capturedWorkspaceFlags=(await query(`SELECT unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled
            FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2 FOR UPDATE`,scopeParams())).rows[0]??null;
        }
        for (const persona of AUTHENTICATED_HOSTED_PERSONAS) {
          const actor = identities[persona];
          await query(`INSERT INTO public.profiles(id,email,full_name,status,metadata) VALUES($1,$2,$3,'active',$4::jsonb)
            ON CONFLICT(id) DO UPDATE SET status='active',metadata=excluded.metadata`,
          [actor.id,actor.email,`Hosted ${persona}`,JSON.stringify({ synthetic:true,exerciseDigest:config.exerciseDigest,persona })]);
          await query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status)
            VALUES($1,$2,$3,'active') ON CONFLICT DO NOTHING`,
          [config.scope.organizationId,actor.id,config.scope.roleIds[persona]]);
          await query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status)
            VALUES($1,$2,$3,'active') ON CONFLICT DO NOTHING`,
          [config.scope.organizationId,config.scope.workspaceId,actor.id]);
          const membership=(await query(`SELECT
            EXISTS(SELECT 1 FROM public.organization_members WHERE org_id=$1 AND user_id=$3
              AND role_id=$4 AND status='active' AND deleted_at IS NULL) organization,
            EXISTS(SELECT 1 FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$2
              AND user_id=$3 AND role_id IS NULL AND status='active' AND deleted_at IS NULL) workspace`,
          [...scopeParams(),actor.id,config.scope.roleIds[persona]])).rows[0];
          if(!membership?.organization||!membership?.workspace)throw new Error('AUTHENTICATED_HOSTED_MEMBERSHIP_REUSE_REJECTED');
        }
        await query(`INSERT INTO public.assess_processes(
          id,org_id,workspace_id,name,description,department,criticality,status,owner_id,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,'Draft',$8,$8,$8)`,[
          processId,...scopeParams(),fixtureIdentity.processName,
          AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.description,
          AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.department,
          AUTHENTICATED_HOSTED_SYNTHETIC_PROCESS_METADATA.criticality,
          identities.author.id,
        ]);
        await query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id)
          VALUES($1,$2,$3,$4,$5,$5,$5,$6)`,[projectId,...scopeParams(),fixtureIdentity.deliveryProjectName,identities.author.id,processId]);
        await query(`INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true)
          ON CONFLICT(org_id,workspace_id) DO UPDATE SET writes_enabled=true,updated_at=statement_timestamp()`,scopeParams());
        await query(`INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled)
          VALUES($1,$2,true,true,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET publication_writes_enabled=true,outcome_writes_enabled=true,pack_writes_enabled=true,updated_at=statement_timestamp()`,scopeParams());
        await query(`INSERT INTO public.enterprise_transcript_workspace_flags(
          org_id,workspace_id,unified_byok_gateway_enabled,studio_multisource_enabled,module_handoffs_enabled,updated_by)
          VALUES($1,$2,true,true,true,$3) ON CONFLICT(org_id,workspace_id) DO UPDATE SET
          unified_byok_gateway_enabled=true,studio_multisource_enabled=true,module_handoffs_enabled=true,
          updated_by=$3,updated_at=statement_timestamp()`,[...scopeParams(),identities.author.id]);
        if(!providerFixture){
          createdProviderFixture={active:randomUUID(),disabled:randomUUID(),unavailable:randomUUID()};
          await query(`INSERT INTO public.ai_provider_configs(id,org_id,provider,display_name,default_model,model_allowlist,endpoint_url,
            allowed_modes,allowed_operations,status,created_by,updated_by) VALUES
            ($1,$4,'openai','Authenticated hosted synthetic','synthetic-disabled-model',ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],ARRAY['generate_document'],'pending_review',$5,$5),
            ($2,$4,'openai','Authenticated hosted disabled','synthetic-disabled-model',ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],ARRAY['generate_document'],'retired',$5,$5),
            ($3,$4,'openai','Authenticated hosted unavailable','synthetic-disabled-model',ARRAY['synthetic-disabled-model'],'https://api.openai.com',ARRAY['pilot'],ARRAY['generate_document'],'pending_review',$5,$5)`,
          [createdProviderFixture.active,createdProviderFixture.disabled,createdProviderFixture.unavailable,config.scope.organizationId,identities.author.id]);
        }
        await query('COMMIT');
        if(capturedDeliveryControls){
          deliveryControlsBefore=capturedDeliveryControls;
          workspaceFlagsBefore=capturedWorkspaceFlags;
        }
        if(createdProviderFixture)providerFixture=createdProviderFixture;
      } catch (error) { await query('ROLLBACK'); throw error; }
      const project = { projectName, processId, projectId, deliveryProject:{id:projectId,name:fixtureIdentity.deliveryProjectName},
        studioTemplate,
        aliases:{case:`primary-case-${sequence}`,review:`primary-review-${sequence}`,handoff:`primary-handoff-${sequence}`,
          artifact:`primary-artifact-${sequence}`,process:fixtureIdentity.processName} };
      projects.set(projectName, project);
      return project;
    },
    async recordBrowserAction({exerciseId,projectName,persona,route,status,requestBody,responseBody}){
      if(route==='/functions/v1/studio-delivery-outcome-query'&&persona==='outsider'&&typeof requestBody?.projectId==='string'){
        const serialized=JSON.stringify(responseBody??{});
        foreignOutcomeProbes.set(projectName,{status,disclosedIdentifiers:serialized.includes(requestBody.projectId),
          disclosedBlocker:/blocker/iu.test(serialized)});
      }
      if(route==='/functions/v1/enterprise-provider-lifecycle'&&requestBody?.operation==='provider.secret.bind'
        &&config.secretBackendKind==='supabase_vault'
        &&status>=200&&status<300&&typeof requestBody?.payload?.providerConfigId==='string'
        &&typeof requestBody?.payload?.providerKey==='string'){
        const safeFingerprint=`sha256:${createHash('sha256').update(requestBody.payload.providerKey).digest('hex').slice(0,24)}`;
        const material=(await query(`SELECT ref.id,ref.provider,ref.secret_backend_kind
          FROM public.ai_provider_configs config JOIN public.ai_provider_key_refs ref ON ref.id=config.key_ref_id
          WHERE config.id=$1 AND config.org_id=$2 AND ref.org_id=config.org_id AND ref.status='active'`,
        [requestBody.payload.providerConfigId,config.scope.organizationId])).rows;
        if(material.length!==1||material[0].secret_backend_kind!==config.secretBackendKind){
          throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_BINDING_REJECTED');
        }
        const observed=await observeSecretBackend({exerciseId,keyRefId:material[0].id,
          organizationId:config.scope.organizationId,provider:material[0].provider,safeFingerprint});
        if(observed?.backendKind!==config.secretBackendKind||observed?.exists!==true
          ||observed?.fingerprintMatches!==true||observed?.state!=='written'){
          throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_CREATION_REJECTED');
        }
        secretMaterialEvidence.set(projectName,{keyRefId:material[0].id,provider:material[0].provider,
          safeFingerprint,backendKind:observed.backendKind,exists:true,fingerprintMatches:true,state:observed.state});
      }
    },
    async verifySecretMaterialCase({projectName,testId}){
      if(testId!=='AI-004')throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_CASE_REJECTED');
      const observed=secretMaterialEvidence.get(projectName);
      return observed?{backendKind:observed.backendKind,exists:observed.exists,
        fingerprintMatches:observed.fingerprintMatches,state:observed.state}:null;
    },
    observe: input => observationReader.capture(input),
    async frame(pathname, { project, testId }) {
      if (pathname === '/control/process-frame') return processFrame(project);
      if (pathname === '/control/lifecycle-frame') return lifecycleFrame(project);
      if (pathname === '/control/assess-v2-frame') {
        const frame = await lifecycleFrame(project);
        return { caseCount:frame.cases,decisionCount:frame.decisions,receipts:frame.receipts,audits:frame.audits,targetHash:frame.targetHash };
      }
      if (pathname === '/control/studio-failure-frame') {
        const frame = await lifecycleFrame(project);
        const aggregate = (await query(`SELECT coalesce(max(a.aggregate_version),0)::int version FROM public.studio_artifact_aggregates a
          JOIN public.assess_v2_cases c ON c.id=a.case_id WHERE c.process_id=$1`,[project.processId])).rows[0];
        return { artifacts:frame.artifacts,aggregateVersion:aggregate.version,versions:frame.artifactVersions,
          generationAttempts:frame.generationAttempts,receipts:frame.receipts,audits:frame.audits,targetHash:frame.targetHash };
      }
      if (pathname === '/control/snapshot') return { reviewAssignments:(await lifecycleFrame(project)).assignments,
        governResolutions:(await lifecycleFrame(project)).governResolutions,
        commandReceipts:(await lifecycleFrame(project)).receipts,privilegedAudits:(await lifecycleFrame(project)).audits };
      if (pathname === '/control/authenticated-controls/frame') {
        const before = controlsBefore.get(testId);if(!before)throw new Error('AUTHENTICATED_HOSTED_CONTROL_BASELINE_MISSING');
        const after=await controlCounts();
        return { measured:{before,after,beforeState:before,afterState:after} };
      }
      if (pathname === '/control/scenario-decision') {
        const decision=(await query(`SELECT d.id,d.decision_version,d.rule_set_version,d.validation_status,d.output_hash,d.input_snapshot,d.output_snapshot
          FROM public.assess_v2_decision_versions d JOIN public.assess_v2_cases c ON c.id=d.case_id AND c.head_version_id=d.source_version_id
          WHERE c.org_id=$1 AND c.workspace_id=$2 AND c.process_id=$3 AND c.deleted_at IS NULL ORDER BY d.created_at DESC,d.id DESC LIMIT 1`,
        [...scopeParams(),project.processId])).rows[0];
        if(!decision) throw new Error('AUTHENTICATED_HOSTED_DECISION_NOT_FOUND');
        const persisted={decisionId:decision.id,decisionVersion:decision.decision_version,ruleSetVersion:decision.rule_set_version,
          validationStatus:decision.validation_status,outputHash:decision.output_hash,confidence:decision.output_snapshot.confidence,
          processReadiness:decision.output_snapshot.processReadiness,candidateEvaluations:decision.output_snapshot.candidateEvaluations,
          gateResults:decision.output_snapshot.gateResults,interactionDecisions:decision.output_snapshot.interactionDecisions,
          controlRequirements:decision.output_snapshot.controlRequirements,sourceInteractions:(decision.input_snapshot.interactions??[]).map(item=>({interactionId:item.id,mode:item.mode,highImpact:item.facts?.highImpact??null,financialAction:item.facts?.financialAction??null}))};
        return {...persisted,targetHash:authenticatedHostedDigest(persisted)};
      }
      if (pathname === '/control/downstream-frame') {
        const publication=(await query(`SELECT * FROM public.studio_delivery_publications WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 ORDER BY published_at DESC,id DESC LIMIT 1`,[...scopeParams(),project.projectId])).rows[0]??null;
        const tasks=(await query(`SELECT x.*,coalesce((SELECT jsonb_agg(a.assignee_id ORDER BY a.assignee_id) FROM public.legacy_delivery_work_item_assignees a WHERE a.work_item_id=x.id),'[]') assignee_ids FROM public.delivery_work_items x WHERE x.org_id=$1 AND x.workspace_id=$2 AND x.project_id=$3 AND x.authority_version IS NOT NULL ORDER BY x.source_item_index NULLS LAST,x.id`,[...scopeParams(),project.projectId])).rows;
        const outcomes=(await query(`SELECT a.id outcome_id,v.* FROM public.legacy_delivery_outcome_aggregates a JOIN public.legacy_delivery_outcome_versions v ON v.outcome_id=a.id WHERE a.org_id=$1 AND a.workspace_id=$2 AND a.project_id=$3 ORDER BY a.id,v.version`,[...scopeParams(),project.projectId])).rows;
        const latestPack=(await query(`SELECT * FROM public.legacy_delivery_pack_snapshots WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 ORDER BY version DESC,id DESC LIMIT 1`,[...scopeParams(),project.projectId])).rows[0]??null;
        const counts=(await query(`SELECT
          (SELECT count(*)::int FROM public.studio_delivery_publications WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) publications,
          (SELECT count(*)::int FROM public.document_generations WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND studio_delivery_publication_id IS NOT NULL) document_generations,
          (SELECT count(*)::int FROM public.legacy_delivery_imports WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) imports,
          (SELECT count(*)::int FROM public.delivery_work_items WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND authority_version IS NOT NULL AND retention_state='active') active_tasks,
          (SELECT count(*)::int FROM public.delivery_work_items WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3 AND authority_version IS NOT NULL AND retention_state IN('soft_deleted','retained')) retained_tasks,
          (SELECT count(*)::int FROM public.legacy_delivery_outcome_aggregates WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) outcome_aggregates,
          (SELECT count(*)::int FROM public.legacy_delivery_outcome_versions WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) outcome_versions,
          (SELECT count(*)::int FROM public.legacy_delivery_pack_snapshots WHERE org_id=$1 AND workspace_id=$2 AND project_id=$3) pack_snapshots,
          ((SELECT count(*) FROM public.studio_delivery_command_receipts WHERE org_id=$1 AND workspace_id=$2)+(SELECT count(*) FROM public.legacy_delivery_command_receipts WHERE org_id=$1 AND workspace_id=$2))::int receipts,
          (SELECT count(*)::int FROM public.privileged_audit_events WHERE org_id=$1 AND workspace_id=$2) audits`,[...scopeParams(),project.projectId])).rows[0];
        const protections=(await query(`SELECT
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.studio_delivery_publications'::regclass AND tgname='studio_delivery_publication_immutable' AND NOT tgisinternal) publication_immutable,
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.legacy_delivery_outcome_versions'::regclass AND tgname='legacy_delivery_outcome_version_immutable' AND NOT tgisinternal) outcome_version_immutable,
          EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.legacy_delivery_imports'::regclass AND contype='f') import_lineage_protected`)).rows[0];
        const state={publication,tasks,outcomes,latestPack};
        return {projectName:project.projectName??'',counts:{publications:counts.publications,documentGenerations:counts.document_generations,imports:counts.imports,activeTasks:counts.active_tasks,retainedTasks:counts.retained_tasks,outcomeAggregates:counts.outcome_aggregates,outcomeVersions:counts.outcome_versions,commandReceipts:counts.receipts,audits:counts.audits,packSnapshots:counts.pack_snapshots},
          publication:publication?{publicationId:publication.id,documentGenerationId:publication.document_generation_id,projectId:publication.project_id,artifactId:publication.studio_artifact_id,artifactVersionId:publication.studio_artifact_version_id,sourceProcessId:publication.source_process_id,sourceAssessmentId:publication.source_assessment_id,workItemDigest:publication.work_item_digest,workItemCount:publication.work_item_count}:null,
          tasks:tasks.map(item=>({id:item.id,version:Number(item.authority_version),title:item.title,description:item.description,status:item.status,assigneeIds:item.assignee_ids,projectId:item.project_id,documentGenerationId:item.document_generation_id,importId:item.legacy_import_id,sourceProcessId:item.source_process_id,sourceAssessmentId:item.source_assessment_id,sourceItemIndex:item.source_item_index,retentionState:item.retention_state})),
          outcomes:outcomes.map(item=>({outcomeId:item.outcome_id,version:Number(item.version),taskId:item.task_id,taskVersion:Number(item.task_version),status:item.status,label:item.label,detail:item.detail,documentGenerationId:item.document_generation_id,importId:item.legacy_import_id,artifactVersionId:item.studio_artifact_version_id})),
          latestPack:latestPack?{id:latestPack.id,version:Number(latestPack.version),projectId:latestPack.project_id,taskCount:latestPack.task_count,boundTaskCount:latestPack.bound_task_count,taskSetHash:latestPack.task_set_hash,receiptId:latestPack.receipt_id,auditEventId:latestPack.audit_event_id}:null,
          lineage:{chainCount:tasks.length,completeCount:tasks.filter(item=>item.document_generation_id&&item.legacy_import_id&&item.source_process_id&&item.source_assessment_id).length,complete:tasks.length>0&&tasks.every(item=>item.document_generation_id&&item.legacy_import_id&&item.source_process_id&&item.source_assessment_id),digest:authenticatedHostedDigest(state)},
          protections:{publicationImmutable:protections.publication_immutable===true,outcomeVersionImmutable:protections.outcome_version_immutable===true,importLineageProtected:protections.import_lineage_protected===true},
          foreignProbe:foreignOutcomeProbes.get(project.projectName)??null,writeFingerprint:authenticatedHostedDigest(state)};
      }
      throw new Error('AUTHENTICATED_HOSTED_FRAME_UNSUPPORTED');
    },
    async control(pathname, input) {
      const project = input.project;
      if(pathname==='/control/assess-v2-runtime') {
        if(input.enabled===false){
          if(assessControlLease)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_ALREADY_OWNED');
          await query('BEGIN');try{
            const prior=(await query('SELECT enabled,read_only,updated_at::text updated_at FROM public.assess_v2_runtime_control WHERE singleton FOR UPDATE')).rows[0];
            if(!prior||prior.enabled!==true)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_PRECONDITION_REJECTED');
            const owned=(await query(`UPDATE public.assess_v2_runtime_control SET enabled=false,updated_at=statement_timestamp()
              WHERE singleton AND enabled=$1 AND read_only=$2 AND updated_at=$3::timestamptz
              RETURNING updated_at::text owned_at`,[prior.enabled,prior.read_only,prior.updated_at])).rows[0];
            if(!owned)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_CAS_REJECTED');
            assessControlInitial??={enabled:prior.enabled,read_only:prior.read_only};
            assessControlLease={...prior,ownedAt:owned.owned_at};await query('COMMIT');
          }catch(error){await query('ROLLBACK');throw error;}
          return {enabled:false};
        }
        if(input.enabled===true){
          if(!assessControlLease)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_NOT_OWNED');
          const restored=(await query(`UPDATE public.assess_v2_runtime_control SET enabled=$1,read_only=$2,updated_at=statement_timestamp()
            WHERE singleton AND enabled=false AND read_only=$2 AND updated_at=$3::timestamptz
            RETURNING enabled,read_only,updated_at::text updated_at`,
          [assessControlLease.enabled,assessControlLease.read_only,assessControlLease.ownedAt])).rows[0];
          if(!restored)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_CONCURRENT_CHANGE');
          controlResources.push({kind:'assess_v2_runtime_control',resourceHash:authenticatedHostedDigest('assess_v2_runtime_control'),
            classification:'transient',status:'inactive',actorHash:null,sessionHash:null});assessControlLease=null;
          return {enabled:restored.enabled};
        }
        throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_INPUT_REJECTED');
      }
      if(pathname==='/control/bind-delivery-project-source') {
        const source=(await query(`SELECT id FROM public.assessments WHERE process_id=$1 AND org_id=$2 AND workspace_id=$3 AND deleted_at IS NULL AND status='Ready for Review' AND scores IS NOT NULL ORDER BY id`,[project.processId,...scopeParams()])).rows;
        if(source.length!==1) throw new Error('AUTHENTICATED_HOSTED_ASSESSMENT_SOURCE_REJECTED');
        await query('UPDATE public.projects SET source_assessment_id=$2,updated_at=statement_timestamp() WHERE id=$1',[project.projectId,source[0].id]);
        return {bound:true,project:{id:project.projectId},source:{processId:project.processId,assessmentId:source[0].id}};
      }
      if(pathname==='/control/restricted-delete') {
        await query('UPDATE public.organization_members SET role_id=$3 WHERE org_id=$1 AND user_id=$2',[config.scope.organizationId,project.identities?.reviewer?.id ?? input.actorId,input.enabled?config.scope.roleIds.outsider:config.scope.roleIds.reviewer]);
        return {enabled:input.enabled};
      }
      if(pathname==='/control/authenticated-controls/prepare') {
        if(!providerFixture)throw new Error('AUTHENTICATED_HOSTED_PROVIDER_FIXTURE_MISSING');
        const ai=/^AI-/u.test(input.testId);let selected=null;
        if(ai){
          await query('UPDATE public.ai_provider_configs SET deleted_at=statement_timestamp() WHERE org_id=$1 AND id=ANY($2::uuid[])',
          [config.scope.organizationId,Object.values(providerFixture)]);
          selected=input.testId==='AI-002'?providerFixture.disabled:input.testId==='AI-005'?providerFixture.unavailable:
            ['AI-003','AI-004'].includes(input.testId)?providerFixture.active:null;
          if(selected)await query('UPDATE public.ai_provider_configs SET deleted_at=NULL WHERE org_id=$1 AND id=$2',[config.scope.organizationId,selected]);
        }
        controlsBefore.set(input.testId,await controlCounts());
        const actorIds=[project.identities.author.id,project.identities.reviewer.id];
        const versions=(await query('SELECT user_id,version FROM public.authorization_versions WHERE org_id=$1 AND user_id=ANY($2::uuid[])',
        [config.scope.organizationId,actorIds])).rows;
        const byActor=new Map(versions.map(row=>[row.user_id,Number(row.version)]));
        const rendition=(await query(`SELECT rendition.id FROM public.studio_renditions rendition
          JOIN public.studio_artifact_aggregates artifact ON artifact.id=rendition.artifact_id
          JOIN public.assess_v2_cases assessed ON assessed.id=artifact.case_id WHERE assessed.process_id=$1
          ORDER BY rendition.created_at DESC,rendition.id DESC LIMIT 1`,[project.processId])).rows[0];
        return {organizationId:config.scope.organizationId,workspaceId:config.scope.workspaceId,providerConfigId:selected,
          adminAuthorizationVersion:byActor.get(project.identities.author.id)??null,
          nonAdminAuthorizationVersion:byActor.get(project.identities.reviewer.id)??null,renditionId:rendition?.id??null};
      }
      if(pathname==='/control/finalize-project') {
        const verified=(await query(`WITH project_cases AS(
          SELECT * FROM public.assess_v2_cases WHERE org_id=$2 AND workspace_id=$3 AND process_id=$1 AND deleted_at IS NULL
        ), exact_lineage AS(
          SELECT c.id case_id,handoff.id handoff_id,version.id generated_version_id
          FROM project_cases c
          JOIN public.assess_v2_decision_versions decision ON decision.case_id=c.id AND decision.source_version_id=c.head_version_id
          JOIN public.assess_v2_review_resolutions review ON review.case_id=c.id AND review.decision_id=decision.id
            AND review.source_version_id=decision.source_version_id AND review.resolution='approved'
          JOIN public.assess_v2_govern_resolutions govern ON govern.case_id=c.id AND govern.decision_id=decision.id
            AND govern.review_resolution_id=review.id AND govern.source_version_id=decision.source_version_id
          JOIN public.assess_v2_studio_handoffs handoff ON handoff.case_id=c.id AND handoff.decision_id=decision.id
            AND handoff.review_resolution_id=review.id AND handoff.govern_resolution_id=govern.id
          JOIN public.studio_artifact_source_packages package ON package.assess_handoff_id=handoff.id AND package.assess_package_hash=handoff.package_hash
          JOIN public.studio_artifact_aggregates artifact ON artifact.source_package_id=package.id AND artifact.case_id=c.id
          JOIN public.studio_artifact_generation_attempts attempt ON attempt.artifact_id=artifact.id
            AND attempt.source_package_id=package.id AND attempt.state='completed'
          JOIN public.studio_artifact_versions version ON version.id=artifact.current_version_id AND version.artifact_id=artifact.id
            AND version.generation_attempt_id=attempt.id
        ) SELECT (SELECT count(*)::int FROM project_cases) case_count,
          (SELECT count(*)=1 FROM project_cases WHERE process_id=$1) source_process_matched,
          EXISTS(SELECT 1 FROM exact_lineage) review_approved,EXISTS(SELECT 1 FROM exact_lineage) govern_resolved,
          (SELECT count(DISTINCT handoff_id)::int FROM exact_lineage) handoff_count,
          (SELECT count(DISTINCT generated_version_id)::int FROM exact_lineage) generation_completed_count`,
        [project.processId,...scopeParams()])).rows[0];
        const verification={caseCount:verified.case_count,sourceProcessMatched:verified.source_process_matched===true,
          reviewResolution:verified.review_approved===true?'approved':null,governResolved:verified.govern_resolved===true,
          studioHandoffCount:verified.handoff_count,generationCompletedCount:verified.generation_completed_count};
        const passed=verification.caseCount===1&&verification.sourceProcessMatched&&verification.reviewResolution==='approved'
          &&verification.governResolved&&verification.studioHandoffCount===1&&verification.generationCompletedCount===1;
        return {journeyBinding:authenticatedHostedDigest({exerciseId:input.exerciseId,projectName:input.projectName,releaseSha:config.releaseSha}),
          status:passed?'passed':'failed',verification};
      }
      throw new Error('AUTHENTICATED_HOSTED_CONTROL_UNSUPPORTED');
    },
    async cleanup({ exerciseId, projects: projectRows }) {
      const errors=[];
      try{immutableHistoryBeforeHash=await immutableExerciseState(exerciseId,projectRows);}
      catch(error){errors.push(error);}
      let secretRows=[];
      try{
        if(providerFixture&&config.secretBackendKind==='supabase_vault'){
          const inventory=(await query('SELECT public.enterprise_provider_secret_inventory($1,$2) value',
            [exerciseId,config.scope.organizationId])).rows[0]?.value;
          if(!Array.isArray(inventory))throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_INVENTORY_REJECTED');
          const inventoryIds=new Set(inventory.map(item=>item?.keyRefId));
          if(inventoryIds.size!==inventory.length||inventory.some(item=>!uuid(item?.keyRefId??'')
            ||item?.backendKind!=='supabase_vault'||!PROVIDER_NAMES.includes(item?.provider)
            ||!/^sha256:[0-9a-f]{24}$/u.test(item?.safeFingerprint??'')||item?.state!=='written')){
            throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_INVENTORY_REJECTED');
          }
          const refs=inventory.length?(await query(`SELECT id,provider,secret_ref,secret_backend_kind,safe_fingerprint
            FROM public.ai_provider_key_refs WHERE org_id=$1 AND id=ANY($2::uuid[])`,
          [config.scope.organizationId,[...inventoryIds]])).rows:[];
          const refsById=new Map(refs.map(ref=>[ref.id,ref]));
          secretRows=inventory.map(item=>{
            const ref=refsById.get(item.keyRefId);
            if(!ref||ref.provider!==item.provider||ref.secret_backend_kind!==item.backendKind
              ||ref.safe_fingerprint!==item.safeFingerprint||typeof ref.secret_ref!=='string'){
              throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_OWNERSHIP_REJECTED');
            }
            return {...ref,safe_fingerprint:item.safeFingerprint};
          });
        }else secretRows=providerFixture?(await query(`SELECT ref.id,ref.provider,ref.secret_ref,ref.secret_backend_kind,
            NULL::text safe_fingerprint FROM public.ai_provider_key_refs ref
          JOIN public.ai_provider_configs config ON config.key_ref_id=ref.id
          WHERE config.org_id=$1 AND config.id=ANY($2::uuid[]) AND ref.status='active'`,
        [config.scope.organizationId,Object.values(providerFixture)])).rows:[];
      }catch(error){errors.push(error);}
      for(const secret of secretRows)pendingSecretCleanup.set(secret.id,secret);
      if(config.secretBackendKind==='supabase_vault'){
        for(const secret of pendingSecretCleanup.values()){
          try{
            if(secret.secret_backend_kind!=='supabase_vault'||!/^sha256:[0-9a-f]{24}$/u.test(secret.safe_fingerprint??'')){
              throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_OWNERSHIP_REJECTED');
            }
            const observed=await observeSecretBackend({exerciseId,keyRefId:secret.id,
              organizationId:config.scope.organizationId,provider:secret.provider,safeFingerprint:secret.safe_fingerprint});
            if(observed?.backendKind!=='supabase_vault'||observed?.exists!==true
              ||observed?.fingerprintMatches!==true||observed?.state!=='written'){
              throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_INVENTORY_REJECTED');
            }
          }catch(error){errors.push(error);}
        }
      }else for(const secret of pendingSecretCleanup.values()){
        try{await cleanupSecretBackend({backendKind:secret.secret_backend_kind??'hashicorp_vault',keyRefId:secret.id,
          provider:secret.provider,secretRef:secret.secret_ref,organizationId:config.scope.organizationId});
          pendingSecretCleanup.delete(secret.id);}catch(error){errors.push(error);}
      }
      try {
        await query('BEGIN');
        const userIds=[...new Set(projectRows.flatMap(project=>AUTHENTICATED_HOSTED_PERSONAS.map(persona=>project.identities[persona].id)))];
        await query("UPDATE public.organization_members SET status='removed',deleted_at=statement_timestamp() WHERE org_id=$1 AND user_id=ANY($2::uuid[])",[config.scope.organizationId,userIds]);
        await query("UPDATE public.workspace_memberships SET status='removed',deleted_at=statement_timestamp() WHERE org_id=$1 AND workspace_id=$2 AND user_id=ANY($3::uuid[])",[...scopeParams(),userIds]);
        await query("UPDATE public.profiles SET status='disabled' WHERE id=ANY($1::uuid[])",[userIds]);
        if(secretRows.length)await query("UPDATE public.ai_provider_key_refs SET status='revoked',deleted_at=statement_timestamp() WHERE id=ANY($1::uuid[])",[secretRows.map(row=>row.id)]);
        if(providerFixture)await query('UPDATE public.ai_provider_configs SET deleted_at=statement_timestamp() WHERE id=ANY($1::uuid[])',[Object.values(providerFixture)]);
        if(deliveryControlsBefore){
        if(deliveryControlsBefore.legacy)await query(`UPDATE public.legacy_delivery_workspace_controls SET writes_enabled=$3,updated_at=statement_timestamp()
          WHERE org_id=$1 AND workspace_id=$2`,[...scopeParams(),deliveryControlsBefore.legacy.writes_enabled]);
        else await query('DELETE FROM public.legacy_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2',scopeParams());
        if(deliveryControlsBefore?.studio)await query(`UPDATE public.studio_delivery_workspace_controls SET publication_writes_enabled=$3,
          outcome_writes_enabled=$4,pack_writes_enabled=$5,updated_at=statement_timestamp() WHERE org_id=$1 AND workspace_id=$2`,
        [...scopeParams(),deliveryControlsBefore.studio.publication_writes_enabled,deliveryControlsBefore.studio.outcome_writes_enabled,deliveryControlsBefore.studio.pack_writes_enabled]);
        else await query('DELETE FROM public.studio_delivery_workspace_controls WHERE org_id=$1 AND workspace_id=$2',scopeParams());
        if(workspaceFlagsBefore)await query(`UPDATE public.enterprise_transcript_workspace_flags SET
          unified_byok_gateway_enabled=$3,studio_multisource_enabled=$4,module_handoffs_enabled=$5,updated_at=statement_timestamp()
          WHERE org_id=$1 AND workspace_id=$2`,[...scopeParams(),workspaceFlagsBefore.unified_byok_gateway_enabled,
          workspaceFlagsBefore.studio_multisource_enabled,workspaceFlagsBefore.module_handoffs_enabled]);
        else await query('DELETE FROM public.enterprise_transcript_workspace_flags WHERE org_id=$1 AND workspace_id=$2',scopeParams());
        }
        if(assessControlLease){
          const restored=(await query(`UPDATE public.assess_v2_runtime_control SET enabled=$1,read_only=$2,updated_at=statement_timestamp()
            WHERE singleton AND enabled=false AND read_only=$2 AND updated_at=$3::timestamptz RETURNING enabled`,
          [assessControlLease.enabled,assessControlLease.read_only,assessControlLease.ownedAt])).rows[0];
          if(!restored)throw new Error('AUTHENTICATED_HOSTED_ASSESS_CONTROL_CONCURRENT_CHANGE');
          controlResources.push({kind:'assess_v2_runtime_control',resourceHash:authenticatedHostedDigest('assess_v2_runtime_control'),classification:'transient',status:'inactive',actorHash:null,sessionHash:null});
          assessControlLease=null;
        }
        await query('COMMIT');
      } catch(error){
        try{await query('ROLLBACK');}catch(rollbackError){errors.push(rollbackError);}
        errors.push(error);
      }
      if(config.secretBackendKind==='supabase_vault'&&pendingSecretCleanup.size){
        try{
          await cleanupSecretBackend({backendKind:'supabase_vault',exerciseId,
            organizationId:config.scope.organizationId,secrets:[...pendingSecretCleanup.values()]});
          for(const secret of [...pendingSecretCleanup.values()]){
            const observed=await observeSecretBackend({exerciseId,keyRefId:secret.id,
              organizationId:config.scope.organizationId,provider:secret.provider,safeFingerprint:secret.safe_fingerprint});
            if(observed?.backendKind!=='supabase_vault'||observed?.exists!==false
              ||observed?.fingerprintMatches!==false||observed?.state!=='deleted'){
              throw new Error('AUTHENTICATED_HOSTED_SECRET_MATERIAL_RESIDUE');
            }
            pendingSecretCleanup.delete(secret.id);
            for(const evidence of secretMaterialEvidence.values())if(evidence.keyRefId===secret.id){
              evidence.absenceVerified=true;evidence.absentState=observed.state;
            }
          }
        }catch(error){errors.push(error);}
      }
      if(errors.length)throw new AggregateError(errors,'AUTHENTICATED_HOSTED_CLEANUP_INCOMPLETE');
      return {transientResourcesRemoved:true,secretReferencesRevoked:secretRows.length};
    },
    async verifyCleanup({ exerciseId,actorIds=[],projects:projectRows=[] }) {
      const state=(await query(`SELECT
        (SELECT count(*)::int FROM auth.sessions WHERE user_id=ANY($4::uuid[])) sessions,
        (SELECT count(*)::int FROM auth.users WHERE id=ANY($4::uuid[])
          AND (banned_until IS NULL OR banned_until<=statement_timestamp())) active_identities,
        ((SELECT count(*) FROM public.organization_members WHERE org_id=$2 AND user_id=ANY($4::uuid[]) AND status='active')+
          (SELECT count(*) FROM public.workspace_memberships WHERE org_id=$2 AND workspace_id=$5 AND user_id=ANY($4::uuid[]) AND status='active'))::int memberships,
        (SELECT count(*)::int FROM public.authenticated_synthetic_permits WHERE exercise_id=$1 AND state='armed') permits,
        (SELECT count(*)::int FROM public.ai_provider_key_refs ref JOIN public.ai_provider_configs config ON config.key_ref_id=ref.id
          WHERE config.org_id=$2 AND config.id=ANY($3::uuid[]) AND ref.status='active') secrets,
        ${AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL} active_residue,
        (SELECT lifecycle FROM public.authenticated_synthetic_exercises WHERE id=$1) exercise_lifecycle,
        (SELECT count(*)::int FROM public.authenticated_synthetic_permit_events WHERE exercise_id=$1) event_count`,
      [exerciseId,config.scope.organizationId,Object.values(providerFixture??{}),actorIds,config.scope.workspaceId])).rows[0];
      const resources=[...controlResources];
      for(const item of (await query('SELECT actor_id,session_id FROM public.authenticated_synthetic_actor_sessions WHERE exercise_id=$1',[exerciseId])).rows){resources.push({kind:'session',resourceHash:authenticatedHostedDigest(item.session_id),classification:'transient',status:'revoked',actorHash:authenticatedHostedDigest(item.actor_id),sessionHash:authenticatedHostedDigest(item.session_id)});}
      for(const actorId of actorIds)for(const kind of ['organization_membership','workspace_membership'])resources.push({kind,
        resourceHash:authenticatedHostedDigest(`${kind}:${actorId}`),classification:'transient',status:'inactive',
        actorHash:authenticatedHostedDigest(actorId),sessionHash:null});
      if(providerFixture)for(const resourceId of Object.values(providerFixture))resources.push({kind:'provider_config',resourceHash:authenticatedHostedDigest(resourceId),classification:'transient',status:'inactive',actorHash:null,sessionHash:null});
      for(const [projectName,evidence] of secretMaterialEvidence){
        if(evidence.exists!==true||evidence.fingerprintMatches!==true||evidence.absenceVerified!==true){
          pendingSecretCleanup.set(evidence.keyRefId,evidence);continue;
        }
        const keyRefRecordHash=authenticatedHostedDigest({source:'ai_provider_key_refs',identity:{id:evidence.keyRefId}});
        for(const [kind,phase,exists,fingerprintMatches] of [
          ['secret_material_created_verified','created',true,true],
          ['secret_material_absence_verified','absent',false,false],
        ])resources.push({kind,resourceHash:authenticatedHostedDigest({schema:'supabase-vault-physical-observation-v1',
          releaseSha:config.releaseSha,runId:config.workflow.runId,attempt:config.workflow.attempt,project:projectName,
          backendKind:evidence.backendKind,keyRefRecordHash,phase,exists,fingerprintMatches}),
        classification:'transient',status:'removed',actorHash:null,sessionHash:null});
      }
      resources.push({kind:'exercise_history',resourceHash:authenticatedHostedDigest(exerciseId),classification:'retained_immutable',status:state.exercise_lifecycle==='quiesced'?'preserved':'active',actorHash:null,sessionHash:null});
      // pg.Client is single-connection and must not receive concurrent cleanup queries.
      const {legacyControl,studioControl,workspaceFlags,assessControl}=
        await readAuthenticatedHostedCleanupControls(query,scopeParams());
      const same=(left,right,keys)=>left!==null&&right!==null&&keys.every(key=>left[key]===right[key]);
      const controlsRestored=(!deliveryControlsBefore||((deliveryControlsBefore.legacy
        ? same(legacyControl.rows[0]??null,deliveryControlsBefore.legacy,['writes_enabled']) : legacyControl.rows.length===0)
        &&(deliveryControlsBefore?.studio?same(studioControl.rows[0]??null,deliveryControlsBefore.studio,
          ['publication_writes_enabled','outcome_writes_enabled','pack_writes_enabled']):studioControl.rows.length===0)
        &&(workspaceFlagsBefore?same(workspaceFlags.rows[0]??null,workspaceFlagsBefore,
          ['unified_byok_gateway_enabled','studio_multisource_enabled','module_handoffs_enabled']):workspaceFlags.rows.length===0)))
        &&(!assessControlInitial||same(assessControl.rows[0]??null,assessControlInitial,['enabled','read_only']));
      const nonExerciseStateAfterHash=await nonExerciseState(projectRows);
      const immutableHistoryAfterHash=await immutableExerciseState(exerciseId,projectRows);
      const immutableHistoryPreserved=state.exercise_lifecycle==='quiesced'&&immutableHistoryBeforeHash!==null
        &&immutableHistoryBeforeHash===immutableHistoryAfterHash;
      const capturedAt=iso((await query('SELECT statement_timestamp() value')).rows[0]?.value);
      if(!capturedAt)throw new Error('AUTHENTICATED_HOSTED_CLEANUP_CLOCK_REJECTED');
      return {capturedAt,resources,activeSessions:state.sessions,activeIdentities:state.active_identities,
        activeMemberships:state.memberships,armedPermits:state.permits,
        activeSecretMaterial:state.secrets+pendingSecretCleanup.size,unapprovedActiveResidue:state.active_residue+(controlsRestored?0:1),
        nonExerciseChanged:nonExerciseStateBeforeHash!==nonExerciseStateAfterHash,immutableHistoryPreserved,
        retainedImmutableHistory:immutableHistoryPreserved,nonExerciseStateBeforeHash,nonExerciseStateAfterHash};
    },
  };
}
