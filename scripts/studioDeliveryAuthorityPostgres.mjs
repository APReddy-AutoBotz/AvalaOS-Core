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
const WORK_ITEMS = [
  { type: 'Epic', title: 'Human approved outcome path', description: 'Exact structured grouping.', acceptanceCriteria: [] },
  { type: 'Task', title: 'Record an explicit outcome', description: 'The delivery owner records the result.', acceptanceCriteria: ['Monitor reads the exact imported-task ancestry'] },
];
const APPROVED_STUDIO_CONTENT = {
  title: 'Exact approved fixture BRD',
  summary: 'Approved summary retained only as exact Studio source metadata.',
  sections: [
    { id: 'summary', title: 'Summary', body: 'Committed exact structured content.', sourceAnchors: [], labels: ['human_authored'], citations: ['fixture-source-summary'] },
    { key: 'controls', title: 'Controls', content: 'Human-approved controls remain unchanged.', citations: ['fixture-source-controls'] },
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
    'SELECT public.studio_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
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

async function run() {
  stage = 'dirty-marker';
  await verifyDirtyMarkerRollback();
  stage = 'fixture-create';
  const fixture = await createLegacyDeliveryPostgresFixture({ seed: false });
  try {
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
    for (const capability of ['assess.read','studio.artifacts.publish','delivery.outcomes.record','delivery.outcomes.read','delivery.pack.snapshot','workitems.import','task.read','backlog.read','project.manage']) {
      await fixture.db.query('INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,$2) ON CONFLICT DO NOTHING', [x.role, capability]);
    }
    const aggregateVersion = await approveArtifact(fixture.db, x);
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
        'SELECT public.studio_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
        [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `matching-clone-${randomUUID()}`,
          'studio.approved-artifact.publish', JSON.stringify({ ...publishPayload, projectId: CLONE_PROJECT })],
      )).rows[0].value;
      await fixture.db.query('RESET ROLE');
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
        'SELECT public.studio_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
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
    const publishKey = `publish-${randomUUID()}`;
    const publishRequestId = randomUUID();
    const published = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, publishKey, publishRequestId);
    stage = 'publish-result';
    assert.equal(published.ok, true); assert.equal(published.outcome, 'committed'); assert.equal(published.resource.workItemCount, 2);
    const afterPublish = await snapshot(fixture.db);
    stage = 'publish-counts';
    assert.deepEqual(afterPublish, { publications: 1, documents: 1, receipts: 1, outcome_versions: 0, pack_snapshots: 0, audits: 1 });
    const replay = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, publishKey, publishRequestId);
    stage = 'publish-replay';
    assert.equal(replay.outcome, 'replayed', JSON.stringify(replay)); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const changed = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', { ...publishPayload, workItems: [{ ...WORK_ITEMS[0], title: 'Changed' }] }, publishKey, publishRequestId);
    stage = 'publish-conflict';
    assert.equal(errorCode(changed), 'IDEMPOTENCY_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const duplicateVersion = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'studio.approved-artifact.publish', publishPayload, `new-${randomUUID()}`);
    stage = 'publish-duplicate';
    assert.equal(errorCode(duplicateVersion), 'VERSION_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), afterPublish);
    const bound = (await fixture.db.query('SELECT artifacts,source_assessment_id,studio_artifact_version_id,studio_work_item_digest FROM public.document_generations WHERE id=$1', [published.resource.documentGenerationId])).rows[0];
    stage = 'publish-bound-values';
    assert.equal(bound.artifacts.schemaVersion, 'studio-approved-work-items.v1'); assert.equal(bound.artifacts.workItems.length, 2);
    assert.deepEqual(bound.artifacts.brd, { title: APPROVED_STUDIO_CONTENT.title, sections: [
      { key: 'summary', title: 'Summary', content: 'Committed exact structured content.' },
      { key: 'controls', title: 'Controls', content: 'Human-approved controls remain unchanged.' },
    ] }, 'legacy primary document must map exact approved title and ordered section text');
    assert.deepEqual(bound.artifacts.approvedStudioContent, APPROVED_STUDIO_CONTENT, 'exact approved Studio content and citation/source metadata must remain immutable in the generation');
    assert.equal(bound.artifacts.source.artifactVersionId, x.version.id); assert.equal(bound.artifacts.source.caseId, x.caseId);
    assert.equal(bound.source_assessment_id, ASSESSMENT, 'legacy Docs generation must retain the exact project assessment anchor');
    assert.equal(bound.studio_artifact_version_id, x.version.id); assert.equal(bound.studio_work_item_digest, published.resource.workItemDigest);
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
      'SELECT public.legacy_delivery_query($1,$2,$3,$4,$5,100,NULL,$6,true) value',
      [x.requester, x.org, x.workspace, authorizationVersion, PROJECT, published.resource.documentGenerationId],
    ))).rows[0].value.source;
    stage = 'import';
    assert.equal(source.items.length, 2);
    const imported = (await fixture.asRole('service_role', () => fixture.db.query(
      'SELECT public.legacy_delivery_apply_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) value',
      [x.requester, x.org, x.workspace, authorizationVersion, randomUUID(), `import-${randomUUID()}`, 'import', JSON.stringify({
        projectId: PROJECT, sourceGenerationId: published.resource.documentGenerationId, expectedSourceDigest: source.digest, sourceItemIndices: [1],
      })],
    ))).rows[0].value;
    assert.equal(imported.ok, true, JSON.stringify(imported)); assert.equal(imported.resource.items.length, 1);
    const task = imported.resource.items[0];
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
    assert.equal(savedPack.resource.taskCount, 1); assert.equal(savedPack.resource.boundTaskCount, 1);
    const packState = await snapshot(fixture.db);
    assert.equal(packState.pack_snapshots, 1); assert.equal(packState.receipts, 4); assert.equal(packState.audits, 4);
    const packReplay = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: PROJECT }, packKey, packRequestId);
    assert.equal(packReplay.outcome, 'replayed'); assert.deepEqual(await snapshot(fixture.db), packState);
    const packConflict = await call(fixture, x.requester, x.org, x.workspace, authorizationVersion, 'delivery.pack.snapshot', { projectId: FOREIGN_PROJECT }, packKey, packRequestId);
    assert.equal(errorCode(packConflict), 'IDEMPOTENCY_CONFLICT'); assert.deepEqual(await snapshot(fixture.db), packState);
    const storedPack = (await fixture.db.query('SELECT snapshot FROM public.legacy_delivery_pack_snapshots WHERE id=$1', [savedPack.resource.snapshotId])).rows[0].snapshot;
    assert.equal(storedPack.schemaVersion, 'legacy-delivery-pack-snapshot.v1'); assert.equal(storedPack.tasks.length, 1);
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
    console.log('STUDIO DELIVERY POSTGRES PASS default-off, exact publish, replay/conflict, immutable binding, scoped assignee directory, legacy import, versioned outcome, immutable pack and zero-write queries');
  } finally { await fixture.close(); }
}

run().catch(error => {
  const sqlState = error && typeof error === 'object' && typeof error.code === 'string' && /^[0-9A-Z]{5}$/u.test(error.code)
    ? `:SQLSTATE_${error.code}` : '';
  const kind = error instanceof assert.AssertionError ? 'ASSERTION_FAILED' : 'EXECUTION_FAILED';
  const safeReason = error instanceof Error && error.message.startsWith('LEGACY_DELIVERY_')
    ? `:${error.message.split(':').slice(0, 2).join('_')}` : '';
  console.error(`STUDIO_DELIVERY_POSTGRES_${kind}:${stage}${sqlState}${safeReason}`);
  process.exitCode = 1;
});
