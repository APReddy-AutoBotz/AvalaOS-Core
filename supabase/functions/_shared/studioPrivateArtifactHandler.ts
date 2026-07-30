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
} from './studioPrivateArtifactCommand.ts';

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
    claim: StudioPrivateArtifactJson,
  ): Promise<
    | { state: 'available'; resource: StudioPrivateArtifactJson }
    | { state: 'failed'; failureCode: string }
  >;
  executeClaimedDeletion?(
    claim: StudioPrivateArtifactJson,
  ): Promise<
    | { state: 'deleted'; resource: StudioPrivateArtifactJson }
    | { state: 'failed'; failureCode: string }
  >;
}

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

export const handleStudioPrivateArtifactCommand = async (
  request: Request,
  deps: StudioPrivateArtifactCommandDependencies,
): Promise<Response> => {
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
    if (!authority || authority.actorId !== actor.id) {
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

    const result = await deps.executeAtomicCommand({ ...envelope, actorId: actor.id });
    // Fail closed before any external effect if the private command boundary leaks
    // storage coordinates into its public resource projection.
    assertPublicResource(result.resource);
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
      const external = await deps.executeClaimedRendition(result.renditionClaim);
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
      const external = await deps.executeClaimedDeletion(result.deletionClaim);
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
    const safe = asStudioPrivateArtifactError(error);
    return Response.json(studioPrivateArtifactErrorBody(safe), { status: safe.status });
  }
};
