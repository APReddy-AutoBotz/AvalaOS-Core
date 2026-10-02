import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page, mode = 'ready') => {
  await page.goto(`/tests/browser/syntheticAdminHarness.html?mode=${mode}`);
  return page.getByTestId('synthetic-user-management');
};
const operations = (page: Page) => page.evaluate(() => (window as any).__syntheticAdminEvents as Array<{operation:string;workspaceId:string;requestId?:string;idempotencyKey?:string;passwordSubmitted?:boolean}>);
const reserve = async (page: Page, label = 'Finance author') => {
  const panel = page.getByTestId('synthetic-user-management');
  await panel.getByLabel('Account label').fill(label);
  await panel.getByRole('button',{name:'Reserve account'}).click();
  return panel;
};
const assertAdminAccess = async (page: Page) => {
  const accessibility = await new AxeBuilder({page}).include('[data-testid="synthetic-user-management"]').analyze();
  expect(accessibility.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
};

test('Admin can reserve, activate, change role and revoke one scoped synthetic account', async ({page}) => {
  const panel = await open(page);
  await reserve(page);
  await expect(panel.getByText(/Account reserved/)).toBeVisible();
  await expect(panel.getByText(/Login ID: synthetic-/).first()).toBeVisible();
  await expect(panel.getByLabel('Temporary password')).toHaveAttribute('maxlength', '72');
  await expect(panel.getByText(/Password requires 12–72 ASCII/)).toBeVisible();
  await panel.getByLabel('Temporary password').fill('SyntheticOnly!129834');
  await panel.getByRole('button',{name:'Activate reserved account once'}).click();
  await expect(panel.getByText(/synthetic account is active/)).toBeVisible();
  await expect(panel.getByLabel('Temporary password')).toHaveCount(0);
  await expect(panel.getByRole('list',{name:'Synthetic account roster'}).getByText('Finance author')).toBeVisible();
  await panel.getByLabel('New role').selectOption('reviewer');
  await expect(panel.getByText('Role: author', {exact:false})).toBeVisible();
  await panel.getByRole('button',{name:'Apply role'}).click();
  await expect(panel.getByText('Role: reviewer', {exact:false})).toBeVisible();
  await panel.getByRole('button',{name:'Revoke access'}).click();
  await expect(panel.getByText('State: active', {exact:false})).toBeVisible();
  await panel.getByRole('button',{name:'Confirm revoke'}).click();
  await expect(panel.getByText('State: revoked', {exact:false})).toBeVisible();
  const events = await operations(page);
  expect(events.map(event=>event.operation).filter(operation=>operation!=='list')).toEqual(['reserve','execute','assign_role','revoke']);
  expect(events.find(event=>event.operation==='execute')?.passwordSubmitted).toBe(true);
  expect(events.every(event=>event.workspaceId==='33333333-3333-4333-8333-333333333333')).toBe(true);
  expect(JSON.stringify(events)).not.toContain('SyntheticOnly!129834');
  await assertAdminAccess(page);
});

test('Admin pending reservation announces busy state and keeps a single operation in flight', async ({page}) => {
  const panel=await open(page,'reserve_busy');
  await reserve(page);
  await expect.poll(async()=> (await operations(page)).filter(event=>event.operation==='reserve').length).toBe(1);
  const status=panel.getByRole('status').filter({hasText:'Verifying account operation'});
  await expect(panel).toHaveAttribute('aria-busy','true');
  await expect(status).toBeFocused();
  await expect(panel.getByRole('button',{name:'Reserve account'})).toBeDisabled();
  await expect(panel.getByRole('button',{name:'Reload roster'})).toBeDisabled();
  await assertAdminAccess(page);
  await page.getByRole('button',{name:'Release delayed response'}).click();
  await expect(panel.getByText(/Account reserved/)).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy','false');
  expect((await operations(page)).filter(event=>event.operation==='reserve')).toHaveLength(1);
});

test('Admin server denial focuses an alert and leaves recoverable fields without a roster mutation', async ({page}) => {
  const panel=await open(page,'reserve_error');
  await reserve(page);
  const alert=panel.getByRole('alert');
  await expect(alert).toContainText('workspace role cannot manage synthetic users');
  await expect(alert).toBeFocused();
  await expect(panel.getByLabel('Account label')).toHaveValue('Finance author');
  await expect(panel.getByRole('button',{name:'Reserve account'})).toBeEnabled();
  await assertAdminAccess(page);
  expect((await operations(page)).filter(event=>event.operation==='reserve')).toHaveLength(1);
  await panel.getByRole('button',{name:'Reserve account'}).click();
  await expect(panel.getByText(/Account reserved/)).toBeVisible();
});

test('pending Auth ban remains incomplete until exact roster reconciliation confirms revocation', async ({page}) => {
  const panel=await open(page,'ban_pending');
  await expect(panel.getByText('State: ban_required',{exact:false})).toBeVisible();
  await expect(panel.getByRole('button',{name:'Revoke access'})).toHaveCount(0);
  const reconcile=panel.getByRole('button',{name:'Reconcile Auth ban'});
  await reconcile.click();
  await expect(panel.getByText('State: ban_uncertain',{exact:false})).toBeVisible();
  await expect(panel.getByRole('status').filter({hasText:'Auth ban remains unconfirmed'})).toBeVisible();
  await expect(panel.getByText('State: revoked',{exact:false})).toHaveCount(0);
  await assertAdminAccess(page);
  await reconcile.click();
  await expect(panel.getByText('State: revoked',{exact:false})).toBeVisible();
  await expect(reconcile).toHaveCount(0);
  await expect(panel.getByRole('status').filter({hasText:'confirmed revoked'})).toBeVisible();
  const events=(await operations(page)).filter(event=>event.operation==='reconcile');
  expect(events).toHaveLength(2);
  expect(events.every(event=>event.workspaceId==='33333333-3333-4333-8333-333333333333')).toBe(true);
  expect(events[0].requestId).not.toBe(events[1].requestId);
  expect(events[0].idempotencyKey).not.toBe(events[1].idempotencyKey);
  expect((await operations(page)).filter(event=>event.operation==='revoke')).toHaveLength(0);
});

test('non-Admin capability never requests a roster or exposes account controls', async ({page}) => {
  const panel = await open(page,'denied');
  await expect(panel.getByText(/Account management is unavailable/)).toBeVisible();
  await expect(panel.getByRole('button',{name:'Reserve account'})).toHaveCount(0);
  await assertAdminAccess(page);
  expect(await operations(page)).toHaveLength(0);
});

test('uncertain activation locks duplicate execute and reconciles the same reserved account', async ({page}) => {
  const panel = await open(page,'uncertain');
  await reserve(page);
  await panel.getByLabel('Temporary password').fill('SyntheticOnly!129834');
  await panel.getByRole('button',{name:'Activate reserved account once'}).click();
  await expect(panel.getByText(/result is unknown/)).toBeVisible();
  await assertAdminAccess(page);
  await expect(panel.getByRole('button',{name:'Activate reserved account once'})).toHaveCount(0);
  await expect(panel.getByRole('button',{name:'Reserve account'})).toBeDisabled();
  await panel.getByRole('button',{name:'Reconcile account state'}).click();
  await expect(panel.getByText('The account is confirmed in server state.')).toBeVisible();
  await expect(panel.getByText('Account operation: active',{exact:false})).toBeVisible();
  await expect(panel.getByText('State: active',{exact:false})).toBeVisible();
  await assertAdminAccess(page);
  const events=await operations(page);
  expect(events.filter(event=>event.operation==='execute')).toHaveLength(1);
  expect(events.filter(event=>event.operation==='reconcile')).toHaveLength(1);
});

test('uncertain reservation recovers with the exact saved request and operation key', async ({page}) => {
  const panel = await open(page,'reserve_uncertain');
  await reserve(page);
  await expect(panel.getByText(/reservation result is unknown/)).toBeVisible();
  await assertAdminAccess(page);
  await expect(panel.getByRole('button',{name:'Reserve account'})).toBeDisabled();
  await panel.getByRole('button',{name:'Recover original reservation'}).click();
  await expect(panel.getByText(/Account reserved/)).toBeVisible();
  await assertAdminAccess(page);
  const attempts=(await operations(page)).filter(event=>event.operation==='reserve');
  expect(attempts).toHaveLength(2);
  expect(attempts[0].requestId).toBe(attempts[1].requestId);
  expect(attempts[0].idempotencyKey).toBe(attempts[1].idempotencyKey);
});

test('late roster response cannot show a prior workspace account after scope change', async ({page}) => {
  const panel = await open(page,'late');
  await expect.poll(async()=> (await operations(page)).filter(event=>event.operation==='list').length).toBe(1);
  await page.getByRole('button',{name:'Switch workspace and authority'}).click();
  await expect(panel.getByText(/No confirmed exploratory accounts/)).toBeVisible();
  await assertAdminAccess(page);
  await page.getByRole('button',{name:'Release delayed response'}).click();
  await expect(panel.getByText('Existing synthetic actor')).toHaveCount(0);
  const events=await operations(page);
  expect(events.filter(event=>event.operation==='list').map(event=>event.workspaceId)).toEqual(['33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333334']);
});

test('late activation response cannot show success or retain password after scope change', async ({page}) => {
  const panel = await open(page,'late_execute');
  await reserve(page);
  await panel.getByLabel('Temporary password').fill('SyntheticOnly!129834');
  await panel.getByRole('button',{name:'Activate reserved account once'}).click();
  await expect.poll(async()=> (await operations(page)).filter(event=>event.operation==='execute').length).toBe(1);
  await page.getByRole('button',{name:'Switch workspace and authority'}).click();
  await expect(panel.getByText(/No confirmed exploratory accounts/)).toBeVisible();
  await assertAdminAccess(page);
  await page.getByRole('button',{name:'Release delayed response'}).click();
  await expect(panel.getByText(/confirmed in server state|synthetic account is active/)).toHaveCount(0);
  await expect(panel.getByLabel('Temporary password')).toHaveCount(0);
  expect((await operations(page)).filter(event=>event.operation==='execute')).toHaveLength(1);
});

test('uncertain role assignment blocks a second change until server reconciliation', async ({page}) => {
  const panel=await open(page,'uncertain_role');
  await reserve(page);
  await panel.getByLabel('Temporary password').fill('SyntheticOnly!129834');
  await panel.getByRole('button',{name:'Activate reserved account once'}).click();
  await expect(panel.getByText(/synthetic account is active/)).toBeVisible();
  await panel.getByLabel('New role').selectOption('reviewer');
  await panel.getByRole('button',{name:'Apply role'}).click();
  await expect(panel.getByText(/unknown outcome/)).toBeVisible();
  await assertAdminAccess(page);
  await expect(panel.getByRole('button',{name:'Revoke access'})).toBeDisabled();
  await panel.getByRole('button',{name:'Reconcile roster operation'}).click();
  await expect(panel.getByText('Role: reviewer',{exact:false})).toBeVisible();
  await assertAdminAccess(page);
  const events=await operations(page);
  expect(events.filter(event=>event.operation==='assign_role')).toHaveLength(1);
  expect(events.filter(event=>event.operation==='reconcile')).toHaveLength(1);
});

test('uncertain revocation cannot be reissued and reconciles to revoked state', async ({page}) => {
  const panel=await open(page,'uncertain_revoke');
  await reserve(page);
  await panel.getByLabel('Temporary password').fill('SyntheticOnly!129834');
  await panel.getByRole('button',{name:'Activate reserved account once'}).click();
  await expect(panel.getByText(/synthetic account is active/)).toBeVisible();
  await panel.getByRole('button',{name:'Revoke access'}).click();
  await panel.getByRole('button',{name:'Confirm revoke'}).click();
  await expect(panel.getByText(/unknown outcome/)).toBeVisible();
  await assertAdminAccess(page);
  await panel.getByRole('button',{name:'Reconcile roster operation'}).click();
  await expect(panel.getByText('State: revoked',{exact:false})).toBeVisible();
  await assertAdminAccess(page);
  const events=await operations(page);
  expect(events.filter(event=>event.operation==='revoke')).toHaveLength(1);
  expect(events.filter(event=>event.operation==='reconcile')).toHaveLength(1);
});
