import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSyntheticAiModules } from './loadSyntheticAiModules.mjs';
import { assessFixture, studioFixture } from './syntheticAiCampaignFixtures.mjs';
import { POLICY } from './syntheticAiCampaignBudget.mjs';
const api = await loadSyntheticAiModules();

test('all document fixtures use the production loader and canonical template IDs', async () => {
  for (const kind of ['pdd', 'brd', 'frd']) {
    const material = await studioFixture(api.loadStudioGenerationMaterial, POLICY.model, kind);
    assert.equal(material.sourcePackage.acceptedFacts.length, 6);
    assert.equal(material.sourceAnchors.length, 6);
    assert.equal(material.selectedSourceVersionIds.length, 1);
    assert.equal(api.normalizeStudioArtifactTemplate(material.templatePayload).artifactType, kind);
  }
});

test('actual material loader rejects substituted candidate provenance', async () => {
  const substituted = (plan, read, invoke) => api.loadStudioGenerationMaterial(plan, async query => {
    const rows = await read(query);
    if (query.startsWith('enterprise_evidence_candidates?')) rows[0].provenance_hash = '0'.repeat(64);
    return rows;
  }, invoke);
  await assert.rejects(studioFixture(substituted, POLICY.model));
});

test('Assess fixture contains explicit grounded text without score targets', () => {
  const { source, target } = assessFixture();
  assert.equal(target.fieldId, 'case.description');
  assert.ok(source.text.includes('Review invoice exceptions against purchase orders.'));
  assert.equal(target.currentValue, '');
});
