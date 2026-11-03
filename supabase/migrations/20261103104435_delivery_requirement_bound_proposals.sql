-- Requirement-bound Delivery proposals for approved Studio artifacts.
-- Rollback/read-only fallback: point the Edge adapter back to
-- studio_delivery_apply_command, disable publication writes, and retain this
-- immutable binding table for audit. Existing imported work remains readable.

CREATE TABLE public.studio_delivery_work_item_requirement_bindings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 project_id uuid NOT NULL,
 publication_id uuid NOT NULL,
 document_generation_id uuid NOT NULL,
 studio_artifact_id uuid NOT NULL,
 studio_artifact_version_id uuid NOT NULL,
 studio_artifact_version bigint NOT NULL CHECK(studio_artifact_version>0),
 source_item_index integer NOT NULL CHECK(source_item_index BETWEEN 0 AND 99),
 proposal_origin_id text NOT NULL CHECK(proposal_origin_id~'^sha256:[0-9a-f]{64}$'),
 requirement_links jsonb NOT NULL CHECK(jsonb_typeof(requirement_links)='array' AND jsonb_array_length(requirement_links) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(publication_id,source_item_index),
 UNIQUE(publication_id,proposal_origin_id),
 UNIQUE(id,org_id,workspace_id),
 FOREIGN KEY(publication_id,org_id,workspace_id) REFERENCES public.studio_delivery_publications(id,org_id,workspace_id) ON DELETE RESTRICT,
 FOREIGN KEY(document_generation_id,org_id) REFERENCES public.document_generations(id,org_id) ON DELETE RESTRICT,
 FOREIGN KEY(studio_artifact_id,org_id,workspace_id) REFERENCES public.studio_artifact_aggregates(id,org_id,workspace_id) ON DELETE RESTRICT,
 FOREIGN KEY(studio_artifact_version_id,studio_artifact_id,org_id,workspace_id) REFERENCES public.studio_artifact_versions(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
 FOREIGN KEY(project_id,org_id) REFERENCES public.projects(id,org_id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT
);

ALTER TABLE public.studio_delivery_work_item_requirement_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_delivery_work_item_requirement_bindings FORCE ROW LEVEL SECURITY;
CREATE TRIGGER studio_delivery_requirement_binding_immutable
 BEFORE UPDATE OR DELETE ON public.studio_delivery_work_item_requirement_bindings
 FOR EACH ROW EXECUTE FUNCTION public.legacy_delivery_reject_immutable_row();

CREATE OR REPLACE FUNCTION public.studio_delivery_proposal_origin(
 p_studio_artifact_id uuid,p_type text,p_requirement_links jsonb
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT public.studio_delivery_hash_jsonb(jsonb_build_object(
  'studioArtifactId',p_studio_artifact_id,'type',p_type,'requirementLinks',
  COALESCE((SELECT jsonb_agg(link ORDER BY link->>'sectionId',link->>'requirementText',link->>'sectionTitle')
   FROM jsonb_array_elements(p_requirement_links) source(link)),'[]'::jsonb)))
$$;

CREATE OR REPLACE FUNCTION public.studio_delivery_apply_requirement_command(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_expected_authorization_version bigint,
 p_request_id uuid,p_idempotency_key text,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 result jsonb;stripped_items jsonb;publication public.studio_delivery_publications;
 artifact_version public.studio_artifact_versions;item jsonb;link jsonb;normalized_links jsonb;
 item_index integer;proposal_origin text;existing public.studio_delivery_work_item_requirement_bindings;
 section_body text;line_match boolean;
BEGIN
 IF p_action<>'studio.approved-artifact.publish' THEN
  RETURN public.studio_delivery_apply_command(p_actor_id,p_org_id,p_workspace_id,p_expected_authorization_version,
   p_request_id,p_idempotency_key,p_action,p_payload);
 END IF;
 IF jsonb_typeof(p_payload)<>'object' OR jsonb_typeof(p_payload->'workItems')<>'array'
  OR jsonb_array_length(p_payload->'workItems') NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('type',value->>'type','title',value->>'title','description',value->>'description',
   'acceptanceCriteria',value->'acceptanceCriteria') ORDER BY ordinal)
 INTO stripped_items FROM jsonb_array_elements(p_payload->'workItems') WITH ORDINALITY source(value,ordinal);
 result:=public.studio_delivery_apply_command(p_actor_id,p_org_id,p_workspace_id,p_expected_authorization_version,
  p_request_id,p_idempotency_key,p_action,p_payload||jsonb_build_object('workItems',stripped_items));
 IF result->'ok' IS DISTINCT FROM 'true'::jsonb THEN RETURN result; END IF;
 SELECT * INTO publication FROM public.studio_delivery_publications row
  WHERE row.id=(result->'resource'->>'publicationId')::uuid AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO artifact_version FROM public.studio_artifact_versions row
  WHERE row.id=publication.studio_artifact_version_id AND row.artifact_id=publication.studio_artifact_id
   AND row.org_id=p_org_id AND row.workspace_id=p_workspace_id FOR SHARE;
 IF publication.id IS NULL OR artifact_version.id IS NULL OR artifact_version.lifecycle<>'approved' THEN
  RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND';
 END IF;

 FOR item,item_index IN SELECT value,(ordinal-1)::integer FROM jsonb_array_elements(p_payload->'workItems') WITH ORDINALITY source(value,ordinal) LOOP
  IF NOT public.legacy_delivery_jsonb_keys_allowed(item,
    ARRAY['type','title','description','acceptanceCriteria','requirementLinks'],
    ARRAY['type','title','description','acceptanceCriteria','requirementLinks'])
   OR jsonb_typeof(item->'requirementLinks')<>'array' OR jsonb_array_length(item->'requirementLinks') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';
  END IF;
  normalized_links:='[]'::jsonb;
  FOR link IN SELECT value FROM jsonb_array_elements(item->'requirementLinks') source(value) LOOP
   IF NOT public.legacy_delivery_jsonb_keys_allowed(link,ARRAY['sectionId','sectionTitle','requirementText'],ARRAY['sectionId','sectionTitle','requirementText'])
    OR jsonb_typeof(link->'sectionId')<>'string' OR length(btrim(link->>'sectionId')) NOT BETWEEN 1 AND 80
    OR jsonb_typeof(link->'sectionTitle')<>'string' OR length(btrim(link->>'sectionTitle')) NOT BETWEEN 1 AND 300
    OR jsonb_typeof(link->'requirementText')<>'string' OR length(btrim(link->>'requirementText')) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';
   END IF;
   SELECT COALESCE(section->>'body',section->>'content') INTO section_body
   FROM jsonb_array_elements(artifact_version.content->'sections') section
   WHERE COALESCE(section->>'id',section->>'key')=btrim(link->>'sectionId')
    AND section->>'title'=btrim(link->>'sectionTitle');
   SELECT EXISTS(SELECT 1 FROM regexp_split_to_table(COALESCE(section_body,''),E'\\r?\\n') source_line
    WHERE btrim(source_line)=btrim(link->>'requirementText')
     AND (btrim(source_line)~*'^([-*+][[:space:]]*|[0-9]+[.)][[:space:]]*)?(REQ|BR|FR|NFR|AC)[-_ ]?[0-9]+[[:space:]]*[:.-][[:space:]]*[^[:space:]]'
      OR btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')) INTO line_match;
   IF section_body IS NULL OR line_match IS DISTINCT FROM true THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND'; END IF;
   IF normalized_links@>jsonb_build_array(jsonb_build_object('sectionId',btrim(link->>'sectionId'),'sectionTitle',btrim(link->>'sectionTitle'),'requirementText',btrim(link->>'requirementText'))) THEN
    RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';
   END IF;
   normalized_links:=normalized_links||jsonb_build_array(jsonb_build_object(
    'sectionId',btrim(link->>'sectionId'),'sectionTitle',btrim(link->>'sectionTitle'),'requirementText',btrim(link->>'requirementText')));
  END LOOP;
  SELECT jsonb_agg(value ORDER BY value->>'sectionId',value->>'requirementText',value->>'sectionTitle') INTO normalized_links
   FROM jsonb_array_elements(normalized_links) source(value);
  proposal_origin:=public.studio_delivery_proposal_origin(publication.studio_artifact_id,item->>'type',normalized_links);
  SELECT * INTO existing FROM public.studio_delivery_work_item_requirement_bindings row
   WHERE row.publication_id=publication.id AND row.source_item_index=item_index FOR SHARE;
  IF existing.id IS NOT NULL THEN
   IF existing.proposal_origin_id IS DISTINCT FROM proposal_origin OR existing.requirement_links IS DISTINCT FROM normalized_links THEN
    RAISE EXCEPTION 'STUDIO_DELIVERY_IDEMPOTENCY_CONFLICT';
   END IF;
  ELSE
   INSERT INTO public.studio_delivery_work_item_requirement_bindings(
    org_id,workspace_id,project_id,publication_id,document_generation_id,studio_artifact_id,studio_artifact_version_id,
    studio_artifact_version,source_item_index,proposal_origin_id,requirement_links)
   VALUES(p_org_id,p_workspace_id,publication.project_id,publication.id,publication.document_generation_id,publication.studio_artifact_id,
    publication.studio_artifact_version_id,publication.studio_artifact_version,item_index,proposal_origin,normalized_links);
  END IF;
 END LOOP;
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM NOT LIKE '%STUDIO_DELIVERY_%' THEN RAISE LOG 'STUDIO_DELIVERY_REQUIREMENT_COMMAND_UNAVAILABLE action=% sqlstate=%',p_action,SQLSTATE; END IF;
 RETURN public.studio_delivery_error(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.legacy_delivery_bind_requirement_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding public.studio_delivery_work_item_requirement_bindings;bound_publication_id uuid;
BEGIN
 IF NEW.legacy_import_id IS NULL OR NEW.document_generation_id IS NULL OR NEW.source_item_index IS NULL THEN RETURN NEW; END IF;
 SELECT generation.studio_delivery_publication_id INTO bound_publication_id FROM public.document_generations generation
  WHERE generation.id=NEW.document_generation_id AND generation.org_id=NEW.org_id AND generation.workspace_id=NEW.workspace_id;
 IF bound_publication_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings row
  WHERE row.publication_id=bound_publication_id AND row.org_id=NEW.org_id AND row.workspace_id=NEW.workspace_id) THEN
  RETURN NEW;
 END IF;
 SELECT * INTO binding FROM public.studio_delivery_work_item_requirement_bindings row
  WHERE row.publication_id=bound_publication_id AND row.document_generation_id=NEW.document_generation_id
   AND row.source_item_index=NEW.source_item_index AND row.org_id=NEW.org_id AND row.workspace_id=NEW.workspace_id
   AND row.project_id=NEW.project_id FOR SHARE;
 IF binding.id IS NULL THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
 NEW.source_lineage:=NEW.source_lineage||jsonb_build_object(
  'proposalOriginId',binding.proposal_origin_id,'requirementLinks',binding.requirement_links,
  'studioArtifactId',binding.studio_artifact_id,'studioArtifactVersionId',binding.studio_artifact_version_id,
  'studioArtifactVersion',binding.studio_artifact_version);
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS a_legacy_delivery_bind_requirement_source ON public.delivery_work_items;
CREATE TRIGGER a_legacy_delivery_bind_requirement_source
 BEFORE INSERT ON public.delivery_work_items FOR EACH ROW EXECUTE FUNCTION public.legacy_delivery_bind_requirement_source();

CREATE UNIQUE INDEX legacy_delivery_one_item_per_proposal_origin
 ON public.delivery_work_items(org_id,workspace_id,project_id,(source_lineage->>'proposalOriginId'))
 WHERE source_lineage?'proposalOriginId';

ALTER TABLE public.delivery_work_items DROP CONSTRAINT delivery_work_items_type_check;
ALTER TABLE public.delivery_work_items ADD CONSTRAINT delivery_work_items_type_check
 CHECK(type IS NULL OR type IN('Epic','Story','Task','Bug','Subtask')) NOT VALID;

CREATE OR REPLACE FUNCTION public.legacy_delivery_apply_requirement_command(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_expected_authorization_version bigint,
 p_request_id uuid,p_idempotency_key text,p_action text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 receipt public.legacy_delivery_command_receipts;request_hash text;result jsonb;project_row public.projects;
 generation public.document_generations;imported public.legacy_delivery_imports;task_row public.delivery_work_items;
 source_items jsonb;source_item jsonb;source_indices integer[];source_index integer;source_count integer;item_count integer:=0;
 target_project_id uuid;generation_id uuid;target_source_digest text;target_selection_digest text;
 criteria_text text;description_value text;current_epic_index integer;current_epic_title text;projections jsonb:='[]'::jsonb;
 writes_enabled_value boolean;bound_publication_id uuid;
BEGIN
 IF p_action<>'import' THEN
  RETURN public.legacy_delivery_apply_command(p_actor_id,p_org_id,p_workspace_id,p_expected_authorization_version,
   p_request_id,p_idempotency_key,p_action,p_payload);
 END IF;
 IF jsonb_typeof(p_payload)='object' AND (p_payload->>'sourceGenerationId')~*'^[0-9a-f-]{36}$' THEN
  SELECT source.studio_delivery_publication_id INTO bound_publication_id FROM public.document_generations source
   WHERE source.id=(p_payload->>'sourceGenerationId')::uuid AND source.org_id=p_org_id AND source.workspace_id=p_workspace_id
    AND EXISTS(SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings binding
     WHERE binding.publication_id=source.studio_delivery_publication_id AND binding.org_id=source.org_id AND binding.workspace_id=source.workspace_id);
 END IF;
 IF bound_publication_id IS NULL THEN
  RETURN public.legacy_delivery_apply_command(p_actor_id,p_org_id,p_workspace_id,p_expected_authorization_version,
   p_request_id,p_idempotency_key,p_action,p_payload);
 END IF;

 PERFORM public.legacy_delivery_assert_any_authority(p_actor_id,p_org_id,p_workspace_id,
  ARRAY['org.admin','security.manage','roles.manage','workitems.import','project.manage'],p_expected_authorization_version);
 request_hash:=public.legacy_delivery_sha256_jsonb(jsonb_build_object(
  'schemaVersion','legacy-delivery-command.v1','requestId',p_request_id,'organizationId',p_org_id,
  'workspaceId',p_workspace_id,'action',p_action,'payload',p_payload));
 receipt:=public.legacy_delivery_claim_command(p_actor_id,p_org_id,p_workspace_id,p_action,p_idempotency_key,p_request_id,request_hash);
 IF receipt.status='committed' THEN
  IF NOT EXISTS(SELECT 1 FROM public.legacy_delivery_imports import_record JOIN public.projects project
    ON project.id=import_record.project_id AND project.org_id=import_record.org_id
   WHERE import_record.id=receipt.resource_id AND import_record.org_id=p_org_id AND import_record.workspace_id=p_workspace_id
    AND project.workspace_id=p_workspace_id AND project.status='active' AND project.archived_at IS NULL AND project.deleted_at IS NULL FOR SHARE OF import_record,project)
  THEN RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND'; END IF;
  RETURN receipt.response;
 END IF;
 SELECT control.writes_enabled INTO writes_enabled_value FROM public.legacy_delivery_workspace_controls control
  WHERE control.org_id=p_org_id AND control.workspace_id=p_workspace_id FOR SHARE;
 IF writes_enabled_value IS DISTINCT FROM true THEN RAISE EXCEPTION 'LEGACY_DELIVERY_FEATURE_DISABLED'; END IF;
 IF NOT public.legacy_delivery_jsonb_keys_allowed(p_payload,
   ARRAY['projectId','sourceGenerationId','expectedSourceDigest','sourceItemIndices'],
   ARRAY['projectId','sourceGenerationId','expectedSourceDigest','sourceItemIndices'])
  OR (p_payload->>'projectId')!~*'^[0-9a-f-]{36}$' OR (p_payload->>'sourceGenerationId')!~*'^[0-9a-f-]{36}$'
  OR (p_payload->>'expectedSourceDigest')!~'^sha256:[0-9a-f]{64}$' OR jsonb_typeof(p_payload->'sourceItemIndices')<>'array'
  OR jsonb_array_length(p_payload->'sourceItemIndices') NOT BETWEEN 1 AND 100
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'sourceItemIndices') value WHERE value!~'^(0|[1-9][0-9]*)$')
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
 target_project_id:=(p_payload->>'projectId')::uuid;generation_id:=(p_payload->>'sourceGenerationId')::uuid;
 SELECT array_agg(value::integer ORDER BY value::integer),count(*),count(DISTINCT value::integer)
  INTO source_indices,source_count,item_count FROM jsonb_array_elements_text(p_payload->'sourceItemIndices') value;
 IF source_count<>item_count THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;item_count:=0;
 SELECT * INTO project_row FROM public.projects project WHERE project.id=target_project_id AND project.org_id=p_org_id
  AND project.workspace_id=p_workspace_id AND project.status='active' AND project.archived_at IS NULL AND project.deleted_at IS NULL FOR SHARE;
 SELECT * INTO generation FROM public.document_generations source WHERE source.id=generation_id AND source.org_id=p_org_id
  AND source.workspace_id=p_workspace_id AND source.project_id=target_project_id AND source.deleted_at IS NULL AND source.archived_at IS NULL
  AND source.status IN('generated','draft') AND source.studio_delivery_publication_id=bound_publication_id FOR SHARE;
 IF project_row.id IS NULL OR generation.id IS NULL OR generation.source_process_id IS NULL OR generation.source_assessment_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.assess_processes process WHERE process.id=generation.source_process_id AND process.org_id=p_org_id AND process.workspace_id=p_workspace_id AND process.deleted_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.assessments assessment WHERE assessment.id=generation.source_assessment_id AND assessment.process_id=generation.source_process_id
   AND assessment.org_id=p_org_id AND assessment.workspace_id=p_workspace_id AND assessment.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_NOT_FOUND'; END IF;
 source_items:=generation.artifacts->'workItems';target_source_digest:=public.legacy_delivery_sha256_jsonb(generation.artifacts);
 IF jsonb_typeof(source_items)<>'array' OR jsonb_array_length(source_items) NOT BETWEEN 1 AND 100
  OR target_source_digest IS DISTINCT FROM p_payload->>'expectedSourceDigest'
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_SOURCE_CHANGED'; END IF;
 IF source_indices[cardinality(source_indices)]>=jsonb_array_length(source_items)
  OR EXISTS(SELECT 1 FROM unnest(source_indices) selected(index) WHERE NOT EXISTS(
   SELECT 1 FROM public.studio_delivery_work_item_requirement_bindings binding WHERE binding.publication_id=bound_publication_id
    AND binding.document_generation_id=generation_id AND binding.source_item_index=selected.index AND binding.project_id=target_project_id))
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
 target_selection_digest:=public.legacy_delivery_sha256_jsonb(to_jsonb(source_indices));
 IF EXISTS(SELECT 1 FROM public.delivery_work_items existing WHERE existing.org_id=p_org_id AND existing.workspace_id=p_workspace_id
    AND existing.project_id=target_project_id AND existing.document_generation_id=generation_id AND existing.source_item_index=ANY(source_indices))
  OR EXISTS(SELECT 1 FROM public.legacy_delivery_imports existing WHERE existing.org_id=p_org_id AND existing.workspace_id=p_workspace_id
    AND existing.project_id=target_project_id AND existing.source_generation_id=generation_id AND existing.source_digest=target_source_digest
    AND existing.selection_digest=target_selection_digest)
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DUPLICATE_IMPORT'; END IF;
 INSERT INTO public.legacy_delivery_imports(org_id,workspace_id,project_id,source_generation_id,source_process_id,source_assessment_id,
  source_digest,selection_digest,source_item_indices,imported_by,receipt_id)
 VALUES(p_org_id,p_workspace_id,target_project_id,generation_id,generation.source_process_id,generation.source_assessment_id,
  target_source_digest,target_selection_digest,source_indices,p_actor_id,receipt.id) RETURNING * INTO imported;
 FOREACH source_index IN ARRAY source_indices LOOP
  source_item:=source_items->source_index;
  IF jsonb_typeof(source_item)<>'object' OR source_item->>'type' NOT IN('Epic','Story','Task')
   OR source_item->>'title' IS NULL OR length(btrim(source_item->>'title')) NOT BETWEEN 1 AND 300
   OR jsonb_typeof(source_item->'description')<>'string' OR length(source_item->>'description')>20000
   OR jsonb_typeof(source_item->'acceptanceCriteria')<>'array' OR jsonb_array_length(source_item->'acceptanceCriteria')>100
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(source_item->'acceptanceCriteria') criterion
    WHERE jsonb_typeof(criterion)<>'string' OR length(criterion#>>'{}')>2000)
  THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
  IF source_item->>'type'='Epic' THEN current_epic_index:=source_index;current_epic_title:=btrim(source_item->>'title'); END IF;
  SELECT string_agg('- '||value,E'\n' ORDER BY ordinal) INTO criteria_text
   FROM jsonb_array_elements_text(source_item->'acceptanceCriteria') WITH ORDINALITY criterion(value,ordinal);
  description_value:=source_item->>'description'||CASE WHEN criteria_text IS NULL THEN '' ELSE E'\n\nAcceptance Criteria:\n'||criteria_text END;
  IF length(description_value)>20000 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
  INSERT INTO public.delivery_work_items(org_id,workspace_id,project_id,document_generation_id,source_process_id,source_assessment_id,
   created_by,updated_by,owner_id,assigned_to,reporter_id,title,description,status,priority,type,source_lineage,metadata,
   audit_correlation_id,authority_version,legacy_import_id,source_item_index,source_epic_index,source_epic_title,retention_state,retention_class)
  VALUES(p_org_id,p_workspace_id,target_project_id,generation_id,generation.source_process_id,generation.source_assessment_id,
   p_actor_id,p_actor_id,p_actor_id,NULL,p_actor_id,btrim(source_item->>'title'),description_value,'To Do','Medium',source_item->>'type',
   jsonb_build_object('schemaVersion','legacy-delivery-lineage.v1','importId',imported.id,'documentGenerationId',generation_id,
    'documentSourceDigest',target_source_digest,'sourceItemIndex',source_index,'sourceProcessId',generation.source_process_id,
    'sourceAssessmentId',generation.source_assessment_id,'sourceEpicIndex',current_epic_index,'sourceEpicTitle',current_epic_title),
   '{}'::jsonb,p_request_id::text,1,imported.id,source_index,current_epic_index,current_epic_title,'active','none') RETURNING * INTO task_row;
  item_count:=item_count+1;projections:=projections||jsonb_build_array(public.legacy_delivery_task_projection(task_row));
 END LOOP;
 result:=jsonb_build_object('ok',true,'schemaVersion','legacy-delivery-command.v1','action','import','resource',jsonb_build_object(
  'importId',imported.id,'projectId',target_project_id,'sourceGenerationId',generation_id,'sourceDigest',target_source_digest,
  'selectionDigest',target_selection_digest,'itemCount',item_count,'items',projections));
 INSERT INTO public.privileged_audit_events(org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata)
 VALUES(p_org_id,p_workspace_id,p_actor_id,p_request_id,'legacy_delivery.import','legacy_delivery_import',imported.id,'succeeded',1,
  jsonb_build_object('sourceDigest',target_source_digest,'selectionDigest',target_selection_digest,'itemCount',item_count));
 UPDATE public.legacy_delivery_command_receipts SET status='committed',resource_id=imported.id,response=result,completed_at=statement_timestamp()
  WHERE id=receipt.id;
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE='23505' AND p_action='import' THEN RETURN jsonb_build_object('ok',false,'errorCode','DUPLICATE_IMPORT'); END IF;
 IF SQLERRM NOT LIKE '%LEGACY_DELIVERY_%' AND SQLERRM NOT LIKE '%PR1B_%' THEN
  RAISE LOG 'LEGACY_DELIVERY_REQUIREMENT_COMMAND_UNAVAILABLE action=% sqlstate=%',p_action,SQLSTATE;
 END IF;
 RETURN public.legacy_delivery_error_envelope(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.legacy_delivery_requirement_query(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_expected_authorization_version bigint,p_project_id uuid,
 p_limit integer DEFAULT 100,p_cursor uuid DEFAULT NULL,p_source_generation_id uuid DEFAULT NULL,p_include_retained boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;materializes_epics boolean:=false;
BEGIN
 result:=public.legacy_delivery_query(p_actor_id,p_org_id,p_workspace_id,p_expected_authorization_version,p_project_id,
  p_limit,p_cursor,p_source_generation_id,p_include_retained);
 IF result->'ok'='true'::jsonb AND result->'source' IS NOT NULL AND result->'source'<>'null'::jsonb THEN
  SELECT EXISTS(SELECT 1 FROM public.document_generations generation
   JOIN public.studio_delivery_work_item_requirement_bindings binding
    ON binding.document_generation_id=generation.id AND binding.publication_id=generation.studio_delivery_publication_id
   WHERE generation.id=p_source_generation_id AND generation.org_id=p_org_id AND generation.workspace_id=p_workspace_id
    AND generation.project_id=p_project_id) INTO materializes_epics;
  result:=jsonb_set(result,'{source,materializesEpics}',to_jsonb(materializes_epics),true);
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.legacy_delivery_task_projection(p_item public.delivery_work_items)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'id',p_item.id,'version',p_item.authority_version,'mutable',p_item.authority_version IS NOT NULL,
  'projectId',p_item.project_id,'title',p_item.title,'description',COALESCE(p_item.description,''),'status',p_item.status,
  'priority',p_item.priority,'type',p_item.type,
  'assigneeIds',COALESCE((SELECT jsonb_agg(binding.assignee_id ORDER BY binding.assignee_id)
   FROM public.legacy_delivery_work_item_assignees binding WHERE binding.work_item_id=p_item.id AND binding.org_id=p_item.org_id AND binding.workspace_id=p_item.workspace_id),'[]'::jsonb),
  'dependencyIds',COALESCE((SELECT jsonb_agg(binding.dependency_id ORDER BY binding.dependency_id)
   FROM public.legacy_delivery_work_item_dependencies binding WHERE binding.work_item_id=p_item.id AND binding.org_id=p_item.org_id AND binding.workspace_id=p_item.workspace_id),'[]'::jsonb),
  'ownerId',p_item.owner_id,'reporterId',p_item.reporter_id,
  'sourceLineage',CASE WHEN p_item.authority_version IS NOT NULL AND p_item.legacy_import_id IS NOT NULL THEN jsonb_build_object(
   'schemaVersion','legacy-delivery-lineage.v1','importId',p_item.legacy_import_id,'documentGenerationId',p_item.document_generation_id,
   'documentSourceDigest',p_item.source_lineage->>'documentSourceDigest','sourceItemIndex',p_item.source_item_index,
   'sourceProcessId',p_item.source_process_id,'sourceAssessmentId',p_item.source_assessment_id,'sourceEpicIndex',p_item.source_epic_index,
   'sourceEpicTitle',p_item.source_epic_title,'proposalOriginId',p_item.source_lineage->>'proposalOriginId',
   'studioArtifactId',p_item.source_lineage->>'studioArtifactId','studioArtifactVersionId',p_item.source_lineage->>'studioArtifactVersionId',
   'studioArtifactVersion',CASE WHEN p_item.source_lineage?'studioArtifactVersion' THEN (p_item.source_lineage->>'studioArtifactVersion')::bigint ELSE NULL END,
   'requirementLinks',COALESCE(p_item.source_lineage->'requirementLinks','[]'::jsonb)) ELSE NULL END,
  'sourceEpicIndex',p_item.source_epic_index,'sourceEpicTitle',p_item.source_epic_title,
  'retentionState',COALESCE(p_item.retention_state,CASE WHEN p_item.deleted_at IS NULL THEN 'active' ELSE 'soft_deleted' END),
  'retentionClass',COALESCE(p_item.retention_class,'none'),'retentionReason',p_item.retention_reason,
  'deletionRequestedAt',p_item.deletion_requested_at,'deletionRequestedBy',p_item.deletion_requested_by,
  'createdAt',p_item.created_at,'updatedAt',p_item.updated_at)
$$;

REVOKE ALL ON TABLE public.studio_delivery_work_item_requirement_bindings FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb),
 public.legacy_delivery_bind_requirement_source(),public.studio_delivery_proposal_origin(uuid,text,jsonb),
 public.legacy_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb),
 public.legacy_delivery_requirement_query(uuid,uuid,uuid,bigint,uuid,integer,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.studio_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.legacy_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb),
 public.legacy_delivery_query(uuid,uuid,uuid,bigint,uuid,integer,uuid,uuid,boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb),
 public.legacy_delivery_requirement_query(uuid,uuid,uuid,bigint,uuid,integer,uuid,uuid,boolean) TO service_role;

COMMENT ON TABLE public.studio_delivery_work_item_requirement_bindings IS
'Immutable server-validated binding from one approved Studio requirement-derived proposal to its exact approved section lines.';
COMMENT ON FUNCTION public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb) IS
'Service-only wrapper that preserves the existing publication authority and atomically validates exact approved requirement lines before recording stable proposal origins.';

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261103103752';
  new_tip text:='20261103104435';
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
      '20261011053000','20261019161723','20261103103752','20261103104435'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261103104435'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261103104435');
END
$process_evidence_identity_forward$;
