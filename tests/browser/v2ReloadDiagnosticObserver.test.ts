import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from '@playwright/test';
import {
  V2_RELOAD_READ_STAGES,
  aggregateV2ReloadReadStageResults,
  assertV2ReloadCheckpointResponse,
  classifyV2ReloadRenderOutcome,
  createV2ReloadBrowserCheckpointBuilder,
  createV2ReloadReadAccumulator,
  resolveAuthenticatedAcceptanceMode,
  type V2ReloadReadStage,
} from './v2ReloadDiagnosticObserver';

const passed = (stage: V2ReloadReadStage, rowCount = 0) => ({
  stage,
  status: 'passed' as const,
  httpStatus: 200,
  rowCount,
});

const beginAndRecord = (
  accumulator: ReturnType<typeof createV2ReloadReadAccumulator>,
  stage: V2ReloadReadStage,
  rowCount = 0,
) => {
  accumulator.begin(stage);
  accumulator.record(passed(stage, rowCount));
};

test('mode remains full by default and accepts only the two exact values', () => {
  assert.equal(resolveAuthenticatedAcceptanceMode(undefined), 'full_acceptance');
  assert.equal(resolveAuthenticatedAcceptanceMode('full_acceptance'), 'full_acceptance');
  assert.equal(resolveAuthenticatedAcceptanceMode('v2_primary_prefix_diagnostic'), 'v2_primary_prefix_diagnostic');
  for (const candidate of ['', ' full_acceptance', 'V2_PRIMARY_PREFIX_DIAGNOSTIC', 'diagnostic']) {
    assert.throws(() => resolveAuthenticatedAcceptanceMode(candidate), /AUTHENTICATED_V2_RELOAD_MODE_REJECTED/u);
  }
});

test('permuted completed reads serialize in the one canonical order', () => {
  const accumulator = createV2ReloadReadAccumulator();
  for (const stage of V2_RELOAD_READ_STAGES) accumulator.begin(stage);
  const counts = new Map<V2ReloadReadStage, number>([
    ['case-discovery', 1], ['case', 1], ['decision', 0], ['draft-head', 1],
  ]);
  for (const stage of [...V2_RELOAD_READ_STAGES].reverse()) {
    accumulator.record(passed(stage, counts.get(stage) ?? 0));
  }
  assert.deepEqual(accumulator.snapshot().map(row => row.stage), [...V2_RELOAD_READ_STAGES]);
});

test('concurrent child outcomes retain canonical order without inventing a serial suffix', () => {
  const accumulator = createV2ReloadReadAccumulator();
  beginAndRecord(accumulator, 'case-discovery', 1);
  beginAndRecord(accumulator, 'case', 1);
  beginAndRecord(accumulator, 'decision', 0);
  beginAndRecord(accumulator, 'draft-head', 1);
  beginAndRecord(accumulator, 'edges');
  const rows = accumulator.snapshot();
  assert.equal(rows.find(row => row.stage === 'primitives')?.status, 'not_reached');
  assert.equal(rows.find(row => row.stage === 'edges')?.status, 'passed');
});

test('request failures are distinct from stages that were never reached', () => {
  const accumulator = createV2ReloadReadAccumulator();
  beginAndRecord(accumulator, 'case-discovery', 1);
  accumulator.begin('case');
  accumulator.record({ stage: 'case', status: 'failed', httpStatus: null, rowCount: null });
  const rows = accumulator.snapshot();
  assert.equal(rows[1].status, 'failed');
  assert.equal(rows[2].status, 'not_reached');
  assert.equal(rows[2].httpStatus, null);
});

test('successful HTTP with empty required singleton is retained as failed evidence', () => {
  const accumulator = createV2ReloadReadAccumulator();
  accumulator.begin('case-discovery');
  accumulator.record({ stage: 'case-discovery', status: 'failed', httpStatus: 200, rowCount: 0 });
  assert.deepEqual(accumulator.snapshot()[0], {
    stage: 'case-discovery', status: 'failed', httpStatus: 200, rowCount: 0,
  });
});

test('a repeated read retains failure even when another response succeeded', () => {
  assert.deepEqual(aggregateV2ReloadReadStageResults('case', [
    passed('case', 1),
    { stage: 'case', status: 'failed', httpStatus: 503, rowCount: 0 },
  ], 2), { stage: 'case', status: 'failed', httpStatus: 503, rowCount: 0 });
  assert.deepEqual(aggregateV2ReloadReadStageResults('case', [passed('case', 1)], 2), {
    stage: 'case', status: 'failed', httpStatus: null, rowCount: null,
  });
});

test('unknown, duplicate, extra-field and impossible read evidence fail closed', () => {
  const accumulator = createV2ReloadReadAccumulator();
  assert.throws(() => accumulator.begin('unknown' as V2ReloadReadStage), /READ_STAGE_UNKNOWN/u);
  accumulator.begin('case-discovery');
  assert.throws(() => accumulator.begin('case-discovery'), /READ_STAGE_DUPLICATE/u);
  assert.throws(() => accumulator.record({ ...passed('case-discovery', 1), url: 'https://forbidden.example' }), /READ_STAGE_SHAPE_REJECTED/u);
  assert.throws(() => accumulator.record(passed('case-discovery', 2)), /READ_STAGE_CARDINALITY_REJECTED/u);
  accumulator.record(passed('case-discovery', 1));
  assert.throws(() => accumulator.record(passed('case-discovery', 1)), /READ_STAGE_DUPLICATE_RESULT/u);

  const serialGap = createV2ReloadReadAccumulator();
  beginAndRecord(serialGap, 'case', 1);
  assert.throws(() => serialGap.snapshot(), /READ_STAGE_SERIAL_ORDER_REJECTED/u);

  const childBeforeHead = createV2ReloadReadAccumulator();
  beginAndRecord(childBeforeHead, 'case-discovery', 1);
  beginAndRecord(childBeforeHead, 'case', 1);
  beginAndRecord(childBeforeHead, 'decision', 0);
  beginAndRecord(childBeforeHead, 'primitives');
  assert.throws(() => childBeforeHead.snapshot(), /READ_STAGE_CHILD_ORDER_REJECTED/u);

  const failedHeadWithReachedChild = createV2ReloadReadAccumulator();
  beginAndRecord(failedHeadWithReachedChild, 'case-discovery', 1);
  beginAndRecord(failedHeadWithReachedChild, 'case', 1);
  beginAndRecord(failedHeadWithReachedChild, 'decision', 0);
  failedHeadWithReachedChild.begin('draft-head');
  failedHeadWithReachedChild.record({ stage: 'draft-head', status: 'failed', httpStatus: 503, rowCount: 0 });
  beginAndRecord(failedHeadWithReachedChild, 'primitives');
  assert.equal(failedHeadWithReachedChild.snapshot().find(row => row.stage === 'primitives')?.status, 'passed');
});

test('render classification distinguishes resume, workspace failure and public session loss', () => {
  assert.equal(classifyV2ReloadRenderOutcome({ resumed: true, workspaceError: false, publicScreen: false }), 'resumed');
  assert.equal(classifyV2ReloadRenderOutcome({ resumed: false, workspaceError: true, publicScreen: false }), 'workspace_error');
  assert.equal(classifyV2ReloadRenderOutcome({ resumed: false, workspaceError: false, publicScreen: true }), 'public_screen');
  assert.equal(classifyV2ReloadRenderOutcome({ resumed: false, workspaceError: false, publicScreen: false }), 'unresolved');
  assert.throws(() => classifyV2ReloadRenderOutcome({ resumed: true, workspaceError: true, publicScreen: false }), /RENDER_AMBIGUOUS/u);
  assert.throws(() => classifyV2ReloadRenderOutcome({ resumed: true, workspaceError: false, publicScreen: false, message: 'raw' }), /RENDER_SHAPE_REJECTED/u);
});

test('checkpoint builder retains transient authority only at the top and compares exact navigation continuity', async () => {
  const processId = '40000000-0000-4000-8000-000000000001';
  const raw = (token: string | null, id = processId) => ({
    accessToken: token,
    search: `?view=process_detail&scope=my_work&processId=${id}`,
    persistedView: 'process_detail',
    persistedScope: { type: 'my_work' },
  });
  const values = [raw('private-token'), raw('private-token'), raw('private-token')];
  const page = {
    evaluate: async () => values.shift(),
    getByText: () => ({ isVisible: async () => true }),
  } as unknown as Page;
  const builder = createV2ReloadBrowserCheckpointBuilder(page, { projectName: 'desktop-chromium', persona: 'author' });
  const before = await builder.checkpoint('before-create');
  await builder.checkpoint('before-reload');
  const after = await builder.checkpoint('after-reload', {
    readObservation: { serverContextObserved: true, readStages: V2_RELOAD_READ_STAGES.map(stage => ({
      stage,
      status: 'passed' as const,
      httpStatus: 200,
      rowCount: ['case-discovery', 'case', 'draft-head'].includes(stage) ? 1 : 0,
    })) },
    renderOutcome: 'resumed',
  });
  assert.equal(before.accessToken, 'private-token');
  assert.equal(before.browser.serverContextObserved, true);
  assert.deepEqual(Object.keys(before.browser).sort(), [
    'failureRendered', 'readStages', 'resumedDraftRendered', 'selectedProcessObserved',
    'selectedScopeObserved', 'serverContextObserved', 'sessionObserved',
  ].sort());
  assert.equal(after.browser.selectedScopeObserved, true);
  assert.equal(after.browser.selectedProcessObserved, true);
  assert.equal(after.browser.serverContextObserved, true);
  assert.equal(after.browser.resumedDraftRendered, true);
  assert.equal(JSON.stringify(after.browser).includes(processId), false);
  assert.equal(JSON.stringify(after.browser).includes('private-token'), false);
});

test('checkpoint continuity becomes false without exposing a changed process or missing session', async () => {
  const original = '40000000-0000-4000-8000-000000000001';
  const changed = '40000000-0000-4000-8000-000000000002';
  const raw = (token: string | null, processId: string) => ({
    accessToken: token,
    search: `?view=process_detail&scope=my_work&processId=${processId}`,
    persistedView: 'process_detail',
    persistedScope: { type: 'my_work' },
  });
  const values = [raw('private-token', original), raw('private-token', original), raw(null, changed)];
  const page = {
    evaluate: async () => values.shift(),
    getByText: () => ({ isVisible: async () => true }),
  } as unknown as Page;
  const builder = createV2ReloadBrowserCheckpointBuilder(page, { projectName: 'desktop-chromium', persona: 'author' });
  await builder.checkpoint('before-create');
  await builder.checkpoint('before-reload');
  const after = await builder.checkpoint('after-reload', {
    readObservation: {
      serverContextObserved: false,
      readStages: V2_RELOAD_READ_STAGES.map(stage => ({
        stage, status: 'not_reached' as const, httpStatus: null, rowCount: null,
      })),
    },
    renderOutcome: 'public_screen',
  });
  assert.equal(after.browser.sessionObserved, false);
  assert.equal(after.browser.selectedProcessObserved, false);
  assert.equal(after.browser.failureRendered, true);
  assert.equal(JSON.stringify(after.browser).includes(changed), false);
});

test('checkpoint response accepts only the exact safe response contract', () => {
  const response = { recorded: true, phase: 'after-reload', sessionContinuity: 'verified', continue: false };
  assert.deepEqual(assertV2ReloadCheckpointResponse(response, 'after-reload'), response);
  assert.throws(() => assertV2ReloadCheckpointResponse({ ...response, continue: true }, 'after-reload'), /CHECKPOINT_RESPONSE_VALUE_REJECTED/u);
  assert.throws(() => assertV2ReloadCheckpointResponse({ ...response, token: 'forbidden' }, 'after-reload'), /CHECKPOINT_RESPONSE_SHAPE_REJECTED/u);
});

test('the diagnostic tag reuses the original primary prefix and exits before later authoring', () => {
  const source = readFileSync('tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts', 'utf8');
  assert.equal(source.match(/\{ tag: '@v2-primary-prefix-diagnostic' \}/gu)?.length, 1);
  assert.match(source, /test\('authors, replays, rejects stale work, requests changes and resubmits through the production UI',\s*\{ tag: '@v2-primary-prefix-diagnostic' \}/u);
  const v1 = source.indexOf('runV1AssessmentCompletion');
  const beforeCreate = source.indexOf("checkpoint('before-create'", v1);
  const create = source.indexOf("name: 'New assessment (V2)'", beforeCreate);
  const beforeReload = source.indexOf("checkpoint('before-reload'", create);
  const observer = source.indexOf('installV2ReloadReadObserver(page)', beforeReload);
  const reload = source.indexOf("page.reload({ waitUntil: 'domcontentloaded' })", observer);
  const afterReload = source.indexOf("checkpoint('after-reload'", reload);
  const trackerDrain = source.indexOf('await activeTestWorkQueues.network.drain()', reload);
  assert.ok(reload < trackerDrain && trackerDrain < afterReload);
  assert.ok(source.indexOf('if (trackerFailure) throw trackerFailure;', afterReload) > afterReload);
  const diagnosticExit = source.indexOf('diagnosticPrefixComplete = true', afterReload);
  const laterAuthoring = source.indexOf("name: 'Add minimum working structure'", diagnosticExit);
  assert.ok(v1 >= 0 && v1 < beforeCreate && beforeCreate < create && create < beforeReload
    && beforeReload < observer && observer < reload && reload < afterReload
    && afterReload < diagnosticExit && diagnosticExit < laterAuthoring);
  assert.match(source, /if \(diagnosticPrefixComplete\) return;/u);
  assert.match(source, /if \(v2PrimaryPrefixDiagnostic\) \{[\s\S]*?return;[\s\S]*?Add minimum working structure/u);
  assert.match(source, /if \(v2PrimaryPrefixDiagnostic\) \{[\s\S]*?if \(hasBoundaryFailure\) throw boundaryFailure;[\s\S]*?return;[\s\S]*?finalize-project/u);
});
