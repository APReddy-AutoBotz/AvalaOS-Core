import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';

const createPayload = (projectId, title, assigneeIds = [], dependencyIds = []) => ({
  projectId,
  task: { title, description: '', priority: 'Medium', type: 'Task', assigneeIds, dependencyIds },
});

export async function runLegacyDeliveryRolePolicyPostgres(options = {}) {
  const fixture = await createLegacyDeliveryPostgresFixture({ databaseUrl: options.databaseUrl });
  const x = fixture.ids;
  const setCapabilities = async (roleId, capabilities) => {
    await fixture.db.query('DELETE FROM public.role_capabilities WHERE role_id=$1', [roleId]);
    for (const capability of capabilities) {
      await fixture.db.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2)', [roleId, capability]);
    }
  };
  const command = (action, payload, input = {}) => fixture.callCommand({
    actor: input.actor ?? x.actor,
    version: input.version,
    requestId: input.requestId ?? randomUUID(),
    key: input.key ?? `role-policy-${action}-${randomUUID()}`,
    action,
    payload,
  });
  const create = (title, assigneeIds = [], dependencyIds = [], input = {}) =>
    command('task.create', createPayload(x.project, title, assigneeIds, dependencyIds), input);

  const result = {
    createCapabilityParity: 0,
    adminCapabilityParity: 0,
    assignmentDeniedWithoutAssign: false,
    ownUpdatePersistedScope: false,
    protectedOwnUpdateDenied: false,
    dependencyGuarded: false,
    transitionGuarded: false,
    staleAuthorizationDenied: false,
    revokedAuthorizationDenied: false,
    archivedProjectMutationDenied: false,
  };
  try {
    await fixture.db.query(`INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled)
      VALUES($1,$2,true)`, [x.organization, x.workspace]);

    for (const capability of ['task.create', 'backlog.manage', 'workitems.import', 'project.manage']) {
      await setCapabilities(x.role, [capability]);
      const created = await create(`Create parity: ${capability}`);
      assert.equal(created.ok, true, `${capability} must preserve legacy create authority`);
      result.createCapabilityParity += 1;
    }

    for (const capability of ['org.admin', 'security.manage', 'roles.manage']) {
      await setCapabilities(x.role, [capability]);
      const generationId = randomUUID();
      await fixture.db.query(`INSERT INTO public.document_generations
        (id,org_id,workspace_id,project_id,template_id,artifacts,status,created_by,updated_by,source_process_id,source_assessment_id)
        VALUES($1,$2,$3,$4,'joined-brd-v4',$5::jsonb,'generated',$6,$6,$7,$8)`,
      [generationId, x.organization, x.workspace, x.project, JSON.stringify(fixture.artifacts), x.actor, x.process, x.assessment]);
      const preview = await fixture.callQuery({ sourceGenerationId: generationId });
      assert.equal(preview.ok, true, `${capability} must read the workspace Delivery projection`);
      const imported = await command('import', {
        projectId: x.project,
        sourceGenerationId: generationId,
        expectedSourceDigest: preview.source.digest,
        sourceItemIndices: [0, 1],
      });
      assert.equal(imported.ok, true, `${capability} must preserve admin import equivalence`);
      const created = await create(`Admin parity: ${capability}`);
      assert.equal(created.ok, true);
      const updated = await command('task.update', {
        taskId: created.resource.id,
        expectedVersion: created.resource.version,
        patch: { description: `Updated through ${capability}` },
      });
      assert.equal(updated.ok, true, `${capability} must preserve admin update equivalence`);
      const deleted = await command('task.delete', {
        taskId: created.resource.id,
        expectedVersion: updated.resource.version,
        deletionReason: `Policy check for ${capability}`,
      });
      assert.equal(deleted.ok, true, `${capability} must preserve admin delete equivalence`);
      result.adminCapabilityParity += 1;
    }

    await setCapabilities(x.role, ['task.create']);
    const assignmentBefore = await fixture.snapshot();
    const assignmentDenied = await create('Assignment must be denied', [x.assignee]);
    assert.equal(assignmentDenied.errorCode, 'NOT_FOUND');
    assert.deepEqual(await fixture.snapshot(), assignmentBefore, 'denied assignment must commit no task, receipt or audit');
    result.assignmentDeniedWithoutAssign = true;

    await setCapabilities(x.role, ['task.create', 'task.assign', 'task.update', 'project.manage']);
    const unassigned = await create('Unassigned ownership boundary');
    assert.equal(unassigned.ok, true);
    const unownedUpdate = await command('task.update', {
      taskId: unassigned.resource.id,
      expectedVersion: unassigned.resource.version,
      patch: { description: 'Browser claims cannot create own authority.' },
    }, { actor: x.ownOnly });
    assert.equal(unownedUpdate.errorCode, 'NOT_FOUND');

    const assigned = await create('Persisted assignee boundary', [x.ownOnly]);
    assert.equal(assigned.ok, true);
    const ownedUpdate = await command('task.update', {
      taskId: assigned.resource.id,
      expectedVersion: assigned.resource.version,
      patch: { description: 'Allowed by the persisted assignee binding.' },
    }, { actor: x.ownOnly });
    assert.equal(ownedUpdate.ok, true);
    result.ownUpdatePersistedScope = true;
    const protectedBefore = await fixture.snapshot();
    const protectedDenied = await command('task.update', {
      taskId: assigned.resource.id,
      expectedVersion: ownedUpdate.resource.version,
      patch: { assigneeIds: [] },
    }, { actor: x.ownOnly });
    assert.equal(protectedDenied.errorCode, 'NOT_FOUND');
    assert.deepEqual(await fixture.snapshot(), protectedBefore);
    result.protectedOwnUpdateDenied = true;

    const dependency = await create('Dependency');
    const dependent = await create('Dependent', [], [dependency.resource.id]);
    assert.equal(dependency.ok, true);
    assert.equal(dependent.ok, true);
    const incompleteBefore = await fixture.snapshot();
    const incomplete = await command('task.update', {
      taskId: dependent.resource.id,
      expectedVersion: dependent.resource.version,
      patch: { status: 'In Progress' },
    });
    assert.equal(incomplete.errorCode, 'DEPENDENCY_INCOMPLETE');
    assert.deepEqual(await fixture.snapshot(), incompleteBefore);
    result.dependencyGuarded = true;

    let dependencyVersion = dependency.resource.version;
    for (const status of ['In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done']) {
      const transition = await command('task.update', {
        taskId: dependency.resource.id,
        expectedVersion: dependencyVersion,
        patch: { status },
      });
      assert.equal(transition.ok, true, `expected allowed dependency transition to ${status}`);
      dependencyVersion = transition.resource.version;
    }
    const started = await command('task.update', {
      taskId: dependent.resource.id,
      expectedVersion: dependent.resource.version,
      patch: { status: 'In Progress' },
    });
    assert.equal(started.ok, true);
    const invalidTransition = await command('task.update', {
      taskId: dependent.resource.id,
      expectedVersion: started.resource.version,
      patch: { status: 'Done' },
    });
    assert.equal(invalidTransition.errorCode, 'TRANSITION_DENIED');
    const invalidStatus = await command('task.update', {
      taskId: dependent.resource.id,
      expectedVersion: started.resource.version,
      patch: { status: 'Released' },
    });
    assert.equal(invalidStatus.errorCode, 'INVALID_COMMAND');
    const selfDependency = await command('task.update', {
      taskId: dependent.resource.id,
      expectedVersion: started.resource.version,
      patch: { dependencyIds: [dependent.resource.id] },
    });
    assert.equal(selfDependency.errorCode, 'INVALID_COMMAND');
    result.transitionGuarded = true;

    await setCapabilities(x.role, ['task.create']);
    const staleVersion = await fixture.authorizationVersion(x.actor);
    await setCapabilities(x.role, ['task.create', 'task.read']);
    const changedVersion = await fixture.authorizationVersion(x.actor);
    assert.ok(changedVersion > staleVersion, 'capability changes must advance the authorization version');
    const revocationBefore = await fixture.snapshot();
    const stale = await create('Stale authority must fail', [], [], { version: staleVersion });
    assert.equal(stale.errorCode, 'AUTHORIZATION_STALE');
    assert.deepEqual(await fixture.snapshot(), revocationBefore);
    result.staleAuthorizationDenied = true;
    await setCapabilities(x.role, []);
    const currentVersion = await fixture.authorizationVersion(x.actor);
    assert.ok(currentVersion > changedVersion, 'capability revocation must advance the authorization version');
    const revoked = await create('Revoked authority must fail', [], [], { version: currentVersion });
    assert.equal(revoked.errorCode, 'NOT_FOUND');
    assert.deepEqual(await fixture.snapshot(), revocationBefore);
    result.revokedAuthorizationDenied = true;

    await setCapabilities(x.role, ['task.update', 'task.delete']);
    await fixture.db.query('UPDATE public.projects SET archived_at=statement_timestamp() WHERE id=$1', [x.project]);
    const archivedBefore = await fixture.snapshot();
    const archivedUpdate = await command('task.update', {
      taskId: unassigned.resource.id,
      expectedVersion: unassigned.resource.version,
      patch: { description: 'Archived projects are read-only.' },
    });
    assert.equal(archivedUpdate.errorCode, 'NOT_FOUND');
    const archivedDelete = await command('task.delete', {
      taskId: unassigned.resource.id,
      expectedVersion: unassigned.resource.version,
      deletionReason: 'Archived project denial check',
    });
    assert.equal(archivedDelete.errorCode, 'NOT_FOUND');
    assert.deepEqual(await fixture.snapshot(), archivedBefore, 'archived-project denials must commit no task, receipt or audit');
    result.archivedProjectMutationDenied = true;

    assert.deepEqual(result, {
      createCapabilityParity: 4,
      adminCapabilityParity: 3,
      assignmentDeniedWithoutAssign: true,
      ownUpdatePersistedScope: true,
      protectedOwnUpdateDenied: true,
      dependencyGuarded: true,
      transitionGuarded: true,
      staleAuthorizationDenied: true,
      revokedAuthorizationDenied: true,
      archivedProjectMutationDenied: true,
    });
    return { result: 'passed', policy: result };
  } finally {
    assert.equal(await fixture.close(), true, 'disposable PostgreSQL fixture cleanup must be verified');
  }
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  try { console.log(JSON.stringify(await runLegacyDeliveryRolePolicyPostgres())); }
  catch { console.error('LEGACY_DELIVERY_ROLE_POLICY_FAILED'); process.exitCode = 1; }
}
