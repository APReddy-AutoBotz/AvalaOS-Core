import { expect, test } from '@playwright/test';

test('ordinary Assess recommendation opens an honest deterministic no-AI contrast', async ({ page }) => {
  await page.goto('/tests/browser/assessmentRecommendationContrastHarness.html');

  await expect(page.getByTestId('contrast-boundary')).toHaveText('Deterministic evaluator fixture — not fresh extraction or provider proof.');
  await expect(page.getByTestId('assessment-recommendation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open no-AI contrast assessment' }).click();
  await expect(page.getByTestId('assessment-recommendation')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^No AI required/ })).toBeVisible();

  const validation = page.locator('[data-testid^="assessment-step-"]').filter({ hasText: 'PO and GRN validation' });
  await expect(validation).toContainText('Deterministic Rules + Native API Integration');
  await expect(validation).toContainText('Read PO, GRN, tax, and vendor-master data (read) — API use supported');

  const approval = page.locator('[data-testid^="assessment-step-"]').filter({ hasText: 'Posting and release approval' });
  await expect(approval).toContainText('Human judgment required');
  await expect(approval).toContainText('Post a human-approved exception outcome (write) — API use remains unproven for this operation');
});
