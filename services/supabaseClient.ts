import { createClient } from '@supabase/supabase-js';
import {
  RuntimeBoundaryError,
  resolveRuntimeDataAccess,
  resolveRuntimeMode,
} from './runtimeMode';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const serverConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const runtimeModeResolution = resolveRuntimeMode({
  configuredMode: import.meta.env.VITE_AVALA_RUNTIME_MODE,
  isAutomatedTestContext:
    import.meta.env.MODE === 'test' &&
    import.meta.env.VITE_AVALA_AUTOMATED_TEST_CONTEXT === 'true',
});

// This inert client preserves the existing import surface. Every call site
// resolves the runtime data boundary before use; it is never authority.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
);

export const isSupabaseConfigured = () => serverConfigured;

export const getRuntimeModeResolution = () => runtimeModeResolution;

export const getRuntimeDataAccess = () => resolveRuntimeDataAccess({
  modeResolution: runtimeModeResolution,
  serverConfigured,
});

export const isLocalRuntimeEnabled = () => (
  runtimeModeResolution.status === 'resolved' &&
  runtimeModeResolution.allowLocalAuthority
);

export const getRuntimeBoundaryError = () => {
  if (runtimeModeResolution.status === 'blocked') return runtimeModeResolution.error;
  if (runtimeModeResolution.requiresServerAuthority && !serverConfigured) {
    return new RuntimeBoundaryError('RUNTIME_SERVER_CONFIGURATION_REQUIRED');
  }
  return null;
};
