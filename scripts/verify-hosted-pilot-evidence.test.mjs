import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { REQUIRED_GATES, safeHash, validateHostedUrl, validateResolvedHostedUrl, verifyActivationRun, verifyManifest } from './verify-hosted-pilot-evidence.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
const head = 'a'.repeat(40), canonicalMigrationDigest = 'c'.repeat(64);
const scope={organizationId:'11111111-1111-4111-8111-111111111111',workspaceId:'22222222-2222-4222-8222-222222222222',exerciseRunId:'33333333-3333-4333-8333-333333333333'};
const activationRun = { id: '123456789', attempt: '2', workflow: '.github/workflows/hosted-pilot-activation-evidence-producer.yml', repository: 'APReddy-AutoBotz/AvalaOS-Core', event: 'workflow_dispatch', head, conclusion: 'success' };
const evidence = Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, { result: 'passed', gitCommit: head, workflowRunId: activationRun.id, workflowRunAttempt: 2, workflowPath: activationRun.workflow, workflowConclusion: 'success', environment: 'hosted_nonproduction_pilot', targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), ...scope, resultId: `${gate}:1` }]));
const manifest = { schemaVersion: 1, gitCommit: head, environment: 'hosted_nonproduction_pilot', hostedNonproductionVerified: true, productionAuthorized: false, liveActivationAuthorized: false, customerDataAuthorized: false, customerDataUsed: false, externalUsersAuthorized: false, externalUsersUsed: false, realProviderCallsAuthorized: false, realProviderCallsUsed: false, targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), migrationChainHash: `sha256:${canonicalMigrationDigest}`, deploymentId: 'deploy-1', workflowRunId: activationRun.id, workflowRunAttempt: 2, workflowPath: activationRun.workflow, workflowRepository: activationRun.repository, workflowEvent: activationRun.event, workflowConclusion: activationRun.conclusion, ...scope, evidence };
const context = { expectedHead: head, actualHead: head, canonicalMigrationDigest, activationRun, expectedDeploymentFingerprint: manifest.deploymentTargetFingerprint, expectedScope:scope };
const assertOrderedTokens = (source, tokens, label) => {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${label}: expected ${JSON.stringify(token)} after prior step`);
    cursor = next;
  }
};
test('accepts exact-head complete hosted evidence bound to the selected activation run', () => assert.equal(verifyManifest(manifest, context), true));
test('fails closed for wrong head, missing gate, production authority, and unsafe URL', () => {
  assert.throws(() => verifyManifest(manifest, { ...context, actualHead: 'b'.repeat(40) }), /exact head/);
  assert.throws(() => verifyManifest({ ...manifest, evidence: {} }, context), /missing/);
  assert.throws(() => verifyManifest({ ...manifest, productionAuthorized: true }, context), /stop state/);
  for (const field of ['liveActivationAuthorized','customerDataAuthorized','customerDataUsed','externalUsersAuthorized','externalUsersUsed','realProviderCallsAuthorized','realProviderCallsUsed']) assert.throws(() => verifyManifest({...manifest,[field]:true},context),/stop state/);
  assert.throws(() => verifyManifest(manifest,{...context,expectedDeploymentFingerprint:safeHash('other-deployment')}),/tested origin/);
  assert.throws(() => verifyManifest({ ...manifest, hostedUrl: 'https://pilot.example.test' }, context), /prohibited/);
  assert.throws(() => validateHostedUrl('http://localhost:3000'), /HTTPS/);
  for (const value of ['https://localhost', 'https://foo.localhost', 'https://127.0.0.2', 'https://127.255.255.254', 'https://127.1', 'https://0177.0.0.1', 'https://0x7f000001', 'https://2130706433', 'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://[::ffff:7f00:1]']) {
    assert.throws(() => validateHostedUrl(value), /public hosted target|non-local/, value);
  }
  for (const value of ['https://0.0.0.0','https://[::]','https://[::ffff:0.0.0.0]']) assert.throws(()=>validateHostedUrl(value),/public hosted target|non-local/);
  for (const value of ['https://10.0.0.1','https://172.16.0.1','https://192.168.1.10','https://169.254.169.254','https://pilot.local']) assert.throws(()=>validateHostedUrl(value),/public hosted target/);
  assert.equal(validateHostedUrl('https://deploy-preview-228--avalaos-pilot.netlify.app'), 'https://deploy-preview-228--avalaos-pilot.netlify.app');
  assert.throws(() => verifyManifest({ ...manifest, migrationChainHash: `sha256:${'0'.repeat(64)}` }, context), /canonical inventory/);
});
test('hosted DNS validation rejects aliases when any A or AAAA result is non-public',async()=>{
  await assert.rejects(validateResolvedHostedUrl('https://pilot.example.test',async()=>[{address:'203.0.113.10'},{address:'10.0.0.8'}]),/non-public/);
  assert.equal(await validateResolvedHostedUrl('https://pilot.example.test',async()=>[{address:'203.0.113.10'}]),'https://pilot.example.test');
});
test('rejects activation artifact and run identity substitution', () => {
  assert.equal(verifyActivationRun(activationRun, head), true);
  for (const changed of [
    { workflowRunId: '987654321' }, { workflowRunAttempt: 1 },
    { workflowPath: '.github/workflows/other.yml' }, { workflowRepository: 'attacker/fork' },
    { workflowEvent: 'push' }, { workflowConclusion: 'failure' },
  ]) assert.throws(() => verifyManifest({ ...manifest, ...changed }, context), /controller-selected activation run/);
  for (const changed of [
    { id: '987654321' }, { attempt: '3' }, { workflow: '.github/workflows/other.yml' },
    { repository: 'attacker/fork' }, { event: 'push' }, { head: 'b'.repeat(40) }, { conclusion: 'failure' },
  ]) assert.throws(() => verifyManifest(manifest, { ...context, activationRun: { ...activationRun, ...changed } }), /activation run|controller-selected/);
  assert.throws(() => verifyActivationRun({ ...activationRun, id: '1; echo unsafe' }, head), /identity/);
  const staleGate = { ...manifest.evidence['database-preflight'], workflowRunAttempt: 1 };
  assert.throws(() => verifyManifest({ ...manifest, evidence: { ...manifest.evidence, 'database-preflight': staleGate } }, context), /database-preflight/);
  for (const changed of [
    { result: 'failed' }, { workflowConclusion: 'cancelled' }, { workflowPath: '.github/workflows/other.yml' },
    { gitCommit: 'b'.repeat(40) }, { targetFingerprint: safeHash('other-target') },
    { deploymentTargetFingerprint: safeHash('other-deployment') }, { resultId: '../foreign' },
  ]) {
    const foreign = { ...manifest.evidence['database-preflight'], ...changed };
    assert.throws(() => verifyManifest({ ...manifest, evidence: { ...manifest.evidence, 'database-preflight': foreign } }, context), /database-preflight/);
  }
});
test('CLI and workflow fail closed unless trusted run metadata is supplied by one exact API lookup', async () => {
  const cli = spawnSync(process.execPath, ['scripts/verify-hosted-pilot-evidence.mjs', '--manifest', 'unused.json', '--expected-head', head], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /--activation-run-id/);
  const workflow = await readFile('.github/workflows/hosted-nonproduction-pilot-activation.yml', 'utf8');
  assert.match(workflow, /actions\.getWorkflowRun/u);
  assert.match(workflow, /run_id: selectedNumber/u);
  assert.match(workflow, /run\.head_sha !== process\.env\.EXPECTED_RELEASE_SHA/u);
  assert.match(workflow, /run\.status !== 'completed' \|\| run\.conclusion !== 'success'/u);
  assert.match(workflow, /workflowPath !== process\.env\.ACTIVATION_WORKFLOW_PATH/u);
  assert.match(workflow, /run\.repository\?\.full_name !== expectedRepository \|\| run\.head_repository\?\.full_name !== expectedRepository/u);
  assert.match(workflow,/hosted-pilot-activation-evidence-producer\.yml/);
  assert.match(workflow,/name: hosted-pilot-activation-manifest/);
  assert.match(workflow,/--expected-deployment-fingerprint/);
  for (const argument of ['activation-run-id', 'activation-run-attempt', 'activation-workflow', 'activation-repository', 'activation-event', 'activation-head', 'activation-conclusion']) assert.match(workflow, new RegExp(`--${argument}`));
});
test('producer workflow executes trusted gates instead of accepting caller-declared result IDs', async () => {
  const producer = await readFile('.github/workflows/hosted-pilot-activation-evidence-producer.yml', 'utf8');
  assert.doesNotMatch(producer, /gate_result_ids_json/i);
  for (const job of ['database-provider','recovery-operations','hosted-browser','accessibility-performance']) assert.match(producer, new RegExp(job));
  assert.match(producer, /id-token: write/);
  assert.match(producer, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(producer, /call_verifier preflight/);
  assert.match(producer, /call_verifier status/);
  assert.match(producer, /call_verifier finalize/);
  assert.doesNotMatch(producer, /HOSTED_PILOT_DATABASE_URL/);
  assert.match(producer, /EXERCISE_RUN_ID/);
  assert.match(producer, /test:recovery:pilot-operations/);
  assert.match(producer, /test:migrations:pilot-operations:postgres/);
  assert.match(producer, /playwright\.hosted-pilot\.config\.ts --workers=1/);
  assert.match(producer, /playwright\.hosted-accessibility-performance\.config\.ts --workers=1/);
  assert.match(producer, /needs: \[database-provider, recovery-operations, hosted-browser, accessibility-performance\]/);
  assert.match(producer, /'accessibility-performance':'accessibility-performance'/);
  assert.doesNotMatch(producer, /'accessibility-performance':'hosted-browser'/);
  assert.match(producer, /name: hosted-accessibility-performance-result-\$\{\{ github\.run_attempt \}\}/);
  assert.match(producer, /missing or mismatched accessibility\/performance assertion artifact/);
  assert.match(producer, /accessibility-performance-artifact:/);
  assert.match(producer, /TRUSTED_GATE_RESULTS_JSON/);
  for(const gate of ['tenant-adversarial','backup-restore','canonical-journey'])
    assert.match(producer,new RegExp(`'${gate}':'database-provider'`));
  assert.doesNotMatch(producer,/'(?:tenant-adversarial|backup-restore|canonical-journey)':'recovery-operations'/);
});
test('hosted accessibility and performance evidence owns executable bounded assertions', async () => {
  const spec = await readFile('tests/browser/hostedAccessibilityPerformance.spec.ts', 'utf8');
  const config = await readFile('playwright.hosted-accessibility-performance.config.ts', 'utf8');
  assert.match(spec, /new AxeBuilder/);
  assert.match(spec, /impact === 'serious' \|\| impact === 'critical'/);
  assert.match(spec, /MAX_NAVIGATION_DURATION_MS/);
  assert.match(spec, /MAX_DOM_CONTENT_LOADED_MS/);
  assert.match(spec, /MAX_RESOURCE_COUNT/);
  assert.match(spec, /complete browser-owned navigation metrics are mandatory/);
  assert.match(config, /validateResolvedHostedUrl\(rawUrl\)/);
  assert.match(config, /hostedAccessibilityPerformance\.spec\.ts/);
  assert.match(config, /Desktop Chrome/);
  assert.match(config, /Pixel 7/);
});
test('exhaustive accessibility evidence scans bounded post-entry persona surfaces', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*for \(const \[label\] of personas\)/u);
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*await enterPersona\(page, label\)/u);
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*observer\.assertSafe\(\)/u);
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*item\.impact === 'serious' \|\| item\.impact === 'critical'/u);
});
test('sandbox network-safety evidence exercises every declared persona', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /case 'network-safety':[\s\S]*for \(const \[label, userName\] of personas\)/u);
  assert.match(spec, /case 'network-safety':[\s\S]*const observer = observeAuthorityRequests\(page\)/u);
  assert.match(spec, /case 'network-safety':[\s\S]*await enterPersona\(page, label\)/u);
  assert.match(spec, /case 'network-safety':[\s\S]*await assertActivePersona\(page, userName\)/u);
  assert.match(spec, /case 'network-safety':[\s\S]*observer\.assertSafe\(\)/u);
});
test('sandbox local-authority evidence exercises every declared persona', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /case 'local-authority':[\s\S]*for \(const \[label, userName\] of personas\)/u);
  assert.match(spec, /case 'local-authority':[\s\S]*const observer = observeAuthorityRequests\(page\)/u);
  assert.match(spec, /case 'local-authority':[\s\S]*await enterPersona\(page, label\)/u);
  assert.match(spec, /case 'local-authority':[\s\S]*observer\.assertSafe\(\)/u);
});
test('every hosted navigation rechecks exact release environment and deployment identity', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /const deployId = process\.env\.NETLIFY_DEPLOY_ID/u);
  assert.match(spec, /const assertHostedResponseIdentity/u);
  assert.match(spec, /x-avalaos-release/u);
  assert.match(spec, /x-avalaos-environment/u);
  assert.match(spec, /x-avalaos-netlify-deploy-id/u);
  assert.ok((spec.match(/assertHostedResponseIdentity\(response\);/gu) ?? []).length >= 6, 'sandbox, sign-in, public, descendant, release identity and reload must each rebind hosted identity');
});
test('server sign-out failures fail closed before logged-out navigation', async () => {
  const adapter = await readFile('services/adapters/authAdapter.ts', 'utf8');
  const provider = await readFile('components/auth/AuthProvider.tsx', 'utf8');
  assert.match(adapter, /const \{ error \} = await supabase\.auth\.signOut\(\);/u);
  assert.match(adapter, /if \(error\) throw error;/u);
  assert.match(provider, /await authAdapter\.signOut\(\);[\s\S]*window\.location\.assign\(target\);/u);
});
test('mobile and desktop persona surfaces are explicit and mobile sign-out is actionable', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  const sidebar = await readFile('components/shared/Sidebar.tsx', 'utf8');
  const header = await readFile('components/shared/Header.tsx', 'utf8');
  assert.match(sidebar, /data-testid="mobile-current-user"/u);
  assert.match(sidebar, /data-testid="mobile-sign-out"/u);
  assert.match(sidebar, /lg:hidden/u);
  assert.match(sidebar, /\{user\.name\}/u);
  assert.match(header, /data-testid="desktop-current-user"/u);
  assert.match(spec, /getByTestId\('mobile-current-user'\)/u);
  assert.match(spec, /getByTestId\('desktop-current-user'\)/u);
  assert.match(spec, /getByTestId\('mobile-sign-out'\)/u);
});
test('external hosted resource allowlists are derived from exact index declarations', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /const indexHtml = fs\.readFileSync\('index\.html', 'utf8'\);/u);
  assert.match(spec, /declaredGoogleStylesheetUrls/u);
  assert.match(spec, /fonts\\\.googleapis\\\.com/u);
  assert.match(spec, /declaredGoogleStylesheetUrls\.has\(url\.toString\(\)\)/u);
  assert.doesNotMatch(spec, /url\.pathname === '\/css2'/u);
  assert.match(spec, /declaredJsDelivrScriptPaths/u);
  assert.match(spec, /cdn\\\.jsdelivr\\\.net/u);
  assert.match(spec, /declaredJsDelivrScriptPaths\.has\(url\.pathname\)/u);
  assert.doesNotMatch(spec, /url\.pathname\.startsWith\('\/npm\/'\)/u);
  assert.match(spec, /importMapMatch/u);
  assert.match(spec, /Object\.values\(importMap\.imports \?\? \{\}\)/u);
  assert.match(spec, /url\.origin === 'https:\/\/aistudiocdn\.com'/u);
  assert.match(spec, /prefix: source\.endsWith\('\/'\)/u);
  assert.match(spec, /isDeclaredAiStudioScript\(url\)/u);
});
test('mobile-safe Admin scenarios prove the Enterprise Intelligence destination directly', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  const adminNavigationStart = spec.indexOf("case 'admin-navigation':");
  const adminNavigationEnd = spec.indexOf("case 'non-admin-denial':");
  const adminCapabilityStart = spec.indexOf("case 'admin-capability-view':");
  const adminCapabilityEnd = spec.indexOf("case 'reload-reconstruction':");
  assert.ok(adminNavigationStart >= 0 && adminNavigationEnd > adminNavigationStart, 'admin-navigation scenario must remain present');
  assert.ok(adminCapabilityStart >= 0 && adminCapabilityEnd > adminCapabilityStart, 'admin-capability-view scenario must remain present');
  for (const scenario of [spec.slice(adminNavigationStart, adminNavigationEnd), spec.slice(adminCapabilityStart, adminCapabilityEnd)]) {
    assert.match(scenario, /await admin\.click\(\);/u);
    assert.doesNotMatch(scenario, /getByTestId\('enterprise-intelligence-view'\)/u);
    assert.match(scenario, /getByRole\('heading', \{ name: 'Enterprise Intelligence', exact: true \}\)/u);
  }
});
test('delivery pack scenarios enter the canonical project scope and open project subnavigation in order', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /const selectProjectScope[\s\S]*Switch workspace context/u);
  const deliveryPackStart = spec.indexOf("case 'delivery-pack':");
  const deliveryPackEnd = spec.indexOf("case 'monitor-lineage':");
  assert.ok(deliveryPackStart >= 0 && deliveryPackEnd > deliveryPackStart, 'delivery-pack scenario must remain present');
  const deliveryPackScenario = spec.slice(deliveryPackStart, deliveryPackEnd);
  assertOrderedTokens(deliveryPackScenario, [
    "await enterPersona(page, 'Delivery Lead')",
    "await selectProjectScope(page, 'AP Invoice Exception Workflow')",
    "await clickProductNav(page, 'Delivery')",
    "await clickProductNav(page, 'Delivery Pack')",
    "AP Invoice Exception Workflow Governed Delivery Pack",
  ], 'delivery-pack navigation');
});
test('reload reconstruction proves a real persisted authenticated project Delivery Pack view in order', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  const reloadStart = spec.indexOf("case 'reload-reconstruction':");
  const reloadEnd = spec.indexOf("case 'horizontal-overflow':");
  assert.ok(reloadStart >= 0 && reloadEnd > reloadStart, 'reload-reconstruction scenario must remain present');
  const reloadScenario = spec.slice(reloadStart, reloadEnd);
  assertOrderedTokens(reloadScenario, [
    "await enterPersona(page, 'Delivery Lead')",
    "await selectProjectScope(page, 'AP Invoice Exception Workflow')",
    "await assertActivePersona(page, 'Alicia Morgan')",
    "await clickProductNav(page, 'Delivery')",
    "await clickProductNav(page, 'Delivery Pack')",
    "AP Invoice Exception Workflow Governed Delivery Pack",
    'await page.reload',
    "await assertActivePersona(page, 'Alicia Morgan')",
    "AP Invoice Exception Workflow Governed Delivery Pack",
    'Choose a sandbox persona',
    'Sign in to an organization.',
  ], 'reload reconstruction');
});

test('deployment verification requires exact release, nonproduction, and deployment identity headers', async () => {
  const deployId = 'b'.repeat(24);
  const fetchImpl = async () => new Response('<div id="root"></div>', { headers: { 'x-avalaos-release': head, 'x-avalaos-environment': 'hosted_nonproduction_pilot', 'x-avalaos-netlify-deploy-id': deployId } });
  const verified = await verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, expectedDeployId: deployId, fetchImpl });
  assert.equal(verified.release, head);
  assert.equal(verified.deployId, deployId);
  await assert.rejects(verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, expectedDeployId: 'c'.repeat(24), fetchImpl }), /mismatch/);
  await assert.rejects(verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, expectedDeployId: deployId, fetchImpl: async () => new Response('<div id="root"></div>') }), /mismatch/);
  await assert.rejects(verifyHostedDeployment({ hostedUrl: 'https://pilot.example.test', expectedHead: head, expectedDeployId: 'invalid', fetchImpl }), /24-character lowercase hex/);
});