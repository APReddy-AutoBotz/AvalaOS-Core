export const RUNTIME_MODES = [
  'local_demo',
  'automated_test',
  'pilot',
  'production',
] as const;

export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export type RuntimeBoundaryErrorCode =
  | 'RUNTIME_MODE_REQUIRED'
  | 'RUNTIME_MODE_INVALID'
  | 'RUNTIME_AUTOMATED_TEST_CONTEXT_REQUIRED'
  | 'RUNTIME_SERVER_CONFIGURATION_REQUIRED';

export const RUNTIME_BOUNDARY_USER_MESSAGE =
  'This runtime is not configured for the requested operation. Contact an administrator.';

export class RuntimeBoundaryError extends Error {
  code: RuntimeBoundaryErrorCode;

  constructor(code: RuntimeBoundaryErrorCode, message = RUNTIME_BOUNDARY_USER_MESSAGE) {
    super(message);
    this.name = 'RuntimeBoundaryError';
    this.code = code;
  }
}

export type RuntimeModeResolution =
  | {
      status: 'resolved';
      mode: RuntimeMode;
      source: 'explicit';
      allowLocalAuthority: boolean;
      requiresServerAuthority: boolean;
    }
  | {
      status: 'blocked';
      code: Exclude<RuntimeBoundaryErrorCode, 'RUNTIME_SERVER_CONFIGURATION_REQUIRED'>;
      error: RuntimeBoundaryError;
      configuredMode?: string | null;
      allowLocalAuthority: false;
      requiresServerAuthority: false;
    };

export type RuntimeDataAccess = 'local' | 'server';

export const isRuntimeMode = (value: string): value is RuntimeMode =>
  RUNTIME_MODES.includes(value as RuntimeMode);

export const resolveRuntimeMode = ({
  configuredMode,
  isAutomatedTestContext,
}: {
  configuredMode?: string | null;
  isAutomatedTestContext: boolean;
}): RuntimeModeResolution => {
  const normalizedMode = configuredMode?.trim();

  if (!normalizedMode) {
    return {
      status: 'blocked',
      code: 'RUNTIME_MODE_REQUIRED',
      error: new RuntimeBoundaryError('RUNTIME_MODE_REQUIRED'),
      configuredMode,
      allowLocalAuthority: false,
      requiresServerAuthority: false,
    };
  }

  if (!isRuntimeMode(normalizedMode)) {
    return {
      status: 'blocked',
      code: 'RUNTIME_MODE_INVALID',
      error: new RuntimeBoundaryError('RUNTIME_MODE_INVALID'),
      configuredMode,
      allowLocalAuthority: false,
      requiresServerAuthority: false,
    };
  }

  if (normalizedMode === 'automated_test' && !isAutomatedTestContext) {
    return {
      status: 'blocked',
      code: 'RUNTIME_AUTOMATED_TEST_CONTEXT_REQUIRED',
      error: new RuntimeBoundaryError('RUNTIME_AUTOMATED_TEST_CONTEXT_REQUIRED'),
      configuredMode,
      allowLocalAuthority: false,
      requiresServerAuthority: false,
    };
  }

  const allowLocalAuthority =
    normalizedMode === 'local_demo' || normalizedMode === 'automated_test';

  return {
    status: 'resolved',
    mode: normalizedMode,
    source: 'explicit',
    allowLocalAuthority,
    requiresServerAuthority: !allowLocalAuthority,
  };
};

export const resolveRuntimeDataAccess = ({
  modeResolution,
  serverConfigured,
}: {
  modeResolution: RuntimeModeResolution;
  serverConfigured: boolean;
}): RuntimeDataAccess => {
  if (modeResolution.status === 'blocked') {
    throw modeResolution.error;
  }

  if (serverConfigured) {
    return 'server';
  }

  if (modeResolution.allowLocalAuthority) {
    return 'local';
  }

  throw new RuntimeBoundaryError('RUNTIME_SERVER_CONFIGURATION_REQUIRED');
};

