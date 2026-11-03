import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const brokerPdfPath = path.resolve('tests/fixtures/process-evidence/synthetic-sdd-export.pdf');
const expectedSha256 = '92f36ceb8ba54d42854dc0acfeaf7ab8d7aaca7a81a7276bfb0874e3c0667f19';
const expectedByteLength = 4_339;
const artifactId = '00000038-0000-4000-8000-000000000038';
const approvedVersionId = '00000053-0000-4000-8000-000000000053';
const renditionId = '00000058-0000-4000-8000-000000000058';
const organizationId = '00000002-0000-4000-8000-000000000002';
const workspaceId = '00000003-0000-4000-8000-000000000003';
const userId = '00000001-0000-4000-8000-000000000001';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('ordinary SDD Generate PDF and Download use the private broker client and preserve exact bytes', async ({ page }) => {
  const brokerPdf = readFileSync(brokerPdfPath);
  expect({ byteLength: brokerPdf.byteLength, sha256: sha256(brokerPdf) }).toEqual({
    byteLength: expectedByteLength,
    sha256: expectedSha256,
  });

  const accessToken = [
    base64Url({ alg: 'none', typ: 'JWT' }),
    base64Url({ sub: userId, role: 'authenticated', exp: 4_102_444_800 }),
    'synthetic-browser-signature',
  ].join('.');
  await page.addInitScript(({ accessToken: token, userId: actorId }) => {
    const downloadCapture: {
      bytes?: number[];
      filename?: string;
      response?: Record<string, unknown>;
    } = {};
    (window as typeof window & { __studioDownloadCapture?: typeof downloadCapture })
      .__studioDownloadCapture = downloadCapture;
    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => {
      void blob.arrayBuffer().then(bytes => {
        downloadCapture.bytes = Array.from(new Uint8Array(bytes));
      });
      return createObjectUrl(blob);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clickDownload() {
      downloadCapture.filename = this.download;
      return click.call(this);
    };
    const fetchRequest = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetchRequest(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      if (url.endsWith('/functions/v1/studio-artifact-download')) {
        const clone = response.clone();
        const blob = await clone.blob();
        downloadCapture.response = {
          status: response.status,
          cacheControl: response.headers.get('cache-control'),
          contentDisposition: response.headers.get('content-disposition'),
          contentType: response.headers.get('content-type'),
          nosniff: response.headers.get('x-content-type-options'),
          blobType: blob.type,
          blobSize: blob.size,
        };
      }
      return response;
    };
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify({
      access_token: token,
      refresh_token: 'synthetic-browser-refresh-token',
      expires_at: 4_102_444_800,
      expires_in: 3_600,
      token_type: 'bearer',
      user: { id: actorId, aud: 'authenticated', role: 'authenticated' },
    }));
  }, { accessToken, userId });

  let projectionReads = 0;
  let generated = false;
  const commandBodies: unknown[] = [];
  const downloadBodies: unknown[] = [];
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-expose-headers': 'cache-control, content-disposition, content-type, x-content-type-options',
  };
  const rendition = {
    id: renditionId,
    version: 1,
    format: 'pdf',
    state: 'available',
    mimeType: 'application/pdf',
    filename: 'synthetic-sdd-db-cross-layer.pdf',
    byteLength: expectedByteLength,
    sha256: expectedSha256,
    rendererVersion: 'studio-pdf-1',
    retentionMode: 'indefinite',
    retentionUntil: null,
    legalHoldActive: false,
    activeHolds: [],
    deletion: null,
    failureCode: null,
    updatedAt: '2026-11-03T00:03:00.000Z',
  };
  const projection = () => ({
    artifactId,
    artifactVersionId: approvedVersionId,
    artifactVersion: 1,
    artifactType: 'sdd',
    approved: true,
    readOnly: false,
    renditions: generated ? [rendition] : [],
  });

  // More specific routes below fulfill synthetic server requests inside the browser.
  // Only the test server may receive real HTTP traffic.
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4197'
    ? route.continue() : route.abort('blockedbyclient'));
  await page.route('https://placeholder.supabase.co/rest/v1/rpc/studio_private_artifact_projection', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    projectionReads += 1;
    expect(route.request().postDataJSON()).toEqual({
      p_org: organizationId,
      p_workspace: workspaceId,
      p_artifact_version: approvedVersionId,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(projection()),
    });
  });
  await page.route('https://placeholder.supabase.co/functions/v1/studio-private-artifact-command', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const body = route.request().postDataJSON();
    commandBodies.push(body);
    expect(body).toMatchObject({
      commandType: 'studio.rendition.generate',
      organizationId,
      workspaceId,
      authorizationVersion: 7,
      expectedArtifactVersion: 1,
      expectedRenditionVersion: null,
      payload: { artifactId, artifactVersionId: approvedVersionId, format: 'pdf' },
    });
    generated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        outcome: 'rendition_available',
        receiptId: '00000059-0000-4000-8000-000000000059',
        resourceId: renditionId,
        resource: rendition,
      }),
    });
  });
  await page.route('https://placeholder.supabase.co/functions/v1/studio-artifact-download', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    downloadBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'cache-control': 'private, no-store',
        'content-disposition': 'attachment; filename="synthetic-sdd-db-cross-layer.pdf"',
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
      },
      body: brokerPdf,
    });
  });

  await page.goto('/tests/browser/studioPrB/harness.html?mode=direct&sddFlows=1&privateExport=1');
  await page.getByTestId('studio-artifact-workspace').getByLabel('Artifact type').selectOption('sdd');
  const panel = page.getByTestId('studio-artifact-renditions');
  await expect(panel.getByText('Current committed private rendition state loaded.')).toBeVisible();
  await panel.getByTestId('rendition-pdf').getByRole('button', { name: 'Generate PDF' }).click();
  await expect(panel.getByTestId('rendition-pdf').getByText('Available')).toBeVisible();
  await expect(panel.getByText(/Committed state reloaded \(receipt/)).toBeVisible();

  await panel.getByTestId('rendition-pdf').getByRole('button', { name: 'Download PDF' }).click();
  await expect.poll(async () => panel.locator('p[role="status"]').first().textContent()).not.toContain('Authorizing');
  const responseCapture = await page.evaluate(() =>
    (window as typeof window & {
      __studioDownloadCapture?: { response?: Record<string, unknown> };
    }).__studioDownloadCapture?.response,
  );
  expect(responseCapture).toEqual({
    status: 200,
    cacheControl: 'private, no-store',
    contentDisposition: 'attachment; filename="synthetic-sdd-db-cross-layer.pdf"',
    contentType: 'application/pdf',
    nosniff: 'nosniff',
    blobType: 'application/pdf',
    blobSize: expectedByteLength,
  });
  await expect(panel.locator('p[role="status"]').first()).toHaveText('Brokered download completed.');
  await expect.poll(async () => page.evaluate(() =>
    (window as typeof window & { __studioDownloadCapture?: { bytes?: number[] } })
      .__studioDownloadCapture?.bytes?.length ?? 0,
  )).toBe(expectedByteLength);
  const capture = await page.evaluate(() =>
    (window as typeof window & {
      __studioDownloadCapture?: { bytes?: number[]; filename?: string };
    }).__studioDownloadCapture,
  );
  expect(capture?.filename).toBe('synthetic-sdd-db-cross-layer.pdf');
  const downloadedPdf = Buffer.from(capture?.bytes ?? []);
  expect({ byteLength: downloadedPdf.byteLength, sha256: sha256(downloadedPdf) }).toEqual({
    byteLength: expectedByteLength,
    sha256: expectedSha256,
  });
  expect(downloadedPdf.equals(brokerPdf)).toBe(true);
  expect({ projectionReads, commandCalls: commandBodies.length, downloadCalls: downloadBodies.length }).toEqual({
    projectionReads: 2,
    commandCalls: 1,
    downloadCalls: 1,
  });
  expect(downloadBodies[0]).toMatchObject({
    organizationId,
    workspaceId,
    authorizationVersion: 7,
    renditionId,
  });
});
