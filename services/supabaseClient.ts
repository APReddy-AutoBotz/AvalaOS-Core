import { createClient } from '@supabase/supabase-js';
import {
  ControlledHumanBackendAttestation,
  RuntimeBoundaryError,
  isValidServerConfiguration,
  resolveControlledHumanBrowserBinding,
  resolveRuntimeAuthority,
  resolveRuntimeMode,
  validateControlledHumanBackendAttestation,
} from './runtimeMode';
import { shouldUseHostedSyntheticSandbox } from './hostedSandboxRoute';
import { isSafePublicSupabaseCredential } from './supabasePublicCredential.mjs';

declare const __AVALA_SYNTHETIC_BROWSER_TEST_BUILD__: boolean;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const syntheticBrowserServerConfigured = typeof __AVALA_SYNTHETIC_BROWSER_TEST_BUILD__ !== 'undefined'
  && __AVALA_SYNTHETIC_BROWSER_TEST_BUILD__ === true
  && supabaseUrl === 'https://127.0.0.1:59999'
  && isSafePublicSupabaseCredential(supabaseAnonKey);
const serverConfigured = isValidServerConfiguration(supabaseUrl, supabaseAnonKey)
  || syntheticBrowserServerConfigured;
const hostedSandboxEnabled = import.meta.env.VITE_AVALA_HOSTED_SANDBOX_ENABLED === 'true';
const controlledHumanEnabled = import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_ENABLED;
const controlledHumanBoundaryRequested = Boolean(controlledHumanEnabled);

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
  controlledHumanBoundaryRequested
    ? { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
    : undefined,
);

export const isSupabaseConfigured = () => serverConfigured;

export const getRuntimeModeResolution = () => runtimeModeResolution;

const getRuntimePathname = () =>
  typeof window === 'undefined' ? '' : window.location.pathname;

const getConfiguredRuntimeMode = () =>
  runtimeModeResolution.status === 'resolved' ? runtimeModeResolution.mode : undefined;

export const isControlledHumanRuntimeEnabled = () => controlledHumanEnabled === 'authorized';

export const getControlledHumanBrowserBinding = () => resolveControlledHumanBrowserBinding({
  enabled: controlledHumanEnabled,
  runtimeMode: getConfiguredRuntimeMode(),
  serverConfigured,
  releaseSha: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_RELEASE_SHA,
  reviewHeadSha: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA,
  deployId: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ID,
  deployOrigin: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN,
  exerciseDigest: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST,
  targetFingerprint: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT,
  publicTargetDigest: import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST,
  locationOrigin: typeof window === 'undefined' ? null : window.location.origin,
  pathname: getRuntimePathname(),
});

let controlledHumanAttestationKey: string | null = null;
let controlledHumanAttestationPromise: Promise<ControlledHumanBackendAttestation> | null = null;

export const requireControlledHumanBackendAttestation = async () => {
  const resolution = getControlledHumanBrowserBinding();
  if (resolution.status === 'disabled') return null;
  if (resolution.status === 'blocked') throw resolution.error;

  const { binding } = resolution;
  const cacheKey = [
    binding.releaseSha,
    binding.reviewHeadSha,
    binding.deployId,
    binding.deployOrigin,
    binding.exerciseDigest,
    binding.targetFingerprint,
    binding.publicTargetDigest,
  ].join(':');
  if (controlledHumanAttestationKey !== cacheKey) {
    controlledHumanAttestationKey = cacheKey;
    controlledHumanAttestationPromise = null;
  }
  if (!controlledHumanAttestationPromise) {
    controlledHumanAttestationPromise = (async () => {
      const { data, error } = await supabase.rpc('pr_c_controlled_human_public_attestation', {
        p_release_sha: binding.releaseSha,
        p_review_head_sha: binding.reviewHeadSha,
        p_deploy_id: binding.deployId,
        p_deploy_origin: binding.deployOrigin,
        p_exercise_digest: binding.exerciseDigest,
        p_public_target_digest: binding.publicTargetDigest,
      });
      if (error) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
      return validateControlledHumanBackendAttestation(data, binding);
    })();
  }
  return controlledHumanAttestationPromise;
};

export const prepareControlledHumanOfflineLineage = async (inputBundleId: string, inputBundleVersion: number) => {
  const resolution=getControlledHumanBrowserBinding();
  if(resolution.status==='disabled') return null;
  if(resolution.status==='blocked'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(inputBundleId)
    ||!Number.isSafeInteger(inputBundleVersion)||inputBundleVersion<1) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_BINDING_REQUIRED');
  await requireControlledHumanBackendAttestation();
  const {data,error}=await supabase.rpc('pr_c_controlled_human_prepare_offline_lineage',{
    p_exercise_digest:resolution.binding.exerciseDigest,p_input_bundle_id:inputBundleId,p_expected_bundle_version:inputBundleVersion,
  });
  if(error||!data||typeof data!=='object'||Array.isArray(data)||(data as Record<string,unknown>).status!=='prepared')
    throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  return data;
};

export interface ControlledHumanStepBindingOption {
  checkpointId: string;
  stepId: string;
  action: string;
  observationKind: 'server_event' | 'negative_attempt';
  state: 'unanchored' | 'anchored' | 'completed';
  safeAnchor: ControlledHumanSafeStepAnchor | null;
  safeBinding: ControlledHumanSafeStepBinding | null;
}

export interface ControlledHumanSafeStepAnchor {
  contractVersion: 'pr-c-controlled-human-step-anchor-1';
  stepId: string;
  action: string;
  targetFamily: string;
  targetDigest: string;
  expectedVersion: number;
  transitionKind: 'same' | 'increment_one' | 'create_one' | 'create_zero' | 'replay_existing';
  selectorDigest: string;
  intentDigest: string;
  requestDigest: string;
  challengeToken: string;
  anchoredAt: string;
}

export interface ControlledHumanSafeStepBinding {
  contractVersion: 'pr-c-controlled-human-step-binding-3';
  stepId: string;
  action: string;
  result: 'succeeded' | 'denied';
  resourceFamily: string;
  resourceDigest: string;
  expectedVersion: number;
  observedVersion: number;
  requestDigest: string;
  receiptDigest: string;
  auditDigest: string;
  intentDigest: string;
  denialCodeDigest: string;
  bindingToken: string;
  anchorToken: string;
  causalParentBindingToken: string;
  causalParentResourceDigest: string;
  causalLineageDigest: string;
  issuedAt: string;
}

export interface ControlledHumanCommandAnchor {
  safeAnchor: ControlledHumanSafeStepAnchor;
  requestId: string;
  businessIdempotencyKey?: string;
}

export interface ControlledHumanCompletedProof {
  safeAnchor: ControlledHumanSafeStepAnchor;
  safeBinding: ControlledHumanSafeStepBinding;
}

const safeLabel = /^[A-Za-z0-9._:/-]{1,200}$/;
const safeDigest = /^sha256:[0-9a-f]{64}$/;

const exactRecord = (value: unknown, keys: readonly string[]): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key)) ? record : null;
};

export const listControlledHumanStepBindings = async (): Promise<ControlledHumanStepBindingOption[]> => {
  const attestation = await requireControlledHumanBackendAttestation();
  if (!attestation) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
  const { data, error } = await supabase.rpc('pr_c_controlled_human_list_step_bindings', { p_exercise_digest: attestation.exerciseDigest });
  if (error || !Array.isArray(data)) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
  return data.map(value => {
    const record = exactRecord(value, ['checkpointId', 'stepId', 'action', 'observationKind', 'state', 'safeAnchor', 'safeBinding']);
    if (!record || !/^CH-(?:0[1-9]|1[0-4])$/.test(String(record.checkpointId)) || !safeLabel.test(String(record.stepId))
      || !safeLabel.test(String(record.action)) || !['server_event', 'negative_attempt'].includes(String(record.observationKind))
      || !['unanchored', 'anchored', 'completed'].includes(String(record.state))
      || (record.state === 'unanchored' && (record.safeAnchor !== null || record.safeBinding !== null))
      || (record.state === 'anchored' && (record.safeAnchor === null || record.safeBinding !== null))
      || (record.state === 'completed' && (record.safeAnchor === null || record.safeBinding === null))) {
      throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
    }
    return record as unknown as ControlledHumanStepBindingOption;
  });
};

let armedControlledHumanStep: ControlledHumanStepBindingOption | null = null;
let activeControlledHumanAnchor: ControlledHumanCommandAnchor | null = null;
let lastCompletedControlledHumanProof: ControlledHumanCompletedProof | null = null;

export const armControlledHumanStep = (option: ControlledHumanStepBindingOption) => {
  if (option.state !== 'unanchored') throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED');
  armedControlledHumanStep = option;
  activeControlledHumanAnchor = null;
};

export const getControlledHumanEvidenceState = () => ({
  armedStep: armedControlledHumanStep,
  safeAnchor: activeControlledHumanAnchor?.safeAnchor ?? null,
});

export const getLastCompletedControlledHumanProof = (): ControlledHumanCompletedProof | null => lastCompletedControlledHumanProof;

const validateSafeAnchor = (value: unknown, option: ControlledHumanStepBindingOption): ControlledHumanSafeStepAnchor => {
  const keys = ['contractVersion', 'stepId', 'action', 'targetFamily', 'targetDigest', 'expectedVersion', 'transitionKind', 'selectorDigest', 'intentDigest', 'requestDigest', 'challengeToken', 'anchoredAt'];
  const record = exactRecord(value, keys);
  if (!record || record.contractVersion !== 'pr-c-controlled-human-step-anchor-1' || record.stepId !== option.stepId || record.action !== option.action
    || !safeLabel.test(String(record.targetFamily)) || !['same', 'increment_one', 'create_one', 'create_zero', 'replay_existing'].includes(String(record.transitionKind))
    || !['targetDigest', 'selectorDigest', 'intentDigest', 'requestDigest', 'challengeToken'].every(key => safeDigest.test(String(record[key])))
    || typeof record.expectedVersion !== 'number' || !Number.isSafeInteger(record.expectedVersion) || record.expectedVersion < 0
    || Number.isNaN(Date.parse(String(record.anchoredAt)))) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED');
  return record as unknown as ControlledHumanSafeStepAnchor;
};

export const beginControlledHumanCommand = async (input: {
  action: string;
  targetFamily: string;
  targetId: string;
  expectedVersion: number;
  selectorBindings: Record<string, unknown>;
}): Promise<ControlledHumanCommandAnchor | null> => {
  if (!isControlledHumanRuntimeEnabled()) return null;
  const attestation = await requireControlledHumanBackendAttestation();
  const option = armedControlledHumanStep;
  if (!attestation || !option || option.state !== 'unanchored' || option.action !== input.action
    || !safeLabel.test(input.targetFamily) || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED');
  }
  const { data, error } = await supabase.rpc('pr_c_controlled_human_anchor_step', {
    p_exercise_digest: attestation.exerciseDigest,
    p_checkpoint_id: option.checkpointId,
    p_step_id: option.stepId,
    p_target_family: input.targetFamily,
    p_target_id: input.targetId,
    p_expected_version: input.expectedVersion,
    p_selector_bindings: input.selectorBindings,
  });
  const result = error ? null : exactRecord(data, ['safeAnchor', 'execution']);
  const executionValue = result && result.execution && typeof result.execution === 'object' && !Array.isArray(result.execution)
    ? result.execution as Record<string, unknown> : null;
  const execution = executionValue && Object.keys(executionValue).every(key => ['requestId', 'businessIdempotencyKey'].includes(key))
    && Object.hasOwn(executionValue, 'requestId') ? executionValue : null;
  if (!result || !execution || typeof execution.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(execution.requestId)) {
    throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED');
  }
  if (execution.businessIdempotencyKey !== undefined
    && (typeof execution.businessIdempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(execution.businessIdempotencyKey))) {
    throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_PREANCHOR_REQUIRED');
  }
  const anchor = { safeAnchor: validateSafeAnchor(result.safeAnchor, option), requestId: execution.requestId,
    ...(typeof execution.businessIdempotencyKey === 'string' ? { businessIdempotencyKey: execution.businessIdempotencyKey } : {}) };
  activeControlledHumanAnchor = anchor;
  return anchor;
};

const validateSafeBinding = (value: unknown, anchor: ControlledHumanCommandAnchor): ControlledHumanSafeStepBinding => {
  const keys = ['contractVersion', 'stepId', 'action', 'result', 'resourceFamily', 'resourceDigest', 'expectedVersion', 'observedVersion', 'requestDigest', 'receiptDigest', 'auditDigest', 'intentDigest', 'denialCodeDigest', 'bindingToken', 'anchorToken', 'causalParentBindingToken', 'causalParentResourceDigest', 'causalLineageDigest', 'issuedAt'];
  const record = exactRecord(value, keys);
  const valid = record && record.contractVersion === 'pr-c-controlled-human-step-binding-3' && record.stepId === anchor.safeAnchor.stepId
    && record.action === anchor.safeAnchor.action && ['succeeded', 'denied'].includes(String(record.result)) && safeLabel.test(String(record.resourceFamily))
    && ['resourceDigest', 'requestDigest', 'receiptDigest', 'auditDigest', 'intentDigest', 'denialCodeDigest', 'bindingToken', 'anchorToken', 'causalParentBindingToken', 'causalParentResourceDigest', 'causalLineageDigest'].every(key => safeDigest.test(String(record[key])))
    && record.anchorToken === anchor.safeAnchor.challengeToken && record.requestDigest === anchor.safeAnchor.requestDigest
    && record.intentDigest === anchor.safeAnchor.intentDigest
    && record.expectedVersion === anchor.safeAnchor.expectedVersion && typeof record.observedVersion === 'number'
    && Number.isSafeInteger(record.observedVersion) && Number(record.observedVersion) >= 0 && !Number.isNaN(Date.parse(String(record.issuedAt)));
  if (!valid) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  return record as unknown as ControlledHumanSafeStepBinding;
};

export const completeControlledHumanCommand = async (anchor: ControlledHumanCommandAnchor): Promise<ControlledHumanSafeStepBinding> => {
  const attestation = await requireControlledHumanBackendAttestation();
  if (!attestation) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_ATTESTATION_REQUIRED');
  if (activeControlledHumanAnchor?.safeAnchor.challengeToken !== anchor.safeAnchor.challengeToken) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  const { data, error } = await supabase.rpc('pr_c_controlled_human_complete_step', {
    p_exercise_digest: attestation.exerciseDigest,
    p_challenge_token: anchor.safeAnchor.challengeToken,
  });
  if (error) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  const binding = validateSafeBinding(data, anchor);
  lastCompletedControlledHumanProof = { safeAnchor: anchor.safeAnchor, safeBinding: binding };
  armedControlledHumanStep = null; activeControlledHumanAnchor = null;
  return binding;
};

export const executeControlledHumanDeniedCommand = async (anchor: ControlledHumanCommandAnchor): Promise<ControlledHumanSafeStepBinding> => {
  const attestation = await requireControlledHumanBackendAttestation();
  if (!attestation || armedControlledHumanStep?.observationKind !== 'negative_attempt'
    || activeControlledHumanAnchor?.safeAnchor.challengeToken !== anchor.safeAnchor.challengeToken) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  const { data, error } = await supabase.rpc('pr_c_controlled_human_execute_denied_step', {
    p_exercise_digest: attestation.exerciseDigest,
    p_challenge_token: anchor.safeAnchor.challengeToken,
  });
  if (error) throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  const binding = validateSafeBinding(data, anchor);
  if (binding.result !== 'denied') throw new RuntimeBoundaryError('RUNTIME_CONTROLLED_HUMAN_COMPLETION_REJECTED');
  lastCompletedControlledHumanProof = { safeAnchor: anchor.safeAnchor, safeBinding: binding };
  armedControlledHumanStep = null; activeControlledHumanAnchor = null;
  return binding;
};

const isHostedSandboxRequest = () => shouldUseHostedSyntheticSandbox({
  enabled: hostedSandboxEnabled,
  runtimeMode: getConfiguredRuntimeMode(),
  pathname: getRuntimePathname(),
});

export const getRuntimeAuthority = () => {
  const controlledHumanBinding = getControlledHumanBrowserBinding();
  if (controlledHumanBinding.status === 'blocked') throw controlledHumanBinding.error;

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
  const controlledHumanBinding = getControlledHumanBrowserBinding();
  if (controlledHumanBinding.status === 'blocked') return controlledHumanBinding.error;
  if (isHostedSandboxRequest()) return null;
  if (runtimeModeResolution.status === 'blocked') return runtimeModeResolution.error;
  if (runtimeModeResolution.requiresServerAuthority && !serverConfigured) {
    return new RuntimeBoundaryError('RUNTIME_SERVER_CONFIGURATION_REQUIRED');
  }
  return null;
};
