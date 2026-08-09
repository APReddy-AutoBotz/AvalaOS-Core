import { chromium, type FullConfig } from '@playwright/test';

const HARNESS_PATH = '/tests/trust-assurance/browser/trustAssuranceHarness.html?readonly=1';
const PREFLIGHT_TIMEOUT_MS = 15_000;

export default async function trustAssuranceBuiltPreviewPreflight(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('TRUST_BUILT_PREVIEW_BASE_URL_MISSING');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(new URL(HARNESS_PATH, baseURL).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: PREFLIGHT_TIMEOUT_MS,
    });
    await Promise.all([
      page.getByRole('heading', { name: 'Trust and Assurance Evidence Hub', exact: true })
        .waitFor({ state: 'visible', timeout: PREFLIGHT_TIMEOUT_MS }),
      page.getByText(/^Read-only mode:/)
        .waitFor({ state: 'visible', timeout: PREFLIGHT_TIMEOUT_MS }),
    ]);
    const views = page.getByRole('navigation', { name: 'Trust Assurance views', exact: true });
    await views.getByRole('button', { name: 'Claims', exact: true }).click({ timeout: PREFLIGHT_TIMEOUT_MS });
    await page.getByText(/CURRENT_CONTRADICTION/)
      .waitFor({ state: 'visible', timeout: PREFLIGHT_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `TRUST_BUILT_PREVIEW_PREFLIGHT_FAILED: the pilot Trust harness did not mount its governed read-only scenario within ${PREFLIGHT_TIMEOUT_MS}ms`,
      { cause: error },
    );
  } finally {
    await browser.close();
  }
}
