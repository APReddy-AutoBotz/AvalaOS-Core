import { strict as assert } from 'node:assert';
import type { TenantContextProjection } from '../../types';
import {
  decodeStudioPrivateArtifactCommandResponse,
  decodeStudioPrivateArtifactDownload,
  decodeStudioPrivateArtifactProjection,
  decodeStudioPrivateArtifactSafeError,
  downloadStudioPrivateArtifact,
  executeStudioPrivateArtifactCommand,
  readStudioPrivateArtifact,
  StudioPrivateArtifactBoundaryError,
  type StudioPrivateArtifactTransport,
} from './privateArtifactClient';

const U = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
] as const;
const context = {
  userId: U[4],
  organizationId: U[0],
  organizationName: 'Avala',
  workspaceId: U[1],
  workspaceName: 'Studio',
  authorizationVersion: 8,
  capabilities: [],
} satisfies TenantContextProjection;
const rendition = {
  id: U[3],
  version: 2,
  format: 'pdf',
  state: 'available',
  mimeType: 'application/pdf',
  filename: 'governed-brief.pdf',
  byteLength: 1250,
  sha256: 'a'.repeat(64),
  rendererVersion: 'pdf-v1',
  retentionMode: 'until',
  retentionUntil: '2027-07-29T00:00:00.000Z',
  legalHoldActive: false,
  deletion: null,
  failureCode: null,
  updatedAt: '2026-07-29T00:00:00.000Z',
} as const;
const projection = {
  artifactId: U[2],
  artifactVersionId: U[3],
  artifactVersion: 4,
  artifactType: 'brd',
  approved: true,
  readOnly: false,
  renditions: [rendition],
} as const;
const response = {
  ok: true,
  outcome: 'committed',
  receiptId: U[4],
  resourceId: U[3],
  resource: { state: 'requested' },
} as const;

assert.equal(
  decodeStudioPrivateArtifactProjection(projection, {
    artifactId: U[2],
    artifactVersionId: U[3],
  }).renditions[0].sha256,
  'a'.repeat(64),
);
for (const forbidden of [
  'bucket',
  'objectKey',
  'storageProvider',
  'signedUrl',
  'templateVersion',
  'contentSchemaVersion',
  'artifactAncestry',
  'serviceRole',
]) {
  assert.throws(
    () =>
      decodeStudioPrivateArtifactProjection(
        { ...projection, [forbidden]: 'private' },
        { artifactId: U[2], artifactVersionId: U[3] },
      ),
    StudioPrivateArtifactBoundaryError,
  );
}
assert.throws(
  () =>
    decodeStudioPrivateArtifactProjection(
      { ...projection, approved: false },
      { artifactId: U[2], artifactVersionId: U[3] },
    ),
  StudioPrivateArtifactBoundaryError,
);
assert.throws(
  () =>
    decodeStudioPrivateArtifactProjection(
      { ...projection, renditions: [rendition, { ...rendition, id: U[4] }] },
      { artifactId: U[2], artifactVersionId: U[3] },
    ),
  StudioPrivateArtifactBoundaryError,
);
assert.throws(
  () =>
    decodeStudioPrivateArtifactProjection(
      { ...projection, renditions: [{ ...rendition, sha256: null }] },
      { artifactId: U[2], artifactVersionId: U[3] },
    ),
  StudioPrivateArtifactBoundaryError,
);
assert.equal(
  decodeStudioPrivateArtifactSafeError({
    code: 'LEGAL_HOLD_BLOCKED',
    details: 'private object coordinate',
  }).code,
  'LEGAL_HOLD_BLOCKED',
);
assert.equal(
  decodeStudioPrivateArtifactSafeError({
    code: '42P01',
    details: 'private object coordinate',
  }).code,
  'COMMAND_UNAVAILABLE',
);
assert.deepEqual(decodeStudioPrivateArtifactCommandResponse(response), response);
assert.throws(
  () => decodeStudioPrivateArtifactCommandResponse({ ...response, executableClaim: {} }),
  StudioPrivateArtifactBoundaryError,
);

void (async () => {
  let envelope: any;
  let downloadRequest: any;
  const transport: StudioPrivateArtifactTransport = {
    readProjection: async () => projection,
    invoke: async value => {
      envelope = value;
      return response;
    },
    download: async value => {
      downloadRequest = value;
      return new Response(new Blob(['%PDF-governed'], { type: 'application/pdf' }), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="governed-brief.pdf"',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
  };
  assert.equal(
    (
      await readStudioPrivateArtifact(context, U[2], U[3], transport)
    ).artifactVersion,
    4,
  );
  await executeStudioPrivateArtifactCommand(
    context,
    'studio.rendition.generate',
    projection,
    null,
    { artifactId: U[2], artifactVersionId: U[3], format: 'pdf' },
    'generate-pdf-0001',
    transport,
  );
  assert.equal(envelope.expectedArtifactVersion, 4);
  assert.equal(envelope.expectedRenditionVersion, null);
  assert.deepEqual(Object.keys(envelope.payload).sort(), [
    'artifactId',
    'artifactVersionId',
    'format',
  ]);
  await executeStudioPrivateArtifactCommand(
    context,
    'studio.rendition.deletion.resolve',
    projection,
    rendition,
    {
      renditionId: U[3],
      deletionRequestId: U[4],
      outcome: 'approve',
      reason: 'Independent review complete',
    },
    'resolve-delete-0001',
    transport,
  );
  assert.equal(envelope.expectedRenditionVersion, 2);
  assert.deepEqual(Object.keys(envelope.payload).sort(), [
    'deletionRequestId',
    'outcome',
    'reason',
    'renditionId',
  ]);
  const download = await downloadStudioPrivateArtifact(
    context,
    U[3],
    'download-pdf-0001',
    transport,
  );
  assert.equal(download.filename, 'governed-brief.pdf');
  assert.equal(download.mimeType, 'application/pdf');
  assert.equal(downloadRequest.renditionId, U[3]);
  assert.ok(!('bucket' in downloadRequest));
  assert.ok(!('objectKey' in downloadRequest));

  await assert.rejects(
    () =>
      decodeStudioPrivateArtifactDownload(
        new Response(new Blob(['%PDF-governed'], { type: 'application/pdf' }), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="../../escape.pdf"',
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
      ),
    StudioPrivateArtifactBoundaryError,
  );
  await assert.rejects(
    () =>
      decodeStudioPrivateArtifactDownload(
        new Response(new Blob(['%PDF-governed'], { type: 'application/pdf' }), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="governed.pdf"',
            'Cache-Control': 'public, max-age=31536000',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
      ),
    StudioPrivateArtifactBoundaryError,
  );
  console.log(
    'studio private artifact client: 27 strict DTO, command, download, and non-disclosure assertions passed',
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
