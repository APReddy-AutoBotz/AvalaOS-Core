import { EnterpriseSessionState, TenantContextProjection } from '../types';
import type { EnterpriseBoundaryCode } from './enterpriseAssessContract';

export type EnterpriseMutationCapability =
  | 'assess.create'
  | 'assess.response.write'
  | 'assess.finalize'
  | 'govern.resolve'
  | 'studio.handoff.create';

export interface EnterpriseBoundaryPresentation {
  state: EnterpriseSessionState;
  message: string;
  clearAuthority: boolean;
}

const PRESENTATIONS: Record<EnterpriseBoundaryCode, EnterpriseBoundaryPresentation> = {
  AUTHENTICATION_REQUIRED: {
    state: 'expired_session',
    message: 'Your session expired. Sign in again to continue.',
    clearAuthority: true,
  },
  AUTHORITY_STALE: {
    state: 'stale',
    message: 'Your access changed. Refresh the server-issued workspace context before continuing.',
    clearAuthority: false,
  },
  RESOURCE_NOT_AVAILABLE: {
    state: 'revoked',
    message: 'The selected resource is no longer available. Return to the workspace and select an available resource.',
    clearAuthority: true,
  },
  PERMISSION_DENIED: {
    state: 'ready',
    message: 'This action is blocked because your current workspace role does not grant the required capability.',
    clearAuthority: false,
  },
  VERSION_CONFLICT: {
    state: 'ready',
    message: 'This assessment changed on the server. Reload it before retrying the action.',
    clearAuthority: false,
  },
  IDEMPOTENCY_CONFLICT: {
    state: 'ready',
    message: 'This request key was already used for different content. Reload before retrying.',
    clearAuthority: false,
  },
  FEATURE_DISABLED: {
    state: 'read_only',
    message: 'Avala Assess V2 is disabled. Existing V2 decisions remain available in read-only mode; changes are blocked.',
    clearAuthority: false,
  },
  READ_ONLY: {
    state: 'read_only',
    message: 'Avala Assess V2 is in read-only maintenance. Existing V2 decisions remain available; changes are blocked.',
    clearAuthority: false,
  },
  COMMAND_UNAVAILABLE: {
    state: 'error',
    message: 'The command could not be completed. No success was recorded.',
    clearAuthority: false,
  },
  OFFLINE: {
    state: 'offline',
    message: 'AvalaOS is offline. Changes are blocked and will not be replayed automatically.',
    clearAuthority: false,
  },
};

export const presentEnterpriseBoundary = (
  code: EnterpriseBoundaryCode,
): EnterpriseBoundaryPresentation => PRESENTATIONS[code];

export const enterpriseActionPolicy = ({
  sessionState,
  tenantContext,
  capability,
  localAuthority = false,
}: {
  sessionState: EnterpriseSessionState;
  tenantContext: TenantContextProjection | null;
  capability: EnterpriseMutationCapability;
  localAuthority?: boolean;
}): { enabled: boolean; explanation: string | null } => {
  if (localAuthority) return { enabled: true, explanation: null };
  if (sessionState === 'read_only') {
    return { enabled: false, explanation: 'Read-only maintenance blocks all assessment changes.' };
  }
  if (sessionState !== 'ready' || !tenantContext) {
    return { enabled: false, explanation: 'A fresh server-issued workspace context is required.' };
  }
  if (!tenantContext.capabilities.includes(capability)) {
    return { enabled: false, explanation: `Your workspace role does not grant ${capability}.` };
  }
  return { enabled: true, explanation: null };
};
