import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createLegacyDeliveryPostgresFixture } from './legacyDeliveryPostgresFixture.mjs';
import { createCommittedStudioFixture } from './studioArtifactPostgresFixture.mjs';

const databaseUrl = process.env.CURRENT_ASSESSMENT_DELIVERY_DATABASE_URL;
if (!databaseUrl) {
  if (process.env.CI) throw new Error('CURRENT_ASSESSMENT_DELIVERY_DATABASE_URL is required in CI.');
  console.log('CURRENT_ASSESSMENT_DELIVERY_DATABASE_URL not set; current-assessment project scenario was not run.');
  process.exit(0);
}

const approve = async (db, fixture) => {
  let current = (await db.query(`SELECT aggregate.aggregate_version,version.id version_id,version.version
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id AND version.artifact_id=aggregate.id
    WHERE aggregate.id=$1`, [fixture.artifactId])).rows[0];
  const requesterAuthorizationVersion = Number((await db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, fixture.requester],
  )).rows[0].version);
  const revised = (await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) result', [JSON.stringify({
    commandType: 'studio.artifact.draft.revise', requestId: randomUUID(), idempotencyKey: randomUUID(),
    organizationId: fixture.org, workspaceId: fixture.workspace, actorId: fixture.requester,
    authorizationVersion: requesterAuthorizationVersion, expectedAggregateVersion: Number(current.aggregate_version),
    expectedArtifactVersion: Number(current.version), payload: {
      artifactId: fixture.artifactId, parentVersionId: current.version_id,
      content: { title: 'Current assessment BRD', sections: [{ id: 'requirements', title: 'Requirements', body: 'FR-1: Delivery must retain exact approved assessment lineage.' }] },
    },
  })])).rows[0].result;
  assert.equal(revised.outcome, 'committed');
  current = (await db.query(`SELECT aggregate.aggregate_version,version.id version_id,version.version
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id AND version.artifact_id=aggregate.id
    WHERE aggregate.id=$1`, [fixture.artifactId])).rows[0];
  let aggregateVersion = Number(current.aggregate_version);
  const artifactVersion = Number(current.version);
  for (const [commandType, actor, payload] of [
    ['studio.artifact.review.submit', fixture.requester, { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id }],
    ['studio.artifact.review.assign', fixture.requester, { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, reviewerId: fixture.reviewer }],
    ['studio.artifact.review.resolve', fixture.reviewer, { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, outcome: 'approve', rationale: 'Independent review', conditions: [] }],
    ['studio.artifact.approval.resolve', fixture.approver, { artifactId: fixture.artifactId, artifactVersionId: fixture.version.id, outcome: 'approve', rationale: 'Independent approval', conditions: [] }],
  ]) {
    const authorizationVersion = Number((await db.query(
      'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [fixture.org, actor],
    )).rows[0].version);
    const result = (await db.query('SELECT public.studio_artifact_command_claim($1::jsonb) result', [JSON.stringify({
      commandType, requestId: randomUUID(), idempotencyKey: randomUUID(), organizationId: fixture.org,
      workspaceId: fixture.workspace, actorId: actor, authorizationVersion, expectedAggregateVersion: aggregateVersion,
      expectedArtifactVersion: artifactVersion, payload: { ...payload, artifactVersionId: current.version_id },
    })])).rows[0].result;
    assert.equal(result.outcome, 'committed');
    aggregateVersion += 1;
  }
  return { aggregateVersion, artifactVersionId: current.version_id };
};

const asActor = async (db, actor, operation) => {
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor]);
    const result = await operation();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
};

const cloneRow = async (db, table, sourceId, overrides) => {
  const allowed = new Set(['assess_command_receipts','assess_v2_decision_versions','assess_v2_review_assignments',
    'assess_v2_review_resolutions','assess_v2_govern_resolutions','assess_v2_studio_handoffs']);
  if (!allowed.has(table)) throw new Error('CURRENT_ASSESSMENT_CLONE_TABLE_REJECTED');
  const columns = (await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position`, [table])).rows
    .map(row => row.column_name);
  if (!columns.length || columns.some(column => !/^[a-z][a-z0-9_]*$/u.test(column))) {
    throw new Error('CURRENT_ASSESSMENT_CLONE_COLUMNS_REJECTED');
  }
  const values = [];
  const selection = columns.map(column => {
    if (!Object.hasOwn(overrides,column)) return `source."${column}"`;
    values.push(overrides[column]);
    return `$${values.length}`;
  });
  values.push(sourceId);
  return (await db.query(`INSERT INTO public.${table}(${columns.map(column => `"${column}"`).join(',')})
    SELECT ${selection.join(',')} FROM public.${table} source WHERE source.id=$${values.length} RETURNING *`, values)).rows[0];
};

const cloneReceipt = async (db, sourceId) => cloneRow(db,'assess_command_receipts',sourceId,{
  id:randomUUID(),request_id:randomUUID(),idempotency_key:`current-assessment-successor-${randomUUID()}`,
});

const fixture = await createLegacyDeliveryPostgresFixture({
  databaseUrl,
  seed: false,
  throughMigration: '20261103170101_stable_requirement_proposal_identity.sql',
});
try {
  const studio = await createCommittedStudioFixture(fixture.db, 'brd');
  const migration = await readFile('supabase/migrations/20261103170102_current_assessment_delivery_project.sql', 'utf8');
  await fixture.db.query(migration);
  await fixture.db.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'studio.artifacts.publish') ON CONFLICT DO NOTHING", [studio.role]);
  await fixture.db.query("UPDATE public.assess_v2_cases SET status='reviewer_ready' WHERE id=$1", [studio.caseId]);
  let authorizationVersion = Number((await fixture.db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [studio.org, studio.requester],
  )).rows[0].version);

  const ensure = () => fixture.db.query(
    'SELECT public.assess_v2_current_delivery_project_ensure($1,$2,$3,$4,$5,$6,$7) result',
    [studio.requester, studio.org, studio.workspace, authorizationVersion, studio.caseId, studio.decision, randomUUID()],
  );
  await assert.rejects(
    asActor(fixture.db, studio.requester, ensure),
    /LEGACY_DELIVERY_NOT_FOUND/u,
    'Studio publication authority alone must not create a Delivery project',
  );
  assert.equal(Number((await fixture.db.query(
    'SELECT count(*) n FROM public.projects WHERE org_id=$1 AND workspace_id=$2 AND source_current_case_id=$3',
    [studio.org, studio.workspace, studio.caseId],
  )).rows[0].n), 0);
  await fixture.db.query("INSERT INTO public.role_capabilities(role_id,capability_key) VALUES($1,'project.manage') ON CONFLICT DO NOTHING", [studio.role]);
  authorizationVersion = Number((await fixture.db.query(
    'SELECT version FROM public.authorization_versions WHERE org_id=$1 AND user_id=$2', [studio.org, studio.requester],
  )).rows[0].version);
  const created = (await asActor(fixture.db, studio.requester, ensure)).rows[0].result;
  assert.equal(created.outcome, 'created');
  const replayed = (await asActor(fixture.db, studio.requester, ensure)).rows[0].result;
  assert.equal(replayed.outcome, 'replayed');
  assert.equal(replayed.projectId, created.projectId);
  assert.equal(Number((await fixture.db.query(
    'SELECT count(*) n FROM public.projects WHERE org_id=$1 AND workspace_id=$2 AND source_current_case_id=$3',
    [studio.org, studio.workspace, studio.caseId],
  )).rows[0].n), 1);
  assert.equal(Number((await fixture.db.query(
    'SELECT count(*) n FROM public.assessments WHERE process_id=$1', [studio.process],
  )).rows[0].n), 0, 'the direct V2 path must not create a compatibility assessment');

  await fixture.db.query("INSERT INTO public.studio_delivery_workspace_controls(org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled) VALUES($1,$2,true,true,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET publication_writes_enabled=true,outcome_writes_enabled=true,pack_writes_enabled=true,updated_at=statement_timestamp()", [studio.org, studio.workspace]);
  await fixture.db.query("INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled) VALUES($1,$2,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET writes_enabled=true,updated_at=statement_timestamp()", [studio.org, studio.workspace]);
  const approved = await approve(fixture.db, studio);
  const publication = (await fixture.db.query(
    'SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [studio.requester, studio.org, studio.workspace, authorizationVersion, randomUUID(), randomUUID(),
      'studio.approved-artifact.publish', JSON.stringify({
        artifactId: studio.artifactId, expectedArtifactVersionId: approved.artifactVersionId,
        expectedAggregateVersion: approved.aggregateVersion, projectId: created.projectId,
        workItems: [{ proposalRole: 'implementation', type: 'Task', title: 'Implement approved requirement',
          description: 'Bound to current V2.', acceptanceCriteria: ['Exact approved lineage is retained.'],
          requirementLinks: [{ sectionId: 'requirements', sectionTitle: 'Requirements',
            requirementText: 'FR-1: Delivery must retain exact approved assessment lineage.' }] },
        { proposalRole: 'verification', type: 'Task', title: 'Verify approved requirement',
          description: 'Verify the retained current-assessment lineage.', acceptanceCriteria: ['The immutable source link is visible.'],
          requirementLinks: [{ sectionId: 'requirements', sectionTitle: 'Requirements',
            requirementText: 'FR-1: Delivery must retain exact approved assessment lineage.' }] }],
      })],
  )).rows[0].result;
  assert.equal(publication.ok, true, JSON.stringify(publication));
  const bound = (await fixture.db.query(
    'SELECT source_case_id,source_decision_id,source_assessment_id FROM public.studio_delivery_publications WHERE id=$1',
    [publication.resource.publicationId],
  )).rows[0];
  assert.equal(bound.source_case_id, studio.caseId);
  assert.equal(bound.source_decision_id, studio.decision);
  assert.equal(bound.source_assessment_id, null);
  const source = (await fixture.db.query(
    'SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
    [studio.requester,studio.org,studio.workspace,authorizationVersion,created.projectId,100,null,
      publication.resource.documentGenerationId,true],
  )).rows[0].result;
  assert.equal(source.ok,true,JSON.stringify(source));
  const imported = (await fixture.db.query(
    'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [studio.requester,studio.org,studio.workspace,authorizationVersion,randomUUID(),randomUUID(),'import',JSON.stringify({
      projectId:created.projectId,sourceGenerationId:publication.resource.documentGenerationId,
      expectedSourceDigest:source.source.digest,sourceItemIndices:[0],
    })],
  )).rows[0].result;
  assert.equal(imported.ok,true,JSON.stringify(imported));
  assert.equal(imported.resource.items[0].sourceLineage.sourceAssessmentId,null);
  assert.equal(imported.resource.items[0].sourceLineage.sourceAssessmentCaseId,studio.caseId);
  assert.equal(imported.resource.items[0].sourceLineage.sourceAssessmentDecisionId,studio.decision);
  const original = (await fixture.db.query(`SELECT decision.*,assignment.id assignment_id,assignment.receipt_id assignment_receipt,
      resolution.id resolution_id,resolution.receipt_id resolution_receipt,govern.id govern_id,govern.receipt_id govern_receipt,
      handoff.id handoff_id,handoff.receipt_id handoff_receipt
    FROM public.assess_v2_decision_versions decision
    JOIN public.assess_v2_review_assignments assignment ON assignment.decision_id=decision.id
    JOIN public.assess_v2_review_resolutions resolution ON resolution.review_id=assignment.id AND resolution.decision_id=decision.id
    JOIN public.assess_v2_govern_resolutions govern ON govern.review_resolution_id=resolution.id AND govern.decision_id=decision.id
    JOIN public.assess_v2_studio_handoffs handoff ON handoff.govern_resolution_id=govern.id AND handoff.decision_id=decision.id
    WHERE decision.id=$1`,[studio.decision])).rows[0];
  const successorDecisionReceipt = await cloneReceipt(fixture.db,original.receipt_id);
  const successorDecisionId = randomUUID();
  await cloneRow(fixture.db,'assess_v2_decision_versions',studio.decision,{
    id:successorDecisionId,decision_version:`successor-${randomUUID()}`,supersedes_decision_id:studio.decision,
    receipt_id:successorDecisionReceipt.id,created_at:new Date(),
  });
  const assignmentReceipt = await cloneReceipt(fixture.db,original.assignment_receipt);
  const successorAssignment = await cloneRow(fixture.db,'assess_v2_review_assignments',original.assignment_id,{
    id:randomUUID(),decision_id:successorDecisionId,decision_version:`successor-${successorDecisionId}`,
    request_id:randomUUID(),receipt_id:assignmentReceipt.id,audit_event_id:randomUUID(),assigned_at:new Date(),
  });
  const resolutionReceipt = await cloneReceipt(fixture.db,original.resolution_receipt);
  const successorResolution = await cloneRow(fixture.db,'assess_v2_review_resolutions',original.resolution_id,{
    id:randomUUID(),decision_id:successorDecisionId,decision_version:`successor-${successorDecisionId}`,
    review_id:successorAssignment.id,request_id:randomUUID(),receipt_id:resolutionReceipt.id,
    audit_event_id:randomUUID(),resolved_at:new Date(),
  });
  const governReceipt = await cloneReceipt(fixture.db,original.govern_receipt);
  const successorGovern = await cloneRow(fixture.db,'assess_v2_govern_resolutions',original.govern_id,{
    id:randomUUID(),decision_id:successorDecisionId,decision_version:`successor-${successorDecisionId}`,
    review_resolution_id:successorResolution.id,request_id:randomUUID(),receipt_id:governReceipt.id,
    audit_event_id:randomUUID(),resolved_at:new Date(),
  });
  const handoffReceipt = await cloneReceipt(fixture.db,original.handoff_receipt);
  const successorHandoff = await cloneRow(fixture.db,'assess_v2_studio_handoffs',original.handoff_id,{
    id:randomUUID(),decision_id:successorDecisionId,decision_version:`successor-${successorDecisionId}`,
    review_resolution_id:successorResolution.id,govern_resolution_id:successorGovern.id,
    request_id:randomUUID(),receipt_id:handoffReceipt.id,audit_event_id:randomUUID(),handed_off_at:new Date(),
  });
  assert.ok(successorHandoff.id);
  const advanced = (await asActor(fixture.db,studio.requester,() => fixture.db.query(
    'SELECT public.assess_v2_current_delivery_project_ensure($1,$2,$3,$4,$5,$6,$7) result',
    [studio.requester,studio.org,studio.workspace,authorizationVersion,studio.caseId,successorDecisionId,randomUUID()],
  ))).rows[0].result;
  assert.equal(advanced.outcome,'advanced');
  assert.equal(advanced.projectId,created.projectId);
  await assert.rejects(asActor(fixture.db,studio.requester,ensure),/CURRENT_ASSESSMENT_PROJECT_CONFLICT/u,
    'an earlier approved decision cannot roll the native project binding back');
  const afterAdvanceImport = (await fixture.db.query(
    'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [studio.requester,studio.org,studio.workspace,authorizationVersion,randomUUID(),randomUUID(),'import',JSON.stringify({
      projectId:created.projectId,sourceGenerationId:publication.resource.documentGenerationId,
      expectedSourceDigest:source.source.digest,sourceItemIndices:[1],
    })],
  )).rows[0].result;
  assert.equal(afterAdvanceImport.ok,true,JSON.stringify(afterAdvanceImport));
  assert.equal(afterAdvanceImport.resource.items[0].sourceLineage.sourceAssessmentDecisionId,studio.decision,
    'an older publication retains its exact decision after the project advances');
  assert.equal(Number((await fixture.db.query('SELECT count(*) n FROM public.studio_delivery_publications WHERE id=$1',
    [publication.resource.publicationId])).rows[0].n),1);
  assert.equal(Number((await fixture.db.query('SELECT count(*) n FROM public.delivery_work_items WHERE legacy_import_id=$1',
    [imported.resource.importId])).rows[0].n),1);
  assert.equal(Number((await fixture.db.query('SELECT count(*) n FROM public.delivery_work_items WHERE legacy_import_id=$1',
    [afterAdvanceImport.resource.importId])).rows[0].n),1);
  console.log('Current assessment project: fresh V2 case created one project, published/imported without compatibility assessment, then advanced to an approved successor while retaining earlier lineage.');
} finally {
  await fixture.close();
}
