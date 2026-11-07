import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEnterpriseLifecycleCommandPersistence } from './enterpriseLifecyclePersistenceAssertions.mjs';

const command = Object.freeze({
  domain: 'assess',
  requestId: '00000000-0000-4000-8000-000000000001',
  actorId: '00000000-0000-4000-8000-000000000002',
  organizationId: '00000000-0000-4000-8000-000000000003',
  workspaceId: '00000000-0000-4000-8000-000000000004',
  idempotencyKey: 'lifecycle-create',
  commandType: 'assessment_v2.create',
  resourceType: 'assess_v2_case',
  resourceId: '00000000-0000-4000-8000-000000000005',
});

const receipt = overrides => ({
  request_id: command.requestId,
  actor_id: command.actorId,
  org_id: command.organizationId,
  workspace_id: command.workspaceId,
  command_type: command.commandType,
  idempotency_key: command.idempotencyKey,
  status: 'succeeded',
  resource_id: null,
  response: { id: command.resourceId },
  ...overrides,
});
const audit = overrides => ({
  request_id: command.requestId,
  actor_id: command.actorId,
  org_id: command.organizationId,
  workspace_id: command.workspaceId,
  action: command.commandType,
  resource_type: command.resourceType,
  resource_id: command.resourceId,
  outcome: 'succeeded',
  resource_version: '1',
  ...overrides,
});

const db = ({ receiptRows = [receipt()], auditRows = [audit()], auditRowsByAction = {} } = {}) => ({
  query: async (sql, values) => ({ rows: sql.includes('privileged_audit_events') ? (auditRowsByAction[values[4]] ?? auditRows) : receiptRows }),
});

test('proves exact receipt and audit bindings without returning identifiers', async () => {
  const evidence = await assertEnterpriseLifecycleCommandPersistence({ db: db(), commands: [command] });
  assert.deepEqual(evidence, {
    receiptCount: 1,
    auditCount: 1,
    bindings: [{
      tenantBound: true,
      actorBound: true,
      requestBound: true,
      commandBound: true,
      resourceBound: true,
      terminalBound: true,
      terminalAuditRequired: false,
      terminalAuditBound: true,
      duplicateFree: true,
    }],
  });
  assert.equal(JSON.stringify(evidence).includes(command.requestId), false);
  assert.equal(JSON.stringify(evidence).includes(command.resourceId), false);
});

test('binds a separate Studio terminal audit without rejecting the command audit', async () => {
  const attemptId = '00000000-0000-4000-8000-000000000006';
  const studioCommand = {
    ...command,
    domain: 'studio',
    commandType: 'studio.generation.request',
    auditAction: 'studio.artifact.generation.request.v2',
    resourceType: 'studio_generation_attempt',
    resourceId: attemptId,
    receiptResourceId: command.resourceId,
    terminalAudit: {
      action: 'studio.artifact.generation.complete',
      resourceType: 'studio_generation_attempt',
      resourceId: attemptId,
      outcome: 'succeeded',
    },
  };
  const commandAudit = audit({ action: studioCommand.auditAction, resource_type: studioCommand.resourceType, resource_id: attemptId });
  const completedAudit = audit({ action: studioCommand.terminalAudit.action, resource_type: studioCommand.terminalAudit.resourceType, resource_id: attemptId });
  const evidence = await assertEnterpriseLifecycleCommandPersistence({
    db: db({
      receiptRows: [receipt({ command_type: studioCommand.commandType, status: 'committed', resource_id: command.resourceId })],
      auditRowsByAction: {
        [studioCommand.auditAction]: [commandAudit],
        [studioCommand.terminalAudit.action]: [completedAudit],
      },
    }),
    commands: [studioCommand],
  });
  assert.equal(evidence.receiptCount, 1);
  assert.equal(evidence.auditCount, 2);
  assert.equal(evidence.bindings[0].terminalAuditRequired, true);
  assert.equal(evidence.bindings[0].terminalAuditBound, true);
});

test('binds committed enterprise handoff receipts to their command audit', async () => {
  const handoffCommand = {
    ...command,
    domain: 'enterprise_handoff',
    commandType: 'handoff.consume',
    resourceType: 'enterprise_module_handoff',
  };
  const queries = [];
  const handoffDb = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: sql.includes('privileged_audit_events')
        ? [audit({ action: handoffCommand.commandType, resource_type: handoffCommand.resourceType })]
        : [receipt({ command_type: handoffCommand.commandType, status: 'committed', resource_id: handoffCommand.resourceId })] };
    },
  };
  const evidence = await assertEnterpriseLifecycleCommandPersistence({ db: handoffDb, commands: [handoffCommand] });
  assert.equal(evidence.bindings[0].resourceBound, true);
  assert.match(queries[0], /public[.]enterprise_module_handoff_command_receipts/u);
});

test('fails closed on duplicate receipts and mismatched persisted resources', async () => {
  await assert.rejects(
    assertEnterpriseLifecycleCommandPersistence({ db: db({ receiptRows: [receipt(), receipt()] }), commands: [command] }),
    /ENTERPRISE_LIFECYCLE_PERSISTENCE_RECEIPT_COUNT:0/u,
  );
  await assert.rejects(
    assertEnterpriseLifecycleCommandPersistence({ db: db({ receiptRows: [receipt({ response: { id: 'wrong' } })] }), commands: [command] }),
    /ENTERPRISE_LIFECYCLE_PERSISTENCE_RESOURCE_BINDING:0/u,
  );
});

const captureFixture = (captureRows, captureAudit = true) => {
  const expected = { ...command, domain: 'studio', captureAudit,
    resourceType: 'studio_generation_attempt', receiptResourceId: command.resourceId };
  const row = {
    audit_id: 'capture-audit', capture_audit_event_id: 'capture-audit',
    request_id: command.requestId, actor_id: command.actorId,
    org_id: command.organizationId, workspace_id: command.workspaceId,
    candidate_org: command.organizationId, candidate_workspace: command.workspaceId,
    candidate_artifact: command.resourceId, attempt_artifact: command.resourceId,
    action: 'studio.artifact.generation.candidate.capture', resource_type: 'studio_generation_attempt',
    resource_id: command.resourceId, outcome: 'succeeded', candidate_state: 'validated',
    resource_version: '1', original_execution_fence: '1',
    response_hash: 'a'.repeat(64), computed_hash: 'a'.repeat(64),
    input_tokens: 100, output_tokens: 40, total_tokens: 140,
    metadata: { artifactId: command.resourceId, responseHash: 'a'.repeat(64), inputTokens: 100, outputTokens: 40, totalTokens: 140 },
  };
  const baseDb = db({ receiptRows: [receipt({status: 'committed', resource_id: command.resourceId})],
    auditRows: [audit({resource_type: 'studio_generation_attempt'})] });
  return { commands: [expected], db: {query: async (sql, values) => {
    if (sql.includes('studio_generation_provider_candidates')) {
      assert.deepEqual(values, [command.resourceId]);
      assert.match(sql, /enterprise_sha256_jsonb\(c.response_content\)/u);
      assert.match(sql, /a.id=c.capture_audit_event_id/u);
      return {rows: captureRows ? captureRows(row) : [row]};
    }
    return baseDb.query(sql, values);
  }} };
};

test('counts only the exact validated response capture audit and retains zero capture on provider failure', async () => {
  assert.equal((await assertEnterpriseLifecycleCommandPersistence(captureFixture())).auditCount, 2);
  assert.equal((await assertEnterpriseLifecycleCommandPersistence(captureFixture(() => [], false))).auditCount, 1);
  await assert.rejects(assertEnterpriseLifecycleCommandPersistence(captureFixture(undefined, false)), /CAPTURE_COUNT/u);
  await assert.rejects(assertEnterpriseLifecycleCommandPersistence(captureFixture(() => [])), /CAPTURE_COUNT/u);
  await assert.rejects(assertEnterpriseLifecycleCommandPersistence(captureFixture(row => [row, row])), /CAPTURE_COUNT/u);
});

for (const field of ['audit_id','request_id','actor_id','org_id','workspace_id','candidate_org',
  'candidate_workspace','candidate_artifact','action','resource_type','resource_id','outcome',
  'candidate_state','resource_version','original_execution_fence','response_hash','computed_hash',
  'input_tokens','output_tokens','total_tokens']) {
  test(`rejects substituted capture binding ${field}`, async () => {
    await assert.rejects(assertEnterpriseLifecycleCommandPersistence(captureFixture(row => [{...row, [field]: 'wrong'}])), /CAPTURE_BINDING/u);
  });
}
for (const field of ['artifactId','responseHash','inputTokens','outputTokens','totalTokens']) {
  test(`rejects substituted capture metadata ${field}`, async () => {
    await assert.rejects(assertEnterpriseLifecycleCommandPersistence(captureFixture(row => [{...row, metadata: {...row.metadata, [field]: 'wrong'}}])), /CAPTURE_BINDING/u);
  });
}
