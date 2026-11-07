-- Bind a finalized Assess V2 case directly to one Delivery project.
-- This is additive authority. It does not manufacture or rewrite a V1 assessment.

ALTER TABLE public.projects
  ADD COLUMN source_current_case_id uuid,
  ADD COLUMN source_current_decision_id uuid,
  ADD COLUMN source_current_govern_resolution_id uuid;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_current_case_scope_fk
    FOREIGN KEY(source_current_case_id,workspace_id,org_id)
    REFERENCES public.assess_v2_cases(id,workspace_id,org_id) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_current_govern_scope_fk
    FOREIGN KEY(source_current_govern_resolution_id,source_current_case_id,source_current_decision_id,workspace_id,org_id)
    REFERENCES public.assess_v2_govern_resolutions(id,case_id,decision_id,workspace_id,org_id) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_current_assessment_binding_check CHECK(
    (source_current_case_id IS NULL AND source_current_decision_id IS NULL AND source_current_govern_resolution_id IS NULL)
    OR (source_current_case_id IS NOT NULL AND source_current_decision_id IS NOT NULL AND source_current_govern_resolution_id IS NOT NULL
      AND source_process_id IS NOT NULL)
  );

CREATE UNIQUE INDEX projects_current_case_active_uq
  ON public.projects(org_id,workspace_id,source_current_case_id)
  WHERE source_current_case_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.studio_delivery_publications ALTER COLUMN source_assessment_id DROP NOT NULL;
ALTER TABLE public.legacy_delivery_imports ALTER COLUMN source_assessment_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.assess_v2_current_delivery_project_ensure(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_authorization_version bigint,
 p_case_id uuid,p_decision_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source_case public.assess_v2_cases;source_process public.assess_processes;
 decision_row public.assess_v2_decision_versions;govern public.assess_v2_govern_resolutions;handoff public.assess_v2_studio_handoffs;
 project_row public.projects;project_outcome text:='replayed';audit_id uuid:=gen_random_uuid();prior_decision_id uuid;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_AUTHENTICATION_REQUIRED';
 END IF;
 PERFORM public.legacy_delivery_assert_any_authority(p_actor_id,p_org_id,p_workspace_id,
  ARRAY['org.admin','security.manage','roles.manage','project.manage'],p_authorization_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_workspace_id::text||':'||p_case_id::text,0));
 SELECT * INTO source_case FROM public.assess_v2_cases row
  WHERE row.id=p_case_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id
   AND row.status IN('reviewer_ready','approved','handed_off') AND row.deleted_at IS NULL FOR SHARE;
 SELECT * INTO govern FROM public.assess_v2_govern_resolutions row
  WHERE row.case_id=p_case_id AND row.decision_id=p_decision_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO decision_row FROM public.assess_v2_decision_versions row
  WHERE row.id=p_decision_id AND row.case_id=p_case_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO handoff FROM public.assess_v2_studio_handoffs row
  WHERE row.case_id=p_case_id AND row.decision_id=p_decision_id AND row.govern_resolution_id=govern.id
   AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO source_process FROM public.assess_processes row
  WHERE row.id=source_case.process_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.deleted_at IS NULL FOR SHARE;
 IF source_case.id IS NULL OR decision_row.id IS NULL OR govern.id IS NULL OR handoff.id IS NULL OR source_process.id IS NULL THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_NOT_AVAILABLE';
 END IF;
 SELECT * INTO project_row FROM public.projects row
  WHERE row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.source_current_case_id=p_case_id
   AND row.deleted_at IS NULL FOR UPDATE;
 IF project_row.id IS NULL THEN
  INSERT INTO public.projects(org_id,workspace_id,name,description,owner_id,created_by,updated_by,
   source_process_id,source_assessment_id,source_current_case_id,source_current_decision_id,
   source_current_govern_resolution_id,status,lifecycle_stage,health_status,metadata,audit_correlation_id)
  VALUES(p_org_id,p_workspace_id,source_process.name||' Delivery',
   'Delivery project for the approved current assessment.',p_actor_id,p_actor_id,p_actor_id,
   source_case.process_id,NULL,source_case.id,p_decision_id,govern.id,'active','Planning','On Track',
   jsonb_build_object('schemaVersion','current-assessment-delivery-project.v1','caseId',source_case.id,
    'decisionId',p_decision_id,'governResolutionId',govern.id,'handoffId',handoff.id),p_request_id::text)
  RETURNING * INTO project_row;
  project_outcome:='created';
  INSERT INTO public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,
   resource_type,resource_id,outcome,resource_version,metadata)
  VALUES(audit_id,p_org_id,p_workspace_id,p_actor_id,p_request_id,'assess.v2.delivery-project.ensure',
   'project',project_row.id,'succeeded',1,jsonb_build_object('caseId',p_case_id,'decisionId',p_decision_id,'governResolutionId',govern.id));
 ELSIF project_row.source_process_id IS DISTINCT FROM source_case.process_id
    OR project_row.status<>'active' OR project_row.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT';
 ELSIF project_row.source_current_decision_id IS DISTINCT FROM p_decision_id THEN
  IF decision_row.supersedes_decision_id IS DISTINCT FROM project_row.source_current_decision_id THEN
   RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT';
  END IF;
  prior_decision_id:=project_row.source_current_decision_id;
  UPDATE public.projects SET source_current_decision_id=p_decision_id,
   source_current_govern_resolution_id=govern.id,updated_by=p_actor_id,updated_at=statement_timestamp(),
   metadata=metadata||jsonb_build_object('decisionId',p_decision_id,'governResolutionId',govern.id,'handoffId',handoff.id)
  WHERE id=project_row.id RETURNING * INTO project_row;
  project_outcome:='advanced';
  INSERT INTO public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,
   resource_type,resource_id,outcome,resource_version,metadata)
  VALUES(audit_id,p_org_id,p_workspace_id,p_actor_id,p_request_id,'assess.v2.delivery-project.advance',
   'project',project_row.id,'succeeded',1,jsonb_build_object('caseId',p_case_id,'priorDecisionId',prior_decision_id,
    'decisionId',p_decision_id,'governResolutionId',govern.id));
 ELSIF project_row.source_current_govern_resolution_id IS DISTINCT FROM govern.id THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT';
 END IF;
 RETURN jsonb_build_object('schemaVersion','current-assessment-delivery-project.v1',
  'outcome',project_outcome,'projectId',project_row.id,
  'projectName',project_row.name,'caseId',source_case.id,'decisionId',p_decision_id);
END
$$;

REVOKE ALL ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO authenticated;

-- Allow the approved V2 case to be the direct publication authority when no V1 compatibility row exists.
DO $patch_publication$
DECLARE fn regprocedure:='public.studio_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure;
 definition text;old text;replacement text;
BEGIN
 definition:=pg_get_functiondef(fn);
 old:=$old$  SELECT * INTO project_row FROM public.projects row WHERE row.id=(p_payload->>'projectId')::uuid AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id
   AND row.source_process_id=source_case.process_id AND row.source_assessment_id IS NOT NULL
   AND row.status='active' AND row.archived_at IS NULL AND row.deleted_at IS NULL FOR SHARE;
  SELECT * INTO source_assessment FROM public.assessments row WHERE row.id=project_row.source_assessment_id
   AND row.process_id=source_case.process_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.deleted_at IS NULL FOR SHARE;
  IF artifact_version.id IS NULL OR artifact_version.lifecycle<>'approved' OR approval.id IS NULL OR govern.id IS NULL OR source_case.id IS NULL OR source_assessment.id IS NULL OR project_row.id IS NULL
   OR (source_case.source_v1_assessment_id IS NOT NULL AND (source_case.source_v1_assessment_id IS DISTINCT FROM source_assessment.id
    OR source_case.source_v1_score_version IS DISTINCT FROM source_assessment.score_version)) THEN RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND'; END IF;$old$;
 replacement:=$new$  SELECT * INTO project_row FROM public.projects row WHERE row.id=(p_payload->>'projectId')::uuid AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id
   AND row.source_process_id=source_case.process_id AND row.status='active' AND row.archived_at IS NULL AND row.deleted_at IS NULL FOR SHARE;
  IF project_row.source_assessment_id IS NOT NULL THEN
   SELECT * INTO source_assessment FROM public.assessments row WHERE row.id=project_row.source_assessment_id
    AND row.process_id=source_case.process_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.deleted_at IS NULL FOR SHARE;
  END IF;
  IF artifact_version.id IS NULL OR artifact_version.lifecycle<>'approved' OR approval.id IS NULL OR govern.id IS NULL OR source_case.id IS NULL OR project_row.id IS NULL
   OR (project_row.source_assessment_id IS NOT NULL AND (source_assessment.id IS NULL
    OR (source_case.source_v1_assessment_id IS NOT NULL AND
     (source_case.source_v1_assessment_id IS DISTINCT FROM source_assessment.id
      OR source_case.source_v1_score_version IS DISTINCT FROM source_assessment.score_version))))
   OR (project_row.source_assessment_id IS NULL AND (source_case.source_v1_assessment_id IS NOT NULL
    OR project_row.source_current_case_id IS DISTINCT FROM source_case.id
    OR project_row.source_current_decision_id IS DISTINCT FROM artifact.decision_id
    OR project_row.source_current_govern_resolution_id IS DISTINCT FROM govern.id)) THEN RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND'; END IF;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PUBLICATION_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:='source_case.process_id,source_assessment.id,artifact.review_resolution_id';
 replacement:='source_case.process_id,project_row.source_assessment_id,artifact.review_resolution_id';
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PUBLICATION_BINDING_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:='''assessmentId'',source_assessment.id,';replacement:='''assessmentId'',project_row.source_assessment_id,';
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PUBLICATION_AUDIT_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:='''generated'',p_actor_id,p_actor_id,source_case.process_id,source_assessment.id,';
 replacement:='''generated'',p_actor_id,p_actor_id,source_case.process_id,project_row.source_assessment_id,';
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PUBLICATION_DOCUMENT_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 EXECUTE definition;
END
$patch_publication$;

-- Requirement-bound imports accept either the retained V1 link or the exact current-assessment publication.
DO $patch_import$
DECLARE fn regprocedure:='public.legacy_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure;
 definition text;old text;replacement text;
BEGIN
 -- Normalize line endings so the guarded one-occurrence patch remains
 -- invariant to pg_get_functiondef formatting while still failing closed on
 -- semantic drift in the import authority routine.
 definition:=replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10));
 old:=replace($old$ IF project_row.id IS NULL OR generation.id IS NULL OR generation.source_process_id IS NULL OR generation.source_assessment_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.assess_processes process WHERE process.id=generation.source_process_id AND process.org_id=p_org_id AND process.workspace_id=p_workspace_id AND process.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.assessments assessment WHERE assessment.id=generation.source_assessment_id AND assessment.process_id=generation.source_process_id
   AND assessment.org_id=p_org_id AND assessment.workspace_id=p_workspace_id AND assessment.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND'; END IF;$old$,chr(13)||chr(10),chr(10));
 replacement:=replace($new$ IF project_row.id IS NULL OR generation.id IS NULL OR generation.source_process_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.assess_processes process WHERE process.id=generation.source_process_id AND process.org_id=p_org_id AND process.workspace_id=p_workspace_id AND process.deleted_at IS NULL)
  OR (generation.source_assessment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assessments assessment
   WHERE assessment.id=generation.source_assessment_id AND assessment.process_id=generation.source_process_id
    AND assessment.org_id=p_org_id AND assessment.workspace_id=p_workspace_id AND assessment.deleted_at IS NULL))
  OR (generation.source_assessment_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.studio_delivery_publications publication
   JOIN public.projects bound_project ON bound_project.id=publication.project_id AND bound_project.org_id=publication.org_id
   WHERE publication.id=bound_publication_id AND publication.document_generation_id=generation.id
    AND publication.org_id=p_org_id AND publication.workspace_id=p_workspace_id
    AND publication.source_process_id=generation.source_process_id AND publication.source_assessment_id IS NULL
    AND bound_project.source_current_case_id=publication.source_case_id))
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND'; END IF;$new$,chr(13)||chr(10),chr(10));
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_IMPORT_PREDECESSOR_MISMATCH';END IF;
 EXECUTE replace(definition,old,replacement);
END
$patch_import$;

DO $patch_query$
DECLARE fn regprocedure:='public.legacy_delivery_query(uuid,uuid,uuid,bigint,uuid,integer,uuid,uuid,boolean)'::regprocedure;
 definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10));
 old:=replace($old$  IF generation.id IS NULL OR generation.source_process_id IS NULL OR generation.source_assessment_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.assess_processes process WHERE process.id=generation.source_process_id
      AND process.org_id=p_org_id AND process.workspace_id=p_workspace_id AND process.deleted_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.assessments assessment WHERE assessment.id=generation.source_assessment_id
      AND assessment.process_id=generation.source_process_id AND assessment.org_id=p_org_id
      AND assessment.workspace_id=p_workspace_id AND assessment.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND';
  END IF;$old$,chr(13)||chr(10),chr(10));
 replacement:=replace($new$  IF generation.id IS NULL OR generation.source_process_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.assess_processes process WHERE process.id=generation.source_process_id
      AND process.org_id=p_org_id AND process.workspace_id=p_workspace_id AND process.deleted_at IS NULL)
    OR (generation.source_assessment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assessments assessment
      WHERE assessment.id=generation.source_assessment_id AND assessment.process_id=generation.source_process_id
       AND assessment.org_id=p_org_id AND assessment.workspace_id=p_workspace_id AND assessment.deleted_at IS NULL))
    OR (generation.source_assessment_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.studio_delivery_publications publication
      JOIN public.projects bound_project ON bound_project.id=publication.project_id AND bound_project.org_id=publication.org_id
       AND bound_project.workspace_id=publication.workspace_id
      WHERE publication.document_generation_id=generation.id AND publication.org_id=p_org_id AND publication.workspace_id=p_workspace_id
       AND publication.project_id=p_project_id AND publication.source_process_id=generation.source_process_id
       AND publication.source_assessment_id IS NULL AND bound_project.source_current_case_id=publication.source_case_id)) THEN
   RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND';
  END IF;$new$,chr(13)||chr(10),chr(10));
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_QUERY_PREDECESSOR_MISMATCH';
 END IF;
 EXECUTE replace(definition,old,replacement);
END
$patch_query$;

-- Response projections retain the historical V1 assessment id when present and
-- carry exact V2 case/decision lineage for native current-assessment records.
-- A null V1 id is therefore never an unbound or inferred source.
CREATE OR REPLACE FUNCTION public.studio_delivery_publication_projection(p_row public.studio_delivery_publications)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('publicationId',p_row.id,'documentGenerationId',p_row.document_generation_id,'projectId',p_row.project_id,
  'artifactId',p_row.studio_artifact_id,'artifactVersionId',p_row.studio_artifact_version_id,'artifactVersion',p_row.studio_artifact_version,
  'artifactContentHash',p_row.studio_artifact_content_hash,'sourceProcessId',p_row.source_process_id,'sourceAssessmentId',p_row.source_assessment_id,
  'sourceAssessmentCaseId',p_row.source_case_id,
  'sourceAssessmentDecisionId',p_row.source_decision_id,
  'governResolutionId',p_row.govern_resolution_id,'workItemCount',p_row.work_item_count,'workItemDigest',p_row.work_item_digest,'publishedAt',p_row.published_at)
$$;

DO $patch_task_projection$
DECLARE fn regprocedure:='public.legacy_delivery_task_projection(public.delivery_work_items)'::regprocedure;
 definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10));
 old:='''sourceProcessId'',p_item.source_process_id,''sourceAssessmentId'',p_item.source_assessment_id,''sourceEpicIndex''';
 replacement:=$new$'sourceProcessId',p_item.source_process_id,'sourceAssessmentId',p_item.source_assessment_id,
   'sourceAssessmentCaseId',(SELECT publication.source_case_id FROM public.studio_delivery_publications publication
    WHERE publication.document_generation_id=p_item.document_generation_id AND publication.org_id=p_item.org_id
     AND publication.workspace_id=p_item.workspace_id AND publication.project_id=p_item.project_id),
   'sourceAssessmentDecisionId',(SELECT publication.source_decision_id FROM public.studio_delivery_publications publication
    WHERE publication.document_generation_id=p_item.document_generation_id AND publication.org_id=p_item.org_id
     AND publication.workspace_id=p_item.workspace_id AND publication.project_id=p_item.project_id),
   'sourceEpicIndex'$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_TASK_PROJECTION_PREDECESSOR_MISMATCH';
 END IF;
 EXECUTE replace(definition,old,replacement);
END
$patch_task_projection$;

COMMENT ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) IS
 'Creates or replays the one active Delivery project bound to an exact approved Assess V2 case, decision, Govern resolution and Studio handoff.';

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261103170101';
  new_tip text:='20261103170102';
  old_count integer;
  new_count integer;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key = 'avalaos-core' AND environment_class = 'hosted_nonproduction_pilot'
      AND schema_contract = 'hosted-pilot-2026-08' AND migration_tip = old_tip
      AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized
  ) OR EXISTS (SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle = 'active') THEN
    RAISE EXCEPTION 'PROCESS_EVIDENCE_IDENTITY_PRECONDITION';
  END IF;
  FOREACH procedure_name IN ARRAY ARRAY[
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
    SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
    INTO STRICT definition;
    old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
    new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
    IF old_count<>1 OR new_count<>0 THEN
      RAISE EXCEPTION 'LOCAL_REAL_BACKEND_FUNCTION_SOURCE_MISMATCH:%',procedure_name;
    END IF;
    EXECUTE replace(definition,old_tip,new_tip);
  END LOOP;

  ALTER TABLE public.pr_c_controlled_human_exercises
    DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
  ALTER TABLE public.pr_c_controlled_human_exercises
    ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check
    CHECK(migration_tip IN(
      '20260904120000','20260924113000','20260926053818','20260928060000',
      '20261003015246','20261003055918','20261003123459','20261003150800',
      '20261004025101','20261004112232','20261008022445','20261009162752',
      '20261010025331','20261010051100','20261010051413','20261010144356',
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261103170102'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261103170102');
END
$process_evidence_identity_forward$;
