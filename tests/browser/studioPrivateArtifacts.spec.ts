import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { StudioPrivateArtifactFormat } from '../../services/studioArtifacts/privateArtifactContracts';

const API = 'http://127.0.0.1:59999';
const PREVIEW_ORIGINS = new Set([
  'http://127.0.0.1:4188',
  'http://127.0.0.1:4190',
  'http://127.0.0.1:4173',
]);
const ORG = '41111111-1111-4111-8111-111111111111';
const WS = '42222222-2222-4222-8222-222222222222';
const HANDOFF = '43333333-3333-4333-8333-333333333333';
const ARTIFACT = '44444444-4444-4444-8444-444444444444';
const VERSION = '45555555-5555-4555-8555-555555555555';
const ACTOR = '46666666-6666-4666-8666-666666666666';
const RECEIPT = '47777777-7777-4777-8777-777777777777';
const HOLD_ONE = '47777777-7777-4777-8777-777777777771';
const HOLD_TWO = '47777777-7777-4777-8777-777777777772';
const RENDITION_IDS: Record<StudioPrivateArtifactFormat, string> = {
  markdown: '48888888-8888-4888-8888-888888888881',
  pdf: '48888888-8888-4888-8888-888888888882',
  docx: '48888888-8888-4888-8888-888888888883',
};
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'content-type': 'application/json',
};
const privateCapabilities = [
  'studio.artifacts.rendition.generate',
  'studio.artifacts.download',
  'studio.artifacts.retention.manage',
  'studio.artifacts.legal_hold.manage',
  'studio.artifacts.delete.request',
  'studio.artifacts.delete.approve',
];
const allCapabilities = [
  'studio.artifacts.read',
  'studio.artifacts.generate',
  'studio.artifacts.edit',
  'studio.artifacts.review',
  'studio.artifacts.approve',
  ...privateCapabilities,
];
const mime: Record<StudioPrivateArtifactFormat, string> = {
  markdown: 'text/markdown; charset=utf-8',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const hashCharacter: Record<StudioPrivateArtifactFormat, string> = {
  markdown: 'a',
  pdf: 'b',
  docx: 'c',
};

type Rendition = ReturnType<typeof rendition>;
function rendition(
  format: StudioPrivateArtifactFormat,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: RENDITION_IDS[format],
    version: 2,
    format,
    state: 'available',
    mimeType: mime[format],
    filename: `governed-brief.${format === 'markdown' ? 'md' : format}`,
    byteLength: 2048,
    sha256: hashCharacter[format].repeat(64),
    rendererVersion: `studio-${format}-1`,
    retentionMode: 'until',
    retentionUntil: '2027-07-29T00:00:00.000Z',
    legalHoldActive: false,
    activeHolds: [],
    deletion: null,
    failureCode: null,
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  };
}

interface FixtureOptions {
  capabilities?: string[];
  renditions?: Rendition[];
  commandFailure?: 'AUTHORITY_STALE' | 'VERSION_CONFLICT';
  deletionFailure?: boolean;
  reloadFailure?: boolean;
}

async function installFixture(page: Page, options: FixtureOptions = {}) {
  const capabilities = options.capabilities ?? allCapabilities;
  let renditions = options.renditions ?? [];
  let failReload = false;
  const requests: { path: string; queryKeys: string[]; body: any }[] = [];
  const user = {
    id: ACTOR,
    email: 'studio-private@example.test',
    role: 'authenticated',
    aud: 'authenticated',
  };
  const ok = (route: any, body: unknown) =>
    route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  const artifactProjection = {
    id: ARTIFACT,
    artifactType: 'brd',
    aggregateVersion: 8,
    lifecycle: 'approved',
    ancestry: {
      organizationId: ORG,
      workspaceId: WS,
      caseId: ARTIFACT,
      sourceCaseVersionId: VERSION,
      sourceCaseVersion: 1,
      decisionId: HANDOFF,
      decisionVersion: 'decision-v1',
      reviewResolutionId: VERSION,
      governResolutionId: ARTIFACT,
      studioHandoffId: HANDOFF,
      sourcePackageHash: 'a'.repeat(64),
      sourceSchemaVersion: 'assess-v2',
      ruleSetVersion: 'rules-v1',
      reviewSchemaVersion: 'review-v1',
      reviewSequence: 1,
    },
    currentVersion: {
      id: VERSION,
      version: 4,
      parentVersionId: null,
      lifecycle: 'approved',
      templateVersion: 'studio-brd-1',
      contentSchemaVersion: 'studio-artifact-1',
      projectionVersion: 'json-v1',
      content: { title: 'Approved governed brief' },
      contentHash: 'b'.repeat(64),
      authorId: ACTOR,
      createdAt: '2026-07-28T00:00:00.000Z',
    },
    currentApprovedVersion: {
      id: VERSION,
      version: 4,
      parentVersionId: null,
      lifecycle: 'approved',
      templateVersion: 'studio-brd-1',
      contentSchemaVersion: 'studio-artifact-1',
      projectionVersion: 'json-v1',
      content: { title: 'Approved governed brief' },
      contentHash: 'b'.repeat(64),
      authorId: ACTOR,
      createdAt: '2026-07-28T00:00:00.000Z',
    },
    versions: [
      {
        id: VERSION,
        version: 4,
        parentVersionId: null,
        lifecycle: 'approved',
        templateVersion: 'studio-brd-1',
        contentSchemaVersion: 'studio-artifact-1',
        projectionVersion: 'json-v1',
        content: { title: 'Approved governed brief' },
        contentHash: 'b'.repeat(64),
        authorId: ACTOR,
        createdAt: '2026-07-28T00:00:00.000Z',
      },
    ],
    review: null,
    approval: {
      approverId: '49999999-9999-4999-8999-999999999999',
      outcome: 'approved',
      rationale: 'Approved for governed rendition',
      conditions: [],
      supersededVersionId: null,
    },
    readOnly: false,
  };
  const privateProjection = () => ({
    artifactId: ARTIFACT,
    artifactVersionId: VERSION,
    artifactVersion: 4,
    artifactType: 'brd',
    approved: true,
    readOnly: false,
    renditions,
  });

  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (PREVIEW_ORIGINS.has(url.origin)) return route.continue();
    if (url.origin !== API) return route.abort();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers, body: '' });
    }
    const body = request.postData() ? request.postDataJSON() : null;
    requests.push({ path: url.pathname, queryKeys: [...url.searchParams.keys()].sort(), body });
    if (url.pathname === '/auth/v1/user' || url.pathname === '/auth/v1/token') {
      return ok(route, user);
    }
    if (url.pathname === '/functions/v1/tenant-session') {
      return ok(route, {
        contexts: [
          {
            userId: ACTOR,
            organizationId: ORG,
            organizationName: 'Avala Enterprise',
            workspaceId: WS,
            workspaceName: 'Governed Studio',
            authorizationVersion: 12,
            capabilities,
          },
        ],
      });
    }
    if (url.pathname.includes('studio_artifact_handoffs')) {
      return ok(route, [
        {
          id: HANDOFF,
          caseId: ARTIFACT,
          label: 'Accepted canonical handoff',
          sourcePackageHash: 'a'.repeat(64),
        },
      ]);
    }
    if (url.pathname.includes('studio_artifact_projection')) {
      return ok(route, artifactProjection);
    }
    if (url.pathname.includes('studio_private_artifact_projection')) {
      if (failReload) {
        failReload = false;
        return route.fulfill({
          status: 503,
          headers,
          body: JSON.stringify({ code: 'COMMAND_UNAVAILABLE' }),
        });
      }
      return ok(route, privateProjection());
    }
    if (url.pathname === '/functions/v1/studio-private-artifact-command') {
      if (options.commandFailure) {
        return route.fulfill({
          status: 409,
          headers,
          body: JSON.stringify({
            ok: false,
            error: { code: options.commandFailure },
          }),
        });
      }
      await new Promise(resolve => setTimeout(resolve, 220));
      if (body.commandType === 'studio.rendition.generate') {
        renditions = [
          ...renditions.filter((item: Rendition) => item.format !== body.payload.format),
          rendition(body.payload.format),
        ];
      }
      if (body.commandType === 'studio.legal_hold.release') {
        renditions = renditions.map((item: Rendition) =>
          item.id === body.payload.renditionId
            ? rendition(item.format, {
                ...item,
                activeHolds: item.activeHolds.filter(
                  (hold: { holdId: string }) => hold.holdId !== body.payload.holdId,
                ),
                legalHoldActive: item.activeHolds.some(
                  (hold: { holdId: string }) => hold.holdId !== body.payload.holdId,
                ),
                version: item.version + 1,
              })
            : item,
        );
      }
      if (body.commandType === 'studio.rendition.deletion.resolve') {
        renditions = renditions.map((item: Rendition) =>
          item.id === body.payload.renditionId
            ? rendition(item.format, {
                ...item,
                version: item.version + 1,
                state: options.deletionFailure ? 'deletion_failed' : 'deleted',
                failureCode: options.deletionFailure ? 'PROVIDER_DELETE_FAILED' : null,
              })
            : item,
        );
      }
      if (options.reloadFailure) failReload = true;
      return ok(route, {
        ok: true,
        outcome:
          body.commandType === 'studio.rendition.generate'
            ? 'rendition_available'
            : body.commandType === 'studio.rendition.deletion.resolve' &&
                options.deletionFailure
              ? 'deletion_failed'
              : body.commandType === 'studio.rendition.deletion.resolve'
                ? 'deletion_completed'
                : 'committed',
        receiptId: RECEIPT,
        resourceId: body.payload.renditionId ?? RENDITION_IDS[body.payload.format],
        resource: { state: 'committed' },
      });
    }
    if (url.pathname === '/functions/v1/studio-artifact-download') {
      return route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/pdf',
          'content-disposition': 'attachment; filename="governed-brief.pdf"',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'access-control-expose-headers':
            'Content-Disposition, Content-Type, Cache-Control, X-Content-Type-Options',
        },
        body: '%PDF-governed-download',
      });
    }
    return ok(route, []);
  });
  return { requests, privateProjection };
}

async function openDocs(page: Page) {
  const started = Date.now();
  await page.goto('/tests/browser/studioPrivateArtifactsHarness.html');
  await expect(page.getByRole('heading', { name: 'Document Repository' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('studio-artifact-renditions')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(6_000);
  return page.getByTestId('studio-artifact-renditions');
}

test.describe.configure({ timeout: 90_000 });

test('approved canonical artifact shows governed rendition controls', async ({ page }) => {
  await installFixture(page);
  const panel = await openDocs(page);
  await expect(panel).toContainText('Downloads apply only to this approved canonical Studio version');
  await expect(panel.getByRole('button', { name: 'Generate Markdown' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Generate PDF' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Generate DOCX' })).toBeEnabled();
});

test('unauthorized capabilities disable every private mutation and download', async ({ page }) => {
  await installFixture(page, {
    capabilities: ['studio.artifacts.read'],
    renditions: [rendition('pdf')],
  });
  const panel = await openDocs(page);
  for (const button of await panel.getByRole('button').all()) {
    expect(await button.isDisabled()).toBeTruthy();
  }
});

test('generation remains pending until committed projection reload', async ({ page }) => {
  await installFixture(page);
  const panel = await openDocs(page);
  const click = panel.getByRole('button', { name: 'Generate PDF' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Pending. Success appears only after the committed projection reloads.',
  );
  await click;
  await expect(panel.getByTestId('rendition-pdf')).toContainText('Available');
  await expect(panel.getByRole('status')).toContainText(`receipt ${RECEIPT}`);
});

test('Markdown PDF and DOCX show verified available metadata', async ({ page }) => {
  await installFixture(page, {
    renditions: [rendition('markdown'), rendition('pdf'), rendition('docx')],
  });
  const panel = await openDocs(page);
  for (const format of ['markdown', 'pdf', 'docx'] as const) {
    const card = panel.getByTestId(`rendition-${format}`);
    await expect(card).toContainText('Available');
    await expect(card).toContainText(`studio-${format}-1`);
    await expect(card).toContainText(hashCharacter[format].repeat(64));
    await expect(card).toContainText('2,048');
  }
});

test('download invokes authenticated broker and never a Storage URL', async ({ page }) => {
  const fixture = await installFixture(page, { renditions: [rendition('pdf')] });
  const panel = await openDocs(page);
  await panel.getByRole('button', { name: 'Download PDF' }).click();
  await expect
    .poll(() =>
      fixture.requests.some(request => request.path === '/functions/v1/studio-artifact-download'),
    )
    .toBeTruthy();
  await expect(panel.getByRole('status')).toContainText('Brokered download completed.');
  expect(fixture.requests.some(request => request.path.includes('/storage/v1/'))).toBeFalsy();
});

test('legal hold remains separate and blocks deletion request', async ({ page }) => {
  await installFixture(page, {
    renditions: [
      rendition('pdf', {
        legalHoldActive: true,
        activeHolds: [{ holdId: HOLD_ONE, placedAt: '2026-07-29T00:00:00.000Z' }],
      }),
    ],
  });
  const panel = await openDocs(page);
  await panel.getByLabel('Governed reason').fill('Matter remains open');
  await expect(panel.getByTestId('rendition-pdf').getByText('Legal hold', { exact: true }).locator('..')).toContainText('Active');
  await expect(panel.getByRole('button', { name: 'Request deletion' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: /Release legal hold placed/ })).toBeEnabled();
});

test('private projection request uses only the exact production RPC arguments', async ({ page }) => {
  const fixture = await installFixture(page);
  await openDocs(page);
  const projectionRequest = fixture.requests.find(request =>
    request.path.includes('studio_private_artifact_projection'),
  );
  expect(Object.keys(projectionRequest?.body ?? {}).sort()).toEqual([
    'p_artifact_version',
    'p_org',
    'p_workspace',
  ]);
});

test('multiple active holds are disclosed safely and released by exact hold id', async ({ page }) => {
  const fixture = await installFixture(page, {
    renditions: [
      rendition('pdf', {
        legalHoldActive: true,
        activeHolds: [
          { holdId: HOLD_ONE, placedAt: '2026-07-28T00:00:00.000Z' },
          { holdId: HOLD_TWO, placedAt: '2026-07-29T00:00:00.000Z' },
        ],
      }),
    ],
  });
  const panel = await openDocs(page);
  await panel.getByLabel('Governed reason').fill('Release the selected completed matter');
  const releaseButtons = panel.getByRole('button', { name: /Release legal hold placed/ });
  await expect(releaseButtons).toHaveCount(2);
  await releaseButtons.first().click();
  await expect
    .poll(
      () =>
        fixture.requests.find(
          request => request.body?.commandType === 'studio.legal_hold.release',
        )?.body?.payload?.holdId,
    )
    .toBe(HOLD_ONE);
  await expect(panel.getByRole('button', { name: /Release legal hold placed/ })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Request deletion' })).toBeDisabled();
});

test('recovery states remain explicit and never imply availability', async ({ page }) => {
  await installFixture(page, {
    renditions: [
      rendition('pdf', {
        state: 'reconciliation_required',
        mimeType: null,
        filename: null,
        byteLength: null,
        sha256: null,
        retentionMode: null,
        retentionUntil: null,
      }),
    ],
  });
  const panel = await openDocs(page);
  const card = panel.getByTestId('rendition-pdf');
  await expect(card).toContainText('Generation reconciliation required');
  await expect(card).not.toContainText(/^Available$/);
  await expect(card).toContainText('Pending availability snapshot');
});

test('deletion recovery is distinct from physical deletion completion', async ({ page }) => {
  await installFixture(page, {
    renditions: [
      rendition('docx', {
        state: 'deletion_reconciling',
        deletion: {
          requestId: RECEIPT,
          state: 'approved',
          requesterIsCurrentActor: false,
        },
      }),
    ],
  });
  const panel = await openDocs(page);
  const card = panel.getByTestId('rendition-docx');
  await expect(card).toContainText('Reconciling deletion');
  await expect(card).not.toContainText(/^Deleted$/);
  await expect(card.getByRole('button', { name: 'Download DOCX' })).toHaveCount(0);
});

test('deletion requester cannot approve own request', async ({ page }) => {
  await installFixture(page, {
    renditions: [
      rendition('pdf', {
        state: 'deletion_requested',
        deletion: {
          requestId: RECEIPT,
          state: 'pending',
          requesterIsCurrentActor: true,
        },
      }),
    ],
  });
  const panel = await openDocs(page);
  await panel.getByLabel('Governed reason').fill('Independent decision required');
  await expect(panel.getByRole('button', { name: 'Approve deletion' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Reject deletion' })).toBeDisabled();
});

test('physical deletion failure is never rendered as deleted', async ({ page }) => {
  await installFixture(page, {
    deletionFailure: true,
    renditions: [
      rendition('pdf', {
        state: 'deletion_requested',
        deletion: {
          requestId: RECEIPT,
          state: 'pending',
          requesterIsCurrentActor: false,
        },
      }),
    ],
  });
  const panel = await openDocs(page);
  await panel.getByLabel('Governed reason').fill('Independent approval');
  await panel.getByRole('button', { name: 'Approve deletion' }).click();
  await expect(panel.getByTestId('rendition-pdf')).toContainText('Deletion failed');
  await expect(panel.getByTestId('rendition-pdf')).not.toContainText(/^Deleted$/);
  await expect(panel.getByRole('status')).toContainText('No success state was recorded');
});

test('committed but reload failed blocks every further mutation', async ({ page }) => {
  await installFixture(page, { reloadFailure: true });
  const panel = await openDocs(page);
  await panel.getByRole('button', { name: 'Generate Markdown' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'Command committed',
  );
  await expect(
    panel.getByRole('button', { name: 'Reload explicitly committed rendition state' }),
  ).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
});

test('offline state is explicit and blocks private mutations', async ({ page, context }) => {
  await installFixture(page, { renditions: [rendition('pdf')] });
  const panel = await openDocs(page);
  await context.setOffline(true);
  await panel.getByLabel('Governed reason').fill('Offline rerender');
  await expect(panel.getByRole('alert')).toContainText('Offline');
  await expect(panel.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Request deletion' })).toBeDisabled();
  await context.setOffline(false);
});

test('stale authorization is explicit and fail closed', async ({ page }) => {
  await installFixture(page, { commandFailure: 'AUTHORITY_STALE' });
  const panel = await openDocs(page);
  await panel.getByRole('button', { name: 'Generate DOCX' }).click();
  await expect(panel.getByRole('status')).toContainText('Authorization is stale or revoked');
  await expect(panel.getByRole('button', { name: 'Generate PDF' })).toBeDisabled();
});

test('keyboard navigation preserves visible actionable focus', async ({ page }) => {
  await installFixture(page);
  const panel = await openDocs(page);
  await panel.getByRole('button', { name: 'Generate Markdown' }).focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  expect(await page.evaluate(() => document.activeElement === null)).toBeFalsy();
});

test('private rendition workspace has no serious or critical axe findings', async ({ page }) => {
  await installFixture(page, {
    renditions: [rendition('markdown'), rendition('pdf'), rendition('docx')],
  });
  await openDocs(page);
  const results = await new AxeBuilder({ page })
    .include('[data-testid="studio-artifact-renditions"]')
    .analyze();
  expect(
    results.violations.filter(
      violation => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);
});

test('responsive private rendition route has at most one pixel overflow', async ({ page }) => {
  await installFixture(page, {
    renditions: [rendition('markdown'), rendition('pdf'), rendition('docx')],
  });
  await openDocs(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test('legacy document records are never promoted as canonical private artifacts', async ({ page }) => {
  await installFixture(page, { renditions: [rendition('pdf')] });
  const panel = await openDocs(page);
  await expect(panel).toContainText('Legacy document cards remain non-canonical.');
  await expect(page.getByTestId('studio-application-route')).not.toContainText(
    'document_generations',
  );
  await expect(page.getByTestId('studio-application-route')).not.toContainText(
    'public sharing',
  );
});
