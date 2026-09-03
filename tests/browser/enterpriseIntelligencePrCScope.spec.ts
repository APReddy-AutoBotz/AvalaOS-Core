import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { IDS, installEnterpriseIntelligenceFixture } from './enterpriseIntelligenceNetworkFixture';

const harnessUrl = '/tests/browser/enterpriseIntelligenceHarness.html?delivery-monitor=1&scope-switch=1';
const scopeAKey = 'scope-a-key-material-123456';
const scopeBKey = 'scope-b-key-material-654321';
const scopeAProviderName = 'Scope A private provider draft';
const scopeAFileName = 'scope-a-private-source.txt';
const evidencePersona = {
  id: '30000006-0000-4000-8000-000000000006',
  state: 'active',
  capabilities: ['delivery.handoff.request', 'delivery.package.manage', 'project.read'],
} as const;

const marker = (info: TestInfo, assertionId: string, context: Record<string, unknown>) => {
  const profile = info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  console.log(`PR_C_ASSERTION ${JSON.stringify({
    testId: 'AUTH-002',
    assertionId: `${assertionId}--${profile}`,
    fixture: 'DELIVERY-STUDIO-HANDOFF-01',
    owner: 'browser-scope',
    result: 'passed',
    runtimeContext: {
      profile: info.project.name,
      persona: evidencePersona,
      organizationId: IDS.deliveryOrganization,
      workspaceId: IDS.deliveryWorkspace,
      ...context,
    },
  })}`);
};

const workspace = (page: Page) => page.getByTestId('enterprise-intelligence-workspace');

const waitForProjection = async (page: Page) => {
  await expect(workspace(page)).toHaveAttribute('data-projection-scope-ready', 'true');
  await expect(workspace(page).locator('header').getByRole('status')).toHaveText('Committed server state loaded.');
};

const selectControls = async (page: Page) => {
  await workspace(page).getByRole('button', { name: 'AI Controls', exact: true }).click();
  await expect(page.getByLabel('Configured provider')).not.toHaveValue('');
};

const stageScopeAState = async (page: Page) => {
  await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
  await page.getByLabel('Evidence document').setInputFiles({
    name: scopeAFileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('synthetic scope A private file bytes'),
  });
  await expect(workspace(page)).toContainText(scopeAFileName);

  await selectControls(page);
  await page.getByLabel('Display name').fill(scopeAProviderName);
  await page.getByLabel('Default model').fill('scope-a-private-model');
  await page.getByLabel('Endpoint (Azure or compatible)').fill('https://scope-a.example.test/v1');
  await page.getByLabel('Deployment (Azure)').fill('scope-a-private-deployment');
  await page.getByLabel('Provider key (sent once)').fill(scopeAKey);
  await expect(page.getByRole('button', { name: 'Register provider metadata' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Bind key securely' })).toBeEnabled();
};

const installFirstCommitProbe = async (page: Page, indicatorTestId: string, targetText: string) => {
  await page.evaluate(({ indicatorTestId, targetText, privateValues, fileName, oldStatus }) => {
    const probeWindow = window as typeof window & {
      __enterpriseScopeProbe?: {
        observed: boolean;
        oldValueVisible: boolean;
        oldFileVisible: boolean;
        oldStatusVisible: boolean;
        oldSensitiveActionable: boolean;
        projectionReady: boolean;
      };
      __enterpriseScopeObserver?: MutationObserver;
    };
    probeWindow.__enterpriseScopeProbe = {
      observed: false,
      oldValueVisible: false,
      oldFileVisible: false,
      oldStatusVisible: false,
      oldSensitiveActionable: false,
      projectionReady: true,
    };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(`[data-testid="${indicatorTestId}"]`)?.textContent?.includes(targetText)) return;
      const workbench = document.querySelector('[data-testid="enterprise-intelligence-workspace"]');
      const values = Array.from(workbench?.querySelectorAll('input, select, textarea') || [])
        .map(element => (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
      const actionNames = new Set([
        'Register provider metadata', 'Bind key securely', 'Validate', 'Activate', 'Rotate key', 'Revoke',
        'Enable route', 'Disable route', 'Store private source', 'Run governed extraction',
        'Promote selected evidence to Assess draft', 'Evaluate disposition', 'Create blueprint draft',
      ]);
      const oldSensitiveActionable = Array.from(workbench?.querySelectorAll('button') || []).some(element => (
        element instanceof HTMLButtonElement && !element.disabled && actionNames.has(element.textContent?.trim() || '')
      ));
      const text = workbench?.textContent || '';
      probeWindow.__enterpriseScopeProbe = {
        observed: true,
        oldValueVisible: values.some(value => privateValues.some(privateValue => value.includes(privateValue))),
        oldFileVisible: text.includes(fileName),
        oldStatusVisible: text.includes(oldStatus),
        oldSensitiveActionable,
        projectionReady: workbench?.getAttribute('data-projection-scope-ready') === 'true',
      };
      observer.disconnect();
    });
    probeWindow.__enterpriseScopeObserver = observer;
    observer.observe(document.body, { attributes: true, characterData: true, childList: true, subtree: true });
  }, {
    indicatorTestId,
    targetText,
    privateValues: [scopeAKey, scopeAProviderName, 'scope-a-private-model', 'scope-a-private-deployment'],
    fileName: scopeAFileName,
    oldStatus: 'The command was not confirmed. No success state was recorded.',
  });
};

const readFirstCommitProbe = (page: Page) => page.evaluate(() => {
  const probeWindow = window as typeof window & {
    __enterpriseScopeProbe?: unknown;
    __enterpriseScopeObserver?: MutationObserver;
  };
  probeWindow.__enterpriseScopeObserver?.disconnect();
  return probeWindow.__enterpriseScopeProbe;
});

const switchCases = [{
  label: 'workspace',
  buttonName: 'Switch Enterprise workspace context',
  indicatorTestId: 'enterprise-harness-scope',
  targetText: 'Northstar Other Workspace',
  returnText: 'Governed Delivery',
  targetOrganizationId: IDS.deliveryOrganization,
  targetWorkspaceId: IDS.deliveryWorkspaceSecondary,
}, {
  label: 'organization',
  buttonName: 'Switch Enterprise organization context',
  indicatorTestId: 'enterprise-harness-organization',
  targetText: 'Synthetic Contoso',
  returnText: 'Synthetic Northstar',
  targetOrganizationId: IDS.deliveryOrganizationSecondary,
  targetWorkspaceId: IDS.deliveryOrganizationWorkspace,
}, {
  label: 'actor',
  buttonName: 'Switch Enterprise actor context',
  indicatorTestId: 'enterprise-harness-actor',
  targetText: 'Synthetic Delivery Reviewer',
  returnText: 'Synthetic Delivery Author',
  targetOrganizationId: IDS.deliveryOrganization,
  targetWorkspaceId: IDS.deliveryWorkspace,
}] as const;

for (const scopeCase of switchCases) {
  test(`${scopeCase.label} switch synchronously isolates authored key/file state and cannot resurrect it`, async ({ page }, info) => {
    const fixture = await installEnterpriseIntelligenceFixture(page, { deliveryMonitor: true });
    await page.goto(harnessUrl);
    await waitForProjection(page);

    fixture.failNext('provider.validate', 'SYNTHETIC_SCOPE_A_FAILURE');
    await page.getByRole('button', { name: 'Validate', exact: true }).click();
    await expect(workspace(page).locator('header').getByRole('status')).toHaveText('The command was not confirmed. No success state was recorded.');
    await stageScopeAState(page);
    await installFirstCommitProbe(page, scopeCase.indicatorTestId, scopeCase.targetText);

    await page.getByRole('button', { name: scopeCase.buttonName }).click();
    await expect(page.getByTestId(scopeCase.indicatorTestId)).toHaveText(scopeCase.targetText);
    expect(await readFirstCommitProbe(page)).toEqual({
      observed: true,
      oldValueVisible: false,
      oldFileVisible: false,
      oldStatusVisible: false,
      oldSensitiveActionable: false,
      projectionReady: false,
    });
    await waitForProjection(page);

    await selectControls(page);
    await expect(page.getByLabel('Display name')).toHaveValue('');
    await expect(page.getByLabel('Default model')).toHaveValue('');
    await expect(page.getByLabel('Endpoint (Azure or compatible)')).toHaveValue('');
    await expect(page.getByLabel('Deployment (Azure)')).toHaveValue('');
    await expect(page.getByLabel('Provider key (sent once)')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Register provider metadata' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Bind key securely' })).toBeDisabled();
    await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
    await expect(workspace(page)).not.toContainText(scopeAFileName);
    await expect(page.getByLabel('Evidence document')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Store private source' })).toBeDisabled();

    await selectControls(page);
    await page.getByLabel('Provider key (sent once)').fill(scopeBKey);
    await page.getByRole('button', { name: 'Bind key securely' }).click();
    await expect(workspace(page).locator('header').getByRole('status')).toHaveText('Secret bound through the approved backend; raw key discarded from form state.');
    const targetRequest = fixture.commandPayloads.filter(body => body.operation === 'provider.secret.bind').at(-1) as {
      organizationId?: string;
      workspaceId?: string;
      payload?: { providerKey?: string };
    } | undefined;
    expect(targetRequest).toMatchObject({
      organizationId: scopeCase.targetOrganizationId,
      workspaceId: scopeCase.targetWorkspaceId,
      payload: { providerKey: scopeBKey },
    });
    expect(JSON.stringify(targetRequest)).not.toContain(scopeAKey);
    expect(JSON.stringify(targetRequest)).not.toContain(scopeAProviderName);
    expect(JSON.stringify(targetRequest)).not.toContain(scopeAFileName);

    await page.getByRole('button', { name: scopeCase.buttonName }).click();
    await expect(page.getByTestId(scopeCase.indicatorTestId)).toHaveText(scopeCase.returnText);
    await waitForProjection(page);
    await selectControls(page);
    await expect(page.getByLabel('Display name')).toHaveValue('');
    await expect(page.getByLabel('Provider key (sent once)')).toHaveValue('');
    await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
    await expect(workspace(page)).not.toContainText(scopeAFileName);
    marker(info, `enterprise-workbench-${scopeCase.label}-first-commit-isolates-authored-state`, {
      scopeChange: scopeCase.label,
      firstCommitProjectionReady: false,
      firstCommitOldValueVisible: false,
      firstCommitOldFileVisible: false,
      firstCommitOldStatusVisible: false,
      firstCommitOldSensitiveActionable: false,
      targetScopeSubmissionCount: 1,
      crossScopeContentSubmitted: false,
      switchBackResurrectedBrowserState: false,
    });
  });
}

test('delayed file decoding cannot populate either scope after a workspace switch', async ({ page }, info) => {
  await page.addInitScript(() => {
    const originalArrayBuffer = File.prototype.arrayBuffer;
    const delayedWindow = window as typeof window & {
      __scopeFileReadPending?: boolean;
      __releaseScopeFileRead?: () => void;
    };
    File.prototype.arrayBuffer = function arrayBuffer() {
      if (!this.name.startsWith('scope-a-delayed-private-source')) return originalArrayBuffer.call(this);
      delayedWindow.__scopeFileReadPending = true;
      return new Promise<ArrayBuffer>((resolve, reject) => {
        delayedWindow.__releaseScopeFileRead = () => {
          originalArrayBuffer.call(this).then(resolve, reject);
        };
      });
    };
  });
  const fixture = await installEnterpriseIntelligenceFixture(page, { deliveryMonitor: true });
  await page.goto(harnessUrl);
  await waitForProjection(page);
  await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
  const delayedFileName = 'scope-a-delayed-private-source.txt';
  await page.getByLabel('Evidence document').setInputFiles({
    name: delayedFileName,
    mimeType: 'text/plain',
    buffer: Buffer.from('synthetic delayed private bytes'),
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __scopeFileReadPending?: boolean }).__scopeFileReadPending))).toBe(true);
  await page.evaluate(({ delayedFileName }) => {
    const delayedWindow = window as typeof window & {
      __delayedFileScopeProbe?: { observed: boolean; oldFileVisible: boolean; storeActionable: boolean; projectionReady: boolean };
    };
    delayedWindow.__delayedFileScopeProbe = { observed: false, oldFileVisible: true, storeActionable: true, projectionReady: true };
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[data-testid="enterprise-harness-scope"]')?.textContent?.includes('Northstar Other Workspace')) return;
      const workbench = document.querySelector('[data-testid="enterprise-intelligence-workspace"]');
      const fileInput = workbench?.querySelector('input[type="file"]') as HTMLInputElement | null;
      const store = Array.from(workbench?.querySelectorAll('button') || [])
        .find(element => element.textContent?.trim() === 'Store private source');
      delayedWindow.__delayedFileScopeProbe = {
        observed: true,
        oldFileVisible: Boolean(fileInput?.value.includes(delayedFileName) || workbench?.textContent?.includes(delayedFileName)),
        storeActionable: store instanceof HTMLButtonElement && !store.disabled,
        projectionReady: workbench?.getAttribute('data-projection-scope-ready') === 'true',
      };
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, characterData: true, childList: true, subtree: true });
  }, { delayedFileName });

  await page.getByRole('button', { name: 'Switch Enterprise workspace context' }).click();
  await expect(page.getByTestId('enterprise-harness-scope')).toHaveText('Northstar Other Workspace');
  expect(await page.evaluate(() => (window as typeof window & { __delayedFileScopeProbe?: unknown }).__delayedFileScopeProbe)).toEqual({
    observed: true,
    oldFileVisible: false,
    storeActionable: false,
    projectionReady: false,
  });
  await page.evaluate(() => (window as typeof window & { __releaseScopeFileRead?: () => void }).__releaseScopeFileRead?.());
  await waitForProjection(page);
  await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
  await expect(workspace(page)).not.toContainText(delayedFileName);
  await expect(page.getByLabel('Evidence document')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Store private source' })).toBeDisabled();

  await page.getByRole('button', { name: 'Switch Enterprise workspace context' }).click();
  await expect(page.getByTestId('enterprise-harness-scope')).toHaveText('Governed Delivery');
  await waitForProjection(page);
  await workspace(page).getByRole('button', { name: 'Evidence Intake', exact: true }).click();
  await expect(workspace(page)).not.toContainText(delayedFileName);
  expect(JSON.stringify(fixture.commandPayloads)).not.toContain(delayedFileName);
  marker(info, 'enterprise-workbench-delayed-file-read-is-scope-fenced', {
    scopeChange: 'workspace',
    delayedFileReadCount: 1,
    firstCommitProjectionReady: false,
    firstCommitOldFileVisible: false,
    firstCommitStoreActionable: false,
    delayedCompletionPopulatedTargetScope: false,
    switchBackResurrectedBrowserState: false,
    sourceSubmissionCount: 0,
  });
});

for (const operation of ['provider.secret.bind', 'provider.secret.rotate'] as const) {
  const buttonName = operation === 'provider.secret.bind' ? 'Bind key securely' : 'Rotate key';
  test(`delayed ${operation} completion cannot clear or submit the new-organization key`, async ({ page }, info) => {
    const fixture = await installEnterpriseIntelligenceFixture(page, { deliveryMonitor: true });
    await page.goto(harnessUrl);
    await waitForProjection(page);
    await selectControls(page);
    fixture.delayNext(operation);
    await page.getByLabel('Provider key (sent once)').fill(scopeAKey);
    const observed = fixture.waitForDelayedCommand(operation);
    await page.getByRole('button', { name: buttonName }).click();
    await observed;

    await page.getByRole('button', { name: 'Switch Enterprise organization context' }).click();
    await expect(page.getByTestId('enterprise-harness-organization')).toHaveText('Synthetic Contoso');
    await waitForProjection(page);
    await selectControls(page);
    await page.getByLabel('Provider key (sent once)').fill(scopeBKey);
    const oldCompletion = fixture.waitForDelayedCommandCompletion(operation);
    fixture.releaseDelayedCommand(operation);
    await oldCompletion;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByLabel('Provider key (sent once)')).toHaveValue(scopeBKey);

    await page.getByRole('button', { name: buttonName }).click();
    await expect(workspace(page).locator('header').getByRole('status')).toContainText(operation === 'provider.secret.bind' ? 'Secret bound' : 'Provider key rotated');
    const requests = fixture.commandPayloads.filter(body => body.operation === operation) as Array<{
      organizationId?: string;
      workspaceId?: string;
      payload?: { providerKey?: string };
    }>;
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      organizationId: IDS.deliveryOrganization,
      workspaceId: IDS.deliveryWorkspace,
      payload: { providerKey: scopeAKey },
    });
    expect(requests[1]).toMatchObject({
      organizationId: IDS.deliveryOrganizationSecondary,
      workspaceId: IDS.deliveryOrganizationWorkspace,
      payload: { providerKey: scopeBKey },
    });
    expect(JSON.stringify(requests[1])).not.toContain(scopeAKey);
    marker(info, `enterprise-workbench-delayed-${operation.replaceAll('.', '-')}-finalizer-is-scope-fenced`, {
      scopeChange: 'organization',
      delayedOperation: operation.replaceAll('.', '-'),
      delayedCompletionClearedTargetInput: false,
      requestCount: requests.length,
      sourceScopeRequestCount: 1,
      targetScopeRequestCount: 1,
      crossScopeContentSubmitted: false,
    });
  });
}
