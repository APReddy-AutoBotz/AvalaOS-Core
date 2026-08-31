import {
  asStudioArtifactError,
  parseStudioArtifactEnvelope,
  requiredStudioCapability,
  StudioArtifactError,
  studioArtifactErrorBody,
  type JsonObject,
  type StudioArtifactAtomicCommand,
  type StudioArtifactAuthority,
  type StudioAtomicCommandResult,
} from './studioArtifactCommand.ts';

export interface StudioArtifactCommandDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  loadFreshAuthority(input: {
    request: Request; actorId: string; organizationId: string; workspaceId: string;
  }): Promise<StudioArtifactAuthority | null>;
  executeAtomicCommand(command: StudioArtifactAtomicCommand): Promise<StudioAtomicCommandResult>;
  executeClaimedGeneration?(claim: JsonObject): Promise<
    | { state: 'completed'; resource: unknown }
    | { state: 'failed'; failureCode: string }
    | { state: 'stale'; resource?: unknown }
    | { state: 'uncertain'; failureCode: string }
    | { state: 'in_progress'; resource?: unknown }
  >;
}

const publicResult = (result: StudioAtomicCommandResult) => ({
  outcome: result.outcome,
  receiptId: result.receiptId,
  resourceId: result.resourceId,
  resource: result.resource,
});

const assertAuthority = (
  authority: StudioArtifactAuthority | null,
  actorId: string,
  capability: string,
  expectedAuthorizationVersion?: number,
) => {
  if (!authority || authority.actorId !== actorId) throw new StudioArtifactError('RESOURCE_NOT_AVAILABLE');
  if (expectedAuthorizationVersion !== undefined && authority.authorizationVersion !== expectedAuthorizationVersion) {
    throw new StudioArtifactError('AUTHORITY_STALE');
  }
  if (!authority.capabilities.includes(capability)) throw new StudioArtifactError('PERMISSION_DENIED');
};

/**
 * Authority is resolved before receipt inspection/effect and again immediately
 * before any terminal or replay payload is disclosed. The second check uses
 * current authority rather than the historical request version so a version
 * bump with retained capability does not leak or destroy a durable result.
 */
export const handleStudioArtifactCommand = async (
  request: Request,
  deps: StudioArtifactCommandDependencies,
): Promise<Response> => {
  try {
    if (request.method !== 'POST') throw new StudioArtifactError('METHOD_NOT_ALLOWED');
    let actor: { id: string };
    try { actor = await deps.authenticate(request); } catch { throw new StudioArtifactError('AUTHENTICATION_REQUIRED'); }
    let body: unknown;
    try { body = await request.json(); } catch { throw new StudioArtifactError('INVALID_COMMAND'); }
    const envelope = parseStudioArtifactEnvelope(body);
    const capability = requiredStudioCapability(envelope.commandType);
    const authorityInput = {
      request, actorId: actor.id, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId,
    };
    assertAuthority(await deps.loadFreshAuthority(authorityInput), actor.id, capability, envelope.authorizationVersion);

    const command: StudioArtifactAtomicCommand = { ...envelope, actorId: actor.id };
    const result = await deps.executeAtomicCommand(command);
    let status = result.outcome === 'replayed' ? 200 : result.outcome === 'command_in_progress' ? 409 : 201;
    let payload: Record<string, unknown> = publicResult(result);

    // Exact replay never re-enters the provider boundary. A claimed generation
    // is a server-owned plan/fence returned by the service-only transaction.
    if (result.generationClaim && result.outcome === 'committed') {
      try {
        if (!deps.executeClaimedGeneration) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
        const generation = await deps.executeClaimedGeneration(result.generationClaim);
        if (generation.state === 'completed') {
          status = 201; payload = { ...publicResult(result), outcome: 'generation_completed', resource: generation.resource };
        } else if (generation.state === 'stale') {
          status = 409; payload = { ...publicResult(result), outcome: 'generation_stale', resource: generation.resource ?? result.resource };
        } else if (generation.state === 'uncertain') {
          status = 503; payload = { ...publicResult(result), outcome: 'generation_uncertain', resource: result.resource };
        } else if (generation.state === 'in_progress') {
          status = 409; payload = { ...publicResult(result), outcome: 'command_in_progress', resource: generation.resource ?? result.resource };
        } else {
          status = 200; payload = { ...publicResult(result), outcome: 'generation_failed' };
        }
      } catch {
        // The request RPC already committed the receipt and generation attempt.
        // Never misclassify a later dependency failure as failed-before-commit or
        // hide the durable selectors required for safe reconciliation/replay.
        status = 503;
        payload = { ...publicResult(result), outcome: 'generation_uncertain', resource: result.resource };
      }
    }

    assertAuthority(await deps.loadFreshAuthority(authorityInput), actor.id, capability);
    return Response.json({ ok: true, ...payload }, { status });
  } catch (error) {
    const safe = asStudioArtifactError(error);
    return Response.json(studioArtifactErrorBody(safe), { status: safe.status });
  }
};
