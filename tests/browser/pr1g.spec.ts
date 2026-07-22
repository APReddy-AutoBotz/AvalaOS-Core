import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
test('PR 1G application portfolio workspace fixture has accessible matrix and waves', async ({ page }) => {
  await page.addInitScript(()=>{localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({type:'my_work'}));});
  await page.goto('/');
  await page.getByText('Process Catalog').first().click().catch(()=>undefined);
  const workspace=page.getByTestId('application-portfolio-workspace');
  await expect(workspace).toBeVisible({timeout:30000});
  await expect(workspace.getByText('Synthetic ERP API')).toBeVisible();
  await expect(workspace.getByText('Synthetic Document Intake')).toBeVisible();
  await expect(workspace.getByText('Synthetic Legacy UI')).toBeVisible();
  await expect(workspace.getByText(/Process × Application matrix/)).toBeVisible();
  await expect(workspace.getByText(/Modernization waves/)).toBeVisible();
  await page.keyboard.press('Tab');
  const axe=await new AxeBuilder({page}).exclude('[data-testid="app-shell-live-region"]').analyze();
  expect(axe.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
