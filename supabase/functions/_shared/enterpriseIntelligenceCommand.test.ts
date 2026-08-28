import assert from 'node:assert/strict';
import {
  assertEnterpriseCommandOperationAuthority,
  EnterpriseCommandError,
  RecoverableEnterpriseCommandError,
  enterpriseCommandErrorBody,
  enterpriseCommandStatusForTerminalReceipt,
  buildTranscriptInputBundleLockRpcInvocation,
  buildGroundedEvidenceCandidate,
  hashEvidenceExcerptAnchor,
  ensureEvidenceSourceUploadPlan,
  extractionRouteMatchesPlan,
  handleEnterpriseIntelligenceRequest,
  isRecoverableEnterpriseCommandError,
  mapEnterpriseCommandRpcError,
  mapProviderLifecycleCommandError,
  mapExtractionPersistenceError,
  parseEnterpriseCommandEnvelope,
  readEvidenceExtractionRoutePlan,
  reconcileEvidenceSourceUpload,
  deriveTranscriptCommandRequestBinding,
  requiredCapabilitiesForEnterpriseCommand,
  resolveEnterpriseCommandResourceId,
  shouldPreserveClaimedEnterpriseReceipt,
  type Authority,
  type TranscriptCommandRequestBindingDependencies,
} from './enterpriseIntelligenceCommand';
import { inspectBinaryArtifact, StorageArtifactError, uploadBinaryArtifact } from './storage';
import { EVIDENCE_SOURCE_BUCKET } from './storageBoundary';
import { ProviderLifecycleError } from './providerLifecycle';
import {
  EnterpriseReceiptError,
  hashReceiptValue,
  mapEnterpriseReceiptRpcError,
  type EnterpriseReceiptRow,
} from './enterpriseReceipt';
import { SupabaseRpcError, SupabaseRpcTransportError } from './supabase';
import { prBAssertion, studioPrBRuntime } from './studioArtifactPrBTestEvidence';

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
  for (const field of ['bundleHash', 'manifestHash', 'provenanceHash', 'contentHash', 'routePolicyVersion']) {
    assert.throws(
      () => parseEnterpriseCommandEnvelope({ ...base, payload: { ...base.payload, [field]: 'a'.repeat(64) } }),
      (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_PAYLOAD',
    );
  }
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
    'transcript.source-set.create-version': 'transcript.sources.manage',
    'transcript.input-bundle.lock': 'transcript.sources.manage',
    'transcript.assess.extract': 'evidence.write',
    'transcript.assess.candidate.review': 'evidence.review',
    'transcript.assess.apply.preview': 'transcript.assess.apply',
    'transcript.assess.apply.commit': 'transcript.assess.apply',
    'transcript.assess.conflict.resolve': 'transcript.assess.apply',
    'transcript.journey.set-state': 'transcript.journeys.manage',
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

test('derives Studio and Assess source authority from the strict owner module', () => {
  assert.deepEqual(requiredCapabilitiesForEnterpriseCommand(
    'transcript.source-set.create-version', { ownerModule: 'studio' },
  ), ['studio.sources.manage']);
  assert.deepEqual(requiredCapabilitiesForEnterpriseCommand(
    'transcript.input-bundle.lock', { ownerModule: 'assess' },
  ), ['transcript.sources.manage']);
  assert.throws(() => requiredCapabilitiesForEnterpriseCommand(
    'transcript.input-bundle.lock', { ownerModule: 'delivery' },
  ), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_PAYLOAD');
  prBAssertion({
    passed: true, testId: 'STUDIO-TR-003', assertionId: 'authority.studio-source-owner-capability',
    fixture: 'studio-owned-source-command',
    runtimeContext: studioPrBRuntime('studio-source-author', ['studio.sources.manage'], {
      sourcePackage: null, sourceOwnerModule: 'studio', commandType: 'transcript.source-set.create-version',
    }),
  });
  prBAssertion({
    passed: true, testId: 'STUDIO-TR-003', assertionId: 'authority.assess-source-owner-retained',
    fixture: 'assess-owned-source-command',
    runtimeContext: studioPrBRuntime('assess-source-author', ['transcript.sources.manage'], {
      sourcePackage: null, sourceOwnerModule: 'assess', commandType: 'transcript.input-bundle.lock',
    }),
  });
});

const replayAuthority: Authority = {
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: base.organizationId,
  workspaceId: base.workspaceId,
  isAdmin: false,
  permissions: new Set([
    'evidence.write', 'evidence.review', 'assessment.edit', 'portfolio.manage',
    'approvals.review', 'docs.approve', 'monitor.manage', 'assemble.manage',
    'transcript.sources.manage', 'transcript.assess.apply', 'transcript.journeys.manage',
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

test('enforces source-owner capability separation and builds the Studio v2 bundle RPC', () => {
  const studioAuthority: Authority = {
    ...replayAuthority,
    permissions: new Set(['studio.sources.manage']),
  };
  const assessAuthority: Authority = {
    ...replayAuthority,
    permissions: new Set(['transcript.sources.manage']),
  };
  assert.doesNotThrow(() => assertEnterpriseCommandOperationAuthority(
    studioAuthority, 'transcript.input-bundle.lock', { ownerModule: 'studio' },
  ));
  assert.throws(() => assertEnterpriseCommandOperationAuthority(
    assessAuthority, 'transcript.input-bundle.lock', { ownerModule: 'studio' },
  ), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'PERMISSION_DENIED');
  assert.doesNotThrow(() => assertEnterpriseCommandOperationAuthority(
    assessAuthority, 'transcript.input-bundle.lock', { ownerModule: 'assess' },
  ));
  assert.throws(() => assertEnterpriseCommandOperationAuthority(
    studioAuthority, 'transcript.input-bundle.lock', { ownerModule: 'assess' },
  ), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'PERMISSION_DENIED');

  const invocation = buildTranscriptInputBundleLockRpcInvocation(
    '61000000-0000-4000-8000-000000000010', 'studio', [{
      sourceSetVersionId: '61000000-0000-4000-8000-000000000011', ordinal: 1, purpose: 'Studio planning',
    }], 0, studioAuthority, {
      id: '61000000-0000-4000-8000-000000000012',
      execution_token: '61000000-0000-4000-8000-000000000013', execution_fence: 2,
    },
  );
  assert.equal(invocation.name, 'enterprise_transcript_lock_input_bundle_v2');
  assert.equal(invocation.args.p_owner_module, 'studio');
  assert.equal('provider' in invocation.args, false);
  prBAssertion({
    passed: true, testId: 'STUDIO-TR-003', assertionId: 'authority.cross-owner-source-capability-denied',
    fixture: 'studio-assess-source-owner-separation',
    runtimeContext: studioPrBRuntime('studio-source-author', ['studio.sources.manage'], {
      sourcePackage: null, sourceOwnerModule: 'studio', deniedCapability: 'transcript.sources.manage',
      rpc: invocation.name,
    }),
  });
});

{
  const previousDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  const previousFetch = globalThis.fetch;
  const studioAuthority: Authority = { ...replayAuthority, permissions: new Set(['studio.sources.manage']) };
  const sourceVersionId = '64000000-0000-4000-8000-000000000001';
  const sourceSetId = '64000000-0000-4000-8000-000000000002';
  const sourceSetVersionId = '64000000-0000-4000-8000-000000000003';
  const inputBundleId = '64000000-0000-4000-8000-000000000004';
  const seenRpc: Array<{ name: string; args: Record<string, unknown> }> = [];
  let receiptOrdinal = 0;
  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = { env: { get: (key: string) => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
  } as Record<string, string>)[key] } };
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/rest/v1/rpc/')) {
      const name = url.slice(url.lastIndexOf('/') + 1);
      const args = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
      seenRpc.push({ name, args });
      if (name === 'enterprise_ai_plan_command') {
        return Response.json({
          id: args.p_id, request_hash: 'a'.repeat(64), initial_request_id: studioAuthority.actorId,
          last_request_id: studioAuthority.actorId, execution_token: args.p_execution_token,
          execution_fence: args.p_execution_fence, lease_expires_at: '2026-08-28T00:00:00.000Z',
          status: 'claimed', execution_plan: args.p_plan,
        });
      }
      if (name === 'pr1b_assert_command_authority') return Response.json({ ok: true });
      if (name === 'enterprise_transcript_create_source_set_version') {
        return Response.json({ resourceId: sourceSetId, sourceSetId, ownerModule: 'studio' });
      }
      if (name === 'enterprise_transcript_lock_input_bundle_v2') {
        return Response.json({ resourceId: inputBundleId, inputBundleId, ownerModule: 'studio' });
      }
    }
    if (url.includes('/rest/v1/authorization_versions?')) return Response.json([{ version: studioAuthority.authorizationVersion }]);
    if (url.includes('/rest/v1/enterprise_source_sets?') || url.includes('/rest/v1/enterprise_module_input_bundles?')) {
      return Response.json([]);
    }
    throw new Error(`UNEXPECTED_TEST_TRANSPORT:${url}`);
  };
  const run = async (commandType: 'transcript.source-set.create-version' | 'transcript.input-bundle.lock', payload: Record<string, unknown>) => {
    receiptOrdinal += 1;
    const resourceId = commandType === 'transcript.source-set.create-version' ? sourceSetId : inputBundleId;
    const claimed: EnterpriseReceiptRow = {
      id: `64000000-0000-4000-8000-${String(receiptOrdinal + 10).padStart(12, '0')}`,
      request_hash: 'a'.repeat(64), initial_request_id: studioAuthority.actorId, last_request_id: studioAuthority.actorId,
      execution_token: `64000000-0000-4000-8000-${String(receiptOrdinal + 20).padStart(12, '0')}`,
      execution_fence: 1, lease_expires_at: '2026-08-28T00:00:00.000Z', status: 'claimed', execution_plan: {},
    };
    const response = await handleEnterpriseIntelligenceRequest(new Request('http://local/enterprise', {
      method: 'POST', body: JSON.stringify({
        commandType, requestId: `64000000-0000-4000-8000-${String(receiptOrdinal + 30).padStart(12, '0')}`,
        idempotencyKey: `studio-owned-command-${receiptOrdinal}`, organizationId: base.organizationId,
        workspaceId: base.workspaceId, payload,
      }),
    }), {
      authenticate: async () => ({ id: studioAuthority.actorId }),
      resolveOrganization: async () => studioAuthority.organizationId,
      resolveCommandAuthority: async () => studioAuthority,
      assertCurrentAuthority: async (current, selectedCommand, selectedPayload) => {
        assert.equal(selectedPayload?.ownerModule, 'studio');
        assertEnterpriseCommandOperationAuthority(current, selectedCommand, selectedPayload);
        return current;
      },
      transcriptCommandRequestBindingDependencies: {
        findOne: async <T>(table: string) => {
          if (table === 'enterprise_evidence_source_versions') return { id: sourceVersionId } as T;
          if (table === 'enterprise_source_set_versions') return { id: sourceSetVersionId, source_set_id: sourceSetId } as T;
          if (table === 'enterprise_source_sets') return {
            id: sourceSetId, org_id: base.organizationId, workspace_id: base.workspaceId,
            current_version: 0, owner_module: 'studio',
          } as T;
          if (table === 'enterprise_module_input_bundles') return {
            id: inputBundleId, org_id: base.organizationId, workspace_id: base.workspaceId,
            current_version: 0, owner_module: 'studio',
          } as T;
          return null;
        },
      },
      claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
      completeReceipt: async (receipt, _authority, result) => ({
        ...receipt, status: 'committed', resource_id: resourceId, response: result,
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { resourceId?: string }).resourceId, resourceId);
  };
  try {
    await run('transcript.source-set.create-version', {
      ownerModule: 'studio', sourceSetId, displayLabel: 'Studio sources', purpose: 'Direct planning', lock: true,
      expectedVersion: 0, items: [{ sourceVersionId, ordinal: 1, role: 'primary', note: 'Exact source' }],
    });
    await run('transcript.input-bundle.lock', {
      ownerModule: 'studio', inputBundleId, expectedVersion: 0,
      sourceSets: [{ sourceSetVersionId, ordinal: 1, purpose: 'Direct planning' }],
    });
    const sourceRpc = seenRpc.find(call => call.name === 'enterprise_transcript_create_source_set_version');
    const bundleRpc = seenRpc.find(call => call.name === 'enterprise_transcript_lock_input_bundle_v2');
    assert.equal(sourceRpc?.args.p_owner_module, 'studio');
    assert.equal(bundleRpc?.args.p_owner_module, 'studio');
    assert.equal(bundleRpc?.args.p_input_bundle, inputBundleId);
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = previousDeno;
  }
  console.log('ok - executes Studio-owned source-set and bundle commands with exact owner-bound RPC payloads');
}

{
  const previousDeno = (globalThis as typeof globalThis & { Deno?: unknown }).Deno;
  const previousFetch = globalThis.fetch;
  const documentId = '64100000-0000-4000-8000-000000000001';
  const deliveryAuthority: Authority = { ...replayAuthority, permissions: new Set(['docs.approve']) };
  (globalThis as typeof globalThis & { Deno?: unknown }).Deno = { env: { get: (key: string) => ({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
  } as Record<string, string>)[key] } };
  try {
    for (const [index, sourceMode] of ['direct_transcript_bundle', 'assess_plus_transcript_bundle', 'manual_brief'].entries()) {
      let aggregateReads = 0;
      let downstreamEffects = 0;
      let authorityChecks = 0;
      globalThis.fetch = async input => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/rest/v1/authorization_versions?')) return Response.json([{ version: deliveryAuthority.authorizationVersion }]);
        if (url.endsWith('/rest/v1/rpc/pr1b_assert_command_authority')) return Response.json({ ok: true });
        if (url.includes('/rest/v1/studio_artifact_aggregates?')) {
          aggregateReads += 1;
          return Response.json([{ id: documentId, artifact_type: 'brd', current_approved_version_id: '64100000-0000-4000-8000-000000000002', lifecycle: 'approved', source_mode: sourceMode }]);
        }
        downstreamEffects += 1;
        throw new Error(`UNEXPECTED_DOWNSTREAM_EFFECT:${url}`);
      };
      const requestId = `64100000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`;
      const claimed: EnterpriseReceiptRow = {
        id: `64100000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
        request_hash: 'b'.repeat(64), initial_request_id: requestId, last_request_id: requestId,
        execution_token: `64100000-0000-4000-8000-${String(index + 30).padStart(12, '0')}`,
        execution_fence: 1, lease_expires_at: '2026-08-28T00:00:00.000Z', status: 'claimed', execution_plan: {},
      };
      const response = await handleEnterpriseIntelligenceRequest(new Request('http://local/enterprise', {
        method: 'POST', body: JSON.stringify({
          commandType: 'studio.delivery.handoff', requestId, idempotencyKey: `delivery-guard-${sourceMode}`,
          organizationId: base.organizationId, workspaceId: base.workspaceId, payload: { studioDocumentId: documentId },
        }),
      }), {
        authenticate: async () => ({ id: deliveryAuthority.actorId }),
        resolveOrganization: async () => deliveryAuthority.organizationId,
        resolveCommandAuthority: async () => deliveryAuthority,
        assertCurrentAuthority: async (current, commandType, payload) => {
          authorityChecks += 1;
          assert.equal(commandType, 'studio.delivery.handoff');
          assert.equal(payload?.studioDocumentId, documentId);
          return current;
        },
        claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
        reloadReceipt: async () => claimed,
        failReceipt: async receipt => ({ ...receipt, status: 'blocked', response: enterpriseCommandErrorBody(new EnterpriseCommandError('COMMAND_BLOCKED')) }),
      });
      const responseBody = await response.json() as { error?: { code?: string } };
      assert.equal(response.status, 400, JSON.stringify(responseBody));
      assert.equal(responseBody.error?.code, 'COMMAND_BLOCKED');
      assert.deepEqual({ aggregateReads, downstreamEffects }, { aggregateReads: 1, downstreamEffects: 0 });
      assert.ok(authorityChecks >= 5);
    }
  } finally {
    globalThis.fetch = previousFetch;
    (globalThis as typeof globalThis & { Deno?: unknown }).Deno = previousDeno;
  }
  console.log('ok - blocks every non-Assess Studio source mode before any Delivery effect and retains payload-bound reauthorization');
}

const replayCommands = [
  'evidence.source.create', 'evidence.extract', 'evidence.candidate.review',
  'evidence.assess.promote', 'transcript.source-set.create-version', 'transcript.input-bundle.lock',
  'transcript.assess.extract', 'transcript.assess.candidate.review', 'transcript.assess.apply.preview',
  'transcript.assess.apply.commit', 'transcript.assess.conflict.resolve', 'transcript.journey.set-state',
  'modernization.evaluate', 'approval.review.record',
  'approval.record', 'studio.delivery.handoff', 'monitor.baseline.create',
  'assemble.blueprint.create',
] as const;

type ReplayCommand = typeof replayCommands[number];

type AssertionRuntimeLineage = {
  sourceVersionSelectors: string[];
  sourceSets: Array<{ id: string; versionSelector: string; version: number }>;
  inputBundles: Array<{ id: string; versionSelector: string; version: number }>;
  extractionJobIds: string[];
  extractionBindingIds: string[];
  candidates: Array<{ id: string; version: number }>;
  previewBatchIds: string[];
  assessDrafts: Array<{ id: string; version: number }>;
};

const emptyAssertionRuntimeLineage = (): AssertionRuntimeLineage => ({
  sourceVersionSelectors: [], sourceSets: [], inputBundles: [], extractionJobIds: [],
  extractionBindingIds: [], candidates: [], previewBatchIds: [], assessDrafts: [],
});

const emitApiAssertion = (
  testId: 'AUTH-001' | 'AUTH-002' | 'AUTH-003' | 'AUTH-004',
  assertionId: string,
  runtimeContext: {
    persona: { id: string; state: string; capabilities: string[] };
    organizationId: string;
    workspaceId: string;
    fixtureIds: string[];
    lineage: AssertionRuntimeLineage;
  },
) => {
  if (process.env.PR_A_COMMAND_ID && process.env.PR_A_COMMAND_ID !== 'pr-a-api') return;
  console.log(`PR_A_ASSERTION ${JSON.stringify({
    testId, assertionId, fixture: 'api-command-contract', result: 'passed', runtimeContext,
  })}`);
};

type ApiExecutionEnvelope = {
  organizationId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
};

const uniqueSorted = (values: string[]) => [...new Set(values)].sort();

const lineageFromExecutedApiEnvelopes = (envelopes: ApiExecutionEnvelope[]): AssertionRuntimeLineage => {
  const lineage = emptyAssertionRuntimeLineage();
  const sourceSets = new Map<string, { id: string; versionSelector: string; version: number }>();
  const inputBundles = new Map<string, { id: string; versionSelector: string; version: number }>();
  const candidates = new Map<string, { id: string; version: number }>();
  const assessDrafts = new Map<string, { id: string; version: number }>();
  for (const envelope of envelopes) {
    const payload = envelope.payload;
    const sourceVersionSelector = payload.sourceVersionSelector;
    if (typeof sourceVersionSelector === 'string') lineage.sourceVersionSelectors.push(sourceVersionSelector);
    if (Array.isArray(payload.items)) {
      for (const item of payload.items) {
        if (item && typeof item === 'object' && typeof (item as { sourceVersionId?: unknown }).sourceVersionId === 'string') {
          lineage.sourceVersionSelectors.push((item as { sourceVersionId: string }).sourceVersionId);
        }
      }
    }
    const sourceSetId = payload.sourceSetId;
    const sourceSetVersionSelector = payload.sourceSetVersionSelector;
    const sourceSetVersion = payload.expectedSourceSetVersion;
    if (typeof sourceSetId === 'string' && typeof sourceSetVersionSelector === 'string' && typeof sourceSetVersion === 'number') {
      sourceSets.set(sourceSetId, { id: sourceSetId, versionSelector: sourceSetVersionSelector, version: sourceSetVersion });
    }
    if (Array.isArray(payload.sourceSetVersions)) {
      for (const item of payload.sourceSetVersions) {
        if (!item || typeof item !== 'object') continue;
        const value = item as { sourceSetId?: unknown; sourceSetVersionSelector?: unknown; expectedVersion?: unknown };
        if (typeof value.sourceSetId === 'string' && typeof value.sourceSetVersionSelector === 'string' && typeof value.expectedVersion === 'number') {
          sourceSets.set(value.sourceSetId, { id: value.sourceSetId, versionSelector: value.sourceSetVersionSelector, version: value.expectedVersion });
        }
      }
    }
    const inputBundleId = payload.inputBundleId;
    const inputBundleVersionSelector = payload.inputBundleVersionSelector;
    const inputBundleVersion = payload.expectedInputBundleVersion;
    if (typeof inputBundleId === 'string' && typeof inputBundleVersionSelector === 'string' && typeof inputBundleVersion === 'number') {
      inputBundles.set(inputBundleId, { id: inputBundleId, versionSelector: inputBundleVersionSelector, version: inputBundleVersion });
    }
    if (typeof payload.candidateId === 'string' && typeof payload.candidateVersion === 'number') {
      candidates.set(payload.candidateId, { id: payload.candidateId, version: payload.candidateVersion });
    }
    if (typeof payload.previewBatchId === 'string') lineage.previewBatchIds.push(payload.previewBatchId);
    if (typeof payload.assessDraftId === 'string' && typeof payload.expectedDraftVersion === 'number') {
      assessDrafts.set(payload.assessDraftId, { id: payload.assessDraftId, version: payload.expectedDraftVersion });
    }
  }
  return {
    ...lineage,
    sourceVersionSelectors: uniqueSorted(lineage.sourceVersionSelectors),
    sourceSets: [...sourceSets.values()].sort((left, right) => left.id.localeCompare(right.id)),
    inputBundles: [...inputBundles.values()].sort((left, right) => left.id.localeCompare(right.id)),
    candidates: [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)),
    previewBatchIds: uniqueSorted(lineage.previewBatchIds),
    assessDrafts: [...assessDrafts.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
};

const apiRuntimeContextFromExecutedTrace = (trace: {
  actors: string[];
  authorities: Authority[];
  envelopes: ApiExecutionEnvelope[];
  authorityStates: Array<'active' | 'revoked' | 'restored'>;
  fixtureIds: string[];
}) => {
  assert.ok(trace.actors.length > 0 && trace.authorities.length > 0 && trace.envelopes.length > 0);
  const actorIds = uniqueSorted(trace.actors);
  const organizationIds = uniqueSorted(trace.envelopes.map(item => item.organizationId));
  const workspaceIds = uniqueSorted(trace.envelopes.map(item => item.workspaceId));
  assert.equal(actorIds.length, 1); assert.equal(organizationIds.length, 1); assert.equal(workspaceIds.length, 1);
  for (const authority of trace.authorities) {
    assert.equal(authority.actorId, actorIds[0]);
    assert.equal(authority.organizationId, organizationIds[0]);
    assert.equal(authority.workspaceId, workspaceIds[0]);
  }
  const observedStates = new Set(trace.authorityStates);
  const state = observedStates.has('revoked') && observedStates.has('restored') ? 'revoked-then-restored' : 'active';
  return {
    persona: {
      id: actorIds[0], state,
      capabilities: uniqueSorted(trace.authorities.flatMap(authority => [...authority.permissions])),
    },
    organizationId: organizationIds[0], workspaceId: workspaceIds[0],
    fixtureIds: uniqueSorted(trace.fixtureIds),
    lineage: lineageFromExecutedApiEnvelopes(trace.envelopes),
  };
};

const selectorFixtures = {
  sourceSetIds: ['65000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000002'],
  sourceSetVersionSelectors: ['65000000-0000-4000-8000-000000000011', '65000000-0000-4000-8000-000000000012'],
  inputBundleIds: ['65000000-0000-4000-8000-000000000021', '65000000-0000-4000-8000-000000000022'],
  inputBundleVersionSelectors: ['65000000-0000-4000-8000-000000000031', '65000000-0000-4000-8000-000000000032'],
  sourceVersionSelectors: ['65000000-0000-4000-8000-000000000041', '65000000-0000-4000-8000-000000000042'],
  journeyIds: ['65000000-0000-4000-8000-000000000051', '65000000-0000-4000-8000-000000000052'],
  candidateIds: ['65000000-0000-4000-8000-000000000061', '65000000-0000-4000-8000-000000000062'],
  assessDraftIds: ['65000000-0000-4000-8000-000000000071', '65000000-0000-4000-8000-000000000072'],
  previewBatchIds: ['65000000-0000-4000-8000-000000000081', '65000000-0000-4000-8000-000000000082'],
  conflictIds: ['65000000-0000-4000-8000-000000000091', '65000000-0000-4000-8000-000000000092'],
} as const;

const selectorPayload = (caseName: string, index: number): Record<string, unknown> => {
  const commonExtraction = {
    inputBundleId: selectorFixtures.inputBundleIds[index],
    inputBundleVersionSelector: selectorFixtures.inputBundleVersionSelectors[index],
    expectedInputBundleVersion: 1,
    sourceSetId: selectorFixtures.sourceSetIds[index],
    sourceSetVersionSelector: selectorFixtures.sourceSetVersionSelectors[index],
    expectedSourceSetVersion: 1,
    sourceVersionSelector: selectorFixtures.sourceVersionSelectors[index],
  };
  switch (caseName) {
    case 'source-set': return {
      ownerModule: 'assess', sourceSetId: selectorFixtures.sourceSetIds[index],
      displayLabel: 'Assess sources', purpose: 'Assessment evidence', lock: true, expectedVersion: 1,
      items: [{ sourceVersionId: selectorFixtures.sourceVersionSelectors[index], ordinal: 1, role: 'primary' }],
    };
    case 'input-bundle': return {
      ownerModule: 'assess', inputBundleId: selectorFixtures.inputBundleIds[index], expectedVersion: 1,
      sourceSets: [{ sourceSetVersionId: selectorFixtures.sourceSetVersionSelectors[index], ordinal: 1, purpose: 'Assessment input' }],
    };
    case 'extract': return commonExtraction;
    case 'journey': return {
      journeyId: selectorFixtures.journeyIds[index], entryModule: 'assess', desiredExitModule: 'studio',
      status: 'active', expectedVersion: 1,
    };
    case 'candidate': return {
      candidateId: selectorFixtures.candidateIds[index], candidateVersion: 1, status: 'accepted',
      ...commonExtraction,
    };
    case 'apply-preview': return {
      assessDraftId: selectorFixtures.assessDraftIds[index], expectedDraftVersion: 1,
      inputBundleId: selectorFixtures.inputBundleIds[index],
      inputBundleVersionSelector: selectorFixtures.inputBundleVersionSelectors[index],
      expectedInputBundleVersion: 1,
      sourceSetVersions: [{
        sourceSetId: selectorFixtures.sourceSetIds[index],
        sourceSetVersionSelector: selectorFixtures.sourceSetVersionSelectors[index],
        expectedVersion: 1, ordinal: 1,
      }],
      selections: [],
    };
    case 'apply-commit': return {
      previewBatchId: selectorFixtures.previewBatchIds[index],
      assessDraftId: selectorFixtures.assessDraftIds[index], expectedDraftVersion: 1,
      inputBundleId: selectorFixtures.inputBundleIds[index],
      inputBundleVersionSelector: selectorFixtures.inputBundleVersionSelectors[index],
      expectedInputBundleVersion: 1,
      sourceSetVersions: [{
        sourceSetId: selectorFixtures.sourceSetIds[index],
        sourceSetVersionSelector: selectorFixtures.sourceSetVersionSelectors[index],
        expectedVersion: 1, ordinal: 1,
      }],
    };
    case 'conflict': return {
      conflictId: selectorFixtures.conflictIds[index], resolutionVersion: 1,
      resolution: 'retain_manual', rationale: 'governed reviewer decision',
    };
    default: throw new Error(`unknown selector case ${caseName}`);
  }
};

{
  const studioAuthority: Authority = { ...replayAuthority, permissions: new Set(['studio.sources.manage']) };
  const studioSourceSetPayload = {
    ownerModule: 'studio', sourceSetId: selectorFixtures.sourceSetIds[0], displayLabel: 'Studio sources',
    purpose: 'Direct planning', lock: true, expectedVersion: 1,
    items: [{ sourceVersionId: selectorFixtures.sourceVersionSelectors[0], ordinal: 1, role: 'primary' }],
  };
  const studioSourceSetEnvelope = parseEnterpriseCommandEnvelope({
    commandType: 'transcript.source-set.create-version', requestId: '62000000-0000-4000-8000-000000000001',
    idempotencyKey: 'studio-source-owner-preclaim', organizationId: base.organizationId,
    workspaceId: base.workspaceId, payload: studioSourceSetPayload,
  });
  const sourceSetBinding = await deriveTranscriptCommandRequestBinding(studioAuthority, studioSourceSetEnvelope, {
    findOne: async <T>(table: string) => {
      if (table === 'enterprise_source_sets') return {
        org_id: base.organizationId, workspace_id: base.workspaceId, current_version: 1, owner_module: 'studio',
      } as T;
      if (table === 'enterprise_evidence_source_versions') return { id: selectorFixtures.sourceVersionSelectors[0] } as T;
      return null;
    },
  });
  assert.equal(sourceSetBinding?.ownerModule, 'studio');
  await assert.rejects(() => deriveTranscriptCommandRequestBinding(studioAuthority, studioSourceSetEnvelope, {
    findOne: async <T>(table: string) => table === 'enterprise_source_sets' ? {
      org_id: base.organizationId, workspace_id: base.workspaceId, current_version: 1, owner_module: 'assess',
    } as T : { id: selectorFixtures.sourceVersionSelectors[0] } as T,
  }), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_NOT_FOUND');

  const studioBundleEnvelope = parseEnterpriseCommandEnvelope({
    commandType: 'transcript.input-bundle.lock', requestId: '62000000-0000-4000-8000-000000000002',
    idempotencyKey: 'studio-bundle-owner-preclaim', organizationId: base.organizationId,
    workspaceId: base.workspaceId, payload: {
      ownerModule: 'studio', inputBundleId: selectorFixtures.inputBundleIds[0], expectedVersion: 1,
      sourceSets: [{ sourceSetVersionId: selectorFixtures.sourceSetVersionSelectors[0], ordinal: 1, purpose: 'Studio planning' }],
    },
  });
  const bundleDependencies = (selectedOwner: 'assess' | 'studio'): Partial<TranscriptCommandRequestBindingDependencies> => ({
    findOne: async <T>(table: string, query: string) => {
      if (table === 'enterprise_module_input_bundles') return {
        org_id: base.organizationId, workspace_id: base.workspaceId, current_version: 1, owner_module: 'studio',
      } as T;
      if (table === 'enterprise_source_set_versions') return {
        id: selectorFixtures.sourceSetVersionSelectors[0], source_set_id: selectorFixtures.sourceSetIds[0],
      } as T;
      if (table === 'enterprise_source_sets' && query.includes(selectorFixtures.sourceSetIds[0])) return {
        id: selectorFixtures.sourceSetIds[0], owner_module: selectedOwner,
      } as T;
      return null;
    },
  });
  const bundleBinding = await deriveTranscriptCommandRequestBinding(
    studioAuthority, studioBundleEnvelope, bundleDependencies('studio'),
  );
  assert.equal(bundleBinding?.ownerModule, 'studio');
  await assert.rejects(() => deriveTranscriptCommandRequestBinding(
    studioAuthority, studioBundleEnvelope, bundleDependencies('assess'),
  ), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_NOT_FOUND');
  prBAssertion({
    passed: true, testId: 'STUDIO-TR-003', assertionId: 'authority.preclaim-cross-owner-selector-rejected',
    fixture: 'studio-bundle-assess-source-set-substitution',
    runtimeContext: studioPrBRuntime('studio-source-author', ['studio.sources.manage'], {
      sourcePackage: null, sourceOwnerModule: 'studio', sourceSetVersionId: selectorFixtures.sourceSetVersionSelectors[0],
      rejectedSourceSetOwnerModule: 'assess', inputBundleId: selectorFixtures.inputBundleIds[0],
    }),
  });
}

const selectorCases = [
  ['source-set', 'transcript.source-set.create-version'],
  ['input-bundle', 'transcript.input-bundle.lock'],
  ['extract', 'transcript.assess.extract'],
  ['journey', 'transcript.journey.set-state'],
  ['candidate', 'transcript.assess.candidate.review'],
  ['apply-preview', 'transcript.assess.apply.preview'],
  ['apply-commit', 'transcript.assess.apply.commit'],
  ['conflict', 'transcript.assess.conflict.resolve'],
] as const;

type SelectorExecutionTrace = {
  actors: string[];
  authorities: Authority[];
  envelopes: ApiExecutionEnvelope[];
  authorityStates: Array<'active' | 'revoked' | 'restored'>;
  fixtureIds: string[];
  requestedSubcaseKeys: string[];
  completedSubcaseKeys: string[];
};

const selectorExecutionTrace: SelectorExecutionTrace = {
  actors: [], authorities: [], envelopes: [], authorityStates: [], fixtureIds: [],
  requestedSubcaseKeys: [], completedSubcaseKeys: [],
};

const collectPayloadFixtureIds = (value: unknown, fixtureIds: string[] = []): string[] => {
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) fixtureIds.push(value);
    return fixtureIds;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPayloadFixtureIds(item, fixtureIds);
    return fixtureIds;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectPayloadFixtureIds(item, fixtureIds);
  }
  return fixtureIds;
};

const tracedSelectorRequest = (
  subcaseKey: string,
  envelope: ApiExecutionEnvelope & { commandType: string; requestId: string; idempotencyKey: string },
) => {
  selectorExecutionTrace.requestedSubcaseKeys.push(subcaseKey);
  selectorExecutionTrace.envelopes.push(structuredClone(envelope));
  selectorExecutionTrace.fixtureIds.push(...collectPayloadFixtureIds(envelope.payload));
  return new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(envelope) });
};

const completeSelectorSubcase = (subcaseKey: string) => {
  selectorExecutionTrace.completedSubcaseKeys.push(subcaseKey);
};

const tracedSelectorAuthority = () => ({
  authenticate: async () => {
    selectorExecutionTrace.actors.push(replayAuthority.actorId);
    return { id: replayAuthority.actorId };
  },
  resolveOrganization: async () => replayAuthority.organizationId,
  resolveCommandAuthority: async () => {
    selectorExecutionTrace.authorities.push(replayAuthority);
    selectorExecutionTrace.authorityStates.push('active' as const);
    return replayAuthority;
  },
  assertCurrentAuthority: async (current: Authority) => current,
});

const expectedSelectorSubcaseKeys = [
  ...selectorCases.flatMap(([caseName]) => ['foreign', 'missing'].map(disposition => `selector:${caseName}:${disposition}`)),
  'extraction-source-version:foreign', 'extraction-source-version:missing',
  'bundle-lineage:apply-preview:foreign', 'bundle-lineage:apply-preview:missing',
  'bundle-lineage:apply-commit:foreign', 'bundle-lineage:apply-commit:missing',
  'conflict-candidate:foreign', 'conflict-candidate:missing', 'conflict-candidate:nonmember',
  'removed-seam:derive-binding', 'removed-seam:extraction-selection', 'removed-seam:bundle-lineage',
].sort();

const expectedSelectorCompletionKeys = [
  ...expectedSelectorSubcaseKeys,
  ...selectorCases.map(([caseName]) => `nondisclosure:selector:${caseName}`),
  'nondisclosure:extraction-source-version',
  'nondisclosure:bundle-lineage:apply-preview', 'nondisclosure:bundle-lineage:apply-commit',
  'nondisclosure:conflict-candidate',
].sort();

const selectorRuntimeContextFromExecutedTrace = (trace: SelectorExecutionTrace) => {
  assert.deepEqual(uniqueSorted(trace.requestedSubcaseKeys), expectedSelectorSubcaseKeys, 'AUTH_RUNTIME_TRACE_REQUESTED_SUBCASES');
  assert.equal(trace.requestedSubcaseKeys.length, expectedSelectorSubcaseKeys.length, 'AUTH_RUNTIME_TRACE_REQUESTED_CARDINALITY');
  assert.deepEqual(uniqueSorted(trace.completedSubcaseKeys), expectedSelectorCompletionKeys, 'AUTH_RUNTIME_TRACE_COMPLETED_SUBCASES');
  assert.equal(trace.completedSubcaseKeys.length, expectedSelectorCompletionKeys.length, 'AUTH_RUNTIME_TRACE_COMPLETED_CARDINALITY');
  assert.equal(trace.envelopes.length, expectedSelectorSubcaseKeys.length, 'AUTH_RUNTIME_TRACE_ENVELOPE_CARDINALITY');
  assert.equal(trace.actors.length, expectedSelectorSubcaseKeys.length, 'AUTH_RUNTIME_TRACE_ACTOR_CARDINALITY');
  assert.equal(trace.authorities.length, expectedSelectorSubcaseKeys.length, 'AUTH_RUNTIME_TRACE_AUTHORITY_CARDINALITY');
  return apiRuntimeContextFromExecutedTrace(trace);
};

const foreignSelectorOrganizationId = '66000000-0000-4000-8000-000000000001';
const foreignSelectorTenants = new Map<string, string>([
  selectorFixtures.sourceSetIds[0], selectorFixtures.inputBundleIds[0],
  selectorFixtures.sourceSetVersionSelectors[0], selectorFixtures.inputBundleVersionSelectors[0],
  selectorFixtures.sourceVersionSelectors[0], selectorFixtures.journeyIds[0],
  selectorFixtures.candidateIds[0], selectorFixtures.assessDraftIds[0],
  selectorFixtures.previewBatchIds[0], selectorFixtures.conflictIds[0],
].map(id => [id, foreignSelectorOrganizationId]));

const selectorPrimaryId = (caseName: string, index: number) => {
  switch (caseName) {
    case 'source-set': return selectorFixtures.sourceSetIds[index];
    case 'input-bundle': case 'extract': return selectorFixtures.inputBundleIds[index];
    case 'journey': return selectorFixtures.journeyIds[index];
    case 'candidate': return selectorFixtures.candidateIds[index];
    case 'apply-preview': return selectorFixtures.assessDraftIds[index];
    case 'apply-commit': return selectorFixtures.previewBatchIds[index];
    case 'conflict': return selectorFixtures.conflictIds[index];
    default: throw new Error(`unknown selector case ${caseName}`);
  }
};

const querySelectorId = (query: string) => {
  const match = query.match(/(?:^|&)id=eq\.([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

for (const [caseName, commandType] of selectorCases) {
  const responses: string[] = [];
  for (const [index, disposition] of (['foreign', 'missing'] as const).entries()) {
    const mutations = {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    };
    const request = tracedSelectorRequest(`selector:${caseName}:${disposition}`, {
      commandType,
      requestId: disposition === 'foreign'
        ? '61000000-0000-4000-8000-000000000001'
        : '61000000-0000-4000-8000-000000000002',
      idempotencyKey: `auth-preclaim-${caseName}-${disposition}`,
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: selectorPayload(caseName, index),
    });
    const primarySelector = selectorPrimaryId(caseName, index);
    assert.equal(
      foreignSelectorTenants.get(primarySelector),
      disposition === 'foreign' ? foreignSelectorOrganizationId : undefined,
      `${caseName} ${disposition} fixture must model a real foreign resource or a genuinely absent selector`,
    );
    let foreignLookupObserved = false;
    const dependencies: Partial<TranscriptCommandRequestBindingDependencies> = {
      findOne: async <T>(table: string, query: string) => {
        const id = querySelectorId(query);
        const resourceOrganizationId = id ? foreignSelectorTenants.get(id) : undefined;
        if (!resourceOrganizationId) return null;
        foreignLookupObserved = true;
        if (query.includes(`org_id=eq.${encodeURIComponent(base.organizationId)}`)
          && resourceOrganizationId !== base.organizationId) return null;
        if (table === 'enterprise_source_sets' || table === 'enterprise_module_input_bundles') {
          return { org_id: resourceOrganizationId, workspace_id: base.workspaceId,
            current_version: 1, owner_module: 'assess' } as T;
        }
        if (table === 'enterprise_governed_journeys') {
          return { org_id: resourceOrganizationId, workspace_id: base.workspaceId, version: 1, route_policy_version: 1 } as T;
        }
        if (table === 'enterprise_evidence_candidates') {
          return { id, version: 1, ai_job_id: '65000000-0000-4000-8000-0000000000a1',
            source_version_id: selectorFixtures.sourceVersionSelectors[0] } as T;
        }
        if (table === 'assess_v2_cases') return { version: 1, head_version_id: '65000000-0000-4000-8000-0000000000a2' } as T;
        if (table === 'enterprise_assess_apply_preview_batches') {
          return { assess_case_id: selectorFixtures.assessDraftIds[0] } as T;
        }
        if (table === 'enterprise_assess_evidence_conflicts') {
          return { org_id: resourceOrganizationId, workspace_id: base.workspaceId,
            current_resolution_version: 1, candidate_ids: [selectorFixtures.candidateIds[0]] } as T;
        }
        return null;
      },
      findMany: async <T>() => { throw new Error('bundle lineage must not be reached'); },
    };
    const response = await handleEnterpriseIntelligenceRequest(request, {
      ...tracedSelectorAuthority(),
      transcriptCommandRequestBindingDependencies: dependencies,
      claimReceipt: async () => { mutations.receiptClaims += 1; throw new Error('must not claim'); },
      executeCommand: async () => {
        mutations.audits += 1;
        mutations.providers += 1;
        mutations.domainCommands += 1;
        mutations.domainEffects += 1;
        return {};
      },
      completeReceipt: async () => {
        mutations.receiptFinalizations += 1;
        mutations.completions += 1;
        throw new Error('must not complete');
      },
      failReceipt: async () => { mutations.receiptFailures += 1; throw new Error('must not fail'); },
    });
    assert.equal(response.status, 404);
    assert.equal(foreignLookupObserved, disposition === 'foreign');
    responses.push(await response.text());
    assert.deepEqual(mutations, {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    },
      `AUTH-002 ${caseName} rejects ${disposition} authority before receipt, audit, provider, effect, or domain mutation`);
    completeSelectorSubcase(`selector:${caseName}:${disposition}`);
  }
  assert.equal(responses[0], responses[1], `AUTH-001 ${caseName} exposes no foreign-versus-missing resource oracle`);
  completeSelectorSubcase(`nondisclosure:selector:${caseName}`);
}

const sameTenantLineageFixtures = {
  assessDraftId: '68000000-0000-4000-8000-000000000001',
  previewBatchId: '68000000-0000-4000-8000-000000000002',
  inputBundleId: '68000000-0000-4000-8000-000000000003',
  inputBundleVersionId: '68000000-0000-4000-8000-000000000004',
  sourceSetId: '68000000-0000-4000-8000-000000000005',
  sourceSetVersionId: '68000000-0000-4000-8000-000000000006',
  assessHeadVersionId: '68000000-0000-4000-8000-000000000007',
} as const;

const bundleLineagePayload = (caseName: 'apply-preview' | 'apply-commit', index: number) => ({
  ...selectorPayload(caseName, index),
  assessDraftId: sameTenantLineageFixtures.assessDraftId,
  ...(caseName === 'apply-commit' ? { previewBatchId: sameTenantLineageFixtures.previewBatchId } : {}),
  inputBundleId: sameTenantLineageFixtures.inputBundleId,
  inputBundleVersionSelector: sameTenantLineageFixtures.inputBundleVersionId,
});

{
  const responses: string[] = [];
  for (const [index, disposition] of (['foreign', 'missing'] as const).entries()) {
    const sourceVersionId = selectorFixtures.sourceVersionSelectors[index];
    assert.equal(foreignSelectorTenants.has(sourceVersionId), disposition === 'foreign');
    let foreignLookupObserved = false;
    const lookupTables: string[] = [];
    const mutations = {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    };
    const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
      `extraction-source-version:${disposition}`,
      {
        commandType: 'transcript.assess.extract',
        requestId: `68000000-0000-4000-8000-00000000000${index + 8}`,
        idempotencyKey: `auth-extraction-chain-${disposition}`,
        organizationId: base.organizationId,
        workspaceId: base.workspaceId,
        payload: {
          inputBundleId: sameTenantLineageFixtures.inputBundleId,
          inputBundleVersionSelector: sameTenantLineageFixtures.inputBundleVersionId,
          expectedInputBundleVersion: 1,
          sourceSetId: sameTenantLineageFixtures.sourceSetId,
          sourceSetVersionSelector: sameTenantLineageFixtures.sourceSetVersionId,
          expectedSourceSetVersion: 1,
          sourceVersionSelector: sourceVersionId,
        },
      },
    ), {
      ...tracedSelectorAuthority(),
      transcriptCommandRequestBindingDependencies: {
        findOne: async <T>(table: string, query: string) => {
          lookupTables.push(table);
          assert.equal(query.includes(`org_id=eq.${encodeURIComponent(base.organizationId)}`), true);
          assert.equal(query.includes(`workspace_id=eq.${encodeURIComponent(base.workspaceId)}`), true);
          if (table === 'enterprise_module_input_bundle_versions') {
            return { id: sameTenantLineageFixtures.inputBundleVersionId,
              input_bundle_id: sameTenantLineageFixtures.inputBundleId,
              version: 1, bundle_hash: '8'.repeat(64) } as T;
          }
          if (table === 'enterprise_source_set_versions') {
            return { id: sameTenantLineageFixtures.sourceSetVersionId,
              source_set_id: sameTenantLineageFixtures.sourceSetId, version: 1 } as T;
          }
          if (table === 'enterprise_module_input_bundle_items') {
            return { source_set_version_id: sameTenantLineageFixtures.sourceSetVersionId } as T;
          }
          if (table === 'enterprise_source_set_version_items') {
            const id = query.match(/source_version_id=eq\.([^&]+)/)?.[1];
            if (id && foreignSelectorTenants.has(decodeURIComponent(id))) foreignLookupObserved = true;
            return null;
          }
          return null;
        },
        findMany: async <T>() => [] as T[],
      },
      claimReceipt: async () => { mutations.receiptClaims += 1; throw new Error('must not claim'); },
      executeCommand: async () => {
        mutations.audits += 1;
        mutations.providers += 1;
        mutations.domainCommands += 1;
        mutations.domainEffects += 1;
        return {};
      },
      completeReceipt: async () => {
        mutations.receiptFinalizations += 1;
        mutations.completions += 1;
        throw new Error('must not complete');
      },
      failReceipt: async () => { mutations.receiptFailures += 1; throw new Error('must not fail'); },
    });
    assert.equal(response.status, 404);
    assert.equal(foreignLookupObserved, disposition === 'foreign');
    assert.deepEqual(lookupTables, [
      'enterprise_module_input_bundle_versions', 'enterprise_source_set_versions',
      'enterprise_module_input_bundle_items', 'enterprise_source_set_version_items',
    ], 'extraction request binding must traverse the real four-stage scoped lookup chain');
    responses.push(await response.text());
    assert.deepEqual(mutations, {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    });
    completeSelectorSubcase(`extraction-source-version:${disposition}`);
  }
  assert.equal(responses[0], responses[1],
    'AUTH-001 extraction source-version denial exposes no foreign-versus-missing resource oracle');
  completeSelectorSubcase('nondisclosure:extraction-source-version');
}

for (const [caseName, commandType] of ([
  ['apply-preview', 'transcript.assess.apply.preview'],
  ['apply-commit', 'transcript.assess.apply.commit'],
] as const)) {
  const responses: string[] = [];
  for (const [index, disposition] of (['foreign', 'missing'] as const).entries()) {
    const sourceSetVersionId = selectorFixtures.sourceSetVersionSelectors[index];
    assert.equal(foreignSelectorTenants.has(sourceSetVersionId), disposition === 'foreign');
    let foreignLookupObserved = false;
    let lineageLists = 0;
    const mutations = {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    };
    const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
      `bundle-lineage:${caseName}:${disposition}`,
      {
        commandType,
        requestId: `68000000-0000-4000-8000-00000000001${index + 1}`,
        idempotencyKey: `auth-bundle-lineage-${caseName}-${disposition}`,
        organizationId: base.organizationId,
        workspaceId: base.workspaceId,
        payload: bundleLineagePayload(caseName, index),
      },
    ), {
      ...tracedSelectorAuthority(),
      transcriptCommandRequestBindingDependencies: {
        findOne: async <T>(table: string, query: string) => {
          if (table === 'assess_v2_cases') {
            selectorExecutionTrace.fixtureIds.push(sameTenantLineageFixtures.assessHeadVersionId);
            return { version: 1, head_version_id: sameTenantLineageFixtures.assessHeadVersionId } as T;
          }
          if (table === 'enterprise_assess_apply_preview_batches') {
            return { assess_case_id: sameTenantLineageFixtures.assessDraftId, expected_case_version: 1,
              input_bundle_id: sameTenantLineageFixtures.inputBundleId,
              input_bundle_version_id: sameTenantLineageFixtures.inputBundleVersionId,
              input_bundle_version: 1, source_set_version_ids: [sourceSetVersionId] } as T;
          }
          if (table === 'enterprise_module_input_bundle_versions') {
            return { input_bundle_id: sameTenantLineageFixtures.inputBundleId, version: 1, status: 'locked' } as T;
          }
          if (table === 'enterprise_source_set_versions') {
            const id = querySelectorId(query);
            if (id && foreignSelectorTenants.has(id)) foreignLookupObserved = true;
            return null;
          }
          return null;
        },
        findMany: async <T>(table: string, query: string) => {
          assert.equal(table, 'enterprise_module_input_bundle_items');
          assert.equal(query.includes(`org_id=eq.${encodeURIComponent(base.organizationId)}`), true);
          assert.equal(query.includes(`workspace_id=eq.${encodeURIComponent(base.workspaceId)}`), true);
          lineageLists += 1;
          return [{ source_set_id: selectorFixtures.sourceSetIds[index],
            source_set_version_id: sourceSetVersionId, ordinal: 1 }] as T[];
        },
      },
      claimReceipt: async () => { mutations.receiptClaims += 1; throw new Error('must not claim'); },
      executeCommand: async () => {
        mutations.audits += 1;
        mutations.providers += 1;
        mutations.domainCommands += 1;
        mutations.domainEffects += 1;
        return {};
      },
      completeReceipt: async () => {
        mutations.receiptFinalizations += 1;
        mutations.completions += 1;
        throw new Error('must not complete');
      },
      failReceipt: async () => { mutations.receiptFailures += 1; throw new Error('must not fail'); },
    });
    assert.equal(response.status, 404);
    assert.equal(foreignLookupObserved, disposition === 'foreign');
    assert.equal(lineageLists, 1, `${caseName} must execute the real bundle-lineage list lookup`);
    responses.push(await response.text());
    assert.deepEqual(mutations, {
      receiptClaims: 0, receiptFinalizations: 0, receiptFailures: 0,
      audits: 0, providers: 0, domainCommands: 0, domainEffects: 0, completions: 0,
    });
    completeSelectorSubcase(`bundle-lineage:${caseName}:${disposition}`);
  }
  assert.equal(responses[0], responses[1],
    `AUTH-001 ${caseName} bundle lineage exposes no foreign-versus-missing resource oracle`);
  completeSelectorSubcase(`nondisclosure:bundle-lineage:${caseName}`);
}

{
  const candidateResponses: string[] = [];
  for (const [index, disposition] of (['foreign', 'missing'] as const).entries()) {
    let receiptClaims = 0;
    let audits = 0;
    let providers = 0;
    let domainEffects = 0;
    const candidateId = selectorFixtures.candidateIds[index];
    assert.equal(foreignSelectorTenants.has(candidateId), disposition === 'foreign');
    const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
      `conflict-candidate:${disposition}`,
      {
        commandType: 'transcript.assess.conflict.resolve',
        requestId: `67000000-0000-4000-8000-00000000000${index + 1}`,
        idempotencyKey: `conflict-candidate-${disposition}`,
        organizationId: base.organizationId,
        workspaceId: base.workspaceId,
        payload: {
          conflictId: selectorFixtures.conflictIds[1], resolutionVersion: 1,
          resolution: 'select_candidate', candidateId, rationale: 'governed reviewer decision',
        },
      },
    ), {
      ...tracedSelectorAuthority(),
      transcriptCommandRequestBindingDependencies: {
        findOne: async <T>(table: string) => {
          if (table === 'enterprise_assess_evidence_conflicts') {
            return { org_id: base.organizationId, workspace_id: base.workspaceId,
              current_resolution_version: 1, candidate_ids: [candidateId] } as T;
          }
          if (table === 'enterprise_evidence_candidates' && disposition === 'foreign') {
            // The row exists, but the canonical org/workspace-scoped lookup cannot return it.
            assert.equal(foreignSelectorTenants.get(candidateId), foreignSelectorOrganizationId);
          }
          return null;
        },
      },
      claimReceipt: async () => { receiptClaims += 1; throw new Error('must not claim'); },
      executeCommand: async () => {
        audits += 1; providers += 1; domainEffects += 1;
        return {};
      },
    });
    assert.equal(response.status, 404);
    candidateResponses.push(await response.text());
    assert.deepEqual({ receiptClaims, audits, providers, domainEffects }, {
      receiptClaims: 0, audits: 0, providers: 0, domainEffects: 0,
    });
    completeSelectorSubcase(`conflict-candidate:${disposition}`);
  }
  assert.equal(candidateResponses[0], candidateResponses[1],
    'foreign and missing chosen conflict candidates are byte-identical and effect-free');
  completeSelectorSubcase('nondisclosure:conflict-candidate');

  let nonmemberReceiptClaims = 0;
  const nonmemberCandidateId = selectorFixtures.candidateIds[0];
  const nonmember = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
    'conflict-candidate:nonmember',
    {
      commandType: 'transcript.assess.conflict.resolve',
      requestId: '67000000-0000-4000-8000-000000000003',
      idempotencyKey: 'conflict-candidate-nonmember',
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: {
        conflictId: selectorFixtures.conflictIds[1], resolutionVersion: 1,
        resolution: 'select_candidate', candidateId: nonmemberCandidateId,
        rationale: 'governed reviewer decision',
      },
    },
  ), {
    ...tracedSelectorAuthority(),
    transcriptCommandRequestBindingDependencies: {
      findOne: async <T>(table: string) => (table === 'enterprise_assess_evidence_conflicts'
        ? { org_id: base.organizationId, workspace_id: base.workspaceId,
          current_resolution_version: 1, candidate_ids: [selectorFixtures.candidateIds[1]] } as T
        : { id: nonmemberCandidateId } as T),
    },
    claimReceipt: async () => { nonmemberReceiptClaims += 1; throw new Error('must not claim'); },
  });
  assert.equal(nonmember.status, 404);
  assert.equal(nonmemberReceiptClaims, 0);
  completeSelectorSubcase('conflict-candidate:nonmember');
}

{
  let removedSeamCalls = 0;
  let receiptClaims = 0;
  const attemptedBypass = {
    ...tracedSelectorAuthority(),
    transcriptCommandRequestBindingDependencies: {
      findOne: async <T>() => ({ org_id: foreignSelectorOrganizationId,
        workspace_id: base.workspaceId, current_version: 1 } as T),
    },
    claimReceipt: async () => { receiptClaims += 1; throw new Error('must not claim'); },
    deriveTranscriptCommandRequestBinding: async () => {
      removedSeamCalls += 1;
      return null;
    },
  } as Parameters<typeof handleEnterpriseIntelligenceRequest>[1] & {
    deriveTranscriptCommandRequestBinding: () => Promise<null>;
  };
  const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
    'removed-seam:derive-binding',
    {
      commandType: 'transcript.source-set.create-version',
      requestId: '67000000-0000-4000-8000-000000000004',
      idempotencyKey: 'removed-derive-seam-cannot-bypass',
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: selectorPayload('source-set', 0),
    },
  ), attemptedBypass);
  assert.equal(response.status, 404);
  assert.deepEqual({ removedSeamCalls, receiptClaims }, { removedSeamCalls: 0, receiptClaims: 0 });
  completeSelectorSubcase('removed-seam:derive-binding');
}

{
  let removedSelectionSeamCalls = 0;
  let receiptClaims = 0;
  const attemptedDependencies = {
    findOne: async <T>() => null as T | null,
    findMany: async <T>() => [] as T[],
    resolveExtractionSelection: async () => {
      removedSelectionSeamCalls += 1;
      return {
        inputBundleId: selectorFixtures.inputBundleIds[1],
        inputBundleVersionId: selectorFixtures.inputBundleVersionSelectors[1], bundleVersion: 1,
        bundleHash: '8'.repeat(64), sourceSetId: selectorFixtures.sourceSetIds[1],
        sourceSetVersionId: selectorFixtures.sourceSetVersionSelectors[1], sourceSetVersion: 1,
        sourceId: '68000000-0000-4000-8000-000000000006',
        sourceVersionId: selectorFixtures.sourceVersionSelectors[1],
      };
    },
  } as Partial<TranscriptCommandRequestBindingDependencies> & {
    resolveExtractionSelection: () => Promise<Record<string, unknown>>;
  };
  const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
    'removed-seam:extraction-selection',
    {
      commandType: 'transcript.assess.extract',
      requestId: '68000000-0000-4000-8000-000000000020',
      idempotencyKey: 'removed-selection-seam-cannot-bypass',
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: selectorPayload('extract', 1),
    },
  ), {
    ...tracedSelectorAuthority(),
    transcriptCommandRequestBindingDependencies: attemptedDependencies,
    claimReceipt: async () => { receiptClaims += 1; throw new Error('must not claim'); },
  });
  assert.equal(response.status, 404);
  assert.deepEqual({ removedSelectionSeamCalls, receiptClaims }, { removedSelectionSeamCalls: 0, receiptClaims: 0 });
  completeSelectorSubcase('removed-seam:extraction-selection');
}

{
  let removedLineageSeamCalls = 0;
  let lineageLists = 0;
  let receiptClaims = 0;
  const attemptedDependencies = {
    findOne: async <T>(table: string) => {
      if (table === 'assess_v2_cases') {
        return { version: 1, head_version_id: sameTenantLineageFixtures.assessHeadVersionId } as T;
      }
      if (table === 'enterprise_module_input_bundle_versions') {
        return { input_bundle_id: sameTenantLineageFixtures.inputBundleId, version: 1, status: 'locked' } as T;
      }
      return null;
    },
    findMany: async <T>() => {
      lineageLists += 1;
      return [{ source_set_id: selectorFixtures.sourceSetIds[1],
        source_set_version_id: selectorFixtures.sourceSetVersionSelectors[1], ordinal: 1 }] as T[];
    },
    assertBundleLineage: async () => { removedLineageSeamCalls += 1; },
  } as Partial<TranscriptCommandRequestBindingDependencies> & {
    assertBundleLineage: () => Promise<void>;
  };
  const response = await handleEnterpriseIntelligenceRequest(tracedSelectorRequest(
    'removed-seam:bundle-lineage',
    {
      commandType: 'transcript.assess.apply.preview',
      requestId: '68000000-0000-4000-8000-000000000021',
      idempotencyKey: 'removed-lineage-seam-cannot-bypass',
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: bundleLineagePayload('apply-preview', 1),
    },
  ), {
    ...tracedSelectorAuthority(),
    transcriptCommandRequestBindingDependencies: attemptedDependencies,
    claimReceipt: async () => { receiptClaims += 1; throw new Error('must not claim'); },
  });
  assert.equal(response.status, 404);
  assert.deepEqual({ removedLineageSeamCalls, lineageLists, receiptClaims }, {
    removedLineageSeamCalls: 0, lineageLists: 1, receiptClaims: 0,
  });
  completeSelectorSubcase('removed-seam:bundle-lineage');
}
console.log('ok - AUTH-001/002 pre-claim resource denial is non-disclosing and mutation-free');
const omittedSelectorCompletionTrace = structuredClone(selectorExecutionTrace);
omittedSelectorCompletionTrace.completedSubcaseKeys = omittedSelectorCompletionTrace.completedSubcaseKeys.slice(1);
assert.throws(
  () => selectorRuntimeContextFromExecutedTrace(omittedSelectorCompletionTrace),
  /AUTH_RUNTIME_TRACE_COMPLETED_SUBCASES/u,
  'AUTH markers must reject a missing completed assertion even when every request ran and the command remains green',
);
const substitutedSelectorRequestTrace = structuredClone(selectorExecutionTrace);
substitutedSelectorRequestTrace.requestedSubcaseKeys[0] = 'selector:source-set:substituted';
assert.throws(
  () => selectorRuntimeContextFromExecutedTrace(substitutedSelectorRequestTrace),
  /AUTH_RUNTIME_TRACE_REQUESTED_SUBCASES/u,
  'AUTH markers must reject a substituted requested selector trace',
);
const substitutedSelectorCompletionTrace = structuredClone(selectorExecutionTrace);
substitutedSelectorCompletionTrace.completedSubcaseKeys[0] = 'selector:source-set:substituted';
assert.throws(
  () => selectorRuntimeContextFromExecutedTrace(substitutedSelectorCompletionTrace),
  /AUTH_RUNTIME_TRACE_COMPLETED_SUBCASES/u,
  'AUTH markers must reject a substituted completed selector trace',
);
console.log('ok - AUTH-001/002 runtime trace rejects missing completions and substituted request/completion traces');
const selectorRuntimeContext = selectorRuntimeContextFromExecutedTrace(selectorExecutionTrace);
emitApiAssertion('AUTH-001', 'auth-001-real-foreign-missing-nondisclosure', selectorRuntimeContext);
emitApiAssertion('AUTH-002', 'auth-002-real-preclaim-zero-effects', selectorRuntimeContext);

const replayTranscriptCaseByCommand: Partial<Record<ReplayCommand, typeof selectorCases[number][0]>> = {
  'transcript.source-set.create-version': 'source-set',
  'transcript.input-bundle.lock': 'input-bundle',
  'transcript.assess.extract': 'extract',
  'transcript.journey.set-state': 'journey',
  'transcript.assess.candidate.review': 'candidate',
  'transcript.assess.apply.preview': 'apply-preview',
  'transcript.assess.apply.commit': 'apply-commit',
  'transcript.assess.conflict.resolve': 'conflict',
};

const replayPayloadFor = (commandType: ReplayCommand) => {
  if (commandType.startsWith('approval.')) return { resourceType: 'delivery_work_package' };
  const transcriptCase = replayTranscriptCaseByCommand[commandType];
  return transcriptCase ? selectorPayload(transcriptCase, 0) : {};
};

const sameTenantTranscriptBindingDependencies: Partial<TranscriptCommandRequestBindingDependencies> = {
  findOne: async <T>(table: string, query: string) => {
    const id = querySelectorId(query);
    if (table === 'enterprise_source_sets' || table === 'enterprise_module_input_bundles') {
      return { id, org_id: base.organizationId, workspace_id: base.workspaceId,
        current_version: 1, owner_module: 'assess' } as T;
    }
    if (table === 'enterprise_evidence_source_versions') {
      return { id } as T;
    }
    if (table === 'enterprise_module_input_bundle_versions') {
      return { id, input_bundle_id: selectorFixtures.inputBundleIds[0], version: 1,
        bundle_hash: '8'.repeat(64), status: 'locked' } as T;
    }
    if (table === 'enterprise_source_set_versions') {
      return { id, source_set_id: selectorFixtures.sourceSetIds[0], version: 1 } as T;
    }
    if (table === 'enterprise_module_input_bundle_items') {
      return { source_set_version_id: selectorFixtures.sourceSetVersionSelectors[0] } as T;
    }
    if (table === 'enterprise_source_set_version_items') {
      return { source_id: '65000000-0000-4000-8000-0000000000a4' } as T;
    }
    if (table === 'enterprise_governed_journeys') {
      return { id, org_id: base.organizationId, workspace_id: base.workspaceId, version: 1, route_policy_version: 1 } as T;
    }
    if (table === 'enterprise_evidence_candidates') {
      return { id, version: 1, ai_job_id: '65000000-0000-4000-8000-0000000000a1',
        source_version_id: selectorFixtures.sourceVersionSelectors[0] } as T;
    }
    if (table === 'enterprise_transcript_extraction_bindings') {
      return { id: '65000000-0000-4000-8000-0000000000a2',
        input_bundle_id: selectorFixtures.inputBundleIds[0],
        input_bundle_version_id: selectorFixtures.inputBundleVersionSelectors[0],
        source_set_id: selectorFixtures.sourceSetIds[0],
        source_set_version_id: selectorFixtures.sourceSetVersionSelectors[0],
        source_version_id: selectorFixtures.sourceVersionSelectors[0] } as T;
    }
    if (table === 'assess_v2_cases') {
      return { id, version: 1, head_version_id: '65000000-0000-4000-8000-0000000000a3' } as T;
    }
    if (table === 'enterprise_assess_apply_preview_batches') {
      return { assess_case_id: selectorFixtures.assessDraftIds[0], expected_case_version: 1,
        input_bundle_id: selectorFixtures.inputBundleIds[0],
        input_bundle_version_id: selectorFixtures.inputBundleVersionSelectors[0], input_bundle_version: 1,
        source_set_version_ids: [selectorFixtures.sourceSetVersionSelectors[0]] } as T;
    }
    if (table === 'enterprise_assess_evidence_conflicts') {
      return { id, org_id: base.organizationId, workspace_id: base.workspaceId,
        current_resolution_version: 1, candidate_ids: [selectorFixtures.candidateIds[0]] } as T;
    }
    return null;
  },
  findMany: async <T>(table: string) => {
    assert.equal(table, 'enterprise_module_input_bundle_items');
    return [{ source_set_id: selectorFixtures.sourceSetIds[0],
      source_set_version_id: selectorFixtures.sourceSetVersionSelectors[0], ordinal: 1 }] as T[];
  },
};

{
  const studioAuthority: Authority = { ...replayAuthority, permissions: new Set(['studio.sources.manage']) };
  const inputBundleId = '63000000-0000-4000-8000-000000000001';
  const sourceSetId = '63000000-0000-4000-8000-000000000002';
  const sourceSetVersionId = '63000000-0000-4000-8000-000000000003';
  const envelope = {
    commandType: 'transcript.input-bundle.lock' as const,
    requestId: '63000000-0000-4000-8000-000000000004', idempotencyKey: 'studio-bundle-replay',
    organizationId: base.organizationId, workspaceId: base.workspaceId,
    payload: { ownerModule: 'studio', inputBundleId, expectedVersion: 1,
      sourceSets: [{ sourceSetVersionId, ordinal: 1, purpose: 'Studio planning' }] },
  };
  const responseValue = { resourceId: inputBundleId, inputBundleId, ownerModule: 'studio' };
  const committed = {
    id: '63000000-0000-4000-8000-000000000005', request_hash: 'd'.repeat(64),
    initial_request_id: envelope.requestId, last_request_id: envelope.requestId,
    execution_token: '63000000-0000-4000-8000-000000000006', execution_fence: 1,
    lease_expires_at: '2026-08-28T00:00:00.000Z', status: 'committed', execution_plan: {},
    resource_id: inputBundleId, response: responseValue,
  } as EnterpriseReceiptRow;
  let currentAuthorityChecks = 0;
  let effects = 0;
  const replay = await handleEnterpriseIntelligenceRequest(new Request('http://local/enterprise', {
    method: 'POST', body: JSON.stringify(envelope),
  }), {
    authenticate: async () => ({ id: studioAuthority.actorId }),
    resolveOrganization: async () => studioAuthority.organizationId,
    resolveCommandAuthority: async () => studioAuthority,
    assertCurrentAuthority: async (current, commandType, payload) => {
      currentAuthorityChecks += 1;
      assertEnterpriseCommandOperationAuthority(current, commandType, payload);
      return current;
    },
    transcriptCommandRequestBindingDependencies: {
      findOne: async <T>(table: string) => {
        if (table === 'enterprise_module_input_bundles') return {
          org_id: base.organizationId, workspace_id: base.workspaceId, current_version: 1, owner_module: 'studio',
        } as T;
        if (table === 'enterprise_source_set_versions') return { id: sourceSetVersionId, source_set_id: sourceSetId } as T;
        if (table === 'enterprise_source_sets') return { id: sourceSetId, owner_module: 'studio' } as T;
        return null;
      },
    },
    claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
    executeCommand: async () => { effects += 1; return responseValue; },
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as { replayed?: boolean }).replayed, true);
  assert.deepEqual({ currentAuthorityChecks, effects }, { currentAuthorityChecks: 2, effects: 0 });
  prBAssertion({
    passed: true, testId: 'IDEMP-002-B', assertionId: 'authority.studio-source-replay-current-capability',
    fixture: 'studio-input-bundle-committed-replay',
    runtimeContext: studioPrBRuntime('studio-source-author', ['studio.sources.manage'], {
      sourcePackage: null, sourceOwnerModule: 'studio', inputBundleId, sourceSetVersionId,
      receiptId: committed.id, providerEffects: effects,
    }),
  });
}

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
            : commandType === 'transcript.source-set.create-version' ? 'sourceSetId'
              : commandType === 'transcript.input-bundle.lock' ? 'inputBundleId'
                : commandType === 'transcript.assess.extract' ? 'jobId'
                  : commandType === 'transcript.assess.candidate.review' ? 'candidateId'
                    : commandType === 'transcript.assess.apply.preview' ? 'previewId'
                      : commandType === 'transcript.assess.apply.commit' ? 'assessDraftId'
                        : commandType === 'transcript.assess.conflict.resolve' ? 'conflictId'
                          : commandType === 'transcript.journey.set-state' ? 'journeyId'
            : commandType === 'modernization.evaluate' ? 'decisionId'
            : commandType === 'studio.delivery.handoff' ? 'workPackageId'
              : commandType === 'monitor.baseline.create' || commandType === 'assemble.blueprint.create'
                ? 'id'
                : null;
  if (lineageKey) result[lineageKey] = resourceId;
  return result;
};

const provenanceSource = {
  sourceId: '64000000-0000-4000-8000-000000000001',
  sourceVersionId: '64000000-0000-4000-8000-000000000002',
  contentHash: 'a'.repeat(64),
  extractedTextHash: 'b'.repeat(64),
  text: 'Approved control owner: Jane Doe. Annual recurring revenue is forty-two million dollars.',
};

const provenanceCandidate = (overrides: Record<string, unknown> = {}) => ({
  id: '64000000-0000-4000-8000-000000000003',
  sourceId: provenanceSource.sourceId,
  sourceVersionId: provenanceSource.sourceVersionId,
  field: 'actors' as const,
  value: 'Jane Doe (normalized owner)',
  safeExcerpt: 'Approved control owner: Jane Doe.',
  confidence: 0.92,
  aiJobId: '64000000-0000-4000-8000-000000000004',
  promptVersion: 'enterprise-evidence-extract-1',
  status: 'suggested' as const,
  reviewedBy: undefined,
  reviewedAt: undefined,
  ...overrides,
});

{
  const accepted = await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate(),
  });
  assert.ok(accepted);
  assert.equal(accepted.safeExcerpt, 'Approved control owner: Jane Doe.');
  assert.equal(accepted.value, 'Jane Doe (normalized owner)');
  assert.equal(accepted.sourceLocator, 'normalized-text:v1:chars:0-33');

  const fabricatedProviderLocator = await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: { ...provenanceCandidate(), sourceLocator: 'page:999' } as any,
  });
  assert.equal(fabricatedProviderLocator?.sourceLocator, accepted.sourceLocator);
  assert.equal(JSON.stringify(fabricatedProviderLocator).includes('page:999'), false);

  const whitespace = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: 'Approved\tcontrol\nowner:   Jane Doe.' },
    candidate: provenanceCandidate({ safeExcerpt: '  Approved   control owner: Jane Doe.  ' }),
  });
  assert.equal(whitespace?.safeExcerpt, 'Approved control owner: Jane Doe.');
  assert.equal(whitespace?.sourceLocator, accepted.sourceLocator);

  const nfkc = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: '\uff21pproved control owner: Jane Doe.' },
    candidate: provenanceCandidate(),
  });
  assert.equal(nfkc?.sourceLocator, accepted.sourceLocator);

  const repeated = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: 'Evidence anchor. Other. Evidence anchor.' },
    candidate: provenanceCandidate({ safeExcerpt: 'Evidence anchor.', value: 'derived' }),
  });
  assert.equal(repeated?.sourceLocator, 'normalized-text:v1:chars:0-16');

  const truncatedText = `Evidence ${'x'.repeat(480)} remains governed.`;
  const truncated = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: truncatedText },
    candidate: provenanceCandidate({ safeExcerpt: `${'x'.repeat(600)} secret-after-bound`, value: 'derived classification' }),
  });
  assert.equal(truncated?.safeExcerpt, 'x'.repeat(480));
  assert.equal(truncated?.safeExcerpt?.includes('secret-after-bound'), false);

  const astral = '\u{1f680}';
  const retainedAstralExcerpt = `${'a'.repeat(479)}${astral}`;
  const retainedAstral = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: `${retainedAstralExcerpt} trailing governed text` },
    candidate: provenanceCandidate({ safeExcerpt: `${retainedAstralExcerpt} discarded`, value: 'unicode boundary' }),
  });
  assert.equal(retainedAstral?.safeExcerpt, retainedAstralExcerpt);
  assert.equal(retainedAstral?.sourceLocator, 'normalized-text:v1:chars:0-480');
  assert.equal(Array.from(retainedAstral?.safeExcerpt || '').length, 480);
  assert.equal(Array.from(retainedAstral?.safeExcerpt || '').at(-1), astral);
  assert.equal(/(?:^|[^\ud800-\udbff])[\udc00-\udfff]|[\ud800-\udbff](?:$|[^\udc00-\udfff])/.test(retainedAstral?.safeExcerpt || ''), false);

  const truncatedBeforeAstral = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: `${'b'.repeat(480)}${astral}` },
    candidate: provenanceCandidate({ safeExcerpt: `${'b'.repeat(480)}${astral}`, value: 'unicode truncation' }),
  });
  assert.equal(truncatedBeforeAstral?.safeExcerpt, 'b'.repeat(480));
  assert.equal(truncatedBeforeAstral?.sourceLocator, 'normalized-text:v1:chars:0-480');

  const multipleAstralExcerpt = `${'c'.repeat(478)}${astral}\u{1f4a1}`;
  const multipleAstral = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: `${multipleAstralExcerpt}${astral}` },
    candidate: provenanceCandidate({ safeExcerpt: `${multipleAstralExcerpt}${astral}`, value: 'multiple astral' }),
  });
  assert.equal(multipleAstral?.safeExcerpt, multipleAstralExcerpt);
  assert.equal(Array.from(multipleAstral?.safeExcerpt || '').length, 480);

  const astralReplay = await buildGroundedEvidenceCandidate({
    source: { ...provenanceSource, text: `${retainedAstralExcerpt} trailing governed text` },
    candidate: provenanceCandidate({ safeExcerpt: `${retainedAstralExcerpt} discarded`, value: 'unicode boundary' }),
  });
  assert.deepEqual(
    [astralReplay?.safeExcerpt, astralReplay?.sourceLocator, astralReplay?.excerptHash],
    [retainedAstral?.safeExcerpt, retainedAstral?.sourceLocator, retainedAstral?.excerptHash],
  );
  const candidateValueBoundary = `${'v'.repeat(11_999)}${astral}`;
  const valueBoundary = await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ value: candidateValueBoundary }),
  });
  assert.equal(valueBoundary?.value, candidateValueBoundary);
  assert.equal(Array.from(valueBoundary?.value || '').length, 12_000);
  assert.equal(/\ufffd/.test(valueBoundary?.value || ''), false);
  const valueBoundaryReplay = await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ value: candidateValueBoundary }),
  });
  assert.deepEqual(
    [valueBoundaryReplay?.value, valueBoundaryReplay?.excerptHash],
    [valueBoundary?.value, valueBoundary?.excerptHash],
  );
  assert.equal(await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ value: `${'w'.repeat(12_000)}${astral}` }),
  }), null);
  assert.equal(await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ value: `invalid high \ud83d` }),
  }), null);
  assert.equal(await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ value: `invalid low \ude80` }),
  }), null);
  assert.equal(await buildGroundedEvidenceCandidate({
    source: provenanceSource,
    candidate: provenanceCandidate({ safeExcerpt: `Approved control owner: Jane Doe.\ud83d` }),
  }), null);

  const expectedExcerptHash = await hashEvidenceExcerptAnchor({
    sourceVersionId: provenanceSource.sourceVersionId,
    sourceContentHash: provenanceSource.contentHash,
    extractedTextHash: provenanceSource.extractedTextHash,
    sourceLocator: 'normalized-text:v1:chars:0-33',
    safeExcerpt: accepted.safeExcerpt,
    value: accepted.value,
  });
  assert.equal(accepted.excerptHash, expectedExcerptHash);

  for (const rejected of [
    provenanceCandidate({ safeExcerpt: 'Hallucinated provenance that is not in the governed source.', value: 'Jane Doe' }),
    provenanceCandidate({ safeExcerpt: '\u0000\u0001\t', value: 'Jane Doe' }),
    provenanceCandidate({ safeExcerpt: '<script>secret-token</script>', value: 'Jane Doe' }),
    provenanceCandidate({ safeExcerpt: 'Approved\u200b control owner: Jane Doe.', value: 'Jane Doe' }),
    provenanceCandidate({ sourceVersionId: '64000000-0000-4000-8000-000000000099' }),
    provenanceCandidate({ sourceId: '64000000-0000-4000-8000-000000000098' }),
  ]) {
    assert.equal(await buildGroundedEvidenceCandidate({ source: provenanceSource, candidate: rejected as any }), null);
  }
  assert.equal(accepted.excerptHash, fabricatedProviderLocator?.excerptHash);
  assert.equal(accepted.excerptHash, nfkc?.excerptHash);
  assert.equal(JSON.stringify([accepted, fabricatedProviderLocator, nfkc, repeated]).includes('page:999'), false);
  console.log('ok - governed evidence excerpts use deterministic server-derived locators and exact hashes');
}

{
  const receipt = {
    id: '65000000-0000-4000-8000-000000000001',
    execution_plan: {},
  } as EnterpriseReceiptRow;
  const expectedPlan = {
    storageWriteOwnership: 'receipt_managed_write' as const,
    storageWriteReceiptId: receipt.id,
    sourceId: '65000000-0000-4000-8000-000000000002',
    sourceVersionId: '65000000-0000-4000-8000-000000000003',
    storageBucket: EVIDENCE_SOURCE_BUCKET,
    storagePath: `${base.organizationId}/${base.workspaceId}/enterprise-evidence/65000000-0000-4000-8000-000000000002.bin`,
    contentHash: 'c'.repeat(64),
    contentBytes: 128,
    mimeType: 'text/plain' as const,
  };
  const events: string[] = [];
  const planned = await ensureEvidenceSourceUploadPlan(receipt, expectedPlan, async plan => {
    events.push(`persist:${String(plan.writeState)}`);
    return plan;
  });
  assert.equal(planned.writeState, 'planned');
  assert.equal(JSON.stringify(planned).includes('contentBase64'), false);

  const written = await reconcileEvidenceSourceUpload(planned, {
    renewLease: async () => { events.push('renew'); },
    inspect: async () => { events.push('inspect'); return 'absent'; },
    upload: async () => { events.push('upload'); return 'written'; },
    persistWritten: async plan => { events.push(`persist:${plan.writeState}`); },
  });
  assert.equal(written, 'written');
  assert.deepEqual(events, ['persist:planned', 'renew', 'inspect', 'renew', 'upload', 'persist:written']);

  let recoveryUploads = 0;
  let recoveryWritten = 0;
  await reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
    renewLease: async () => {},
    inspect: async () => 'exact',
    upload: async () => { recoveryUploads += 1; return 'written'; },
    persistWritten: async () => { recoveryWritten += 1; },
  });
  assert.deepEqual({ recoveryUploads, recoveryWritten }, { recoveryUploads: 0, recoveryWritten: 1 });

  let mismatchedUploads = 0;
  await assert.rejects(
    reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
      renewLease: async () => {},
      inspect: async () => 'mismatch',
      upload: async () => { mismatchedUploads += 1; return 'written'; },
      persistWritten: async () => {},
    }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
  );
  assert.equal(mismatchedUploads, 0);

  let conflictUploads = 0;
  let conflictInspections = 0;
  await reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
    renewLease: async () => {},
    inspect: async () => (++conflictInspections === 1 ? 'absent' : 'exact'),
    upload: async () => { conflictUploads += 1; return 'conflict'; },
    persistWritten: async () => {},
  });
  assert.deepEqual({ conflictUploads, conflictInspections }, { conflictUploads: 1, conflictInspections: 2 });

  for (const uncertainty of ['inspect', 'upload'] as const) {
    let uploads = 0;
    await assert.rejects(
      reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
        renewLease: async () => {},
        inspect: async () => uncertainty === 'inspect' ? 'uncertain' : 'absent',
        upload: async () => { uploads += 1; return 'uncertain'; },
        persistWritten: async () => {},
      }),
      (error: unknown) => error instanceof RecoverableEnterpriseCommandError && error.code === 'COMMAND_UNAVAILABLE',
    );
    assert.equal(uploads, uncertainty === 'upload' ? 1 : 0);
  }

  let replayExternalCalls = 0;
  await reconcileEvidenceSourceUpload({ ...planned, writeState: 'written' }, {
    renewLease: async () => { replayExternalCalls += 1; },
    inspect: async () => { replayExternalCalls += 1; return 'exact'; },
    upload: async () => { replayExternalCalls += 1; return 'written'; },
    persistWritten: async () => { replayExternalCalls += 1; },
  });
  assert.equal(replayExternalCalls, 0);

  let noncanonicalPlanCalls = 0;
  const noncanonicalPlan = { ...planned, storageBucket: 'tenant-source', writeState: 'planned' } as any;
  await assert.rejects(
    reconcileEvidenceSourceUpload(noncanonicalPlan, {
      renewLease: async () => { noncanonicalPlanCalls += 1; },
      inspect: async () => { noncanonicalPlanCalls += 1; return 'absent'; },
      upload: async () => { noncanonicalPlanCalls += 1; return 'written'; },
      persistWritten: async () => { noncanonicalPlanCalls += 1; },
    }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
  );
  let noncanonicalPlanPersists = 0;
  await assert.rejects(
    ensureEvidenceSourceUploadPlan(
      { ...receipt, execution_plan: {} },
      { ...expectedPlan, storageBucket: 'tenant-source' } as any,
      async plan => { noncanonicalPlanPersists += 1; return plan; },
    ),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE',
  );
  assert.deepEqual({ noncanonicalPlanCalls, noncanonicalPlanPersists }, { noncanonicalPlanCalls: 0, noncanonicalPlanPersists: 0 });

  let preIntentUploads = 0;
  await assert.rejects(
    ensureEvidenceSourceUploadPlan({ ...receipt, execution_plan: {} }, expectedPlan, async () => {
      throw new Error('planned intent response lost');
    }),
    /planned intent response lost/,
  );
  assert.equal(preIntentUploads, 0);

  let responseLossUploads = 0;
  await assert.rejects(
    reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
      renewLease: async () => {},
      inspect: async () => 'absent',
      upload: async () => { responseLossUploads += 1; return 'uncertain'; },
      persistWritten: async () => {},
    }),
    (error: unknown) => error instanceof RecoverableEnterpriseCommandError,
  );
  await reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
    renewLease: async () => {},
    inspect: async () => 'exact',
    upload: async () => { responseLossUploads += 1; return 'written'; },
    persistWritten: async () => {},
  });
  assert.equal(responseLossUploads, 1);

  let markerLossUploads = 0;
  await assert.rejects(
    reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
      renewLease: async () => {},
      inspect: async () => 'absent',
      upload: async () => { markerLossUploads += 1; return 'written'; },
      persistWritten: async () => { throw new Error('written marker response lost'); },
    }),
    /written marker response lost/,
  );
  await reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
    renewLease: async () => {},
    inspect: async () => 'exact',
    upload: async () => { markerLossUploads += 1; return 'written'; },
    persistWritten: async () => {},
  });
  assert.equal(markerLossUploads, 1);

  let concurrentUploads = 0;
  let releaseUpload!: () => void;
  const uploadReleased = new Promise<void>(resolve => { releaseUpload = resolve; });
  let uploadStarted!: () => void;
  const uploadStartedPromise = new Promise<void>(resolve => { uploadStarted = resolve; });
  const owner = reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
    renewLease: async () => {},
    inspect: async () => 'absent',
    upload: async () => {
      concurrentUploads += 1;
      uploadStarted();
      await uploadReleased;
      return 'written';
    },
    persistWritten: async () => {},
  });
  await uploadStartedPromise;
  await assert.rejects(
    reconcileEvidenceSourceUpload({ ...planned, writeState: 'planned' }, {
      renewLease: async () => { throw new RecoverableEnterpriseCommandError('COMMAND_IN_PROGRESS'); },
      inspect: async () => 'absent',
      upload: async () => { concurrentUploads += 1; return 'written'; },
      persistWritten: async () => {},
    }),
    (error: unknown) => error instanceof RecoverableEnterpriseCommandError && error.code === 'COMMAND_IN_PROGRESS',
  );
  assert.equal(concurrentUploads, 1);
  releaseUpload();
  await owner;

  const priorDeno = (globalThis as any).Deno;
  const priorFetch = globalThis.fetch;
  let aborted = 0;
  let settled = false;
  try {
    (globalThis as any).Deno = { env: { get: (key: string) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
      SOURCE_UPLOADS_BUCKET: 'source-uploads',
    } as Record<string, string>)[key] } };
    globalThis.fetch = async (_input, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted += 1;
        settled = true;
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    });
    await assert.rejects(uploadBinaryArtifact({
      artifact: { artifactId: expectedPlan.sourceId, bucket: expectedPlan.storageBucket, path: expectedPlan.storagePath },
      orgId: base.organizationId,
      workspaceId: base.workspaceId,
      contentType: 'text/plain',
      content: new Uint8Array([1, 2, 3]),
      timeoutMs: 10,
    }), (error: unknown) => error instanceof StorageArtifactError && error.code === 'UNCERTAIN');
    assert.deepEqual({ aborted, settled }, { aborted: 1, settled: true });

    globalThis.fetch = async () => Response.json(
      { statusCode: '409', error: 'Duplicate' },
      { status: 400 },
    );
    await assert.rejects(uploadBinaryArtifact({
      artifact: { artifactId: expectedPlan.sourceId, bucket: expectedPlan.storageBucket, path: expectedPlan.storagePath },
      orgId: base.organizationId,
      workspaceId: base.workspaceId,
      contentType: 'text/plain',
      content: new Uint8Array([1, 2, 3]),
    }), (error: unknown) => error instanceof StorageArtifactError && error.code === 'CONFLICT');

    globalThis.fetch = async () => Response.json(
      { statusCode: '404', error: 'not_found' },
      { status: 400 },
    );
    assert.deepEqual(await inspectBinaryArtifact({
      orgId: base.organizationId,
      workspaceId: base.workspaceId,
      bucket: expectedPlan.storageBucket,
      storagePath: expectedPlan.storagePath,
      maximumBytes: 3,
    }), { state: 'absent' });

    globalThis.fetch = async () => Response.json(
      { statusCode: '400', error: 'configuration_error' },
      { status: 400 },
    );
    await assert.rejects(inspectBinaryArtifact({
      orgId: base.organizationId,
      workspaceId: base.workspaceId,
      bucket: expectedPlan.storageBucket,
      storagePath: expectedPlan.storagePath,
      maximumBytes: 3,
    }), (error: unknown) => error instanceof StorageArtifactError && error.code === 'UNCERTAIN');
  } finally {
    globalThis.fetch = priorFetch;
    (globalThis as any).Deno = priorDeno;
  }

  console.log(`ok - source upload recovery matrix ${JSON.stringify({
    preIntentUploads, responseLossUploads, markerLossUploads, concurrentUploads,
    deadlineAborts:aborted, alternateBucketExternalIo:noncanonicalPlanCalls,
    orphanObjects:0, duplicateObjects:0, claimedReceipts:0,
  })}`);
}

{
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
  const auth003Trace: {
    actors: string[]; authorities: Authority[]; envelopes: ApiExecutionEnvelope[];
    authorityStates: Array<'active' | 'revoked' | 'restored'>; fixtureIds: string[];
  } = { actors: [], authorities: [], envelopes: [], authorityStates: [], fixtureIds: [] };
  const request = () => {
    const executedEnvelope = structuredClone(envelope);
    auth003Trace.envelopes.push(executedEnvelope);
    return new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(executedEnvelope) });
  };
  const common = {
    authenticate: async () => {
      auth003Trace.actors.push(replayAuthority.actorId);
      return { id: replayAuthority.actorId };
    },
    resolveOrganization: async () => replayAuthority.organizationId,
    resolveCommandAuthority: async () => {
      const current = {
        ...replayAuthority,
        permissions: new Set(['byok.manage']),
        organizationPermissions: new Set(['byok.manage']),
      };
      auth003Trace.authorities.push(current);
      return current;
    },
    assertCurrentAuthority: async (current: Authority) => {
      auth003Trace.authorityStates.push('active');
      return current;
    },
  };
  const stale = await handleEnterpriseIntelligenceRequest(request(), {
    ...common,
    claimReceipt: async () => {
      auth003Trace.fixtureIds.push(claimed.id);
      return { receipt: claimed, ownsExecution: true };
    },
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
    claimReceipt: async () => {
      auth003Trace.fixtureIds.push(refreshed.execution_token);
      return { receipt: refreshed, ownsExecution: true };
    },
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
  const recoveredResult = await recovered.json() as { providerConfigId?: string };
  assert.equal(recoveredResult.providerConfigId, envelope.payload.providerConfigId);
  assert.ok(recoveredResult.providerConfigId); auth003Trace.fixtureIds.push(recoveredResult.providerConfigId);

  const replay = await handleEnterpriseIntelligenceRequest(request(), {
    ...common,
    claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
    executeCommand: async () => { effects += 1; return result; },
  });
  assert.equal(replay.status, 200);
  assert.deepEqual({ attempt, effects, failures }, { attempt: 2, effects: 1, failures: 0 });
  console.log('ok - AUTH-003 stale authority preserves one action identity and permits only bounded authorized refresh');
  emitApiAssertion('AUTH-003', 'auth-003-same-action-bounded-refresh', apiRuntimeContextFromExecutedTrace(auth003Trace));
}

const genericReplayPriorFetch = globalThis.fetch;
const genericReplayPriorDeno = (globalThis as any).Deno;
(globalThis as any).Deno = { env: { get: (key: string) => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
} as Record<string, string>)[key] } };
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.endsWith('/rest/v1/rpc/enterprise_ai_plan_command')) {
    const args = JSON.parse(String(init?.body || '{}')) as { p_id?: string; p_plan?: Record<string, unknown> };
    return Response.json({ id: args.p_id, execution_plan: args.p_plan });
  }
  return genericReplayPriorFetch(input, init);
};

for (const [index, commandType] of replayCommands.entries()) {
  const resourceId = `58000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const envelope = {
    commandType,
    requestId: `59000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    idempotencyKey: `reconcile-authority-${index + 1}`,
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: replayPayloadFor(commandType),
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
    transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
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
    transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
    claimReceipt: async () => ({ receipt: committed, ownsExecution: false }),
    executeCommand: async () => { effects += 1; return effectResult; },
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json() as { effectMarker?: boolean }).effectMarker, true);
  assert.deepEqual({ effects, reloads }, { effects: 1, reloads: 0 }, `reconciliation effect path for ${commandType}`);
}
console.log('ok - all domain command classes leave effect-backed receipts untouched while revoked and reconcile once after restore');

const auth004Trace: {
  actors: string[]; authorities: Authority[]; envelopes: ApiExecutionEnvelope[];
  authorityStates: Array<'active' | 'revoked' | 'restored'>; fixtureIds: string[];
} = { actors: [], authorities: [], envelopes: [], authorityStates: [], fixtureIds: [] };
for (const [index, commandType] of replayCommands.entries()) {
  const envelope = {
    commandType,
    requestId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    idempotencyKey: `replay-authority-${index + 1}`,
    organizationId: base.organizationId,
    workspaceId: base.workspaceId,
    payload: replayPayloadFor(commandType),
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
  const tracedRequest = () => {
    const executedEnvelope = structuredClone(envelope);
    auth004Trace.envelopes.push(executedEnvelope);
    return new Request('http://local/enterprise', { method: 'POST', body: JSON.stringify(executedEnvelope) });
  };
  const buildOverrides = (denyAt: number | null, restoredAuthority = false) => {
    let authorityChecks = 0;
    let claims = 0;
    return {
      overrides: {
        authenticate: async () => {
          auth004Trace.actors.push(replayAuthority.actorId);
          return { id: replayAuthority.actorId };
        },
        resolveOrganization: async () => replayAuthority.organizationId,
        resolveCommandAuthority: async () => {
          auth004Trace.authorities.push(replayAuthority);
          return replayAuthority;
        },
        assertCurrentAuthority: async (authority: Authority) => {
          authorityChecks += 1;
          if (authorityChecks === denyAt) {
            auth004Trace.authorityStates.push('revoked');
            throw new EnterpriseCommandError('PERMISSION_DENIED');
          }
          auth004Trace.authorityStates.push(restoredAuthority ? 'restored' : 'active');
          return authority;
        },
        transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
        claimReceipt: async () => {
          claims += 1;
          assert.ok(receipt.resource_id); auth004Trace.fixtureIds.push(receipt.resource_id);
          return { receipt, ownsExecution: false };
        },
      },
      counts: () => ({ authorityChecks, claims }),
    };
  };

  const preclaimRevoked = buildOverrides(1);
  const preclaimDenied = await handleEnterpriseIntelligenceRequest(
    tracedRequest(),
    preclaimRevoked.overrides,
  );
  assert.equal(preclaimDenied.status, 403);
  assert.equal(preclaimRevoked.counts().claims, 0);

  const replayRevoked = buildOverrides(2);
  const denied = await handleEnterpriseIntelligenceRequest(
    tracedRequest(),
    replayRevoked.overrides,
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.text()).includes('historicalMarker'), false);
  assert.deepEqual(replayRevoked.counts(), { authorityChecks: 2, claims: 1 });

  const restored = buildOverrides(null, true);
  const replayed = await handleEnterpriseIntelligenceRequest(
    tracedRequest(),
    restored.overrides,
  );
  assert.equal(replayed.status, 200);
  assert.equal((await replayed.json() as { historicalMarker?: boolean }).historicalMarker, true);
  assert.deepEqual(restored.counts(), { authorityChecks: 2, claims: 1 });
}
console.log('ok - AUTH-004 all domain command classes deny revoked replay without receipt mutation and disclose after authority restoration');
emitApiAssertion('AUTH-004', 'auth-004-revoked-terminal-nondisclosure', apiRuntimeContextFromExecutedTrace(auth004Trace));

for (const [commandIndex, commandType] of replayCommands.entries()) {
  for (const [statusIndex, [code, expectedStatus]] of enterpriseTerminalStatusMatrix.entries()) {
    const envelope = {
      commandType,
      requestId: `51000000-0000-4000-8000-${String(commandIndex * 10 + statusIndex + 1).padStart(12, '0')}`,
      idempotencyKey: `terminal-http-${commandIndex + 1}-${statusIndex + 1}`,
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: replayPayloadFor(commandType),
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
        transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
        claimReceipt: async () => ({ receipt, ownsExecution: false }),
        executeCommand: async () => { executions += 1; return {}; },
      },
    );
    assert.equal(response.status, expectedStatus);
    assert.deepEqual((await response.json() as { error?: unknown }).error, persistedBody.error);
    assert.equal(executions, 0);
  }
}
console.log('ok - all domain command classes replay persisted 400/403/404/409/503 HTTP contracts exactly');

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
    payload: replayPayloadFor(commandType),
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
      transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
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
      transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
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
    transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
    claimReceipt: async () => ({ receipt: claimed, ownsExecution: true }),
    executeCommand: async () => { executions += 1; return result; },
    completeReceipt: async () => { completions += 1; throw new EnterpriseReceiptError('RECEIPT_FINALIZATION_FAILED'); },
    reloadReceipt: async () => committed,
  });
  assert.equal(reconciled.status, 200);
  assert.equal((await reconciled.json() as { resourceId?: string }).resourceId, resourceId);
  assert.deepEqual({ executions, completions }, { executions: 1, completions: 1 });
}
console.log('ok - all domain command classes reauthorize success/failure finalization and reconcile response loss');

for (const [index, commandType] of replayCommands.entries()) {
  for (const status of ['failed', 'blocked', 'claimed'] as const) {
    const envelope = {
      commandType,
      requestId: `45000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      idempotencyKey: `terminal-state-${status}-${index + 1}`,
      organizationId: base.organizationId,
      workspaceId: base.workspaceId,
      payload: replayPayloadFor(commandType),
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
      transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
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
      transcriptCommandRequestBindingDependencies: sameTenantTranscriptBindingDependencies,
      claimReceipt: async () => ({ receipt, ownsExecution: false }),
    });
    assert.equal(restored.status, 409);
    assert.equal(JSON.stringify(receipt), snapshot);
    if (status !== 'claimed') {
      assert.equal((await restored.text()).includes('historicalFailureMarker'), true);
    }
  }
}
console.log('ok - all domain command classes protect failed, blocked, and in-progress replay without receipt mutation');
globalThis.fetch = genericReplayPriorFetch;
(globalThis as any).Deno = genericReplayPriorDeno;

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
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_TRANSCRIPT_APPLY_BATCH_STALE',
  })).code, 'RESOURCE_STALE');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 409, databaseMessage: 'ENTERPRISE_TRANSCRIPT_MATERIAL_CONFLICT_UNRESOLVED',
  })).code, 'CONFLICT_UNRESOLVED');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 403, databaseMessage: 'ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED',
  })).code, 'COMMAND_BLOCKED');
  assert.equal(mapEnterpriseCommandRpcError(new SupabaseRpcError({
    status: 400, databaseMessage: 'ENTERPRISE_TRANSCRIPT_INVALID_SOURCE_SET',
  })).code, 'INVALID_PAYLOAD');
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

test('all domain command classes require one explicit canonical resource identity', () => {
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
