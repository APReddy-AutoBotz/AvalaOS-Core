import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessMappingTerminalError, deriveTranscriptCommandRequestBinding, EnterpriseCommandError, handleEnterpriseIntelligenceRequest, mapAssessMappingSelectionsSequentially, mapEnterpriseCommandRpcError, parseEnterpriseCommandEnvelope, requireAssessMappingPreviewManifest, requiredCapabilitiesForEnterpriseCommand, resolveEnterpriseCommandResourceId, type Authority } from './enterpriseIntelligenceCommand.ts';
import { SupabaseRpcError } from './supabase.ts';

const id = (suffix: number) => `c0000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const authority: Authority = { actorId: id(1), organizationId: id(2), workspaceId: id(3), authorizationVersion: 4, isAdmin: false,
  permissions: new Set(['assess.v2.read', 'assess.v2.draft.write', 'transcript.sources.read', 'evidence.write', 'evidence.review', 'transcript.assess.apply']),
  organizationPermissions: new Set(), workspacePermissions: new Set(), roleNames: new Set(), organizationRoleNames: new Set(), workspaceRoleNames: new Set(),
  organizationRoleIds: new Set(), workspaceRoleIds: new Set() };
const payload = { caseId: id(4), expectedCaseVersion: 3, inputBundleId: id(5), inputBundleVersionId: id(6), expectedInputBundleVersion: 2,
  selections: [{ sourceSetId: id(7), sourceSetVersionId: id(8), expectedSourceSetVersion: 5, sourceId: id(9), sourceVersionId: id(10) }] };
const envelope = { commandType: 'assess.document-map.analyze' as const, requestId: id(11), idempotencyKey: 'assess-map-synthetic-1', organizationId: authority.organizationId, workspaceId: authority.workspaceId, payload };

test('mapping commands parse strictly and require the full conjunctive capability set', () => {
  assert.equal(parseEnterpriseCommandEnvelope(envelope).commandType, 'assess.document-map.analyze');
  assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('assess.document-map.analyze', payload), ['assess.v2.read', 'assess.v2.draft.write', 'transcript.sources.read', 'evidence.write']);
  assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('assess.document-map.proposal.review', {}), ['assess.v2.read', 'assess.v2.draft.write', 'transcript.sources.read', 'evidence.review']);
  assert.deepEqual(requiredCapabilitiesForEnterpriseCommand('assess.document-map.commit', {}), ['assess.v2.read', 'assess.v2.draft.write', 'transcript.sources.read', 'transcript.assess.apply']);
  assert.throws(() => parseEnterpriseCommandEnvelope({ ...envelope, payload: { ...payload, apiKey: 'forbidden' } }), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_PAYLOAD');
});

test('analyze receipt binding derives exact server case, bundle, set and source lineage', async () => {
  const binding = await deriveTranscriptCommandRequestBinding(authority, envelope, { findOne: async <T>(table: string) => {
    const rows: Record<string, unknown> = {
      assess_v2_cases: { id: payload.caseId, version: 3, head_version_id: id(12), schema_version: 'assess-v2-schema-2026-07', status: 'draft' },
      enterprise_module_input_bundle_versions: { id: payload.inputBundleVersionId, input_bundle_id: payload.inputBundleId, version: 2, bundle_hash: 'a'.repeat(64) },
      enterprise_source_set_versions: { id: payload.selections[0].sourceSetVersionId, source_set_id: payload.selections[0].sourceSetId, version: 5 },
      enterprise_module_input_bundle_items: { source_set_version_id: payload.selections[0].sourceSetVersionId },
      enterprise_source_set_version_items: { source_id: payload.selections[0].sourceId },
    };
    return (rows[table] ?? null) as T | null;
  } });
  assert.deepEqual(binding, { caseId: payload.caseId, caseVersion: 3, caseHeadVersionId: id(12), assessSchemaVersion: 'assess-v2-schema-2026-07',
    inputBundleId: payload.inputBundleId, inputBundleVersionId: payload.inputBundleVersionId, inputBundleVersion: 2, bundleHash: 'a'.repeat(64),
    sources: [{ sourceSetId: payload.selections[0].sourceSetId, sourceSetVersionId: payload.selections[0].sourceSetVersionId,
      sourceSetVersion: 5, sourceId: payload.selections[0].sourceId, sourceVersionId: payload.selections[0].sourceVersionId }] });
});

test('wrong tenant/current case or substituted selected source fails before receipt claim', async () => {
  for (const substitute of ['case', 'source'] as const) {
    await assert.rejects(deriveTranscriptCommandRequestBinding(authority, envelope, { findOne: async <T>(table: string) => {
      if (table === 'assess_v2_cases') return (substitute === 'case' ? null : { id: payload.caseId, version: 3, head_version_id: id(12), schema_version: 'assess-v2-schema-2026-07', status: 'draft' }) as T | null;
      if (table === 'enterprise_module_input_bundle_versions') return { id: payload.inputBundleVersionId, input_bundle_id: payload.inputBundleId, version: 2, bundle_hash: 'a'.repeat(64) } as T;
      if (table === 'enterprise_source_set_versions') return { id: payload.selections[0].sourceSetVersionId, source_set_id: payload.selections[0].sourceSetId, version: 5 } as T;
      if (table === 'enterprise_module_input_bundle_items') return { source_set_version_id: payload.selections[0].sourceSetVersionId } as T;
      if (table === 'enterprise_source_set_version_items') return { source_id: substitute === 'source' ? id(99) : payload.selections[0].sourceId } as T;
      return null;
    } }), (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'RESOURCE_STALE');
  }
});

test('the real handler rejects a same-organization foreign-workspace case before receipt claim', async () => {
  let receiptClaims = 0;
  const response = await handleEnterpriseIntelligenceRequest(new Request('http://local.test/enterprise-intelligence-command', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope),
  }), {
    authenticate: async () => ({ id: authority.actorId }) as never,
    resolveOrganization: async () => authority.organizationId,
    resolveCommandAuthority: async () => authority,
    assertCurrentAuthority: async () => authority,
    transcriptCommandRequestBindingDependencies: { findOne: async <T>(table: string, query: string) => {
      if (table !== 'assess_v2_cases') return null;
      assert.match(query, new RegExp(`org_id=eq\\.${authority.organizationId}`));
      assert.match(query, new RegExp(`workspace_id=eq\\.${authority.workspaceId}`));
      const foreignWorkspaceRow = { id: payload.caseId, org_id: authority.organizationId, workspace_id: id(90), version: 3,
        head_version_id: id(12), schema_version: 'assess-v2-schema-2026-07', status: 'draft' };
      return (query.includes(`workspace_id=eq.${foreignWorkspaceRow.workspace_id}`) ? foreignWorkspaceRow : null) as T | null;
    } },
    claimReceipt: async () => { receiptClaims += 1; throw new Error('receipt must not be claimed'); },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as any).error.code, 'RESOURCE_STALE');
  assert.equal(receiptClaims, 0);
});

test('the real handler rejects a same-organization foreign-workspace selected source before receipt claim', async () => {
  let receiptClaims = 0;
  const rows: Record<string, Record<string, unknown>> = {
    assess_v2_cases: { id: payload.caseId, version: 3, head_version_id: id(12), schema_version: 'assess-v2-schema-2026-07', status: 'draft' },
    enterprise_module_input_bundle_versions: { id: payload.inputBundleVersionId, input_bundle_id: payload.inputBundleId, version: 2, bundle_hash: 'a'.repeat(64) },
    enterprise_source_set_versions: { id: payload.selections[0].sourceSetVersionId, source_set_id: payload.selections[0].sourceSetId, version: 5 },
    enterprise_module_input_bundle_items: { source_set_version_id: payload.selections[0].sourceSetVersionId },
    enterprise_source_set_version_items: { source_id: payload.selections[0].sourceId, workspace_id: id(90) },
  };
  const response = await handleEnterpriseIntelligenceRequest(new Request('http://local.test/enterprise-intelligence-command', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(envelope),
  }), {
    authenticate: async () => ({ id: authority.actorId }) as never,
    resolveOrganization: async () => authority.organizationId,
    resolveCommandAuthority: async () => authority,
    assertCurrentAuthority: async () => authority,
    transcriptCommandRequestBindingDependencies: { findOne: async <T>(table: string, query: string) => {
      assert.match(query, new RegExp(`org_id=eq\\.${authority.organizationId}`));
      assert.match(query, new RegExp(`workspace_id=eq\\.${authority.workspaceId}`));
      if (table === 'enterprise_source_set_version_items') return null;
      return (rows[table] ?? null) as T | null;
    } },
    claimReceipt: async () => { receiptClaims += 1; throw new Error('receipt must not be claimed'); },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json() as any).error.code, 'RESOURCE_STALE');
  assert.equal(receiptClaims, 0);
});

test('preview manifest parser binds every displayed item and resolution field exactly', () => {
  const manifest = { previewBatchId: id(30), manifestVersion: 2, catalogId: id(31), catalogHash: 'a'.repeat(64), caseId: id(32), caseVersion: 4,
    inputBundleId: id(33), inputBundleVersionId: id(34), targetCount: 8, sourceCount: 2, itemCount: 3, reviewedCount: 3,
    conflictCount: 1, unresolvedConflictCount: 0, itemSetHash: 'b'.repeat(64), conflictSetHash: 'c'.repeat(64), resolutionSetHash: 'e'.repeat(64), displayedSetHash: 'd'.repeat(64) };
  assert.deepEqual(requireAssessMappingPreviewManifest(manifest), manifest);
  assert.throws(() => requireAssessMappingPreviewManifest({ ...manifest, displayedSetHash: 'bad' }), /INVALID_PAYLOAD/);
  assert.throws(() => requireAssessMappingPreviewManifest({ ...manifest, unbound: true }), /INVALID_PAYLOAD/);
});

test('terminal resource identities are bound per mapping operation', () => {
  assert.equal(resolveEnterpriseCommandResourceId('assess.document-map.analyze', { resourceId: id(20), runId: id(20) }), id(20));
  assert.equal(resolveEnterpriseCommandResourceId('assess.document-map.proposal.review', { resourceId: id(21), proposalId: id(21) }), id(21));
  assert.equal(resolveEnterpriseCommandResourceId('assess.document-map.preview', { resourceId: id(22), previewBatchId: id(22) }), id(22));
  assert.equal(resolveEnterpriseCommandResourceId('assess.document-map.conflict.resolve', { resourceId: id(23), conflictId: id(23) }), id(23));
  assert.equal(resolveEnterpriseCommandResourceId('assess.document-map.commit', { resourceId: id(24), caseId: id(24) }), id(24));
  assert.throws(() => resolveEnterpriseCommandResourceId('assess.document-map.commit', { resourceId: id(24), caseId: id(25) }), /RESOURCE_STALE/);
});

test('mapping source decoding is deliberately sequential rather than twenty-way fanout', async () => {
  let active = 0; let maximum = 0;
  const result = await mapAssessMappingSelectionsSequentially([1, 2, 3], async value => {
    active += 1; maximum = Math.max(maximum, active);
    await Promise.resolve(); active -= 1; return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6]); assert.equal(maximum, 1);
});

test('mapping database signals become bounded product errors without leaking database text', () => {
  const signal = (databaseMessage: string) => new SupabaseRpcError({ status: 409, databaseMessage });
  assert.equal(mapEnterpriseCommandRpcError(signal('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_FEATURE_DISABLED')).code, 'COMMAND_BLOCKED');
  assert.equal(mapEnterpriseCommandRpcError(signal('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_PROVIDER_INPUT_TOO_LARGE')).code, 'SOURCE_TOO_LARGE');
  assert.equal(mapEnterpriseCommandRpcError(signal('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_COMMIT_STALE')).code, 'RESOURCE_STALE');
  assert.equal(mapEnterpriseCommandRpcError(signal('ENTERPRISE_ASSESS_DOCUMENT_MAPPING_NATIVE_SHAPE_INVALID')).code, 'INVALID_PAYLOAD');
  assert.equal(mapEnterpriseCommandRpcError(signal('server leaked an unexpected mapping table name')).code, 'COMMAND_UNAVAILABLE');
});

test('terminal pre-provider mapping failures replay as the original bounded product disposition', () => {
  assert.equal(assessMappingTerminalError('BUDGET_EXHAUSTED')?.code, 'BUDGET_EXHAUSTED');
  assert.equal(assessMappingTerminalError('PROMPT_TOO_LARGE')?.code, 'SOURCE_TOO_LARGE');
  for (const code of ['PROVIDER_UNSUPPORTED', 'SECRET_REFERENCE_UNSAFE', 'SECRET_UNAVAILABLE', 'ENDPOINT_UNSAFE', 'CAPABILITY_UNAVAILABLE']) {
    assert.equal(assessMappingTerminalError(code)?.code, 'COMMAND_UNAVAILABLE');
  }
  assert.equal(assessMappingTerminalError('PROVIDER_TIMEOUT'), null, 'effect-uncertain provider failures must never become terminal runs');
});
