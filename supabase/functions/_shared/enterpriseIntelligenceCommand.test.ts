import assert from 'node:assert/strict';
import {
  EnterpriseCommandError,
  RecoverableEnterpriseCommandError,
  enterpriseCommandErrorBody,
  extractionRouteMatchesPlan,
  handleEnterpriseIntelligenceRequest,
  mapEnterpriseCommandRpcError,
  mapExtractionPersistenceError,
  parseEnterpriseCommandEnvelope,
  readEvidenceExtractionRoutePlan,
  requiredCapabilitiesForEnterpriseCommand,
  resolveEnterpriseCommandResourceId,
  shouldPreserveClaimedEnterpriseReceipt,
  type Authority,
} from './enterpriseIntelligenceCommand';
import { hashReceiptValue, mapEnterpriseReceiptRpcError, type EnterpriseReceiptRow } from './enterpriseReceipt';
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
    response: { historicalMarker: true },
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

const firstAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const replayAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const changedPayloadHash = await hashReceiptValue({ ...base, requestId: null, payload: { ...base.payload, status: 'rejected' } });
assert.equal(firstAttemptHash, replayAttemptHash);
assert.notEqual(firstAttemptHash, changedPayloadHash);
console.log('ok - requestId is correlation-only while changed payloads conflict');
