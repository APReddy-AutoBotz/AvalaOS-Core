import { chromium } from 'playwright';

const baseUrl = process.env.AVALA_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  await page.goto(`${baseUrl}/sandbox?capture=product`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Enter sandbox as Process Analyst/i }).click();
  const shell = page.locator('.app-shell');
  await shell.waitFor({ state: 'visible', timeout: 15_000 });
  if (await shell.getAttribute('data-marketing-capture')) throw new Error('Normal production build activated the marketing capture marker.');
  if (new URL(page.url()).searchParams.has('capture')) throw new Error('Normal production routing retained an unauthorized capture parameter.');
  const catalog = page.getByTestId('process-catalog-view');
  if (!(await catalog.isVisible())) await page.getByRole('button', { name: 'Assess', exact: true }).click();
  await catalog.waitFor({ state: 'visible', timeout: 15_000 });
  if (await catalog.getAttribute('data-capture-state')) throw new Error('Normal production Process Catalog activated synthetic capture data.');
  if (await catalog.locator('tbody tr').count() >= 8) throw new Error('Normal production Process Catalog contains the marketing fixture inventory.');
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  console.log('Marketing capture isolation passed: a normal production build ignored ?capture=product, removed the parameter, and rendered ordinary runtime data.');
} finally {
  await context.close();
  await browser.close();
}
