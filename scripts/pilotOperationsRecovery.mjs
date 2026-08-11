import { createHash, timingSafeEqual } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const stableJson = value => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

const forbiddenKey = /(?:secret|token|password|credential|signed.?url|database.?url|storage.?url|project.?id|provider.?payload|raw.?log)/i;
const unsafeString = value => /(?:postgres(?:ql)?:\/\/|https?:\/\/[^\s]+[?&](?:token|signature|key)=|BEGIN (?:RSA |EC )?PRIVATE KEY|Bearer\s+)/i.test(value);
const assertSanitized = (value, path = '$') => {
  if (Array.isArray(value)) return value.forEach((child, index) => assertSanitized(child, `${path}[${index}]`));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && unsafeString(value)) throw new Error('BACKUP_CONTAINS_PROHIBITED_DATA');
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKey.test(key)) throw new Error('BACKUP_CONTAINS_PROHIBITED_DATA');
    assertSanitized(child, `${path}.${key}`);
  }
};

const requiredCollections = ['organizations', 'workspaces', 'memberships', 'releaseCandidates', 'environments', 'approvals', 'receipts', 'auditEvents'];

export function createDisposableBackup({ schemaVersion, environmentBinding, records }) {
  if (schemaVersion !== 'pilot-operations-2026-08' || typeof environmentBinding !== 'string' || !/^env_[a-z0-9]{12,40}$/.test(environmentBinding)) {
    throw new Error('BACKUP_CONTRACT_INVALID');
  }
  if (!records || typeof records !== 'object' || Array.isArray(records) || Object.keys(records).some(key => !requiredCollections.includes(key)) || requiredCollections.some(key => !Array.isArray(records[key]))) {
    throw new Error('BACKUP_CONTRACT_INVALID');
  }
  assertSanitized(records);
  const payload = { schemaVersion, environmentBinding, synthetic: true, records };
  const serializedPayload = stableJson(payload);
  return {
    manifest: {
      format: 'avala-disposable-pilot-operations-backup-v1',
      schemaVersion,
      environmentBinding,
      synthetic: true,
      byteLength: Buffer.byteLength(serializedPayload),
      payloadDigest: `sha256:${sha256(serializedPayload)}`,
      collectionCounts: Object.fromEntries(requiredCollections.map(key => [key, records[key].length])),
    },
    payload,
  };
}

export function verifyDisposableBackup(bundle, expected) {
  const fail = code => ({ accepted: false, code, restoreMutationCount: 0, authorityMintCount: 0 });
  try {
    if (!bundle || typeof bundle !== 'object' || !bundle.manifest || !bundle.payload) return fail('BACKUP_INCOMPLETE');
    const { manifest, payload } = bundle;
    if (manifest.format !== 'avala-disposable-pilot-operations-backup-v1' || manifest.synthetic !== true || payload.synthetic !== true) return fail('BACKUP_FORMAT_REJECTED');
    if (manifest.schemaVersion !== expected.schemaVersion || payload.schemaVersion !== expected.schemaVersion) return fail('BACKUP_SCHEMA_MISMATCH');
    if (manifest.environmentBinding !== expected.environmentBinding || payload.environmentBinding !== expected.environmentBinding) return fail('BACKUP_ENVIRONMENT_MISMATCH');
    assertSanitized(payload.records);
    const serializedPayload = stableJson(payload);
    if (manifest.byteLength !== Buffer.byteLength(serializedPayload)) return fail('BACKUP_TRUNCATED');
    const provided = Buffer.from(String(manifest.payloadDigest));
    const calculated = Buffer.from(`sha256:${sha256(serializedPayload)}`);
    if (provided.length !== calculated.length || !timingSafeEqual(provided, calculated)) return fail('BACKUP_INTEGRITY_FAILED');
    if (!manifest.collectionCounts || requiredCollections.some(key => manifest.collectionCounts[key] !== payload.records?.[key]?.length)) return fail('BACKUP_COUNT_MISMATCH');
    return {
      accepted: true,
      code: 'BACKUP_VERIFIED_FOR_CLEAN_DISPOSABLE_RESTORE',
      restoreMutationCount: 0,
      authorityMintCount: 0,
      payloadDigest: manifest.payloadDigest,
      requiredRestoreMode: 'clean_disposable_read_only',
    };
  } catch (error) {
    return fail(error instanceof Error && error.message === 'BACKUP_CONTAINS_PROHIBITED_DATA' ? error.message : 'BACKUP_INVALID');
  }
}

export function evaluateRecoveryReplay({ receiptStatus, requestDigest, committedDigest, currentlyAuthorized, environmentActive }) {
  if (!currentlyAuthorized || !environmentActive) return { code: 'PERMISSION_DENIED', disclosed: false, effectDelta: 0, auditDelta: 0 };
  if (requestDigest !== committedDigest) return { code: 'IDEMPOTENCY_CONFLICT', disclosed: false, effectDelta: 0, auditDelta: 0 };
  if (receiptStatus === 'committed') return { code: 'EXACT_REPLAY', disclosed: true, effectDelta: 0, auditDelta: 0 };
  if (receiptStatus === 'effect_committed') return { code: 'RECONCILED', disclosed: true, effectDelta: 0, auditDelta: 0 };
  return { code: 'RECOVERY_BLOCKED', disclosed: false, effectDelta: 0, auditDelta: 0 };
}
