import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('PR 1E review workspace is accessible, responsive, and does not false-succeed', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(el=>el.clientWidth));
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  await expect(page.getByText(/Review, approval, Govern and Studio handoff/i)).toHaveCount(0);
});
