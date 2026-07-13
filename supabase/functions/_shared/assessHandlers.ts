import type { AssessmentResponses } from '../../../types.ts';
import { calculateAssessmentScores, ScoringValidationError } from './assessScoring.ts';
import {
  AssessAuthority,
  AssessCommandDependencies,
  AssessCommandEnvelope,
  AssessCommandError,
  assessError,
  isRecord,
  requireExactKeys,
  requireUuid,
} from './assessCommand.ts';

const requiredPermission = (type: AssessCommandEnvelope['commandType']) => (
  type === 'assessment.create'
    ? 'assess.create'
    : type === 'assessment.response.upsert' ? 'assess.response.write' : 'assess.finalize'
);

const authorize = (envelope: AssessCommandEnvelope, authority: AssessAuthority | null, actorId: string) => {
  if (!authority || authority.actorId !== actorId ||
      authority.organizationId !== envelope.organizationId ||
      authority.workspaceId !== envelope.workspaceId) assessError('RESOURCE_NOT_AVAILABLE');
  if (authority.authorizationVersion !== envelope.authorizationVersion) assessError('AUTHORITY_STALE');
  if (!authority.permissions.includes(requiredPermission(envelope.commandType))) assessError('PERMISSION_DENIED');
  return authority;
};

const commonCommand = (envelope: AssessCommandEnvelope, authority: AssessAuthority) => ({
  requestId: envelope.requestId,
  idempotencyKey: envelope.idempotencyKey,
  commandType: envelope.commandType,
  actorId: authority.actorId,
  organizationId: authority.organizationId,
  workspaceId: authority.workspaceId,
  authorizationVersion: authority.authorizationVersion,
});

const requireExpectedVersion = (envelope: AssessCommandEnvelope) => {
  if (envelope.expectedVersion === undefined) assessError('INVALID_COMMAND');
  return envelope.expectedVersion;
};

const handleCreate = async (envelope: AssessCommandEnvelope, authority: AssessAuthority, deps: AssessCommandDependencies) => {
  requireExactKeys(envelope.payload, ['processId']);
  const processId = requireUuid(envelope.payload.processId);
  if (envelope.expectedVersion !== undefined) assessError('INVALID_COMMAND');
  return deps.executeAtomicCommand({
    ...commonCommand(envelope, authority),
    resourceId: envelope.requestId,
    payload: { processId },
  });
};

const handleResponseUpsert = async (envelope: AssessCommandEnvelope, authority: AssessAuthority, deps: AssessCommandDependencies) => {
  requireExactKeys(envelope.payload, ['assessmentId', 'responses', 'metadata', 'evidenceItems', 'assumptions']);
  const assessmentId = requireUuid(envelope.payload.assessmentId);
  if (!isRecord(envelope.payload.responses) || !isRecord(envelope.payload.metadata)) assessError('INVALID_COMMAND');
  if (envelope.payload.evidenceItems !== undefined && !Array.isArray(envelope.payload.evidenceItems)) assessError('INVALID_COMMAND');
  if (envelope.payload.assumptions !== undefined && !Array.isArray(envelope.payload.assumptions)) assessError('INVALID_COMMAND');
  return deps.executeAtomicCommand({
    ...commonCommand(envelope, authority),
    expectedVersion: requireExpectedVersion(envelope),
    resourceId: assessmentId,
    payload: {
      responses: envelope.payload.responses,
      metadata: envelope.payload.metadata,
      evidenceItems: envelope.payload.evidenceItems ?? [],
      assumptions: envelope.payload.assumptions ?? [],
    },
  });
};

const handleFinalize = async (envelope: AssessCommandEnvelope, authority: AssessAuthority, deps: AssessCommandDependencies) => {
  requireExactKeys(envelope.payload, ['assessmentId']);
  const assessmentId = requireUuid(envelope.payload.assessmentId);
  const expectedVersion = requireExpectedVersion(envelope);
  const persisted = await deps.loadAssessmentForFinalize({
    assessmentId,
    organizationId: authority.organizationId,
    workspaceId: authority.workspaceId,
    expectedVersion,
  });
  if (!persisted) assessError('RESOURCE_NOT_AVAILABLE');
  let scores;
  try {
    scores = calculateAssessmentScores(
      persisted.responses as unknown as AssessmentResponses,
      persisted.metadata as never,
      {
        assessmentId,
        processId: persisted.processId,
        organizationId: authority.organizationId,
        evidenceItems: persisted.evidenceItems as never,
        assumptions: persisted.assumptions as never,
      } as never,
    );
  } catch (error) {
    if (error instanceof ScoringValidationError) assessError('INVALID_COMMAND');
    throw error;
  }
  return deps.executeAtomicCommand({
    ...commonCommand(envelope, authority),
    expectedVersion,
    resourceId: assessmentId,
    payload: { processId: persisted.processId, scores },
  });
};

export const executeAssessCommand = async (
  request: Request,
  envelope: AssessCommandEnvelope,
  deps: AssessCommandDependencies,
) => {
  let actor;
  try {
    actor = await deps.authenticate(request);
  } catch (error) {
    if (error instanceof AssessCommandError) throw error;
    assessError('AUTHENTICATION_REQUIRED');
  }
  let authority;
  try {
    authority = await deps.loadFreshAuthority({
      request,
      actorId: actor.id,
      organizationId: envelope.organizationId,
      workspaceId: envelope.workspaceId,
    });
  } catch (error) {
    if (error instanceof AssessCommandError) throw error;
    assessError('COMMAND_UNAVAILABLE');
  }
  const authorized = authorize(envelope, authority, actor.id);
  if (envelope.commandType === 'assessment.create') return handleCreate(envelope, authorized, deps);
  if (envelope.commandType === 'assessment.response.upsert') return handleResponseUpsert(envelope, authorized, deps);
  return handleFinalize(envelope, authorized, deps);
};
