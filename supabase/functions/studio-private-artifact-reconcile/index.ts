import { handleStudioPrivateArtifactReconciliation, type StudioPrivateArtifactReconciliationKind } from '../_shared/studioPrivateArtifactReconciliationHandler.ts';
import { reconcileStudioPrivateDeletion, reconcileStudioPrivateRendition } from '../_shared/studioPrivateArtifactDb.ts';

const get = (key: string) => Deno.env.get(key);
Deno.serve(request => {
  const pathname = new URL(request.url).pathname;
  const kind: StudioPrivateArtifactReconciliationKind | null = pathname.endsWith('/rendition')
    ? 'rendition'
    : pathname.endsWith('/deletion')
      ? 'deletion'
      : null;
  if (!kind) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
  return handleStudioPrivateArtifactReconciliation(request, kind, {
    configuredWorkerSecret: get('STUDIO_PRIVATE_ARTIFACT_RECONCILIATION_WORKER_SECRET'),
    reconcileRendition: reconcileStudioPrivateRendition,
    reconcileDeletion: reconcileStudioPrivateDeletion,
  });
});
