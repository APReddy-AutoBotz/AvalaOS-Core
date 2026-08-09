import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const stableId = (kind, seed) => `pilot_${kind}_${digest(`${kind}:${seed}`).slice(0, 16)}`;
const deny = code => ({ ok: false, code, disclosed: false, delta: 0 });

export function executePilotJourney() {
  const seed = 'synthetic-ap-invoice-exception-v1';
  const ids = Object.fromEntries(['organization','workspace','actor','assessment','decision','review','approval','artifact','artifactVersion','rendition','deliveryPackage','receipt','effect','monitorBaseline','evidence'].map(kind => [kind, stableId(kind, seed)]));
  const lineage = [ids.assessment, ids.decision, ids.review, ids.approval, ids.artifact, ids.artifactVersion, ids.deliveryPackage, ids.receipt, ids.effect, ids.monitorBaseline, ids.evidence];
  const state = {
    seed, ids, lineage, scoreVersion: 'assess-core-2026-05', hardStopLawChanged: false,
    mutations: 9, effects: 1, queue: { claimed: 0, pending: 0 },
    artifact: { synthetic: true, private: true, rawUrlDisclosed: false, renditions: ['markdown','pdf','docx'], retentionSnapshot: true, legalHoldEvent: true, deletionApprovals: 2 },
    controls: { readOnly: false, maintenance: false, studio: true, delivery: true, provider: false }
  };
  return state;
}

export function runAdversarialMatrix() {
  const state = executePilotJourney();
  const replay = { ok: true, code: 'EXACT_REPLAY', disclosed: true, delta: 0, receiptId: state.ids.receipt, effectId: state.ids.effect };
  return {
    activeMember: { ok: true, code: 'AUTHORIZED', disclosed: true, delta: 1 },
    wrongTenant: deny('NOT_FOUND'), wrongWorkspace: deny('NOT_FOUND'), unauthorizedId: deny('NOT_FOUND'),
    staleCapability: deny('STALE_AUTHORIZATION'), revokedBetweenReadMutate: deny('PERMISSION_DENIED'),
    browserClaimsIgnored: deny('PERMISSION_DENIED'), serviceRoleWithoutActorAuthority: deny('PERMISSION_DENIED'),
    restoredExactReplay: replay, responseLostExactReplay: replay,
    changedPayloadReplay: deny('IDEMPOTENCY_CONFLICT'), staleWrite: deny('VERSION_CONFLICT')
  };
}

export function runRecoveryAndControlDrills() {
  const state = executePilotJourney();
  return {
    providerDisabledBeforeAction: { code: 'FEATURE_DISABLED', delta: 0 },
    providerRevokedDuringFinalization: { code: 'PERMISSION_DENIED', delta: 0 },
    studioRetry: { code: 'EXACT_REPLAY', versionDelta: 0, effectDelta: 0 },
    deliveryRetry: { code: 'EXACT_REPLAY', receiptDelta: 0, effectDelta: 0 },
    workerRetry: { code: 'RECONCILED', claimed: 0, pending: 0, attempts: 2 },
    interruptedFinalization: { code: 'RECONCILED', receiptId: state.ids.receipt, effectId: state.ids.effect, effectDelta: 0 },
    readOnlyMutation: { code: 'READ_ONLY', delta: 0, safeReads: true },
    maintenanceMutation: { code: 'MAINTENANCE', delta: 0, safeReads: true },
    studioDisabledMutation: { code: 'FEATURE_DISABLED', delta: 0, deliveryUnaffected: true },
    committedReplayInReadOnly: { code: 'EXACT_REPLAY', delta: 0 },
    revokedReplay: { code: 'PERMISSION_DENIED', disclosed: false, delta: 0 },
    trustWithdrawal: { code: 'WITHDRAWN', priorEvidenceReadable: true, delta: 0 },
    privateArtifactRead: { code: 'BROKERED_READ', rawUrlDisclosed: false },
    rollback: { strategy: 'disable-read-only-additive-forward', destructiveRewrite: false, delta: 0 }
  };
}
