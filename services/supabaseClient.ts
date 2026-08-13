import { createClient } from '@supabase/supabase-js';
import {
  RuntimeBoundaryError,
  isValidServerConfiguration,
  resolveRuntimeAuthority,
  resolveRuntimeMode,
} from './runtimeMode';
import { shouldUseHostedSyntheticSandbox } from './hostedSandboxRoute';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const serverConfigured = isValidServerConfiguration(supabaseUrl, supabaseAnonKey);
const hostedSandboxEnabled = import.meta.env.VITE_AVALA_HOSTED_SANDBOX_ENABLED === 'true';

const runtimeModeResolution = resolveRuntimeMode({
  configuredMode: import.meta.env.VITE_AVALA_RUNTIME_MODE,
  isAutomatedTestContext:
    import.meta.env.MODE === 'test' &&
    import.meta.env.VITE_AVALA_AUTOMATED_TEST_CONTEXT === 'true',
});

// This inert client preserves the existing import surface. Every call site
// resolves the runtime data boundary before use; it is never authority.
export const supabase = createClient(
  serverConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  serverConfigured ? supabaseAnonKey : 'placeholder',
);

export const isSupabaseConfigured = () => serverConfigured;

export const getRuntimeModeResolution = () => runtimeModeResolution;

const getRuntimePathname = () =>
  typeof window === 'undefined' ? '' : window.location.pathname;

const getConfiguredRuntimeMode = () =>
  runtimeModeResolution.status === 'resolved' ? runtimeModeResolution.mode : undefined;

const isHostedSandboxRequest = () => shouldUseHostedSyntheticSandbox({
  enabled: hostedSandboxEnabled,
  runtimeMode: getConfiguredRuntimeMode(),
  pathname: getRuntimePathname(),
});

export const getRuntimeAuthority = () => {
  if (isHostedSandboxRequest()) {
    return {
      mode: 'local_demo' as const,
      dataAccess: 'local' as const,
      allowLocalAuthority: true,
      requiresServerAuthority: false,
    };
  }

  return resolveRuntimeAuthority({
    modeResolution: runtimeModeResolution,
    serverConfigured,
  });
};

export const getRuntimeDataAccess = () => getRuntimeAuthority().dataAccess;

export const isLocalRuntimeEnabled = () => {
  try {
    return getRuntimeAuthority().allowLocalAuthority;
  } catch {
    return false;
  }
};

export const getRuntimeBoundaryError = () => {
  if (isHostedSandboxRequest()) return null;
  if (runtimeModeResolution.status === 'blocked') return runtimeModeResolution.error;
  if (runtimeModeResolution.requiresServerAuthority && !serverConfigured) {
    return new RuntimeBoundaryError('RUNTIME_SERVER_CONFIGURATION_REQUIRED');
  }
  return null;
};
