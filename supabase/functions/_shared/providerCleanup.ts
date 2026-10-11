import type { ProviderResolverSupportedProvider } from './providerResolver.ts';
import { isAllowedProviderSecretRef, type ProviderSecretBackend } from './providerSecretAdapter.ts';
import { postgrest, rpc } from './supabase.ts';

export type ProviderSecretCleanupJob = {
  state: 'claimed'; jobId: string; keyRefId: string; organizationId: string;
  provider: ProviderResolverSupportedProvider; attemptCount: number; executionFence: number;
  backendKind: 'hashicorp_vault' | 'supabase_vault' | null; safeFingerprint: string | null;
};
type CleanupClaim = ProviderSecretCleanupJob | { state: 'empty' };
type CleanupMaterial = { id: string; org_id: string; provider: ProviderResolverSupportedProvider; resolver_type: string;
  secret_ref: string; safe_fingerprint: string | null; secret_backend_kind: 'hashicorp_vault' | 'supabase_vault' | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providers = new Set(['openai','azure_openai','anthropic','gemini','groq','openai_compatible']);

export const claimProviderSecretCleanupJob = async (executionToken: string): Promise<CleanupClaim> => {
  const value = await rpc<Record<string, unknown>>('enterprise_ai_claim_provider_secret_cleanup_job', { p_execution_token: executionToken });
  if (value.state === 'empty') return { state: 'empty' };
  if (value.state !== 'claimed' || typeof value.jobId !== 'string' || !uuid.test(value.jobId)
    || typeof value.keyRefId !== 'string' || !uuid.test(value.keyRefId)
    || typeof value.organizationId !== 'string' || !uuid.test(value.organizationId)
    || typeof value.provider !== 'string' || !providers.has(value.provider)
    || !Number.isSafeInteger(value.attemptCount) || Number(value.attemptCount) < 1
    || !Number.isSafeInteger(value.executionFence) || Number(value.executionFence) < 1
    || (value.backendKind !== null && value.backendKind !== 'hashicorp_vault' && value.backendKind !== 'supabase_vault')
    || (value.safeFingerprint !== null && (typeof value.safeFingerprint !== 'string' || !/^sha256:[0-9a-f]{24}$/.test(value.safeFingerprint)))) {
    throw new Error('PROVIDER_CLEANUP_UNAVAILABLE');
  }
  return value as ProviderSecretCleanupJob;
};

export const loadProviderSecretCleanupMaterial = async (job: ProviderSecretCleanupJob) => {
  const rows = await postgrest<CleanupMaterial[]>(
    `ai_provider_key_refs?select=id,org_id,provider,resolver_type,secret_ref,safe_fingerprint,secret_backend_kind&id=eq.${encodeURIComponent(job.keyRefId)}&org_id=eq.${encodeURIComponent(job.organizationId)}&provider=eq.${encodeURIComponent(job.provider)}&limit=1`,
    { method: 'GET' },
  );
  const row = rows[0];
  if (!row || row.id !== job.keyRefId || row.org_id !== job.organizationId || row.provider !== job.provider
    || row.resolver_type !== 'server_reference' || !isAllowedProviderSecretRef(row.provider, row.secret_ref, row.org_id)
    || row.safe_fingerprint !== job.safeFingerprint || row.secret_backend_kind !== job.backendKind) {
    throw new Error('PROVIDER_CLEANUP_REFERENCE_UNAVAILABLE');
  }
  return row;
};

const removeWithDeadline = async (backend: ProviderSecretBackend, material: CleanupMaterial, job: ProviderSecretCleanupJob,
  executionToken: string, timeoutMs: number) => {
  if (!backend.writable || !backend.remove) throw new Error('PROVIDER_CLEANUP_BACKEND_UNAVAILABLE');
  if ((job.backendKind === 'supabase_vault' && backend.kind !== 'supabase_vault')
    || (job.backendKind === 'hashicorp_vault' && backend.kind !== 'hashicorp_vault' && backend.kind !== 'vault')
    || (job.backendKind === null && backend.kind === 'supabase_vault')) {
    throw new Error('PROVIDER_CLEANUP_BACKEND_UNAVAILABLE');
  }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await backend.remove({
      provider: material.provider, secretRef: material.secret_ref, organizationId: material.org_id, signal: controller.signal,
      ...(backend.kind === 'supabase_vault' && job.safeFingerprint
        ? { binding: { kind: 'cleanup_job' as const, jobId: job.jobId, executionToken,
          executionFence: job.executionFence, keyRefId: job.keyRefId, safeFingerprint: job.safeFingerprint } }
        : {}),
    });
  } finally { clearTimeout(timer); }
};

/** One bounded, idempotent cleanup attempt. Return values never include secret references. */
export const processNextProviderSecretCleanup = async (input: {
  executionToken: string; backend: ProviderSecretBackend; timeoutMs?: number;
  claim?: (executionToken: string) => Promise<CleanupClaim>;
  load?: (job: ProviderSecretCleanupJob) => Promise<CleanupMaterial>;
  complete?: (jobId: string, token: string, fence: number) => Promise<unknown>;
  fail?: (jobId: string, token: string, fence: number, failureClass: string) => Promise<unknown>;
}) => {
  const claim = await (input.claim || claimProviderSecretCleanupJob)(input.executionToken);
  if (claim.state === 'empty') return { state: 'empty' as const };
  let material: CleanupMaterial;
  try {
    material = await (input.load || loadProviderSecretCleanupMaterial)(claim);
    await removeWithDeadline(input.backend, material, claim, input.executionToken, input.timeoutMs ?? 10_000);
  } catch {
    await (input.fail || ((jobId, token, fence, failureClass) => rpc('enterprise_ai_fail_provider_secret_cleanup_job', { p_job: jobId, p_execution_token: token, p_execution_fence: fence, p_failure_class: failureClass })))(claim.jobId, input.executionToken, claim.executionFence, 'cleanup_attempt_failed');
    return { state: 'retry_scheduled' as const, jobId: claim.jobId, attemptCount: claim.attemptCount };
  }
  try {
    await (input.complete || ((jobId, token, fence) => rpc('enterprise_ai_complete_provider_secret_cleanup_job', { p_job: jobId, p_execution_token: token, p_execution_fence: fence })))(claim.jobId, input.executionToken, claim.executionFence);
    return { state: 'completed' as const, jobId: claim.jobId, attemptCount: claim.attemptCount };
  } catch {
    // The completion RPC may have committed before its response was lost.
    // Never overwrite that possible terminal state. If it did not commit,
    // lease expiry permits one later idempotent delete/reconciliation owner.
    return { state: 'completion_uncertain' as const, jobId: claim.jobId, attemptCount: claim.attemptCount };
  }
};
