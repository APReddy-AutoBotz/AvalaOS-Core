import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import './prCSyntheticBrowserApi.test.mjs';
import './prCSyntheticBrowserPrerequisites.test.mjs';
import './prCSyntheticBrowserEvidenceActions.test.mjs';
import './prCSyntheticBrowserResponseLoss.test.mjs';
import { chromium } from '@playwright/test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
  canonicalDigest,
} from './prCControlledHumanEvidenceContract.mjs';
import {
  SYNTHETIC_PERSONA_ORDER,
  requiredSyntheticBrowserAssertionId,
} from './prCSyntheticAcceptanceEvidence.mjs';
import {
  assertResumedIdentity,
  buildBrowserExecutionCatalog,
  collectProof,
  deriveBrowserIdentityDigests,
  deterministicPersonaEmail,
  executePlannedStep,
  latestCompletedAt,
  parsePasswordBundle,
  safeBrowserRoute,
  safeBrowserStepFailure,
  selectAssessTranscriptSources,
  signIn,
  retainSyntheticCommandState,
  assertSyntheticCommandContinuity,
  summarizePrerequisiteInteractions,
} from './runPrCSyntheticAcceptanceBrowser.mjs';
import { buildSyntheticApiEvidenceDescriptor } from './prCSyntheticBrowserEvidenceActions.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';

const exerciseDigest = `sha256:${'a'.repeat(64)}`;
const actorId = '30000001-0000-4000-8000-000000000001';
const sessionId = '40000001-0000-4000-8000-000000000001';

test('runner retains exact successful command selectors for prerequisites and replay, rejecting stale captures', async () => {
  const { canonicalDigest } = await import('./prCControlledHumanEvidenceContract.mjs');
  const cases = [
    ['CH-02', 'approve-studio-document', 'ch02:artifactId'],
    ['CH-03', 'accept-studio-handoff', 'prereq:ch03:artifactId'],
    ['CH-03', 'request-studio-handoff', 'ch03:handoffId'],
    ['CH-05', 'request-fresh-exact-handoff', 'ch05:handoffId'],
    ['CH-10', 'create-direct-studio-plan', 'prereq:ch10:artifactId'],
    ['CH-10', 'handoff-direct-studio-plan', 'prereq:ch10:handoffId'],
    ['CH-11', 'create-manual-delivery-package', 'prereq:ch11:packageId'],
    ['CH-11', 'create-read-only-manual-baseline', 'prereq:ch11:baselineId'],
    ['CH-13', 'simulate-response-loss', 'recovery:packageId'],
    ['CH-05', 'consume-approved-handoff-once', 'replay:delivery.handoff.consume'],
    ['CH-08', 'create-baseline-with-exact-package-selectors', 'replay:monitor.baseline.create'],
    ['CH-04', 'request-exact-studio-handoff', 'prereq:ch04:requestSource'],
    ['CH-06', 'edit-one-item-with-rationale', 'prereq:ch06:finalItemId'],
  ];
  for (const [checkpointId, stepId, stateKey] of cases) {
    const planned = buildBrowserExecutionCatalog().find(value => value.checkpointId === checkpointId && value.stepId === stepId);
    assert(planned?.serverAction, `${checkpointId}:${stepId}`);
    const action = planned.serverAction.action.startsWith('handoff.') ? `studio.${planned.serverAction.action}` : planned.serverAction.action;
    const bundle = { id: actorId, versionId: sessionId, version: 1 };
    const body = { commandType: action, requestId: sessionId, payload: { itemAggregateId: actorId, handoffId: actorId,
      workPackageId: actorId, studioArtifactId: actorId, studioArtifactVersionId: sessionId,
      targetInputBundle: bundle, studioInputBundle: bundle, upstreamHandoffId: actorId, artifactType: 'pdd', sourceMode: 'direct_transcript_bundle' } };
    const command = { commandType: action, requestId: sessionId, body,
      response: { ok: true, outcome: 'committed', receiptId: sessionId, resourceId: actorId } };
    const proof = { serverAnchor: { requestDigest: canonicalDigest({ requestId: sessionId }) }, serverBinding: { resourceDigest: exerciseDigest } };
    const candidate = { studioArtifactId: actorId, studioArtifactVersionId: sessionId };
    const state = new Map([
      ['ch03:bundleBinding', { inputBundle: bundle }], ['seed:assess-handoff', { upstreamHandoffId: actorId }],
      ['ch03:handoffId', actorId], ['ch05:handoffId', actorId], ['seed:assessed-artifact', candidate],
      ['prereq:ch10:approvedCandidate', candidate], ['ch06:selectedItemId', actorId],
      ['full-governed-package', { packageId: actorId }], ['seed:recovery-packageId', actorId],
    ]); const session = { api: { lastCommand: async () => command } };
    await retainSyntheticCommandState(planned, session, state, proof);
    assert(state.has(stateKey), `${checkpointId}:${stepId} must bind downstream state`);
    if (stateKey.startsWith('replay:')) assert.deepEqual(state.get(stateKey), { body, resourceDigest: exerciseDigest });
    else if (stateKey.endsWith('requestSource')) assert.deepEqual(state.get(stateKey), body.payload);
    else assert.equal(state.get(stateKey), actorId);
    command.requestId = actorId;
    await assert.rejects(retainSyntheticCommandState(planned, session, new Map(), proof), /COMMAND_PROOF_BINDING_MISMATCH/u);
  }
});

test('causal proof rejects a different artifact, bundle, handoff or item even after a successful command', () => {
  const candidate = { studioArtifactId: actorId, studioArtifactVersionId: sessionId };
  const cases = [
    ['CH-10', 'handoff-direct-studio-plan', { studioArtifactId: actorId, studioArtifactVersionId: sessionId }, 'prereq:ch10:approvedCandidate', candidate, 'studioArtifactId'],
    ['CH-05', 'consume-approved-handoff-once', { handoffId: actorId }, 'ch05:handoffId', actorId, 'handoffId'],
    ['CH-06', 'edit-one-item-with-rationale', { itemAggregateId: actorId }, 'ch06:selectedItemId', actorId, 'itemAggregateId'],
    ['CH-08', 'create-baseline-with-exact-package-selectors', { workPackageId: actorId }, 'full-governed-package', { packageId: actorId }, 'workPackageId'],
  ];
  for (const [checkpointId, stepId, payload, stateKey, expected, changed] of cases) {
    const planned = buildBrowserExecutionCatalog().find(step => step.checkpointId === checkpointId && step.stepId === stepId);
    const state = new Map([[stateKey, expected]]);
    assertSyntheticCommandContinuity(planned, { body: { payload } }, state);
    assert.throws(() => assertSyntheticCommandContinuity(planned, { body: { payload: { ...payload, [changed]: sessionId } } }, state), /MISMATCH/u);
  }
  const planned = buildBrowserExecutionCatalog().find(step => step.checkpointId === 'CH-10' && step.stepId === 'create-direct-studio-plan');
  assert.throws(() => assertSyntheticCommandContinuity(planned, { body: { payload: { artifactType: 'brd' } } }, new Map()), /DIRECT_ARTIFACT_TYPE_MISMATCH/u);
});

test('monitor-only accessibility observations route to their authorized surface', () => {
  const steps = buildBrowserExecutionCatalog().filter(step => step.checkpointId === 'CH-14' && step.personaKey === 'monitor_viewer');
  assert.equal(steps.length, 2);
  assert(steps.every(step => step.surface === 'monitor'));
});

test('complete-set prerequisite evidence retains actual command counts within the artifact limit', () => {
  const label = 'prerequisite:ch-06:accept-current-proposal';
  assert.deepEqual(summarizePrerequisiteInteractions([label, label, 'verify:accepted']), [`${label}:count-2`, 'verify:accepted']);
  assert.deepEqual(summarizePrerequisiteInteractions(Array(249).fill(label)), [`${label}:count-249`]);
  assert.deepEqual(summarizePrerequisiteInteractions([]), []);
});

test('browser evidence route keeps surface navigation without query object identifiers', () => {
  const route = safeBrowserRoute(`https://synthetic.invalid/?view=process_detail&scope=organization&processId=${actorId}&scopeName=Synthetic+Workspace`);
  assert.equal(route, '/?view=process_detail&scope=organization');
  assert(!route.includes(actorId));
  assert.equal(safeBrowserRoute('https://synthetic.invalid/'), '/');
  assert.throws(() => safeBrowserRoute('https://synthetic.invalid/?view=Process+Detail'), /NAVIGATION_REJECTED/u);
});

test('browser step failure identifies its catalog step without exposing locator or page text', () => {
  const planned = { checkpointId: 'CH-01', stepId: 'resolve-material-assess-conflict' };
  const error = safeBrowserStepFailure(planned, new Error('locator.waitFor: Timeout 30000ms exceeded. Private page text'));
  assert.equal(error.message, 'PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:LOCATOR_TIMEOUT');
  assert(!error.message.includes('Private page text'));
  const specific = safeBrowserStepFailure(planned, new Error('PR_C_SYNTHETIC_BROWSER_ASSESS_CANDIDATE_MISSING'));
  assert.equal(specific.message, 'PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:PR_C_SYNTHETIC_BROWSER_ASSESS_CANDIDATE_MISSING');
  let countFailure;
  try { assert.equal(2, 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_CONFLICT_COUNT'); } catch (error) { countFailure = error; }
  assert.equal(safeBrowserStepFailure(planned, countFailure).message,
    'PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:PR_C_SYNTHETIC_BROWSER_ASSESS_CONFLICT_COUNT');
  assert.equal(safeBrowserStepFailure(planned, new Error('locator.click: Timeout 30000ms exceeded. Private page text')).message,
    'PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:LOCATOR_TIMEOUT');
  for (const [operation, diagnostic] of [['page.waitForLoadState', 'LOAD_STATE_TIMEOUT'], ['page.waitForFunction', 'PREDICATE_TIMEOUT']]) {
    const privateText = 'Bearer secret-token https://private.invalid/object/00000001-0000-4000-8000-000000000001';
    assert.equal(safeBrowserStepFailure(planned, new Error(`${operation}: Timeout 30000ms exceeded. ${privateText}`)).message,
      `PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:${diagnostic}`);
  }
  assert.equal(safeBrowserStepFailure(planned, new Error('PR_C_SYNTHETIC_BROWSER_ARM_STEP_MISSING_REFRESH_REJECTED_ROOT')).message,
    'PR_C_SYNTHETIC_BROWSER_STEP_REJECTED:CH-01:resolve-material-assess-conflict:PR_C_SYNTHETIC_BROWSER_ARM_STEP_MISSING_REFRESH_REJECTED_ROOT');
});

test('browser execution catalog covers the exact 84 steps and preserves execution order', () => {
  const catalog = buildBrowserExecutionCatalog();
  assert.equal(catalog.length, 84);
  assert.equal(catalog.filter(record => record.serverAction).length, 43);
  assert.equal(catalog.filter(record => !record.serverAction).length, 41);
  assert.equal(new Set(catalog.map(record => `${record.checkpointId}:${record.stepId}`)).size, 84);
  assert.deepEqual([...new Set(catalog.map(record => record.checkpointId))], CONTROLLED_HUMAN_EXECUTION_ORDER);
  assert.equal(catalog.at(-1).stepId, 'verify-history-readable-and-actions-absent');
  assert.deepEqual(
    CONTROLLED_HUMAN_CATALOG.flatMap(record => record.steps.map(step => requiredSyntheticBrowserAssertionId(record.checkpointId, step.stepId))).length,
    84,
  );
  assert.equal(CONTROLLED_HUMAN_SERVER_ACTIONS.length, 43);
  const revisedDecision = catalog.find(record => record.checkpointId === 'CH-07' && record.stepId === 'decide-revised-descendant');
  assert.equal(revisedDecision?.personaKey, 'delivery_author');
  assert.equal(revisedDecision?.serverAction?.action, 'delivery.item.review');
  const revisedDecisionIndex = catalog.findIndex(record => record === revisedDecision);
  assert.equal(catalog[revisedDecisionIndex - 1]?.stepId, 'commit-only-explicitly-edited-descendants');
  assert.equal(catalog[revisedDecisionIndex + 1]?.stepId, 'review-complete-revised-package');
});

test('password bundle requires every distinct canonical persona credential', () => {
  const bundle = Object.fromEntries(SYNTHETIC_PERSONA_ORDER.map((personaKey, index) => [personaKey, `Synthetic-password-${String(index).padStart(2, '0')}!`]));
  assert.deepEqual(parsePasswordBundle(JSON.stringify(bundle)), bundle);
  assert.throws(() => parsePasswordBundle(JSON.stringify({ ...bundle, requester: bundle.delivery_author })), /PASSWORD_REUSE_REJECTED/u);
  const missing = { ...bundle }; delete missing.requester;
  assert.throws(() => parsePasswordBundle(JSON.stringify(missing)), /PASSWORD_BUNDLE_REJECTED/u);
  assert.equal(deterministicPersonaEmail('requester', exerciseDigest), `prc264.requester.${'a'.repeat(12)}@example.invalid`);
});

test('browser identity digests exactly match the shared server-observer algorithm', () => {
  const actual = deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId });
  assert.deepEqual(actual, {
    applicationActorDigest: deriveSyntheticApplicationActorDigest({ exerciseDigest, personaKey: 'requester', authUserId: actorId }),
    applicationSessionDigest: deriveSyntheticApplicationSessionDigest({ exerciseDigest, personaKey: 'requester', sessionId }),
  });
  assert.deepEqual(assertResumedIdentity(actual, structuredClone(actual), 'requester'), actual);
  const rotated = deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId: '40000002-0000-4000-8000-000000000002' });
  assert.throws(() => assertResumedIdentity(actual, rotated, 'requester'), /RESUME_IDENTITY_REJECTED/u);
  assert.throws(() => deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId: '' }), /APPLICATION_IDENTITY_REJECTED/u);
});

test('sign-in waits for authentication even when the controlled preview banner is already visible', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const token = `header.${Buffer.from(JSON.stringify({ sub: actorId, session_id: sessionId })).toString('base64url')}.signature`;
    await page.route('https://synthetic.invalid/**', route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body>
        <section data-testid="controlled-human-nonproduction-banner">Synthetic preview</section>
        <form><label>Work email<input type="email"></label><label>Password<input type="password"></label>
          <button type="submit">Sign in to AvalaOS</button></form>
        <script>document.querySelector('form').addEventListener('submit', event => {
          event.preventDefault(); setTimeout(() => {
            localStorage.setItem('sb-synthetic-auth-token', JSON.stringify({ access_token: ${JSON.stringify(token)}, user: { id: ${JSON.stringify(actorId)} } }));
            document.querySelector('form').remove();
          }, 100);
        });</script>
      </body></html>`,
    }));
    const identity = await signIn({ page, personaKey: 'requester', password: 'Synthetic-password-00!', exerciseDigest, previewOrigin: 'https://synthetic.invalid' });
    assert.deepEqual(identity, deriveBrowserIdentityDigests({ exerciseDigest, personaKey: 'requester', authUserId: actorId, sessionId }));
    const stored = await context.storageState();
    assert.equal(stored.origins.some(origin => origin.localStorage.some(item => item.name === 'sb-synthetic-auth-token')), true);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('Assess source selection reports a failed server projection without leaking its error text', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main data-testid="enterprise-intelligence-workspace" data-projection-scope-ready="false"><p role="alert">Private backend detail</p></main>');
    await assert.rejects(selectAssessTranscriptSources(page, []), error =>
      error?.message === 'PR_C_SYNTHETIC_BROWSER_ASSESS_PROJECTION_UNAVAILABLE');
  } finally {
    await browser.close();
  }
});

test('active resume boundary is the latest completion across catalog-ordered checkpoints', () => {
  assert.equal(latestCompletedAt([
    { checkpointId: 'CH-13', steps: [{ completedAt: '2026-09-24T10:00:01.000Z' }] },
    { checkpointId: 'CH-14', steps: [{ completedAt: '2026-09-24T10:00:02.000Z' }] },
  ]), '2026-09-24T10:00:02.000Z');
  assert.throws(() => latestCompletedAt([{ checkpointId: 'CH-01', steps: [] }]), /ACTIVE_TIME_REJECTED/u);
});

test('runner is two phase, uses the synthetic migration tip, and contains no aggregate-pass fallback', async () => {
  const source = await readFile(new URL('./runPrCSyntheticAcceptanceBrowser.mjs', import.meta.url), 'utf8');
  assert.match(source, /--phase/u);
  assert.match(source, /\['active', 'read-only'\]/u);
  assert.match(source, /20260928060000/u);
  assert.match(source, /PR_C_SYNTHETIC_BROWSER_EPHEMERAL_STATE_REMAINS/u);
  assert.doesNotMatch(source, /controlledProofVisible|assertBodyPattern|suite.*exit.*passed/iu);
  assert.match(source, /requiredSyntheticBrowserAssertionId/u);
});

test('proof collection reopens the evidence panel after the application action', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<section data-testid="controlled-human-nonproduction-banner"><details><summary>Two-phase exact action evidence</summary><button type="button">Refresh evidence steps</button><select aria-label="Completed controlled-human evidence step"><option value="">Select completed proof</option></select><pre data-testid="controlled-human-safe-anchor"></pre><pre data-testid="controlled-human-safe-binding"></pre></details></section>`);
    await page.locator('button').evaluate(button => button.addEventListener('click', () => {
      const select = document.querySelector('select');
      select.add(new Option('CH-01 · resolve-material-assess-conflict', 'CH-01:resolve-material-assess-conflict'));
      document.querySelector('[data-testid="controlled-human-safe-anchor"]').textContent = JSON.stringify({ stepId: 'resolve-material-assess-conflict' });
      document.querySelector('[data-testid="controlled-human-safe-binding"]').textContent = JSON.stringify({ stepId: 'resolve-material-assess-conflict' });
    }));
    const interactions = [];
    const proof = await collectProof(page, 'CH-01', 'resolve-material-assess-conflict', interactions);
    assert.equal(proof.serverBinding.stepId, 'resolve-material-assess-conflict');
    assert.deepEqual(interactions, ['inspect-proof:ch-01:resolve-material-assess-conflict']);
    assert.equal(await page.locator('details').getAttribute('open'), '');
  } finally { await browser.close(); }
});

test('CH-12 waits for the real evidence banner across both revoked-actor reloads', async () => {
  const { build } = await import('vite');
  const planned = buildBrowserExecutionCatalog().find(step => step.checkpointId === 'CH-12' && step.stepId === 'revoked-actor-projection-denied');
  assert(planned?.serverAction);
  const workspaceId = '11111111-1111-4111-a111-111111111111';
  const requestId = '77777777-7777-4777-a777-777777777777';
  const descriptor = buildSyntheticApiEvidenceDescriptor(planned, { workspaceId, authorizationVersion: 7 });
  const challengeToken = `sha256:${'2'.repeat(64)}`;
  const bindingToken = `sha256:${'3'.repeat(64)}`;
  const safeAnchor = {
    contractVersion: 'pr-c-controlled-human-step-anchor-1', stepId: planned.stepId, action: planned.serverAction.action,
    targetFamily: descriptor.targetFamily,
    targetDigest: canonicalDigest({ resourceFamily: descriptor.targetFamily, resourceId: descriptor.targetId }),
    expectedVersion: descriptor.expectedVersion, transitionKind: planned.serverAction.transitionKind,
    selectorDigest: canonicalDigest(descriptor.selectorBindings), intentDigest: `sha256:${'4'.repeat(64)}`,
    requestDigest: `sha256:${'5'.repeat(64)}`, challengeToken,
  };
  const safeBinding = {
    contractVersion: 'pr-c-controlled-human-step-binding-3', stepId: planned.stepId, action: planned.serverAction.action,
    result: 'denied', expectedVersion: descriptor.expectedVersion, observedVersion: descriptor.expectedVersion,
    denialCodeDigest: canonicalDigest({ denialCode: planned.serverAction.expectedDenialCode }), anchorToken: challengeToken,
    requestDigest: safeAnchor.requestDigest, intentDigest: safeAnchor.intentDigest, bindingToken,
  };
  const source = `import React, { useEffect, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Banner from './components/auth/ControlledHumanNonProductionBanner';
    const record = event => { const events = JSON.parse(localStorage.getItem('events') || '[]'); events.push(event); localStorage.setItem('events', JSON.stringify(events)); };
    const App = () => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const load = Number(localStorage.getItem('loads') || '0') + 1;
        localStorage.setItem('loads', String(load));
        const timer = setTimeout(() => { record('ready:' + load); setReady(true); }, 120);
        return () => clearTimeout(timer);
      }, []);
      return ready ? <Banner /> : <main>Loading workspace...</main>;
    };
    createRoot(document.getElementById('root')).render(<App />);`;
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-ch12-banner-readiness-fixture.tsx`;
  const compiled = await build({
    configFile: false, envDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'SyntheticCh12BannerReadiness', formats: ['iife'] } },
    plugins: [{ name: 'synthetic-ch12-banner-readiness', enforce: 'pre',
      resolveId(id) {
        if (id.replaceAll('\\', '/').endsWith('/synthetic-ch12-banner-readiness-fixture.tsx')) return entry;
        if (/services\/supabaseClient$/u.test(id)) return '\0synthetic-ch12-banner-backend';
      },
      load(id) {
        if (id === entry) return source;
        if (id === '\0synthetic-ch12-banner-backend') return `
          const step = ${JSON.stringify({ checkpointId: planned.checkpointId, stepId: planned.stepId, action: planned.serverAction.action })};
          const record = event => { const events = JSON.parse(localStorage.getItem('events') || '[]'); events.push(event); localStorage.setItem('events', JSON.stringify(events)); };
          export const getControlledHumanBrowserBinding = () => ({ status: 'authorized' });
          export const listControlledHumanStepBindings = async () => {
            const proof = JSON.parse(localStorage.getItem('completedProof') || 'null');
            return [{ ...step, state: proof ? 'completed' : 'unanchored', safeAnchor: proof?.serverAnchor ?? null, safeBinding: proof?.serverBinding ?? null }];
          };
          export const getLastCompletedControlledHumanProof = () => null;
          export const armControlledHumanStep = option => {
            if (option.checkpointId !== step.checkpointId || option.stepId !== step.stepId) throw new Error('fixture arm mismatch');
            localStorage.setItem('armed', 'true'); record('arm');
          };
        `;
      },
    }],
  });
  const script = compiled[0].output.find(file => file.type === 'chunk').code;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.route('https://synthetic.invalid/**', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div><script>' + script + '</script></body></html>',
    }));
    await page.goto('https://synthetic.invalid/');
    await page.getByText('Controlled human test', { exact: false }).waitFor({ state: 'visible' });
    const calls = [];
    const api = {
      async rpc(name) {
        calls.push(name);
        if (name === 'pr_c_controlled_human_anchor_step') {
          assert.equal(await page.evaluate(() => localStorage.getItem('armed')), 'true');
          await page.evaluate(() => { const events = JSON.parse(localStorage.getItem('events') || '[]'); events.push('anchor'); localStorage.setItem('events', JSON.stringify(events)); });
          return { safeAnchor, execution: { requestId } };
        }
        assert.equal(name, 'pr_c_controlled_human_execute_denied_step');
        await page.evaluate(proof => {
          const events = JSON.parse(localStorage.getItem('events') || '[]'); events.push('denial'); localStorage.setItem('events', JSON.stringify(events));
          localStorage.setItem('completedProof', JSON.stringify(proof));
        }, { serverAnchor: safeAnchor, serverBinding: safeBinding });
        return safeBinding;
      },
      async invoke() { assert.fail('revoked-actor denial must not invoke an ordinary command'); },
    };
    let tick = Date.parse('2026-09-30T00:00:00.000Z');
    const result = await executePlannedStep({
      planned,
      session: { page, api, identity: { applicationActorDigest: exerciseDigest, applicationSessionDigest: exerciseDigest } },
      providerEgress: [], state: new Map(), nextTime: () => new Date(tick += 1).toISOString(),
      apiDescriptor: descriptor, exerciseDigest,
    });
    assert.deepEqual(calls, ['pr_c_controlled_human_anchor_step', 'pr_c_controlled_human_execute_denied_step']);
    assert.deepEqual(result.browserArtifact.serverAnchor, safeAnchor);
    assert.deepEqual(result.browserArtifact.serverBinding, safeBinding);
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('events') || '[]'));
    assert.deepEqual(events, ['ready:1', 'ready:2', 'arm', 'anchor', 'denial', 'ready:3']);
    assert.equal(await page.evaluate(() => localStorage.getItem('loads')), '3');
    assert(result.browserArtifact.interactionSequence.indexOf(`arm:ch-12:${planned.stepId}`)
      < result.browserArtifact.interactionSequence.indexOf(`api:preanchor:ch-12:${planned.stepId}`));
    assert(result.browserArtifact.interactionSequence.indexOf(`api:preanchor:ch-12:${planned.stepId}`)
      < result.browserArtifact.interactionSequence.indexOf(`api:server-owned-denial:${planned.stepId}`));
    assert.equal(requests.every(url => new URL(url).hostname === 'synthetic.invalid'), true);
  } finally { await browser.close(); }
});

test('evidence readiness fails closed for missing, blocked, and duplicate surfaces', async () => {
  const browser = await chromium.launch();
  try {
    for (const [markup, code] of [
      ['<main>Loading workspace...</main>', 'PR_C_SYNTHETIC_BROWSER_PROOF_PANEL_COUNT'],
      ['<main>Loading workspace...</main><script>setTimeout(() => document.body.insertAdjacentHTML(\'beforeend\', \'<section data-testid="controlled-human-environment-blocked">Blocked</section>\'), 25)</script>', 'PR_C_SYNTHETIC_BROWSER_PREVIEW_BINDING_BLOCKED'],
      ['<section data-testid="controlled-human-nonproduction-banner"><details></details></section><section data-testid="controlled-human-nonproduction-banner"><details></details></section>', 'PR_C_SYNTHETIC_BROWSER_PROOF_BANNER_COUNT'],
      ['<section data-testid="controlled-human-nonproduction-banner"><details></details><details></details></section>', 'PR_C_SYNTHETIC_BROWSER_PROOF_PANEL_COUNT'],
    ]) {
      const page = await browser.newPage();
      await page.setContent(markup);
      await assert.rejects(collectProof(page, 'CH-12', 'revoked-actor-projection-denied', [], { timeoutMs: 150 }), new RegExp(code, 'u'));
      await page.close();
    }
  } finally { await browser.close(); }
});

test('completed evidence leaves workspace actions clickable in the fixed-height app shell', async () => {
  const { build } = await import('vite');
  const { default: postcss } = await import('postcss');
  const { default: tailwindcss } = await import('tailwindcss');
  const { default: tailwindConfig } = await import('../tailwind.config.js');
  const stepId = 'resolve-material-assess-conflict';
  const safeAnchor = { stepId, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`anchorField${i}`, exerciseDigest])) };
  const safeBinding = { stepId, ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`bindingField${i}`, exerciseDigest])) };
  const revisionStepId = 'commit-only-explicitly-edited-descendants';
  const revisionAnchor = { ...safeAnchor, stepId: revisionStepId };
  const revisionBinding = { ...safeBinding, stepId: revisionStepId };
  const revisionRecord = { checkpointId: 'CH-07', stepId: revisionStepId, state: 'completed', safeAnchor: revisionAnchor, safeBinding: revisionBinding };
  const records = [{ checkpointId: 'CH-01', stepId, state: 'completed', safeAnchor, safeBinding },
    ...buildBrowserExecutionCatalog().filter(step => step.personaKey === 'requester' && step.serverAction && step.stepId !== stepId)
      .map(step => ({ checkpointId: step.checkpointId, stepId: step.stepId, action: step.serverAction.action, state: 'unanchored', safeAnchor: null, safeBinding: null })),
  ];
  const lineage = [{ sourceSetId: 'set', sourceSetVersionSelector: 'set-v1', sourceSetVersion: 1, ordinal: 1 }];
  const candidate = { id: 'candidate', candidateVersion: 1, inputBundleId: 'bundle', inputBundleVersionSelector: 'bundle-v1',
    extractionBindingId: 'extraction-binding', extractionJobId: 'extraction-job', sourceSetId: 'set', sourceSetVersionSelector: 'set-v1',
    sourceSetVersion: 1, sourceVersionSelector: 'source-v1', sourceLabel: 'Synthetic transcript', sourceVersionLabel: 'Source version 1',
    field: 'process_objective', value: 'Reviewed synthetic description', sourceLocator: 'Synthetic excerpt', safeExcerpt: 'Synthetic evidence',
    status: 'accepted', relationship: 'supporting', provenanceState: 'anchored', applicationIntent: 'set_case_field', applyTarget: 'description' };
  const projection = {
    features: { assessMultisourceApplyEnabled: true },
    inputBundles: [{ id: 'bundle', versionSelector: 'bundle-v1', version: 1, label: 'Synthetic assess transcript selection', versionLabel: 'Input-bundle version 1', status: 'locked', sourceSetIds: ['set'], sourceSetVersions: lineage, sourceVersionSelectors: ['source-v1'], sourceCount: 2 }],
    assessRuns: [{ inputBundleId: 'bundle', inputBundleVersionSelector: 'bundle-v1', sourceSetVersions: lineage, extractionBindings: [candidate], extractionJobIds: ['extraction-job'] }],
    assessCandidates: [candidate, { ...candidate, id: 'candidate-two' }],
    assessApplyPreviews: [{ id: 'preview', assessDraftId: 'draft', expectedDraftVersion: 1, inputBundleId: 'bundle', inputBundleVersionSelector: 'bundle-v1', inputBundleVersion: 1, status: 'ready',
      changes: [{ candidateId: 'candidate', target: 'description', summary: 'Reviewed description', conflictState: 'resolved' }],
      conflicts: [{ id: 'conflict', field: 'description', material: true, resolution: 'choose_candidate', resolutionVersion: 1, candidateSummaries: ['Synthetic candidate'], rationale: 'Synthetic resolved conflict.' }],
    }],
  };
  const source = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import Banner from './components/auth/ControlledHumanNonProductionBanner';
    import { AssessTranscriptCandidateReview } from './components/enterprise/AssessTranscriptCandidateReview';
    createRoot(document.getElementById('root')).render(<div className="app-shell flex h-screen">
      <aside className="hidden lg:block w-60 shrink-0">Navigation</aside>
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Banner />
        <header className="header glass sticky top-0 z-10 flex h-16 items-center">Workspace</header>
        <section className="border-b px-4 py-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {['Organization', 'Workspace'].map(label => <label key={label} className="flex-1 text-[11px]">{label}<select className="mt-1 block w-full px-3 py-2 text-sm"><option>Synthetic workspace</option></select></label>)}
          <div className="px-4 py-2 text-xs">Server context active</div>
        </div></section>
        <main id="app-main" className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          <header className="rounded-3xl border p-5"><h1>Enterprise Intelligence</h1><nav className="mt-5 flex gap-2 overflow-x-auto pb-1">Candidate Review</nav><p className="mt-4">Conflict resolved with immutable history.</p></header>
          <AssessTranscriptCandidateReview projection={${JSON.stringify(projection)}} assessDrafts={[{ id: 'draft', label: 'Synthetic draft', versionLabel: 'Draft version 1' }]} locked={false}
            onApply={() => { document.getElementById('app-main').dataset.applied = 'true'; }} />
          </div>
        </main>
      </div>
    </div>);`;
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-banner-layout-fixture.tsx`;
  const compiled = await build({
    configFile: false, envDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'SyntheticBannerLayout', formats: ['iife'] } },
    plugins: [{ name: 'inert-synthetic-banner-backend', enforce: 'pre',
      resolveId(id) {
        if (id.replaceAll('\\', '/').endsWith('/synthetic-banner-layout-fixture.tsx')) return entry;
        if (/services\/supabaseClient$/u.test(id)) return '\0inert-synthetic-backend';
      },
      load(id) {
        if (id === entry) return source;
        if (id === '\0inert-synthetic-backend') return `
        export const getControlledHumanBrowserBinding = () => ({ status: 'authorized' });
        export const listControlledHumanStepBindings = async () => {
          window.proofReads = (window.proofReads || 0) + 1;
          const records = ${JSON.stringify(records)};
          if (!window.proofMode) return records;
          if (window.proofMode === 'rejected') throw new Error('fixture-only rejection');
          const revision = ${JSON.stringify(revisionRecord)};
          // A list request observes the receipt state when that request starts.
          if (window.proofMode === 'missing' || window.proofReads === 1) {
            revision.state = 'anchored'; revision.safeBinding = null;
          }
          await new Promise(resolve => setTimeout(resolve, 40));
          return [...records, revision];
        };
        export const getLastCompletedControlledHumanProof = () => null;
        export const armControlledHumanStep = () => { window.proofArms = (window.proofArms || 0) + 1; throw new Error('unexpected arm'); };
      `;
      },
    }],
  });
  const css = await postcss([tailwindcss({ ...tailwindConfig, content: [
    { raw: source, extension: 'tsx' },
    { raw: await readFile(new URL('../components/auth/ControlledHumanNonProductionBanner.tsx', import.meta.url), 'utf8'), extension: 'tsx' },
    { raw: await readFile(new URL('../components/enterprise/AssessTranscriptCandidateReview.tsx', import.meta.url), 'utf8'), extension: 'tsx' },
  ] })]).process(await readFile(new URL('../index.css', import.meta.url), 'utf8'), { from: undefined });
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 412, height: 915 }]) {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', route => route.abort());
      await page.setContent('<div id="root"></div>');
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: compiled[0].output.find(file => file.type === 'chunk').code });
      assert.deepEqual(pageErrors, []);
      await page.getByLabel('Locked input bundle').selectOption('bundle:bundle-v1');
      await page.getByLabel('Editable Assess draft').selectOption('draft');
      const proof = await collectProof(page, 'CH-01', stepId, []);
      assert.deepEqual(proof, { serverAnchor: safeAnchor, serverBinding: safeBinding });
      const apply = page.getByRole('button', { name: 'Apply batch as one Assess draft version', exact: true });
      assert(await apply.isEnabled());
      const workspaceHeight = await page.locator('#app-main').evaluate(node => {
        const style = getComputedStyle(node);
        return node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      });
      assert(workspaceHeight >= 120, 'The expanded evidence panel must leave usable workspace height.');
      await apply.click({ timeout: 3000 });
      assert.equal(await page.locator('#app-main').getAttribute('data-applied'), 'true');
      await page.close();
      for (const mode of ['delayed', 'missing', 'rejected']) {
        const proofPage = await browser.newPage({ viewport });
        await proofPage.route('**/*', route => route.abort());
        await proofPage.setContent('<div id="root"></div>');
        await proofPage.evaluate(mode => { window.proofMode = mode; }, mode);
        await proofPage.addStyleTag({ content: css.css });
        await proofPage.addScriptTag({ content: compiled[0].output.find(file => file.type === 'chunk').code });
        const interactions = [];
        if (mode === 'delayed') {
          const proof = await collectProof(proofPage, 'CH-07', revisionStepId, interactions);
          assert.deepEqual(proof, { serverAnchor: revisionAnchor, serverBinding: revisionBinding });
          assert.deepEqual(interactions, [`inspect-proof:ch-07:${revisionStepId}`]);
          assert.equal(await proofPage.evaluate(() => window.proofReads), 2);
        } else {
          await assert.rejects(collectProof(proofPage, 'CH-07', revisionStepId, interactions, { timeoutMs: 650 }),
            new RegExp(mode === 'missing' ? 'COMPLETED_STEP_MISSING' : 'PROOF_REFRESH_REJECTED', 'u'));
          assert.deepEqual(interactions, []);
          if (mode === 'rejected') assert.equal(await proofPage.evaluate(() => window.proofReads), 1);
        }
        assert.equal(await proofPage.evaluate(() => window.proofArms || 0), 0);
        assert.equal(await proofPage.locator('#app-main').getAttribute('data-applied'), null);
        await proofPage.close();
      }
    }
  } finally { await browser.close(); }
});

test('post-Apply authoring links new evidence, persists it, and independently reviews both items', async () => {
  const { finalizeAssessDraftForReview, prepareAssessReviewApproval, SYNTHETIC_ASSESS_REVIEW_CLAIMS } = await import('./runPrCSyntheticAcceptanceBrowser.mjs');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<section data-testid="assess-v2-workspace">
      <p role="status" id="author-status"></p>
      <details><summary>4. Agent necessity and evidence</summary>
        <input aria-label="Evidence 1 claim IDs"><input aria-label="Evidence 1 owner" value="Assessment owner">
        <input aria-label="Evidence 2 claim IDs"><input aria-label="Evidence 2 owner">
      </details>
      <button>Reload current draft</button><button>Save V2 draft</button>
      <button disabled>Finalize reviewer-ready Decision Pack</button>
    </section>`);
    await page.evaluate(claims => {
      const inputs = [...document.querySelectorAll('input')];
      inputs[0].value = claims.join(', ');
      let saved = inputs.map(input => input.value);
      const [reload, save, finalize] = document.querySelectorAll('button');
      const status = document.querySelector('#author-status');
      const ready = () => { finalize.disabled = !saved[0] || !saved[2] || inputs.some((input, i) => input.value !== saved[i]); };
      for (const input of inputs) input.addEventListener('input', ready);
      reload.addEventListener('click', () => {
        inputs.forEach((input, i) => { input.value = saved[i]; });
        status.textContent = 'Current immutable draft projection reloaded.'; ready();
      });
      save.addEventListener('click', () => {
        saved = inputs.map(input => input.value);
        document.body.dataset.saves = String(Number(document.body.dataset.saves || 0) + 1);
        status.textContent = 'Draft saved as a new immutable authoring version.'; ready();
      });
      finalize.addEventListener('click', () => {
        const pack = document.createElement('div'); pack.dataset.testid = 'assess-v2-decision-pack'; pack.textContent = 'Reviewer-ready Decision Pack'; document.querySelector('[data-testid="assess-v2-workspace"]').append(pack);
        const review = document.createElement('section'); review.dataset.testid = 'assess-v2-review-workspace';
        review.innerHTML = `<section aria-labelledby="evidence-review-title"><h4 id="evidence-review-title">Independent evidence attestation</h4>${[0, 1].map(() => '<article><h5>Evidence submitted</h5><label>Reviewer rationale<textarea></textarea></label><button>Accept evidence</button></article>').join('')}</section><label>Review rationale<textarea></textarea></label><button disabled>Approve reviewed decision</button>`;
        document.body.append(review);
        for (const article of review.querySelectorAll('article')) article.querySelector('button').addEventListener('click', () => {
          if (!article.querySelector('textarea').value.trim()) return;
          article.querySelector('button').disabled = true;
          setTimeout(() => {
            article.querySelector('h5').textContent = 'Evidence accepted'; article.querySelector('button').remove();
            document.body.dataset.attestations = String(Number(document.body.dataset.attestations || 0) + 1);
            review.lastElementChild.disabled = review.querySelectorAll('article button').length !== 0;
          }, 50);
        });
      });
    }, SYNTHETIC_ASSESS_REVIEW_CLAIMS);
    const interactions = [];
    assert(await page.getByRole('button', { name: 'Finalize reviewer-ready Decision Pack', exact: true }).isDisabled());
    await finalizeAssessDraftForReview(page, interactions, { afterTranscriptApply: true });
    assert.equal(await page.getByLabel('Evidence 1 claim IDs', { exact: true }).inputValue(), SYNTHETIC_ASSESS_REVIEW_CLAIMS.join(', '));
    assert.equal(await page.getByLabel('Evidence 2 claim IDs', { exact: true }).inputValue(), 'primitive.businessDisposition');
    assert.equal(await page.locator('body').getAttribute('data-saves'), '1');
    await prepareAssessReviewApproval(page, interactions);
    assert.equal(await page.locator('body').getAttribute('data-attestations'), '2');
    assert.equal(await page.getByRole('button', { name: 'Accept evidence', exact: true }).count(), 0);
    assert(await page.getByRole('button', { name: 'Approve reviewed decision', exact: true }).isEnabled());
  } finally { await browser.close(); }
});

test('synthetic authored claims cover the actual scaffold decision trace without promoting unknown facts', async () => {
  const { build } = await import('vite');
  const { SYNTHETIC_ASSESS_REVIEW_CLAIMS } = await import('./runPrCSyntheticAcceptanceBrowser.mjs');
  const workspaceSource = await readFile(new URL('../components/assess-v2/AssessV2Workspace.tsx', import.meta.url), 'utf8');
  const extract = (start, end) => workspaceSource.slice(workspaceSource.indexOf(start), workspaceSource.indexOf(end));
  const source = `
    import { createUnknownAgentNecessityFacts } from './services/assessV2/types';
    import { evaluateAssessmentV2 } from './services/assessV2/evaluator';
    import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from './services/assessV2/fixture';
    ${extract('const unknownInteractionFacts =', 'type InteractionFactKey')}
    ${extract('const emptyDraft =', 'const toAuthorDraft =')}
    ${extract('const scaffold =', 'const capabilityCopy:')}
    export function evaluateFixture(claims) {
      const draft = scaffold(emptyDraft('synthetic-case', 'Synthetic process', 'Manually reviewed synthetic process'));
      draft.primitives[0].facts['primitive.rulesStable'] = { fieldId: 'primitive.rulesStable', value: true, status: 'known', source: 'user', evidenceIds: [] };
      Object.assign(draft.applicationAssets[0], { accountableOwner: 'Synthetic Assess owner', strategicLifespan: 'long' });
      draft.interactions[0].dataClassification = 'Internal';
      for (const key of ['interfaceAvailable', 'operationCovered', 'apiDocumented', 'errorContract']) draft.interactions[0].facts[key] = true;
      draft.evidenceLinks[0].claimIds = claims;
      const input = { ...AP_INVOICE_EXCEPTION_V2_FIXTURE, ...draft, assets: draft.applicationAssets, evidence: draft.evidenceLinks, updatedAt: new Date().toISOString() };
      return { decision: evaluateAssessmentV2(input), agentFacts: input.agentNecessity };
    }`;
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-assess-trace-fixture.ts`;
  const compiled = await build({ configFile: false, envDir: false, logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
    plugins: [{ name: 'synthetic-assess-trace-fixture', enforce: 'pre', resolveId: id => id.replaceAll('\\', '/').endsWith('/synthetic-assess-trace-fixture.ts') ? entry : undefined, load: id => id === entry ? source : undefined }],
  });
  const { evaluateFixture } = await import(`data:text/javascript;base64,${Buffer.from(compiled[0].output.find(file => file.type === 'chunk').code).toString('base64')}`);
  const { decision, agentFacts } = evaluateFixture(SYNTHETIC_ASSESS_REVIEW_CLAIMS);
  const materialClaims = [...new Set(decision.trace.flatMap(item => item.fieldIds))].filter(id => id !== 'evidence.coverage');
  assert(materialClaims.length > 15);
  assert.deepEqual(materialClaims.filter(id => !SYNTHETIC_ASSESS_REVIEW_CLAIMS.includes(id)), []);
  assert(Object.values(agentFacts).every(fact => fact.value === null && fact.status === 'unknown'));
  assert.equal(decision.candidateEvaluations.find(item => item.component === 'Bounded Agent').fit, 'Weak Fit');
  assert.equal(decision.confidence, 'Partially Evidenced', 'Authored claim links never grant independent reviewer approval.');
});

// Preserve the existing line-bound static evidence for the session fixture above.
import './prCSyntheticBrowserNavigation.test.mjs';
