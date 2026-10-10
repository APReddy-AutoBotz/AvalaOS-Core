import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createEnterpriseLifecycleFixture,
  enterpriseLifecycleSha256,
  enterpriseLifecycleSourcePaths,
} from './enterpriseLifecyclePostgresFixture.mjs';
import { assertEnterpriseLifecycleCommandPersistence } from './enterpriseLifecyclePersistenceAssertions.mjs';

const outputArgument = process.argv.indexOf('--output');
const outputPath = outputArgument >= 0 ? process.argv[outputArgument + 1] : null;
const requestId = ordinal => `b1000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;

const sourceDigests = () => enterpriseLifecycleSourcePaths.map(sourcePath => ({
  path: sourcePath,
  sha256: enterpriseLifecycleSha256(Buffer.from(requireRead(sourcePath))),
}));

const requireRead = sourcePath => {
  const fs = globalThis.process.getBuiltinModule('node:fs');
  return fs.readFileSync(path.resolve(sourcePath));
};

let activeFixture = null;
let activeStageLabel = 'fixture-create';

const main = async () => {
  const fixture = await createEnterpriseLifecycleFixture({
    headSha: process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA ?? 'local-working-tree',
  });
  activeFixture = fixture;
  const { db, ids, evidence } = fixture;
  const context = async actor => ({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    authorizationVersion: await fixture.authorizationVersion(actor),
  });
  let activeStageCommands = null;
  const command = async ({ actor = ids.author, token = 'enterprise-author-token', commandType, caseId = ids.case, expectedVersion, payload = {}, ordinal, key }) => {
    const authority = await context(actor);
    const body = {
      requestId: requestId(ordinal), idempotencyKey: key ?? `enterprise-lifecycle-${ordinal}`,
      commandType, ...authority, ...(expectedVersion === undefined ? {} : { expectedVersion }),
      payload: { caseId, ...payload },
    };
    const response = await fixture.executeAssess(body, token);
    if (activeStageCommands && ['committed'].includes(response.body?.outcome)) activeStageCommands.push({
      domain: 'assess', requestId: body.requestId, idempotencyKey: body.idempotencyKey, commandType,
      actorId: actor, organizationId: body.organizationId, workspaceId: body.workspaceId,
      resourceType: 'assess_v2_case', resourceId: caseId,
    });
    return { body, response };
  };
  const counts = async () => {
    const row = (await db.query(`SELECT jsonb_build_object(
      'mutations',(SELECT count(*) FROM assess_v2_case_versions)+(SELECT count(*) FROM assess_v2_decision_versions)
        +(SELECT count(*) FROM assess_v2_review_assignments)+(SELECT count(*) FROM assess_v2_evidence_attestations)
        +(SELECT count(*) FROM assess_v2_review_resolutions)+(SELECT count(*) FROM assess_v2_govern_resolutions)
        +(SELECT count(*) FROM assess_v2_studio_handoffs)+(SELECT count(*) FROM assess_v2_studio_sources)
        +(SELECT count(*) FROM enterprise_module_handoffs)+(SELECT count(*) FROM enterprise_module_handoff_review_events)
        +(SELECT count(*) FROM enterprise_module_handoff_approval_events)+(SELECT count(*) FROM enterprise_module_handoff_consumptions)
        +(SELECT count(*) FROM studio_artifact_source_packages)+(SELECT count(*) FROM studio_artifact_aggregates)
        +(SELECT count(*) FROM studio_artifact_generation_attempts),
      'receipts',(SELECT count(*) FROM assess_command_receipts)+(SELECT count(*) FROM enterprise_module_handoff_command_receipts)+(SELECT count(*) FROM studio_artifact_command_receipts),
      'audits',(SELECT count(*) FROM privileged_audit_events),
      'effects',(SELECT count(*) FROM studio_artifact_versions)) value`)).rows[0].value;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
  };
  const stage = async (id, operation, expectedOutcome = 'committed') => {
    activeStageLabel = id;
    const before = await counts();
    const syntheticProviderCallsBefore = evidence.providerEffects.syntheticProviderCalls;
    assert.equal(activeStageCommands, null, 'ENTERPRISE_LIFECYCLE_STAGE_NESTED');
    activeStageCommands = [];
    let result;
    let errorCode = null;
    let caughtError = null;
    try { result = await operation(); }
    catch (error) { caughtError = error; errorCode = error?.code ?? error?.message ?? String(error); }
    const persistedCommands = activeStageCommands;
    activeStageCommands = null;
    const after = await counts();
    const responseCode = result?.response?.body?.error?.code ?? null;
    errorCode = errorCode ?? responseCode ?? result?.errorCode ?? null;
    if (caughtError) throw new Error(`ENTERPRISE_LIFECYCLE_STAGE_OPERATION_FAILED:${id}:${errorCode}`, { cause: caughtError });
    const outcome = result?.response?.body?.outcome ?? (errorCode
      ? (expectedOutcome === 'failed-safe' ? 'failed-safe' : 'denied')
      : result?.outcome ?? expectedOutcome);
    if (['committed', 'generation_completed', 'generation_failed'].includes(expectedOutcome) && outcome !== expectedOutcome) {
      throw new Error(`ENTERPRISE_LIFECYCLE_STAGE_FAILED:${id}:${errorCode ?? outcome}`, caughtError ? { cause: caughtError } : undefined);
    }
    if (expectedOutcome === 'denied' && (!errorCode || outcome !== 'denied')) {
      throw new Error(`ENTERPRISE_LIFECYCLE_DENIAL_MISSING:${id}`);
    }
    if (expectedOutcome === 'failed-safe' && (!errorCode || outcome !== 'failed-safe')) {
      throw new Error(`ENTERPRISE_LIFECYCLE_FAILURE_PATH_MISSING:${id}`);
    }
    const assertionIds = [`${id}.handler`, `${id}.state`];
    evidence.assertions[`${id}.handler`] = ['committed', 'generation_completed', 'generation_failed'].includes(expectedOutcome)
      ? result?.response?.body?.ok === true && result?.response?.body?.outcome === expectedOutcome
      : expectedOutcome === 'denied' ? result?.response?.body?.ok === false && result?.response?.body?.error?.code === errorCode
        : expectedOutcome === 'failed-safe' ? Boolean(errorCode)
          : expectedOutcome === 'observed' && result?.payload?.ok === true && typeof result?.payload?.outcome === 'string';
    evidence.assertions[`${id}.state`] = await verifyStageState(db, id, ids);
    if (['committed', 'generation_completed', 'generation_failed'].includes(outcome)) {
      assertionIds.push(`${id}.receipt`, `${id}.audit`);
      const persistence = await assertEnterpriseLifecycleCommandPersistence({ db, commands: persistedCommands });
      evidence.assertions[`${id}.receipt`] = after.receipts - before.receipts === persistence.receiptCount;
      evidence.assertions[`${id}.audit`] = after.audits - before.audits === persistence.auditCount;
      result.persistence = persistence;
      if (id === 'studio.generate') {
        assertionIds.push('studio.generate.artifact-version', 'studio.generate.provider-synthetic');
        evidence.assertions['studio.generate.artifact-version'] = after.effects - before.effects === 1;
        evidence.assertions['studio.generate.provider-synthetic'] = evidence.providerEffects.syntheticProviderCalls - syntheticProviderCallsBefore === 1;
      }
      if (id === 'studio.provider-failure') {
        assertionIds.push('studio.provider-failure.no-artifact-version', 'studio.provider-failure.failure-code');
        evidence.assertions['studio.provider-failure.no-artifact-version'] = after.effects - before.effects === 0;
        evidence.assertions['studio.provider-failure.failure-code'] = errorCode === 'PROVIDER_REQUEST_FAILED'
          && evidence.providerEffects.syntheticProviderCalls - syntheticProviderCallsBefore === 1;
      }
      if (id === 'govern.resolve') {
        assertionIds.push('govern.resolve.actions-bound');
        evidence.assertions['govern.resolve.actions-bound'] = result?.actionsBound === true;
      }
    } else {
      assertionIds.push(`${id}.zero-effects`, `${id}.error-code`);
      evidence.assertions[`${id}.zero-effects`] = after.mutations === before.mutations && after.receipts === before.receipts && after.audits === before.audits && after.effects === before.effects;
      evidence.assertions[`${id}.error-code`] = typeof errorCode === 'string' && errorCode.length > 0;
      if (id === 'govern.separation-denied') {
        assertionIds.push('govern.separation-denied.final-reviewer');
        evidence.assertions['govern.separation-denied.final-reviewer'] = result?.finalReviewerDenied === true;
      }
    }
    evidence.stages.push({
      id, outcome,
      mutationDelta: after.mutations - before.mutations,
      receiptDelta: after.receipts - before.receipts,
      auditDelta: after.audits - before.audits,
      effectDelta: after.effects - before.effects,
      errorCode,
      assertionIds,
      ...(result?.persistence ? { persistence: result.persistence } : {}),
    });
    for (const assertionId of assertionIds) assert.equal(evidence.assertions[assertionId], true,
      `${assertionId}:${JSON.stringify(result?.payload ?? result?.response?.body ?? {})}`);
    return result;
  };
  const expectOk = result => {
    assert.equal(result.response.status, 200, JSON.stringify(result.response.body));
    assert.equal(result.response.body.ok, true);
    return result.response.body;
  };
  const expectDenied = (result, code) => {
    assert.equal(result.response.body.ok, false);
    assert.equal(result.response.body.error.code, code);
    return result;
  };
  const fixtureSource = structuredClone(fixture.production.fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const authoring = caseId => ({
    caseId, name: 'Connected enterprise lifecycle', description: 'Assess, Govern, and Studio connected acceptance.',
    primitives: fixtureSource.primitives, edges: fixtureSource.edges, decisionPoints: fixtureSource.decisionPoints,
    exceptionPaths: fixtureSource.exceptionPaths, applicationAssets: fixtureSource.assets,
    interactions: fixtureSource.interactions, evidenceLinks: fixtureSource.evidence,
    agentNecessity: fixtureSource.agentNecessity,
    candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
  });
  let ordinal = 1;
  const createDraftFinalize = async (caseId, prefix) => {
    await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,$4,'Draft') ON CONFLICT DO NOTHING", [caseId === ids.case ? ids.process : caseId, ids.organization, ids.workspace, `${prefix} process`]);
    const created = await command({ commandType: 'assessment_v2.create', caseId, payload: { processId: caseId === ids.case ? ids.process : caseId, name: `${prefix} case`, description: '' }, ordinal: ordinal++, key: `${prefix}-create` });
    expectOk(created);
    const saved = await command({ commandType: 'assessment_v2.draft.upsert', caseId, expectedVersion: 1, payload: authoring(caseId), ordinal: ordinal++, key: `${prefix}-draft` });
    expectOk(saved);
    const finalized = await command({ commandType: 'assessment_v2.finalize', caseId, expectedVersion: 2, ordinal: ordinal++, key: `${prefix}-finalize` });
    expectOk(finalized);
    return finalized;
  };

  await stage('assess.create', async () => {
    const result = await command({ commandType: 'assessment_v2.create', payload: { processId: ids.process, name: 'Connected lifecycle', description: '' }, ordinal: ordinal++, key: 'primary-create' });
    expectOk(result);
    const saved = await command({ commandType: 'assessment_v2.draft.upsert', expectedVersion: 1, payload: authoring(ids.case), ordinal: ordinal++, key: 'primary-draft' });
    expectOk(saved);
    return result;
  });
  const finalized = await stage('assess.finalize', async () => {
    const result = await command({ commandType: 'assessment_v2.finalize', expectedVersion: 2, ordinal: ordinal++, key: 'primary-finalize' });
    expectOk(result);
    return result;
  });
  let projection = finalized.response.body.resource;
  const firstDecisionId = projection.decisionId;
  const originalImmutableSource = await immutableAssessSource(db, firstDecisionId);

  await stage('assess.feature-disabled', async () => {
    await db.query('UPDATE assess_v2_runtime_control SET enabled=false');
    const denied = await command({ commandType: 'assessment_v2.create', caseId: uuidFallback(90), payload: { processId: ids.process, name: 'Disabled case', description: '' }, ordinal: ordinal++, key: 'feature-disabled' });
    await db.query('UPDATE assess_v2_runtime_control SET enabled=true');
    return expectDenied(denied, 'FEATURE_DISABLED');
  }, 'denied');

  const reviewPayload = (decisionId, overrides = {}) => ({ decisionId, reviewSequence: 1, ...overrides });
  const assign = await stage('govern.assign', async () => {
    const result = await command({ actor: ids.author, commandType: 'assessment_v2.review.assign', expectedVersion: 3, payload: reviewPayload(firstDecisionId, { reviewerId: ids.reviewer }), ordinal: ordinal++, key: 'primary-assign' });
    expectOk(result); return result;
  });
  projection = assign.response.body.resource;
  await stage('govern.attest', async () => {
    const assignment = (await db.query('SELECT id,material_claims FROM assess_v2_review_assignments WHERE decision_id=$1', [firstDecisionId])).rows[0];
    const evidenceIds = [...new Set(assignment.material_claims.flatMap(item => item.evidenceIds))];
    assert.ok(evidenceIds.length > 0);
    let last;
    for (const evidenceId of evidenceIds) {
      const evidenceRow = (await db.query('SELECT payload FROM assess_v2_evidence_links WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)', [evidenceId, firstDecisionId])).rows[0];
      last = await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.evidence.attest', expectedVersion: 4, payload: reviewPayload(firstDecisionId, { evidenceId, claimIds: evidenceRow.payload.claimIds, outcome: 'accepted', rationale: 'Evidence independently verified.' }), ordinal: ordinal++, key: `primary-attest-${evidenceId}` });
      expectOk(last);
    }
    return last;
  });
  const changed = await stage('govern.changes-requested', async () => {
    const result = await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.review.resolve', expectedVersion: 4, payload: reviewPayload(firstDecisionId, { resolution: 'changes_requested', rationale: 'Clarify the exception ownership.', conditions: ['Clarify ownership.'] }), ordinal: ordinal++, key: 'primary-changes' });
    expectOk(result); return result;
  });
  const revised = await stage('govern.revise', async () => {
    const result = await command({ commandType: 'assessment_v2.revision.start', expectedVersion: 5, payload: reviewPayload(firstDecisionId, { rationale: 'Ownership evidence clarified.' }), ordinal: ordinal++, key: 'primary-revise' });
    expectOk(result); return result;
  });
  const revisionVersion = Number(revised.response.body.resource.caseVersion);
  assert.ok(Number.isSafeInteger(revisionVersion) && revisionVersion > 0);
  const firstDecision = (await db.query('SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [firstDecisionId])).rows[0].output_snapshot;
  const revisionAuthoring = authoring(ids.case);
  const materialClaimIds = [...new Set((firstDecision.trace ?? []).flatMap(item => item.fieldIds ?? []).filter(item => item !== 'evidence.coverage'))];
  assert.ok(materialClaimIds.length > 0 && revisionAuthoring.evidenceLinks.length > 0);
  revisionAuthoring.evidenceLinks[0] = {
    ...revisionAuthoring.evidenceLinks[0],
    claimIds: [...new Set([...(revisionAuthoring.evidenceLinks[0].claimIds ?? []), ...materialClaimIds])],
  };
  const resubmitted = await stage('govern.resubmit', async () => {
    const saved = await command({ commandType: 'assessment_v2.draft.upsert', expectedVersion: revisionVersion, payload: revisionAuthoring, ordinal: ordinal++, key: 'primary-revision-draft' });
    expectOk(saved);
    const result = await command({ commandType: 'assessment_v2.finalize', expectedVersion: revisionVersion + 1, ordinal: ordinal++, key: 'primary-resubmit' });
    expectOk(result); return result;
  });
  const secondDecisionId = resubmitted.response.body.resource.decisionId;
  const approved = await stage('govern.approve', async () => {
    const secondAssign = await command({ commandType: 'assessment_v2.review.assign', expectedVersion: revisionVersion + 2, payload: reviewPayload(secondDecisionId, { reviewerId: ids.reviewer }), ordinal: ordinal++, key: 'primary-reassign' });
    expectOk(secondAssign);
    const secondAssignment = (await db.query('SELECT material_claims FROM assess_v2_review_assignments WHERE decision_id=$1', [secondDecisionId])).rows[0];
    for (const evidenceId of [...new Set(secondAssignment.material_claims.flatMap(item => item.evidenceIds))]) {
      const evidenceRow = (await db.query('SELECT payload FROM assess_v2_evidence_links WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)', [evidenceId, secondDecisionId])).rows[0];
      expectOk(await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.evidence.attest', expectedVersion: revisionVersion + 3, payload: reviewPayload(secondDecisionId, { evidenceId, claimIds: evidenceRow.payload.claimIds, outcome: 'accepted', rationale: 'Revised evidence verified.' }), ordinal: ordinal++, key: `second-attest-${evidenceId}` }));
    }
    const result = await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.review.resolve', expectedVersion: revisionVersion + 3, payload: reviewPayload(secondDecisionId, { resolution: 'approved', rationale: 'Evidence and decision are approved.', conditions: [] }), ordinal: ordinal++, key: 'primary-approve' });
    expectOk(result); return result;
  });

  await stage('govern.reject', async () => {
    const prepared = await createDraftFinalize(ids.rejectCase, 'reject');
    const decisionId = prepared.response.body.resource.decisionId;
    expectOk(await command({ commandType: 'assessment_v2.review.assign', caseId: ids.rejectCase, expectedVersion: 3, payload: reviewPayload(decisionId, { reviewerId: ids.reviewer }), ordinal: ordinal++, key: 'reject-assign' }));
    const result = await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.review.resolve', caseId: ids.rejectCase, expectedVersion: 4, payload: reviewPayload(decisionId, { resolution: 'rejected', rationale: 'Evidence is insufficient.', conditions: [] }), ordinal: ordinal++, key: 'reject-resolve' });
    expectOk(result); return result;
  });
  const decision = (await db.query('SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [secondDecisionId])).rows[0].output_snapshot;
  const requiredControlIds = [...new Set([...(decision.controlRequirements ?? []).filter(item => item.required).map(item => item.id), ...(decision.controls ?? [])])];
  assert.ok(requiredControlIds.length > 0);
  const governPayload = reviewPayload(secondDecisionId, { rationale: 'All required controls are resolved.',
    controlDispositions: requiredControlIds.map(controlId => ({ controlId, status: 'resolved', condition: '', owner: '', dueDate: '', conditionSatisfied: false })) });
  const separationPrepared = await createDraftFinalize(ids.deniedCase, 'separation');
  const authorReviewerBefore = await persistedEffectSnapshot(db);
  const authorReviewerResult = await command({ commandType: 'assessment_v2.review.assign', caseId: ids.deniedCase, expectedVersion: 3,
    payload: reviewPayload(separationPrepared.response.body.resource.decisionId, { reviewerId: ids.author }), ordinal: ordinal++, key: 'author-reviewer-denied' });
  expectDenied(authorReviewerResult, 'INVALID_COMMAND');
  const authorReviewerDenied = authorReviewerBefore === await persistedEffectSnapshot(db);
  assert.equal(authorReviewerDenied, true, 'author/reviewer denial changed persisted state');
  await stage('govern.separation-denied', async () => {
    const result = await command({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'assessment_v2.govern.resolve',
      expectedVersion: revisionVersion + 4, payload: governPayload, ordinal: ordinal++, key: 'final-reviewer-govern-denied' });
    expectDenied(result, 'INVALID_COMMAND');
    const primary = (await db.query('SELECT status FROM assess_v2_cases WHERE id=$1', [ids.case])).rows[0];
    const resolutionCount = Number((await db.query('SELECT count(*) n FROM assess_v2_govern_resolutions WHERE decision_id=$1', [secondDecisionId])).rows[0].n);
    return { ...result, finalReviewerDenied: primary.status === 'approved' && resolutionCount === 0 };
  }, 'denied');

  const governed = await stage('govern.resolve', async () => {
    const result = await command({ actor: ids.approver, token: 'enterprise-approver-token', commandType: 'assessment_v2.govern.resolve',
      expectedVersion: revisionVersion + 4, payload: governPayload, ordinal: ordinal++, key: 'primary-govern' });
    expectOk(result);
    const binding = (await db.query(`SELECT resolution.actions=public.pr1e_normalize_govern_actions(decision.input_snapshot,decision.output_snapshot) actions_bound,
      jsonb_array_length(resolution.actions) action_count,
      (SELECT count(DISTINCT split_part(action->>'actionId',':',1)) FROM jsonb_array_elements(resolution.actions) action WHERE COALESCE((action->>'highImpact')::boolean,false)) high_impact_bindings,
      (SELECT count(DISTINCT split_part(action->>'actionId',':',1)) FROM jsonb_array_elements(resolution.actions) action WHERE COALESCE((action->>'financial')::boolean,false)) financial_bindings
      FROM assess_v2_govern_resolutions resolution JOIN assess_v2_decision_versions decision ON decision.id=resolution.decision_id
      WHERE resolution.decision_id=$1`, [secondDecisionId])).rows[0];
    return { ...result, actionsBound: binding.actions_bound === true && Number(binding.action_count) > 0
      && Number(binding.high_impact_bindings) === 3 && Number(binding.financial_bindings) === 2 };
  });
  const handedOff = await stage('studio.handoff', async () => {
    const result = await command({ commandType: 'assessment_v2.studio.handoff', expectedVersion: revisionVersion + 5, payload: reviewPayload(secondDecisionId), ordinal: ordinal++, key: 'primary-handoff' });
    expectOk(result); return result;
  });
  const handoffId = (await db.query('SELECT id FROM assess_v2_studio_handoffs WHERE case_id=$1 AND decision_id=$2', [ids.case, secondDecisionId])).rows[0].id;
  const studioCommand = async ({ actor = ids.author, token = 'enterprise-author-token', commandType, expectedAggregateVersion, expectedArtifactVersion, payload, key }) => {
    const body = {
      contractVersion: 'studio-artifact-2', requestId: requestId(ordinal++), idempotencyKey: key, commandType,
      organizationId: ids.organization, workspaceId: ids.workspace,
      authorizationVersion: await fixture.authorizationVersion(actor), expectedAggregateVersion, expectedArtifactVersion, payload,
    };
    const response = await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    const responseBody = await response.json();
    if (activeStageCommands && ['committed', 'generation_completed', 'generation_failed'].includes(responseBody.outcome)) {
      if (commandType.startsWith('studio.handoff.')) {
        const handoffResourceId = responseBody.resource.handoffId;
        activeStageCommands.push({
          domain: 'enterprise_handoff', requestId: body.requestId, idempotencyKey: body.idempotencyKey,
          commandType: commandType.replace(/^studio\./u, ''), actorId: actor,
          organizationId: body.organizationId, workspaceId: body.workspaceId,
          resourceType: 'enterprise_module_handoff', resourceId: handoffResourceId,
          receiptResourceId: commandType === 'studio.handoff.consume' ? responseBody.resource.resourceId : handoffResourceId,
        });
      } else if (commandType === 'studio.generation.request') {
        const attemptId = responseBody.resource.attemptId;
        activeStageCommands.push({
          domain: 'studio', requestId: body.requestId, idempotencyKey: body.idempotencyKey,
          commandType: 'studio.artifact.generation.request.v2', auditAction: 'studio.artifact.generation.request.v2', actorId: actor,
          organizationId: body.organizationId, workspaceId: body.workspaceId,
          resourceType: 'studio_generation_attempt', resourceId: attemptId, receiptResourceId: responseBody.resourceId,
          terminalAudit: {
            action: responseBody.outcome === 'generation_completed' ? 'studio.artifact.generation.finalize' : 'studio.artifact.generation.fail.v2',
            resourceType: 'studio_generation_attempt', resourceId: attemptId,
            outcome: responseBody.outcome === 'generation_completed' ? 'succeeded' : 'failed',
          },
        });
      }
    }
    return { body, response: { status: response.status, body: responseBody } };
  };
  const expectStudioCommitted = result => {
    assert.equal(result.response.body.ok, true, JSON.stringify(result.response.body));
    assert.equal(result.response.body.outcome, 'committed', JSON.stringify(result.response.body));
    return result;
  };
  let consumed;
  await stage('studio.consume', async () => {
    const requested = await studioCommand({ commandType: 'studio.handoff.request', expectedAggregateVersion: 0, expectedArtifactVersion: null,
      payload: { upstreamHandoffId: handoffId, artifactType: 'brd', targetInputBundle: null }, key: 'primary-studio-handoff-request' });
    expectStudioCommitted(requested);
    const governedHandoffId = requested.response.body.resource.handoffId;
    const reviewed = await studioCommand({ actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'studio.handoff.review.resolve', expectedAggregateVersion: 1, expectedArtifactVersion: 1,
      payload: { handoffId: governedHandoffId, handoffVersion: 1, outcome: 'approve', rationale: 'Assess lineage is accepted for Studio.', conditions: [] }, key: 'primary-studio-handoff-review' });
    expectStudioCommitted(reviewed);
    const approvedHandoff = await studioCommand({ actor: ids.approver, token: 'enterprise-approver-token', commandType: 'studio.handoff.approval.resolve', expectedAggregateVersion: 2, expectedArtifactVersion: 1,
      payload: { handoffId: governedHandoffId, handoffVersion: 2, outcome: 'approve', rationale: 'Governed Studio consumption approved.', conditions: [] }, key: 'primary-studio-handoff-approve' });
    expectStudioCommitted(approvedHandoff);
    consumed = await studioCommand({ commandType: 'studio.handoff.consume', expectedAggregateVersion: 3, expectedArtifactVersion: 1,
      payload: { handoffId: governedHandoffId, handoffVersion: 3 }, key: 'primary-studio-handoff-consume' });
    expectStudioCommitted(consumed);
    return consumed;
  });
  const artifactId = consumed.response.body.resource.resourceId;
  const sourcePackageId = consumed.response.body.resource.sourcePackageId;
  const systemTemplate = (await db.query("SELECT id,template_version FROM studio_system_template_versions WHERE artifact_type='brd' AND superseded_at IS NULL")).rows[0];
  const generationPayload = aggregate => ({
    artifactId, sourcePackageId, sourcePackageVersion: 1,
    template: { kind: 'system', versionId: systemTemplate.id, version: systemTemplate.template_version },
    expectedCurrentVersionId: aggregate.current_version_id, expectedApprovedVersionId: aggregate.current_approved_version_id,
  });
  await stage('studio.generate', async () => {
    const aggregate = (await db.query('SELECT aggregate_version,current_version_id,current_approved_version_id FROM studio_artifact_aggregates WHERE id=$1', [artifactId])).rows[0];
    const generated = await studioCommand({ commandType: 'studio.generation.request', expectedAggregateVersion: Number(aggregate.aggregate_version), expectedArtifactVersion: null,
      payload: generationPayload(aggregate), key: 'primary-studio-generate-success' });
    assert.equal(generated.response.body.outcome, 'generation_completed', JSON.stringify(generated.response.body));
    return generated;
  }, 'generation_completed');
  await stage('studio.provider-failure', async () => {
    fixture.failNextProviderCall();
    const aggregate = (await db.query('SELECT aggregate_version,current_version_id,current_approved_version_id FROM studio_artifact_aggregates WHERE id=$1', [artifactId])).rows[0];
    const failed = await studioCommand({ commandType: 'studio.generation.request', expectedAggregateVersion: Number(aggregate.aggregate_version), expectedArtifactVersion: null,
      payload: generationPayload(aggregate), key: 'primary-studio-generate-failure' });
    const failure = (await db.query('SELECT state,failure_code FROM studio_artifact_generation_attempts WHERE request_id=$1', [failed.body.requestId])).rows[0];
    assert.deepEqual(failure, { state: 'failed', failure_code: 'PROVIDER_REQUEST_FAILED' });
    return { ...failed, errorCode: failure.failure_code };
  }, 'generation_failed');

  activeStageLabel = 'lineage-and-negative-controls';
  const lineageRows = (await db.query(`SELECT c.head_version_id,d.id decision_id,rr.id review_id,g.id govern_id,h.id handoff_id,
      s.handoff_id source_handoff,p.id source_package_id,a.id artifact_id,v.source_package_id generated_source_package_id
    FROM assess_v2_cases c JOIN assess_v2_decision_versions d ON d.id=$2 AND d.case_id=c.id AND d.source_version_id=c.head_version_id
    JOIN assess_v2_review_resolutions rr ON rr.decision_id=d.id AND rr.case_id=c.id AND rr.resolution='approved'
    JOIN assess_v2_govern_resolutions g ON g.review_resolution_id=rr.id AND g.decision_id=d.id AND g.case_id=c.id
      AND jsonb_array_length(g.actions)>0 AND g.actions=public.pr1e_normalize_govern_actions(d.input_snapshot,d.output_snapshot)
    JOIN assess_v2_studio_handoffs h ON h.govern_resolution_id=g.id AND h.review_resolution_id=rr.id AND h.decision_id=d.id AND h.source_version_id=d.source_version_id
    JOIN assess_v2_studio_sources s ON s.handoff_id=h.id
    JOIN studio_artifact_source_packages p ON p.assess_handoff_id=h.id AND p.assess_package_hash=h.package_hash
    JOIN studio_artifact_aggregates a ON a.id=p.artifact_id AND a.source_package_id=p.id AND a.handoff_id=h.id
    JOIN studio_artifact_versions v ON v.id=a.current_version_id AND v.artifact_id=a.id AND v.source_package_id=p.id
    WHERE c.id=$1 AND a.id=$3 AND p.org_id=c.org_id AND p.workspace_id=c.workspace_id`, [ids.case, secondDecisionId, artifactId])).rows;
  assert.equal(lineageRows.length, 1, 'exact connected lineage must have one persisted result');
  const primaryRows = lineageRows[0];
  evidence.lineage = {
    sourceVersionImmutable: originalImmutableSource === await immutableAssessSource(db, firstDecisionId),
    decisionBound: primaryRows.decision_id === secondDecisionId,
    reviewBound: primaryRows.review_id !== null,
    governBound: primaryRows.govern_id !== null,
    handoffBound: primaryRows.handoff_id === handoffId,
    studioSourceBound: primaryRows.source_handoff === handoffId && primaryRows.source_package_id === sourcePackageId
      && primaryRows.generated_source_package_id === sourcePackageId && primaryRows.artifact_id === artifactId,
  };
  for (const [name, value] of Object.entries(evidence.lineage)) evidence.assertions[`lineage.${name.replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`] = value;

  const unchanged = async operation => {
    const before = await persistedEffectSnapshot(db);
    const result = await operation();
    const after = await persistedEffectSnapshot(db);
    assert.equal(after, before, 'denial or exact replay changed persisted business/receipt/audit/effect state');
    return result;
  };
  const replay = await unchanged(() => fixture.executeAssess(handedOff.body, 'enterprise-author-token'));
  assert.equal(replay.body?.outcome, 'replayed');
  const deny = async (body, token, code) => {
    const result = await unchanged(() => fixture.executeAssess(body, token));
    assert.equal(result.body?.ok, false);
    assert.equal(result.body?.error?.code, code);
    assert.equal(Object.hasOwn(result.body, 'resource'), false, 'denial disclosed a resource');
    return true;
  };
  const negativeBody = key => ({ ...handedOff.body, requestId: requestId(ordinal++), idempotencyKey: key });
  const changedPayloadConflict = await deny({
    ...handedOff.body, requestId: requestId(ordinal++), payload: { ...handedOff.body.payload, reviewSequence: 2 },
  }, 'enterprise-author-token', 'IDEMPOTENCY_CONFLICT');
  const staleAuthorityDenied = await deny({ ...negativeBody('stale-authority'),
    authorizationVersion: await fixture.authorizationVersion(ids.author) + 1,
  }, 'enterprise-author-token', 'AUTHORITY_STALE');
  const crossTenantNonDisclosure = await deny({ ...negativeBody('cross-tenant'),
    organizationId: ids.foreignOrganization, workspaceId: ids.foreignWorkspace,
  }, 'enterprise-author-token', 'RESOURCE_NOT_AVAILABLE') && await deny({
    ...negativeBody('cross-workspace'), workspaceId: ids.foreignWorkspace,
  }, 'enterprise-author-token', 'RESOURCE_NOT_AVAILABLE');
  const browserClaimsIgnored = await deny({ ...negativeBody('browser-claim'),
    actorId: ids.author, capabilities: ['assess.v2.studio.handoff'],
  }, 'enterprise-outsider-token', 'INVALID_COMMAND')
    && await deny(negativeBody('outsider-caller'), 'enterprise-outsider-token', 'RESOURCE_NOT_AVAILABLE');
  const nonService = await unchanged(() => nonServiceDenied(db, handedOff.body));
  assert.equal(nonService, true, 'authenticated callers must not execute the service-only RPC');
  const revokedAuthorityDenied = await revokedDenied(db, fixture, handedOff.body, ids, ordinal++, unchanged);

  // Deliberately drop a newly committed response at the transport boundary.
  // The consumer receives only an error, then reconciles using the same key.
  const recoveryProcess = uuidFallback(91); const recoveryCase = uuidFallback(92);
  await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Recovery transport fixture','Draft')", [recoveryProcess, ids.organization, ids.workspace]);
  const recoveryBody = { requestId: requestId(ordinal++), idempotencyKey: 'lost-create-response',
    commandType: 'assessment_v2.create', ...await context(ids.author),
    payload: { caseId: recoveryCase, processId: recoveryProcess, name: 'Response-loss recovery', description: '' },
  };
  let droppedCommittedResponse = false;
  const beforeLoss = await counts();
  await assert.rejects(async () => {
    const serverResponse = await fixture.executeAssess(recoveryBody, 'enterprise-author-token');
    assert.equal(serverResponse.body?.outcome, 'committed');
    droppedCommittedResponse = true;
    throw new Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT');
  }, /SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT/u);
  const afterLoss = await counts();
  assert.equal(afterLoss.mutations - beforeLoss.mutations, 1);
  assert.equal(afterLoss.receipts - beforeLoss.receipts, 1);
  assert.equal(afterLoss.audits - beforeLoss.audits, 1);
  const recovered = await unchanged(() => fixture.executeAssess(recoveryBody, 'enterprise-author-token'));
  assert.equal(recovered.body?.outcome, 'replayed');
  const recoveryReceipt = (await db.query('SELECT response FROM assess_command_receipts WHERE request_id=$1', [recoveryBody.requestId])).rows;
  assert.equal(recoveryReceipt.length, 1);
  assert.equal(recoveryReceipt[0].response.id, recoveryCase);
  assert.equal(recovered.body?.resource?.id, recoveryCase);
  evidence.negativeControls = {
    exactReplayZeroEffects: replay.body?.outcome === 'replayed', changedPayloadConflict, staleAuthorityDenied,
    revokedAuthorityDenied, crossTenantNonDisclosure, nonServiceDenied: nonService, browserClaimsIgnored,
    authorReviewerDenied,
    responseLossReconciled: droppedCommittedResponse && recovered.body?.resource?.id === recoveryCase,
  };
  for (const [name, value] of Object.entries(evidence.negativeControls)) evidence.assertions[`negative.${name.replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`] = value;
  evidence.assertions['provider.no-paid-calls'] = evidence.providerEffects.paidCalls === 0;
  evidence.assertions['provider.forbidden-network-guard'] = evidence.providerEffects.egressAttempts === 0 && evidence.providerEffects.forbiddenNetworkGuardTriggered;
  evidence.assertions['provider.no-browser-secrets'] = evidence.providerEffects.browserSecrets === false;
  evidence.sourceDigests = sourceDigests();
  activeStageLabel = 'cleanup';
  await fixture.close();
  activeFixture = null;
  assert.equal(evidence.cleanup.succeeded, true);
  evidence.status = Object.values(evidence.assertions).every(Boolean) ? 'passed' : 'failed';
  evidence.execution.completedAt = new Date().toISOString();
  assert.equal(evidence.status, 'passed');
  if (outputPath) {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
    await writeFile(path.resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  console.log(`ENTERPRISE LIFECYCLE PASS ${evidence.stages.length} stages ${evidence.journeyBinding}`);
};

const uuidFallback = ordinal => `a1000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;

const immutableAssessSource = async (db, decisionId) => {
  const rows = (await db.query(`SELECT jsonb_build_object('decision',to_jsonb(d),'source',to_jsonb(v),
    'evidence',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM assess_v2_evidence_links e WHERE e.version_id=v.id))::text snapshot
    FROM assess_v2_decision_versions d JOIN assess_v2_case_versions v ON v.id=d.source_version_id WHERE d.id=$1`, [decisionId])).rows;
  assert.equal(rows.length, 1);
  return enterpriseLifecycleSha256(rows[0].snapshot);
};

const persistedEffectSnapshot = async db => {
  const tables = ['assess_v2_cases', 'assess_v2_case_versions', 'assess_v2_decision_versions',
    'assess_v2_review_assignments', 'assess_v2_evidence_attestations', 'assess_v2_review_resolutions',
    'assess_v2_govern_resolutions', 'assess_v2_studio_handoffs', 'assess_v2_studio_sources',
    'assess_command_receipts', 'studio_artifact_aggregates', 'studio_artifact_source_packages',
    'studio_artifact_generation_attempts', 'studio_artifact_versions', 'studio_artifact_command_receipts',
    'privileged_audit_events', 'enterprise_ai_budget_reservations'];
  const snapshots = [];
  for (const table of tables) {
    const row = (await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text snapshot FROM public.${table} r`)).rows[0];
    snapshots.push([table, row.snapshot]);
  }
  return enterpriseLifecycleSha256(JSON.stringify(snapshots));
};

const nonServiceDenied = async (db, body) => {
  try {
    await db.query('BEGIN');
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [uuidFallback(10)]);
    await db.query('SELECT public.pr1e_handoff_assess_v2_studio($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)', [body.actorId ?? uuidFallback(10), body.organizationId, body.workspaceId, body.payload.caseId, body.payload.decisionId, body.expectedVersion, body.requestId, body.idempotencyKey, body.authorizationVersion, JSON.stringify(body.payload)]);
    await db.query('ROLLBACK');
    return false;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    return error.code === '42501' && /permission denied for function pr1e_handoff_assess_v2_studio/iu.test(error.message);
  }
};

const revokedDenied = async (db, fixture, body, ids, ordinal, unchanged) => {
  const role = (await db.query('SELECT role_id FROM organization_members WHERE org_id=$1 AND user_id=$2', [ids.organization, ids.author])).rows[0].role_id;
  await db.query("DELETE FROM role_capabilities WHERE role_id=$1 AND capability_key='assess.v2.studio.handoff'", [role]);
  try {
    const authorizationVersion = await fixture.authorizationVersion(ids.author);
    const denied = await unchanged(() => fixture.executeAssess({ ...body, requestId: requestId(ordinal), idempotencyKey: 'revoked-authority', authorizationVersion }, 'enterprise-author-token'));
    assert.equal(denied.body?.error?.code, 'PERMISSION_DENIED');
    assert.equal(Object.hasOwn(denied.body, 'resource'), false);
    return true;
  } finally {
    await db.query("INSERT INTO role_capabilities(role_id,capability_key) VALUES($1,'assess.v2.studio.handoff') ON CONFLICT DO NOTHING", [role]);
  }
};

const verifyStageState = async (db, stageId, ids) => {
  const primaryStatus = async expected => (await db.query('SELECT status=$2 ok FROM assess_v2_cases WHERE id=$1', [ids.case, expected])).rows[0]?.ok === true;
  const scalar = async (sql, values = []) => Number((await db.query(sql, values)).rows[0]?.n ?? 0);
  if (stageId === 'assess.create') return primaryStatus('draft') && await scalar('SELECT count(*) n FROM assess_v2_case_versions WHERE case_id=$1', [ids.case]) === 2;
  if (stageId === 'assess.finalize') return primaryStatus('reviewer_ready') && await scalar('SELECT count(*) n FROM assess_v2_decision_versions WHERE case_id=$1', [ids.case]) === 1;
  if (stageId === 'assess.feature-disabled') return (await db.query('SELECT enabled FROM assess_v2_runtime_control WHERE singleton')).rows[0]?.enabled === true;
  if (stageId === 'govern.assign') return primaryStatus('in_review') && await scalar('SELECT count(*) n FROM assess_v2_review_assignments WHERE case_id=$1', [ids.case]) === 1;
  if (stageId === 'govern.attest') return primaryStatus('in_review') && await scalar('SELECT count(*) n FROM assess_v2_evidence_attestations WHERE case_id=$1', [ids.case]) > 0;
  if (stageId === 'govern.changes-requested') return primaryStatus('changes_requested') && await scalar("SELECT count(*) n FROM assess_v2_review_resolutions WHERE case_id=$1 AND resolution='changes_requested'", [ids.case]) === 1;
  if (stageId === 'govern.revise') return primaryStatus('draft') && await scalar('SELECT count(*) n FROM assess_v2_case_versions WHERE case_id=$1', [ids.case]) === 3;
  if (stageId === 'govern.resubmit') return primaryStatus('reviewer_ready') && await scalar('SELECT count(*) n FROM assess_v2_decision_versions WHERE case_id=$1', [ids.case]) === 2;
  if (stageId === 'govern.approve') return primaryStatus('approved') && await scalar("SELECT count(*) n FROM assess_v2_review_resolutions WHERE case_id=$1 AND resolution='approved'", [ids.case]) === 1;
  if (stageId === 'govern.reject') return (await db.query('SELECT status FROM assess_v2_cases WHERE id=$1', [ids.rejectCase])).rows[0]?.status === 'rejected';
  if (stageId === 'govern.separation-denied') return (await db.query('SELECT status FROM assess_v2_cases WHERE id=$1', [ids.case])).rows[0]?.status === 'approved'
    && await scalar('SELECT count(*) n FROM assess_v2_govern_resolutions WHERE case_id=$1', [ids.case]) === 0;
  if (stageId === 'govern.resolve') return primaryStatus('govern_resolved') && await scalar('SELECT count(*) n FROM assess_v2_govern_resolutions WHERE case_id=$1', [ids.case]) === 1;
  if (stageId === 'studio.handoff') return primaryStatus('handed_off') && await scalar('SELECT count(*) n FROM assess_v2_studio_handoffs WHERE case_id=$1', [ids.case]) === 1;
  if (stageId === 'studio.consume') return await scalar('SELECT count(*) n FROM studio_artifact_aggregates WHERE case_id=$1', [ids.case]) === 1;
  if (stageId === 'studio.generate') return await scalar("SELECT count(*) n FROM studio_artifact_generation_attempts attempt JOIN studio_artifact_aggregates artifact ON artifact.id=attempt.artifact_id WHERE artifact.case_id=$1 AND attempt.state='completed'", [ids.case]) === 1
    && await scalar('SELECT count(*) n FROM studio_artifact_versions version JOIN studio_artifact_aggregates artifact ON artifact.id=version.artifact_id WHERE artifact.case_id=$1', [ids.case]) === 1;
  if (stageId === 'studio.provider-failure') return await scalar("SELECT count(*) n FROM studio_artifact_generation_attempts attempt JOIN studio_artifact_aggregates artifact ON artifact.id=attempt.artifact_id WHERE artifact.case_id=$1 AND attempt.state='failed' AND attempt.failure_code='PROVIDER_REQUEST_FAILED'", [ids.case]) === 1;
  return false;
};

const sanitizedToken = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/u.test(value) ? value : 'UNCLASSIFIED';
const reportSanitizedFailure = (kind, error, phase = activeStageLabel) => {
  const errorClass = sanitizedToken(error?.constructor?.name);
  const errorCode = sanitizedToken(error?.code);
  console.error(`${kind} phase=${sanitizedToken(phase)} class=${errorClass} code=${errorCode}`);
};

main().catch(async error => {
  if (activeFixture) await activeFixture.close().catch(cleanupError => reportSanitizedFailure('ENTERPRISE_LIFECYCLE_CLEANUP_FAILED', cleanupError, 'cleanup'));
  reportSanitizedFailure('ENTERPRISE_LIFECYCLE_ACCEPTANCE_FAILED', error);
  process.exitCode = 1;
});
