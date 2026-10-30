import assert from 'node:assert/strict';
import { expect, test, type Request } from '@playwright/test';

import { attestSubmittedEvidence } from './evidenceAttestation';

const pageHtml = `<!doctype html><html><body>
  <main data-testid="assess-v2-review-workspace">
    <p id="message">Evidence attestation committed: Evidence accepted.</p>
    <div id="evidence"></div>
  </main>
  <script>
    const pending = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const accepted = [];
    const render = () => {
      document.querySelector('#evidence').innerHTML = [
        ...accepted.map(id => '<article><h5>Evidence accepted</h5><p>Evidence '+id+'</p></article>'),
        ...pending.map(id => '<article data-evidence-id="'+id+'"><p>Evidence '+id+'</p>'+
          '<label>Reviewer rationale<textarea></textarea></label><button>Accept evidence</button></article>'),
      ].join('');
      document.querySelectorAll('button').forEach(button => button.addEventListener('click', async event => {
        const article = event.currentTarget.closest('article');
        const evidenceId = article.dataset.evidenceId;
        const response = await fetch('/functions/v1/assess-v2-command', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ commandType: 'assessment_v2.evidence.attest',
            payload: { evidenceId, outcome: 'accepted' } }),
        });
        await response.json();
        setTimeout(() => {
          const index = pending.indexOf(evidenceId);
          if (index >= 0) { pending.splice(index, 1); accepted.push(evidenceId); render(); }
        }, 150);
      }));
    };
    render();
  </script>
</body></html>`;

test('attestation waits for each committed projection before selecting the next evidence item', async ({ page }) => {
  const dispatchedRequests: Request[] = [];
  const referencedRequests: Request[] = [];
  const requests: Array<Readonly<{
    method: string;
    commandType: unknown;
    outcome: unknown;
    evidenceId: string;
  }>> = [];
  await page.route('https://app.example.test/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === '/functions/v1/assess-v2-command') {
      dispatchedRequests.push(request);
      const body = request.postDataJSON() as {
        commandType?: unknown;
        payload?: { evidenceId?: unknown; outcome?: unknown };
      };
      requests.push({
        method: request.method(),
        commandType: body.commandType,
        outcome: body.payload?.outcome,
        evidenceId: String(body.payload?.evidenceId ?? ''),
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"accepted"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
  });
  await page.goto('https://app.example.test/');
  const observations = await attestSubmittedEvidence(page, 'Independent evidence review.', request => {
    referencedRequests.push(request);
    return `action-${referencedRequests.length}`;
  }, 2);
  expect(observations.map(item => item.evidenceId)).toEqual([
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  ]);
  expect(requests.map(item => item.evidenceId)).toEqual(observations.map(item => item.evidenceId));
  expect(requests.map(item => [item.method, item.commandType, item.outcome])).toEqual([
    ['POST', 'assessment_v2.evidence.attest', 'accepted'],
    ['POST', 'assessment_v2.evidence.attest', 'accepted'],
  ]);
  expect(observations.map(item => item.actionId)).toEqual(['action-1', 'action-2']);
  expect(referencedRequests).toHaveLength(2);
  expect(referencedRequests[0]).toBe(dispatchedRequests[0]);
  expect(referencedRequests[1]).toBe(dispatchedRequests[1]);
  await expect(page.getByRole('button', { name: 'Accept evidence', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Evidence accepted', exact: true })).toHaveCount(2);
});

test('attestation limit one leaves the next committed item pending', async ({ page }) => {
  await page.route('https://app.example.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/functions/v1/assess-v2-command') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"accepted"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
  });
  await page.goto('https://app.example.test/');
  const observations = await attestSubmittedEvidence(page, 'Independent evidence review.', request => request.url(), 1);
  expect(observations).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Accept evidence', exact: true })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Evidence accepted', exact: true })).toHaveCount(1);
});

test('attestation ignores a wrong command response and fails closed', async ({ page }) => {
  const wrongCommandHtml = pageHtml.replace(
    "commandType: 'assessment_v2.evidence.attest'",
    "commandType: 'assessment_v2.review.resolve'",
  ).replace(
    "if (index >= 0) { pending.splice(index, 1); accepted.push(evidenceId); render(); }",
    'void index;',
  );
  await page.route('https://app.example.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/functions/v1/assess-v2-command') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"resolved"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: wrongCommandHtml });
  });
  await page.goto('https://app.example.test/');
  await assert.rejects(attestSubmittedEvidence(
    page, 'Independent evidence review.', request => request.url(), 1, 250,
  ), /Timeout 250ms exceeded/u);
  await expect(page.getByRole('button', { name: 'Accept evidence', exact: true })).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Evidence accepted', exact: true })).toHaveCount(0);
});

for (const status of [401, 409] as const) {
  test(`attestation rejects an exact command response with HTTP ${status}`, async ({ page }) => {
    await page.route('https://app.example.test/**', async route => {
      if (new URL(route.request().url()).pathname === '/functions/v1/assess-v2-command') {
        await route.fulfill({ status, contentType: 'application/json', body: '{"status":"rejected"}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml });
    });
    await page.goto('https://app.example.test/');
    await assert.rejects(attestSubmittedEvidence(
      page, 'Independent evidence review.', request => request.url(), 1,
    ), error => {
      const matcherResult = (error as {
        matcherResult?: { actual?: unknown; expected?: unknown };
      }).matcherResult;
      return matcherResult?.actual === status && matcherResult.expected === 200;
    });
  });
}

test('attestation rejects a repeated evidence UUID before recording a second observation', async ({ page }) => {
  const duplicateEvidenceHtml = pageHtml.replace(
    'payload: { evidenceId, outcome:',
    "payload: { evidenceId: '11111111-1111-4111-8111-111111111111', outcome:",
  );
  const requestedEvidenceIds: string[] = [];
  await page.route('https://app.example.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/functions/v1/assess-v2-command') {
      const body = route.request().postDataJSON() as { payload?: { evidenceId?: unknown } };
      requestedEvidenceIds.push(String(body.payload?.evidenceId ?? ''));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"accepted"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: duplicateEvidenceHtml });
  });
  await page.goto('https://app.example.test/');
  await assert.rejects(attestSubmittedEvidence(
    page, 'Independent evidence review.', request => request.url(), 2,
  ), /ENTERPRISE_LIFECYCLE_EVIDENCE_ATTESTATION_BINDING_REJECTED/u);
  expect(requestedEvidenceIds).toEqual([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
  ]);
});

test('attestation fails closed at the unchanged bound when committed projection does not advance', async ({ page }) => {
  test.setTimeout(25_000);
  const stalledProjectionHtml = pageHtml.replace(
    "if (index >= 0) { pending.splice(index, 1); accepted.push(evidenceId); render(); }",
    'void index;',
  );
  await page.route('https://app.example.test/**', async route => {
    if (new URL(route.request().url()).pathname === '/functions/v1/assess-v2-command') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"accepted"}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: stalledProjectionHtml });
  });
  await page.goto('https://app.example.test/');
  const startedAt = Date.now();
  await assert.rejects(attestSubmittedEvidence(
    page, 'Independent evidence review.', request => request.url(), 1,
  ), error => error instanceof Error && error.message.includes('toHaveCount')
    && error.message.includes('15000ms') && error.message.includes('Received:'));
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeGreaterThanOrEqual(14_500);
  expect(elapsedMs).toBeLessThan(20_000);
  await expect(page.getByRole('button', { name: 'Accept evidence', exact: true })).toHaveCount(2);
});
