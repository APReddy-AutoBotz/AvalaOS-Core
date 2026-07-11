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
