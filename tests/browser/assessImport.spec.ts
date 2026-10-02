import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { inlineCell, syntheticWorkbook } from '../fixtures/assessImportSpreadsheets';
import { PROCESS_CREATE_CAPABILITY } from '../../services/processCreationContract';
import { ALL_CAPABILITIES, installEnterpriseFixture } from './pr1dNetworkFixture';
import { installAssessImportFixture } from './assessImportNetworkFixture';

const mappingCapabilities = ['evidence.review','evidence.write','transcript.sources.manage','transcript.sources.read','transcript.assess.apply'] as const;

const expectAccessibleWithoutOverflow = async (page: Parameters<typeof installEnterpriseFixture>[0]) => {
  const violations = await new AxeBuilder({page}).include('[data-testid="assess-supporting-document-intake"]').analyze();
  expect(violations.violations.filter(item => ['serious','critical'].includes(item.impact || ''))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
};

const evidenceWorkbook = () => syntheticWorkbook([
  { name:'Process', cells:`<row r="1">${inlineCell('A1', 'Process name')}${inlineCell('B1', 'AI mapped invoice resolution')}</row><row r="2">${inlineCell('A2', 'Description')}${inlineCell('B2', 'AI proposed replacement description')}</row><row r="3">${inlineCell('A3', 'Evidence')}${inlineCell('B3', 'Evidence-only supporting note')}</row><row r="4"><c r="C4"><f>1+1</f><v>2</v></c><c r="D4" t="e"><v>#VALUE!</v></c></row>` },
  { name:'Systems', cells:`<row r="1">${inlineCell('A1', 'Application')}${inlineCell('B1', 'Synthetic ERP')}</row>` },
  { name:'HiddenInputs', state:'hidden', cells:`<row r="1">${inlineCell('A1', 'Excluded private helper data')}</row>` },
]);

const openNativeDraft = async (page: Parameters<typeof installEnterpriseFixture>[0], expectEnabled = true) => {
  await page.goto('/');
  await expect(page.getByTestId('process-catalog-view')).toBeVisible({timeout:15_000});
  await page.getByRole('button',{name:'View'}).first().click();
  await expect(page.getByTestId('assess-v2-workspace')).toBeVisible();
  await page.getByRole('button',{name:'New assessment (V2)'}).click();
  await expect(page.getByTestId('assess-supporting-document-intake')).toBeVisible();
  if (expectEnabled) await expect(page.locator('#assess-supporting-files')).toBeEnabled();
};

const uploadAndLock = async (page: Parameters<typeof installEnterpriseFixture>[0], files: Array<{name:string;mimeType:string;buffer:Buffer}>) => {
  await page.locator('#assess-supporting-files').setInputFiles(files);
  while (await page.getByRole('button',{name:'Store private source'}).count()) {
    await page.getByRole('button',{name:'Store private source'}).first().click();
    await expect(page.getByRole('status').filter({hasText:'private immutable source'})).toBeVisible();
  }
  const sourceStep = page.getByText('2. Select exact sources').locator('..');
  const readySources = sourceStep.locator('fieldset').first().getByRole('checkbox');
  await expect(readySources).toHaveCount(files.length);
  for (let index=0; index<files.length; index+=1) await readySources.nth(index).check();
  await sourceStep.getByRole('button',{name:'Commit source set'}).click();
  const committedSets = sourceStep.getByRole('group',{name:'Committed Assess source sets'});
  await expect(committedSets.getByRole('checkbox')).toHaveCount(1);
  await committedSets.getByRole('checkbox').check();
  await sourceStep.getByRole('button',{name:'Lock analysis bundle'}).click();
  const reviewStep = page.getByText('3. Analyze and review AI suggestions').locator('..');
  await reviewStep.getByLabel('Locked source bundle').selectOption({index:1});
  return reviewStep;
};

const analyzeAndPreviewEditedName = async (page: Parameters<typeof installEnterpriseFixture>[0]) => {
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  const editButton = nameCard.getByRole('button',{name:'Edit'});
  await editButton.focus();
  await page.keyboard.press('Enter');
  const suggestedValue = nameCard.getByLabel('Suggested value');
  await expect(suggestedValue).toBeFocused();
  await suggestedValue.fill('Human-reviewed invoice resolution');
  await expectAccessibleWithoutOverflow(page);
  await page.keyboard.press('Tab');
  const editReason = nameCard.getByLabel('Reason for edit');
  await expect(editReason).toBeFocused();
  await editReason.fill('Use the reviewer-approved process name.');
  await page.keyboard.press('Tab');
  await expect(nameCard.getByRole('button',{name:'Save reviewed edit'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nameCard.getByRole('button',{name:'Edit'})).toBeFocused();
  await nameCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await reviewStep.getByRole('button',{name:/Preview 1 reviewed suggestion/}).click();
  return page.getByText('4. Resolve conflicts and apply one immutable version').locator('..');
};

const analyzeAndPreviewDescriptionConflict = async (page: Parameters<typeof installEnterpriseFixture>[0]) => {
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  const descriptionCard = reviewStep.locator('article').filter({hasText:'Case description'});
  await descriptionCard.getByRole('button',{name:'Accept'}).click();
  await descriptionCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await reviewStep.getByRole('button',{name:/Preview 1 reviewed suggestion/}).click();
  const applyStep = page.getByTestId('assess-mapping-preview');
  await expect(applyStep).toContainText('Current manual value: V2 case');
  return applyStep;
};

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.dismiss());
});

test('actual Assess route uploads multiple sources, reviews typed AI suggestions, retains a manual conflict, applies, and reopens', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors:string[]=[];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page);

  const supportingFiles = page.locator('#assess-supporting-files');
  await page.locator('body').click({position:{x:2,y:2}});
  for (let step=0; step<60 && !await supportingFiles.evaluate(element => element === document.activeElement); step+=1) await page.keyboard.press('Tab');
  await expect(supportingFiles).toBeFocused();
  await supportingFiles.setInputFiles([
    { name:'meeting-notes.txt', mimeType:'text/plain', buffer:Buffer.from('Invoice exception meeting: retain owner review and reduce rework.') },
    { name:'process-register.csv', mimeType:'text/csv', buffer:Buffer.from('Field,Value\nProcess,Invoice exception handling\nOwner,Finance operations') },
    { name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) },
  ]);
  await expect(page.getByText('meeting-notes.txt', { exact:false })).toBeVisible();
  await expect(page.getByText('process-register.csv', { exact:false })).toBeVisible();
  await expect(page.getByText('systems.xlsx', { exact:false })).toBeVisible();
  while (await page.getByRole('button',{name:'Store private source'}).count()) {
    await page.getByRole('button',{name:'Store private source'}).first().click();
    await expect(page.getByRole('status').filter({hasText:'private immutable source'})).toBeVisible();
  }

  const sourceStep = page.getByText('2. Select exact sources').locator('..');
  const readySources = sourceStep.locator('fieldset').first().getByRole('checkbox');
  await expect(readySources).toHaveCount(3);
  for (let index=0; index<3; index+=1) await readySources.nth(index).check();
  await sourceStep.getByRole('button',{name:'Commit source set'}).click();
  const committedSets = sourceStep.getByRole('group',{name:'Committed Assess source sets'});
  await expect(committedSets.getByRole('checkbox')).toHaveCount(1);
  await committedSets.getByRole('checkbox').check();
  await sourceStep.getByRole('button',{name:'Lock analysis bundle'}).click();

  const reviewStep = page.getByText('3. Analyze and review AI suggestions').locator('..');
  await reviewStep.getByLabel('Locked source bundle').selectOption({index:1});
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  await expect(reviewStep.getByText('Parser disclosures')).toBeVisible();
  await expect(reviewStep).toContainText('HIDDEN_SHEETS_EXCLUDED');
  await expect(reviewStep).toContainText('FORMULA_CELLS_AND_CACHED_VALUES_EXCLUDED');
  await expect(reviewStep).toContainText('ERROR_CELLS_EXCLUDED');
  await expect(reviewStep.getByLabel('Source citation for Case name')).toContainText('Location: sheet:"Process";cell:B1');

  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  const editButton = nameCard.getByRole('button',{name:'Edit'});
  await editButton.focus();
  await page.keyboard.press('Enter');
  const suggestedValue = nameCard.getByLabel('Suggested value');
  await expect(suggestedValue).toBeFocused();
  await suggestedValue.fill('Human-reviewed invoice resolution');
  await expectAccessibleWithoutOverflow(page);
  await nameCard.scrollIntoViewIfNeeded();
  const reviewScreenshot = testInfo.outputPath('synthetic-assess-document-review-editor.png');
  await page.screenshot({path:reviewScreenshot, fullPage:false});
  await testInfo.attach('Synthetic document review editor UI', {path:reviewScreenshot, contentType:'image/png'});
  await page.keyboard.press('Tab');
  const editReason = nameCard.getByLabel('Reason for edit');
  await expect(editReason).toBeFocused();
  await editReason.fill('Use the reviewer-approved process name.');
  await page.keyboard.press('Tab');
  await expect(nameCard.getByRole('button',{name:'Save reviewed edit'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nameCard.getByRole('button',{name:'Edit'})).toBeFocused();
  const descriptionCard = reviewStep.locator('article').filter({hasText:'Case description'});
  await descriptionCard.getByRole('button',{name:'Accept'}).click();
  const evidenceCard = reviewStep.locator('article').filter({hasText:'Linked source evidence'});
  await evidenceCard.getByRole('button',{name:'Reject'}).click();
  await nameCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await descriptionCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await reviewStep.getByRole('button',{name:/Preview 2 reviewed suggestions/}).click();

  const applyStep = page.getByText('4. Resolve conflicts and apply one immutable version').locator('..');
  await expect(applyStep).toContainText('Current manual value: V2 case');
  await expectAccessibleWithoutOverflow(page);
  await applyStep.scrollIntoViewIfNeeded();
  const conflictScreenshot = testInfo.outputPath('synthetic-assess-document-unresolved-conflict.png');
  await page.screenshot({path:conflictScreenshot, fullPage:false});
  await testInfo.attach('Synthetic document unresolved conflict UI', {path:conflictScreenshot, contentType:'image/png'});
  await applyStep.getByLabel('Required resolution rationale').fill('Retain the manually authored scope description.');
  await applyStep.getByRole('button',{name:'Retain manual value'}).focus();
  await page.keyboard.press('Enter');
  const resolvedConflict = applyStep.locator('article').filter({hasText:'Case description'});
  await expect(resolvedConflict.getByText('Final resolved value')).toBeVisible();
  await expect(resolvedConflict).toContainText('V2 case');
  await page.getByRole('button',{name:'Reload committed state'}).click();
  await expect(resolvedConflict).toContainText('Final resolved value');
  await expect(resolvedConflict).toContainText('V2 case');
  const applyButton = applyStep.getByRole('button',{name:'Apply reviewed batch to Assess'});
  await expect(applyButton).toBeEnabled();
  await applyButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('V2 case name')).toHaveValue('Human-reviewed invoice resolution');
  await expect(page.getByLabel('V2 case description')).toHaveValue('V2 case');
  expect(mapping.operations.filter(operation => operation === 'assess.document-map.analyze')).toHaveLength(1);
  expect(mapping.operations).not.toContain('transcript.assess.extract');

  await expectAccessibleWithoutOverflow(page);
  expect(errors.filter(item => !item.includes('Failed to load resource'))).toEqual([]);

  await page.reload();
  await expect(page.getByLabel('V2 case name')).toHaveValue('Human-reviewed invoice resolution');
  await expect(page.getByLabel('V2 case description')).toHaveValue('V2 case');
});

for (const resolution of [
  { name:'selected suggestion', button:'Use selected suggestion', value:'AI proposed replacement description' },
  { name:'reviewer-authored value', button:'Use edited resolution', value:'Reviewer-authored scoped description' },
] as const) {
  test(`${resolution.name} is displayed as the final resolved value before apply and survives authoritative reload`, async ({ page }, testInfo) => {
    const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
    await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
    await openNativeDraft(page);
    const applyStep = await analyzeAndPreviewDescriptionConflict(page);
    const conflictCard = applyStep.locator('article').filter({hasText:'Case description'});
    await conflictCard.getByLabel('Required resolution rationale').fill(`Use the ${resolution.name} after human review.`);
    if (resolution.button === 'Use edited resolution') await conflictCard.getByLabel('Suggested value').fill(resolution.value);
    await conflictCard.getByRole('button',{name:resolution.button}).click();
    await expect(conflictCard.getByText('Final resolved value')).toBeVisible();
    await expect(conflictCard).toContainText(resolution.value);

    await page.getByRole('button',{name:'Reload committed state'}).click();
    await expect(conflictCard.getByText('Final resolved value')).toBeVisible();
    await expect(conflictCard).toContainText(resolution.value);
    await expectAccessibleWithoutOverflow(page);
    const screenshot = testInfo.outputPath(`synthetic-assess-document-${resolution.button === 'Use edited resolution' ? 'authored' : 'selected'}-resolved.png`);
    await conflictCard.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshot, fullPage:false});
    await testInfo.attach(`Synthetic ${resolution.name} final resolved value`, {path:screenshot, contentType:'image/png'});

    const applyButton = applyStep.getByRole('button',{name:'Apply reviewed batch to Assess'});
    await expect(applyButton).toBeEnabled();
    await applyButton.click();
    await expect(page.getByLabel('V2 case description')).toHaveValue(resolution.value);
    await page.reload();
    await expect(page.getByLabel('V2 case description')).toHaveValue(resolution.value);
  });
}

test('native mapping blocks document actions while manual Assess changes are unsaved', async ({ page }) => {
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, ...mappingCapabilities])] });
  await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page);
  await page.getByLabel('V2 case name').fill('Unsaved manual name');
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Save or reload the current manual Assess changes');
  await expect(intake.locator('#assess-supporting-files')).toBeDisabled();
  await expect(intake.getByRole('button',{name:'Analyze selected documents'})).toBeDisabled();
});

for (const gate of ['feature-disabled', 'capability-missing'] as const) {
  test(`${gate} independently fails closed on the actual Assess route`, async ({ page }) => {
    const all = [...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])];
    const capabilities = gate === 'capability-missing' ? all.filter(capability => capability !== 'transcript.assess.apply') : all;
    const base = await installEnterpriseFixture(page, { capabilities });
    const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), featureEnabled:gate !== 'feature-disabled' });
    await openNativeDraft(page, false);
    const intake = page.getByTestId('assess-supporting-document-intake');
    if (gate === 'feature-disabled') {
      await expect(intake).toContainText('disabled for this synthetic workspace');
      await expect(intake.locator('#assess-supporting-files')).toBeDisabled();
    } else {
      await expect(intake).toContainText('Preview, conflict resolution, and apply are unavailable: transcript.assess.apply');
      await expect(intake).not.toContainText('disabled for this synthetic workspace');
      await expect(intake.locator('#assess-supporting-files')).toBeEnabled();
    }
    await expect(intake.getByRole('button',{name:'Analyze selected documents'})).toBeDisabled();
    expect(mapping.operations).toEqual([]);
  });
}

test('selected bundle uses its newest exact run, bound catalog, and newest preview while retaining history', async ({ page }) => {
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), includeHistoricalMappingState:true });
  await openNativeDraft(page);
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await expect(reviewStep.getByLabel('Locked source bundle').locator('option')).toHaveCount(3);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  await expect(reviewStep.locator('article').filter({hasText:'Case name'})).toBeVisible();
  await expect(reviewStep).not.toContainText('OLD_HISTORY_RUN_MUST_NOT_RENDER');
  await expect(reviewStep).not.toContainText('OTHER_BUNDLE_RUN_MUST_NOT_RENDER');
  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  await nameCard.getByRole('button',{name:'Accept'}).click();
  await nameCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await reviewStep.getByRole('button',{name:/Preview 1 reviewed suggestion/}).click();
  const applyStep = page.getByTestId('assess-mapping-preview');
  await expect(applyStep).toContainText('Case name');
  await expect(applyStep).not.toContainText('OLD_HISTORY_PREVIEW_MUST_NOT_RENDER');
});

test('fresh evidence review capability gates review and apply without blocking private source intake', async ({ page }) => {
  const capabilities = [...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])]
    .filter(capability => capability !== 'evidence.review');
  const base = await installEnterpriseFixture(page, { capabilities });
  await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page);
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Suggestion review is unavailable: evidence.review');
  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  await expect(nameCard.getByRole('button',{name:'Accept'})).toBeDisabled();
  await expect(nameCard.getByRole('button',{name:'Edit'})).toBeDisabled();
  await expect(nameCard.getByRole('button',{name:'Reject'})).toBeDisabled();
  await expect(reviewStep.getByRole('button',{name:/Preview.*reviewed suggestions/})).toBeDisabled();
});

test('missing apply authority does not block upload, analysis, or review but cannot select or preview', async ({ page }) => {
  const capabilities = [...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])]
    .filter(capability => capability !== 'transcript.assess.apply');
  const base = await installEnterpriseFixture(page, { capabilities });
  await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page);
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Preview, conflict resolution, and apply are unavailable: transcript.assess.apply');
  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  await expect(nameCard.getByRole('button',{name:'Accept'})).toBeEnabled();
  await nameCard.getByRole('button',{name:'Accept'}).click();
  await expect(nameCard.getByRole('checkbox',{name:'Include in preview'})).toBeDisabled();
  await expect(reviewStep.getByRole('button',{name:/Preview.*reviewed suggestion/})).toBeDisabled();
});

test('missing source-read authority disables the complete mapping context with exact reasons', async ({ page }) => {
  const capabilities = [...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])]
    .filter(capability => capability !== 'transcript.sources.read');
  const base = await installEnterpriseFixture(page, { capabilities });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page, false);
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Upload is unavailable: transcript.sources.read');
  await expect(intake).toContainText('Suggestion review is unavailable: transcript.sources.read');
  await expect(intake).toContainText('Preview, conflict resolution, and apply are unavailable: transcript.sources.read');
  await expect(intake.locator('#assess-supporting-files')).toBeDisabled();
  expect(mapping.operations).toEqual([]);
});

test('an incomplete ready preview never exposes partial displayed changes or apply authority', async ({ page }) => {
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), incompletePreviewProjection:true });
  await openNativeDraft(page);
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  const nameCard = reviewStep.locator('article').filter({hasText:'Case name'});
  await nameCard.getByRole('button',{name:'Accept'}).click();
  await nameCard.getByRole('checkbox',{name:'Include in preview'}).check();
  await reviewStep.getByRole('button',{name:/Preview 1 reviewed suggestion/}).click();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('The latest preview projection is incomplete');
  await expect(intake.getByTestId('assess-mapping-preview')).toHaveCount(0);
  await expect(intake.getByRole('button',{name:'Apply reviewed batch to Assess'})).toHaveCount(0);
});

test('oversized file selections are rejected explicitly without silent truncation or upload', async ({ page }) => {
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values) });
  await openNativeDraft(page);
  await page.locator('#assess-supporting-files').setInputFiles(Array.from({length:21}, (_, index) => ({
    name:`synthetic-note-${index + 1}.txt`, mimeType:'text/plain', buffer:Buffer.from('Synthetic bounded document.'),
  })));
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake.getByRole('alert')).toContainText('at most 20 pending documents');
  await expect(intake.getByRole('button',{name:'Store private source'})).toHaveCount(0);
  expect(mapping.operations).toEqual([]);
});

test('unsupported files and an unavailable provider remain explicit and inert', async ({ page }) => {
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), providerReady:false });
  await openNativeDraft(page);
  const intake = page.getByTestId('assess-supporting-document-intake');
  await page.locator('#assess-supporting-files').setInputFiles({ name:'unsafe.exe', mimeType:'application/octet-stream', buffer:Buffer.from('not an accepted document') });
  await expect(intake.getByRole('alert')).toContainText('This format is not supported');
  await expect(intake.getByRole('button',{name:'Store private source'})).toHaveCount(0);
  await expect(intake).toContainText('No authorized, active Assess evidence route is ready');
  await expect(intake.getByRole('button',{name:'Analyze selected documents'})).toBeDisabled();
  expect(mapping.operations).toEqual([]);
});

test('analyze completion from an older case head cannot surface in the reloaded head', async ({ page }) => {
  test.setTimeout(90_000);
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), analyzeDelayMs:750 });
  await openNativeDraft(page);
  const reviewStep = await uploadAndLock(page, [{ name:'systems.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from(evidenceWorkbook()) }]);
  await reviewStep.getByRole('button',{name:'Analyze selected documents'}).click();
  await mapping.waitForAnalyzeStart();
  base.commitDocumentMapping({ name:'Externally advanced case head' });
  await page.getByRole('button',{name:'Reload current draft'}).first().click();
  await expect(page.getByLabel('V2 case name')).toHaveValue('Externally advanced case head');
  await mapping.waitForAnalyzeComplete();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).not.toContainText('AI mapped invoice resolution');
  await expect(intake).not.toContainText('Process!B1');
});

test('stale apply fails without optimistic Assess changes', async ({ page }) => {
  test.setTimeout(90_000);
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), applyFailure:'stale' });
  await openNativeDraft(page);
  const applyStep = await analyzeAndPreviewEditedName(page);
  await applyStep.getByRole('button',{name:'Apply reviewed batch to Assess'}).click();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Apply was not confirmed. No success state is shown.');
  await expect(intake).toContainText('selected resource changed on the server');
  await expect(page.getByLabel('V2 case name')).toHaveValue('Invoice exception handling');
  expect(mapping.operations.filter(operation => operation === 'assess.document-map.commit')).toHaveLength(1);
  await page.reload();
  await expect(page.getByLabel('V2 case name')).toHaveValue('Invoice exception handling');
});

test('lost apply response requires authoritative reload and never shows optimistic success', async ({ page }) => {
  test.setTimeout(90_000);
  const base = await installEnterpriseFixture(page, { capabilities:[...new Set([...ALL_CAPABILITIES, PROCESS_CREATE_CAPABILITY, ...mappingCapabilities])] });
  const mapping = await installAssessImportFixture(page, { onCommit: values => base.commitDocumentMapping(values), applyFailure:'unknown' });
  await openNativeDraft(page);
  const applyStep = await analyzeAndPreviewEditedName(page);
  await applyStep.getByRole('button',{name:'Apply reviewed batch to Assess'}).click();
  const intake = page.getByTestId('assess-supporting-document-intake');
  await expect(intake).toContainText('Apply outcome is unknown. Reload authoritative Assess state before retrying.');
  await expect(intake.getByRole('button',{name:'Apply reviewed batch to Assess'})).toBeDisabled();
  await expect(page.getByLabel('V2 case name')).toHaveValue('Invoice exception handling');
  expect(mapping.operations.filter(operation => operation === 'assess.document-map.commit')).toHaveLength(2);
  expect(new Set(mapping.commitAttemptBindings.map(attempt => attempt.idempotencyKey)).size).toBe(1);
  expect(new Set(mapping.commitAttemptBindings.map(attempt => attempt.requestId)).size).toBe(1);
});
