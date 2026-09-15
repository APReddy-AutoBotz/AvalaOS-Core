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
const adminJourney = campaignSource.match(/const visitActualAdminWorkbench = async\(page:Page,visited:Set<string>\) => \{([\s\S]*?)\n\};/u)?.[1] ?? '';
const adminProof = /name:'Admin',exact:true[\s\S]*adminStarted=Date\.now\(\)[\s\S]*admin\.click\(\)[\s\S]*Admin Workbench[\s\S]*assertSurface\(page,adminStarted\)[\s\S]*Users \/ Roles Users[\s\S]*usersStarted=Date\.now\(\)[\s\S]*users\.click\(\)[\s\S]*Users \/ Roles[\s\S]*assertSurface\(page,usersStarted\)/u;
assert.match(adminJourney, adminProof, 'campaign Admin path must visit the current Workbench and Users / Roles');
for (const missing of ["name:'Admin',exact:true", 'admin.click()', 'Admin Workbench', 'Users / Roles', 'users.click()', 'assertSurface(page,adminStarted)', 'assertSurface(page,usersStarted)']) {
  assert.doesNotMatch(adminJourney.replaceAll(missing, ''), adminProof, `campaign must reject missing ${missing}`);
}
const deniedJourney = campaignSource.match(/const assertDeniedAssessIntelligence = async\(page:Page\) => \{([\s\S]*?)\n\};/u)?.[1] ?? '';
const deniedProof = /selectScope\(page,'My Work'\)[\s\S]*name:'Assess',exact:true[\s\S]*process-catalog-view[\s\S]*name:'Enterprise Intelligence',exact:true[\s\S]*toBeEnabled\(\)[\s\S]*intelligence\.click\(\)[\s\S]*Enterprise Intelligence unavailable[\s\S]*server-authorized workspace[\s\S]*enterprise-intelligence-workspace[\s\S]*toHaveCount\(0\)[\s\S]*assertSurface\(page,started\)/u;
assert.match(deniedJourney, deniedProof, 'campaign denied route must use real Assess subnavigation and prove the missing authorized workspace');
for (const missing of ["name:'Assess',exact:true", "name:'Enterprise Intelligence',exact:true", 'Enterprise Intelligence unavailable', 'server-authorized workspace', "getByTestId('enterprise-intelligence-workspace')", 'assertSurface(page,started)']) {
  assert.doesNotMatch(deniedJourney.replaceAll(missing, ''), deniedProof, `campaign must reject missing ${missing}`);
}
assert.match(campaignSource, /if\(label==='Platform Admin'\)await visitActualAdminWorkbench\(page,visited\);\s*if\(label==='Platform Admin'\)await assertDeniedAssessIntelligence\(page\);/u, 'Platform Admin must explicitly test the denied route after Workbench traversal');
assert.match(campaignSource, /await visitGroup\(page,'Assess',assessSubnav,visited\)/u, 'all personas must preserve skip-if-unauthorized traversal semantics');
assert.match(campaignSource, /await page\.goto\('\/sandbox\?view=enterprise_intelligence&scope=organization'[\s\S]*Enterprise Intelligence',exact:true[\s\S]*toHaveCount\(0\)[\s\S]*name:'Admin',exact:true[\s\S]*toHaveCount\(0\)/u, 'non-Admin deep-link denial must remain distinct from accepted sandbox descendants');
assert.doesNotMatch(campaignSource, /Admin \/ Intelligence/u);

console.log('Full-platform browser campaign contract regression passed.');
