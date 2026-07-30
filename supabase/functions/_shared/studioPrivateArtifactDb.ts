import { getAuthUser, supabaseEnv } from './supabase.ts';
import {
  STUDIO_PRIVATE_ARTIFACT_DOMAIN_ERROR_CODES,
  StudioPrivateArtifactError,
  type StudioPrivateArtifactAtomicCommand,
  type StudioPrivateArtifactDomainErrorCode,
  type StudioPrivateArtifactJson,
} from './studioPrivateArtifactCommand.ts';
import type { StudioPrivateArtifactCommandDependencies } from './studioPrivateArtifactHandler.ts';
import type {
  StudioPrivateArtifactDownloadDependencies,
  StudioPrivateArtifactVerifiedDownload,
} from './studioPrivateArtifactDownloadHandler.ts';
import {
  assertStudioPrivateArtifactRpcArgs,
  decodeStudioDeletionClaim,
  decodeStudioDownloadClaim,
  decodeStudioPrivateArtifactRpcResult,
  decodeStudioRenditionClaim,
  STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST,
  type StudioDeletionExecuteClaim,
  type StudioDownloadExecuteClaim,
  type StudioPrivateArtifactRpcArgs,
  type StudioPrivateArtifactRpcKey,
  type StudioPrivateArtifactRpcResults,
  type StudioRenditionExecuteClaim,
  type StudioRenditionReconciliationClaim,
  type StudioDeletionReconciliationClaim,
} from './studioPrivateArtifactRpcContract.ts';
import {
  executeStudioDeletionSaga,
  executeStudioRenditionSaga,
  reconcileStudioDeletion,
  reconcileStudioRendition,
  type StudioDeletionReceipt,
  type StudioDeletionSagaDatabase,
  type StudioRenditionSagaDatabase,
  type StudioCommittedRenditionWork,
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
  const candidate: RpcError =
    error && typeof error === 'object' ? error : {};
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

const rpc = async <Key extends StudioPrivateArtifactRpcKey>(
  key: Key,
  args: StudioPrivateArtifactRpcArgs[Key],
): Promise<StudioPrivateArtifactRpcResults[Key]> => {
  assertStudioPrivateArtifactRpcArgs(key, args);
  const contract = STUDIO_PRIVATE_ARTIFACT_RPC_MANIFEST[key];
  const { url, serviceRoleKey } = supabaseEnv();
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${contract.functionName}`, {
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
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
  }
  return decodeStudioPrivateArtifactRpcResult(key, body);
};

const storage = () => {
  const { url, serviceRoleKey } = supabaseEnv();
  const get = (
    globalThis as typeof globalThis & {
      Deno?: { env?: { get?: (key: string) => string | undefined } };
    }
  ).Deno?.env?.get;
  return createStudioPrivateArtifactStorage({
    supabaseUrl: url,
    serviceRoleKey,
    configuredBucket: get?.('STUDIO_PRIVATE_ARTIFACTS_BUCKET'),
    configuredBucketAllowlist: get?.(
      'STUDIO_PRIVATE_ARTIFACTS_BUCKET_ALLOWLIST',
    ),
  });
};

const renditionReceipt = (
  claim: StudioRenditionExecuteClaim,
  state:
    | 'requested'
    | 'rendering'
    | 'uploading'
    | 'available'
    | 'failed'
    | 'reconciliation_required',
): StudioSagaPublicReceipt => ({
  attemptId: claim.attemptId,
  renditionId: claim.renditionId,
  format: claim.format,
  state,
});

const renditionDatabase = (
  claim: StudioRenditionExecuteClaim,
): StudioRenditionSagaDatabase => ({
  claim: async () => claim,
  startAttempt: async input => {
    await rpc('renditionStart', { p_attempt: input.attemptId });
  },
  persistRendered: async input => {
    await rpc('renditionRendered', {
      p_attempt: input.attemptId,
      p_object_key: input.objectKey,
      p_hash: input.sha256,
      p_byte_length: input.byteLength,
      p_mime: input.mimeType,
      p_safe_filename: input.filename,
      p_renderer_version: input.rendererVersion,
      p_template_version: input.templateVersion,
      p_content_schema_version: input.contentSchemaVersion,
    });
  },
  markAvailable: async input => {
    const receipt = await rpc('renditionComplete', {
      p_attempt: input.attemptId,
    });
    if (
      receipt.renditionId !== claim.renditionId ||
      receipt.state !== 'available'
    ) {
      throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
    }
    return renditionReceipt(claim, 'available');
  },
  markFailed: async input => {
    await rpc('renditionFail', {
      p_attempt: input.attemptId,
      p_failure: input.failureCode,
    });
    return renditionReceipt(claim, 'failed');
  },
  markReconciliationRequired: async input => {
    await rpc('renditionFail', {
      p_attempt: input.attemptId,
      p_failure: input.failureCode,
    });
    return renditionReceipt(claim, 'reconciliation_required');
  },
  loadReconciliation: attemptId => loadRenditionReconciliation(attemptId),
});

const deletionReceipt = (
  claim: StudioDeletionExecuteClaim,
  state:
    | 'deleting'
    | 'deleted'
    | 'deletion_failed'
    | 'reconciliation_required',
): StudioDeletionReceipt => ({
  deletionAttemptId: claim.deletionAttemptId,
  renditionId: claim.renditionId,
  state,
});

const deletionDatabase = (
  claim: StudioDeletionExecuteClaim,
): StudioDeletionSagaDatabase => ({
  claimDeletion: async () => claim,
  markTombstone: async input => {
    const receipt = await rpc('deletionComplete', {
      p_attempt: input.deletionAttemptId,
    });
    if (
      receipt.attemptId !== claim.deletionAttemptId ||
      receipt.state !== 'deleted'
    ) {
      throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
    }
    return deletionReceipt(claim, 'deleted');
  },
  markDeletionFailure: async input => {
    await rpc('deletionFail', {
      p_attempt: input.deletionAttemptId,
      p_failure: input.failureCode,
    });
    return deletionReceipt(claim, 'deletion_failed');
  },
  markDeletionReconciliationRequired: async input => {
    await rpc('deletionFail', {
      p_attempt: input.deletionAttemptId,
      p_failure: input.failureCode,
    });
    return deletionReceipt(claim, 'reconciliation_required');
  },
  loadDeletionReconciliation: deletionAttemptId =>
    loadDeletionReconciliation(deletionAttemptId),
});

const renditionReconciliationWork = (
  claim: StudioRenditionReconciliationClaim,
): StudioCommittedRenditionWork => ({
  ...claim,
  state: 'completion_pending',
});

const loadRenditionReconciliation = async (attemptId: string) => {
  const claim = await rpc('renditionReconciliationClaim', { p_attempt: attemptId });
  return claim ? renditionReconciliationWork(claim) : null;
};

const loadDeletionReconciliation = async (deletionAttemptId: string) => {
  const claim = await rpc('deletionReconciliationClaim', {
    p_attempt: deletionAttemptId,
  });
  return claim
    ? ({
        ...claim,
        disposition: 'execute' as const,
        requestId: claim.deletionAttemptId,
      } satisfies StudioDeletionExecuteClaim)
    : null;
};

const executeClaimedRendition = async (privateClaim: StudioPrivateArtifactJson) => {
  const claim = decodeStudioRenditionClaim(privateClaim);
  const result = await executeStudioRenditionSaga(claim.requestId, {
    database: renditionDatabase(claim),
    storage: storage(),
  });
  if (result.outcome === 'available') {
    return { state: 'available' as const, resource: result.receipt };
  }
  return {
    state: 'failed' as const,
    failureCode:
      'failureCode' in result
        ? result.failureCode
        : ('RENDER_FAILED' satisfies StudioSagaFailureCode),
  };
};

const executeClaimedDeletion = async (privateClaim: StudioPrivateArtifactJson) => {
  const claim = decodeStudioDeletionClaim(privateClaim);
  const result = await executeStudioDeletionSaga(claim.requestId, {
    database: deletionDatabase(claim),
    storage: storage(),
  });
  if (result.outcome === 'deleted') {
    return { state: 'deleted' as const, resource: result.receipt };
  }
  return {
    state: 'failed' as const,
    failureCode:
      'failureCode' in result ? result.failureCode : 'DELETE_OUTCOME_UNKNOWN',
  };
};

export type StudioPrivateArtifactReconciliationOperationResult = Readonly<{
  status: 'available' | 'deleted' | 'replay' | 'failed' | 'reconciliation_required' | 'not_executable';
  failureCode?: string;
}>;

export const reconcileStudioPrivateRendition = async (
  attemptId: string,
): Promise<StudioPrivateArtifactReconciliationOperationResult> => {
  let boundClaim: StudioRenditionReconciliationClaim | null = null;
  const database: StudioRenditionSagaDatabase = {
    claim: async () => { throw new Error('RECONCILIATION_ONLY'); },
    startAttempt: async () => { throw new Error('RECONCILIATION_ONLY'); },
    persistRendered: async () => { throw new Error('RECONCILIATION_ONLY'); },
    markAvailable: async input => {
      const receipt = await rpc('renditionComplete', { p_attempt: input.attemptId });
      if (!boundClaim || receipt.renditionId !== boundClaim.renditionId || receipt.state !== 'available') {
        throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      }
      return renditionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.attemptId }, 'available');
    },
    markFailed: async input => {
      await rpc('renditionFail', { p_attempt: input.attemptId, p_failure: input.failureCode });
      if (!boundClaim) throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      return renditionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.attemptId }, 'failed');
    },
    markReconciliationRequired: async input => {
      await rpc('renditionFail', { p_attempt: input.attemptId, p_failure: input.failureCode });
      if (!boundClaim) throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      return renditionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.attemptId }, 'reconciliation_required');
    },
    loadReconciliation: async id => {
      boundClaim = await rpc('renditionReconciliationClaim', { p_attempt: id });
      return boundClaim ? renditionReconciliationWork(boundClaim) : null;
    },
  };
  try {
    const result = await reconcileStudioRendition(attemptId, { database, storage: storage() });
    return {
      status: result.outcome === 'replay' ? 'replay' : result.outcome,
      ...('failureCode' in result ? { failureCode: result.failureCode } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'RENDITION_RECONCILIATION_NOT_FOUND') {
      return { status: 'not_executable' };
    }
    throw error;
  }
};

export const reconcileStudioPrivateDeletion = async (
  deletionAttemptId: string,
): Promise<StudioPrivateArtifactReconciliationOperationResult> => {
  let boundClaim: StudioDeletionReconciliationClaim | null = null;
  const database: StudioDeletionSagaDatabase = {
    claimDeletion: async () => { throw new Error('RECONCILIATION_ONLY'); },
    markTombstone: async input => {
      const receipt = await rpc('deletionComplete', { p_attempt: input.deletionAttemptId });
      if (!boundClaim || receipt.attemptId !== boundClaim.deletionAttemptId || receipt.state !== 'deleted') {
        throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      }
      return deletionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.deletionAttemptId }, 'deleted');
    },
    markDeletionFailure: async input => {
      await rpc('deletionFail', { p_attempt: input.deletionAttemptId, p_failure: input.failureCode });
      if (!boundClaim) throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      return deletionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.deletionAttemptId }, 'deletion_failed');
    },
    markDeletionReconciliationRequired: async input => {
      await rpc('deletionFail', { p_attempt: input.deletionAttemptId, p_failure: input.failureCode });
      if (!boundClaim) throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      return deletionReceipt({ ...boundClaim, disposition: 'execute', requestId: boundClaim.deletionAttemptId }, 'reconciliation_required');
    },
    loadDeletionReconciliation: async id => {
      boundClaim = await rpc('deletionReconciliationClaim', { p_attempt: id });
      return boundClaim
        ? { ...boundClaim, disposition: 'execute', requestId: boundClaim.deletionAttemptId }
        : null;
    },
  };
  try {
    const result = await reconcileStudioDeletion(deletionAttemptId, { database, storage: storage() });
    return {
      status: result.outcome === 'replay' ? 'replay' : result.outcome,
      ...('failureCode' in result ? { failureCode: result.failureCode } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'DELETION_RECONCILIATION_NOT_FOUND') {
      return { status: 'not_executable' };
    }
    throw error;
  }
};

export const studioPrivateArtifactDependencies: StudioPrivateArtifactCommandDependencies =
  {
    authenticate: request => getAuthUser(request),
    loadFreshAuthority: ({ actorId, organizationId, workspaceId }) =>
      rpc('authority', {
        p_actor: actorId,
        p_org: organizationId,
        p_workspace: workspaceId,
      }),
    executeAtomicCommand: (command: StudioPrivateArtifactAtomicCommand) =>
      rpc('commandClaim', {
        p_command: command,
      }),
    executeClaimedRendition,
    executeClaimedDeletion,
  };

type DownloadCapableStorage = StudioPrivateArtifactStorage & {
  downloadExact(input: StudioStoredObjectExpectation): Promise<Uint8Array>;
};

export const studioPrivateArtifactDownloadDependencies: StudioPrivateArtifactDownloadDependencies =
  {
    authenticate: request => getAuthUser(request),
    loadFreshAuthority: studioPrivateArtifactDependencies.loadFreshAuthority,
    claimDownload: command =>
      rpc('downloadClaim', {
        p_command: command,
      }),
    retrieveAndVerify: async privateClaim => {
      const expected: StudioDownloadExecuteClaim =
        decodeStudioDownloadClaim(privateClaim);
      const provider: DownloadCapableStorage = storage();
      const bytes = await provider.downloadExact(expected);
      return {
        bytes,
        mimeType: expected.mimeType,
        filename: expected.filename,
      } satisfies StudioPrivateArtifactVerifiedDownload;
    },
    completeDownload: async receiptId => {
      await rpc('downloadComplete', { p_receipt: receiptId });
    },
    failDownload: async (receiptId, failureCode) => {
      await rpc('downloadFail', {
        p_receipt: receiptId,
        p_failure: failureCode,
      });
    },
  };
