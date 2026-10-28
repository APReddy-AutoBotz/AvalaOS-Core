import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL } from './authenticatedHostedControllerAdapters.mjs';
import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import { createAuthenticatedHostedObservationReader } from './authenticatedHostedObservationAdapter.mjs';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';
import {
  STUDIO_GENERATION_CHECKPOINT_OUTPUT,
  STUDIO_GENERATION_CHECKPOINT_SCHEMA,
  STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS,
  studioGenerationCheckpointDigest,
  validateStudioGenerationCheckpointProof,
} from './studioGenerationCheckpointProof.mjs';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15_000;
const DIAGNOSTIC_SCHEMA = 'studio-generation-checkpoint-local-diagnostic-v1';
const DIAGNOSTIC_SQLSTATES = new Set([
  '23503', '23505', '23514', '42501', '42703', '42883', '42P01', '57014', 'P0001', 'P0002',
]);
const DIAGNOSTIC_SUBSTAGES = new Set([
  'setup', 'source_chain', 'authority', 'generation', 'observation', 'cleanup', 'validation',
]);
const AMBIENT_LIVE_CREDENTIAL = /^(?:(?:VITE_)?(?:OPENAI|AZURE_OPENAI|ANTHROPIC|GEMINI|GOOGLE|GROQ|COHERE|MISTRAL|DEEPSEEK|XAI)_API_KEY|(?:AUTHENTICATED_ACCEPTANCE_|PR_C_CONTROLLED_HUMAN_)?SUPABASE_(?:ACCESS_TOKEN|MANAGEMENT_TOKEN|SERVICE_ROLE_KEY))$/u;
const bounded = async operation => {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('STUDIO_GENERATION_CHECKPOINT_BOUND_EXCEEDED')), TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
};

const targetPath = () => {
  const supplied = process.env.STUDIO_GENERATION_CHECKPOINT_PATH;
  if (typeof supplied !== 'string' || !supplied.trim()) throw new Error('CHECKPOINT_OUTPUT_REQUIRED');
  const resolved = path.resolve(supplied);
  const root = path.resolve('output', 'local-private', 'studio-generation-checkpoint-local');
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)
    || path.basename(resolved) !== STUDIO_GENERATION_CHECKPOINT_OUTPUT) throw new Error('CHECKPOINT_OUTPUT_REJECTED');
  return resolved;
};

const sanitizedDiagnostic = (substage, error) => {
  const runnerLine = typeof error?.stack === 'string'
    ? Number(error.stack.match(/testStudioGenerationCheckpointPostgres\.mjs:(\d+):\d+/u)?.[1] ?? 0) : 0;
  const sqlstate = typeof error?.code === 'string' && DIAGNOSTIC_SQLSTATES.has(error.code) ? error.code : null;
  return {
    schemaVersion: DIAGNOSTIC_SCHEMA,
    substage: DIAGNOSTIC_SUBSTAGES.has(substage) ? substage : 'validation',
    sqlstate,
    runnerLine: Number.isSafeInteger(runnerLine) && runnerLine > 0 ? runnerLine : null,
  };
};

const assertLocalEnvironment = environment => {
  const liveCredentialPresent = Object.entries(environment).some(([name, value]) =>
    AMBIENT_LIVE_CREDENTIAL.test(name) && typeof value === 'string' && value.length > 0);
  if (environment.PROVIDERS_ENABLED !== 'false' || environment.VITE_AI_EDGE_FUNCTIONS_ENABLED !== 'false'
    || liveCredentialPresent || environment.GITHUB_ACTIONS || environment.GITHUB_RUN_ID || environment.GITHUB_RUN_ATTEMPT) {
    throw new Error('STUDIO_GENERATION_CHECKPOINT_LOCAL_ENVIRONMENT_REJECTED');
  }
};

const observationIdentity = (source, row) => source === 'studio_artifact_versions'
  ? { artifact_id: row.artifact_id, version: row.version }
  : { id: row.id };

const persistedObservationMatch = (observed, persisted) => {
  const signature = record => `${record.source}|${record.recordHash}|${record.rowHash}`;
  // Independent SQL must return whole persisted rows, never a same-named scalar column.
  for (const { source, value } of persisted) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.equal(typeof value.id, 'string');
    if (source === 'studio_artifact_versions') {
      assert.equal(typeof value.artifact_id, 'string');
      assert.ok(value.version !== undefined && value.version !== null);
    }
  }
  const expected = persisted.map(({ source, value }) => ({
    source,
    recordHash: authenticatedEvidenceDigest({ source, identity: observationIdentity(source, value) }),
    rowHash: authenticatedEvidenceDigest(value),
  }));
  if (expected.length !== observed.length) return false;
  const expectedSignatures = new Set(expected.map(signature));
  const observedSignatures = new Set(observed.map(signature));
  return expectedSignatures.size === expected.length && observedSignatures.size === observed.length
    && [...expectedSignatures].every(item => observedSignatures.has(item));
};

const sourceBinding = async () => {
  const files = await Promise.all(STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS.map(async sourcePath => ({
    path: sourcePath,
    digest: studioGenerationCheckpointDigest((await readFile(path.resolve(sourcePath), 'utf8')).replaceAll('\r\n', '\n')),
  })));
  const migrationNames = (await readdir(path.resolve('supabase', 'migrations')))
    .filter(name => name.endsWith('.sql')).sort();
  const migrationEntries = await Promise.all(migrationNames.map(async name => ({ name,
    digest: studioGenerationCheckpointDigest((await readFile(path.resolve('supabase', 'migrations', name), 'utf8'))
      .replaceAll('\r\n', '\n')) })));
  return {
    classification: 'working_tree_snapshot',
    digest: studioGenerationCheckpointDigest(files),
    files,
    migrationChain: { count: migrationEntries.length, digest: studioGenerationCheckpointDigest(migrationEntries) },
  };
};

const emptyProof = (baseHead, sources) => ({
  schemaVersion: STUDIO_GENERATION_CHECKPOINT_SCHEMA,
  status: 'FAIL', classification: 'blocked',
  execution: { kind: 'LOCAL_NOT_CI', fullAcceptance: false, hosted: false, promotion: false,
    timeoutMs: TIMEOUT_MS, providersEnabled: false, baseHead },
  sourceBinding: sources,
  runtime: { postgresql: false, actualHandler: false, actualResolver: false,
    actualGenerationDependency: false, actualObservationReader: false, providerCalls: 0, paidCalls: 0,
    egressAttempts: 0, budgetReservations: 0, enabledProviderRoutes: 0, providerConfigsUsed: 0 },
  result: {
    responseStatus: 0, outcome: 'not_executed',
    attempts: { total: 0, completed: 0, nonterminal: 0 },
    versions: { created: 0, aggregateAdvanced: false, currentPointerAdvanced: false },
    permit: { armed: 0, consumed: 0, consumedEvents: 0 },
    bindings: { actor: false, session: false, request: false, payload: false, aggregate: false,
      sourcePackage: false, template: false, sourceCoverage: false },
    observation: { records: 0, attemptRecords: 0, versionRecords: 0, receiptRecords: 0,
      auditRecords: 0, independentPersistedMatch: false },
    downstream: { review: 0, approval: 0, delivery: 0, monitor: 0 },
  },
  negativeControls: { mismatchedPayloadRejected: false, duplicateRequestReplayed: false,
    duplicateStateUnchanged: false, foreignScopeExcluded: false, foreignMutationDetected: false,
    baselineRestored: false, nonterminalResidueZero: false },
  cleanup: { exerciseQuiesced: false, activeResidue: 0, sessionRevoked: 0, armedPermits: 0,
    terminalHistoryRetained: false, databaseRemoved: false },
  failure: { code: 'CHECKPOINT_SETUP_FAILED' },
});

const prepareGovernedArtifact = async fixture => {
  const { db, ids } = fixture;
  let ordinal = 0;
  const authority = actor => fixture.authorizationVersion(actor).then(authorizationVersion => ({
    organizationId: ids.organization, workspaceId: ids.workspace, authorizationVersion,
  }));
  const assess = async ({ persona = 'author', commandType, expectedVersion, payload = {}, key }) => {
    const body = { requestId: randomUUID(), idempotencyKey: key, commandType,
      ...await authority(ids[persona]), ...(expectedVersion === undefined ? {} : { expectedVersion }),
      payload: { caseId: ids.case, ...payload } };
    const response = await bounded(() => fixture.executeAssess(body, fixture.actors[persona].token));
    assert.equal(response.status, 200);
    assert.equal(response.body?.ok, true);
    assert.equal(response.body?.outcome, 'committed');
    ordinal += 1;
    return response.body;
  };
  const fixtureSource = structuredClone(fixture.production.fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const authoring = () => ({
    caseId: ids.case, name: 'Local generation checkpoint', description: 'Synthetic local checkpoint.',
    primitives: fixtureSource.primitives, edges: fixtureSource.edges,
    decisionPoints: fixtureSource.decisionPoints, exceptionPaths: fixtureSource.exceptionPaths,
    applicationAssets: fixtureSource.assets, interactions: fixtureSource.interactions,
    evidenceLinks: fixtureSource.evidence, agentNecessity: fixtureSource.agentNecessity,
    candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
  });
  await assess({ commandType: 'assessment_v2.create',
    payload: { processId: ids.process, name: 'Local generation checkpoint', description: '' }, key: 'checkpoint-create' });
  await assess({ commandType: 'assessment_v2.draft.upsert', expectedVersion: 1,
    payload: authoring(), key: 'checkpoint-draft' });
  const firstDecision = (await assess({ commandType: 'assessment_v2.finalize', expectedVersion: 2,
    key: 'checkpoint-finalize' })).resource.decisionId;
  const reviewPayload = (decisionId, extra = {}) => ({ decisionId, reviewSequence: 1, ...extra });
  await assess({ persona: 'reviewer', commandType: 'assessment_v2.review.assign', expectedVersion: 3,
    payload: reviewPayload(firstDecision, { reviewerId: ids.reviewer }), key: 'checkpoint-assign' });
  const attest = async (decisionId, expectedVersion, prefix) => {
    const assignment = (await db.query(
      'SELECT material_claims FROM assess_v2_review_assignments WHERE decision_id=$1', [decisionId])).rows[0];
    const evidenceIds = [...new Set(assignment.material_claims.flatMap(item => item.evidenceIds))];
    assert.ok(evidenceIds.length > 0);
    for (const evidenceId of evidenceIds) {
      const evidence = (await db.query(`SELECT payload FROM assess_v2_evidence_links
        WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)`,
      [evidenceId, decisionId])).rows[0];
      await assess({ persona: 'reviewer', commandType: 'assessment_v2.evidence.attest', expectedVersion,
        payload: reviewPayload(decisionId, { evidenceId, claimIds: evidence.payload.claimIds,
          outcome: 'accepted', rationale: 'Synthetic evidence independently verified.' }),
        key: `${prefix}-${ordinal}` });
    }
  };
  await attest(firstDecision, 4, 'checkpoint-attest-one');
  await assess({ persona: 'reviewer', commandType: 'assessment_v2.review.resolve', expectedVersion: 4,
    payload: reviewPayload(firstDecision, { resolution: 'changes_requested',
      rationale: 'Synthetic clarification required.', conditions: ['Clarify ownership.'] }), key: 'checkpoint-changes' });
  const revisionVersion = Number((await assess({ commandType: 'assessment_v2.revision.start', expectedVersion: 5,
    payload: reviewPayload(firstDecision, { rationale: 'Synthetic ownership clarified.' }),
    key: 'checkpoint-revise' })).resource.caseVersion);
  const snapshot = (await db.query(
    'SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [firstDecision])).rows[0].output_snapshot;
  const revised = authoring();
  const claimIds = [...new Set((snapshot.trace ?? []).flatMap(item => item.fieldIds ?? [])
    .filter(item => item !== 'evidence.coverage'))];
  revised.evidenceLinks[0] = { ...revised.evidenceLinks[0],
    claimIds: [...new Set([...(revised.evidenceLinks[0].claimIds ?? []), ...claimIds])] };
  await assess({ commandType: 'assessment_v2.draft.upsert', expectedVersion: revisionVersion,
    payload: revised, key: 'checkpoint-revision-draft' });
  const decisionId = (await assess({ commandType: 'assessment_v2.finalize', expectedVersion: revisionVersion + 1,
    key: 'checkpoint-resubmit' })).resource.decisionId;
  await assess({ persona: 'reviewer', commandType: 'assessment_v2.review.assign', expectedVersion: revisionVersion + 2,
    payload: reviewPayload(decisionId, { reviewerId: ids.reviewer }), key: 'checkpoint-reassign' });
  await attest(decisionId, revisionVersion + 3, 'checkpoint-attest-two');
  await assess({ persona: 'reviewer', commandType: 'assessment_v2.review.resolve', expectedVersion: revisionVersion + 3,
    payload: reviewPayload(decisionId, { resolution: 'approved', rationale: 'Synthetic decision approved.', conditions: [] }),
    key: 'checkpoint-approve' });
  const decision = (await db.query(
    'SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [decisionId])).rows[0].output_snapshot;
  const controls = [...new Set([...(decision.controlRequirements ?? []).filter(item => item.required).map(item => item.id),
    ...(decision.controls ?? [])])];
  assert.ok(controls.length > 0);
  await assess({ persona: 'approver', commandType: 'assessment_v2.govern.resolve', expectedVersion: revisionVersion + 4,
    payload: reviewPayload(decisionId, { rationale: 'Every synthetic control is resolved.',
      controlDispositions: controls.map(controlId => ({ controlId, status: 'resolved', condition: '', owner: '',
        dueDate: '', conditionSatisfied: false })) }), key: 'checkpoint-govern' });
  await assess({ persona: 'approver', commandType: 'assessment_v2.studio.handoff', expectedVersion: revisionVersion + 5,
    payload: reviewPayload(decisionId), key: 'checkpoint-assess-handoff' });
  const assessHandoffId = (await db.query(
    'SELECT id FROM assess_v2_studio_handoffs WHERE case_id=$1 AND decision_id=$2', [ids.case, decisionId])).rows[0].id;

  const studio = async ({ persona, commandType, expectedAggregateVersion, expectedArtifactVersion, payload, key }) => {
    const body = { contractVersion: 'studio-artifact-2', requestId: randomUUID(), idempotencyKey: key,
      commandType, ...await authority(ids[persona]), expectedAggregateVersion, expectedArtifactVersion, payload };
    const response = await bounded(() => fixture.executeStudio(new Request(
      `${fixture.baseUrl}/functions/v1/studio-artifact-command`, { method: 'POST', headers: {
        authorization: `Bearer ${fixture.actors[persona].token}`, 'content-type': 'application/json',
      }, body: JSON.stringify(body) })));
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result?.ok, true);
    assert.equal(result?.outcome, 'committed');
    return result;
  };
  const requested = await studio({ persona: 'author', commandType: 'studio.handoff.request',
    expectedAggregateVersion: 0, expectedArtifactVersion: null,
    payload: { upstreamHandoffId: assessHandoffId, artifactType: 'brd', targetInputBundle: null },
    key: 'checkpoint-studio-request' });
  const handoffId = requested.resource.handoffId;
  await studio({ persona: 'reviewer', commandType: 'studio.handoff.review.resolve',
    expectedAggregateVersion: 1, expectedArtifactVersion: 1,
    payload: { handoffId, handoffVersion: 1, outcome: 'approve',
      rationale: 'Synthetic source independently reviewed.', conditions: [] }, key: 'checkpoint-studio-review' });
  await studio({ persona: 'approver', commandType: 'studio.handoff.approval.resolve',
    expectedAggregateVersion: 2, expectedArtifactVersion: 1,
    payload: { handoffId, handoffVersion: 2, outcome: 'approve',
      rationale: 'Synthetic source accepted.', conditions: [] }, key: 'checkpoint-studio-approve' });
  const consumed = await studio({ persona: 'approver', commandType: 'studio.handoff.consume',
    expectedAggregateVersion: 3, expectedArtifactVersion: 1,
    payload: { handoffId, handoffVersion: 3 }, key: 'checkpoint-studio-consume' });
  const artifactId = consumed.resource.resourceId;
  const sourcePackageId = consumed.resource.sourcePackageId;
  const template = (await db.query(`SELECT id,template_version FROM studio_system_template_versions
    WHERE artifact_type='brd' AND superseded_at IS NULL`)).rows[0];
  const aggregate = (await db.query(`SELECT aggregate_version,current_version_id,current_approved_version_id
    FROM studio_artifact_aggregates WHERE id=$1`, [artifactId])).rows[0];
  return { artifactId, sourcePackageId, template, aggregate };
};

const generationBody = async (fixture, prepared, requestId) => ({
  contractVersion: 'studio-artifact-2', requestId, idempotencyKey: 'checkpoint-generation-success',
  commandType: 'studio.generation.request', organizationId: fixture.ids.organization,
  workspaceId: fixture.ids.workspace, authorizationVersion: await fixture.authorizationVersion(fixture.ids.approver),
  expectedAggregateVersion: Number(prepared.aggregate.aggregate_version), expectedArtifactVersion: null,
  payload: { artifactId: prepared.artifactId, sourcePackageId: prepared.sourcePackageId, sourcePackageVersion: 1,
    template: { kind: 'system', versionId: prepared.template.id, version: prepared.template.template_version },
    expectedCurrentVersionId: prepared.aggregate.current_version_id,
    expectedApprovedVersionId: prepared.aggregate.current_approved_version_id },
});

const executeGeneration = async (fixture, body) => {
  const response = await bounded(() => fixture.executeStudio(new Request(
    `${fixture.baseUrl}/functions/v1/studio-artifact-command`, { method: 'POST', headers: {
      authorization: `Bearer ${fixture.actors.approver.token}`, 'content-type': 'application/json',
    }, body: JSON.stringify(body) })));
  return { status: response.status, body: await response.json() };
};

const main = async () => {
  const target = targetPath();
  const baseHead = (await execFileAsync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'],
    { encoding: 'utf8' })).stdout.trim();
  const sources = await sourceBinding();
  let proof = emptyProof(baseHead, sources);
  let fixture;
  let exerciseId;
  let exerciseQuiesced = false;
  let phase = 'setup';
  let failureDiagnostic = null;
  try {
    assertLocalEnvironment(process.env);
    fixture = await createEnterpriseLifecycleFixture({ headSha: baseHead, runId: 'local-generation-checkpoint',
      runAttempt: '1', hostedPersonaRoleParity: true, providersEnabled: false, authenticatedSynthetic: true });
    proof.runtime.postgresql = true;
    const { db, ids } = fixture;
    await db.query("SET statement_timeout='15000ms'");
    const project = { projectId: ids.process, processId: ids.process, identities: {
      author: { id: ids.author }, reviewer: { id: ids.reviewer }, approver: { id: ids.approver },
      outsider: { id: ids.outsider },
    } };
    const ownership = { actorIds: Object.values(project.identities).map(item => item.id),
      projectIds: [ids.process], processIds: [ids.process] };
    const reader = createAuthenticatedHostedObservationReader({ db,
      config: { scope: { organizationId: ids.organization, workspaceId: ids.workspace } } });
    proof.runtime.actualObservationReader = true;
    const cutoff = (await db.query('SELECT statement_timestamp() value')).rows[0].value.toISOString();
    const nonExerciseBefore = await bounded(() => reader.nonExerciseDigest({ cutoff, ownership }));

    phase = 'source_chain';
    const prepared = await prepareGovernedArtifact(fixture);
    const beforeVersions = Number((await db.query(
      'SELECT count(*) count FROM studio_artifact_versions WHERE artifact_id=$1', [prepared.artifactId])).rows[0].count);

    phase = 'authority';
    exerciseId = randomUUID();
    const fixed = sources.digest;
    const expiry = new Date(Date.now() + 30 * 60 * 1000);
    const activation = (await fixture.serviceQuery(`SELECT public.authenticated_synthetic_local_exercise_activate(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value`, [exerciseId, baseHead, fixed,
      'http://127.0.0.1:4173', fixed, '20261019161723', sources.migrationChain.digest, fixed,
      'local-real-backend-authenticated-profile-v1', fixed, fixed, ids.organization, ids.workspace, expiry])).rows[0].value;
    assert.equal(activation.lifecycle, 'active');
    await fixture.serviceQuery('SELECT public.authenticated_synthetic_bind_session($1,$2,$3,$4)',
      [exerciseId, ids.approver, fixture.actors.approver.sessionId, 'approver']);
    const requestId = randomUUID();
    const body = await generationBody(fixture, prepared, requestId);
    const payloadHash = await fixture.production.authenticatedSyntheticModule.authenticatedSyntheticPayloadHash(body);
    const permitId = randomUUID();
    await fixture.serviceQuery('SELECT public.authenticated_synthetic_arm_permit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [exerciseId, permitId, 'studio_deterministic_success', 'studio.generation.request', ids.approver,
        fixture.actors.approver.sessionId, requestId, payloadHash, body.expectedAggregateVersion,
        new Date(Date.now() + 10 * 60 * 1000)]);
    const beforeFrame = await bounded(() => reader.capture({ exerciseId, from: cutoff, project }));

    const mismatched = structuredClone(body);
    mismatched.idempotencyKey = 'checkpoint-generation-mismatch';
    const mismatchResult = await executeGeneration(fixture, mismatched);
    const mismatchState = (await db.query(`SELECT
      (SELECT count(*)::int FROM studio_artifact_generation_attempts WHERE request_id=$1) attempts,
      (SELECT state FROM authenticated_synthetic_permits WHERE id=$2) permit_state`, [requestId, permitId])).rows[0];
    proof.negativeControls.mismatchedPayloadRejected = mismatchResult.status !== 201
      && mismatchState.attempts === 0 && mismatchState.permit_state === 'armed';
    assert.equal(proof.negativeControls.mismatchedPayloadRejected, true);

    phase = 'generation';
    const generated = await executeGeneration(fixture, body);
    assert.equal(generated.status, 201);
    assert.equal(generated.body?.outcome, 'generation_completed');
    proof.runtime.actualHandler = true;
    proof.runtime.actualResolver = true;
    proof.runtime.actualGenerationDependency = true;
    const stateBeforeReplay = (await db.query(`SELECT
      (SELECT count(*)::int FROM studio_artifact_generation_attempts WHERE request_id=$1) attempts,
      (SELECT count(*)::int FROM studio_artifact_versions WHERE artifact_id=$2) versions,
      (SELECT count(*)::int FROM authenticated_synthetic_permit_events WHERE permit_id=$3) permit_events`,
    [requestId, prepared.artifactId, permitId])).rows[0];
    const replayed = await executeGeneration(fixture, body);
    const stateAfterReplay = (await db.query(`SELECT
      (SELECT count(*)::int FROM studio_artifact_generation_attempts WHERE request_id=$1) attempts,
      (SELECT count(*)::int FROM studio_artifact_versions WHERE artifact_id=$2) versions,
      (SELECT count(*)::int FROM authenticated_synthetic_permit_events WHERE permit_id=$3) permit_events`,
    [requestId, prepared.artifactId, permitId])).rows[0];
    proof.negativeControls.duplicateRequestReplayed = replayed.status === 200 && replayed.body?.outcome === 'replayed';
    proof.negativeControls.duplicateStateUnchanged = JSON.stringify(stateBeforeReplay) === JSON.stringify(stateAfterReplay);
    assert.equal(proof.negativeControls.duplicateRequestReplayed, true);
    assert.equal(proof.negativeControls.duplicateStateUnchanged, true);

    phase = 'observation';
    const terminalHistory = async () => studioGenerationCheckpointDigest((await db.query(`SELECT value FROM (
      SELECT to_jsonb(attempt) value FROM studio_artifact_generation_attempts attempt WHERE attempt.request_id=$1
      UNION ALL SELECT to_jsonb(version) FROM studio_artifact_versions version
        JOIN studio_artifact_generation_attempts attempt ON attempt.id=version.generation_attempt_id WHERE attempt.request_id=$1
      UNION ALL SELECT to_jsonb(receipt) FROM studio_artifact_command_receipts receipt
        WHERE receipt.request_id=$1 AND receipt.command_type='studio.artifact.generation.request.v2'
      UNION ALL SELECT to_jsonb(audit) FROM privileged_audit_events audit WHERE audit.request_id=$1
    ) history ORDER BY value::text`, [requestId])).rows);
    const historyBeforeQuiesce = await terminalHistory();
    const quiesced = (await fixture.serviceQuery('SELECT public.authenticated_synthetic_quiesce($1) value',
      [exerciseId])).rows[0].value;
    exerciseQuiesced = quiesced.lifecycle === 'quiesced';
    assert.equal(exerciseQuiesced, true);
    const afterFrame = await bounded(() => reader.capture({ exerciseId, from: cutoff, project }));
    const beforeHashes = new Set(beforeFrame.records.map(record => record.recordHash));
    const delta = afterFrame.records.filter(record => !beforeHashes.has(record.recordHash));
    const count = source => delta.filter(record => record.source === source).length;
    // PostgreSQL resolves the bare name to the column when alias and column collide.
    // Reproduce that ambiguity locally and require explicit whole-row serialization.
    const serialization = (await db.query(`SELECT jsonb_typeof(to_jsonb(version)) legacy,
      jsonb_typeof(to_jsonb(version.*)) whole_row
      FROM (SELECT 1 AS version, 2 AS id) version`)).rows[0];
    assert.deepEqual(serialization, { legacy: 'number', whole_row: 'object' });
    const persistedObservationRows = (await db.query(`SELECT source,value FROM (
      SELECT 'studio_artifact_generation_attempts'::text source,to_jsonb(attempt) value
        FROM studio_artifact_generation_attempts attempt
        WHERE attempt.request_id=$1 AND attempt.org_id=$2 AND attempt.workspace_id=$3 AND attempt.requested_by=$4
      UNION ALL SELECT 'studio_artifact_versions',to_jsonb(version.*)
        FROM studio_artifact_versions version
        JOIN studio_artifact_generation_attempts attempt ON attempt.id=version.generation_attempt_id
        WHERE attempt.request_id=$1 AND attempt.org_id=$2 AND attempt.workspace_id=$3 AND attempt.requested_by=$4
      UNION ALL SELECT 'studio_artifact_command_receipts',to_jsonb(receipt)
        FROM studio_artifact_command_receipts receipt
        WHERE receipt.request_id=$1 AND receipt.org_id=$2 AND receipt.workspace_id=$3 AND receipt.actor_id=$4
          AND receipt.command_type='studio.artifact.generation.request.v2'
      UNION ALL SELECT 'privileged_audit_events',to_jsonb(audit)
        FROM privileged_audit_events audit
        WHERE audit.request_id=$1 AND audit.org_id=$2 AND audit.workspace_id=$3 AND audit.actor_id=$4
    ) persisted ORDER BY source,value::text`, [requestId, ids.organization, ids.workspace, ids.approver])).rows;
    const observedPersistedSources = new Set([
      'studio_artifact_generation_attempts', 'studio_artifact_versions',
      'studio_artifact_command_receipts', 'privileged_audit_events',
    ]);
    const observedPersistedRows = delta.filter(record => observedPersistedSources.has(record.source));
    const independentPersistedMatch = persistedObservationMatch(observedPersistedRows, persistedObservationRows);
    const facts = (await db.query(`WITH target AS(
      SELECT attempt.*,version.id version_id,version.author_id,version.source_package_id version_source_package_id,
        version.source_package_hash version_source_package_hash,version.template_id version_template_id,
        version.tenant_template_version_id version_tenant_template_version_id,version.content,artifact.aggregate_version,
        artifact.current_version_id,receipt.actor_id receipt_actor_id,receipt.request_id receipt_request_id,
        permit.state permit_state,permit.session_id permit_session_id,permit.payload_hash permit_payload_hash,
        permit.expected_version permit_expected_version,permit.attempt_id permit_attempt_id
      FROM studio_artifact_generation_attempts attempt
      JOIN studio_artifact_versions version ON version.generation_attempt_id=attempt.id
      JOIN studio_artifact_aggregates artifact ON artifact.id=attempt.artifact_id
      JOIN studio_artifact_command_receipts receipt ON receipt.request_id=attempt.request_id
        AND receipt.org_id=attempt.org_id AND receipt.workspace_id=attempt.workspace_id
        AND receipt.actor_id=attempt.requested_by
        AND receipt.command_type='studio.artifact.generation.request.v2' AND receipt.status='committed'
      JOIN authenticated_synthetic_permits permit ON permit.id=attempt.authenticated_synthetic_permit_id
      WHERE attempt.request_id=$1
    ) SELECT
      (SELECT count(*)::int FROM studio_artifact_generation_attempts
        WHERE request_id=$1 AND org_id=$9 AND workspace_id=$10 AND requested_by=$2) attempts,
      (SELECT count(*)::int FROM target WHERE state='completed') completed,
      (SELECT count(*)::int FROM studio_artifact_generation_attempts
        WHERE org_id=$9 AND workspace_id=$10 AND (request_id=$1 OR artifact_id=$11)
          AND state NOT IN('completed','stale_completed','failed','cancelled','timed_out')) nonterminal,
      (SELECT count(*)::int FROM studio_artifact_versions version JOIN studio_artifact_generation_attempts attempt
        ON attempt.id=version.generation_attempt_id WHERE attempt.request_id=$1) versions,
      bool_and(requested_by=$2 AND author_id=$2 AND receipt_actor_id=$2) actor_bound,
      bool_and(permit_session_id=$3) session_bound,
      bool_and(request_id=$1 AND receipt_request_id=$1) request_bound,
      bool_and(permit_payload_hash=$4) payload_bound,
      bool_and(expected_aggregate_version=$5+1 AND permit_expected_version=$5 AND aggregate_version=$5+2) aggregate_bound,
      bool_and(source_package_id=$6 AND version_source_package_id=$6
        AND source_package_hash=version_source_package_hash) source_bound,
      bool_and(COALESCE(template_id,tenant_template_version_id)=$7
        AND COALESCE(version_template_id,version_tenant_template_version_id)=$7) template_bound,
      bool_and((content#>>'{coverage,complete}')='true'
        AND jsonb_array_length(content#>'{coverage,selectedSourceVersionIds}')>0
        AND content#>'{coverage,selectedSourceVersionIds}'=content#>'{coverage,coveredSourceVersionIds}') coverage_bound,
      bool_and(current_version_id=version_id) pointer_bound,
      bool_and(provider_plan_state='authenticated_synthetic' AND transport_kind='authenticated_synthetic'
        AND provider_route_id IS NULL AND provider_config_id IS NULL AND provider_name IS NULL AND provider_model IS NULL) provider_free,
      bool_and(permit_state='consumed' AND permit_attempt_id=id) permit_consumed,
      (SELECT count(*)::int FROM authenticated_synthetic_permit_events WHERE permit_id=$8 AND event_type='armed') armed_events,
      (SELECT count(*)::int FROM authenticated_synthetic_permit_events WHERE permit_id=$8 AND event_type='consumed_after_claim') consumed_events,
      (SELECT count(*)::int FROM enterprise_ai_budget_reservations reservation
        JOIN studio_artifact_generation_attempts attempt ON attempt.id=reservation.studio_attempt_id WHERE attempt.request_id=$1) budgets,
      (SELECT count(*)::int FROM enterprise_ai_capability_routes WHERE org_id=$9 AND workspace_id=$10 AND enabled) routes,
      (SELECT count(*)::int FROM target WHERE provider_config_id IS NOT NULL) configs
    FROM target`, [requestId, ids.approver, fixture.actors.approver.sessionId, payloadHash,
      body.expectedAggregateVersion, prepared.sourcePackageId, prepared.template.id, permitId,
      ids.organization, ids.workspace, prepared.artifactId])).rows[0];
    const downstream = (await db.query(`SELECT
      (SELECT count(*)::int FROM studio_artifact_review_assignments WHERE artifact_id=$1) review,
      (SELECT count(*)::int FROM studio_artifact_approval_resolutions WHERE artifact_id=$1) approval,
      (SELECT count(*)::int FROM studio_delivery_publications WHERE studio_artifact_id=$1) delivery,
      (SELECT count(*)::int FROM document_generations WHERE studio_artifact_id=$1) monitor`,
    [prepared.artifactId])).rows[0];
    const activeResidue = Number((await db.query(`SELECT ${AUTHENTICATED_SYNTHETIC_ACTIVE_RESIDUE_SQL} value`)).rows[0].value);
    const controlState = (await db.query(`SELECT
      (SELECT count(*)::int FROM authenticated_synthetic_actor_sessions WHERE exercise_id=$1 AND state='revoked') revoked,
      (SELECT count(*)::int FROM authenticated_synthetic_permits WHERE exercise_id=$1 AND state='armed') armed,
      (SELECT lifecycle FROM authenticated_synthetic_exercises WHERE id=$1) lifecycle`, [exerciseId])).rows[0];
    const afterVersions = Number((await db.query(
      'SELECT count(*) count FROM studio_artifact_versions WHERE artifact_id=$1', [prepared.artifactId])).rows[0].count);
    proof.runtime.budgetReservations = facts.budgets;
    proof.runtime.enabledProviderRoutes = facts.routes;
    proof.runtime.providerConfigsUsed = facts.configs;
    proof.runtime.providerCalls = fixture.evidence.providerEffects.calls + fixture.evidence.providerEffects.syntheticProviderCalls;
    proof.runtime.paidCalls = fixture.evidence.providerEffects.paidCalls;
    proof.runtime.egressAttempts = fixture.evidence.providerEffects.egressAttempts;
    proof.result = {
      responseStatus: generated.status, outcome: generated.body.outcome,
      attempts: { total: facts.attempts, completed: facts.completed, nonterminal: facts.nonterminal },
      versions: { created: afterVersions - beforeVersions, aggregateAdvanced: facts.aggregate_bound,
        currentPointerAdvanced: facts.pointer_bound },
      permit: { armed: facts.armed_events, consumed: facts.permit_consumed ? 1 : 0, consumedEvents: facts.consumed_events },
      bindings: { actor: facts.actor_bound, session: facts.session_bound, request: facts.request_bound,
        payload: facts.payload_bound, aggregate: facts.aggregate_bound, sourcePackage: facts.source_bound,
        template: facts.template_bound, sourceCoverage: facts.coverage_bound },
      observation: { records: delta.length, attemptRecords: count('studio_artifact_generation_attempts'),
        versionRecords: count('studio_artifact_versions'), receiptRecords: count('studio_artifact_command_receipts'),
        auditRecords: count('privileged_audit_events'), independentPersistedMatch },
      downstream,
    };
    proof.cleanup.exerciseQuiesced = controlState.lifecycle === 'quiesced';
    proof.cleanup.activeResidue = activeResidue;
    proof.cleanup.sessionRevoked = controlState.revoked;
    proof.cleanup.armedPermits = controlState.armed;
    proof.cleanup.terminalHistoryRetained = historyBeforeQuiesce === await terminalHistory();
    proof.negativeControls.nonterminalResidueZero = facts.nonterminal === 0 && activeResidue === 0;
    const nonExerciseAfterOwned = await bounded(() => reader.nonExerciseDigest({ cutoff, ownership }));
    assert.equal(nonExerciseAfterOwned, nonExerciseBefore);
    await db.query('BEGIN');
    try {
      const beforeForeignFrame = await bounded(() => reader.capture({ exerciseId, from: cutoff, project }));
      await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Foreign checkpoint sentinel','Draft')",
        [randomUUID(), ids.foreignOrganization, ids.foreignWorkspace]);
      const afterForeignFrame = await bounded(() => reader.capture({ exerciseId, from: cutoff, project }));
      proof.negativeControls.foreignScopeExcluded = JSON.stringify(beforeForeignFrame.records.map(item => item.recordHash).sort())
        === JSON.stringify(afterForeignFrame.records.map(item => item.recordHash).sort());
      proof.negativeControls.foreignMutationDetected = await bounded(() => reader.nonExerciseDigest({ cutoff, ownership }))
        !== nonExerciseBefore;
    } finally { await db.query('ROLLBACK'); }
    proof.negativeControls.baselineRestored = await bounded(() => reader.nonExerciseDigest({ cutoff, ownership }))
      === nonExerciseBefore;
    assert.equal(Object.values(proof.negativeControls).every(Boolean), true);
    assert.equal(proof.runtime.providerCalls + proof.runtime.paidCalls + proof.runtime.egressAttempts
      + proof.runtime.budgetReservations + proof.runtime.enabledProviderRoutes + proof.runtime.providerConfigsUsed, 0);
    assert.equal(facts.provider_free, true);
    assert.equal(Object.values(proof.result.bindings).every(Boolean), true);
    assert.deepEqual(proof.result.downstream, { review: 0, approval: 0, delivery: 0, monitor: 0 });
    assert.equal(proof.cleanup.terminalHistoryRetained, true);
    proof.status = 'PASS';
    proof.classification = 'executed_evidence';
    proof.failure = null;
  } catch (error) {
    failureDiagnostic = sanitizedDiagnostic(phase, error);
    const codes = { setup: 'CHECKPOINT_SETUP_FAILED', source_chain: 'CHECKPOINT_SOURCE_CHAIN_FAILED',
      authority: 'CHECKPOINT_AUTHORITY_FAILED', generation: 'CHECKPOINT_GENERATION_FAILED',
      observation: 'CHECKPOINT_OBSERVATION_FAILED' };
    proof.status = 'FAIL'; proof.classification = 'blocked';
    proof.failure = { code: codes[phase] ?? 'CHECKPOINT_VALIDATION_FAILED' };
    if (proof.result.outcome === 'generation_completed') proof.result.outcome = 'fixed_failure';
  } finally {
    if (fixture) {
      if (exerciseId && !exerciseQuiesced) {
        try {
          const value = (await fixture.serviceQuery('SELECT public.authenticated_synthetic_quiesce($1) value',
            [exerciseId])).rows[0].value;
          proof.cleanup.exerciseQuiesced = value.lifecycle === 'quiesced';
        } catch (error) {
          failureDiagnostic ??= sanitizedDiagnostic('cleanup', error);
          proof.status = 'FAIL'; proof.classification = 'blocked';
          proof.failure = { code: 'CHECKPOINT_CLEANUP_FAILED' };
        }
      }
      try {
        proof.cleanup.databaseRemoved = await fixture.close() === true && fixture.evidence.cleanup.residualRows === 0;
      } catch (error) {
        failureDiagnostic ??= sanitizedDiagnostic('cleanup', error);
        proof.status = 'FAIL'; proof.classification = 'blocked';
        proof.failure = { code: 'CHECKPOINT_CLEANUP_FAILED' };
      }
    }
    if (fixture && !proof.cleanup.databaseRemoved) {
      proof.status = 'FAIL'; proof.classification = 'blocked';
      proof.failure = { code: 'CHECKPOINT_CLEANUP_FAILED' };
    }
  }
  let validated;
  try { validated = validateStudioGenerationCheckpointProof(proof); }
  catch (error) {
    failureDiagnostic ??= sanitizedDiagnostic('validation', error);
    proof.status = 'FAIL'; proof.classification = 'blocked';
    proof.failure = { code: 'CHECKPOINT_VALIDATION_FAILED' };
    if (proof.result.outcome === 'generation_completed') proof.result.outcome = 'fixed_failure';
    validated = validateStudioGenerationCheckpointProof(proof);
  }
  await writeFile(target, `${JSON.stringify(validated, null, 2)}\n`, { flag: 'wx' });
  if (failureDiagnostic) await writeFile(path.join(path.dirname(target),
    'studio-generation-checkpoint-diagnostic.json'), `${JSON.stringify(failureDiagnostic, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ status: validated.status,
    code: validated.failure?.code ?? 'CHECKPOINT_PASS' })}\n`);
  if (validated.status !== 'PASS') process.exitCode = 1;
};

main().catch(() => {
  process.stderr.write('STUDIO_GENERATION_CHECKPOINT_FATAL\n');
  process.exitCode = 1;
});
