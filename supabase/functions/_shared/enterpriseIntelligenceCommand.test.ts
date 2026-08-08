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
  assert.deónv¶‰žËkºwµçMÑ…ÉÐ ÄÈ°€œÀœ¥õ€°(€€€•á•ÕÑ¥½¹}™•¹”è€Ä°±•…Í•}•áÁ¥É•Í}…Ðè€œÈÀÈØ´Àà´ÀÝPÀÀèÀÀèÀÀ¸ÀÀÁhœ°ÍÑ…ÑÕÌè€±…¥µ•œ°(€ôì(€½¹ÍÐÉ•ÍÕ±Ð€ô•¹Ñ•ÉÁÉ¥Í•I•ÍÕ±Ñ½È¡½µµ…¹‘QåÁ”°É•Í½ÕÉ•%¤ì(€½¹ÍÐ½µµ¥ÑÑ•è¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Ü€ôì€¸¸¹±…¥µ•°ÍÑ…ÑÕÌè€½µµ¥ÑÑ•œ°É•Í½ÕÉ•}¥èÉ•Í½ÕÉ•%°É•ÍÁ½¹Í”èÉ•ÍÕ±Ðôì(€½¹ÍÐÉ•ÅÕ•ÍÐ€ô€ ¤€ôø¹•ÜI•ÅÕ•ÍÐ ¡ÑÑÀè¼½±½…°½•¹Ñ•ÉÁÉ¥Í”œ°ìµ•Ñ¡½è€A=MPœ°‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡•¹Ù•±½Á”¤ô¤ì((€™½È€¡½¹ÍÐ‘•¹åÐ½˜lÌ°€Ñt¤ì(€€€±•Ð…ÕÑ¡½É¥Ñå¡•­Ì€ô€Àì(€€€±•Ð½µÁ±•Ñ¥½¹Ì€ô€Àì(€€€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ ¤°ì(€€€€€…ÕÑ¡•¹Ñ¥…Ñ”è…Íå¹Œ€ ¤€ôø€¡ì¥èÉ•Á±…åÕÑ¡½É¥Ñä¹…Ñ½É%ô¤°(€€€€€É•Í½±Ù•=É…¹¥é…Ñ¥½¸è…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°(€€€€€É•Í½±Ù•½µµ…¹‘ÕÑ¡½É¥Ñäè…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä°(€€€€€…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäè…Íå¹ŒÕÉÉ•¹Ð€ôøì(€€€€€€€…ÕÑ¡½É¥Ñå¡•­Ì€¬ô€Äì(€€€€€€€¥˜€¡…ÕÑ¡½É¥Ñå¡•­Ì€øô‘•¹åÐ¤Ñ¡É½Ü¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€É•ÑÕÉ¸ÕÉÉ•¹Ðì(€€€€€ô°(€€€€€±…¥µI••¥ÁÐè…Íå¹Œ€ ¤€ôø€¡ìÉ••¥ÁÐè±…¥µ•°½Ý¹Íá•ÕÑ¥½¸èÑÉÕ”ô¤°(€€€€€•á•ÕÑ•½µµ…¹è…Íå¹Œ€ ¤€ôøÉ•ÍÕ±Ð°(€€€€€½µÁ±•Ñ•I••¥ÁÐè…Íå¹Œ€ ¤€ôøì½µÁ±•Ñ¥½¹Ì€¬ô€ÄìÉ•ÑÕÉ¸½µµ¥ÑÑ•ìô°(€€€€€É•±½…‘I••¥ÁÐè…Íå¹Œ€ ¤€ôø±…¥µ•°(€€€ô¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÁ½¹Í”¹ÍÑ…ÑÕÌ°€ÐÀÌ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÉ•ÍÁ½¹Í”¹Ñ•áÐ ¤¤¹¥¹±Õ‘•Ì¡É•Í½ÕÉ•%¤°™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡½µÁ±•Ñ¥½¹Ì°‘•¹åÐ€ôôô€Ì€ü€À€è€Ä¤ì(€ô((€™½È€¡½¹ÍÐ‘•¹åÐ½˜lÌ°€Ñt¤ì(€€€±•Ð…ÕÑ¡½É¥Ñå¡•­Ì€ô€Àì(€€€±•Ð™…¥±ÕÉ•Ì€ô€Àì(€€€½¹ÍÐÉ•ÍÁ½¹Í”€ô…Ý…¥Ð¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ ¤°ì(€€€€€…ÕÑ¡•¹Ñ¥…Ñ”è…Íå¹Œ€ ¤€ôø€¡ì¥èÉ•Á±…åÕÑ¡½É¥Ñä¹…Ñ½É%ô¤°(€€€€€É•Í½±Ù•=É…¹¥é…Ñ¥½¸è…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°(€€€€€É•Í½±Ù•½µµ…¹‘ÕÑ¡½É¥Ñäè…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä°(€€€€€…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäè…Íå¹ŒÕÉÉ•¹Ð€ôøì(€€€€€€€…ÕÑ¡½É¥Ñå¡•­Ì€¬ô€Äì(€€€€€€€¥˜€¡…ÕÑ¡½É¥Ñå¡•­Ì€øô‘•¹åÐ¤Ñ¡É½Ü¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€É•ÑÕÉ¸ÕÉÉ•¹Ðì(€€€€€ô°(€€€€€±…¥µI••¥ÁÐè…Íå¹Œ€ ¤€ôø€¡ìÉ••¥ÁÐè±…¥µ•°½Ý¹Íá•ÕÑ¥½¸èÑÉÕ”ô¤°(€€€€€•á•ÕÑ•½µµ…¹è…Íå¹Œ€ ¤€ôøìÑ¡É½Ü¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È =559}	1=-œ¤ìô°(€€€€€É•±½…‘I••¥ÁÐè…Íå¹Œ€ ¤€ôø±…¥µ•°(€€€€€™…¥±I••¥ÁÐè…Íå¹Œ€ ¤€ôøì(€€€€€€€™…¥±ÕÉ•Ì€¬ô€Äì(€€€€€€€É•ÑÕÉ¸ì€¸¸¹±…¥µ•°ÍÑ…ÑÕÌè€‰±½­•œ°É•ÍÁ½¹Í”è•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½É	½‘ä¡¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È =559}	1=-œ¤¤ôì(€€€€€ô°(€€€ô¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÁ½¹Í”¹ÍÑ…ÑÕÌ°€ÐÀÌ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÉ•ÍÁ½¹Í”¹Ñ•áÐ ¤¤¹¥¹±Õ‘•Ì =559}	1=-œ¤°™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡™…¥±ÕÉ•Ì°€À¤ì(€ô((€±•Ð•á•ÕÑ¥½¹Ì€ô€Àì(€±•Ð½µÁ±•Ñ¥½¹Ì€ô€Àì(€½¹ÍÐÉ•½¹¥±•€ô…Ý…¥Ð¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ ¤°ì(€€€…ÕÑ¡•¹Ñ¥…Ñ”è…Íå¹Œ€ ¤€ôø€¡ì¥èÉ•Á±…åÕÑ¡½É¥Ñä¹…Ñ½É%ô¤°(€€€É•Í½±Ù•=É…¹¥é…Ñ¥½¸è…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°(€€€É•Í½±Ù•½µµ…¹‘ÕÑ¡½É¥Ñäè…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä°(€€€…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäè…Íå¹ŒÕÉÉ•¹Ð€ôøÕÉÉ•¹Ð°(€€€±…¥µI••¥ÁÐè…Íå¹Œ€ ¤€ôø€¡ìÉ••¥ÁÐè±…¥µ•°½Ý¹Íá•ÕÑ¥½¸èÑÉÕ”ô¤°(€€€•á•ÕÑ•½µµ…¹è…Íå¹Œ€ ¤€ôøì•á•ÕÑ¥½¹Ì€¬ô€ÄìÉ•ÑÕÉ¸É•ÍÕ±Ðìô°(€€€½µÁ±•Ñ•I••¥ÁÐè…Íå¹Œ€ ¤€ôøì½µÁ±•Ñ¥½¹Ì€¬ô€ÄìÑ¡É½Ü¹•Ü¹Ñ•ÉÁÉ¥Í•I••¥ÁÑÉÉ½È I%AQ}%91%iQ%=9}%1œ¤ìô°(€€€É•±½…‘I••¥ÁÐè…Íå¹Œ€ ¤€ôø½µµ¥ÑÑ•°(€ô¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•½¹¥±•¹ÍÑ…ÑÕÌ°€ÈÀÀ¤ì(€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÉ•½¹¥±•¹©Í½¸ ¤…ÌìÉ•Í½ÕÉ•%üèÍÑÉ¥¹œô¤¹É•Í½ÕÉ•%°É•Í½ÕÉ•%¤ì(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡ì•á•ÕÑ¥½¹Ì°½µÁ±•Ñ¥½¹Ìô°ì•á•ÕÑ¥½¹Ìè€Ä°½µÁ±•Ñ¥½¹Ìè€Äô¤ì)ô)½¹Í½±”¹±½œ ½¬€´…±°Ñ•¸½µµ…¹±…ÍÍ•ÌÉ•…ÕÑ¡½É¥é”ÍÕ•ÍÌ½™…¥±ÕÉ”™¥¹…±¥é…Ñ¥½¸…¹É•½¹¥±”É•ÍÁ½¹Í”±½ÍÌœ¤ì()™½È€¡½¹ÍÐm¥¹‘•à°½µµ…¹‘QåÁ•t½˜É•Á±…å½µµ…¹‘Ì¹•¹ÑÉ¥•Ì ¤¤ì(€™½È€¡½¹ÍÐÍÑ…ÑÕÌ½˜l™…¥±•œ°€‰±½­•œ°€±…¥µ•t…Ì½¹ÍÐ¤ì(€€€½¹ÍÐ•¹Ù•±½Á”€ôì(€€€€€½µµ…¹‘QåÁ”°(€€€€€É•ÅÕ•ÍÑ%è€ÐÔÀÀÀÀÀÀ´ÀÀÀÀ´ÐÀÀÀ´àÀÀÀ´‘íMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¤¹Á…‘MÑ…ÉÐ ÄÈ°€œÀœ¥õ€°(€€€€€¥‘•µÁ½Ñ•¹å-•äèÑ•Éµ¥¹…°µÍÑ…Ñ”´‘íÍÑ…ÑÕÍô´‘í¥¹‘•à€¬€Åõ€°(€€€€€½É…¹¥é…Ñ¥½¹%è‰…Í”¹½É…¹¥é…Ñ¥½¹%°(€€€€€Ý½É­ÍÁ…•%è‰…Í”¹Ý½É­ÍÁ…•%°(€€€€€Á…å±½…è½µµ…¹‘QåÁ”¹ÍÑ…ÉÑÍ]¥Ñ  …ÁÁÉ½Ù…°¸œ¤€üìÉ•Í½ÕÉ•QåÁ”è€‘•±¥Ù•Éå}Ý½É­}Á…­…”œô€èíô°(€€€ôì(€€€½¹ÍÐÉ••¥ÁÐè¹Ñ•ÉÁÉ¥Í•I••¥ÁÑI½Ü€ôì(€€€€€¥è€ÐØÀÀÀÀÀÀ´ÀÀÀÀ´ÐÀÀÀ´àÀÀÀ´‘íMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¤¹Á…‘MÑ…ÉÐ ÄÈ°€œÀœ¥õ€°(€€€€€É•ÅÕ•ÍÑ}¡…Í è€Œœ¹É•Á•…Ð ØÐ¤°¥¹¥Ñ¥…±}É•ÅÕ•ÍÑ}¥è•¹Ù•±½Á”¹É•ÅÕ•ÍÑ%°±…ÍÑ}É•ÅÕ•ÍÑ}¥è•¹Ù•±½Á”¹É•ÅÕ•ÍÑ%°(€€€€€•á•ÕÑ¥½¹}Ñ½­•¸è€ÐÜÀÀÀÀÀÀ´ÀÀÀÀ´ÐÀÀÀ´àÀÀÀ´‘íMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¤¹Á…‘MÑ…ÉÐ ÄÈ°€œÀœ¥õ€°(€€€€€•á•ÕÑ¥½¹}™•¹”è€Ä°±•…Í•}•áÁ¥É•Í}…Ðè€œÈÀÈØ´Àà´ÀÝPÀÀèÀÀèÀÀ¸ÀÀÁhœ°ÍÑ…ÑÕÌ°(€€€€€É•ÍÁ½¹Í”èÍÑ…ÑÕÌ€ôôô€±…¥µ•œ€üÕ¹‘•™¥¹•€èì¡¥ÍÑ½É¥…±…¥±ÕÉ•5…É­•ÈèÑÉÕ”ô°(€€€ôì(€€€½¹ÍÐÍ¹…ÁÍ¡½Ð€ô)M=8¹ÍÑÉ¥¹¥™ä¡É••¥ÁÐ¤ì(€€€½¹ÍÐÉ•ÅÕ•ÍÐ€ô€ ¤€ôø¹•ÜI•ÅÕ•ÍÐ ¡ÑÑÀè¼½±½…°½•¹Ñ•ÉÁÉ¥Í”œ°ìµ•Ñ¡½è€A=MPœ°‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡•¹Ù•±½Á”¤ô¤ì(€€€±•Ð¡•­Ì€ô€Àì(€€€½¹ÍÐ‘•¹¥•€ô…Ý…¥Ð¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ ¤°ì(€€€€€…ÕÑ¡•¹Ñ¥…Ñ”è…Íå¹Œ€ ¤€ôø€¡ì¥èÉ•Á±…åÕÑ¡½É¥Ñä¹…Ñ½É%ô¤°(€€€€€É•Í½±Ù•=É…¹¥é…Ñ¥½¸è…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°(€€€€€É•Í½±Ù•½µµ…¹‘ÕÑ¡½É¥Ñäè…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä°(€€€€€…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäè…Íå¹ŒÕÉÉ•¹Ð€ôøì(€€€€€€€¡•­Ì€¬ô€Äì(€€€€€€€¥˜€¡¡•­Ì€øô€È¤Ñ¡É½Ü¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È AI5%MM%=9}9%œ¤ì(€€€€€€€É•ÑÕÉ¸ÕÉÉ•¹Ðì(€€€€€ô°(€€€€€±…¥µI••¥ÁÐè…Íå¹Œ€ ¤€ôø€¡ìÉ••¥ÁÐ°½Ý¹Íá•ÕÑ¥½¸è™…±Í”ô¤°(€€€ô¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡‘•¹¥•¹ÍÑ…ÑÕÌ°€ÐÀÌ¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥Ð‘•¹¥•¹Ñ•áÐ ¤¤¹¥¹±Õ‘•Ì ¡¥ÍÑ½É¥…±…¥±ÕÉ•5…É­•Èœ¤°™…±Í”¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡)M=8¹ÍÑÉ¥¹¥™ä¡É••¥ÁÐ¤°Í¹…ÁÍ¡½Ð¤ì((€€€½¹ÍÐÉ•ÍÑ½É•€ô…Ý…¥Ð¡…¹‘±•¹Ñ•ÉÁÉ¥Í•%¹Ñ•±±¥•¹•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ ¤°ì(€€€€€…ÕÑ¡•¹Ñ¥…Ñ”è…Íå¹Œ€ ¤€ôø€¡ì¥èÉ•Á±…åÕÑ¡½É¥Ñä¹…Ñ½É%ô¤°(€€€€€É•Í½±Ù•=É…¹¥é…Ñ¥½¸è…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä¹½É…¹¥é…Ñ¥½¹%°(€€€€€É•Í½±Ù•½µµ…¹‘ÕÑ¡½É¥Ñäè…Íå¹Œ€ ¤€ôøÉ•Á±…åÕÑ¡½É¥Ñä°(€€€€€…ÍÍ•ÉÑÕÉÉ•¹ÑÕÑ¡½É¥Ñäè…Íå¹ŒÕÉÉ•¹Ð€ôøÕÉÉ•¹Ð°(€€€€€±…¥µI••¥ÁÐè…Íå¹Œ€ ¤€ôø€¡ìÉ••¥ÁÐ°½Ý¹Íá•ÕÑ¥½¸è™…±Í”ô¤°(€€€ô¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•ÍÑ½É•¹ÍÑ…ÑÕÌ°€ÐÀä¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡)M=8¹ÍÑÉ¥¹¥™ä¡É••¥ÁÐ¤°Í¹…ÁÍ¡½Ð¤ì(€€€¥˜€¡ÍÑ…ÑÕÌ€„ôô€±…¥µ•œ¤ì(€€€€€…ÍÍ•ÉÐ¹•ÅÕ…° ¡…Ý…¥ÐÉ•ÍÑ½É•¹Ñ•áÐ ¤¤¹¥¹±Õ‘•Ì ¡¥ÍÑ½É¥…±…¥±ÕÉ•5…É­•Èœ¤°ÑÉÕ”¤ì(€€€ô(€ô)ô)½¹Í½±”¹±½œ ½¬€´…±°Ñ•¸½µµ…¹±…ÍÍ•ÌÁÉ½Ñ•Ð™…¥±•°‰±½­•°…¹¥¸µÁÉ½É•ÍÌÉ•Á±…äÝ¥Ñ¡½ÕÐÉ••¥ÁÐµÕÑ…Ñ¥½¸œ¤ì(4)Ñ•ÍÐ ÍÑÉÕÑÕÉ•IA‘½µ…¥¸Í¥¹…±Ìµ…ÀÝ¥Ñ¡½ÕÐ•áÁ½Í¥¹œ‘…Ñ…‰…Í”Ñ•áÐœ°€ ¤€ôøì4(€½¹ÍÐ¥‘•µÁ½Ñ•¹ä€ô¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ìÍÑ…ÑÕÌè€ÐÀä°‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}%}%5A=Q9e}=91%Pœô¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¥‘•µÁ½Ñ•¹ä¤¹½‘”°€%5A=Q9e}=91%Pœ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•I••¥ÁÑIÁÉÉ½È¡¥‘•µÁ½Ñ•¹ä¤¹½‘”°€%5A=Q9e}=91%Pœ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÐÀä°‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}AI=Y%I}UQ!=I%iQ%=9}YIM%=9}MQ1œ°4(€ô¤¤¹½‘”°€UQ!=I%iQ%=9}MQ1œ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÐÀÌ°‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}AI=Y%I}]=I-MA}UQ!=I%Qe}IEU%Iœ°4(€ô¤¤¹½‘”°€AI5%MM%=9}9%œ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÐÀä°‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}%}MQ1}aUQ%=9}9œ°4(€ô¤¤¹½‘”°€=559}%9}AI=IMLœ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÐÀä°‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}Y%9}9%Q}MQ1œ°4(€ô¤¤¹½‘”°€IM=UI}MQ1œ¤ì4(€½¹ÍÐÕ¹…Ù…¥±…‰±”€ôµ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÔÀÀ°‘…Ñ…‰…Í•5•ÍÍ…”è€…É‰¥ÑÉ…Éä‘…Ñ…‰…Í”Ñ•áÐ¥Ì‘¥Í…É‘•œ°4(€ô¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Õ¹…Ù…¥±…‰±”¹½‘”°€=559}U9Y%1	1œ¤ì4(€½¹ÍÐÁÕ‰±¥	½‘ä€ô)M=8¹ÍÑÉ¥¹¥™ä¡•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½É	½‘ä¡Õ¹…Ù…¥±…‰±”¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÁÕ‰±¥	½‘ä¹¥¹±Õ‘•Ì …É‰¥ÑÉ…Éä‘…Ñ…‰…Í”Ñ•áÐœ¤°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÁÕ‰±¥	½‘ä¹¥¹±Õ‘•Ì MÕÁ…‰…Í”IA™…¥±•œ¤°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡ÁÕ‰±¥	½‘ä°€ì‰½¬ˆé™…±Í”°‰•ÉÉ½Èˆéì‰½‘”ˆè‰=559}U9Y%1	1ˆ°‰µ•ÍÍ…”ˆè‰Q¡”¹Ñ•ÉÁÉ¥Í”%¹Ñ•±±¥•¹”½µµ…¹½Õ±¹½Ð‰”½µÁ±•Ñ•¸‰õôœ¤ì4(4(€½¹ÍÐ½Ù•É¹•Õáá5…ÁÁ¥¹Ì€ôl4(€€€l9QIAI%M}%}%5A=Q9e}=91%Pœ°€%5A=Q9e}=91%Pt°4(€€€l9QIAI%M}AI=Y%I}UQ!=I%iQ%=9}YIM%=9}MQ1œ°€UQ!=I%iQ%=9}MQ1t°4(€€€l9QIAI%M}%}MQ1}aUQ%=9}9œ°€=559}%9}AI=IMLt°4(€€€l9QIAI%M}AI=Y%I}AI5%MM%=9}9%œ°€AI5%MM%=9}9%t°4(€€€l9QIAI%M}%}=559}9=Q}aUQ	1œ°€=559}%9}AI=IMLt°4(€€€l9QIAI%M}Y%9}9%Q}MQ1œ°€IM=UI}MQ1t°(€€€l9QIAI%M}AI=Y%I}I=UQ}	1=-œ°€=559}	1=-t°(€€€l9QIAI%M}5=I9%iQ%=9}M=UI}9=Q}UII9Pœ°€IM=UI}MQ1t°(€€€l9QIAI%M}5=I9%iQ%=9}M=UI}9=Q}AAI=Yœ°€=559}	1=-t°(€€€l9QIAI%M}5=I9%iQ%=9}I=559Q%=9}%9Y1%œ°€=559}	1=-t°(€€€l9QIAI%M}5=I9%iQ%=9}IMU1Q}%9Q%Qe}5%M5Q œ°€IM=UI}MQ1t°(€€€l9QIAI%M}AAI=Y1}IY%]}IEU%Iœ°€IM=UI}MQ1t°(€€€l9QIAI%M}AAI=Y1}IY%]}%9Q%Qe}5%M5Q œ°€IM=UI}MQ1t°4(€t…Ì½¹ÍÐì4(€™½È€¡½¹ÍÐmÍ¥¹…°°•áÁ•Ñ•‘½‘•t½˜½Ù•É¹•Õáá5…ÁÁ¥¹Ì¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…Á¹Ñ•ÉÁÉ¥Í•½µµ…¹‘IÁÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€€€ÍÑ…ÑÕÌè€ÔÀÌ°4(€€€€€‘…Ñ…‰…Í•5•ÍÍ…”èÍ¥¹…°°4(€€€ô¤¤¹½‘”°•áÁ•Ñ•‘½‘”¤ì4(€ô4)ô¤ì4(4)Ñ•ÍÐ É•½Ù•ÉäÉ•Ñ…¥¹ÌÑ¡”¥µµÕÑ…‰±”Á±…¹¹•É½ÕÑ”…¹µ½‘•°œ°€ ¤€ôøì4(€½¹ÍÐÁ±…¸€ôì4(€€€©½‰%è€œÜÜÜÜÜÜÜÜ´ÜÜÜÜ´ÐÜÜÜ´àÜÜÜ´ÜÜÜÜÜÜÜÜÜÜÜÜœ°4(€€€½É…¹¥é…Ñ¥½¹%è‰…Í”¹½É…¹¥é…Ñ¥½¹%°4(€€€Ý½É­ÍÁ…•%è‰…Í”¹Ý½É­ÍÁ…•%°4(€€€Í½ÕÉ•%è€œàààààààà´àààà´Ðààà´àààà´ààààààààààààœ°4(€€€Í½ÕÉ•Y•ÉÍ¥½¹%è€œääääääää´ääää´Ðäää´àäää´ääääääääääääœ°4(€€€…Á…‰¥±¥Ñäè€…ÍÍ•ÍÌ¹•Ù¥‘•¹”¹•áÑÉ…Ðœ°4(€€€É½ÕÑ•%è€…………………„µ………„´Ñ……„´á……„µ……………………………„œ°4(€€€ÁÉ½Ù¥‘•É½¹™¥%è€‰‰‰‰‰‰‰ˆµ‰‰‰ˆ´Ñ‰‰ˆ´á‰‰ˆµ‰‰‰‰‰‰‰‰‰‰‰ˆœ°4(€€€ÁÉ½Ù¥‘•Èè€½Á•¹…¤œ°4(€€€µ½‘•°è€Á±…¹¹•µµ½‘•°œ°4(€€€•¹‘Á½¥¹Ñ%‘•¹Ñ¥Ñäè¹Õ±°°4(€€€‘•Á±½åµ•¹Ñ%‘•¹Ñ¥Ñäè¹Õ±°°4(€€€ÁÉ½µÁÑ-•äè€…ÍÍ•ÍÌ¹•Ù¥‘•¹”¹•áÑÉ…Ðœ°4(€€€ÁÉ½µÁÑY•ÉÍ¥½¸è€•¹Ñ•ÉÁÉ¥Í”µ•Ù¥‘•¹”µ•áÑÉ…Ð´Äœ°4(€€€É•ÅÕ•ÍÑ!…Í è€Œœ¹É•Á•…Ð ØÐ¤°4(€ôì4(€½¹ÍÐÉ•½Ù•É•€ôÉ•…‘Ù¥‘•¹•áÑÉ…Ñ¥½¹I½ÕÑ•A±…¸¡Á±…¸°ì4(€€€½É…¹¥é…Ñ¥½¹%èÁ±…¸¹½É…¹¥é…Ñ¥½¹%°4(€€€Ý½É­ÍÁ…•%èÁ±…¸¹Ý½É­ÍÁ…•%°4(€€€Í½ÕÉ•%èÁ±…¸¹Í½ÕÉ•%°4(€€€Í½ÕÉ•Y•ÉÍ¥½¹%èÁ±…¸¹Í½ÕÉ•Y•ÉÍ¥½¹%°4(€€€É•ÅÕ•ÍÑ!…Í èÁ±…¸¹É•ÅÕ•ÍÑ!…Í °4(€ô¤ì4(€…ÍÍ•ÉÐ¹‘••ÁÅÕ…°¡É•½Ù•É•°Á±…¸¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•áÑÉ…Ñ¥½¹I½ÕÑ•5…Ñ¡•ÍA±…¸¡É•½Ù•É•„°ì4(€€€É½ÕÑ•%èÁ±…¸¹É½ÕÑ•%°4(€€€ÁÉ½Ù¥‘•É½¹™¥%èÁ±…¸¹ÁÉ½Ù¥‘•É½¹™¥%°4(€€€ÁÉ½Ù¥‘•Èè€½Á•¹…¤œ°4(€€€µ½‘•°è€Á±…¹¹•µµ½‘•°œ°4(€ô¤°ÑÉÕ”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡•áÑÉ…Ñ¥½¹I½ÕÑ•5…Ñ¡•ÍA±…¸¡É•½Ù•É•„°ì4(€€€É½ÕÑ•%è€‘‘‘‘‘‘‘µ‘‘‘´Ñ‘‘´á‘‘µ‘‘‘‘‘‘‘‘‘‘‘œ°4(€€€ÁÉ½Ù¥‘•É½¹™¥%è€•••••••”µ•••”´Ñ••”´á••”µ•••••••••••”œ°4(€€€ÁÉ½Ù¥‘•Èè€½Á•¹…¤œ°4(€€€µ½‘•°è€¹•Üµ‘•™…Õ±Ðµµ½‘•°œ°4(€ô¤°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹Ñ¡É½ÝÌ  ¤€ôøÉ•…‘Ù¥‘•¹•áÑÉ…Ñ¥½¹I½ÕÑ•A±…¸¡ì€¸¸¹Á±…¸°Í½ÕÉ•%è‰…Í”¹Ý½É­ÍÁ…•%ô°ì4(€€€½É…¹¥é…Ñ¥½¹%èÁ±…¸¹½É…¹¥é…Ñ¥½¹%°4(€€€Ý½É­ÍÁ…•%èÁ±…¸¹Ý½É­ÍÁ…•%°4(€€€Í½ÕÉ•%èÁ±…¸¹Í½ÕÉ•%°4(€€€Í½ÕÉ•Y•ÉÍ¥½¹%èÁ±…¸¹Í½ÕÉ•Y•ÉÍ¥½¹%°4(€€€É•ÅÕ•ÍÑ!…Í èÁ±…¸¹É•ÅÕ•ÍÑ!…Í °4(€ô¤°€¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤€ôø•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€IM=UI}MQ1œ¤ì4)ô¤ì4(4)Ñ•ÍÐ ½¹±äÑåÁ•ÍÑ…¥¹œ…¹½µµ¥ÐÑÉ…¹ÍÁ½ÉÐÕ¹•ÉÑ…¥¹ÑäÁÉ•Í•ÉÙ•ÌÑ¡”±…¥µ•É••¥ÁÐœ°€ ¤€ôøì4(€™½È€¡½¹ÍÐm±…ÍÍ¥™¥…Ñ¥½¸°É•ÍÁ½¹Í•I••¥Ù•‘t½˜l4(€€€l½¹¹•Ñ¥½¹}™…¥±•œ°™…±Í•t°4(€€€lÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀÈœ°ÑÉÕ•t°4(€€€lÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀÌœ°ÑÉÕ•t°4(€€€lÑÉ…¹Í¥•¹Ñ}¡ÑÑÁ|ÔÀÐœ°ÑÉÕ•t°4(€€€lÉ•ÍÁ½¹Í•}É•…‘}™…¥±•œ°ÑÉÕ•t°4(€t…Ì½¹ÍÐ¤ì4(€€€½¹ÍÐÕ¹•ÉÑ…¥¸€ôµ…ÁáÑÉ…Ñ¥½¹A•ÉÍ¥ÍÑ•¹•ÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁQÉ…¹ÍÁ½ÉÑÉÉ½È¡±…ÍÍ¥™¥…Ñ¥½¸°É•ÍÁ½¹Í•I••¥Ù•¤¤ì4(€€€…ÍÍ•ÉÐ¹½¬¡Õ¹•ÉÑ…¥¸¥¹ÍÑ…¹•½˜I•½Ù•É…‰±•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Õ¹•ÉÑ…¥¸¹½‘”°€=559}U9Y%1	1œ¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Õ¹•ÉÑ…¥¸¹‘¥ÍÁ½Í¥Ñ¥½¸°€ÁÉ•Í•ÉÙ•}±…¥µ•‘}É••¥ÁÐœ¤ì4(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡Í¡½Õ±‘AÉ•Í•ÉÙ•±…¥µ•‘¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ¡Õ¹•ÉÑ…¥¸°ì©½‰%è‰…Í”¹É•ÅÕ•ÍÑ%ô¤°ÑÉÕ”¤ì4(€ô4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡Í¡½Õ±‘AÉ•Í•ÉÙ•±…¥µ•‘¹Ñ•ÉÁÉ¥Í•I••¥ÁÐ 4(€€€¹•Ü¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È =559}U9Y%1	1œ¤°4(€€€ì©½‰%è‰…Í”¹É•ÅÕ•ÍÑ%ô°4(€€¤°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…ÁáÑÉ…Ñ¥½¹A•ÉÍ¥ÍÑ•¹•ÉÉ½È¡¹•ÜQåÁ•ÉÉ½È Õ¹•áÁ•Ñ•¥µÁ±•µ•¹Ñ…Ñ¥½¸™…¥±ÕÉ”œ¤¤¥¹ÍÑ…¹•½˜I•½Ù•É…‰±•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È°™…±Í”¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡µ…ÁáÑÉ…Ñ¥½¹A•ÉÍ¥ÍÑ•¹•ÉÉ½È¡¹•ÜMÕÁ…‰…Í•IÁÉÉ½È¡ì4(€€€ÍÑ…ÑÕÌè€ÐÀä°4(€€€‘…Ñ…‰…Í•5•ÍÍ…”è€9QIAI%M}%}MQ1}aUQ%=9}9œ°4(€ô¤¤¹½‘”°€=559}%9}AI=IMLœ¤ì4)ô¤ì4(4)Ñ•ÍÐ •áÑÉ…Ñ¥½¸É••¥ÁÐ¥‘•¹Ñ¥Ñä¥ÌÑ¡”•áÁ±¥¥Ð•áÑÉ…Ñ¥½¸©½ˆÉ•Í½ÕÉ”œ°€ ¤€ôøì4(€½¹ÍÐ©½‰%€ô€œÜÜÜÜÜÜÜÜ´ÜÜÜÜ´ÐÜÜÜ´àÜÜÜ´ÜÜÜÜÜÜÜÜÜÜÜÜœì4(€½¹ÍÐÍ½ÕÉ•%€ô€œàààààààà´àààà´Ðààà´àààà´ààààààààààààœì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•% •Ù¥‘•¹”¹•áÑÉ…Ðœ°ì4(€€€É•Í½ÕÉ•%è©½‰%°4(€€€©½‰%°4(€€€Í½ÕÉ•%°4(€ô¤°©½‰%¤ì4)ô¤ì4(4)Ñ•ÍÐ ÁÉ½µ½Ñ¥½¸É••¥ÁÐ¥‘•¹Ñ¥Ñä¥ÌÑ¡”•áÁ±¥¥ÐÍÍ•ÍÌ‘É…™ÐÉ•Í½ÕÉ”œ°€ ¤€ôøì(€½¹ÍÐ…ÍÍ•ÍÍÉ…™Ñ%€ô€œÔÔÔÔÔÔÔÔ´ÔÔÔÔ´ÐÔÔÔ´àÔÔÔ´ÔÔÔÔÔÔÔÔÔÔÔÔœì4(€½¹ÍÐÍ½ÕÉ•%€ô€œØØØØØØØØ´ØØØØ´ÐØØØ´àØØØ´ØØØØØØØØØØØØœì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•% •Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œ°ì4(€€€É•Í½ÕÉ•%è…ÍÍ•ÍÍÉ…™Ñ%°4(€€€…ÍÍ•ÍÍÉ…™Ñ%°4(€€€Í½ÕÉ•%°4(€ô¤°…ÍÍ•ÍÍÉ…™Ñ%¤ì4(€…ÍÍ•ÉÐ¹Ñ¡É½ÝÌ 4(€€€€ ¤€ôøÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•% •Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œ°ì…ÍÍ•ÍÍÉ…™Ñ%°Í½ÕÉ•%ô¤°4(€€€€¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤€ôø•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€IM=UI}MQ1œ°4(€€¤ì4(€…ÍÍ•ÉÐ¹Ñ¡É½ÝÌ 4(€€€€ ¤€ôøÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•% •Ù¥‘•¹”¹…ÍÍ•ÍÌ¹ÁÉ½µ½Ñ”œ°ì4(€€€€€É•Í½ÕÉ•%èÍ½ÕÉ•%°4(€€€€€…ÍÍ•ÍÍÉ…™Ñ%°4(€€€€€Í½ÕÉ•%°4(€€€ô¤°4(€€€€¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤€ôø•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€IM=UI}MQ1œ°4(€€¤ì)ô¤ì()Ñ•ÍÐ …±°Ñ•¸½µµ…¹±…ÍÍ•ÌÉ•ÅÕ¥É”½¹”•áÁ±¥¥Ð…¹½¹¥…°É•Í½ÕÉ”¥‘•¹Ñ¥Ñäœ°€ ¤€ôøì(€™½È€¡½¹ÍÐm¥¹‘•à°½µµ…¹‘QåÁ•t½˜É•Á±…å½µµ…¹‘Ì¹•¹ÑÉ¥•Ì ¤¤ì(€€€½¹ÍÐÉ•Í½ÕÉ•%€ô€ÐàÀÀÀÀÀÀ´ÀÀÀÀ´ÐÀÀÀ´àÀÀÀ´‘íMÑÉ¥¹œ¡¥¹‘•à€¬€Ä¤¹Á…‘MÑ…ÉÐ ÄÈ°€œÀœ¥õ€ì(€€€½¹ÍÐÉ•ÍÕ±Ð€ô•¹Ñ•ÉÁÉ¥Í•I•ÍÕ±Ñ½È¡½µµ…¹‘QåÁ”°É•Í½ÕÉ•%¤ì(€€€…ÍÍ•ÉÐ¹•ÅÕ…°¡É•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•%¡½µµ…¹‘QåÁ”°É•ÍÕ±Ð¤°É•Í½ÕÉ•%¤ì(€€€½¹ÍÐìÉ•Í½ÕÉ•%è}µ¥ÍÍ¥¹œ°€¸¸¹Ý¥Ñ¡½ÕÑáÁ±¥¥Ñ%ô€ôÉ•ÍÕ±Ðì(€€€…ÍÍ•ÉÐ¹Ñ¡É½ÝÌ (€€€€€€ ¤€ôøÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•%¡½µµ…¹‘QåÁ”°Ý¥Ñ¡½ÕÑáÁ±¥¥Ñ%¤°(€€€€€€¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤€ôø•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€IM=UI}MQ1œ°(€€€€¤ì(€€€½¹ÍÐ±¥¹•…•-•ä€ô=‰©•Ð¹­•åÌ¡É•ÍÕ±Ð¤¹™¥¹¡­•ä€ôø­•ä€„ôô€É•Í½ÕÉ•%œ¤ì(€€€¥˜€¡±¥¹•…•-•ä¤ì(€€€€€…ÍÍ•ÉÐ¹Ñ¡É½ÝÌ (€€€€€€€€ ¤€ôøÉ•Í½±Ù•¹Ñ•ÉÁÉ¥Í•½µµ…¹‘I•Í½ÕÉ•%¡½µµ…¹‘QåÁ”°ì€¸¸¹É•ÍÕ±Ð°m±¥¹•…•-•åtè‰…Í”¹½É…¹¥é…Ñ¥½¹%ô¤°(€€€€€€€€¡•ÉÉ½ÈèÕ¹­¹½Ý¸¤€ôø•ÉÉ½È¥¹ÍÑ…¹•½˜¹Ñ•ÉÁÉ¥Í•½µµ…¹‘ÉÉ½È€˜˜•ÉÉ½È¹½‘”€ôôô€IM=UI}MQ1œ°(€€€€€€¤ì(€€€ô(€ô)ô¤ì(4)½¹ÍÐ™¥ÉÍÑÑÑ•µÁÑ!…Í €ô…Ý…¥Ð¡…Í¡I••¥ÁÑY…±Õ”¡ì€¸¸¹‰…Í”°É•ÅÕ•ÍÑ%è¹Õ±°ô¤ì4)½¹ÍÐÉ•Á±…åÑÑ•µÁÑ!…Í €ô…Ý…¥Ð¡…Í¡I••¥ÁÑY…±Õ”¡ì€¸¸¹‰…Í”°É•ÅÕ•ÍÑ%è¹Õ±°ô¤ì4)½¹ÍÐ¡…¹•‘A…å±½…‘!…Í €ô…Ý…¥Ð¡…Í¡I••¥ÁÑY…±Õ”¡ì€¸¸¹‰…Í”°É•ÅÕ•ÍÑ%è¹Õ±°°Á…å±½…èì€¸¸¹‰…Í”¹Á…å±½…°ÍÑ…ÑÕÌè€É•©•Ñ•œôô¤ì4)…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥ÉÍÑÑÑ•µÁÑ!…Í °É•Á±…åÑÑ•µÁÑ!…Í ¤ì4)…ÍÍ•ÉÐ¹¹½ÑÅÕ…°¡™¥ÉÍÑÑÑ•µÁÑ!…Í °¡…¹•‘A…å±½…‘!…Í ¤ì4)½¹Í½±”¹±½œ ½¬€´É•ÅÕ•ÍÑ%¥Ì½ÉÉ•±…Ñ¥½¸µ½¹±äÝ¡¥±”¡…¹•Á…å±½…‘Ì½¹™±¥Ðœ¤ì4(