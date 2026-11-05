-- Reviewed planning assessments can create one native Delivery project, publish
-- approved planning documents, and retain discovery dependencies on the board.
-- Rollback disables planning publication/import writes and retains every row.

ALTER TABLE public.projects
 ADD COLUMN source_current_review_resolution_id uuid,
 ADD COLUMN source_current_handoff_id uuid,
 ADD COLUMN source_approval_purpose text;

UPDATE public.projects project SET
 source_current_review_resolution_id=handoff.review_resolution_id,
 source_current_handoff_id=handoff.id,
 source_approval_purpose=handoff.approval_purpose
FROM public.assess_v2_studio_handoffs handoff
WHERE project.source_current_case_id=handoff.case_id
 AND project.source_current_decision_id=handoff.decision_id
 AND project.source_current_govern_resolution_id=handoff.govern_resolution_id;

ALTER TABLE public.projects DROP CONSTRAINT projects_current_assessment_binding_check;
ALTER TABLE public.projects
 ADD CONSTRAINT projects_current_review_scope_fk
  FOREIGN KEY(source_current_review_resolution_id,source_current_case_id,source_current_decision_id,workspace_id,org_id)
  REFERENCES public.assess_v2_review_resolutions(id,case_id,decision_id,workspace_id,org_id) ON DELETE RESTRICT,
 ADD CONSTRAINT projects_current_handoff_scope_fk
  FOREIGN KEY(source_current_handoff_id,source_current_case_id,source_current_decision_id,workspace_id,org_id)
  REFERENCES public.assess_v2_studio_handoffs(id,case_id,decision_id,workspace_id,org_id) ON DELETE RESTRICT,
 ADD CONSTRAINT projects_current_approval_purpose_check
  CHECK(source_approval_purpose IS NULL OR source_approval_purpose IN('implementation_readiness','documentation_planning')),
 ADD CONSTRAINT projects_current_assessment_binding_check CHECK(
  (source_current_case_id IS NULL AND source_current_decision_id IS NULL
   AND source_current_govern_resolution_id IS NULL AND source_current_review_resolution_id IS NULL
   AND source_current_handoff_id IS NULL AND source_approval_purpose IS NULL)
  OR(source_current_case_id IS NOT NULL AND source_current_decision_id IS NOT NULL
   AND source_current_review_resolution_id IS NOT NULL AND source_current_handoff_id IS NOT NULL
   AND source_process_id IS NOT NULL AND source_approval_purpose IS NOT NULL AND(
    (source_approval_purpose='implementation_readiness' AND source_current_govern_resolution_id IS NOT NULL)
    OR(source_approval_purpose='documentation_planning' AND source_current_govern_resolution_id IS NULL)))) NOT VALID;
ALTER TABLE public.projects VALIDATE CONSTRAINT projects_current_assessment_binding_check;

CREATE OR REPLACE FUNCTION public.assess_v2_current_delivery_project_ensure(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_authorization_version bigint,
 p_case_id uuid,p_decision_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source_case public.assess_v2_cases;source_process public.assess_processes;
 decision_row public.assess_v2_decision_versions;govern public.assess_v2_govern_resolutions;
 handoff public.assess_v2_studio_handoffs;review public.assess_v2_review_resolutions;
 project_row public.projects;project_outcome text:='replayed';audit_id uuid:=gen_random_uuid();
 prior_decision_id uuid;purpose text;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_AUTHENTICATION_REQUIRED';
 END IF;
 PERFORM public.legacy_delivery_assert_any_authority(p_actor_id,p_org_id,p_workspace_id,
  ARRAY['org.admin','security.manage','roles.manage','project.manage'],p_authorization_version);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_workspace_id::text||':'||p_case_id::text,0));
 SELECT * INTO source_case FROM public.assess_v2_cases row WHERE row.id=p_case_id
  AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.status='handed_off'
  AND row.deleted_at IS NULL FOR SHARE;
 SELECT * INTO decision_row FROM public.assess_v2_decision_versions row WHERE row.id=p_decision_id
  AND row.case_id=p_case_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO handoff FROM public.assess_v2_studio_handoffs row WHERE row.case_id=p_case_id
  AND row.decision_id=p_decision_id AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id
  ORDER BY row.handed_off_at DESC,row.id DESC LIMIT 1 FOR SHARE;
 SELECT * INTO review FROM public.assess_v2_review_resolutions row WHERE row.id=handoff.review_resolution_id
  AND row.case_id=p_case_id AND row.decision_id=p_decision_id AND row.org_id=p_org_id
  AND row.workspace_id=p_workspace_id FOR SHARE;
 purpose:=handoff.approval_purpose;
 IF purpose='implementation_readiness' THEN
  SELECT * INTO govern FROM public.assess_v2_govern_resolutions row WHERE row.id=handoff.govern_resolution_id
   AND row.case_id=p_case_id AND row.decision_id=p_decision_id AND row.review_resolution_id=review.id
   AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 END IF;
 SELECT * INTO source_process FROM public.assess_processes row WHERE row.id=source_case.process_id
  AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id AND row.deleted_at IS NULL FOR SHARE;
  IF source_case.id IS NULL OR decision_row.id IS NULL OR handoff.id IS NULL OR review.id IS NULL
   OR source_process.id IS NULL OR purpose IS NULL OR purpose NOT IN('implementation_readiness','documentation_planning')
  OR review.approval_purpose IS DISTINCT FROM purpose
  OR (purpose='implementation_readiness' AND(govern.id IS NULL OR review.resolution<>'approved'))
  OR (purpose='documentation_planning' AND(handoff.govern_resolution_id IS NOT NULL OR review.resolution<>'planning_approved'))
  OR encode(public.digest(convert_to(handoff.package::text,'UTF8'),'sha256'),'hex')<>handoff.package_hash
 THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_NOT_AVAILABLE'; END IF;
 SELECT * INTO project_row FROM public.projects row WHERE row.org_id=p_org_id AND row.workspace_id=p_workspace_id
  AND row.source_current_case_id=p_case_id AND row.deleted_at IS NULL FOR UPDATE;
 IF project_row.id IS NULL THEN
  INSERT INTO public.projects(org_id,workspace_id,name,description,owner_id,created_by,updated_by,
   source_process_id,source_assessment_id,source_current_case_id,source_current_decision_id,
   source_current_govern_resolution_id,source_current_review_resolution_id,source_current_handoff_id,
   source_approval_purpose,status,lifecycle_stage,health_status,metadata,audit_correlation_id)
  VALUES(p_org_id,p_workspace_id,source_process.name||' Delivery',
   CASE purpose WHEN 'documentation_planning' THEN 'Delivery planning project for the independently reviewed current assessment.'
    ELSE 'Delivery project for the approved current assessment.' END,
   p_actor_id,p_actor_id,p_actor_id,source_case.process_id,NULL,source_case.id,p_decision_id,
   govern.id,review.id,handoff.id,purpose,'active','Planning','On Track',
   jsonb_build_object('schemaVersion','current-assessment-delivery-project.v2','caseId',source_case.id,
    'decisionId',p_decision_id,'reviewResolutionId',review.id,'governResolutionId',govern.id,
    'handoffId',handoff.id,'approvalPurpose',purpose),p_request_id::text) RETURNING * INTO project_row;
  project_outcome:='created';
 ELSIF project_row.source_process_id IS DISTINCT FROM source_case.process_id OR project_row.status<>'active'
  OR project_row.archived_at IS NOT NULL THEN RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT';
 ELSIF project_row.source_current_decision_id IS DISTINCT FROM p_decision_id THEN
  IF decision_row.supersedes_decision_id IS DISTINCT FROM project_row.source_current_decision_id THEN
   RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT'; END IF;
  prior_decision_id:=project_row.source_current_decision_id;
  UPDATE public.projects SET source_current_decision_id=p_decision_id,
   source_current_govern_resolution_id=govern.id,source_current_review_resolution_id=review.id,
   source_current_handoff_id=handoff.id,source_approval_purpose=purpose,updated_by=p_actor_id,
   updated_at=statement_timestamp(),metadata=metadata||jsonb_build_object('decisionId',p_decision_id,
    'reviewResolutionId',review.id,'governResolutionId',govern.id,'handoffId',handoff.id,'approvalPurpose',purpose)
  WHERE id=project_row.id RETURNING * INTO project_row; project_outcome:='advanced';
 ELSIF project_row.source_current_review_resolution_id IS DISTINCT FROM review.id
  OR project_row.source_current_handoff_id IS DISTINCT FROM handoff.id
  OR project_row.source_current_govern_resolution_id IS DISTINCT FROM govern.id
  OR project_row.source_approval_purpose IS DISTINCT FROM purpose THEN
  RAISE EXCEPTION 'CURRENT_ASSESSMENT_PROJECT_CONFLICT';
 END IF;
 INSERT INTO public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,
  resource_type,resource_id,outcome,resource_version,metadata)
 VALUES(audit_id,p_org_id,p_workspace_id,p_actor_id,p_request_id,
  CASE project_outcome WHEN 'advanced' THEN 'assess.v2.delivery-project.advance' ELSE 'assess.v2.delivery-project.ensure' END,
  'project',project_row.id,'succeeded',1,jsonb_build_object('caseId',p_case_id,'priorDecisionId',prior_decision_id,
   'decisionId',p_decision_id,'reviewResolutionId',review.id,'governResolutionId',govern.id,
   'handoffId',handoff.id,'approvalPurpose',purpose));
 RETURN jsonb_build_object('schemaVersion','current-assessment-delivery-project.v1','outcome',project_outcome,
  'projectId',project_row.id,'projectName',project_row.name,'caseId',source_case.id,'decisionId',p_decision_id);
END $$;

REVOKE ALL ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) TO authenticated;

CREATE FUNCTION public.studio_delivery_dependency_indices_valid(p_indices integer[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT cardinality(p_indices)<=100 AND NOT EXISTS(
  SELECT 1 FROM unnest(p_indices) value WHERE value NOT BETWEEN 0 AND 99)
 AND cardinality(p_indices)=cardinality(ARRAY(SELECT DISTINCT value FROM unnest(p_indices) value))
$$;

ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 ADD COLUMN dependency_source_indices integer[] NOT NULL DEFAULT ARRAY[]::integer[],
 ADD CONSTRAINT studio_delivery_dependency_source_indices_check CHECK(
  public.studio_delivery_dependency_indices_valid(dependency_source_indices)
  AND NOT(source_item_index=ANY(dependency_source_indices))) NOT VALID;
ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 DROP CONSTRAINT studio_delivery_proposal_role_check,
 ADD CONSTRAINT studio_delivery_proposal_role_check
 CHECK(proposal_role IN('legacy','coordination','implementation','acceptance-review','verification','discovery')) NOT VALID;
ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 VALIDATE CONSTRAINT studio_delivery_proposal_role_check;
ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 VALIDATE CONSTRAINT studio_delivery_dependency_source_indices_check;
ALTER TABLE public.studio_delivery_work_item_requirement_bindings ALTER COLUMN dependency_source_indices DROP DEFAULT;
REVOKE ALL ON FUNCTION public.studio_delivery_dependency_indices_valid(integer[]) FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON COLUMN public.studio_delivery_work_item_requirement_bindings.dependency_source_indices IS
 'Immutable source proposal indices for discovery tasks that must precede this implementation proposal.';
COMMENT ON FUNCTION public.assess_v2_current_delivery_project_ensure(uuid,uuid,uuid,bigint,uuid,uuid,uuid) IS
 'Creates or replays one native Delivery project bound to the exact reviewed assessment purpose, review, optional Govern resolution, and Studio handoff.';

ALTER TABLE public.studio_delivery_publications
 ALTER COLUMN govern_resolution_id DROP NOT NULL,
 ADD COLUMN studio_handoff_id uuid,
 ADD COLUMN approval_purpose text;
UPDATE public.studio_delivery_publications publication SET
 studio_handoff_id=artifact.handoff_id,approval_purpose=artifact.approval_purpose
FROM public.studio_artifact_aggregates artifact WHERE artifact.id=publication.studio_artifact_id;
ALTER TABLE public.studio_delivery_publications
 ALTER COLUMN studio_handoff_id SET NOT NULL,
 ALTER COLUMN approval_purpose SET NOT NULL,
 ADD CONSTRAINT studio_delivery_publication_handoff_scope_fk
  FOREIGN KEY(studio_handoff_id,source_case_id,source_decision_id,workspace_id,org_id)
  REFERENCES public.assess_v2_studio_handoffs(id,case_id,decision_id,workspace_id,org_id) ON DELETE RESTRICT,
 ADD CONSTRAINT studio_delivery_publication_approval_purpose_check CHECK(
  (approval_purpose='implementation_readiness' AND govern_resolution_id IS NOT NULL)
  OR(approval_purpose='documentation_planning' AND govern_resolution_id IS NULL));

ALTER TABLE public.document_generations ADD COLUMN studio_approval_purpose text;
UPDATE public.document_generations generation SET studio_approval_purpose=publication.approval_purpose
FROM public.studio_delivery_publications publication WHERE publication.id=generation.studio_delivery_publication_id;
ALTER TABLE public.document_generations DROP CONSTRAINT document_generation_studio_publication_shape;
ALTER TABLE public.document_generations ADD CONSTRAINT document_generation_studio_publication_shape CHECK(
 (studio_delivery_publication_id IS NULL AND studio_artifact_id IS NULL AND studio_artifact_version_id IS NULL
  AND studio_artifact_content_hash IS NULL AND studio_govern_resolution_id IS NULL AND studio_work_item_digest IS NULL
  AND publication_authorization_version IS NULL AND studio_approval_purpose IS NULL)
 OR(studio_delivery_publication_id IS NOT NULL AND studio_artifact_id IS NOT NULL AND studio_artifact_version_id IS NOT NULL
  AND studio_artifact_content_hash~'^[0-9a-f]{64}$' AND studio_work_item_digest~'^sha256:[0-9a-f]{64}$'
   AND publication_authorization_version>0 AND studio_approval_purpose IS NOT NULL AND(
   (studio_approval_purpose='implementation_readiness' AND studio_govern_resolution_id IS NOT NULL)
   OR(studio_approval_purpose='documentation_planning' AND studio_govern_resolution_id IS NULL)))) NOT VALID;
ALTER TABLE public.document_generations VALIDATE CONSTRAINT document_generation_studio_publication_shape;

CREATE OR REPLACE FUNCTION public.studio_delivery_stable_proposal_origin(
 p_studio_artifact_id uuid,p_proposal_role text,p_requirement_links jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE historical_type text;
BEGIN
 historical_type:=CASE p_proposal_role WHEN 'coordination' THEN 'Epic' WHEN 'implementation' THEN 'Story'
  WHEN 'acceptance-review' THEN 'Task' WHEN 'verification' THEN 'Task' WHEN 'discovery' THEN 'Task' ELSE NULL END;
 IF historical_type IS NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_PROPOSAL_ROLE';END IF;
 RETURN public.studio_delivery_proposal_origin(p_studio_artifact_id,historical_type,p_requirement_links);
END $$;

DO $planning_publication$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.studio_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:='OR artifact.case_id IS NULL OR artifact.govern_resolution_id IS NULL THEN';
  replacement:=$new$OR artifact.case_id IS NULL OR artifact.approval_purpose IS NULL
   OR artifact.approval_purpose NOT IN('implementation_readiness','documentation_planning')
   OR (artifact.approval_purpose='implementation_readiness' AND artifact.govern_resolution_id IS NULL)
   OR (artifact.approval_purpose='documentation_planning' AND(artifact.govern_resolution_id IS NOT NULL OR NOT artifact.planning_only)) THEN$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_ARTIFACT_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:='OR approval.id IS NULL OR govern.id IS NULL OR source_case.id IS NULL OR project_row.id IS NULL';
 replacement:=$new$OR approval.id IS NULL OR source_case.id IS NULL OR project_row.id IS NULL
   OR (artifact.approval_purpose='implementation_readiness' AND govern.id IS NULL)$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_GOVERN_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$OR project_row.source_current_govern_resolution_id IS DISTINCT FROM govern.id))$old$;
  replacement:=$new$OR project_row.source_approval_purpose IS NULL
     OR project_row.source_current_review_resolution_id IS DISTINCT FROM artifact.review_resolution_id
    OR project_row.source_current_handoff_id IS DISTINCT FROM artifact.handoff_id
    OR project_row.source_approval_purpose IS DISTINCT FROM artifact.approval_purpose
    OR project_row.source_current_govern_resolution_id IS DISTINCT FROM artifact.govern_resolution_id))$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_PROJECT_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$review_resolution_id,govern_resolution_id,
   work_item_digest$old$;
 replacement:=$new$review_resolution_id,govern_resolution_id,studio_handoff_id,approval_purpose,
   work_item_digest$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_COLUMNS_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$artifact.review_resolution_id,govern.id,work_item_digest$old$;
 replacement:=$new$artifact.review_resolution_id,artifact.govern_resolution_id,artifact.handoff_id,artifact.approval_purpose,work_item_digest$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_VALUES_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$'reviewResolutionId',artifact.review_resolution_id,'governResolutionId',govern.id,'workItemDigest'$old$;
 replacement:=$new$'reviewResolutionId',artifact.review_resolution_id,'governResolutionId',artifact.govern_resolution_id,
    'studioHandoffId',artifact.handoff_id,'approvalPurpose',artifact.approval_purpose,'workItemDigest'$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_DOCUMENT_SOURCE_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$artifact_version.content_hash,govern.id,work_item_digest$old$;
 replacement:=$new$artifact_version.content_hash,artifact.govern_resolution_id,work_item_digest$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_DOCUMENT_GOVERN_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$studio_artifact_content_hash,studio_govern_resolution_id,studio_work_item_digest,publication_authorization_version)$old$;
 replacement:=$new$studio_artifact_content_hash,studio_govern_resolution_id,studio_work_item_digest,publication_authorization_version,studio_approval_purpose)$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_DOCUMENT_COLUMNS_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$artifact_version.content_hash,artifact.govern_resolution_id,work_item_digest,p_expected_authorization_version);$old$;
 replacement:=$new$artifact_version.content_hash,artifact.govern_resolution_id,work_item_digest,p_expected_authorization_version,artifact.approval_purpose);$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_PUBLICATION_DOCUMENT_VALUES_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 EXECUTE definition;
END $planning_publication$;

CREATE OR REPLACE FUNCTION public.studio_delivery_publication_projection(p_row public.studio_delivery_publications)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('publicationId',p_row.id,'documentGenerationId',p_row.document_generation_id,'projectId',p_row.project_id,
  'artifactId',p_row.studio_artifact_id,'artifactVersionId',p_row.studio_artifact_version_id,'artifactVersion',p_row.studio_artifact_version,
  'artifactContentHash',p_row.studio_artifact_content_hash,'sourceProcessId',p_row.source_process_id,'sourceAssessmentId',p_row.source_assessment_id,
  'sourceAssessmentCaseId',p_row.source_case_id,'sourceAssessmentDecisionId',p_row.source_decision_id,
  'reviewResolutionId',p_row.review_resolution_id,'governResolutionId',p_row.govern_resolution_id,
  'studioHandoffId',p_row.studio_handoff_id,'approvalPurpose',p_row.approval_purpose,
  'workItemCount',p_row.work_item_count,'workItemDigest',p_row.work_item_digest,'publishedAt',p_row.published_at)
$$;

DO $planning_requirement_binding$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:=$old$'acceptanceCriteria',value->'acceptanceCriteria') ORDER BY ordinal)$old$;
 replacement:=$new$'acceptanceCriteria',value->'acceptanceCriteria') ORDER BY ordinal)$new$;
 -- The base publication deliberately receives only its historical item fields.
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_STRIP_PREDECESSOR_MISMATCH';END IF;
 old:=$old$ARRAY['proposalRole','type','title','description','acceptanceCriteria','requirementLinks']$old$;
 replacement:=$new$ARRAY['proposalRole','type','title','description','acceptanceCriteria','requirementLinks','dependencyProposalIndices']$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_KEYS_PREDECESSOR_MISMATCH';END IF;
 definition:=regexp_replace(definition,
  'ARRAY\[''proposalRole'',''type'',''title'',''description'',''acceptanceCriteria'',''requirementLinks''\]',
  replacement);
 old:=$old$item->>'proposalRole' NOT IN('coordination','implementation','acceptance-review','verification'))$old$;
 replacement:=$new$item->>'proposalRole' NOT IN('coordination','implementation','acceptance-review','verification','discovery'))
   OR (item?'dependencyProposalIndices' AND(jsonb_typeof(item->'dependencyProposalIndices')<>'array'
    OR jsonb_array_length(item->'dependencyProposalIndices')>100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'dependencyProposalIndices') dependency WHERE dependency!~'^(0|[1-9][0-9]?)$')))$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_ROLE_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$AND (regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g')||' '||(section->>'title'))
      !~* '(^|[^a-z])(questions?|assumptions?|proposals?|flows?|diagrams?)([^a-z]|$)'$old$;
 replacement:=$new$AND ((item->>'proposalRole'='discovery' AND
      (regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g')||' '||(section->>'title'))
       ~* '(^|[^a-z])((open[[:space:]]+)?questions?|unknowns?|unresolved)([^a-z]|$)')
     OR(item->>'proposalRole'<>'discovery' AND
      (regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g')||' '||(section->>'title'))
       !~* '(^|[^a-z])(questions?|assumptions?|proposals?|flows?|diagrams?)([^a-z]|$)'))$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_SECTION_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$AND btrim(source_line)!~'\?$'
     AND btrim(source_line)!~* '^([-*+][[:space:]]*|[0-9]+[.)][[:space:]]*)?((open[[:space:]]+)?question|assume|assumption|proposal|proposed|speculative)([[:space:]:.-]|$)'
     AND (btrim(source_line)~*$old$;
 replacement:=$new$AND ((item->>'proposalRole'='discovery' AND(btrim(source_line)~'\?$'
       OR btrim(source_line)~*'^([-*+][[:space:]]*|[0-9]+[.)][[:space:]]*)?((open[[:space:]]+)?question|unknown|unresolved)([[:space:]:.-]|$)'))
      OR(item->>'proposalRole'<>'discovery' AND btrim(source_line)!~'\?$'
       AND btrim(source_line)!~*'^([-*+][[:space:]]*|[0-9]+[.)][[:space:]]*)?((open[[:space:]]+)?question|assume|assumption|proposal|proposed|speculative)([[:space:]:.-]|$)'
       AND (btrim(source_line)~*$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_LINE_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$OR btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')) INTO line_match;$old$;
 replacement:=$new$OR btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')))) INTO line_match;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_LINE_CLOSE_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$studio_artifact_version,source_item_index,proposal_origin_id,proposal_role,requirement_links)$old$;
 replacement:=$new$studio_artifact_version,source_item_index,proposal_origin_id,proposal_role,requirement_links,dependency_source_indices)$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_INSERT_COLUMNS_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$publication.studio_artifact_version_id,publication.studio_artifact_version,item_index,proposal_origin,item->>'proposalRole',normalized_links);$old$;
 replacement:=$new$publication.studio_artifact_version_id,publication.studio_artifact_version,item_index,proposal_origin,item->>'proposalRole',normalized_links,
    COALESCE(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(item->'dependencyProposalIndices') value ORDER BY value::integer),ARRAY[]::integer[]));$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_INSERT_VALUES_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$OR existing.requirement_links IS DISTINCT FROM normalized_links THEN$old$;
 replacement:=$new$OR existing.requirement_links IS DISTINCT FROM normalized_links
    OR existing.dependency_source_indices IS DISTINCT FROM COALESCE(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(item->'dependencyProposalIndices') value ORDER BY value::integer),ARRAY[]::integer[]) THEN$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_REQUIREMENT_REPLAY_PREDECESSOR_MISMATCH';END IF;
 EXECUTE definition;
END $planning_requirement_binding$;

DO $planning_requirement_dependency_validation$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:=$old$ END LOOP;
 RETURN result;$old$;
 replacement:=$new$ END LOOP;
 IF EXISTS(
  SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings dependent
  CROSS JOIN LATERAL unnest(dependent.dependency_source_indices) dependency_index
  LEFT JOIN public.studio_delivery_work_item_requirement_bindings dependency
   ON dependency.publication_id=dependent.publication_id AND dependency.source_item_index=dependency_index
  WHERE dependent.publication_id=publication.id
   AND (dependent.proposal_role<>'implementation' OR dependency.id IS NULL OR dependency.proposal_role<>'discovery')
 ) THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';END IF;
 RETURN result;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_DEPENDENCY_VALIDATION_PREDECESSOR_MISMATCH';END IF;
 EXECUTE replace(definition,old,replacement);
END $planning_requirement_dependency_validation$;

DO $planning_import_dependencies$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=replace(pg_get_functiondef('public.legacy_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure),chr(13)||chr(10),chr(10));
 old:=$old$ writes_enabled_value boolean;bound_publication_id uuid;$old$;
 replacement:=$new$ writes_enabled_value boolean;bound_publication_id uuid;dependent_index integer;dependency_index integer;
 dependent_task_id uuid;dependency_task_id uuid;dependency_origin text;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_IMPORT_DECLARATION_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$ OR EXISTS(SELECT 1 FROM unnest(source_indices) selected(index) WHERE NOT EXISTS(
   SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings binding WHERE binding.publication_id=bound_publication_id
    AND binding.document_generation_id=generation_id AND binding.source_item_index=selected.index AND binding.project_id=target_project_id))
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;$old$;
 replacement:=$new$ OR EXISTS(SELECT 1 FROM unnest(source_indices) selected(index) WHERE NOT EXISTS(
   SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings binding WHERE binding.publication_id=bound_publication_id
    AND binding.document_generation_id=generation_id AND binding.source_item_index=selected.index AND binding.project_id=target_project_id))
 OR EXISTS(
  SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings dependent
  CROSS JOIN LATERAL unnest(dependent.dependency_source_indices) required(index)
  JOIN public.studio_delivery_work_item_requirement_bindings dependency
   ON dependency.publication_id=dependent.publication_id AND dependency.source_item_index=required.index
  WHERE dependent.publication_id=bound_publication_id AND dependent.source_item_index=ANY(source_indices)
   AND NOT(required.index=ANY(source_indices) OR EXISTS(
    SELECT 1 FROM public.delivery_work_items existing WHERE existing.org_id=p_org_id AND existing.workspace_id=p_workspace_id
     AND existing.project_id=target_project_id AND existing.retention_state IN('active','retained')
     AND existing.source_lineage->>'proposalOriginId'=dependency.proposal_origin_id)))
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_IMPORT_SELECTION_PREDECESSOR_MISMATCH';END IF;
 definition:=replace(definition,old,replacement);
 old:=$old$ END LOOP;
 result:=jsonb_build_object('ok',true,'schemaVersion','legacy-delivery-command.v1'$old$;
 replacement:=$new$ END LOOP;
 FOR dependent_index,dependency_index IN
  SELECT dependent.source_item_index,required.index FROM public.studio_delivery_work_item_requirement_bindings dependent
  CROSS JOIN LATERAL unnest(dependent.dependency_source_indices) required(index)
  WHERE dependent.publication_id=bound_publication_id AND dependent.source_item_index=ANY(source_indices)
  ORDER BY dependent.source_item_index,required.index
 LOOP
  SELECT item.id INTO dependent_task_id FROM public.delivery_work_items item
   WHERE item.org_id=p_org_id AND item.workspace_id=p_workspace_id AND item.project_id=target_project_id
    AND item.document_generation_id=generation_id AND item.source_item_index=dependent_index;
  SELECT binding.proposal_origin_id INTO dependency_origin
   FROM public.studio_delivery_work_item_requirement_bindings binding
   WHERE binding.publication_id=bound_publication_id AND binding.source_item_index=dependency_index;
  SELECT item.id INTO dependency_task_id FROM public.delivery_work_items item
   WHERE item.org_id=p_org_id AND item.workspace_id=p_workspace_id AND item.project_id=target_project_id
    AND item.retention_state IN('active','retained') AND item.source_lineage->>'proposalOriginId'=dependency_origin;
  IF dependent_task_id IS NULL OR dependency_task_id IS NULL THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND';END IF;
  INSERT INTO public.legacy_delivery_work_item_dependencies(work_item_id,dependency_id,org_id,workspace_id)
   VALUES(dependent_task_id,dependency_task_id,p_org_id,p_workspace_id);
 END LOOP;
 result:=jsonb_build_object('ok',true,'schemaVersion','legacy-delivery-command.v1'$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PLANNING_IMPORT_DEPENDENCIES_PREDECESSOR_MISMATCH';END IF;
 EXECUTE replace(definition,old,replacement);
END $planning_import_dependencies$;

DO $process_evidence_identity_forward$
DECLARE procedure_name regprocedure;definition text;old_tip text:='20261105140002';new_tip text:='20261105140003';old_count integer;new_count integer;
BEGIN
 LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity WHERE singleton AND product_key='avalaos-core'
  AND environment_class='hosted_nonproduction_pilot' AND schema_contract='hosted-pilot-2026-08'
  AND migration_tip=old_tip AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized)
  OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
 THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_IDENTITY_PRECONDITION';END IF;
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
  'public.enterprise_provider_secret_delete_for_cleanup(uuid,uuid,bigint,uuid,uuid,text,text,text)'::regprocedure] LOOP
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)) INTO STRICT definition;
  old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
  new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
  IF old_count<>1 OR new_count<>0 THEN RAISE EXCEPTION 'LOCAL_REAL_BACKEND_FUNCTION_SOURCE_MISMATCH:%',procedure_name;END IF;
  EXECUTE replace(definition,old_tip,new_tip);
 END LOOP;
 ALTER TABLE public.pr_c_controlled_human_exercises DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
 ALTER TABLE public.pr_c_controlled_human_exercises ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK(migration_tip IN(
  '20260904120000','20260924113000','20260926053818','20260928060000','20261003015246','20261003055918','20261003123459','20261003150800',
  '20261004025101','20261004112232','20261008022445','20261009162752','20261010025331','20261010051100','20261010051413','20261010144356',
  '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717',
  '20261105041249','20261105110657','20261105140001','20261105140002','20261105140003'));
 ALTER TABLE public.authenticated_synthetic_exercises DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
 ALTER TABLE public.authenticated_synthetic_exercises ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip IN(
  '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103',
  '20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003'));
 ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
 UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
 ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='20261105140003');
END $process_evidence_identity_forward$;
