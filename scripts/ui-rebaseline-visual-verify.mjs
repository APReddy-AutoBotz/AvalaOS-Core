import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const baseUrl = process.env.AVALA_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.AVALA_VISUAL_OUTPUT || 'C:/tmp/avalaos-ui-final');
const routes = ['/', '/platform', '/solutions', '/trust', '/sandbox'];
const publicRoutes = ['/', '/platform', '/solutions', '/trust'];
const viewports = [
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
  [360, 800],
];
const themes = ['light', 'dark'];
const failures = [];
const results = [];

await mkdir(outputDir, { recursive: true });

const slug = value => value === '/' ? 'home' : value.slice(1);
const themeKey = 'avalaos-public-theme';

const checkLayout = async (page, route, theme, width, height) => {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
  }));
  const horizontalOverflow = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth) - metrics.viewportWidth;
  if (horizontalOverflow > 1) failures.push(`${route} ${theme} ${width}x${height}: horizontal overflow ${horizontalOverflow}px`);
  if (route !== '/sandbox' && metrics.scrollHeight <= metrics.viewportHeight) failures.push(`${route} ${theme} ${width}x${height}: page is not vertically scrollable`);
  return metrics;
};

const checkAxe = async (page, route, theme, width, height) => {
  const report = await new AxeBuilder({ page }).analyze();
  const blocking = report.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  if (blocking.length > 0) failures.push(`${route} ${theme} ${width}x${height}: axe ${blocking.map(item => `${item.id} [${item.nodes.map(node => node.target.join(' ')).join(' | ')}]`).join(', ')}`);
  return { violations: report.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })) };
};

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(({ theme: initialTheme }) => {
      localStorage.setItem('avalaos-public-theme', initialTheme);
      localStorage.removeItem('avalaos-core-v1-current-user');
    }, { theme });
    for (const route of routes) {
      for (const [width, height] of viewports) {
        console.log(`Visual audit ${route} ${theme} ${width}x${height}`);
        await page.setViewportSize({ width, height });
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        try {
          if (publicRoutes.includes(route)) await page.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
          else await page.getByRole('button', { name: /Enter sandbox as Process Analyst/i }).waitFor({ state: 'visible', timeout: 15_000 });
        } catch (error) {
          failures.push(`${route} ${theme} ${width}x${height}: route did not render (${error.message})`);
          continue;
        }
        await page.waitForTimeout(150);
        const metrics = await checkLayout(page, route, theme, width, height);
        const axe = width === 1440 || width === 390 ? await checkAxe(page, route, theme, width, height) : { violations: [] };
        if (pageErrors.length > 0) failures.push(`${route} ${theme} ${width}x${height}: page errors ${pageErrors.join(' | ')}`);
        pageErrors.length = 0;
        await page.screenshot({ path: path.join(outputDir, `${slug(route)}-${theme}-${width}x${height}.png`), animations: 'disabled' });
        results.push({ route, theme, width, height, metrics, axe });
      }
    }
    await context.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.addInitScript(() => localStorage.setItem('avalaos-public-theme', 'light'));
  await interactionPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await interactionPage.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
  await interactionPage.keyboard.press('Tab');
  if (await interactionPage.locator('.av-skip-link').evaluate(element => document.activeElement !== element)) failures.push('skip link did not receive focus on first Tab');
  const publicMenu = interactionPage.getByRole('button', { name: /public navigation/i });
  await publicMenu.click();
  if ((await publicMenu.getAttribute('aria-expanded')) !== 'true') failures.push('public mobile menu did not open');
  if (!(await interactionPage.evaluate(() => document.activeElement?.closest('[aria-label="Mobile public site"]') !== null))) failures.push('public mobile menu did not move focus inside the drawer');
  await interactionPage.keyboard.press('Escape');
  if ((await publicMenu.getAttribute('aria-expanded')) !== 'false') failures.push('public mobile menu did not close on Escape');
  if (!(await interactionPage.evaluate(() => document.activeElement?.getAttribute('aria-label')?.match(/public navigation/i) !== null))) failures.push('public mobile menu did not restore focus');
  const tabs = interactionPage.getByRole('tab');
  await tabs.first().focus();
  await interactionPage.keyboard.press('ArrowRight');
  if ((await tabs.nth(1).getAttribute('aria-selected')) !== 'true') failures.push('lifecycle tabs did not move with ArrowRight');
  await interactionContext.close();

  const printContext = await browser.newContext({ viewport: { width: 794, height: 1123 }, colorScheme: 'light' });
  const printPage = await printContext.newPage();
  for (const route of publicRoutes) {
    await printPage.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await printPage.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
    await printPage.emulateMedia({ media: 'print' });
    const printStyles = await printPage.locator('.public-site').evaluate(element => {
      const styles = getComputedStyle(element);
      return { height: styles.height, minHeight: styles.minHeight, overflow: styles.overflow, overflowY: styles.overflowY, background: styles.backgroundColor };
    });
    if (printStyles.overflow === 'hidden' || printStyles.overflowY === 'hidden' || printStyles.overflowY === 'auto') failures.push(`${route} print media retains constrained overflow: ${JSON.stringify(printStyles)}`);
    if (route === '/') {
      if (await printPage.locator('.av-lifecycle-interactive').isVisible()) failures.push('interactive lifecycle remains visible in print');
      const staticStages = await printPage.locator('.av-lifecycle-print li').allTextContents();
      for (const stage of ['Assess', 'Govern', 'Studio', 'Delivery', 'Monitor']) if (!staticStages.some(text => text.includes(stage))) failures.push(`print lifecycle missing ${stage}`);
    }
    await printPage.pdf({ path: path.join(outputDir, `${slug(route)}-print.pdf`), printBackground: true, preferCSSPageSize: true });
  }
  await printContext.close();
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`UI rebaseline visual verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`UI rebaseline visual verification passed: ${results.length} route/theme/viewport captures, mobile keyboard checks, axe, overflow, and four public-route print PDFs.`);
}
