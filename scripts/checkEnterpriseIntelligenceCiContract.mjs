import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const workflow = read('.github/workflows/enterprise-intelligence.yml');
const config = read('playwright.enterprise-intelligence.config.ts');
const spec = read('tests/browser/enterpriseIntelligence.spec.ts');
const networkFixture = read('tests/browser/enterpriseIntelligenceNetworkFixture.ts');
const browserContract = `${spec}\n${networkFixture}`;
const sanitizer = read('scripts/runEnterpriseIntelligenceCiCheck.mjs');
const packageJson = JSON.parse(read('package.json'));

for (const required of [
  'permissions:', 'contents: read', 'postgres:16', 'test:migrations:enterprise-intelligence:postgres',
  'STUDIO_ARTIFACT_MIGRATION_DATABASE_URL', 'ENTERPRISE_INTELLIGENCE_MIGRATION_DATABASE_URL',
  'enterprise-intelligence-mocked-provider', 'test:enterprise-intelligence-provider',
  'ci:enterprise-intelligence:source', 'test:browser:enterprise-intelligence',
  'scripts/runEnterpriseIntelligenceCiCheck.mjs', '.agent/enterprise-intelligence-ci/',
]) assert.ok(workflow.includes(required), `Enterprise workflow is missing ${required}`);

assert.match(
  packageJson.scripts['test:migrations:enterprise-intelligence:postgres'],
  /scripts\/testEnterpriseIntelligencePostgres\.mjs/,
  'Enterprise PostgreSQL command must execute the feature-owned PostgreSQL harness',
);
assert.equal(
  (workflow.match(/^  enterprise-intelligence-[a-z0-9-]+:$/gm) || []).length,
  4,
  'Enterprise workflow must retain distinct source, PostgreSQL, mocked-provider, and browser jobs',
);

assert.doesNotMatch(workflow, /\b(?:deploy|supabase\s+(?:link|db\s+push|functions\s+deploy)|vault|curl\s+https?:)\b/i);
assert.doesNotMatch(workflow, /(?:SUPABASE_ACCESS_TOKEN|SERVICE_ROLE|PROVIDER_KEY|VAULT_TOKEN)/i);
for (const artifactPath of workflow.matchAll(/^\s+path:\s*(.+)$/gm)) {
  assert.match(artifactPath[1], /^\.agent\/enterprise-intelligence-ci\/[a-z0-9*._/-]+$/i, 'only sanitized CI logs may be uploaded');
}

for (const required of ["devices['Desktop Chrome']", "devices['Pixel 7']", "trace: 'off'", "screenshot: 'off'", "video: 'off'"]) {
  assert.ok(config.includes(required), `Enterprise Playwright config is missing ${required}`);
}
for (const required of [
  "getByTestId('enterprise-intelligence-workspace')", "name: 'Reload committed state'", 'AxeBuilder',
  'AUTHORIZATION_STALE', 'TENANT_ACCESS_DENIED', 'ENTERPRISE_PROJECTION_UNAVAILABLE',
  'providerUnavailable', 'noByok', 'evidence.assess.promote', 'studio.delivery.handoff',
  'monitor.baseline.create', 'assemble.blueprint.create', 'comma[- ]separated',
]) assert.ok(browserContract.includes(required), `Enterprise browser contract is missing ${required}`);

for (const required of ['sanitized-url', 'sanitized-id', 'sanitized-digest', 'sanitized-encoded-value', "mode: 0o600"]) {
  assert.ok(sanitizer.includes(required), `Enterprise CI sanitizer is missing ${required}`);
}

console.log('Enterprise Intelligence CI/browser contract passed: no deploy path, sanitized evidence only, PostgreSQL 16 plus desktop/mobile fail-closed gates.');
