import assert from 'node:assert/strict';
import {
  createApprovedStudioFixture,
  privateCommand,
} from './studioPrivateArtifactPostgresFixture.mjs';

const uuid = (ordinal) =>
  `53000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;

async function createAvailableRendition(db, base, format, ordinal) {
  const generation = await privateCommand(db, {
    commandType: 'studio.rendition.generate',
    actorId: base.requester,
    organizationId: base.org,
    workspaceId: base.workspace,
    requestId: uuid(ordinal),
    idempotencyKey: `deletion-binding-render-${format}`,
    authorizationVersion: base.authorizationVersions[base.requester],
    payload: {
      artifactVersionId: base.artifactVersionId,
      format,
    },
  });
  assert.equal(generation.outcome, 'committed');
  assert.ok(generation.renditionClaim);

  const claim = generation.renditionClaim;
  const extension = format === 'markdown' ? 'md' : format;
  const mimeType =
    format === 'markdown'
      ? 'text/markdown; charset=utf-8'
      : format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const objectKey =
    `${base.org}/${base.workspace}/studio-artifacts/` +
    `${claim.opaqueObjectId}.${extension}`;

  await db.query('SELECT public.studio_rendition_attempt_start($1::uuid)', [
    claim.attemptId,
  ]);
  await db.query(
    `SELECT public.studio_rendition_attempt_rendered(
       $1::uuid,$2::text,$3::text,$4::bigint,$5::text,
       $6::text,$7::text,$8::text,$9::text
     )`,
    [
      claim.attemptId,
      objectKey,
      String(ordinal % 10).repeat(64),
      128 + ordinal,
      mimeType,
      `deletion-binding-${format}.${extension}`,
      claim.rendererVersion,
      claim.templateVersion,
      claim.contentSchemaVersion,
    ],
  );
  const completion = (
    await db.query(
      'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
      [claim.attemptId],
    )
  ).rows[0].result;
  assert.equal(completion.outcome, 'committed');

  return (
    await db.query(
      `SELECT id,org_id,workspace_id,artifact_version,lifecycle,lifecycle_version
       FROM public.studio_renditions WHERE id=$1::uuid`,
      [completion.renditionId],
    )
  ).rows[0];
}

async function requestDeletion(db, base, rendition, ordinal) {
  const result = await privateCommand(db, {
    commandType: 'studio.rendition.deletion.request',
    actorId: base.requester,
    organizationId: base.org,
    workspaceId: base.workspace,
    requestId: uuid(ordinal),
    idempotencyKey: `deletion-binding-request-${ordinal}`,
    authorizationVersion: base.authorizationVersions[base.requester],
    expectedArtifactVersion: Number(rendition.artifact_version),
    expectedRenditionVersion: Number(rendition.lifecycle_version),
    payload: {
      renditionId: rendition.id,
      rationale: 'disposable deletion binding evidence',
    },
  });
  assert.equal(result.outcome, 'committed');
  return result.resource.deletionRequestId;
}

async function renditionVersion(db, renditionId) {
  return (
    await db.query(
      `SELECT artifact_version,lifecycle,lifecycle_version
       FROM public.studio_renditions WHERE id=$1::uuid`,
      [renditionId],
    )
  ).rows[0];
}

async function bindingSnapshot(db, base, renditionIds, deletionRequestIds) {
  return (
    await db.query(
      `SELECT
         (SELECT count(*)::int
            FROM public.studio_private_artifact_command_receipts
           WHERE org_id=$1::uuid
             AND command_type='studio.rendition.deletion.resolve') AS receipts,
         (SELECT count(*)::int
            FROM public.studio_rendition_deletion_resolutions
           WHERE request_id=ANY($3::uuid[])) AS resolutions,
         (SELECT count(*)::int
            FROM public.studio_rendition_deletion_attempts
           WHERE request_id=ANY($3::uuid[])) AS deletion_attempts,
         (SELECT count(*)::int
            FROM public.privileged_audit_events
           WHERE org_id=$1::uuid
             AND action='studio.rendition.deletion.resolve'
             AND resource_type='studio_deletion_resolution') AS audits,
         (SELECT count(*)::int
            FROM public.studio_rendition_deletion_requests
           WHERE id=ANY($3::uuid[])) AS requests,
         (SELECT COALESCE(jsonb_agg(
                   jsonb_build_object(
                     'id',id,
                     'lifecycle',lifecycle,
                     'version',lifecycle_version
                   ) ORDER BY id
                 ),'[]'::jsonb)
            FROM public.studio_renditions
           WHERE id=ANY($2::uuid[])) AS renditions`,
      [base.org, renditionIds, deletionRequestIds],
    )
  ).rows[0];
}

function resolutionCommand({
  base,
  rendition,
  deletionRequestId,
  outcome,
  ordinal,
  actorId = base.approver,
  organizationId = base.org,
  workspaceId = base.workspace,
  expectedArtifactVersion = Number(rendition.artifact_version),
  expectedRenditionVersion = Number(rendition.lifecycle_version),
}) {
  return {
    commandType: 'studio.rendition.deletion.resolve',
    actorId,
    organizationId,
    workspaceId,
    requestId: uuid(ordinal),
    idempotencyKey: `deletion-binding-resolution-${ordinal}`,
    authorizationVersion: base.authorizationVersions[actorId],
    expectedArtifactVersion,
    expectedRenditionVersion,
    payload: {
      renditionId: rendition.id,
      deletionRequestId,
      outcome,
      rationale: 'independent disposable resolution evidence',
    },
  };
}

async function rejectedWithoutDelta({
  db,
  scenario,
  name,
  command,
  snapshot,
  expectedError,
}) {
  await db.query('BEGIN');
  try {
    const before = await snapshot();
    await db.query('SAVEPOINT deletion_binding_attempt');
    let rejection;
    let unexpectedResult;
    try {
      unexpectedResult = await privateCommand(db, command);
    } catch (error) {
      rejection = error;
      await db.query('ROLLBACK TO SAVEPOINT deletion_binding_attempt');
    }
    const after = await snapshot();
    await scenario(name, async () => {
      assert.ok(rejection, `command unexpectedly committed: ${JSON.stringify(unexpectedResult)}`);
      if (expectedError) {
        assert.match(
          rejection instanceof Error ? rejection.message : String(rejection),
          expectedError,
        );
      }
      assert.deepEqual(after, before);
    });
  } finally {
    await db.query('ROLLBACK');
  }
}

export async function runStudioDeletionResolutionBindingEvidence({
  db,
  scenario,
  names,
}) {
  assert.equal(names.length, 11);
  const base = await createApprovedStudioFixture(db);

  await privateCommand(db, {
    commandType: 'studio.retention.policy.publish',
    actorId: base.requester,
    organizationId: base.org,
    workspaceId: base.workspace,
    requestId: uuid(1),
    idempotencyKey: 'deletion-binding-zero-retention',
    authorizationVersion: base.authorizationVersions[base.requester],
    payload: {
      artifactType: 'brd',
      retentionDays: 0,
      indefinite: false,
      rationale: 'disposable immediately eligible retention',
    },
  });

  const first = await createAvailableRendition(db, base, 'markdown', 10);
  const second = await createAvailableRendition(db, base, 'pdf', 11);
  const firstRequestId = await requestDeletion(db, base, first, 20);
  const secondRequestId = await requestDeletion(db, base, second, 21);
  const firstPending = await renditionVersion(db, first.id);
  const secondPending = await renditionVersion(db, second.id);
  Object.assign(first, firstPending);
  Object.assign(second, secondPending);

  const renditionIds = [first.id, second.id];
  const deletionRequestIds = [firstRequestId, secondRequestId];
  const snapshot = () =>
    bindingSnapshot(db, base, renditionIds, deletionRequestIds);

  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[0],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: second,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 30,
    }),
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[1],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: secondRequestId,
      outcome: 'reject',
      ordinal: 31,
    }),
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[2],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 32,
      organizationId: uuid(900),
    }),
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[3],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 33,
      workspaceId: uuid(901),
    }),
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[4],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 34,
      expectedArtifactVersion: Number(first.artifact_version) + 1,
    }),
    expectedError: /VERSION_CONFLICT/,
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[5],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 35,
      expectedRenditionVersion: Number(first.lifecycle_version) - 1,
    }),
    expectedError: /VERSION_CONFLICT/,
  });
  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[6],
    snapshot,
    command: resolutionCommand({
      base,
      rendition: first,
      deletionRequestId: firstRequestId,
      outcome: 'approve',
      ordinal: 36,
      actorId: base.requester,
    }),
    expectedError: /STUDIO_SEPARATION_OF_DUTY/,
  });

  const approveBefore = await snapshot();
  const approveCommand = resolutionCommand({
    base,
    rendition: first,
    deletionRequestId: firstRequestId,
    outcome: 'approve',
    ordinal: 40,
  });
  const approval = await privateCommand(db, approveCommand);
  const approveAfter = await snapshot();
  const approvedRows = (
    await db.query(
      `SELECT
         resolution.id AS resolution_id,
         resolution.request_id,
         resolution.rendition_id,
         resolution.org_id,
         resolution.workspace_id,
         resolution.resolved_by,
         resolution.outcome,
         attempt.id AS attempt_id,
         attempt.request_id AS attempt_request_id,
         attempt.rendition_id AS attempt_rendition_id,
         attempt.org_id AS attempt_org_id,
         attempt.workspace_id AS attempt_workspace_id,
         attempt.state AS attempt_state
       FROM public.studio_rendition_deletion_resolutions resolution
       JOIN public.studio_rendition_deletion_attempts attempt
         ON attempt.resolution_id=resolution.id
       WHERE resolution.id=$1::uuid`,
      [approval.resource.resolutionId],
    )
  ).rows[0];
  await scenario(names[7], async () => {
    assert.equal(approval.outcome, 'committed');
    assert.equal(approval.resource.deletionRequestId, firstRequestId);
    assert.equal(approval.resource.renditionId, first.id);
    assert.equal(approval.resource.status, 'deleting');
    assert.equal(approval.deletionClaim.renditionId, first.id);
    assert.equal(approval.deletionClaim.deletionAttemptId, approvedRows.attempt_id);
    assert.deepEqual(
      {
        requestId: approvedRows.request_id,
        renditionId: approvedRows.rendition_id,
        organizationId: approvedRows.org_id,
        workspaceId: approvedRows.workspace_id,
        actorId: approvedRows.resolved_by,
        outcome: approvedRows.outcome,
        attemptRequestId: approvedRows.attempt_request_id,
        attemptRenditionId: approvedRows.attempt_rendition_id,
        attemptOrganizationId: approvedRows.attempt_org_id,
        attemptWorkspaceId: approvedRows.attempt_workspace_id,
        attemptState: approvedRows.attempt_state,
      },
      {
        requestId: firstRequestId,
        renditionId: first.id,
        organizationId: base.org,
        workspaceId: base.workspace,
        actorId: base.approver,
        outcome: 'approved',
        attemptRequestId: firstRequestId,
        attemptRenditionId: first.id,
        attemptOrganizationId: base.org,
        attemptWorkspaceId: base.workspace,
        attemptState: 'requested',
      },
    );
    assert.deepEqual(
      {
        receipts: approveAfter.receipts - approveBefore.receipts,
        resolutions: approveAfter.resolutions - approveBefore.resolutions,
        deletionAttempts:
          approveAfter.deletion_attempts - approveBefore.deletion_attempts,
        audits: approveAfter.audits - approveBefore.audits,
      },
      {receipts: 1, resolutions: 1, deletionAttempts: 1, audits: 1},
    );
  });

  const replayBefore = await snapshot();
  const replay = await privateCommand(db, approveCommand);
  const replayAfter = await snapshot();
  await scenario(names[8], async () => {
    assert.equal(replay.outcome, 'replayed');
    assert.equal(replay.receiptId, approval.receiptId);
    assert.equal(replay.resourceId, approval.resourceId);
    assert.equal('deletionClaim' in replay, false);
    assert.deepEqual(replayAfter, replayBefore);
  });

  const rejectBefore = await snapshot();
  const rejectCommand = resolutionCommand({
    base,
    rendition: second,
    deletionRequestId: secondRequestId,
    outcome: 'reject',
    ordinal: 41,
  });
  const rejection = await privateCommand(db, rejectCommand);
  const rejectAfter = await snapshot();
  const rejectedRow = (
    await db.query(
      `SELECT request_id,rendition_id,org_id,workspace_id,resolved_by,outcome
       FROM public.studio_rendition_deletion_resolutions
       WHERE id=$1::uuid`,
      [rejection.resource.resolutionId],
    )
  ).rows[0];
  const rejectedRendition = await renditionVersion(db, second.id);
  await scenario(names[9], async () => {
    assert.equal(rejection.outcome, 'committed');
    assert.equal(rejection.resource.deletionRequestId, secondRequestId);
    assert.equal(rejection.resource.renditionId, second.id);
    assert.equal(rejection.resource.status, 'rejected');
    assert.equal('deletionClaim' in rejection, false);
    assert.deepEqual(rejectedRow, {
      request_id: secondRequestId,
      rendition_id: second.id,
      org_id: base.org,
      workspace_id: base.workspace,
      resolved_by: base.approver,
      outcome: 'rejected',
    });
    assert.equal(rejectedRendition.lifecycle, 'available');
    assert.deepEqual(
      {
        receipts: rejectAfter.receipts - rejectBefore.receipts,
        resolutions: rejectAfter.resolutions - rejectBefore.resolutions,
        deletionAttempts:
          rejectAfter.deletion_attempts - rejectBefore.deletion_attempts,
        audits: rejectAfter.audits - rejectBefore.audits,
      },
      {receipts: 1, resolutions: 1, deletionAttempts: 0, audits: 1},
    );
  });

  await rejectedWithoutDelta({
    db,
    scenario,
    name: names[10],
    snapshot,
    command: {
      ...rejectCommand,
      requestId: uuid(42),
      idempotencyKey: 'deletion-binding-resolved-new-key',
      expectedRenditionVersion: Number(rejectedRendition.lifecycle_version),
    },
  });

  const finalSnapshot = await snapshot();
  const evidence = {
    rejectedBindings: 7,
    validResolutions: finalSnapshot.resolutions,
    providerEffectClaims: finalSnapshot.deletion_attempts,
    resolutionReceipts: finalSnapshot.receipts,
    resolutionAudits: finalSnapshot.audits,
    replayReceiptStable: replay.receiptId === approval.receiptId,
  };
  console.log(`DELETION RESOLUTION BINDING COUNTS ${JSON.stringify(evidence)}`);
  return evidence;
}
