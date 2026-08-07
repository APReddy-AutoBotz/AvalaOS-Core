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
import { fingerprintProviderSecret, type ProviderSecretBackend } from './providerSecretAdapter';
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
  const result = await executeProviderLifecycleCommand('provider.secret.bind', authority, { providerConfigId: CONFIG, preProvisionedReference: safeRef×ž¼îÚ$z{-®éÜj×6V7&WB†öÆE&VfW&Væ6R“°Ð Ð¢6öç7BÖ—6ÖF6†VBÒ7&VFTW†V7WF–öâ‡°Ð¢6V7&WD÷væW'6†—¢vÖævVE÷w&—FRrÂ6V7&WEÆå&V6V—D–C¢äôä4UõEtòÂw&—FU7FFS¢wÆææVBrÀÐ¢&÷f–FW#¢v÷Væ’rÂ6V7&WE&VfW&Væ6S¢ÆææVE&VfW&Væ6RÂ¶W•&Vd–C¢´U•õEtòÀÐ¢6fTf–ævW'&–çC¢ÆææVDf–ævW'&–çBÂ&÷FV7FVE6V7&WE&VfW&Væ6T†6ƒ¢öÆE&VfW&Væ6T†6‚ÀÐ¢6ÆVçW&WV—&VC¢G'VRÂ6ÆVçWFW&Ö–æÄ6öFS¢udÄ”DD”ôåôd”ÄTBrÀÐ¢Ò“°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â·&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢wÆææVB×6V7&WBwÒÂFW2ÂÖ—6ÖF6†VB’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒuU%4•5DTä4UõTäd”Ä$ÄRrÀÐ¢“°Ð¢76W'BæWVÂ‡&VÖ÷fÇ2Â“°Ð Ð¢6öç7B&U&÷f—6–öæVBÒ7&VFTW†V7WF–öâ‡°Ð¢&÷f–FW#¢v÷Væ’rÂ&U&÷f—6–öæVE&VfW&Væ6T†6ƒ¢v—Bf–ævW'&–çE&÷f–FW%6V7&WB‡ÆææVE&VfW&Væ6R’ÀÐ¢6ÆVçW&WV—&VC¢G'VRÂ6ÆVçWFW&Ö–æÄ6öFS¢udÄ”DD”ôåôd”ÄTBrÀÐ¢Ò“°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â·&÷f–FW$6öæf–t–C¢4ôäd”rÂ&U&÷f—6–öæVE&VfW&Væ6S¢ÆææVE&VfW&Væ6WÒÂFW2Â&U&÷f—6–öæVB’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒudÄ”DD”ôåôd”ÄTBrÀÐ¢“°Ð¢76W'BæWVÂ‡&VÖ÷fÇ2Â“°Ð Ð¢6öç7B7F—fRÒ7&VFTW†V7WF–öâ‡°Ð¢6V7&WD÷væW'6†—¢vÖævVE÷w&—FRrÂ6V7&WEÆå&V6V—D–C¢äôä4UõEtòÂw&—FU7FFS¢wÆææVBrÀÐ¢&÷f–FW#¢v÷Væ’rÂ6V7&WE&VfW&Væ6S¢öÆE&VfW&Væ6RÂ¶W•&Vd–C¢´U•õEtòÀÐ¢6fTf–ævW'&–çC¢v—Bf–ævW'&–çE&÷f–FW%6V7&WB‚vöÆB×6V7&WBr’Â&÷FV7FVE6V7&WE&VfW&Væ6T†6ƒ¢öÆE&VfW&Væ6T†6‚ÀÐ¢6ÆVçW&WV—&VC¢G'VRÂ6ÆVçWFW&Ö–æÄ6öFS¢udÄ”DD”ôåôd”ÄTBrÀÐ¢Ò“°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â·&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢vöÆB×6V7&WBwÒÂFW2Â7F—fR’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒuU%4•5DTä4UõTäd”Ä$ÄRrÀÐ¢“°Ð¢76W'BæWVÂ‡&VÖ÷fÇ2Â“°Ð Ð¢6öç7Bf÷&V–vâÒ7&VFTW†V7WF–öâ‡°Ð¢6V7&WD÷væW'6†—¢vÖævVE÷w&—FRrÂ6V7&WEÆå&V6V—D–C¢7'—Fòç&æFöÕUT”B‚’Âw&—FU7FFS¢wÆææVBrÀÐ¢&÷f–FW#¢v÷Væ’rÂ6V7&WE&VfW&Væ6S¢ÆææVE&VfW&Væ6RÂ¶W•&Vd–C¢´U•õEtòÀÐ¢6fTf–ævW'&–çC¢v—Bf–ævW'&–çE&÷f–FW%6V7&WB‚wVæW‡V7FVB×6V7&WBr’ÀÐ¢6ÆVçW&WV—&VC¢G'VRÂ6ÆVçWFW&Ö–æÄ6öFS¢udÄ”DD”ôåôd”ÄTBrÀÐ¢Ò“°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â·&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢wVæW‡V7FVB×6V7&WBwÒÂFW2Âf÷&V–vâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒudÄ”DD”ôåôd”ÄTBrÀÐ¢“°Ð¢76W'BæWVÂ‡&VÖ÷fÇ2Â“°Ð¢76W'BæWVÂ‡6V7&WG2ævWB†öÆE&VfW&Væ6R’ÂvöÆB×6V7&WBr“°Ð¢76W'BæWVÂ‡6V7&WG2ævWB‡ÆææVE&VfW&Væ6R’ÂwVæW‡V7FVB×6V7&WBr“°Ð§Ò“°Ð Ð¦v—BFW7B‚vÆÆ÷w2öæRfVæ6VB6ÆVçW&V6÷fW'’v÷&¶W"æB&V¦V7G26öæ7W'&VçB7FÆRv÷&¶W"v—F†÷WBGWÆ–6FRFVÆWF–öârÂ7–æ2‚’Óâ°Ð¢6öç7BöÆE&VfW&Væ6RÒtdÄõ$õd”DU%õ4T5$UEôõTä•óCƒôôÄEõ$T4õdU%’s°Ð¢6öç7B6öæf–s¢&÷f–FW$Æ–fV7–6ÆT6öæf–rÒ°Ð¢–C¢4ôäd”rÂ÷&væ—¦F–öä–C¢õ$rÂ&÷f–FW#¢v÷Væ’rÂ7FGW3¢v7F—fRrÀÐ¢FVfVÇDÖöFVÃ¢vwBÖv÷fW&æVBrÂÖöFVÄÆÆ÷vÆ—7C¢²vwBÖv÷fW&æVBuÒÂÆ7EfÆ–FFVDC¢æ÷rçFô•4õ7G&–ær‚’ÀÐ¢¶W•&Vc¢²–C¢´U•ôôäRÂ&÷f–FW#¢v÷Væ’rÂ&W6öÇfW%G—S¢w6W'fW%÷&VfW&Væ6RrÂ6V7&WE&Vc¢öÆE&VfW&Væ6RÂ7FGW3¢v7F—fRrÒÀÐ¢Ó°Ð¢ÆWBw&—FW2Ò²ÆWB&VÖ÷fTGFV×G2Ò²ÆWB7V66W76gVÅ&VÖ÷fÇ2Ò²ÆWBfÆ–FF–öç2Ò²ÆWBG&ç6—F–öç2Ò°Ð¢6öç7B6V7&WG2ÒæWrÖ…µ¶öÆE&VfW&Væ6RÂvöÆB×6V7&WBuÕÒ“°Ð¢6öç7BW†V7WF–öâÒ°Ð¢&V6V—D–C¢äôä4UõEtòÂW†V7WF–öåFö¶Vã¢äôä4UôôäRÂW†V7WF–öäfVæ6S¢ÀÐ¢Æã¢·Ò2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÀÐ¢7–æ2W'6—7EÆâ‡Æã¢&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’²F†—2çÆâÒ7G'V7GW&VD6ÆöæR‡Æâ“²&WGW&âF†—2çÆã²ÒÀÐ¢Ó°Ð¢6öç7BFW2Ò°Ð¢FF&6S¢°Ð¢ÆöD6öæf–s¢7–æ2‚’Óâ7G'V7GW&VD6ÆöæR†6öæf–r’ÀÐ¢G&ç6—F–öã¢7–æ2‚’Óâ²G&ç6—F–öç2³Ò²&WGW&â·Ó²ÒÀÐ¢ÒÀÐ¢6V7&WD&6¶VæC¢°Ð¢¶–æC¢wfVÇBrÂw&—F&ÆS¢G'VRÀÐ¢&W6öÇfS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ6V7&WG2ævWB†–çWBç6V7&WE&Vb’ÀÐ¢w&—FS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–æs²fÇVS¢7G&–ærÒ’Óâ²w&—FW2³Ò²6V7&WG2ç6WB†–çWBç6V7&WE&VbÂ–çWBçfÇVR“²ÒÀÐ¢&VÖ÷fS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ°Ð¢&VÖ÷fTGFV×G2³Ò°Ð¢–b‡&VÖ÷fTGFV×G2ÓÓÒ’F‡&÷ræWrW'&÷"‚v6ÆVçWVæf–Æ&ÆRr“°Ð¢–b‡6V7&WG2æFVÆWFR†–çWBç6V7&WE&Vb’’7V66W76gVÅ&VÖ÷fÇ2³Ò°Ð¢ÒÀÐ¢Ò2&÷f–FW%6V7&WD&6¶VæBÀÐ¢&÷WFU&W6öÇfW$FW3¢·Ò2æWfW"ÀÐ¢fÆ–FFT6öææV7F–öã¢7–æ2‚’Óâ²fÆ–FF–öç2³Ò²F‡&÷ræWrW'&÷"‚vFWFW&Ö–æ—7F–2&V¦V7F–öâr“²ÒÀÐ¢æ÷s¢‚’Óâæ÷rÀÐ¢&æFöÔ–C¢‚‚’Óâ²6öç7B–G2Ò´äôä4UôôäRÂ´U•õEtõÓ²&WGW&â‚’Óâ–G2ç6†–gB‚’ÇÂ7'—Fòç&æFöÕUT”B‚“²Ò’‚’ÀÐ¢Ó°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢v6ÆVçW×&V6÷fW'’×6V7&WBrÒÂFW2ÂW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒuU%4•5DTä4UõTäd”Ä$ÄRrÀÐ¢“°Ð¢76W'BæWVÂ†W†V7WF–öâçÆâæ6ÆVçW&WV—&VBÂG'VR“°Ð¢6öç7B7FÆTW†V7WF–öâÒ°Ð¢ââæW†V7WF–öâÀÐ¢Æã¢7G'V7GW&VD6ÆöæR†W†V7WF–öâçÆâ’ÀÐ¢7–æ2W'6—7EÆâ‚’²F‡&÷ræWr&÷f–FW$Æ–fV7–6ÆTW'&÷"‚uU%4•5DTä4UõTäd”Ä$ÄRr“²ÒÀÐ¢Ó°Ð¢W†V7WF–öâæW†V7WF–öäfVæ6RÒ#°Ð¢6öç7B6öæ7W'&VçBÒv—B&öÖ—6RæÆÅ6WGFÆVB…°Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢v6ÆVçW×&V6÷fW'’×6V7&WBrÒÂFW2ÂW†V7WF–öâ’ÀÐ¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢v6ÆVçW×&V6÷fW'’×6V7&WBrÒÂFW2Â7FÆTW†V7WF–öâ’ÀÐ¢Ò“°Ð¢76W'BæFVWWVÂ€Ð¢6öæ7W'&VçBæÖ‡&W7VÇBÓâ&W7VÇBç7FGW2ÓÓÒw&V¦V7FVBrbb&W7VÇBç&V6öâ–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷ Ð¢ò&W7VÇBç&V6öâæ6öFR¢&W7VÇBç7FGW2’ç6÷'B‚’ÀÐ¢²uU%4•5DTä4UõTäd”Ä$ÄRrÂudÄ”DD”ôåôd”ÄTBuÒÀÐ¢“°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢v6ÆVçW×&V6÷fW'’×6V7&WBrÒÂFW2ÂW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒudÄ”DD”ôåôd”ÄTBrÀÐ¢“°Ð¢76W'BæFVWWVÂ€Ð¢·w&—FW2Â&VÖ÷fTGFV×G2Â7V66W76gVÅ&VÖ÷fÇ2ÂfÆ–FF–öç2ÂG&ç6—F–öç7ÒÀÐ¢·w&—FW3¢Â&VÖ÷fTGFV×G3¢"Â7V66W76gVÅ&VÖ÷fÇ3¢ÂfÆ–FF–öç3¢ÂG&ç6—F–öç3¢ÒÀÐ¢“°Ð¢76W'BæWVÂ‡6V7&WG2ævWB†öÆE&VfW&Væ6R’ÂvöÆB×6V7&WBr“°Ð§Ò“°Ð Ð¦v—BFW7B‚w&WF–ç2öæR&÷FF–öâÆâ7&÷72WF†÷&—¦F–öâ×fW'6–öâ&V6÷fW'’æB6ÆVç2—B–bWF†÷&—G’—2&VÖ÷fVBrÂ7–æ2‚’Óâ°Ð¢6öç7BöÆE&VfW&Væ6RÒtdÄõ$õd”DU%õ4T5$UEôõTä•óCƒôôÄEôUD‚s°Ð¢6öç7B6öæf–s¢&÷f–FW$Æ–fV7–6ÆT6öæf–rÒ°Ð¢–C¢4ôäd”rÂ÷&væ—¦F–öä–C¢õ$rÂ&÷f–FW#¢v÷Væ’rÂ7FGW3¢v7F—fRrÀÐ¢FVfVÇDÖöFVÃ¢vwBÖv÷fW&æVBrÂÖöFVÄÆÆ÷vÆ—7C¢²vwBÖv÷fW&æVBuÒÂÆ7EfÆ–FFVDC¢æ÷rçFô•4õ7G&–ær‚’ÀÐ¢¶W•&Vc¢²–C¢´U•ôôäRÂ&÷f–FW#¢v÷Væ’rÂ&W6öÇfW%G—S¢w6W'fW%÷&VfW&Væ6RrÂ6V7&WE&Vc¢öÆE&VfW&Væ6RÂ7FGW3¢v7F—fRrÒÀÐ¢Ó°Ð¢ÆWBw&—FW2Ò²ÆWB&VÖ÷fÇ2Ò²ÆWBfÆ–FF–öç2Ò²ÆWBG&ç6—F–öç2Ò°Ð¢6öç7B6V7&WG2ÒæWrÖ…µ¶öÆE&VfW&Væ6RÂvöÆB×6V7&WBuÕÒ“°Ð¢ÆWB7FÆRÒG'VS°Ð¢6öç7BFF&6S¢&÷f–FW$Æ–fV7–6ÆTFF&6RÒ°Ð¢ÆöD6öæf–s¢7–æ2‚’Óâ7G'V7GW&VD6ÆöæR†6öæf–r’ÀÐ¢G&ç6—F–öã¢7–æ2–çWBÓâ°Ð¢G&ç6—F–öç2³Ò°Ð¢–b‡7FÆR’F‡&÷ræWr7W&6U'4W'&÷"‡°Ð¢7FGW3¢C’ÀÐ¢FF&6TÖW76vS¢tTåDU%$•4Uõ$õd”DU%ôUD„õ$•¤D”ôåõdU%4”ôåõ5DÄRrÀÐ¢Ò“°Ð¢6öæf–ræ¶W•&VbÒ°Ð¢–C¢7G&–ær†–çWBç–ÆöBæ¶W•&Vd–B’Â&÷f–FW#¢v÷Væ’rÂ&W6öÇfW%G—S¢w6W'fW%÷&VfW&Væ6RrÀÐ¢6V7&WE&Vc¢7G&–ær†–çWBç–ÆöBç6V7&WE&VfW&Væ6R’Â7FGW3¢v7F—fRrÀÐ¢Ó°Ð¢&WGW&â–çWBæW†V7WF–öãòç&W7VÇBÇÂ·Ó°Ð¢ÒÀÐ¢Ó°Ð¢6öç7BW†V7WF–öâÒ°Ð¢&V6V—D–C¢äôä4UõEtòÂW†V7WF–öåFö¶Vã¢äôä4UôôäRÂW†V7WF–öäfVæ6S¢ÀÐ¢Æã¢·Ò2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÀÐ¢7–æ2W'6—7EÆâ‡Æã¢&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’²F†—2çÆâÒ7G'V7GW&VD6ÆöæR‡Æâ“²&WGW&âF†—2çÆã²ÒÀÐ¢Ó°Ð¢6öç7BFW2Ò°Ð¢FF&6RÀÐ¢6V7&WD&6¶VæC¢°Ð¢¶–æC¢wfVÇBrÂw&—F&ÆS¢G'VRÀÐ¢&W6öÇfS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ6V7&WG2ævWB†–çWBç6V7&WE&Vb’ÀÐ¢w&—FS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–æs²fÇVS¢7G&–ærÒ’Óâ²w&—FW2³Ò²6V7&WG2ç6WB†–çWBç6V7&WE&VbÂ–çWBçfÇVR“²ÒÀÐ¢&VÖ÷fS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ²&VÖ÷fÇ2³Ò²6V7&WG2æFVÆWFR†–çWBç6V7&WE&Vb“²ÒÀÐ¢Ò2&÷f–FW%6V7&WD&6¶VæBÀÐ¢&÷WFU&W6öÇfW$FW3¢·Ò2æWfW"ÀÐ¢fÆ–FFT6öææV7F–öã¢7–æ2‚’Óâ²fÆ–FF–öç2³Ò²&WGW&â²fÆ–FFVC¢G'VR26öç7BÓ²ÒÀÐ¢æ÷s¢‚’Óâæ÷rÀÐ¢&æFöÔ–C¢‚‚’Óâ²6öç7B–G2Ò´äôä4UôôäRÂ´U•õEtõÓ²&WGW&â‚’Óâ–G2ç6†–gB‚’ÇÂ7'—Fòç&æFöÕUT”B‚“²Ò’‚’ÀÐ¢Ó°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢vWF†÷&—¦F–öâ×&WG'’×6V7&WBrÒÂFW2ÂW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒtUD„õ$•¤D”ôåõ5DÄRrÀÐ¢“°Ð¢6öç7BÆææVE&VfW&Væ6RÒ7G&–ær†W†V7WF–öâçÆâç6V7&WE&VfW&Væ6R“°Ð¢6öç7BÆææVD¶W•&VbÒ7G&–ær†W†V7WF–öâçÆâæ¶W•&Vd–B“°Ð¢76W'BæWVÂ‡6V7&WG2ævWB‡ÆææVE&VfW&Væ6R’ÂvWF†÷&—¦F–öâ×&WG'’×6V7&WBr“°Ð¢7FÆRÒfÇ6S°Ð¢W†V7WF–öâæW†V7WF–öäfVæ6RÒ#°Ð¢6öç7B&V6÷fW&VBÒv—BW†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB€Ð¢w&÷f–FW"ç6V7&WBç&÷FFRrÂ²ââæWF†÷&—G’ÂWF†÷&—¦F–öåfW'6–öã¢—ÒÀÐ¢²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢vWF†÷&—¦F–öâ×&WG'’×6V7&WBrÒÂFW2ÂW†V7WF–öâÀÐ¢“°Ð¢76W'BæWVÂ‡&V6÷fW&VBæ¶W•&Vd–BÂÆææVD¶W•&Vb“°Ð¢76W'BæWVÂ†6öæf–ræ¶W•&Vcòç6V7&WE&VbÂÆææVE&VfW&Væ6R“°Ð¢76W'BæFVWWVÂ‡·w&—FW2ÂfÆ–FF–öç2ÂG&ç6—F–öç2Â&VÖ÷fÇ7ÒÂ·w&—FW3¢ÂfÆ–FF–öç3¢ÂG&ç6—F–öç3¢"Â&VÖ÷fÇ3¢Ò“°Ð Ð¢6öç7BVæ6öÖÖ—GFVE&VfW&Væ6RÒtdÄõ$õd”DU%õ4T5$UEôõTä•óCƒõTä4ôÔÔ•EDTBs°Ð¢6V7&WG2ç6WB‡Væ6öÖÖ—GFVE&VfW&Væ6RÂwVæ6öÖÖ—GFVB×6V7&WBr“°Ð¢6öç7B&VÖ÷fVDW†V7WF–öâÒ°Ð¢&V6V—D–C¢7'—Fòç&æFöÕUT”B‚’ÂW†V7WF–öåFö¶Vã¢7'—Fòç&æFöÕUT”B‚’ÂW†V7WF–öäfVæ6S¢"ÀÐ¢Æã¢°Ð¢&÷f–FW#¢v÷Væ’rÂ6V7&WE&VfW&Væ6S¢Væ6öÖÖ—GFVE&VfW&Væ6RÂ¶W•&Vd–C¢7'—Fòç&æFöÕUT”B‚’ÀÐ¢6fTf–ævW'&–çC¢v—Bf–ævW'&–çE&÷f–FW%6V7&WB‚wVæ6öÖÖ—GFVB×6V7&WBr’ÀÐ¢6V7&WD÷væW'6†—¢vÖævVE÷w&—FRrÂw&—FU7FFS¢ww&—GFVârÀÐ¢fÆ–FF–öå7V66VVFVC¢G'VRÂÆ7EfÆ–FFVDC¢æ÷rçFô•4õ7G&–ær‚’ÀÐ¢Ò2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÀÐ¢7–æ2W'6—7EÆâ‡Æã¢&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’²F†—2çÆâÒ7G'V7GW&VD6ÆöæR‡Æâ“²&WGW&âF†—2çÆã²ÒÀÐ¢Ó°Ð¢&VÖ÷fVDW†V7WF–öâçÆâç6V7&WEÆå&V6V—D–BÒ&VÖ÷fVDW†V7WF–öâç&V6V—D–C°Ð¢6öç7BæôWF†÷&—G’Ò°Ð¢ââæWF†÷&—G’ÀÐ¢WF†÷&—¦F–öåfW'6–öã¢ÀÐ¢÷&væ—¦F–öä6&–Æ—F–W3¢æWr6WCÇ7G&–æsâ‚’ÀÐ¢Ó°Ð¢6öç7BG&ç6—F–öç4&Vf÷&U&VÖ÷fÂÒG&ç6—F–öç3°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂæôWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢wVæ6öÖÖ—GFVB×6V7&WBrÒÂFW2Â&VÖ÷fVDW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBrÀÐ¢“°Ð¢76W'BæWVÂ‡G&ç6—F–öç2ÂG&ç6—F–öç4&Vf÷&U&VÖ÷fÂ“°Ð¢76W'BæWVÂ‡6V7&WG2æ†2‡Væ6öÖÖ—GFVE&VfW&Væ6R’ÂfÇ6R“°Ð¢76W'BæWVÂ‡6V7&WG2ævWB‡ÆææVE&VfW&Væ6R’ÂvWF†÷&—¦F–öâ×&WG'’×6V7&WBr“°Ð¢6öç7B&VÖ÷fÇ4gFW$&Æö6¶VBÒ&VÖ÷fÇ3°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBç&÷FFRrÂæôWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢wVæ6öÖÖ—GFVB×6V7&WBrÒÂFW2Â&VÖ÷fVDW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒuU$Ô•54”ôåôDTä”TBrÀÐ¢“°Ð¢76W'BæWVÂ‡&VÖ÷fÇ2Â&VÖ÷fÇ4gFW$&Æö6¶VB“°Ð¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’‡&VÖ÷fVDW†V7WF–öâçÆâ’Â÷Væ6öÖÖ—GFVB×6V7&WGÆWF†÷&—¦F–öâ×&WG'’×6V7&WGÆöÆB×6V7&WBò“°Ð§Ò“°Ð Ð¦v—BFW7B‚w&WW6W2öæR&–æB6V7&WBæB¶W’×&VfW&Væ6RÆâgFW"WF†÷&—¦F–öâ×fW'6–öâ6†ævRrÂ7–æ2‚’Óâ°Ð¢6öç7B6öæf–s¢&÷f–FW$Æ–fV7–6ÆT6öæf–rÒ°Ð¢–C¢4ôäd”rÂ÷&væ—¦F–öä–C¢õ$rÂ&÷f–FW#¢v÷Væ’rÂ7FGW3¢wVæF–æu÷&Wf–WrrÀÐ¢FVfVÇDÖöFVÃ¢vwBÖv÷fW&æVBrÂÖöFVÄÆÆ÷vÆ—7C¢²vwBÖv÷fW&æVBuÒÂ¶W•&Vc¢çVÆÂÀÐ¢Ó°Ð¢ÆWB7FÆRÒG'VS²ÆWBw&—FW2Ò²ÆWBG&ç6—F–öç2Ò²ÆWB&VÖ÷fÇ2Ò°Ð¢6öç7B6V7&WG2ÒæWrÖÇ7G&–ærÂ7G&–æsâ‚“°Ð¢6öç7BFF&6S¢&÷f–FW$Æ–fV7–6ÆTFF&6RÒ°Ð¢ÆöD6öæf–s¢7–æ2‚’Óâ7G'V7GW&VD6ÆöæR†6öæf–r’ÀÐ¢G&ç6—F–öã¢7–æ2–çWBÓâ°Ð¢G&ç6—F–öç2³Ò°Ð¢–b‡7FÆR’F‡&÷ræWr7W&6U'4W'&÷"‡°Ð¢7FGW3¢C’ÀÐ¢FF&6TÖW76vS¢tTåDU%$•4Uõ$õd”DU%ôUD„õ$•¤D”ôåõdU%4”ôåõ5DÄRrÀÐ¢Ò“°Ð¢6öæf–ræ¶W•&VbÒ°Ð¢–C¢7G&–ær†–çWBç–ÆöBæ¶W•&Vd–B’Â&÷f–FW#¢v÷Væ’rÂ&W6öÇfW%G—S¢w6W'fW%÷&VfW&Væ6RrÀÐ¢6V7&WE&Vc¢7G&–ær†–çWBç–ÆöBç6V7&WE&VfW&Væ6R’Â7FGW3¢v7F—fRrÀÐ¢Ó°Ð¢&WGW&â–çWBæW†V7WF–öãòç&W7VÇBÇÂ·Ó°Ð¢ÒÀÐ¢Ó°Ð¢6öç7BW†V7WF–öâÒ°Ð¢&V6V—D–C¢äôä4UõEtòÂW†V7WF–öåFö¶Vã¢äôä4UôôäRÂW†V7WF–öäfVæ6S¢ÀÐ¢Æã¢·Ò2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâÀÐ¢7–æ2W'6—7EÆâ‡Æã¢&V6÷&CÇ7G&–ærÂVæ¶æ÷vãâ’²F†—2çÆâÒ7G'V7GW&VD6ÆöæR‡Æâ“²&WGW&âF†—2çÆã²ÒÀÐ¢Ó°Ð¢6öç7BFW2Ò°Ð¢FF&6RÀÐ¢6V7&WD&6¶VæC¢°Ð¢¶–æC¢wfVÇBrÂw&—F&ÆS¢G'VRÀÐ¢&W6öÇfS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ6V7&WG2ævWB†–çWBç6V7&WE&Vb’ÀÐ¢w&—FS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–æs²fÇVS¢7G&–ærÒ’Óâ²w&—FW2³Ò²6V7&WG2ç6WB†–çWBç6V7&WE&VbÂ–çWBçfÇVR“²ÒÀÐ¢&VÖ÷fS¢7–æ2†–çWC¢²6V7&WE&Vc¢7G&–ærÒ’Óâ²&VÖ÷fÇ2³Ò²6V7&WG2æFVÆWFR†–çWBç6V7&WE&Vb“²ÒÀÐ¢Ò2&÷f–FW%6V7&WD&6¶VæBÀÐ¢&÷WFU&W6öÇfW$FW3¢·Ò2æWfW"ÀÐ¢fÆ–FFT6öææV7F–öã¢7–æ2‚’Óâ‡²fÆ–FFVC¢G'VR26öç7BÒ’ÀÐ¢æ÷s¢‚’Óâæ÷rÀÐ¢&æFöÔ–C¢‚‚’Óâ²6öç7B–G2Ò´äôä4UôôäRÂ´U•õEtõÓ²&WGW&â‚’Óâ–G2ç6†–gB‚’ÇÂ7'—Fòç&æFöÕUT”B‚“²Ò’‚’ÀÐ¢Ó°Ð¢v—B76W'Bç&V¦V7G2€Ð¢W†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB‚w&÷f–FW"ç6V7&WBæ&–æBrÂWF†÷&—G’Â²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢vWF†÷&—¦F–öâÖ&–æB×6V7&WBrÒÂFW2ÂW†V7WF–öâ’ÀÐ¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb&÷f–FW$Æ–fV7–6ÆTW'&÷"bbW'&÷"æ6öFRÓÓÒtUD„õ$•¤D”ôåõ5DÄRrÀÐ¢“°Ð¢6öç7BÆææVE&VfW&Væ6RÒ7G&–ær†W†V7WF–öâçÆâç6V7&WE&VfW&Væ6R“°Ð¢6öç7BÆææVD¶W•&VbÒ7G&–ær†W†V7WF–öâçÆâæ¶W•&Vd–B“°Ð¢7FÆRÒfÇ6S°Ð¢W†V7WF–öâæW†V7WF–öäfVæ6RÒ#°Ð¢6öç7B&V&÷VæBÒv—BW†V7WFU&÷f–FW$Æ–fV7–6ÆT6öÖÖæB€Ð¢w&÷f–FW"ç6V7&WBæ&–æBrÂ²ââæWF†÷&—G’ÂWF†÷&—¦F–öåfW'6–öã¢—ÒÀÐ¢²&÷f–FW$6öæf–t–C¢4ôäd”rÂ&÷f–FW$¶W“¢vWF†÷&—¦F–öâÖ&–æB×6V7&WBrÒÂFW2ÂW†V7WF–öâÀÐ¢“°Ð¢76W'BæWVÂ‡&V&÷VæBæ¶W•&Vd–BÂÆææVD¶W•&Vb“°Ð¢76W'BæWVÂ†6öæf–ræ¶W•&Vcòç6V7&WE&VbÂÆææVE&VfW&Væ6R“°Ð¢76W'BæFVWWVÂ‡·w&—FW2ÂG&ç6—F–öç2Â&VÖ÷fÇ7ÒÂ·w&—FW3¢ÂG&ç6—F–öç3¢"Â&VÖ÷fÇ3¢Ò“°Ð¢76W'BæFöW4æ÷DÖF6‚„¥4ôâç7G&–æv–g’†W†V7WF–öâçÆâ’ÂöWF†÷&—¦F–öâÖ&–æB×6V7&WBò“°Ð§Ò“°Ð