import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  classifyPublicRoute,
  parseAuthorityOrigins,
  parseFullPlatformBaseUrl,
  parseFullPlatformExecutionMode,
  parseFullPlatformRunId,
  validateFullPlatformServerPreflight,
} from './fullPlatformContract';

assert.equal(parseFullPlatformExecutionMode(undefined), 'fixture');
assert.equal(parseFullPlatformExecutionMode('connected'), 'connected');
assert.throws(() => parseFullPlatformExecutionMode('hosted'), /fixture or connected/u);
assert.equal(parseFullPlatformRunId('qa-20260824.1'), 'qa-20260824.1');
assert.throws(() => parseFullPlatformRunId('../escape'), /sanitized/u);
assert.equal(parseFullPlatformBaseUrl(undefined), 'http://127.0.0.1:4173');
assert.equal(parseFullPlatformBaseUrl('https://preview.example.test/'), 'https://preview.example.test');
assert.throws(() => parseFullPlatformBaseUrl('https://user:secret@example.test'), /credentials/u);
assert.throws(() => parseFullPlatformBaseUrl('https://example.test/nested'), /origin/u);
assert.deepEqual(parseAuthorityOrigins('http://127.0.0.1:54321, http://127.0.0.1:54321'), ['http://127.0.0.1:54321']);
assert.throws(() => parseAuthorityOrigins('https://secret@example.test'), /credential-free/u);

const preflight = {
  schemaVersion: 'avalaos-full-platform-preflight-v1',
  status: 'ready',
  environment: 'local_nonproduction',
  dataAccess: 'server',
  syntheticData: true,
  organizationId: 'synthetic-org',
  workspaceId: 'synthetic-workspace',
} as const;
assert.deepEqual(validateFullPlatformServerPreflight({
  payload: preflight,
  expectedOrganizationId: 'synthetic-org',
  expectedWorkspaceId: 'synthetic-workspace',
}), preflight);
for (const payload of [
  { ...preflight, dataAccess: 'local' },
  { ...preflight, syntheticData: false },
  { ...preflight, organizationId: 'foreign-org' },
  { ...preflight, workspaceId: 'stale-workspace' },
  { ...preflight, status: 'starting' },
]) {
  assert.throws(() => validateFullPlatformServerPreflight({
    payload,
    expectedOrganizationId: 'synthetic-org',
    expectedWorkspaceId: 'synthetic-workspace',
  }), /PREFLIGHT_MISMATCH/u);
}
assert.throws(() => validateFullPlatformServerPreflight({
  payload: preflight,
  expectedOrganizationId: undefined,
  expectedWorkspaceId: 'synthetic-workspace',
}), /EXPECTED_ORGANIZATION_ID/u);

assert.equal(classifyPublicRoute('/sandbox'), 'sandbox');
assert.equal(classifyPublicRoute('/sandbox/unexpected-deep-link'), 'sandbox');
assert.equal(classifyPublicRoute('/sign-in'), 'server-sign-in');
assert.equal(classifyPublicRoute('/admin'), 'outside-sandbox');

const campaignSource = readFileSync('tests/browser/fullPlatformCampaign.spec.ts', 'utf8');
assert.match(campaignSource, /const closeNavigation = async\(page:Page\) => \{[\s\S]*Close primary navigation[\s\S]*await close\.click\(\)/u);
assert.match(campaignSource, /const selectScope = async\(page:Page, label:string\) => \{\s*await closeNavigation\(page\);[\s\S]*Switch workspace context/u);
assert.match(campaignSource, /await button\.click\(\);[\s\S]*toHaveAttribute\('aria-current','page'\);[\s\S]*await closeNavigation\(page\);\s*await assertSurface/u);

console.log('Full-platform browser campaign contract regression passed.');
