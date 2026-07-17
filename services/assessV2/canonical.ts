import { ASSESS_V2_DECISION_VERSION, ASSESS_V2_SCHEMA_VERSION } from './types';

export const ASSESS_V2_CANONICALIZATION_VERSION = 'avala-canonical-json-1' as const;
export type DecisionDigestDomain = 'input' | 'evidence' | 'output';
export interface DecisionDigestBinding {
  organizationId: string;
  workspaceId: string;
  caseId: string;
  sourceCaseVersion: number;
  schemaVersion: typeof ASSESS_V2_SCHEMA_VERSION;
  ruleSetVersion: string;
  decisionVersion: typeof ASSESS_V2_DECISION_VERSION;
}

const assertJsonValue = (value: unknown, seen: Set<object>): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Decision snapshots cannot contain non-finite numbers.'); return; }
  if (typeof value !== 'object') throw new TypeError(`Decision snapshots cannot contain ${typeof value} values.`);
  if (seen.has(value)) throw new TypeError('Decision snapshots cannot contain cycles.');
  seen.add(value);
  if (Array.isArray(value)) for (const item of value) assertJsonValue(item, seen);
  else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Decision snapshots must contain plain JSON objects.');
    for (const item of Object.values(value as Record<string, unknown>)) assertJsonValue(item, seen);
  }
  seen.delete(value);
};
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) as string;
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
};
export const canonicalizeDecisionPayload = (value: unknown): string => { assertJsonValue(value, new Set()); return canonical(value); };
const sha256TextHex = async (value: string): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};
export const sha256Hex = async (value: unknown): Promise<string> => sha256TextHex(canonicalizeDecisionPayload(value));
export const isSha256Hex = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);

export const buildDecisionCanonicalV2 = (domain: DecisionDigestDomain, binding: DecisionDigestBinding, payload: unknown): string => {
  if (!binding.organizationId.trim() || !binding.workspaceId.trim() || !binding.caseId.trim()) throw new Error('Decision digest tenant, workspace, and case bindings are required.');
  if (!Number.isSafeInteger(binding.sourceCaseVersion) || binding.sourceCaseVersion < 1) throw new Error('Decision digest source case version must be a positive safe integer.');
  if (binding.schemaVersion !== ASSESS_V2_SCHEMA_VERSION || binding.decisionVersion !== ASSESS_V2_DECISION_VERSION || !binding.ruleSetVersion.trim()) throw new Error('Decision digest version bindings are invalid.');
  return canonicalizeDecisionPayload({
    canonicalizationVersion: ASSESS_V2_CANONICALIZATION_VERSION,
    domain,
    organizationId: binding.organizationId,
    workspaceId: binding.workspaceId,
    caseId: binding.caseId,
    sourceCaseVersion: binding.sourceCaseVersion,
    schemaVersion: binding.schemaVersion,
    ruleSetVersion: binding.ruleSetVersion,
    decisionVersion: binding.decisionVersion,
    payload,
  });
};

export const buildDecisionDigestV2 = async (domain: DecisionDigestDomain, binding: DecisionDigestBinding, payload: unknown): Promise<string> => (
  sha256TextHex(buildDecisionCanonicalV2(domain, binding, payload))
);
