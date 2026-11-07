import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';
import { createCommittedStudioFixture } from './studioArtifactPostgresFixture.mjs';

const PROJECT = '97000000-0000-4000-8000-000000000070';
const ASSESSMENT = '97000000-0000-4000-8000-000000000071';
const FOREIGN_PROJECT = '97000000-0000-4000-8000-000000000072';
const CLONE_ASSESSMENT = '97000000-0000-4000-8000-000000000073';
const OTHER_PROCESS = '97000000-0000-4000-8000-000000000074';
const OTHER_PROCESS_ASSESSMENT = '97000000-0000-4000-8000-000000000075';
const FOREIGN_ORGANIZATION = '97000000-0000-4000-8000-000000000076';
const FOREIGN_WORKSPACE = '97000000-0000-4000-8000-000000000077';
const FOREIGN_TENANT_PROJECT = '97000000-0000-4000-8000-000000000078';
const CLONE_PROJECT = '97000000-0000-4000-8000-000000000079';
const OUTCOME_APPROVER = '97000000-0000-4000-8000-000000000080';
const OUTCOME_OWN_ONLY = '97000000-0000-4000-8000-000000000081';
const OUTCOME_OWN_ONLY_ROLE = '97000000-0000-4000-8000-000000000082';
const WORK_ITEMS = [
  { proposalRole: 'coordination', type: 'Epic', title: 'Human approved outcome path', description: 'Exact structured grouping.', acceptanceCriteria: [], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
    { sectionId: 'controls', sectionTitle: 'Controls', requirementText: 'NFR-1: Monitor shall read the exact imported-task ancestry.' },
  ] },
  { proposalRole: 'implementation', type: 'Task', title: 'Record an explicit outcome', description: 'The delivery owner records the result.', acceptanceCriteria: ['Monitor reads the exact imported-task ancestry'], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
  ] },
  { proposalRole: 'verification', type: 'Task', title: 'Verify the explicit outcome', description: 'The delivery verifier confirms the recorded result.', acceptanceCriteria: ['The recorded outcome is independently verified.'], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
  ] },
];
const DISCOVERY_QUESTION = 'Open question: The design must choose an unspecified API?';
const SCOPE_QUESTION = 'Open question: Must the unknown write operation remain in implementation scope?';
const DISCOVERY_WORK_ITEMS = [
  { proposalRole: 'coordination', type: 'Epic', title: 'Coordinate discovery-bound outcome', description: 'Coordinate the approved planning scope.', acceptanceCriteria: [], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
  ] },
  { proposalRole: 'discovery', type: 'Task', title: 'Resolve the unspecified API', description: 'Resolve the exact approved question.', acceptanceCriteria: [
    'Record an accepted source-backed answer or an independently approved nonblocking scope.',
  ], requirementLinks: [
    { sectionId: 'openQuestionsAndProposals', sectionTitle: 'Open questions and proposals', requirementText: DISCOVERY_QUESTION },
  ] },
  { proposalRole: 'implementation', type: 'Story', title: 'Implement the explicit outcome', description: 'Deliver only after discovery releases the blocker.', acceptanceCriteria: [
    'Monitor reads the exact imported-task ancestry',
  ], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
  ], dependencyProposalIndices: [1] },
  { proposalRole: 'discovery', type: 'Task', title: 'Resolve the unknown write scope', description: 'Resolve the exact approved scope question.', acceptanceCriteria: [
    'Record an accepted source-backed answer or an independently approved nonblocking scope.',
  ], requirementLinks: [
    { sectionId: 'openQuestionsAndProposals', sectionTitle: 'Open questions and proposals', requirementText: SCOPE_QUESTION },
  ] },
  { proposalRole: 'implementation', type: 'Task', title: 'Implement the bounded write scope', description: 'Deliver only after scope discovery releases the blocker.', acceptanceCriteria: [
    'The bounded implementation excludes unresolved operations.',
  ], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-2: The implementation must retain only independently approved scope.' },
  ], dependencyProposalIndices: [3] },
  { proposalRole: 'verification', type: 'Task', title: 'Verify the discovery-bound outcome', description: 'Verify the bounded implementation.', acceptanceCriteria: [
    'The approved outcome is independently verified.',
  ], requirementLinks: [
    { sectionId: 'summary', sectionTitle: 'Summary', requirementText: 'BR-1: The delivery owner must record an explicit outcome.' },
  ] },
];
const APPROVED_STUDIO_CONTENT = {
  title: 'Exact approved fixture BRD',
  summary: 'Approved summary retained only as exact Studio source metadata.',
  sections: [
    { id: 'summary', title: 'Summary', body: 'BR-1: The delivery owner must record an explicit outcome.\nBR-2: The implementation must retain only independently approved scope.', sourceAnchors: [], labels: ['human_authored'], citations: ['fixture-source-summary'] },
    { key: 'controls', title: 'Controls', content: 'NFR-1: Monitor shall read the exact imported-task ancestry.', citations: ['fixture-source-controls'] },
    { id: 'openQuestionsAndProposals', title: 'Open questions and proposals', body: `${DISCOVERY_QUESTION}\n${SCOPE_QUESTION}`, citations: [] },
    { id: 'asIsFlow', title: 'As-Is Flow', body: 'flowchart TD\nA[Operator must review] --> B[Complete]', citations: [] },
  ],
};

const errorCode = result => result?.errorCode ?? result?.error?.code;
let stage = 'startup';

async function verifyDirtyMarkerRollback() {
  stage = 'dirty-fixture-create';
  const fixture = await createLegacyDeliveryPostgresFixture({ throughMigration: '20261010025331_legacy_delivery_authority.sql', seed: false });
  try {
    stage = 'dirty-marker-mutate';
    await fixture.db.query('ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check');
    await fixture.db.query("UPDATE public.hosted_pilot_environment_identity SET migration_tip='dirty-history' WHERE singleton");
    await fixture.db.query("ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='dirty-history')");
    const sql = await readFile('supabase/migrations/20261010051100_authenticated_studio_delivery_outcome_monitor.sql', 'utf8');
    stage = 'dirty-migration-reject';
    await fixture.db.query('BEGIN');
    await assert.rejects(() => fixture.db.query(sql), /STUDIO_DELIVERY_SOURCE_MISMATCH/);
    await fixture.db.query('ROLLBACK');
    assert.equal((await fixture.db.query("SELECT to_regclass('public.studio_delivery_publications') value")).rows[0].value, null,
      'preflight failure must roll back every schema effect');
    assert.equal((await fixture.db.query('SELECT migration_tip FROM public.hosted_pilot_environment_identity WHERE singleton')).rows[0].migration_tip, 'dirty-history');
  } finally { await fixture.close(); }
}
const call = async (fixture, actor, org, workspace, authorizationVersion, action, payload, key = `${action}-${randomUUID()}`, requestId = randomUUID()) => (
  await fixture.asRole('service_role', () => fixture.db.query(
    'SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
    [actor, org, workspace, authorizationVersion, requestId, key, action, JSON.stringify(payload)],
  ))
).rows[0].value;

const queryOutcomes = async (fixture, actor, org, workspace, authorizationVersion, projectId) => (
  await fixture.asRole('service_role', () => fixture.db.query(
    'SELECT public.studio_delivery_outcome_query($1,$2,$3,$4,$5,100,NULL) value',
    [actor, org, workspace, authorizationVersion, projectId],
  ))
).rows[0].value;
const queryLatestPack = async (fixture, actor, org, workspace, authorizationVersion, projectId) => (
  await fixture.asRole('service_role', () => fixture.db.query(
    'SELECT public.studio_delivery_pack_snapshot_query($1,$2,$3,$4,$5) value',
    [actor, org, workspace, authorizationVersion, projectId],
  ))
).rows[0].value;
const queryAssignees = async (fixture, actor, org, workspace, authorizationVersion, projectId) => (
  await fixture.asRole('service_role', () => fixture.db.query(
    'SELECT public.studio_delivery_assignee_query($1,$2,$3,$4,$5) value',
    [actor, org, workspace, authorizationVersion, projectId],
  ))
).rows[0].value;

const snapshot = async db => (await db.query(`SELECT
  (SELECT count(*)::int FROM public.studio_delivery_publications) publications,
  (SELECT count(*)::int FROM public.studio_delivery_work_item_requirement_bindings) requirement_bindings,
  (SELECT count(*)::int FROM public.document_generations WHERE studio_delivery_publication_id IS NOT NULL) documents,
  (SELECT count(*)::int FROM public.studio_delivery_command_receipts) receipts,
  (SELECT count(*)::int FROM public.legacy_delivery_outcome_versions) outcome_versions,
  (SELECT count(*)::int FROM public.legacy_delivery_pack_snapshots) pack_snapshots,
  (SELECT count(*)::int FROM public.privileged_audit_events WHERE action IN('studio.approved-artifact.publish','delivery.outcome.record','delivery.pack.snapshot')) audits`)).rows[0];

const approveArtifact = async (db, x) => {
  const sequence = [
    ['studio.artifact.review.submit', x.requester, { artifactId: x.artifactId, artifactVersionId: x.version.id }],
    ['studio.artifact.review.assign', x.requester, { artifactId: x.artifactId, artifactVersionId: x.version.id, reviewerId: x.reviewer }],
    ['studio.artifact.review.resolve', x.reviewer, { artifactId: x.artifactId, artifactVersionId: x.version.id, outcome: 'approve', rationale: 'Independent fixture review', conditions: [] }],
    ['studio.artifact.approval.resolve', x.approver, { artifactId: x.artifactId, artifactVersionId: x.version.id, outcome: 'approve', rationale: 'Independent fixture approval', conditions: [] }],
  ];
  let aggregateVersion = Number(x.aggregate.aggregate_version);
  for (const [commandType, actor, payload] of sequence) {
    const currentAuthorizationVersion = Number((await db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, actor],
    )).rows[0].version);
    const command = { commandType, requestId: randomUUID(), idempotencyKey: `studio-delivery-${commandType}-${randomUUID()}`,
      organizationId: x.org, workspaceId: x.workspace, actorId: actor, authorizationVersion: currentAuthorizationVersion,
      expectedAggregateVersion: aggregateVersion, expectedArtifactVersion: Number(x.version.version), payload };
    const result = (await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) result', [JSON.stringify(command)])).rows[0].result;
    assert.equal(result.outcome, 'committed', `${commandType} must commit`);
    aggregateVersion += 1;
  }
  const approved = (await db.query('SELECT aggregate_version,lifecycle,current_approved_version_id FROM public.studio_artifact_aggregates WHERE id=$1', [x.artifactId])).rows[0];
  assert.equal(approved.lifecycle, 'approved');
  assert.equal(approved.current_approved_version_id, x.version.id);
  return Number(approved.aggregate_version);
};

const reviseArtifactForPublication = async (db, x) => {
  const command = {
    commandType: 'studio.artifact.draft.revise', requestId: randomUUID(), idempotencyKey: `studio-delivery-revise-${randomUUID()}`,
    organizationId: x.org, workspaceId: x.workspace, actorId: x.requester, authorizationVersion: x.authorizationVersions[x.requester],
    expectedAggregateVersion: Number(x.aggregate.aggregate_version), expectedArtifactVersion: Number(x.version.version),
    payload: { artifactId: x.artifactId, parentVersionId: x.version.id, content: APPROVED_STUDIO_CONTENT },
  };
  const revised = (await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) result', [JSON.stringify(command)])).rows[0].result;
  assert.equal(revised.outcome, 'committed', 'publication fixture revision must commit through the Studio command');
  const aggregate = (await db.query('SELECT aggregate_version,current_version_id,lifecycle FROM public.studio_artifact_aggregates WHERE id=$1', [x.artifactId])).rows[0];
  const version = (await db.query('SELECT id,version,content,content_hash FROM public.studio_artifact_versions WHERE id=$1', [aggregate.current_version_id])).rows[0];
  assert.deepEqual(version.content, APPROVED_STUDIO_CONTENT, 'publication must use the exact revised Studio content');
  return { ...x, aggregate, version };
};

async function verifyPredecessorDiscoveryCompletionBug() {
  stage = 'predecessor-reproduction-create';
  const fixture = await createLegacyDeliveryPostgresFixture({ throughMigration: '20261106210205_studio_sdd_pdf_branch_routing.sql', seed: false });
  try {
    const generated = await createCommittedStudioFixture(fixture.db, 'brd');
    const x = await reviseArtifactForPublication(fixture.db, generated);
    await fixture.db.query(`INSERT INTO public.assessments(id,process_id,org_id,workspace_id,status,score_version,created_by,updated_by)
      VALUES($1,$2,$3,$4,'Approved','assess-core-2026-05',$5,$5)`, [ASSESSMENT, x.process, x.org, x.workspace, x.requester]);
    await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id,source_assessment_id)
      VALUES($1,$2,$3,'Predecessor discovery reproduction',$4,$4,$4,$5,$6)`, [CLONE_PROJECT, x.org, x.workspace, x.requester, x.process, ASSESSMENT]);
    for (const capability of ['assess.read','studio.artifacts.publish','workitems.import','task.read','task.update','backlog.read','project.manage']) {
      await fixture.db.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2) ON CONFLICT DO NOTHING', [x.role, capability]);
    }
    await fixture.db.query(`INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled)
      VALUES($1,$2,true,true,true)`, [x.org, x.workspace]);
    await fixture.db.query('INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true)', [x.org, x.workspace]);
    const aggregateVersion = await approveArtifact(fixture.db, x);
    const authorizationVersion = Number((await fixture.db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester],
    )).rows[0].version);
    const published = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', {
        artifactId: x.artifactId, expectedArtifactVersionId: x.version.id, expectedAggregateVersion: aggregateVersion,
        projectId: CLONE_PROJECT, workItems: DISCOVERY_WORK_ITEMS,
      }, `predecessor-discovery-publish-${randomUUID()}`);
    assert.equal(published.ok, true, JSON.stringify(published));
    const source = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,100,NULL,$6,true) value',
      [x.requester, x.org, x.workspace, authorizationVersion, CLONE_PROJECT, published.resource.documentGenerationId],
    ))).rows[0].value.source;
    const imported = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
      [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `predecessor-discovery-import-${randomUUID()}`, 'import', JSON.stringify({
        projectId: CLONE_PROJECT, sourceGenerationId: published.resource.documentGenerationId,
        expectedSourceDigest: source.digest, sourceItemIndices: [1, 2],
      })],
    ))).rows[0].value;
    assert.equal(imported.ok, true, JSON.stringify(imported));
    const projection = await fixture.callQuery({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, projectId: CLONE_PROJECT, sourceGenerationId: published.resource.documentGenerationId });
    let discovery = projection.items.find(item => item.sourceLineage.sourceItemIndex === 1);
    const dependent = projection.items.find(item => item.sourceLineage.sourceItemIndex === 2);
    assert.ok(discovery && dependent && dependent.dependencyIds.includes(discovery.id), 'predecessor fixture must preserve the discovery dependency edge');
    for (const status of ['In Progress','In Review','Testing','Ready for Release','Done']) {
      const advanced = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
        version: authorizationVersion, key: `predecessor-discovery-${status}-${randomUUID()}`, action: 'task.update',
        payload: { taskId: discovery.id, expectedVersion: discovery.version, patch: { status } } });
      assert.equal(advanced.ok, true, `predecessor unexpectedly guarded unresolved discovery ${status}: ${JSON.stringify(advanced)}`);
      discovery = advanced.resource;
    }
    const released = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `predecessor-dependent-${randomUUID()}`, action: 'task.update',
      payload: { taskId: dependent.id, expectedVersion: dependent.version, patch: { status: 'In Progress' } } });
    assert.equal(released.ok, true, `predecessor must reproduce the original Done-only dependency release: ${JSON.stringify(released)}`);
    console.log('STUDIO DELIVERY PREDECESSOR REPRO unresolved discovery reached Done and released dependent work without an accepted answer or approved scope');
  } finally { await fixture.close(); }
}

async function run() {
  stage = 'dirty-marker';
  await verifyDirtyMarkerRollback();
  stage = 'predecessor-reproduction';
  await verifyPredecessorDiscoveryCompletionBug();
  stage = 'fixture-create';
  const fixture = await createLegacyDeliveryPostgresFixture({
    throughMigration: '20261107120000_planning_discovery_resolution.sql',
    seed: false,
  });
  try {
    stage = 'forward-routine-authority';
    const routineAuthority = (await fixture.db.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,
      p.provolatile,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
      FROM pg_proc p WHERE p.oid=ANY(ARRAY[
       'public.studio_delivery_discovery_resolution_valid(public.delivery_work_items,public.studio_delivery_publications,jsonb,uuid,bigint)'::regprocedure,
       'public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid)'::regprocedure])
      ORDER BY p.proname`)).rows;
    assert.deepEqual(routineAuthority, [{
      proname: 'studio_delivery_discovery_resolution_valid', owner: 'postgres', prosecdef: true,
      provolatile: 's', proconfig: ['search_path=""'], anon_execute: false,
      authenticated_execute: false, service_execute: false,
    }, {
      proname: 'studio_delivery_outcome_query', owner: 'postgres', prosecdef: true,
      provolatile: 'v', proconfig: ['search_path=""'], anon_execute: false,
      authenticated_execute: false, service_execute: true,
    }], 'forward repair must preserve owner, security, search-path, volatility and exact routine ACLs');
    stage = 'fixture-seed';
    const generated = await createCommittedStudioFixture(fixture.db, 'brd');
    const x = await reviseArtifactForPublication(fixture.db, generated);
    await fixture.db.query(`UPDATE public.profiles SET full_name=CASE id WHEN $1 THEN 'Delivery owner' WHEN $2 THEN 'Delivery reviewer'
      WHEN $3 THEN 'Delivery approver' ELSE full_name END WHERE id=ANY($4::uuid[])`, [x.requester, x.reviewer, x.approver, [x.requester, x.reviewer, x.approver]]);
    await fixture.db.query(`INSERT INTO public.assessments(id,process_id,org_id,workspace_id,status,score_version,created_by,updated_by)
      VALUES($1,$2,$3,$4,'Approved','assess-core-2026-05',$5,$5),
       ($6,$2,$3,$4,'Approved','assess-core-2026-05',$5,$5)`, [ASSESSMENT, x.process, x.org, x.workspace, x.requester, CLONE_ASSESSMENT]);
    await fixture.db.query(`INSERT INTO public.assess_processes(id,org_id,workspace_id,name,status,created_by,updated_by)
      VALUES($1,$2,$3,'Unrelated source process','Draft',$4,$4)`, [OTHER_PROCESS, x.org, x.workspace, x.requester]);
    await fixture.db.query(`INSERT INTO public.assessments(id,process_id,org_id,workspace_id,status,score_version,created_by,updated_by)
      VALUES($1,$2,$3,$4,'Approved','assess-core-2026-05',$5,$5)`, [OTHER_PROCESS_ASSESSMENT, OTHER_PROCESS, x.org, x.workspace, x.requester]);
    await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id,source_assessment_id)
      VALUES($1,$2,$3,'Studio Delivery authority',$4,$4,$4,$5,$6)`, [PROJECT, x.org, x.workspace, x.requester, x.process, ASSESSMENT]);
    await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by,source_process_id,source_assessment_id)
      VALUES($1,$2,$3,'Matching clone publication',$4,$4,$4,$5,$6)`, [CLONE_PROJECT, x.org, x.workspace, x.requester, x.process, ASSESSMENT]);
    await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by)
      VALUES($1,$2,$3,'Empty same-tenant selector',$4,$4,$4)`, [FOREIGN_PROJECT, x.org, x.workspace, x.requester]);
    await fixture.db.query(`INSERT INTO public.organizations(id,name,slug) VALUES($1,'Foreign Studio Delivery fixture','foreign-studio-delivery-fixture')`, [FOREIGN_ORGANIZATION]);
    await fixture.db.query(`INSERT INTO public.workspaces(id,org_id,name,slug) VALUES($1,$2,'Foreign Studio Delivery workspace','foreign-studio-delivery-workspace')`, [FOREIGN_WORKSPACE, FOREIGN_ORGANIZATION]);
    await fixture.db.query(`INSERT INTO public.projects(id,org_id,workspace_id,name,owner_id,created_by,updated_by)
      VALUES($1,$2,$3,'Foreign tenant selector',$4,$4,$4)`, [FOREIGN_TENANT_PROJECT, FOREIGN_ORGANIZATION, FOREIGN_WORKSPACE, x.requester]);
    for (const capability of ['assess.read','studio.artifacts.publish','delivery.outcomes.record','delivery.outcomes.read','delivery.pack.snapshot','workitems.import','task.read','task.update','backlog.read','project.manage']) {
      await fixture.db.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2) ON CONFLICT DO NOTHING', [x.role, capability]);
    }
    await fixture.db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
      SELECT DISTINCT assigned.role_id,capability FROM(
       SELECT role_id FROM public.organization_members WHERE org_id=$1 AND user_id=ANY($2::uuid[])
       UNION SELECT role_id FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$3 AND user_id=ANY($2::uuid[]) AND role_id IS NOT NULL
      ) assigned CROSS JOIN unnest(ARRAY['delivery.outcomes.record','delivery.outcomes.read','project.manage']) capability
      ON CONFLICT DO NOTHING`, [x.org, [x.reviewer,x.approver], x.workspace]);
    const aggregateVersion = await approveArtifact(fixture.db, x);
    await fixture.db.query('UPDATE public.organization_members SET role_id=$1 WHERE org_id=$2 AND user_id=ANY($3::uuid[])',
      [x.role, x.org, [x.reviewer,x.approver]]);
    let authorizationVersion = Number((await fixture.db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester])).rows[0].version);
    const before = await snapshot(fixture.db);
    stage = 'assignee-directory';
    const directory = await queryAssignees(fixture, x.requester, x.org, x.workspace, authorizationVersion, PROJECT);
    assert.equal(directory.ok, true, JSON.stringify(directory)); assert.equal(directory.schemaVersion, 'studio-delivery-assignee-query.v1');
    assert.equal(directory.projectId, PROJECT); assert.equal(directory.items.length, 3);
    assert.deepEqual(directory.items.map(item => item.displayName), ['Delivery approver', 'Delivery owner', 'Delivery reviewer']);
    assert.ok(directory.items.every(item => JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['displayName','id'])),
      'assignee projection must expose IDs and display names only');
    stage = 'assignee-directory-inactive-filter';
    await fixture.db.query("UPDATE public.workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3", [x.org, x.workspace, x.reviewer]);
    const withoutInactive = await queryAssignees(fixture, x.requester, x.org, x.workspace, authorizationVersion, PROJECT);
    assert.equal(withoutInactive.items.some(item => item.id === x.reviewer), false, 'inactive members must be excluded');
    await fixture.db.query("UPDATE public.workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3", [x.org, x.workspace, x.reviewer]);
    stage = 'assignee-directory-foreign';
    assert.equal(errorCode(await queryAssignees(fixture, x.requester, x.org, x.workspace, authorizationVersion, FOREIGN_TENANT_PROJECT)), 'NOT_FOUND');
    stage = 'assignee-directory-stale';
    assert.equal(errorCode(await queryAssignees(fixture, x.requester, x.org, x.workspace, authorizationVersion + 1, PROJECT)), 'AUTHORIZATION_STALE');
    stage = 'assignee-directory-unauthorized';
    await fixture.db.query('BEGIN');
    try {
      await fixture.db.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key=ANY($2::text[])",
        [x.role, ['org.admin','security.manage','roles.manage','task.assign','project.manage']]);
      const deniedVersion = Number((await fixture.db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester])).rows[0].version);
      assert.equal(errorCode(await queryAssignees(fixture, x.requester, x.org, x.workspace, deniedVersion, PROJECT)), 'NOT_FOUND');
      await fixture.db.query('ROLLBACK');
    } catch (error) { await fixture.db.query('ROLLBACK'); throw error; }
    assert.deepEqual(await snapshot(fixture.db), before, 'assignee projections and denials must perform zero writes');
    authorizationVersion = Number((await fixture.db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester],
    )).rows[0].version);
    stage = 'default-off';
    const off = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', {
      artifactId: x.artifactId, expectedArtifactVersionId: x.version.id, expectedAggregateVersion: aggregateVersion, projectId: PROJECT, workItems: WORK_ITEMS,
    }, 'publish-off');
    assert.equal(errorCode(off), 'FEATURE_DISABLED');
    assert.deepEqual(await snapshot(fixture.db), before, 'default-off denial must leave no effect, receipt, or audit');
    const packOff = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: PROJECT }, 'pack-off');
    assert.equal(errorCode(packOff), 'FEATURE_DISABLED');
    assert.deepEqual(await snapshot(fixture.db), before, 'default-off pack denial must leave no effect, receipt, or audit');

    await fixture.db.query(`INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled)
      VALUES($1,$2,true,true,true)`, [x.org, x.workspace]);
    await fixture.db.query('INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true)', [x.org, x.workspace]);
    const publishPayload = { artifactId: x.artifactId, expectedArtifactVersionId: x.version.id, expectedAggregateVersion: aggregateVersion, projectId: PROJECT, workItems: WORK_ITEMS };
    const beforeSourceDenials = await snapshot(fixture.db);
    stage = 'publish-clone-assessment-mismatch';
    await fixture.db.query(`UPDATE public.assess_v2_cases SET source_v1_assessment_id=$1,source_v1_score_version='assess-core-2026-05' WHERE id=$2`, [CLONE_ASSESSMENT, x.caseId]);
    const cloneAssessmentMismatch = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', publishPayload, `clone-assessment-mismatch-${randomUUID()}`);
    assert.equal(errorCode(cloneAssessmentMismatch), 'NOT_FOUND');
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'cloned V2 assessment mismatch must leave no publication, generation, receipt, or audit effect');
    stage = 'publish-clone-score-version-mismatch';
    await fixture.db.query(`UPDATE public.assess_v2_cases SET source_v1_assessment_id=$1,source_v1_score_version='assess-core-2025-01' WHERE id=$2`, [ASSESSMENT, x.caseId]);
    const cloneScoreMismatch = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', publishPayload, `clone-score-mismatch-${randomUUID()}`);
    assert.equal(errorCode(cloneScoreMismatch), 'NOT_FOUND');
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'cloned V2 score-version mismatch must leave no publication, generation, receipt, or audit effect');
    stage = 'publish-matching-clone';
    await fixture.db.query('BEGIN');
    try {
      await fixture.db.query(`UPDATE public.assess_v2_cases SET source_v1_assessment_id=$1,source_v1_score_version='assess-core-2026-05' WHERE id=$2`, [ASSESSMENT, x.caseId]);
      await fixture.db.query('SET LOCAL ROLE service_role');
      const matchingClone = (await fixture.db.query(
        'SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `matching-clone-${randomUUID()}`,
          'studio.approved-artifact.publish', JSON.stringify({ ...publishPayload, projectId: CLONE_PROJECT })],
      )).rows[0].value;
      await fixture.db.query('RESET ROLE');
      stage = `publish-matching-clone-${matchingClone.ok === true ? 'ok' : errorCode(matchingClone) ?? 'unknown'}`;
      assert.equal(matchingClone.ok, true, 'matching cloned V2 source and score version must publish');
      assert.equal(matchingClone.resource.sourceAssessmentId, ASSESSMENT);
      const cloneBinding = (await fixture.db.query(`SELECT publication.source_case_id,
          publication.source_assessment_id publication_source_assessment_id,document.source_assessment_id document_source_assessment_id
        FROM public.studio_delivery_publications publication JOIN public.document_generations document ON document.id=publication.document_generation_id
        WHERE publication.id=$1`, [matchingClone.resource.publicationId])).rows[0];
      assert.deepEqual(cloneBinding, { source_case_id: x.caseId, publication_source_assessment_id: ASSESSMENT, document_source_assessment_id: ASSESSMENT });
      await fixture.db.query('ROLLBACK');
    } catch (error) {
      await fixture.db.query('ROLLBACK');
      throw error;
    }
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'rollback-contained matching clone proof must leave the main scenario unchanged');
    stage = 'publish-different-process-anchor';
    await fixture.db.query('UPDATE public.assess_v2_cases SET source_v1_assessment_id=NULL,source_v1_score_version=NULL WHERE id=$1', [x.caseId]);
    await fixture.db.query('UPDATE public.projects SET source_assessment_id=$2 WHERE id=$1', [PROJECT, OTHER_PROCESS_ASSESSMENT]);
    const differentProcess = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', publishPayload, `different-process-${randomUUID()}`);
    assert.equal(errorCode(differentProcess), 'NOT_FOUND');
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'different-process project anchor must leave no publication, generation, receipt, or audit effect');
    await fixture.db.query('UPDATE public.projects SET source_assessment_id=$2 WHERE id=$1', [PROJECT, ASSESSMENT]);
    stage = 'publish-foreign-project';
    const foreignProject = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', { ...publishPayload, projectId: FOREIGN_TENANT_PROJECT }, `foreign-project-${randomUUID()}`);
    assert.equal(errorCode(foreignProject), 'NOT_FOUND');
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'foreign-tenant project selector must leave no publication, generation, receipt, or audit effect');
    stage = 'publish-malformed-approved-content';
    await fixture.db.query('BEGIN');
    try {
      const malformed = { title: 'Malformed approved content', sections: [{ title: 'Missing stable key', body: 'Must not materialize.' }] };
      await fixture.db.query('ALTER TABLE public.studio_artifact_versions DISABLE TRIGGER USER');
      await fixture.db.query(`UPDATE public.studio_artifact_versions SET content=$2::jsonb,
        content_hash=encode(public.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex') WHERE id=$1`, [x.version.id, JSON.stringify(malformed)]);
      await fixture.db.query('ALTER TABLE public.studio_artifact_versions ENABLE TRIGGER USER');
      await fixture.db.query('SET LOCAL ROLE service_role');
      const malformedResult = (await fixture.db.query(
        'SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `malformed-content-${randomUUID()}`,
          'studio.approved-artifact.publish', JSON.stringify({ ...publishPayload, projectId: CLONE_PROJECT })],
      )).rows[0].value;
      await fixture.db.query('RESET ROLE');
      assert.equal(errorCode(malformedResult), 'NOT_FOUND');
      assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'malformed approved content must fail closed with zero effect');
      await fixture.db.query('ROLLBACK');
    } catch (error) {
      await fixture.db.query('ROLLBACK');
      throw error;
    }
    stage = 'publish';
    const invalidRequirement = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', {
      ...publishPayload, workItems: [{ ...WORK_ITEMS[1], requirementLinks: [{ ...WORK_ITEMS[1].requirementLinks[0], requirementText: 'FR-999: Invented evidence must never be accepted.' }] }],
    }, `invalid-requirement-${randomUUID()}`);
    assert.equal(errorCode(invalidRequirement), 'INVALID_COMMAND');
    assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials, 'invented requirement links must roll back publication, receipt, generation and audit');
    for (const excludedLink of [
      { sectionId: 'openQuestionsAndProposals', sectionTitle: 'Open questions and proposals', requirementText: 'Open question: The design must choose an unspecified API?' },
      { sectionId: 'asIsFlow', sectionTitle: 'As-Is Flow', requirementText: 'A[Operator must review] --> B[Complete]' },
    ]) {
      const excluded = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', {
        ...publishPayload, workItems: [{ ...WORK_ITEMS[1], requirementLinks: [excludedLink] }],
      }, `excluded-requirement-${randomUUID()}`);
      assert.equal(errorCode(excluded), 'INVALID_COMMAND');
      assert.deepEqual(await snapshot(fixture.db), beforeSourceDenials,
        'questions, proposals and Mermaid flow text must never materialize as confirmed requirements');
    }
    const publishKey = `publish-${randomUUID()}`;
    const publishRequestId = randomUUID();
    const published = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, publishKey, publishRequestId);
    stage = 'publish-result';
    assert.equal(published.ok, true); assert.equal(published.outcome, 'committed'); assert.equal(published.resource.workItemCount, WORK_ITEMS.length);
    const afterPublish = await snapshot(fixture.db);
    stage = 'publish-counts';
    assert.deepEqual(afterPublish, { publications: 1, requirement_bindings: WORK_ITEMS.length, documents: 1, receipts: 1, outcome_versions: 0, pack_snapshots: 0, audits: 1 });
    const replay = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, publishKey, publishRequestId);
    stage = 'publish-replay';
    assert.equal(replay.outcome, 'replayed', JSON.stringify(replay)); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const reorderedReplay = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', {
      ...publishPayload, workItems: [{ ...WORK_ITEMS[0], requirementLinks: [...WORK_ITEMS[0].requirementLinks].reverse() }, WORK_ITEMS[1], WORK_ITEMS[2]],
    }, publishKey, publishRequestId);
    assert.equal(reorderedReplay.outcome, 'replayed', 'requirement-link presentation order must not mint a new proposal origin');
    assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const changed = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', { ...publishPayload, workItems: [{ ...WORK_ITEMS[0], title: 'Changed' }] }, publishKey, publishRequestId);
    stage = 'publish-conflict';
    assert.equal(errorCode(changed), 'IDEMPOTENCY_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const duplicateVersion = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, `new-${randomUUID()}`);
    stage = 'publish-duplicate';
    assert.equal(errorCode(duplicateVersion), 'VERSION_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const bound = (await fixture.db.query('SELECT artifacts,source_assessment_id,studio_artifact_version_id,studio_work_item_digest FROM public.document_generations WHERE id=$1', [published.resource.documentGenerationId])).rows[0];
    stage = 'publish-bound-values';
    assert.equal(bound.artifacts.schemaVersion, 'studio-approved-work-items.v1'); assert.equal(bound.artifacts.workItems.length, WORK_ITEMS.length);
    assert.deepEqual(bound.artifacts.brd, { title: APPROVED_STUDIO_CONTENT.title, sections: [
      { key: 'summary', title: 'Summary', content: 'BR-1: The delivery owner must record an explicit outcome.\nBR-2: The implementation must retain only independently approved scope.' },
      { key: 'controls', title: 'Controls', content: 'NFR-1: Monitor shall read the exact imported-task ancestry.' },
      { key: 'openQuestionsAndProposals', title: 'Open questions and proposals', content: `${DISCOVERY_QUESTION}\n${SCOPE_QUESTION}` },
      { key: 'asIsFlow', title: 'As-Is Flow', content: 'flowchart TD\nA[Operator must review] --> B[Complete]' },
    ] }, 'legacy primary document must map exact approved title and ordered section text');
    assert.deepEqual(bound.artifacts.approvedStudioContent, APPROVED_STUDIO_CONTENT, 'exact approved Studio content and citation/source metadata must remain immutable in the generation');
    assert.equal(bound.artifacts.source.artifactVersionId, x.version.id); assert.equal(bound.artifacts.source.caseId, x.caseId);
    assert.equal(bound.source_assessment_id, ASSESSMENT, 'legacy Docs generation must retain the exact project assessment anchor');
    assert.equal(bound.studio_artifact_version_id, x.version.id); assert.equal(bound.studio_work_item_digest, published.resource.workItemDigest);
    const requirementBindings = (await fixture.db.query(`SELECT source_item_index,proposal_origin_id,proposal_role,requirement_links,
      studio_artifact_id,studio_artifact_version_id,studio_artifact_version
      FROM public.studio_delivery_work_item_requirement_bindings WHERE publication_id=$1 ORDER BY source_item_index`, [published.resource.publicationId])).rows;
    assert.equal(requirementBindings.length, WORK_ITEMS.length, 'every published proposal must retain one immutable server-validated requirement binding');
    assert.ok(requirementBindings.every(binding => /^sha256:[0-9a-f]{64}$/u.test(binding.proposal_origin_id)));
    assert.deepEqual(requirementBindings.map(binding => binding.proposal_role), WORK_ITEMS.map(item => item.proposalRole));
    assert.deepEqual(requirementBindings[1].requirement_links, WORK_ITEMS[1].requirementLinks);
    assert.equal(requirementBindings[1].studio_artifact_id, x.artifactId);
    assert.equal(requirementBindings[1].studio_artifact_version_id, x.version.id);
    assert.equal(Number(requirementBindings[1].studio_artifact_version), Number(x.version.version));
    const originDomain = (await fixture.db.query(`SELECT
      public.studio_delivery_stable_proposal_origin($1,$2,$3::jsonb) same_artifact,
      public.studio_delivery_stable_proposal_origin($4,$2,$3::jsonb) distinct_artifact`,
    [x.artifactId, WORK_ITEMS[1].proposalRole, JSON.stringify(WORK_ITEMS[1].requirementLinks), randomUUID()])).rows[0];
    assert.equal(originDomain.same_artifact, requirementBindings[1].proposal_origin_id,
      'future revisions of the same artifact and declared requirement retain the same proposal origin');
    assert.notEqual(originDomain.distinct_artifact, originDomain.same_artifact,
      'identical requirement text from a distinct approved artifact must retain a distinct proposal origin');
    const revisedQuoteOrigin = (await fixture.db.query(`SELECT public.studio_delivery_stable_proposal_origin($1,$2,$3::jsonb) value`, [
      x.artifactId, WORK_ITEMS[1].proposalRole, JSON.stringify([{ sectionId: 'summary', sectionTitle: 'Renamed summary',
        requirementText: 'BR-1: Revised approved wording keeps the declared requirement identity.' }]),
    ])).rows[0].value;
    assert.equal(revisedQuoteOrigin, requirementBindings[1].proposal_origin_id,
      'section-title or quote edits must not mint a duplicate when the artifact, section and stable requirement ID are unchanged');
    const typeIndependentOrigins = (await fixture.db.query(`SELECT
      public.studio_delivery_stable_proposal_origin($1,'implementation',$2::jsonb) implementation,
      public.studio_delivery_stable_proposal_origin($1,'verification',$2::jsonb) verification`,
    [x.artifactId, JSON.stringify(WORK_ITEMS[1].requirementLinks)])).rows[0];
    assert.equal(typeIndependentOrigins.implementation, requirementBindings[1].proposal_origin_id,
      'an allowed Story-to-Task edit must preserve the immutable implementation origin');
    assert.notEqual(typeIndependentOrigins.verification, typeIndependentOrigins.implementation,
      'verification remains distinct from implementation even when type and requirement links match');
    assert.equal(typeIndependentOrigins.verification, requirementBindings[2].proposal_origin_id,
      'same-type proposals with identical requirement links publish under distinct immutable roles');
    const nativeSource = (await fixture.db.query('SELECT source_v1_assessment_id,source_v1_score_version FROM public.assess_v2_cases WHERE id=$1', [x.caseId])).rows[0];
    assert.deepEqual(nativeSource, { source_v1_assessment_id: null, source_v1_score_version: null }, 'native V2 publication must not manufacture clone ancestry');
    stage = 'publish-bound-immutable';
    await assert.rejects(() => fixture.db.query('UPDATE public.document_generations SET artifacts=$2::jsonb WHERE id=$1', [published.resource.documentGenerationId, '{}']), /STUDIO_DELIVERY_IMMUTABLE/);
    const documentVisibility = async actorId => fixture.asRole('authenticated', async () => {
      await fixture.db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
      return Number((await fixture.db.query('SELECT count(*) n FROM public.document_generations WHERE id=$1', [published.resource.documentGenerationId])).rows[0].n);
    });
    stage = 'publish-bound-member-read';
    assert.equal(await documentVisibility(x.requester), 1, 'source-authorized active workspace members retain the established Docs read policy');
    stage = 'publish-bound-source-authority-read';
    await fixture.db.query("DELETE FROM public.role_capabilities WHERE role_id=$1 AND capability_key='assess.read'", [x.role]);
    assert.equal(await documentVisibility(x.requester), 0, 'members without source-chain read authority must not read the materialized Docs generation');
    await fixture.db.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'assess.read')", [x.role]);
    assert.equal(await documentVisibility(x.requester), 1, 'restored source-chain read authority must restore the established Docs read projection');
    stage = 'publish-bound-foreign-read';
    assert.equal(await documentVisibility('97000000-0000-4000-8000-000000000099'), 0, 'foreign users must not read the materialized Docs generation');
    stage = 'publish-bound-disabled-read';
    await fixture.db.query("UPDATE public.workspace_memberships SET status='disabled' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3", [x.org, x.workspace, x.requester]);
    assert.equal(await documentVisibility(x.requester), 0, 'deactivated workspace members must not read the materialized Docs generation');
    await fixture.db.query("UPDATE public.workspace_memberships SET status='active' WHERE org_id=$1 AND workspace_id=$2 AND user_id=$3", [x.org, x.workspace, x.requester]);
    authorizationVersion = Number((await fixture.db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester],
    )).rows[0].version);

    const source = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,100,NULL,$6,true) value',
      [x.requester, x.org, x.workspace, authorizationVersion, PROJECT, published.resource.documentGenerationId],
    ))).rows[0].value.source;
    stage = 'import';
    assert.equal(source.items.length, WORK_ITEMS.length);
    assert.equal(source.materializesEpics, true);
    stage = 'import-legacy-edited-type-alias';
    await fixture.db.query('BEGIN');
    try {
      const legacyEditedOrigin = (await fixture.db.query(
        `SELECT public.studio_delivery_proposal_origin($1,'Task',$2::jsonb) value`,
        [x.artifactId, JSON.stringify(WORK_ITEMS[1].requirementLinks)],
      )).rows[0].value;
      await fixture.db.query(`INSERT INTO public.delivery_work_items(
        org_id,workspace_id,project_id,created_by,updated_by,owner_id,reporter_id,title,description,status,priority,type,
        source_lineage,metadata,authority_version,retention_state,retention_class)
        VALUES($1,$2,$3,$4,$4,$4,$4,'Historical edited implementation','Pre-upgrade Story edited to Task.',
        'To Do','Medium','Task',jsonb_build_object('proposalOriginId',$5::text),'{}'::jsonb,1,'active','none')`,
      [x.org, x.workspace, PROJECT, x.requester, legacyEditedOrigin]);
      await fixture.db.query('SET LOCAL ROLE service_role');
      const aliasBlocked = (await fixture.db.query(
        'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `legacy-alias-${randomUUID()}`, 'import', JSON.stringify({
          projectId: PROJECT, sourceGenerationId: published.resource.documentGenerationId,
          expectedSourceDigest: source.digest, sourceItemIndices: [1],
        })],
      )).rows[0].value;
      await fixture.db.query('RESET ROLE');
      assert.equal(errorCode(aliasBlocked), 'DUPLICATE_IMPORT',
        'a pre-upgrade implementation edited from Story to Task must fail closed instead of duplicating after role migration');
      await fixture.db.query('ROLLBACK');
    } catch (error) {
      await fixture.db.query('ROLLBACK');
      throw error;
    }
    stage = 'import-epic-only';
    await fixture.db.query('BEGIN');
    try {
      const epicOnly = (await fixture.db.query(
        'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `epic-only-${randomUUID()}`, 'import', JSON.stringify({
          projectId: PROJECT, sourceGenerationId: published.resource.documentGenerationId, expectedSourceDigest: source.digest, sourceItemIndices: [0],
        })],
      )).rows[0].value;
      stage = `import-epic-only-${epicOnly.ok === true ? 'ok' : errorCode(epicOnly) ?? 'unknown'}`;
      assert.equal(epicOnly.ok, true, JSON.stringify(epicOnly));
      assert.equal(epicOnly.resource.itemCount, 1);
      assert.equal(epicOnly.resource.items[0].type, 'Epic');
      assert.equal(epicOnly.resource.items[0].sourceLineage.sourceItemIndex, 0);
      await fixture.db.query('ROLLBACK');
    } catch (error) {
      await fixture.db.query('ROLLBACK');
      throw error;
    }
    stage = 'import-mixed';
    const imported = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
      [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `import-${randomUUID()}`, 'import', JSON.stringify({
        projectId: PROJECT, sourceGenerationId: published.resource.documentGenerationId, expectedSourceDigest: source.digest, sourceItemIndices: [0, 1, 2],
      })],
    ))).rows[0].value;
    assert.equal(imported.ok, true, JSON.stringify(imported)); assert.equal(imported.resource.items.length, WORK_ITEMS.length);
    const epic = imported.resource.items.find(item => item.sourceLineage.sourceItemIndex === 0);
    const task = imported.resource.items.find(item => item.sourceLineage.sourceItemIndex === 1);
    const verificationTask = imported.resource.items.find(item => item.sourceLineage.sourceItemIndex === 2);
    assert.ok(epic, 'mixed requirement-bound import must materialize its selected Epic');
    assert.equal(epic.type, 'Epic'); assert.equal(epic.status, 'To Do');
    assert.equal(epic.sourceLineage.proposalOriginId, requirementBindings[0].proposal_origin_id);
    assert.equal(epic.sourceLineage.proposalRole, 'coordination');
    assert.ok(task, 'mixed requirement-bound import must materialize its selected task');
    assert.equal(task.sourceLineage.proposalOriginId, requirementBindings[1].proposal_origin_id);
    assert.equal(task.sourceLineage.proposalRole, 'implementation');
    assert.equal(task.sourceLineage.studioArtifactId, x.artifactId);
    assert.equal(task.sourceLineage.studioArtifactVersionId, x.version.id);
    assert.equal(Number(task.sourceLineage.studioArtifactVersion), Number(x.version.version));
    assert.deepEqual(task.sourceLineage.requirementLinks, WORK_ITEMS[1].requirementLinks,
      'normal Delivery task detail must receive exact approved requirement links');
    assert.ok(verificationTask, 'the verification task with identical type and links must remain a distinct selected proposal');
    assert.equal(verificationTask.sourceLineage.proposalRole, 'verification');
    assert.equal(verificationTask.sourceLineage.proposalOriginId, requirementBindings[2].proposal_origin_id);
    assert.notEqual(verificationTask.sourceLineage.proposalOriginId, task.sourceLineage.proposalOriginId);
    await assert.rejects(() => fixture.db.query(`INSERT INTO public.delivery_work_items(
      org_id,workspace_id,project_id,document_generation_id,source_process_id,source_assessment_id,created_by,updated_by,owner_id,reporter_id,
      title,description,status,priority,type,source_lineage,metadata,authority_version,legacy_import_id,source_item_index,retention_state,retention_class)
      SELECT org_id,workspace_id,project_id,NULL,NULL,NULL,created_by,updated_by,owner_id,reporter_id,
       title||' duplicate',description,status,priority,type,jsonb_build_object('proposalOriginId',source_lineage->>'proposalOriginId'),metadata,1,NULL,NULL,retention_state,retention_class
      FROM public.delivery_work_items WHERE id=$1`, [task.id]), /legacy_delivery_one_item_per_proposal_origin/,
    'a regenerated proposal origin must not appear twice on the normal board');
    stage = 'outcome';
    const outcomePayload = { taskId: task.id, expectedTaskVersion: task.version, expectedOutcomeVersion: null,
      status: 'achieved', label: 'Expected result observed', detail: 'A human confirmed the bounded result for this imported task.' };
    const recorded = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', outcomePayload, `outcome-${randomUUID()}`);
    assert.equal(recorded.ok, true); assert.equal(recorded.resource.version, 1); assert.equal(recorded.resource.taskId, task.id);
    const afterOutcome = await snapshot(fixture.db); assert.equal(afterOutcome.outcome_versions, 1); assert.equal(afterOutcome.audits, 2);
    const stale = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', { ...outcomePayload, label: 'stale' }, `stale-${randomUUID()}`);
    assert.equal(errorCode(stale), 'VERSION_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), afterOutcome);
    const updated = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      ...outcomePayload, expectedOutcomeVersion: 1, status: 'partial', label: 'Partial result confirmed', detail: 'A human recorded the exact bounded partial result.',
    }, `outcome-update-${randomUUID()}`);
    assert.equal(updated.ok, true); assert.equal(updated.resource.version, 2);
    stage = 'pack';
    const packKey = `pack-${randomUUID()}`; const packRequestId = randomUUID();
    const savedPack = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: PROJECT }, packKey, packRequestId);
    assert.equal(savedPack.ok, true, JSON.stringify(savedPack)); assert.equal(savedPack.resource.version, 1);
    assert.equal(savedPack.resource.taskCount, WORK_ITEMS.length); assert.equal(savedPack.resource.boundTaskCount, WORK_ITEMS.length);
    const packState = await snapshot(fixture.db);
    assert.equal(packState.pack_snapshots, 1); assert.equal(packState.receipts, 4); assert.equal(packState.audits, 4);
    const packReplay = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: PROJECT }, packKey, packRequestId);
    assert.equal(packReplay.outcome, 'replayed'); assert.deepEqual(await snapshot(fixture.db), packState);
    const packConflict = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: FOREIGN_PROJECT }, packKey, packRequestId);
    assert.equal(errorCode(packConflict), 'IDEMPOTENCY_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), packState);
    const storedPack = (await fixture.db.query('SELECT snapshot FROM public.legacy_delivery_pack_snapshots WHERE id=$1', [savedPack.resource.snapshotId])).rows[0].snapshot;
    assert.equal(storedPack.schemaVersion, 'legacy-delivery-pack-snapshot.v1'); assert.equal(storedPack.tasks.length, WORK_ITEMS.length);
    assert.equal(storedPack.tasks[0].studioAncestry.publicationId, published.resource.publicationId);
    await assert.rejects(() => fixture.db.query("UPDATE public.legacy_delivery_pack_snapshots SET snapshot='{}'::jsonb WHERE id=$1", [savedPack.resource.snapshotId]), /STUDIO_DELIVERY_IMMUTABLE/);
    const latestPack = await queryLatestPack(fixture, x.requester, x.org, x.workspace, authorizationVersion, PROJECT);
    assert.equal(latestPack.ok, true); assert.equal(latestPack.latestSnapshot.snapshotId, savedPack.resource.snapshotId);
    const beforeQuery = await snapshot(fixture.db);
    stage = 'query';
    await fixture.db.query(
      "SELECT public.legacy_delivery_assert_any_authority($1,$2,$3,ARRAY['delivery.outcomes.read','task.read','backlog.read'],$4)",
      [x.requester, x.org, x.workspace, authorizationVersion],
    );
    const directProjection = await fixture.db.query(`SELECT public.studio_delivery_outcome_projection(outcome_version) projection
      FROM public.legacy_delivery_outcome_aggregates aggregate
      JOIN public.legacy_delivery_outcome_versions outcome_version ON outcome_version.id=aggregate.current_version_id AND outcome_version.outcome_id=aggregate.id
      JOIN public.delivery_work_items task ON task.id=aggregate.task_id AND task.org_id=aggregate.org_id AND task.workspace_id=aggregate.workspace_id AND task.project_id=aggregate.project_id
      JOIN public.legacy_delivery_imports imported ON imported.id=outcome_version.legacy_import_id AND imported.project_id=aggregate.project_id AND imported.source_generation_id=outcome_version.document_generation_id
      JOIN public.studio_delivery_publications publication ON publication.id=outcome_version.publication_id AND publication.project_id=aggregate.project_id AND publication.document_generation_id=outcome_version.document_generation_id
      WHERE aggregate.org_id=$1 AND aggregate.workspace_id=$2 AND aggregate.project_id=$3`, [x.org, x.workspace, PROJECT]);
    assert.equal(directProjection.rowCount, 1, 'exact outcome lineage join must remain complete');
    const projection = await queryOutcomes(fixture, x.requester, x.org, x.workspace, authorizationVersion, PROJECT);
    assert.equal(projection.ok, true, JSON.stringify(projection)); assert.equal(projection.items.length, 1); assert.equal(projection.items[0].version, 2); assert.equal(projection.items[0].taskId, task.id);
    assert.deepEqual(await snapshot(fixture.db), beforeQuery, 'Monitor query must perform zero writes');
    const foreign = await queryOutcomes(fixture, x.requester, x.org, x.workspace, authorizationVersion, FOREIGN_PROJECT);
    assert.equal(foreign.ok, true); assert.deepEqual(foreign.items, [], 'scoped foreign selector must disclose no outcomes');
    for (const role of ['anon','authenticated']) {
      const direct = await fixture.asRole(role, () => fixture.db.query("SELECT has_table_privilege(current_user,'public.studio_delivery_publications','SELECT') publication_allowed,has_table_privilege(current_user,'public.legacy_delivery_pack_snapshots','SELECT') pack_allowed,has_function_privilege(current_user,'public.studio_delivery_assignee_query(uuid,uuid,uuid,bigint,uuid)','EXECUTE') assignee_query_allowed"));
      assert.equal(direct.rows[0].publication_allowed, false, `${role} direct publication reads must remain revoked`);
      assert.equal(direct.rows[0].pack_allowed, false, `${role} direct pack reads must remain revoked`);
      assert.equal(direct.rows[0].assignee_query_allowed, false, `${role} direct assignee directory execution must remain revoked`);
    }
    stage = 'discovery-resolution-publication';
    await fixture.db.query('INSERT INTO auth.users(id) VALUES($1)', [OUTCOME_APPROVER]);
    await fixture.db.query("INSERT INTO public.profiles(id,email,full_name) VALUES($1,'outcome-approver@example.invalid','Independent outcome approver')", [OUTCOME_APPROVER]);
    await fixture.db.query('INSERT INTO auth.users(id) VALUES($1)', [OUTCOME_OWN_ONLY]);
    await fixture.db.query("INSERT INTO public.profiles(id,email,full_name) VALUES($1,'outcome-own-only@example.invalid','Own-task outcome proposer')", [OUTCOME_OWN_ONLY]);
    await fixture.db.query(`INSERT INTO public.roles(id,org_id,name,slug,scope,permissions)
      VALUES($1,$2,'Own-task outcome proposer','own-task-outcome-proposer','organization','[]'::jsonb)`, [OUTCOME_OWN_ONLY_ROLE, x.org]);
    await fixture.db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
      VALUES($1,'delivery.outcomes.record'),($1,'task.update.own')`, [OUTCOME_OWN_ONLY_ROLE]);
    await fixture.db.query("INSERT INTO public.organization_members(org_id,user_id,role_id,status) VALUES($1,$2,$3,'active')",
      [x.org, OUTCOME_OWN_ONLY, OUTCOME_OWN_ONLY_ROLE]);
    await fixture.db.query("INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,status) VALUES($1,$2,$3,'active')",
      [x.org, x.workspace, OUTCOME_OWN_ONLY]);
    await fixture.db.query(`INSERT INTO public.organization_members(org_id,user_id,role_id,status)
      SELECT org_id,$1,role_id,status FROM public.organization_members WHERE org_id=$2 AND user_id=$3`, [OUTCOME_APPROVER, x.org, x.requester]);
    await fixture.db.query(`INSERT INTO public.workspace_memberships(org_id,workspace_id,user_id,role_id,status)
      SELECT org_id,workspace_id,$1,role_id,status FROM public.workspace_memberships WHERE org_id=$2 AND workspace_id=$3 AND user_id=$4`,
    [OUTCOME_APPROVER, x.org, x.workspace, x.requester]);
    await fixture.db.query(`INSERT INTO public.role_capabilities(role_id,capability_key)
      SELECT DISTINCT role_id,'project.manage' FROM(
       SELECT role_id FROM public.organization_members WHERE org_id=$1 AND user_id=$2
       UNION SELECT role_id FROM public.workspace_memberships WHERE org_id=$1 AND workspace_id=$3 AND user_id=$2
      ) roles WHERE role_id IS NOT NULL ON CONFLICT DO NOTHING`, [x.org, OUTCOME_APPROVER, x.workspace]);
    authorizationVersion = Number((await fixture.db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, x.requester],
    )).rows[0].version);
    const discoveryPublished = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion,
      'studio.approved-artifact.publish', {
        artifactId: x.artifactId, expectedArtifactVersionId: x.version.id, expectedAggregateVersion: aggregateVersion,
        projectId: CLONE_PROJECT, workItems: DISCOVERY_WORK_ITEMS,
      }, `discovery-publish-${randomUUID()}`);
    stage = `discovery-resolution-publication-${discoveryPublished.ok === true ? 'ok' : errorCode(discoveryPublished) ?? 'unknown'}`;
    assert.equal(discoveryPublished.ok, true, JSON.stringify(discoveryPublished));
    const discoverySource = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,100,NULL,$6,true) value',
      [x.requester, x.org, x.workspace, authorizationVersion, CLONE_PROJECT, discoveryPublished.resource.documentGenerationId],
    ))).rows[0].value.source;
    const discoveryImported = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
      [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `discovery-import-${randomUUID()}`, 'import', JSON.stringify({
        projectId: CLONE_PROJECT, sourceGenerationId: discoveryPublished.resource.documentGenerationId,
        expectedSourceDigest: discoverySource.digest, sourceItemIndices: DISCOVERY_WORK_ITEMS.map((_item, index) => index),
      })],
    ))).rows[0].value;
    stage = `discovery-resolution-import-${discoveryImported.ok === true ? 'ok' : errorCode(discoveryImported) ?? 'unknown'}`;
    assert.equal(discoveryImported.ok, true, JSON.stringify(discoveryImported));
    const discoveryProjection = await fixture.callQuery({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, projectId: CLONE_PROJECT, sourceGenerationId: discoveryPublished.resource.documentGenerationId });
    const dependentTask = discoveryProjection.items.find(item => item.sourceLineage.sourceItemIndex === 2);
    const scopeDependentTask = discoveryProjection.items.find(item => item.sourceLineage.proposalRole === 'implementation'
      && item.sourceLineage.requirementLinks[0].requirementText.startsWith('BR-2:'));
    const discoveryTask = discoveryProjection.items.find(item => item.sourceLineage.sourceItemIndex === 1);
    const scopeDiscoveryTask = discoveryProjection.items.find(item => item.sourceLineage.sourceItemIndex === 3);
    stage = `discovery-resolution-identities-${Boolean(discoveryTask)}-${Boolean(dependentTask)}-${Boolean(scopeDiscoveryTask)}-${Boolean(scopeDependentTask)}`;
    assert.ok(discoveryTask && dependentTask && scopeDiscoveryTask && scopeDependentTask, 'both discovery/dependent pairs must materialize');
    stage = `discovery-resolution-edge-questions-${discoveryTask.sourceLineage.requirementLinks[0].requirementText === DISCOVERY_QUESTION}-${scopeDiscoveryTask.sourceLineage.requirementLinks[0].requirementText === SCOPE_QUESTION}`;
    assert.equal(discoveryTask.sourceLineage.requirementLinks[0].requirementText, DISCOVERY_QUESTION);
    assert.equal(scopeDiscoveryTask.sourceLineage.requirementLinks[0].requirementText, SCOPE_QUESTION);
    stage = `discovery-resolution-dependency-edge-${dependentTask.dependencyIds.length}-${scopeDependentTask.dependencyIds.length}-${dependentTask.dependencyIds[0] === discoveryTask.id}-${scopeDependentTask.dependencyIds[0] === scopeDiscoveryTask.id}`;
    assert.equal(dependentTask.dependencyIds.length, 1); assert.equal(dependentTask.dependencyIds[0], discoveryTask.id);
    assert.equal(scopeDependentTask.dependencyIds.length, 1); assert.equal(scopeDependentTask.dependencyIds[0], scopeDiscoveryTask.id);
    const discoveryOutcomeProjection = await queryOutcomes(fixture, x.requester, x.org, x.workspace, authorizationVersion, CLONE_PROJECT);
    stage = `discovery-resolution-source-options-${(discoveryOutcomeProjection.sourceOptions ?? []).map(option =>
      discoveryProjection.items.find(item => item.id === option.taskId)?.sourceLineage.sourceItemIndex ?? 'missing').join('-')}`;
    assert.ok(discoveryOutcomeProjection.sourceOptions.some(option => option.taskId === discoveryTask.id),
      'normal outcome UI must receive a readable accepted-source selector before the first outcome exists');
    const discoverySourceOptions = discoveryOutcomeProjection.sourceOptions.filter(option =>
      option.taskId === discoveryTask.id || option.taskId === scopeDiscoveryTask.id);
    assert.deepEqual(discoverySourceOptions.map(option => option.taskId).sort(),
      [discoveryTask.id, scopeDiscoveryTask.id].sort(),
      'each imported planning-approved discovery task must expose one bound accepted source');
    assert.ok(discoverySourceOptions.every(option => option.evidenceAttestationId === x.attestation),
      'the selector must retain the exact accepted evidence attestation from the planning review');
    stage = 'discovery-resolution-unresolved';
    const unresolved = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryTask.version, expectedOutcomeVersion: null,
      status: 'partial', label: 'Discovery remains open', detail: 'The approved question remains unresolved and blocks implementation.',
      discoveryResolution: { disposition: 'blocking_unresolved', question: DISCOVERY_QUESTION,
        answer: null, evidenceAttestationId: null, revisedScope: null },
    }, `discovery-unresolved-${randomUUID()}`);
    stage = `discovery-resolution-unresolved-${unresolved.ok === true ? 'ok' : errorCode(unresolved) ?? 'unknown'}`;
    assert.equal(unresolved.ok, true, JSON.stringify(unresolved));
    let discoveryCurrent = discoveryTask;
    for (const status of ['In Progress','In Review','Testing','Ready for Release']) {
      const advanced = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
        version: authorizationVersion, key: `discovery-unresolved-${status}-${randomUUID()}`, action: 'task.update',
        payload: { taskId: discoveryTask.id, expectedVersion: discoveryCurrent.version, patch: { status } } });
      assert.equal(advanced.ok, true, JSON.stringify(advanced)); discoveryCurrent = advanced.resource;
    }
    const unresolvedDone = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-unresolved-done-${randomUUID()}`, action: 'task.update',
      payload: { taskId: discoveryTask.id, expectedVersion: discoveryCurrent.version, patch: { status: 'Done' } } });
    stage = `discovery-resolution-unresolved-done-${errorCode(unresolvedDone) ?? (unresolvedDone.ok ? 'ok' : 'unknown')}`;
    assert.equal(errorCode(unresolvedDone), 'DEPENDENCY_INCOMPLETE', 'Done alone cannot satisfy an unresolved discovery task');
    const acceptedAttestation = discoveryOutcomeProjection.sourceOptions.find(option => option.taskId === discoveryTask.id)?.evidenceAttestationId;
    stage = `discovery-resolution-accepted-attestation-${Boolean(acceptedAttestation)}`;
    assert.ok(acceptedAttestation, 'fixture must expose an accepted immutable source review reference');
    const directAccepted = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryCurrent.version, expectedOutcomeVersion: 1,
      status: 'achieved', label: 'Unreviewed answer', detail: 'Free text must not become accepted merely because its source was accepted.',
      discoveryResolution: { disposition: 'source_backed_answer_accepted', question: DISCOVERY_QUESTION,
        answer: 'Use an unrelated operation.', evidenceAttestationId: acceptedAttestation, revisedScope: null },
    }, `discovery-direct-answer-${randomUUID()}`);
    stage = `discovery-resolution-direct-answer-${errorCode(directAccepted) ?? (directAccepted.ok ? 'ok' : 'unknown')}`;
    assert.notEqual(directAccepted.ok, true, 'accepted source alone cannot accept an arbitrary answer tuple');
    const proposedAnswerPayload = {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryCurrent.version, expectedOutcomeVersion: 1,
      status: 'partial', label: 'Source-backed answer proposed', detail: 'The exact answer and source await independent acceptance.',
      discoveryResolution: { disposition: 'source_backed_answer_proposed', question: DISCOVERY_QUESTION,
        answer: 'Use only the source-supported read operation.', evidenceAttestationId: acceptedAttestation, revisedScope: null },
    };
    const proposedValidation = (await fixture.db.query(`SELECT public.studio_delivery_discovery_resolution_valid(
      ROW(task.*)::public.delivery_work_items,ROW(publication.*)::public.studio_delivery_publications,$2::jsonb,$3,$4) valid FROM public.delivery_work_items task
      JOIN public.document_generations generation ON generation.id=task.document_generation_id
      JOIN public.studio_delivery_publications publication ON publication.id=generation.studio_delivery_publication_id
      WHERE task.id=$1`, [discoveryTask.id, JSON.stringify(proposedAnswerPayload), x.requester, authorizationVersion])).rows[0]?.valid;
    stage = `discovery-resolution-proposed-validation-${proposedValidation}`;
    assert.equal(proposedValidation, true);
    const mismatchedPurposeValidation = (await fixture.db.query(`SELECT public.studio_delivery_discovery_resolution_valid(
      ROW(task.*)::public.delivery_work_items,
      jsonb_populate_record(ROW(publication.*)::public.studio_delivery_publications,
       jsonb_build_object('approval_purpose','documentation_planning')),
      $2::jsonb,$3,$4) valid FROM public.delivery_work_items task
      JOIN public.document_generations generation ON generation.id=task.document_generation_id
      JOIN public.studio_delivery_publications publication ON publication.id=generation.studio_delivery_publication_id
      WHERE task.id=$1`, [discoveryTask.id, JSON.stringify(proposedAnswerPayload), x.requester, authorizationVersion])).rows[0]?.valid;
    assert.equal(mismatchedPurposeValidation, false,
      'implementation-readiness evidence cannot be reused through a documentation-planning publication purpose');
    const proposedAnswer = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record',
      proposedAnswerPayload, `discovery-proposed-answer-${randomUUID()}`);
    stage = `discovery-resolution-proposed-answer-${proposedAnswer.ok === true ? 'ok' : errorCode(proposedAnswer) ?? 'unknown'}`;
    assert.equal(proposedAnswer.ok, true, JSON.stringify(proposedAnswer));
    const selfAcceptedAnswer = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      ...proposedAnswerPayload, expectedOutcomeVersion: 2, status: 'achieved', label: 'Self acceptance denied',
      discoveryResolution: { ...proposedAnswerPayload.discoveryResolution, disposition: 'source_backed_answer_accepted' },
    }, `discovery-self-answer-${randomUUID()}`);
    stage = `discovery-resolution-self-answer-${errorCode(selfAcceptedAnswer) ?? (selfAcceptedAnswer.ok ? 'ok' : 'unknown')}`;
    assert.notEqual(selfAcceptedAnswer.ok, true);
    const ownOnlyVersion = Number((await fixture.db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, OUTCOME_OWN_ONLY],
    )).rows[0].version);
    const ownOnlyAcceptedAnswer = await call(fixture, OUTCOME_OWN_ONLY, x.org, x.workspace, ownOnlyVersion, 'delivery.outcome.record', {
      ...proposedAnswerPayload, expectedOutcomeVersion: 2, status: 'achieved', label: 'Own-task acceptance denied',
      discoveryResolution: { ...proposedAnswerPayload.discoveryResolution, disposition: 'source_backed_answer_accepted' },
    }, `discovery-own-only-answer-${randomUUID()}`);
    stage = `discovery-resolution-own-only-answer-${errorCode(ownOnlyAcceptedAnswer) ?? (ownOnlyAcceptedAnswer.ok ? 'ok' : 'unknown')}`;
    assert.notEqual(ownOnlyAcceptedAnswer.ok, true, 'task.update.own plus outcome recording cannot independently accept a blocker release');
    const outcomeApproverVersion = Number((await fixture.db.query('SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [x.org, OUTCOME_APPROVER])).rows[0].version);
    const outcomeApproverCapability = (await fixture.db.query(
      "SELECT public.legacy_delivery_assert_any_authority($1,$2,$3,ARRAY['project.manage'],$4) capability",
      [OUTCOME_APPROVER, x.org, x.workspace, outcomeApproverVersion])).rows[0].capability;
    assert.equal(outcomeApproverCapability, 'project.manage');
    const acceptedAnswer = await call(fixture, OUTCOME_APPROVER, x.org, x.workspace,
      outcomeApproverVersion,
      'delivery.outcome.record', { ...proposedAnswerPayload, expectedOutcomeVersion: 2, status: 'achieved', label: 'Answer independently accepted',
        discoveryResolution: { ...proposedAnswerPayload.discoveryResolution, disposition: 'source_backed_answer_accepted' } },
      `discovery-accepted-answer-${randomUUID()}`);
    stage = `discovery-resolution-accepted-answer-${acceptedAnswer.ok === true ? 'ok' : errorCode(acceptedAnswer) ?? 'unknown'}`;
    assert.equal(acceptedAnswer.ok, true, JSON.stringify(acceptedAnswer));
    const discoveryDone = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-done-${randomUUID()}`, action: 'task.update',
      payload: { taskId: discoveryTask.id, expectedVersion: discoveryCurrent.version, patch: { status: 'Done' } } });
    assert.equal(discoveryDone.ok, true, JSON.stringify(discoveryDone));
    const reopenAfterDone = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryDone.resource.version, expectedOutcomeVersion: 3,
      status: 'partial', label: 'Reopen after Done denied', detail: 'A terminal discovery task cannot silently restore its blocker.',
      discoveryResolution: { disposition: 'blocking_unresolved', question: DISCOVERY_QUESTION,
        answer: null, evidenceAttestationId: null, revisedScope: null },
    }, `discovery-reopen-done-${randomUUID()}`);
    assert.equal(errorCode(reopenAfterDone), 'INVALID_COMMAND', 'Done discovery cannot be reopened through an outcome version');
    const dependentStarted = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-dependent-start-${randomUUID()}`, action: 'task.update',
      payload: { taskId: dependentTask.id, expectedVersion: dependentTask.version, patch: { status: 'In Progress' } } });
    assert.equal(dependentStarted.ok, true, JSON.stringify(dependentStarted));
    const removedDependency = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-remove-edge-${randomUUID()}`, action: 'task.update',
      payload: { taskId: dependentTask.id, expectedVersion: dependentStarted.resource.version, patch: { dependencyIds: [] } } });
    assert.equal(errorCode(removedDependency), 'DEPENDENCY_INCOMPLETE', 'an imported discovery dependency cannot be removed to bypass release semantics');
    stage = 'historical-done-outcome-fails-closed';
    await fixture.db.query('ALTER TABLE public.legacy_delivery_outcome_versions DISABLE TRIGGER legacy_delivery_outcome_version_immutable');
    try {
      await fixture.db.query(`UPDATE public.legacy_delivery_outcome_versions version SET
        discovery_disposition=NULL,discovery_question=NULL,discovery_answer=NULL,
        discovery_evidence_attestation_id=NULL,discovery_revised_scope=NULL,status='achieved'
        FROM public.legacy_delivery_outcome_aggregates aggregate
        WHERE aggregate.task_id=$1 AND version.id=aggregate.current_version_id`, [discoveryTask.id]);
    } finally {
      await fixture.db.query('ALTER TABLE public.legacy_delivery_outcome_versions ENABLE TRIGGER legacy_delivery_outcome_version_immutable');
    }
    const historicalRelease = (await fixture.db.query(`SELECT
      (item.status='Done' AND item.retention_state='active') old_done_release,
      public.legacy_delivery_discovery_dependency_released(item.id,item.org_id,item.workspace_id) corrected_release
      FROM public.delivery_work_items item WHERE item.id=$1`, [discoveryTask.id])).rows[0];
    assert.deepEqual(historicalRelease, { old_done_release: true, corrected_release: false },
      'the reproduced original Done-only predicate releases a historical achieved row while the corrected guard fails closed');
    const historicalDependentAdvance = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-historical-dependent-${randomUUID()}`, action: 'task.update',
      payload: { taskId: dependentTask.id, expectedVersion: dependentStarted.resource.version, patch: { status: 'In Review' } } });
    assert.equal(errorCode(historicalDependentAdvance), 'DEPENDENCY_INCOMPLETE',
      'a historical achieved outcome without a typed resolution cannot release dependent implementation');
    const historicalProposal = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryDone.resource.version, expectedOutcomeVersion: 3,
      status: 'partial', label: 'Historical answer proposed', detail: 'The Done status remains unchanged while the exact tuple is reviewed.',
      discoveryResolution: { disposition: 'source_backed_answer_proposed', question: DISCOVERY_QUESTION,
        answer: 'Use only the source-supported read operation.', evidenceAttestationId: acceptedAttestation, revisedScope: null },
    }, `discovery-historical-proposal-${randomUUID()}`);
    assert.equal(historicalProposal.ok, true, JSON.stringify(historicalProposal));
    const historicalAccepted = await call(fixture, OUTCOME_APPROVER, x.org, x.workspace,
      outcomeApproverVersion,
      'delivery.outcome.record', {
        taskId: discoveryTask.id, expectedTaskVersion: discoveryDone.resource.version, expectedOutcomeVersion: 4,
        status: 'achieved', label: 'Historical answer independently accepted', detail: 'The exact historical question, answer and source tuple is accepted.',
        discoveryResolution: { disposition: 'source_backed_answer_accepted', question: DISCOVERY_QUESTION,
          answer: 'Use only the source-supported read operation.', evidenceAttestationId: acceptedAttestation, revisedScope: null },
      }, `discovery-historical-accepted-${randomUUID()}`);
    assert.equal(historicalAccepted.ok, true, JSON.stringify(historicalAccepted));
    const historicalDependentReleased = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-historical-released-${randomUUID()}`, action: 'task.update',
      payload: { taskId: dependentTask.id, expectedVersion: dependentStarted.resource.version, patch: { status: 'In Review' } } });
    assert.equal(historicalDependentReleased.ok, true, JSON.stringify(historicalDependentReleased));
    const qualifiedDowngrade = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: discoveryTask.id, expectedTaskVersion: discoveryDone.resource.version, expectedOutcomeVersion: 5,
      status: 'partial', label: 'Qualified downgrade denied', detail: 'A qualified Done resolution cannot be silently downgraded.',
      discoveryResolution: { disposition: 'blocking_unresolved', question: DISCOVERY_QUESTION,
        answer: null, evidenceAttestationId: null, revisedScope: null },
    }, `discovery-qualified-downgrade-${randomUUID()}`);
    assert.equal(errorCode(qualifiedDowngrade), 'INVALID_COMMAND');
    const unresolvedScope = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: scopeDiscoveryTask.id, expectedTaskVersion: scopeDiscoveryTask.version, expectedOutcomeVersion: null,
      status: 'partial', label: 'Scope question remains open', detail: 'The exact scope question remains blocking.',
      discoveryResolution: { disposition: 'blocking_unresolved', question: SCOPE_QUESTION,
        answer: null, evidenceAttestationId: null, revisedScope: null },
    }, `discovery-unresolved-scope-${randomUUID()}`);
    assert.equal(unresolvedScope.ok, true, JSON.stringify(unresolvedScope));
    const proposedScope = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.outcome.record', {
      taskId: scopeDiscoveryTask.id, expectedTaskVersion: scopeDiscoveryTask.version, expectedOutcomeVersion: 1,
      status: 'partial', label: 'Nonblocking scope proposed', detail: 'The implementation scope excludes the unresolved operation.',
      discoveryResolution: { disposition: 'nonblocking_scope_proposed', question: SCOPE_QUESTION,
        answer: null, evidenceAttestationId: null, revisedScope: 'Exclude the unknown operation and retain the approved read-only scope.' },
    }, `discovery-proposed-scope-${randomUUID()}`);
    assert.equal(proposedScope.ok, true, JSON.stringify(proposedScope));
    const blockedWhileProposed = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-dependent-proposed-${randomUUID()}`, action: 'task.update',
      payload: { taskId: scopeDependentTask.id, expectedVersion: scopeDependentTask.version, patch: { status: 'In Progress' } } });
    assert.equal(errorCode(blockedWhileProposed), 'DEPENDENCY_INCOMPLETE');
    const approvedScope = await call(fixture, OUTCOME_APPROVER, x.org, x.workspace,
      outcomeApproverVersion,
      'delivery.outcome.record', {
        taskId: scopeDiscoveryTask.id, expectedTaskVersion: scopeDiscoveryTask.version, expectedOutcomeVersion: 2,
        status: 'achieved', label: 'Nonblocking scope independently approved', detail: 'A separate actor approved the exact revised scope.',
        discoveryResolution: { disposition: 'approved_nonblocking_scope', question: SCOPE_QUESTION,
          answer: null, evidenceAttestationId: null, revisedScope: 'Exclude the unknown operation and retain the approved read-only scope.' },
      }, `discovery-approved-scope-${randomUUID()}`);
    assert.equal(approvedScope.ok, true, JSON.stringify(approvedScope));
    let scopeCurrent = scopeDiscoveryTask;
    for (const status of ['In Progress','In Review','Testing','Ready for Release']) {
      const advanced = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
        version: authorizationVersion, key: `discovery-scope-${status}-${randomUUID()}`, action: 'task.update',
        payload: { taskId: scopeDiscoveryTask.id, expectedVersion: scopeCurrent.version, patch: { status } } });
      assert.equal(advanced.ok, true, JSON.stringify(advanced)); scopeCurrent = advanced.resource;
    }
    const dependentReviewed = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-dependent-approved-${randomUUID()}`, action: 'task.update',
      payload: { taskId: scopeDiscoveryTask.id, expectedVersion: scopeCurrent.version, patch: { status: 'Done' } } });
    assert.equal(dependentReviewed.ok, true, JSON.stringify(dependentReviewed));
    const scopeDependentStarted = await fixture.callCommand({ actor: x.requester, org: x.org, workspace: x.workspace,
      version: authorizationVersion, key: `discovery-scope-dependent-approved-${randomUUID()}`, action: 'task.update',
      payload: { taskId: scopeDependentTask.id, expectedVersion: scopeDependentTask.version, patch: { status: 'In Progress' } } });
    assert.equal(scopeDependentStarted.ok, true, JSON.stringify(scopeDependentStarted));
    console.log('STUDIO DELIVERY POSTGRES PASS exact approved requirement generation, user-selected confirmation, replay/conflict, stable-origin duplicate prevention, visible board links, persistent task outcome, immutable pack and zero-write queries');
  } finally { await fixture.close(); }
}

run().catch(error => {
  const sqlState = error && typeof error === 'object' && typeof error.code === 'string' && /^[0-9A-Z]{5}$/u.test(error.code)
    ? `:SQLSTATE_${error.code}` : '';
  const kind = error instanceof assert.AssertionError ? 'ASSERTION_FAILED' : 'EXECUTION_FAILED';
  const safeReason = error instanceof Error && error.message.startsWith('LEGACY_DELIVERY_')
    ? `:${error.message.split(':').slice(0, 2).join('_')}` : '';
  const fixtureReason = error instanceof Error && error.message.startsWith('FIXTURE FAILED ')
    ? `:${error.message.replaceAll(/[^a-zA-Z0-9_:. -]/gu, '_').slice(0, 400)}` : '';
  console.error(`STUDIO_DELIVERY_POSTGRES_${kind}:${stage}${sqlState}${safeReason}${fixtureReason}`);
  process.exitCode = 1;
});
