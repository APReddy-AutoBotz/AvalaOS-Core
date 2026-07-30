import { getAuthUser, supabaseEnv } from './supabase.ts';
import {
  STUDIO_PRIVATE_ARTIFACT_DOMAIN_ERROR_CODES,
  StudioPrivateArtifactError,
  type StudioPrivateArtifactAtomicCommand,
  type StudioPrivateArtifactAtomicResult,
  type StudioPrivateArtifactAuthority,
  type StudioPrivateArtifactDomainErrorCode,
  type StudioPrivateArtifactJson,
} from './studioPrivateArtifactCommand.ts';
import type { StudioPrivateArtifactCommandDependencies } from './studioPrivateArtifactHandler.ts';
import type {
  StudioPrivateArtifactDownloadClaim,
  StudioPrivateArtifactDownloadDependencies,
  StudioPrivateArtifactVerifiedDownload,
} from './studioPrivateArtifactDownloadHandler.ts';
import {
  executeStudioDeletionSaga,
  executeStudioRenditionSaga,
  type StudioDeletionReceipt,
  type StudioDeletionSagaDatabase,
  type StudioRenditionClaim,
  type StudioRenditionSagaDatabase,
  type StudioSagaFailureCode,
  type StudioSagaPublicReceipt,
} from './studioPrivateArtifactSaga.ts';
import {
  createStudioPrivateArtifactStorage,
  type StudioPrivateArtifactStorage,
  type StudioStoredObjectExpectation,
} from './studioPrivateArtifactStorage.ts';

type RpcError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export const decodeStudioPrivateArtifactRpcError = (
  error: unknown,
): StudioPrivateArtifactError => {
  const candidate = error && typeof error === 'object' ? (error as RpcError) : {};
  for (const field of [
    candidate.code,
    candidate.message,
    candidate.details,
    candidate.hint,
  ]) {
    if (
      typeof field === 'string' &&
      STUDIO_PRIVATE_ARTIFACT_DOMAIN_ERROR_CODES.includes(
        field.trim() as StudioPrivateArtifactDomainErrorCode,
      )
    ) {
      return new StudioPrivateArtifactError(
        field.trim() as StudioPrivateArtifactDomainErrorCode,
      );
    }
  }
  return new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
};

const rpc = async <T>(name: string, args: StudioPrivateArtifactJson): Promise<T> => {
  const { url, serviceRoleKey } = supabaseEnv();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
  }
  if (!response.ok) {
    let body: unknown = {};
    try {
      body = await response.json();
    } catch {
      // Internal response bodies never cross the stable error boundary.
    }
    throw decodeStudioPrivateArtifactRpcError(body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const storage = () => {
  const { url, serviceRoleKey } = supabaseEnv();
  const get = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno?.env?.get;
  return createStudioPrivateArtifactStorage({
    supabaseUrl: url,
    serviceRoleKey,
    configuredBucket: get?.('STUDIO_PRIVATE_ARTIFACTS_BUCKET'),
    configuredBucketAllowlist: get?.('STUDIO_PRIVATE_ARTIFACTS_BUCKET_ALLOWLIST'),
  });
};

const renditionDatabase = (claim: StudioRenditionClaim): StudioRenditionSagaDatabase => ({
  claim: async () => claim,
  persistRendered: input =>
    rpc<void>('studio_private_artifact_rendition_rendered', {
      p_attempt_id: input.attemptId,
      p_object_key: input.objectKey,
      p_byte_length: input.byteLength,
      p_sha256: input.sha256,
      p_mime_type: input.mimeType,
      p_filename: input.filename,
      p_renderer_version: input.rendererVersion,
      p_template_version: input.templateVersion,
    }),
  markAvailable: input =>
    rpc<StudioSagaPublicReceipt>('studio_private_artifact_rendition_complete', {
      p_attempt_id: input.attemptId,
      p_rendition_id: input.renditionId,
      p_byte_length: input.byteLength,
      p_sha256: input.sha256,
      p_mime_type: input.mimeType,
    }),
  markFailed: input =>
    rpc<StudioSagaPublicReceipt>('studio_private_artifact_rendition_fail', {
      p_attempt_id: input.attemptId,
      p_failure_code: input.failureCode,
    }),
  markReconciliationRequired: input =>
    rpc<StudioSagaPublicReceipt>('studio_private_artifact_rendition_fail', {
      p_attempt_id: input.attemptId,
      p_failure_code: input.failureCode,
    }),
  loadReconciliation: async () => null,
});

const deletionDatabase = (
  claim: Awaited<ReturnType<StudioDeletionSagaDatabase['claimDeletion']>>,
): StudioDeletionSagaDatabase => ({
  claimDeletion: async () => claim,
  markTombstone: input =>
    rpc<StudioDeletionReceipt>('studio_private_artifact_deletion_complete', {
      p_deletion_attempt_id: input.deletionAttemptId,
      p_provider_outcome: input.providerOutcome,
    }),
  markDeletionFailure: input =>
    rpc<StudioDeletionReceipt>('studio_private_artifact_deletion_fail', {
      p_deletion_attempt_id: input.deletionAttemptId,
      p_failure_code: input.failureCode,
    }),
  markDeletionReconciliationRequired: input =>
    rpc<StudioDeletionReceipt>('studio_private_artifact_deletion_fail', {
      p_deletion_attempt_id: input.deletionAttemptId,
      p_failure_code: input.failureCode,
    }),
  loadDeletionReconciliation: async () => null,
});

const executeClaimedRendition = async (claim: StudioPrivateArtifactJson) => {
  const requestId = typeof claim.requestId === 'string' ? claim.requestId : null;
  const sagaClaim = claim.claim as StudioRenditionClaim | undefined;
  if (!requestId || !sagaClaim) {
    throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
  }
  const result = await executeStudioRenditionSaga(requestId, {
    database: renditionDatabase(sagaClaim),
    storage: storage(),
  });
  if (result.outcome === 'available') {
    return { state: 'available' as const, resource: result.receipt };
  }
  return {
    state: 'failed' as const,
    failureCode:
      'failureCode' in result ? result.failureCode : ('RENDER_FAILED' satisfies StudioSagaFailureCode),
  };
};

const executeClaimedDeletion = async (claim: StudioPrivateArtifactJson) => {
  const requestId = typeof claim.requestId === 'string' ? claim.requestId : null;
  const sagaClaim = claim.claim as
    | Awaited<ReturnType<StudioDeletionSagaDatabase['claimDeletion']>>
    | undefined;
  if (!requestId || !sagaClaim) {
    throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
  }
  const result = await executeStudioDeletionSaga(requestId, {
    database: deletionDatabase(sagaClaim),
    storage: storage(),
  });
  if (result.outcome === 'deleted') {
    return { state: 'deleted' as const, resource: result.receipt };
  }
  return {
    state: 'failed' as const,
    failureCode: 'failureCode' in result ? result.failureCode : 'PROVIDER_DELETE_FAILED',
  };
};

export const studioPrivateArtifactDependencies: StudioPrivateArtifactCommandDependencies = {
  authenticate: request => getAuthUser(request),
  loadFreshAuthority: async ({ actorId, organizationId, workspaceId }) => {
    const rows = await rpc<StudioPrivateArtifactAuthority[]>(
      'studio_private_artifact_authority',
      {
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_workspace_id: workspaceId,
      },
    );
    return rows[0] ?? null;
  },
  executeAtomicCommand: (command: StudioPrivateArtifactAtomicCommand) =>
    rpc<StudioPrivateArtifactAtomicResult>('studio_private_artifact_command_claim', {
      p_command: command,
    }),
  executeClaimedRendition,
  executeClaimedDeletion,
};

type DownloadClaimInternal = StudioStoredObjectExpectation & {
  filename: string;
};
type DownloadCapableStorage = StudioPrivateArtifactStorage & {
  downloadExact(input: StudioStoredObjectExpectation): Promise<Uint8Array>;
};
const decodeDownloadClaim = (
  claim: StudioPrivateArtifactJson,
): DownloadClaimInternal => {
  const value = claim as Partial<DownloadClaimInternal>;
  if (
    typeof value.organizationId !== 'string' ||
    typeof value.workspaceId !== 'string' ||
    typeof value.objectKey !== 'string' ||
    typeof value.byteLength !== 'number' ||
    typeof value.sha256 !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.filename !== 'string'
  ) {
    throw new StudioPrivateArtifactError('DOWNLOAD_UNAVAILABLE');
  }
  return value as DownloadClaimInternal;
};

export const studioPrivateArtifactDownloadDependencies: StudioPrivateArtifactDownloadDependencies =
  {
    authenticate: request => getAuthUser(request),
    loadFreshAuthority: studioPrivateArtifactDependencies.loadFreshAuthority,
    claimDownload: command =>
      rpc<StudioPrivateArtifactDownloadClaim>(
        'studio_private_artifact_download_claim',
        { p_command: command },
      ),
    retrieveAndVerify: async claim => {
      const expected = decodeDownloadClaim(claim);
      const provider = storage() as DownloadCapableStorage;
      if (typeof provider.downloadExact !== 'function') {
        throw new StudioPrivateArtifactError('DOWNLOAD_UNAVAILABLE');
      }
      const bytes = await provider.downloadExact(expected);
      return {
        bytes,
        mimeType: expected.mimeType,
        filename: expected.filename,
      } as StudioPrivateArtifactVerifiedDownload;
    },
    completeDownload: receiptId =>
      rpc<void>('studio_private_artifact_download_complete', {
        p_receipt_id: receiptId,
      }),
    failDownload: (receiptId, failureCode) =>
      rpc<void>('studio_private_artifact_download_fail', {
        p_receipt_id: receiptId,
        p_failure_code: failureCode,
      }),
  };
