export const applyTrustAssuranceRuntimeConfiguration = (
  view: 'internal' | 'buyer',
  projection: unknown,
  readOnly: boolean,
): unknown => {
  if (view !== 'internal' || !projection || typeof projection !== 'object' || Array.isArray(projection)) return projection;
  return { ...(projection as Record<string, unknown>), readOnly };
};
