import { expect, test } from '@playwright/test';
import { authenticatedLifecycleEnterAs } from '../authenticatedLifecycleHarness';

const actor = { token: 'local-fixture-token', user: { id: 'local-fixture-author', email: 'author@example.test' } };

test('existing fixture-origin entry installs the actor before its only application navigation', async ({ page }) => {
  let documents = 0;
  await page.route('**/*', route => {
    documents += 1;
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><h1>Fixture application</h1>' });
  });
  await page.goto('/');
  documents = 0;
  let barriers = 0;
  await authenticatedLifecycleEnterAs(page, actor, async () => { barriers += 1; });
  expect(documents).toBe(1);
  expect(barriers).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token')!).user.id)).toBe(actor.user.id);
});

test('actor entry uses the ready document while a nonessential image remains pending', async ({ page }) => {
  let releaseImage!: () => void;
  const imageGate = new Promise<void>(resolve => { releaseImage = resolve; });
  let imageRequested!: () => void;
  const imageRequest = new Promise<void>(resolve => { imageRequested = resolve; });
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).pathname === '/pending-image') {
      imageRequested();
      await imageGate;
      await route.abort();
      return;
    }
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><h1>Ready document</h1><img src="/pending-image">' });
  });
  let barriers = 0;
  try {
    await authenticatedLifecycleEnterAs(page, actor, async () => { barriers += 1; });
    await imageRequest;
    await expect(page.getByRole('heading', { name: 'Ready document' })).toBeVisible();
    expect(await page.evaluate(() => document.readyState)).toBe('interactive');
    expect(barriers).toBe(2);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sb-127-auth-token')!).user.id)).toBe(actor.user.id);
  } finally {
    releaseImage();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('actor entry preserves a rejected pre-navigation drain and does not navigate', async ({ page }) => {
  let requests = 0;
  page.on('request', () => { requests += 1; });
  await expect(authenticatedLifecycleEnterAs(page, actor, async () => { throw new Error('LOCAL_DRAIN_FAILED'); }))
    .rejects.toThrow('LOCAL_DRAIN_FAILED');
  expect(requests).toBe(0);
  expect(page.url()).toBe('about:blank');
});

test('actor entry fails closed within 15 seconds when the document never arrives', async ({ page }) => {
  let releaseDocument!: () => void;
  const documentGate = new Promise<void>(resolve => { releaseDocument = resolve; });
  await page.route('**/*', async route => { await documentGate; await route.abort(); });
  let barriers = 0;
  try {
    await expect(authenticatedLifecycleEnterAs(page, actor, async () => { barriers += 1; }))
      .rejects.toThrow(/page.goto: Timeout 15000ms exceeded/);
    expect(barriers).toBe(1);
  } finally {
    releaseDocument();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
