import type { TenantContextProjection } from '../../types.ts';
import type { StudioHandoffSummary, StudioWorkspaceProjection } from '../../services/studioArtifacts/workspaceModel.ts';

export type StudioHandoffAction = 'request' | 'review-approve' | 'request-changes' | 'review-reject'
  | 'final-approve' | 'final-reject' | 'withdraw' | 'consume';
export type StudioHandoffPhase = 'loading' | 'ready' | 'committing' | 'reload_failed' | 'blocked';

export interface StudioHandoffReadiness {
  readonly identity: string;
  readonly requestSequence: number;
  readonly phase: StudioHandoffPhase;
  readonly projection: StudioWorkspaceProjection | null;
}

export interface StudioHandoffCommandBinding {
  readonly identity: string;
  readonly loadSequence: number;
  readonly commandSequence: number;
}

export const studioHandoffLoadIsCurrent = (
  current: Pick<StudioHandoffReadiness, 'identity' | 'requestSequence'>,
  binding: Pick<StudioHandoffReadiness, 'identity' | 'requestSequence'>,
  mounted: boolean,
) => mounted && current.identity === binding.identity && current.requestSequence === binding.requestSequence;

export const studioHandoffCommandIsCurrent = (
  current: Pick<StudioHandoffReadiness, 'identity' | 'requestSequence'>,
  active: StudioHandoffCommandBinding | null,
  binding: StudioHandoffCommandBinding,
  mounted: boolean,
  authorityAccepted: boolean,
) => authorityAccepted && studioHandoffLoadIsCurrent(current, {
  identity: binding.identity,
  requestSequence: binding.loadSequence,
}, mounted) && active === binding;

export const studioHandoffAuthorityIdentity = (
  context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId' | 'userId' | 'authorizationVersion'>,
) => `${context.organizationId}:${context.workspaceId}:${context.userId}:${context.authorizationVersion}`;

export const studioHandoffProjectionMatchesContext = (
  projection: StudioWorkspaceProjection,
  context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId'>,
) => projection.organizationId === context.organizationId && projection.workspaceId === context.workspaceId;

const actionName = (action: StudioHandoffAction) => action === 'request'
  ? 'studio.handoff.request'
  : action === 'consume'
    ? 'studio.handoff.consume'
    : action === 'withdraw'
      ? 'studio.handoff.withdraw'
      : action.startsWith('final-')
        ? 'studio.handoff.approval.resolve'
        : 'studio.handoff.review.resolve';

const sameHandoffVersion = (left: StudioHandoffSummary, right: StudioHandoffSummary) => (
  left.kind === right.kind
  && left.direction === right.direction
  && left.upstreamHandoffId === right.upstreamHandoffId
  && left.handoffId === right.handoffId
  && left.handoffVersionId === right.handoffVersionId
  && left.version === right.version
  && left.sourceVersion === right.sourceVersion
  && left.state === right.state
);

export const resolveCurrentStudioHandoff = (
  projection: StudioWorkspaceProjection,
  captured: StudioHandoffSummary,
  action: StudioHandoffAction,
): StudioHandoffSummary | null => {
  const current = [...projection.inbox, ...projection.outbox].find(item => (
    item.kind === captured.kind
    && item.direction === captured.direction
    && item.upstreamHandoffId === captured.upstreamHandoffId
    && item.handoffId === captured.handoffId
  ));
  if (!current || !sameHandoffVersion(current, captured) || !current.actions.includes(actionName(action))) return null;
  return current;
};

export const canUseStudioHandoffProjection = (input: {
  readiness: StudioHandoffReadiness;
  currentIdentity: string;
  context: Pick<TenantContextProjection, 'organizationId' | 'workspaceId'>;
  offline: boolean;
  mutationPending: boolean;
}) => input.readiness.phase === 'ready'
  && input.readiness.identity === input.currentIdentity
  && input.readiness.projection !== null
  && studioHandoffProjectionMatchesContext(input.readiness.projection, input.context)
  && !input.readiness.projection.readOnly
  && !input.offline
  && !input.mutationPending;
