import assert from 'node:assert/strict';

const RECEIPT_TABLE = Object.freeze({
  assess: 'public.assess_command_receipts',
  studio: 'public.studio_artifact_command_receipts',
  enterprise_handoff: 'public.enterprise_module_handoff_command_receipts',
});
const RECEIPT_RESOURCE_SELECT = Object.freeze({
  assess: 'NULL::text AS resource_id',
  studio: 'resource_id::text',
  enterprise_handoff: 'resource_id::text',
});

const expectedReceiptStatus = Object.freeze({ assess: 'succeeded', studio: 'committed', enterprise_handoff: 'committed' });

const requireString = (value, field) => {
  assert.equal(typeof value, 'string', `ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:${field}`);
  assert.ok(value.trim().length > 0, `ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:${field}`);
  return value;
};

const persistedReceiptResourceId = (domain, receipt) => domain === 'assess'
  ? receipt.response?.id ?? receipt.response?.caseId ?? null
  : receipt.resource_id;

/**
 * Proves that each accepted lifecycle command has one command-bound receipt and
 * one command-bound privileged audit row. Generation commands may additionally
 * bind their exact completion or failure audit without conflating that terminal
 * event with the command audit. Returned evidence contains booleans and counts
 * only; tenant, actor, request, and resource identifiers never leave this helper.
 */
export const assertEnterpriseLifecycleCommandPersistence = async ({ db, commands }) => {
  assert.ok(db && typeof db.query === 'function', 'ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:db');
  assert.ok(Array.isArray(commands) && commands.length > 0, 'ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:commands');

  const bindings = [];
  let auditCount = 0;
  for (const [index, command] of commands.entries()) {
    const domain = command?.domain;
    assert.ok(Object.hasOwn(RECEIPT_TABLE, domain), `ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:domain:${index}`);
    const requestId = requireString(command.requestId, `requestId:${index}`);
    const actorId = requireString(command.actorId, `actorId:${index}`);
    const organizationId = requireString(command.organizationId, `organizationId:${index}`);
    const workspaceId = requireString(command.workspaceId, `workspaceId:${index}`);
    const idempotencyKey = requireString(command.idempotencyKey, `idempotencyKey:${index}`);
    const commandType = requireString(command.commandType, `commandType:${index}`);
    const auditAction = requireString(command.auditAction ?? commandType, `auditAction:${index}`);
    const resourceType = requireString(command.resourceType, `resourceType:${index}`);
    const resourceId = requireString(command.resourceId, `resourceId:${index}`);
    const receiptResourceId = requireString(command.receiptResourceId ?? resourceId, `receiptResourceId:${index}`);
    const terminalAudit = command.terminalAudit ?? null;
    if (terminalAudit !== null) {
      requireString(terminalAudit.action, `terminalAudit.action:${index}`);
      requireString(terminalAudit.resourceType, `terminalAudit.resourceType:${index}`);
      requireString(terminalAudit.resourceId, `terminalAudit.resourceId:${index}`);
      assert.ok(['succeeded', 'failed'].includes(terminalAudit.outcome), `ENTERPRISE_LIFECYCLE_PERSISTENCE_INVALID:terminalAudit.outcome:${index}`);
    }

    const receiptResult = await db.query(`SELECT
        request_id::text, actor_id::text, org_id::text, workspace_id::text,
        command_type, idempotency_key, status, ${RECEIPT_RESOURCE_SELECT[domain]}, response
      FROM ${RECEIPT_TABLE[domain]}
      WHERE request_id=$1 AND actor_id=$2 AND org_id=$3 AND workspace_id=$4`,
    [requestId, actorId, organizationId, workspaceId]);
    const auditResult = await db.query(`SELECT
        request_id::text, actor_id::text, org_id::text, workspace_id::text,
        action, resource_type, resource_id::text, outcome, resource_version
      FROM public.privileged_audit_events
      WHERE request_id=$1 AND actor_id=$2 AND org_id=$3 AND workspace_id=$4 AND action=$5`,
    [requestId, actorId, organizationId, workspaceId, auditAction]);
    const terminalAuditResult = terminalAudit === null ? null : await db.query(`SELECT
        request_id::text, actor_id::text, org_id::text, workspace_id::text,
        action, resource_type, resource_id::text, outcome, resource_version
      FROM public.privileged_audit_events
      WHERE request_id=$1 AND actor_id=$2 AND org_id=$3 AND workspace_id=$4 AND action=$5`,
    [requestId, actorId, organizationId, workspaceId, terminalAudit.action]);

    assert.equal(receiptResult.rows.length, 1, `ENTERPRISE_LIFECYCLE_PERSISTENCE_RECEIPT_COUNT:${index}`);
    assert.equal(auditResult.rows.length, 1, `ENTERPRISE_LIFECYCLE_PERSISTENCE_AUDIT_COUNT:${index}`);
    if (terminalAuditResult) assert.equal(terminalAuditResult.rows.length, 1, `ENTERPRISE_LIFECYCLE_PERSISTENCE_TERMINAL_AUDIT_COUNT:${index}`);
    const receipt = receiptResult.rows[0];
    const audit = auditResult.rows[0];
    const tenantBound = receipt.org_id === organizationId
      && receipt.workspace_id === workspaceId
      && audit.org_id === organizationId
      && audit.workspace_id === workspaceId;
    const actorBound = receipt.actor_id === actorId && audit.actor_id === actorId;
    const requestBound = receipt.request_id === requestId && audit.request_id === requestId;
    const commandBound = receipt.command_type === commandType
      && receipt.idempotency_key === idempotencyKey
      && audit.action === auditAction;
    const resourceBound = persistedReceiptResourceId(domain, receipt) === receiptResourceId
      && audit.resource_type === resourceType
      && audit.resource_id === resourceId;
    const terminalBound = receipt.status === expectedReceiptStatus[domain]
      && audit.outcome === 'succeeded'
      && Number.isSafeInteger(Number(audit.resource_version))
      && Number(audit.resource_version) >= 0;
    const terminalAuditRow = terminalAuditResult?.rows[0];
    const terminalAuditBound = terminalAudit === null || (
      terminalAuditRow.request_id === requestId
      && terminalAuditRow.actor_id === actorId
      && terminalAuditRow.org_id === organizationId
      && terminalAuditRow.workspace_id === workspaceId
      && terminalAuditRow.action === terminalAudit.action
      && terminalAuditRow.resource_type === terminalAudit.resourceType
      && terminalAuditRow.resource_id === terminalAudit.resourceId
      && terminalAuditRow.outcome === terminalAudit.outcome
      && Number.isSafeInteger(Number(terminalAuditRow.resource_version))
      && Number(terminalAuditRow.resource_version) >= 0
    );

    assert.ok(tenantBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_TENANT_BINDING:${index}`);
    assert.ok(actorBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_ACTOR_BINDING:${index}`);
    assert.ok(requestBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_REQUEST_BINDING:${index}`);
    assert.ok(commandBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_COMMAND_BINDING:${index}`);
    assert.ok(resourceBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_RESOURCE_BINDING:${index}`);
    assert.ok(terminalBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_TERMINAL_BINDING:${index}`);
    assert.ok(terminalAuditBound, `ENTERPRISE_LIFECYCLE_PERSISTENCE_TERMINAL_AUDIT_BINDING:${index}`);
    bindings.push({
      tenantBound,
      actorBound,
      requestBound,
      commandBound,
      resourceBound,
      terminalBound,
      terminalAuditRequired: terminalAudit !== null,
      terminalAuditBound,
      duplicateFree: true,
    });
    auditCount += terminalAudit === null ? 1 : 2;
  }

  return { receiptCount: commands.length, auditCount, bindings };
};
