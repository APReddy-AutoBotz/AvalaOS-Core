import {
  RUNTIME_BOUNDARY_USER_MESSAGE,
  RuntimeBoundaryError,
  RuntimeMode,
  resolveRuntimeMode,
} from './runtimeMode';

export type AiRuntimeMode = RuntimeMode;

export type AiModeBoundaryErrorCode =
  | 'AI_BOUNDARY_INVALID_MODE'
  | 'AI_BOUNDARY_MODE_REQUIRED'
  | 'AI_BOUNDARY_AUTOMATED_TEST_CONTEXT_REQUIRED'
  | 'AI_BOUNDARY_EDGE_REQUIRED';

export const AI_MODE_BOUNDARY_USER_MESSAGE = RUNTIME_BOUNDARY_USER_MESSAGE;

export class AiModeBoundaryError extends Error {
  code: AiModeBoundaryErrorCode;

  constructor(code: AiModeBoundaryErrorCode) {
    super(AI_MODE_BOUNDARY_USER_MESSAGE);
    this.name = 'AiModeBoundaryError';
    this.code = code;
  }
}

export type AiModeResolution =
  | { status: 'resolved'; mode: AiRuntimeMode; source: 'explicit' }
  | {
      status: 'blocked';
      code: Exclude<AiModeBoundaryErrorCode, 'AI_BOUNDARY_EDGE_REQUIRED'>;
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
      isDemoOrTestFallback: false;
      boundary: 'edge';
    }
  | {
      status: 'allowed';
      mode: 'local_demo' | 'automated_test';
      useEdge: false;
      requiresEdge: false;
      allowBrowserFallback: true;
      isDemoOrTestFallback: true;
      fallbackLabel: 'local_demo synthetic fallback' | 'automated_test controlled fallback';
      boundary: 'browser-demo-test-fallback';
    }
  | {
      status: 'blocked';
      mode?: AiRuntimeMode;
      code: AiModeBoundaryErrorCode;
      error: AiModeBoundaryError | RuntimeBoundaryError;
      useEdge: false;
      requiresEdge: boolean;
      allowBrowserFallback: false;
      isDemoOrTestFallback: false;
      boundary: 'blocked';
    };

export const resolveAiMode = ({
  configuredMode,
  isAutomatedTestContext,
}: {
  configuredMode?: string | null;
  isAutomatedTestContext: boolean;
}): AiModeResolution => {
  const resolution = resolveRuntimeMode({ configuredMode, isAutomatedTestContext });
  if (resolution.status === 'resolved') {
    return { status: 'resolved', mode: resolution.mode, source: 'explicit' };
  }

  const code = resolution.code === 'RUNTIME_MODE_INVALID'
    ? 'AI_BOUNDARY_INVALID_MODE'
    : resolution.code === 'RUNTIME_AUTOMATED_TEST_CONTEXT_REQUIRED'
      ? 'AI_BOUNDARY_AUTOMATED_TEST_CONTEXT_REQUIRED'
      : 'AI_BOUNDARY_MODE_REQUIRED';
  return {
    status: 'blocked',
    code,
    error: new AiModeBoundaryError(code),
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
      isDemoOrTestFallback: false,
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
      isDemoOrTestFallback: false,
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
      isDemoOrTestFallback: false,
      boundary: 'blocked',
    };
  }

  return {
    status: 'allowed',
    mode,
    useEdge: false,
    requiresEdge: false,
    allowBrowserFallback: true,
    isDemoOrTestFallback: true,
    fallbackLabel: mode === 'local_demo'
      ? 'local_demo synthetic fallback'
      : 'automated_test controlled fallback',
    boundary: 'browser-demo-test-fallback',
  };
};
