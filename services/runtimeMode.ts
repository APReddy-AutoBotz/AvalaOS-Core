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
  | 'RUNTIME_SERVER_CONFIGURATION_REQUIRED'
  | 'RUNTIME_CONTROLLED_HUMAN_BINDING_REQUIRED'
  | 'RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED'
  | 'RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED'
  | 'RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED';

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

export const isValidServerConfiguration = (url: unknown, anonKey: unknown): boolean => {
  return canonicalSupabasePublicOrigin(url) !== null && isSafePublicSupabaseCredential(anonKey);
};

export const PR_C_CONTROLLED_HUMAN_CONTRACT_VERSION = 'pr-c-controlled-human-attestation-1' as const;
export const PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app' as const;
export const PR_C_CONTROLLED_HUMAN_MIGRATION_TIP = '20260904120000' as const;

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DEPLOY_ID_PATTERN = /^[0-9a-f]{24}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface ControlledHumanBrowserBindingInput {
  enabled?: string | null;
  runtimeMode?: string | null;
  serverConfigured: boolean;
  releaseSha?: string | null;
  reviewHeadSha?: string | null;
  deployId?: string | null;
  deployOrigin?: string | null;
  exerciseDigest?: string | null;
  targetFingerprint?: string | null;
  publicTargetDigest?: string | null;
  locationOrigin?: string | null;
  pathname?: string | null;
}

export interface ControlledHumanBrowserBinding {
  releaseSha: string;
  reviewHeadSha: string;
  deployId: string;
  deployOrigin: typeof PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN;
  exerciseDigest: string;
  targetFingerprint: string;
  publicTargetDigest: string;
}

export type ControlledHumanBrowserBindingResolution =
  | { status: 'disabled' }
  | { status: 'ready'; binding: ControlledHumanBrowserBinding }
  | { status: 'blocked'; error: RuntimeBoundaryError };

export const resolveControlledHumanBrowserBinding = (
  input: ControlledHumanBrowserBindingInput,
): ControlledHumanBrowserBindingResolution => {
  if (input.enabled === undefined || input.enabled === null || input.enabled === '') return { status: 'disabled' };
  if (input.enabled !== 'authorized') {
    return {
      status: 'blocked',
      error: new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_BINDING_REQUIRED'),
    };
  }

  const values = [
    input.releaseSha,
    input.reviewHeadSha,
    input.deployId,
    input.deployOrigin,
    input.exerciseDigest,
    input.targetFingerprint,
    input.publicTargetDigest,
    input.locationOrigin,
    input.pathname,
  ];
  const exactStrings = values.every(value => typeof value === 'string' && value.length > 0 && value.trim() === value);
  const valid = exactStrings
    && input.runtimeMode === 'pilot'
    && input.serverConfigured
    && SHA_PATTERN.test(input.releaseSha ?? '')
    && input.reviewHeadSha === input.releaseSha
    && DEPLOY_ID_PATTERN.test(input.deployId ?? '')
    && input.deployOrigin === PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN
    && input.locationOrigin === PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN
    && input.pathname === '/sign-in'
    && DIGEST_PATTERN.test(input.exerciseDigest ?? '')
    && DIGEST_PATTERN.test(input.targetFingerprint ?? '')
    && DIGEST_PATTERN.test(input.publicTargetDigest ?? '');

  if (!valid) {
    return {
      status: 'blocked',
      error: new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_BINDING_REQUIRED'),
    };
  }

  return {
    status: 'ready',
    binding: {
      releaseSha: input.releaseSha!,
      reviewHeadSha: input.reviewHeadSha!,
      deployId: input.deployId!,
      deployOrigin: PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN,
      exerciseDigest: input.exerciseDigest!,
      targetFingerprint: input.targetFingerprint!,
      publicTargetDigest: input.publicTargetDigest!,
    },
  };
};

export interface ControlledHumanBackendAttestation {
  attested: true;
  contractVersion: typeof PR_C_CONTROLLED_HUMAN_CONTRACT_VERSION;
  environmentClass: 'hosted_nonproduction_pilot';
  prNumber: 264;
  releaseSha: string;
  reviewHeadSha: string;
  deployId: string;
  deployOrigin: typeof PR_C_CONTROLLED_HUMAN_PREVIEW_ORIGIN;
  exerciseDigest: string;
  targetFingerprint: string;
  publicTargetDigest: string;
  personaManifestDigest: string;
  fixtureManifestDigest: string;
  migrationTip: typeof PR_C_CONTROLLED_HUMAN_MIGRATION_TIP;
  productionAuthorized: false;
  customerDataAuthorized: false;
  realProviderCallsAuthorized: false;
}

const CONTROLLED_HUMAN_ATTESTATION_KEYS = [
  'attested',
  'contractVersion',
  'environmentClass',
  'prNumber',
  'releaseSha',
  'reviewHeadSha',
  'deployId',
  'deployOrigin',
  'exerciseDigest',
  'targetFingerprint',
  'publicTargetDigest',
  'personaManifestDigest',
  'fixtureManifestDigest',
  'migrationTip',
  'productionAuthorized',
  'customerDataAuthorized',
  'realProviderCallsAuthorized',
] as const;

export const validateControlledHumanBackendAttestation = (
  value: unknown,
  binding: ControlledHumanBrowserBinding,
): ControlledHumanBackendAttestation => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const exactKeys = record
    && Object.keys(record).length === CONTROLLED_HUMAN_ATTESTATION_KEYS.length
    && CONTROLLED_HUMAN_ATTESTATION_KEYS.every(key => Object.hasOwn(record, key));
  const valid = exactKeys
    && record!.attested === true
    && record!.contractVersion === PR_C_CONTROLLED_HUMAN_CONTRACT_VERSION
    && record!.environmentClass === 'hosted_nonproduction_pilot'
    && record!.prNumber === 264
    && record!.releaseSha === binding.releaseSha
    && record!.reviewHeadSha === binding.reviewHeadSha
    && record!.deployId === binding.deployId
    && record!.deployOrigin === binding.deployOrigin
    && record!.exerciseDigest === binding.exerciseDigest
    && record!.targetFingerprint === binding.targetFingerprint
    && record!.publicTargetDigest === binding.publicTargetDigest
    && DIGEST_PATTERN.test(String(record!.personaManifestDigest ?? ''))
    && DIGEST_PATTERN.test(String(record!.fixtureManifestDigest ?? ''))
    && record!.migrationTip === PR_C_CONTROLLED_HUMAN_MIGRATION_TIP
    && record!.productionAuthorized === false
    && record!.customerDataAuthorized === false
    && record!.realProviderCallsAuthorized === false;

  if (!valid) {
    throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
  }
  return record as unknown as ControlledHumanBackendAttestation;
};

export type RuntimeAuthorityResolution = {
  mode: RuntimeMode;
  dataAccess: RuntimeDataAccess;
  allowLocalAuthority: boolean;
  requiresServerAuthority: boolean;
};

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

export const resolveRuntimeAuthority = ({
  modeResolution,
  serverConfigured,
}: {
  modeResolution: RuntimeModeResolution;
  serverConfigured: boolean;
}): RuntimeAuthorityResolution => {
  const dataAccess = resolveRuntimeDataAccess({ modeResolution, serverConfigured });
  if (modeResolution.status === 'blocked') throw modeResolution.error;
  return {
    mode: modeResolution.mode,
    dataAccess,
    allowLocalAuthority: dataAccess === 'local',
    requiresServerAuthority: dataAccess === 'server',
  };
};
import { canonicalSupabasePublicOrigin, isSafePublicSupabaseCredential } from './supabasePublicCredential.mjs';
