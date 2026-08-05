import assert from 'node:assert/strict';
import {
  executeProviderLifecycleCommand,
  ProviderLifecycleError,
  type ProviderLifecycleAuthority,
  type ProviderLifecycleConfig,
  type ProviderLifecycleDatabase,
  type ProviderLifecycleOperation,
} from './providerLifecycle';
import type { ProviderSecretBackend } from './providerSecretAdapter';
import { parseProviderLifecycleEnvelope, providerLifecycleRequestHash } from './providerLifecycleEndpoint';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const CONFIG = '44444444-4444-4444-8444-444444444444';
const ROUTE = '55555555-5555-4555-8555-555555555555';
const KEY_ONE = '66666666-6666-4666-8666-666666666666';
const KEY_TWO = '77777777-7777-4777-8777-777777777777';
const NONCE_ONE = '88888888-8888-4888-8888-888888888888';
const NONCE_TWO = '99999999-9999-4999-8999-999999999999';
const now = new Date('2026-08-04T10:00:00.000Z');

const authority: ProviderLifecycleAuthority = {
  actorId: ACTOR,
  organizationId: ORG,
  workspaceId: WORKSPACE,
  authorizationVersion: 8,
  organizationCapabilities: new Set(['byok.manage', 'security.manage']),
  workspaceCapabilities: new Set(['byok.manage']),
  organizationRoleNames: new Set(['admin']),
  workspaceRoleNames: new Set(['workspace manager']),
};

const test = async (name: string, callback: () => Promise<void>) => {
  try { await callback(); console.log(`ok - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
};

await test('executes the seven-step lifecycle without persisting raw secret material', async () => {
  let config: ProviderLifecycleConfig | null = null;
  let route = { id: ROUTE, enabled: false, capability: 'assess.evidence.extract' as const, allowedRoles: ['admin'] };
  const transitionPayloads: unknown[] = [];
  const database: ProviderLifecycleDatabase = {
    async loadConfig(input) { return config?.id === input.providerConfigId && config.organizationId === input.organizationId ? structuredClone(config) : null; },
    async transition(input) {
      transitionPayloads.push(structuredClone(input.payload));
      if (input.operation === 'provider.register') {
        config = { id: String(input.payload.providerConfigId), organizationId: ORG, provider: 'openai', status: 'pending_review', defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], keyRef: null };
      } else if (input.operation === 'provider.secret.bind' && config) {
        config.keyRef = { id: String(input.payload.keyRefId), provider: 'openai', resolverType: 'server_reference', secretRef: String(input.payload.secretReference), safeFingerprint: String(input.payload.safeFingerprint), status: 'active' };
      } else if (input.operation === 'provider.validate' && config) config.lastValidatedAt = String(input.payload.lastValidatedAt);
      else if (input.operation === 'provider.activate' && config) config.status = 'active';
      else if (input.operation === 'provider.route.toggle') route = { ...route, enabled: Boolean(input.payload.enabled) };
      else if (input.operation === 'provider.secret.rotate' && config) {
        config.keyRef = { id: String(input.payload.keyRefId), provider: 'openai', resolverType: 'server_reference', secretRef: String(input.payload.secretReference), safeFingerprint: String(input.payload.safeFingerprint), status: 'active' };
        config.lastValidatedAt = String(input.payload.lastValidatedAt);
      } else if (input.operation === 'provider.revoke' && config) { config.status = 'retired'; route.enabled = false; }
      return { status: 'committed' };
    },
  };
  const secrets = new Map<string, string>();
  const removed: string[] = [];
  const secretBackend: ProviderSecretBackend = {
    kind: 'vault', writable: true,
    async resolve(input) { return secrets.get(input.secretRef); },
    async write(input) { secrets.set(input.secretRef, input.value); },
    async remove(input) { secrets.delete(input.secretRef); removed.push(input.secretRef); },
  };
  const ids = [CONFIG, ROUTE, NONCE_ONE, KEY_ONE, NONCE_TWO, KEY_TWO];
  const routeResolverDeps = {
    now: () => now,
    createCorrelationId: () => 'provider-lifecycle-test',
    queryRoutes: async () => [{ id: route.id, org_id: ORG, workspace_id: WORKSPACE, provider_config_id: CONFIG, capability: route.capability, model: 'gpt-governed', enabled: route.enabled, allowed_roles: route.allowedRoles }],
    queryProviderConfig: async () => config ? ({ id: config.id, org_id: ORG, provider: config.provider, key_ref_id: config.keyRef?.id, allowed_modes: ['pilot'], allowed_operations: ['assess.evidence.extract'], status: config.status, default_model: config.defaultModel, model_allowlist: config.modelAllowlist, last_validated_at: config.lastValidatedAt }) : null,
    queryProviderKeyRef: async () => config?.keyRef ? ({ id: config.keyRef.id, org_id: ORG, provider: config.provider, resolver_type: 'server_reference' as const, referenceSafety: 'reference_only' as const, secret_ref: config.keyRef.secretRef, status: config.keyRef.status }) : null,
    queryUsage: async () => ({ dailyRequests: 0, monthlyTokens: 0 }),
    isEndpointAllowed: () => true,
  };
  const deps = {
    database, secretBackend, routeResolverDeps,
    validateConnection: async () => ({ validated: true as const }),
    now: () => now,
    randomId: () => ids.shift() || crypto.randomUUID(),
  };

  const registration = await executeProviderLifecycleCommand('provider.register', authority, { provider: 'openai', displayName: 'Governed OpenAI', defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], capabilities: ['assess.evidence.extract'] }, deps);
  assert.equal(registration.providerConfigId, CONFIG);
  await executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, providerKey: 'raw-provider-key-one' }, deps);
  assert.equal(config?.keyRef?.id, KEY_ONE);
  await executeProviderLifecycleCommand('provider.validate', authority, { providerConfigId: CONFIG }, deps);
  await executeProviderLifecycleCommand('provider.activate', authority, { providerConfigId: CONFIG }, deps);
  await executeProviderLifecycleCommand('provider.route.toggle', authority, { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: true }, deps);
  assert.equal(route.enabled, true);
  await executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'raw-provider-key-two' }, deps);
  assert.equal(config?.keyRef?.id, KEY_TWO);
  assert.equal(removed.length, 1);
  await executeProviderLifecycleCommand('provider.revoke', authority, { providerConfigId: CONFIG }, deps);
  assert.equal(config?.status, 'retired');
  assert.equal(route.enabled, false);
  assert.equal(JSON.stringify(transitionPayloads).includes('raw-provider-key'), false);
  assert.match(String(config?.keyRef?.safeFingerprint), /^sha256:[0-9a-f]{24}$/);
});

await test('requires a writable backend for raw keys and permits safe pre-provisioned references only without one', async () => {
  const config: ProviderLifecycleConfig = { id: CONFIG, organizationId: ORG, provider: 'openai', status: 'pending_review', defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], keyRef: null };
  const database: ProviderLifecycleDatabase = { loadConfig: async () => config, transition: async () => ({ status: 'committed' }) };
  const safeRef = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_PREPROVISIONED';
  const backend: ProviderSecretBackend = { kind: 'environment', writable: false, resolve: async input => input.secretRef === safeRef ? 'pre-provisioned-value' : undefined };
  const deps = { database, secretBackend: backend, routeResolverDeps: {} as never, validateConnection: async () => ({ validated: true as const }), now: () => now, randomId: () => KEY_ONE };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, providerKey: 'raw-provider-key' }, deps),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'SECRET_BACKEND_REQUIRED',
  );
  const result = await executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, preProvisionedReference: safeRef }, deps);
  assert.equal(result.status, 'pending_review');
});

await test('fails closed for wrong-tenant provider configuration', async () => {
  const database: ProviderLifecycleDatabase = {
    loadConfig: async () => ({ id: CONFIG, organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', provider: 'openai', status: 'active', defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], keyRef: null }),
    transition: async () => ({ status: 'committed' }),
  };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.validate', authority, { providerConfigId: CONFIG }, { database, secretBackend: {} as never, routeResolverDeps: {} as never, validateConnection: async () => ({ validated: true as const }), now: () => now, randomId: () => KEY_ONE }),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'TENANT_ACCESS_DENIED',
  );
});

await test('accepts raw key material only for bind or rotate and rejects unbounded budget metadata', async () => {
  const envelope = {
    requestId: NONCE_ONE,
    idempotencyKey: 'provider-bind-001',
    organizationId: ORG,
    workspaceId: WORKSPACE,
    expectedAuthorizationVersion: 8,
    payload: { providerConfigId: CONFIG, providerKey: 'raw-provider-key' },
  };
  assert.equal(parseProviderLifecycleEnvelope({ ...envelope, operation: 'provider.secret.bind' }).operation, 'provider.secret.bind');
  assert.throws(
    () => parseProviderLifecycleEnvelope({ ...envelope, operation: 'provider.register' }),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
  );

  const database: ProviderLifecycleDatabase = { loadConfig: async () => null, transition: async () => ({ status: 'committed' }) };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.register', authority, {
      provider: 'openai',
      displayName: 'Governed OpenAI',
      defaultModel: 'gpt-governed',
      capabilities: ['assess.evidence.extract'],
      budget: { credential: 'must-not-be-accepted' },
    }, {
      database,
      secretBackend: {} as never,
      routeResolverDeps: {} as never,
      validateConnection: async () => ({ validated: true as const }),
      now: () => now,
      randomId: () => KEY_ONE,
    }),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
  );
});

await test('separates organization provider authority from workspace route authority', async () => {
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_EXISTING', status: 'active' },
  };
  const transitions: ProviderLifecycleOperation[] = [];
  const database: ProviderLifecycleDatabase = {
    loadConfig: async () => config,
    transition: async input => { transitions.push(input.operation); return input.execution?.result || { status: 'committed' }; },
  };
  const workspaceOnly: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(),
    organizationRoleNames: new Set(['member']),
    workspaceCapabilities: new Set(['byok.manage']),
  };
  const deps = {
    database,
    secretBackend: { kind: 'environment', writable: false, resolve: async () => 'server-secret' } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => ({ validated: true as const }),
    now: () => now,
    randomId: () => KEY_TWO,
  };
  for (const operation of ['provider.secret.bind', 'provider.validate', 'provider.activate', 'provider.secret.rotate', 'provider.revoke'] as const) {
    await assert.rejects(
      executeProviderLifecycleCommand(operation, workspaceOnly, { providerConfigId: CONFIG }, deps),
      (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED',
    );
  }
  const toggled = await executeProviderLifecycleCommand(
    'provider.route.toggle', workspaceOnly,
    { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: false }, deps,
  );
  assert.equal(toggled.routeId, ROUTE);
  assert.deepEqual(transitions, ['provider.route.toggle']);

  const orgAdmin: ProviderLifecycleAuthority = {
    ...workspaceOnly,
    organizationCapabilities: new Set(['org.admin']),
    organizationRoleNames: new Set(['organization administrator']),
  };
  const activated = await executeProviderLifecycleCommand('provider.activate', orgAdmin, { providerConfigId: CONFIG }, deps);
  assert.equal(activated.status, 'active');
});

await test('hashes raw keys and pre-provisioned references outside receipt material', async () => {
  const rawEnvelope = parseProviderLifecycleEnvelope({
    operation: 'provider.secret.bind', requestId: NONCE_ONE, idempotencyKey: 'provider-bind-hash-001',
    organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 8,
    payload: { providerConfigId: CONFIG, providerKey: 'raw-provider-key-value' },
  });
  const referenceEnvelope = parseProviderLifecycleEnvelope({
    operation: 'provider.secret.bind', requestId: NONCE_TWO, idempotencyKey: 'provider-bind-hash-002',
    organizationId: ORG, workspaceId: WORKSPACE, expectedAuthorizationVersion: 8,
    payload: { providerConfigId: CONFIG, preProvisionedReference: 'AVALA_PROVIDER_SECRET_OPENAI_SAFE_REFERENCE' },
  });
  const rawHash = await providerLifecycleRequestHash(rawEnvelope);
  const replayHash = await providerLifecycleRequestHash({ ...rawEnvelope, requestId: NONCE_TWO });
  const referenceHash = await providerLifecycleRequestHash(referenceEnvelope);
  assert.equal(rawHash, replayHash);
  assert.notEqual(rawHash, referenceHash);
  assert.match(rawHash, /^[0-9a-f]{64}$/);
});

await test('reuses the planned rotation secret, key reference, and validation after a lost database response', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let transitionAttempts = 0; let writes = 0; let validations = 0;
  const secrets = new Map([[oldReference, 'old-secret']]);
  const database: ProviderLifecycleDatabase = {
    loadConfig: async () => structuredClone(config),
    transition: async input => {
      transitionAttempts += 1;
      if (transitionAttempts === 1) throw new Error('response lost after external effect');
      config.keyRef = {
        id: String(input.payload.keyRefId), provider: 'openai', resolverType: 'server_reference',
        secretRef: String(input.payload.secretReference), status: 'active',
      };
      return input.execution?.result || {};
    },
  };
  const secretBackend: ProviderSecretBackend = {
    kind: 'vault', writable: true,
    resolve: async input => secrets.get(input.secretRef),
    write: async input => { writes += 1; secrets.set(input.secretRef, input.value); },
    remove: async input => { secrets.delete(input.secretRef); },
  };
  const ids = [NONCE_ONE, KEY_TWO];
  const execution = {
    receiptId: NONCE_TWO,
    executionToken: NONCE_ONE,
    executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  const deps = {
    database, secretBackend, routeResolverDeps: {} as never,
    validateConnection: async () => { validations += 1; return { validated: true as const }; },
    now: () => now,
    randomId: () => ids.shift() || crypto.randomUUID(),
  };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'one-planned-new-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERSISTENCE_UNAVAILABLE',
  );
  const plannedReference = String(execution.plan.secretReference);
  const plannedKeyRef = String(execution.plan.keyRefId);
  const replay = await executeProviderLifecycleCommand(
    'provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'one-planned-new-secret' }, deps, execution,
  );
  assert.equal(replay.keyRefId, plannedKeyRef);
  assert.equal(config.keyRef?.secretRef, plannedReference);
  assert.deepEqual({writes, validations, transitionAttempts}, {writes: 1, validations: 1, transitionAttempts: 2});
});
