import assert from 'node:assert/strict';
import {
  assertProviderLifecycleOperationAuthority,
  executeProviderLifecycleCommand,
  mapProviderLifecycleRpcError,
  ProviderLifecycleError,
  type ProviderLifecycleAuthority,
  type ProviderLifecycleConfig,
  type ProviderLifecycleDatabase,
  type ProviderLifecycleOperation,
} from './providerLifecycle';
import {
  fingerprintProviderSecret,
  VaultProviderSecretBackend,
  type ProviderSecretBackend,
} from './providerSecretAdapter';
import { SupabaseRpcError } from './supabase';
import {
  handleProviderLifecycleAuthorityRecheckRequest,
  handleProviderLifecycleRecoveryRequest,
  handleProviderLifecycleRequest,
  parseProviderLifecycleAuthorityRecheckEnvelope,
  parseProviderLifecycleRecoveryEnvelope,
  parseProviderLifecycleEnvelope,
  providerLifecycleRequestHash,
  providerLifecycleStatusForTerminalReceipt,
} from './providerLifecycleEndpoint';
import { EnterpriseReceiptError, type EnterpriseReceiptRow } from './enterpriseReceipt';

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

const systemicProviderOperations: ProviderLifecycleOperation[] = [
  'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate',
  'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
];

const test = async (name: string, callback: () => Promise<void>) => {
  try { await callback(); console.log(`ok - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
};

await test('Vault managed-secret deletion forwards the cleanup abort signal', async () => {
  const controller = new AbortController();
  let observedSignal: AbortSignal | null | undefined;
  const backend = new VaultProviderSecretBackend(
    'https://vault.example.test',
    'fixture-token',
    'secret/data/avala/provider-secrets',
    async (_input, init) => {
      observedSignal = init?.signal;
      return new Response(null, { status: 204 });
    },
  );
  await backend.remove({
    provider: 'openai',
    secretRef: 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_ABORT_SIGNAL',
    organizationId: ORG,
    signal: controller.signal,
  });
  assert.equal(observedSignal, controller.signal);
});

await test('maps only structured provider RPC domain signals', async () => {
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  })).code, 'AUTHORIZATION_STALE');
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 403, databaseMessage: 'ENTERPRISE_PROVIDER_ORGANIZATION_AUTHORITY_REQUIRED',
  })).code, 'PERMISSION_DENIED');
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_AI_EXECUTION_PLAN_CONFLICT',
  })).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
  })).code, 'COMMAND_IN_PROGRESS');
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 503, databaseMessage: 'ENTERPRISE_INTELLIGENCE_PROVIDER_DISABLED',
  })).code, 'PROVIDER_BLOCKED');
  assert.equal(mapProviderLifecycleRpcError(new SupabaseRpcError({
    status: 500, databaseMessage: 'raw sql should not survive',
  })).code, 'PERSISTENCE_UNAVAILABLE');
});

await test('reauthorizes provider receipt disclosure with operation-specific authority', async () => {
  assert.doesNotThrow(() => assertProviderLifecycleOperationAuthority('provider.route.toggle', authority));
  assert.doesNotThrow(() => assertProviderLifecycleOperationAuthority('provider.secret.rotate', authority));
  const revoked: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(),
    workspaceCapabilities: new Set(),
  };
  for (const operation of [
    'provider.register', 'provider.secret.bind', 'provider.validate', 'provider.activate',
    'provider.route.toggle', 'provider.secret.rotate', 'provider.revoke',
  ] as ProviderLifecycleOperation[]) {
    assert.throws(
      () => assertProviderLifecycleOperationAuthority(operation, revoked),
      (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'PERMISSION_DENIED',
    );
  }
});

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

  const results: Array<Record<string, unknown>> = [];
  const registration = await executeProviderLifecycleCommand('provider.register', authority, { provider: 'openai', displayName: 'Governed OpenAI', defaultModel: 'gpt-governed', modelAllowlist: ['gpt-governed'], capabilities: ['assess.evidence.extract'] }, deps);
  results.push(registration);
  assert.equal(registration.providerConfigId, CONFIG);
  assert.deepEqual((transitionPayloads[0] as { routes: Array<{ allowedRoles: string[] }> }).routes[0].allowedRoles, [WORKSPACE_ROLE]);
  results.push(await executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, providerKey: 'raw-provider-key-one' }, deps));
  assert.equal(config?.keyRef?.id, KEY_ONE);
  results.push(await executeProviderLifecycleCommand('provider.validate', authority, { providerConfigId: CONFIG }, deps));
  results.push(await executeProviderLifecycleCommand('provider.activate', authority, { providerConfigId: CONFIG }, deps));
  results.push(await executeProviderLifecycleCommand('provider.route.toggle', authority, { providerConfigId: CONFIG, routeId: ROUTE, capability: 'assess.evidence.extract', enabled: true }, deps));
  assert.equal(route.enabled, true);
  results.push(await executeProviderLifecycleCommand('provider.secret.rotate', authority, { providerConfigId: CONFIG, providerKey: 'raw-provider-key-two' }, deps));
  assert.equal(config?.keyRef?.id, KEY_TWO);
  assert.equal(removed.length, 1);
  results.push(await executeProviderLifecycleCommand('provider.revoke', authority, { providerConfigId: CONFIG }, deps));
  assert.equal(config?.status, 'retired');
  assert.equal(route.enabled, false);
  assert.equal(JSON.stringify(transitionPayloads).includes('raw-provider-key'), false);
  assert.match(String(config?.keyRef?.safeFingerprint), /^sha256:[0-9a-f]{24}$/);
  for (const result of results) {
    assert.equal(result.resourceId, CONFIG);
    assert.equal(result.providerConfigId, CONFIG);
  }
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
  const exact = [
    ['INVALID_REQUEST', 400], ['PERMISSION_DENIED', 403], ['RESOURCE_NOT_FOUND', 404],
    ['RESOURCE_CONFLICT', 409], ['PERSISTENCE_UNAVAILABLE', 503],
  ] as const;
  for (const [code, status] of exact) assert.equal(providerLifecycleStatusForTerminalReceipt(receipt(code)), status);
});

await test('provider lifecycle authority recheck uses exact operation and scope authority', async () => {
  const organizationSecurityOnly: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(['security.manage']),
    workspaceCapabilities: new Set(),
  };
  const organizationByokOnly: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(['byok.manage']),
    workspaceCapabilities: new Set(),
  };
  const organizationCombined: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(['byok.manage', 'security.manage']),
    workspaceCapabilities: new Set(),
  };
  const workspaceSecurityOnly: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(),
    workspaceCapabilities: new Set(['security.manage']),
  };
  const organizationAdmin: ProviderLifecycleAuthority = {
    ...authority,
    organizationCapabilities: new Set(['org.admin']),
    workspaceCapabilities: new Set(),
  };
  const expected = new Map<ProviderLifecycleOperation, Array<[ProviderLifecycleAuthority, boolean]>>([
    ['provider.register', [[organizationSecurityOnly, true], [organizationByokOnly, true], [workspaceSecurityOnly, false]]],
    ['provider.validate', [[organizationSecurityOnly, true], [organizationByokOnly, true], [workspaceSecurityOnly, false]]],
    ['provider.activate', [[organizationSecurityOnly, true], [organizationByokOnly, true], [workspaceSecurityOnly, false]]],
    ['provider.route.toggle', [[organizationSecurityOnly, false], [organizationByokOnly, false], [workspaceSecurityOnly, true]]],
    ['provider.secret.bind', [[organizationSecurityOnly, false], [organizationByokOnly, false], [organizationCombined, true]]],
    ['provider.secret.rotate', [[organizationSecurityOnly, false], [organizationByokOnly, false], [organizationCombined, true]]],
    ['provider.revoke', [[organizationSecurityOnly, false], [organizationByokOnly, false], [organizationCombined, true]]],
  ]);
  const selector = (operation: ProviderLifecycleOperation) => ({
    operation,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    ...(operation === 'provider.register' ? {} : { providerConfigId: CONFIG }),
    ...(operation === 'provider.route.toggle' ? { routeId: ROUTE } : {}),
  });
  for (const operation of systemicProviderOperations) {
    for (const [current, authorized] of expected.get(operation) || []) {
      const response = await handleProviderLifecycleAuthorityRecheckRequest(
        new Request('https://example.test/enterprise-provider-lifecycle-authority', {
          method: 'POST',
          body: JSON.stringify(selector(operation)),
        }),
        { authenticate: async () => current },
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { authorized, authorizationVersion: current.authorizationVersion });
    }
    const adminResponse = await handleProviderLifecycleAuthorityRecheckRequest(
      new Request('https://example.test/enterprise-provider-lifecycle-authority', {
        method: 'POST',
        body: JSON.stringify(selector(operation)),
      }),
      { authenticate: async () => organizationAdmin },
    );
    assert.deepEqual(await adminResponse.json(), { authorized: true, authorizationVersion: organizationAdmin.authorizationVersion });
  }
});

await test('provider lifecycle authority recheck accepts safe selectors only', async () => {
  assert.deepEqual(parseProviderLifecycleAuthorityRecheckEnvelope({
    operation: 'provider.route.toggle', organizationId: ORG, workspaceId: WORKSPACE,
    providerConfigId: CONFIG, routeId: ROUTE,
  }), {
    operation: 'provider.route.toggle', organizationId: ORG, workspaceId: WORKSPACE,
    providerConfigId: CONFIG, routeId: ROUTE,
  });
  for (const invalid of [
    { operation: 'provider.secret.bind', organizationId: ORG, workspaceId: WORKSPACE, providerConfigId: CONFIG, providerKey: 'must-not-enter-recheck' },
    { operation: 'provider.register', organizationId: ORG, workspaceId: WORKSPACE, providerConfigId: CONFIG },
    { operation: 'provider.route.toggle', organizationId: ORG, workspaceId: WORKSPACE, providerConfigId: CONFIG },
    { operation: 'provider.validate', organizationId: ORG, workspaceId: WORKSPACE },
  ]) {
    assert.throws(
      () => parseProviderLifecycleAuthorityRecheckEnvelope(invalid),
      (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
    );
  }
});

await test('provider lifecycle recovery accepts only raw-key-free bind and rotate action identity', async () => {
  const expected = {
    operation: 'provider.secret.rotate' as const,
    organizationId: ORG,
    workspaceId: WORKSPACE,
    providerConfigId: CONFIG,
    requestId: NONCE_ONE,
    idempotencyKey: 'provider-rotate-recovery-001',
  };
  assert.deepEqual(parseProviderLifecycleRecoveryEnvelope(expected), expected);
  for (const invalid of [
    { ...expected, operation: 'provider.validate' },
    { ...expected, providerKey: 'must-never-enter-recovery' },
    { ...expected, secretReference: 'server-plan-only' },
    { ...expected, safeFingerprint: 'server-plan-only' },
    { ...expected, executionFence: 2 },
  ]) {
    assert.throws(
      () => parseProviderLifecycleRecoveryEnvelope(invalid),
      (error: unknown) => error instanceof ProviderLifecycleError && error.code === 'INVALID_REQUEST',
    );
  }
});

await test('revoked bind and rotate recover managed writes once without a raw-key mutation', async () => {
  for (const [index, operation] of (['provider.secret.bind', 'provider.secret.rotate'] as const).entries()) {
    const receiptId = index === 0 ? NONCE_ONE : NONCE_TWO;
    const requestId = index === 0 ? NONCE_TWO : NONCE_ONE;
    const secretReference = `AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_RECOVERY_${index}`;
    const secretValue = `revoked-recovery-secret-${index}`;
    const secrets = new Map([[secretReference, secretValue]]);
    let removals = 0;
    let finalizations = 0;
    let terminalResponseLost = true;
    const receipt: EnterpriseReceiptRow = {
      id: receiptId,
      request_hash: String(index + 1).repeat(64),
      initial_request_id: requestId,
      last_request_id: requestId,
      execution_token: KEY_ONE,
      execution_fence: 2,
      lease_expires_at: now.toISOString(),
      status: 'claimed',
      execution_plan: {
        providerConfigId: CONFIG,
        provider: 'openai',
        secretOwnership: 'managed_write',
        secretPlanReceiptId: receiptId,
        secretReference,
        safeFingerprint: await fingerprintProviderSecret(secretValue),
        keyRefId: KEY_TWO,
        writeState: 'written',
        ...(operation === 'provider.secret.rotate'
          ? { protectedSecretReferenceHash: await fingerprintProviderSecret('prior-active-reference') }
          : {}),
        cleanupRequired: true,
        cleanupTerminalCode: 'PERMISSION_DENIED',
      },
    };
    const deps = {
      database: { loadConfig: async () => null, transition: async () => { throw new Error('mutation must not run'); } },
      secretBackend: {
        kind: 'vault', writable: true,
        resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
        write: async () => { throw new Error('write must not run'); },
        remove: async (input: { secretRef: string }) => { if (secrets.delete(input.secretRef)) removals += 1; },
      } as ProviderSecretBackend,
      routeResolverDeps: {} as never,
      validateConnection: async () => { throw new Error('validation must not run'); },
      now: () => now,
      randomId: () => crypto.randomUUID(),
    };
    const envelope = {
      operation,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      providerConfigId: CONFIG,
      requestId,
      idempotencyKey: `provider-revoked-recovery-${index + 1}`,
    };
    const request = () => new Request('https://example.test/enterprise-provider-lifecycle-recovery', {
      method: 'POST', body: JSON.stringify(envelope),
    });
    const overrides = {
      authenticateActor: async () => ({ id: ACTOR }),
      claimRecoveryReceipt: async () => ({ receipt, ownsExecution: receipt.status === 'claimed' }),
      persistPlan: async (_receipt: EnterpriseReceiptRow, _scope: unknown, plan: Record<string, unknown>) => {
        receipt.execution_plan = structuredClone(plan);
        return receipt;
      },
      renewCleanupLease: async () => undefined,
      failReceipt: async (_receipt: EnterpriseReceiptRow, _scope: unknown, response: Record<string, unknown>) => {
        finalizations += 1;
        receipt.status = 'blocked';
        receipt.response = structuredClone(response);
        if (terminalResponseLost) {
          terminalResponseLost = false;
          throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED');
        }
        return receipt;
      },
      deps,
    };
    const lost = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(lost.status, 503);
    const replay = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), { ok: true, terminal: true });
    assert.equal(removals, 1);
    assert.equal(finalizations, 1);
    assert.equal(secrets.size, 0);
    assert.equal(receipt.status, 'blocked');
    assert.equal(receipt.execution_plan?.cleanupCompleted, true);
    assert.equal(JSON.stringify({ envelope, response: receipt.response }).includes(secretValue), false);
  }
});

await test('slow bind and rotate cleanup keeps one fenced delete owner beyond one second', async () => {
  for (const [index, operation] of (['provider.secret.bind', 'provider.secret.rotate'] as const).entries()) {
    const receiptId = index === 0 ? NONCE_ONE : NONCE_TWO;
    const secretReference = `AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_SLOW_${index}`;
    const secretValue = `slow-cleanup-secret-${index}`;
    const secrets = new Map([[secretReference, secretValue]]);
    let deleteCalls = 0;
    let releaseDelete = () => undefined;
    let deleteStarted = () => undefined;
    const started = new Promise<void>(resolve => { deleteStarted = resolve; });
    const blockedDelete = new Promise<void>(resolve => { releaseDelete = resolve; });
    const receipt: EnterpriseReceiptRow = {
      id: receiptId, request_hash: 'a'.repeat(64), initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE, execution_token: KEY_ONE, execution_fence: 2,
      lease_expires_at: new Date(now.getTime() + 45_000).toISOString(), status: 'claimed',
      execution_plan: {
        providerConfigId: CONFIG, provider: 'openai', secretOwnership: 'managed_write',
        secretPlanReceiptId: receiptId, secretReference,
        safeFingerprint: await fingerprintProviderSecret(secretValue), keyRefId: KEY_TWO,
        writeState: 'written', cleanupRequired: true, cleanupTerminalCode: 'PERMISSION_DENIED',
        ...(operation === 'provider.secret.rotate'
          ? { protectedSecretReferenceHash: await fingerprintProviderSecret('prior-active-reference') }
          : {}),
      },
    };
    const envelope = {
      operation, organizationId: ORG, workspaceId: WORKSPACE, providerConfigId: CONFIG,
      requestId: NONCE_ONE, idempotencyKey: `slow-cleanup-${index + 1}`,
    };
    const request = () => new Request('https://example.test/recovery', { method: 'POST', body: JSON.stringify(envelope) });
    let claimCalls = 0;
    const overrides = {
      authenticateActor: async () => ({ id: ACTOR }),
      claimRecoveryReceipt: async () => {
        claimCalls += 1;
        return { receipt, ownsExecution: receipt.status === 'claimed' && claimCalls === 1 };
      },
      persistPlan: async (_receipt: EnterpriseReceiptRow, _scope: unknown, plan: Record<string, unknown>) => {
        receipt.execution_plan = structuredClone(plan);
        return receipt;
      },
      renewCleanupLease: async () => {
        receipt.lease_expires_at = new Date(Date.now() + 45_000).toISOString();
      },
      failReceipt: async (_receipt: EnterpriseReceiptRow, _scope: unknown, response: Record<string, unknown>) => {
        receipt.status = 'blocked'; receipt.response = structuredClone(response); return receipt;
      },
      deps: {
        database: { loadConfig: async () => null, transition: async () => ({}) },
        secretBackend: {
          kind: 'vault', writable: true,
          resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
          remove: async (input: { secretRef: string; signal: AbortSignal }) => {
            deleteCalls += 1; deleteStarted();
            await blockedDelete;
            if (input.signal.aborted) throw new Error('aborted');
            secrets.delete(input.secretRef);
          },
        } as ProviderSecretBackend,
        routeResolverDeps: {} as never,
        validateConnection: async () => ({ validated: true as const }),
        now: () => now, randomId: () => crypto.randomUUID(), secretDeleteTimeoutMs: 5_000,
      },
    };
    const first = handleProviderLifecycleRecoveryRequest(request(), overrides);
    await started;
    await new Promise(resolve => setTimeout(resolve, 1_100));
    const concurrent = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(concurrent.status, 409);
    assert.equal((await concurrent.json() as { error: { code: string } }).error.code, 'COMMAND_IN_PROGRESS');
    assert.equal(deleteCalls, 1);
    releaseDelete();
    assert.equal((await first).status, 200);
    assert.equal(receipt.status, 'blocked');
    assert.equal(secrets.size, 0);
    assert.equal(deleteCalls, 1);
  }
});

await test('timed-out cleanup aborts before fenced takeover and terminal replay adds no delete', async () => {
  for (const [index, operation] of (['provider.secret.bind', 'provider.secret.rotate'] as const).entries()) {
    const receiptId = index === 0 ? NONCE_ONE : NONCE_TWO;
    const secretReference = `AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_TIMEOUT_${index}`;
    const secretValue = `timeout-cleanup-secret-${index}`;
    const secrets = new Map([[secretReference, secretValue]]);
    let deleteAttempts = 0;
    let successfulDeletes = 0;
    let abortedDeletes = 0;
    const receipt: EnterpriseReceiptRow = {
      id: receiptId, request_hash: 'b'.repeat(64), initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE, execution_token: KEY_ONE, execution_fence: 2,
      lease_expires_at: new Date(now.getTime() + 45_000).toISOString(), status: 'claimed',
      execution_plan: {
        providerConfigId: CONFIG, provider: 'openai', secretOwnership: 'managed_write',
        secretPlanReceiptId: receiptId, secretReference,
        safeFingerprint: await fingerprintProviderSecret(secretValue), keyRefId: KEY_TWO,
        writeState: 'written', cleanupRequired: true, cleanupTerminalCode: 'PERMISSION_DENIED',
        ...(operation === 'provider.secret.rotate'
          ? { protectedSecretReferenceHash: await fingerprintProviderSecret('prior-active-reference') }
          : {}),
      },
    };
    const envelope = {
      operation, organizationId: ORG, workspaceId: WORKSPACE, providerConfigId: CONFIG,
      requestId: NONCE_ONE, idempotencyKey: `timeout-cleanup-${index + 1}`,
    };
    const request = () => new Request('https://example.test/recovery', { method: 'POST', body: JSON.stringify(envelope) });
    let claims = 0;
    const overrides = {
      authenticateActor: async () => ({ id: ACTOR }),
      claimRecoveryReceipt: async () => {
        claims += 1;
        if (receipt.status === 'blocked') return { receipt, ownsExecution: false };
        if (claims > 1) {
          receipt.execution_token = KEY_TWO;
          receipt.execution_fence += 1;
        }
        return { receipt, ownsExecution: true };
      },
      persistPlan: async (_receipt: EnterpriseReceiptRow, _scope: unknown, plan: Record<string, unknown>) => {
        receipt.execution_plan = structuredClone(plan);
        return receipt;
      },
      renewCleanupLease: async () => {
        receipt.lease_expires_at = new Date(Date.now() + 45_000).toISOString();
      },
      failReceipt: async (_receipt: EnterpriseReceiptRow, _scope: unknown, response: Record<string, unknown>) => {
        receipt.status = 'blocked'; receipt.response = structuredClone(response); return receipt;
      },
      deps: {
        database: { loadConfig: async () => null, transition: async () => ({}) },
        secretBackend: {
          kind: 'vault', writable: true,
          resolve: async (input: { secretRef: string }) => secrets.get(input.secretRef),
          remove: async (input: { secretRef: string; signal: AbortSignal }) => {
            deleteAttempts += 1;
            if (deleteAttempts === 1) {
              await new Promise<void>((_resolve, reject) => {
                input.signal.addEventListener('abort', () => { abortedDeletes += 1; reject(new Error('aborted')); }, { once: true });
              });
              return;
            }
            if (input.signal.aborted) throw new Error('aborted');
            if (secrets.delete(input.secretRef)) successfulDeletes += 1;
          },
        } as ProviderSecretBackend,
        routeResolverDeps: {} as never,
        validateConnection: async () => ({ validated: true as const }),
        now: () => now, randomId: () => crypto.randomUUID(), secretDeleteTimeoutMs: 20,
      },
    };
    const timedOut = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(timedOut.status, 503);
    assert.deepEqual({ deleteAttempts, abortedDeletes, successfulDeletes },
      { deleteAttempts: 1, abortedDeletes: 1, successfulDeletes: 0 });
    assert.equal(secrets.size, 1);
    const recovered = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(recovered.status, 200);
    assert.equal(receipt.status, 'blocked');
    assert.equal(secrets.size, 0);
    const replay = await handleProviderLifecycleRecoveryRequest(request(), overrides);
    assert.equal(replay.status, 200);
    assert.deepEqual({ deleteAttempts, abortedDeletes, successfulDeletes },
      { deleteAttempts: 2, abortedDeletes: 1, successfulDeletes: 1 });
  }
});

await test('all provider operations replay persisted 400/403/404/409/503 HTTP contracts exactly', async () => {
  const statuses = [
    ['INVALID_REQUEST', 400], ['PERMISSION_DENIED', 403], ['RESOURCE_NOT_FOUND', 404],
    ['RESOURCE_CONFLICT', 409], ['PERSISTENCE_UNAVAILABLE', 503],
  ] as const;
  for (const [operationIndex, operation] of systemicProviderOperations.entries()) {
    for (const [statusIndex, [code, expectedStatus]] of statuses.entries()) {
      const envelope = {
        operation, requestId: NONCE_ONE, idempotencyKey: `provider-http-${operationIndex + 1}-${statusIndex + 1}`,
        organizationId: ORG, workspaceId: WORKSPACE,
        expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
      };
      const persistedBody = {
        ok: false,
        error: { code, message: 'The provider lifecycle request could not be completed.' },
      };
      const receipt: EnterpriseReceiptRow = {
        id: NONCE_TWO, request_hash: '2'.repeat(64), initial_request_id: NONCE_ONE,
        last_request_id: NONCE_ONE, execution_token: NONCE_TWO, execution_fence: 1,
        lease_expires_at: now.toISOString(), status: code === 'PERMISSION_DENIED' ? 'blocked' : 'failed',
        response: persistedBody,
      };
      let executions = 0;
      const response = await handleProviderLifecycleRequest(
        new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) }),
        {
          authenticate: async () => authority,
          claimReceipt: async () => ({ receipt, ownsExecution: false }),
          executeCommand: async () => { executions += 1; return {}; },
        },
      );
      assert.equal(response.status, expectedStatus);
      assert.deepEqual((await response.json() as { error?: unknown }).error, persistedBody.error);
      assert.equal(executions, 0);
    }
  }
});

await test('terminal provider replays require current operation authority across all lifecycle operations', async () => {
  for (const [index, operation] of systemicProviderOperations.entries()) {
    const envelope = {
      operation,
      requestId: NONCE_ONE,
      idempotencyKey: `provider-replay-${index + 1}`,
      organizationId: ORG,
      workspaceId: WORKSPACE,
      expectedAuthorizationVersion: authority.authorizationVersion,
      payload: {},
    };
    const receipt: EnterpriseReceiptRow = {
      id: NONCE_TWO,
      request_hash: 'a'.repeat(64),
      initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE,
      execution_token: NONCE_TWO,
      execution_fence: 1,
      lease_expires_at: now.toISOString(),
      status: 'committed',
      resource_id: CONFIG,
      response: { resourceId: CONFIG, providerConfigId: CONFIG, historicalProviderMarker: true },
    };
    const revoked: ProviderLifecycleAuthority = {
      ...authority,
      organizationCapabilities: new Set(),
      workspaceCapabilities: new Set(),
    };
    let authCalls = 0;
    let claims = 0;
    const denied = await handleProviderLifecycleRequest(
      new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) }),
      {
        authenticate: async () => (++authCalls === 1 ? authority : revoked),
        claimReceipt: async () => { claims += 1; return { receipt, ownsExecution: false }; },
      },
    );
    assert.equal(denied.status, 403);
    assert.equal((await denied.text()).includes('historicalProviderMarker'), false);
    assert.deepEqual({ authCalls, claims }, { authCalls: 2, claims: 1 });

    authCalls = 0;
    claims = 0;
    const restored = await handleProviderLifecycleRequest(
      new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) }),
      {
        authenticate: async () => { authCalls += 1; return { ...authority, authorizationVersion: authority.authorizationVersion + 1 }; },
        claimReceipt: async () => { claims += 1; return { receipt, ownsExecution: false }; },
      },
    );
    assert.equal(restored.status, 200);
    assert.equal((await restored.json() as { historicalProviderMarker?: boolean }).historicalProviderMarker, true);
    assert.deepEqual({ authCalls, claims }, { authCalls: 2, claims: 1 });
  }
});

await test('all provider operations protect every terminal and in-progress replay state', async () => {
  for (const [index, operation] of systemicProviderOperations.entries()) {
    for (const status of ['committed', 'failed', 'blocked', 'claimed'] as const) {
      const envelope = {
        operation, requestId: NONCE_ONE,
        idempotencyKey: `provider-state-${status}-${index + 1}`,
        organizationId: ORG, workspaceId: WORKSPACE,
        expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
      };
      const response = status === 'committed'
        ? { resourceId: CONFIG, providerConfigId: CONFIG, providerStateMarker: true }
        : status === 'claimed' ? undefined
          : { ok: false, error: { code: status === 'failed' ? 'VALIDATION_FAILED' : 'PROVIDER_BLOCKED', message: 'providerStateMarker' } };
      const receipt: EnterpriseReceiptRow = {
        id: NONCE_TWO, request_hash: 'd'.repeat(64), initial_request_id: NONCE_ONE,
        last_request_id: NONCE_ONE, execution_token: NONCE_TWO, execution_fence: 1,
        lease_expires_at: now.toISOString(), status, resource_id: status === 'committed' ? CONFIG : undefined,
        response,
      };
      const snapshot = JSON.stringify(receipt);
      const request = () => new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) });
      let authCalls = 0;
      const revoked = { ...authority, organizationCapabilities: new Set<string>(), workspaceCapabilities: new Set<string>() };
      const denied = await handleProviderLifecycleRequest(request(), {
        authenticate: async () => (++authCalls === 1 ? authority : revoked),
        claimReceipt: async () => ({ receipt, ownsExecution: false }),
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.text()).includes('providerStateMarker'), false);
      assert.equal(JSON.stringify(receipt), snapshot);

      const restored = await handleProviderLifecycleRequest(request(), {
        authenticate: async () => ({ ...authority, authorizationVersion: authority.authorizationVersion + 1 }),
        claimReceipt: async () => ({ receipt, ownsExecution: false }),
      });
      assert.equal(restored.status, status === 'committed' ? 200 : status === 'failed' ? 422 : 409);
      assert.equal(JSON.stringify(receipt), snapshot);
      if (status !== 'claimed') assert.equal((await restored.text()).includes('providerStateMarker'), true);
    }
  }
});

await test('all provider operations preserve stale-authority receipts and recover once under a newer fence', async () => {
  for (const [index, operation] of systemicProviderOperations.entries()) {
    const envelope = {
      operation, requestId: NONCE_ONE, idempotencyKey: `provider-stale-${index + 1}`,
      organizationId: ORG, workspaceId: WORKSPACE,
      expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
    };
    const plan = { providerConfigId: CONFIG, planMarker: `provider-plan-${index + 1}` };
    const claimed: EnterpriseReceiptRow = {
      id: NONCE_TWO, request_hash: '3'.repeat(64), initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE, execution_token: NONCE_ONE, execution_fence: 1,
      lease_expires_at: now.toISOString(), status: 'claimed', execution_plan: plan,
    };
    const refreshed: EnterpriseReceiptRow = {
      ...claimed, execution_token: ROUTE, execution_fence: 2,
    };
    const result = { resourceId: CONFIG, providerConfigId: CONFIG, operation };
    const committed: EnterpriseReceiptRow = {
      ...refreshed, status: 'committed', resource_id: CONFIG, response: result,
    };
    let attempts = 0;
    let effects = 0;
    let failures = 0;
    const request = () => new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) });
    const stale = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => authority,
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      executeCommand: async () => { attempts += 1; throw new ProviderLifecycleError('AUTHORIZATION_STALE'); },
      reloadReceipt: async () => claimed,
      failReceipt: async () => { failures += 1; throw new Error('must not finalize stale authority'); },
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as { error?: { code?: string } }).error?.code, 'AUTHORIZATION_STALE');
    assert.equal(claimed.status, 'claimed');
    assert.deepEqual(claimed.execution_plan, plan);
    assert.equal(failures, 0);

    const recovered = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => ({ ...authority, authorizationVersion: authority.authorizationVersion + 1 }),
      claimReceipt: async () => ({ receipt: refreshed, ownsExecution: true }),
      executeCommand: async (_operation, _authority, _payload, _deps, execution) => {
        attempts += 1;
        assert.equal(execution?.executionFence, 2);
        assert.deepEqual(execution?.plan, plan);
        effects += 1;
        return result;
      },
      completeReceipt: async () => committed,
    });
    assert.equal(recovered.status, 200);

    const replay = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => ({ ...authority, authorizationVersion: authority.authorizationVersion + 1 }),
      claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
      executeCommand: async () => { effects += 1; return result; },
    });
    assert.equal(replay.status, 200);
    assert.deepEqual({ attempts, effects, failures }, { attempts: 2, effects: 1, failures: 0 });
  }
});

await test('all provider operations authorize before effect recovery and reconcile once after restore', async () => {
  for (const [index, operation] of systemicProviderOperations.entries()) {
    const envelope = {
      operation, requestId: NONCE_ONE, idempotencyKey: `provider-reconcile-${index + 1}`,
      organizationId: ORG, workspaceId: WORKSPACE,
      expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
    };
    const claimed: EnterpriseReceiptRow = {
      id: NONCE_TWO, request_hash: '4'.repeat(64), initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE, execution_token: NONCE_TWO, execution_fence: 1,
      lease_expires_at: now.toISOString(), status: 'claimed',
    };
    const effectResult = { resourceId: CONFIG, providerConfigId: CONFIG, operation, effectMarker: true };
    const committed: EnterpriseReceiptRow = {
      ...claimed, status: 'committed', resource_id: CONFIG, response: effectResult,
    };
    const revoked = { ...authority, organizationCapabilities: new Set<string>(), workspaceCapabilities: new Set<string>() };
    let authCalls = 0;
    let reloads = 0;
    let effects = 0;
    const request = () => new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) });
    const denied = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => (++authCalls === 1 ? authority : revoked),
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      executeCommand: async () => { effects += 1; throw new ProviderLifecycleError('PERSISTENCE_UNAVAILABLE'); },
      reloadReceipt: async () => { reloads += 1; return committed; },
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.text()).includes('effectMarker'), false);
    assert.equal(reloads, 0);
    assert.equal(claimed.status, 'claimed');

    const restored = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => ({ ...authority, authorizationVersion: authority.authorizationVersion + 1 }),
      claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
      executeCommand: async () => { effects += 1; return effectResult; },
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json() as { effectMarker?: boolean }).effectMarker, true);
    assert.deepEqual({ effects, reloads }, { effects: 1, reloads: 0 });
  }
});

await test('all provider operations reauthorize success and failure finalization and reconcile response loss', async () => {
  for (const [index, operation] of systemicProviderOperations.entries()) {
    const envelope = {
      operation, requestId: NONCE_ONE, idempotencyKey: `provider-finalization-${index + 1}`,
      organizationId: ORG, workspaceId: WORKSPACE,
      expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
    };
    const claimed: EnterpriseReceiptRow = {
      id: NONCE_TWO, request_hash: 'e'.repeat(64), initial_request_id: NONCE_ONE,
      last_request_id: NONCE_ONE, execution_token: NONCE_TWO, execution_fence: 1,
      lease_expires_at: now.toISOString(), status: 'claimed',
    };
    const result = { resourceId: CONFIG, providerConfigId: CONFIG, operation };
    const committed: EnterpriseReceiptRow = {
      ...claimed, status: 'committed', resource_id: CONFIG, response: result,
    };
    const request = () => new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) });

    for (const denyAt of [2, 3]) {
      let authCalls = 0;
      let completions = 0;
      const revoked = { ...authority, organizationCapabilities: new Set<string>(), workspaceCapabilities: new Set<string>() };
      const denied = await handleProviderLifecycleRequest(request(), {
        authenticate: async () => (++authCalls >= denyAt ? revoked : authority),
        claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
        executeCommand: async () => result,
        completeReceipt: async () => { completions += 1; return committed; },
        reloadReceipt: async () => claimed,
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.text()).includes(CONFIG), false);
      assert.equal(completions, denyAt === 2 ? 0 : 1);
    }

    for (const denyAt of [2, 3]) {
      let authCalls = 0;
      let failures = 0;
      const revoked = { ...authority, organizationCapabilities: new Set<string>(), workspaceCapabilities: new Set<string>() };
      const denied = await handleProviderLifecycleRequest(request(), {
        authenticate: async () => (++authCalls >= denyAt ? revoked : authority),
        claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
        executeCommand: async () => { throw new ProviderLifecycleError('PROVIDER_BLOCKED'); },
        reloadReceipt: async () => claimed,
        failReceipt: async () => {
          failures += 1;
          return { ...claimed, status: 'blocked', response: { ok: false, error: { code: 'PROVIDER_BLOCKED', message: 'blocked' } } };
        },
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.text()).includes('PROVIDER_BLOCKED'), false);
      assert.equal(failures, 0);
    }

    let executions = 0;
    let completions = 0;
    const reconciled = await handleProviderLifecycleRequest(request(), {
      authenticate: async () => authority,
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      executeCommand: async () => { executions += 1; return result; },
      completeReceipt: async () => { completions += 1; throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED'); },
      reloadReceipt: async () => committed,
    });
    assert.equal(reconciled.status, 200);
    assert.equal((await reconciled.json() as { resourceId?: string }).resourceId, CONFIG);
    assert.deepEqual({ executions, completions }, { executions: 1, completions: 1 });
  }
});

await test('provider replay rejects a mismatched canonical receipt resource without disclosure', async () => {
  const envelope = {
    operation: 'provider.validate', requestId: NONCE_ONE, idempotencyKey: 'provider-resource-mismatch',
    organizationId: ORG, workspaceId: WORKSPACE,
    expectedAuthorizationVersion: authority.authorizationVersion, payload: {},
  };
  const receipt: EnterpriseReceiptRow = {
    id: NONCE_TWO, request_hash: 'f'.repeat(64), initial_request_id: NONCE_ONE,
    last_request_id: NONCE_ONE, execution_token: NONCE_TWO, execution_fence: 1,
    lease_expires_at: now.toISOString(), status: 'committed', resource_id: CONFIG,
    response: { resourceId: ROUTE, providerConfigId: ROUTE, mismatchedMarker: true },
  };
  const response = await handleProviderLifecycleRequest(
    new Request('http://local/provider', { method: 'POST', body: JSON.stringify(envelope) }),
    { authenticate: async () => authority, claimReceipt: async () => ({ receipt, ownsExecution: false }) },
  );
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('mismatchedMarker'), false);
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
    async renewCleanupLease() {},
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
    async renewCleanupLease() {},
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
    async renewCleanupLease() {},
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
    async renewCleanupLease() {},
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
    async renewCleanupLease() {},
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
      if (stale) throw new SupabaseRpcError({
        status: 409,
        databaseMessage: 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
      });
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
    async renewCleanupLease() {},
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
    async renewCleanupLease() {},
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
      if (stale) throw new SupabaseRpcError({
        status: 409,
        databaseMessage: 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
      });
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
    async renewCleanupLease() {},
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
