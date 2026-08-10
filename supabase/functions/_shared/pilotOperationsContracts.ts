export const PILOT_OPERATIONS_LIVE_STOP = 'LIVE_ACTIVATION_NOT_AUTHORIZED' as const;

export type PilotOperation =
  | 'register_environment' | 'register_release_candidate' | 'validate_release_candidate'
  | 'approve_promotion' | 'simulate_promotion' | 'supersede_release_candidate'
  | 'bind_provider_reference' | 'bootstrap_tenant' | 'deprovision_tenant'
  | 'reactivate_tenant' | 'set_runtime_control' | 'record_recovery_drill';

export type PilotOperationsCommand = {
  operation: PilotOperation;
  organizationId: string;
  workspaceId: string;
  requestId: string;
  idempotencyKey: string;
  expectedAuthorizationVersion: number;
  /** Required optimistic-concurrency fence for every control-plane mutation. */
  expectedVersion: number;
  payload: Record<string, unknown>;
};

export type PilotOperationsErrorCode =
  | 'ACCESS_DENIED' | 'AUTHORIZATION_STALE' | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_CONFLICT' | 'VERSION_CONFLICT' | 'FEATURE_DISABLED'
  | 'TENANT_DEPROVISIONED' | 'ENVIRONMENT_BLOCKED' | 'MAINTENANCE_ACTIVE' | 'READ_ONLY_ACTIVE'
  | 'MAINTENANCE_MODE' | 'READ_ONLY_MODE' | 'EXPECTED_VERSION_REQUIRED'
  | 'EVIDENCE_STALE' | 'EVIDENCE_INVALID' | 'EVIDENCE_NOT_VERIFIED' | 'PREFLIGHT_BLOCKED'
  | 'PROVIDER_REFERENCE_STALE' | 'PROVIDER_REFERENCE_INVALID'
  | 'PERSISTENCE_UNAVAILABLE' | typeof PILOT_OPERATIONS_LIVE_STOP;

export type PilotOperationsProjection = {
  truthClassification: 'proven_disposable_or_ci_evidence' | 'configured_not_live_verified' | 'not_proven_hosted_live' | 'failed';
  liveActivationAuthorized: false;
  environment: { id: string; type: 'disposable_ci' | 'pilot_candidate'; lifecycle: string; version: number; maintenance: boolean; readOnly: boolean; disabledFeatures: string[] } | null;
  release: { id: string; gitSha: string; lifecycle: string; version: number } | null;
  provider: { configured: boolean; enabled: boolean; purpose: string } | null;
  blockers: string[];
  liveStopGates: string[];
};
