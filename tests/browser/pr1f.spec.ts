import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('PR 1F economics application journey',()=>{
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) test(`economics governed journey ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.route('**/functions/v1/assess-v2-command', async route => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.idempotencyKey?.includes('self-approval')) return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'PERMISSION_DENIED'}})});
      if (body.idempotencyKey?.includes('failure-proof')) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:{code:'VERSION_CONFLICT'}})});
      const status = body.commandType?.includes('finalize') ? 'reviewer_ready' : body.payload?.resolution ?? 'committed';
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,outcome:'committed',resource:{id:body.payload?.economicVersionId || body.payload?.outcomeId || '99999999-9999-4999-8999-999999999999',outcomeId:'88888888-8888-4888-8888-888888888888',status,version:(body.expectedVersion||0)+1,scenarioResults:[{scenario:'low',capacityReleased:1,annualAvoidableCashBenefit:0,tco:1,paybackPeriodMonths:'not reached'},{scenario:'base',capacityReleased:2,annualAvoidableCashBenefit:10,tco:5,paybackPeriodMonths:6},{scenario:'high',capacityReleased:3,annualAvoidableCashBenefit:20,tco:10,paybackPeriodMonths:6}],confidence:'Partially Evidenced'}})});
    });
    await page.goto('/?view=assess&scope=organization');
    await expect(page.getByText(/AvalaOS|Avala Assess|Assess/i).first()).toBeVisible();
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.keyboard.press('Tab');
    const axe = await new AxeBuilder({page}).analyze();
    expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
  });
});
