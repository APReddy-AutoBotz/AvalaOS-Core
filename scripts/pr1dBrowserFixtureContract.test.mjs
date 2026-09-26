import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertPr1dBrowserFixture, PR1D_FIXTURE_SCENARIOS } from './pr1dBrowserFixtureContract.mjs';

const sources = {
  spec: readFileSync('tests/browser/pr1d.spec.ts', 'utf8'),
  fixture: readFileSync('tests/browser/pr1dNetworkFixture.ts', 'utf8'),
  capabilities: readFileSync('services/assessV2/capabilities.ts', 'utf8'),
};
test('retained browser scenarios bind the extracted fixture and canonical draft-write capability', () => {
  assert.equal(assertPr1dBrowserFixture(sources), true);
});
const mutations = {
  'missing fixture': value => ({ ...value, fixture: undefined }),
  'removed capability with token only in spec': value => ({ ...value,
    fixture: value.fixture.replace('ASSESS_V2_CAPABILITIES.draftWrite,', ''),
    spec: value.spec + '\n// ASSESS_V2_CAPABILITIES.draftWrite\n' }),
  'comment-only capability': value => ({ ...value, fixture: value.fixture.replace('ASSESS_V2_CAPABILITIES.draftWrite,', '/* ASSESS_V2_CAPABILITIES.draftWrite, */') }),
  'substituted canonical import': value => ({ ...value, fixture: value.fixture.replace("from '../../services/assessV2/capabilities'", "from './fakeCapabilities'") }),
  'disconnected capability default': value => ({ ...value, fixture: value.fixture.replace('options.capabilities ?? ALL_CAPABILITIES', 'options.capabilities ?? []') }),
  'substituted fixture import': value => ({ ...value, spec: value.spec.replace("from './pr1dNetworkFixture'", "from './differentFixture'") }),
  'type-only fixture import': value => ({ ...value, spec: value.spec.replace('import { ALL_CAPABILITIES,', 'import type { ALL_CAPABILITIES,') }),
  'comment-only fixture import': value => ({ ...value, spec: value.spec.replace('import { ALL_CAPABILITIES,', '// import { ALL_CAPABILITIES,') }),
  'shadowed installer': value => ({ ...value, spec: value.spec.replaceAll("const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });", "const installEnterpriseFixture = async () => ({}); const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });") }),
  'missing awaited installation': value => ({ ...value, spec: value.spec.replaceAll('await installEnterpriseFixture(', 'installEnterpriseFixture(') }),
  'skipped retained assertion': value => ({ ...value, spec: value.spec.replace(`test('${PR1D_FIXTURE_SCENARIOS[0]}'`, `test.skip('${PR1D_FIXTURE_SCENARIOS[0]}'`) }),
  'obsolete capability in fixture': value => ({ ...value, fixture: value.fixture + "\nconst old = 'assess.v2.write';" }),
  'obsolete capability in spec': value => ({ ...value, spec: value.spec + "\nconst old = 'assess.v2.write';" }),
};
for (const [name, mutate] of Object.entries(mutations)) test(`rejects ${name}`, () => {
  assert.throws(() => assertPr1dBrowserFixture(mutate(sources)), /PR1D_BROWSER_FIXTURE_INVALID/);
});
