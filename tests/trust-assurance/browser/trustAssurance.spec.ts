import { expect, test } from '@playwright/test';

const attemptFields = (line: string) => {
  const match = line.match(/request=([^:]+):key=([^:]+):auth=([^:]+):expected=([^:]+):payload=(.*)$/);
  if (!match) throw new Error(`Malformed harness attempt evidence: ${line}`);
  return { requestId: match[1], idempotencyKey: match[2], authorizationVersion: match[3], expectedVersion: match[4], payload: match[5] };
};

test('canonical pilot runtime mounts the governed real journey', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html');
  await expect(page.getByRole('heading', { name: 'Trust and Assurance Evidence Hub', exact: true })).toBeVisible();
  const views = page.getByRole('navigation', { name: 'Trust Assurance views', exact: true });

  await views.getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText(/CURRENT_CONTRADICTION/)).toBeVisible();
  await views.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText(/expired/)).toBeVisible();
  await views.getByRole('button', { name: 'Buyer-safe preview', exact: true }).click();
  await expect(page.getByText(/No published snapshot/)).toBeVisible();

  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Build snapshot', exact: true })).toBeDisabled();
  await expect(page.getByText('Durable change committed.', { exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Publication history', exact: true }).click();
  await expect(page.getByText(/draft/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?tenant-context=1');
  await page.getByRole('navigation', { name: 'Trust Assurance views', exact: true }).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText('Workspace B assurance', { exact: true })).toBeVisible();
  const callLog = page.getByTestId('trust-call-log');
  await expect(callLog).toContainText('query:internal:30000000-0000-4000-8000-000000000013');
  await expect(callLog).toContainText('query:buyer:30000000-0000-4000-8000-000000000013');
  await expect(callLog).not.toContainText('30000000-0000-4000-8000-000000000003');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace A', exact: true }).click();
  await expect(page.getByText('Workspace B assurance', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Loading server-authoritative assurance evidence/)).toBeVisible();
  await expect(callLog).toContainText('query:internal:30000000-0000-4000-8000-000000000003');
  await page.getByRole('button', { name: 'Release workspace A query', exact: true }).click();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Release workspace B command', exact: true }).click();
  await expect(callLog).toContainText('command-complete:snapshot.create:30000000-0000-4000-8000-000000000013');
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await expect(callLog).toContainText('command:snapshot.create:30000000-0000-4000-8000-000000000013');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(callLog).toContainText('command:snapshot.create:30000000-0000-4000-8000-000000000003');
  await expect(callLog).toContainText('command-complete:snapshot.create:30000000-0000-4000-8000-000000000003');
  await page.getByRole('button', { name: 'Clear call log', exact: true }).click();
  await page.getByRole('button', { name: 'Select workspace A without Trust', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('revoked');
  await page.waitForTimeout(400);
  await expect(callLog).toHaveText('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('revoked and version conflict remain explicit', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?revoked=1');
  await expect(page.getByRole('alert')).toContainText('revoked');
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?conflict=1');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByText('VERSION_CONFLICT', { exact: true })).toBeVisible();
  await expect(page.getByText(/No publication/)).toBeVisible();
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  const conflictCalls = (await page.getByTestId('trust-call-log').textContent())!.split('\n').filter(line => line.startsWith('command:snapshot.create:'));
  expect(conflictCalls).toHaveLength(2);
  expect(conflictCalls[0].match(/key=([^:]+)/)![1]).not.toBe(conflictCalls[1].match(/key=([^:]+)/)![1]);
});

test('server-projected read-only mode disables every governed mutation', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?readonly=1');
  await expect(page.getByText(/^Read-only mode:/)).toBeVisible();
  const controls = page.getByRole('region', { name: 'Trust Assurance commands' }).getByRole('button');
  await expect(controls).toHaveCount(9);
  for (let index = 0; index < await controls.count(); index += 1) await expect(controls.nth(index)).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('global application read-only preserves projections and dispatches no mutation', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?global-readonly=1');
  await expect(page.getByText(/^Read-only mode:/)).toBeVisible();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  const controls = page.getByRole('region', { name: 'Trust Assurance commands' }).getByRole('button');
  for (let index = 0; index < await controls.count(); index += 1) await expect(controls.nth(index)).toBeDisabled();
  await controls.first().evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByTestId('trust-call-log')).not.toContainText('command:');
});

test('global read-only transition blocks rapid dispatch and unresolved retry', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?response-loss=1&tenant-context=1');
  const log = page.getByTestId('trust-call-log');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enter global read-only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeDisabled();
  const before = (await log.textContent())!.split('\n').filter(line => line.startsWith('command:')).length;
  await page.getByRole('button', { name: 'Retry unresolved command', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  const after = (await log.textContent())!.split('\n').filter(line => line.startsWith('command:')).length;
  expect(after).toBe(before);
});

test('optional buyer outage preserves ready internal projection while authority failures fail closed', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?feature-disabled=1&buyer-transient=1');
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await expect(page.getByText(/Buyer-safe preview is temporarily unavailable/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Trust Assurance commands' })).toBeVisible();
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?feature-disabled=1&buyer-stale=1');
  await expect(page.getByRole('alert')).toContainText('Authorization changed. Refresh your tenant session.');
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?feature-disabled=1&buyer-denied=1');
  await expect(page.getByRole('alert')).toContainText('revoked');
});

test('response loss preserves exact create identities, scope, and refreshed authority replay', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?response-loss=1');
  const log = page.getByTestId('trust-call-log');
  const counts = async () => JSON.parse((await page.getByTestId('trust-effect-counts').textContent())!);

  await page.getByRole('button', { name: 'Create claim', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
  expect((await counts())['claim.create']).toBe(1);
  let lines = (await log.textContent())!.split('\n');
  expect(lines.filter(line => line.startsWith('commit-response-lost:claim.create:'))).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry unresolved command', exact: true }).click();
  await expect(page.getByText('Durable result replayed.', { exact: true })).toBeVisible();
  lines = (await log.textContent())!.split('\n');
  expect(attemptFields(lines.find(line => line.startsWith('commit-response-lost:claim.create:'))!)).toEqual(attemptFields(lines.find(line => line.startsWith('replay:claim.create:'))!));

  await page.getByRole('button', { name: 'Create claim', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
  expect((await counts())['claim.create']).toBe(2);
  lines = (await log.textContent())!.split('\n');
  const claimCommits = lines.filter(line => line.startsWith('commit-response-lost:claim.create:')).map(attemptFields);
  expect(claimCommits[0].idempotencyKey).not.toBe(claimCommits[1].idempotencyKey);
  await page.getByRole('button', { name: 'Retry unresolved command', exact: true }).click();
  await expect(page.getByText('Durable result replayed.', { exact: true })).toBeVisible();

  for (const [label, operation] of [['Register evidence', 'evidence.register'], ['Build snapshot', 'snapshot.create']] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
    expect((await counts())[operation]).toBe(1);
    await page.getByRole('button', { name: 'Retry unresolved command', exact: true }).click();
    await expect(page.getByText('Durable result replayed.', { exact: true })).toBeVisible();
    lines = (await log.textContent())!.split('\n');
    expect(attemptFields(lines.find(line => line.startsWith(`commit-response-lost:${operation}:`))!)).toEqual(attemptFields(lines.find(line => line.startsWith(`replay:${operation}:`))!));
  }

  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?response-loss=1&tenant-context=1');
  const scopedLog = page.getByTestId('trust-call-log');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
  let scopedLines = (await scopedLog.textContent())!.split('\n');
  const original = attemptFields(scopedLines.find(line => line.startsWith('commit-response-lost:snapshot.create:'))!);
  expect(original.authorizationVersion).toBe('3');
  await page.getByRole('button', { name: 'Select workspace A', exact: true }).click();
  await page.getByRole('navigation', { name: 'Trust Assurance views', exact: true }).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh workspace B authority', exact: true }).click();
  await page.getByRole('navigation', { name: 'Trust Assurance views', exact: true }).getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText('Workspace B assurance', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry unresolved command', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry unresolved command', exact: true }).click();
  await expect(page.getByText('Durable result replayed.', { exact: true })).toBeVisible();
  scopedLines = (await scopedLog.textContent())!.split('\n');
  const refreshed = attemptFields(scopedLines.find(line => line.startsWith('replay:snapshot.create:'))!);
  expect(refreshed).toEqual({ ...original, authorizationVersion: '4' });
});

test('feature-disabled rollback preserves authorized internal and buyer reads', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?feature-disabled=1');
  await expect(page.getByText(/^Read-only mode:/)).toBeVisible();
  const views = page.getByRole('navigation', { name: 'Trust Assurance views', exact: true });
  await views.getByRole('button', { name: 'Claims', exact: true }).click();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Buyer-safe preview', exact: true }).click();
  await expect(page.getByText('Workspace A assurance', { exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Publication history', exact: true }).click();
  await expect(page.getByText(/· published ·/)).toBeVisible();
  const controls = page.getByRole('region', { name: 'Trust Assurance commands' }).getByRole('button');
  for (let index = 0; index < await controls.count(); index += 1) await expect(controls.nth(index)).toBeDisabled();
  const callLog = await page.getByTestId('trust-call-log').textContent();
  expect(callLog).toContain('query:internal:');
  expect(callLog).toContain('query:buyer:');
  expect(callLog).not.toContain('command:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('feature-disable disagreement latches the ready workspace read-only', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?feature-mismatch=1');
  await page.getByRole('button', { name: 'Build snapshot', exact: true }).click();
  await expect(page.getByText('FEATURE_DISABLED', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Read-only mode:/)).toBeVisible();
  const controls = page.getByRole('region', { name: 'Trust Assurance commands' }).getByRole('button');
  for (let index = 0; index < await controls.count(); index += 1) await expect(controls.nth(index)).toBeDisabled();
  const commandsBefore = (await page.getByTestId('trust-call-log').textContent())!.split('\n').filter(line => line.startsWith('command:')).length;
  await controls.first().evaluate((button: HTMLButtonElement) => button.click());
  const commandsAfter = (await page.getByTestId('trust-call-log').textContent())!.split('\n').filter(line => line.startsWith('command:')).length;
  expect(commandsAfter).toBe(commandsBefore);
});

test('retired evidence remains history while only actionable evidence is targeted', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?evidence-history=1&tenant-context=1');
  const log=page.getByTestId('trust-call-log');
  await page.getByRole('button',{name:'Review evidence',exact:true}).click();
  await expect(log).toContainText('60000000-0000-4000-8000-000000000016');
  await expect(log).not.toContainText('target:resource.review:{"resourceType":"evidence_version","resourceId":"60000000-0000-4000-8000-000000000006"');
  await page.getByRole('combobox',{name:'Evidence target'}).selectOption('70000000-0000-4000-8000-000000000007');
  await expect(page.getByRole('button',{name:'Review evidence',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Link support',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Supersede evidence',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Withdraw evidence',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Withdraw evidence',exact:true}).evaluate((button: HTMLButtonElement)=>button.click());
  await expect(log).not.toContainText('target:evidence.withdraw:');
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?evidence-history=1&evidence-withdrawn=1');
  await expect(page.getByRole('button',{name:'Review evidence',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Link support',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Supersede evidence',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Withdraw evidence',exact:true})).toBeDisabled();
});

test('explicit claim selection binds every claim action and snapshot selection', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?multiple-claims=1&tenant-context=1');
  const log=page.getByTestId('trust-call-log');
  for(const label of ['Revise claim','Review claim','Link support','Build snapshot']) {
    const action=page.getByRole('button',{name:label,exact:true});
    await expect(action).toBeDisabled();
    await action.evaluate((button: HTMLButtonElement)=>button.click());
  }
  await expect(log).not.toContainText('target:claim.revise:');
  await expect(log).not.toContainText('target:resource.review:{"resourceType":"claim_version"');
  await expect(log).not.toContainText('target:evidence.link:');
  await expect(log).not.toContainText('target:snapshot.create:');
  await page.getByRole('combobox',{name:'Claim target'}).selectOption('50000000-0000-4000-8000-000000000015');
  await page.getByRole('button',{name:'Revise claim',exact:true}).click();
  await expect(log).toContainText('target:claim.revise:{"claimId":"50000000-0000-4000-8000-000000000015"');
  await page.getByRole('button',{name:'Review claim',exact:true}).click();
  await expect(log).toContainText('target:resource.review:{"resourceType":"claim_version","resourceId":"40000000-0000-4000-8000-000000000014"');
  await page.getByRole('button',{name:'Link support',exact:true}).click();
  await expect(log).toContainText('target:evidence.link:{"claimVersionId":"40000000-0000-4000-8000-000000000014"');
  await page.getByRole('button',{name:'Build snapshot',exact:true}).click();
  await expect(log).toContainText('target:snapshot.create:{"claimIds":["50000000-0000-4000-8000-000000000015"]}');
  await expect(log).not.toContainText('target:snapshot.create:{"claimIds":["50000000-0000-4000-8000-000000000005"]}');
});

test('snapshot actions follow lifecycle and the current-publication pointer', async ({ page }) => {
  await page.goto('/tests/trust-assurance/browser/trustAssuranceHarness.html?snapshot-mixed=1');
  await expect(page.getByRole('button',{name:'Review snapshot',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Withdraw publication',exact:true})).toBeEnabled();
});
