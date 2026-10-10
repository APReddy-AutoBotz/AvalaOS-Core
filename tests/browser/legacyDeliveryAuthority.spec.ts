import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

type FixtureSetup = Readonly<{
  actor: Readonly<{ token: string; user: Readonly<{ id: string; email: string }> }>;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  generationId: string;
  authorizationVersion: number;
}>;
type Snapshot = Readonly<{
  tasks: number;
  imports: number;
  receipts: number;
  audits: number;
  active: number;
  retained: number;
  max_version: number;
}>;

const controlToken = process.env.LEGACY_DELIVERY_CONTROL_TOKEN ?? '';
const apiBaseUrl = process.env.LEGACY_DELIVERY_API_BASE_URL ?? '';
const appBaseUrl = process.env.LEGACY_DELIVERY_APP_BASE_URL ?? '';
const authStorageKey = process.env.LEGACY_DELIVERY_AUTH_STORAGE_KEY ?? 'sb-127-auth-token';
const outputDirectory = process.env.LEGACY_DELIVERY_OUTPUT_DIR
  ?? path.join('output', 'acceptance', 'legacy-delivery');
const required = (value: string, name: string) => {
  if (!value) throw new Error(`LEGACY_DELIVERY_BROWSER_${name}_REQUIRED`);
  return value;
};
const loopback = (value: string, name: string) => {
  const url = new URL(required(value, name));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`LEGACY_DELIVERY_BROWSER_NON_LOOPBACK_${name}_REJECTED`);
  }
  return url.toString().replace(/\/$/u, '');
};
const control = async <T>(pathname: string, method: 'GET' | 'POST' = 'GET'): Promise<T> => {
  const response = await fetch(`${loopback(apiBaseUrl, 'API_BASE_URL')}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-legacy-delivery-control': required(controlToken, 'CONTROL_TOKEN'),
    },
  });
  if (!response.ok) throw new Error(`LEGACY_DELIVERY_CONTROL_FAILED:${pathname}:${response.status}`);
  return response.json() as Promise<T>;
};
const sessionFor = (setup: FixtureSetup) => ({
  access_token: setup.actor.token,
  refresh_token: `${setup.actor.token}-refresh`,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    ...setup.actor.user,
    aud: 'authenticated',
    role: 'authenticated',
    user_metadata: { full_name: 'Delivery actor' },
    app_metadata: { provider: 'fixture' },
  },
});
const enterProjectDocuments = async (page: Page, setup: FixtureSetup) => {
  await page.goto('/');
  await page.evaluate(({ key, session }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('avalaos-core-v1-view', JSON.stringify('docs_forge'));
    localStorage.setItem('avalaos-core-v1-scope', JSON.stringify({ type: 'my_work' }));
  }, { key: authStorageKey, session: sessionFor(setup) });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Server context active', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch workspace context', exact: true }).click();
  await page.getByText('Legacy Delivery', { exact: true }).click();
  const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await openNavigation.isVisible().catch(() => false)) await openNavigation.click();
  const documentVault = page.getByRole('button', { name: 'Document Vault', exact: true });
  await expect(documentVault).toBeEnabled();
  await documentVault.click();
  await expect(page.getByRole('heading', { name: 'Document Repository', exact: true })).toBeVisible();
};
const enterLegacyDeliveryBacklog = async (page: Page) => {
  await expect(page.getByText('Server context active', { exact: true })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Legacy Delivery', exact: true });
  await expect(heading).toBeVisible({ timeout: 15_000 });
};

test.describe('legacy Delivery server authority', () => {
  let setup: FixtureSetup;

  test.beforeAll(async () => {
    setup = await control<FixtureSetup>('/control/setup', 'POST');
  });

  test('imports once after an unknown response and persists task create, update and deletion', async ({ page }, testInfo) => {
    const unexpectedOrigins = new Set<string>();
    const allowedOrigins = new Set([
      new URL(loopback(apiBaseUrl, 'API_BASE_URL')).origin,
      new URL(loopback(appBaseUrl, 'APP_BASE_URL')).origin,
    ]);
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (['data:', 'blob:'].includes(url.protocol) || allowedOrigins.has(url.origin)) {
        await route.continue();
        return;
      }
      unexpectedOrigins.add(url.origin);
      await route.abort('blockedbyclient');
    });
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await enterProjectDocuments(page, setup);
    await expect(page.getByText('Legacy Delivery authority BRD', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await page.getByRole('button', { name: 'Work Items', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Work Items', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Import to Backlog', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Import Work Items to Backlog', exact: true })).toBeVisible();
    await expect(page.getByText('3 / 3 selected', { exact: true })).toBeVisible();

    await control('/control/fail-next-import-response', 'POST');
    await page.getByRole('button', { name: 'Import 3 Items', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Legacy Delivery is unavailable.');
    await expect(page.getByText('3 / 3 selected', { exact: true })).toBeVisible();
    expect(await control<Snapshot>('/control/snapshot')).toMatchObject({
      tasks: 2, imports: 1, receipts: 1, audits: 1, active: 2, retained: 0,
    });

    await page.getByRole('button', { name: 'Import 3 Items', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import Work Items to Backlog', exact: true })).toBeHidden();
    await expect(page.getByText('Capture governed request', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Publish receipt', { exact: true }).first()).toBeVisible();
    await expect(page.locator('main').getByRole('heading', { name: 'Modernize intake', exact: true })).toBeVisible();
    expect(dialogs).toContain('1 epic(s) and 2 task(s) have been imported to your backlog.');
    expect(await control<Snapshot>('/control/snapshot')).toMatchObject({
      tasks: 2, imports: 1, receipts: 1, audits: 1, active: 2, retained: 0,
    });

    await page.getByRole('button', { name: 'Add a task', exact: true }).click();
    await page.getByPlaceholder('Enter a title for this task...').fill('Browser-created task');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Browser-created task', { exact: true })).toBeVisible();
    await expect.poll(async () => (await control<Snapshot>('/control/snapshot')).tasks).toBe(3);

    await page.getByText('Browser-created task', { exact: true }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Status', { exact: true }).selectOption('In Progress');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
    await expect.poll(async () => (await control<Snapshot>('/control/snapshot')).max_version).toBeGreaterThanOrEqual(2);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await enterLegacyDeliveryBacklog(page);
    await expect(page.getByText('Browser-created task', { exact: true })).toBeVisible();
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Delete Browser-created task', exact: true }).click();
    await expect(page.getByText('Browser-created task', { exact: true })).toHaveCount(0);
    const finalSnapshot = await expect.poll(async () => control<Snapshot>('/control/snapshot')).toMatchObject({
      tasks: 3,
      imports: 1,
      receipts: 4,
      audits: 4,
      active: 2,
      retained: 1,
    });
    void finalSnapshot;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await enterLegacyDeliveryBacklog(page);
    await expect(page.getByText('Capture governed request', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Browser-created task', { exact: true })).toHaveCount(0);
    expect(unexpectedOrigins).toEqual(new Set());

    const persisted = await page.evaluate(() => ({
      view: JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'),
      scope: JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null'),
    }));
    expect(persisted).toEqual({ view: 'backlog', scope: { type: 'project', id: setup.projectId, name: 'Legacy Delivery' } });
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `${testInfo.project.name}.json`), `${JSON.stringify({
      schemaVersion: 'legacy-delivery-browser-evidence.v1',
      project: testInfo.project.name,
      status: 'passed',
      exactProductUi: true,
      loopbackOnly: true,
      unknownResponseReplayedOnce: true,
      operations: ['import', 'task.create', 'task.update', 'task.delete', 'reload'],
      snapshot: await control<Snapshot>('/control/snapshot'),
    }, null, 2)}\n`, { flag: 'wx' });
  });
});
