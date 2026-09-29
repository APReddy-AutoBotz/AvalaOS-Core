import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium, devices } from '@playwright/test';
import { openSurface, observeBrowserOnlyStep, executePlannedStep, buildBrowserExecutionCatalog, collectProof } from './runPrCSyntheticAcceptanceBrowser.mjs';

// Real sidebar, authorization guard, route resolver, Delivery and both Monitor
// components. Only authentication and server projections are inert fixtures.
let fixturePromise;
const fixture = () => fixturePromise ??= (async () => {
  const { build } = await import('vite');
  const { default: postcss } = await import('postcss');
  const { default: tailwindcss } = await import('tailwindcss');
  const { default: tailwindConfig } = await import('../tailwind.config.js');
  const source = `import React, { useEffect, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Sidebar from './components/shared/Sidebar';
    import Header from './components/shared/Header';
    import { EnterpriseSessionToolbar } from './components/auth/EnterpriseSessionBoundary';
    import PortfolioView from './components/shared/PortfolioView';
    import EnterpriseIntelligenceView from './components/enterprise/EnterpriseIntelligenceView';
    import Banner from './components/auth/ControlledHumanNonProductionBanner';
    import { View, ScopeType } from './types';
    import { resolveViewAccess } from './services/viewAccessGuard';
    import { resolveGovernedCreationSurface } from './services/governedCreationNavigation';
    import fixture from './testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json';
    const persona = fixture.personas.find(value => value.key === window.fixturePersona);
    const user = { id: 'synthetic-user', name: 'Synthetic actor', email: 'synthetic@example.invalid', orgRole: 'Contributor', permissions: [] };
    const organization = { id: 'synthetic-org', name: 'Synthetic organization', subscriptionTier: 'Enterprise', members: [], enabledModules: ['assess','docs','delivery','monitor'] };
    window.fixtureAuth = { user, loading: false, signOut: () => {} };
    window.fixtureOrganization = { currentOrganization: organization, organizations: [organization], currentWorkspace: { id: 'synthetic-workspace', name: 'Synthetic workspace' }, workspaces: [{ id: 'synthetic-workspace', name: 'Synthetic workspace' }], loading: false, sessionState: 'active', selectOrganization: () => {}, selectWorkspace: () => {} };
    const baseline = { id: window.fixtureSnapshot.id ?? 'synthetic-baseline', version: window.fixtureSnapshot.version ?? 1, workPackageId: 'synthetic-package', workPackageVersion: 2,
      status: 'approved', readiness: 'review_required', lineageClassification: 'assessed', planningOnly: false,
      acceptedItemCount: 1, acceptedItems: [{ version: 1, type: 'milestone', title: 'Reviewed milestone', status: 'accepted' }],
      milestones: ['Reviewed milestone'], dependencies: [], blockers: [], risks: [] };
    const monitor = { contractVersion: 'enterprise-monitor-approved-baselines-2', organizationId: organization.id, workspaceId: 'synthetic-workspace',
      featureFlags: { monitorApprovedBaselineEnabled: true }, readOnly: true, liveTelemetryConnected: false, baselines: [baseline], actions: [] };
    const delivery = { contractVersion: 'enterprise-delivery-workspace-2', organizationId: organization.id, workspaceId: 'synthetic-workspace',
      featureFlags: { moduleHandoffsEnabled: true, directDeliveryPlanningEnabled: true, deliveryItemReviewEnabled: true, monitorApprovedBaselineEnabled: true },
      readOnly: false, page: { packageLimit: 100, packageHasMore: false, handoffLimit: 100, handoffHasMore: false, itemHistoryLimit: 250, eventHistoryLimit: 50,
      handoffTargetItemLimit: 250, baselineEligibilityLimit: 100, baselineEligibilityHasMore: false, baselineEligibilityCursorApplied: false },
      eligibleStudioArtifacts: [], baselineEligibility: [], inbox: [], outbox: [], packages: [], actions: [] };
    window.fixtureProjection = { organizationId: organization.id, workspaceId: 'synthetic-workspace', authorizationVersion: 1,
      availability: 'available', providers: [], evidenceCandidates: [], applications: [], evidenceSources: [], assessDrafts: [], modernizationDecisions: [],
      transcriptFlow: { features: { assessMultisourceApplyEnabled: false } }, deliveryWorkspace: delivery, monitorApprovedBaselines: monitor };
    function Shell() {
      const [shellReady, setShellReady] = useState(false);
      useEffect(() => { const timer = setTimeout(() => setShellReady(true), 150); return () => clearTimeout(timer); }, []);
      const [view, setView] = useState(View.PROCESS_CATALOG);
      const [mobileOpen, setMobileOpen] = useState(false);
      const access = resolveViewAccess({ user, authLoading: false, organization, enabledModules: organization.enabledModules,
        authoritativeCapabilities: persona.capabilities, view, scope: { type: ScopeType.MY_WORK } });
      const isDelivery = access.allowed && resolveGovernedCreationSurface('server', view) === 'delivery';
      if (!shellReady) return <p>Loading authenticated workspace</p>;
      return <div className="app-shell flex h-screen text-text-light dark:text-text-dark font-sans">
        <Sidebar currentScope={{ type: ScopeType.MY_WORK }} currentView={view} onViewChange={setView}
          onAdminNavigate={() => {}} collapsed={false} onToggleCollapse={() => {}} canAccessAdmin={false} canAccessGovern={false}
          authoritativeViewCapabilities={persona.capabilities} onOpenGovern={() => {}} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex flex-col flex-1 overflow-hidden relative"><Banner />
          <Header theme="light" toggleTheme={() => {}} currentScope={{ type: ScopeType.MY_WORK }} currentView={view}
            onScopeChange={() => {}} currentUser={user} teams={[]} projects={[]} mobileNavigationOpen={mobileOpen} onToggleNavigation={() => setMobileOpen(value => !value)} />
          <EnterpriseSessionToolbar />
          <main id="app-main" tabIndex={0} className="view-transition-enter view-transition-enter-active flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div data-testid="fixture-ready" data-route={view} />
          {isDelivery ? <EnterpriseIntelligenceView organization={organization} workspace={{ id: 'synthetic-workspace' }} currentUser={user} initialTab="delivery" /> : access.allowed && view === View.PORTFOLIO ? <PortfolioView projects={[]} tasks={[]} users={[]} onUpdateProjectStage={() => {}}
            onScopeChange={() => {}} onViewChange={setView} canonicalMonitorContext={{ actorId: user.id, organizationId: organization.id, workspaceId: 'synthetic-workspace', expectedAuthorizationVersion: 1 }} /> : <p>Authorized navigation required</p>}
        </main></div>
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Shell />);`;
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-navigation-fixture.tsx`;
  const compiled = await build({ configFile: false, envDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'SyntheticNavigation', formats: ['iife'] } },
    plugins: [{ name: 'inert-navigation-context', enforce: 'pre', resolveId(id) {
      if (id.replaceAll('\\', '/').endsWith('/synthetic-navigation-fixture.tsx')) return entry;
      if (/AuthProvider$/u.test(id)) return '\0fixture-auth';
      if (/OrganizationProvider$/u.test(id)) return '\0fixture-organization';
      if (/services\/supabaseClient$/u.test(id)) return '\0fixture-backend';
      if (/services\/enterpriseIntelligenceClient$/u.test(id)) return '\0fixture-enterprise';
    }, load(id) {
      if (id === entry) return source;
      if (id === '\0fixture-auth') return 'export const useAuth = () => window.fixtureAuth;';
      if (id === '\0fixture-organization') return 'export const useOrganizationContext = () => window.fixtureOrganization;';
      if (id === '\0fixture-backend') return `
        export const getRuntimeDataAccess = () => 'server';
        export const getControlledHumanEvidenceState = () => null;
        export const isControlledHumanRuntimeEnabled = () => false;
        export const getControlledHumanBrowserBinding = () => ({ status: 'authorized' });
        export const getLastCompletedControlledHumanProof = () => null;
        export const armControlledHumanStep = () => { throw new Error('unexpected mutation'); };
        export const listControlledHumanStepBindings = async () => [{ checkpointId: 'CH-08', stepId: 'replay-baseline-creation', state: 'completed',
          safeAnchor: { stepId: 'replay-baseline-creation', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['anchorField'+i, 'sha256:'+'a'.repeat(64)])) }, safeBinding: { stepId: 'replay-baseline-creation', ...Object.fromEntries(Array.from({ length: 19 }, (_, i) => ['bindingField'+i, 'sha256:'+'a'.repeat(64)])) } }];
      `;
      if (id === '\0fixture-enterprise') return `
        export const bytesToBase64 = () => { throw new Error('unexpected upload'); };
        export class EnterpriseIntelligenceClientError extends Error {};
        export const getProviderLifecycleAuthorizationVersion = () => 1;
        export const enterpriseIntelligenceClient = new Proxy({}, { get(_, key) {
          if (key === 'loadMonitorApprovedBaselines') return async () => { await new Promise(resolve => setTimeout(resolve, 40)); return window.fixtureProjection.monitorApprovedBaselines; };
          if (key === 'loadProjection') return async () => { await new Promise(resolve => setTimeout(resolve, 40)); return window.fixtureProjection; };
          return () => { window.fixtureMutationCalls = (window.fixtureMutationCalls || 0) + 1; throw new Error('unexpected server action'); };
        } });
      `;
    } }],
  });
  const files = ['components/shared/Sidebar.tsx', 'components/shared/Header.tsx', 'components/auth/EnterpriseSessionBoundary.tsx', 'components/shared/PortfolioView.tsx', 'components/delivery/GovernedDeliveryWorkspace.tsx', 'components/enterprise/EnterpriseIntelligenceView.tsx', 'components/auth/ControlledHumanNonProductionBanner.tsx'];
  const content = [{ raw: source, extension: 'tsx' }, ...await Promise.all(files.map(async file => ({ raw: await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), extension: 'tsx' })))];
  const css = await postcss([tailwindcss({ ...tailwindConfig, content })]).process(await readFile(new URL('../index.css', import.meta.url), 'utf8'), { from: undefined });
  return { css: css.css, code: compiled[0].output.find(file => file.type === 'chunk').code };
})();

const mount = async (browser, persona, viewport, snapshot = {}) => {
  const built = await fixture();
  const page = await browser.newPage({ ...(viewport.width === 412 ? devices['Pixel 7'] : devices['Desktop Chrome']), viewport });
  page.setDefaultTimeout(2500);
  await page.route('**/*', route => route.abort());
  const origin = 'http://127.0.0.1:19364/';
  await page.route(origin, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
    `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${built.css}</style></head><body><div id="root"></div><script>window.fixturePersona=${JSON.stringify(persona)};window.fixtureSnapshot=${JSON.stringify(snapshot)};</script><script>${built.code.replaceAll('</script>', '<\\/script>')}</script></body></html>` }));
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.getByTestId('fixture-ready').waitFor({ state: 'attached' });
  return page;
};
const viewports = [{ width: 1280, height: 720 }, { width: 412, height: 915 }];

test('actual sidebar routes Delivery and Monitor personas without Assess authority on desktop and Pixel', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      for (const persona of ['delivery_target_acceptor', 'delivery_consumer', 'delivery_author', 'delivery_reviewer', 'delivery_approver', 'monitor_viewer']) {
        const page = await mount(browser, persona, viewport);
        const sidebar = page.getByRole('navigation', { name: 'Product lifecycle' });
        assert.equal(await sidebar.getByRole('button', { name: 'Assess', exact: true }).count(), 0);
        assert.equal(await sidebar.getByRole('button', { name: 'Enterprise Intelligence', exact: true }).count(), 0);
        const interactions = [];
        const monitor = persona === 'monitor_viewer';
        if (monitor) assert.equal(await sidebar.getByRole('button', { name: 'Delivery', exact: true }).count(), 0);
        await openSurface(page, monitor ? 'monitor' : 'delivery', interactions);
        await page.getByTestId(monitor ? 'canonical-monitor-baselines' : 'governed-delivery-workspace').waitFor({ state: 'visible' });
        assert.deepEqual(interactions, monitor ? ['navigate:monitor'] : ['navigate:delivery', 'tab:work-package']);
        await page.close();
      }
    }
  } finally { await browser.close(); }
});

test('read-only Monitor step refreshes a baseline created in another actor session', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const snapshot = {};
      const page = await mount(browser, 'monitor_viewer', viewport, snapshot);
      await openSurface(page, 'monitor', []);
      assert.equal(await page.locator('article[data-baseline-id]').getAttribute('data-baseline-id'), 'synthetic-baseline');
      // A different session commits a new immutable baseline. Existing DOM stays
      // old until the real step refreshes its read-only projection.
      Object.assign(snapshot, { id: 'synthetic-next-baseline', version: 2 });
      const planned = buildBrowserExecutionCatalog().find(step => step.stepId === 'verify-minimized-baseline-parity');
      const state = new Map([['full-governed-package', { packageId: 'synthetic-package' }], ['ch08:baselineId', snapshot.id]]);
      const proof = await executePlannedStep({ planned, session: { page, identity: {} }, providerEgress: [], state, nextTime: () => new Date().toISOString() });
      assert.equal(proof.outcome, 'passed');
      assert(proof.browserArtifact.interactionSequence.includes('reload:fresh-server-projection'));
      assert.equal(await page.locator('article[data-baseline-id]').getAttribute('data-baseline-id'), snapshot.id);
      assert.equal(await page.locator('article[data-baseline-id]').getAttribute('data-baseline-version'), '2');
      await page.close();
    }
  } finally { await browser.close(); }
});

test('Monitor parity uses two authorized actors and rejects exact baseline data drift, not different surface headings', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const viewer = await mount(browser, 'monitor_viewer', viewport);
      const approver = await mount(browser, 'delivery_approver', devices['Desktop Chrome'].viewport);
      const state = new Map([
        ['full-governed-package', { packageId: 'synthetic-package' }], ['ch08:baselineId', 'synthetic-baseline'],
        ['sessions', new Map([['delivery_approver', { page: approver, identity: { applicationActorDigest: `sha256:${'a'.repeat(64)}`, applicationSessionDigest: `sha256:${'b'.repeat(64)}` } }]])],
      ]);
      const observe = () => observeBrowserOnlyStep({ page: viewer, checkpointId: 'CH-09', stepId: 'compare-enterprise-and-primary-monitor', state, interactionSequence: [] });
      await openSurface(approver, 'delivery', []);
      await collectProof(approver, 'CH-08', 'replay-baseline-creation', []);
      const planned = buildBrowserExecutionCatalog().find(step => step.stepId === 'compare-enterprise-and-primary-monitor');
      const proof = await executePlannedStep({ planned, session: { page: viewer, identity: {} }, providerEgress: [], state, nextTime: () => new Date().toISOString() });
      assert.equal(proof.outcome, 'passed');
      assert(proof.browserArtifact.interactionSequence.includes('reload:fresh-server-projection'));
      assert(proof.browserArtifact.interactionSequence.includes('observe:supplementary-approver-enterprise-monitor'));
      assert.match(await observe(), /^sha256:[a-f0-9]{64}$/u);
      assert.notEqual(await viewer.locator('#canonical-monitor-title').innerText(), await approver.locator('#canonical-monitor-title').innerText());
      assert.equal(await viewer.getByTestId('enterprise-intelligence-workspace').count(), 0);
      for (const attribute of ['data-baseline-version', 'data-package-version', 'data-accepted-item-count', 'data-accepted-type-counts']) {
        const article = viewer.locator('article[data-baseline-id]');
        const original = await article.getAttribute(attribute);
        await article.evaluate((node, name) => node.setAttribute(name, 'drift'), attribute);
        await assert.rejects(observe, /MONITOR_PARITY_MISMATCH/u);
        await article.evaluate((node, value) => node.setAttribute(value.attribute, value.original), { attribute, original });
      }
      await viewer.getByRole('region', { name: 'Milestones', exact: true }).locator('li').evaluate(node => { node.textContent = 'Different milestone'; });
      await assert.rejects(observe, /MONITOR_PARITY_MISMATCH/u);
      assert.equal(await viewer.evaluate(() => window.fixtureMutationCalls || 0), 0);
      assert.equal(await approver.evaluate(() => window.fixtureMutationCalls || 0), 0);
      await viewer.close(); await approver.close();
    }
  } finally { await browser.close(); }
});
