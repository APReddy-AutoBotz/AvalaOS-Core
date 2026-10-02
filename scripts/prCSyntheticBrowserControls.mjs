import assert from 'node:assert/strict';
import { canonicalDigest } from './prCControlledHumanEvidenceContract.mjs';

const visibleOptions = select => select.locator('option').evaluateAll(nodes => nodes
  .map(node => ({ value: node.value, label: node.textContent?.trim() ?? '' }))
  .filter(option => option.value));

export const waitForSyntheticDeliveryWorkspace = async page => {
  const workspace = page.getByTestId('governed-delivery-workspace');
  await workspace.waitFor({ state: 'visible' });
  assert.equal(await workspace.getAttribute('data-delivery-usable'), 'true', 'PR_C_SYNTHETIC_BROWSER_DELIVERY_NOT_USABLE');
  // An authorized empty list can have zero height; attachment proves it loaded.
  await workspace.getByRole('list', { name: 'Delivery packages', exact: true }).waitFor({ state: 'attached' });
  return workspace;
};

export const selectSyntheticDeliveryPackage = async (page, packageId) => {
  assert(typeof packageId === 'string' && /^[0-9a-f-]{36}$/u.test(packageId), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_ID_INVALID');
  const workspace = await waitForSyntheticDeliveryWorkspace(page);
  const choice = workspace.getByRole('list', { name: 'Delivery packages' }).locator(`button[data-package-id="${packageId}"]`);
  assert.equal(await choice.count(), 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_ID_COUNT');
  await choice.click();
  const selected = workspace.locator(`article[data-testid^="delivery-package-"][data-package-id="${packageId}"]`);
  await selected.waitFor({ state: 'visible' });
  return { workspace, selected };
};

export const prepareSyntheticStudioGeneration = async (page, interactionSequence, { artifactId, templateLabel }) => {
  assert(artifactId, 'PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_ARTIFACT_ID_MISSING');
  assert(templateLabel, 'PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_TEMPLATE_LABEL_MISSING');
  const workspace = page.getByTestId('studio-artifact-workspace');
  await workspace.waitFor({ state: 'visible' });
  const artifactSelect = workspace.getByLabel('Governed artifact', { exact: true });
  await artifactSelect.waitFor({ state: 'visible' });
  const artifactMatches = (await visibleOptions(artifactSelect)).filter(option => option.value === artifactId);
  assert.equal(artifactMatches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_ARTIFACT_COUNT:${artifactMatches.length}`);
  await artifactSelect.selectOption(artifactId);
  await page.waitForFunction(expectedArtifactId => {
    const root = document.querySelector('[data-testid="studio-artifact-workspace"]');
    const select = root?.querySelector('select[aria-label="Governed artifact"]');
    return root?.getAttribute('data-studio-usable') === 'true'
      && root.getAttribute('data-studio-projection-state') === 'workspace-ready'
      && select instanceof HTMLSelectElement
      && select.value === expectedArtifactId;
  }, artifactId);
  interactionSequence.push('select:exact-source-only-studio-artifact');

  const templateSelect = workspace.getByLabel('Exact approved Studio template', { exact: true });
  await templateSelect.waitFor({ state: 'visible' });
  const templateMatches = (await visibleOptions(templateSelect)).filter(option => option.label.split(' · v')[0] === templateLabel);
  assert.equal(templateMatches.length, 1, `PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_TEMPLATE_COUNT:${templateMatches.length}`);
  await templateSelect.selectOption(templateMatches[0].value);
  assert.equal(await templateSelect.inputValue(), templateMatches[0].value, 'PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_TEMPLATE_MISMATCH');
  interactionSequence.push('select:exact-approved-studio-template');

  const generate = workspace.getByRole('button', { name: /^Generate (?:governed package|synthetic controlled-human) draft$/u });
  assert.equal(await generate.count(), 1, 'PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_CONTROL_COUNT');
  await generate.waitFor({ state: 'visible' });
  assert(await generate.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_STUDIO_GENERATION_DISABLED');
  return { workspace, generate, artifactId, templateVersionId: templateMatches[0].value };
};

export const selectSyntheticDeliveryArtifact = async (page, interactionSequence, {
  artifactVersionId, artifactType, planningOnly,
}) => {
  assert(artifactVersionId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_VERSION_ID_MISSING');
  assert(artifactType, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_TYPE_MISSING');
  const section = page.getByRole('region', { name: 'Studio → Delivery handoffs' });
  const select = section.getByLabel('Eligible exact Studio artifact');
  await select.waitFor({ state: 'visible' });
  const matches = (await visibleOptions(select)).filter(option => option.value === artifactVersionId);
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_COUNT:${matches.length}`);
  const expectedClassification = planningOnly ? 'Not assessed · Planning only' : 'Assessed lineage';
  assert(matches[0].label.startsWith(`${String(artifactType).toUpperCase()} v`), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_TYPE_MISMATCH');
  assert(matches[0].label.endsWith(expectedClassification), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_LINEAGE_MISMATCH');
  await select.selectOption(artifactVersionId);
  assert.equal(await select.inputValue(), artifactVersionId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_SELECTION_MISMATCH');
  const preview = section.getByText(/^Server-derived handoff preview · [1-9][0-9]* items$/u, { exact: true });
  assert.equal(await preview.count(), 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_PREVIEW_COUNT');
  const request = section.getByRole('button', { name: 'Request handoff', exact: true });
  assert(await request.isEnabled(), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_HANDOFF_DISABLED');
  interactionSequence.push('select:exact-eligible-studio-artifact-version');
  return { section, select, request, optionLabel: matches[0].label };
};

const deliveryPackageIds = async page => {
  const workspace = await waitForSyntheticDeliveryWorkspace(page);
  const choices = workspace.getByRole('list', { name: 'Delivery packages' }).getByRole('button');
  const packageIds = [];
  for (let index = 0; index < await choices.count(); index += 1) {
    const packageId = await choices.nth(index).getAttribute('data-package-id');
    assert(packageId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_ID_MISSING');
    packageIds.push(packageId);
  }
  return packageIds;
};

export const verifySyntheticStudioApprovalHasNoDeliveryResource = async (page, interactionSequence, {
  artifactVersionId, artifactType, expectedPackageIds,
}) => {
  assert(Array.isArray(expectedPackageIds), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_SNAPSHOT_MISSING');
  const selected = await selectSyntheticDeliveryArtifact(page, interactionSequence, {
    artifactVersionId, artifactType, planningOnly: true,
  });
  const match = new RegExp(`^${String(artifactType).toUpperCase()} v([1-9][0-9]*) ·`, 'u').exec(selected.optionLabel);
  assert(match, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_ARTIFACT_VERSION_LABEL_INVALID');
  const visibleIdentity = `${String(artifactType).toUpperCase()} v${match[1]}`;
  for (const tabName of ['Inbox', 'Outbox']) {
    await selected.section.getByRole('tab', { name: new RegExp(`^${tabName} \\(`, 'u') }).click();
    assert.equal(await selected.section.getByText(visibleIdentity, { exact: true }).count(), 0, `PR_C_SYNTHETIC_BROWSER_DOWNSTREAM_HANDOFF_PRESENT:${tabName.toLowerCase()}`);
  }
  const actualPackageIds = await deliveryPackageIds(page);
  assert.deepEqual([...actualPackageIds].sort(), [...expectedPackageIds].sort(), 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_SET_CHANGED');
  interactionSequence.push('observe:exact-studio-artifact-has-no-downstream-resource');
  return { artifactVersionId, visibleIdentity, packageCount: actualPackageIds.length, handoffCount: 0 };
};

export const verifySyntheticAssessHandoffReady = async (page, interactionSequence, {
  upstreamHandoffId, sourceVersion, resourceLabel,
}) => {
  assert(upstreamHandoffId, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_ID_MISSING');
  assert(Number.isSafeInteger(sourceVersion) && sourceVersion > 0, 'PR_C_SYNTHETIC_BROWSER_ASSESS_SOURCE_VERSION_INVALID');
  assert(resourceLabel, 'PR_C_SYNTHETIC_BROWSER_ASSESS_RESOURCE_LABEL_MISSING');
  const center = page.getByRole('region', { name: 'Assess → Studio handoffs' });
  const inbox = center.getByRole('tab', { name: /^Inbox \(/u });
  await inbox.click();
  const card = center.getByRole('listitem')
    .filter({ hasText: upstreamHandoffId })
    .filter({ hasText: `${resourceLabel} · source v${sourceVersion}` });
  assert.equal(await card.count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_COUNT');
  await card.getByText(resourceLabel, { exact: false }).waitFor({ state: 'visible' });
  assert.equal(await card.getByText(`eligible`, { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_STATE_MISMATCH');
  assert.equal(await card.getByText('eligible Assess source', { exact: false }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_LINEAGE_MISMATCH');
  assert.equal(await card.getByText(`${resourceLabel} · source v${sourceVersion}`, { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_ASSESS_HANDOFF_VERSION_MISMATCH');
  const request = card.getByRole('button', { name: 'Request handoff', exact: true });
  assert.equal(await request.count(), 0, 'PR_C_SYNTHETIC_BROWSER_ASSESS_APPROVER_REQUEST_AUTHORITY_LEAK');
  interactionSequence.push('observe:exact-approved-assess-handoff-ready');
  return { center, card, upstreamHandoffId, sourceVersion, requestAuthorized: false };
};

export const verifySyntheticDeliveryLineage = async (page, interactionSequence, { packageId, manual }) => {
  assert(packageId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_ID_MISSING');
  const { workspace, selected } = await selectSyntheticDeliveryPackage(page, packageId);
  assert.equal(await selected.getAttribute('data-package-id'), packageId, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_PACKAGE_BINDING_MISMATCH');
  const sourceLabel = manual ? 'Manual Delivery entry' : 'Studio handoff';
  assert.equal(await selected.getByText(sourceLabel, { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_SOURCE_MODE_MISMATCH');
  if (manual) assert.equal(await selected.getByText('Not assessed · Planning only', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_DELIVERY_MANUAL_LINEAGE_MISMATCH');
  interactionSequence.push(`observe:exact-${manual ? 'manual' : 'studio'}-delivery-package-lineage`);
  return { workspace, selected, packageId, manual: Boolean(manual) };
};

export const verifySyntheticMonitorBaseline = async (page, interactionSequence, { packageId, baselineId = '' }) => {
  assert(packageId, 'PR_C_SYNTHETIC_BROWSER_MONITOR_PACKAGE_ID_MISSING');
  const panel = page.getByTestId('canonical-monitor-baselines');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await panel.getAttribute('data-monitor-usable'), 'true', 'PR_C_SYNTHETIC_BROWSER_MONITOR_NOT_USABLE');
  const choices = panel.getByRole('list', { name: 'Approved Monitor baselines' }).getByRole('button');
  const matches = [];
  for (let index = 0; index < await choices.count(); index += 1) {
    if (baselineId && await choices.nth(index).getAttribute('data-baseline-id') !== baselineId) continue;
    await choices.nth(index).click();
    if (baselineId) await page.waitForFunction(expected => document.querySelector('article[data-testid^="monitor-baseline-"]')?.getAttribute('data-baseline-id') === expected, baselineId);
    const selected = panel.locator('article[data-baseline-id]');
    if (await selected.getAttribute('data-package-id') !== packageId) continue;
    if (baselineId && await selected.getAttribute('data-baseline-id') !== baselineId) continue;
    matches.push(index);
  }
  assert.equal(matches.length, 1, `PR_C_SYNTHETIC_BROWSER_MONITOR_BASELINE_COUNT:${matches.length}`);
  await choices.nth(matches[0]).click();
  const selected = panel.locator('article[data-baseline-id]');
  assert.equal(await selected.getAttribute('data-package-id'), packageId, 'PR_C_SYNTHETIC_BROWSER_MONITOR_PACKAGE_BINDING_MISMATCH');
  if (baselineId) assert.equal(await selected.getAttribute('data-baseline-id'), baselineId, 'PR_C_SYNTHETIC_BROWSER_MONITOR_BASELINE_BINDING_MISMATCH');
  assert.equal(await panel.getByText('Read only · telemetry disabled', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_BOUNDARY_MISSING');
  interactionSequence.push('observe:exact-package-bound-monitor-baseline');
  return { panel, selected, packageId, baselineId: await selected.getAttribute('data-baseline-id') };
};

export const verifySyntheticBlockedPackageMonitorUnchanged = async (page, interactionSequence, { packageId }) => {
  assert(packageId, 'PR_C_SYNTHETIC_BROWSER_BLOCKED_PACKAGE_ID_MISSING');
  const { selected } = await selectSyntheticDeliveryPackage(page, packageId);
  assert.equal(await selected.getByText('blocked', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_BLOCKED_PACKAGE_STATUS_MISMATCH');
  assert.equal(await selected.getByText('Review changes requested', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_BLOCKED_PACKAGE_REVIEW_MISMATCH');
  assert.equal(await page.getByRole('button', { name: 'Create read-only Monitor baseline', exact: true }).count(), 0, 'PR_C_SYNTHETIC_BROWSER_BLOCKED_PACKAGE_BASELINE_CONTROL_PRESENT');
  assert.equal(await page.getByTestId('baseline-eligibility-selectors').count(), 0, 'PR_C_SYNTHETIC_BROWSER_BLOCKED_PACKAGE_BASELINE_ELIGIBILITY_PRESENT');
  assert.equal(await page.getByTestId('canonical-monitor-baselines').count(), 0, 'PR_C_SYNTHETIC_BROWSER_UNAUTHORIZED_MONITOR_PROJECTION_DISCLOSED');
  const unavailable = page.getByRole('region', { name: 'Monitor unavailable' });
  await unavailable.waitFor({ state: 'visible' });
  assert.equal(await unavailable.getByText('Canonical Monitor projection unavailable', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_UNAVAILABLE_BOUNDARY_MISSING');
  assert.equal(await unavailable.getByText('No empty, complete, or legacy Monitor state is inferred.', { exact: false }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_NONINFERENCE_BOUNDARY_MISSING');
  interactionSequence.push('observe:exact-blocked-package-monitor-unchanged');
  return { packageId, baselineControlCount: 0, baselineEligibilityCount: 0, monitorProjection: 'unavailable' };
};

export const verifySyntheticReadOnlyMonitorHistory = async (page, interactionSequence, {
  baselineCount, identityDigest,
}) => {
  assert(Number.isSafeInteger(baselineCount) && baselineCount > 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_COUNT_INVALID');
  assert(/^sha256:[0-9a-f]{64}$/u.test(identityDigest), 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_DIGEST_INVALID');
  const panel = page.getByTestId('canonical-monitor-baselines');
  await panel.waitFor({ state: 'visible' });
  assert.equal(await panel.getAttribute('data-monitor-usable'), 'true', 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_NOT_USABLE');
  const choices = panel.getByRole('list', { name: 'Approved Monitor baselines' }).getByRole('button');
  assert.equal(await choices.count(), baselineCount, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_COUNT_MISMATCH');

  const identities = [];
  for (let index = 0; index < baselineCount; index += 1) {
    const baselineId = await choices.nth(index).getAttribute('data-baseline-id');
    await choices.nth(index).click();
    const selected = panel.locator(`article[data-baseline-id="${baselineId}"]`);
    await selected.waitFor({ state: 'visible' });
    const identity = await selected.evaluate(node => ({
      id: node.getAttribute('data-baseline-id'),
      version: Number(node.getAttribute('data-baseline-version')),
      packageId: node.getAttribute('data-package-id'),
      packageVersion: Number(node.getAttribute('data-package-version')),
      acceptedItemCount: Number(node.getAttribute('data-accepted-item-count')),
    }));
    assert(identity.id && identity.packageId, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_IDENTITY_MISSING');
    assert(Number.isSafeInteger(identity.version) && identity.version > 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_VERSION_INVALID');
    assert(Number.isSafeInteger(identity.packageVersion) && identity.packageVersion > 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_PACKAGE_VERSION_INVALID');
    assert(Number.isSafeInteger(identity.acceptedItemCount) && identity.acceptedItemCount >= 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_ACCEPTED_COUNT_INVALID');
    identities.push(identity);
  }
  identities.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const actualIdentityDigest = canonicalDigest(identities);
  assert.equal(actualIdentityDigest, identityDigest, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_IDENTITY_MISMATCH');
  assert.equal(await panel.getByText('Approved-baseline creation is disabled. Previously committed baselines remain readable.', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_CREATION_BOUNDARY_MISSING');
  assert.equal(await panel.getByText('Read only · telemetry disabled', { exact: true }).count(), 1, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_READ_ONLY_BOUNDARY_MISSING');
  const mutationControls = panel.getByRole('button', { name: /^(?:create|edit|approve|reject|delete|execute|complete|change|upload)\b/iu });
  assert.equal(await mutationControls.count(), 0, 'PR_C_SYNTHETIC_BROWSER_MONITOR_HISTORY_MUTATION_CONTROL_PRESENT');
  interactionSequence.push('observe:retained-read-only-monitor-history');
  return {
    baselineCount: identities.length,
    identityDigest: actualIdentityDigest,
    readOnly: true,
    creationDisabled: true,
    mutationControlCount: 0,
  };
};
