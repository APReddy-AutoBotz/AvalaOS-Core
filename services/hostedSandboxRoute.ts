export const HOSTED_SANDBOX_ROUTE = '/sandbox';

export const isHostedSyntheticSandboxPath = (pathname: unknown): boolean =>
  typeof pathname === 'string' &&
  (pathname === HOSTED_SANDBOX_ROUTE || pathname.startsWith(`${HOSTED_SANDBOX_ROUTE}/`));

export const shouldUseHostedSyntheticSandbox = ({
  enabled,
  runtimeMode,
  pathname,
}: {
  enabled: boolean;
  runtimeMode?: string;
  pathname: unknown;
}): boolean =>
  enabled &&
  runtimeMode !== 'production' &&
  isHostedSyntheticSandboxPath(pathname);
