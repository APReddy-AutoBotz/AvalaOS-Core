-- Stable requirement proposal roles survive allowed type edits.
-- Rollback/read-only fallback: disable requirement-bound publication writes.
-- Retain role bindings, publications, imported work and source lineage for audit.

ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 ADD COLUMN proposal_role text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.studio_delivery_work_item_requirement_bindings
 ALTER COLUMN proposal_role DROP DEFAULT,
 ADD CONSTRAINT studio_delivery_proposal_role_check
 CHECK(proposal_role IN('legacy','coordination','implementation','acceptance-review','verification')) NOT VALID;

CREATE FUNCTION public.studio_delivery_stable_proposal_origin(
 p_studio_artifact_id uuid,p_proposal_role text,p_requirement_links jsonb
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE historical_type text;
BEGIN
 historical_type:=CASE p_proposal_role
  WHEN 'coordination' THEN 'Epic'
  WHEN 'implementation' THEN 'Story'
  WHEN 'acceptance-review' THEN 'Task'
  WHEN 'verification' THEN 'Task'
  ELSE NULL END;
 IF historical_type IS NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_PROPOSAL_ROLE'; END IF;
 RETURN public.studio_delivery_proposal_origin(p_studio_artifact_id,historical_type,p_requirement_links);
END
$$;

DO $stable_proposal_role$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=pg_get_functiondef('public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure);

 old:=$old$ARRAY['type','title','description','acceptanceCriteria','requirementLinks'],
    ARRAY['type','title','description','acceptanceCriteria','requirementLinks'])$old$;
 replacement:=$new$ARRAY['proposalRole','type','title','description','acceptanceCriteria','requirementLinks'],
    ARRAY['type','title','description','acceptanceCriteria','requirementLinks'])$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_ROLE_KEYS_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$OR jsonb_typeof(item->'requirementLinks')<>'array'$old$;
 replacement:=$new$OR (result->>'outcome'<>'replayed' AND NOT item?'proposalRole')
   OR (item?'proposalRole' AND item->>'proposalRole' NOT IN('coordination','implementation','acceptance-review','verification'))
   OR jsonb_typeof(item->'requirementLinks')<>'array'$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_ROLE_VALIDATION_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$proposal_origin:=public.studio_delivery_proposal_origin(publication.studio_artifact_id,item->>'type',normalized_links);$old$;
 replacement:=$new$proposal_origin:=CASE WHEN item?'proposalRole'
    THEN public.studio_delivery_stable_proposal_origin(publication.studio_artifact_id,item->>'proposalRole',normalized_links)
    ELSE public.studio_delivery_proposal_origin(publication.studio_artifact_id,item->>'type',normalized_links) END;$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_ORIGIN_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$IF existing.proposal_origin_id IS DISTINCT FROM proposal_origin OR existing.requirement_links IS DISTINCT FROM normalized_links THEN$old$;
 replacement:=$new$IF existing.proposal_origin_id IS DISTINCT FROM proposal_origin
    OR existing.proposal_role IS DISTINCT FROM COALESCE(item->>'proposalRole','legacy')
    OR existing.requirement_links IS DISTINCT FROM normalized_links THEN$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_REPLAY_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$studio_artifact_version,source_item_index,proposal_origin_id,requirement_links)
   VALUES($old$;
 replacement:=$new$studio_artifact_version,source_item_index,proposal_origin_id,proposal_role,requirement_links)
   VALUES($new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_INSERT_COLUMNS_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$publication.studio_artifact_version_id,publication.studio_artifact_version,item_index,proposal_origin,normalized_links);$old$;
 replacement:=$new$publication.studio_artifact_version_id,publication.studio_artifact_version,item_index,proposal_origin,item->>'proposalRole',normalized_links);$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_INSERT_VALUES_PREDECESSOR_MISMATCH';
 END IF;
 EXECUTE replace(definition,old,replacement);
END
$stable_proposal_role$;

DO $proposal_role_lineage$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=pg_get_functiondef('public.legacy_delivery_bind_requirement_source()'::regprocedure);
 old:=$old$'proposalOriginId',binding.proposal_origin_id,'requirementLinks',binding.requirement_links,$old$;
 replacement:=$new$'proposalOriginId',binding.proposal_origin_id,'proposalRole',NULLIF(binding.proposal_role,'legacy'),
  'requirementLinks',binding.requirement_links,$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_LINEAGE_PREDECESSOR_MISMATCH';
 END IF;
 definition:=replace(definition,old,replacement);

 old:=$old$IF binding.id IS NULL THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
 NEW.source_lineage:=$old$;
 replacement:=$new$IF binding.id IS NULL THEN RAISE EXCEPTION 'LEGACY_DELIVERY_INVALID_COMMAND'; END IF;
 IF binding.proposal_role<>'legacy' AND EXISTS(
  SELECT 1 FROM public.delivery_work_items existing
  WHERE existing.org_id=NEW.org_id AND existing.workspace_id=NEW.workspace_id AND existing.project_id=NEW.project_id
   AND COALESCE(existing.source_lineage->>'proposalRole','legacy')='legacy'
   AND existing.source_lineage->>'proposalOriginId'=ANY(ARRAY[
    public.studio_delivery_proposal_origin(binding.studio_artifact_id,'Epic',binding.requirement_links),
    public.studio_delivery_proposal_origin(binding.studio_artifact_id,'Story',binding.requirement_links),
    public.studio_delivery_proposal_origin(binding.studio_artifact_id,'Task',binding.requirement_links)]))
 THEN RAISE EXCEPTION 'LEGACY_DELIVERY_DUPLICATE_IMPORT'; END IF;
 NEW.source_lineage:=$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_LEGACY_ALIAS_PREDECESSOR_MISMATCH';
 END IF;
 EXECUTE replace(definition,old,replacement);
END
$proposal_role_lineage$;

DO $proposal_role_projection$
DECLARE definition text;old text;replacement text;
BEGIN
 definition:=pg_get_functiondef('public.legacy_delivery_task_projection(public.delivery_work_items)'::regprocedure);
 old:=$old$'sourceEpicTitle',p_item.source_epic_title,'proposalOriginId',p_item.source_lineage->>'proposalOriginId',$old$;
 replacement:=$new$'sourceEpicTitle',p_item.source_epic_title,'proposalOriginId',p_item.source_lineage->>'proposalOriginId',
   'proposalRole',p_item.source_lineage->>'proposalRole',$new$;
 IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'STABLE_PROPOSAL_PROJECTION_PREDECESSOR_MISMATCH';
 END IF;
 EXECUTE replace(definition,old,replacement);
END
$proposal_role_projection$;

REVOKE ALL ON FUNCTION public.studio_delivery_stable_proposal_origin(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON COLUMN public.studio_delivery_work_item_requirement_bindings.proposal_role IS
 'Immutable generated proposal purpose. Mutable Delivery type is excluded from identity.';

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261103104435';
  new_tip text:='20261103170101';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261103170101'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261103170101');
END
$process_evidence_identity_forward$;
