import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('PR 1G application portfolio workspace committed-state journey',async({page})=>{
 test.setTimeout(120_000);
 await page.addInitScript(()=>{localStorage.setItem('avalaos-core-v1-view',JSON.stringify('process_catalog'));localStorage.setItem('avalaos-core-v1-scope',JSON.stringify({type:'my_work'}));});
 await page.route('**/rest/v1/rpc/pr1g_read_application_portfolio_projection',route=>route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({inventory:[],metadataVersions:[],processLinks:[],dependencies:[],assessments:[],dimensions:[],recommendations:[],reviews:[],waves:[],economicsReferences:[],rowOutcomes:[]})}));
 await page.route('**/functions/v1/assess-v2-command',async route=>route.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({ok:true,outcome:'committed',resource:{id:'55555555-5555-4555-8555-555555555555',version:1,status:'draft'}})}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Process Catalog'})).toBeVisible();await page.getByRole('button',{name:'View'}).first().click();
 const workspace=page.getByTestId('application-portfolio-workspace');await expect(workspace).toBeVisible({timeout:30000});
 await expect(workspace.getByText('Empty committed application inventory.')).toBeVisible();
 await workspace.getByLabel('Filter applications').fill('ERP');await workspace.getByLabel('Application name').fill('ERP Browser App');
 await workspace.getByRole('button',{name:'Create manual application'}).click();await expect(workspace.getByText(/Committed projection loaded|Application created|Command failed/)).toBeVisible();
 await workspace.getByRole('button',{name:/Show synthetic AP fixture/}).click();
 await expect(workspace.getByText('Synthetic ERP API')).toBeVisible();await expect(workspace.getByText('Synthetic Document Intake')).toBeVisible();await expect(workspace.getByText('Synthetic Legacy UI')).toBeVisible();
 await expect(workspace.getByText('Process × Application matrix')).toBeVisible();await expect(workspace.getByText('Modernization waves')).toBeVisible();
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');
 const axe=await new AxeBuilder({page}).include('[data-testid="application-portfolio-workspace"]').analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
