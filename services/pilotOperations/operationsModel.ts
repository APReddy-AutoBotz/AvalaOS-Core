export type PilotOperationsTruth =
  | 'proven_disposable_or_ci_evidence'
  | 'configured_not_live_verified'
  | 'not_proven_hosted_live'
  | 'failed';

export type PilotOperationsProjection = {
  /** Opaque server-projected identifiers used only to target authoritative commands. */
  authority?: { environmentId: string; releaseId: string; releaseVersion: number };
  release: { candidateLabel: string; commitSha: string; lifecycle: string };
  environment: { label: string; type: 'disposable_ci' | 'pilot_candidate'; lifecycle: string; version: number };
  controls: { maintenance: boolean; readOnly: boolean; disabledFeatures: string[] };
  health: { schemaCompatible: boolean; queueState: 'healthy' | 'degraded' | 'blocked'; reconciliationState: 'healthy' | 'degraded' | 'blocked' };
  provider: { configured: boolean; enabled: boolean };
  recovery: { backupState: 'not_run' | 'passed' | 'failed'; restoreState: 'not_run' | 'passed' | 'failed'; evidenceDigest?: string };
  promotion: { eligible: boolean; blockers: string[]; rollbackEligible: boolean; rollbackTargetLabel?: string };
  truth: PilotOperationsTruth;
  liveActivationAuthorized: false;
};

export type DryRunPromotionResult = {
  outcome: 'promoted_non_live' | 'blocked';
  code: 'NON_LIVE_DRY_RUN_COMPLETE' | 'LIVE_ACTIVATION_NOT_AUTHORIZED' | 'PROMOTION_BLOCKED';
  mutationDelta: 0;
  externalCallCount: 0;
  orderedChecks: string[];
};

const sha = /^[0-9a-f]{40}$/;
const digest = /^sha256:[0-9a-f]{64}$/;
const safeLabel = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,79}$/;
const safeState = /^[a-z][a-z0-9_]{0,63}$/;
const safeFeature = /^[a-z][a-z0-9_-]{0,63}$/;
const safeBlocker = /^(?:[a-z][a-z0-9_]{0,63}|[A-Z][A-Z0-9_]{0,63})$/;

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return value as Record<string, unknown>;
};

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) {
    throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  }
};

const text = (value: unknown, pattern: RegExp) => {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return value;
};

const boolean = (value: unknown) => {
  if (typeof value !== 'boolean') throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return value;
};

const enumValue = <T extends string>(value: unknown, allowed: readonly T[]): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return value as T;
};

/** Strict decoder for the deliberately sanitized operator read model. Unknown fields fail closed. */
export const decodePilotOperationsProjection = (input: unknown): PilotOperationsProjection => {
  const root = object(input);
  if (Object.keys(root).some(key => !['authority','release','environment','controls','health','provider','recovery','promotion','truth','liveActivationAuthorized'].includes(key)) || !['release','environment','controls','health','provider','recovery','promotion','truth','liveActivationAuthorized'].every(key=>key in root)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  const release = object(root.release);
  const environment = object(root.environment);
  const controls = object(root.controls);
  const health = object(root.health);
  const provider = object(root.provider);
  const recovery = object(root.recovery);
  const promotion = object(root.promotion);
  exactKeys(release, ['candidateLabel', 'commitSha', 'lifecycle']);
  exactKeys(environment, ['label', 'type', 'lifecycle', 'version']);
  exactKeys(controls, ['maintenance', 'readOnly', 'disabledFeatures']);
  exactKeys(health, ['schemaCompatible', 'queueState', 'reconciliationState']);
  exactKeys(provider, ['configured', 'enabled']);
  if (Object.keys(recovery).some(key => !['backupState', 'restoreState', 'evidenceDigest'].includes(key)) || !('backupState' in recovery) || !('restoreState' in recovery)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  if (Object.keys(promotion).some(key => !['eligible', 'blockers', 'rollbackEligible', 'rollbackTargetLabel'].includes(key)) || !('eligible' in promotion) || !('blockers' in promotion) || !('rollbackEligible' in promotion)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  if (root.liveActivationAuthorized !== false) throw new Error('LIVE_ACTIVATION_NOT_AUTHORIZED');
  if (!Array.isArray(controls.disabledFeatures) || !Array.isArray(promotion.blockers)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  const disabledFeatures = controls.disabledFeatures.map(item => text(item, safeFeature));
  const blockers = promotion.blockers.map(item => text(item, safeBlocker));
  if (new Set(disabledFeatures).size !== disabledFeatures.length || new Set(blockers).size !== blockers.length) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  const evidenceDigest = recovery.evidenceDigest === undefined ? undefined : text(recovery.evidenceDigest, digest);
  const rollbackTargetLabel = promotion.rollbackTargetLabel === undefined ? undefined : text(promotion.rollbackTargetLabel, safeLabel);
  const decoded: PilotOperationsProjection = {
    release: { candidateLabel: text(release.candidateLabel, safeLabel), commitSha: text(release.commitSha, sha), lifecycle: text(release.lifecycle, safeState) },
    environment: {
      label: text(environment.label, safeLabel),
      type: enumValue(environment.type, ['disposable_ci', 'pilot_candidate'] as const),
      lifecycle: text(environment.lifecycle, safeState),
      version: Number.isSafeInteger(environment.version) && Number(environment.version) > 0 ? Number(environment.version) : (() => { throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE'); })(),
    },
    controls: { maintenance: boolean(controls.maintenance), readOnly: boolean(controls.readOnly), disabledFeatures: [...disabledFeatures].sort() },
    health: {
      schemaCompatible: boolean(health.schemaCompatible),
      queueState: enumValue(health.queueState, ['healthy', 'degraded', 'blocked'] as const),
      reconciliationState: enumValue(health.reconciliationState, ['healthy', 'degraded', 'blocked'] as const),
    },
    provider: { configured: boolean(provider.configured), enabled: boolean(provider.enabled) },
    recovery: {
      backupState: enumValue(recovery.backupState, ['not_run', 'passed', 'failed'] as const),
      restoreState: enumValue(recovery.restoreState, ['not_run', 'passed', 'failed'] as const),
      ...(evidenceDigest ? { evidenceDigest } : {}),
    },
    promotion: { eligible: boolean(promotion.eligible), blockers: [...blockers].sort(), rollbackEligible: boolean(promotion.rollbackEligible), ...(rollbackTargetLabel ? { rollbackTargetLabel } : {}) },
    truth: enumValue(root.truth, ['proven_disposable_or_ci_evidence', 'configured_not_live_verified', 'not_proven_hosted_live', 'failed'] as const),
    liveActivationAuthorized: false,
  };
  if(root.authority!==undefined){const authority=object(root.authority);exactKeys(authority,['environmentId','releaseId','releaseVersion']);decoded.authority={environmentId:text(authority.environmentId,/^[0-9a-f-]{36}$/i),releaseId:text(authority.releaseId,/^[0-9a-f-]{36}$/i),releaseVersion:Number.isSafeInteger(authority.releaseVersion)&&Number(authority.releaseVersion)>0?Number(authority.releaseVersion):(()=>{throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE')})()}}
  if (decoded.provider.enabled && !decoded.provider.configured) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  if (decoded.promotion.eligible !== (decoded.promotion.blockers.length === 0)) throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return decoded;
};

/** Proves gate ordering without exposing a deploy adapter or performing any mutation. */
export const simulateNonLivePromotion = (projection: PilotOperationsProjection, requestedMode: 'dry_run' | 'live'): DryRunPromotionResult => {
  const orderedChecks = ['fresh_operator_authority', 'exact_candidate_environment_binding', 'schema_compatibility', 'required_evidence', 'current_approval', 'live_activation_stop_gate'];
  if (requestedMode === 'live') return { outcome: 'blocked', code: 'LIVE_ACTIVATION_NOT_AUTHORIZED', mutationDelta: 0, externalCallCount: 0, orderedChecks };
  if (!projection.promotion.eligible || projection.controls.maintenance || projection.controls.readOnly || !projection.health.schemaCompatible) {
    return { outcome: 'blocked', code: 'PROMOTION_BLOCKED', mutationDelta: 0, externalCallCount: 0, orderedChecks };
  }
  return { outcome: 'promoted_non_live', code: 'NON_LIVE_DRY_RUN_COMPLETE', mutationDelta: 0, externalCallCount: 0, orderedChecks };
};
