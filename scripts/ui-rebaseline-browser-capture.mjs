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
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(700);
};

const signInAs = async (personaLabel) => {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.removeItem('avalaos-core-v1-current-user'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.goto(`${baseUrl}/sandbox`, { waitUntil: 'domcontentloaded' });
  await page.locator('button').filter({ hasText: personaLabel }).first().click();
  const entry = page.getByRole('button', { name: new RegExp(`Enter sandbox as ${personaLabel}`, 'i') });
  await entry.waitFor({ state: 'visible', timeout: 15_000 });
  await entry.click();
  await waitForApp();
};

const capture = async (fileName) => {
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
await capture('assess-process-catalog.png');
await clickNav('Govern');
await capture('govern-workbench.png');
await page.getByRole('button', { name: 'Switch workspace context' }).click();
await page.getByRole('button', { name: /^AP Invoice Exception Workflow/ }).last().click();
await page.waitForTimeout(500);
await clickNav('Studio');
await page.getByRole('button', { name: 'Document Vault', exact: true }).click();
await page.waitForTimeout(1_000);
await capture('studio-artifact-workspace.png');
await clickNav('Delivery');
await capture('delivery-board.png');

await signInAs('Buyer Viewer');
await page.getByRole('button', { name: 'Switch workspace context' }).click();
await page.getByRole('button', { name: /^My Work/ }).last().click();
await page.waitForTimeout(500);
await clickNav('Monitor');
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

console.log(`Captured ${7} product screenshots in ${outputDir}`);
