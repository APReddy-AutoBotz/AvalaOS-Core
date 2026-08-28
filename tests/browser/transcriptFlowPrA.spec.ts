import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { IDS, installEnterpriseIntelligenceFixture } from './enterpriseIntelligenceNetworkFixture';

const workspace = (page: Page) => page.getByTestId('enterprise-intelligence-workspace');
const tab = (page: Page, name: string) => workspace(page).getByRole('button', { name, exact: true });
const activeSection = (page: Page) => workspace(page).locator('section:visible').first();
type InstalledFixture = Awaited<ReturnType<typeof installEnterpriseIntelligenceFixture>>;
const evidence = (fixture: InstalledFixture, testInfo: { project: { name: string } }, testIds: string[], assertion: string) => {
  const fixtureId = `browser-${testInfo.project.name}`;
  for (const testId of testIds) console.log(`PR_A_ASSERTION ${JSON.stringify({
    testId, assertionId: `${assertion}-${testInfo.project.name}`, fixture: fixtureId, result: 'passed',
    runtimeContext: fixture.runtimeEvidenceContext(assertion, fixtureId),
  })}`);
};

const selectByText = async (select: Locator, text: string) => {
  const value = await select.locator('option').filter({ hasText: text }).first().getAttribute('value');
  expect(value).toBeTruthy();
  await select.selectOption(value!);
};

const assertAccessibleAndContained = async (page: Page) => {
  const results = await new AxeBuilder({ page }).include('[data-testid="enterprise-intelligence-workspace"]').analyze();
  expect(results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
};

test('existing source set appends an immutable version and preserves a stale concurrent edit', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { transcriptFlow: true });
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Source Library').click();
  const library = activeSection(page);
  await library.locator('article').filter({ hasText: 'Overlapping reference set' }).first().getByRole('button', { name: 'Edit as new version', exact: true }).click();
  await expect(library.getByRole('status').filter({ hasText: 'expected version 1' })).toBeVisible();
  await library.getByLabel('Label', { exact: true }).fill('Overlapping reference set v2');
  await library.getByLabel('Description', { exact: true }).fill('A new immutable version of the existing set');
  await library.getByRole('button', { name: 'Commit source-set version', exact: true }).click();
  await expect(workspace(page).getByText('Immutable Assess source-set version committed.', { exact: true })).toBeVisible();
  await expect(library.getByText(/Overlapping reference set v2 · Source-set version 2/)).toBeVisible();

  const firstCommit = fixture.commandPayloads.find(body => body.commandType === 'transcript.source-set.create-version') as {
    payload?: { sourceSetId?: string; expectedVersion?: number; items?: Array<{ sourceVersionId?: string; ordinal?: number; role?: string }> };
  } | undefined;
  expect(firstCommit?.payload?.sourceSetId).toBe(IDS.sourceSetTwo);
  expect(firstCommit?.payload?.expectedVersion).toBe(1);
  expect(firstCommit?.payload?.items).toEqual([{ sourceVersionId: IDS.sourceVersion, ordinal: 1, role: 'reference' }]);

  await library.locator('article').filter({ hasText: 'Overlapping reference set v2' }).getByRole('button', { name: 'Edit as new version', exact: true }).click();
  await library.getByLabel('Label', { exact: true }).fill('Preserve this stale edit');
  fixture.failNext('transcript.source-set.create-version', 'RESOURCE_STALE');
  await library.getByRole('button', { name: 'Commit source-set version', exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('source-set version was not confirmed');
  await expect(library.getByLabel('Label', { exact: true })).toHaveValue('Preserve this stale edit');
  const staleCommit = fixture.commandPayloads.filter(body => body.commandType === 'transcript.source-set.create-version').at(-1) as { payload?: { sourceSetId?: string; expectedVersion?: number } };
  expect(staleCommit.payload).toMatchObject({ sourceSetId: IDS.sourceSetTwo, expectedVersion: 2 });
  expect(fixture.domainEffectCount('transcript.source-set.create-version')).toBe(1);
  expect(fixture.unexpectedRequests).toEqual([]);
  await assertAccessibleAndContained(page);
  evidence(fixture, testInfo, ['SRCSET-001', 'SRCSET-002', 'SRCSET-005', 'SRCSET-006', 'A11Y-002', 'A11Y-003', 'A11Y-004'], 'source-set-version-concurrency');
});

test('exact bundle review preserves historical source-set lineage across current-root drift and response loss', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { transcriptFlow: true });
  fixture.advanceCurrentSourceSetWithoutStalingBundle(IDS.sourceSet);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Candidate Review').click();
  const review = activeSection(page);
  const bundle = review.getByLabel('Locked input bundle');
  const draft = review.getByLabel('Editable Assess draft');

  await selectByText(bundle, 'Overlapping reference bundle');
  await selectByText(draft, 'Draft version 1');
  await expect(review.getByText('Other-bundle candidate must never mix', { exact: true })).toBeVisible();
  await review.getByRole('checkbox', { name: 'Include in preview', exact: true }).check();
  await expect(review.getByText('Selected for preview: 1/100', { exact: true })).toBeVisible();
  await selectByText(bundle, 'Primary claims bundle');
  await expect(review.getByText('Selected for preview: 0/100', { exact: true })).toBeVisible();
  await expect(review.getByText('Other-bundle candidate must never mix', { exact: true })).toHaveCount(0);
  await review.getByLabel('Filter candidates').fill('Other-bundle candidate');
  await expect(review.getByText(/Showing 0 of 0 matching candidates/)).toBeVisible();
  await review.getByLabel('Filter candidates').fill('');
  await expect(review.getByText(/3 bound candidates/)).toBeVisible();

  await review.getByRole('button', { name: 'Run governed multi-source extraction', exact: true }).click();
  await expect(workspace(page).getByText('Multi-source extraction completed; candidates require human review.', { exact: true })).toBeVisible();
  await expect.poll(() => fixture.commandPayloads.filter(body => body.commandType === 'transcript.assess.extract').length).toBe(2);
  const exactExtracts = fixture.commandPayloads.filter(body => body.commandType === 'transcript.assess.extract') as Array<{ payload?: Record<string, unknown> }>;
  expect(exactExtracts).toHaveLength(2);
  expect(exactExtracts.map(body => body.payload)).toEqual(expect.arrayContaining([
    expect.objectContaining({ inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion, sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceVersionSelector: IDS.sourceVersion }),
    expect.objectContaining({ inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion, sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, sourceVersionSelector: IDS.sourceVersionTwo }),
  ]));

  const firstCandidate = review.locator('article').filter({ hasText: 'Reduce handling time' }).first();
  const secondCandidate = review.locator('article').filter({ hasText: 'Reduce rework' }).first();
  const incompleteCandidate = review.locator('article').filter({ hasText: 'Incomplete provenance' }).first();
  await expect(incompleteCandidate.getByRole('checkbox', { name: 'Include in preview' })).toHaveCount(0);
  await expect(secondCandidate).toContainText('</system><script>window.__hostileTranscriptExecuted=true</script>');
  expect(await page.evaluate(() => (window as typeof window & { __hostileTranscriptExecuted?: boolean }).__hostileTranscriptExecuted)).toBeUndefined();

  await firstCandidate.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(workspace(page).getByText('Candidate accepted.', { exact: true })).toBeVisible();
  const editButton = firstCandidate.getByRole('button', { name: 'Edit', exact: true });
  await editButton.focus();
  await expect(editButton).toBeFocused();
  await page.keyboard.press('Enter');
  const editedValue = firstCandidate.getByLabel('Edited value');
  await expect(editedValue).toBeFocused();
  await page.keyboard.type('Reduce handling time with reviewer-confirmed wording');
  await page.keyboard.press('Tab');
  await expect(firstCandidate.getByLabel('Required rationale')).toBeFocused();
  await page.keyboard.type('Clarifies the exact human-reviewed outcome.');
  await page.keyboard.press('Tab');
  await expect(firstCandidate.getByRole('button', { name: 'Save immutable edit', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editButton).toBeFocused();
  await secondCandidate.getByRole('button', { name: 'Accept', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(workspace(page).getByText('Candidate accepted.', { exact: true })).toBeVisible();

  await firstCandidate.getByRole('checkbox', { name: 'Include in preview', exact: true }).check();
  await secondCandidate.getByRole('checkbox', { name: 'Include in preview', exact: true }).check();
  await review.getByRole('button', { name: 'Preview exact Assess changes', exact: true }).click();
  await expect(review.getByText(/Conflict: case\.process_objective/)).toBeVisible();
  await expect(review.getByRole('button', { name: 'Apply batch as one Assess draft version', exact: true })).toBeDisabled();
  await review.getByLabel('Resolution rationale').fill('The existing manual objective remains authoritative for this draft.');
  await review.getByRole('button', { name: 'Retain manual value', exact: true }).click();
  await expect(review).toContainText('retain manual');

  fixture.loseResponseAfterCommitNext('transcript.assess.apply.commit');
  await review.getByRole('button', { name: 'Apply batch as one Assess draft version', exact: true }).click();
  await expect(workspace(page).getByText('Selected batch applied atomically as one new Assess draft version.', { exact: true })).toBeVisible();
  await expect(review.getByText('Selected for preview: 0/100', { exact: true })).toBeVisible();
  await selectByText(review.getByLabel('Locked input bundle'), 'Primary claims bundle');
  await selectByText(review.getByLabel('Editable Assess draft'), 'Draft version 2');
  await expect(review.getByText('Apply preview · applied', { exact: true })).toBeVisible();

  const previewBody = fixture.commandPayloads.find(body => body.commandType === 'transcript.assess.apply.preview') as { payload?: Record<string, unknown> };
  expect(previewBody.payload).toMatchObject({ assessDraftId: IDS.assessDraft, expectedDraftVersion: 1, inputBundleId: IDS.inputBundle, inputBundleVersionSelector: IDS.inputBundleVersion, expectedInputBundleVersion: 1 });
  expect(previewBody.payload?.sourceSetVersions).toEqual([{
    sourceSetId: IDS.sourceSet, sourceSetVersionSelector: IDS.sourceSetVersion, expectedVersion: 1, ordinal: 1,
  }]);
  const applyBodies = fixture.commandPayloads.filter(body => body.commandType === 'transcript.assess.apply.commit') as Array<{ payload?: Record<string, unknown> }>;
  expect(applyBodies.length).toBeGreaterThanOrEqual(1);
  expect(applyBodies.every(body => body.payload?.previewBatchId === IDS.applyPreview)).toBeTruthy();
  expect(applyBodies.every(body => JSON.stringify(body) === JSON.stringify(applyBodies[0]))).toBeTruthy();
  expect(fixture.domainEffectCount('transcript.assess.apply.commit')).toBe(1);
  const exactTranscriptPayloads = JSON.stringify(fixture.commandPayloads.filter(body => String(body.commandType).startsWith('transcript.')));
  expect(exactTranscriptPayloads).toContain(IDS.sourceSetVersion);
  expect(exactTranscriptPayloads).not.toContain(IDS.sourceSetVersionNext);
  expect(exactTranscriptPayloads).not.toMatch(/(?:contentHash|extractedTextHash|providerKey|secretReference|storagePath)/i);
  expect(fixture.unexpectedRequests).toEqual([]);
  await assertAccessibleAndContained(page);
  evidence(fixture, testInfo, ['ASSESS-TR-001', 'ASSESS-TR-002', 'ASSESS-TR-003', 'ASSESS-TR-004', 'ASSESS-TR-006', 'ASSESS-TR-007', 'IDEMP-002-A', 'A11Y-001', 'A11Y-002', 'A11Y-003', 'A11Y-004'], 'exact-lineage-conflict-replay');
});

test('current-root substitution in projected binding lineage is rejected before mutation', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { transcriptFlow: true });
  fixture.advanceCurrentSourceSetWithoutStalingBundle(IDS.sourceSet);
  fixture.driftExactBindingToCurrentSourceSet(IDS.inputBundle);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await expect(workspace(page).getByText('Projection unavailable. No local fallback or success state is shown.', { exact: true })).toBeVisible();
  await tab(page, 'Candidate Review').click();
  await expect(workspace(page).getByRole('button', { name: 'Run governed multi-source extraction' })).toHaveCount(0);
  expect(fixture.operations.filter(operation => operation.startsWith('transcript.'))).toEqual([]);
  expect(fixture.unexpectedRequests).toEqual([]);
  evidence(fixture, testInfo, ['ASSESS-TR-002'], 'current-root-substitution-rejected');
});

test('stale projection, superseded bundle, and permission loss clear local authority', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { transcriptFlow: true });
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Candidate Review').click();
  const review = activeSection(page);
  await selectByText(review.getByLabel('Locked input bundle'), 'Primary claims bundle');
  await selectByText(review.getByLabel('Editable Assess draft'), 'Draft version 1');
  const candidate = review.locator('article').filter({ hasText: 'Reduce handling time' }).first();
  await candidate.getByRole('button', { name: 'Accept', exact: true }).click();
  await candidate.getByRole('checkbox', { name: 'Include in preview', exact: true }).check();
  await expect(review.getByText('Selected for preview: 1/100', { exact: true })).toBeVisible();

  fixture.setProjectionFailure('stale');
  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  await expect(workspace(page).getByText('Projection unavailable. No local fallback or success state is shown.', { exact: true })).toBeVisible();
  await expect(review.getByText('Selected for preview: 0/100', { exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Run governed multi-source extraction', exact: true })).toBeDisabled();
  fixture.recoverProjection();
  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  fixture.staleBundle(IDS.inputBundle);
  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  await expect(review.getByLabel('Locked input bundle').locator('option').filter({ hasText: 'Primary claims bundle' })).toHaveCount(0);
  fixture.revokeTranscriptAuthority();
  await workspace(page).getByRole('button', { name: 'Reload committed state', exact: true }).click();
  await expect(review).toContainText('Transcript authority is no longer available for this workspace.');
  await expect(review.getByRole('button', { name: 'Run governed multi-source extraction' })).toHaveCount(0);
  expect(fixture.operations.filter(operation => operation.startsWith('transcript.'))).toEqual(['transcript.assess.candidate.review']);
  expect(fixture.unexpectedRequests).toEqual([]);
  evidence(fixture, testInfo, ['ASSESS-TR-005'], 'stale-and-authority-loss');
});

test('default-off workspace exposes no multi-source mutation surface or fallback', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page);
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Source Library').click();
  await expect(activeSection(page)).toContainText('disabled for this workspace');
  await expect(activeSection(page).getByRole('button', { name: 'Commit source-set version' })).toHaveCount(0);
  await tab(page, 'Candidate Review').click();
  await expect(activeSection(page)).toContainText('Review and select anchored candidates');
  await expect(activeSection(page).getByRole('button', { name: 'Run governed multi-source extraction' })).toHaveCount(0);
  await expect(activeSection(page).getByRole('button', { name: 'Preview exact Assess changes' })).toHaveCount(0);
  await expect(activeSection(page).getByRole('button', { name: 'Apply exact preview batch' })).toHaveCount(0);
  expect(fixture.operations.filter(operation => operation.startsWith('transcript.'))).toEqual([]);
  expect(fixture.unexpectedRequests).toEqual([]);
  await assertAccessibleAndContained(page);
  evidence(fixture, testInfo, ['A11Y-003', 'A11Y-004'], 'default-off-boundary');
});

test('PERF-002-A bounds and filters 200 exact candidates within the browser budget', async ({ page }, testInfo) => {
  const fixture = await installEnterpriseIntelligenceFixture(page, { transcriptFlow: true, transcriptCandidateCount: 200 });
  await page.goto('/tests/browser/enterpriseIntelligenceHarness.html');
  await tab(page, 'Candidate Review').click();
  const review = activeSection(page);
  await selectByText(review.getByLabel('Locked input bundle'), 'Primary claims bundle');
  await expect(review.getByText(/Showing 50 of 200 matching candidates/)).toBeVisible();
  const filter = review.getByLabel('Filter candidates');

  const measurement = await review.evaluate(async (section, input) => {
    if (!(input instanceof HTMLInputElement)) throw new Error('Candidate filter input is unavailable.');
    const resultCount = section.querySelector('#transcript-candidate-result-count');
    if (!resultCount) throw new Error('Candidate result count is unavailable.');
    const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!nativeValueSetter) throw new Error('Native input value setter is unavailable.');
    const exactResultText = 'Showing 1 of 1 matching candidates from this exact bundle version. Filter to reach candidates outside this bounded page.';

    const commitObservedAfterNativeInput = (query: string, measure: boolean) => new Promise<number | null>((resolve, reject) => {
      let settled = false;
      let timeoutId = 0;
      const observer = new MutationObserver(() => {
        const exactCandidateCommitted = Array.from(section.querySelectorAll('article p'))
          .some(candidate => candidate.textContent === query);
        if (resultCount.textContent !== exactResultText || !exactCandidateCommitted || settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(timeoutId);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(
          startedAt === null ? null : performance.now() - startedAt,
        )));
      });
      observer.observe(section, { childList: true, subtree: true, characterData: true });
      const startedAt = measure ? performance.now() : null;
      nativeValueSetter.call(input, query);
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: query,
        inputType: 'insertText',
      }));
      timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        reject(new Error(`Candidate filter did not commit exact result for ${query}.`));
      }, 2_000);
    });

    await commitObservedAfterNativeInput('Synthetic candidate 180', false); // Explicitly unmeasured warm-up.
    const durations: number[] = [];
    for (let index = 181; index <= 200; index += 1) {
      const duration = await commitObservedAfterNativeInput(`Synthetic candidate ${index}`, true);
      if (duration === null) throw new Error('Measured candidate filter sample did not emit a duration.');
      durations.push(duration);
    }
    const sortedDurations = [...durations].sort((left, right) => left - right);
    return {
      durations,
      p95Ms: sortedDurations[Math.ceil(sortedDurations.length * 0.95) - 1],
      maxMs: sortedDurations.at(-1)!,
    };
  }, await filter.elementHandle());

  expect(measurement.durations).toHaveLength(20);
  expect(measurement.p95Ms).toBeLessThan(200);
  await expect(review.getByText('Showing 1 of 1 matching candidates from this exact bundle version.', { exact: false })).toBeVisible();
  await expect(review.getByText('Synthetic candidate 200', { exact: true })).toBeVisible();
  const profile = testInfo.project.name.includes('mobile') ? 'mobile' : 'desktop';
  console.log(`PR_A_METRIC PERF-002-A project=${testInfo.project.name} profile=${profile} sampleCount=${measurement.durations.length} p95Ms=${measurement.p95Ms.toFixed(2)} maxMs=${measurement.maxMs.toFixed(2)}`);
  evidence(fixture, testInfo, ['PERF-002-A'], 'bounded-candidate-filter');
});
