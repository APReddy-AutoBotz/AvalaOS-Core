import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https?:\/\/(?!127\.0\.0\.1:4173).*/, route => route.abort());
});

test('server-configured local_demo exposes no demo authority', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Enterprise workspace')).toBeVisible();
  await expect(page.getByText('Controlled product sandbox')).toHaveCount(0);
  await expect(page.getByText('Demo roles')).toHaveCount(0);
  await expect(page.getByPlaceholder('name@company.com')).toHaveValue('');
  await expect(page.getByPlaceholder('Password')).toHaveValue('');
});

test('landing page explains the governed lifecycle with canonical branding and no external imagery', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('img', { name: 'Avala OS — Assess, Validate, Align, Launch, Audit' })).toBeVisible();
  const heading = page.getByRole('heading', {
    level: 1,
    name: 'Evaluate before you automate. Govern before you execute.',
  });
  await expect(heading).toBeVisible();
  await expect(page.getByText('Governed AI & Automation Delivery OS')).toBeVisible();
  await expect(page.getByText('deterministic recommendations', { exact: false })).toBeVisible();
  await expect(page.getByText('does not execute bots, RPA jobs, agents, or external systems', { exact: false })).toBeVisible();

  for (const moduleName of ['Avala Assess', 'Avala Govern', 'Avala Studio', 'Avala Delivery', 'Avala Monitor']) {
    await expect(page.getByText(moduleName, { exact: true })).toBeVisible();
  }

  for (const assetPath of [
    '/brand/avala-os-primary-logo.svg',
    '/brand/avala-os-app-icon.svg',
    '/brand/avala-os-hero-logo.svg',
    '/brand/avala-os-enterprise-lockup.svg',
  ]) {
    const response = await page.request.get(assetPath);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
  }

  await expect(page.locator('img[src^="http://"], img[src^="https://"]')).toHaveCount(0);
  const layout = await heading.evaluate(element => {
    const style = getComputedStyle(element);
    const visibleWeights = Array.from(document.querySelectorAll('main *')).flatMap(node => {
      const nodeStyle = getComputedStyle(node);
      if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden') return [];
      return [Number.parseInt(nodeStyle.fontWeight, 10) || 400];
    });
    return {
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      headingFamily: style.fontFamily,
      headingWeight: style.fontWeight,
      maximumVisibleWeight: Math.max(...visibleWeights),
    };
  });

  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.bodyClientWidth);
  expect(layout.headingFamily).toContain('Outfit');
  expect(layout.headingWeight).toBe('700');
  expect(layout.maximumVisibleWeight).toBeLessThanOrEqual(700);

  const landingShell = page.locator('.enterprise-landing');
  const scrollLayout = await landingShell.evaluate(element => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollLayout.overflowY).toBe('auto');
  expect(scrollLayout.scrollHeight).toBeGreaterThan(scrollLayout.clientHeight);
  await landingShell.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('heading', { name: 'Decision quality before delivery velocity' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
});

test('sanitizes hostile Markdown and SVG and blocks false-success persistence', async ({ page }) => {
  await page.goto('/browser-harness.html');

  const markdown = page.getByTestId('markdown-sink');
  await expect(markdown).toContainText('safe');
  await expect(markdown.locator('script, img, iframe')).toHaveCount(0);
  await expect(markdown.locator('a')).not.toHaveAttribute('href', /javascript:/i);
  const title = page.getByTestId('title-sink');
  await expect(title).toContainText('<img src=x onerror=alert(1)>safe title');
  await expect(title.locator('img')).toHaveCount(0);
  const svg = page.getByTestId('svg-sink');
  await expect(svg).toContainText('safe diagram');
  await expect(svg.locator('script, foreignObject, iframe')).toHaveCount(0);

  await page.getByRole('button', { name: 'Test rejected persistence' }).click();
  await expect(page.getByTestId('persistence-status')).toContainText('Document persistence authority is unavailable.');
  await expect(page.getByTestId('committed')).toHaveText('false');
});

test('dialog traps focus, closes with Escape, restores focus, and has no serious axe findings', async ({ page }) => {
  await page.goto('/browser-harness.html');
  const opener = page.getByRole('button', { name: 'Open controlled dialog' });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Controlled dialog' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close Controlled dialog' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Last action' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
});

test('task dialog is opaque, responsive, and preserves complete project identity without horizontal overflow', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'chromium-desktop') {
    await page.setViewportSize({ width: 1000, height: 710 });
  }
  await page.goto('/browser-harness.html');
  await page.getByRole('button', { name: 'Open task detail' }).click();

  const dialog = page.getByRole('dialog', { name: 'Route PO mismatch exceptions to AP owner review' });
  const projectValue = dialog.getByText('AP Invoice Exception Workflow', { exact: true });
  await expect(dialog).toBeVisible();
  await expect(projectValue).toBeVisible();

  const layout = await dialog.evaluate(element => {
    const panel = element as HTMLElement;
    const body = panel.lastElementChild as HTMLElement;
    const title = panel.querySelector('h2') as HTMLElement;
    const overlay = panel.parentElement as HTMLElement;
    return {
      background: getComputedStyle(panel).backgroundColor,
      bodyOverflowX: getComputedStyle(body).overflowX,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      panelWidth: panel.getBoundingClientRect().width,
      overlayBackground: getComputedStyle(overlay).backgroundColor,
      titleFamily: getComputedStyle(title).fontFamily,
      titleWeight: getComputedStyle(title).fontWeight,
    };
  });
  const projectStyle = await projectValue.evaluate(element => ({
    textOverflow: getComputedStyle(element).textOverflow,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }));

  expect(layout.background).toBe('rgb(255, 255, 255)');
  expect(layout.overlayBackground).toBe('rgba(2, 6, 23, 0.6)');
  expect(layout.bodyOverflowX).toBe('hidden');
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.bodyClientWidth);
  expect(layout.panelWidth).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth - 32));
  expect(layout.titleFamily).toContain('Inter');
  expect(layout.titleWeight).toBe('700');
  expect(projectStyle.textOverflow).not.toBe('ellipsis');
  expect(projectStyle.whiteSpace).toBe('normal');

  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);
});

test('production document HTML helper escapes export metadata and executes no hostile markup', async ({ page }) => {
  await page.goto('/browser-harness.html');
  const exported = page.frameLocator('[data-testid="document-export"]');
  await expect(exported.locator('h1')).toContainText('<img src=x onerror=parent.__exportPwned=true> Unicode');
  await expect(exported.locator('script, img, iframe, svg, foreignObject')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as any).__exportPwned ?? false)).toBe(false);
});