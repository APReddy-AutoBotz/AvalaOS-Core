import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';

import { authenticatedEvidenceDigest } from './authenticatedBrowserCorrelation.mjs';
import {
  AUTHENTICATED_HOSTED_OBSERVATION_SOURCES,
  authenticatedHostedRequestBinding,
  createAuthenticatedHostedObservationReader,
} from './authenticatedHostedObservationAdapter.mjs';
import { validateAuthenticatedServerObservations } from './authenticatedHostedObserver.mjs';

const scalar = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const ids = Object.freeze({
  org: randomUUID(), workspace: randomUUID(), process: randomUUID(), project: randomUUID(), exercise: randomUUID(),
  author: randomUUID(), reviewer: randomUUID(), approver: randomUUID(), outsider: randomUUID(), session: randomUUID(),
  request: randomUUID(), receipt: randomUUID(), audit: randomUUID(), foreign: randomUUID(),
  case: randomUUID(), caseVersion: randomUUID(), caseVersion2: randomUUID(), caseRequest: randomUUID(), caseReceipt: randomUUID(),
});
const identities = Object.freeze({
  author: { id: ids.author }, reviewer: { id: ids.reviewer }, approver: { id: ids.approver }, outsider: { id: ids.outsider },
});
const project = Object.freeze({ projectId: ids.project, processId: ids.process, identities });
const capturedAt = '2026-10-10T05:11:01.000Z';
const from = '2026-10-10T05:10:00.000Z';
const to = '2026-10-10T05:11:00.000Z';
const requestHash = `sha256:${'a'.repeat(64)}`;
const permitPayload = `sha256:${'b'.repeat(64)}`;
const actorHash = scalar(ids.author);
const sessionHash = scalar(ids.session);

const authorityFrame = () => ({
  capturedAt,
  exercise: { exerciseIdHash: scalar(ids.exercise), lifecycle: 'active', activatedAt: from },
  actorSessions: [{ persona: 'author', actorHash, sessionHash, state: 'active', boundAt: from }],
  permits: [{ permitIdHash: scalar('permit'), requestHash: scalar(ids.request),
    payloadHash: permitPayload, commandType: 'process.update', state: 'consumed', classification: 'immutable_history',
    consumedAt: to }],
  permitEvents: [{ eventIdHash: scalar('permit-event'), permitIdHash: scalar('permit'), actorHash, sessionHash,
    requestHash: scalar(ids.request), payloadHash: permitPayload, commandType: 'process.update',
    eventType: 'consumed_precommit', occurredAt: to, classification: 'immutable_history' }],
});

const tableFromSql = sql => /FROM public[.]([a-z0-9_]+) x/u.exec(sql)?.[1] ?? null;
const fakeDb = ({ digestOnly = false } = {}) => ({
  async query(sql, parameters) {
    const table = tableFromSql(sql);
    assert.ok(table && AUTHENTICATED_HOSTED_OBSERVATION_SOURCES.some(source => source.table === table));
    if (sql.includes("'sha256:'||encode")) {
      assert.deepEqual(parameters, [[], [], [], from, ids.org, ids.workspace]);
      assert.doesNotMatch(sql, /org_id[^\n]*<>/u);
      assert.match(sql, /WHERE NOT\(coalesce\(\(.+OR .+\) AND coalesce\(/su);
      assert.match(sql, />=o[.]cutoff/u);
      return { rows: [{ value: scalar(`non-exercise:${table}`) }] };
    }
    assert.equal(parameters[0], ids.org);
    assert.equal(digestOnly, false);
    assert.equal(parameters[1], ids.workspace);
    assert.deepEqual(parameters[2], Object.values(identities).map(value => value.id));
    assert.equal(parameters[3], ids.project);
    assert.equal(parameters[4], ids.process);
    assert.match(sql, /UNION ALL/u);
    return { rows: [
      { source: 'assess_processes', value: {
        id: ids.process, org_id: ids.org, workspace_id: ids.workspace, updated_by: ids.author,
        status: 'Ready for Review', created_at: '2026-10-09T05:10:30.000Z',
        updated_at: '2026-10-10T05:10:30.000Z' } },
      { source: 'assess_v2_case_versions', value: {
        id: ids.caseVersion, case_id: ids.case, org_id: ids.org, workspace_id: ids.workspace,
        author_id: ids.author, version: 2, created_at: '2026-10-10T05:10:42.000Z' } },
      { source: 'assess_v2_case_versions', value: {
        id: ids.caseVersion2, case_id: ids.case, org_id: ids.org, workspace_id: ids.workspace,
        author_id: ids.author, version: 3, created_at: '2026-10-10T05:10:43.000Z' } },
      { source: 'assess_command_receipts', value: {
        id: ids.receipt, org_id: ids.org, workspace_id: ids.workspace, actor_id: ids.author,
        command_type: 'process.update', request_id: ids.request, request_hash: requestHash,
        resource_id: ids.process, created_at: '2026-10-10T05:10:29.000Z' } },
      { source: 'assess_command_receipts', value: {
        id: ids.caseReceipt, org_id: ids.org, workspace_id: ids.workspace, actor_id: ids.author,
        command_type: 'assess.v2.case.finalize', request_id: ids.caseRequest, request_hash: scalar('case-request'),
        resource_id: ids.case, created_at: '2026-10-10T05:10:41.000Z' } },
      { source: 'privileged_audit_events', value: {
        id: ids.audit, org_id: ids.org, workspace_id: ids.workspace, actor_id: ids.author,
        request_id: ids.request, resource_id: ids.process, metadata: { receiptId: ids.receipt },
        created_at: '2026-10-10T05:10:31.000Z' } },
    ] };
  },
});

test('request binding separates raw browser payload from command identity', () => {
  const payload = { requestId: ids.request, commandType: 'process.update', name: 'Changed' };
  const binding = authenticatedHostedRequestBinding({ requestId: ids.request, actorHash,
    commandType: 'process.update', payload, requireUuid: true });
  assert.equal(binding.requestIdHash, scalar(ids.request));
  assert.equal(binding.browserPayloadHash, authenticatedEvidenceDigest(payload));
  assert.notEqual(binding.browserPayloadHash, binding.commandBindingHash);
  assert.throws(() => authenticatedHostedRequestBinding({ requestId: 'POST /read', actorHash,
    commandType: 'post:/read', requireUuid: true }), /COMMAND_BINDING_REJECTED/u);
});

test('reader scopes actual rows to the project actors and joins receipt, audit and permit causality', async () => {
  const reader = createAuthenticatedHostedObservationReader({ db: fakeDb(),
    config: { scope: { organizationId: ids.org, workspaceId: ids.workspace } },
    authority: async (name, parameters) => {
      assert.equal(name, 'authenticated_synthetic_observe');
      assert.deepEqual(parameters, [ids.exercise, from, to]);
      return authorityFrame();
    } });
  const frame = await reader.capture({ exerciseId: ids.exercise, from, to, project });
  const process = frame.records.find(row => row.source === 'assess_processes');
  const receipt = frame.records.find(row => row.source === 'assess_command_receipts');
  const audit = frame.records.find(row => row.source === 'privileged_audit_events');
  const permitEvent = frame.records.find(row => row.source === 'authenticated_synthetic_permit_events');
  const caseVersions = frame.records.filter(row => row.source === 'assess_v2_case_versions');
  const caseVersion = caseVersions[0];
  const binding = authenticatedHostedRequestBinding({ requestId: ids.request, actorHash,
    commandType: 'process.update', requireUuid: true });
  for (const row of [process, receipt, audit]) assert.deepEqual({
    actorHash: row.actorHash, sessionHash: row.sessionHash, requestIdHash: row.requestIdHash,
    commandBindingHash: row.commandBindingHash, receiptIdHash: row.receiptIdHash,
  }, { actorHash, sessionHash, requestIdHash: binding.requestIdHash,
    commandBindingHash: binding.commandBindingHash, receiptIdHash: scalar(ids.receipt) });
  assert.equal(receipt.persistedRequestHash, requestHash);
  assert.equal(audit.auditIdHash, scalar(ids.audit));
  assert.equal(process.occurredAt, '2026-10-10T05:10:30.000Z');
  const caseBinding = authenticatedHostedRequestBinding({ requestId: ids.caseRequest, actorHash,
    commandType: 'assess.v2.case.finalize', requireUuid: true });
  assert.equal(caseVersion.requestIdHash, caseBinding.requestIdHash);
  assert.equal(caseVersion.commandBindingHash, caseBinding.commandBindingHash);
  assert.equal(caseVersion.commandIdHash, scalar(ids.case));
  assert.equal(caseVersion.receiptIdHash, scalar(ids.caseReceipt));
  assert.equal(new Set(caseVersions.map(row => row.recordHash)).size, 2);
  assert.equal(permitEvent.persistedPayloadHash, permitPayload);
  assert.equal(permitEvent.commandBindingHash, binding.commandBindingHash);
  assert.ok(frame.records.every(row => !JSON.stringify(row).includes(ids.author)
    && !JSON.stringify(row).includes(ids.request) && !JSON.stringify(row).includes(ids.receipt)));
});

test('reader rejects a persisted row with no legitimate event or modification timestamp', async () => {
  const base = fakeDb();
  const db = { async query(sql, parameters) {
    const result = await base.query(sql, parameters);
    if (!sql.includes("'sha256:'||encode")) result.rows.find(row => row.source === 'assess_processes').value = {
      id: ids.process, org_id: ids.org, workspace_id: ids.workspace,
      updated_by: ids.author, status: 'Ready for Review',
    };
    return result;
  } };
  const reader = createAuthenticatedHostedObservationReader({ db,
    config: { scope: { organizationId: ids.org, workspaceId: ids.workspace } },
    authority: async () => authorityFrame() });
  await assert.rejects(reader.capture({ exerciseId: ids.exercise, from, to, project }),
    /SOURCE_TIME_REJECTED:assess_processes/u);
});

test('non-exercise digest is composed only from server-side per-source digests', async () => {
  const reader = createAuthenticatedHostedObservationReader({ db: fakeDb({ digestOnly: true }),
    config: { scope: { organizationId: ids.org, workspaceId: ids.workspace } }, authority: async () => authorityFrame() });
  const value = await reader.nonExerciseDigest({ cutoff: from,
    ownership: { actorIds: [], projectIds: [], processIds: [] } });
  assert.match(value, /^sha256:[0-9a-f]{64}$/u);
  await assert.rejects(reader.nonExerciseDigest({ cutoff: from,
    ownership: { actorIds: [ids.author, ids.author],
    projectIds: [], processIds: [] } }), /NON_EXERCISE_OWNERSHIP_REJECTED/u);
  await assert.rejects(reader.nonExerciseDigest({ ownership: { actorIds: [], projectIds: [], processIds: [] } }),
    /NON_EXERCISE_OWNERSHIP_REJECTED/u);
});

test('observer rejects a source/effect substitution after reader production', () => {
  const binding = {
    releaseSha: 'a'.repeat(40), exerciseDigest: scalar('exercise'), sourceDigest: scalar('source'),
    workflow: { runId: '1', attempt: '1' }, window: { startedAt: from, completedAt: '2026-10-10T05:12:00.000Z' },
    actors: [{ persona: 'author', project: 'desktop-chromium', actorHash, sessionHash,
      organizationHash: scalar(ids.org), workspaceHash: scalar(ids.workspace) }],
  };
  const emptyCase = { testId: 'ASSESS-002', project: 'desktop-chromium', scenario: 'authorization-boundary',
    window: { startedAt: from, completedAt: to }, participants: [{ persona: 'author', actorHash, sessionHash }],
    before: { capturedAt: from, records: [] }, after: { capturedAt, records: [{
      source: 'privileged_audit_events', recordHash: scalar('record'), rowHash: scalar('row'), businessRowHash: scalar('row'), occurredAt: to,
      classification: 'immutable_history', active: false, actorHash, sessionHash, requestIdHash: scalar(ids.request),
      persistedRequestHash: requestHash, persistedPayloadHash: null, commandBindingHash: scalar('binding'),
      commandIdHash: scalar('command'), receiptIdHash: scalar(ids.receipt), auditIdHash: scalar(ids.audit),
      effectKind: 'domain', organizationHash: scalar(ids.org), workspaceHash: scalar(ids.workspace),
    }] } };
  const errors = validateAuthenticatedServerObservations({ schemaVersion: 'authenticated-server-observations-v1',
    identity: {}, cases: [emptyCase], cleanup: {} }, binding);
  assert.ok(errors.some(error => error.startsWith('server-observation-row:')));
});
