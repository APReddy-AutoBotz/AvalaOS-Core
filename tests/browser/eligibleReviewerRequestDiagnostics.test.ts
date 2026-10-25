import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page, Request } from '@playwright/test';
import { createEligibleReviewerRequestDiagnostics } from './eligibleReviewerRequestDiagnostics';

const origin = 'http://127.0.0.1:54321';
const fakePage = () => ({}) as Page;
const fakeRequest = (page: Page, route: 'queue' | 'workspace' | 'eligible', method = 'POST') => ({
  method: () => method,
  url: () => `${origin}/rest/v1/rpc/assess_v2_${route === 'eligible' ? 'eligible_reviewers' : `review_${route}`}`,
  frame: () => ({ page: () => page }),
}) as unknown as Request;

test('collector records bounded pending, incomplete, empty, success and failed states without payload data', () => {
  let now = 10;
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => now });
  const handle = collector.beginSelection(page);
  const queue = fakeRequest(page, 'queue'), workspace = fakeRequest(page, 'workspace'), eligible = fakeRequest(page, 'eligible');
  collector.onRequest(queue); collector.onResponse(queue, 200);
  collector.onRequest(workspace); collector.onResponse(workspace, 200); collector.onResponseBody(workspace, []);
  collector.onRequest(eligible); collector.onResponse(eligible, 200);
  collector.onResponseBody(eligible, [{ actorId: 'private', label: 'private', authorizationVersion: 1 }]);
  now = 20_050;
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'selector-visible' });
  assert.ok(value);
  assert.equal(value.elapsedMs, 15_000); assert.equal(value.elapsedSaturated, true);
  assert.deepEqual(value.requests.map(item => item.outcome), ['incomplete', 'incomplete', 'success']);
  assert.equal(value.candidateCount, 1);
  assert.deepEqual(value.requests.map(item => item.firstRequestOrdinal), [1, 2, 3]);
  assert.equal(JSON.stringify(value).includes('127.0.0.1'), false);
  assert.equal(JSON.stringify(value).includes('actor'), false);
});

test('collector retains pending and transport/http failure while ignoring stale page selections', () => {
  let now = 0;
  const page = fakePage(), otherPage = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => now });
  const stale = collector.beginSelection(page);
  const staleRequest = fakeRequest(page, 'queue'); collector.onRequest(staleRequest);
  const current = collector.beginSelection(page);
  collector.onResponse(staleRequest, 200);
  const queue = fakeRequest(page, 'queue'), workspace = fakeRequest(page, 'workspace');
  collector.onRequest(queue); collector.onRequest(workspace); collector.onResponse(workspace, 503);
  const ignored = fakeRequest(otherPage, 'eligible'); collector.onRequest(ignored);
  now = 101;
  const value = collector.freeze(current, 'pixel-7-chromium', { workspace: 'unknown', candidates: 'failed' });
  assert.ok(value);
  assert.equal(collector.freeze(stale, 'pixel-7-chromium', { workspace: 'unknown', candidates: 'unknown' }), null);
  assert.equal(value.requests[0].outcome, 'pending');
  assert.equal(value.requests[1].outcome, 'failed');
  assert.equal(value.requests[1].statusClass, 'server-error');
  assert.equal(value.requests[2].state, 'not-observed');
  assert.equal(value.decisionBinding, 'unavailable');
});

test('collector classifies a transport failure without allowing post-freeze mutation', () => {
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => 5 });
  const handle = collector.beginSelection(page), request = fakeRequest(page, 'eligible');
  collector.onRequest(request); collector.onRequestFailed(request);
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'loading', candidates: 'loading' });
  assert.ok(value); assert.equal(value.requests[2].state, 'transport-failed');
  collector.onResponse(request, 200); collector.onResponseBody(request, [{}]);
  assert.equal(value.requests[2].outcome, 'failed');
});

test('collector clears prior candidate count and marks a repeated eligible refetch as ambiguous', () => {
  let now = 0;
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => now });
  const handle = collector.beginSelection(page);
  const first = fakeRequest(page, 'eligible');
  collector.onRequest(first); collector.onRequest(first); collector.onResponse(first, 200);
  collector.onResponseBody(first, [{ actorId: 'private', label: 'private', authorizationVersion: 1 }]);
  const second = fakeRequest(page, 'eligible');
  collector.onRequest(second);
  collector.onResponseBody(first, []);
  now = 15_001;
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'loading' });
  assert.ok(value); assert.equal(value.correlation, 'ambiguous');
  assert.equal(value.candidateCount, null); assert.equal(value.requests[2].requestCount, 2);
  assert.equal(value.requests[2].pendingCount, 1); assert.equal(value.requests[2].elapsedMs, 15_000);
  assert.equal(JSON.stringify(value).includes('private'), false);
});

test('collector lets a transport failure after response headers replace incomplete status once', () => {
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => 2 });
  const handle = collector.beginSelection(page), request = fakeRequest(page, 'eligible');
  collector.onRequest(request); collector.onResponse(request, 200); collector.onRequestFailed(request);
  collector.onRequestFailed(request); collector.onResponseBody(request, []);
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'failed' });
  assert.ok(value); assert.equal(value.requests[2].state, 'transport-failed');
  assert.equal(value.requests[2].responseCount, 1); assert.equal(value.requests[2].outcome, 'failed');
});

test('latest eligible success cannot publish candidates while an older repeated request remains pending', () => {
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => 15_000 });
  const handle = collector.beginSelection(page), older = fakeRequest(page, 'eligible'), latest = fakeRequest(page, 'eligible');
  collector.onRequest(older); collector.onRequest(latest); collector.onResponse(latest, 200);
  collector.onResponseBody(latest, [{ actorId: 'private', label: 'private', authorizationVersion: 1 }]);
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'loading' });
  assert.ok(value); assert.equal(value.correlation, 'ambiguous'); assert.equal(value.candidateCount, null);
  assert.equal(value.requests[2].state, 'pending'); assert.equal(value.requests[2].lastHttpStatus, null);
});

test('older repeated completion cannot overwrite the latest eligible terminal outcome', () => {
  let now = 1;
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => now });
  const handle = collector.beginSelection(page), older = fakeRequest(page, 'eligible'), latest = fakeRequest(page, 'eligible');
  collector.onRequest(older); collector.onRequest(latest); collector.onResponse(latest, 200);
  collector.onResponseBody(latest, [{ actorId: 'private', label: 'private', authorizationVersion: 1 }]);
  now = 2; collector.onResponse(older, 503);
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'selector-visible' });
  assert.ok(value); assert.equal(value.correlation, 'ambiguous'); assert.equal(value.candidateCount, null);
  assert.equal(value.requests[2].state, 'settled'); assert.equal(value.requests[2].lastHttpStatus, 200);
  assert.equal(value.requests[2].outcome, 'success');
});

test('oversized eligible arrays are count-saturated and ambiguous without row traversal claims', () => {
  const page = fakePage();
  const collector = createEligibleReviewerRequestDiagnostics({ backendOrigin: origin, now: () => 3 });
  const handle = collector.beginSelection(page), request = fakeRequest(page, 'eligible');
  collector.onRequest(request); collector.onResponse(request, 200);
  collector.onResponseBody(request, Array.from({ length: 100 }, () => null));
  const value = collector.freeze(handle, 'desktop-chromium', { workspace: 'visible', candidates: 'unknown' });
  assert.ok(value); assert.equal(value.correlation, 'ambiguous');
  assert.equal(value.candidateCount, 99); assert.equal(value.candidateCountSaturated, true);
  assert.equal(value.requests[2].outcome, 'incomplete');
});
