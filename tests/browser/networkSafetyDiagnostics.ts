export const INVALID_NETWORK_ORIGIN = 'invalid-url';

export const diagnosticOrigin = (requestUrl: string): string => {
  try {
    return new URL(requestUrl).origin;
  } catch {
    return INVALID_NETWORK_ORIGIN;
  }
};
