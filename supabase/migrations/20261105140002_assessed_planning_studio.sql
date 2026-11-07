-- Reviewed assessments may enter Studio for documentation and planning while
-- retaining assessed ancestry, actual confidence and unresolved questions.
-- This creates no Govern authority and leaves implementation-readiness
-- approvals byte-for-byte compatible.

DO $planning_studio_preflight$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='assess_v2_studio_handoffs'
    AND column_name='approval_purpose'
 ) THEN RAISE EXCEPTION 'ASSESSED_PLANNING_REVIEW_MIGRATION_REQUIRED';END IF;
 IF EXISTS(
  SELECT 1 FROM public.assess_v2_studio_handoffs
  WHERE approval_purpose='documentation_planning'
    AND(govern_resolution_id IS NOT NULL OR package->>'approvalPurpose' IS DISTINCT FROM 'documentation_planning')
 ) THEN RAISE EXCEPTION 'ASSESSED_PLANNING_HANDOFF_INVALID';END IF;
END
$planning_studio_preflight$;

-- Purpose is derived from the already-authoritative planning flag. Generated
-- columns preserve immutable installed rows without a history-rewriting UPDATE.
ALTER TABLE public.enterprise_module_handoffs
 ADD COLUMN approval_purpose text GENERATED ALWAYS AS(
  CASE WHEN planning_only THEN 'documentation_planning' ELSE 'implementation_readiness' END
 ) STORED,
 ADD CONSTRAINT enterprise_module_handoffs_approval_purpose_check
 CHECK(approval_purpose IN('implementation_readiness','documentation_planning'));

DO $drop_module_planning_check$
DECLARE constraint_name text;
BEGIN
 SELECT conname INTO constraint_name FROM pg_constraint
 WHERE conrelid='public.enterprise_module_handoffs'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) ILIKE '%NOT planning_only%' LIMIT 1;
 IF constraint_name IS NULL THEN RAISE EXCEPTION 'MODULE_PLANNING_CONSTRAINT_NOT_FOUND';END IF;
 EXECUTE format('ALTER TABLE public.enterprise_module_handoffs DROP CONSTRAINT %I',constraint_name);
END
$drop_module_planning_check$;
ALTER TABLE public.enterprise_module_handoffs
 ADD CONSTRAINT enterprise_module_handoffs_planning_purpose_check CHECK(
  (approval_purpose='implementation_readiness' AND NOT planning_only)
  OR(approval_purpose='documentation_planning' AND planning_only));

-- PostgreSQL presents a stored generated column as null to BEFORE UPDATE
-- triggers until generation is recomputed. Exclude only this derived field
-- from the established immutable-binding comparison; its source
-- `planning_only` remains immutable and the purpose CHECK above is fail closed.
CREATE OR REPLACE FUNCTION public.studio_pr_b_handoff_binding_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' OR(to_jsonb(NEW)-ARRAY['status','current_version','updated_at','approval_purpose'])
   IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','current_version','updated_at','approval_purpose']) THEN
  RAISE EXCEPTION 'STUDIO_IMMUTABLE';
 END IF;
 RETURN NEW;
END
$$;

-- These exact-binding checks are deferred to close the aggregate/package
-- cycle. Run them with their installed owner after the service-only command
-- returns, rather than with the caller role whose direct table access is
-- intentionally revoked. Their fixed search path and existing row-equality
-- checks remain unchanged.
ALTER FUNCTION public.studio_pr_b_validate_aggregate_package() SECURITY DEFINER;
ALTER FUNCTION public.studio_pr_b_validate_source_package() SECURITY DEFINER;

ALTER TABLE public.studio_artifact_aggregates
 ADD COLUMN approval_purpose text GENERATED ALWAYS AS(
  CASE WHEN source_mode IN('assess_handoff','assess_plus_transcript_bundle')
   THEN CASE WHEN planning_only THEN 'documentation_planning' ELSE 'implementation_readiness' END
   ELSE NULL END
 ) STORED,
 ADD CONSTRAINT studio_artifact_approval_purpose_check
 CHECK(approval_purpose IS NULL OR approval_purpose IN('implementation_readiness','documentation_planning'));

ALTER TABLE public.studio_artifact_source_packages
 ADD COLUMN approval_purpose text GENERATED ALWAYS AS(
  CASE WHEN source_mode IN('assess_handoff','assess_plus_transcript_bundle')
   THEN CASE WHEN planning_only THEN 'documentation_planning' ELSE 'implementation_readiness' END
   ELSE NULL END
 ) STORED,
 ADD CONSTRAINT studio_source_package_approval_purpose_check
 CHECK(approval_purpose IS NULL OR approval_purpose IN('implementation_readiness','documentation_planning'));

ALTER TABLE public.studio_artifact_approval_resolutions
 ADD COLUMN approval_purpose text,
 ADD CONSTRAINT studio_document_approval_purpose_check
 CHECK(approval_purpose IS NULL OR approval_purpose IN('implementation_readiness','documentation_planning'));
-- Historical approval rows stay byte-stable with a null additive field. New
-- approval rows are bound below to the exact artifact version's derived purpose.

ALTER TABLE public.studio_artifact_aggregates
 DROP CONSTRAINT studio_artifact_legacy_ancestry_union_check;
ALTER TABLE public.studio_artifact_aggregates
 ADD CONSTRAINT studio_artifact_ancestry_purpose_check CHECK(
  (source_mode IN('assess_handoff','assess_plus_transcript_bundle')
   AND case_id IS NOT NULL AND source_version_id IS NOT NULL AND source_case_version IS NOT NULL
   AND decision_id IS NOT NULL AND decision_version IS NOT NULL AND review_resolution_id IS NOT NULL
   AND handoff_id IS NOT NULL AND approval_purpose IS NOT NULL AND(
    (approval_purpose='implementation_readiness' AND govern_resolution_id IS NOT NULL AND NOT planning_only)
    OR(approval_purpose='documentation_planning' AND govern_resolution_id IS NULL AND planning_only)))
  OR(source_mode IN('direct_transcript_bundle','manual_brief')
   AND case_id IS NULL AND source_version_id IS NULL AND source_case_version IS NULL
   AND decision_id IS NULL AND decision_version IS NULL AND review_resolution_id IS NULL
   AND govern_resolution_id IS NULL AND handoff_id IS NULL AND approval_purpose IS NULL AND planning_only));

DO $drop_source_package_union$
DECLARE constraint_name text;
BEGIN
 SELECT conname INTO constraint_name FROM pg_constraint
 WHERE conrelid='public.studio_artifact_source_packages'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) ILIKE '%source_mode%assess_handoff%manual_brief_hash%lineage_classification%'
 LIMIT 1;
 IF constraint_name IS NULL THEN RAISE EXCEPTION 'SOURCE_PACKAGE_UNION_CONSTRAINT_NOT_FOUND';END IF;
 EXECUTE format('ALTER TABLE public.studio_artifact_source_packages DROP CONSTRAINT %I',constraint_name);
END
$drop_source_package_union$;
ALTER TABLE public.studio_artifact_source_packages
 ADD CONSTRAINT studio_source_package_purpose_union_check CHECK(
  (source_mode='assess_handoff' AND assess_handoff_id IS NOT NULL AND assess_package_hash~'^[0-9a-f]{64}$'
   AND studio_input_bundle_id IS NULL AND studio_input_bundle_version_id IS NULL AND studio_input_bundle_version IS NULL
   AND studio_bundle_hash IS NULL AND manual_brief_hash IS NULL AND lineage_classification='assessed'
   AND approval_purpose IS NOT NULL AND approval_purpose IN('implementation_readiness','documentation_planning')
   AND planning_only=(approval_purpose='documentation_planning'))
  OR(source_mode='assess_plus_transcript_bundle' AND assess_handoff_id IS NOT NULL AND assess_package_hash~'^[0-9a-f]{64}$'
   AND studio_input_bundle_id IS NOT NULL AND studio_input_bundle_version_id IS NOT NULL
   AND studio_input_bundle_version>0 AND studio_bundle_hash~'^[0-9a-f]{64}$' AND manual_brief_hash IS NULL
   AND lineage_classification='mixed' AND approval_purpose IS NOT NULL
   AND approval_purpose IN('implementation_readiness','documentation_planning')
   AND planning_only=(approval_purpose='documentation_planning'))
  OR(source_mode='direct_transcript_bundle' AND assess_handoff_id IS NULL AND assess_package_hash IS NULL
   AND studio_input_bundle_id IS NOT NULL AND studio_input_bundle_version_id IS NOT NULL
   AND studio_input_bundle_version>0 AND studio_bundle_hash~'^[0-9a-f]{64}$' AND manual_brief_hash IS NULL
   AND lineage_classification='not_assessed' AND approval_purpose IS NULL AND planning_only)
  OR(source_mode='manual_brief' AND assess_handoff_id IS NULL AND assess_package_hash IS NULL
   AND studio_input_bundle_id IS NULL AND studio_input_bundle_version_id IS NULL AND studio_input_bundle_version IS NULL
   AND studio_bundle_hash IS NULL AND manual_brief_hash~'^[0-9a-f]{64}$'
   AND lineage_classification='not_assessed' AND approval_purpose IS NULL AND planning_only));

CREATE OR REPLACE FUNCTION public.studio_assessed_planning_module_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE upstream public.assess_v2_studio_handoffs;
BEGIN
 SELECT * INTO upstream FROM public.assess_v2_studio_handoffs
 WHERE id=NEW.upstream_handoff_id AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id;
 IF upstream.id IS NULL THEN RAISE EXCEPTION 'SOURCE_PACKAGE_STALE';END IF;
 NEW.planning_only:=upstream.approval_purpose='documentation_planning';
 RETURN NEW;
END
$$;
CREATE TRIGGER studio_assessed_planning_module_binding
BEFORE INSERT OR UPDATE OF upstream_handoff_id ON public.enterprise_module_handoffs
FOR EACH ROW EXECUTE FUNCTION public.studio_assessed_planning_module_binding();

CREATE OR REPLACE FUNCTION public.studio_assessed_planning_artifact_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE upstream public.assess_v2_studio_handoffs;
BEGIN
 IF NEW.handoff_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO upstream FROM public.assess_v2_studio_handoffs
 WHERE id=NEW.handoff_id AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id;
 IF upstream.id IS NULL THEN RAISE EXCEPTION 'SOURCE_PACKAGE_STALE';END IF;
 NEW.planning_only:=upstream.approval_purpose='documentation_planning';
 RETURN NEW;
END
$$;
CREATE TRIGGER studio_assessed_planning_artifact_binding
BEFORE INSERT OR UPDATE OF handoff_id ON public.studio_artifact_aggregates
FOR EACH ROW EXECUTE FUNCTION public.studio_assessed_planning_artifact_binding();

CREATE OR REPLACE FUNCTION public.studio_assessed_planning_package_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE upstream public.assess_v2_studio_handoffs;
BEGIN
 IF NEW.assess_handoff_id IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO upstream FROM public.assess_v2_studio_handoffs
 WHERE id=NEW.assess_handoff_id AND org_id=NEW.org_id AND workspace_id=NEW.workspace_id;
 IF upstream.id IS NULL OR upstream.package_hash IS DISTINCT FROM NEW.assess_package_hash THEN
  RAISE EXCEPTION 'SOURCE_PACKAGE_STALE';
 END IF;
 NEW.planning_only:=upstream.approval_purpose='documentation_planning';
 RETURN NEW;
END
$$;
CREATE TRIGGER studio_assessed_planning_package_binding
BEFORE INSERT ON public.studio_artifact_source_packages
FOR EACH ROW EXECUTE FUNCTION public.studio_assessed_planning_package_binding();

CREATE OR REPLACE FUNCTION public.studio_document_approval_purpose_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE purpose text;
BEGIN
 SELECT artifact.approval_purpose INTO purpose
 FROM public.studio_artifact_versions version
 JOIN public.studio_artifact_aggregates artifact ON artifact.id=version.artifact_id
  AND artifact.org_id=version.org_id AND artifact.workspace_id=version.workspace_id
 WHERE version.id=NEW.artifact_version_id AND version.artifact_id=NEW.artifact_id
  AND version.org_id=NEW.org_id AND version.workspace_id=NEW.workspace_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_AVAILABLE';END IF;
 NEW.approval_purpose:=purpose;
 RETURN NEW;
END
$$;
CREATE TRIGGER studio_document_approval_purpose_binding
BEFORE INSERT ON public.studio_artifact_approval_resolutions
FOR EACH ROW EXECUTE FUNCTION public.studio_document_approval_purpose_binding();

-- The current module-handoff path is the only normal assessed Studio intake.
-- Keep its exact currentness/independent-review machinery and extend its
-- document selector to the canonical SDD type; the older accepted-handoff
-- compatibility generator remains Govern-only.
ALTER TABLE public.enterprise_module_handoffs
 DROP CONSTRAINT enterprise_module_handoffs_artifact_type_check,
 ADD CONSTRAINT enterprise_module_handoffs_artifact_type_check
 CHECK(artifact_type IN('brd','frd','pdd','sdd'));

DO $planning_studio_sdd_support$
DECLARE fn regprocedure;definition text;prior text;replacement text;matches integer;
BEGIN
 fn:='public.enterprise_assess_studio_handoff_projection(uuid,uuid)'::regprocedure;
 SELECT replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10)) INTO STRICT definition;
 prior:='jsonb_build_array(''brd'',''frd'',''pdd'')';replacement:='jsonb_build_array(''brd'',''frd'',''pdd'',''sdd'')';
 matches:=(length(definition)-length(replace(definition,prior,'')))/length(prior);
 IF matches<>1 THEN RAISE EXCEPTION 'STUDIO_HANDOFF_SDD_PROJECTION_SOURCE_MISMATCH:%',matches;END IF;
 EXECUTE replace(definition,prior,replacement);
END
$planning_studio_sdd_support$;

-- One reviewed assessment may source one current document of each canonical
-- type. Preserve replay/duplicate protection per upstream+type while allowing
-- the ordinary sequential BRD/PDD/FRD/SDD journey from the same assessment.
DO $planning_studio_multi_document$
DECLARE fn regprocedure;definition text;prior text;replacement text;matches integer;
BEGIN
 fn:='public.enterprise_assess_studio_handoff_command(jsonb)'::regprocedure;
 SELECT replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10)) INTO STRICT definition;
 prior:=$prior$  IF EXISTS(SELECT 1 FROM public.studio_artifact_aggregates existing WHERE existing.org_id=org AND existing.workspace_id=workspace AND existing.handoff_id=upstream.id) THEN
   RAISE EXCEPTION 'HANDOFF_ALREADY_CONSUMED_LEGACY';
  END IF;$prior$;
 replacement:=$replacement$  IF EXISTS(SELECT 1 FROM public.studio_artifact_aggregates existing
    WHERE existing.org_id=org AND existing.workspace_id=workspace AND existing.handoff_id=upstream.id
      AND existing.artifact_type=payload->>'artifactType')
   OR EXISTS(SELECT 1 FROM public.enterprise_module_handoffs existing
    WHERE existing.org_id=org AND existing.workspace_id=workspace AND existing.upstream_handoff_id=upstream.id
      AND existing.artifact_type=payload->>'artifactType') THEN
   RAISE EXCEPTION 'HANDOFF_ALREADY_CONSUMED_LEGACY';
  END IF;$replacement$;
 matches:=(length(definition)-length(replace(definition,prior,'')))/length(prior);
 IF matches<>1 THEN RAISE EXCEPTION 'STUDIO_MULTI_DOCUMENT_COMMAND_SOURCE_MISMATCH:%',matches;END IF;
 EXECUTE replace(definition,prior,replacement);

 fn:='public.enterprise_assess_studio_handoff_projection(uuid,uuid)'::regprocedure;
 SELECT replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10)) INTO STRICT definition;
 prior:=$prior$'artifactTypes',jsonb_build_array('brd','frd','pdd','sdd'),'actions'$prior$;
 replacement:=$replacement$'artifactTypes',(SELECT COALESCE(jsonb_agg(available.artifact_type ORDER BY available.artifact_type),'[]'::jsonb)
    FROM unnest(ARRAY['brd','frd','pdd','sdd']::text[]) available(artifact_type)
    WHERE NOT EXISTS(SELECT 1 FROM public.enterprise_module_handoffs existing
      WHERE existing.org_id=upstream.org_id AND existing.workspace_id=upstream.workspace_id
        AND existing.upstream_handoff_id=upstream.id AND existing.artifact_type=available.artifact_type)
      AND NOT EXISTS(SELECT 1 FROM public.studio_artifact_aggregates existing_artifact
       WHERE existing_artifact.org_id=upstream.org_id AND existing_artifact.workspace_id=upstream.workspace_id
        AND existing_artifact.handoff_id=upstream.id AND existing_artifact.artifact_type=available.artifact_type)),
   'actions'$replacement$;
 matches:=(length(definition)-length(replace(definition,prior,'')))/length(prior);
 IF matches<>1 THEN RAISE EXCEPTION 'STUDIO_MULTI_DOCUMENT_PROJECTION_TYPES_SOURCE_MISMATCH:%',matches;END IF;
 definition:=replace(definition,prior,replacement);
 prior:=$prior$  AND NOT EXISTS(SELECT 1 FROM public.enterprise_module_handoffs existing WHERE existing.org_id=p_org AND existing.workspace_id=p_workspace AND existing.upstream_handoff_id=upstream.id)
  AND public.studio_pr_b_upstream_handoff_is_current(upstream.id,p_org,p_workspace)
  AND NOT EXISTS(SELECT 1 FROM public.studio_artifact_aggregates legacy WHERE legacy.org_id=p_org AND legacy.workspace_id=p_workspace AND legacy.handoff_id=upstream.id);$prior$;
 replacement:=$replacement$  AND public.studio_pr_b_upstream_handoff_is_current(upstream.id,p_org,p_workspace)
  AND EXISTS(SELECT 1 FROM unnest(ARRAY['brd','frd','pdd','sdd']::text[]) available(artifact_type)
   WHERE NOT EXISTS(SELECT 1 FROM public.enterprise_module_handoffs existing
    WHERE existing.org_id=p_org AND existing.workspace_id=p_workspace AND existing.upstream_handoff_id=upstream.id
      AND existing.artifact_type=available.artifact_type)
    AND NOT EXISTS(SELECT 1 FROM public.studio_artifact_aggregates existing_artifact
     WHERE existing_artifact.org_id=p_org AND existing_artifact.workspace_id=p_workspace
      AND existing_artifact.handoff_id=upstream.id AND existing_artifact.artifact_type=available.artifact_type));$replacement$;
 matches:=(length(definition)-length(replace(definition,prior,'')))/length(prior);
 IF matches<>1 THEN RAISE EXCEPTION 'STUDIO_MULTI_DOCUMENT_PROJECTION_FILTER_SOURCE_MISMATCH:%',matches;END IF;
 EXECUTE replace(definition,prior,replacement);
END
$planning_studio_multi_document$;

-- Existing exact projections retain their shape. Only the planning label is
-- extended so assessed planning is never decoded as a manual/not-assessed path.
DO $planning_studio_projection_patch$
DECLARE fn regprocedure;definition text;prior text;replacement text;matches integer;
BEGIN
 fn:='public.studio_artifact_projection_v2(uuid,uuid,uuid)'::regprocedure;
 SELECT replace(pg_get_functiondef(fn),chr(13)||chr(10),chr(10)) INTO STRICT definition;
 prior:='CASE WHEN package.planning_only THEN ''planning_only'' ELSE ''governed_assessed'' END';
 replacement:='CASE WHEN package.approval_purpose=''documentation_planning'' THEN ''reviewed_planning'' WHEN package.planning_only THEN ''planning_only'' ELSE ''governed_assessed'' END';
 matches:=(length(definition)-length(replace(definition,prior,'')))/length(prior);
 IF matches<>3 THEN RAISE EXCEPTION 'STUDIO_PROJECTION_SOURCE_MISMATCH:%',matches;END IF;
 EXECUTE replace(definition,prior,replacement);
END
$planning_studio_projection_patch$;

-- Recheck every retained row before making the new purpose contract live.
DO $planning_studio_postflight$
BEGIN
 IF EXISTS(
  SELECT 1 FROM public.studio_artifact_aggregates artifact
  JOIN public.studio_artifact_source_packages package
   ON package.id=artifact.source_package_id AND package.artifact_id=artifact.id
  WHERE artifact.approval_purpose IS DISTINCT FROM package.approval_purpose
    OR artifact.planning_only IS DISTINCT FROM package.planning_only
 ) OR EXISTS(
  SELECT 1 FROM public.studio_artifact_approval_resolutions approval
  JOIN public.studio_artifact_versions version ON version.id=approval.artifact_version_id
  JOIN public.studio_artifact_aggregates artifact ON artifact.id=version.artifact_id
  WHERE approval.approval_purpose IS NOT NULL
   AND approval.approval_purpose IS DISTINCT FROM artifact.approval_purpose
 ) THEN RAISE EXCEPTION 'ASSESSED_PLANNING_STUDIO_RECONCILIATION_FAILED';END IF;
END
$planning_studio_postflight$;

DO $process_evidence_identity_forward$
DECLARE procedure_name regprocedure;definition text;old_tip text:='20261105140001';new_tip text:='20261105140002';old_count integer;new_count integer;
BEGIN
 LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity WHERE singleton AND product_key='avalaos-core'
  AND environment_class='hosted_nonproduction_pilot' AND schema_contract='hosted-pilot-2026-08' AND migration_tip=old_tip
  AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized)
  OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active') THEN
  RAISE EXCEPTION 'PROCESS_EVIDENCE_IDENTITY_PRECONDITION';
 END IF;
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
  '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103',
  '20261105024717','20261105041249','20261105110657','20261105140001','20261105140002'));
 ALTER TABLE public.authenticated_synthetic_exercises DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
 ALTER TABLE public.authenticated_synthetic_exercises ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip IN(
  '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103',
  '20261105024717','20261105041249','20261105110657','20261105140001','20261105140002'));
 ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
 UPDATE public.hosted_pilot_environment_identity SET migration_tip='20261105140002' WHERE singleton;
 ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='20261105140002');
END
$process_evidence_identity_forward$;

