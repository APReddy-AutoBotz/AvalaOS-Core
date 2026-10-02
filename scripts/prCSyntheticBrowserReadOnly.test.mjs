import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { chromium } from '@playwright/test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  HUMAN_DUTY_BY_PERSONA,
  canonicalDigest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  SYNTHETIC_PERSONA_ORDER,
  requiredSyntheticBrowserAssertionId,
} from './prCSyntheticAcceptanceEvidence.mjs';
import {
  deriveBrowserIdentityDigests,
  runReadOnlyBrowserPhase,
} from './runPrCSyntheticAcceptanceBrowser.mjs';

const PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
const LOOPBACK_ORIGIN = 'https://127.0.0.1:59999';
const HEAD = '5'.repeat(40);
const DEPLOY_ID = '6'.repeat(24);
const digest = character => `sha256:${character.repeat(64)}`;
const EXERCISE_DIGEST = digest('a');
const TARGET_FINGERPRINT = digest('b');
const PUBLIC_TARGET_DIGEST = `sha256:${createHash('sha256').update(`pr-c-controlled-human-public-target\0${LOOPBACK_ORIGIN}`).digest('hex')}`;
const PERSONA_MANIFEST_DIGEST = digest('d');
const FIXTURE_MANIFEST_DIGEST = digest('e');
const ORGANIZATION_ID = '00000001-0000-4000-8000-000000000001';
const WORKSPACE_ID = '00000002-0000-4000-8000-000000000002';
const PUBLIC_KEY = 'sb_publishable_pr_c_read_only_browser_fixture';

const personaFixture = JSON.parse(await readFile(new URL('../testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json', import.meta.url), 'utf8'));
const capabilities = new Map(personaFixture.personas.map(record => [record.key, record.capabilities]));

const uuid = (prefix, index) => `${prefix}${String(index).padStart(7, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;
const actorId = index => uuid('3', index + 1);
const sessionId = index => uuid('4', index + 1);
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = (index, personaKey) => `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
  sub: actorId(index), session_id: sessionId(index), email: `${personaKey}@example.invalid`, role: 'authenticated', exp: 4_102_444_800,
})}.fixture`;

const baselines = Array.from({ length: 4 }, (_, index) => ({
  id: uuid('1', index + 1), version: index + 1, status: 'approved', readiness: 'not_ready',
  lineageClassification: 'not_assessed', planningOnly: true,
  workPackageId: uuid('2', index + 1), workPackageVersion: index + 2, acceptedItemCount: 1,
  acceptedItems: [{ version: 1, type: 'Task', title: `Retained item ${index + 1}`, status: 'accepted' }],
  milestones: [], dependencies: [], blockers: [], risks: [],
}));

const retainedMonitorHistory = {
  baselineCount: 4,
  identityDigest: canonicalDigest(baselines.map(value => ({
    id: value.id,
    version: value.version,
    packageId: value.workPackageId,
    packageVersion: value.workPackageVersion,
    acceptedItemCount: value.acceptedItemCount,
  })).sort((left, right) => left.id.localeCompare(right.id))),
};

const binding = {
  repository: 'APReddy-AutoBotz/AvalaOS-Core', prNumber: 264,
  branch: 'controller/governed-delivery-monitor-pr-c-20260831', exactHead: HEAD,
  preview: { origin: PREVIEW_ORIGIN, deployId: DEPLOY_ID, releaseSha: HEAD, environment: 'hosted_nonproduction_pilot', context: 'deploy-preview', reviewId: 264, siteName: 'avalaos-pilot' },
  backend: { exerciseDigest: EXERCISE_DIGEST, targetFingerprint: TARGET_FINGERPRINT, publicTargetDigest: PUBLIC_TARGET_DIGEST,
    personaManifestDigest: PERSONA_MANIFEST_DIGEST, fixtureManifestDigest: FIXTURE_MANIFEST_DIGEST, migrationTip: '20260928060000' },
  producer: { workflowPath: '.github/workflows/transcript-flow-pr-c.yml', job: 'synthetic_role_acceptance', event: 'workflow_dispatch', runId: '12345', runAttempt: 1, owner: 'APReddy-AutoBotz' },
};

const env = {
  PR_C_CONTROLLED_HUMAN_RELEASE_SHA: HEAD,
  PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST: EXERCISE_DIGEST,
  PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN: PREVIEW_ORIGIN,
  PR_C_CONTROLLED_HUMAN_DEPLOY_ID: DEPLOY_ID,
  PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT: TARGET_FINGERPRINT,
  PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST: PUBLIC_TARGET_DIGEST,
  PR_C_SYNTHETIC_ACCEPTANCE_PERSONA_MANIFEST_DIGEST: PERSONA_MANIFEST_DIGEST,
  PR_C_SYNTHETIC_ACCEPTANCE_FIXTURE_MANIFEST_DIGEST: FIXTURE_MANIFEST_DIGEST,
  PR_C_SYNTHETIC_ACCEPTANCE_PASSWORD_BUNDLE_JSON: JSON.stringify(Object.fromEntries(SYNTHETIC_PERSONA_ORDER.map((key, index) => [key, `Synthetic-password-${index}!`]))),
  GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1',
};

const preparation = {
  releaseSha: HEAD, reviewHeadSha: HEAD, deployId: DEPLOY_ID, deployOrigin: PREVIEW_ORIGIN,
  exerciseDigest: EXERCISE_DIGEST, targetFingerprint: TARGET_FINGERPRINT, publicTargetDigest: PUBLIC_TARGET_DIGEST,
  personaManifestDigest: PERSONA_MANIFEST_DIGEST, fixtureManifestDigest: FIXTURE_MANIFEST_DIGEST,
  migrationTip: '20260928060000', productionAuthorized: false, customerDataAuthorized: false, realProviderCallsAuthorized: false,
};

let fixturePromise;
const buildFixture = () => fixturePromise ??= (async () => {
  const { build } = await import('vite');
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-read-only-app-fixture.tsx`;
  const source = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import './index.css';
    import App from './App';
    import { AuthProvider } from './components/auth/AuthProvider';
    import { OrganizationProvider } from './components/auth/OrganizationProvider';
    import { DeliveryProvider } from './components/delivery/DeliveryProvider';
    import { DocsProvider } from './components/docs/DocsProvider';
    import { ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION, decodeEnterpriseIntelligenceProjection } from './services/enterpriseIntelligence';
    import { emptyTranscriptFlowProjection } from './services/transcriptFlow/contracts';
    import { emptyStudioSourceFlowProjection } from './services/studioArtifacts/workspaceModel';
    import { createMonitorBaselinesFixture } from './services/deliveryMonitor/fixtures';
    import { decodeMonitorApprovedBaselinesProjection, validateCanonicalMonitorApprovedBaselinesProjection } from './services/deliveryMonitor/contracts';
    const config = window.__prCReadOnlyFixture;
    const nativeFetch = window.fetch.bind(window);
    const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
    const tokenPayload = headers => {
      const authorization = new Headers(headers || {}).get('authorization') || '';
      const segment = authorization.replace(/^Bearer\\s+/i, '').split('.')[1];
      if (!segment) return null;
      try { return JSON.parse(atob(segment.replaceAll('-', '+').replaceAll('_', '/'))); } catch { return null; }
    };
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const method = init.method || (typeof input === 'string' ? 'GET' : input.method);
      const payload = tokenPayload(init.headers || (typeof input === 'string' ? undefined : input.headers));
      const persona = config.personas.find(record => record.actorId === payload?.sub);
      await window.__recordPrCReadOnlyRequest({ method, pathname: url.pathname, personaKey: persona?.personaKey || null });
      if (url.origin !== config.loopbackOrigin) throw new Error('FIXTURE_EXTERNAL_REQUEST_REJECTED');
      if (url.pathname === '/rest/v1/rpc/pr_c_controlled_human_public_attestation') return json(config.attestation);
      const readTables = new Set(['/rest/v1/assess_processes', '/rest/v1/epics', '/rest/v1/handoff_ledger_entries',
        '/rest/v1/projects', '/rest/v1/sprints', '/rest/v1/tasks', '/rest/v1/timesheet_entries']);
      if (readTables.has(url.pathname) && ['GET', 'HEAD'].includes(method)) return json([]);
      if (url.pathname === '/auth/v1/user') return persona ? json({ id: persona.actorId, email: persona.email, role: 'authenticated', aud: 'authenticated', user_metadata: { full_name: persona.personaKey } }) : json({});
      if (url.pathname === '/auth/v1/logout') {
        if (config.retainLogoutSession) {
          const key = Object.keys(localStorage).find(candidate => candidate.startsWith('sb-') && candidate.endsWith('-auth-token'));
          if (key) sessionStorage.setItem('__prCRetainedLogoutSession', JSON.stringify({ key, value: localStorage.getItem(key) }));
        }
        return nativeFetch(input, init);
      }
      if (url.pathname === '/functions/v1/tenant-session') {
        await new Promise(resolve => setTimeout(resolve, 75));
        return json({ contexts: persona?.personaKey === 'revoked_actor' || !persona ? [] : [{
        userId: persona.actorId, organizationId: config.organizationId, organizationName: 'Synthetic organization',
        workspaceId: config.workspaceId, workspaceName: 'Synthetic workspace', authorizationVersion: 1, capabilities: persona.capabilities,
        }] });
      }
      if (url.pathname === '/functions/v1/enterprise-intelligence-query') {
        const rawMonitorFixture = createMonitorBaselinesFixture();
        const monitorApprovedBaselines = decodeMonitorApprovedBaselinesProjection({ ...rawMonitorFixture, organizationId: config.organizationId,
          workspaceId: config.workspaceId, featureFlags: { monitorApprovedBaselineEnabled: false }, readOnly: true,
          liveTelemetryConnected: false, baselines: config.baselines.map(identity => ({
            ...rawMonitorFixture.baselines[0], id: identity.id, version: identity.version,
            workPackageId: identity.workPackageId, workPackageVersion: identity.workPackageVersion,
          })), actions: [] });
        const projection = {
        schemaVersion: ENTERPRISE_INTELLIGENCE_PROJECTION_VERSION, organizationId: config.organizationId, workspaceId: config.workspaceId,
        authorizationVersion: 1, generatedAt: '2026-10-02T00:00:00.000Z', capabilities: persona?.capabilities || [], availability: 'ready',
        providers: [], evidenceSources: [], evidenceCandidates: [], assessDrafts: [], applications: [], studioDocuments: [], deliveryPackages: [],
        monitorBaselines: [], modernizationDecisions: [], blueprints: [], approvalResources: [], commandActivity: [],
        transcriptFlow: emptyTranscriptFlowProjection(), studioSourceFlow: emptyStudioSourceFlowProjection(),
        assessPromotion: { state: 'contract_pending', acceptedCandidateCount: 0, provenanceComplete: false, idempotencyState: 'not_started', conflicts: [] },
        monitorApprovedBaselines,
        };
        try {
          validateCanonicalMonitorApprovedBaselinesProjection(monitorApprovedBaselines);
          decodeEnterpriseIntelligenceProjection(projection);
        } catch (error) {
          await window.__recordPrCReadOnlyRequest({ method: 'VALIDATE', pathname: '/fixture/projection/' + (error?.message || 'unknown'), personaKey: persona?.personaKey || null });
        }
        return json({ projection });
      }
      return new Response(JSON.stringify({ code: 'FIXTURE_ROUTE_MISSING' }), { status: 500, headers: { 'content-type': 'application/json' } });
    };
    createRoot(document.getElementById('root')).render(<React.StrictMode><AuthProvider><OrganizationProvider><DeliveryProvider><DocsProvider><App /></DocsProvider></DeliveryProvider></OrganizationProvider></AuthProvider></React.StrictMode>);
  `;
  const compiled = await build({ configFile: false, envDir: false, logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'), '__AVALA_SYNTHETIC_BROWSER_TEST_BUILD__': 'true',
      'import.meta.env.MODE': JSON.stringify('production'), 'import.meta.env.VITE_AVALA_RUNTIME_MODE': JSON.stringify('pilot'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(LOOPBACK_ORIGIN), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(PUBLIC_KEY),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_ENABLED': JSON.stringify('authorized'),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_RELEASE_SHA': JSON.stringify(HEAD),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA': JSON.stringify(HEAD),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ID': JSON.stringify(DEPLOY_ID),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN': JSON.stringify(PREVIEW_ORIGIN),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST': JSON.stringify(EXERCISE_DIGEST),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT': JSON.stringify(TARGET_FINGERPRINT),
      'import.meta.env.VITE_PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_DIGEST': JSON.stringify(PUBLIC_TARGET_DIGEST),
      'import.meta.env.VITE_AVALA_READ_ONLY_MAINTENANCE': JSON.stringify('false'),
      'import.meta.env.VITE_AVALA_HOSTED_SANDBOX_ENABLED': JSON.stringify('false'),
    },
    build: { write: false, minify: false, lib: { entry, name: 'PrCReadOnlyAppFixture', formats: ['iife'] } },
    plugins: [{ name: 'pr-c-read-only-real-app-entry', enforce: 'pre', resolveId(id) {
      if (id.replaceAll('\\', '/').endsWith('/synthetic-read-only-app-fixture.tsx')) return entry;
    }, load(id) { if (id === entry) return source; } }],
  });
  const output = compiled[0].output;
  return {
    code: output.find(file => file.type === 'chunk').code,
    css: String(output.find(file => file.type === 'asset' && file.fileName.endsWith('.css'))?.source || ''),
  };
})();

const fixtureConfig = {
  loopbackOrigin: LOOPBACK_ORIGIN, organizationId: ORGANIZATION_ID, workspaceId: WORKSPACE_ID, baselines,
  personas: SYNTHETIC_PERSONA_ORDER.map((personaKey, index) => ({ personaKey, actorId: actorId(index), email: `${personaKey}@example.invalid`, capabilities: capabilities.get(personaKey) })),
  attestation: {
    attested: true, contractVersion: 'pr-c-controlled-human-attestation-1', environmentClass: 'hosted_nonproduction_pilot', prNumber: 264,
    releaseSha: HEAD, reviewHeadSha: HEAD, deployId: DEPLOY_ID, deployOrigin: PREVIEW_ORIGIN, exerciseDigest: EXERCISE_DIGEST,
    targetFingerprint: TARGET_FINGERPRINT, publicTargetDigest: PUBLIC_TARGET_DIGEST, personaManifestDigest: PERSONA_MANIFEST_DIGEST,
    fixtureManifestDigest: FIXTURE_MANIFEST_DIGEST, migrationTip: '20260928060000', productionAuthorized: false,
    customerDataAuthorized: false, realProviderCallsAuthorized: false,
  },
};

const serverActionKeys = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => `${record.checkpointId}\0${record.stepId}`));
const executionIndex = new Map(CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId => {
  const checkpoint = CONTROLLED_HUMAN_CATALOG.find(record => record.checkpointId === checkpointId);
  return checkpoint.steps.map(step => `${checkpointId}\0${step.stepId}`);
}).map((key, index) => [key, index]));

const priorStep = (checkpointId, step, index, personaRecords) => {
  const persona = personaRecords.find(record => record.personaKey === step.personaKey);
  const startedAt = new Date(Date.UTC(2026, 9, 2, 0, 0, index * 2)).toISOString();
  const completedAt = new Date(Date.UTC(2026, 9, 2, 0, 0, index * 2 + 1)).toISOString();
  return {
    stepId: step.stepId, personaKey: step.personaKey, outcome: 'passed', startedAt, completedAt,
    applicationActorDigest: persona.applicationActorDigest, applicationSessionDigest: persona.applicationSessionDigest,
    browserArtifact: { artifactId: `fixture-${String(index).padStart(3, '0')}`, route: '/', viewport: 'desktop-chrome',
      assertions: [
        { assertionId: requiredSyntheticBrowserAssertionId(checkpointId, step.stepId), kind: 'dom', result: 'passed', actualDigest: canonicalDigest({ checkpointId, stepId: step.stepId, index }) },
        { assertionId: `fixture.${String(index).padStart(3, '0')}.context`, kind: 'navigation', result: 'passed', actualDigest: canonicalDigest({ checkpointId, personaKey: step.personaKey, index }) },
      ].sort((left, right) => left.assertionId.localeCompare(right.assertionId)),
      interactionSequence: [`fixture:${String(index).padStart(3, '0')}`],
      serverAnchor: serverActionKeys.has(`${checkpointId}\0${step.stepId}`) ? { challengeToken: canonicalDigest({ kind: 'anchor', checkpointId, stepId: step.stepId }) } : null,
      serverBinding: serverActionKeys.has(`${checkpointId}\0${step.stepId}`) ? { bindingToken: canonicalDigest({ kind: 'binding', checkpointId, stepId: step.stepId }) } : null },
  };
};

const createState = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pr-c-read-only-browser-'));
  const personas = SYNTHETIC_PERSONA_ORDER.map((personaKey, index) => ({ personaKey, role: HUMAN_DUTY_BY_PERSONA[personaKey],
    ...deriveBrowserIdentityDigests({ exerciseDigest: EXERCISE_DIGEST, personaKey, authUserId: actorId(index), sessionId: sessionId(index) }) }));
  for (const [index, personaKey] of SYNTHETIC_PERSONA_ORDER.entries()) {
    const token = accessToken(index, personaKey);
    const session = { access_token: token, refresh_token: `fixture-refresh-${index}`, expires_at: 4_102_444_800, expires_in: 3600,
      token_type: 'bearer', user: { id: actorId(index), email: `${personaKey}@example.invalid`, role: 'authenticated', aud: 'authenticated', user_metadata: { full_name: personaKey } } };
    await writeFile(path.join(directory, `${personaKey}.json`), JSON.stringify({ cookies: [], origins: [{ origin: PREVIEW_ORIGIN,
      localStorage: [{ name: 'sb-127-auth-token', value: JSON.stringify(session) }] }] }), { flag: 'wx', mode: 0o600 });
  }
  const checkpoints = CONTROLLED_HUMAN_CATALOG.map(checkpoint => ({ checkpointId: checkpoint.checkpointId, journeyId: checkpoint.journeyId,
    testIds: checkpoint.testIds, outcome: 'passed', steps: checkpoint.steps.filter(step => step.stepId !== 'verify-history-readable-and-actions-absent')
      .map(step => priorStep(checkpoint.checkpointId, step, executionIndex.get(`${checkpoint.checkpointId}\0${step.stepId}`), personas)) }));
  const latestStep = checkpoints.flatMap(record => record.steps).sort((left, right) => Date.parse(left.completedAt) - Date.parse(right.completedAt)).at(-1);
  return { directory, active: { kind: 'pr264-synthetic-browser-active-private', binding, personas, checkpoints,
    storageStateFiles: SYNTHETIC_PERSONA_ORDER.map(personaKey => ({ personaKey, file: `${personaKey}.json` })), providerEgressCount: 0,
    retainedMonitorHistory, lastCompletedAt: latestStep.completedAt } };
};

const browserFactory = async ({ wrongRoot = false, logoutStatus = 200, abortLogout = false,
  logoutDelayMs = 0, postLogoutDocumentDelayMs = 0, delayedLogoutCount = 0,
  retainLogoutSession = false, postLogoutDocument = 'app' } = {}) => {
  const built = await buildFixture();
  const browser = await chromium.launch();
  const requests = [];
  const postLogoutPages = new WeakMap();
  let logoutCount = 0;
  return {
    requests,
    async newContext(options) {
      const context = await browser.newContext(options);
      return {
        async newPage() {
          const page = await context.newPage();
          await page.addInitScript(config => {
            window.__prCReadOnlyFixture = config;
            const retained = sessionStorage.getItem('__prCRetainedLogoutSession');
            if (config.retainLogoutSession && retained) {
              try {
                const { key, value } = JSON.parse(retained);
                if (typeof key === 'string' && typeof value === 'string') localStorage.setItem(key, value);
              } catch { /* deliberately malformed fixture state remains absent */ }
            }
          }, { ...fixtureConfig, retainLogoutSession });
          await page.exposeBinding('__recordPrCReadOnlyRequest', (_source, record) => { requests.push(record); });
          await page.route('**/*', route => route.abort());
          await page.route(`${LOOPBACK_ORIGIN}/auth/v1/logout*`, async route => {
            const delayed = logoutCount < delayedLogoutCount;
            logoutCount += 1;
            if (delayed && logoutDelayMs) await new Promise(resolve => setTimeout(resolve, logoutDelayMs));
            if (abortLogout) { await route.abort(); return; }
            postLogoutPages.set(page, { delayed });
            await route.fulfill({ status: logoutStatus, contentType: 'application/json', body: JSON.stringify({}) });
          });
          await page.route(`${PREVIEW_ORIGIN}/**`, async route => {
            const postLogout = postLogoutPages.get(page);
            if (postLogout) {
              postLogoutPages.delete(page);
              if (postLogout.delayed && postLogoutDocumentDelayMs) await new Promise(resolve => setTimeout(resolve, postLogoutDocumentDelayMs));
              if (postLogoutDocument === 'spoof') {
                await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><body><main><label>Email<input type="email"></label></main></body></html>' });
                return;
              }
            }
            await route.fulfill({ contentType: 'text/html; charset=utf-8', body:
              `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${built.css}</style></head><body><div id="root"></div><script>${built.code.replaceAll('</script>', '<\\/script>')}</script></body></html>` });
          });
          if (wrongRoot) {
            const navigate = page.goto.bind(page);
            page.goto = async (_url, gotoOptions) => {
              const response = await navigate(PREVIEW_ORIGIN, gotoOptions);
              await page.locator('main').waitFor({ state: 'visible', timeout: 20_000 });
              assert.equal(await page.locator('#primary-navigation').count(), 0);
              await page.getByRole('heading', { level: 1, name: 'Evaluate before you automate. Govern before you execute.', exact: true }).waitFor({ state: 'visible' });
              assert.equal(requests.some(record => ['/auth/v1/user', '/functions/v1/tenant-session'].includes(record.pathname)), false);
              return response;
            };
          }
          return page;
        },
        close: () => context.close(),
      };
    },
    close: () => browser.close(),
  };
};

const assertRejectedLogoutPreservesPrivateState = async (directory, createdBrowser) => {
  await access(path.join(directory, 'requester.json'));
  assert.deepEqual(createdBrowser.requests.filter(record => record.pathname === '/auth/v1/logout').map(record => record.personaKey), ['requester']);
};

test('final read-only phase restores the real app, proves retained Monitor history, and signs out every persona', async () => {
  const { directory, active } = await createState();
  let createdBrowser;
  try {
    let campaign;
    try {
      campaign = await runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
        browserFactory: async () => (createdBrowser = await browserFactory({
          logoutDelayMs: 10_250, postLogoutDocumentDelayMs: 10_250, delayedLogoutCount: 1,
        })) });
    } catch (error) {
      const pathCounts = Object.entries(Object.groupBy(createdBrowser?.requests || [], record => record.pathname))
        .map(([pathname, records]) => `${pathname}:${records.length}`).sort().join(',');
      throw new Error(`PR_C_READ_ONLY_FIXTURE_FAILURE:${error?.message || 'unknown'}:requests=${pathCounts}`);
    }
    assert.equal(campaign.personas.length, 12);
    assert.equal(campaign.checkpoints.flatMap(record => record.steps).length, 84);
    await assert.rejects(access(directory), error => error?.code === 'ENOENT');
    const requests = createdBrowser.requests;
    assert.equal(requests.filter(record => record.pathname === '/auth/v1/logout').length, 12);
    assert.deepEqual(requests.filter(record => record.pathname === '/auth/v1/logout').map(record => record.personaKey), SYNTHETIC_PERSONA_ORDER);
    const allowedReads = new Set(['/rest/v1/assess_processes', '/rest/v1/epics', '/rest/v1/handoff_ledger_entries',
      '/rest/v1/projects', '/rest/v1/sprints', '/rest/v1/tasks', '/rest/v1/timesheet_entries']);
    assert.equal(requests.some(record => !(allowedReads.has(record.pathname)
      || record.pathname === '/rest/v1/rpc/pr_c_controlled_human_public_attestation'
      || ['/auth/v1/user', '/auth/v1/logout', '/functions/v1/tenant-session', '/functions/v1/enterprise-intelligence-query'].includes(record.pathname))), false);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('final read-only phase records terminal inactive logout responses only after local postconditions pass', async () => {
  const { directory, active } = await createState();
  let createdBrowser;
  try {
    const campaign = await runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
      browserFactory: async () => (createdBrowser = await browserFactory({ logoutStatus: 401 })) });
    assert.equal(campaign.personas.length, 12);
    assert.equal(createdBrowser.requests.filter(record => record.pathname === '/auth/v1/logout').length, 12);
    assert.equal(new Set(campaign.personas.map(record => record.signOutEvidenceDigest)).size, 12);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('final read-only phase rejects a non-terminal logout response', async () => {
  const { directory, active } = await createState();
  let createdBrowser;
  try {
    await assert.rejects(runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
      browserFactory: async () => (createdBrowser = await browserFactory({ logoutStatus: 500 })) }),
    /PR_C_SYNTHETIC_BROWSER_SIGNOUT_REJECTED:requester:response:HTTP_500/u);
    await assertRejectedLogoutPreservesPrivateState(directory, createdBrowser);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('final read-only phase rejects a post-logout document without the real sign-in form', async () => {
  const { directory, active } = await createState();
  let createdBrowser;
  try {
    await assert.rejects(runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
      browserFactory: async () => (createdBrowser = await browserFactory({ postLogoutDocument: 'spoof' })) }),
    /PR_C_SYNTHETIC_BROWSER_SIGNOUT_REJECTED:requester:render:(?:FAILED|TIMEOUT)/u);
    await assertRejectedLogoutPreservesPrivateState(directory, createdBrowser);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('final read-only phase rejects restoration of the exact bound session after navigation', async () => {
  const { directory, active } = await createState();
  let createdBrowser;
  try {
    await assert.rejects(runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
      browserFactory: async () => (createdBrowser = await browserFactory({ retainLogoutSession: true })) }),
    /PR_C_SYNTHETIC_BROWSER_SIGNOUT_REJECTED:requester:session:(?:SESSION_RETAINED|TIMEOUT)/u);
    await assertRejectedLogoutPreservesPrivateState(directory, createdBrowser);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test('final read-only phase rejects a resume that is redirected to the preview root', async () => {
  const { directory, active } = await createState();
  try {
    await assert.rejects(runReadOnlyBrowserPhase({ active, env, preparation, stateDirectory: directory,
      browserFactory: () => browserFactory({ wrongRoot: true }) }), /PR_C_SYNTHETIC_BROWSER_RESUME_ROUTE_REJECTED/u);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
