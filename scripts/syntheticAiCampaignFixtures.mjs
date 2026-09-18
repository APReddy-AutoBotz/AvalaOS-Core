import { createHash } from 'node:crypto';
export const fixtureId = n => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fixtureOrg = '11111111-1111-4111-8111-111111111111';
const digest = value => createHash('sha256').update(value).digest('hex');
export const meetingText = 'Synthetic meeting transcript. Process description: Review invoice exceptions against purchase orders. The AP analyst investigates mismatches. A finance manager approves amounts above USD 5000. Payment execution is outside scope.';
export function assessFixture() {
  const source = { sourceId: fixtureId(3), sourceVersionId: fixtureId(4), extractionBindingId: fixtureId(5), extractionJobId: fixtureId(6), parserVersion: 'text-v1', normalizedHash: digest(meetingText), text: meetingText, extractedByteCount: Buffer.byteLength(meetingText), sheetCount: 0, cellCount: 0, warnings: [] };
  const target = { selectorId: fixtureId(1), catalogId: fixtureId(2), caseId: fixtureId(7), caseVersion: 1, assessSchemaVersion: 'assess-v2-schema-2026-07', targetKind: 'case_field', operation: 'set_field', fieldId: 'case.description', label: 'Process description', contextLabel: 'Synthetic AP process', valueType: 'text', currentValue: '', currentValueHash: digest('""'), manual: false };
  return { source, target };
}
/** Synthetic committed-row fixtures passed THROUGH the actual production loader; no live DB. */
export async function studioFixture(loadMaterial, model, artifactType = 'pdd') {
  const definitions = {
    pdd: ['summary', 'process', 'roles', 'controls', 'exceptions'],
    brd: ['summary', 'objectives', 'scope', 'requirements', 'risks'],
    frd: ['summary', 'functionalRequirements', 'rules', 'interfaces', 'acceptanceCriteria'],
  };
  if (!definitions[artifactType]) throw new Error('SYNTHETIC_FIXTURE_TYPE_INVALID');
  const facts = [
    ['description', 'Review invoice exceptions against purchase orders.'],
    ['roles', 'The AP analyst investigates mismatches. A finance manager approves amounts above USD 5000.'],
    ['process', 'Receive invoice; compare it to the purchase order; investigate mismatches; route the exception for human approval.'],
    ['controls', 'Amounts above USD 5000 require finance manager approval. Keep an audit record of every exception decision.'],
    ['exceptions', 'If the purchase order is missing, the AP analyst requests it from procurement. No payment may be executed by this workflow.'],
    ['scope', 'Payment execution is outside scope. The objective is traceable invoice exception review. Interfaces and numeric service targets are not specified.'],
  ];
  const candidates = facts.map(([field, value], i) => ({ id: fixtureId(100+i), source_id: fixtureId(3), source_version_id: fixtureId(4), ai_job_id: fixtureId(6), version: 1,
    provenance_hash: digest(`provenance-${i}`), field_key: field, value, source_locator: `text:fact-${i}`, excerpt_hash: digest(value), suggestion_status: 'accepted', reviewed_by: fixtureId(50), reviewed_at: '2026-09-17T00:00:00.000Z' }));
  const anchors = candidates.map(c => ({ sourceVersionId: c.source_version_id, locator: c.source_locator, anchorHash: c.excerpt_hash }));
  const manifest = candidates.map(c => ({ candidateId: c.id, candidateVersion: c.version, candidateProvenanceHash: c.provenance_hash, anchorHash: c.excerpt_hash, sourceId: c.source_id, sourceVersionId: c.source_version_id, extractionJobId: c.ai_job_id, fieldKey: c.field_key, locator: c.source_locator }));
  const plan = { organizationId: fixtureOrg, workspaceId: fixtureId(11), actorId: fixtureId(12), artifactId: fixtureId(21), sourcePackageId: fixtureId(22), sourcePackageHash: digest('synthetic-package'), sourcePackageVersion: 1,
    templateKind: 'system', templateVersionId: fixtureId(23), templateVersion: `system-${artifactType}-1`, templateHash: digest(`template-${artifactType}`),
    provider: 'openai', providerRouteId: fixtureId(8), providerConfigId: fixtureId(9), model, requestId: fixtureId(24),
    anchorManifestHash: digest(JSON.stringify(anchors)), anchorCount: anchors.length, candidateManifestHash: digest(JSON.stringify(manifest)) };
  const tables = {
    studio_artifact_source_packages: [{ id: plan.sourcePackageId, artifact_id: plan.artifactId, org_id: fixtureOrg, workspace_id: plan.workspaceId, version: 1, source_mode: 'direct_transcript_bundle', assess_handoff_id: null, studio_input_bundle_version_id: fixtureId(25), manual_brief_hash: null, package_hash: plan.sourcePackageHash,
      candidate_manifest: manifest, candidate_manifest_hash: plan.candidateManifestHash, candidate_count: candidates.length, anchor_manifest: anchors, anchor_manifest_hash: plan.anchorManifestHash, anchor_count: anchors.length }],
    enterprise_module_input_bundle_items: [{ source_set_version_id: fixtureId(26), ordinal: 1 }],
    enterprise_source_set_version_items: [{ source_version_id: fixtureId(4), ordinal: 1, source_set_version_id: fixtureId(26), semantic_role: 'primary' }],
    enterprise_evidence_candidates: candidates,
    studio_system_template_versions: [{ id: plan.templateVersionId, template_version: plan.templateVersion, provider_instructions: { artifactType, sections: definitions[artifactType] }, template_hash: plan.templateHash }],
    ai_provider_configs: [{ id: fixtureId(9), provider: 'openai', key_ref_id: fixtureId(10), model_allowlist: [model], status: 'active', endpoint_url: null, deployment_name: null }],
  };
  const seen = [];
  const material = await loadMaterial(plan, async query => { const table = query.split('?')[0]; if (!tables[table]) throw new Error('SYNTHETIC_FIXTURE_QUERY_REJECTED'); seen.push(table); return structuredClone(tables[table]); }, async () => { throw new Error('SYNTHETIC_FIXTURE_RPC_REJECTED'); });
  if (seen.length !== 6 || Object.keys(material.sourcePackage).sort().join(',') !== 'acceptedFacts,assessPackage,contractVersion,selectedSourceVersionIds,sourceAnchors,sourceMode') throw new Error('SYNTHETIC_FIXTURE_MATERIAL_MISMATCH');
  return material;
}
