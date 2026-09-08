import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REQUIRED_GATES, safeHash, validateHostedUrl, validateResolvedHostedUrl, verifyActivationRun, verifyManifest } from './verify-hosted-pilot-evidence.mjs';
import { verifyHostedDeployment } from './verify-hosted-deployment.mjs';
import {HOSTED_EVIDENCE_FAMILIES,HOSTED_EVIDENCE_FAMILY_CONTRACTS,hostedEvidenceFamilyContractSha256,hostedEvidenceObservationSetSha256} from './hostedEvidenceFamilyAttestation.mjs';
import { loadCanonicalMigrationInventory } from './hostedPilotActivation.mjs';
import { DEFAULT_HOSTED_PILOT_MANIFEST_PATH, resolveHostedPilotManifestOutput } from './produce-hosted-pilot-activation-manifest.mjs';
import { collectChangedPrCFiles } from './transcriptFlowPrCEvidenceScope.mjs';
const head = 'a'.repeat(40), canonicalMigrationDigest = 'c'.repeat(64);
const scope={organizationId:'11111111-1111-4111-8111-111111111111',workspaceId:'22222222-2222-4222-8222-222222222222',exerciseRunId:'33333333-3333-4333-8333-333333333333'};
const activationRun = { id: '123456789', attempt: '2', workflow: '.github/workflows/hosted-pilot-activation-evidence-producer.yml', repository: 'APReddy-AutoBotz/AvalaOS-Core', event: 'workflow_dispatch', head, conclusion: 'success' };
const hostedEvidenceFamilyState=HOSTED_EVIDENCE_FAMILIES.map((family,familyIndex)=>{
  const contract=HOSTED_EVIDENCE_FAMILY_CONTRACTS[family],paths=[...new Set(contract.assertions.map(item=>item.sourcePath))];
  const sourceArtifacts=paths.map(path=>({path,sha256:contract.assertions.find(item=>item.sourcePath===path).sourceSha256})),byPath=new Map(sourceArtifacts.map(item=>[item.path,item.sha256]));
  const assertionOutcomes=contract.assertions.map(item=>({assertionId:item.assertionId,status:'PASS',sourceArtifactSha256:byPath.get(item.sourcePath),observationSha256:`sha256:${String(familyIndex+1).slice(-1).repeat(64)}`}));
  const observationBinding={family,releaseSha:head,producerWorkflowPath:activationRun.workflow,producerRunId:activationRun.id,producerRunAttempt:2,...scope,targetFingerprint:safeHash('dedicated-target'),deploymentFingerprint:safeHash('dedicated-web-target')};
  return {schemaVersion:'hosted-family-assertion-v2',family,result:'passed',disposition:'executed_hosted_evidence',environment:'hosted_nonproduction_pilot',
    targetFingerprint:safeHash('dedicated-target'),deploymentTargetFingerprint:safeHash('dedicated-web-target'),testIds:[...contract.testIds],contractSha256:hostedEvidenceFamilyContractSha256(family),
    execution:{releaseSha:head,producerWorkflowPath:activationRun.workflow,producerRunId:activationRun.id,producerRunAttempt:2},scope,
    assertionOutcomes,sourceArtifacts,observationSchemaVersion:'hosted-family-derived-observation-v1',observationBinding,
    observationSetSha256:hostedEvidenceObservationSetSha256(observationBinding,assertionOutcomes),observedAt:'2026-08-23T00:00:00.000Z'};
});
const evidence = Object.fromEntries(REQUIRED_GATES.map((gate) => [gate, { result: 'passed', gitCommit: head, workflowRunId: activationRun.id, workflowRunAttempt: 2, workflowPath: activationRun.workflow, workflowConclusion: 'success', environment: 'hosted_nonproduction_pilot', targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), ...scope, resultId: `${gate}:1` }]));
for(const state of hostedEvidenceFamilyState) evidence[state.family].hostedFamilyAssertion=state;
const manifest = { schemaVersion: 1, gitCommit: head, environment: 'hosted_nonproduction_pilot', hostedNonproductionVerified: true, productionAuthorized: false, liveActivationAuthorized: false, customerDataAuthorized: false, customerDataUsed: false, externalUsersAuthorized: false, externalUsersUsed: false, realProviderCallsAuthorized: false, realProviderCallsUsed: false, targetFingerprint: safeHash('dedicated-target'), deploymentTargetFingerprint: safeHash('dedicated-web-target'), migrationChainHash: `sha256:${canonicalMigrationDigest}`, hostedEvidenceFamilyState, deploymentId: 'deploy-1', workflowRunId: activationRun.id, workflowRunAttempt: 2, workflowPath: activationRun.workflow, workflowRepository: activationRun.repository, workflowEvent: activationRun.event, workflowConclusion: activationRun.conclusion, ...scope, evidence };
const context = { expectedHead: head, actualHead: head, canonicalMigrationDigest, activationRun, expectedDeploymentFingerprint: manifest.deploymentTargetFingerprint, expectedScope:scope };
const assertOrderedTokens = (source, tokens, label) => {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${label}: expected ${JSON.stringify(token)} after prior step`);
    cursor = next;
  }
};
const assertOwnedTemporaryRoot = (temporaryRoot, prefix) => {
  const resolvedBase = path.resolve(tmpdir());
  const resolvedRoot = path.resolve(temporaryRoot);
  assert.equal(
    resolvedRoot.startsWith(`${resolvedBase}${path.sep}`) && path.basename(resolvedRoot).startsWith(prefix),
    true,
    `temporary root must be contained and use prefix ${prefix}`,
  );
  return resolvedRoot;
};
test('accepts exact-head complete hosted evidence bound to the selected activation run', () => assert.equal(verifyManifest(manifest, context), true));
test('fails closed for wrong head, missing gate, production authority, and unsafe URL', () => {
  assert.throws(() => verifyManifest(manifest, { ...context, actualHead: 'b'.repeat(40) }), /exact head/);
  assert.throws(() => verifyManifest({ ...manifest, evidence: {} }, context), /missing/);
  const omittedFamily={...manifest,evidence:{...manifest.evidence,'tenant-adversarial':{...manifest.evidence['tenant-adversarial'],hostedFamilyAssertion:undefined}}};
  assert.throws(()=>verifyManifest(omittedFamily,context),/did not consume authoritative/);
  const substitutedState=structuredClone(manifest);substitutedState.hostedEvidenceFamilyState[0].testIds=['FAKE-001'];
  assert.throws(()=>verifyManifest(substitutedState,context),/TEST_IDS_MISMATCH/);
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
  assert.match(producer, /needs: \[disposable-family-regressions, database-provider, recovery-operations, hosted-browser, accessibility-performance\]/);
  assert.match(producer, /'accessibility-performance':'accessibility-performance'/);
  assert.doesNotMatch(producer, /'accessibility-performance':'hosted-browser'/);
  assert.match(producer, /name: hosted-accessibility-performance-result-\$\{\{ github\.run_attempt \}\}/);
  assert.match(producer, /missing or mismatched accessibility\/performance assertion artifact/);
  assert.match(producer, /accessibility-performance-artifact:/);
  assert.match(producer, /TRUSTED_GATE_RESULTS_JSON/);
  assert.match(producer,/authoritative-hosted-family-state/);
  assert.match(producer,/validateAuthoritativeHostedFamilyState/);
  assert.match(producer,/result:family\?family\.result:g==='accessibility-performance'\?accessibility\.result:'passed'/);
  assert.doesNotMatch(producer,/hosted-family-attestations-/);
  for(const gate of ['tenant-adversarial','backup-restore','canonical-journey','provider-simulation-zero-egress','recovery-rollback'])
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
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*for \(const \[label, userName\] of personas\)/u);
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*runObservedPersonaJourney\(page, label, userName/u);
  assert.match(spec, /const runObservedPersonaJourney[\s\S]*observeAuthorityRequests\(page\)[\s\S]*enterPersona\(page, label\)[\s\S]*signOutToSandbox\(page\)[\s\S]*stopAfterQuiescence[\s\S]*observer\.assertSafe\(\)/u);
  assert.match(spec, /case 'serious-critical-a11y':[\s\S]*item\.impact === 'serious' \|\| item\.impact === 'critical'/u);
});
test('sandbox network-safety evidence exercises every declared persona', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /case 'network-safety':[\s\S]*for \(const \[label, userName\] of personas\)/u);
  assert.match(spec, /case 'network-safety':[\s\S]*runObservedPersonaJourney\(page, label, userName\)/u);
});
test('sandbox local-authority evidence exercises every declared persona', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /case 'local-authority':[\s\S]*for \(const \[label, userName\] of personas\)/u);
  assert.match(spec, /case 'local-authority':[\s\S]*runObservedPersonaJourney\(page, label, userName\)/u);
});
test('every hosted navigation rechecks exact release environment and deployment identity', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  assert.match(spec, /import \{[^}]*\bdecodeAcceptanceExecutionProfile\b[^}]*\} from '\.\.\/\.\.\/scripts\/acceptanceExecutionProfile\.mjs'/u);
  assert.match(spec, /const executionProfile = decodeAcceptanceExecutionProfile\(process\.env,/u);
  assert.match(spec, /const releaseSha = executionProfile\.releaseSha/u);
  assert.match(spec, /const deployId = executionProfile\.deployId/u);
  assert.match(spec, /const hostedOrigin = executionProfile\.targetOrigin/u);
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
test('mobile-safe Admin scenarios prove the fail-closed Enterprise Intelligence sandbox boundary directly', async () => {
  const spec = await readFile('tests/browser/exhaustiveHostedAcceptance.spec.ts', 'utf8');
  const adminNavigationStart = spec.indexOf("case 'admin-navigation':");
  const adminNavigationEnd = spec.indexOf("case 'non-admin-denial':");
  const adminCapabilityStart = spec.indexOf("case 'admin-capability-view':");
  const adminCapabilityEnd = spec.indexOf("case 'reload-reconstruction':");
  assert.ok(adminNavigationStart >= 0 && adminNavigationEnd > adminNavigationStart, 'admin-navigation scenario must remain present');
  assert.ok(adminCapabilityStart >= 0 && adminCapabilityEnd > adminCapabilityStart, 'admin-capability-view scenario must remain present');
  assert.match(spec, /Enterprise Intelligence unavailable/u);
  assert.match(spec, /Enterprise Intelligence requires a server-authorized workspace\. The local synthetic sandbox sends no provider or persistence requests\./u);
  assert.match(spec, /getByTestId\('enterprise-intelligence-workspace'\)\)\.toHaveCount\(0\)/u);
  for (const scenario of [spec.slice(adminNavigationStart, adminNavigationEnd), spec.slice(adminCapabilityStart, adminCapabilityEnd)]) {
    assert.match(scenario, /await admin\.click\(\);/u);
    assert.doesNotMatch(scenario, /getByTestId\('enterprise-intelligence-view'\)/u);
    assert.doesNotMatch(scenario, /getByRole\('heading', \{ name: 'Enterprise Intelligence', exact: true \}\)/u);
    assert.match(scenario, /await assertEnterpriseIntelligenceSandboxBoundary\(page\);/u);
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
test('manifest producer output resolver preserves the workflow default and rejects malformed grammar', () => {
  const repositoryRoot = process.cwd();
  assert.equal(DEFAULT_HOSTED_PILOT_MANIFEST_PATH, 'artifacts/hosted-pilot/manifest.json');
  assert.equal(
    resolveHostedPilotManifestOutput([], repositoryRoot),
    path.resolve(repositoryRoot, 'artifacts/hosted-pilot/manifest.json'),
  );
  assert.equal(
    resolveHostedPilotManifestOutput(['--output', 'output/synthetic-hosted-manifest.json'], repositoryRoot),
    path.resolve(repositoryRoot, 'output/synthetic-hosted-manifest.json'),
  );
  for (const args of [
    ['--output'],
    ['--output', ''],
    ['--output', ' manifest.json'],
    ['--output', '--output'],
    ['--output', 'manifest.json', 'extra'],
    ['--output', 'first.json', '--output', 'second.json'],
    ['--unknown', 'manifest.json'],
    ['manifest.json'],
  ]) {
    assert.throws(() => resolveHostedPilotManifestOutput(args, repositoryRoot), /HOSTED_PILOT_OUTPUT_ARGUMENTS_INVALID/u);
  }
});
test('manifest producer and verifier entrypoints reach repository-bound source validation', async () => {
  const repositoryRoot = process.cwd();
  const actualHead = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const canonical = await loadCanonicalMigrationInventory();
  const entrypointDeploymentFingerprint = safeHash('https://pilot.example.test');
  const currentState = structuredClone(hostedEvidenceFamilyState);
  for (const family of currentState) {
    family.execution.releaseSha = actualHead;
    family.deploymentTargetFingerprint = entrypointDeploymentFingerprint;
    family.observationBinding={...family.observationBinding,releaseSha:actualHead,deploymentFingerprint:entrypointDeploymentFingerprint};
    family.observationSetSha256=hostedEvidenceObservationSetSha256(family.observationBinding,family.assertionOutcomes);
  }
  const currentEvidence = structuredClone(evidence);
  for (const item of Object.values(currentEvidence)) {
    item.gitCommit = actualHead;
    item.deploymentTargetFingerprint = entrypointDeploymentFingerprint;
    if (item.hostedFamilyAssertion) {
      item.hostedFamilyAssertion.execution.releaseSha = actualHead;
      item.hostedFamilyAssertion.deploymentTargetFingerprint = entrypointDeploymentFingerprint;
      item.hostedFamilyAssertion.observationBinding={...item.hostedFamilyAssertion.observationBinding,releaseSha:actualHead,deploymentFingerprint:entrypointDeploymentFingerprint};
      item.hostedFamilyAssertion.observationSetSha256=hostedEvidenceObservationSetSha256(item.hostedFamilyAssertion.observationBinding,item.hostedFamilyAssertion.assertionOutcomes);
    }
  }
  const working = await mkdtemp(path.join(tmpdir(), 'avalaos-hosted-entrypoint-'));
  const resolvedWorking = assertOwnedTemporaryRoot(working, 'avalaos-hosted-entrypoint-');
  const defaultManifestPath = path.resolve(repositoryRoot, DEFAULT_HOSTED_PILOT_MANIFEST_PATH);
  const defaultManifestBefore = existsSync(defaultManifestPath) ? await readFile(defaultManifestPath) : null;
  try {
    const manifestPath = path.join(resolvedWorking, 'produced', 'manifest.json');
    const verifiedPath = path.join(resolvedWorking, 'verified.json');
    const commonEnv = {
      ...process.env,
      EXPECTED_RELEASE_SHA: actualHead,
      TARGET_FINGERPRINT: manifest.targetFingerprint,
      DEPLOYMENT_ORIGIN: 'https://pilot.example.test',
      WORKFLOW_RUN_ID: activationRun.id,
      WORKFLOW_RUN_ATTEMPT: activationRun.attempt,
      HOSTED_PILOT_ORGANIZATION_ID: scope.organizationId,
      HOSTED_PILOT_WORKSPACE_ID: scope.workspaceId,
      HOSTED_PILOT_EXERCISE_RUN_ID: scope.exerciseRunId,
      DEPLOYMENT_ID: 'deploy-1',
      WORKFLOW_REPOSITORY: activationRun.repository,
      TRUSTED_GATE_RESULTS_JSON: JSON.stringify({ ...currentEvidence, __hostedEvidenceFamilyState: currentState }),
    };
    const produced = spawnSync(process.execPath, [
      'scripts/produce-hosted-pilot-activation-manifest.mjs', '--output', manifestPath,
    ], { cwd: repositoryRoot, encoding: 'utf8', env: commonEnv, timeout: 30_000, maxBuffer: 1_048_576, windowsHide: true });
    assert.equal(produced.status, 0,produced.stderr);
    assert.doesNotMatch(produced.stderr, /readSource is not defined|ReferenceError/);
    assert.equal(existsSync(manifestPath), true, 'producer must write the requested temporary manifest');
    const producedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(producedManifest.gitCommit, actualHead);
    assert.equal(producedManifest.migrationChainHash, `sha256:${canonical.digest}`);
    assert.equal(producedManifest.deploymentTargetFingerprint, entrypointDeploymentFingerprint);
    const verified = spawnSync(process.execPath, [
      'scripts/verify-hosted-pilot-evidence.mjs', '--manifest', manifestPath, '--expected-head', actualHead,
      '--expected-deployment-fingerprint', entrypointDeploymentFingerprint,
      '--organization-id', scope.organizationId, '--workspace-id', scope.workspaceId, '--exercise-run-id', scope.exerciseRunId,
      '--activation-run-id', activationRun.id, '--activation-run-attempt', activationRun.attempt,
      '--activation-workflow', activationRun.workflow, '--activation-repository', activationRun.repository,
      '--activation-event', activationRun.event, '--activation-head', actualHead, '--activation-conclusion', activationRun.conclusion,
      '--output', verifiedPath,
    ], { cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000, maxBuffer: 1_048_576, windowsHide: true });
    assert.equal(verified.status, 0,verified.stderr);
    assert.match(verified.stdout,/Hosted non-production evidence verified/);
    assert.doesNotMatch(verified.stderr, /readSource is not defined|ReferenceError/);
    assert.equal(existsSync(verifiedPath), true);
    for (const args of [
      ['--output'],
      ['--output', manifestPath, 'extra'],
      ['--output', manifestPath, '--output', manifestPath],
      ['--unknown', manifestPath],
    ]) {
      const rejected = spawnSync(process.execPath, ['scripts/produce-hosted-pilot-activation-manifest.mjs', ...args], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: commonEnv,
        timeout: 30_000,
        maxBuffer: 1_048_576,
        windowsHide: true,
      });
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /HOSTED_PILOT_OUTPUT_ARGUMENTS_INVALID/u);
    }
  } finally {
    try {
      const defaultManifestAfter = existsSync(defaultManifestPath) ? await readFile(defaultManifestPath) : null;
      if (defaultManifestBefore === null) assert.equal(defaultManifestAfter, null, 'custom output must not create the workflow default artifact');
      else assert.deepEqual(defaultManifestAfter, defaultManifestBefore, 'custom output must not modify the workflow default artifact');
    } finally {
      assertOwnedTemporaryRoot(resolvedWorking, 'avalaos-hosted-entrypoint-');
      await rm(resolvedWorking, { recursive: true, force: true });
    }
  }
});

test('exact hosted-pilot manifest ignore remains narrow and does not hide governed source', async () => {
  const working = await mkdtemp(path.join(tmpdir(), 'avalaos-hosted-ignore-'));
  const resolvedWorking = assertOwnedTemporaryRoot(working, 'avalaos-hosted-ignore-');
  const git = args => {
    const result = spawnSync('git', args, {
      cwd: resolvedWorking,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1_048_576,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `HOSTED_PILOT_IGNORE_GIT_FAILED:${args[0]}`);
    return result.stdout.trim();
  };
  try {
    git(['init', '--quiet']);
    git(['config', 'user.email', 'hosted-pilot-ignore@example.invalid']);
    git(['config', 'user.name', 'Hosted pilot ignore fixture']);
    git(['config', 'core.autocrlf', 'false']);
    const ignoreSource = await readFile('.gitignore', 'utf8');
    assert.match(ignoreSource, /^\/artifacts\/hosted-pilot\/manifest\.json$/mu);
    await writeFile(path.join(resolvedWorking, '.gitignore'), ignoreSource);
    await writeFile(path.join(resolvedWorking, 'governed-source.txt'), 'base governed source\n');
    git(['add', '.gitignore', 'governed-source.txt']);
    git(['commit', '--quiet', '-m', 'base governed fixture']);
    const untrackedBase = git(['rev-parse', 'HEAD']);

    const hostedArtifactDirectory = path.join(resolvedWorking, 'artifacts', 'hosted-pilot');
    await mkdir(hostedArtifactDirectory, { recursive: true });
    await writeFile(path.join(hostedArtifactDirectory, 'manifest.json'), '{"synthetic":true}\n');
    await writeFile(path.join(hostedArtifactDirectory, 'adjacent.json'), '{"governed":true}\n');
    const untrackedChanged = collectChangedPrCFiles(resolvedWorking, untrackedBase);
    assert.equal(untrackedChanged.includes('artifacts/hosted-pilot/manifest.json'), false, 'exact generated artifact must be ignored while untracked');
    assert.equal(untrackedChanged.includes('artifacts/hosted-pilot/adjacent.json'), true, 'adjacent untracked artifacts must remain governed');

    git(['add', 'artifacts/hosted-pilot/adjacent.json']);
    git(['add', '--force', 'artifacts/hosted-pilot/manifest.json']);
    git(['commit', '--quiet', '-m', 'tracked artifact fixture']);
    const trackedBase = git(['rev-parse', 'HEAD']);
    await writeFile(path.join(hostedArtifactDirectory, 'manifest.json'), '{"synthetic":"modified"}\n');
    const trackedChanged = collectChangedPrCFiles(resolvedWorking, trackedBase);
    assert.equal(trackedChanged.includes('artifacts/hosted-pilot/manifest.json'), true, 'ignore rules must not hide tracked modifications from governance');
  } finally {
    assertOwnedTemporaryRoot(resolvedWorking, 'avalaos-hosted-ignore-');
    await rm(resolvedWorking, { recursive: true, force: true });
  }
});
