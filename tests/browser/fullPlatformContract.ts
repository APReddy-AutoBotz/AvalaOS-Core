export type FullPlatformExecutionMode = 'fixture' | 'connected';

export interface FullPlatformServerPreflight {
  schemaVersion: 'avalaos-full-platform-preflight-v1';
  status: 'ready';
  environment: 'local_nonproduction';
  dataAccess: 'server';
  syntheticData: true;
  organizationId: string;
  workspaceId: string;
}

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} is required`);
  return value.trim();
};

export const parseFullPlatformExecutionMode = (value: string | undefined): FullPlatformExecutionMode => {
  const resolved = value ?? 'fixture';
  if (resolved !== 'fixture' && resolved !== 'connected') {
    throw new Error('FULL_PLATFORM_EXECUTION_MODE must be fixture or connected');
  }
  return resolved;
};

export const parseFullPlatformRunId = (value: string | undefined): string => {
  const runId = value ?? 'local-contract';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(runId)) {
    throw new Error('FULL_PLATFORM_RUN_ID must be a sanitized 1-64 character identifier');
  }
  return runId;
};

export const parseFullPlatformBaseUrl = (value: string | undefined): string => {
  const url = new URL(value ?? 'http://127.0.0.1:4173');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FULL_PLATFORM_BASE_URL must use HTTP or HTTPS');
  if (url.username || url.password || url.search || url.hash) throw new Error('FULL_PLATFORM_BASE_URL must not contain credentials, query, or fragment');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('FULL_PLATFORM_BASE_URL must identify an origin, not a nested path');
  return url.origin;
};

export const parseAuthorityOrigins = (value: string | undefined): string[] => {
  if (!value?.trim()) return [];
  const origins = value.split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const url = new URL(item);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('FULL_PLATFORM_AUTHORITY_ORIGINS entries must be credential-free HTTP(S) origins');
    }
    return url.origin;
  });
  return [...new Set(origins)];
};

export const validateFullPlatformServerPreflight = ({
  payload,
  expectedOrganizationId,
  expectedWorkspaceId,
}: {
  payload: unknown;
  expectedOrganizationId: string | undefined;
  expectedWorkspaceId: string | undefined;
}): FullPlatformServerPreflight => {
  const organizationId = requiredText(expectedOrganizationId, 'FULL_PLATFORM_EXPECTED_ORGANIZATION_ID');
  const workspaceId = requiredText(expectedWorkspaceId, 'FULL_PLATFORM_EXPECTED_WORKSPACE_ID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('FULL_PLATFORM_SERVER_PREFLIGHT_INVALID');
  const candidate = payload as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 'avalaos-full-platform-preflight-v1' ||
    candidate.status !== 'ready' ||
    candidate.environment !== 'local_nonproduction' ||
    candidate.dataAccess !== 'server' ||
    candidate.syntheticData !== true ||
    candidate.organizationId !== organizationId ||
    candidate.workspaceId !== workspaceId
  ) {
    throw new Error('FULL_PLATFORM_SERVER_PREFLIGHT_MISMATCH');
  }
  return candidate as unknown as FullPlatformServerPreflight;
};

export const classifyPublicRoute = (pathname: string): 'sandbox' | 'server-sign-in' | 'outside-sandbox' => {
  if (pathname === '/sandbox' || pathname.startsWith('/sandbox/')) return 'sandbox';
  if (pathname === '/sign-in') return 'server-sign-in';
  return 'outside-sandbox';
};
