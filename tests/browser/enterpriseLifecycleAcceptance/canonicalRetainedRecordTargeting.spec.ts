import { expect, test } from '@playwright/test';
import {
  decodeCanonicalApprovedStudioArtifact,
  decodeCanonicalCommandReceipt,
  requireCanonicalExactLocator,
  requireCanonicalReceiptBinding,
} from './canonicalInvoiceExceptionJourney';
import { projectDeliveryMonitorPublicResult } from '../../../supabase/functions/_shared/deliveryMonitorCommand';
import { executeStudioAtomicCommand } from '../../../supabase/functions/_shared/studioArtifactDb';
import type { StudioArtifactAtomicCommand } from '../../../supabase/functions/_shared/studioArtifactCommand';

const targetArtifactVersionId = '10000000-0000-4000-8000-000000000001';
const targetHandoffId = '10000000-0000-4000-8000-000000000002';
const targetPackageId = '10000000-0000-4000-8000-000000000003';
const targetBaselineId = '10000000-0000-4000-8000-000000000004';
const receiptId = '10000000-0000-4000-8000-000000000005';
const packageVersionId = '10000000-0000-4000-8000-000000000006';

test('canonical Studio binding decodes the production nested approval receipt and rejects mismatches', async () => {
  const artifactId = targetPackageId;
  const projection = {
    id: artifactId, lifecycle: 'approved',
    currentVersion: { id: targetArtifactVersionId, lifecycle: 'approved' },
    currentApprovedVersion: { id: targetArtifactVersionId, lifecycle: 'approved' },
  };
  const raw = { outcome: 'committed', receiptId, resourceId: artifactId, resource: projection };
  const normalized = await executeStudioAtomicCommand({
    commandType: 'studio.artifact.approval.resolve', payload: {},
  } as StudioArtifactAtomicCommand, async <T>() => raw as T);
  const response = { ok: true, ...normalized };
  expect(decodeCanonicalApprovedStudioArtifact(response)).toEqual({
    artifactId, artifactVersionId: targetArtifactVersionId,
  });
  for (const changed of [
    { ...response, resourceId: targetHandoffId },
    { ...response, resource: { ...raw, receiptId: targetBaselineId } },
    { ...response, resource: { ...raw, resource: { ...projection, lifecycle: 'approval_ready' } } },
    { ...response, resource: { ...raw, resource: { ...projection, currentApprovedVersion: { id: targetHandoffId, lifecycle: 'approved' } } } },
  ]) expect(() => decodeCanonicalApprovedStudioArtifact(changed)).toThrow('CANONICAL_APPROVED_STUDIO_RESPONSE_REJECTED');
  expect(() => decodeCanonicalApprovedStudioArtifact({ ...response, resource: projection })).toThrow();
});

test('canonical retained-record targeting selects receipt-bound records instead of first records', async ({ page }) => {
  await page.setContent(`
    <label>Eligible exact Studio artifact
      <select aria-label="Eligible exact Studio artifact">
        <option value="20000000-0000-4000-8000-000000000001">Retained BRD v2</option>
        <option value="${targetArtifactVersionId}">Canonical BRD v2</option>
      </select>
    </label>
    <button role="tab">Outbox (4)</button>
    <article data-handoff-id="20000000-0000-4000-8000-000000000002">Retained actionable handoff</article>
    <article data-handoff-id="${targetHandoffId}">Canonical handoff</article>
    <ul aria-label="Delivery packages">
      <li><button data-package-id="20000000-0000-4000-8000-000000000003">Retained package</button></li>
      <li><button data-package-id="${targetPackageId}">Canonical package</button></li>
    </ul>
    <article data-testid="delivery-package-20000000-0000-4000-8000-000000000003">Retained package detail</article>
    <article data-testid="delivery-package-${targetPackageId}" data-package-version="1">Canonical package detail</article>
    <section data-testid="baseline-eligibility-selectors">
      <ul>
        <li data-package-id="20000000-0000-4000-8000-000000000003">Retained eligibility</li>
        <li data-package-id="${targetPackageId}">Canonical eligibility</li>
      </ul>
    </section>
    <section data-testid="canonical-monitor-baselines">
      <button data-baseline-id="20000000-0000-4000-8000-000000000004">Retained baseline</button>
      <button data-baseline-id="${targetBaselineId}">Canonical baseline</button>
      <article data-testid="monitor-baseline-20000000-0000-4000-8000-000000000004">Retained baseline detail</article>
      <article data-testid="monitor-baseline-${targetBaselineId}" data-package-id="${targetPackageId}" data-package-version="1">Canonical baseline detail</article>
    </section>
  `);

  const candidate = page.getByRole('combobox', { name: 'Eligible exact Studio artifact', exact: true });
  await expect(await requireCanonicalExactLocator(
    candidate.locator(`option[value="${targetArtifactVersionId}"]`),
    'CANDIDATE',
  )).toHaveText('Canonical BRD v2');
  await expect(await requireCanonicalExactLocator(
    page.locator(`[data-handoff-id="${targetHandoffId}"]`),
    'HANDOFF',
  )).toHaveText('Canonical handoff');
  await expect(await requireCanonicalExactLocator(
    page.getByRole('list', { name: 'Delivery packages', exact: true })
      .locator(`button[data-package-id="${targetPackageId}"]`),
    'PACKAGE_SELECTOR',
  )).toHaveText('Canonical package');
  await expect(await requireCanonicalExactLocator(
    page.getByTestId(`delivery-package-${targetPackageId}`),
    'PACKAGE',
  )).toHaveText('Canonical package detail');
  await expect(await requireCanonicalExactLocator(
    page.getByTestId('baseline-eligibility-selectors').locator(`li[data-package-id="${targetPackageId}"]`),
    'BASELINE_ELIGIBILITY',
  )).toHaveText('Canonical eligibility');
  await expect(await requireCanonicalExactLocator(
    page.getByTestId('canonical-monitor-baselines').locator(`button[data-baseline-id="${targetBaselineId}"]`),
    'BASELINE_SELECTOR',
  )).toHaveText('Canonical baseline');
  await expect(await requireCanonicalExactLocator(
    page.getByTestId(`monitor-baseline-${targetBaselineId}`),
    'BASELINE',
  )).toHaveAttribute('data-package-id', targetPackageId);
});

test('canonical exact targeting rejects absent and duplicate target bindings', async ({ page }) => {
  await page.setContent(`
    <article data-handoff-id="${targetHandoffId}">Duplicate one</article>
    <article data-handoff-id="${targetHandoffId}">Duplicate two</article>
  `);
  await expect(requireCanonicalExactLocator(
    page.locator(`[data-handoff-id="${targetHandoffId}"]`),
    'CANONICAL_EXACT_HANDOFF_REJECTED',
  )).rejects.toThrow('CANONICAL_EXACT_HANDOFF_REJECTED:2');
  await expect(requireCanonicalExactLocator(
    page.locator(`[data-package-id="${targetPackageId}"]`),
    'CANONICAL_EXACT_PACKAGE_REJECTED',
  )).rejects.toThrow('CANONICAL_EXACT_PACKAGE_REJECTED:0');
});

test('canonical exact targeting awaits a delayed receipt-bound projection after navigation', async ({ page }) => {
  await page.setContent('<main>Workspace shell</main>');
  await page.evaluate(id => {
    setTimeout(() => {
      const target = document.createElement('article');
      target.setAttribute('data-package-id', id);
      target.textContent = 'Exact persisted package';
      document.querySelector('main')!.append(target);
    }, 150);
  }, targetPackageId);
  const target = await requireCanonicalExactLocator(
    page.locator(`article[data-package-id="${targetPackageId}"]`),
    'DELAYED_EXACT_PACKAGE',
  );
  await expect(target).toHaveText('Exact persisted package');
});

test('canonical command receipts reject wrong and missing exact resource bindings', () => {
  const handoffWireResponse = projectDeliveryMonitorPublicResult({
    ok: true,
    outcome: 'committed',
    receiptId,
    action: 'delivery.handoff.review.resolve',
    resourceId: targetHandoffId,
    resourceVersion: 2,
    status: 'approval_ready',
  }, 'delivery.handoff.review.resolve');
  const handoffReceipt = decodeCanonicalCommandReceipt(
    handoffWireResponse,
    'delivery.handoff.review.resolve',
  );
  expect(requireCanonicalReceiptBinding(handoffReceipt, {
    resourceId: targetHandoffId,
    resourceVersion: 2,
  })).toBe(handoffReceipt);

  const packageReviewEventId = '10000000-0000-4000-8000-000000000007';
  const packageWireResponse = projectDeliveryMonitorPublicResult({
    ok: true,
    outcome: 'committed',
    receiptId,
    action: 'delivery.package.review.resolve',
    resourceId: packageReviewEventId,
    resourceVersion: 1,
    workPackageId: targetPackageId,
    packageVersionId,
    packageHash: 'a'.repeat(64),
    acceptedSetHash: 'b'.repeat(64),
    acceptedItemCount: 5,
    status: 'approved',
  }, 'delivery.package.review.resolve');
  const packageReceipt = decodeCanonicalCommandReceipt(
    packageWireResponse,
    'delivery.package.review.resolve',
  );
  expect(requireCanonicalReceiptBinding(packageReceipt, {
    workPackageId: targetPackageId,
    resourceVersion: 1,
    packageVersionId,
  })).toBe(packageReceipt);
  expect(() => requireCanonicalReceiptBinding(packageReceipt, { workPackageId: targetHandoffId }))
    .toThrow('CANONICAL_COMMAND_RECEIPT_BINDING_REJECTED:workPackageId');
  expect(() => requireCanonicalReceiptBinding(handoffReceipt, { packageVersionId }))
    .toThrow('CANONICAL_COMMAND_RECEIPT_BINDING_REJECTED:packageVersionId');
  expect(() => decodeCanonicalCommandReceipt(
    { ...handoffWireResponse, action: 'delivery.handoff.request' },
    'delivery.handoff.review.resolve',
  ))
    .toThrow('CANONICAL_COMMAND_RECEIPT_REJECTED');
});
