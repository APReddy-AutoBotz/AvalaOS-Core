import {expect,test} from '@playwright/test';

test('approved document creates a distinct editable working draft and retains approved history on reload',async({page})=>{
  await page.goto('/tests/browser/studioPrB/harness.html?mode=direct&sddFlows=1&approvedDocument=1');
  await page.getByLabel('Artifact type',{exact:true}).selectOption('sdd');
  const editor=page.getByRole('region',{name:'Current document',exact:true});
  await expect(page.getByRole('button',{name:'Create working draft',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Update selected sections',exact:true})).toHaveCount(0);
  await expect(editor.getByLabel('Section body')).toBeDisabled();
  await page.getByRole('button',{name:'Create working draft',exact:true}).click();
  await expect(editor.getByLabel('Section body')).toBeEnabled();
  await expect(page.getByRole('button',{name:'Create working draft',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Update selected sections',exact:true})).toBeVisible();
  const revise=await page.evaluate(()=>((window as any).__studioCommandCalls??[]).filter((c:any)=>c.commandType==='studio.artifact.draft.revise'));
  expect(revise).toHaveLength(1);
  expect(revise[0].body.payload.parentVersionId).toBe('00000053-0000-4000-8000-000000000053');
  expect(revise[0].body.payload.content.sections[0].body).toBe('Synthetic provider-free SDD fixture.');
  await editor.getByLabel('Section body').fill('Clarified planning question in a separate working draft.');
  await editor.getByLabel('Document summary').fill('Optional AI questions do not block the supported non-AI planning design.');
  await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(editor.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await page.getByLabel('Artifact type',{exact:true}).selectOption('sdd');
  await expect(editor.getByLabel('Section body')).toHaveValue('Clarified planning question in a separate working draft.');
  await expect(editor.getByLabel('Document summary')).toHaveValue('Optional AI questions do not block the supported non-AI planning design.');
  await expect(page.getByRole('complementary',{name:'Studio source context'}).getByText('v1 · Approved',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Final approve',exact:true})).toBeDisabled();
});

test('read-only actor cannot create a working draft from approved content',async({page})=>{
  await page.goto('/tests/browser/studioPrB/harness.html?mode=direct&sddFlows=1&approvedDocument=1&caps=artifacts');
  await page.getByLabel('Artifact type',{exact:true}).selectOption('sdd');
  await expect(page.getByRole('button',{name:'Create working draft',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Update selected sections',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>((window as any).__studioCommandCalls??[]).length)).toBe(0);
});
