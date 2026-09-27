import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from '@playwright/test';

import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_EXECUTION_ORDER,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
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
  latestCompletedAt,
  parsePasswordBundle,
  safeBrowserRoute,
  safeBrowserStepFailure,
  selectAssessTranscriptSources,
  signIn,
} from './runPrCSyntheticAcceptanceBrowser.mjs';
import {
  deriveSyntheticApplicationActorDigest,
  deriveSyntheticApplicationSessionDigest,
} from './prCSyntheticIdentity.mjs';

const exerciseDigest = `sha256:${'a'.repeat(64)}`;
const actorId = '30000001-0000-4000-8000-000000000001';
const sessionId = '40000001-0000-4000-8000-000000000001';

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
  assert.match(source, /20260926053818/u);
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

test('completed evidence leaves workspace actions clickable in the fixed-height app shell', async () => {
  const { build } = await import('vite');
  const { default: postcss } = await import('postcss');
  const { default: tailwindcss } = await import('tailwindcss');
  const { default: tailwindConfig } = await import('../tailwind.config.js');
  const stepId = 'resolve-material-assess-conflict';
  const safeAnchor = { stepId, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`anchorField${i}`, exerciseDigest])) };
  const safeBinding = { stepId, ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`bindingField${i}`, exerciseDigest])) };
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
        export const listControlledHumanStepBindings = async () => ${JSON.stringify(records)};
        export const getLastCompletedControlledHumanProof = () => null;
        export const armControlledHumanStep = () => { throw new Error('unexpected arm'); };
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
    }
  } finally { await browser.close(); }
});
