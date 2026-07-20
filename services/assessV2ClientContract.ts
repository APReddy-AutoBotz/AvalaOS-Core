import type { TenantContextProjection } from '../types';

export const buildAssessV2CommandEnvelope = (
  context: TenantContextProjection,
  commandType: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  expectedVersion?: number,
  requestId: string = crypto.randomUUID(),
) => ({
  requestId,
  idempotencyKey,
  commandType,
  organizationId: context.organizationId,
  workspaceId: context.workspaceId,
  authorizationVersion: context.authorizationVersion,
  ...(expectedVersion === undefined ? {} : { expectedVersion }),
  payload,
});
