-- Canonical SDD and generated process flows for governed Studio.
-- Rollback: set Studio read_only, keep all created versions readable, and supersede
-- studio-sdd-1 with a forward migration. Never delete approved history.

DO $$
DECLARE item record; definition text;
BEGIN
  FOR item IN
    SELECT constraint_row.conrelid::regclass AS relation_name, constraint_row.conname,
           pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.contype = 'c'
      AND constraint_row.conrelid IN (
        'public.studio_system_template_versions'::regclass,
        'public.studio_artifact_aggregates'::regclass,
        'public.studio_artifact_source_packages'::regclass,
        'public.studio_tenant_template_aggregates'::regclass,
        'public.studio_tenant_template_versions'::regclass,
        'public.studio_retention_policies'::regclass,
        'public.studio_rendition_attempts'::regclass,
        'public.studio_renditions'::regclass,
        'public.enterprise_delivery_handoffs'::regclass,
        'public.enterprise_delivery_source_packages'::regclass,
        'public.enterprise_delivery_work_package_versions'::regclass,
        'public.enterprise_delivery_work_item_versions'::regclass
      )
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%''brd''::text%'
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%''frd''::text%'
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%''pdd''::text%'
  LOOP
    definition := replace(item.definition, '''pdd''::text]', '''pdd''::text, ''sdd''::text]');
    IF definition = item.definition THEN
      definition := replace(item.definition, '''pdd''::text,', '''pdd''::text, ''sdd''::text,');
    END IF;
    IF definition = item.definition THEN
      RAISE EXCEPTION 'SDD_CONSTRAINT_SHAPE_UNSUPPORTED: %.%', item.relation_name, item.conname;
    END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', item.relation_name, item.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', item.relation_name, item.conname, definition);
  END LOOP;
END
$$;

-- Extend only the existing allowlists. Function bodies, authorization checks,
-- idempotency, audit writes, and independent approval rules remain byte-for-byte
-- unchanged by this bounded rewrite.
DO $$
DECLARE procedure_name regprocedure; definition text; compact_count integer; spaced_count integer;
BEGIN
  FOREACH procedure_name IN ARRAY ARRAY[
    'public.studio_private_artifact_command_claim_pr217_accepted(jsonb)'::regprocedure,
    'public.studio_artifact_source_package_create(jsonb)'::regprocedure,
    'public.enterprise_assess_studio_handoff_command(jsonb)'::regprocedure,
    'public.studio_delivery_apply_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(procedure_name);
    compact_count := (length(definition)-length(replace(definition, '(''brd'',''frd'',''pdd'')', '')))/length('(''brd'',''frd'',''pdd'')');
    spaced_count := (length(definition)-length(replace(definition, '(''brd'', ''frd'', ''pdd'')', '')))/length('(''brd'', ''frd'', ''pdd'')');
    IF compact_count + spaced_count <> 1 THEN
      RAISE EXCEPTION 'SDD_FUNCTION_ALLOWLIST_PREDECESSOR_MISMATCH:%', procedure_name;
    END IF;
    definition := replace(definition, '(''brd'',''frd'',''pdd'')', '(''brd'',''frd'',''pdd'',''sdd'')');
    definition := replace(definition, '(''brd'', ''frd'', ''pdd'')', '(''brd'', ''frd'', ''pdd'', ''sdd'')');
    EXECUTE definition;
  END LOOP;
END
$$;

INSERT INTO public.studio_system_template_versions(
  artifact_type, template_version, content_schema_version, provider_instructions,
  template_hash, renderer_version, renderer_hash
) VALUES (
  'sdd', 'studio-sdd-1', 'studio-artifact-2',
  '{"artifactType":"sdd","sections":["summary","architecture","components","interfaces","dataDesign","asIsFlow","toBeFlow","securityControls","operationalDesign","designDecisions","openQuestionsAndProposals"]}'::jsonb,
  encode(public.digest('studio-sdd-1','sha256'),'hex'),
  'studio-json-projection-1', encode(public.digest('studio-json-projection-1','sha256'),'hex')
);

COMMENT ON TABLE public.studio_system_template_versions IS
  'Immutable governed templates. SDD v1 includes Mermaid As-Is and To-Be flow sections and keeps unknown technical design facts as explicit questions or proposals.';

CREATE OR REPLACE FUNCTION public.studio_tenant_template_projection(p_org uuid,p_workspace uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid();can_manage boolean;can_review boolean;can_approve boolean;can_generate boolean;
 flags public.enterprise_transcript_workspace_flags;templates jsonb;
BEGIN
 IF actor IS NULL OR NOT public.has_workspace_capability(p_workspace,p_org,'studio.templates.read') THEN RETURN NULL;END IF;
 can_manage:=public.has_workspace_capability(p_workspace,p_org,'studio.templates.manage');
 can_review:=public.has_workspace_capability(p_workspace,p_org,'studio.templates.review');
 can_approve:=public.has_workspace_capability(p_workspace,p_org,'studio.templates.approve');
 can_generate:=public.has_workspace_capability(p_workspace,p_org,'studio.artifacts.generate');
 SELECT * INTO flags FROM public.enterprise_transcript_workspace_flags WHERE org_id=p_org AND workspace_id=p_workspace;
 SELECT COALESCE(jsonb_agg(projected.item ORDER BY projected.ownership,projected.artifact_class,projected.safe_name),'[]'::jsonb) INTO templates
 FROM(
  SELECT 'system'::text ownership,system.artifact_type artifact_class,('System '||upper(system.artifact_type)) safe_name,
   jsonb_build_object('ownership','system','templateId',system.id,'templateVersionId',system.id,'version',system.template_version,
    'name','System '||upper(system.artifact_type),'description','AvalaOS governed system '||upper(system.artifact_type)||' compatibility template',
    'artifactClass',system.artifact_type,'lifecycle','approved','templateHash',system.template_hash,'rendererVersion',system.renderer_version,
    'contentSchemaVersion',system.content_schema_version,'sections',CASE system.artifact_type
      WHEN 'brd' THEN jsonb_build_array(jsonb_build_object('id','summary','title','Summary','required',true,'fieldKind','narrative'),jsonb_build_object('id','objectives','title','Objectives','required',true,'fieldKind','requirements'),jsonb_build_object('id','scope','title','Scope','required',true,'fieldKind','narrative'),jsonb_build_object('id','requirements','title','Requirements','required',true,'fieldKind','requirements'),jsonb_build_object('id','risks','title','Risks','required',true,'fieldKind','risks'))
      WHEN 'frd' THEN jsonb_build_array(jsonb_build_object('id','summary','title','Summary','required',true,'fieldKind','narrative'),jsonb_build_object('id','functionalRequirements','title','Functional requirements','required',true,'fieldKind','requirements'),jsonb_build_object('id','rules','title','Rules','required',true,'fieldKind','rules'),jsonb_build_object('id','interfaces','title','Interfaces','required',true,'fieldKind','interfaces'),jsonb_build_object('id','acceptanceCriteria','title','Acceptance criteria','required',true,'fieldKind','acceptance_criteria'))
      WHEN 'pdd' THEN jsonb_build_array(jsonb_build_object('id','summary','title','Summary','required',true,'fieldKind','narrative'),jsonb_build_object('id','process','title','Process','required',true,'fieldKind','narrative'),jsonb_build_object('id','roles','title','Roles','required',true,'fieldKind','controls'),jsonb_build_object('id','controls','title','Controls','required',true,'fieldKind','controls'),jsonb_build_object('id','exceptions','title','Exceptions','required',true,'fieldKind','risks'))
      ELSE jsonb_build_array(jsonb_build_object('id','summary','title','Summary','required',true,'fieldKind','narrative'),jsonb_build_object('id','architecture','title','Architecture','required',true,'fieldKind','narrative'),jsonb_build_object('id','components','title','Components','required',true,'fieldKind','interfaces'),jsonb_build_object('id','interfaces','title','Interfaces','required',true,'fieldKind','interfaces'),jsonb_build_object('id','dataDesign','title','Data design','required',true,'fieldKind','narrative'),jsonb_build_object('id','asIsFlow','title','As is flow','required',true,'fieldKind','narrative'),jsonb_build_object('id','toBeFlow','title','To be flow','required',true,'fieldKind','narrative'),jsonb_build_object('id','securityControls','title','Security controls','required',true,'fieldKind','controls'),jsonb_build_object('id','operationalDesign','title','Operational design','required',true,'fieldKind','controls'),jsonb_build_object('id','designDecisions','title','Design decisions','required',true,'fieldKind','narrative'),jsonb_build_object('id','openQuestionsAndProposals','title','Open questions and proposals','required',true,'fieldKind','risks')) END,
    'replacement',NULL,'actions',to_jsonb(array_remove(ARRAY[CASE WHEN can_generate THEN 'studio.generation.request' END]::text[],NULL))) item
  FROM public.studio_system_template_versions system WHERE system.superseded_at IS NULL
  UNION ALL
  SELECT 'tenant',aggregate.artifact_class,aggregate.safe_name,
   jsonb_build_object('ownership','tenant','templateId',aggregate.id,'templateVersionId',version.id,'version',version.version,
    'name',aggregate.safe_name,'description',aggregate.safe_description,'artifactClass',aggregate.artifact_class,'lifecycle',aggregate.lifecycle,
    'templateHash',version.template_hash,'rendererVersion',version.renderer_compatibility_version,'contentSchemaVersion',version.content_schema_version,
    'sections',version.section_definitions,'replacement',(SELECT jsonb_build_object('templateId',replacement.template_id,'templateVersionId',replacement.id,'version',replacement.version)
      FROM public.studio_tenant_template_approval_events resolution JOIN public.studio_tenant_template_versions replacement ON replacement.id=resolution.replacement_version_id
      WHERE resolution.template_version_id=version.id AND resolution.outcome='replaced' LIMIT 1),
    'actions',to_jsonb(array_remove(ARRAY[
      CASE WHEN can_manage AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status IN('draft','changes_requested','rejected','approved','deprecated') THEN 'studio.template.revise' END,
      CASE WHEN can_manage AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status='draft' AND version.authored_by=actor THEN 'studio.template.review.submit' END,
      CASE WHEN can_review AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status IN('reviewer_ready','in_review') AND version.authored_by<>actor THEN 'studio.template.review.resolve' END,
      CASE WHEN can_approve AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status='approval_ready' AND version.authored_by<>actor AND NOT EXISTS(SELECT 1 FROM public.studio_tenant_template_review_events review WHERE review.template_version_id=version.id AND review.reviewer_id=actor) THEN 'studio.template.approval.resolve' END,
      CASE WHEN can_approve AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status='approved' AND version.authored_by<>actor THEN 'studio.template.deprecate' END,
      CASE WHEN can_approve AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status='approved' AND version.authored_by<>actor AND EXISTS(SELECT 1 FROM public.studio_tenant_template_versions replacement JOIN public.studio_tenant_template_aggregates target ON target.id=replacement.template_id WHERE replacement.org_id=p_org AND replacement.workspace_id=p_workspace AND replacement.status='approved' AND replacement.template_id<>aggregate.id AND replacement.artifact_class=version.artifact_class AND target.current_approved_version_id=replacement.id AND replacement.authored_by<>actor) THEN 'studio.template.replace' END,
      CASE WHEN can_generate AND COALESCE(flags.studio_tenant_templates_enabled,false) AND version.status='approved' AND aggregate.current_approved_version_id=version.id THEN 'studio.generation.request' END
    ]::text[],NULL))) item
  FROM public.studio_tenant_template_aggregates aggregate JOIN public.studio_tenant_template_versions version ON version.id=aggregate.current_version_id
  WHERE aggregate.org_id=p_org AND aggregate.workspace_id=p_workspace
 )projected;
 RETURN jsonb_build_object('organizationId',p_org,'workspaceId',p_workspace,'templates',templates);
END
$$;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261019161723';
  new_tip text:='20261103103752';
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
      '20261011053000','20261019161723','20261103103752'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261103103752'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261103103752');
END
$process_evidence_identity_forward$;

-- A selective refresh is one governed generation attempt. The full validated
-- provider response remains the immutable staged candidate; only finalization
-- may combine selected candidate sections with the exact expected parent.
CREATE TABLE public.studio_generation_section_refreshes(
  attempt_id uuid PRIMARY KEY,
  artifact_id uuid NOT NULL,
  org_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  parent_version_id uuid,
  selected_section_ids text[] NOT NULL,
  selection_hash text NOT NULL CHECK(selection_hash~'^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(cardinality(selected_section_ids) BETWEEN 0 AND 100),
  UNIQUE(attempt_id,artifact_id,org_id,workspace_id),
  FOREIGN KEY(attempt_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_generation_attempts(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(parent_version_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_versions(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT
);

-- Full generations may have an existing parent or be the initial version.
-- Non-empty selections are constrained to an exact parent and unique safe
-- section IDs by the command wrapper and are rechecked by the merge trigger.
ALTER TABLE public.studio_generation_section_refreshes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_generation_section_refreshes FORCE ROW LEVEL SECURITY;

CREATE TABLE public.studio_artifact_section_source_bindings(
  artifact_version_id uuid NOT NULL,
  section_id text NOT NULL CHECK(section_id~'^[A-Za-z][A-Za-z0-9_.-]{0,79}$'),
  artifact_id uuid NOT NULL,
  org_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  source_package_id uuid NOT NULL,
  source_package_hash text NOT NULL CHECK(source_package_hash~'^[0-9a-f]{64}$'),
  origin_version_id uuid NOT NULL,
  generation_attempt_id uuid,
  disposition text NOT NULL CHECK(disposition IN('generated','refreshed','carried','human_edited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(artifact_version_id,section_id),
  FOREIGN KEY(artifact_version_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_versions(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(origin_version_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_versions(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(generation_attempt_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_generation_attempts(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(source_package_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_source_packages(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT
);
ALTER TABLE public.studio_artifact_section_source_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_artifact_section_source_bindings FORCE ROW LEVEL SECURITY;

ALTER FUNCTION public.studio_artifact_generation_request_v2(jsonb)
  RENAME TO studio_artifact_generation_request_v2_base_20261103;

CREATE OR REPLACE FUNCTION public.studio_artifact_generation_request_v2(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  normalized jsonb;
  selected jsonb;
  selected_ids text[];
  result jsonb;
  attempt public.studio_artifact_generation_attempts;
  binding public.studio_generation_section_refreshes;
  parent public.studio_artifact_versions;
  selection_hash text;
BEGIN
  IF p_command IS NULL OR jsonb_typeof(p_command)<>'object'
     OR NOT(p_command?&ARRAY['actorId','organizationId','workspaceId','requestId','idempotencyKey','authorizationVersion','artifactId','sourcePackageId','templateKind','templateVersionId','expectedAggregateVersion','expectedCurrentVersionId','expectedApprovedVersionId'])
     OR(p_command-ARRAY['actorId','organizationId','workspaceId','requestId','idempotencyKey','authorizationVersion','artifactId','sourcePackageId','templateKind','templateVersionId','expectedAggregateVersion','expectedCurrentVersionId','expectedApprovedVersionId','selectedSectionIds'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'INVALID_COMMAND';
  END IF;
  selected:=COALESCE(p_command->'selectedSectionIds','[]'::jsonb);
  IF jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)>100
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected)item WHERE jsonb_typeof(item.value)<>'string' OR(item.value#>>'{}')!~'^[A-Za-z][A-Za-z0-9_.-]{0,79}$')
     OR(SELECT count(*) FROM jsonb_array_elements(selected))<>(SELECT count(DISTINCT item.value#>>'{}') FROM jsonb_array_elements(selected)item) THEN
    RAISE EXCEPTION 'INVALID_COMMAND';
  END IF;
  SELECT COALESCE(array_agg(item.value#>>'{}' ORDER BY item.value#>>'{}'),ARRAY[]::text[])
  INTO selected_ids FROM jsonb_array_elements(selected) WITH ORDINALITY item(value,ordinality);
  normalized:=p_command-'selectedSectionIds';

  -- The base command performs authorization before resource inspection and
  -- owns CAS, receipt, route, reservation and audit writes. Any validation
  -- failure below rolls that work back in the same transaction.
  result:=public.studio_artifact_generation_request_v2_base_20261103(normalized);
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts
   WHERE id=(result->>'attemptId')::uuid FOR SHARE;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'COMMAND_OUTCOME_UNKNOWN';END IF;
  IF cardinality(selected_ids)>0 THEN
    IF attempt.expected_current_version_id IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND';END IF;
    SELECT * INTO parent FROM public.studio_artifact_versions
     WHERE id=attempt.expected_current_version_id AND artifact_id=attempt.artifact_id
       AND org_id=attempt.org_id AND workspace_id=attempt.workspace_id FOR SHARE;
    IF parent.id IS NULL OR jsonb_typeof(parent.content->'sections')<>'array'
       OR EXISTS(SELECT 1 FROM unnest(selected_ids)section_id
          WHERE(SELECT count(*) FROM jsonb_array_elements(parent.content->'sections')section
                WHERE COALESCE(section->>'id',section->>'key')=section_id)<>1) THEN
      RAISE EXCEPTION 'INVALID_COMMAND';
    END IF;
  END IF;
  selection_hash:=public.enterprise_sha256_jsonb(to_jsonb(selected_ids));
  SELECT * INTO binding FROM public.studio_generation_section_refreshes WHERE attempt_id=attempt.id;
  IF binding.attempt_id IS NOT NULL THEN
    IF binding.parent_version_id IS DISTINCT FROM attempt.expected_current_version_id
       OR binding.selected_section_ids IS DISTINCT FROM selected_ids
       OR binding.selection_hash IS DISTINCT FROM selection_hash THEN
      RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_CONFLICT';
    END IF;
  ELSE
    INSERT INTO public.studio_generation_section_refreshes(
      attempt_id,artifact_id,org_id,workspace_id,parent_version_id,selected_section_ids,selection_hash
    ) VALUES(
      attempt.id,attempt.artifact_id,attempt.org_id,attempt.workspace_id,attempt.expected_current_version_id,selected_ids,selection_hash
    );
  END IF;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION public.studio_process_evidence_merge_selected_sections()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  binding public.studio_generation_section_refreshes;
  attempt public.studio_artifact_generation_attempts;
  parent public.studio_artifact_versions;
  package public.studio_artifact_source_packages;
  merged_sections jsonb;
  selected_source_ids jsonb;
  covered_source_ids jsonb;
BEGIN
  IF NEW.generation_attempt_id IS NULL THEN RETURN NEW;END IF;
  SELECT * INTO binding FROM public.studio_generation_section_refreshes
   WHERE attempt_id=NEW.generation_attempt_id;
  IF binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0 THEN RETURN NEW;END IF;
  SELECT * INTO parent FROM public.studio_artifact_versions
   WHERE id=binding.parent_version_id AND artifact_id=NEW.artifact_id
     AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id FOR SHARE;
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts
   WHERE id=NEW.generation_attempt_id AND artifact_id=NEW.artifact_id
     AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id;
  SELECT * INTO package FROM public.studio_artifact_source_packages
   WHERE id=attempt.source_package_id AND artifact_id=NEW.artifact_id
     AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id;
  IF parent.id IS NULL OR NEW.parent_version_id IS DISTINCT FROM parent.id
     OR attempt.id IS NULL OR package.id IS NULL
     OR jsonb_typeof(parent.content->'sections')<>'array'
     OR jsonb_typeof(NEW.content->'sections')<>'array'
     OR EXISTS(SELECT 1 FROM unnest(binding.selected_section_ids)section_id
       WHERE(SELECT count(*) FROM jsonb_array_elements(parent.content->'sections')section WHERE COALESCE(section->>'id',section->>'key')=section_id)<>1
          OR(SELECT count(*) FROM jsonb_array_elements(NEW.content->'sections')section WHERE COALESCE(section->>'id',section->>'key')=section_id)<>1) THEN
    RAISE EXCEPTION 'SELECTIVE_REFRESH_CONTENT_MISMATCH';
  END IF;
  SELECT jsonb_agg(
    CASE WHEN COALESCE(parent_section.value->>'id',parent_section.value->>'key')=ANY(binding.selected_section_ids)
      THEN(SELECT candidate.value FROM jsonb_array_elements(NEW.content->'sections')candidate(value)
           WHERE COALESCE(candidate.value->>'id',candidate.value->>'key')=COALESCE(parent_section.value->>'id',parent_section.value->>'key'))
      ELSE parent_section.value END
    ORDER BY parent_section.ordinality
  ) INTO merged_sections
  FROM jsonb_array_elements(parent.content->'sections')WITH ORDINALITY parent_section(value,ordinality);
  NEW.content:=jsonb_set(parent.content,'{sections}',merged_sections,false);
  SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO covered_source_ids
  FROM(SELECT DISTINCT anchor.value->>'sourceVersionId' source_id
    FROM jsonb_array_elements(merged_sections)section(value)
    CROSS JOIN LATERAL jsonb_array_elements(section.value->'sourceAnchors')anchor(value))sources;
  SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO selected_source_ids
  FROM(SELECT DISTINCT source_id FROM(
    SELECT anchor.value->>'sourceVersionId' source_id
      FROM jsonb_array_elements(package.anchor_manifest)anchor(value)
    UNION ALL
    SELECT anchor.value->>'sourceVersionId' source_id
      FROM jsonb_array_elements(merged_sections)section(value)
      CROSS JOIN LATERAL jsonb_array_elements(section.value->'sourceAnchors')anchor(value)
  )all_selected WHERE source_id IS NOT NULL)selected;
  IF covered_source_ids IS DISTINCT FROM selected_source_ids THEN
    RAISE EXCEPTION 'SELECTIVE_REFRESH_COVERAGE_INCOMPLETE';
  END IF;
  NEW.content:=jsonb_set(NEW.content,'{coverage}',jsonb_build_object(
    'selectedSourceVersionIds',selected_source_ids,'coveredSourceVersionIds',covered_source_ids,'complete',true),false);
  NEW.content_hash:=public.enterprise_sha256_jsonb(NEW.content);
  RETURN NEW;
END
$$;

CREATE TRIGGER studio_a_process_evidence_merge_selected_sections
BEFORE INSERT ON public.studio_artifact_versions
FOR EACH ROW EXECUTE FUNCTION public.studio_process_evidence_merge_selected_sections();

CREATE OR REPLACE FUNCTION public.studio_process_evidence_bind_section_sources()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  binding public.studio_generation_section_refreshes;
  parent public.studio_artifact_versions;
BEGIN
  IF NEW.generation_attempt_id IS NOT NULL THEN
    SELECT * INTO binding FROM public.studio_generation_section_refreshes WHERE attempt_id=NEW.generation_attempt_id;
  END IF;
  IF NEW.parent_version_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.studio_artifact_versions WHERE id=NEW.parent_version_id;
  END IF;
  INSERT INTO public.studio_artifact_section_source_bindings(
    artifact_version_id,section_id,artifact_id,org_id,workspace_id,source_package_id,source_package_hash,
    origin_version_id,generation_attempt_id,disposition
  )
  SELECT NEW.id,normalized.section_id,NEW.artifact_id,NEW.org_id,NEW.workspace_id,
    CASE WHEN NEW.generation_attempt_id IS NULL
      THEN COALESCE(prior.source_package_id,parent.source_package_id,NEW.source_package_id)
      WHEN NEW.generation_attempt_id IS NOT NULL
              AND(binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0
                   OR normalized.section_id=ANY(binding.selected_section_ids))
      THEN NEW.source_package_id ELSE COALESCE(prior.source_package_id,parent.source_package_id,NEW.source_package_id) END,
    CASE WHEN NEW.generation_attempt_id IS NULL
      THEN COALESCE(prior.source_package_hash,parent.source_package_hash,NEW.source_package_hash)
      WHEN NEW.generation_attempt_id IS NOT NULL
              AND(binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0
                   OR normalized.section_id=ANY(binding.selected_section_ids))
      THEN NEW.source_package_hash ELSE COALESCE(prior.source_package_hash,parent.source_package_hash,NEW.source_package_hash) END,
    CASE WHEN NEW.generation_attempt_id IS NOT NULL
              AND(binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0
                   OR normalized.section_id=ANY(binding.selected_section_ids))
      THEN NEW.id ELSE COALESCE(prior.origin_version_id,parent.id,NEW.id) END,
    CASE WHEN NEW.generation_attempt_id IS NULL THEN NULL
      WHEN NEW.generation_attempt_id IS NOT NULL
              AND(binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0
                   OR normalized.section_id=ANY(binding.selected_section_ids))
      THEN NEW.generation_attempt_id ELSE prior.generation_attempt_id END,
    CASE
      WHEN NEW.generation_attempt_id IS NULL THEN 'human_edited'
      WHEN binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0 THEN 'generated'
      WHEN normalized.section_id=ANY(binding.selected_section_ids) THEN 'refreshed'
      ELSE 'carried' END
  FROM jsonb_array_elements(NEW.content->'sections')section(value)
  CROSS JOIN LATERAL(SELECT COALESCE(section.value->>'id',section.value->>'key') section_id)normalized
  LEFT JOIN public.studio_artifact_section_source_bindings prior
    ON prior.artifact_version_id=NEW.parent_version_id AND prior.section_id=normalized.section_id
  WHERE normalized.section_id~'^[A-Za-z][A-Za-z0-9_.-]{0,79}$'
  ON CONFLICT(artifact_version_id,section_id)DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER studio_process_evidence_section_source_binding
AFTER INSERT ON public.studio_artifact_versions
FOR EACH ROW EXECUTE FUNCTION public.studio_process_evidence_bind_section_sources();

CREATE OR REPLACE FUNCTION public.studio_process_evidence_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'STUDIO_IMMUTABLE';
END
$$;
CREATE TRIGGER studio_process_evidence_refresh_binding_immutable
BEFORE UPDATE OR DELETE ON public.studio_generation_section_refreshes
FOR EACH ROW EXECUTE FUNCTION public.studio_process_evidence_immutable();
CREATE TRIGGER studio_process_evidence_section_source_immutable
BEFORE UPDATE OR DELETE ON public.studio_artifact_section_source_bindings
FOR EACH ROW EXECUTE FUNCTION public.studio_process_evidence_immutable();

REVOKE ALL ON FUNCTION public.studio_artifact_generation_request_v2_base_20261103(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.studio_artifact_generation_request_v2(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.studio_artifact_generation_request_v2(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.studio_process_evidence_merge_selected_sections() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.studio_process_evidence_bind_section_sources() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.studio_process_evidence_immutable() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON TABLE public.studio_generation_section_refreshes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.studio_artifact_section_source_bindings FROM PUBLIC,anon,authenticated;

-- A document may adopt a later, independently approved Assess handoff without
-- replacing the existing artifact. Retain one immutable consumption row for
-- each exact successor package instead of constraining the artifact to its
-- first handoff forever.
ALTER TABLE public.enterprise_module_handoff_consumptions
 DROP CONSTRAINT enterprise_module_handoff_consumptions_artifact_id_key;
CREATE UNIQUE INDEX enterprise_module_handoff_consumptions_artifact_package_key
 ON public.enterprise_module_handoff_consumptions(artifact_id,source_package_id);

-- Changed inputs are adopted explicitly into the document aggregate the user
-- is viewing. The immutable successor package becomes the aggregate binding,
-- while current and approved document heads remain unchanged until a later
-- user-selected section refresh commits a descendant revision.
DO $studio_source_successor_commands$
DECLARE definition text; previous text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.studio_artifact_source_package_create(jsonb)'::regprocedure);
  previous:=$old$OR(payload-ARRAY['sourceMode','artifactType','studioInputBundleId','studioInputBundleVersionId','studioInputBundleVersion','manualBrief'])<>'{}'::jsonb$old$;
  replacement:=$new$OR(payload-ARRAY['sourceMode','artifactType','studioInputBundleId','studioInputBundleVersionId','studioInputBundleVersion','manualBrief','replaceArtifact'])<>'{}'::jsonb$new$;
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN
    RAISE EXCEPTION 'STUDIO_SOURCE_SUCCESSOR_PAYLOAD_PREDECESSOR_MISMATCH';
  END IF;
  definition:=replace(definition,previous,replacement);

  previous:=$old$
 IF artifact.id IS NOT NULL THEN
$old$;
  replacement:=$new$
 IF payload?'replaceArtifact' THEN
  IF jsonb_typeof(payload->'replaceArtifact')<>'object'
     OR NOT((payload->'replaceArtifact')?&ARRAY['artifactId','sourcePackageId','sourcePackageVersion','aggregateVersion','currentVersionId','currentApprovedVersionId'])
     OR((payload->'replaceArtifact')-ARRAY['artifactId','sourcePackageId','sourcePackageVersion','aggregateVersion','currentVersionId','currentApprovedVersionId'])<>'{}'::jsonb
     OR COALESCE(payload#>>'{replaceArtifact,artifactId}','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(payload#>>'{replaceArtifact,sourcePackageId}','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(payload#>>'{replaceArtifact,sourcePackageVersion}','')!~'^[1-9][0-9]*$'
     OR COALESCE(payload#>>'{replaceArtifact,aggregateVersion}','')!~'^[0-9]+$'
     OR(payload#>>'{replaceArtifact,currentVersionId}' IS NOT NULL AND payload#>>'{replaceArtifact,currentVersionId}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR(payload#>>'{replaceArtifact,currentApprovedVersionId}' IS NOT NULL AND payload#>>'{replaceArtifact,currentApprovedVersionId}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'INVALID_COMMAND';
  END IF;
  IF artifact.id IS NULL OR artifact.id IS DISTINCT FROM (payload#>>'{replaceArtifact,artifactId}')::uuid
     OR artifact.org_id IS DISTINCT FROM org OR artifact.workspace_id IS DISTINCT FROM workspace
     OR artifact.artifact_type IS DISTINCT FROM artifact_type
     OR artifact.source_mode NOT IN('direct_transcript_bundle','manual_brief')
     OR artifact.aggregate_version IS DISTINCT FROM (payload#>>'{replaceArtifact,aggregateVersion}')::bigint
     OR artifact.current_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentVersionId}')::uuid
     OR artifact.current_approved_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentApprovedVersionId}')::uuid THEN
    RAISE EXCEPTION 'VERSION_CONFLICT';
  END IF;
  SELECT * INTO package FROM public.studio_artifact_source_packages current_package
   WHERE current_package.id=artifact.source_package_id AND current_package.artifact_id=artifact.id
     AND current_package.org_id=org AND current_package.workspace_id=workspace FOR SHARE;
  IF package.id IS NULL OR package.id IS DISTINCT FROM (payload#>>'{replaceArtifact,sourcePackageId}')::uuid
     OR package.version IS DISTINCT FROM (payload#>>'{replaceArtifact,sourcePackageVersion}')::bigint
     OR artifact.source_package_hash IS DISTINCT FROM package.package_hash THEN
    RAISE EXCEPTION 'SOURCE_PACKAGE_STALE';
  END IF;
  INSERT INTO public.studio_artifact_source_packages(id,artifact_id,org_id,workspace_id,version,replaces_source_package_id,source_mode,studio_input_bundle_id,studio_input_bundle_version_id,
   studio_input_bundle_version,studio_bundle_hash,manual_brief_hash,lineage_classification,planning_only,route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,
   candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count,created_by)
  VALUES(source_package_id,artifact.id,org,workspace,package.version+1,package.id,source_mode,bundle.id,bundle_version.id,bundle_version.version,bundle_version.bundle_hash,
   CASE WHEN source_mode='manual_brief' THEN manual_brief_hash END,'not_assessed',true,1,route_snapshot,route_hash,package_hash,
   candidate_manifest,candidate_manifest_hash,jsonb_array_length(candidate_manifest),anchor_manifest,anchor_manifest_hash,jsonb_array_length(anchor_manifest),actor)
  RETURNING * INTO package;
  IF source_mode='manual_brief' THEN
   INSERT INTO public.studio_artifact_manual_brief_materials(source_package_id,artifact_id,org_id,workspace_id,manual_brief,manual_brief_hash,created_by)
   VALUES(package.id,artifact.id,org,workspace,payload->>'manualBrief',manual_brief_hash,actor);
  END IF;
  UPDATE public.studio_artifact_aggregates SET source_package_id=package.id,source_package_hash=package.package_hash,
   source_mode=package.source_mode,lineage_classification=package.lineage_classification,planning_only=package.planning_only,
   aggregate_version=aggregate_version+1,updated_at=statement_timestamp()
  WHERE id=artifact.id RETURNING * INTO artifact;
  result:=jsonb_build_object('outcome','committed','receiptId',receipt.id,'resourceId',artifact.id,'artifactId',artifact.id,'sourcePackageId',package.id,
   'sourcePackageHash',package.package_hash,'sourceMode',package.source_mode,'lineageClassification','not_assessed','planningOnly',true);
  INSERT INTO public.privileged_audit_events(id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata)
  VALUES(audit_id,org,workspace,actor,request_id,'studio.source-package.create','studio_artifact',artifact.id,'succeeded',artifact.aggregate_version,
   jsonb_build_object('sourcePackageId',package.id,'sourceMode',package.source_mode,'planningOnly',true,'replacesSourcePackageId',package.replaces_source_package_id));
  UPDATE public.studio_artifact_command_receipts SET status='committed',resource_id=artifact.id,response=result,completed_at=statement_timestamp() WHERE id=receipt.id;
  RETURN result;
 END IF;
 IF artifact.id IS NOT NULL THEN
$new$;
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN
    RAISE EXCEPTION 'STUDIO_SOURCE_SUCCESSOR_BRANCH_PREDECESSOR_MISMATCH';
  END IF;
  definition:=replace(definition,previous,replacement);
  EXECUTE definition;

  definition:=pg_get_functiondef('public.enterprise_assess_studio_handoff_command(jsonb)'::regprocedure);
  previous:=$old$
   artifact_id:=public.studio_pr_b_deterministic_uuid('assess-studio-handoff-artifact',handoff.id);
   source_package_id:=public.studio_pr_b_deterministic_uuid('assess-studio-handoff-package',handoff.id);
   INSERT INTO public.studio_artifact_aggregates(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
    review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,review_schema_version,review_sequence,
    artifact_type,aggregate_version,lifecycle,created_by,source_package_id,source_mode,lineage_classification,planning_only)
   VALUES(artifact_id,org,workspace,upstream.case_id,upstream.source_version_id,upstream.source_case_version,upstream.decision_id,upstream.decision_version,
    upstream.review_resolution_id,upstream.govern_resolution_id,upstream.id,handoff.target_package_hash,upstream.schema_version,upstream.rule_set_version,
    upstream.review_schema_version,upstream.review_sequence,handoff.artifact_type,0,'draft',actor,source_package_id,
    CASE WHEN handoff.target_input_bundle_version_id IS NULL THEN 'assess_handoff' ELSE 'assess_plus_transcript_bundle' END,handoff.lineage_classification,false)
   RETURNING * INTO artifact;
   INSERT INTO public.studio_artifact_source_packages(id,artifact_id,org_id,workspace_id,version,source_mode,assess_handoff_id,assess_package_hash,
    studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,lineage_classification,planning_only,
    route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,candidate_manifest,candidate_manifest_hash,candidate_count,
    anchor_manifest,anchor_manifest_hash,anchor_count,created_by)
   VALUES(source_package_id,artifact.id,org,workspace,1,artifact.source_mode,upstream.id,upstream.package_hash,handoff.target_input_bundle_id,
    handoff.target_input_bundle_version_id,handoff.target_input_bundle_version,handoff.target_input_bundle_hash,handoff.lineage_classification,false,
    handoff.route_policy_version,handoff.route_policy_snapshot,handoff.route_policy_hash,handoff.target_package_hash,
    handoff.candidate_manifest,handoff.candidate_manifest_hash,handoff.candidate_count,
    handoff.anchor_manifest,handoff.anchor_manifest_hash,handoff.anchor_count,actor) RETURNING * INTO source_package;
$old$;
  replacement:=$new$
   IF payload?'replaceArtifact' THEN
    IF jsonb_typeof(payload->'replaceArtifact')<>'object'
       OR NOT((payload->'replaceArtifact')?&ARRAY['artifactId','sourcePackageId','sourcePackageVersion','aggregateVersion','currentVersionId','currentApprovedVersionId'])
       OR((payload->'replaceArtifact')-ARRAY['artifactId','sourcePackageId','sourcePackageVersion','aggregateVersion','currentVersionId','currentApprovedVersionId'])<>'{}'::jsonb
       OR COALESCE(payload#>>'{replaceArtifact,artifactId}','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR COALESCE(payload#>>'{replaceArtifact,sourcePackageId}','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR COALESCE(payload#>>'{replaceArtifact,sourcePackageVersion}','')!~'^[1-9][0-9]*$'
       OR COALESCE(payload#>>'{replaceArtifact,aggregateVersion}','')!~'^[0-9]+$'
       OR(payload#>>'{replaceArtifact,currentVersionId}' IS NOT NULL AND payload#>>'{replaceArtifact,currentVersionId}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       OR(payload#>>'{replaceArtifact,currentApprovedVersionId}' IS NOT NULL AND payload#>>'{replaceArtifact,currentApprovedVersionId}'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'INVALID_COMMAND';
    END IF;
    artifact_id:=(payload#>>'{replaceArtifact,artifactId}')::uuid;
    SELECT * INTO artifact FROM public.studio_artifact_aggregates target
     WHERE target.id=artifact_id AND target.org_id=org AND target.workspace_id=workspace FOR UPDATE;
    IF artifact.id IS NULL OR artifact.artifact_type IS DISTINCT FROM handoff.artifact_type
       OR artifact.case_id IS DISTINCT FROM upstream.case_id OR artifact.source_mode NOT IN('assess_handoff','assess_plus_transcript_bundle')
       OR artifact.aggregate_version IS DISTINCT FROM (payload#>>'{replaceArtifact,aggregateVersion}')::bigint
       OR artifact.current_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentVersionId}')::uuid
       OR artifact.current_approved_version_id IS DISTINCT FROM (payload#>>'{replaceArtifact,currentApprovedVersionId}')::uuid THEN
      RAISE EXCEPTION 'VERSION_CONFLICT';
    END IF;
    SELECT * INTO source_package FROM public.studio_artifact_source_packages current_package
     WHERE current_package.id=artifact.source_package_id AND current_package.artifact_id=artifact.id
       AND current_package.org_id=org AND current_package.workspace_id=workspace FOR SHARE;
    IF source_package.id IS NULL OR source_package.id IS DISTINCT FROM (payload#>>'{replaceArtifact,sourcePackageId}')::uuid
       OR source_package.version IS DISTINCT FROM (payload#>>'{replaceArtifact,sourcePackageVersion}')::bigint
       OR artifact.source_package_hash IS DISTINCT FROM source_package.package_hash THEN
      RAISE EXCEPTION 'SOURCE_PACKAGE_STALE';
    END IF;
    source_package_id:=public.studio_pr_b_deterministic_uuid('assess-studio-handoff-successor-package',handoff.id);
    INSERT INTO public.studio_artifact_source_packages(id,artifact_id,org_id,workspace_id,version,replaces_source_package_id,source_mode,assess_handoff_id,assess_package_hash,
     studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,lineage_classification,planning_only,
     route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,candidate_manifest,candidate_manifest_hash,candidate_count,
     anchor_manifest,anchor_manifest_hash,anchor_count,created_by)
    VALUES(source_package_id,artifact.id,org,workspace,source_package.version+1,source_package.id,
     CASE WHEN handoff.target_input_bundle_version_id IS NULL THEN 'assess_handoff' ELSE 'assess_plus_transcript_bundle' END,
     upstream.id,upstream.package_hash,handoff.target_input_bundle_id,handoff.target_input_bundle_version_id,handoff.target_input_bundle_version,
     handoff.target_input_bundle_hash,handoff.lineage_classification,false,handoff.route_policy_version,handoff.route_policy_snapshot,handoff.route_policy_hash,
     handoff.target_package_hash,handoff.candidate_manifest,handoff.candidate_manifest_hash,handoff.candidate_count,
     handoff.anchor_manifest,handoff.anchor_manifest_hash,handoff.anchor_count,actor) RETURNING * INTO source_package;
    UPDATE public.studio_artifact_aggregates SET case_id=upstream.case_id,source_version_id=upstream.source_version_id,
     source_case_version=upstream.source_case_version,decision_id=upstream.decision_id,decision_version=upstream.decision_version,
     review_resolution_id=upstream.review_resolution_id,govern_resolution_id=upstream.govern_resolution_id,handoff_id=upstream.id,
     source_package_id=source_package.id,source_package_hash=source_package.package_hash,source_schema_version=upstream.schema_version,
     rule_set_version=upstream.rule_set_version,review_schema_version=upstream.review_schema_version,review_sequence=upstream.review_sequence,
     source_mode=source_package.source_mode,lineage_classification=source_package.lineage_classification,planning_only=false,
     aggregate_version=aggregate_version+1,updated_at=statement_timestamp()
    WHERE id=artifact.id RETURNING * INTO artifact;
   ELSE
    artifact_id:=public.studio_pr_b_deterministic_uuid('assess-studio-handoff-artifact',handoff.id);
    source_package_id:=public.studio_pr_b_deterministic_uuid('assess-studio-handoff-package',handoff.id);
    INSERT INTO public.studio_artifact_aggregates(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,
     review_resolution_id,govern_resolution_id,handoff_id,source_package_hash,source_schema_version,rule_set_version,review_schema_version,review_sequence,
     artifact_type,aggregate_version,lifecycle,created_by,source_package_id,source_mode,lineage_classification,planning_only)
    VALUES(artifact_id,org,workspace,upstream.case_id,upstream.source_version_id,upstream.source_case_version,upstream.decision_id,upstream.decision_version,
     upstream.review_resolution_id,upstream.govern_resolution_id,upstream.id,handoff.target_package_hash,upstream.schema_version,upstream.rule_set_version,
     upstream.review_schema_version,upstream.review_sequence,handoff.artifact_type,0,'draft',actor,source_package_id,
     CASE WHEN handoff.target_input_bundle_version_id IS NULL THEN 'assess_handoff' ELSE 'assess_plus_transcript_bundle' END,handoff.lineage_classification,false)
    RETURNING * INTO artifact;
    INSERT INTO public.studio_artifact_source_packages(id,artifact_id,org_id,workspace_id,version,source_mode,assess_handoff_id,assess_package_hash,
     studio_input_bundle_id,studio_input_bundle_version_id,studio_input_bundle_version,studio_bundle_hash,lineage_classification,planning_only,
     route_policy_version,route_policy_snapshot,route_policy_hash,package_hash,candidate_manifest,candidate_manifest_hash,candidate_count,
     anchor_manifest,anchor_manifest_hash,anchor_count,created_by)
    VALUES(source_package_id,artifact.id,org,workspace,1,artifact.source_mode,upstream.id,upstream.package_hash,handoff.target_input_bundle_id,
     handoff.target_input_bundle_version_id,handoff.target_input_bundle_version,handoff.target_input_bundle_hash,handoff.lineage_classification,false,
     handoff.route_policy_version,handoff.route_policy_snapshot,handoff.route_policy_hash,handoff.target_package_hash,
     handoff.candidate_manifest,handoff.candidate_manifest_hash,handoff.candidate_count,
     handoff.anchor_manifest,handoff.anchor_manifest_hash,handoff.anchor_count,actor) RETURNING * INTO source_package;
   END IF;
$new$;
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN
    RAISE EXCEPTION 'STUDIO_HANDOFF_SUCCESSOR_BRANCH_PREDECESSOR_MISMATCH';
  END IF;
  definition:=replace(definition,previous,replacement);
  EXECUTE definition;
END
$studio_source_successor_commands$;

CREATE OR REPLACE FUNCTION public.studio_process_evidence_composite_content_safe(
  p_content jsonb,p_attempt uuid,p_parent_version uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  binding public.studio_generation_section_refreshes;
  attempt public.studio_artifact_generation_attempts;
  parent public.studio_artifact_versions;
  package public.studio_artifact_source_packages;
  prior public.studio_artifact_section_source_bindings;
  section jsonb;
  anchor jsonb;
  labels jsonb;
  current_section_key text;
  content_source_ids jsonb;
  submitted_selected_source_ids jsonb;
  submitted_covered_source_ids jsonb;
  required_source_ids jsonb;
BEGIN
  SELECT * INTO binding FROM public.studio_generation_section_refreshes WHERE attempt_id=p_attempt;
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts WHERE id=p_attempt;
  SELECT * INTO parent FROM public.studio_artifact_versions WHERE id=p_parent_version;
  IF parent.id IS NULL
     OR(p_attempt IS NOT NULL AND(binding.attempt_id IS NULL OR cardinality(binding.selected_section_ids)=0
       OR attempt.id IS NULL OR binding.parent_version_id IS DISTINCT FROM parent.id
       OR attempt.artifact_id IS DISTINCT FROM parent.artifact_id OR attempt.org_id IS DISTINCT FROM parent.org_id
       OR attempt.workspace_id IS DISTINCT FROM parent.workspace_id))
     OR p_content IS NULL OR jsonb_typeof(p_content)<>'object'
     OR pg_column_size(p_content)>1048576 OR p_content->>'contractVersion'<>'studio-artifact-2'
     OR NOT(p_content?&ARRAY['contractVersion','title','summary','sections','coverage'])
     OR(p_content-ARRAY['contractVersion','title','summary','sections','coverage'])<>'{}'::jsonb
     OR length(btrim(COALESCE(p_content->>'title',''))) NOT BETWEEN 1 AND 300
     OR length(COALESCE(p_content->>'summary',''))>5000
     OR jsonb_typeof(p_content->'sections')<>'array' OR jsonb_array_length(p_content->'sections') NOT BETWEEN 1 AND 100
     OR jsonb_typeof(p_content->'coverage')<>'object'
     OR NOT((p_content->'coverage')?&ARRAY['selectedSourceVersionIds','coveredSourceVersionIds','complete'])
     OR((p_content->'coverage')-ARRAY['selectedSourceVersionIds','coveredSourceVersionIds','complete'])<>'{}'::jsonb
     OR(p_content#>>'{coverage,complete}')::boolean IS DISTINCT FROM true
     OR jsonb_typeof(p_content#>'{coverage,selectedSourceVersionIds}')<>'array'
     OR jsonb_typeof(p_content#>'{coverage,coveredSourceVersionIds}')<>'array' THEN RETURN false;END IF;
  SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO content_source_ids
  FROM(SELECT DISTINCT item.value->>'sourceVersionId' source_id
    FROM jsonb_array_elements(p_content->'sections')section_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(section_item.value->'sourceAnchors')item(value))sources;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_content#>'{coverage,selectedSourceVersionIds}')item(value)
      WHERE jsonb_typeof(item.value)<>'string' OR(item.value#>>'{}')!~*'^[0-9a-f-]{36}$')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_content#>'{coverage,coveredSourceVersionIds}')item(value)
      WHERE jsonb_typeof(item.value)<>'string' OR(item.value#>>'{}')!~*'^[0-9a-f-]{36}$')
     OR(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_content#>'{coverage,selectedSourceVersionIds}'))
       <>jsonb_array_length(p_content#>'{coverage,selectedSourceVersionIds}')
     OR(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_content#>'{coverage,coveredSourceVersionIds}'))
       <>jsonb_array_length(p_content#>'{coverage,coveredSourceVersionIds}') THEN RETURN false;END IF;
  SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO submitted_selected_source_ids
  FROM(SELECT DISTINCT value source_id FROM jsonb_array_elements_text(p_content#>'{coverage,selectedSourceVersionIds}'))submitted;
  SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO submitted_covered_source_ids
  FROM(SELECT DISTINCT value source_id FROM jsonb_array_elements_text(p_content#>'{coverage,coveredSourceVersionIds}'))submitted;
  IF submitted_selected_source_ids IS DISTINCT FROM content_source_ids
     OR submitted_covered_source_ids IS DISTINCT FROM content_source_ids THEN RETURN false;END IF;
  IF p_attempt IS NULL THEN
    SELECT COALESCE(jsonb_agg(source_id ORDER BY source_id),'[]'::jsonb) INTO required_source_ids
    FROM(SELECT DISTINCT value source_id
      FROM jsonb_array_elements_text(parent.content#>'{coverage,selectedSourceVersionIds}')
      UNION
      SELECT DISTINCT value source_id
      FROM jsonb_array_elements_text(parent.content#>'{coverage,coveredSourceVersionIds}')
      UNION
      SELECT DISTINCT allowed.value->>'sourceVersionId' source_id
      FROM public.studio_artifact_source_packages bound
      CROSS JOIN LATERAL jsonb_array_elements(bound.anchor_manifest)allowed(value)
      WHERE bound.id=parent.source_package_id AND bound.artifact_id=parent.artifact_id
        AND bound.org_id=parent.org_id AND bound.workspace_id=parent.workspace_id
        AND public.studio_pr_b_anchor_manifest_safe(bound.anchor_manifest)
        AND bound.anchor_manifest_hash=public.enterprise_sha256_jsonb(bound.anchor_manifest)
        AND bound.anchor_count=jsonb_array_length(bound.anchor_manifest))required
    WHERE source_id IS NOT NULL;
    IF required_source_ids IS DISTINCT FROM content_source_ids THEN RETURN false;END IF;
  END IF;
  FOR section IN SELECT value FROM jsonb_array_elements(p_content->'sections') LOOP
    current_section_key:=COALESCE(section->>'id',section->>'key');
    IF jsonb_typeof(section)<>'object' OR NOT(section?&ARRAY['id','title','body','sourceAnchors','labels'])
       OR(section-ARRAY['id','title','body','sourceAnchors','labels'])<>'{}'::jsonb
       OR COALESCE(current_section_key,'')!~'^[A-Za-z][A-Za-z0-9_.-]{0,79}$'
       OR length(btrim(COALESCE(section->>'title',''))) NOT BETWEEN 1 AND 300 OR length(COALESCE(section->>'body',''))>20000
       OR jsonb_typeof(section->'sourceAnchors')<>'array' OR jsonb_array_length(section->'sourceAnchors')>200
       OR jsonb_typeof(section->'labels')<>'array' OR jsonb_array_length(section->'labels')>3 THEN RETURN false;END IF;
    labels:=section->'labels';
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(labels)value WHERE value NOT IN('human_authored','template_required','assumption'))
       OR(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(labels))<>jsonb_array_length(labels)
       OR(jsonb_array_length(section->'sourceAnchors')=0 AND jsonb_array_length(labels)=0) THEN RETURN false;END IF;
    IF p_attempt IS NOT NULL AND current_section_key=ANY(binding.selected_section_ids) THEN
      SELECT * INTO package FROM public.studio_artifact_source_packages candidate
       WHERE candidate.id=attempt.source_package_id AND candidate.artifact_id=attempt.artifact_id
         AND candidate.org_id=attempt.org_id AND candidate.workspace_id=attempt.workspace_id;
    ELSE
      SELECT * INTO prior FROM public.studio_artifact_section_source_bindings retained
       WHERE retained.artifact_version_id=parent.id AND retained.section_id=current_section_key;
      SELECT * INTO package FROM public.studio_artifact_source_packages candidate
       WHERE candidate.id=COALESCE(prior.source_package_id,parent.source_package_id)
         AND candidate.artifact_id=COALESCE(attempt.artifact_id,parent.artifact_id)
         AND candidate.org_id=COALESCE(attempt.org_id,parent.org_id)
         AND candidate.workspace_id=COALESCE(attempt.workspace_id,parent.workspace_id);
    END IF;
    IF package.id IS NULL OR NOT public.studio_pr_b_anchor_manifest_safe(package.anchor_manifest)
       OR package.anchor_manifest_hash IS DISTINCT FROM public.enterprise_sha256_jsonb(package.anchor_manifest)
       OR package.anchor_count IS DISTINCT FROM jsonb_array_length(package.anchor_manifest) THEN RETURN false;END IF;
    FOR anchor IN SELECT value FROM jsonb_array_elements(section->'sourceAnchors') LOOP
      IF jsonb_typeof(anchor)<>'object' OR NOT(anchor?&ARRAY['sourceVersionId','locator','anchorHash'])
         OR(anchor-ARRAY['sourceVersionId','locator','anchorHash'])<>'{}'::jsonb
         OR COALESCE(anchor->>'sourceVersionId','')!~*'^[0-9a-f-]{36}$'
         OR length(btrim(COALESCE(anchor->>'locator',''))) NOT BETWEEN 1 AND 500
         OR COALESCE(anchor->>'anchorHash','')!~'^[0-9a-f]{64}$'
         OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(package.anchor_manifest)allowed
           WHERE allowed->>'sourceVersionId'=anchor->>'sourceVersionId' AND allowed->>'locator'=anchor->>'locator'
             AND allowed->>'anchorHash'=anchor->>'anchorHash') THEN RETURN false;END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END
$$;

DO $studio_composite_content_guard$
DECLARE definition text; previous text; replacement text;
BEGIN
  definition:=pg_get_functiondef('public.studio_pr_b_structured_artifact_content_safe(jsonb,public.studio_artifact_source_packages)'::regprocedure);
  previous:='^[a-z][a-z0-9_.-]{0,79}$';
  replacement:='^[A-Za-z][A-Za-z0-9_.-]{0,79}$';
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)=1 THEN
    EXECUTE replace(definition,previous,replacement);
  ELSIF (length(definition)-length(replace(definition,replacement,'')))/length(replacement)<>1 THEN
    RAISE EXCEPTION 'STUDIO_SECTION_KEY_GUARD_PREDECESSOR_MISMATCH';
  END IF;

  definition:=pg_get_functiondef('public.studio_pr_b_fill_artifact_version_binding()'::regprocedure);
  previous:=$old$IF NOT public.studio_pr_b_structured_artifact_content_safe(NEW.content,package) THEN
  RAISE EXCEPTION 'STUDIO_STRUCTURED_CONTENT_INVALID';
 END IF;$old$;
  replacement:=$new$IF NEW.generation_attempt_id IS NULL AND NEW.parent_version_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.studio_artifact_section_source_bindings retained
      WHERE retained.artifact_version_id=NEW.parent_version_id)
    AND NOT public.studio_process_evidence_composite_content_safe(NEW.content,NULL,NEW.parent_version_id) THEN
  RAISE EXCEPTION 'STUDIO_STRUCTURED_CONTENT_INVALID';
 ELSIF NOT public.studio_pr_b_structured_artifact_content_safe(NEW.content,package)
    AND NOT public.studio_process_evidence_composite_content_safe(NEW.content,NEW.generation_attempt_id,NEW.parent_version_id) THEN
  RAISE EXCEPTION 'STUDIO_STRUCTURED_CONTENT_INVALID';
 END IF;$new$;
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN
    RAISE EXCEPTION 'STUDIO_COMPOSITE_CONTENT_GUARD_PREDECESSOR_MISMATCH';
  END IF;
  EXECUTE replace(definition,previous,replacement);
END
$studio_composite_content_guard$;

REVOKE ALL ON FUNCTION public.studio_process_evidence_composite_content_safe(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
