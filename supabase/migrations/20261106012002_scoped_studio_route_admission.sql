-- Bind the retained process-evidence Studio route to the exact prebound
-- Studio author without changing ordinary provider-route admission.
BEGIN;

DO $scoped_studio_route_preflight$
DECLARE
  assign_source text;
  open_source text;
  resume_source text;
  renewal_source text;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key='avalaos-core'
      AND environment_class='hosted_nonproduction_pilot'
      AND schema_contract='hosted-pilot-2026-08'
      AND migration_tip='20261106012001'
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
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_ADMISSION_PREFLIGHT'; END IF;

  SELECT replace(pg_get_functiondef(
    'public.synthetic_admin_assign_studio_variant(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT assign_source;
  IF position('PERFORM public.synthetic_admin_assert_studio_role_switch_safe(p_org,p_workspace);' in assign_source)=0
    OR position('desired_role:=CASE WHEN p_preset=binding.variant' in assign_source)=0
    OR position('process_evidence_rebind_studio_route' in assign_source)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_ASSIGN_PREDECESSOR_MISMATCH'; END IF;

  SELECT replace(pg_get_functiondef(
    'public.process_evidence_open_provider_run(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT open_source;
  IF position('PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND' in open_source)<>0
    OR position('FOREACH actor IN ARRAY ARRAY[p_assess_actor,p_studio_actor] LOOP' in open_source)=0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_OPEN_PREDECESSOR_MISMATCH'; END IF;

  SELECT replace(pg_get_functiondef(
    'public.process_evidence_resume_provider_run(uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT resume_source;
  SELECT replace(pg_get_functiondef(
    'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT renewal_source;
  IF position('marker.migration_tip<>''20261106012001''' in resume_source)=0
    OR position('marker.migration_tip<>''20261106012001''' in renewal_source)=0
    OR position('process_evidence_studio_actor_route_role' in resume_source)<>0
    OR position('process_evidence_studio_actor_route_role' in renewal_source)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_RENEWAL_PREDECESSOR_MISMATCH'; END IF;
END
$scoped_studio_route_preflight$;

CREATE FUNCTION public.process_evidence_studio_actor_route_role(
  p_target uuid,p_actor uuid,p_base_role uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  binding public.synthetic_admin_studio_actor_role_bindings;
  membership_role uuid;
BEGIN
  SELECT * INTO binding FROM public.synthetic_admin_studio_actor_role_bindings
  WHERE target_id=p_target AND actor_id=p_actor FOR SHARE;
  IF binding.actor_id IS NULL THEN RETURN p_base_role; END IF;
  IF binding.base_preset<>'author' OR binding.variant<>'studio-author'
    OR binding.base_role_id IS DISTINCT FROM p_base_role
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROLE_BINDING_STALE'; END IF;
  PERFORM public.synthetic_admin_validate_studio_actor_role_binding(
    binding.target_id,binding.account_id,binding.actor_id,binding.base_preset,
    binding.base_role_id,binding.variant,binding.variant_role_id,false
  );
  SELECT role_id INTO membership_role FROM public.workspace_memberships member
  JOIN public.synthetic_admin_targets target ON target.id=binding.target_id
    AND target.org_id=member.org_id AND target.workspace_id=member.workspace_id
  WHERE member.user_id=binding.actor_id AND member.status='active'
    AND member.disabled_at IS NULL AND member.deleted_at IS NULL FOR SHARE OF member;
  IF membership_role IS DISTINCT FROM binding.variant_role_id
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROLE_BINDING_STALE'; END IF;
  RETURN binding.variant_role_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE '%PROCESS_EVIDENCE_STUDIO_ROLE_BINDING_STALE%'
  THEN RAISE; END IF;
  RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROLE_BINDING_STALE';
END
$$;
REVOKE ALL ON FUNCTION public.process_evidence_studio_actor_route_role(uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.process_evidence_rebind_studio_route(
  p_target uuid,p_org uuid,p_workspace uuid,p_actor uuid,
  p_base_role uuid,p_variant_role uuid,p_current_role uuid,p_desired_role uuid,p_updated_by uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  campaign public.synthetic_ai_campaign_authorities;
  route public.enterprise_ai_capability_routes;
  campaign_count integer;
BEGIN
  SELECT count(*) INTO campaign_count FROM public.synthetic_ai_campaign_authorities authority
  WHERE authority.target_id=p_target AND authority.org_id=p_org AND authority.workspace_id=p_workspace
    AND authority.process_run_studio_actor=p_actor;
  IF campaign_count=0 THEN RETURN; END IF;
  IF campaign_count<>1 OR p_current_role NOT IN(p_base_role,p_variant_role)
    OR p_desired_role NOT IN(p_base_role,p_variant_role) OR p_current_role=p_desired_role
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROUTE_BINDING_STALE'; END IF;
  SELECT * INTO STRICT campaign FROM public.synthetic_ai_campaign_authorities authority
  WHERE authority.target_id=p_target AND authority.org_id=p_org AND authority.workspace_id=p_workspace
    AND authority.process_run_studio_actor=p_actor FOR UPDATE;
  SELECT * INTO route FROM public.enterprise_ai_capability_routes candidate
  WHERE candidate.id=campaign.studio_route_id AND candidate.org_id=p_org
    AND candidate.workspace_id=p_workspace FOR UPDATE;
  IF campaign.enabled OR campaign.disabled_at IS NULL OR route.id IS NULL OR route.enabled
    OR route.deleted_at IS NOT NULL OR route.provider_config_id<>campaign.provider_config_id
    OR route.capability<>'studio.document.generate' OR route.model<>campaign.model
    OR route.allowed_roles IS DISTINCT FROM ARRAY[p_current_role::text]
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROUTE_BINDING_STALE'; END IF;
  UPDATE public.enterprise_ai_capability_routes
  SET allowed_roles=ARRAY[p_desired_role::text],version=version+1,
    updated_by=p_updated_by,updated_at=statement_timestamp()
  WHERE id=route.id AND NOT enabled
    AND allowed_roles IS NOT DISTINCT FROM ARRAY[p_current_role::text];
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_STUDIO_ROUTE_BINDING_STALE'; END IF;
END
$$;
REVOKE ALL ON FUNCTION public.process_evidence_rebind_studio_route(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid
) FROM PUBLIC,anon,authenticated,service_role;

DO $scoped_studio_route_assign_forward$
DECLARE
  procedure_name regprocedure:=
    'public.synthetic_admin_assign_studio_variant(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)'::regprocedure;
  definition text;
  anchor text;
  replacement text;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  anchor:=' desired_role:=CASE WHEN p_preset=binding.variant'||chr(10)||
    '   THEN binding.variant_role_id ELSE binding.base_role_id END;'||chr(10);
  replacement:=anchor||
    ' PERFORM public.process_evidence_rebind_studio_route('||chr(10)||
    '   target.id,p_org,p_workspace,binding.actor_id,binding.base_role_id,'||chr(10)||
    '   binding.variant_role_id,CASE WHEN desired_role=binding.variant_role_id'||chr(10)||
    '     THEN binding.base_role_id ELSE binding.variant_role_id END,desired_role,p_actor'||chr(10)||
    ' );'||chr(10);
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    OR position('process_evidence_rebind_studio_route' in definition)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_ASSIGN_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,anchor,replacement);
END
$scoped_studio_route_assign_forward$;

-- A private Studio binding is provisioned only against an already retained,
-- disabled campaign route. A fresh campaign must therefore use the historical
-- unbound path; it cannot recreate a shared-author Studio route for a bound
-- actor and bypass the exclusive role.
DO $scoped_studio_route_open_forward$
DECLARE
  procedure_name regprocedure:=
    'public.process_evidence_open_provider_run(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure;
  definition text;
  anchor text:='  FOREACH actor IN ARRAY ARRAY[p_assess_actor,p_studio_actor] LOOP'||chr(10);
  replacement text;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  replacement:=
    '  IF EXISTS('||chr(10)||
    '    SELECT 1 FROM public.synthetic_admin_studio_actor_role_bindings binding'||chr(10)||
    '    JOIN public.synthetic_admin_targets target ON target.id=binding.target_id'||chr(10)||
    '    WHERE target.org_id=p_org AND target.workspace_id=p_workspace'||chr(10)||
    '      AND binding.actor_id=p_studio_actor'||chr(10)||
    '  ) THEN RAISE EXCEPTION ''PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND''; END IF;'||chr(10)||
    anchor;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    OR position('PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND' in definition)<>0
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_OPEN_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,anchor,replacement);
END
$scoped_studio_route_open_forward$;

DO $scoped_studio_route_renewal_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  declaration_anchor text:='  author_role uuid;'||chr(10);
  author_anchor text;
  studio_route_anchor text;
  studio_member_anchor text;
BEGIN
  FOREACH procedure_name IN ARRAY ARRAY[
    'public.process_evidence_resume_provider_run(uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure,
    'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure
  ] LOOP
    SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
    INTO STRICT definition;
    author_anchor:='  SELECT preset.role_id INTO STRICT author_role'||chr(10)||
      '    FROM public.synthetic_admin_preset_roles preset JOIN public.roles role ON role.id=preset.role_id'||chr(10)||
      '    WHERE preset.target_id=target.id AND preset.preset=''author'' AND role.org_id=p_org'||chr(10)||
      '      AND role.workspace_id=p_workspace AND role.scope=''workspace'' AND role.status=''active'';'||chr(10);
    studio_route_anchor:='  SELECT * INTO studio_route FROM public.enterprise_ai_capability_routes route'||chr(10)||
      '    WHERE route.id=p_studio_route AND route.org_id=p_org AND route.workspace_id=p_workspace'||chr(10)||
      '      AND route.provider_config_id=p_provider_config AND route.capability=''studio.document.generate'''||chr(10)||
      '      AND route.model=''gpt-4.1-mini-2025-04-14'' AND NOT route.enabled AND route.deleted_at IS NULL'||chr(10)||
      '      AND route.allowed_roles=ARRAY[author_role::text] FOR UPDATE;'||chr(10);
    studio_member_anchor:='        AND member.user_id=p_studio_actor AND member.role_id=author_role AND member.status=''active'')';
    IF (length(definition)-length(replace(definition,declaration_anchor,'')))/length(declaration_anchor)<>1
      OR (length(definition)-length(replace(definition,author_anchor,'')))/length(author_anchor)<>1
      OR (length(definition)-length(replace(definition,studio_route_anchor,'')))/length(studio_route_anchor)<>1
      OR (length(definition)-length(replace(definition,studio_member_anchor,'')))/length(studio_member_anchor)<>1
      OR position('process_evidence_studio_actor_route_role' in definition)<>0
    THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_RENEWAL_SOURCE_MISMATCH:%',procedure_name; END IF;
    definition:=replace(definition,declaration_anchor,
      declaration_anchor||'  studio_actor_role uuid;'||chr(10));
    definition:=replace(definition,author_anchor,author_anchor||
      '  studio_actor_role:=public.process_evidence_studio_actor_route_role('||chr(10)||
      '    target.id,p_studio_actor,author_role'||chr(10)||
      '  );'||chr(10));
    definition:=replace(definition,studio_route_anchor,replace(
      studio_route_anchor,'ARRAY[author_role::text]','ARRAY[studio_actor_role::text]'));
    definition:=replace(definition,studio_member_anchor,replace(
      studio_member_anchor,'member.role_id=author_role','member.role_id=studio_actor_role'));
    EXECUTE definition;
  END LOOP;
END
$scoped_studio_route_renewal_forward$;

DO $scoped_studio_route_postcondition$
DECLARE
  definition text;
  procedure_name regprocedure;
BEGIN
  SELECT replace(pg_get_functiondef(
    'public.process_evidence_open_provider_run(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT definition;
  IF (length(definition)-length(replace(definition,
      'PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND','')))
        /length('PROCESS_EVIDENCE_STUDIO_ACTOR_PREBOUND')<>1
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_OPEN_POSTCONDITION'; END IF;

  SELECT replace(pg_get_functiondef(
    'public.synthetic_admin_assign_studio_variant(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)'::regprocedure
  ),chr(13)||chr(10),chr(10)) INTO STRICT definition;
  IF (length(definition)-length(replace(definition,'process_evidence_rebind_studio_route','')))
      /length('process_evidence_rebind_studio_route')<>1
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_ASSIGN_POSTCONDITION'; END IF;
  FOREACH procedure_name IN ARRAY ARRAY[
    'public.process_evidence_resume_provider_run(uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)'::regprocedure,
    'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure
  ] LOOP
    SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
    INTO STRICT definition;
    IF (length(definition)-length(replace(definition,
      'process_evidence_studio_actor_route_role','')))
        /length('process_evidence_studio_actor_route_role')<>1
      OR position('route.allowed_roles=ARRAY[studio_actor_role::text]' in definition)=0
      OR position('member.user_id=p_assess_actor AND member.role_id=author_role' in definition)=0
      OR position('member.user_id=p_studio_actor AND member.role_id=studio_actor_role' in definition)=0
    THEN RAISE EXCEPTION 'SCOPED_STUDIO_ROUTE_RENEWAL_POSTCONDITION:%',procedure_name; END IF;
  END LOOP;
END
$scoped_studio_route_postcondition$;

-- Identity tail generated from the exact 12001 predecessor inventory.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106012001';
  new_tip text:='20261106012002';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261106012002'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261106012002');
END
$process_evidence_identity_forward$;

COMMIT;
