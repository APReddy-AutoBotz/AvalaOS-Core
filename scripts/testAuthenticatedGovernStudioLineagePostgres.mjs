import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  authenticatedGovernStudioLineageProofDigest,
  AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA,
  AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SOURCE_PATHS,
  validateAuthenticatedGovernStudioLineageProof,
} from './authenticatedGovernStudioLineageProof.mjs';
import { authenticatedHostedBindResponseObservation, authenticatedHostedDigest,
  authenticatedHostedResponseObservation }
  from './authenticatedHostedController.mjs';
import { createAuthenticatedHostedPostgresAdapter } from './authenticatedHostedControllerAdapters.mjs';
import { authenticatedHostedRequestBinding } from './authenticatedHostedObservationAdapter.mjs';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';
import { readGovernPreparationIdentity } from './governPreparationIdentity.mjs';

const OUTPUT_NAME = 'govern-studio-lineage-proof.json';
const execFileAsync = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const requestId = ordinal => `c2000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;
const frame = (ordinal, records = []) => ({
  capturedAt: `2026-10-24T00:01:${String(ordinal).padStart(2, '0')}.000Z`, records,
});
const rowRecord = (source, row) => ({
  source,
  recordHash: authenticatedGovernStudioLineageProofDigest({ source, identity: row.id ?? source }),
  rowHash: authenticatedGovernStudioLineageProofDigest(row),
  active: false,
});
const failCode = async operation => {
  try { await operation(); } catch (error) { return error?.message ?? ''; }
  return '';
};
const firstString = (...values) => values.find(value => typeof value === 'string' && value.length > 0) ?? null;

const sourceDigest = async () => authenticatedGovernStudioLineageProofDigest(await Promise.all(
  AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SOURCE_PATHS.map(async sourcePath => ({
    path: sourcePath,
    digest: authenticatedGovernStudioLineageProofDigest((await readFile(path.resolve(sourcePath), 'utf8')).replace(/\r\n/gu, '\n')),
  })),
));

const outputPath = () => {
  const supplied = process.env.AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_PATH;
  if (typeof supplied !== 'string' || !supplied.trim()) throw new Error('GOVERN_STUDIO_LINEAGE_OUTPUT_REQUIRED');
  const resolved = path.resolve(supplied);
  const relative = path.relative(path.resolve('output'), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.basename(resolved) !== OUTPUT_NAME) {
    throw new Error('GOVERN_STUDIO_LINEAGE_OUTPUT_REJECTED');
  }
  return resolved;
};

const main = async () => {
  const target = outputPath();
  const gitHead = (await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).stdout.trim();
  const { releaseSha, runId, attempt } = await readGovernPreparationIdentity(process.env, gitHead);

  let fixture;
  let proof;
  try {
    fixture = await createEnterpriseLifecycleFixture({
      headSha: releaseSha, runId, runAttempt: attempt,
      hostedPersonaRoleParity: true, providersEnabled: false,
    });
    const { db, ids } = fixture;
    let ordinal = 1;
    const authority = actor => fixture.authorizationVersion(actor).then(authorizationVersion => ({
      organizationId: ids.organization, workspaceId: ids.workspace, authorizationVersion,
    }));
    const assess = async ({ actor = ids.author, token = 'enterprise-author-token', commandType,
      caseId = ids.case, expectedVersion, payload = {}, key }) => {
      const body = {
        requestId: requestId(ordinal++),
        idempotencyKey: key, commandType, ...await authority(actor),
        ...(expectedVersion === undefined ? {} : { expectedVersion }), payload: { caseId, ...payload },
      };
      const response = await fixture.executeAssess(body, token);
      return { body, response };
    };
    const committed = result => {
      assert.equal(result.response.status, 200, JSON.stringify(result.response.body));
      assert.equal(result.response.body?.ok, true, JSON.stringify(result.response.body));
      assert.equal(result.response.body?.outcome, 'committed', JSON.stringify(result.response.body));
      return result;
    };
    const fixtureSource = structuredClone(fixture.production.fixtureModule.AP_INVOICE_EXCEPTION_V2_FIXTURE);
    const authoring = () => ({
      caseId: ids.case, name: 'Govern Studio lineage proof', description: 'Synthetic local lineage proof.',
      primitives: fixtureSource.primitives, edges: fixtureSource.edges,
      decisionPoints: fixtureSource.decisionPoints, exceptionPaths: fixtureSource.exceptionPaths,
      applicationAssets: fixtureSource.assets, interactions: fixtureSource.interactions,
      evidenceLinks: fixtureSource.evidence, agentNecessity: fixtureSource.agentNecessity,
      candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
    });
    committed(await assess({ commandType: 'assessment_v2.create',
      payload: { processId: ids.process, name: 'Govern Studio lineage proof', description: '' }, key: 'lineage-create' }));
    committed(await assess({ commandType: 'assessment_v2.draft.upsert', expectedVersion: 1,
      payload: authoring(), key: 'lineage-draft' }));
    const firstFinalize = committed(await assess({ commandType: 'assessment_v2.finalize', expectedVersion: 2,
      key: 'lineage-finalize' }));
    const firstDecisionId = firstFinalize.response.body.resource.decisionId;
    const reviewPayload = (decisionId, extra = {}) => ({ decisionId, reviewSequence: 1, ...extra });
    committed(await assess({ commandType: 'assessment_v2.review.assign', expectedVersion: 3,
      payload: reviewPayload(firstDecisionId, { reviewerId: ids.reviewer }), key: 'lineage-assign' }));
    const attest = async (decisionId, expectedVersion, prefix) => {
      const assignment = (await db.query(
        'SELECT material_claims FROM assess_v2_review_assignments WHERE decision_id=$1', [decisionId])).rows[0];
      const evidenceIds = [...new Set(assignment.material_claims.flatMap(item => item.evidenceIds))];
      assert.ok(evidenceIds.length > 0);
      for (const evidenceId of evidenceIds) {
        const evidence = (await db.query(`SELECT payload FROM assess_v2_evidence_links
          WHERE id=$1 AND version_id=(SELECT source_version_id FROM assess_v2_decision_versions WHERE id=$2)`,
        [evidenceId, decisionId])).rows[0];
        committed(await assess({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
          commandType: 'assessment_v2.evidence.attest', expectedVersion,
          payload: reviewPayload(decisionId, { evidenceId, claimIds: evidence.payload.claimIds,
            outcome: 'accepted', rationale: 'Synthetic evidence independently verified.' }),
          key: `${prefix}-${evidenceId}` }));
      }
    };
    await attest(firstDecisionId, 4, 'lineage-attest-one');
    committed(await assess({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
      commandType: 'assessment_v2.review.resolve', expectedVersion: 4,
      payload: reviewPayload(firstDecisionId, { resolution: 'changes_requested',
        rationale: 'Synthetic clarification required.', conditions: ['Clarify ownership.'] }),
      key: 'lineage-changes' }));
    const revision = committed(await assess({ commandType: 'assessment_v2.revision.start', expectedVersion: 5,
      payload: reviewPayload(firstDecisionId, { rationale: 'Synthetic ownership clarified.' }), key: 'lineage-revise' }));
    const revisionVersion = Number(revision.response.body.resource.caseVersion);
    const firstDecision = (await db.query(
      'SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [firstDecisionId])).rows[0].output_snapshot;
    const revisedAuthoring = authoring();
    const claimIds = [...new Set((firstDecision.trace ?? []).flatMap(item => item.fieldIds ?? [])
      .filter(item => item !== 'evidence.coverage'))];
    revisedAuthoring.evidenceLinks[0] = { ...revisedAuthoring.evidenceLinks[0],
      claimIds: [...new Set([...(revisedAuthoring.evidenceLinks[0].claimIds ?? []), ...claimIds])] };
    committed(await assess({ commandType: 'assessment_v2.draft.upsert', expectedVersion: revisionVersion,
      payload: revisedAuthoring, key: 'lineage-revision-draft' }));
    const secondFinalize = committed(await assess({ commandType: 'assessment_v2.finalize',
      expectedVersion: revisionVersion + 1, key: 'lineage-resubmit' }));
    const decisionId = secondFinalize.response.body.resource.decisionId;
    committed(await assess({ commandType: 'assessment_v2.review.assign', expectedVersion: revisionVersion + 2,
      payload: reviewPayload(decisionId, { reviewerId: ids.reviewer }), key: 'lineage-reassign' }));
    await attest(decisionId, revisionVersion + 3, 'lineage-attest-two');
    const approval = committed(await assess({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
      commandType: 'assessment_v2.review.resolve', expectedVersion: revisionVersion + 3,
      payload: reviewPayload(decisionId, { resolution: 'approved', rationale: 'Synthetic decision approved.', conditions: [] }),
      key: 'lineage-approve' }));

    const decision = (await db.query(
      'SELECT output_snapshot FROM assess_v2_decision_versions WHERE id=$1', [decisionId])).rows[0].output_snapshot;
    const controlIds = [...new Set([...(decision.controlRequirements ?? []).filter(item => item.required).map(item => item.id),
      ...(decision.controls ?? [])])];
    assert.ok(controlIds.length > 0);
    const governPayload = reviewPayload(decisionId, { rationale: 'Every synthetic control is resolved.',
      controlDispositions: controlIds.map(controlId => ({ controlId, status: 'resolved', condition: '',
        owner: '', dueDate: '', conditionSatisfied: false })) });
    const beforeDenied = await db.query(`SELECT
      (SELECT count(*)::int FROM assess_v2_govern_resolutions WHERE case_id=$1) govern,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$2 AND workspace_id=$3) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE resource_id=$1) audits`,
    [ids.case, ids.organization, ids.workspace]);
    const denied = await assess({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
      commandType: 'assessment_v2.govern.resolve', expectedVersion: revisionVersion + 4,
      payload: governPayload, key: 'lineage-reviewer-govern-denied' });
    assert.equal(denied.response.status, 403, JSON.stringify(denied.response.body));
    assert.equal(denied.response.body?.error?.code, 'PERMISSION_DENIED');
    assert.deepEqual((await db.query(`SELECT
      (SELECT count(*)::int FROM assess_v2_govern_resolutions WHERE case_id=$1) govern,
      (SELECT count(*)::int FROM assess_command_receipts WHERE org_id=$2 AND workspace_id=$3) receipts,
      (SELECT count(*)::int FROM privileged_audit_events WHERE resource_id=$1) audits`,
    [ids.case, ids.organization, ids.workspace])).rows,
    beforeDenied.rows);
    const governed = committed(await assess({ actor: ids.approver, token: 'enterprise-approver-token',
      commandType: 'assessment_v2.govern.resolve', expectedVersion: revisionVersion + 4,
      payload: governPayload, key: 'lineage-approver-govern' }));
    const assessHandoff = committed(await assess({ actor: ids.approver, token: 'enterprise-approver-token',
      commandType: 'assessment_v2.studio.handoff', expectedVersion: revisionVersion + 5,
      payload: reviewPayload(decisionId), key: 'lineage-assess-handoff' }));
    const assessHandoffId = (await db.query(
      'SELECT id FROM assess_v2_studio_handoffs WHERE case_id=$1 AND decision_id=$2', [ids.case, decisionId])).rows[0].id;

    const studio = async ({ actor, token, commandType, expectedAggregateVersion, expectedArtifactVersion, payload, key }) => {
      const body = {
        contractVersion: 'studio-artifact-2', requestId: requestId(ordinal++), idempotencyKey: key,
        commandType, ...await authority(actor), expectedAggregateVersion, expectedArtifactVersion, payload,
      };
      const response = await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
      const responseBody = await response.json();
      assert.equal(response.status, 201, JSON.stringify(responseBody));
      assert.equal(responseBody.outcome, 'committed', JSON.stringify(responseBody));
      return { body, response: { status: response.status, body: responseBody } };
    };
    const requested = await studio({ actor: ids.approver, token: 'enterprise-approver-token',
      commandType: 'studio.handoff.request', expectedAggregateVersion: 0, expectedArtifactVersion: null,
      payload: { upstreamHandoffId: assessHandoffId, artifactType: 'brd', targetInputBundle: null },
      key: 'lineage-studio-request' });
    const moduleHandoffId = requested.response.body.resource.handoffId;
    const reviewed = await studio({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
      commandType: 'studio.handoff.review.resolve', expectedAggregateVersion: 1, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 1, outcome: 'approve',
        rationale: 'Synthetic lineage independently reviewed.', conditions: [] }, key: 'lineage-studio-review' });
    const accepted = await studio({ actor: ids.author, token: 'enterprise-author-token',
      commandType: 'studio.handoff.approval.resolve', expectedAggregateVersion: 2, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 2, outcome: 'approve',
        rationale: 'Synthetic lineage accepted.', conditions: [] }, key: 'lineage-studio-accept' });
    const consumed = await studio({ actor: ids.approver, token: 'enterprise-approver-token',
      commandType: 'studio.handoff.consume', expectedAggregateVersion: 3, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 3 }, key: 'lineage-studio-consume' });
    const artifactId = consumed.response.body.resource.resourceId;
    assert.ok(UUID.test(artifactId));

    const bindings = (await db.query(`SELECT
      review.receipt_id review_receipt,govern.receipt_id govern_receipt,handoff.receipt_id handoff_receipt
      FROM assess_v2_review_resolutions review
      JOIN assess_v2_govern_resolutions govern ON govern.review_resolution_id=review.id
      JOIN assess_v2_studio_handoffs handoff ON handoff.govern_resolution_id=govern.id
      WHERE review.case_id=$1 AND review.decision_id=$2 AND review.resolution='approved'`, [ids.case, decisionId])).rows[0];
    const moduleReceipts = (await db.query(`SELECT id,request_id,actor_id,resource_id,command_type FROM
      enterprise_module_handoff_command_receipts WHERE org_id=$1 AND workspace_id=$2
      AND command_type=ANY($3::text[]) ORDER BY array_position($3::text[],command_type)`,
    [ids.organization, ids.workspace, ['handoff.request', 'handoff.review.resolve',
      'handoff.approval.resolve', 'handoff.consume']])).rows;
    assert.equal(moduleReceipts.length, 4);
    const governRows = [];
    for (const [sql, parameters] of [
      ['SELECT * FROM assess_v2_cases WHERE id=$1', [ids.case]],
      ['SELECT * FROM assess_v2_govern_resolutions WHERE case_id=$1', [ids.case]],
      ['SELECT * FROM assess_command_receipts WHERE request_id=$1', [governed.body.requestId]],
      ['SELECT * FROM privileged_audit_events WHERE request_id=$1', [governed.body.requestId]],
    ]) governRows.push(await db.query(sql, parameters));
    assert.ok(governRows.every(result => result.rowCount === 1));
    const governRecords = ['assess_v2_cases', 'assess_v2_govern_resolutions', 'assess_command_receipts',
      'privileged_audit_events'].map((source, index) => rowRecord(source, governRows[index].rows[0]));
    const actionInput = [
      [approval, ids.reviewer], [denied, ids.reviewer], [governed, ids.approver], [assessHandoff, ids.approver],
      [requested, ids.approver], [reviewed, ids.reviewer], [accepted, ids.author], [consumed, ids.approver],
    ];
    const actions = actionInput.map(([result, actor], index) => {
      const payload = result.body.payload ?? {};
      const resource = firstString(payload.caseId, payload.handoffId, payload.upstreamHandoffId,
        result.body.caseId, result.body.handoffId, result.body.upstreamHandoffId);
      assert.ok(UUID.test(resource ?? ''));
      const actorHash = authenticatedHostedDigest(actor);
      const requestBinding = authenticatedHostedRequestBinding({
        requestId: result.body.requestId, actorHash, commandType: result.body.commandType,
        payload: result.body, requireUuid: true,
      });
      return {
        actorHash, ...requestBinding, requestResourceIdHash: authenticatedHostedDigest(resource),
        commandType: result.body.commandType,
        response: authenticatedHostedResponseObservation({
          responseBody: result.response.body, status: result.response.status,
        }),
        before: frame(index * 2), after: frame(index * 2 + 1),
      };
    });
    const assessReceiptRows = [
      [0, governRows[2].rows[0], bindings.review_receipt, ids.case],
      [2, governRows[2].rows[0], bindings.govern_receipt, ids.case],
      [3, governRows[2].rows[0], bindings.handoff_receipt, ids.case],
    ];
    for (const [index, placeholder, receiptId, commandId] of assessReceiptRows) {
      const row = index === 2 ? placeholder : (await db.query(
        'SELECT * FROM assess_command_receipts WHERE request_id=$1', [actionInput[index][0].body.requestId])).rows[0];
      assert.equal(row.id, receiptId);
      const receiptRecord = { ...rowRecord('assess_command_receipts', row), effectKind: 'receipt',
        actorHash: actions[index].actorHash, requestIdHash: actions[index].requestIdHash,
        commandBindingHash: actions[index].commandBindingHash,
        receiptIdHash: authenticatedHostedDigest(row.id), commandIdHash: authenticatedHostedDigest(commandId) };
      actions[index].after = frame(index * 2 + 1, index === 2
        ? governRecords.map(record => record.source === 'assess_command_receipts' ? receiptRecord : record)
        : [receiptRecord]);
    }
    actions.forEach((action, index) => {
      action.response = authenticatedHostedBindResponseObservation({ observation: action.response,
        action, after: action.after });
    });
    const expectedReceipts = [bindings.review_receipt, null, bindings.govern_receipt, bindings.handoff_receipt,
      ...moduleReceipts.map(row => row.id)];
    const expectedCommands = [ids.case, null, ids.case, ids.case, moduleHandoffId, moduleHandoffId,
      moduleHandoffId, artifactId];
    actions.forEach((action, index) => {
      assert.equal(action.response.receiptIdHash,
        expectedReceipts[index] ? authenticatedHostedDigest(expectedReceipts[index]) : null,
      `response-receipt-${index}`);
      assert.equal(action.response.commandIdHash,
        expectedCommands[index] ? authenticatedHostedDigest(expectedCommands[index]) : null,
      `response-command-${index}`);
    });
    const project = { projectId: ids.process, processId: ids.process, identities: {
      author: { id: ids.author }, reviewer: { id: ids.reviewer }, approver: { id: ids.approver }, outsider: { id: ids.outsider },
    } };
    const adapter = createAuthenticatedHostedPostgresAdapter({
      config: { scope: { organizationId: ids.organization, workspaceId: ids.workspace } }, db,
      verifyDeployment: async () => ({}), verifySecretBackend: async () => ({}),
    });
    const lineage = await adapter.verifyGovernStudioDiagnosticLineage({ project, actions });
    assert.equal(lineage.verified, true);
    const resourceSubstitutionRejected = (await failCode(() => adapter.verifyGovernStudioDiagnosticLineage({
      project, actions: actions.map((action, index) => index === 1
        ? { ...action, requestResourceIdHash: authenticatedHostedDigest(ids.deniedCase) } : action),
    }))).endsWith('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_REJECTED');
    const receiptSubstitutionRejected = (await failCode(() => adapter.verifyGovernStudioDiagnosticLineage({
      project, actions: actions.map((action, index) => index === 2
        ? { ...action, response: { ...action.response, receiptIdHash: authenticatedHostedDigest(ids.deniedCase) } } : action),
    }))).endsWith('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_REJECTED');
    const actorSubstitutionRejected = (await failCode(() => adapter.verifyGovernStudioDiagnosticLineage({
      project, actions: actions.map((action, index) => index === 1
        ? { ...action, actorHash: authenticatedHostedDigest(ids.approver) } : action),
    }))).endsWith('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_REJECTED');
    await db.query('BEGIN');
    let extraScopedRowRejected = false;
    try {
      await db.query("INSERT INTO assess_processes(id,org_id,workspace_id,name,status) VALUES($1,$2,$3,'Lineage spare','Draft')", [ids.deniedCase, ids.organization, ids.workspace]);
      committed(await assess({ commandType: 'assessment_v2.create', caseId: ids.deniedCase,
        payload: { processId: ids.deniedCase, name: 'Lineage spare', description: '' }, key: 'lineage-spare' }));
      await db.query('UPDATE assess_v2_cases SET process_id=$1 WHERE id=$2', [ids.process, ids.deniedCase]);
      extraScopedRowRejected = (await failCode(() => adapter.verifyGovernStudioDiagnosticLineage({ project, actions })))
        .endsWith('AUTHENTICATED_HOSTED_GOVERN_STUDIO_LINEAGE_REJECTED');
    } finally { await db.query('ROLLBACK'); }
    assert.deepEqual({ resourceSubstitutionRejected, receiptSubstitutionRejected, actorSubstitutionRejected,
      extraScopedRowRejected }, { resourceSubstitutionRejected: true, receiptSubstitutionRejected: true,
      actorSubstitutionRejected: true, extraScopedRowRejected: true });
    assert.equal(fixture.evidence.providerEffects.calls, 0);
    assert.equal(fixture.evidence.providerEffects.paidCalls, 0);
    proof = {
      schemaVersion: AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA, status: 'PASS',
      source: { releaseSha, runId, attempt, workflow: process.env.GITHUB_WORKFLOW,
        job: process.env.GITHUB_JOB, sourceDigest: await sourceDigest() },
      runtime: { postgresql: true, productionHandlers: true, providersEnabled: false,
        providerCalls: 0, paidCalls: 0 },
      positive: { verified: true, actionCount: actions.length, lineageDigest: lineage.lineageDigest },
      negative: { resourceSubstitutionRejected, receiptSubstitutionRejected, actorSubstitutionRejected,
        extraScopedRowRejected }, cleanup: { databaseRemoved: false },
    };
  } finally {
    if (fixture) {
      const removed = await fixture.close();
      if (proof) proof.cleanup.databaseRemoved = removed === true && fixture.evidence.cleanup.residualRows === 0;
    }
  }
  const validated = validateAuthenticatedGovernStudioLineageProof(proof);
  if (!validated) throw new Error('GOVERN_STUDIO_LINEAGE_PROOF_REJECTED');
  await writeFile(target, `${JSON.stringify(validated, null, 2)}\n`, { flag: 'wx' });
};

main().catch(error => {
  process.stderr.write(`${error?.message ?? 'GOVERN_STUDIO_LINEAGE_PROOF_FAILED'}\n`);
  process.exitCode = 1;
});
