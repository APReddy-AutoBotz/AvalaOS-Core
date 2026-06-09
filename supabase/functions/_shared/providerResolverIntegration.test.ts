import assert from 'node:assert/strict';
import {
  AllowedProviderResolverDecision,
  MembershipRoleContext,
  ProviderConfigRow,
  ProviderKeyRefRow,
  ProviderPolicyRow,
  ProviderResolverDeps,
  ProviderResolverOperation,
} from './providerResolver';
import { runProviderGovernedOperation } from './providerResolverIntegration';
import { resolveProviderSecretForDecision } from './providerSecretAdapter';

console.log('Starting M3.2n resolver Edge Function integration regression suite...');

const orgId = '11111111-1111-4111-8111-111111111111';
const actorId = '00000000-0000-4000-8000-000000000008';
const configId = '33333333-3333-4333-8333-333333333333';
const keyRefId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-06-09T00:00:00.000Z');

const membership: MembershipRoleContext = {
  status: 'active',
  roleNames: ['Admin'],
  roleIds: ['22222222-2222-4222-8222-222222222201'],
};

const policyFor = (operation: ProviderResolverOperation): ProviderPolicyRow => ({
  id: `55555555-5555-4555-8555-${operation.length.toString().padStart(12, '5')}`,
  org_id: orgId,
  provider_config_id: configId,
  operation,
  mode: 'pilot',
  allowed_roles: ['Admin'],
  is_default: true,
  status: 'active',
  deleted_at: null,
});

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

const buildDeps = (operation: ProviderResolverOperation, options: {
  policies?: ProviderPolicyRow[];
  keyRef?: ProviderKeyRefRow | null;
  order?: string[];
} = {}): ProviderResolverDeps => ({
  now: () => now,
  createCorrelationId: () => 'generated-correlation-id',
  queryMembershipAndRoles: async () => {
    options.order?.push('resolver:membership');
    return membership;
  },
  queryProviderPolicy: async () => {
    options.order?.push('resolver:policy');
    return options.policies === undefined ? [policyFor(operation)] : options.policies;
  },
  queryProviderConfig: async () => {
    options.order?.push('resolver:config');
    return config;
  },
  queryProviderKeyRef: async () => {
    options.order?.push('resolver:keyRef');
    return options.keyRef === undefined ? keyRef : options.keyRef;
  },
});

const assertNoSensitiveFields = (value: unknown) => {
  const walk = (child: unknown): void => {
    if (typeof child === 'string') {
      assert.equal(child.includes('SERVER_PROVIDER_SECRET_REF'), false);
      assert.equal(child.includes('mock-provider-key'), false);
      assert.equal(child.includes('providerPayload'), false);
      return;
    }
    if (!child || typeof child !== 'object') return;
    for (const [key, nested] of Object.entries(child as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      assert.equal(['secretref', 'rawkey', 'providerkey', 'authorization', 'providerpayload'].includes(normalized), false);
      walk(nested);
    }
  };
  walk(value);
};

const runScenario = async (
  operation: ProviderResolverOperation,
  options: {
    policies?: ProviderPolicyRow[];
    auditFails?: boolean;
    secretFails?: boolean;
    keyRef?: ProviderKeyRefRow | null;
  } = {},
) => {
  const order: string[] = [];
  let providerCalls = 0;
  let createJobCalls = 0;
  let secretCalls = 0;
  let auditCalls = 0;

  const result = await runProviderGovernedOperation({
    operation,
    orgId,
    actorId,
    requestedProvider: 'groq',
    scannerReference: `supabase/functions/${operation}/index.ts`,
    runAllowed: async ({ apiKey }) => {
      order.push('createJob');
      createJobCalls += 1;
      assert.equal(apiKey, 'mock-provider-key');
      order.push('provider');
      providerCalls += 1;
      return { ok: true };
    },
  }, {
    getMode: () => 'pilot',
    resolverDeps: buildDeps(operation, { policies: options.policies, keyRef: options.keyRef, order }),
    persistAudit: async (event) => {
      auditCalls += 1;
      order.push(`audit:${event.status}`);
      assertNoSensitiveFields(event);
      if (options.auditFails) throw new Error('audit unavailable');
      return { status: 'persisted' };
    },
    resolveSecret: async (decision) => {
      secretCalls += 1;
      order.push('secret');
      if (options.secretFails) {
        return { status: 'blocked', failureClass: 'key_reference_ineligible', correlationId: decision.correlationId };
      }
      return { status: 'resolved', provider: 'groq', correlationId: decision.correlationId, apiKey: 'mock-provider-key' };
    },
  });

  assertNoSensitiveFields(result);
  return { result, order, providerCalls, createJobCalls, secretCalls, auditCalls };
};

const allowedDecision = (): AllowedProviderResolverDecision => ({
  status: 'allowed',
  futureSecretLookupEligible: true,
  provider: 'groq',
  providerConfigId: configId,
  keyRefId,
  keyRefResolverType: 'server_reference',
  operation: 'generate_document',
  mode: 'pilot',
  orgId,
  actorId,
  correlationId: 'corr-secret-adapter',
  policyResult: 'allowed',
  auditEvent: {
    schemaVersion: 1,
    eventType: 'ai_provider_resolver_decision',
    orgId,
    provider: 'groq',
    providerConfigId: configId,
    keyRefId,
    operation: 'generate_document',
    mode: 'pilot',
    policyResult: 'allowed',
    status: 'allowed',
    actorId,
    serviceContext: 'provider_resolver',
    correlationId: 'corr-secret-adapter',
    metadata: {},
  },
});

const main = async () => {
  for (const operation of ['generate_document', 'refine_section', 'test_provider_connection'] as ProviderResolverOperation[]) {
    const blocked = await runScenario(operation, { policies: [] });
    assert.equal(blocked.result.status, 'blocked');
    assert.equal(blocked.createJobCalls, 0);
    assert.equal(blocked.providerCalls, 0);
    assert.equal(blocked.secretCalls, 0);
    assert.equal(blocked.auditCalls, 1);
    assert.equal(blocked.result.body.error, 'AI provider governance controls blocked this request.');
    assert.equal(Boolean(blocked.result.body.correlationId), true);
    assert.equal(Boolean(blocked.result.body.safeUiMessageCategory), true);
    assert.equal(Boolean(blocked.result.body.retryCategory), true);
  }

  const allowed = await runScenario('generate_document');
  assert.equal(allowed.result.status, 'allowed');
  assert.deepEqual(allowed.order, [
    'resolver:membership',
    'resolver:policy',
    'resolver:config',
    'resolver:keyRef',
    'audit:allowed',
    'secret',
    'createJob',
    'provider',
  ]);
  assert.equal(allowed.createJobCalls, 1);
  assert.equal(allowed.providerCalls, 1);

  const auditFailure = await runScenario('generate_document', { auditFails: true });
  assert.equal(auditFailure.result.status, 'blocked');
  assert.equal(auditFailure.secretCalls, 0);
  assert.equal(auditFailure.createJobCalls, 0);
  assert.equal(auditFailure.providerCalls, 0);
  assert.equal(auditFailure.result.body.failureClass, 'audit_context_unsafe');

  const secretFailure = await runScenario('generate_document', { secretFails: true });
  assert.equal(secretFailure.result.status, 'blocked');
  assert.equal(secretFailure.secretCalls, 1);
  assert.equal(secretFailure.createJobCalls, 0);
  assert.equal(secretFailure.providerCalls, 0);
  assert.equal(secretFailure.result.body.failureClass, 'key_reference_ineligible');

  const baseDecision = allowedDecision();
  const manual = await resolveProviderSecretForDecision(baseDecision, {
    lookupKeyRef: async () => ({
      id: keyRefId,
      org_id: orgId,
      provider: 'groq',
      resolver_type: 'manual_placeholder',
      secret_ref: 'SERVER_PROVIDER_SECRET_REF',
      status: 'active',
    }),
  });
  assert.equal(manual.status, 'blocked');
  if (manual.status === 'blocked') assert.equal(manual.failureClass, 'key_reference_ineligible');

  const external = await resolveProviderSecretForDecision(baseDecision, {
    lookupKeyRef: async () => ({
      id: keyRefId,
      org_id: orgId,
      provider: 'groq',
      resolver_type: 'external_secret_reference',
      secret_ref: 'SERVER_PROVIDER_SECRET_REF',
      status: 'active',
    }),
  });
  assert.equal(external.status, 'blocked');
  if (external.status === 'blocked') assert.equal(external.failureClass, 'key_reference_ineligible');

  const unsafe = await resolveProviderSecretForDecision(baseDecision, {
    lookupKeyRef: async () => ({
      id: keyRefId,
      org_id: orgId,
      provider: 'groq',
      resolver_type: 'server_reference',
      secret_ref: 'not-safe-env-name',
      status: 'active',
    }),
  });
  assert.equal(unsafe.status, 'blocked');
  if (unsafe.status === 'blocked') assert.equal(unsafe.failureClass, 'secret_reference_unsafe');

  const resolved = await resolveProviderSecretForDecision(baseDecision, {
    lookupKeyRef: async () => ({
      id: keyRefId,
      org_id: orgId,
      provider: 'groq',
      resolver_type: 'server_reference',
      secret_ref: 'SERVER_PROVIDER_SECRET_REF',
      status: 'active',
    }),
    readEnv: () => 'mock-provider-key',
  });
  assert.equal(resolved.status, 'resolved');
  if (resolved.status === 'resolved') assert.equal(resolved.apiKey, 'mock-provider-key');

  console.log('M3.2n resolver Edge Function integration regression suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
