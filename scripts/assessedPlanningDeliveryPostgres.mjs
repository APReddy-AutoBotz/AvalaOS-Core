import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAssessedPlanningReviewScenario } from './testAssessedPlanningReviewPostgres.mjs';
import { createEnterpriseLifecycleFixture } from './enterpriseLifecyclePostgresFixture.mjs';

const requestId = () => randomUUID();
let fixture;

const main = async () => {
  fixture = await createEnterpriseLifecycleFixture({
    headSha: process.env.PILOT_ACCEPTANCE_HEAD ?? process.env.GITHUB_SHA ?? 'local-working-tree',
  });
  const { db, ids } = fixture;
  assert.equal((await db.query(`SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='service_role'`)).rows[0].rolbypassrls, true,
    'the isolated production-parity service role must bypass RLS');
  const materialSelects = [
    'SELECT id,artifact_id,org_id,workspace_id,version,source_mode,assess_handoff_id,studio_input_bundle_version_id,manual_brief_hash,package_hash,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count FROM public.studio_artifact_source_packages LIMIT 1',
    'SELECT id,org_id,workspace_id,source_version_id,package,package_hash FROM public.assess_v2_studio_handoffs LIMIT 1',
    'SELECT id,template_version,provider_instructions,template_hash,superseded_at FROM public.studio_system_template_versions LIMIT 1',
    'SELECT id,org_id,provider,key_ref_id,endpoint_url,deployment_name,model_allowlist,status,deleted_at FROM public.ai_provider_configs LIMIT 1',
  ];
  const materialReadVisible = async (role, sql) => {
    await db.query('BEGIN');
    try {
      await db.query(`SET LOCAL ROLE ${role}`);
      const result = await db.query(sql);
      await db.query('ROLLBACK');
      return result.rowCount > 0;
    } catch (error) {
      await db.query('ROLLBACK');
      if (error?.code === '42501') return false;
      throw error;
    }
  };
  for (const sql of materialSelects) {
    await fixture.serviceQuery(sql);
  }
  const planning = await createAssessedPlanningReviewScenario(fixture);
  let sequence = 0;
  const legacyArtifactCommands = new Set([
    'studio.artifact.draft.revise', 'studio.artifact.review.submit', 'studio.artifact.review.assign',
    'studio.artifact.review.resolve', 'studio.artifact.approval.resolve',
  ]);
  const studioCommand = async ({
    actor = ids.author,
    token = 'enterprise-author-token',
    commandType,
    expectedAggregateVersion,
    expectedArtifactVersion,
    payload,
  }) => {
    sequence += 1;
    const body = {
      ...(!legacyArtifactCommands.has(commandType) ? { contractVersion: 'studio-artifact-2' } : {}),
      requestId: requestId(),
      idempotencyKey: `assessed-planning-delivery-${sequence}`, commandType,
      organizationId: ids.organization, workspaceId: ids.workspace,
      authorizationVersion: await fixture.authorizationVersion(actor),
      expectedAggregateVersion, expectedArtifactVersion, payload,
    };
    const response = await fixture.executeStudio(new Request(`${fixture.baseUrl}/functions/v1/studio-artifact-command`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    const result = await response.json();
    const rpcError = fixture.getLastStudioRpcError?.();
    const failedHandoffState = ![200, 201].includes(response.status) && commandType === 'studio.handoff.consume'
      ? (await db.query(`SELECT status,current_version FROM public.enterprise_module_handoffs WHERE id=$1`, [payload.handoffId])).rows[0]
      : null;
    const failedGenerationState = ![200, 201].includes(response.status) && commandType === 'studio.generation.request'
      ? (await db.query(`SELECT attempt.state,attempt.failure_code,attempt.execution_fence,
          attempt.response_hash IS NOT NULL response_staged,reservation.state reservation_state,
          reservation.failure_class,reservation.studio_transfer_pending
          FROM public.studio_artifact_generation_attempts attempt
          LEFT JOIN public.enterprise_ai_budget_reservations reservation ON reservation.studio_attempt_id=attempt.id
          WHERE attempt.id=$1`, [result.resource?.attemptId])).rows[0]
      : null;
    assert.ok([200, 201].includes(response.status), `${JSON.stringify(result)}${rpcError
      ? ` · ${rpcError.message ?? rpcError}${rpcError.where ? ` · ${rpcError.where}` : ''}` : ''}${failedHandoffState
      ? ` · persisted=${JSON.stringify(failedHandoffState)}` : ''}${failedGenerationState
      ? ` · generation=${JSON.stringify(failedGenerationState)} · providerCalls=${fixture.evidence.providerEffects.syntheticProviderCalls}` : ''}`);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result;
  };
  const committed = async command => {
    const result = await studioCommand(command);
    assert.equal(result.outcome, 'committed', JSON.stringify(result));
    return result;
  };

  const canonicalTypes = ['brd', 'frd', 'pdd', 'sdd'];
  const eligibleArtifactTypes = async () => {
    const projection = (await fixture.actorQuery(ids.author,
      'SELECT public.enterprise_assess_studio_handoff_projection($1,$2) value',
      [ids.organization, ids.workspace])).rows[0].value;
    return projection.eligibleHandoffs.find(item => item.upstreamHandoffId === planning.planningHandoffId)?.artifactTypes ?? [];
  };
  const createGeneratedDocument = async artifactType => {
    const expectedBefore = canonicalTypes.filter(type => !generatedDocuments.has(type));
    assert.deepEqual((await eligibleArtifactTypes()).slice().sort(), expectedBefore.slice().sort());
    const requested = await committed({
      commandType: 'studio.handoff.request', expectedAggregateVersion: 0, expectedArtifactVersion: null,
      payload: { upstreamHandoffId: planning.planningHandoffId, artifactType, targetInputBundle: null },
    });
    const moduleHandoffId = requested.resource.handoffId;
    await committed({
      actor: ids.reviewer, token: 'enterprise-reviewer-token', commandType: 'studio.handoff.review.resolve',
      expectedAggregateVersion: 1, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 1, outcome: 'approve',
        rationale: `The reviewed planning source is suitable for the ${artifactType.toUpperCase()} draft.`, conditions: [] },
    });
    await committed({
      actor: ids.approver, token: 'enterprise-approver-token', commandType: 'studio.handoff.approval.resolve',
      expectedAggregateVersion: 2, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 2, outcome: 'approve',
        rationale: `Approve exact planning source consumption for ${artifactType.toUpperCase()}.`, conditions: [] },
    });
    const consumePreflight = (await db.query(`SELECT
      upstream.package_hash=module.upstream_package_hash upstream_hash_matches,
      public.studio_pr_b_upstream_handoff_is_current(upstream.id,module.org_id,module.workspace_id) upstream_current,
      module.route_policy_hash=public.enterprise_sha256_jsonb(module.route_policy_snapshot) route_hash_matches,
      module.target_package_hash=public.enterprise_sha256_jsonb(jsonb_build_object(
        'contractVersion','studio-source-package-1','sourceMode','assess_handoff',
        'upstreamHandoffId',upstream.id,'upstreamPackageHash',upstream.package_hash,
        'studioInputBundleVersionId',NULL,'studioBundleHash',NULL,'manualBriefHash',NULL,
        'candidateManifestHash',module.candidate_manifest_hash,'anchorManifestHash',module.anchor_manifest_hash,
        'artifactType',module.artifact_type,'routePolicyVersion',module.route_policy_version,
        'routePolicyHash',module.route_policy_hash)) target_hash_matches,
      module.candidate_manifest_hash=public.enterprise_sha256_jsonb(module.candidate_manifest) candidate_hash_matches,
      module.candidate_count=jsonb_array_length(module.candidate_manifest) candidate_count_matches,
      module.anchor_manifest_hash=public.enterprise_sha256_jsonb(module.anchor_manifest) anchor_hash_matches,
      module.anchor_count=jsonb_array_length(module.anchor_manifest) anchor_count_matches
    FROM public.enterprise_module_handoffs module
    JOIN public.assess_v2_studio_handoffs upstream ON upstream.id=module.upstream_handoff_id
    WHERE module.id=$1`, [moduleHandoffId])).rows[0];
    assert.deepEqual(consumePreflight, {
      upstream_hash_matches: true, upstream_current: true, route_hash_matches: true, target_hash_matches: true,
      candidate_hash_matches: true, candidate_count_matches: true, anchor_hash_matches: true, anchor_count_matches: true,
    });
    const consumed = await committed({
      commandType: 'studio.handoff.consume', expectedAggregateVersion: 3, expectedArtifactVersion: 1,
      payload: { handoffId: moduleHandoffId, handoffVersion: 3 },
    });
    const artifactId = consumed.resource.resourceId;
    const sourcePackageId = consumed.resource.sourcePackageId;
    const sourcePackage = (await db.query(`SELECT version,approval_purpose,planning_only,assess_handoff_id
    FROM public.studio_artifact_source_packages WHERE id=$1`, [sourcePackageId])).rows[0];
    assert.equal(sourcePackage.approval_purpose, 'documentation_planning');
    assert.equal(sourcePackage.planning_only, true);
    assert.equal(sourcePackage.assess_handoff_id, planning.planningHandoffId);

    const aggregate = (await db.query(`SELECT aggregate_version,current_version_id,current_approved_version_id
    FROM public.studio_artifact_aggregates WHERE id=$1`, [artifactId])).rows[0];
    const template = (await db.query(`SELECT id,template_version FROM public.studio_system_template_versions
      WHERE artifact_type=$1 AND superseded_at IS NULL`, [artifactType])).rows[0];
    const generated = await studioCommand({
      commandType: 'studio.generation.request', expectedAggregateVersion: Number(aggregate.aggregate_version),
      expectedArtifactVersion: null,
      payload: {
        artifactId, sourcePackageId, sourcePackageVersion: Number(sourcePackage.version),
        template: { kind: 'system', versionId: template.id, version: template.template_version },
        expectedCurrentVersionId: aggregate.current_version_id,
        expectedApprovedVersionId: aggregate.current_approved_version_id,
      },
    });
    const generatedAttempt = (await db.query(`SELECT attempt.state,attempt.failure_code,
      attempt.expected_aggregate_version,artifact.aggregate_version,
      attempt.expected_current_version_id,artifact.current_version_id,
      attempt.expected_approved_version_id,artifact.current_approved_version_id,
      package.version source_package_version,
      package.package_hash=attempt.source_package_hash source_package_hash_matches,
      public.studio_pr_b_source_package_is_current(attempt.source_package_id,attempt.org_id,attempt.workspace_id) source_current
    FROM public.studio_artifact_generation_attempts attempt
    JOIN public.studio_artifact_aggregates artifact ON artifact.id=attempt.artifact_id
    JOIN public.studio_artifact_source_packages package ON package.id=attempt.source_package_id
    WHERE attempt.id=$1`, [generated.resource.attemptId])).rows[0];
    const generationRpcError = fixture.getLastStudioRpcError?.();
    assert.equal(generated.outcome, 'generation_completed', `${artifactType}:${JSON.stringify(generated)} · attempt=${JSON.stringify(generatedAttempt)}${generationRpcError
      ? ` · rpc=${generationRpcError.message ?? generationRpcError}${generationRpcError.sqlState ? `/${generationRpcError.sqlState}` : ''}${generationRpcError.context ? ` · ${generationRpcError.context}` : ''}` : ''}`);
    generatedDocuments.set(artifactType, { artifactId, sourcePackageId, moduleHandoffId });
    const expectedAfter = canonicalTypes.filter(type => !generatedDocuments.has(type));
    assert.deepEqual((await eligibleArtifactTypes()).slice().sort(), expectedAfter.slice().sort());
  };
  const generatedDocuments = new Map();
  for (const artifactType of canonicalTypes) await createGeneratedDocument(artifactType);
  for (const sql of materialSelects) {
    assert.equal(await materialReadVisible('anon', sql), false, 'anon material table reads must disclose no rows');
    assert.equal(await materialReadVisible('authenticated', sql), false, 'authenticated material table reads must disclose no rows');
  }
  const { artifactId } = generatedDocuments.get('sdd');

  let current = (await db.query(`SELECT aggregate.aggregate_version,version.id version_id,version.version,version.content
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id
    WHERE aggregate.id=$1`, [artifactId])).rows[0];
  const requirementLink = { sectionId: 'components', sectionTitle: 'Components', requirementText: 'FR-1: The board must retain the exact approved source link.' };
  const secondRequirementLink = { sectionId: 'components', sectionTitle: 'Components', requirementText: 'FR-2: The implementation must use the approved read operation.' };
  const questionLink = { sectionId: 'openQuestionsAndProposals', sectionTitle: 'Open questions and proposals', requirementText: 'Open question: Which authentication scheme must FR-2 use?' };
  const revisedContent = {
    ...current.content,
    title: 'Planning SDD with reviewed Delivery work',
    sections: current.content.sections.map(section => {
      if (section.id === 'components') return { ...section,
        body: `${requirementLink.requirementText}\n${secondRequirementLink.requirementText}`,
        sourceAnchors: [], labels: ['human_authored'] };
      if (section.id === 'openQuestionsAndProposals') return { ...section,
        body: questionLink.requirementText, sourceAnchors: [], labels: ['human_authored'] };
      return section;
    }),
  };
  assert.ok(revisedContent.sections.some(section => section.id === 'components'));
  assert.ok(revisedContent.sections.some(section => section.id === 'openQuestionsAndProposals'));
  await committed({
    commandType: 'studio.artifact.draft.revise', expectedAggregateVersion: Number(current.aggregate_version),
    expectedArtifactVersion: Number(current.version),
    payload: { artifactId, parentVersionId: current.version_id, content: revisedContent },
  });

  const artifactLifecycleCommand = async ({ actor = ids.author, token = 'enterprise-author-token', commandType, payload }) => {
    current = (await db.query(`SELECT aggregate.aggregate_version,version.id version_id,version.version
      FROM public.studio_artifact_aggregates aggregate
      JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id
      WHERE aggregate.id=$1`, [artifactId])).rows[0];
    return committed({ actor, token, commandType, expectedAggregateVersion: Number(current.aggregate_version),
      expectedArtifactVersion: Number(current.version), payload: { artifactId, artifactVersionId: current.version_id, ...payload } });
  };
  await artifactLifecycleCommand({ commandType: 'studio.artifact.review.submit', payload: {} });
  await artifactLifecycleCommand({ commandType: 'studio.artifact.review.assign', payload: { reviewerId: ids.reviewer } });
  await artifactLifecycleCommand({ actor: ids.reviewer, token: 'enterprise-reviewer-token',
    commandType: 'studio.artifact.review.resolve', payload: { outcome: 'approve',
      rationale: 'The SDD remains explicit about the unanswered authentication question.', conditions: [] } });
  await artifactLifecycleCommand({ actor: ids.approver, token: 'enterprise-approver-token',
    commandType: 'studio.artifact.approval.resolve', payload: { outcome: 'approve',
      rationale: 'Approve this exact SDD content for planning, not implementation readiness.', conditions: [] } });
  const approved = (await db.query(`SELECT aggregate.aggregate_version,aggregate.lifecycle,aggregate.approval_purpose,
      aggregate.govern_resolution_id,version.id version_id
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_artifact_versions version ON version.id=aggregate.current_version_id
    WHERE aggregate.id=$1`, [artifactId])).rows[0];
  assert.equal(approved.lifecycle, 'approved');
  assert.equal(approved.approval_purpose, 'documentation_planning');
  assert.equal(approved.govern_resolution_id, null);
  assert.equal((await db.query(`SELECT approval_purpose FROM public.studio_artifact_approval_resolutions
    WHERE artifact_id=$1 ORDER BY resolved_at DESC LIMIT 1`, [artifactId])).rows[0].approval_purpose, 'documentation_planning');

  const authorAuthorization = await fixture.authorizationVersion(ids.author);
  const asAuthor = async operation => {
    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE authenticated');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [ids.author]);
      const value = await operation();
      await db.query('COMMIT');
      return value;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  };
  const project = (await asAuthor(() => db.query(
    'SELECT public.assess_v2_current_delivery_project_ensure($1,$2,$3,$4,$5,$6,$7) result',
    [ids.author, ids.organization, ids.workspace, authorAuthorization, planning.caseId, planning.decisionId, requestId()],
  ))).rows[0].result;
  assert.equal(project.outcome, 'created', JSON.stringify(project));
  await db.query(`INSERT INTO public.studio_delivery_workspace_controls(
    org_id,workspace_id,publication_writes_enabled,outcome_writes_enabled,pack_writes_enabled
  ) VALUES($1,$2,true,true,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET publication_writes_enabled=true`,
  [ids.organization, ids.workspace]);
  await db.query(`INSERT INTO public.legacy_delivery_workspace_controls(org_id,workspace_id,writes_enabled)
    VALUES($1,$2,true) ON CONFLICT(org_id,workspace_id) DO UPDATE SET writes_enabled=true`,
  [ids.organization, ids.workspace]);

  const workItems = [
    { proposalRole: 'coordination', type: 'Epic', title: 'Coordinate planning work',
      description: 'Coordinate the approved planning requirements.', acceptanceCriteria: ['Selected work retains source links.'], requirementLinks: [requirementLink] },
    { proposalRole: 'implementation', type: 'Task', title: 'Persist approved source links',
      description: 'Edited from Story to Task before publication.', acceptanceCriteria: ['The exact source link survives reload.'], requirementLinks: [requirementLink] },
    { proposalRole: 'implementation', type: 'Story', title: 'Use the approved read operation',
      description: 'Implement only after authentication discovery.', acceptanceCriteria: ['The approved read operation is used.'],
      requirementLinks: [secondRequirementLink], dependencyProposalIndices: [4] },
    { proposalRole: 'verification', type: 'Task', title: 'Verify approved source links',
      description: 'Distinct verification identity for the same requirement.', acceptanceCriteria: ['The board shows the exact source link.'], requirementLinks: [requirementLink] },
    { proposalRole: 'discovery', type: 'Task', title: 'Resolve the authentication scheme',
      description: 'Answer the approved unresolved question.', acceptanceCriteria: ['A source-backed answer is recorded or the question remains explicit.'], requirementLinks: [questionLink] },
  ];
  const publicationRequestId = requestId();
  const publicationKey = randomUUID();
  const publicationPayload = { artifactId, expectedArtifactVersionId: approved.version_id,
    expectedAggregateVersion: Number(approved.aggregate_version), projectId: project.projectId, workItems };
  const publication = (await fixture.serviceQuery(
    'SELECT public.studio_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [ids.author, ids.organization, ids.workspace, authorAuthorization, publicationRequestId, publicationKey,
      'studio.approved-artifact.publish', JSON.stringify(publicationPayload)],
  )).rows[0].result;
  assert.equal(publication.ok, true, JSON.stringify(publication));
  const publicationBinding = (await db.query(`SELECT approval_purpose,review_resolution_id,studio_handoff_id,govern_resolution_id
    FROM public.studio_delivery_publications WHERE id=$1`, [publication.resource.publicationId])).rows[0];
  assert.deepEqual(publicationBinding, {
    approval_purpose: 'documentation_planning', review_resolution_id: planning.reviewResolutionId,
    studio_handoff_id: planning.planningHandoffId, govern_resolution_id: null,
  });
  const source = (await fixture.serviceQuery(
    'SELECT public.legacy_delivery_requirement_query($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
    [ids.author, ids.organization, ids.workspace, authorAuthorization, project.projectId, 100, null,
      publication.resource.documentGenerationId, true],
  )).rows[0].result;
  assert.equal(source.ok, true, JSON.stringify(source));
  const importRequest = requestId();
  const importKey = `planning-import-${randomUUID()}`;
  const importPayload = { projectId: project.projectId, sourceGenerationId: publication.resource.documentGenerationId,
    expectedSourceDigest: source.source.digest, sourceItemIndices: [1, 2, 3, 4] };
  const importCommand = () => fixture.serviceQuery(
    'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [ids.author, ids.organization, ids.workspace, authorAuthorization, importRequest, importKey, 'import', JSON.stringify(importPayload)],
  );
  const imported = (await importCommand()).rows[0].result;
  assert.equal(imported.ok, true, JSON.stringify(imported));
  assert.equal(imported.resource.items.length, 4, 'the unchecked Epic must not be imported');
  const replayedImport = (await importCommand()).rows[0].result;
  assert.equal(replayedImport.ok, true, JSON.stringify(replayedImport));
  assert.equal(replayedImport.resource.importId, imported.resource.importId, 'same request/key must replay the exact import');
  const duplicate = (await fixture.serviceQuery(
    'SELECT public.legacy_delivery_apply_requirement_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
    [ids.author, ids.organization, ids.workspace, authorAuthorization, requestId(), randomUUID(), 'import', JSON.stringify(importPayload)],
  )).rows[0].result;
  assert.equal(duplicate.errorCode, 'DUPLICATE_IMPORT', JSON.stringify(duplicate));

  const board = await db.query(`SELECT item.id,item.type,item.source_lineage->>'proposalOriginId' proposal_origin,
      binding.source_item_index,binding.proposal_role,binding.requirement_links,binding.dependency_source_indices
    FROM public.delivery_work_items item
    JOIN public.studio_delivery_work_item_requirement_bindings binding
      ON binding.proposal_origin_id=item.source_lineage->>'proposalOriginId' AND binding.publication_id=$1
    WHERE item.project_id=$2 ORDER BY binding.source_item_index`, [publication.resource.publicationId, project.projectId]);
  assert.deepEqual(board.rows.map(row => Number(row.source_item_index)), [1, 2, 3, 4]);
  assert.equal(board.rows[0].type, 'Task', 'the reviewed Story-to-Task edit must persist');
  assert.notEqual(board.rows[0].proposal_origin, board.rows[2].proposal_origin,
    'implementation and verification tasks with the same requirement retain distinct identities');
  assert.deepEqual(board.rows[1].dependency_source_indices, [4]);
  assert.deepEqual(board.rows[0].requirement_links, [requirementLink]);
  assert.deepEqual(board.rows[3].requirement_links, [questionLink]);
  const dependency = await db.query(`SELECT dependent_binding.source_item_index dependent_index,
      required_binding.source_item_index required_index
    FROM public.legacy_delivery_work_item_dependencies link
    JOIN public.delivery_work_items dependent ON dependent.id=link.work_item_id
    JOIN public.delivery_work_items required ON required.id=link.dependency_id
    JOIN public.studio_delivery_work_item_requirement_bindings dependent_binding
      ON dependent_binding.proposal_origin_id=dependent.source_lineage->>'proposalOriginId' AND dependent_binding.publication_id=$1
    JOIN public.studio_delivery_work_item_requirement_bindings required_binding
      ON required_binding.proposal_origin_id=required.source_lineage->>'proposalOriginId' AND required_binding.publication_id=$1`,
  [publication.resource.publicationId]);
  assert.deepEqual(dependency.rows.map(row => ({ dependent: Number(row.dependent_index), required: Number(row.required_index) })),
    [{ dependent: 2, required: 4 }]);
  console.log('ASSESSED PLANNING DELIVERY POSTGRES PASS canonical governed generation, approved planning publication, selected import, exact source links, explicit discovery dependency, edited identity, replay and duplicate protection');
};

try {
  await main();
} finally {
  if (fixture) await fixture.close();
}
