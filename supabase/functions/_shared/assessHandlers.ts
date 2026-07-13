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

const REQUIRED_PERMISSION: Record<AssessCommandEnvelope['commandType'], string> = {
  'assessment.create': 'assess.create',
  'assessment.response.upsert': 'assess.response.write',
  'assessment.finalize': 'assess.finalize',
  'govern.resolve': 'govern.resolve',
  'studio_handoff.create': 'studio.handoff.create',
};

const requiredPermission = (type: AssessCommandEnvelope['commandType']) => REQUIRED_PERMISSION[type];

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

const handleGovernResolve = async (
  envelope: AssessCommandEnvelope,
  authority: AssessAuthority,
  deps: AssessCommandDependencies,
) => {
  requireExactKeys(envelope.payload, ['assessmentId', 'resolution', 'reason']);
  const assessmentId = requireUuid(envelope.payload.assessmentId);
  const resolution = envelope.payload.resolution;
  if (!['submit', 'approve', 'request_changes', 'reject'].includes(resolution as string)) assessError('INVALID_COMMAND');
  if (envelope.payload.reason !== null && envelope.payload.reason !== undefined &&
      (typeof envelope.payload.reason !== 'string' || envelope.payload.reason.trim().length > 1000)) {
    assessError('INVALID_COMMAND');
  }
  if (['request_changes', 'reject'].includes(resolution as string) &&
      (typeof envelope.payload.reason !== 'string' || !envelope.payload.reason.trim())) {
    assessError('INVALID_COMMAND');
  }
  return deps.executeAtomicCommand({
    ...commonCommand(envelope, authority),
    expectedVersion: requireExpectedVersion(envelope),
    resourceId: assessmentId,
    payload: {
      resolution,
      reason: typeof envelope.payload.reason === 'string' ? envelope.payload.reason.trim() : null,
    },
  });
};

const handleStudioHandoff = async (
  envelope: AssessCommandEnvelope,
  authority: AssessAuthority,
  deps: AssessCommandDependencies,
) => {
  requireExactKeys(envelope.payload, ['assessmentId', 'reason']);
  const assessmentId = requireUuid(envelope.payload.assessmentId);
  if (envelope.payload.reason !== null && envelope.payload.reason !== undefined &&
      (typeof envelope.payload.reason !== 'string' || envelope.payload.reason.trim().length > 1000)) {
    assessError('INVALID_COMMAND');
  }
  return deps.executeAtomicCommand({
    ...commonCommand(envelope, authority),
    expectedVersion: requireExpectedVersion(envelope),
    resourceId: assessmentId,
    payload: { reason: typeof envelope.payload.reason === 'string' ? envelope.payload.reason.trim() : null },
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
  if (envelope.commandType === 'assessment.finalize') return handleFinalize(envelope, authorized, deps);
  if (envelope.commandType === 'govern.resolve') return handleGovernResolve(envelope, authorized, deps);
  return handleStudioHandoff(envelope, authorized, deps);
};
