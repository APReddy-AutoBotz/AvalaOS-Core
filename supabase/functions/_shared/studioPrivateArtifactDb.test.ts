import {
  decodeStudioPrivateArtifactRpcError,
  reconcileStudioPrivateDeletion,
  reconcileStudioPrivateRendition,
  studioPrivateArtifactDependencies,
  studioPrivateArtifactDownloadDependencies,
} from './studioPrivateArtifactDb.ts';

const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
for (const code of [
  'RESOURCE_NOT_AVAILABLE',
  'AUTHORITY_STALE',
  'PERMISSION_DENIED',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'SEPARATION_OF_DUTY',
  'RETENTION_BLOCKED',
  'LEGAL_HOLD_BLOCKED',
  'DOWNLOAD_UNAVAILABLE',
  'RENDERING_FAILED',
  'STORAGE_FAILED',
  'DELETION_FAILED',
  'FEATURE_DISABLED',
  'READ_ONLY',
  'INVALID_COMMAND',
  'COMMAND_UNAVAILABLE',
] as const) {
  assert(decodeStudioPrivateArtifactRpcError({ code }).code === code, `${code} survives`);
}
assert(
  decodeStudioPrivateArtifactRpcError({
    code: '23505',
    message: 'private bucket/object detail',
  }).code === 'COMMAND_UNAVAILABLE',
  'raw database and private object detail sanitized',
);

void (async () => {
  const ids = [
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
  ] as const;
  const scope = globalThis as typeof globalThis & {
    Deno: { env: { get: (key: string) => string | undefined } };
  };
  scope.Deno = {
    env: {
      get: key =>
        key === 'SUPABASE_URL'
          ? 'https://db.invalid'
          : key === 'SUPABASE_SERVICE_ROLE_KEY'
            ? 'service-key'
            : key === 'STUDIO_PRIVATE_ARTIFACTS_BUCKET' ||
                key === 'STUDIO_PRIVATE_ARTIFACTS_BUCKET_ALLOWLIST'
              ? 'studio-private-artifacts'
            : key === 'SUPABASE_ANON_KEY'
              ? 'anon-key'
              : undefined,
    },
  };
  const priorFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    calls.push({ url, body });
    if (url.includes('studio_private_artifact_authority')) {
      return Response.json({
        actorId: ids[0],
        organizationId: ids[1],
        workspaceId: ids[2],
        authorizationVersion: 5,
        capabilities: ['studio.artifacts.download'],
      });
    }
    if (url.includes('studio_private_artifact_command_claim')) {
      return Response.json({
        outcome: 'committed',
        receiptId: ids[1],
        resourceId: ids[2],
        resource: {},
      });
    }
    if (url.includes('studio_rendition_reconciliation_claim') ||
        url.includes('studio_deletion_reconciliation_claim')) {
      return Response.json(null);
    }
    if (url.includes('studio_artifact_download_claim')) {
      return Response.json({
        outcome: 'committed',
        receiptId: ids[1],
        resourceId: ids[2],
        resource: { state: 'authorized' },
        downloadClaim: {
          organizationId: ids[1],
          workspaceId: ids[2],
          renditionId: ids[2],
          objectKey: `${ids[1]}/${ids[2]}/studio-artifacts/40000000-0000-4000-8000-000000000004.pdf`,
          byteLength: 128,
          sha256: 'a'.repeat(64),
          mimeType: 'application/pdf',
          filename: 'studio-artifact-rendition.pdf',
        },
      });
    }
    if (url.includes('studio_artifact_download_complete')) {
      return Response.json({ outcome: 'committed', receiptId: ids[1], status: 'completed' });
    }
    if (url.includes('studio_artifact_download_fail')) {
      return Response.json({ outcome: 'committed', receiptId: ids[1], status: 'failed' });
    }
    return new Response(null, { status: 204 });
  };
  try {
    const authority = await studioPrivateArtifactDependencies.loadFreshAuthority({
      request: new Request('https://local'),
      actorId: ids[0],
      organizationId: ids[1],
      workspaceId: ids[2],
    });
    assert(authority?.authorizationVersion === 5, 'fresh authority RPC decoded');
    await studioPrivateArtifactDependencies.executeAtomicCommand({
      actorId: ids[0],
    } as never);
    await studioPrivateArtifactDownloadDependencies.claimDownload({
      actorId: ids[0],
      requestId: ids[0],
      idempotencyKey: 'download-request-0001',
      organizationId: ids[1],
      workspaceId: ids[2],
      authorizationVersion: 5,
      renditionId: ids[2],
    });
    await studioPrivateArtifactDownloadDependencies.completeDownload(ids[1]);
    await studioPrivateArtifactDownloadDependencies.failDownload(
      ids[1],
      'DOWNLOAD_FAILED',
    );
    assert((await reconcileStudioPrivateRendition(ids[0])).status === 'not_executable', 'rendition reconciliation loader calls production RPC');
    assert((await reconcileStudioPrivateDeletion(ids[0])).status === 'not_executable', 'deletion reconciliation loader calls production RPC');
    const command = calls.find(call =>
      call.url.includes('studio_private_artifact_command_claim'),
    );
    assert(
      command && Object.keys(command.body).join(',') === 'p_command',
      'command RPC receives only strict command envelope',
    );
    const downloadClaim = calls.find(call =>
      call.url.includes('studio_artifact_download_claim'),
    );
    assert(
      downloadClaim && Object.keys(downloadClaim.body).join(',') === 'p_command',
      'download claim receives no browser storage coordinates',
    );
    assert(calls.length === 7, 'private RPC adapters exercised');
    assert(calls.some(call => call.url.includes('studio_rendition_reconciliation_claim')), 'rendition loader is not null');
    assert(calls.some(call => call.url.includes('studio_deletion_reconciliation_claim')), 'deletion loader is not null');
  } finally {
    globalThis.fetch = priorFetch;
  }
  console.log(
    'studio private artifact DB adapter: 28 safe-error, private RPC, and reconciliation loader assertions passed',
  );
})().catch(error => {
  console.error(error);
  throw error;
});
