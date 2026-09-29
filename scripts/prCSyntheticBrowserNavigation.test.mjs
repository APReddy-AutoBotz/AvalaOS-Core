import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { openSurface, observeBrowserOnlyStep, executePlannedStep, buildBrowserExecutionCatalog } from './runPrCSyntheticAcceptanceBrowser.mjs';

// Real sidebar, authorization guard, route resolver, Delivery and both Monitor
// components. Only authentication and server projections are inert fixtures.
let fixturePromise;
const fixture = () => fixturePromise ??= (async () => {
  const { build } = await import('vite');
  const { default: postcss } = await import('postcss');
  const { default: tailwindcss } = await import('tailwindcss');
  const { default: tailwindConfig } = await import('../tailwind.config.js');
  const source = `import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import Sidebar from './components/shared/Sidebar';
    import PortfolioView from './components/shared/PortfolioView';
    import GovernedDeliveryWorkspace, { MonitorApprovedBaselinePanel } from './components/delivery/GovernedDeliveryWorkspace';
    import { View, ScopeType } from './types';
    import { resolveViewAccess } from './services/viewAccessGuard';
    import { resolveGovernedCreationSurface } from './services/governedCreationNavigation';
    import fixture from './testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json';
    const persona = fixture.personas.find(value => value.key === window.fixturePersona);
    const user = { id: 'synthetic-user', name: 'Synthetic actor', email: 'synthetic@example.invalid', orgRole: 'Contributor', permissions: [] };
    const organization = { id: 'synthetic-org', name: 'Synthetic organization', subscriptionTier: 'Enterprise', members: [], enabledModules: ['assess','docs','delivery','monitor'] };
    window.fixtureAuth = { user, loading: false, signOut: () => {} };
    window.fixtureOrganization = { currentOrganization: organization, loading: false };
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
    function Shell() {
      const [view, setView] = useState(View.PROCESS_CATALOG);
      const [mobileOpen, setMobileOpen] = useState(false);
      const [tab, setTab] = useState('Work Package');
      const access = resolveViewAccess({ user, authLoading: false, organization, enabledModules: organization.enabledModules,
        authoritativeCapabilities: persona.capabilities, view, scope: { type: ScopeType.MY_WORK } });
      const isDelivery = access.allowed && resolveGovernedCreationSurface('server', view) === 'delivery';
      return <div className="flex h-screen">
        <Sidebar currentScope={{ type: ScopeType.MY_WORK }} currentView={view} onViewChange={setView}
          onAdminNavigate={() => {}} collapsed={false} onToggleCollapse={() => {}} canAccessAdmin={false} canAccessGovern={false}
          authoritativeViewCapabilities={persona.capabilities} onOpenGovern={() => {}} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <main className="flex-1 min-w-0 overflow-auto p-4">
          <button className="lg:hidden" onClick={() => setMobileOpen(true)}>Open navigation</button>
          <div data-testid="fixture-ready" data-route={view} />
          {isDelivery ? <section data-testid="enterprise-intelligence-workspace">
            <nav aria-label="Enterprise Intelligence surfaces">{['Work Package', 'Monitor Baseline'].map(label =>
              <button key={label} onClick={() => setTab(label)}>{label}</button>)}</nav>
            {tab === 'Work Package' ? <GovernedDeliveryWorkspace projection={delivery} onAction={() => { throw new Error('unexpected mutation'); }} />
              : persona.capabilities.includes('monitor.read') && <MonitorApprovedBaselinePanel projection={monitor} heading="Enterprise Intelligence canonical baseline" />}
          </section> : access.allowed && view === View.PORTFOLIO ? <PortfolioView projects={[]} tasks={[]} users={[]} onUpdateProjectStage={() => {}}
            onScopeChange={() => {}} onViewChange={setView} canonicalMonitorProjection={monitor} /> : <p>Authorized navigation required</p>}
        </main>
      </div>;
    }
    createRoot(document.getElementById('root')).render(<Shell />);`;
  const entry = `${process.cwd().replaceAll('\\', '/')}/synthetic-navigation-fixture.tsx`;
  const compiled = await build({ configFile: false, envDir: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: false, lib: { entry, name: 'SyntheticNavigation', formats: ['iife'] } },
    plugins: [{ name: 'inert-navigation-context', enforce: 'pre', resolveId(id) {
      if (id.replaceAll('\\', '/').endsWith('/synthetic-navigation-fixture.tsx')) return entry;
      if (/auth\/AuthProvider$/u.test(id)) return '\0fixture-auth';
      if (/auth\/OrganizationProvider$/u.test(id)) return '\0fixture-organization';
      if (/services\/supabaseClient$/u.test(id)) return '\0fixture-backend';
      if (/services\/enterpriseIntelligenceClient$/u.test(id)) return '\0fixture-enterprise';
    }, load(id) {
      if (id === entry) return source;
      if (id === '\0fixture-auth') return 'export const useAuth = () => window.fixtureAuth;';
      if (id === '\0fixture-organization') return 'export const useOrganizationContext = () => window.fixtureOrganization;';
      if (id === '\0fixture-backend') return 'export const getControlledHumanEvidenceState = () => null; export const isControlledHumanRuntimeEnabled = () => false;';
      if (id === '\0fixture-enterprise') return 'export const enterpriseIntelligenceClient = new Proxy({}, { get() { throw new Error("unexpected server read"); } });';
    } }],
  });
  const files = ['components/shared/Sidebar.tsx', 'components/shared/PortfolioView.tsx', 'components/delivery/GovernedDeliveryWorkspace.tsx'];
  const content = [{ raw: source, extension: 'tsx' }, ...await Promise.all(files.map(async file => ({ raw: await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), extension: 'tsx' })))];
  const css = await postcss([tailwindcss({ ...tailwindConfig, content })]).process(await readFile(new URL('../index.css', import.meta.url), 'utf8'), { from: undefined });
  return { css: css.css, code: compiled[0].output.find(file => file.type === 'chunk').code };
})();

const mount = async (browser, persona, viewport, snapshot = {}) => {
  const built = await fixture();
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(2500);
  await page.route('**/*', route => route.abort());
  const origin = 'http://127.0.0.1:19364/';
  await page.route(origin, route => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
    `<html><head><style>${built.css}</style></head><body><div id="root"></div><script>window.fixturePersona=${JSON.stringify(persona)};window.fixtureSnapshot=${JSON.stringify(snapshot)};</script><script>${built.code.replaceAll('</script>', '<\\/script>')}</script></body></html>` }));
  await page.goto(origin);
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
      const approver = await mount(browser, 'delivery_approver', viewport);
      const state = new Map([
        ['full-governed-package', { packageId: 'synthetic-package' }], ['ch08:baselineId', 'synthetic-baseline'],
        ['sessions', new Map([['delivery_approver', { page: approver, identity: { applicationActorDigest: `sha256:${'a'.repeat(64)}`, applicationSessionDigest: `sha256:${'b'.repeat(64)}` } }]])],
      ]);
      const observe = () => observeBrowserOnlyStep({ page: viewer, checkpointId: 'CH-09', stepId: 'compare-enterprise-and-primary-monitor', state, interactionSequence: [] });
      await openSurface(viewer, 'monitor', []);
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
      await viewer.close(); await approver.close();
    }
  } finally { await browser.close(); }
});
