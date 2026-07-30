import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  decodeStudioAtomicResult,
  decodeStudioDeletionClaim,
  decodeStudioDownloadClaim,
  decodeStudioRenditionClaim,
  STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS,
  STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST,
} from './studioPrivateArtifactRpcContract.ts';

const migration = readFileSync(
  'supabase/migrations/20260729163251_studio_private_artifact_authority.sql',
  'utf8',
);
const adapter = readFileSync(
  'supabase/functions/_shared/studioPrivateArtifactDb.ts',
  'utf8',
);
const uuid = (ordinal: number) =>
  `70000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`;

const sqlSignatures = new Map<string, readonly string[]>();
const signaturePattern =
  /CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(([^)]*)\)/gu;
for (const match of migration.matchAll(signaturePattern)) {
  const parameters = match[2].trim()
    ? match[2]
        .split(',')
        .map(parameter => parameter.trim().split(/\s+/u)[0])
    : [];
  sqlSignatures.set(match[1], parameters);
}

test('every production RPC name and parameter key exactly matches SQL', () => {
  assert.equal(Object.keys(STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST).length, 12);
  for (const [surface, contract] of Object.entries(
    STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST,
  )) {
    assert.deepEqual(
      sqlSignatures.get(contract.functionName),
      contract.parameterNames,
      `${surface}: ${contract.functionName}`,
    );
  }
  for (const obsolete of [
    'studio_private_artifact_rendition_rendered',
    'studio_private_artifact_rendition_complete',
    'studio_private_artifact_rendition_fail',
    'studio_private_artifact_deletion_complete',
    'studio_private_artifact_deletion_fail',
    'studio_private_artifact_download_claim',
    'studio_private_artifact_download_complete',
    'studio_private_artifact_download_fail',
    'p_actor_id',
    'p_organization_id',
    'p_workspace_id',
  ]) {
    assert.equal(adapter.includes(obsolete), false, obsolete);
  }
});

test('real private claim vocabulary is strict and versioned', () => {
  const rendition = decodeStudioRenditionClaim({
    disposition: 'execute',
    requestId: uuid(1),
    attemptId: uuid(2),
    renditionId: uuid(3),
    organizationId: uuid(4),
    workspaceId: uuid(5),
    opaqueObjectId: uuid(6),
    artifactId: uuid(7),
    artifactVersionId: uuid(8),
    artifactType: 'brd',
    format: 'markdown',
    approvedContent: {
      title: 'Accepted shape',
      sections: [{ heading: 'Scope', body: 'Bounded content' }],
    },
    contentSchemaVersion: 'studio-artifact-1',
    rendererVersion: 'studio-markdown-1',
    templateVersion: 'studio-brd-1',
    reconciliationCount: 0,
  });
  assert.equal(
    rendition.rendererVersion,
    STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS.markdown,
  );
  assert.throws(() =>
    decodeStudioRenditionClaim({
      ...rendition,
      rendererVersion: 'markdown-v1',
    }),
  );
  assert.throws(() =>
    decodeStudioRenditionClaim({
      requestId: uuid(1),
      claim: rendition,
    }),
  );

  const deletion = decodeStudioDeletionClaim({
    disposition: 'execute',
    requestId: uuid(1),
    deletionAttemptId: uuid(9),
    renditionId: uuid(3),
    organizationId: uuid(4),
    workspaceId: uuid(5),
    objectKey: `${uuid(4)}/${uuid(5)}/studio-artifacts/${uuid(6)}.md`,
    reconciliationCount: 0,
  });
  assert.equal(deletion.deletionAttemptId, uuid(9));
  assert.throws(() =>
    decodeStudioDeletionClaim({
      ...deletion,
      attemptId: deletion.deletionAttemptId,
    }),
  );
});

test('download claim uses exact vocabulary and successful replay remains executable', () => {
  const claim = decodeStudioDownloadClaim({
    organizationId: uuid(4),
    workspaceId: uuid(5),
    renditionId: uuid(3),
    objectKey: `${uuid(4)}/${uuid(5)}/studio-artifacts/${uuid(6)}.pdf`,
    byteLength: 1234,
    sha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    filename: 'governed-artifact.pdf',
  });
  assert.equal(claim.sha256, 'a'.repeat(64));
  assert.throws(() =>
    decodeStudioDownloadClaim({
      ...claim,
      contentHash: claim.sha256,
      safeFilename: claim.filename,
    }),
  );
});

test('exact command replay cannot carry an executable private claim', () => {
  const base = {
    outcome: 'replayed',
    receiptId: uuid(1),
    resourceId: uuid(2),
    resource: { state: 'available' },
  };
  assert.equal(decodeStudioAtomicResult(base).outcome, 'replayed');
  assert.throws(() =>
    decodeStudioAtomicResult({
      ...base,
      renditionClaim: {
        disposition: 'execute',
      },
    }),
  );
});
