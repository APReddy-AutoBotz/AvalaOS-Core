import assert from 'node:assert/strict';
import {
  assertStudioSourceCreatePreflight,
  deriveTranscriptCommandRequestBinding,
  handleEnterpriseIntelligenceRequest,
  parseEnterpriseCommandEnvelope,
  requiredCapabilitiesForEnterpriseCommand,
  type Authority,
} from './enterpriseIntelligenceCommand';
import { SupabaseRpcError } from './supabase';

const ids = {
  actor: '71000000-0000-4000-8000-000000000001',
  org: '71000000-0000-4000-8000-000000000002',
  workspace: '71000000-0000-4000-8000-000000000003',
  bundle: '71000000-0000-4000-8000-000000000004',
  bundleVersion: '71000000-0000-4000-8000-000000000005',
  sourceSet: '71000000-0000-4000-8000-000000000006',
  sourceSetVersion: '71000000-0000-4000-8000-000000000007',
  source: '71000000-0000-4000-8000-000000000008',
  sourceVersion: '71000000-0000-4000-8000-000000000009',
  job: '71000000-0000-4000-8000-000000000010',
  binding: '71000000-0000-4000-8000-000000000011',
  candidate: '71000000-0000-4000-8000-000000000012',
  assessDraft: '71000000-0000-4000-8000-000000000021',
  assessActor: '71000000-0000-4000-8000-000000000020',
};

const authority = (capabilities: string[], actorId = ids.actor): Authority => ({
  actorId,
  organizationId: ids.org,
  workspaceId: ids.workspace,
  authorizationVersion: 7,
  isAdmin: false,
  permissions: new Set(capabilities),
  organizationPermissions: new Set(),
  workspacePermissions: new Set(),
  roleNames: new Set(['studio-source-author']),
  organizationRoleNames: new Set(['studio-source-author']),
  workspaceRoleNames: new Set(['studio-source-author']),
  organizationRoleIds: new Set(['71000000-0000-4000-8000-000000000013']),
  workspaceRoleIds: new Set(['71000000-0000-4000-8000-000000000014']),
});

const assessCapabilities = ['assessment.edit', 'evidence.review', 'evidence.write'];

const marker = (testId: string, assertionId: string, personaId: string, capabilities: string[], lineage: Record<string, unknown>) => {
  console.log(`PR_C_ASSERTION ${JSON.stringify({
    testId,
    assertionId,
    fixture: 'studio-source-exact-v1',
    owner: 'studio-source-api',
    result: 'passed',
    runtimeContext: {
      persona: { id: personaId, state: 'active', capabilities: [...capabilities].sort() },
      organizationId: ids.org,
      workspaceId: ids.workspace,
      lineage,
    },
  })}`);
};

assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('studio.source.create'), ['studio.sources.manage']);
assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('studio.bundle.extract'), ['studio.sources.manage']);
assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('studio.candidate.review'), ['studio.sources.manage']);

const preflightReceipt = {
  id: '71000000-0000-4000-8000-000000000017',
  request_hash: 'b'.repeat(64),
  initial_request_id: '71000000-0000-4000-8000-000000000018',
  last_request_id: '71000000-0000-4000-8000-000000000018',
  execution_token: '71000000-0000-4000-8000-000000000019',
  execution_fence: 4,
  lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
  status: 'claimed' as const,
};
let preflightCalls = 0;
await assertStudioSourceCreatePreflight(authority(['studio.sources.manage']), preflightReceipt, async <T>(name, args) => {
  preflightCalls += 1;
  assert.equal(name, 'studio_source_create_preflight_v1');
  assert.deepEqual(args, {
    p_actor: ids.actor, p_org: ids.org, p_workspace: ids.workspace, p_authorization_version: 7,
    p_receipt: preflightReceipt.id, p_execution_token: preflightReceipt.execution_token, p_execution_fence: 4,
  });
  return { allowed: true, ownerModule: 'studio' } as T;
});
assert.equal(preflightCalls, 1);
await assert.rejects(assertStudioSourceCreatePreflight(authority(['studio.sources.manage']), preflightReceipt,
  async () => { throw new SupabaseRpcError({ status: 409, databaseMessage: 'ENTERPRISE_TRANSCRIPT_FEATURE_DISABLED' }); }),
error => error instanceof Error && error.message === 'COMMAND_BLOCKED');

const studioBundleEnvelope = parseEnterpriseCommandEnvelope({
  commandType: 'studio.bundle.extract',
  requestId: '71000000-0000-4000-8000-000000000015',
  idempotencyKey: 'studio-source-exact-binding',
  organizationId: ids.org,
  workspaceId: ids.workspace,
  payload: {
    inputBundleId: ids.bundle,
    inputBundleVersionId: ids.bundleVersion,
    expectedInputBundleVersion: 3,
    sources: [{
      ordinal: 1,
      sourceSetId: ids.sourceSet,
      sourceSetVersionId: ids.sourceSetVersion,
      expectedSourceSetVersion: 2,
      sourceId: ids.source,
      sourceVersionId: ids.sourceVersion,
    }],
  },
});

const lookupTables: string[] = [];
const exactStudioBinding = await deriveTranscriptCommandRequestBinding(authority(['studio.sources.manage']), studioBundleEnvelope, {
  findOne: async <T>(table: string, query: string) => {
    lookupTables.push(table);
    assert.match(query, new RegExp(`org_id=eq\\.${ids.org}`));
    assert.match(query, new RegExp(`workspace_id=eq\\.${ids.workspace}`));
    if (table === 'enterprise_module_input_bundle_versions') return {
      id: ids.bundleVersion, input_bundle_id: ids.bundle, version: 3, bundle_hash: 'a'.repeat(64),
    } as T;
    if (table === 'enterprise_source_set_versions') return {
      id: ids.sourceSetVersion, source_set_id: ids.sourceSet, version: 2,
    } as T;
    if (table === 'enterprise_module_input_bundles') {
      assert.match(query, /owner_module=eq\.studio/);
      return { id: ids.bundle } as T;
    }
    if (table === 'enterprise_source_sets') {
      assert.match(query, /owner_module=eq\.studio/);
      return { id: ids.sourceSet } as T;
    }
    if (table === 'enterprise_module_input_bundle_items') return { source_set_version_id: ids.sourceSetVersion } as T;
    if (table === 'enterprise_source_set_version_items') return { source_id: ids.source } as T;
    return null;
  },
});
assert.deepEqual(lookupTables, [
  'enterprise_module_input_bundle_versions', 'enterprise_source_set_versions',
  'enterprise_module_input_bundles', 'enterprise_source_sets',
  'enterprise_module_input_bundle_items', 'enterprise_source_set_version_items',
]);
assert.deepEqual(exactStudioBinding, {
  inputBundleId: ids.bundle,
  inputBundleVersionId: ids.bundleVersion,
  expectedInputBundleVersion: 3,
  bundleHash: 'a'.repeat(64),
  sources: [{
    inputBundleId: ids.bundle,
    inputBundleVersionId: ids.bundleVersion,
    bundleVersion: 3,
    bundleHash: 'a'.repeat(64),
    sourceSetId: ids.sourceSet,
    sourceSetVersionId: ids.sourceSetVersion,
    sourceSetVersion: 2,
    sourceId: ids.source,
    sourceVersionId: ids.sourceVersion,
    ordinal: 1,
  }],
});
marker('STUDIO-TR-001', 'studio-source-api-exact-bundle-binding', ids.actor, ['studio.sources.manage'], {
  commandType: 'studio.bundle.extract',
  ownerModule: 'studio',
  inputBundleId: ids.bundle,
  inputBundleVersionId: ids.bundleVersion,
  sourceSetVersionId: ids.sourceSetVersion,
  sourceVersionId: ids.sourceVersion,
});

let receiptClaims = 0;
let providerEffects = 0;
const assessAgainstStudio = new Request('http://local/enterprise-intelligence-command', {
  method: 'POST',
  body: JSON.stringify({
    commandType: 'transcript.assess.extract',
    requestId: '71000000-0000-4000-8000-000000000016',
    idempotencyKey: 'assess-cannot-read-studio-bundle',
    organizationId: ids.org,
    workspaceId: ids.workspace,
    payload: {
      inputBundleId: ids.bundle,
      inputBundleVersionSelector: ids.bundleVersion,
      expectedInputBundleVersion: 3,
      sourceSetId: ids.sourceSet,
      sourceSetVersionSelector: ids.sourceSetVersion,
      expectedSourceSetVersion: 2,
      sourceVersionSelector: ids.sourceVersion,
    },
  }),
});
const response = await handleEnterpriseIntelligenceRequest(assessAgainstStudio, {
  authenticate: async () => ({ id: ids.assessActor }),
  resolveOrganization: async () => ids.org,
  resolveCommandAuthority: async () => authority(assessCapabilities, ids.assessActor),
  assertCurrentAuthority: async current => current,
  transcriptCommandRequestBindingDependencies: {
    findOne: async <T>(table: string, query: string) => {
      if (table === 'enterprise_module_input_bundle_versions') return {
        id: ids.bundleVersion, input_bundle_id: ids.bundle, version: 3, bundle_hash: 'a'.repeat(64),
      } as T;
      if (table === 'enterprise_source_set_versions') return {
        id: ids.sourceSetVersion, source_set_id: ids.sourceSet, version: 2,
      } as T;
      if (table === 'enterprise_module_input_bundles') {
        assert.match(query, /owner_module=eq\.assess/);
        return null;
      }
      if (table === 'enterprise_source_sets') {
        assert.match(query, /owner_module=eq\.assess/);
        return null;
      }
      if (table === 'enterprise_module_input_bundle_items') return { source_set_version_id: ids.sourceSetVersion } as T;
      if (table === 'enterprise_source_set_version_items') return { source_id: ids.source } as T;
      return null;
    },
  },
  claimReceipt: async () => { receiptClaims += 1; throw new Error('receipt must not be claimed'); },
  executeCommand: async () => { providerEffects += 1; throw new Error('provider must not run'); },
});
assert.equal(response.status, 404);
assert.deepEqual({ receiptClaims, providerEffects }, { receiptClaims: 0, providerEffects: 0 });

const genericDenials = [
  {
    commandType: 'evidence.extract', payload: { sourceId: ids.source },
    privateSource: true, studioJob: false,
  },
  {
    commandType: 'evidence.candidate.review',
    payload: { candidateId: ids.candidate, status: 'accepted' }, privateSource: false, studioJob: true,
  },
  {
    commandType: 'evidence.assess.promote',
    payload: { sourceId: ids.source, assessDraftId: ids.assessDraft, candidateIds: [ids.candidate] },
    privateSource: false, studioJob: true,
  },
] as const;
let genericReceiptClaims = 0;
let genericProviderEffects = 0;
const genericDeniedCommands: Array<{ commandType: string; status: number }> = [];
for (const [index, scenario] of genericDenials.entries()) {
  const denied = await handleEnterpriseIntelligenceRequest(new Request('http://local/enterprise-intelligence-command', {
    method: 'POST',
    body: JSON.stringify({
      commandType: scenario.commandType,
      requestId: `71000000-0000-4000-8000-00000000010${index}`,
      idempotencyKey: `generic-assess-studio-lineage-${index}`,
      organizationId: ids.org,
      workspaceId: ids.workspace,
      payload: scenario.payload,
    }),
  }), {
    authenticate: async () => ({ id: ids.assessActor }),
    resolveOrganization: async () => ids.org,
    resolveCommandAuthority: async () => authority(assessCapabilities, ids.assessActor),
    assertCurrentAuthority: async current => current,
    transcriptCommandRequestBindingDependencies: {
      findOne: async <T>(table: string) => {
        if (table === 'enterprise_evidence_sources') return { id: ids.source, current_version: 1 } as T;
        if (table === 'enterprise_evidence_source_versions') return {
          id: ids.sourceVersion, source_id: ids.source, version: 1,
        } as T;
        if (table === 'enterprise_evidence_candidates') return {
          id: ids.candidate, source_id: ids.source, source_version_id: ids.sourceVersion,
          ai_job_id: ids.job, version: 1, provenance_hash: 'c'.repeat(64),
        } as T;
        if (table === 'studio_source_version_ownerships') {
          return (scenario.privateSource ? { source_version_id: ids.sourceVersion } : null) as T;
        }
        if (table === 'studio_source_extraction_runs') {
          return (scenario.studioJob ? { job_id: ids.job } : null) as T;
        }
        return null;
      },
      findMany: async <T>(table: string) => table === 'enterprise_evidence_candidates' ? [{
        id: ids.candidate, source_id: ids.source, source_version_id: ids.sourceVersion,
        ai_job_id: ids.job, version: 1, provenance_hash: 'c'.repeat(64),
      }] as T[] : [],
    },
    claimReceipt: async () => { genericReceiptClaims += 1; throw new Error('receipt must not be claimed'); },
    executeCommand: async () => { genericProviderEffects += 1; throw new Error('provider must not run'); },
  });
  assert.equal(denied.status, 404, scenario.commandType);
  genericDeniedCommands.push({ commandType: scenario.commandType, status: denied.status });
}
assert.deepEqual({ genericReceiptClaims, genericProviderEffects }, { genericReceiptClaims: 0, genericProviderEffects: 0 });
marker('AUTH-002', 'studio-source-api-assess-owner-confusion-denied', ids.assessActor, assessCapabilities, {
  actualOwnerModule: 'studio',
  inputBundleId: ids.bundle,
  deniedCommands: [
    { commandType: 'transcript.assess.extract', status: response.status },
    ...genericDeniedCommands,
  ],
  receiptClaims: receiptClaims + genericReceiptClaims,
  providerEffects: providerEffects + genericProviderEffects,
});

console.log('studio source API authority tests passed');
