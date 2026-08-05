import assert from 'node:assert/strict';
import {
  executeProviderLifecycleCommand,
  ProviderLifecycleError,
  type ProviderLifecycleAuthority,
  type ProviderLifecycleConfig,
  type ProviderLifecycleDatabase,
  type ProviderLifecycleOperation,
} from './providerLifecycle';
import { fingerprintProviderSecret, type ProviderSecretBackend } from './providerSecretAdapter';
import {
  parseProviderLifecycleEnvelope,
  providerLifecycleRequestHash,
  providerLifecycleStatusForTerminalReceipt,
} from './providerLifecycleEndpoint';

const ORG = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const CONFIG = '44444444-4444-4444-8444-444444444444';
const ROUTE = '55555555-5555-4555-8555-555555555555';
const ORG_ROLE = '55555555-5555-4555-8555-555555555556';
const WORKSPACE_ROLE = '55555555-5555-4555-8555-555555555557';
const OTHER_WORKSPACE_ROLE = '55555555-5555-4555-8555-555555555558';
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
  organizationRoleIds: new Set([ORG_ROLE]),
  workspaceRoleIds: new Set([WORKSPACE_ROLE]),
  eligibleRouteRoleIds: new Set([ORG_ROLE, WORKSPACE_ROLE, OTHER_WORKSPACE_ROLE]),
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
  assert.deepEqual((transitionPayloads[0] as { routes: Array<{ allowedRoles: string[] }> }).routes[0].allowedRoles, [WORKSPACE_ROLE]);
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

await test('accepts only projected exact-scope role ids when enabling a route', async () => {
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_EXISTING', status: 'active' },
  };
  let transitions = 0;
  const deps = {
    database: { loadConfig: async () => config, transition: async () => { transitions += 1; return {}; } },
    secretBackend: { kind: 'environment', writable: false, resolve: async () => 'server-secret' } as ProviderSecretBackend,
    routeResolverDeps: {
      now: () => now, createCorrelationId: () => 'role-policy-test',
      queryRoutes: async () => [{ id: ROUTE, org_id: ORG, workspace_id: WORKSPACE, provider_config_id: CONFIG, capability: 'assess.evidence.extract' as const, model: 'gpt-governed', enabled: false, allowed_roles: [WORKSPACE_ROLE] }],
      queryProviderConfig: async () => ({ id: CONFIG, org_id: ORG, provider: 'openai', key_ref_id: KEY_ONE, allowed_modes: ['pilot'], allowed_operations: ['assess.evidence.extract'], status: 'active', default_model: 'gpt-governed', model_allowlist: ['gpt-governed'], last_validated_at: now.toISOString() }),
      queryProviderKeyRef: async () => ({ id: KEY_ONE, org_id: ORG, provider: 'openai', resolver_type: 'server_reference' as const, referenceSafety: 'reference_only' as const, secret_ref: config.keyRef!.secretRef, status: 'active' }),
      queryUsage: async () => ({ dailyRequests: 0, monthlyTokens: 0 }), isEndpointAllowed: () => true,
    },
    validateConnection: async () => ({ validated: true as const }), now: () => now, randomId: () => KEY_TWO,
  };
  await executeProviderLifecycleCommand('provider.route.toggle', authority, { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: true, allowedRoles: [OTHER_WORKSPACE_ROLE] }, deps);
  await assert.rejects(
    executeProviderLifecycleCommand('provider.route.toggle', authority, { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: true, allowedRoles: ['workspace manager'] }, deps),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
  );
  await assert.rejects(
    executeProviderLifecycleCommand('provider.route.toggle', authority, { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: true, allowedRoles: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }, deps),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
  );
  assert.equal(transitions, 1);
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

await test('does not delete a rejected pre-provisioned rotation reference', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_ENV';
  const nextReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_NEXT_ENV';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let transitions = 0;
  const deps = {
    database: {
      loadConfig: async () => structuredClone(config),
      transition: async () => { transitions += 1; return {}; },
    },
    secretBackend: {
      kind: 'environment', writable: false,
      resolve: async (input: { secretRef: string }) => input.secretRef === nextReference ? 'rejected-environment-secret' : 'old-secret',
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => { throw new Error('deterministic rejection'); },
    now: () => now,
    randomId: () => KEY_TWO,
  };
  await assert.rejects(
    executeProviderLifecycleCommand(
      'provider.secret.rotate', authority,
      {providerConfigId: CONFIG, preProvisionedReference: nextReference}, deps,
    ),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  assert.equal(config.keyRef?.secretRef, oldReference);
  assert.equal(transitions, 0);
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
  const replayHash = await providerLifecycleRequestHash({
    ...rawEnvelope,
    requestId: NONCE_TWO,
    expectedAuthorizationVersion: rawEnvelope.expectedAuthorizationVersion + 1,
  });
  const referenceHash = await providerLifecycleRequestHash(referenceEnvelope);
  assert.equal(rawHash, replayHash);
  assert.notEqual(rawHash, referenceHash);
  assert.notEqual(rawHash, await providerLifecycleRequestHash({
    ...rawEnvelope,
    payload: { ...rawEnvelope.payload, providerKey: 'changed-provider-key-value' },
  }));
  assert.match(rawHash, /^[0-9a-f]{64}$/);
});

await test('replays terminal provider receipts with their stable non-disclosing status', async () => {
  const receipt = (code: string) => ({
    id: NONCE_ONE, request_hash: 'a'.repeat(64), initial_request_id: NONCE_ONE,
    last_request_id: NONCE_TWO, execution_token: NONCE_ONE, execution_fence: 1,
    lease_expires_at: now.toISOString(), status: 'blocked' as const,
    response: {ok: false, error: {code, message: 'The provider lifecycle request could not be completed.'}},
  });
  assert.equal(providerLifecycleStatusForTerminalReceipt(receipt('PERMISSION_DENIED')), 403);
  assert.equal(providerLifecycleStatusForTerminalReceipt({...receipt('VALIDATION_FAILED'), status: 'failed'}), 422);
  assert.equal(providerLifecycleStatusForTerminalReceipt(receipt('PROVIDER_BLOCKED')), 409);
  assert.equal(providerLifecycleStatusForTerminalReceipt(receipt('UNKNOWN')), 409);
});

await test('reuses the planned rotation secret, key reference, and validation after persistence uncertainty', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let transitionAttempts = 0; let writes = 0; let validations = 0; let removals = 0;
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
    remove: async input => { removals += 1; secrets.delete(input.secretRef); },
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
  assert.equal(secrets.get(plannedReference), 'one-planned-new-secret');
  assert.equal(removals, 0);
  const replay = await executeProviderLifecycleCommand(
    'provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'one-planned-new-secret' }, deps, execution,
  );
  assert.equal(replay.keyRefId, plannedKeyRef);
  assert.equal(config.keyRef?.secretRef, plannedReference);
  assert.deepEqual({writes, validations, transitionAttempts, removals}, {writes: 1, validations: 1, transitionAttempts: 2, removals: 1});
});

await test('removes a newly written rotation secret before recording deterministic validation failure', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_VALIDATION';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let writes = 0; let removals = 0; let validations = 0; let transitions = 0;
  const secrets = new Map([[oldReference, 'old-secret']]);
  const execution = {
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  const deps = {
    database: {
      loadConfig: async () => structuredClone(config),
      transition: async () => { transitions += 1; return {}; },
    },
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async (input: { secretRef: string; value: string }) => { writes += 1; secrets.set(input.secretRef, input.value); },
      remove: async (input: { secretRef: string }) => { removals += 1; secrets.delete(input.secretRef); },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => { validations += 1; throw new Error('deterministic rejection'); },
    now: () => now,
    randomId: (() => { const ids = [NONCE_ONE, KEY_TWO]; return () => ids.shift() || crypto.randomUUID(); })(),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'rejected-new-secret' }, deps, execution),
      (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
    );
  }
  assert.deepEqual({writes, removals, validations, transitions}, {writes: 1, removals: 1, validations: 1, transitions: 0});
  assert.equal(secrets.get(oldReference), 'old-secret');
  assert.equal(secrets.has(String(execution.plan.secretReference)), false);
  assert.equal(execution.plan.cleanupRequired, true);
  assert.equal(execution.plan.cleanupCompleted, true);
  assert.doesNotMatch(JSON.stringify(execution.plan), /rejected-new-secret|old-secret/);
});

await test('recovers a managed write when the post-write marker fails and cleans it exactly once after rejection', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_CRASH';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let writes = 0; let removals = 0; let validations = 0; let transitions = 0; let writtenMarkerFailures = 1;
  const secrets = new Map([[oldReference, 'old-secret']]);
  const execution = {
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) {
      if (plan.writeState === 'written' && writtenMarkerFailures > 0) {
        writtenMarkerFailures -= 1;
        throw new Error('post-write plan response unavailable');
      }
      this.plan = structuredClone(plan);
      return this.plan;
    },
  };
  const deps = {
    database: {
      loadConfig: async () => structuredClone(config),
      transition: async () => { transitions += 1; return {}; },
    },
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async (input: { secretRef: string; value: string }) => { writes += 1; secrets.set(input.secretRef, input.value); },
      remove: async (input: { secretRef: string }) => { removals += 1; secrets.delete(input.secretRef); },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => { validations += 1; throw new Error('deterministic rejection'); },
    now: () => now,
    randomId: (() => { const ids = [NONCE_ONE, KEY_TWO]; return () => ids.shift() || crypto.randomUUID(); })(),
  };

  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'crash-window-secret' }, deps, execution),
    /post-write plan response unavailable/,
  );
  const plannedReference = String(execution.plan.secretReference);
  assert.equal(execution.plan.secretOwnership, 'managed_write');
  assert.equal(execution.plan.secretPlanReceiptId, execution.receiptId);
  assert.equal(execution.plan.writeState, 'planned');
  assert.equal(secrets.get(plannedReference), 'crash-window-secret');
  assert.deepEqual({writes, removals, validations, transitions}, {writes: 1, removals: 0, validations: 0, transitions: 0});

  execution.executionFence = 2;
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'crash-window-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'crash-window-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  assert.deepEqual({writes, removals, validations, transitions}, {writes: 1, removals: 1, validations: 1, transitions: 0});
  assert.equal(secrets.get(oldReference), 'old-secret');
  assert.equal(secrets.has(plannedReference), false);
  assert.equal(execution.plan.cleanupCompleted, true);
  assert.doesNotMatch(JSON.stringify(execution.plan), /crash-window-secret|old-secret/);
});

await test('refuses cleanup for mismatched, pre-provisioned, active, or foreign receipt references', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_GUARD';
  const plannedReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_PLANNED_GUARD';
  const secrets = new Map([[oldReference, 'old-secret'], [plannedReference, 'unexpected-secret']]);
  let removals = 0;
  const deps = {
    database: {
      loadConfig: async () => ({
        id: CONFIG, organizationId: ORG, provider: 'openai' as const, status: 'active',
        defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'],
        keyRef: { id: KEY_ONE, provider: 'openai' as const, resolverType: 'server_reference' as const, secretRef: oldReference, status: 'active' },
      }),
      transition: async () => ({}),
    },
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async () => undefined,
      remove: async (input: { secretRef: string }) => { removals += 1; secrets.delete(input.secretRef); },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => ({ validated: true as const }),
    now: () => now,
    randomId: () => KEY_TWO,
  };
  const createExecution = (plan: Record<string, unknown>) => ({
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1, plan,
    async persistPlan(next: Record<string, unknown>) { this.plan = structuredClone(next); return this.plan; },
  });
  const plannedFingerprint = await fingerprintProviderSecret('planned-secret');
  const oldReferenceHash = await fingerprintProviderSecret(oldReference);

  const mismatched = createExecution({
    secretOwnership: 'managed_write', secretPlanReceiptId: NONCE_TWO, writeState: 'planned',
    provider: 'openai', secretReference: plannedReference, keyRefId: KEY_TWO,
    safeFingerprint: plannedFingerprint, protectedSecretReferenceHash: oldReferenceHash,
    cleanupRequired: true, cleanupTerminalCode: 'VALIDATION_FAILED',
  });
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, {providerConfigId: CONFIG, providerKey: 'planned-secret'}, deps, mismatched),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERSISTENCE_UNAVAILABLE',
  );
  assert.equal(removals, 0);

  const preProvisioned = createExecution({
    provider: 'openai', preProvisionedReferenceHash: await fingerprintProviderSecret(plannedReference),
    cleanupRequired: true, cleanupTerminalCode: 'VALIDATION_FAILED',
  });
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, {providerConfigId: CONFIG, preProvisionedReference: plannedReference}, deps, preProvisioned),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  assert.equal(removals, 0);

  const active = createExecution({
    secretOwnership: 'managed_write', secretPlanReceiptId: NONCE_TWO, writeState: 'planned',
    provider: 'openai', secretReference: oldReference, keyRefId: KEY_TWO,
    safeFingerprint: await fingerprintProviderSecret('old-secret'), protectedSecretReferenceHash: oldReferenceHash,
    cleanupRequired: true, cleanupTerminalCode: 'VALIDATION_FAILED',
  });
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, {providerConfigId: CONFIG, providerKey: 'old-secret'}, deps, active),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERSISTENCE_UNAVAILABLE',
  );
  assert.equal(removals, 0);

  const foreign = createExecution({
    secretOwnership: 'managed_write', secretPlanReceiptId: crypto.randomUUID(), writeState: 'planned',
    provider: 'openai', secretReference: plannedReference, keyRefId: KEY_TWO,
    safeFingerprint: await fingerprintProviderSecret('unexpected-secret'),
    cleanupRequired: true, cleanupTerminalCode: 'VALIDATION_FAILED',
  });
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, {providerConfigId: CONFIG, providerKey: 'unexpected-secret'}, deps, foreign),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  assert.equal(removals, 0);
  assert.equal(secrets.get(oldReference), 'old-secret');
  assert.equal(secrets.get(plannedReference), 'unexpected-secret');
});

await test('allows one fenced cleanup recovery worker and rejects a concurrent stale worker without duplicate deletion', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_RECOVERY';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let writes = 0; let removeAttempts = 0; let successfulRemovals = 0; let validations = 0; let transitions = 0;
  const secrets = new Map([[oldReference, 'old-secret']]);
  const execution = {
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  const deps = {
    database: {
      loadConfig: async () => structuredClone(config),
      transition: async () => { transitions += 1; return {}; },
    },
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async (input: { secretRef: string; value: string }) => { writes += 1; secrets.set(input.secretRef, input.value); },
      remove: async (input: { secretRef: string }) => {
        removeAttempts += 1;
        if (removeAttempts === 1) throw new Error('cleanup unavailable');
        if (secrets.delete(input.secretRef)) successfulRemovals += 1;
      },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => { validations += 1; throw new Error('deterministic rejection'); },
    now: () => now,
    randomId: (() => { const ids = [NONCE_ONE, KEY_TWO]; return () => ids.shift() || crypto.randomUUID(); })(),
  };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'cleanup-recovery-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERSISTENCE_UNAVAILABLE',
  );
  assert.equal(execution.plan.cleanupRequired, true);
  const staleExecution = {
    ...execution,
    plan: structuredClone(execution.plan),
    async persistPlan() { throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE'); },
  };
  execution.executionFence = 2;
  const concurrent = await Promise.allSettled([
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'cleanup-recovery-secret' }, deps, execution),
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'cleanup-recovery-secret' }, deps, staleExecution),
  ]);
  assert.deepEqual(
    concurrent.map(result => result.status === 'rejected' && result.reason instanceof ProviderLifecycleError
      ? result.reason.code : result.status).sort(),
    ['PERSISTENCE_UNAVAILABLE', 'VALIDATION_FAILED'],
  );
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'cleanup-recovery-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'VALIDATION_FAILED',
  );
  assert.deepEqual(
    {writes, removeAttempts, successfulRemovals, validations, transitions},
    {writes: 1, removeAttempts: 2, successfulRemovals: 1, validations: 1, transitions: 0},
  );
  assert.equal(secrets.get(oldReference), 'old-secret');
});

await test('retains one rotation plan across authorization-version recovery and cleans it if authority is removed', async () => {
  const oldReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_OLD_AUTH';
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'active',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], lastValidatedAt: now.toISOString(),
    keyRef: { id: KEY_ONE, provider: 'openai', resolverType: 'server_reference', secretRef: oldReference, status: 'active' },
  };
  let writes = 0; let removals = 0; let validations = 0; let transitions = 0;
  const secrets = new Map([[oldReference, 'old-secret']]);
  let stale = true;
  const database: ProviderLifecycleDatabase = {
    loadConfig: async () => structuredClone(config),
    transition: async input => {
      transitions += 1;
      if (stale) throw new Error('ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE');
      config.keyRef = {
        id: String(input.payload.keyRefId), provider: 'openai', resolverType: 'server_reference',
        secretRef: String(input.payload.secretReference), status: 'active',
      };
      return input.execution?.result || {};
    },
  };
  const execution = {
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  const deps = {
    database,
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async (input: { secretRef: string; value: string }) => { writes += 1; secrets.set(input.secretRef, input.value); },
      remove: async (input: { secretRef: string }) => { removals += 1; secrets.delete(input.secretRef); },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => { validations += 1; return { validated: true as const }; },
    now: () => now,
    randomId: (() => { const ids = [NONCE_ONE, KEY_TWO]; return () => ids.shift() || crypto.randomUUID(); })(),
  };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'authorization-retry-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'AUTHORIZATION_STALE',
  );
  const plannedReference = String(execution.plan.secretReference);
  const plannedKeyRef = String(execution.plan.keyRefId);
  assert.equal(secrets.get(plannedReference), 'authorization-retry-secret');
  stale = false;
  execution.executionFence = 2;
  const recovered = await executeProviderLifecycleCommand(
    'provider.secret.rotate', {...authority, authorizationVersion: 9},
    { providerConfigId: CONFIG, providerKey: 'authorization-retry-secret' }, deps, execution,
  );
  assert.equal(recovered.keyRefId, plannedKeyRef);
  assert.equal(config.keyRef?.secretRef, plannedReference);
  assert.deepEqual({writes, validations, transitions, removals}, {writes: 1, validations: 1, transitions: 2, removals: 1});

  const uncommittedReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_UNCOMMITTED';
  secrets.set(uncommittedReference, 'uncommitted-secret');
  const removedExecution = {
    receiptId: crypto.randomUUID(), executionToken: crypto.randomUUID(), executionFence: 2,
    plan: {
      provider: 'openai', secretReference: uncommittedReference, keyRefId: crypto.randomUUID(),
      safeFingerprint: await fingerprintProviderSecret('uncommitted-secret'),
      secretOwnership: 'managed_write', writeState: 'written',
      validationSucceeded: true, lastValidatedAt: now.toISOString(),
    } as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  removedExecution.plan.secretPlanReceiptId = removedExecution.receiptId;
  const noAuthority = {
    ...authority,
    authorizationVersion: 10,
    organizationCapabilities: new Set<string>(),
  };
  const transitionsBeforeRemoval = transitions;
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', noAuthority, { providerConfigId: CONFIG, providerKey: 'uncommitted-secret' }, deps, removedExecution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED',
  );
  assert.equal(transitions, transitionsBeforeRemoval);
  assert.equal(secrets.has(uncommittedReference), false);
  assert.equal(secrets.get(plannedReference), 'authorization-retry-secret');
  const removalsAfterBlocked = removals;
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.rotate', noAuthority, { providerConfigId: CONFIG, providerKey: 'uncommitted-secret' }, deps, removedExecution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED',
  );
  assert.equal(removals, removalsAfterBlocked);
  assert.doesNotMatch(JSON.stringify(removedExecution.plan), /uncommitted-secret|authorization-retry-secret|old-secret/);
});

await test('reuses one bind secret and key-reference plan after authorization-version change', async () => {
  const config: ProviderLifecycleConfig = {
    id: CONFIG, organizationId: ORG, provider: 'openai', status: 'pending_review',
    defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], keyRef: null,
  };
  let stale = true; let writes = 0; let transitions = 0; let removals = 0;
  const secrets = new Map<string, string>();
  const database: ProviderLifecycleDatabase = {
    loadConfig: async () => structuredClone(config),
    transition: async input => {
      transitions += 1;
      if (stale) throw new Error('ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE');
      config.keyRef = {
        id: String(input.payload.keyRefId), provider: 'openai', resolverType: 'server_reference',
        secretRef: String(input.payload.secretReference), status: 'active',
      };
      return input.execution?.result || {};
    },
  };
  const execution = {
    receiptId: NONCE_TWO, executionToken: NONCE_ONE, executionFence: 1,
    plan: {} as Record<string, unknown>,
    async persistPlan(plan: Record<string, unknown>) { this.plan = structuredClone(plan); return this.plan; },
  };
  const deps = {
    database,
    secretBackend: {
      kind: 'vault', writable: true,
      resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
      write: async (input: { secretRef: string; value: string }) => { writes += 1; secrets.set(input.secretRef, input.value); },
      remove: async (input: { secretRef: string }) => { removals += 1; secrets.delete(input.secretRef); },
    } as ProviderSecretBackend,
    routeResolverDeps: {} as never,
    validateConnection: async () => ({ validated: true as const }),
    now: () => now,
    randomId: (() => { const ids = [NONCE_ONE, KEY_TWO]; return () => ids.shift() || crypto.randomUUID(); })(),
  };
  await assert.rejects(
    executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, providerKey: 'authorization-bind-secret' }, deps, execution),
    (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'AUTHORIZATION_STALE',
  );
  const plannedReference = String(execution.plan.secretReference);
  const plannedKeyRef = String(execution.plan.keyRefId);
  stale = false;
  execution.executionFence = 2;
  const rebound = await executeProviderLifecycleCommand(
    'provider.secret.bind', {...authority, authorizationVersion: 9},
    { providerConfigId: CONFIG, providerKey: 'authorization-bind-secret' }, deps, execution,
  );
  assert.equal(rebound.keyRefId, plannedKeyRef);
  assert.equal(config.keyRef?.secretRef, plannedReference);
  assert.deepEqual({writes, transitions, removals}, {writes: 1, transitions: 2, removals: 0});
  assert.doesNotMatch(JSON.stringify(execution.plan), /authorization-bind-secret/);
});
