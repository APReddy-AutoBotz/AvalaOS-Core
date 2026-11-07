-- Planning-approved Studio publications retain their assessed confidence and
-- unresolved questions. Their accepted review evidence may resolve Delivery
-- discovery blockers without creating implementation-readiness or Govern
-- authority.
--
-- Rollback: keep Delivery outcome writes disabled and use read-only approved
-- documents and board state. Repair installed routines only through a later
-- forward migration so outcome history remains immutable.

BEGIN;

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
   AND p_publication.org_id=p_task.org_id AND p_publication.workspace_id=p_task.workspace_id
   AND EXISTS(SELECT 1 FROM public.assess_v2_evidence_attestations attestation
    JOIN public.assess_v2_review_resolutions review ON review.id=p_publication.review_resolution_id
     AND review.case_id=p_publication.source_case_id AND review.decision_id=p_publication.source_decision_id
     AND review.review_id=attestation.review_id AND review.case_id=attestation.case_id
     AND review.decision_id=attestation.decision_id AND review.source_version_id=attestation.source_version_id
     AND review.org_id=attestation.org_id AND review.workspace_id=attestation.workspace_id
     AND review.approval_purpose=p_publication.approval_purpose
     AND ((review.resolution='approved' AND review.approval_purpose='implementation_readiness'
       AND p_publication.govern_resolution_id IS NOT NULL)
      OR (review.resolution='planning_approved' AND review.approval_purpose='documentation_planning'
       AND p_publication.govern_resolution_id IS NULL))
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

REVOKE ALL ON FUNCTION public.studio_delivery_discovery_resolution_valid(public.delivery_work_items,public.studio_delivery_publications,jsonb,uuid,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.studio_delivery_discovery_resolution_valid(public.delivery_work_items,public.studio_delivery_publications,jsonb,uuid,bigint)
 OWNER TO postgres;

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
  JOIN public.assess_v2_review_resolutions review ON review.id=publication.review_resolution_id
   AND review.case_id=publication.source_case_id AND review.decision_id=publication.source_decision_id
   AND review.org_id=publication.org_id AND review.workspace_id=publication.workspace_id
   AND review.approval_purpose=publication.approval_purpose
   AND ((review.resolution='approved' AND review.approval_purpose='implementation_readiness'
      AND publication.govern_resolution_id IS NOT NULL)
    OR (review.resolution='planning_approved' AND review.approval_purpose='documentation_planning'
      AND publication.govern_resolution_id IS NULL))
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

REVOKE ALL ON FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) TO service_role;
ALTER FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) OWNER TO postgres;
ALTER FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) VOLATILE;

COMMENT ON FUNCTION public.studio_delivery_discovery_resolution_valid(
 public.delivery_work_items,public.studio_delivery_publications,jsonb,uuid,bigint) IS
 'Validates an exact discovery disposition against an immutable implementation-readiness or documentation-planning publication and its accepted review evidence.';
COMMENT ON FUNCTION public.studio_delivery_outcome_query(uuid,uuid,uuid,bigint,uuid,integer,uuid) IS
 'Returns current Delivery outcome projections and exact accepted review sources for implementation-readiness and documentation-planning publications.';

NOTIFY pgrst,'reload schema';
COMMIT;
