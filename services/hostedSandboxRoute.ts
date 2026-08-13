export const HOSTED_SANDBOX_ROUTE = '/sandbox';

export const isHostedSyntheticSandboxPath = (pathname: unknown): boolean =>
  typeof pathname === 'string' &&
  (pathname === HOSTED_SANDBOX_ROUTE || pathname.startsWith(`${HOSTED_SANDBOX_ROUTE}/`));

export const shouldUseHostedSyntheticSandbox = ({
  runtimeMode,
  serverConfigured,
  pathname,
}: {
  runtimeMode?: string;
  serverConfigured: boolean;
  pathname: unknown;
}): boolean =>
  runtimeMode === 'pilot' &&
  serverConfigured &&
  isHostedSyntheticSandboxPath(pathname);
