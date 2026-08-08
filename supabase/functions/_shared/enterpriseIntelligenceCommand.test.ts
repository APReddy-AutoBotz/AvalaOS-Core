import assert from 'node:assert/strict';
import {
  assertEnterpriseCommandOperationAuthority,
  EnterpriseCommandError,
  RecoverableEnterpriseCommandError,
  enterpriseCommandErrorBody,
  enterpriseCommandStatusForTerminalReceipt,
  extractionRouteMatchesPlan,
  handleEnterpriseIntelligenceRequest,
  isRecoverableEnterpriseCommandError,
  mapEnterpriseCommandRpcError,
  mapProviderLifecycleCommandError,
  mapExtractionPersistenceError,
  parseEnterpriseCommandEnvelope,
  readEvidenceExtractionRoutePlan,
  requiredCapabilitiesForEnterpriseCommand,
  resolveEnterpriseCommandResourceId,
  shouldPreserveClaimedEnterpriseReceipt,
  type Authority,
} from './enterpriseIntelligenceCommand';
import { ProviderLifecycleError } from './providerLifecycle';
import {
  EnterpriseReceiptError,
  hashReceiptValue,
  mapEnterpriseReceiptRpcError,
  type EnterpriseReceiptRow,
} from './enterpriseReceipt';
import { SupabaseRpcError, SupabaseRpcTransportError } from './supabase';

const base = {
  commandType: 'evidence.candidate.review',
  requestId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: 'review-candidate-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  payload: { candidateId: '44444444-4444-4444-8444-444444444444', status: 'accepted' },
};

const test = (name: string, callback: () => void) => {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

test('parses a strict tenant-scoped command envelope', () => {
  const parsed = parseEnterpriseCommandEnvelope(base);
  assert.equal(parsed.commandType, 'evidence.candidate.review');
  assert.equal(parsed.workspaceId, base.workspaceId);
});

test('rejects unknown commands and raw secret fields', () => {
  assert.throws(
    () => parseEnterpriseCommandEnvelope({ ...base, commandType: 'provider.fallback' }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_COMMAND',
  );
  assert.throws(
    () => parseEnterpriseCommandEnvelope({ ...base, payload: { ...base.payload, apiKey: 'never' } }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_PAYLOAD',
  );
});

test('rejects malformed ids and unsafe idempotency keys', () => {
  assert.throws(() => parseEnterpriseCommandEnvelope({ ...base, requestId: 'not-a-uuid' }), /INVALID_PAYLOAD/);
  assert.throws(() => parseEnterpriseCommandEnvelope({ ...base, idempotencyKey: 'bad key' }), /INVALID_COMMAND/);
});

test('receipt finalization failure is explicit and fail-closed', () => {
  const error = new EnterpriseCommandError('RECEIPT_FINALIZATION_FAILED');
  assert.equal(error.status, 503);
  assert.deepEqual(enterpriseCommandErrorBody(error), {
    ok: false,
    error: {
      code: 'RECEIPT_FINALIZATION_FAILED',
      message: 'The Enterprise Intelligence command could not be completed.',
    },
  });
});

test('uses one exhaustive command-to-current-capability mapping for replay authorization', () => {
  const expected = {
    'evidence.source.create': 'evidence.write',
    'evidence.extract': 'evidence.write',
    'evidence.candidate.review': 'evidence.review',
    'evidence.assess.promote': 'assessment.edit',
    'modernization.evaluate': 'portfolio.manage',
    'approval.review.record': 'approvals.review',
    'approval.record': 'approvals.review',
    'studio.delivery.handoff': 'docs.approve',
    'monitor.baseline.create': 'monitor.manage',
    'assemble.blueprint.create': 'assemble.manage',
  } as const;
  for (const [commandType, capability] of Object.entries(expected)) {
    assert.deepEqual(
      requiredCapabilitiesForEnterpriseCommand(commandType as keyof typeof expected),
      [capability],
    );
  }
});

const replayAuthority: Authority = {
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: base.organizationId,
  workspaceId: base.workspaceId,
  isAdmin: false,
  permissions: new Set([
    'evidence.write', 'evidence.review', 'assessment.edit', 'portfolio.manage',
    'approvals.review', 'docs.approve', 'monitor.manage', 'assemble.manage',
  ]),
  organizationPermissions: new Set(),
  workspacePermissions: new Set(),
  roleNames: new Set(['reviewer']),
  organizationRoleNames: new Set(['reviewer']),
  workspaceRoleNames: new Set(['reviewer']),
  organizationRoleIds: new Set(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']),
  workspaceRoleIds: new Set(['cccccccc-cccc-4ccc-8ccc-cccccccccccc']),
  authorizationVersion: 7,
};

const replayCommands = [
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review',
  'evidence.assess.promote', 'modernization.evaluate', 'approval.review.record',
  'approval.record', 'studio.delivery.handoff', 'monitor.baseline.create',
  'assemble.blueprint.create',
] as const;

type ReplayCommand = typeof replayCommands[number];

const enterpriseTerminalStatusMatrix = [
  ['INVALID_PAYLOAD', 400],
  ['PERMISSION_DENIED', 403],
  ['RESOURCE_NOT_FOUND', 404],
  ['RESOURCE_STALE', 409],
  ['COMMAND_UNAVAILABLE', 503],
] as const;

test('derives the exact terminal Enterprise HTTP status from the persisted product error', () => {
  for (const [code, status] of enterpriseTerminalStatusMatrix) {
    const receipt = {
      status: code === 'PERMISSION_DENIED' ? 'blocked' : 'failed',
      response: enterpriseCommandErrorBody(new EnterpriseCommandError(code)),
    } as unknown as EnterpriseReceiptRow;
    assert.equal(enterpriseCommandStatusForTerminalReceipt(receipt), status);
  }
});

const enterpriseResultFor = (commandType: ReplayCommand, resourceId: string) => {
  const result: Record<string, unknown> = { resourceId };
  const lineageKey = commandType === 'evidence.source.create' ? 'sourceId'
    : commandType === 'evidence.extract' ? 'jobId'
      : commandType === 'evidence.candidate.review' ? 'candidateId'
        : commandType === 'evidence.assess.promote' ? 'assessDraftId'
          : commandType === 'modernization.evaluate' ? 'decisionId'
            : commandType === 'studio.delivery.handoff' ? 'workPackageId'
              : commandType === 'monitor.baseline.create' || commandType === 'assemble.blueprint.create'
                ? 'id'
                : null;
  if (lineageKey) result[lineageKey] = resourceId;
  return result;
};

test('generic provider stale authority preserves the plan and recovers once under a newer fence', async () => {
  const envelope = {
    commandType: 'provider.validate' as const,
    requestId: '54000000-0000-4000-8000-000000000001',
    idempotencyKey: 'provider-stale-recovery',
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: { providerConfigId: '55000000-0000-4000-8000-000000000001' },
  };
  const plan = { providerConfigId: envelope.payload.providerConfigId, planMarker: 'preserved' };
  const claimed: EnterpriseReceiptRow = {
    id: '56000000-0000-4000-8000-000000000001', request_hash: 'f'.repeat(64),
    initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
    execution_token: '57000000-0000-4000-8000-000000000001', execution_fence: 1,
    lease_expires_at: '2026-08-07T00:00:00.000Z', status: 'claimed', execution_plan: plan,
  };
  const refreshed: EnterpriseReceiptRow = {
    ...claimed, execution_token: '57000000-0000-4000-8000-000000000002', execution_fence: 2,
  };
  const result = { resourceId: envelope.payload.providerConfigId, providerConfigId: envelope.payload.providerConfigId };
  const committed: EnterpriseReceiptRow = {
    ...refreshed, status: 'committed', resource_id: envelope.payload.providerConfigId, response: result,
  };
  let attempt = 0;
  let failures = 0;
  let effects = 0;
  const request = () => new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) });
  const common = {
    authenticate: async () => ({ id: replayAuthority.actorId }),
    resolveOrganization: async () => replayAuthority.organizationId,
    resolveCommandAuthority: async () => ({
      ...replayAuthority,
      permissions: new Set(['byok.manage']),
      organizationPermissions: new Set(['byok.manage']),
    }),
    assertCurrentAuthority: async (current: Authority) => current,
  };
  const stale = await handleEnterpriseIntelligenceRequest(request(), {
    ...common,
    claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
    executeCommand: async () => { attempt += 1; throw new RecoverableEnterpriseCommandError('AUTHORIZATION_STALE'); },
    reloadReceipt: async () => claimed,
    failReceipt: async () => { failures += 1; throw new Error('must not finalize stale authority'); },
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as { error?: { code?: string } }).error?.code, 'AUTHORIZATION_STALE');
  assert.deepEqual(claimed.execution_plan, plan);
  assert.equal(claimed.status, 'claimed');
  assert.equal(failures, 0);

  const recovered = await handleEnterpriseIntelligenceRequest(request(), {
    ...common,
    claimReceipt: async () => ({ receipt: refreshed, ownsExecution: true }),
    executeCommand: async (_authority, _envelope, receipt) => {
      attempt += 1;
      assert.equal(receipt.execution_fence, 2);
      assert.deepEqual(receipt.execution_plan, plan);
      effects += 1;
      return result;
    },
    completeReceipt: async () => committed,
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json() as { providerConfigId?: string }).providerConfigId, envelope.payload.providerConfigId);

  const replay = await handleEnterpriseIntelligenceRequest(request(), {
    ...common,
    claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
    executeCommand: async () => { effects += 1; return result; },
  });
  assert.equal(replay.status, 200);
  assert.deepEqual({ attempt, effects, failures }, { attempt: 2, effects: 1, failures: 0 });
});

for (const [index, commandType] of replayCommands.entries()) {
  const resourceId = `58000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const envelope = {
    commandType,
    requestId: `59000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    idempotencyKey: `reconcile-authority-${index + 1}`,
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: commandType.startsWith('approval.') ? { resourceType: 'delivery_work_package' } : {},
  };
  const effectResult = { ...enterpriseResultFor(commandType, resourceId), effectMarker: true };
  const claimed: EnterpriseReceiptRow = {
    id: `5a000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    request_hash: '1'.repeat(64), initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
    execution_token: `5b000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    execution_fence: 1, lease_expires_at: '2026-08-07T00:00:00.000Z', status: 'claimed',
  };
  const committed: EnterpriseReceiptRow = { ...claimed, status: 'committed', resource_id: resourceId, response: effectResult };
  let checks = 0;
  let reloads = 0;
  let effects = 0;
  const request = () => new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) });
  const denied = await handleEnterpriseIntelligenceRequest(request(), {
    authenticate: async () => ({ id: replayAuthority.actorId }),
    resolveOrganization: async () => replayAuthority.organizationId,
    resolveCommandAuthority: async () => replayAuthority,
    assertCurrentAuthority: async current => {
      checks += 1;
      if (checks >= 3) throw new EnterpriseCommandError('PERMISSION_DENIED');
      return current;
    },
    claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
    executeCommand: async () => { effects += 1; throw new EnterpriseCommandError('COMMAND_UNAVAILABLE'); },
    reloadReceipt: async () => { reloads += 1; return committed; },
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.text()).includes('effectMarker'), false);
  assert.equal(reloads, 0);
  assert.equal(claimed.status, 'claimed');

  const restored = await handleEnterpriseIntelligenceRequest(request(), {
    authenticate: async () => ({ id: replayAuthority.actorId }),
    resolveOrganization: async () => replayAuthority.organizationId,
    resolveCommandAuthority: async () => replayAuthority,
    assertCurrentAuthority: async current => current,
    claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
    executeCommand: async () => { effects += 1; return effectResult; },
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json() as { effectMarker?: boolean }).effectMarker, true);
  assert.deepEqual({ effects, reloads }, { effects: 1, reloads: 0 });
}
console.log('ok - all ten command classes leave effect-backed receipts untouched while revoked and reconcile once after restore');

for (const [index, commandType] of replayCommands.entries()) {
  const envelope = {
    commandType,
    requestId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    idempotencyKey: `replay-authority-${index + 1}`,
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: commandType.startsWith('approval.')
      ? { resourceType: 'delivery_work_package' }
      : {},
  };
  const receipt: EnterpriseReceiptRow = {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    request_hash: 'a'.repeat(64),
    initial_request_id: envelope.requestId,
    last_request_id: envelope.requestId,
    execution_token: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    execution_fence: 1,
    lease_expires_at: '2026-08-07T00:00:00.000Z',
    status: 'committed',
    resource_id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    response: { ...enterpriseResultFor(commandType, `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`), historicalMarker: true },
  };
  const buildOverrides = (denyAt: number | null) => {
    let authorityChecks = 0;
    let claims = 0;
    return {
      overrides: {
        authenticate: async () => ({ id: replayAuthority.actorId }),
        resolveOrganization: async () => replayAuthority.organizationId,
        resolveCommandAuthority: async () => replayAuthority,
        assertCurrentAuthority: async (authority: Authority) => {
          authorityChecks += 1;
          if (authorityChecks === denyAt) throw new EnterpriseCommandError('PERMISSION_DENIED');
          return authority;
        },
        claimReceipt: async () => {
          claims += 1;
          return { receipt, ownsExecution: false };
        },
      },
      counts: () => ({ authorityChecks, claims }),
    };
  };

  const preclaimRevoked = buildOverrides(1);
  const preclaimDenied = await handleEnterpriseIntelligenceRequest(
    new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) }),
    preclaimRevoked.overrides,
  );
  assert.equal(preclaimDenied.status, 403);
  assert.equal(preclaimRevoked.counts().claims, 0);

  const replayRevoked = buildOverrides(2);
  const denied = await handleEnterpriseIntelligenceRequest(
    new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) }),
    replayRevoked.overrides,
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.text()).includes('historicalMarker'), false);
  assert.deepEqual(replayRevoked.counts(), { authorityChecks: 2, claims: 1 });

  const restored = buildOverrides(null);
  const replayed = await handleEnterpriseIntelligenceRequest(
    new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) }),
    restored.overrides,
  );
  assert.equal(replayed.status, 200);
  assert.equal((await replayed.json() as { historicalMarker?: boolean }).historicalMarker, true);
  assert.deepEqual(restored.counts(), { authorityChecks: 2, claims: 1 });
}
console.log('ok - all ten command classes deny revoked replay without receipt mutation and disclose after authority restoration');

for (const [commandIndex, commandType] of replayCommands.entries()) {
  for (const [statusIndex, [code, expectedStatus]] of enterpriseTerminalStatusMatrix.entries()) {
    const envelope = {
      commandType,
      requestId: `51000000-0000-4000-8000-${String(commandIndex * 10 + statusIndex + 1).padStart(12, '0')}`,
      idempotencyKey: `terminal-http-${commandIndex + 1}-${statusIndex + 1}`,
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: commandType.startsWith('approval.') ? { resourceType: 'delivery_work_package' } : {},
    };
    const persistedBody = enterpriseCommandErrorBody(new EnterpriseCommandError(code));
    const receipt: EnterpriseReceiptRow = {
      id: `52000000-0000-4000-8000-${String(commandIndex * 10 + statusIndex + 1).padStart(12, '0')}`,
      request_hash: 'e'.repeat(64), initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
      execution_token: `53000000-0000-4000-8000-${String(commandIndex * 10 + statusIndex + 1).padStart(12, '0')}`,
      execution_fence: 1, lease_expires_at: '2026-08-07T00:00:00.000Z',
      status: code === 'PERMISSION_DENIED' ? 'blocked' : 'failed', response: persistedBody,
    };
    let executions = 0;
    const response = await handleEnterpriseIntelligenceRequest(
      new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) }),
      {
        authenticate: async () => ({ id: replayAuthority.actorId }),
        resolveOrganization: async () => replayAuthority.organizationId,
        resolveCommandAuthority: async () => replayAuthority,
        assertCurrentAuthority: async current => current,
        claimReceipt: async () => ({ receipt, ownsExecution: false }),
        executeCommand: async () => { executions += 1; return {}; },
      },
    );
    assert.equal(response.status, expectedStatus);
    assert.deepEqual((await response.json() as { error?: unknown }).error, persistedBody.error);
    assert.equal(executions, 0);
  }
}
console.log('ok - all ten command classes replay persisted 400/403/404/409/503 HTTP contracts exactly');

test('generic provider commands enforce provider-specific organization and workspace authority', () => {
  const providerAuthority = (organization: string[], workspace: string[]): Authority => ({
    ...replayAuthority,
    permissions: new Set([...organization, ...workspace]),
    organizationPermissions: new Set(organization),
    workspacePermissions: new Set(workspace),
  });
  const workspaceOnly = providerAuthority([], ['byok.manage']);
  assert.doesNotThrow(() => assertEnterpriseCommandOperationAuthority(workspaceOnly, 'provider.route.toggle'));
  for (const operation of ['provider.register', 'provider.validate', 'provider.activate'] as const) {
    assert.throws(
      () => assertEnterpriseCommandOperationAuthority(workspaceOnly, operation),
      (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'PERMISSION_DENIED',
    );
  }
  const organizationByokOnly = providerAuthority(['byok.manage'], []);
  for (const operation of ['provider.register', 'provider.validate', 'provider.activate'] as const) {
    assert.doesNotThrow(() => assertEnterpriseCommandOperationAuthority(organizationByokOnly, operation));
  }
  assert.throws(
    () => assertEnterpriseCommandOperationAuthority(organizationByokOnly, 'provider.revoke'),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'PERMISSION_DENIED',
  );
  const organizationSecurity = providerAuthority(['byok.manage', 'security.manage'], []);
  assert.doesNotThrow(() => assertEnterpriseCommandOperationAuthority(organizationSecurity, 'provider.revoke'));
});

test('generic provider authorization staleness remains explicitly recoverable', () => {
  const mapped = mapProviderLifecycleCommandError(new (class extends Error {})());
  assert.equal(mapped.code, 'COMMAND_BLOCKED');
  const stale = mapProviderLifecycleCommandError(new ProviderLifecycleError('AUTHORIZATION_STALE'));
  assert.equal(stale.code, 'AUTHORIZATION_STALE');
  assert.equal(isRecoverableEnterpriseCommandError(stale), true);
  const rpcStale = mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  }));
  assert.equal(rpcStale.code, 'AUTHORIZATION_STALE');
  assert.equal(isRecoverableEnterpriseCommandError(rpcStale), true);
  assert.equal(shouldPreserveClaimedEnterpriseReceipt(rpcStale, { providerConfigId: base.organizationId }), true);
});

for (const [index, commandType] of replayCommands.entries()) {
  const resourceId = `41000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const envelope = {
    commandType,
    requestId: `42000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    idempotencyKey: `systemic-authority-${index + 1}`,
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: commandType.startsWith('approval.') ? { resourceType: 'delivery_work_package' } : {},
  };
  const claimed: EnterpriseReceiptRow = {
    id: `43000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    request_hash: 'b'.repeat(64), initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
    execution_token: `44000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    execution_fence: 1, lease_expires_at: '2026-08-07T00:00:00.000Z', status: 'claimed',
  };
  const result = enterpriseResultFor(commandType, resourceId);
  const committed: EnterpriseReceiptRow = { ...claimed, status: 'committed', resource_id: resourceId, response: result };
  const request = () => new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) });

  for (const denyAt of [3, 4]) {
    let authorityChecks = 0;
    let completions = 0;
    const response = await handleEnterpriseIntelligenceRequest(request(), {
      authenticate: async () => ({ id: replayAuthority.actorId }),
      resolveOrganization: async () => replayAuthority.organizationId,
      resolveCommandAuthority: async () => replayAuthority,
      assertCurrentAuthority: async current => {
        authorityChecks += 1;
        if (authorityChecks >= denyAt) throw new EnterpriseCommandError('PERMISSION_DENIED');
        return current;
      },
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      executeCommand: async () => result,
      completeReceipt: async () => { completions += 1; return committed; },
      reloadReceipt: async () => claimed,
    });
    assert.equal(response.status, 403);
    assert.equal((await response.text()).includes(resourceId), false);
    assert.equal(completions, denyAt === 3 ? 0 : 1);
  }

  for (const denyAt of [3, 4]) {
    let authorityChecks = 0;
    let failures = 0;
    const response = await handleEnterpriseIntelligenceRequest(request(), {
      authenticate: async () => ({ id: replayAuthority.actorId }),
      resolveOrganization: async () => replayAuthority.organizationId,
      resolveCommandAuthority: async () => replayAuthority,
      assertCurrentAuthority: async current => {
        authorityChecks += 1;
        if (authorityChecks >= denyAt) throw new EnterpriseCommandError('PERMISSION_DENIED');
        return current;
      },
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      executeCommand: async () => { throw new EnterpriseCommandError('COMMAND_BLOCKED'); },
      reloadReceipt: async () => claimed,
      failReceipt: async () => {
        failures += 1;
        return { ...claimed, status: 'blocked', response: enterpriseCommandErrorBody(new EnterpriseCommandError('COMMAND_BLOCKED')) };
      },
    });
    assert.equal(response.status, 403);
    assert.equal((await response.text()).includes('COMMAND_BLOCKED'), false);
    assert.equal(failures, 0);
  }

  let executions = 0;
  let completions = 0;
  const reconciled = await handleEnterpriseIntelligenceRequest(request(), {
    authenticate: async () => ({ id: replayAuthority.actorId }),
    resolveOrganization: async () => replayAuthority.organizationId,
    resolveCommandAuthority: async () => replayAuthority,
    assertCurrentAuthority: async current => current,
    claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
    executeCommand: async () => { executions += 1; return result; },
    completeReceipt: async () => { completions += 1; throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED'); },
    reloadReceipt: async () => committed,
  });
  assert.equal(reconciled.status, 200);
  assert.equal((await reconciled.json() as { resourceId?: string }).resourceId, resourceId);
  assert.deepEqual({ executions, completions }, { executions: 1, completions: 1 });
}
console.log('ok - all ten command classes reauthorize success/failure finalization and reconcile response loss');

for (const [index, commandType] of replayCommands.entries()) {
  for (const status of ['failed', 'blocked', 'claimed'] as const) {
    const envelope = {
      commandType,
      requestId: `45000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      idempotencyKey: `terminal-state-${status}-${index + 1}`,
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: commandType.startsWith('approval.') ? { resourceType: 'delivery_work_package' } : {},
    };
    const receipt: EnterpriseReceiptRow = {
      id: `46000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      request_hash: 'c'.repeat(64), initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
      execution_token: `47000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      execution_fence: 1, lease_expires_at: '2026-08-07T00:00:00.000Z', status,
      response: status === 'claimed' ? undefined : { historicalFailureMarker: true },
    };
    const snapshot = JSON.stringify(receipt);
    const request = () => new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) });
    let checks = 0;
    const denied = await handleEnterpriseIntelligenceRequest(request(), {
      authenticate: async () => ({ id: replayAuthority.actorId }),
      resolveOrganization: async () => replayAuthority.organizationId,
      resolveCommandAuthority: async () => replayAuthority,
      assertCurrentAuthority: async current => {
        checks += 1;
        if (checks >= 2) throw new EnterpriseCommandError('PERMISSION_DENIED');
        return current;
      },
      claimReceipt: async () => ({ receipt, ownsExecution: false }),
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.text()).includes('historicalFailureMarker'), false);
    assert.equal(JSON.stringify(receipt), snapshot);

    const restored = await handleEnterpriseIntelligenceRequest(request(), {
      authenticate: async () => ({ id: replayAuthority.actorId }),
      resolveOrganization: async () => replayAuthority.organizationId,
      resolveCommandAuthority: async () => replayAuthority,
      assertCurrentAuthority: async current => current,
      claimReceipt: async () => ({ receipt, ownsExecution: false }),
    });
    assert.equal(restored.status, 409);
    assert.equal(JSON.stringify(receipt), snapshot);
    if (status !== 'claimed') {
      assert.equal((await restored.text()).includes('historicalFailureMarker'), true);
    }
  }
}
console.log('ok - all ten command classes protect failed, blocked, and in-progress replay without receipt mutation');

test('structured RPC domain signals map without exposing database text', () => {
  const idempotency = new SupabaseRpcError({ status: 409, databaseMessage: 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT' });
  assert.equal(mapEnterpriseCommandRpcError(idempotency).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(mapEnterpriseReceiptRpcError(idempotency).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE',
  })).code, 'AUTHORIZATION_STALE');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 403, databaseMessage: 'ENTERPRISE_PROVIDER_WORKSPACE_AUTHORITY_REQUIRED',
  })).code, 'PERMISSION_DENIED');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
  })).code, 'COMMAND_IN_PROGRESS');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_EVIDENCE_CANDIDATE_STALE',
  })).code, 'RESOURCE_STALE');
  const unavailable = mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 500, databaseMessage: 'arbitrary database text is discarded',
  }));
  assert.equal(unavailable.code, 'COMMAND_UNAVAILABLE');
  const publicBody = JSON.stringify(enterpriseCommandErrorBody(unavailable));
  assert.equal(publicBody.includes('arbitrary database text'), false);
  assert.equal(publicBody.includes('Supabase RPC failed'), false);
  assert.equal(publicBody, '{"ok":false,"error":{"code":"COMMAND_UNAVAILABLE","message":"The Enterprise Intelligence command could not be completed."}}');

  const governed5xxMappings = [
    ['ENTERPRISE_AI_IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
    ['ENTERPRISE_PROVIDER_AUTHORIZATION_VERSION_STALE', 'AUTHORIZATION_STALE'],
    ['ENTERPRISE_AI_STALE_EXECUTION_FENCE', 'COMMAND_IN_PROGRESS'],
    ['ENTERPRISE_PROVIDER_PERMISSION_DENIED', 'PERMISSION_DENIED'],
    ['ENTERPRISE_AI_COMMAND_NOT_EXECUTABLE', 'COMMAND_IN_PROGRESS'],
    ['ENTERPRISE_EVIDENCE_CANDIDATE_STALE', 'RESOURCE_STALE'],
    ['ENTERPRISE_PROVIDER_ROUTE_BLOCKED', 'COMMAND_BLOCKED'],
    ['ENTERPRISE_MODERNIZATION_SOURCE_NOT_CURRENT', 'RESOURCE_STALE'],
    ['ENTERPRISE_MODERNIZATION_SOURCE_NOT_APPROVED', 'COMMAND_BLOCKED'],
    ['ENTERPRISE_MODERNIZATION_RECOMMENDATION_INVALID', 'COMMAND_BLOCKED'],
    ['ENTERPRISE_MODERNIZATION_RESULT_IDENTITY_MISMATCH', 'RESOURCE_STALE'],
    ['ENTERPRISE_APPROVAL_REVIEW_REQUIRED', 'RESOURCE_STALE'],
    ['ENTERPRISE_APPROVAL_REVIEW_IDENTITY_MISMATCH', 'RESOURCE_STALE'],
  ] as const;
  for (const [signal, expectedCode] of governed5xxMappings) {
    assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
      status: 503,
      databaseMessage: signal,
    })).code, expectedCode);
  }
});

test('recovery retains the immutable planned route and model', () => {
  const plan = {
    jobId: '77777777-7777-4777-8777-777777777777',
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    sourceId: '88888888-8888-4888-8888-888888888888',
    sourceVersionId: '99999999-9999-4999-8999-999999999999',
    capability: 'assess.evidence.extract',
    routeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    providerConfigId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    provider: 'openai',
    model: 'planned-model',
    endpointIdentity: null,
    deploymentIdentity: null,
    promptKey: 'assess.evidence.extract',
    promptVersion: 'enterprise-evidence-extract-1',
    requestHash: 'c'.repeat(64),
  };
  const recovered = readEvidenceExtractionRoutePlan(plan, {
    organizationId: plan.organizationId,
    workspaceId: plan.workspaceId,
    sourceId: plan.sourceId,
    sourceVersionId: plan.sourceVersionId,
    requestHash: plan.requestHash,
  });
  assert.deepEqual(recovered, plan);
  assert.equal(extractionRouteMatchesPlan(recovered!, {
    routeId: plan.routeId,
    providerConfigId: plan.providerConfigId,
    provider: 'openai',
    model: 'planned-model',
  }), true);
  assert.equal(extractionRouteMatchesPlan(recovered!, {
    routeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    providerConfigId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    provider: 'openai',
    model: 'new-default-model',
  }), false);
  assert.throws(() => readEvidenceExtractionRoutePlan({ ...plan, sourceId: base.workspaceId }, {
    organizationId: plan.organizationId,
    workspaceId: plan.workspaceId,
    sourceId: plan.sourceId,
    sourceVersionId: plan.sourceVersionId,
    requestHash: plan.requestHash,
  }), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE');
});

test('only typed staging and commit transport uncertainty preserves the claimed receipt', () => {
  for (const [classification, responseReceived] of [
    ['connection_failed', false],
    ['transient_http_502', true],
    ['transient_http_503', true],
    ['transient_http_504', true],
    ['response_read_failed', true],
  ] as const) {
    const uncertain = mapExtractionPersistenceError(new SupabaseRpcTransportError(classification, responseReceived));
    assert.ok(uncertain instanceof RecoverableEnterpriseCommandError);
    assert.equal(uncertain.code, 'COMMAND_UNAVAILABLE');
    assert.equal(uncertain.disposition, 'preserve_claimed_receipt');
    assert.equal(shouldPreserveClaimedEnterpriseReceipt(uncertain, { jobId: base.requestId }), true);
  }
  assert.equal(shouldPreserveClaimedEnterpriseReceipt(
    new EnterpriseCommandError('COMMAND_UNAVAILABLE'),
    { jobId: base.requestId },
  ), false);
  assert.equal(mapExtractionPersistenceError(new TypeError('unexpected implementation failure')) instanceof RecoverableEnterpriseCommandError, false);
  assert.equal(mapExtractionPersistenceError(new SupabaseRpcError({
    status: 409,
    databaseMessage: 'ENTERPRISE_AI_STALE_EXECUTION_FENCE',
  })).code, 'COMMAND_IN_PROGRESS');
});

test('extraction receipt identity is the explicit extraction job resource', () => {
  const jobId = '77777777-7777-4777-8777-777777777777';
  const sourceId = '88888888-8888-4888-8888-888888888888';
  assert.equal(resolveEnterpriseCommandResourceId('evidence.extract', {
    resourceId: jobId,
    jobId,
    sourceId,
  }), jobId);
});

test('promotion receipt identity is the explicit Assess draft resource', () => {
  const assessDraftId = '55555555-5555-4555-8555-555555555555';
  const sourceId = '66666666-6666-4666-8666-666666666666';
  assert.equal(resolveEnterpriseCommandResourceId('evidence.assess.promote', {
    resourceId: assessDraftId,
    assessDraftId,
    sourceId,
  }), assessDraftId);
  assert.throws(
    () => resolveEnterpriseCommandResourceId('evidence.assess.promote', { assessDraftId, sourceId }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
  );
  assert.throws(
    () => resolveEnterpriseCommandResourceId('evidence.assess.promote', {
      resourceId: sourceId,
      assessDraftId,
      sourceId,
    }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
  );
});

test('all ten command classes require one explicit canonical resource identity', () => {
  for (const [index, commandType] of replayCommands.entries()) {
    const resourceId = `48000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const result = enterpriseResultFor(commandType, resourceId);
    assert.equal(resolveEnterpriseCommandResourceId(commandType, result), resourceId);
    const { resourceId: _missing, ...withoutExplicitId } = result;
    assert.throws(
      () => resolveEnterpriseCommandResourceId(commandType, withoutExplicitId),
      (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
    );
    const lineageKey = Object.keys(result).find(key => key !== 'resourceId');
    if (lineageKey) {
      assert.throws(
        () => resolveEnterpriseCommandResourceId(commandType, { ...result, [lineageKey]: base.organizationId }),
        (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
      );
    }
  }
});

const firstAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const replayAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const changedPayloadHash = await hashReceiptValue({ ...base, requestId: null, payload: { ...base.payload, status: 'rejected' } });
assert.equal(firstAttemptHash, replayAttemptHash);
assert.notEqual(firstAttemptHash, changedPayloadHash);
console.log('ok - requestId is correlation-only while changed payloads conflict');
