-- Forward-only correction for the installed synthetic-admin roster projection.
-- PostgreSQL resolves a PL/pgSQL record named `binding` and a SQL join alias
-- named `binding` ambiguously. Preserve behavior while giving each scope a
-- distinct identifier.

BEGIN;

DO $scoped_studio_role_lookup_preflight$
DECLARE definition text;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key='avalaos-core'
      AND environment_class='hosted_nonproduction_pilot'
      AND schema_contract='hosted-pilot-2026-08'
      AND migration_tip='20261106012002'
      AND NOT production_authorized AND NOT customer_data_authorized
      AND NOT real_provider_calls_authorized
  ) OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_permits WHERE state='armed')
    OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
    OR EXISTS(SELECT 1 FROM public.ai_provider_configs WHERE status='active')
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_capability_routes WHERE enabled)
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_budget_reservations
      WHERE state IN('reserved','uncertain')
        OR studio_transfer_pending OR assess_mapping_transfer_pending)
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROLE_LOOKUP_PREFLIGHT'; END IF;

  SELECT replace(pg_get_functiondef(
    'public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT definition;
  IF (length(definition)-length(replace(definition,
      'binding public.synthetic_admin_studio_actor_role_bindings','')))
        /length('binding public.synthetic_admin_studio_actor_role_bindings')<>1
    OR (length(definition)-length(replace(definition,'FOR binding IN SELECT *','')))
        /length('FOR binding IN SELECT *')<>1
    OR (length(definition)-length(replace(definition,
      'LEFT JOIN public.synthetic_admin_studio_actor_role_bindings binding','')))
        /length('LEFT JOIN public.synthetic_admin_studio_actor_role_bindings binding')<>1
    OR position('binding_row public.synthetic_admin_studio_actor_role_bindings' in definition)<>0
    OR position('LEFT JOIN public.synthetic_admin_studio_actor_role_bindings role_binding' in definition)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROLE_LOOKUP_PREDECESSOR_MISMATCH'; END IF;
END
$scoped_studio_role_lookup_preflight$;

CREATE OR REPLACE FUNCTION public.synthetic_admin_list(
 p_actor uuid,p_org uuid,p_workspace uuid,p_version bigint,p_fingerprint text,p_cursor uuid,p_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 target public.synthetic_admin_targets;
 rows jsonb;
 cursor_id uuid;
 binding_row public.synthetic_admin_studio_actor_role_bindings;
BEGIN
 target:=public.synthetic_admin_assert_target(p_actor,p_org,p_workspace,p_version,p_fingerprint);
 IF p_limit IS NULL THEN p_limit:=20; END IF;
 IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_INVALID_REQUEST'; END IF;
 FOR binding_row IN SELECT * FROM public.synthetic_admin_studio_actor_role_bindings role_binding
   WHERE role_binding.target_id=target.id ORDER BY role_binding.account_id
 LOOP
   PERFORM public.synthetic_admin_validate_studio_actor_role_binding(
     binding_row.target_id,binding_row.account_id,binding_row.actor_id,binding_row.base_preset,
     binding_row.base_role_id,binding_row.variant,binding_row.variant_role_id,false
   );
 END LOOP;
 SELECT COALESCE(jsonb_agg(item.safe_row ORDER BY item.id),'[]'::jsonb),max(item.id::text)::uuid
 INTO rows,cursor_id FROM (
  SELECT account.id,jsonb_build_object(
    'reservationId',account.id,'label',account.label,'loginId',account.synthetic_email,
    'rolePreset',CASE WHEN member.role_id=role_binding.variant_role_id
      THEN role_binding.variant ELSE account.preset END,
    'baseRolePreset',account.preset,
    'studioVariant',role_binding.variant,
    'studioVariantActive',COALESCE(member.role_id=role_binding.variant_role_id,false),
    'assignableRolePresets',CASE WHEN role_binding.account_id IS NULL
      THEN jsonb_build_array('author','reviewer','approver','viewer')
      ELSE jsonb_build_array(role_binding.base_preset,role_binding.variant) END,
    'state',account.state,'version',account.version
  ) AS safe_row
  FROM public.synthetic_admin_accounts account
  LEFT JOIN public.synthetic_admin_studio_actor_role_bindings role_binding
    ON role_binding.target_id=account.target_id AND role_binding.account_id=account.id
  LEFT JOIN public.workspace_memberships member
    ON member.org_id=account.org_id AND member.workspace_id=account.workspace_id
      AND member.user_id=account.auth_user_id AND member.status='active'
      AND member.disabled_at IS NULL AND member.deleted_at IS NULL
  WHERE account.target_id=target.id AND account.org_id=p_org AND account.workspace_id=p_workspace
    AND (p_cursor IS NULL OR account.id>p_cursor)
  ORDER BY account.id LIMIT p_limit
 ) item;
 RETURN jsonb_build_object('status','listed','roster',rows,'nextCursor',cursor_id);
END
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)
TO service_role;

DO $scoped_studio_role_lookup_postcondition$
DECLARE definition text;
BEGIN
  SELECT replace(pg_get_functiondef(
    'public.synthetic_admin_list(uuid,uuid,uuid,bigint,text,uuid,integer)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT definition;
  IF (length(definition)-length(replace(definition,
      'binding_row public.synthetic_admin_studio_actor_role_bindings','')))
        /length('binding_row public.synthetic_admin_studio_actor_role_bindings')<>1
    OR (length(definition)-length(replace(definition,'FOR binding_row IN SELECT *','')))
        /length('FOR binding_row IN SELECT *')<>1
    OR (length(definition)-length(replace(definition,
      'LEFT JOIN public.synthetic_admin_studio_actor_role_bindings role_binding','')))
        /length('LEFT JOIN public.synthetic_admin_studio_actor_role_bindings role_binding')<>1
    OR position('binding public.synthetic_admin_studio_actor_role_bindings' in definition)<>0
    OR position('LEFT JOIN public.synthetic_admin_studio_actor_role_bindings binding' in definition)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROLE_LOOKUP_POSTCONDITION'; END IF;
END
$scoped_studio_role_lookup_postcondition$;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106012002';
  new_tip text:='20261106012003';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261106012003'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261106012003');
END
$process_evidence_identity_forward$;

COMMIT;
