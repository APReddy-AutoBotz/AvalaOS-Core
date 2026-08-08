export type TrustAuthorityErrorCode = 'AUTHORIZATION_STALE' | 'ACCESS_DENIED' | 'PERSISTENCE_UNAVAILABLE';

export const classifyTrustPersistenceError = (value: unknown): TrustAuthorityErrorCode => {
  const serialized = typeof value === 'string' ? value : value instanceof Error ? value.message : JSON.stringify(value ?? '');
  if (serialized.includes('PR1B_AUTHORIZATION_STALE')) return 'AUTHORIZATION_STALE';
  if (serialized.includes('PR1B_NOT_FOUND')) return 'ACCESS_DENIED';
  return 'PERSISTENCE_UNAVAILABLE';
};
