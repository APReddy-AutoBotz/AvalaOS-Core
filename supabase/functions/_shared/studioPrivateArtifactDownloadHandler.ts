import { corsHeaders } from './http.ts';
import type { StudioDownloadExecuteClaim } from './studioPrivateArtifactRpcContract.ts';
import {
  asStudioPrivateArtifactError,
  StudioPrivateArtifactError,
  studioPrivateArtifactErrorBody,
  type StudioPrivateArtifactAuthority,
  type StudioPrivateArtifactJson,
} from './studioPrivateArtifactCommand.ts';

export interface StudioPrivateArtifactDownloadEnvelope {
  requestId: string;
  idempotencyKey: string;
  organizationId: string;
  workspaceId: string;
  authorizationVersion: number;
  renditionId: string;
}
export interface StudioPrivateArtifactDownloadClaim {
  receiptId: string;
  outcome: 'committed' | 'replayed';
  resourceId: string;
  resource: StudioPrivateArtifactJson;
  downloadClaim: StudioDownloadExecuteClaim;
}
export interface StudioPrivateArtifactVerifiedDownload {
  bytes: Uint8Array;
  mimeType:
    | 'text/markdown; charset=utf-8'
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  filename: string;
}
export interface StudioPrivateArtifactDownloadDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  loadFreshAuthority(input: {
    request: Request;
    actorId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<StudioPrivateArtifactAuthority | null>;
  claimDownload(
    command: StudioPrivateArtifactDownloadEnvelope & { actorId: string },
  ): Promise<StudioPrivateArtifactDownloadClaim>;
  retrieveAndVerify(
    claim: StudioDownloadExecuteClaim,
  ): Promise<StudioPrivateArtifactVerifiedDownload>;
  completeDownload(receiptId: string): Promise<void>;
  failDownload(receiptId: string, failureCode: string): Promise<void>;
}

const bad = (): never => {
  throw new StudioPrivateArtifactError('INVALID_COMMAND');
};
const object = (value: unknown): StudioPrivateArtifactJson =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as StudioPrivateArtifactJson)
    : bad();
const exact = (value: StudioPrivateArtifactJson, keys: readonly string[]) => {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some(key => !(key in value)) ||
    Object.keys(value).some(key => !keys.includes(key))
  ) bad();
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown) =>
  typeof value === 'string' && UUID.test(value) ? value : bad();
const positiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : bad();
const idempotencyKey = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= 128 &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
    ? value
    : bad();

export const parseStudioPrivateArtifactDownloadEnvelope = (
  value: unknown,
): StudioPrivateArtifactDownloadEnvelope => {
  const envelope = object(value);
  exact(envelope, [
    'requestId',
    'idempotencyKey',
    'organizationId',
    'workspaceId',
    'authorizationVersion',
    'renditionId',
  ]);
  return {
    requestId: uuid(envelope.requestId),
    idempotencyKey: idempotencyKey(envelope.idempotencyKey),
    organizationId: uuid(envelope.organizationId),
    workspaceId: uuid(envelope.workspaceId),
    authorizationVersion: positiveInteger(envelope.authorizationVersion),
    renditionId: uuid(envelope.renditionId),
  };
};

const validDownload = (
  value: StudioPrivateArtifactVerifiedDownload,
): StudioPrivateArtifactVerifiedDownload => {
  const mimeTypes = [
    'text/markdown; charset=utf-8',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (
    !(value.bytes instanceof Uint8Array) ||
    value.bytes.byteLength === 0 ||
    !mimeTypes.includes(value.mimeType) ||
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/.test(value.filename) ||
    /[\\/]/.test(value.filename)
  ) {
    throw new StudioPrivateArtifactError('DOWNLOAD_UNAVAILABLE');
  }
  return value;
};

export const handleStudioPrivateArtifactDownload = async (
  request: Request,
  deps: StudioPrivateArtifactDownloadDependencies,
): Promise<Response> => {
  let receiptId: string | null = null;
  try {
    if (request.method !== 'POST') {
      throw new StudioPrivateArtifactError('METHOD_NOT_ALLOWED');
    }
    let actor: { id: string };
    try {
      actor = await deps.authenticate(request);
    } catch {
      throw new StudioPrivateArtifactError('AUTHENTICATION_REQUIRED');
    }
    let envelope: StudioPrivateArtifactDownloadEnvelope;
    try {
      envelope = parseStudioPrivateArtifactDownloadEnvelope(await request.json());
    } catch (error) {
      throw error instanceof StudioPrivateArtifactError
        ? error
        : new StudioPrivateArtifactError('INVALID_COMMAND');
    }

    // Fresh human authority and narrow download capability must be checked
    // before any durable receipt or rendition/private-object inspection.
    const authority = await deps.loadFreshAuthority({
      request,
      actorId: actor.id,
      organizationId: envelope.organizationId,
      workspaceId: envelope.workspaceId,
    });
    if (
      !authority ||
      authority.actorId !== actor.id ||
      authority.organizationId !== envelope.organizationId ||
      authority.workspaceId !== envelope.workspaceId
    ) {
      throw new StudioPrivateArtifactError('RESOURCE_NOT_AVAILABLE');
    }
    if (authority.authorizationVersion !== envelope.authorizationVersion) {
      throw new StudioPrivateArtifactError('AUTHORITY_STALE');
    }
    if (!authority.capabilities.includes('studio.artifacts.download')) {
      throw new StudioPrivateArtifactError('PERMISSION_DENIED');
    }

    const claimed = await deps.claimDownload({ ...envelope, actorId: actor.id });
    receiptId = claimed.receiptId;
    const download = validDownload(await deps.retrieveAndVerify(claimed.downloadClaim));
    // A binary success is returned only after the durable receipt commits.
    await deps.completeDownload(receiptId);
    return new Response(download.bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': download.mimeType,
        'Content-Disposition': `attachment; filename="${download.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Expose-Headers':
          'Content-Disposition, Content-Type, Cache-Control, X-Content-Type-Options',
      },
    });
  } catch (error) {
    if (receiptId) {
      try {
        await deps.failDownload(receiptId, 'DOWNLOAD_FAILED');
      } catch {
        // Failure persistence is required. If it fails, the response remains
        // fail-closed and does not expose either internal failure.
      }
    }
    const safe = asStudioPrivateArtifactError(
      error instanceof StudioPrivateArtifactError
        ? error
        : new StudioPrivateArtifactError('DOWNLOAD_UNAVAILABLE'),
    );
    return Response.json(studioPrivateArtifactErrorBody(safe), {
      status: safe.status,
      headers: corsHeaders,
    });
  }
};
