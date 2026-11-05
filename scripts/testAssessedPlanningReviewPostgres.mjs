import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';

const requestId = ordinal => `d5000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
let activeFixture;
let activeStage = 'fixture-create';
let activeResponseCode = 'NONE';

export const createAssessedPlanningReviewScenario = async fixture => {
  let ordinal = 1;
  const { db, ids } = fixture;
  const authority = async actor => ({
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    authorizationVersion: await fixture.authorizationVersion(actor),
  });
  const execute = async ({
    actor = ids.author,
    token = 'enterprise-author-token',
    commandType,
    expectedVersion,
    payload,
    idempotencyKey,
    fixedRequestId,
    authorizationVersionOverride,
  }) => {
    const context = await authority(actor);
    const body = {
      requestId: fixedRequestId ?? requestId(ordinal++),
      idempotencyKey,
      commandType,
      ...context,
      ...(authorizationVersionOverride === undefined ? {} : { authorizationVersion: authorizationVersionOverride }),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
      payload: { caseId: ids.case, ...payload },
    };
    return { body, response: await fixture.executeAssess(body, token) };
  };
  const expectCommitted = result => {
    activeResponseCode = result.response.body?.error?.code ?? 'NONE';
    assert.equal(result.response.status, 200, result.response.body?.error?.code);
    assert.equal(result.response.body?.ok, true);
    assert.equal(result.response.body?.outcome, 'committed');
    return result.response.body.resource;
  };
  const expectDenied = (result, code) => {
    assert.equal(result.response.body?.ok, false);
    assert.equal(result.response.body?.error?.code, code);
  };

  const source = structuredClone(fixture.production.fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
  const draft = {
    caseId: ids.case,
    name: 'Planning-approved assessed process',
    description: 'Evidence-backed planning with explicit unresolved questions.',
    primitives: source.primitives,
    edges: source.edges,
    decisionPoints: source.decisionPoints,
    exceptionPaths: source.exceptionPaths,
    applicationAssets: source.assets,
    interactions: source.interactions,
    evidenceLinks: source.evidence,
    agentNecessity: source.agentNecessity,
    candidateEvaluations: [],
    gateResults: [],
    controlRequirements: [],
    modernizationDispositions: [],
  };
  activeStage = 'assess-create';
  await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Planning review process','Draft') ON CONFLICT DO NOTHING", [ids.process, ids.organization, ids.workspace]);
  activeStage = 'assess-create';
  expectCommitted(await execute({
    commandType: 'assessment_v2.create',
    idempotencyKey: 'planning-create',
    payload: { processId: ids.process, name: draft.name, description: draft.description },
  }));
  activeStage = 'assess-draft';
  expectCommitted(await execute({
    commandType: 'assessment_v2.draft.upsert', expectedVersion: 1,
    idempotencyKey: 'planning-draft', payload: draft,
  }));
  activeStage = 'assess-finalize';
  const finalized = expectCommitted(await execute({
    commandType: 'assessment_v2.finalize', expectedVersion: 2,
    idempotencyKey: 'planning-finalize', payload: {},
  }));
  const decisionId = finalized.decisionId;
  assert.equal(typeof decisionId, 'string');
  const decision = (await db.query(
    'SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [decisionId],
  )).rows[0].output_snapshot;
  assert.ok(['Verified', 'Partially Evidenced', 'Assumption-Led', 'Insufficient Evidence'].includes(decision.confidence));

  activeStage = 'review-assign';
  expectCommitted(await execute({
    commandType: 'assessment_v2.review.assign', expectedVersion: 3,
    idempotencyKey: 'planning-assign',
    payload: { decisionId, reviewSequence: 1, reviewerId: ids.reviewer },
  }));
  const assignment = (await db.query(
    'SELECT id,material_claims FROM assess_v2_review_assignments WHERE decision_id=$1', [decisionId],
  )).rows[0];
  const evidenceIds = [...new Set(assignment.material_claims.flatMap(claim => claim.evidenceIds))];
  assert.ok(evidenceIds.length > 0, 'the planning review fixture requires at least one linked evidence record');
  for (const [index, evidenceId] of evidenceIds.entries()) {
    activeStage = `evidence-attest-${index}`;
    const evidence = (await db.query(
      'SELECT payload FROM assess_v2_evidence_links WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)',
      [evidenceId, decisionId],
    )).rows[0].payload;
    expectCommitted(await execute({
      actor: ids.reviewer, token: 'enterprise-reviewer-token',
      commandType: 'assessment_v2.evidence.attest', expectedVersion: 4,
      idempotencyKey: `planning-attest-${index}`,
      payload: {
        decisionId, reviewSequence: 1, evidenceId,
        claimIds: evidence.claimIds,
        outcome: index === 0 ? 'accepted' : 'needs-more-information',
        rationale: index === 0
          ? 'The source supports these exact claims for planning.'
          : 'This source does not resolve every linked planning question.',
      },
    }));
  }

  const planningRequestId = requestId(ordinal++);
  activeStage = 'planning-stale-version-denied';
  expectDenied(await execute({
    actor: ids.reviewer, token: 'enterprise-reviewer-token',
    commandType: 'assessment_v2.review.plan', expectedVersion: 3,
    idempotencyKey: 'planning-stale-version',
    payload: {
      decisionId, reviewSequence: 1, resolution: 'planning_approved',
      rationale: 'This stale attempt must not resolve the review.', conditions: [],
    },
  }), 'VERSION_CONFLICT');
  activeStage = 'planning-stale-authority-denied';
  expectDenied(await execute({
    actor: ids.reviewer, token: 'enterprise-reviewer-token',
    commandType: 'assessment_v2.review.plan', expectedVersion: 4,
    authorizationVersionOverride: (await authority(ids.reviewer)).authorizationVersion - 1,
    idempotencyKey: 'planning-stale-authority',
    payload: {
      decisionId, reviewSequence: 1, resolution: 'planning_approved',
      rationale: 'This stale authority attempt must not resolve the review.', conditions: [],
    },
  }), 'AUTHORITY_STALE');
  assert.equal(Number((await db.query(
    'SELECT count(*) n FROM assess_v2_review_resolutions WHERE decision_id=$1', [decisionId],
  )).rows[0].n), 0);

  activeStage = 'planning-approve';
  const planned = await execute({
    actor: ids.reviewer, token: 'enterprise-reviewer-token',
    commandType: 'assessment_v2.review.plan', expectedVersion: 4,
    idempotencyKey: 'planning-approve', fixedRequestId: planningRequestId,
    payload: {
      decisionId, reviewSequence: 1, resolution: 'planning_approved',
      rationale: 'Accepted evidence is sufficient to document and plan while questions remain explicit.',
      conditions: ['Unresolved questions are not implementation-ready facts.'],
    },
  });
  const planningProjection = expectCommitted(planned);
  assert.equal(planningProjection.status, 'planning_approved');
  assert.equal(planningProjection.approvalPurpose, 'documentation_planning');
  assert.equal(planningProjection.confidence, decision.confidence,
    'planning approval must preserve the actual assessment confidence with exact casing');
  assert.ok(planningProjection.acceptedEvidence.length > 0);
  assert.ok(planningProjection.unresolvedQuestions.length > 0);
  const acceptedIds = new Set(planningProjection.acceptedEvidence.flatMap(item => item.evidenceIds));
  assert.deepEqual([...acceptedIds], [evidenceIds[0]], 'unaccepted evidence must not be projected as accepted');

  const resolution = (await db.query(`SELECT resolution,approval_purpose,reviewed_confidence
    FROM assess_v2_review_resolutions WHERE decision_id=$1`, [decisionId])).rows[0];
  assert.deepEqual(resolution, {
    resolution: 'planning_approved',
    approval_purpose: 'documentation_planning',
    reviewed_confidence: decision.confidence,
  });

  activeStage = 'planning-replay';
  const replay = await fixture.executeAssess(planned.body, 'enterprise-reviewer-token');
  assert.equal(replay.status, 200);
  assert.equal(replay.body?.ok, true);
  assert.equal(replay.body?.outcome, 'replayed');
  assert.equal(Number((await db.query(
    "SELECT count(*) n FROM assess_v2_review_resolutions WHERE decision_id=$1 AND resolution='planning_approved'",
    [decisionId],
  )).rows[0].n), 1);
  activeStage = 'planning-changed-replay-denied';
  expectDenied(await execute({
    actor: ids.reviewer, token: 'enterprise-reviewer-token',
    commandType: 'assessment_v2.review.plan', expectedVersion: 4,
    idempotencyKey: 'planning-approve',
    payload: {
      decisionId, reviewSequence: 1, resolution: 'planning_approved',
      rationale: 'A changed replay must not replace the immutable planning approval.', conditions: [],
    },
  }), 'IDEMPOTENCY_CONFLICT');

  const controls = [...new Set([
    ...(decision.controlRequirements ?? []).filter(item => item.required).map(item => item.id),
    ...(decision.controls ?? []),
  ])];
  activeStage = 'planning-govern-denied';
  const governAttempt = await execute({
    actor: ids.approver, token: 'enterprise-approver-token',
    commandType: 'assessment_v2.govern.resolve', expectedVersion: 5,
    idempotencyKey: 'planning-govern-denied',
    payload: {
      decisionId, reviewSequence: 1,
      rationale: 'A planning approval must not be promoted into Govern authority.',
      controlDispositions: controls.map(controlId => ({
        controlId, status: 'resolved', condition: '', owner: '', dueDate: '', conditionSatisfied: false,
      })),
    },
  });
  expectDenied(governAttempt, 'INVALID_COMMAND');
  assert.equal(Number((await db.query(
    'SELECT count(*) n FROM assess_v2_govern_resolutions WHERE decision_id=$1', [decisionId],
  )).rows[0].n), 0);

  activeStage = 'planning-owner-handoff-denied';
  expectDenied(await execute({
    actor: ids.author, token: 'enterprise-author-token',
    commandType: 'assessment_v2.studio.plan_handoff', expectedVersion: 5,
    idempotencyKey: 'planning-owner-handoff-denied',
    payload: { decisionId, reviewSequence: 1, approvalPurpose: 'documentation_planning' },
  }), 'INVALID_COMMAND');
  assert.equal(Number((await db.query(
    'SELECT count(*) n FROM assess_v2_studio_handoffs WHERE decision_id=$1', [decisionId],
  )).rows[0].n), 0);

  activeStage = 'planning-handoff';
  const handoff = await execute({
    actor: ids.approver, token: 'enterprise-approver-token',
    commandType: 'assessment_v2.studio.plan_handoff', expectedVersion: 5,
    idempotencyKey: 'planning-handoff',
    payload: { decisionId, reviewSequence: 1, approvalPurpose: 'documentation_planning' },
  });
  const handoffProjection = expectCommitted(handoff);
  assert.equal(handoffProjection.status, 'planning_approved');
  assert.equal(handoffProjection.handoffStatus, 'committed');
  assert.equal(handoffProjection.approvalPurpose, 'documentation_planning');
  assert.equal(handoffProjection.confidence, decision.confidence);

  const persisted = (await db.query(`SELECT h.id handoff_id,h.approval_purpose,h.govern_resolution_id,h.review_resolution_id,
    h.package,s.source_context,c.status
    FROM assess_v2_studio_handoffs h
    JOIN assess_v2_studio_sources s ON s.handoff_id=h.id
    JOIN assess_v2_cases c ON c.id=h.case_id
    WHERE h.decision_id=$1`, [decisionId])).rows[0];
  assert.equal(persisted.approval_purpose, 'documentation_planning');
  assert.equal(persisted.govern_resolution_id, null);
  assert.equal(typeof persisted.review_resolution_id, 'string');
  assert.equal(persisted.status, 'handed_off');
  assert.equal(persisted.package.approvalPurpose, 'documentation_planning');
  assert.equal(persisted.package.reviewedConfidence, decision.confidence);
  assert.equal(persisted.package.lineage.reviewResolutionId, persisted.review_resolution_id);
  assert.equal(persisted.package.lineage.governResolutionId, null);
  assert.deepEqual(persisted.source_context, persisted.package);
  assert.deepEqual(persisted.package.acceptedEvidence, planningProjection.acceptedEvidence);
  assert.deepEqual(persisted.package.unresolvedQuestions, planningProjection.unresolvedQuestions);

  activeStage = 'handoff-replay';
  const handoffReplay = await fixture.executeAssess(handoff.body, 'enterprise-approver-token');
  assert.equal(handoffReplay.status, 200);
  assert.equal(handoffReplay.body?.ok, true);
  assert.equal(handoffReplay.body?.outcome, 'replayed');
  assert.equal(Number((await db.query(
    'SELECT count(*) n FROM assess_v2_studio_handoffs WHERE decision_id=$1', [decisionId],
  )).rows[0].n), 1);
  activeStage = 'handoff-changed-replay-denied';
  expectDenied(await execute({
    actor: ids.approver, token: 'enterprise-approver-token',
    commandType: 'assessment_v2.studio.plan_handoff', expectedVersion: 6,
    idempotencyKey: 'planning-handoff',
    payload: { decisionId, reviewSequence: 1, approvalPurpose: 'documentation_planning' },
  }), 'IDEMPOTENCY_CONFLICT');

  return Object.freeze({
    processId: ids.process,
    caseId: ids.case,
    decisionId,
    actualConfidence: decision.confidence,
    reviewResolutionId: persisted.review_resolution_id,
    planningHandoffId: persisted.handoff_id,
    caseVersion: handoffProjection.caseVersion,
    handoffProjection,
    package: persisted.package,
    acceptedEvidence: persisted.package.acceptedEvidence,
    unresolvedQuestions: persisted.package.unresolvedQuestions,
  });
};

const main = async () => {
  activeFixture = await createEnterpriseLifecycleFixture({
    headSha: process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA ?? 'local-working-tree',
    providersEnabled: false,
  });
  await createAssessedPlanningReviewScenario(activeFixture);
  await activeFixture.close();
  activeFixture = null;
  console.log('ASSESSED PLANNING REVIEW POSTGRES PASS');
};

const fail = async error => {
  if (activeFixture) await activeFixture.close().catch(() => {});
  const safe = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/u.test(value) ? value : 'UNCLASSIFIED';
  console.error(`ASSESSED_PLANNING_REVIEW_POSTGRES_FAILED stage=${safe(activeStage)} response=${safe(activeResponseCode)} class=${safe(error?.constructor?.name)} code=${safe(error?.code)} table=${safe(error?.table)} constraint=${safe(error?.constraint)} routine=${safe(error?.routine)} actual=${safe(String(error?.actual ?? 'UNCLASSIFIED'))} expected=${safe(String(error?.expected ?? 'UNCLASSIFIED'))}`);
  process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(fail);
