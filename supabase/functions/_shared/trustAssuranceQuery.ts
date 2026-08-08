import { TRUST_QUERY_VIEWS, type TrustQueryRequest, type TrustQueryView } from '../../../services/trustAssurance/contracts.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const queryFields = ['organizationId', 'workspaceId', 'authorizationVersion', 'view'] as const;

export const decodeTrustAssuranceQueryRequest = (value: unknown): TrustQueryRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('VALIDATION_FAILED');
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row);
  if (keys.length !== queryFields.length || keys.some(key => !queryFields.includes(key as typeof queryFields[number]))) {
    throw new Error('VALIDATION_FAILED');
  }
  if (typeof row.organizationId !== 'string' || !uuid.test(row.organizationId)
    || typeof row.workspaceId !== 'string' || !uuid.test(row.workspaceId)
    || !Number.isSafeInteger(row.authorizationVersion) || (row.authorizationVersion as number) < 1
    || typeof row.view !== 'string' || !TRUST_QUERY_VIEWS.includes(row.view as TrustQueryView)) {
    throw new Error('VALIDATION_FAILED');
  }
  return row as unknown as TrustQueryRequest;
};

export const applyTrustAssuranceRuntimeConfiguration = (
  view: TrustQueryView,
  projection: unknown,
  readOnly: boolean,
): unknown => {
  if (view !== 'internal' || !projection || typeof projection !== 'object' || Array.isArray(projection)) return projection;
  return { ...(projection as Record<string, unknown>), readOnly };
};
