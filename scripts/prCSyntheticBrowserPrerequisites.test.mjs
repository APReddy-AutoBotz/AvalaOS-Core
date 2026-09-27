import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SYNTHETIC_PREREQUISITE_STATE_KEYS as K,
  decodeSyntheticCommandSuccess,
  readSyntheticDeliveryPackage,
  readSyntheticDeliveryWorkspace,
  readSyntheticStudioArtifact,
  runSyntheticPrerequisites,
  syntheticCommandResourceId,
} from './prCSyntheticBrowserPrerequisites.mjs';

const uid = number => `40000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const ORG = uid(1); const WORKSPACE = uid(2);
const PERSONAS = ['requester', 'studio_reviewer', 'delivery_target_acceptor', 'delivery_approver', 'delivery_consumer', 'delivery_author', 'delivery_reviewer'];

const makeItem = index => ({
  aggregateId: uid(10_000 + index), currentVersionId: uid(20_000 + index), aggregateVersion: 1, version: 1,
  status: 'proposed', type: 'task', title: `Synthetic item ${index}`, description: 'Bounded synthetic item.',
  acceptanceCriteria: ['Reviewed.'], nonFunctionalRequirements: [], history: [], diffs: [], actions: ['delivery.item.review'],
});

const makePackage = ({ id = uid(100), count = 2, sourceMode = 'manual', lineageClassification = 'not_assessed', planningOnly = true } = {}) => ({
  id, currentVersionId: uid(Number(id.slice(-6)) + 1_000), currentVersion: 1, aggregateVersion: 1, status: 'draft', label: 'Synthetic package',
  sourcePackage: { version: 1, sourceMode, lineageClassification, planningOnly }, items: Array.from({ length: count }, (_, index) => makeItem(index + Number(id.slice(-4)))),
  reviewState: 'not_requested', approvalState: 'not_requested', blockers: [], blockerCount: 0, actions: ['delivery.item.review', 'delivery.package.review.resolve'],
});

const makeHarness = ({ packages = [], handoffs = [], studio, rejectAction = '', staleStudio = false } = {}) => {
  const calls = []; const baselines = []; let receipt = 80_000;
  const contextByPersona = Object.fromEntries(PERSONAS.map((persona, index) => [persona, {
    userId: uid(1_000 + index), organizationId: ORG, workspaceId: WORKSPACE, authorizationVersion: 1, capabilities: [],
  }]));
  const itemProjection = item => ({ ...item, actions: item.status === 'accepted' ? [] : ['delivery.item.review'] });
  const packageProjection = (pkg, cursor, limit = 100) => {
    const ordered = [...pkg.items].sort((left, right) => left.aggregateVersion - right.aggregateVersion || left.aggregateId.localeCompare(right.aggregateId));
    let start = 0;
    if (cursor) start = ordered.findIndex(item => item.aggregateVersion > cursor.version || (item.aggregateVersion === cursor.version && item.aggregateId > cursor.id));
    if (start < 0) start = ordered.length;
    const selected = ordered.slice(start, start + limit); const hasMore = start + selected.length < ordered.length;
    const last = selected.at(-1);
    return {
      ...pkg, items: selected.map(itemProjection), acceptedItemCount: pkg.items.filter(item => item.status === 'accepted').length,
      itemPage: { limit, hasMore, cursorApplied: Boolean(cursor), isComplete: !cursor && !hasMore,
        ...(hasMore ? { nextCursor: { version: last.aggregateVersion, id: last.aggregateId } } : {}) },
    };
  };
  const workspace = body => ({
    organizationId: ORG, workspaceId: WORKSPACE, inbox: [], outbox: handoffs.map(value => ({ ...value })),
    packages: body.deliveryItemPage
      ? [packageProjection(packages.find(pkg => pkg.id === body.deliveryItemPage.packageId), body.deliveryItemPage.cursor, body.deliveryItemPage.limit)]
      : packages.map(pkg => packageProjection(pkg)),
  });
  const makeApi = persona => ({
    context: async () => ({ ...contextByPersona[persona] }),
    rpc: async (name, args) => {
      calls.push({ persona, kind: 'rpc', name });
      assert.equal(name, 'studio_artifact_projection_v2'); assert.equal(args.p_org, ORG); assert.equal(args.p_workspace, WORKSPACE);
      return structuredClone(studio);
    },
    invoke: async (name, body, expectation) => {
      if (name === 'enterprise-intelligence-query') return { projection: { deliveryWorkspace: workspace(body), monitorApprovedBaselines: {
        organizationId: ORG, workspaceId: WORKSPACE, baselines: baselines.map(value => ({ ...value })),
      } } };
      const action = body.commandType; calls.push({ persona, kind: 'command', action, expectation, body });
      if (action === rejectAction) throw new Error('PERMISSION_DENIED');
      const result = { ok: true, outcome: 'committed', receiptId: uid(receipt++), action };
      if (name === 'studio-artifact-command') {
        if (staleStudio || body.expectedAggregateVersion !== studio.aggregateVersion || body.expectedArtifactVersion !== studio.currentVersion.version) throw new Error('RESOURCE_STALE');
        assert.equal(body.payload.artifactId, studio.id);
        if (action === 'studio.artifact.review.assign') studio.review = { reviewerId: body.payload.reviewerId, outcome: null };
        if (action === 'studio.artifact.review.resolve') studio.review = { reviewerId: contextByPersona[persona].userId, outcome: 'approved' };
        return { ...result, resourceId: studio.id, resource: {} };
      }
      if (action === 'delivery.handoff.request') {
        const handoff = { id: uid(40_000 + handoffs.length), version: 1, status: 'requested', lineageClassification: 'not_assessed', planningOnly: true,
          preview: { artifactType: 'pdd', proposedItemCount: 2 }, history: [], reviewHistory: [], approvalHistory: [], targetItems: [] };
        handoffs.push(handoff); return { ...result, resourceId: handoff.id, resourceVersion: 1 };
      }
      if (action.startsWith('delivery.handoff.')) {
        const handoff = handoffs.find(value => value.id === body.payload.handoffId); assert.ok(handoff); assert.equal(body.payload.expectedHandoffVersion, handoff.version);
        if (action === 'delivery.handoff.review.resolve') { handoff.version = 2; handoff.status = 'approval_ready'; }
        if (action === 'delivery.handoff.approval.resolve') { handoff.version = 3; handoff.status = 'approved'; }
        if (action === 'delivery.handoff.consume') {
          handoff.version = 4; handoff.status = 'consumed';
          const pkg = makePackage({ id: uid(500 + packages.length), sourceMode: 'studio_handoff' }); packages.push(pkg);
          return { ...result, resourceId: pkg.id, resourceVersion: 1 };
        }
        return { ...result, resourceId: handoff.id, resourceVersion: handoff.version };
      }
      if (action === 'delivery.item.review') {
        const pkg = packages.find(value => value.items.some(item => item.aggregateId === body.payload.itemAggregateId)); const item = pkg?.items.find(value => value.aggregateId === body.payload.itemAggregateId);
        assert.ok(item); assert.equal(body.payload.expectedAggregateVersion, item.aggregateVersion); assert.equal(body.payload.expectedItemVersionId, item.currentVersionId);
        item.aggregateVersion += 1; item.version += 1; item.currentVersionId = uid(60_000 + receipt); item.status = 'accepted';
        return { ...result, resourceId: item.aggregateId, resourceVersion: item.aggregateVersion };
      }
      if (action === 'delivery.package.review.resolve') {
        const pkg = packages.find(value => value.id === body.payload.workPackageId); assert.ok(pkg); assert.equal(body.payload.expectedPackageVersion, pkg.currentVersion);
        assert.equal(pkg.items.every(item => item.status === 'accepted'), true); pkg.reviewState = 'approved';
        return { ...result, resourceId: pkg.id, resourceVersion: pkg.currentVersion };
      }
      if (action === 'monitor.baseline.create') {
        const pkg = packages.find(value => value.id === body.payload.workPackageId); assert.ok(pkg); assert.equal(pkg.status, 'approved');
        const baseline = { id: uid(90_000 + baselines.length), status: 'approved', workPackageId: pkg.id, lineageClassification: pkg.sourcePackage.lineageClassification, planningOnly: pkg.sourcePackage.planningOnly };
        baselines.push(baseline); return { ...result, resourceId: baseline.id, resourceVersion: 1 };
      }
      assert.fail(`unexpected action ${action}`);
    },
    lastCommand: async () => null,
  });
  return { calls, packages, handoffs, baselines, studio, sessions: new Map(PERSONAS.map(persona => [persona, { api: makeApi(persona) }])) };
};

const run = (harness, checkpointId, stepId, lastCompletedStep, stateEntries = []) => {
  const state = new Map([[K.lastCompletedStep, lastCompletedStep], ...stateEntries]); const interactionSequence = [];
  return { state, interactionSequence, result: runSyntheticPrerequisites({ nextStep: { checkpointId, stepId }, sessions: harness.sessions, state, interactionSequence }) };
};

test('ordering and failures stop closed without writing a completion marker', async () => {
  const artifactId = uid(300); const studio = { id: artifactId, aggregateVersion: 2, currentVersion: { id: uid(301), version: 2 }, review: null };
  const harness = makeHarness({ studio: structuredClone(studio) });
  const ignored = run(harness, 'CH-01', 'unrelated', 'CH-00:prior'); assert.deepEqual(await ignored.result, { applied: false, key: 'CH-01:unrelated' });
  const wrongOrder = run(harness, 'CH-03', 'approve-hybrid-studio-document', 'CH-03:request-studio-handoff', [[K.ch03ArtifactId, artifactId]]);
  await assert.rejects(wrongOrder.result, /:ORDER$/u); assert.equal(wrongOrder.state.has('prereq:completed:CH-03:approve-hybrid-studio-document'), false);
  const stale = makeHarness({ studio: structuredClone(studio), staleStudio: true });
  const staleRun = run(stale, 'CH-03', 'approve-hybrid-studio-document', 'CH-03:generate-source-bound-document', [[K.ch03ArtifactId, artifactId]]);
  await assert.rejects(staleRun.result, /RESOURCE_STALE/u); assert.equal(staleRun.state.has('prereq:completed:CH-03:approve-hybrid-studio-document'), false);
  const denied = makeHarness({ rejectAction: 'delivery.handoff.request' });
  const source = { targetWorkspaceId: WORKSPACE, studioArtifactId: uid(310), studioArtifactVersionId: uid(311), expectedAggregateVersion: 1, expectedCurrentVersionId: uid(311), expectedApprovedVersionId: uid(311) };
  const deniedRun = run(denied, 'CH-04', 'reject-new-exact-handoff-request', 'CH-04:verify-changes-create-no-target-draft', [[K.ch04RequestSource, source]]);
  await assert.rejects(deniedRun.result, /PERMISSION_DENIED/u); assert.equal(deniedRun.state.has('prereq:completed:CH-04:reject-new-exact-handoff-request'), false);
});

test('CH-03 submits, assigns, and independently reviews the exact generated draft', async () => {
  const artifactId = uid(320); const harness = makeHarness({ studio: { id: artifactId, aggregateVersion: 2, currentVersion: { id: uid(321), version: 2 }, review: null } });
  const execution = run(harness, 'CH-03', 'approve-hybrid-studio-document', 'CH-03:generate-source-bound-document', [[K.ch03ArtifactId, artifactId]]);
  assert.deepEqual(await execution.result, { applied: true, key: 'CH-03:approve-hybrid-studio-document' });
  assert.deepEqual(harness.calls.filter(call => call.kind === 'command').map(call => [call.persona, call.action]), [
    ['requester', 'studio.artifact.review.submit'], ['studio_reviewer', 'studio.artifact.review.assign'], ['studio_reviewer', 'studio.artifact.review.resolve'],
  ]);
  assert.equal(harness.studio.review.outcome, 'approved'); assert.equal(execution.interactionSequence.every(value => !UUID_VALUE.test(value)), true);
});

const UUID_VALUE = /[0-9a-f]{8}-[0-9a-f-]{27,}/iu;

test('CH-04 creates one fresh exact request after absence proof and exposes only its private state selector', async () => {
  const harness = makeHarness(); const versionId = uid(331);
  const source = { targetWorkspaceId: WORKSPACE, studioArtifactId: uid(330), studioArtifactVersionId: versionId, expectedAggregateVersion: 4, expectedCurrentVersionId: versionId, expectedApprovedVersionId: versionId };
  const execution = run(harness, 'CH-04', 'reject-new-exact-handoff-request', 'CH-04:verify-changes-create-no-target-draft', [[K.ch04RequestSource, source]]);
  await execution.result;
  assert.match(execution.state.get(K.ch04ReplacementHandoffId), /^[0-9a-f-]{36}$/u);
  assert.deepEqual(harness.calls.filter(call => call.kind === 'command').map(call => [call.persona, call.action]), [['requester', 'delivery.handoff.request']]);
  assert.deepEqual(execution.interactionSequence, ['prerequisite:ch-04:request-fresh-exact-handoff']);
});

test('CH-06 decides all other members of the exact 250-item set and leaves the edited catalog target', async () => {
  const pkg = makePackage({ id: uid(400), count: 250, sourceMode: 'studio_handoff', lineageClassification: 'assessed', planningOnly: false });
  const finalItem = pkg.items[137]; finalItem.aggregateVersion = 2; finalItem.version = 2; finalItem.currentVersionId = uid(70_000); finalItem.status = 'edited';
  const harness = makeHarness({ packages: [pkg] });
  const execution = run(harness, 'CH-06', 'decide-every-current-proposal', 'CH-06:compare-immutable-descendant-history', [
    ['full-governed-package', { packageId: pkg.id, itemCount: 250 }], [K.ch06FinalItemId, finalItem.aggregateId],
  ]);
  await execution.result;
  assert.equal(pkg.items.filter(item => item.status === 'accepted').length, 249); assert.equal(finalItem.status, 'edited');
  const commands = harness.calls.filter(call => call.kind === 'command'); assert.equal(commands.length, 249);
  assert.equal(commands.every(call => call.persona === 'delivery_author' && call.action === 'delivery.item.review'), true);
  assert.equal(commands.every(call => call.expectation.checkpointId === 'CH-06' && call.expectation.stepId === 'compare-immutable-descendant-history'), true);
  const complete = await readSyntheticDeliveryPackage(harness.sessions.get('delivery_author'), pkg.id); assert.equal(complete.items.length, 250);
});

test('CH-10 preserves exact role order through handoff, consume, item decisions, and package review', async () => {
  const handoff = { id: uid(500), version: 1, status: 'requested', lineageClassification: 'not_assessed', planningOnly: true,
    preview: { artifactType: 'pdd', proposedItemCount: 2 }, history: [], reviewHistory: [], approvalHistory: [], targetItems: [] };
  const harness = makeHarness({ handoffs: [handoff] });
  const execution = run(harness, 'CH-10', 'approve-direct-planning-package', 'CH-10:handoff-direct-studio-plan', [[K.ch10HandoffId, handoff.id]]);
  await execution.result;
  assert.deepEqual(harness.calls.filter(call => call.kind === 'command').map(call => [call.persona, call.action]), [
    ['delivery_target_acceptor', 'delivery.handoff.review.resolve'], ['delivery_approver', 'delivery.handoff.approval.resolve'],
    ['delivery_consumer', 'delivery.handoff.consume'], ['delivery_author', 'delivery.item.review'], ['delivery_author', 'delivery.item.review'],
    ['delivery_reviewer', 'delivery.package.review.resolve'],
  ]);
  const packageId = execution.state.get(K.ch10PackageId); const pkg = harness.packages.find(value => value.id === packageId);
  assert.equal(pkg.reviewState, 'approved'); assert.equal(pkg.items.every(item => item.status === 'accepted'), true);
});

test('CH-10 creates and verifies one exact planning-only Monitor baseline after anchored approval', async () => {
  const pkg = makePackage({ id: uid(550), count: 2, sourceMode: 'studio_handoff' });
  pkg.status = 'approved'; pkg.approvalState = 'approved'; for (const item of pkg.items) item.status = 'accepted';
  const harness = makeHarness({ packages: [pkg] });
  const execution = run(harness, 'CH-10', 'verify-direct-plan-remains-not-assessed', 'CH-10:approve-direct-planning-package', [[K.ch10PackageId, pkg.id]]);
  await execution.result;
  assert.equal(harness.baselines.length, 1); assert.equal(harness.baselines[0].workPackageId, pkg.id);
  assert.equal(execution.state.get(K.ch10BaselineId), harness.baselines[0].id);
  assert.deepEqual(harness.calls.filter(call => call.kind === 'command').map(call => [call.persona, call.action]), [['delivery_approver', 'monitor.baseline.create']]);
});

test('CH-11 accepts the exact manual package items before the anchored package review', async () => {
  const pkg = makePackage({ id: uid(600), count: 2 }); const harness = makeHarness({ packages: [pkg] });
  const execution = run(harness, 'CH-11', 'review-manual-delivery-package', 'CH-11:create-manual-delivery-package', [[K.ch11PackageId, pkg.id]]);
  await execution.result;
  assert.equal(pkg.items.every(item => item.status === 'accepted'), true);
  assert.deepEqual(harness.calls.filter(call => call.kind === 'command').map(call => [call.persona, call.action]), [
    ['delivery_author', 'delivery.item.review'], ['delivery_author', 'delivery.item.review'],
  ]);
  assert.equal((await readSyntheticDeliveryWorkspace(harness.sessions.get('delivery_author'))).packages.length, 1);
  const artifactId = uid(610); const studioHarness = makeHarness({ studio: { id: artifactId, aggregateVersion: 1, currentVersion: { id: uid(611), version: 1 }, review: null } });
  assert.equal((await readSyntheticStudioArtifact(studioHarness.sessions.get('requester'), artifactId)).id, artifactId);
});

test('command success decoder returns only stable receipt/resource selectors', () => {
  const response = { ok: true, outcome: 'committed', receiptId: uid(700), action: 'delivery.handoff.request', resourceId: uid(701), resourceVersion: 1, unsafe: 'discarded' };
  assert.deepEqual(decodeSyntheticCommandSuccess(response, { action: 'delivery.handoff.request' }), {
    outcome: 'committed', receiptId: uid(700), resourceId: uid(701), resourceVersion: 1,
  });
  assert.equal(syntheticCommandResourceId(response, 'delivery.handoff.request'), uid(701));
  assert.throws(() => decodeSyntheticCommandSuccess({ ...response, receiptId: 'invalid' }, { action: 'delivery.handoff.request' }), /COMMAND_RESULT/u);
});
