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
