import { expect, test } from '@playwright/test';
import {
  decodeCanonicalApprovedStudioArtifact,
  decodeCanonicalCommandReceipt,
  observeCanonicalProcessCreateResponse,
  observeCanonicalStudioApprovalResponse,
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
const approvalRequestId = '10000000-0000-4000-8000-000000000008';

const anchorRoute = '**/rest/v1/rpc/pr_c_controlled_human_anchor_step';
const studioCommandRoute = '**/functions/v1/studio-artifact-command';
const studioApprovalAction = 'studio.artifact.approval.resolve';
const processCommandRoute = '**/functions/v1/process-command';

const approvalPage = async (page: Parameters<typeof observeCanonicalStudioApprovalResponse>[0]) => {
  await page.setContent(`
    <base href="http://canonical.test/">
    <button id="approve">Final approve</button>
    <script>
      document.querySelector('#approve').addEventListener('click', async () => {
        const anchor = await fetch('/rest/v1/rpc/pr_c_controlled_human_anchor_step', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        });
        const body = await anchor.json();
        if (!body.safeAnchor || body.safeAnchor.action !== '${studioApprovalAction}'
          || !body.execution || typeof body.execution.requestId !== 'string') return;
        const target = window.__canonicalTarget || {};
        if (target.omit === true) return;
        await fetch('/functions/v1/studio-artifact-command', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            commandType: target.action || '${studioApprovalAction}',
            requestId: target.requestId || body.execution.requestId,
          }),
        });
      });
    </script>
  `);
};

const responseListenerCount = (page: Parameters<typeof observeCanonicalProcessCreateResponse>[0]) =>
  (page as unknown as { listenerCount: (event: string) => number }).listenerCount('response');

test('canonical process create owns matching response and action within one bounded stage', async ({ page }) => {
  let wrongResponses = 0;
  let matchingResponses = 0;
  await page.route(processCommandRoute, async route => {
    const command = route.request().postDataJSON() as { commandType?: unknown };
    if (command.commandType === 'process.create') matchingResponses += 1;
    else wrongResponses += 1;
    await route.fulfill({ status: command.commandType === 'process.create' ? 201 : 200,
      contentType: 'application/json', body: '{}' });
  });
  await page.setContent('<base href="http://canonical.test/"><button id="create">Create</button>');
  const baselineListeners = responseListenerCount(page);
  const response = await observeCanonicalProcessCreateResponse(page, async () => {
    await page.evaluate(async () => {
      await fetch('/functions/v1/process-command', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandType: 'process.update' }) });
      await fetch('/functions/v1/process-command', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandType: 'process.create' }) });
    });
  }, { timeoutMs: 500 });
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ commandType: 'process.create' });
  expect({ wrongResponses, matchingResponses }).toEqual({ wrongResponses: 1, matchingResponses: 1 });
  expect(responseListenerCount(page)).toBe(baselineListeners);
});

test('canonical process create owns early failures and always disposes its observer', async ({ page }) => {
  await page.setContent('<base href="http://canonical.test/">');
  const baselineListeners = responseListenerCount(page);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await expect(observeCanonicalProcessCreateResponse(page,
      () => { throw new Error('SYNTHETIC_CREATE_SYNC_ACTION_FAILED'); },
      { timeoutMs: 150 },
    )).rejects.toThrow('SYNTHETIC_CREATE_SYNC_ACTION_FAILED');
    expect(responseListenerCount(page)).toBe(baselineListeners);

    await expect(observeCanonicalProcessCreateResponse(page,
      async () => { throw new Error('SYNTHETIC_CREATE_ACTION_FAILED'); },
      { timeoutMs: 150 },
    )).rejects.toThrow('SYNTHETIC_CREATE_ACTION_FAILED');
    expect(responseListenerCount(page)).toBe(baselineListeners);

    await expect(observeCanonicalProcessCreateResponse(page,
      async () => new Promise<void>(() => {}),
      { timeoutMs: 150 },
    )).rejects.toThrow('CANONICAL_PROCESS_CREATE_RESPONSE_TIMEOUT');
    await new Promise(resolve => setImmediate(resolve));
    expect(unhandled).toEqual([]);
    expect(responseListenerCount(page)).toBe(baselineListeners);

    await page.route(processCommandRoute, route => route.fulfill({
      status: 201, contentType: 'application/json', body: '{}',
    }));
    await expect(observeCanonicalProcessCreateResponse(page, async () => {
      await page.evaluate(() => fetch('/functions/v1/process-command', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commandType: 'process.create' }),
      }));
      return new Promise<void>(() => {});
    }, { timeoutMs: 750 })).rejects.toThrow('CANONICAL_PROCESS_CREATE_ACTION_TIMEOUT');
    expect(unhandled).toEqual([]);
    expect(responseListenerCount(page)).toBe(baselineListeners);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

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

test('hosted Studio approval gives the pre-anchor and exact command separate bounded stages', async ({ page }) => {
  let targetResponses = 0;
  await page.route(anchorRoute, async route => {
    await new Promise(resolve => setTimeout(resolve, 220));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      safeAnchor: { action: studioApprovalAction }, execution: { requestId: approvalRequestId },
    }) });
  });
  await page.route(studioCommandRoute, async route => {
    await new Promise(resolve => setTimeout(resolve, 220));
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    targetResponses += 1;
  });
  await approvalPage(page);

  const oldCombinedDeadline = page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== '/functions/v1/studio-artifact-command') return false;
    try { return response.request().postDataJSON().commandType === studioApprovalAction; }
    catch { return false; }
  }, { timeout: 300 });
  void oldCombinedDeadline.catch(() => {});
  await page.locator('#approve').dispatchEvent('click');
  await expect(oldCombinedDeadline).rejects.toThrow(/Timeout 300ms exceeded/u);
  await expect.poll(() => targetResponses).toBe(1);

  const response = await observeCanonicalStudioApprovalResponse(
    page,
    () => page.locator('#approve').dispatchEvent('click'),
    { controlledHuman: true, stageTimeoutMs: 350 },
  );
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({
    commandType: studioApprovalAction,
    requestId: approvalRequestId,
  });
  expect(targetResponses).toBe(2);
});

test('hosted Studio approval rejects unbound stages and always disposes its observer', async ({ page }) => {
  const scenario: {
    anchorAction?: string;
    anchorRequestId?: string;
    targetAction?: string;
    targetRequestId?: string;
    omitTarget?: boolean;
  } = {};
  await page.route(anchorRoute, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      safeAnchor: { action: scenario.anchorAction ?? studioApprovalAction },
      execution: scenario.anchorRequestId === '' ? {} : { requestId: scenario.anchorRequestId ?? approvalRequestId },
    }),
  }));
  await page.route(studioCommandRoute, route => route.fulfill({
    status: 201, contentType: 'application/json', body: '{}',
  }));
  await approvalPage(page);
  const responseListenerCount = () => (page as unknown as {
    listenerCount: (event: string) => number;
  }).listenerCount('response');
  const baselineListeners = responseListenerCount();
  const run = async () => {
    await page.evaluate(value => {
      (window as unknown as { __canonicalTarget?: unknown }).__canonicalTarget = value;
    }, { action: scenario.targetAction, requestId: scenario.targetRequestId, omit: scenario.omitTarget });
    return observeCanonicalStudioApprovalResponse(
      page,
      () => page.locator('#approve').dispatchEvent('click'),
      { controlledHuman: true, stageTimeoutMs: 250 },
    );
  };

  scenario.anchorAction = 'studio.artifact.review.resolve';
  await expect(run()).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_ANCHOR_REJECTED');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.anchorAction = studioApprovalAction; scenario.anchorRequestId = '';
  await expect(run()).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_ANCHOR_REJECTED');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.anchorRequestId = approvalRequestId; scenario.targetAction = 'studio.artifact.review.resolve';
  await expect(run()).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_RESPONSE_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.targetAction = studioApprovalAction;
  scenario.targetRequestId = '20000000-0000-4000-8000-000000000008';
  await expect(run()).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_RESPONSE_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.targetRequestId = undefined; scenario.omitTarget = true;
  await expect(run()).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_RESPONSE_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);

  await expect(observeCanonicalStudioApprovalResponse(
    page, async () => {}, { controlledHuman: true, stageTimeoutMs: 250 },
  )).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_ANCHOR_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.omitTarget = true;
  await expect(observeCanonicalStudioApprovalResponse(
    page,
    async () => {
      await page.evaluate(async ({ action, requestId }) => {
        await fetch('/functions/v1/studio-artifact-command', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ commandType: action, requestId }),
        });
      }, { action: studioApprovalAction, requestId: approvalRequestId });
      await page.locator('#approve').dispatchEvent('click');
    },
    { controlledHuman: true, stageTimeoutMs: 250 },
  )).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_RESPONSE_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);

  await expect(observeCanonicalStudioApprovalResponse(
    page, async () => { throw new Error('SYNTHETIC_CLICK_FAILED'); },
    { controlledHuman: true, stageTimeoutMs: 250 },
  )).rejects.toThrow('SYNTHETIC_CLICK_FAILED');
  expect(responseListenerCount()).toBe(baselineListeners);

  scenario.omitTarget = false;
  await page.evaluate(() => {
    (window as unknown as { __canonicalTarget?: unknown }).__canonicalTarget = {};
  });
  await expect(observeCanonicalStudioApprovalResponse(
    page,
    async () => {
      await page.locator('#approve').dispatchEvent('click');
      return new Promise<void>(() => {});
    },
    { controlledHuman: true, stageTimeoutMs: 250 },
  )).rejects.toThrow('CANONICAL_STUDIO_APPROVAL_ACTION_TIMEOUT');
  expect(responseListenerCount()).toBe(baselineListeners);
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
