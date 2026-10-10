import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./assessV2Client.ts', import.meta.url), 'utf8');
const projectionSource = source.match(/export const projectImmutableCloneEvidence = \([\s\S]*?^};/m)?.[0];
const headSource = source.match(/export const shouldReadAssessV2DraftHead = \([\s\S]*?;\r?$/m)?.[0];
const transportSource = source.match(/export const createAssessV2DefaultTransport = \([\s\S]*?^\}\);/m)?.[0];
assert.ok(projectionSource && headSource && transportSource, 'Assess V2 read transport must remain directly executable');
const compiled = ts.transpileModule([projectionSource, headSource, transportSource].join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', 'isEnterpriseObject', 'EnterpriseBoundaryError', 'readEnterpriseErrorCode', compiled)(
  module.exports,
  module,
  value => value !== null && typeof value === 'object' && !Array.isArray(value),
  class EnterpriseBoundaryError extends Error {},
  () => 'COMMAND_UNAVAILABLE',
);
const createTransport = module.exports.createAssessV2DefaultTransport;

const caseId = 'a1000000-0000-4000-8000-000000000022';
const historicalDecision = {
  id: 'a1000000-0000-4000-8000-000000000023', case_id: caseId, source_version_id: 'version-1',
  schema_version: 'schema-v1', rule_set_version: 'rules-v1', decision_version: 'decision-v1',
  validation_status: 'valid', input_snapshot: { version: 2 }, evidence_snapshot: [], output_snapshot: {},
  input_hash: 'input', evidence_hash: 'evidence', output_hash: 'output', input_canonical: '{}',
  evidence_canonical: '[]', output_canonical: '{}', supersedes_decision_id: null,
  created_by: 'author', created_at: '2026-10-09T00:00:00.000Z',
};

const fakeClient = currentCase => {
  const calls = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; calls.push(this); }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    is(key, value) { this.filters.push([key, value]); return this; }
    neq(key, value) { this.filters.push([key, value]); return this; }
    order() { return this; }
    limit() { return this; }
    value(single) {
      if (this.table === 'assess_v2_cases') return single ? currentCase : [currentCase];
      if (this.table === 'assess_v2_decision_versions') return single ? historicalDecision : [historicalDecision];
      if (this.table === 'assess_v2_case_versions') {
        const id = this.filters.find(([key]) => key === 'id')?.[1];
        if (id === 'version-2') return single ? { name: 'Revised lifecycle', description: 'Editable current revision', agent_necessity: {}, imported_facts: [] } : [];
        if (id === 'version-1') return single ? { name: 'Historical decision', description: 'Immutable approved version' } : [];
      }
      return [];
    }
    async maybeSingle() { return { data: this.value(true), error: null }; }
    then(resolve, reject) { return Promise.resolve({ data: this.value(false), error: null }).then(resolve, reject); }
  }
  return { client: { functions: { invoke: async () => ({ data: null, error: null }) }, from: table => new Query(table) }, calls };
};

test('default read transport returns the current editable revision instead of its historical decision', async () => {
  const currentCase = {
    id: caseId, org_id: 'org', workspace_id: 'workspace', process_id: 'process', owner_id: 'author',
    status: 'draft', version: 6, schema_version: 'schema-v1', rule_set_version: 'rules-v1',
    source_v1_assessment_id: null, source_v1_score_version: null,
    created_at: '2026-10-09T00:00:00.000Z', updated_at: '2026-10-09T01:00:00.000Z', head_version_id: 'version-2',
  };
  const { client, calls } = fakeClient(currentCase);
  const result = await createTransport(client).readCase(caseId);
  assert.equal(result.decision_snapshot, null);
  assert.equal(result.case_snapshot.status, 'draft');
  assert.equal(result.case_snapshot.version, 6);
  assert.equal(result.name, 'Revised lifecycle');
  assert.equal(result.description, 'Editable current revision');
  const childTables = new Set(['assess_v2_primitives', 'assess_v2_edges', 'assess_v2_decision_points', 'assess_v2_exception_paths', 'assess_v2_application_assets', 'assess_v2_application_interactions', 'assess_v2_evidence_links']);
  for (const call of calls.filter(call => childTables.has(call.table))) {
    assert.deepEqual(call.filters, [['version_id', 'version-2']], `${call.table} must read only the current draft head`);
  }
  assert.equal(calls.some(call => call.table === 'assess_v2_case_versions' && call.filters.some(([, value]) => value === 'version-1')), false);
});

test('default read transport preserves the immutable decision when it is still the current head', async () => {
  const currentCase = {
    id: caseId, org_id: 'org', workspace_id: 'workspace', process_id: 'process', owner_id: 'author',
    status: 'approved', version: 5, schema_version: 'schema-v1', rule_set_version: 'rules-v1',
    source_v1_assessment_id: null, source_v1_score_version: null,
    created_at: '2026-10-09T00:00:00.000Z', updated_at: '2026-10-09T01:00:00.000Z', head_version_id: 'version-1',
  };
  const { client } = fakeClient(currentCase);
  const result = await createTransport(client).readCase(caseId);
  assert.equal(result.decision_snapshot.id, historicalDecision.id);
  assert.equal(result.case_snapshot.version, 2);
  assert.equal(result.name, 'Historical decision');
});
