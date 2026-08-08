import assert from 'node:assert/strict';
import {
  assertEnterpriseCommandOperationAuthority,
  EnterpriseCommandError,
  RecoverableEnterpriseCommandError,
  enterpriseCommandErrorBody,
  enterpriseCommandStatusForTerminalReceipt,
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
  requiredCapabilitiesForEnterpriseCommand,
  resolveEnterpriseCommandResourceId,
  shouldPreserveClaimedEnterpriseReceipt,
  type Authority,
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
