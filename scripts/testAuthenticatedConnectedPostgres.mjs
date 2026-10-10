import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';

const processCounts = async (db, processId) => {
  const value = (await db.query(`SELECT jsonb_build_object(
    'version',(SELECT authority_version::int FROM public.assess_processes WHERE id=$1),
    'receipts',(SELECT count(*)::int FROM public.assess_command_receipts WHERE command_type='process.update'),
    'audits',(SELECT count(*)::int FROM public.privileged_audit_events WHERE action='process.update')) value`, [processId])).rows[0].value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Number(entry)]));
};

const invokeProcessUpdate = async (fixture, expectedVersion, name, processId = fixture.ids.process) => {
  const request = {
    requestId: randomUUID(), idempotencyKey: `authenticated.process.update.${randomUUID()}`,
    commandType: 'process.update', organizationId: fixture.ids.organization,
    workspaceId: fixture.ids.workspace, authorizationVersion: await fixture.authorizationVersion(fixture.ids.author),
    expectedVersion, payload: {
      processId, name, description: 'Persisted through the production process command.',
      department: 'Operations', criticality: 'High',
    },
  };
  const response = await fetch(`${fixture.baseUrl}/functions/v1/process-command`, {
    method: 'POST', headers: { authorization: 'Bearer enterprise-author-token', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return { status: response.status, body: await response.json(), request };
};

const expectRoleDenied = async (db, role, actorId, sql, values = []) => {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
    await db.query(sql, values);
    await db.query('ROLLBACK');
    assert.fail(`${role} unexpectedly executed process authority SQL`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    assert.equal(error.code, '42501', `${role} denial must be PostgreSQL insufficient_privilege`);
  }
};

const replayProcessUpdate = async (fixture, request) => {
  const response = await fetch(`${fixture.baseUrl}/functions/v1/process-command`, {
    method: 'POST', headers: { authorization: 'Bearer enterprise-author-token', 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return { status: response.status, body: await response.json() };
};

export const runAuthenticatedConnectedPostgres = async () => {
  const fixture = await createEnterpriseLifecycleFixture();
  let cleanup = false;
  try {
    const before = await processCounts(fixture.db, fixture.ids.process);
    const committed = await invokeProcessUpdate(fixture, 1, 'Connected lifecycle updated');
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    assert.equal(committed.body.ok, true);
    assert.equal(committed.body.outcome, 'committed');
    assert.equal(committed.body.resource.version, 2);
    const afterCommit = await processCounts(fixture.db, fixture.ids.process);
    assert.deepEqual(afterCommit, { version: 2, receipts: before.receipts + 1, audits: before.audits + 1 });

    await fixture.db.query('UPDATE public.assess_processes SET owner_id=$2 WHERE id=$1', [fixture.ids.process,fixture.ids.reviewer]);
    const replayAfterOwnershipLoss = await replayProcessUpdate(fixture, committed.request);
    assert.equal(replayAfterOwnershipLoss.status, 403);
    assert.equal(replayAfterOwnershipLoss.body.ok, false);
    assert.equal(replayAfterOwnershipLoss.body.error.code, 'PERMISSION_DENIED');
    assert.deepEqual(await processCounts(fixture.db, fixture.ids.process), afterCommit);
    await fixture.db.query('UPDATE public.assess_processes SET owner_id=$2 WHERE id=$1', [fixture.ids.process,fixture.ids.author]);

    await fixture.db.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='assess.process.update'", [fixture.ids.role]);
    const denied = await invokeProcessUpdate(fixture, 2, 'Unauthorized process change');
    assert.equal(denied.body.ok, false);
    assert.equal(denied.body.error.code, 'PERMISSION_DENIED');
    assert.deepEqual(await processCounts(fixture.db, fixture.ids.process), afterCommit);
    const persisted = (await fixture.db.query('SELECT name,description,department,criticality FROM public.assess_processes WHERE id=$1', [fixture.ids.process])).rows[0];
    assert.deepEqual(persisted, {
      name: 'Connected lifecycle updated', description: 'Persisted through the production process command.',
      department: 'Operations', criticality: 'High',
    });

    await expectRoleDenied(fixture.db, 'authenticated', fixture.ids.author,
      'UPDATE public.assess_processes SET authority_version=99 WHERE id=$1', [fixture.ids.process]);
    await expectRoleDenied(fixture.db, 'anon', fixture.ids.author,
      'UPDATE public.assess_processes SET authority_version=99 WHERE id=$1', [fixture.ids.process]);
    await expectRoleDenied(fixture.db, 'authenticated', fixture.ids.author,
      `SELECT public.update_assess_process($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [fixture.ids.author,fixture.ids.organization,fixture.ids.workspace,1,randomUUID(),'direct-call-denied',2,
        fixture.ids.process,'Denied','Denied','Denied','High']);

    const historicalProcessId = randomUUID();
    await fixture.db.query(`INSERT INTO public.assess_processes(
      id,org_id,workspace_id,name,status,owner_id,created_by,updated_by,authority_version
    ) VALUES($1,$2,$3,'Historical process remains read-only','Draft',$4,$4,$4,NULL)`,
    [historicalProcessId,fixture.ids.organization,fixture.ids.workspace,fixture.ids.author]);
    await fixture.db.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.process.update') ON CONFLICT DO NOTHING", [fixture.ids.role]);
    const historicalDenied = await invokeProcessUpdate(fixture, 1, 'Historical process mutation denied', historicalProcessId);
    assert.equal(historicalDenied.status, 403);
    assert.equal(historicalDenied.body.error.code, 'PERMISSION_DENIED');
    const historical = (await fixture.db.query('SELECT authority_version,name FROM public.assess_processes WHERE id=$1', [historicalProcessId])).rows[0];
    assert.deepEqual(historical, { authority_version: null, name: 'Historical process remains read-only' });
    await fixture.db.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='assess.process.update'", [fixture.ids.role]);

    let provider;
    try { provider = await fixture.controlsPostgres.executeSecretBind('synthetic-local-secret'); }
    catch (error) {
      throw new Error(`AUTHENTICATED_CONTROLS_POSTGRES_FAILED:${fixture.controlsPostgres.observations.lastPersistenceSignal ?? 'UNKNOWN'}`, { cause: error });
    }
    assert.deepEqual(provider.measurements, {
      logicalMutations: 1, domainWrites: 1, receiptWrites: 1, auditWrites: 1,
      secretWrites: 1, providerCalls: 0, referenceDisclosed: false, rawSecretPersisted: false,
    });
    return {
      schemaVersion: 'local-authenticated-connected-postgres-v1', authKind: 'fixture_transport',
      processUpdate: { committed: true, deniedAfterRevocation: true, persistedVersion: 2,
        replayDeniedAfterOwnershipLoss: true, directRoleWritesDenied: true, historicalNullRowReadOnly: true,
        receiptWrites: 1, auditWrites: 1, deniedWrites: 0 },
      providerSecretBind: provider.measurements,
    };
  } finally {
    cleanup = await fixture.close();
    assert.equal(cleanup, true, 'AUTHENTICATED_CONNECTED_CLEANUP_FAILED');
  }
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) runAuthenticatedConnectedPostgres().then(result => {
  console.log(`AUTHENTICATED_CONNECTED_POSTGRES_PASS ${JSON.stringify(result)}`);
}).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
