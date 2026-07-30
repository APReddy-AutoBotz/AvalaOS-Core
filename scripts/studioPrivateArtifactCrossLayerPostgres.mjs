import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApprovedStudioFixture,
  downloadCommand,
  privateCommand,
} from './studioPrivateArtifactPostgresFixture.mjs';

export async function runStudioPrivateArtifactCrossLayerEvidence(
  db,
  { scenario, names, contractParityPassed },
) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-private-cross-layer-'));
  let ordinal = 0;
  const consume = async (mode, input) => {
    ordinal += 1;
    const inputPath = join(directory, `${ordinal}-${mode}-input.json`);
    const outputPath = join(directory, `${ordinal}-${mode}-output.json`);
    await writeFile(inputPath, `${JSON.stringify(input)}\n`, 'utf8');
    execFileSync(
      process.execPath,
      [
        'scripts/runEdgeTypeScriptTest.mjs',
        'types.ts',
        'supabase/functions/deno.d.ts',
        'supabase/functions/_shared/studioPrivateArtifactCrossLayerConsumer.test.ts',
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          STUDIO_PRIVATE_CROSS_LAYER_MODE: mode,
          STUDIO_PRIVATE_CROSS_LAYER_INPUT: inputPath,
          STUDIO_PRIVATE_CROSS_LAYER_OUTPUT: outputPath,
        },
      },
    );
    return JSON.parse(await readFile(outputPath, 'utf8'));
  };

  try {
    const fixture = await createApprovedStudioFixture(db);
    const actor = fixture.requester;
    const approver = fixture.approver;
    const organizationId = fixture.org;
    const workspaceId = fixture.workspace;

    await privateCommand(db, {
      commandType: 'studio.retention.policy.publish',
      actorId: actor,
      organizationId,
      workspaceId,
      requestId: '51000000-0000-4000-8000-000000000001',
      idempotencyKey: 'cross-retention-zero',
      authorizationVersion: fixture.authorizationVersions[actor],
      payload: {
        artifactType: 'brd',
        indefinite: false,
        retentionDays: 0,
        rationale: 'disposable cross-layer evidence',
      },
    });

    const generationCommand = {
      commandType: 'studio.rendition.generate',
      actorId: actor,
      organizationId,
      workspaceId,
      requestId: '51000000-0000-4000-8000-000000000002',
      idempotencyKey: 'cross-render-markdown',
      authorizationVersion: fixture.authorizationVersions[actor],
      payload: {
        artifactVersionId: fixture.artifactVersionId,
        format: 'markdown',
      },
    };
    const generation = await privateCommand(db, generationCommand);
    assert.equal(generation.outcome, 'committed');
    assert.ok(generation.renditionClaim);
    const renderEvidence = await consume('rendition', {
      claim: generation.renditionClaim,
    });
    const work = renderEvidence.persisted;

    await db.query(
      'SELECT public.studio_rendition_attempt_start($1::uuid)',
      [work.attemptId],
    );
    await db.query(
      'SELECT public.studio_rendition_attempt_rendered($1::uuid,$2::text,$3::text,$4::bigint,$5::text,$6::text,$7::text,$8::text,$9::text)',
      [
        work.attemptId,
        work.objectKey,
        work.sha256,
        work.byteLength,
        work.mimeType,
        work.filename,
        work.rendererVersion,
        work.templateVersion,
        work.contentSchemaVersion,
      ],
    );
    const completion = (
      await db.query(
        'SELECT public.studio_rendition_attempt_complete($1::uuid) result',
        [work.attemptId],
      )
    ).rows[0].result;
    assert.equal(completion.renditionId, generation.renditionClaim.renditionId);

    const rendition = (
      await db.query('SELECT * FROM public.studio_renditions WHERE id=$1::uuid', [
        completion.renditionId,
      ])
    ).rows[0];
    const attempt = (
      await db.query(
        'SELECT * FROM public.studio_rendition_attempts WHERE id=$1::uuid',
        [work.attemptId],
      )
    ).rows[0];

    const downloadRequest = {
      actorId: actor,
      organizationId,
      workspaceId,
      renditionId: rendition.id,
      requestId: '51000000-0000-4000-8000-000000000003',
      idempotencyKey: 'cross-download',
      authorizationVersion: fixture.authorizationVersions[actor],
    };
    const download = await downloadCommand(db, downloadRequest);
    const downloadReplay = await downloadCommand(db, downloadRequest);
    assert.equal(downloadReplay.outcome, 'replayed');
    const downloadEvidence = await consume('download', {
      claim: download.downloadClaim,
      replayClaim: downloadReplay.downloadClaim,
      bytesBase64: renderEvidence.bytesBase64,
    });
    await db.query(
      'SELECT public.studio_artifact_download_complete($1::uuid)',
      [download.receiptId],
    );

    const deletionRequest = await privateCommand(db, {
      commandType: 'studio.rendition.deletion.request',
      actorId: actor,
      organizationId,
      workspaceId,
      requestId: '51000000-0000-4000-8000-000000000004',
      idempotencyKey: 'cross-delete-request',
      authorizationVersion: fixture.authorizationVersions[actor],
      payload: {
        renditionId: rendition.id,
        rationale: 'cross-layer eligible deletion',
      },
    });
    const deletionApprovalCommand = {
      commandType: 'studio.rendition.deletion.resolve',
      actorId: approver,
      organizationId,
      workspaceId,
      requestId: '51000000-0000-4000-8000-000000000005',
      idempotencyKey: 'cross-delete-approve',
      authorizationVersion: fixture.authorizationVersions[approver],
      payload: {
        deletionRequestId: deletionRequest.resource.deletionRequestId,
        outcome: 'approve',
        rationale: 'independent cross-layer approval',
      },
    };
    const deletion = await privateCommand(db, deletionApprovalCommand);
    assert.ok(deletion.deletionClaim);
    const deletionEvidence = await consume('deletion', {
      claim: deletion.deletionClaim,
      expectation: {
        organizationId: work.organizationId,
        workspaceId: work.workspaceId,
        objectKey: work.objectKey,
        byteLength: work.byteLength,
        sha256: work.sha256,
        mimeType: work.mimeType,
      },
      bytesBase64: renderEvidence.bytesBase64,
    });
    await db.query(
      'SELECT public.studio_rendition_deletion_complete($1::uuid)',
      [deletion.deletionClaim.deletionAttemptId],
    );
    const deletionReplay = await privateCommand(db, deletionApprovalCommand);
    assert.equal(deletionReplay.outcome, 'replayed');
    assert.equal('deletionClaim' in deletionReplay, false);

    const finalRendition = (
      await db.query('SELECT * FROM public.studio_renditions WHERE id=$1::uuid', [
        rendition.id,
      ])
    ).rows[0];
    const attemptCount = (
      await db.query(
        'SELECT count(*)::int n FROM studio_rendition_attempts WHERE request_id=$1::uuid',
        [generationCommand.requestId],
      )
    ).rows[0].n;
    const renditionCount = (
      await db.query(
        'SELECT count(*)::int n FROM studio_renditions WHERE id=$1::uuid',
        [rendition.id],
      )
    ).rows[0].n;

    await scenario(names[0], async () =>
      assert.equal(contractParityPassed, true),
    );
    await scenario(names[1], async () =>
      assert.deepEqual(
        {
          attempts: attemptCount,
          uploads: renderEvidence.uploadCount,
          objects: renderEvidence.objectCount,
          renditions: renditionCount,
          lifecycle: rendition.lifecycle,
        },
        {
          attempts: 1,
          uploads: 1,
          objects: 1,
          renditions: 1,
          lifecycle: 'available',
        },
      ),
    );
    await scenario(names[2], async () => {
      for (const field of [
        'renderer_version',
        'template_version',
        'content_schema_version',
      ]) {
        assert.equal(attempt[field], rendition[field]);
      }
      assert.equal(work.rendererVersion, rendition.renderer_version);
      assert.equal(work.templateVersion, rendition.template_version);
      assert.equal(work.contentSchemaVersion, rendition.content_schema_version);
    });
    await scenario(names[3], async () =>
      assert.deepEqual(
        {
          outcome: downloadReplay.outcome,
          downloads: downloadEvidence.downloadCount,
          bytes: downloadEvidence.byteLength,
          hash: downloadEvidence.sha256,
        },
        {
          outcome: 'replayed',
          downloads: 2,
          bytes: work.byteLength,
          hash: work.sha256,
        },
      ),
    );
    await scenario(names[4], async () =>
      assert.deepEqual(
        {
          providerDeletes: deletionEvidence.providerDeleteCount,
          tombstones: deletionEvidence.tombstoneCount,
          objects: deletionEvidence.objectCount,
          lifecycle: finalRendition.lifecycle,
        },
        {
          providerDeletes: 1,
          tombstones: 1,
          objects: 0,
          lifecycle: 'deleted',
        },
      ),
    );
    await scenario(names[5], async () =>
      assert.deepEqual(
        {
          attempts: attemptCount,
          renditions: renditionCount,
          uploads: renderEvidence.uploadCount,
          providerDeletes: deletionEvidence.providerDeleteCount,
          downloadRetrievals: downloadEvidence.downloadCount,
          replayHasDeletionClaim: 'deletionClaim' in deletionReplay,
        },
        {
          attempts: 1,
          renditions: 1,
          uploads: 1,
          providerDeletes: 1,
          downloadRetrievals: 2,
          replayHasDeletionClaim: false,
        },
      ),
    );
    const counts = {
      attempts: attemptCount,
      objectsAfterGeneration: renderEvidence.objectCount,
      renditions: renditionCount,
      uploads: renderEvidence.uploadCount,
      downloadRetrievals: downloadEvidence.downloadCount,
      providerDeletes: deletionEvidence.providerDeleteCount,
      objectsAfterDeletion: deletionEvidence.objectCount,
    };
    console.log(`CROSS-LAYER COUNTS ${JSON.stringify(counts)}`);
    return counts;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
