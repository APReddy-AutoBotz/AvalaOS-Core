import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.AVALA_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve('public/marketing/screenshots');

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const waitForApp = async () => {
  await page.locator('.app-shell[data-marketing-capture="product"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(700);
};

const signInAs = async (personaLabel) => {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('avalaos-core-v1-current-user'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.goto(`${baseUrl}/sandbox?capture=product`, { waitUntil: 'domcontentloaded' });
  await page.locator('button').filter({ hasText: personaLabel }).first().click();
  const entry = page.getByRole('button', { name: new RegExp(`Enter sandbox as ${personaLabel}`, 'i') });
  await entry.waitFor({ state: 'visible', timeout: 15_000 });
  await entry.click();
  await waitForApp();
};

const capture = async (fileName) => {
  await page.evaluate(() => {
    document.scrollingElement?.scrollTo({ top: 0, left: 0 });
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
      if (element.scrollWidth > element.clientWidth) element.scrollLeft = 0;
    }
  });
  await page.waitForTimeout(150);
  const chromeFrame = await page.evaluate(() => ({
    windowScrollY: window.scrollY,
    headerTop: document.querySelector('.header')?.getBoundingClientRect().top ?? 0,
    sidebarTop: document.querySelector('.premium-sidebar')?.getBoundingClientRect().top ?? 0,
  }));
  if (chromeFrame.windowScrollY > 0.5 || chromeFrame.headerTop < -0.5 || chromeFrame.sidebarTop < -0.5) {
    throw new Error(`${fileName} retained a clipped shell offset: ${JSON.stringify(chromeFrame)}`);
  }
  await page.screenshot({ path: path.join(outputDir, fileName), animations: 'disabled' });
};

const clickNav = async (name) => {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(600);
};

await signInAs('Process Analyst');
await clickNav('Home');
await capture('home-command-center.png');
await clickNav('Assess');
await page.getByTestId('process-catalog-view').waitFor({ state: 'visible' });
if (await page.getByTestId('process-catalog-view').locator('tbody tr').count() < 8) throw new Error('Synthetic Process Catalog capture is not populated.');
await capture('assess-process-catalog.png');
await page.getByRole('button', { name: 'View' }).first().click();
await page.getByRole('heading', { name: 'AP Invoice Exception Handling', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
await page.locator('[data-testid="application-portfolio-workspace"]').waitFor({ state: 'visible', timeout: 15_000 });
await page.getByText('Synthetic capture fixture. No committed application state is changed.', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
await capture('application-portfolio-readiness.png');
await page.getByRole('button', { name: 'Back to Catalog' }).click();
await clickNav('Govern');
await page.locator('[data-testid="govern-overview"][data-capture-state="synthetic-read-only"]').waitFor({ state: 'visible', timeout: 15_000 });
await capture('govern-workbench.png');
await page.getByRole('button', { name: 'Switch workspace context' }).click();
await page.getByRole('button', { name: /^AP Invoice Exception Workflow/ }).last().click();
await page.waitForTimeout(500);
await clickNav('Studio');
await page.getByRole('button', { name: 'Document Vault', exact: true }).click({ noWaitAfter: true });
await page.locator('[data-testid="studio-application-route"]').waitFor({ state: 'visible', timeout: 15_000 });
await page.getByText('Synthetic capture fixture · AP Invoice Exception Handling control brief. No persisted artifact state is changed.', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
await page.waitForTimeout(1_000);
await capture('studio-artifact-workspace.png');
await clickNav('Delivery');
await capture('delivery-board.png');

await signInAs('Buyer Viewer');
await page.getByRole('button', { name: 'Switch workspace context' }).click();
await page.getByRole('button', { name: /^My Work/ }).last().click();
await page.waitForTimeout(500);
await clickNav('Monitor');
await page.locator('[data-testid="monitor-overview"][data-capture-state="synthetic-read-only"]').waitFor({ state: 'visible', timeout: 15_000 });
await capture('monitor-overview.png');

await signInAs('Platform Admin');
await clickNav('Admin');
await capture('admin-controls.png');

await page.evaluate(() => localStorage.removeItem('avalaos-core-v1-current-user'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
await page.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
await page.waitForTimeout(500);

const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'light',
});
const mobilePage = await mobileContext.newPage();
mobilePage.on('pageerror', error => pageErrors.push(`mobile: ${error.message}`));
await mobilePage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
await mobilePage.locator('.public-site').waitFor({ state: 'visible', timeout: 15_000 });
const publicMenu = mobilePage.getByRole('button', { name: /public navigation/i });
await publicMenu.click();
if ((await publicMenu.getAttribute('aria-expanded')) !== 'true') throw new Error('Public mobile navigation did not open.');
await mobilePage.getByLabel('Mobile public site').getByRole('link', { name: 'Platform', exact: true }).click();
await mobilePage.getByRole('heading', { name: 'The decision and delivery layer around execution.' }).waitFor({ state: 'visible', timeout: 15_000 });

await mobilePage.goto(`${baseUrl}/sandbox`, { waitUntil: 'domcontentloaded' });
await mobilePage.getByRole('button', { name: /Enter sandbox as Process Analyst/i }).click();
await mobilePage.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 });
const appMenu = mobilePage.getByRole('button', { name: /navigation/i }).filter({ has: mobilePage.locator('span.sr-only') }).first();
await appMenu.click();
if ((await appMenu.getAttribute('aria-expanded')) !== 'true') throw new Error('Authenticated mobile navigation did not open.');
const focusInsideDrawer = await mobilePage.evaluate(() => document.activeElement?.closest('#primary-navigation') !== null);
if (!focusInsideDrawer) throw new Error('Authenticated mobile navigation did not move focus into the drawer.');
await mobilePage.keyboard.press('Escape');
if ((await mobilePage.getByRole('button', { name: 'Open navigation' }).getAttribute('aria-expanded')) !== 'false') throw new Error('Authenticated mobile navigation did not close on Escape.');
await mobileContext.close();

await browser.close();

if (pageErrors.length > 0) {
  console.error(`Browser page errors: ${pageErrors.join(' | ')}`);
  process.exitCode = 1;
}

console.log(`Captured ${8} product screenshots in ${outputDir}`);
