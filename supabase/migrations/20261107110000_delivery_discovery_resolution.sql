-- Discovery-task completion is not inferred from Done. A current typed outcome
-- must carry either an accepted source-backed answer or an independently
-- approved nonblocking scope for the exact imported question.

BEGIN;

ALTER TABLE public.legacy_delivery_outcome_versions
 ADD COLUMN discovery_disposition text,
 ADD COLUMN discovery_question text,
 ADD COLUMN discovery_answer text,
 ADD COLUMN discovery_evidence_attestation_id uuid,
 ADD COLUMN discovery_revised_scope text,
 ADD CONSTRAINT legacy_delivery_outcome_discovery_resolution_check CHECK((
  (discovery_disposition IS NULL AND discovery_question IS NULL AND discovery_answer IS NULL
   AND discovery_evidence_attestation_id IS NULL AND discovery_revised_scope IS NULL)
  OR(discovery_disposition='blocking_unresolved' AND length(btrim(discovery_question)) BETWEEN 1 AND 2000
   AND discovery_answer IS NULL AND discovery_evidence_attestation_id IS NULL AND discovery_revised_scope IS NULL)
  OR(discovery_disposition IN('source_backed_answer_proposed','source_backed_answer_accepted') AND length(btrim(discovery_question)) BETWEEN 1 AND 2000
   AND length(btrim(discovery_answer)) BETWEEN 1 AND 4000 AND discovery_evidence_attestation_id IS NOT NULL AND discovery_revised_scope IS NULL)
  OR(discovery_disposition IN('nonblocking_scope_proposed','approved_nonblocking_scope') AND length(btrim(discovery_question)) BETWEEN 1 AND 2000
   AND discovery_answer IS NULL AND discovery_evidence_attestation_id IS NULL AND length(btrim(discovery_revised_scope)) BETWEEN 1 AND 4000)
 ) IS TRUE) NOT VALID;
ALTER TABLE public.legacy_delivery_outcome_versions VALIDATE CONSTRAINT legacy_delivery_outcome_discovery_resolution_check;

CREATE OR REPLACE FUNCTION public.studio_delivery_discovery_resolution_valid(
 p_task public.delivery_work_items,p_publication public.studio_delivery_publications,p_payload jsonb,p_actor uuid,p_authorization_version bigint
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE resolution_payload jsonb:=p_payload->'discoveryResolution';disposition text;question text;
 current_resolution public.legacy_delivery_outcome_versions;
BEGIN
 IF COALESCE(p_task.source_lineage->>'proposalRole','')<>'discovery' THEN RETURN resolution_payload IS NULL; END IF;
 IF jsonb_typeof(p_task.source_lineage->'requirementLinks')<>'array'
  OR jsonb_array_length(p_task.source_lineage->'requirementLinks')<>1 THEN RETURN false;END IF;
 SELECT outcome_version.* INTO current_resolution FROM public.legacy_delivery_outcome_aggregates aggregate
  JOIN public.legacy_delivery_outcome_versions outcome_version ON outcome_version.id=aggregate.current_version_id AND outcome_version.outcome_id=aggregate.id
  WHERE aggregate.task_id=p_task.id AND aggregate.org_id=p_task.org_id AND aggregate.workspace_id=p_task.workspace_id;
 IF p_task.status='Done' AND current_resolution.discovery_disposition IN('source_backed_answer_accepted','approved_nonblocking_scope') THEN RETURN false;END IF;
 IF jsonb_typeof(resolution_payload)<>'object' OR NOT public.legacy_delivery_jsonb_keys_allowed(resolution_payload,
   ARRAY['disposition','question','answer','evidenceAttestationId','revisedScope'],
   ARRAY['disposition','question','answer','evidenceAttestationId','revisedScope']) THEN RETURN false; END IF;
 disposition:=resolution_payload->>'disposition';question:=resolution_payload->>'question';
 IF disposition NOT IN('blocking_unresolved','source_backed_answer_proposed','source_backed_answer_accepted','nonblocking_scope_proposed','approved_nonblocking_scope')
  OR length(btrim(question)) NOT BETWEEN 1 AND 2000
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_task.source_lineage->'requirementLinks','[]'::jsonb)) link
    WHERE link->>'requirementText'=question) THEN RETURN false; END IF;
 IF disposition='blocking_unresolved' THEN
  RETURN resolution_payload->'answer'='null'::jsonb AND resolution_payload->'evidenceAttestationId'='null'::jsonb AND resolution_payload->'revisedScope'='null'::jsonb;
 ELSIF disposition IN('source_backed_answer_proposed','source_backed_answer_accepted') THEN
  IF NOT(jsonb_typeof(resolution_payload->'answer')='string' AND length(btrim(resolution_payload->>'answer')) BETWEEN 1 AND 4000
   AND jsonb_typeof(resolution_payload->'evidenceAttestationId')='string'
   AND (resolution_payload->>'evidenceAttestationId')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   AND resolution_payload->'revisedScope'='null'::jsonb
   AND EXISTS(SELECT 1 FROM public.assess_v2_evidence_attestations attestation
    JOIN public.assess_v2_review_resolutions review ON review.id=p_publication.review_resolution_id
     AND review.review_id=attestation.review_id AND review.case_id=attestation.case_id
     AND review.decision_id=attestation.decision_id AND review.source_version_id=attestation.source_version_id
     AND review.org_id=attestation.org_id AND review.workspace_id=attestation.workspace_id AND review.resolution='approved'
    WHERE attestation.id=(resolution_payload->>'evidenceAttestationId')::uuid AND attestation.outcome='accepted'
     AND attestation.org_id=p_task.org_id AND attestation.workspace_id=p_task.workspace_id)) THEN RETURN false;END IF;
  IF disposition='source_backed_answer_proposed' THEN RETURN true;END IF;
  PERFORM public.legacy_delivery_assert_any_authority(p_actor,p_task.org_id,p_task.workspace_id,
   ARRAY['org.admin','security.manage','roles.manage','project.manage'],p_authorization_version);
  RETURN current_resolution.discovery_disposition='source_backed_answer_proposed'
   AND current_resolution.discovery_question=question
   AND current_resolution.discovery_answer=btrim(resolution_payload->>'answer')
   AND current_resolution.discovery_evidence_attestation_id=(resolution_payload->>'evidenceAttestationId')::uuid
   AND current_resolution.recorded_by<>p_actor;
 ELSIF disposition='nonblocking_scope_proposed' THEN
  RETURN resolution_payload->'answer'='null'::jsonb AND resolution_payload->'evidenceAttestationId'='null'::jsonb
   AND jsonb_typeof(resolution_payload->'revisedScope')='string' AND length(btrim(resolution_payload->>'revisedScope')) BETWEEN 1 AND 4000;
 END IF;
 PERFORM public.legacy_delivery_assert_any_authority(p_actor,p_task.org_id,p_task.workspace_id,
  ARRAY['org.admin','security.manage','roles.manage','project.manage'],p_authorization_version);
 RETURN resolution_payload->'answer'='null'::jsonb AND resolution_payload->'evidenceAttestationId'='null'::jsonb
  AND jsonb_typeof(resolution_payload->'revisedScope')='string' AND length(btrim(resolution_payload->>'revisedScope')) BETWEEN 1 AND 4000
  AND current_resolution.discovery_disposition='nonblocking_scope_proposed' AND current_resolution.discovery_question=question
  AND current_resolution.discovery_revised_scope=btrim(resolution_payload->>'revisedScope') AND current_resolution.recorded_by<>p_actor;
END $$;

CREATE OR REPLACE FUNCTION public.legacy_delivery_discovery_dependency_released(p_task_id uuid,p_org uuid,p_workspace uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE task_row public.delivery_work_items;current_resolution public.legacy_delivery_outcome_versions;
BEGIN
 SELECT * INTO task_row FROM public.delivery_work_items item WHERE item.id=p_task_id AND item.org_id=p_org AND item.workspace_id=p_workspace FOR SHARE;
 IF task_row.id IS NULL OR task_row.retention_state<>'active' OR COALESCE(task_row.source_lineage->>'proposalRole','')<>'discovery' THEN RETURN false; END IF;
 SELECT outcome_version.* INTO current_resolution FROM public.legacy_delivery_outcome_aggregates aggregate
  JOIN public.legacy_delivery_outcome_versions outcome_version ON outcome_version.id=aggregate.current_version_id AND outcome_version.outcome_id=aggregate.id
  WHERE aggregate.task_id=task_row.id AND aggregate.org_id=p_org AND aggregate.workspace_id=p_workspace FOR SHARE OF aggregate,outcome_version;
 RETURN (current_resolution.id IS NOT NULL
  AND current_resolution.discovery_disposition IN('source_backed_answer_accepted','approved_nonblocking_scope')) IS TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.studio_delivery_outcome_projection(p_row public.legacy_delivery_outcome_versions)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('outcomeId',p_row.outcome_id,'version',p_row.version,'taskId',p_row.task_id,'taskVersion',p_row.task_version,
  'projectId',p_row.project_id,'status',p_row.status,'label',p_row.label,'detail',p_row.detail,
  'discoveryResolution',CASE WHEN p_row.discovery_disposition IS NULL THEN NULL ELSE jsonb_build_object(
   'disposition',p_row.discovery_disposition,'question',p_row.discovery_question,'answer',p_row.discovery_answer,
   'evidenceAttestationId',p_row.discovery_evidence_attestation_id,'revisedScope',p_row.discovery_revised_scope) END,
  'documentGenerationId',p_row.document_generation_id,'studioArtifactId',p_row.studio_artifact_id,
  'studioArtifactVersionId',p_row.studio_artifact_version_id,'recordedBy',p_row.recorded_by,'recordedAt',p_row.recorded_at)
$$;

DO $discovery_outcome_command$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.studio_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:=$old$ARRAY['taskId','expectedTaskVersion','expectedOutcomeVersion','status','label','detail'],ARRAY['taskId','expectedTaskVersion','expectedOutcomeVersion','status','label','detail'])$old$;
 replacement:=$new$ARRAY['taskId','expectedTaskVersion','expectedOutcomeVersion','status','label','detail','discoveryResolution'],ARRAY['taskId','expectedTaskVersion','expectedOutcomeVersion','status','label','detail'])$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DISCOVERY_OUTCOME_KEYS_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$IF project_row.id IS NULL OR import_row.id IS NULL OR document_row.id IS NULL OR publication.id IS NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND'; END IF;
  SELECT * INTO outcome$old$;
 replacement:=$new$IF project_row.id IS NULL OR import_row.id IS NULL OR document_row.id IS NULL OR publication.id IS NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND'; END IF;
  IF public.studio_delivery_discovery_resolution_valid(task,publication,p_payload,p_actor_id,p_expected_authorization_version) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND'; END IF;
  SELECT * INTO outcome$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DISCOVERY_OUTCOME_VALIDATION_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$publication_id,document_generation_id,studio_artifact_id,studio_artifact_version_id,legacy_import_id,recorded_by,recorder_authorization_version,receipt_id,audit_event_id)
  VALUES(outcome.id,p_org_id,p_workspace_id,task.project_id,task.id,next_version,task.authority_version,p_payload->>'status',btrim(p_payload->>'label'),btrim(p_payload->>'detail'),
   publication.id,document_row.id,publication.studio_artifact_id,publication.studio_artifact_version_id,import_row.id,p_actor_id,p_expected_authorization_version,receipt.id,audit_id)$old$;
 replacement:=$new$discovery_disposition,discovery_question,discovery_answer,discovery_evidence_attestation_id,discovery_revised_scope,
   publication_id,document_generation_id,studio_artifact_id,studio_artifact_version_id,legacy_import_id,recorded_by,recorder_authorization_version,receipt_id,audit_event_id)
  VALUES(outcome.id,p_org_id,p_workspace_id,task.project_id,task.id,next_version,task.authority_version,p_payload->>'status',btrim(p_payload->>'label'),btrim(p_payload->>'detail'),
   p_payload->'discoveryResolution'->>'disposition',btrim(p_payload->'discoveryResolution'->>'question'),NULLIF(btrim(p_payload->'discoveryResolution'->>'answer'),''),
   NULLIF(p_payload->'discoveryResolution'->>'evidenceAttestationId','')::uuid,NULLIF(btrim(p_payload->'discoveryResolution'->>'revisedScope'),''),
   publication.id,document_row.id,publication.studio_artifact_id,publication.studio_artifact_version_id,import_row.id,p_actor_id,p_expected_authorization_version,receipt.id,audit_id)$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DISCOVERY_OUTCOME_INSERT_PREDECESSOR_MISMATCH';END IF;
 EXECUTE replace(definition,old,replacement);
END $discovery_outcome_command$;

DO $discovery_delivery_guard$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.legacy_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:=$old$IF cardinality(assignees)>20 OR cardinality(dependencies)>100 OR task_id=ANY(dependencies) THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;$old$;
 replacement:=$new$IF cardinality(assignees)>20 OR cardinality(dependencies)>100 OR task_id=ANY(dependencies) THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
  IF patch?'dependencyIds' AND EXISTS(SELECT 1 FROM public.legacy_delivery_work_item_dependencies binding
   JOIN public.delivery_work_items dependency_item ON dependency_item.id=binding.dependency_id
   WHERE binding.work_item_id=task_id AND dependency_item.source_lineage->>'proposalRole'='discovery'
    AND NOT dependency_item.id=ANY(dependencies)) THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DEPENDENCY_INCOMPLETE'; END IF;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DISCOVERY_DEPENDENCY_REMOVAL_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$WHERE dependency_item.status<>'Done' OR dependency_item.retention_state<>'active'
  ) THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DEPENDENCY_INCOMPLETE'; END IF;$old$;
 replacement:=$new$WHERE dependency_item.status<>'Done' OR dependency_item.retention_state<>'active'
    OR(dependency_item.source_lineage->>'proposalRole'='discovery'
      AND public.legacy_delivery_discovery_dependency_released(dependency_item.id,p_org_id,p_workspace_id) IS NOT TRUE)
  ) THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DEPENDENCY_INCOMPLETE'; END IF;
  IF next_status='Done' AND task_row.source_lineage->>'proposalRole'='discovery'
   AND public.legacy_delivery_discovery_dependency_released(task_row.id,p_org_id,p_workspace_id) IS NOT TRUE
  THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DEPENDENCY_INCOMPLETE'; END IF;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'DISCOVERY_DEPENDENCY_RELEASE_PREDECESSOR_MISMATCH';END IF;
 EXECUTE replace(definition,old,replacement);
END $discovery_delivery_guard$;

REVOKE ALL ON FUNCTION public.studio_delivery_discovery_resolution_valid(public.delivery_work_items,public.studio_delivery_publications,jsonb,uuid,bigint),
 public.legacy_delivery_discovery_dependency_released(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.studio_delivery_outcome_projection(public.legacy_delivery_outcome_versions) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.studio_delivery_outcome_projection(public.legacy_delivery_outcome_versions) TO service_role;

COMMENT ON COLUMN public.legacy_delivery_outcome_versions.discovery_disposition IS
 'Typed current discovery disposition. Done alone never releases dependent implementation.';
COMMENT ON FUNCTION public.legacy_delivery_discovery_dependency_released(uuid,uuid,uuid) IS
 'Fail-closed authoritative discovery release guard. Historical Done tasks without a qualified current outcome remain blocking.';

CREATE OR REPLACE FUNCTION public.studio_delivery_outcome_query(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_expected_authorization_version bigint,p_project_id uuid,
 p_limit integer DEFAULT 100,p_cursor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE project_row public.projects;items jsonb;source_options jsonb;next_cursor uuid;has_more boolean;
BEGIN
 PERFORM public.legacy_delivery_assert_any_authority(p_actor_id,p_org_id,p_workspace_id,
  ARRAY['org.admin','security.manage','roles.manage','project.manage','delivery.outcomes.read','task.read','backlog.read'],p_expected_authorization_version);
 IF p_project_id IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';END IF;
 SELECT * INTO project_row FROM public.projects row WHERE row.id=p_project_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id
  AND row.status='active' AND row.archived_at IS NULL AND row.deleted_at IS NULL;
 IF project_row.id IS NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND';END IF;
 SELECT COALESCE(jsonb_agg(page.projection ORDER BY page.id),'[]'::jsonb),max(page.id::text)::uuid INTO items,next_cursor FROM(
  SELECT aggregate.id,public.studio_delivery_outcome_projection(outcome_version) projection
  FROM public.legacy_delivery_outcome_aggregates aggregate
  JOIN public.legacy_delivery_outcome_versions outcome_version ON outcome_version.id=aggregate.current_version_id AND outcome_version.outcome_id=aggregate.id
  JOIN public.delivery_work_items task ON task.id=aggregate.task_id AND task.org_id=aggregate.org_id AND task.workspace_id=aggregate.workspace_id AND task.project_id=aggregate.project_id
  JOIN public.legacy_delivery_imports imported ON imported.id=outcome_version.legacy_import_id AND imported.project_id=aggregate.project_id AND imported.source_generation_id=outcome_version.document_generation_id
  JOIN public.studio_delivery_publications publication ON publication.id=outcome_version.publication_id AND publication.project_id=aggregate.project_id AND publication.document_generation_id=outcome_version.document_generation_id
  WHERE aggregate.org_id=p_org_id AND aggregate.workspace_id=p_workspace_id AND aggregate.project_id=p_project_id AND(p_cursor IS NULL OR aggregate.id>p_cursor)
  ORDER BY aggregate.id LIMIT p_limit) page;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('taskId',source.task_id,'evidenceAttestationId',source.attestation_id,'label',source.label)
  ORDER BY source.task_id,source.attestation_id),'[]'::jsonb) INTO source_options FROM(
  SELECT DISTINCT task.id task_id,attestation.id attestation_id,
   'Accepted document source · independent review'::text label
  FROM public.delivery_work_items task
  JOIN public.document_generations generation ON generation.id=task.document_generation_id AND generation.org_id=task.org_id
   AND generation.workspace_id=task.workspace_id AND generation.project_id=task.project_id
  JOIN public.studio_delivery_publications publication ON publication.id=generation.studio_delivery_publication_id
   AND publication.org_id=task.org_id AND publication.workspace_id=task.workspace_id AND publication.project_id=task.project_id
  JOIN public.assess_v2_review_resolutions review ON review.id=publication.review_resolution_id AND review.resolution='approved'
  JOIN public.assess_v2_evidence_attestations attestation ON attestation.review_id=review.review_id
   AND attestation.case_id=review.case_id AND attestation.decision_id=review.decision_id AND attestation.source_version_id=review.source_version_id
   AND attestation.org_id=review.org_id AND attestation.workspace_id=review.workspace_id AND attestation.outcome='accepted'
  WHERE task.org_id=p_org_id AND task.workspace_id=p_workspace_id AND task.project_id=p_project_id
   AND task.retention_state='active' AND task.source_lineage->>'proposalRole'='discovery'
  LIMIT 500) source;
 SELECT COALESCE(next_cursor IS NOT NULL AND EXISTS(SELECT 1 FROM public.legacy_delivery_outcome_aggregates aggregate
  WHERE aggregate.org_id=p_org_id AND aggregate.workspace_id=p_workspace_id AND aggregate.project_id=p_project_id AND aggregate.id>next_cursor),false) INTO has_more;
 IF NOT has_more THEN next_cursor:=NULL;END IF;
 RETURN jsonb_build_object('ok',true,'schemaVersion','studio-delivery-outcome-query.v1','projectId',p_project_id,'items',items,
  'sourceOptions',source_options,'page',jsonb_build_object('limit',p_limit,'nextCursor',next_cursor,'hasMore',has_more));
EXCEPTION WHEN OTHERS THEN RETURN public.studio_delivery_error(SQLERRM);END $$;

REVOKE ALL ON FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) TO service_role;

-- PostgREST executes STABLE RPCs in a read-only transaction. Both projections
-- call the fail-closed authority helper, which intentionally takes shared row
-- locks while validating the current authorization version. Marking the RPCs
-- VOLATILE preserves those locks and makes PostgREST admit the read transaction
-- through a read-write transaction without changing either projection's data.
ALTER FUNCTION public.studio_delivery_assignee_query(uuid,uuid,uuid,bigint,uuid) VOLATILE;
ALTER FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) VOLATILE;

DO $delivery_discovery_identity$
DECLARE procedure_name regprocedure;definition text;old_tip text:='20261106210205';new_tip text:='20261107110000';
 old_count integer;new_count integer;metadata_before jsonb;metadata_after jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity WHERE singleton AND migration_tip=old_tip
   AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized)
 THEN RAISE EXCEPTION 'DELIVERY_DISCOVERY_IDENTITY_PRECONDITION';END IF;
 FOREACH procedure_name IN ARRAY ARRAY[
  'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure,
  'public.process_evidence_resume_provider_run(uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure,
  'public.synthetic_ai_campaign_activate_final_continuation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure,
  'public.synthetic_ai_campaign_bootstrap(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz)'::regprocedure,
  'public.pr_c_controlled_human_assert_marker()'::regprocedure,
  'public.synthetic_ai_campaign_activate_brd_v3_quality_validation(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure,
  'public.authenticated_synthetic_local_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)'::regprocedure,
  'public.authenticated_synthetic_exercise_activate(uuid,text,text,text,text,text,text,text,text,text,text,uuid,uuid,timestamptz)'::regprocedure,
  'public.enterprise_provider_secret_write(uuid,uuid,bigint,uuid,uuid,text,text,text,text)'::regprocedure,
  'public.enterprise_provider_secret_resolve(uuid,uuid,text,text,text)'::regprocedure,
  'public.enterprise_provider_secret_resolve_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)'::regprocedure,
  'public.enterprise_provider_secret_observe(uuid,uuid,uuid,text,text)'::regprocedure,
  'public.enterprise_provider_secret_inventory(uuid,uuid)'::regprocedure,
  'public.enterprise_provider_secret_delete_for_receipt(uuid,uuid,bigint,uuid,uuid,text,text,text)'::regprocedure,
  'public.enterprise_provider_secret_delete_for_cleanup(uuid,uuid,bigint,uuid,uuid,text,text,text)'::regprocedure
 ] LOOP
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),jsonb_build_object(
   'owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,
   'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
  old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
  new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
  IF old_count<>1 OR new_count<>0 THEN RAISE EXCEPTION 'DELIVERY_DISCOVERY_FUNCTION_SOURCE_MISMATCH:%',procedure_name;END IF;
  EXECUTE replace(definition,old_tip,new_tip);
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,
   'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before THEN RAISE EXCEPTION 'DELIVERY_DISCOVERY_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;END IF;
 END LOOP;
 ALTER TABLE public.pr_c_controlled_human_exercises DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
 ALTER TABLE public.pr_c_controlled_human_exercises ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK(migration_tip IN(
  '20260904120000','20260924113000','20260926053818','20260928060000','20261003015246','20261003055918','20261003123459','20261003150800',
  '20261004025101','20261004112232','20261008022445','20261009162752','20261010025331','20261010051100','20261010051413','20261010144356',
  '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717',
  '20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002',
  '20261106012003','20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001','20261106190001',
  '20261106191539','20261106210205','20261107110000'));
 ALTER TABLE public.authenticated_synthetic_exercises DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
 ALTER TABLE public.authenticated_synthetic_exercises ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip IN(
  '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103',
  '20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001',
  '20261106012002','20261106012003','20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001',
  '20261106190001','20261106191539','20261106210205','20261107110000'));
 ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
 UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
 ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='20261107110000');
END $delivery_discovery_identity$;

NOTIFY pgrst,'reload schema';
COMMIT;
