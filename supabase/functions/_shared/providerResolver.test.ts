import assert from 'node:assert/strict';
import {
  MembershipRoleContext,
  ProviderConfigRow,
  ProviderKeyRefRow,
  ProviderPolicyRow,
  ProviderResolverDecision,
  ProviderResolverDeps,
  ProviderResolverFailureClass,
  ProviderResolverInput,
  resolveProviderForOperation,
} from './providerResolver';
import {
  ProviderResolverAuditMetadataError,
  buildProviderResolverAuditEventShell,
} from './providerResolverAudit';
import { evaluateProviderSecretLookupEligibility } from './providerSecretAdapter';

console.log('Starting M3.2l provider resolver decision regression suite...');

const orgId = '11111111-1111-4111-8111-111111111111';
const actorId = '00000000-0000-4000-8000-000000000008';
const configId = '33333333-3333-4333-8333-333333333333';
const keyRefId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-06-08T00:00:00.000Z');

const baseInput: ProviderResolverInput = {
  mode: 'pilot',
  operation: 'generate_document',
  requestedProvider: 'groq',
  orgId,
  actorId,
  correlationId: 'corr-m3-2l-001',
  evidenceRef: 'docs/quality/m3.2l-provider-resolver-decision-logic-evidence.md',
  scannerClassification: {
    status: 'classified',
    reference: 'supabase/functions/_shared/providerResolver.ts',
  },
};

const membership: MembershipRoleContext = {
  status: 'active',
  roleNames: ['Admin'],
  roleIds: ['22222222-2222-4222-8222-222222222201'],
};

const policy: ProviderPolicyRow = {
  id: '55555555-5555-4555-8555-555555555555',
  org_id: orgId,
  provider_config_id: configId,
  operation: 'generate_document',
  mode: 'pilot',
  allowed_roles: ['Admin'],
  is_default: true,
  status: 'active',
  deleted_at: null,
};

const config: ProviderConfigRow = {
  id: configId,
  org_id: orgId,
  provider: 'groq',
  key_ref_id: keyRefId,
  allowed_modes: ['pilot', 'production'],
  allowed_operations: ['generate_document', 'refine_section', 'test_provider_connection'],
  status: 'active',
  deleted_at: null,
};

const keyRef: ProviderKeyRefRow = {
  id: keyRefId,
  org_id: orgId,
  provider: 'groq',
  resolver_type: 'server_reference',
  referenceSafety: 'reference_only',
  status: 'active',
  expires_at: '2026-12-31T00:00:00.000Z',
  deleted_at: null,
};

const buildDeps = (overrides: {
  membership?: MembershipRoleContext | null;
  policies?: ProviderPolicyRow[];
  config?: ProviderConfigRow | null;
  keyRef?: ProviderKeyRefRow | null;
} = {}): ProviderResolverDeps => ({
  now: () => now,
  createCorrelationId: () => 'generated-correlation-id',
  queryMembershipAndRoles: async () => overrides.membership === undefined ? membership : overrides.membership,
  queryProviderPolicy: async () => overrides.policies || [policy],
  queryProviderConfig: async () => overrides.config === undefined ? config : overrides.config,
  queryProviderKeyRef: async () => overrides.keyRef === undefined ? keyRef : overrides.keyRef,
});

const assertNoSecretLeak = (decision: ProviderResolverDecision | unknown) => {
  const assertValueIsSafe = (value: unknown): void => {
    if (typeof value === 'string') {
      assert.equal(/^(bearer\s+|basic\s+|sk-|sk_|gsk_|aiza)/i.test(value.trim()), false);
      return;
    }

    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      assert.equal([
        'secretref',
        'secret',
        'secretvalue',
        'rawkey',
        'providerkey',
        'authorization',
        'authheader',
        'bearertoken',
      ].includes(normalized), false);
      assertValueIsSafe(child);
    }
  };

  assertValueIsSafe(decision);
};

const expectBlocked = async (
  inputPatch: Partial<ProviderResolverInput>,
  depsPatch: Parameters<typeof buildDeps>[0],
  failureClass: ProviderResolverFailureClass,
) => {
  const decision = await resolveProviderForOperation(
    { ...baseInput, ...inputPatch },
    buildDeps(depsPatch),
  );
  assert.equal(decision.status, 'blocked');
  if (decision.status === 'blocked') {
    assert.equal(decision.failureClass, failureClass);
    assert.equal(decision.futureSecretLookupEligible, false);
    assert.equal(decision.policyResult, 'blocked');
    assert.equal(decision.auditEvent.status, 'blocked');
  }
  assertNoSecretLeak(decision);
};

const main = async () => {
  const allowed = await resolveProviderForOperation(baseInput, buildDeps());
  assert.equal(allowed.status, 'allowed');
  if (allowed.status === 'allowed') {
    assert.equal(allowed.futureSecretLookupEligible, true);
    assert.equal(allowed.provider, 'groq');
    assert.equal(allowed.providerConfigId, configId);
    assert.equal(allowed.keyRefId, keyRefId);
    assert.equal(allowed.keyRefResolverType, 'server_reference');
    assert.equal(allowed.policyResult, 'allowed');
    assert.equal(allowed.auditEvent.eventType, 'ai_provider_resolver_decision');
    assert.equal(allowed.auditEvent.status, 'allowed');
    assert.equal(allowed.auditEvent.metadata.keyReference, 'eligible_for_future_lookup');
  }
  assertNoSecretLeak(allowed);

  await expectBlocked({ mode: 'local-demo' }, {}, 'mode_not_allowed');
  await expectBlocked({ actorId: '' }, {}, 'unauthenticated');
  await expectBlocked({ orgId: '' }, {}, 'org_missing');
  await expectBlocked({}, { membership: { ...membership, status: 'suspended' } }, 'membership_denied');
  await expectBlocked({}, { membership: { status: 'active', roleNames: [], roleIds: [] } }, 'role_not_allowed');
  await expectBlocked({ operation: 'summarize_case' }, {}, 'operation_not_allowed');
  await expectBlocked({ requestedProvider: 'openai' }, {}, 'provider_not_supported');
  await expectBlocked({}, { policies: [] }, 'provider_policy_missing');
  await expectBlocked({}, { policies: [policy, { ...policy, id: '66666666-6666-4666-8666-666666666666' }] }, 'provider_policy_ambiguous');
  await expectBlocked({}, { policies: [{ ...policy, allowed_roles: ['Reviewer'] }] }, 'role_not_allowed');
  await expectBlocked({}, { config: null }, 'provider_config_missing');
  await expectBlocked({}, { config: { ...config, status: 'disabled' } }, 'provider_config_ineligible');
  await expectBlocked({}, { config: { ...config, provider: 'gemini' } }, 'provider_config_ineligible');
  await expectBlocked({}, { config: { ...config, allowed_modes: ['production'] } }, 'provider_config_ineligible');
  await expectBlocked({}, { config: { ...config, allowed_operations: ['refine_section'] } }, 'provider_config_ineligible');
  await expectBlocked({}, { config: { ...config, key_ref_id: null } }, 'key_reference_missing');
  await expectBlocked({}, { keyRef: null }, 'key_reference_missing');
  await expectBlocked({}, { keyRef: { ...keyRef, status: 'disabled' } }, 'key_reference_ineligible');
  await expectBlocked({}, { keyRef: { ...keyRef, provider: 'gemini' } }, 'key_reference_ineligible');
  await expectBlocked({}, { keyRef: { ...keyRef, resolver_type: 'manual_placeholder' } }, 'key_reference_ineligible');
  await expectBlocked({}, { keyRef: { ...keyRef, resolver_type: 'external_secret_reference' } }, 'key_reference_ineligible');
  await expectBlocked({}, { keyRef: { ...keyRef, expires_at: '2026-01-01T00:00:00.000Z' } }, 'key_reference_ineligible');
  await expectBlocked({}, { keyRef: { ...keyRef, referenceSafety: 'unsafe' } }, 'secret_reference_unsafe');
  await expectBlocked({ scannerClassification: { status: 'missing' } }, {}, 'scanner_classification_missing');
  await expectBlocked({ auditMetadata: { prompt: 'raw prompt text' } }, {}, 'audit_context_unsafe');

  assert.throws(
    () => buildProviderResolverAuditEventShell({
      policyResult: 'blocked',
      status: 'blocked',
      correlationId: 'corr-audit-unsafe',
      metadata: { nested: { authorization: 'Bearer test' } },
    }),
    ProviderResolverAuditMetadataError,
  );

  const eligibleSecretLookup = evaluateProviderSecretLookupEligibility(allowed);
  assert.equal(eligibleSecretLookup.status, 'eligible');
  if (eligibleSecretLookup.status === 'eligible') {
    assert.equal(eligibleSecretLookup.futureLookupEligible, true);
    assert.equal(eligibleSecretLookup.keyRefId, keyRefId);
  }
  assertNoSecretLeak(eligibleSecretLookup);

  const blockedSecretLookup = evaluateProviderSecretLookupEligibility(
    await resolveProviderForOperation({ ...baseInput, requestedProvider: 'openai' }, buildDeps()),
  );
  assert.equal(blockedSecretLookup.status, 'blocked');
  if (blockedSecretLookup.status === 'blocked') {
    assert.equal(blockedSecretLookup.failureClass, 'provider_call_blocked');
  }
  assertNoSecretLeak(blockedSecretLookup);

  const futureExternalReferenceAttempt = evaluateProviderSecretLookupEligibility({
    ...(allowed as any),
    keyRefResolverType: 'external_secret_reference',
  });
  assert.equal(futureExternalReferenceAttempt.status, 'blocked');
  if (futureExternalReferenceAttempt.status === 'blocked') {
    assert.equal(futureExternalReferenceAttempt.failureClass, 'key_reference_ineligible');
  }

  const prohibitedReferenceLeakAttempt = evaluateProviderSecretLookupEligibility({
    ...(allowed as any),
    secretRef: 'FUTURE_ENV_NAME',
  });
  assert.equal(prohibitedReferenceLeakAttempt.status, 'blocked');
  if (prohibitedReferenceLeakAttempt.status === 'blocked') {
    assert.equal(prohibitedReferenceLeakAttempt.failureClass, 'secret_reference_unsafe');
  }

  console.log('M3.2l provider resolver decision regression suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
