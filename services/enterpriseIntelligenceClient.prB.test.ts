import assert from 'node:assert/strict';
import {
  EnterpriseIntelligenceClientError,
  enterpriseIntelligenceClient,
} from './enterpriseIntelligenceClient';
import { ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION } from './enterpriseIntelligence';
import { emptyTranscriptFlowProjection } from './transcriptFlow/contracts';

type Invocation = {
  name: string;
  options: { body: Record<string, unknown> };
};

const invocations: Invocation[] = [];
let responses: Array<{ data: unknown; error: unknown }> = [];

(globalThis as typeof globalThis & {
  __studioInvoke?: (name: string, options: Invocation['options']) => Promise<{ data: unknown; error: unknown }>;
}).__studioInvoke = async (name, options) => {
  invocations.push({ name, options });
  return responses.shift() ?? { data: { ok: true }, error: null };
};

const resetTransport = (...next: Array<{ data: unknown; error: unknown }>) => {
  invocations.length = 0;
  responses = [...next];
};

const organizationId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '10000000-0000-4000-8000-000000000002';
const sourceSetId = '10000000-0000-4000-8000-000000000003';
const sourceId = '10000000-0000-4000-8000-000000000004';
const sourceVersionId = '10000000-0000-4000-8000-000000000005';
const supportingSourceId = '10000000-0000-4000-8000-000000000006';
const supportingVersionId = '10000000-0000-4000-8000-000000000007';
const bundleId = '10000000-0000-4000-8000-000000000008';
const emptyProjection = {
  schemaVersion: ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION,
  organizationId,
  workspaceId,
  authorizationVersion: 9,
  generatedAt: '2026-09-03T00:00:00.000Z',
  capabilities: [],
  availability: 'empty',
  providers: [],
  evidenceSources: [],
  evidenceCandidates: [],
  assessDrafts: [],
  applications: [],
  studioDocuments: [],
  deliveryPackages: [],
  monitorBaselines: [],
  modernizationDecisions: [],
  blueprints: [],
  approvalResources: [],
  commandActivity: [],
  transcriptFlow: emptyTranscriptFlowProjection(),
  assessPromotion: {
    state: 'contract_pending',
    acceptedCandidateCount: 0,
    provenanceComplete: false,
    idempotencyState: 'not_started',
    conflicts: [],
  },
};

await (async () => {
  resetTransport({
    data: { projection: { ...emptyProjection, organizationId: '20000000-0000-4000-8000-000000000002' } },
    error: null,
  });
  await assert.rejects(
    () => enterpriseIntelligenceClient.loadProjection({ organizationId, workspaceId }),
    (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'ENTERPRISE_PROJECTION_UNAVAILABLE',
  );

  resetTransport({
    data: { projection: { ...emptyProjection, organizationId: organizationId.toUpperCase(), workspaceId: workspaceId.toUpperCase() } },
    error: null,
  });
  const uppercaseEquivalent = await enterpriseIntelligenceClient.loadProjection({ organizationId, workspaceId });
  assert.equal(uppercaseEquivalent.workspaceId, workspaceId.toUpperCase());
})();

await (async () => {
  resetTransport({ data: { ok: true, resourceId: sourceSetId }, error: null });
  await enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
    organizationId,
    workspaceId,
    sourceSetId,
    expectedVersion: 4,
    label: '  Studio discovery sources  ',
    description: '  Direct planning evidence  ',
    members: [
      { sourceId, versionSelector: sourceVersionId, role: 'primary', note: '  Exact interview  ' },
      { sourceId: supportingSourceId, versionSelector: supportingVersionId, role: 'supporting' },
    ],
  });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].name, 'enterprise-intelligence-command');
  assert.deepEqual(invocations[0].options.body.payload, {
    sourceSetId,
    displayLabel: 'Studio discovery sources',
    description: 'Direct planning evidence',
    ownerModule: 'studio',
    purpose: 'Direct planning evidence',
    lock: true,
    expectedVersion: 4,
    items: [
      { sourceVersionId, ordinal: 1, role: 'primary', note: 'Exact interview' },
      { sourceVersionId: supportingVersionId, ordinal: 2, role: 'supporting' },
    ],
  });
})();

await (async () => {
  resetTransport(
    { data: null, error: { name: 'FunctionsFetchError' } },
    { data: { ok: true, resourceId: sourceSetId }, error: null },
  );
  await enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
    organizationId,
    workspaceId,
    label: 'Studio only',
    members: [{ sourceId, versionSelector: sourceVersionId, role: 'reference' }],
  });
  assert.equal(invocations.length, 2);
  assert.deepEqual(invocations[0].options.body, invocations[1].options.body);
  assert.deepEqual(invocations[1].options.body.payload, {
    displayLabel: 'Studio only',
    ownerModule: 'studio',
    purpose: 'Studio only',
    lock: true,
    expectedVersion: 0,
    items: [{ sourceVersionId, ordinal: 1, role: 'reference' }],
  });
})();

await (async () => {
  resetTransport(
    { data: null, error: { name: 'FunctionsFetchError' } },
    { data: null, error: { name: 'FunctionsRelayError' } },
  );
  await assert.rejects(() => enterpriseIntelligenceClient.createManualDeliveryPackage({
    organizationId,
    workspaceId,
    manualBrief: 'Reconcile the uncertain manual package before retrying',
    items: [{
      type: 'task',
      title: 'Reload committed state',
      description: 'Prove that a possibly committed manual package is not resubmitted under a fresh key.',
      acceptanceCriteria: ['Exactly one authoritative package is visible after reload.'],
      nonFunctionalRequirements: ['No automatic execution authority.'],
    }],
  }), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'COMMAND_OUTCOME_UNKNOWN');
  assert.equal(invocations.length, 2);
  assert.deepEqual(invocations[0].options.body, invocations[1].options.body);
})();

for (const code of ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'] as const) {
  await (async () => {
    resetTransport({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: new Response(JSON.stringify({ ok: false, error: { code } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      },
    });
    await assert.rejects(() => enterpriseIntelligenceClient.createManualDeliveryPackage({
      organizationId,
      workspaceId,
      manualBrief: 'Reconcile the post-commit server outcome before retrying',
      items: [{
        type: 'task',
        title: 'Reload committed state',
        description: 'A post-execute response failure must lock any fresh-key retry.',
        acceptanceCriteria: ['Exactly one authoritative package is visible after reload.'],
        nonFunctionalRequirements: ['No automatic execution authority.'],
      }],
    }), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'COMMAND_OUTCOME_UNKNOWN');
    assert.equal(invocations.length, 1);
  })();
}

await (async () => {
  resetTransport({
    data: null,
    error: {
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify({ ok: false, error: { code: 'RESOURCE_STALE' } }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    },
  });
  await assert.rejects(() => enterpriseIntelligenceClient.createAssembleBlueprint({
    organizationId,
    workspaceId,
    modernizationDecisionId: sourceSetId,
    name: 'Retained generic command failure',
  }), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'COMMAND_UNAVAILABLE');
  assert.equal(invocations.length, 1);
})();

assert.throws(() => enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
  organizationId, workspaceId, label: ' ', members: [{ sourceId, versionSelector: sourceVersionId, role: 'primary' }],
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
assert.throws(() => enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
  organizationId, workspaceId, label: 'x'.repeat(241), members: [{ sourceId, versionSelector: sourceVersionId, role: 'primary' }],
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
assert.throws(() => enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
  organizationId, workspaceId, label: 'Studio', description: 'x'.repeat(1_001),
  members: [{ sourceId, versionSelector: sourceVersionId, role: 'primary' }],
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
assert.throws(() => enterpriseIntelligenceClient.commitStudioTranscriptSourceSet({
  organizationId, workspaceId, label: 'Studio', sourceSetId: 'not-a-uuid',
  members: [{ sourceId, versionSelector: sourceVersionId, role: 'primary' }],
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'RESOURCE_NOT_FOUND');

await (async () => {
  resetTransport({ data: { ok: true, resourceId: bundleId }, error: null });
  await enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
    organizationId,
    workspaceId,
    inputBundleId: bundleId,
    expectedVersion: 2,
    sourceSetVersionSelectors: [sourceVersionId, supportingVersionId],
    label: '  Studio locked inputs  ',
  });
  assert.deepEqual(invocations[0].options.body.payload, {
    inputBundleId: bundleId,
    ownerModule: 'studio',
    expectedVersion: 2,
    sourceSets: [
      { sourceSetVersionId: sourceVersionId, ordinal: 1, purpose: 'Studio locked inputs' },
      { sourceSetVersionId: supportingVersionId, ordinal: 2, purpose: 'Studio locked inputs' },
    ],
  });
})();

await (async () => {
  resetTransport({ data: { ok: true, resourceId: bundleId }, error: null });
  await enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
    organizationId,
    workspaceId,
    sourceSetVersionSelectors: [sourceVersionId],
    label: 'Studio bundle',
  });
  assert.deepEqual(invocations[0].options.body.payload, {
    ownerModule: 'studio',
    expectedVersion: 0,
    sourceSets: [{ sourceSetVersionId: sourceVersionId, ordinal: 1, purpose: 'Studio bundle' }],
  });
})();

for (const invalid of [
  { sourceSetVersionSelectors: [] as string[], label: 'Studio bundle' },
  { sourceSetVersionSelectors: [sourceVersionId], label: ' ' },
  { sourceSetVersionSelectors: [sourceVersionId, sourceVersionId], label: 'Studio bundle' },
  { sourceSetVersionSelectors: Array.from({ length: 21 }, (_, index) => `10000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`), label: 'Studio bundle' },
]) {
  assert.throws(() => enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
    organizationId, workspaceId, ...invalid,
  }), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'TRANSCRIPT_INPUT_BUNDLE_INVALID');
}
assert.throws(() => enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
  organizationId, workspaceId, inputBundleId: 'not-a-uuid', sourceSetVersionSelectors: [sourceVersionId], label: 'Studio bundle',
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'RESOURCE_NOT_FOUND');
assert.throws(() => enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
  organizationId, workspaceId, sourceSetVersionSelectors: ['not-a-uuid'], label: 'Studio bundle',
}), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'RESOURCE_NOT_FOUND');

await (async () => {
  resetTransport({ data: { ok: false, error: { code: 'PERMISSION_DENIED' } }, error: null });
  await assert.rejects(() => enterpriseIntelligenceClient.lockStudioTranscriptInputBundle({
    organizationId, workspaceId, sourceSetVersionSelectors: [sourceVersionId], label: 'Studio bundle',
  }), (error: unknown) => error instanceof EnterpriseIntelligenceClientError && error.code === 'PERMISSION_DENIED');
})();

console.log('ok - PR B Enterprise client Studio source ownership and validation');
