export type AiRuntimeMode = 'local-demo' | 'internal-dev' | 'pilot' | 'production';

export type AiModeBoundaryErrorCode =
  | 'AI_BOUNDARY_INVALID_MODE'
  | 'AI_BOUNDARY_MODE_REQUIRED'
  | 'AI_BOUNDARY_EDGE_REQUIRED';

export const AI_MODE_BOUNDARY_USER_MESSAGE =
  'Server-side AI is not configured for this workspace/environment. Contact an administrator or use an approved demo path.';

const VALID_MODES: AiRuntimeMode[] = ['local-demo', 'internal-dev', 'pilot', 'production'];

export class AiModeBoundaryError extends Error {
  code: AiModeBoundaryErrorCode;

  constructor(code: AiModeBoundaryErrorCode, message = AI_MODE_BOUNDARY_USER_MESSAGE) {
    super(message);
    this.name = 'AiModeBoundaryError';
    this.code = code;
  }
}

export type AiModeResolution =
  | {
      status: 'resolved';
      mode: AiRuntimeMode;
      source: 'explicit' | 'dev-default';
    }
  | {
      status: 'blocked';
      code: AiModeBoundaryErrorCode;
      error: AiModeBoundaryError;
      configuredMode?: string | null;
    };

export type AiExecutionPolicy =
  | {
      status: 'allowed';
      mode: AiRuntimeMode;
      useEdge: true;
      requiresEdge: boolean;
      allowBrowserFallback: false;
      isDemoOrDevFallback: false;
      boundary: 'edge';
    }
  | {
      status: 'allowed';
      mode: 'local-demo' | 'internal-dev';
      useEdge: false;
      requiresEdge: false;
      allowBrowserFallback: true;
      isDemoOrDevFallback: true;
      fallbackLabel: 'local-demo synthetic/prepared fallback' | 'internal-dev transitional fallback';
      boundary: 'browser-demo-dev-fallback';
    }
  | {
      status: 'blocked';
      mode?: AiRuntimeMode;
      code: AiModeBoundaryErrorCode;
      error: AiModeBoundaryError;
      useEdge: false;
      requiresEdge: boolean;
      allowBrowserFallback: false;
      isDemoOrDevFallback: false;
      boundary: 'blocked';
    };

export const isAiRuntimeMode = (value: string): value is AiRuntimeMode =>
  VALID_MODES.includes(value as AiRuntimeMode);

export const resolveAiMode = ({
  configuredMode,
  isDev,
  isProd,
}: {
  configuredMode?: string | null;
  isDev: boolean;
  isProd: boolean;
}): AiModeResolution => {
  const normalizedMode = configuredMode?.trim();

  if (normalizedMode) {
    if (isAiRuntimeMode(normalizedMode)) {
      return {
        status: 'resolved',
        mode: normalizedMode,
        source: 'explicit',
      };
    }

    return {
      status: 'blocked',
      code: 'AI_BOUNDARY_INVALID_MODE',
      error: new AiModeBoundaryError('AI_BOUNDARY_INVALID_MODE'),
      configuredMode,
    };
  }

  if (isDev && !isProd) {
    return {
      status: 'resolved',
      mode: 'local-demo',
      source: 'dev-default',
    };
  }

  return {
    status: 'blocked',
    code: 'AI_BOUNDARY_MODE_REQUIRED',
    error: new AiModeBoundaryError('AI_BOUNDARY_MODE_REQUIRED'),
    configuredMode,
  };
};

export const getAiExecutionPolicy = ({
  modeResolution,
  edgeEnabled,
}: {
  modeResolution: AiModeResolution;
  edgeEnabled: boolean;
}): AiExecutionPolicy => {
  if (modeResolution.status === 'blocked') {
    return {
      status: 'blocked',
      code: modeResolution.code,
      error: modeResolution.error,
      useEdge: false,
      requiresEdge: false,
      allowBrowserFallback: false,
      isDemoOrDevFallback: false,
      boundary: 'blocked',
    };
  }

  const { mode } = modeResolution;

  if (edgeEnabled) {
    return {
      status: 'allowed',
      mode,
      useEdge: true,
      requiresEdge: mode === 'pilot' || mode === 'production',
      allowBrowserFallback: false,
      isDemoOrDevFallback: false,
      boundary: 'edge',
    };
  }

  if (mode === 'pilot' || mode === 'production') {
    return {
      status: 'blocked',
      mode,
      code: 'AI_BOUNDARY_EDGE_REQUIRED',
      error: new AiModeBoundaryError('AI_BOUNDARY_EDGE_REQUIRED'),
      useEdge: false,
      requiresEdge: true,
      allowBrowserFallback: false,
      isDemoOrDevFallback: false,
      boundary: 'blocked',
    };
  }

  return {
    status: 'allowed',
    mode,
    useEdge: false,
    requiresEdge: false,
    allowBrowserFallback: true,
    isDemoOrDevFallback: true,
    fallbackLabel:
      mode === 'local-demo'
        ? 'local-demo synthetic/prepared fallback'
        : 'internal-dev transitional fallback',
    boundary: 'browser-demo-dev-fallback',
  };
};
