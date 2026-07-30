import {
  handleStudioPrivateArtifactDownload,
  parseStudioPrivateArtifactDownloadEnvelope,
} from './studioPrivateArtifactDownloadHandler.ts';

const ids = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
] as const;
const body = {
  requestId: ids[0],
  idempotencyKey: 'download-request-0001',
  organizationId: ids[1],
  workspaceId: ids[2],
  authorizationVersion: 7,
  renditionId: ids[3],
};
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
assert(
  parseStudioPrivateArtifactDownloadEnvelope(body).renditionId === ids[3],
  'download envelope parses',
);
for (const field of [
  'bucket',
  'objectKey',
  'sha256',
  'mimeType',
  'storageProvider',
  'signedUrl',
]) {
  let rejected = false;
  try {
    parseStudioPrivateArtifactDownloadEnvelope({ ...body, [field]: 'forbidden' });
  } catch {
    rejected = true;
  }
  assert(rejected, `${field} rejected`);
}

const request = () =>
  new Request('https://local/studio-artifact-download', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const calls: string[] = [];
const deps = {
  authenticate: async () => {
    calls.push('authenticate');
    return { id: ids[0] };
  },
  loadFreshAuthority: async () => {
    calls.push('authorize');
    return {
      actorId: ids[0],
      organizationId: ids[1],
      workspaceId: ids[2],
      authorizationVersion: 7,
      capabilities: ['studio.artifacts.download'],
    };
  },
  claimDownload: async () => {
    calls.push('claim');
    return {
      outcome: 'committed' as const,
      receiptId: ids[0],
      resourceId: ids[3],
      resource: { state: 'authorized' },
      downloadClaim: {
        organizationId: ids[1],
        workspaceId: ids[2],
        renditionId: ids[3],
        objectKey: `${ids[1]}/${ids[2]}/studio-artifacts/30000000-0000-4000-8000-000000000003.pdf`,
        byteLength: 13,
        sha256: 'a'.repeat(64),
        mimeType: 'application/pdf' as const,
        filename: 'governed-brief.pdf',
      },
    };
  },
  retrieveAndVerify: async () => {
    calls.push('retrieve-verify');
    return {
      bytes: new TextEncoder().encode('%PDF-governed'),
      mimeType: 'application/pdf' as const,
      filename: 'governed-brief.pdf',
    };
  },
  completeDownload: async () => {
    calls.push('complete');
  },
  failDownload: async () => {
    calls.push('fail');
  },
};

void (async () => {
  const response = await handleStudioPrivateArtifactDownload(request(), deps);
  assert(response.status === 200, 'verified download succeeds');
  assert(response.headers.get('content-type') === 'application/pdf', 'exact MIME returned');
  assert(
    response.headers.get('content-disposition') ===
      'attachment; filename="governed-brief.pdf"',
    'sanitized attachment returned',
  );
  assert(
    response.headers.get('cache-control') === 'private, no-store',
    'download is not cacheable',
  );
  assert(
    response.headers.get('x-content-type-options') === 'nosniff',
    'MIME sniffing disabled',
  );
  assert(
    response.headers.get('access-control-expose-headers') ===
      'Content-Disposition, Content-Type, Cache-Control, X-Content-Type-Options',
    'browser can verify only the strict broker response headers',
  );
  assert(
    calls.join(',') === 'authenticate,authorize,claim,retrieve-verify,complete',
    'authority, receipt, exact retrieval, and durable completion are ordered',
  );
  calls.length = 0;
  const stale = await handleStudioPrivateArtifactDownload(request(), {
    ...deps,
    loadFreshAuthority: async () => {
      calls.push('authorize');
      return {
        actorId: ids[0],
        organizationId: ids[1],
        workspaceId: ids[2],
        authorizationVersion: 8,
        capabilities: ['studio.artifacts.download'],
      };
    },
  });
  assert(stale.status === 409 && !calls.includes('claim'), 'stale denied before receipt');
  calls.length = 0;
  const failed = await handleStudioPrivateArtifactDownload(request(), {
    ...deps,
    retrieveAndVerify: async () => {
      calls.push('retrieve-verify');
      throw new Error('private provider detail');
    },
  });
  const failedBody = await failed.json();
  assert(
    failed.status === 404 &&
      failedBody.error.code === 'DOWNLOAD_UNAVAILABLE' &&
      calls.includes('fail'),
    'retrieval failure persists failure and never returns bytes',
  );
  calls.length = 0;
  const completionFailed = await handleStudioPrivateArtifactDownload(request(), {
    ...deps,
    completeDownload: async () => {
      calls.push('complete');
      throw new Error('database detail');
    },
  });
  assert(
    completionFailed.status === 404 && calls.includes('fail'),
    'receipt completion failure cannot report successful download',
  );
  const unsafeFilename = await handleStudioPrivateArtifactDownload(request(), {
    ...deps,
    retrieveAndVerify: async () => ({
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf' as const,
      filename: '../../escape.pdf',
    }),
  });
  assert(unsafeFilename.status === 404, 'unsafe filename denied');
  console.log(
    'studio private artifact download: 24 auth-order, exact-byte, header, failure, and non-disclosure scenarios passed',
  );
})().catch(error => {
  console.error(error);
  throw error;
});
