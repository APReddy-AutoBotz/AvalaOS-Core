import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { CANONICAL_AP_ASSESSMENT } from '../../data/mockData';
import { ASSESS_V1_SCORE_VERSION, cloneV1AssessmentToV2 } from '../../services/assessV1Compatibility';
import { ASSESS_V2_CAPABILITIES } from '../../services/assessV2/capabilities';
import { buildDecisionVersionV2 } from '../../services/assessV2/decisionVersion';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../../services/assessV2/fixture';
import { parseAssessV2DraftPayload } from '../../supabase/functions/_shared/assessV2Command';
import { PROCESS_CREATE_CAPABILITY, parseProcessCreateEnvelope } from '../../services/processCreationContract';
import { ASSESS_V2_RULE_SET_VERSION, ASSESS_V2_SCHEMA_VERSION, type AssessmentCaseV2, createUnknownAgentNecessityFacts } from '../../services/assessV2/types';
import { ALL_CAPABILITIES, API, ASSESSMENT, ORG, PROCESS, SECONDARY_WS, USER, WS, installEnterpriseFixture, jsonHeaders } from './pr1dNetworkFixture';

const expectProcessCatalog = async (page: Page) => {
  const catalog = page.getByTestId('process-catalog-view');
  await expect(catalog).toBeVisible();
  await expect(catalog.getByRole('heading', { name: 'Process Catalog', exact: true })).toBeVisible();
  await expect(catalog.getByRole('heading', { name: 'Process records', exact: true })).toBeVisible();
};

const openAssessment = async (page: Page) => {
  await page.goto('/');
  await expectProcessCatalog(page);
  await page.getByRole('button',{ name:'View' }).first().click();
  await expect(page.getByRole('heading',{ name:'Invoice exception handling' }).first()).toBeVisible();
  await page.getByRole('button',{ name:/Start Assessment|Open Decision Pack/ }).click();
  await expect(page.getByTestId('enterprise-assess')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  page.on('pageerror',error => console.error(`PR1C_PAGE_ERROR: ${error.message}`));
  page.on('console',message => { if (message.type()==='error') console.error(`PR1C_CONSOLE_ERROR: ${message.text()}`); });
  page.on('dialog',dialog => dialog.dismiss());
});

const assertProcessModalAccess = async (page: Page) => {
  const violations = await new AxeBuilder({page}).include('[role="dialog"]').analyze();
  expect(violations.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
};

test('new process form traps keyboard focus and closes with Escape on Desktop and Pixel', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page,{capabilities:[...ALL_CAPABILITIES,PROCESS_CREATE_CAPABILITY]});
  await page.goto('/'); await expectProcessCatalog(page);
  const trigger=page.getByRole('button',{name:'New process'});
  await trigger.focus(); await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'New Assess process'});
  await expect(dialog.getByRole('textbox',{name:'Process Name *'})).toBeFocused();
  await dialog.getByRole('button',{name:'Create process'}).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'Close process form'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Create process'})).toBeFocused();
  await assertProcessModalAccess(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(fixture.processCommandRequests).toHaveLength(0);
});

test('pending process creation keeps focus on a live status and cannot be dismissed or duplicated', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture=await installEnterpriseFixture(page,{capabilities:[...ALL_CAPABILITIES,PROCESS_CREATE_CAPABILITY],holdFirstProcessResponse:true});
  await page.goto('/'); await expectProcessCatalog(page);
  await page.getByRole('button',{name:'New process'}).click();
  const dialog=page.getByRole('dialog',{name:'New Assess process'});
  await dialog.getByRole('textbox',{name:'Process Name *'}).fill('Keyboard pending process');
  await dialog.getByRole('button',{name:'Create process'}).click();
  await fixture.waitForFirstProcessCommand();
  const status=dialog.getByRole('status').filter({hasText:'Verifying process creation'});
  await expect(status).toBeFocused();
  await expect(dialog).toHaveAttribute('aria-busy','true');
  await expect(dialog.getByRole('button',{name:'Close process form'})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Verifying creation…'})).toBeDisabled();
  await page.keyboard.press('Tab'); await expect(status).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(status).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await assertProcessModalAccess(page);
  fixture.releaseFirstProcessResponse();
  await expect(dialog).toHaveCount(0);
  expect(fixture.processCommandRequests).toHaveLength(1);
});

test('server process denial alerts and focuses the recoverable form without false success', async ({ page }) => {
  const fixture=await installEnterpriseFixture(page,{capabilities:[...ALL_CAPABILITIES,PROCESS_CREATE_CAPABILITY],failProcessCommand:'PERMISSION_DENIED'});
  await page.goto('/'); await expectProcessCatalog(page);
  await page.getByRole('button',{name:'New process'}).click();
  const dialog=page.getByRole('dialog',{name:'New Assess process'});
  const name=dialog.getByRole('textbox',{name:'Process Name *'});
  await name.fill('Denied server process');
  await dialog.getByRole('button',{name:'Create process'}).click();
  const alert=dialog.getByRole('alert');
  await expect(alert).toContainText('workspace role does not allow process creation');
  await expect(alert).toBeFocused();
  await expect(dialog).toHaveAttribute('aria-busy','false');
  await expect(name).toHaveValue('Denied server process');
  await assertProcessModalAccess(page);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(fixture.processCommandRequests).toHaveLength(1);
  expect(fixture.processRows).toHaveLength(1);
});

test('authorized process creation opens a real V1 draft and reopens its saved server projection', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await installEnterpriseFixture(page, { capabilities:[...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY] });
  await page.goto('/');
  await expectProcessCatalog(page);
  const newProcess = page.getByRole('button',{name:'New process'});
  await expect(newProcess).toBeEnabled();
  await newProcess.click();
  const dialog = page.getByRole('dialog',{name:'New Assess process'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox',{name:'Process Name *'}).fill('Synthetic payment approval');
  await dialog.getByRole('textbox',{name:'Description'}).fill('A controlled synthetic creation journey.');
  await dialog.getByRole('textbox',{name:'Department'}).fill('Finance');
  await dialog.getByRole('button',{name:'Create process'}).click();
  await expect(dialog).toHaveCount(0);
  const createdRow = page.getByRole('row').filter({hasText:'Synthetic payment approval'});
  await expect(createdRow).toBeVisible();
  expect(fixture.processCommandRequests).toHaveLength(1);
  const committed = fixture.processCommandRequests[0];
  expect(committed.commandType).toBe('process.create');
  expect(committed.organizationId).toBe(ORG);
  expect(committed.workspaceId).toBe(WS);
  expect(fixture.processRows.find(row => row.id === committed.payload.processId)?.creation_receipt_id).toMatch(/^[0-9a-f-]{36}$/i);
  await createdRow.getByRole('button',{name:'View'}).click();
  await expect(page.getByRole('heading',{name:'Synthetic payment approval'}).first()).toBeVisible();
  await page.getByRole('button',{name:'Start Assessment'}).click();
  await expect(page.getByTestId('enterprise-assess')).toBeVisible();
  const standardization = page.getByText('Process Standardization',{exact:true}).locator('..');
  await standardization.getByRole('button',{name:/^4\b/}).click();
  await page.getByRole('button',{name:/^Save Draft/}).click();
  await expect.poll(() => fixture.assessment?.responses && (fixture.assessment.responses as Record<string,any>).processStructure?.standardization).toBe(4);
  expect(fixture.assessment?.process_id).toBe(committed.payload.processId);
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment.response.upsert')).toHaveLength(1);
  const savedVersion = fixture.assessment?.version;
  await page.reload();
  await expect(page.getByTestId('enterprise-assess')).toBeVisible();
  await expect(standardization.getByRole('button',{name:/^4\b/})).toHaveClass(/border-\[#ffbc03\]/);
  expect(fixture.assessment?.version).toBe(savedVersion);
  expect(fixture.processCommandRequests).toHaveLength(1);
});

test('a same-role actor without process-create capability cannot send a creation command', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { capabilities:ALL_CAPABILITIES });
  await page.goto('/');
  await expectProcessCatalog(page);
  const create = page.getByRole('button',{name:'New process'});
  await expect(create).toBeDisabled();
  await create.evaluate(element => (element as HTMLButtonElement).click());
  await expect(page.getByRole('dialog',{name:'New Assess process'})).toHaveCount(0);
  expect(fixture.processCommandRequests).toHaveLength(0);
  expect(fixture.processRows).toHaveLength(1);
});

test('late process-create response cannot close a new-epoch form or carry its draft into another workspace', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await installEnterpriseFixture(page, {
    capabilities:[...ALL_CAPABILITIES,PROCESS_CREATE_CAPABILITY],
    holdFirstProcessResponse:true,includeSecondaryWorkspace:true,
  });
  await page.goto('/');
  await expectProcessCatalog(page);
  await page.getByRole('button',{name:'New process'}).click();
  const oldDialog = page.getByRole('dialog',{name:'New Assess process'});
  await oldDialog.getByRole('textbox',{name:'Process Name *'}).fill('Old epoch committed process');
  await oldDialog.getByRole('button',{name:'Create process'}).click();
  await fixture.waitForFirstProcessCommand();
  const oldCommand = fixture.processCommandRequests[0];
  expect(oldCommand.authorizationVersion).toBe(9);
  expect(oldCommand.workspaceId).toBe(WS);

  fixture.setPrimaryAuthorizationVersion(10);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(oldDialog).toHaveCount(0);
  await expectProcessCatalog(page);
  await page.getByRole('button',{name:'New process'}).click();
  const freshDialog = page.getByRole('dialog',{name:'New Assess process'});
  const freshName = freshDialog.getByRole('textbox',{name:'Process Name *'});
  await expect(freshName).toHaveValue('');
  await freshName.fill('Fresh epoch draft stays open');

  fixture.releaseFirstProcessResponse();
  await expect.poll(() => fixture.processReadbacks.includes(`eq.${oldCommand.payload.processId}`)).toBe(true);
  await expect(freshDialog).toBeVisible();
  await expect(freshName).toHaveValue('Fresh epoch draft stays open');
  await expect(freshDialog.getByRole('alert')).toHaveCount(0);
  expect(fixture.processCommandRequests).toHaveLength(1);

  await page.getByRole('combobox',{name:'Workspace'}).selectOption(SECONDARY_WS,{force:true});
  await expect(page.getByRole('combobox',{name:'Workspace'})).toHaveValue(SECONDARY_WS);
  await expect(freshDialog).toHaveCount(0);
  await expectProcessCatalog(page);
  await page.getByRole('button',{name:'New process'}).click();
  const otherDialog = page.getByRole('dialog',{name:'New Assess process'});
  const otherName = otherDialog.getByRole('textbox',{name:'Process Name *'});
  await expect(otherName).toHaveValue('');
  await expect(otherDialog.getByRole('alert')).toHaveCount(0);
  await otherName.fill('Other workspace synthetic process');
  await otherDialog.getByRole('button',{name:'Create process'}).click();
  await expect(otherDialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({hasText:'Other workspace synthetic process'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Old epoch committed process'})).toHaveCount(0);
  expect(fixture.processCommandRequests).toHaveLength(2);
  expect(fixture.processCommandRequests[1].authorizationVersion).toBe(11);
  expect(fixture.processCommandRequests[1].workspaceId).toBe(SECONDARY_WS);
  expect(fixture.processRows.filter(row => row.id === oldCommand.payload.processId)).toHaveLength(1);
  expect(fixture.processRows.filter(row => row.id === fixture.processCommandRequests[1].payload.processId)).toHaveLength(1);
});



test('V1 requested changes expose an accessible control that reopens the draft and clears the prior score', async ({ page }) => {
  test.setTimeout(60_000);
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Changes Requested' });
  await openAssessment(page);
  const reopen = page.getByRole('button', { name:'Revise requested changes' });
  await expect(reopen).toBeVisible();
  await reopen.focus();
  await expect(reopen).toBeFocused();
  await reopen.press('Enter');
  await expect(page.getByRole('button', { name:'Save Draft' })).toBeVisible();
  await expect(page.getByRole('button', { name:'Revise requested changes' })).toHaveCount(0);
  expect(fixture.assessment?.status).toBe('Draft');
  expect(fixture.assessment?.score_version).toBeNull();
  expect(fixture.assessment?.scores).toBeUndefined();
  const reopenCommands = fixture.committedCommands.filter(item => item.commandType === 'assessment.response.upsert');
  expect(reopenCommands).toHaveLength(1);
  expect(reopenCommands[0].payload).not.toHaveProperty('scores');
});

for (const status of ['Ready for Review', 'Approved'] as const) {
  test(`V1 requested changes control is not exposed in ${status}`, async ({ page }) => {
    await installEnterpriseFixture(page, { initialStatus:status });
    await openAssessment(page);
    await expect(page.getByRole('button', { name:'Revise requested changes' })).toHaveCount(0);
  });
}

test('V2 capability-controlled authoring finalizes server-only decision data and renders read-only on desktop and mobile',async ({ page }) => {
  test.setTimeout(60_000);
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  const fixture=await installEnterpriseFixture(page,{ initialStatus:'Ready for Review' });
  await page.goto('/');
  await expectProcessCatalog(page);
  await page.getByRole('button',{name:'View'}).first().click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await page.getByLabel('V2 case description').fill('Controlled exception assessment with explicit evidence gaps.');
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByLabel('Primitive 1 name').fill('Capture invoice request');
  await page.getByRole('button',{name:'Add primitive'}).click();
  await page.getByLabel('Primitive 3 name').fill('Temporary authoring step');
  await page.getByRole('button',{name:'Move primitive 3 up'}).click();
  await page.getByRole('button',{name:'Move primitive 2 down'}).click();
  await page.getByRole('button',{name:'Remove'}).last().click();
  await page.getByText('2. Flow, decisions and exceptions').evaluate(element => (element as HTMLElement).click());
  await page.getByRole('button',{name:'Add decision point'}).click();
  await page.getByRole('button',{name:'Add exception path'}).click();
  await page.getByText('3. Applications and interactions').evaluate(element => (element as HTMLElement).click());
  await page.getByLabel('Application 1 name').fill('SAP governed interface');
  await page.getByLabel('Interaction 1 operation name').fill('Read governed invoice');
  await page.getByLabel('Interaction 1 interfaceAvailable').selectOption('true');
  await page.getByLabel('Interaction 1 operationCovered').selectOption('true');
  await page.getByText('4. Agent necessity and evidence').evaluate(element => (element as HTMLElement).click());
  await page.getByRole('button',{name:'Add linked evidence'}).click();
  await page.getByLabel('Evidence 2 claim IDs').fill('assessment.scope, primitive.type');
  await page.getByLabel('Evidence 2 submission status').selectOption('submitted');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await page.getByRole('button',{name:'Reload current draft'}).click();
  await expect(page.getByLabel('Primitive 1 name')).toHaveValue('Capture invoice request');
  const canonicalApDraft = {
    caseId: fixture.v2Case!.id,
    name: 'Invoice exception handling',
    description: 'Canonical AP invoice-exception decision-intelligence assessment.',
    primitives: AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives,
    edges: AP_INVOICE_EXCEPTION_V2_FIXTURE.edges,
    decisionPoints: AP_INVOICE_EXCEPTION_V2_FIXTURE.decisionPoints,
    exceptionPaths: AP_INVOICE_EXCEPTION_V2_FIXTURE.exceptionPaths,
    applicationAssets: AP_INVOICE_EXCEPTION_V2_FIXTURE.assets,
    interactions: AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions,
    evidenceLinks: AP_INVOICE_EXCEPTION_V2_FIXTURE.evidence,
    agentNecessity: AP_INVOICE_EXCEPTION_V2_FIXTURE.agentNecessity,
    candidateEvaluations: [], gateResults: [], controlRequirements: [], modernizationDispositions: [],
  };
  expect(canonicalApDraft.primitives).toHaveLength(AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.length);
  const canonicalSave = await page.evaluate(async ({ canonicalApDraft, endpoint, organizationId, workspaceId }) => {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer browser-fixture-token' },
      body: JSON.stringify({ requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), commandType: 'assessment_v2.draft.upsert', organizationId, workspaceId, authorizationVersion: 9, expectedVersion: 2, payload: canonicalApDraft }),
    });
    return { ok: response.ok, body: await response.json() };
  }, { canonicalApDraft, endpoint: `${API}/functions/v1/assess-v2-command`, organizationId: ORG, workspaceId: WS });
  expect(canonicalSave.ok).toBe(true);
  expect(canonicalSave.body.resource.version).toBe(3);
  expect(fixture.committedCommands.some(item => item.commandType === 'assessment_v2.draft.upsert' && item.payload.primitives.length === AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.length)).toBe(true);
  await page.getByRole('button',{name:'Reload current draft'}).click();
  await expect(page.getByLabel('Primitive 1 name')).toHaveValue('Invoice intake');
  const decisionStarted=performance.now();
  await page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'}).click();
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Composed operating model');
  expect(performance.now()-decisionStarted).toBeLessThan(5000);
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Executive decision');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Approval-bound actions');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Modernization dispositions');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Immutable references');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Independent review: pending');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Source:');
  await expect(page.getByTestId('assess-v2-decision-pack')).toContainText('Document Intelligence');
  expect(fixture.v2Decision?.inputSnapshot.primitives).toHaveLength(AP_INVOICE_EXCEPTION_V2_FIXTURE.primitives.length);
  const expectExactVisible = async (text: string) => {
    const locator = page.getByText(text, { exact:true });
    await locator.scrollIntoViewIfNeeded();
    if (!await locator.isVisible()) console.log('PR1D_VISIBILITY_DIAGNOSTIC', text, await locator.evaluate(element => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return { display:style.display, visibility:style.visibility, opacity:style.opacity, contentVisibility:style.contentVisibility, rect:{ x:rect.x, y:rect.y, width:rect.width, height:rect.height }, scrollY, documentHeight:document.documentElement.scrollHeight, ancestors:Array.from(function*(){ let current:Element|null=element; while(current){ const computed=getComputedStyle(current); yield { tag:current.tagName, className:current.className, display:computed.display, visibility:computed.visibility, opacity:computed.opacity, overflow:computed.overflow, height:current.getBoundingClientRect().height }; current=current.parentElement; } }()) }; }));
    await expect(locator).toBeVisible();
  };
  await expectExactVisible('Legacy V1 | assess-core-2026-05.');
  await expectExactVisible('Read-only | reviewer-ready');
  await expectExactVisible('Deterministic evaluation completed; independent evidence and governance review not yet completed.');
  await expectExactVisible('Hard stop: prohibited actions cannot proceed.');
  await expectExactVisible('No deployment, pilot, production, security, compliance, or buyer-acceptance readiness claim is made.');
  await expectExactVisible('V2 approval, Govern resolution, Studio generation, export, and external sharing are not available in this foundation boundary.');
  const finalize=fixture.committedCommands.find(item=>item.commandType==='assessment_v2.finalize');
  expect(finalize?.payload).toEqual({caseId:finalize?.payload.caseId});
  expect(finalize?.payload.decision).toBeUndefined();
  expect(finalize?.payload.inputHash).toBeUndefined();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const violations=await new AxeBuilder({page}).include('[data-testid="assess-v2-workspace"]').analyze();
  expect(violations.violations.filter(item=>['serious','critical'].includes(item.impact || ''))).toEqual([]);
  expect(errors.filter(item=>!item.includes('Failed to load resource: net::ERR_FAILED'))).toEqual([]);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`view=process_detail.*scope=my_work.*processId=${PROCESS}`));
  await expect(page.getByTestId('assess-v2-decision-pack')).toBeVisible();
  await expect(page.getByText('Existing reviewer-ready Decision Pack reopened in read-only mode.')).toBeVisible();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toHaveCount(0);
});





test('V1 clone reports real counts, exposes imported suggestions, and persists claim-linked submitted evidence', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Approved' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'Start from approved V1 assessment'}).click();
  const expectedClone = cloneV1AssessmentToV2({
    ...structuredClone(CANONICAL_AP_ASSESSMENT), id:ASSESSMENT, processId:PROCESS, orgId:ORG, workspaceId:WS,
    status:'Approved', scoreVersion:ASSESS_V1_SCORE_VERSION,
    scores:{ ...structuredClone(CANONICAL_AP_ASSESSMENT.scores!), scoreVersion:ASSESS_V1_SCORE_VERSION },
  }, { caseId:'77777777-7777-4777-8777-777777777777', organizationId:ORG, workspaceId:WS, ownerId:USER, clonedAt:'2026-07-13T00:00:00.000Z' });
  const importedStatus = page.getByText(new RegExp(`Imported ${expectedClone.importedFacts!.length} V1 fact suggestions and ${expectedClone.evidence.length} evidence suggestions\\.`));
  await expect(importedStatus).toBeVisible();
  await expect(importedStatus).toContainText(expectedClone.importedFacts![0].fieldId);
  await page.getByRole('button',{name:'Add review evidence'}).first().evaluate(element => (element as HTMLElement).click());
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await page.getByRole('button',{name:'Reload current draft'}).click();
  await expect(page.getByText('Current immutable draft projection reloaded.')).toBeVisible();
  expect(fixture.v2Case?.importedFacts?.map(fact => fact.fieldId)).toEqual(expectedClone.importedFacts?.map(fact => fact.fieldId));
  for (const importedEvidence of expectedClone.evidence) expect(fixture.v2Case?.evidence).toContainEqual(importedEvidence);
  expect(fixture.v2Case?.evidence.every(item => /^[0-9a-f-]{36}$/.test(item.id))).toBe(true);
  expect(fixture.v2Case?.evidence.some(item => item.claimIds.includes(expectedClone.importedFacts![0].fieldId))).toBe(true);
  expect(fixture.cloneVersionQueries.length).toBeGreaterThanOrEqual(2);
  expect(fixture.cloneVersionQueries.at(-1)).toEqual({
    caseId:`eq.${fixture.v2Case!.id}`,orgId:`eq.${ORG}`,workspaceId:`eq.${WS}`,version:'eq.1',sourceKind:'eq.v1_clone',
  });
  expect(fixture.cloneEvidenceVersionReads.length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByText('Draft saved as a new immutable authoring version.')).toBeVisible();
  const draftSaves = fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.draft.upsert');
  expect(draftSaves).toHaveLength(2);
  const reloadedEvidence = draftSaves[1].payload.evidenceLinks as Array<Record<string, unknown>>;
  for (const evidence of expectedClone.evidence) {
    const { reviewerIds: _reviewerIds, contradictory: _contradictory, ...authorSubmission } = evidence as unknown as Record<string, unknown>;
    expect(reloadedEvidence).toContainEqual(authorSubmission);
  }
  const clone = fixture.committedCommands.find(item => item.commandType === 'assessment_v2.clone_from_v1');
  expect(clone?.payload).toEqual({ caseId:clone?.payload.caseId, sourceAssessmentId:ASSESSMENT, name:'Invoice exception handling', description:'Resolve invoice exceptions before payment release.' });
  expect(clone?.payload.importedFacts).toBeUndefined();
});

for (const source of [
  { label:'Draft lifecycle', initialStatus:'Draft' as const },
  { label:'Ready for Review lifecycle', initialStatus:'Ready for Review' as const },
  { label:'Changes Requested lifecycle', initialStatus:'Changes Requested' as const },
  { label:'non-frozen score version', initialStatus:'Approved' as const, initialScoreVersion:'assess-core-2026-04' },
]) {
  test(`V1 clone stays locally unavailable for ${source.label} without clearing tenant context`, async ({ page }) => {
    const fixture = await installEnterpriseFixture(page, source);
    await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
    const cloneButton = page.getByRole('button',{name:'Start from approved V1 assessment'});
    await expect(cloneButton).toBeDisabled();
    await expect(page.getByTestId('assess-v2-clone-unavailable')).toContainText(
      `Clone requires an Approved or Handed Off to Docs assessment finalized with ${ASSESS_V1_SCORE_VERSION}.`,
    );
    await expect(page.getByRole('button',{name:'New assessment (V2)'})).toBeEnabled();
    await cloneButton.evaluate(element => (element as HTMLButtonElement).click());
    await expect(page.getByRole('button',{name:'New assessment (V2)'})).toBeEnabled();
    expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.clone_from_v1')).toHaveLength(0);
  });
}

test('displayed primitive and lifecycle controls allow a scaffolded V2 case to finalize', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByLabel('Primitive 1 primitive.rulesStable').selectOption('true');
  await page.getByText('3. Applications and interactions').evaluate(element => (element as HTMLElement).click());
  await page.getByLabel('Application 1 strategic lifespan').selectOption('long');
  await page.getByLabel('Application 1 accountable owner').fill('process-owner');
  await page.getByLabel('Interaction 1 data classification').selectOption('Internal');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByRole('status').filter({hasText:'a classified interaction with the required facts for its declared mode'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'})).toBeDisabled();
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.finalize')).toHaveLength(0);
  for (const fact of ['interfaceAvailable','operationCovered','apiDocumented','errorContract']) {
    await page.getByLabel(`Interaction 1 ${fact}`).selectOption('true');
  }
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'}).click();
  await expect(page.getByTestId('assess-v2-decision-pack')).toBeVisible();
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.finalize')).toHaveLength(1);
});
test('Retrieve and Execute primitives expose and persist interface dependency knowledge', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByLabel('Primitive 1 type').selectOption('Retrieve');
  await page.getByLabel('Primitive 2 type').selectOption('Execute');
  await expect(page.getByLabel('Primitive 1 primitive.interfaceDependencyKnown')).toBeVisible();
  await expect(page.getByLabel('Primitive 2 primitive.interfaceDependencyKnown')).toBeVisible();
  await page.getByLabel('Primitive 1 primitive.interfaceDependencyKnown').selectOption('true');
  await page.getByLabel('Primitive 2 primitive.interfaceDependencyKnown').selectOption('false');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByText('Draft saved as a new immutable authoring version.')).toBeVisible();

  const saved = fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.draft.upsert').at(-1);
  expect(saved?.payload.primitives[0].facts['primitive.interfaceDependencyKnown']).toMatchObject({
    fieldId:'primitive.interfaceDependencyKnown', value:true, status:'known', source:'user',
  });
  expect(saved?.payload.primitives[1].facts['primitive.interfaceDependencyKnown']).toMatchObject({
    fieldId:'primitive.interfaceDependencyKnown', value:false, status:'known', source:'user',
  });
});

test('persisted V2 draft is resumed after remount without duplicate creation', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByLabel('Primitive 1 name').fill('Persisted restore primitive');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByText('Draft saved as a new immutable authoring version.')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`view=process_detail.*scope=my_work.*processId=${PROCESS}`));
  await expect(page.getByLabel('Primitive 1 name')).toHaveValue('Persisted restore primitive');
  await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.')).toBeVisible();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toHaveCount(0);
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.create')).toHaveLength(1);
});

test('read-only V2 sessions retain discovery across remount while mutations remain unavailable', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByLabel('Primitive 1 name').fill('Read-only discovery primitive');
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByText('Draft saved as a new immutable authoring version.')).toBeVisible();
  const committedBeforeReadOnly = fixture.committedCommands.length;

  fixture.setV2CommandFailure({ type:'assessment_v2.draft.upsert', code:'READ_ONLY' });
  await page.getByLabel('Primitive 1 name').fill('Unsaved read-only mutation');
  await page.getByRole('button',{name:'Save V2 draft'}).click();

  await expect(page.getByText('Existing V2 draft resumed from the current immutable authoring version.')).toBeVisible();
  await expect(page.getByLabel('Primitive 1 name')).toHaveValue('Read-only discovery primitive');
  await expect(page.getByRole('button',{name:'Save V2 draft'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Reload current draft'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start from approved V1 assessment'})).toHaveCount(0);
  expect(fixture.committedCommands).toHaveLength(committedBeforeReadOnly);

  await fixture.seedReviewerReadyV2Decision();
  await page.getByRole('button',{name:'Back to Catalog'}).click();
  await expectProcessCatalog(page);
  await page.getByRole('button',{name:'View'}).first().click();
  await expect(page.getByTestId('assess-v2-decision-pack')).toBeVisible();
  await expect(page.getByText('Existing reviewer-ready Decision Pack reopened in read-only mode.')).toBeVisible();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start from approved V1 assessment'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save V2 draft'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'})).toHaveCount(0);
  expect(fixture.committedCommands).toHaveLength(committedBeforeReadOnly);
});

test('incomplete V2 authoring cannot finalize or send a finalization command', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { initialStatus:'Ready for Review' });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await expect(page.getByText('Before finalization, add: at least two process primitives', { exact: false })).toBeVisible();
  await expect(page.getByRole('button',{name:'Finalize reviewer-ready Decision Pack'})).toBeDisabled();
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.finalize')).toEqual([]);
});

test('V2 mutation capability denial is visible and no command is sent', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { capabilities:['assess.read', ASSESS_V2_CAPABILITIES.read] });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Create a V2 case' })).toContainText('Create a V2 case');
  expect(fixture.committedCommands.filter(item => String(item.commandType).startsWith('assessment_v2.'))).toEqual([]);
});

test('stale V2 authority surfaces an error without false success', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { failV2Command:{type:'assessment_v2.create',code:'AUTHORITY_STALE'} });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await expect(page.getByRole('heading',{name:'Access context changed'})).toBeVisible();
  await expect(page.getByText(/Your access changed/)).toBeVisible();
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.create')).toEqual([]);
});

test('V2 version conflict prevents save success and returns to a safe reload state', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { failV2Command:{type:'assessment_v2.draft.upsert',code:'VERSION_CONFLICT'} });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click(); await page.getByRole('button',{name:'Add minimum working structure'}).click();
  await page.getByRole('button',{name:'Save V2 draft'}).click();
  await expect(page.getByText(/changed on the server/i)).toBeVisible();
  await expect(page.getByRole('button',{name:'New assessment (V2)'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Add minimum working structure'})).toBeVisible();
  await expect(page.getByText('Draft saved as a new immutable authoring version.')).toHaveCount(0);
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.draft.upsert')).toEqual([]);
});

test('offline V2 create reports failure and never claims success', async ({ page }) => {
  const fixture = await installEnterpriseFixture(page, { v2Offline:true });
  await page.goto('/'); await page.getByRole('button',{name:'View'}).first().click();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await expect(page.getByRole('heading',{name:'Workspace unavailable'})).toBeVisible();
  await expect(page.getByText('The command could not be completed. No success was recorded.')).toBeVisible();
  expect(fixture.committedCommands.filter(item => item.commandType === 'assessment_v2.create')).toEqual([]);
});

test('actual App Admin navigation reaches Users and Roles without an Intelligence detour', async ({ page }) => {
  await installEnterpriseFixture(page,{capabilities:[...ALL_CAPABILITIES,'org.admin','admin.synthetic.users.manage']});
  const rosterRequests: Record<string,unknown>[] = [];
  await page.route(`${API}/functions/v1/synthetic-admin`, async route => {
    if (route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:jsonHeaders});
    const body=route.request().postDataJSON();
    rosterRequests.push(body);
    expect(body).toEqual({operation:'list',organizationId:ORG,workspaceId:WS,expectedAuthorizationVersion:9,payload:{limit:20}});
    await route.fulfill({status:200,headers:jsonHeaders,body:JSON.stringify({status:'listed',roster:[],nextCursor:null})});
  });
  await page.goto('/'); await expectProcessCatalog(page);
  const menu=page.getByRole('button',{name:'Open navigation',exact:true});
  if(await menu.isVisible()) await menu.click();
  await page.getByRole('button',{name:/^Admin(?: \/ Intelligence)?$/}).click();
  await expect(page.getByRole('heading',{name:'Admin Workbench',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Users \/ Roles/}).click();
  await expect(page.getByRole('heading',{name:'Synthetic test accounts',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reserve account',exact:true})).toBeVisible();
  await expect.poll(()=>rosterRequests.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading',{name:'Enterprise Intelligence',exact:true})).toHaveCount(0);
  const firstReads=rosterRequests.length;
  await page.reload();
  await expect(page.getByRole('heading',{name:'Admin Workbench',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Users \/ Roles/}).click();
  await expect(page.getByRole('button',{name:'Reserve account',exact:true})).toBeVisible();
  await expect.poll(()=>rosterRequests.length).toBeGreaterThan(firstReads);
  const accessibility=await new AxeBuilder({page}).include('[data-testid="synthetic-user-management"]').analyze();
  expect(accessibility.violations.filter(item=>item.impact==='serious'||item.impact==='critical')).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('actual App hides Admin navigation without current server Admin capabilities', async ({ page }) => {
  await installEnterpriseFixture(page);
  let adminRequests=0;
  page.on('request',request=>{if(request.url().includes('/functions/v1/synthetic-admin')) adminRequests++;});
  await page.goto('/'); await expectProcessCatalog(page);
  const menu=page.getByRole('button',{name:'Open navigation',exact:true});
  if(await menu.isVisible()) await menu.click();
  await expect(page.getByRole('button',{name:/^Admin(?: \/ Intelligence)?$/})).toHaveCount(0);
  expect(adminRequests).toBe(0);
});
