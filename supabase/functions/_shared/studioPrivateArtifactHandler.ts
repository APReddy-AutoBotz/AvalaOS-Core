import {
  asStudioPrivateArtifactError,
  parseStudioPrivateArtifactEnvelope,
  requiredStudioPrivateArtifactCapability,
  StudioPrivateArtifactError,
  studioPrivateArtifactErrorBody,
  type StudioPrivateArtifactAtomicCommand,
  type StudioPrivateArtifactAtomicResult,
  type StudioPrivateArtifactAuthority,
  type StudioPrivateArtifactJson,
  toStudioPrivateArtifactSqlCommand,
} from './studioPrivateArtifactCommand.ts';
import {
  decodeStudioDeletionClaim,
  decodeStudioRenditionClaim,
  type StudioDeletionPendingClaim,
  type StudioRenditionExecuteClaim,
} from './studioPrivateArtifactRpcContract.ts';

export interface StudioPrivateArtifactCommandDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  loadFreshAuthority(input: {
    request: Request;
    actorId: string;
    organizationId: string;
    workspaceId: string;
  }): Promise<StudioPrivateArtifactAuthority | null>;
  executeAtomicCommand(
    command: StudioPrivateArtifactAtomicCommand,
  ): Promise<StudioPrivateArtifactAtomicResult>;
  executeClaimedRendition?(
    claim: StudioRenditionExecuteClaim,
  ): Promise<StudioClaimedRenditionExecutionResult>;
  executeClaimedDeletion?(
    claim: StudioDeletionPendingClaim,
  ): Promise<StudioClaimedDeletionExecutionResult>;
}

export type StudioClaimedRenditionExecutionResult =
  | { state: 'available'; resource: StudioPrivateArtifactJson }
  | { state: 'failed'; failureCode: string }
  | { state: 'reconciliation_required'; failureCode: string };

export type StudioClaimedDeletionExecutionResult =
  | { state: 'deleted'; resource: StudioPrivateArtifactJson }
  | { state: 'failed'; failureCode: string }
  | { state: 'reconciliation_required'; failureCode: string };

const POST_COMMIT_EFFECT_KIND = {
  'studio.rendition.generate': 'external',
  'studio.retention.policy.publish': 'database_only',
  'studio.rendition.retention.extend': 'database_only',
  'studio.legal_hold.place': 'database_only',
  'studio.legal_hold.release': 'database_only',
  'studio.rendition.deletion.request': 'database_only',
  'studio.rendition.deletion.resolve': 'deletion_outcome',
} as const satisfies Record<
  StudioPrivateArtifactAtomicCommand['commandType'],
  'external' | 'database_only' | 'deletion_outcome'
>;

export const studioPrivateArtifactCommandHasPostCommitExternalEffect = (
  command: Pick<StudioPrivateArtifactAtomicCommand, 'commandType' | 'payload'>,
): boolean => {
  const kind = POST_COMMIT_EFFECT_KIND[command.commandType];
  if (kind === 'external') return true;
  if (kind === 'database_only') return false;
  if (command.payload.outcome === 'approve') return true;
  if (command.payload.outcome === 'reject') return false;
  // The SQL command has already passed strict validation. Retain a fail-closed
  // boundary if a caller ever bypasses that validated construction path.
  throw new StudioPrivateArtifactError('INVALID_COMMAND');
};

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'bucket',
  'bucketid',
  'bucketname',
  'objectkey',
  'objectpath',
  'storagepath',
  'signedurl',
  'servicekey',
  'servicerole',
]);
const assertPublicResource = (value: unknown, depth = 0): StudioPrivateArtifactJson => {
  if (
    depth > 8 ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (FORBIDDEN_PUBLIC_KEYS.has(normalized)) {
      throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
    }
    if (child !== null && typeof child === 'object') {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item !== null && typeof item === 'object') assertPublicResource(item, depth + 1);
        }
      } else {
        assertPublicResource(child, depth + 1);
      }
    }
  }
  return value as StudioPrivateArtifactJson;
};

const publicResult = (
  result: StudioPrivateArtifactAtomicResult,
  resource = result.resource,
) => ({
  receiptId: result.receiptId,
  resourceId: result.resourceId,
  resource: assertPublicResource(resource),
});

const committedPending = (
  result: StudioPrivateArtifactAtomicResult,
  resource: StudioPrivateArtifactJson,
) =>
  Response.json(
    {
      ok: false,
      outcome: 'committed_reconciliation_pending',
      receiptId: result.receiptId,
      resourceId: result.resourceId,
      resource,
    },
    { status: 202 },
  );

const committedDatabaseResult = (
  result: StudioPrivateArtifactAtomicResult,
  resource: StudioPrivateArtifactJson,
) => {
  const replayed = result.outcome === 'replayed';
  return Response.json(
    {
      ok: true,
      outcome: replayed ? 'replayed' : 'committed',
      receiptId: result.receiptId,
      resourceId: result.resourceId,
      resource,
    },
    { status: replayed ? 200 : 201 },
  );
};

export const handleStudioPrivateArtifactCommand = async (
  request: Request,
  deps: StudioPrivateArtifactCommandDependencies,
): Promise<Response> => {
  let committed: StudioPrivateArtifactAtomicResult | null = null;
  let committedPublicResource: StudioPrivateArtifactJson | null = null;
  let committedCommandHasExternalEffect: boolean | null = null;
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
    let envelope;
    try {
      envelope = parseStudioPrivateArtifactEnvelope(await request.json());
    } catch (error) {
      throw error instanceof StudioPrivateArtifactError
        ? error
        : new StudioPrivateArtifactError('INVALID_COMMAND');
    }

    // This fresh lookup is intentionally before receipt, artifact, rendition,
    // attempt, deletion, hold, policy, or private-object inspection.
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
    if (
      !authority.capabilities.includes(
        requiredStudioPrivateArtifactCapability(envelope.commandType),
      )
    ) {
      throw new StudioPrivateArtifactError('PERMISSION_DENIED');
    }

    const atomicCommand = toStudioPrivateArtifactSqlCommand(envelope, actor.id);
    committedCommandHasExternalEffect =
      studioPrivateArtifactCommandHasPostCommitExternalEffect(atomicCommand);
    let recoveredAfterTransportFailure = false;
    let result: StudioPrivateArtifactAtomicResult;
    try {
      result = await deps.executeAtomicCommand(atomicCommand);
    } catch {
      // The command RPC is idempotent. One exact retry distinguishes a response
      // lost after commit from a request that never committed, without repeating
      // rendering, upload, or physical deletion.
      result = await deps.executeAtomicCommand(atomicCommand);
      recoveredAfterTransportFailure = true;
    }
    committed = result;
    // Fail closed before any external effect if the private command boundary leaks
    // storage coordinates into its public resource projection.
    committedPublicResource = assertPublicResource(result.resource);
    if (
      recoveredAfterTransportFailure &&
      result.outcome === 'replayed' &&
      committedCommandHasExternalEffect
    ) {
      return committedPending(result, committedPublicResource);
    }
    // An exact replay returns committed state only and can never repeat render,
    // upload, or physical deletion.
    if (result.outcome === 'replayed') {
      return Response.json(
        { ok: true, outcome: 'replayed', ...publicResult(result) },
        { status: 200 },
      );
    }

    if (envelope.commandType === 'studio.rendition.generate') {
      if (!result.renditionClaim || !deps.executeClaimedRendition) {
        throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      }
      const external = await deps.executeClaimedRendition(decodeStudioRenditionClaim(result.renditionClaim));
      if (external.state === 'reconciliation_required') {
        return committedPending(result, committedPublicResource);
      }
      if (external.state === 'failed') {
        return Response.json(
          {
            ok: true,
            outcome: 'rendition_failed',
            ...publicResult(result),
          },
          { status: 200 },
        );
      }
      return Response.json(
        {
          ok: true,
          outcome: 'rendition_available',
          ...publicResult(result, external.resource),
        },
        { status: 201 },
      );
    }

    if (
      envelope.commandType === 'studio.rendition.deletion.resolve' &&
      envelope.payload.outcome === 'approve'
    ) {
      if (!result.deletionClaim || !deps.executeClaimedDeletion) {
        throw new StudioPrivateArtifactError('COMMAND_UNAVAILABLE');
      }
      const external = await deps.executeClaimedDeletion(decodeStudioDeletionClaim(result.deletionClaim));
      if (external.state === 'reconciliation_required') {
        return committedPending(result, committedPublicResource);
      }
      if (external.state === 'failed') {
        return Response.json(
          {
            ok: true,
            outcome: 'deletion_failed',
            ...publicResult(result),
          },
          { status: 200 },
        );
      }
      return Response.json(
        {
          ok: true,
          outcome: 'deletion_completed',
          ...publicResult(result, external.resource),
        },
        { status: 201 },
      );
    }

    return Response.json(
      { ok: true, outcome: 'committed', ...publicResult(result) },
      { status: 201 },
    );
  } catch (error) {
    if (committed) {
      if (committedCommandHasExternalEffect === false) {
        return committedDatabaseResult(
          committed,
          committedPublicResource ?? {},
        );
      }
      return committedPending(
        committed,
        committedPublicResource ?? {},
      );
    }
    const safe = asStudioPrivateArtifactError(error);
    return Response.json(studioPrivateArtifactErrorBody(safe), { status: safe.status });
  }
};
