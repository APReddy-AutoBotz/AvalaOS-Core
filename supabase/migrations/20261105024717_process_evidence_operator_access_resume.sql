-- Resume the retained, zero-use process-evidence permit after its required
-- cleanup. This is deliberately narrower than a general campaign renewal:
-- it preserves the original USD 4 / eight-effect / 1-2-5 limits and can run
-- only once, before any provider-effect debit exists.
CREATE TABLE public.process_evidence_provider_resume_windows(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.synthetic_ai_campaign_authorities(id) ON DELETE RESTRICT,
  resumed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authorization_version bigint NOT NULL CHECK(authorization_version>0),
  target_fingerprint text NOT NULL CHECK(target_fingerprint~'^sha256:[0-9a-f]{64}$'),
  project_ref text NOT NULL CHECK(project_ref~'^[a-z0-9]{20}$'),
  server_host text NOT NULL CHECK(server_host=project_ref||'.supabase.co'),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  provider_config_id uuid NOT NULL,
  key_ref_id uuid NOT NULL,
  assess_route_id uuid NOT NULL,
  studio_route_id uuid NOT NULL,
  assess_actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  studio_actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  previous_commit text NOT NULL CHECK(previous_commit~'^[0-9a-f]{40}$'),
  resumed_commit text NOT NULL CHECK(resumed_commit~'^[0-9a-f]{40}$'),
  binding_digest text NOT NULL UNIQUE CHECK(binding_digest~'^sha256:[0-9a-f]{64}$'),
  campaign_cap_usd_nanos bigint NOT NULL CHECK(campaign_cap_usd_nanos=4000000000),
  maximum_effects smallint NOT NULL CHECK(maximum_effects=8),
  validation_effects smallint NOT NULL CHECK(validation_effects=1),
  extraction_effects smallint NOT NULL CHECK(extraction_effects=2),
  studio_effects smallint NOT NULL CHECK(studio_effects=5),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 hours'),
  CHECK(assess_actor_id<>resumed_by AND studio_actor_id<>resumed_by AND assess_actor_id<>studio_actor_id),
  FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(provider_config_id,org_id) REFERENCES public.ai_provider_configs(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(key_ref_id,org_id) REFERENCES public.ai_provider_key_refs(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(assess_route_id,org_id,workspace_id)
    REFERENCES public.enterprise_ai_capability_routes(id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(studio_route_id,org_id,workspace_id)
    REFERENCES public.enterprise_ai_capability_routes(id,org_id,workspace_id) ON DELETE RESTRICT
);

CREATE FUNCTION public.process_evidence_provider_resume_window_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_WINDOW_IMMUTABLE';
END $$;
REVOKE ALL ON FUNCTION public.process_evidence_provider_resume_window_immutable()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER process_evidence_provider_resume_window_immutable
BEFORE UPDATE OR DELETE ON public.process_evidence_provider_resume_windows
FOR EACH ROW EXECUTE FUNCTION public.process_evidence_provider_resume_window_immutable();

ALTER TABLE public.process_evidence_provider_resume_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_evidence_provider_resume_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.process_evidence_provider_resume_windows FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.process_evidence_provider_resume_windows TO service_role;

CREATE FUNCTION public.process_evidence_resume_provider_run(
  p_operator uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,
  p_target_fingerprint text,p_project_ref text,p_campaign uuid,p_secret_reference text,
  p_provider_config uuid,p_key_ref uuid,p_assess_route uuid,p_studio_route uuid,
  p_expires_at timestamptz,p_commit text,p_assess_actor uuid,p_studio_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  target public.synthetic_admin_targets;
  campaign public.synthetic_ai_campaign_authorities;
  provider_config public.ai_provider_configs;
  key_ref public.ai_provider_key_refs;
  assess_route public.enterprise_ai_capability_routes;
  studio_route public.enterprise_ai_capability_routes;
  enterprise_control public.enterprise_intelligence_runtime_control;
  studio_control public.studio_artifact_runtime_control;
  marker public.hosted_pilot_environment_identity;
  author_role uuid;
  request_host text;
  created_at_value timestamptz:=statement_timestamp();
  digest_value text;
  resume_window public.process_evidence_provider_resume_windows;
BEGIN
  IF p_campaign IS NULL OR p_provider_config IS NULL OR p_key_ref IS NULL
    OR p_assess_route IS NULL OR p_studio_route IS NULL OR p_assess_actor IS NULL OR p_studio_actor IS NULL
    OR p_commit IS NULL OR p_commit!~'^[0-9a-f]{40}$'
    OR p_expires_at IS NULL OR p_expires_at<=created_at_value OR p_expires_at>created_at_value+interval '2 hours'
    OR (SELECT count(DISTINCT actor_id) FROM unnest(ARRAY[p_operator,p_assess_actor,p_studio_actor]) actor_id)<>3
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_BINDING_INVALID'; END IF;

  PERFORM public.pr1b_assert_command_authority(
    p_operator,p_org,p_workspace,'org.admin',p_authorization_version
  );
  target:=public.synthetic_admin_assert_target(
    p_operator,p_org,p_workspace,p_authorization_version,p_target_fingerprint
  );
  request_host:=public.synthetic_ai_campaign_request_host();
  IF request_host IS DISTINCT FROM p_project_ref||'.supabase.co'
    OR target.org_id IS DISTINCT FROM p_org OR target.workspace_id IS DISTINCT FROM p_workspace
    OR target.operator_actor_id IS DISTINCT FROM p_operator OR NOT target.enabled OR NOT target.synthetic_only
    OR target.production_authorized OR target.customer_data_authorized OR target.real_provider_calls_authorized
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_NOT_AUTHORIZED'; END IF;

  SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity WHERE singleton FOR SHARE;
  SELECT * INTO STRICT enterprise_control FROM public.enterprise_intelligence_runtime_control WHERE singleton FOR SHARE;
  SELECT * INTO STRICT studio_control FROM public.studio_artifact_runtime_control WHERE singleton FOR SHARE;
  IF marker.product_key<>'avalaos-core' OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08' OR marker.migration_tip<>'20261105024717'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR enterprise_control.provider_enabled OR studio_control.provider_enabled
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_RUNTIME_NOT_OFF'; END IF;

  SELECT * INTO campaign FROM public.synthetic_ai_campaign_authorities authority
    WHERE authority.id=p_campaign AND authority.target_id=target.id
      AND authority.target_fingerprint=p_target_fingerprint AND authority.project_ref=p_project_ref
      AND authority.server_host=request_host AND authority.org_id=p_org AND authority.workspace_id=p_workspace
      AND authority.operator_actor_id=p_operator AND authority.provider_config_id=p_provider_config
      AND authority.key_ref_id=p_key_ref AND authority.assess_route_id=p_assess_route
      AND authority.studio_route_id=p_studio_route FOR UPDATE;
  IF campaign.id IS NULL OR campaign.enabled OR campaign.disabled_at IS NULL
    OR campaign.process_run_commit IS NULL OR campaign.process_run_assess_actor IS DISTINCT FROM p_assess_actor
    OR campaign.process_run_studio_actor IS DISTINCT FROM p_studio_actor
    OR campaign.provider<>'openai' OR campaign.endpoint<>'https://api.openai.com'
    OR campaign.model<>'gpt-4.1-mini-2025-04-14'
    OR campaign.allowed_operations IS DISTINCT FROM ARRAY['assess.evidence.extract','provider.validate','studio.document.generate']::text[]
    OR campaign.campaign_cap_usd_nanos<>4000000000 OR campaign.carried_usd_nanos<>0
    OR campaign.fixed_debit_usd_nanos<>471459200 OR campaign.max_input_tokens<>1047576
    OR campaign.max_output_tokens<>32768 OR campaign.input_price_usd_nanos<>400
    OR campaign.output_price_usd_nanos<>1600
    OR campaign.price_policy_version<>'openai-gpt-4.1-mini-2025-04-14-full-max-2026-09-17-v1'
    OR p_expires_at>campaign.created_at+interval '24 hours'
    OR EXISTS(SELECT 1 FROM public.process_evidence_provider_resume_windows prior WHERE prior.campaign_id=campaign.id)
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_NOT_AUTHORIZED'; END IF;

  IF (SELECT count(*) FROM public.synthetic_ai_campaign_authorities)<>1
    OR (SELECT count(*) FROM public.ai_provider_configs)<>1
    OR (SELECT count(*) FROM public.ai_provider_key_refs)<>1
    OR (SELECT count(*) FROM public.enterprise_ai_capability_routes)<>2
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=campaign.id)
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_budget_reservations reservation
      WHERE reservation.org_id=p_org AND reservation.workspace_id=p_workspace
        AND reservation.provider_config_id=p_provider_config
        AND (reservation.state IN('reserved','uncertain')
          OR reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending))
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_HISTORY_UNSAFE'; END IF;

  SELECT preset.role_id INTO STRICT author_role
    FROM public.synthetic_admin_preset_roles preset JOIN public.roles role ON role.id=preset.role_id
    WHERE preset.target_id=target.id AND preset.preset='author' AND role.org_id=p_org
      AND role.workspace_id=p_workspace AND role.scope='workspace' AND role.status='active';
  SELECT * INTO provider_config FROM public.ai_provider_configs config
    WHERE config.id=p_provider_config AND config.org_id=p_org AND config.provider='openai'
      AND config.key_ref_id=p_key_ref AND config.endpoint_url='https://api.openai.com'
      AND config.default_model='gpt-4.1-mini-2025-04-14'
      AND config.model_allowlist=ARRAY['gpt-4.1-mini-2025-04-14']::text[]
      AND config.allowed_modes=ARRAY['pilot']::text[]
      AND config.allowed_operations=ARRAY['generate_document','test_provider_connection']::text[]
      AND config.evidence_ref=campaign.local_carry_seal_digest
      AND config.budget_policy=jsonb_build_object('dailyRequests',20,'monthlyTokens',20500000)
      AND config.status='disabled' AND config.deleted_at IS NULL FOR UPDATE;
  SELECT * INTO key_ref FROM public.ai_provider_key_refs key_row
    WHERE key_row.id=p_key_ref AND key_row.org_id=p_org AND key_row.provider='openai'
      AND key_row.resolver_type='server_reference' AND key_row.secret_ref=p_secret_reference
      -- Bootstrap creates only the server-side reference. The controller must
      -- verify the external binding before resume; a stored backend ownership
      -- claim would mean this retained zero-use key has changed lifecycle.
      AND key_row.secret_backend_kind IS NULL
      AND key_row.status='pending_review' AND key_row.deleted_at IS NULL
      AND (key_row.expires_at IS NULL OR key_row.expires_at>created_at_value) FOR SHARE;
  SELECT * INTO assess_route FROM public.enterprise_ai_capability_routes route
    WHERE route.id=p_assess_route AND route.org_id=p_org AND route.workspace_id=p_workspace
      AND route.provider_config_id=p_provider_config AND route.capability='assess.evidence.extract'
      AND route.model='gpt-4.1-mini-2025-04-14' AND NOT route.enabled AND route.deleted_at IS NULL
      AND route.allowed_roles=ARRAY[author_role::text] FOR UPDATE;
  SELECT * INTO studio_route FROM public.enterprise_ai_capability_routes route
    WHERE route.id=p_studio_route AND route.org_id=p_org AND route.workspace_id=p_workspace
      AND route.provider_config_id=p_provider_config AND route.capability='studio.document.generate'
      AND route.model='gpt-4.1-mini-2025-04-14' AND NOT route.enabled AND route.deleted_at IS NULL
      AND route.allowed_roles=ARRAY[author_role::text] FOR UPDATE;
  IF provider_config.id IS NULL OR key_ref.id IS NULL OR assess_route.id IS NULL OR studio_route.id IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.workspace_memberships member
      WHERE member.org_id=p_org AND member.workspace_id=p_workspace
        AND member.user_id=p_assess_actor AND member.role_id=author_role AND member.status='active')
    OR NOT EXISTS(SELECT 1 FROM public.workspace_memberships member
      WHERE member.org_id=p_org AND member.workspace_id=p_workspace
        AND member.user_id=p_studio_actor AND member.role_id=author_role AND member.status='active')
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RESUME_BINDING_STALE'; END IF;

  digest_value:='sha256:'||encode(public.digest(convert_to(concat_ws('|',
    'process-evidence-resume-v1',campaign.id::text,p_target_fingerprint,p_project_ref,
    p_org::text,p_workspace::text,p_operator::text,p_authorization_version::text,
    p_provider_config::text,p_key_ref::text,p_assess_route::text,p_studio_route::text,
    p_assess_actor::text,p_studio_actor::text,campaign.process_run_commit,p_commit,
    created_at_value::text,p_expires_at::text),'UTF8'),'sha256'),'hex');
  INSERT INTO public.process_evidence_provider_resume_windows(
    campaign_id,resumed_by,authorization_version,target_fingerprint,project_ref,server_host,
    org_id,workspace_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,
    assess_actor_id,studio_actor_id,previous_commit,resumed_commit,binding_digest,
    campaign_cap_usd_nanos,maximum_effects,validation_effects,extraction_effects,studio_effects,expires_at
  ) VALUES(
    campaign.id,p_operator,p_authorization_version,p_target_fingerprint,p_project_ref,request_host,
    p_org,p_workspace,p_provider_config,p_key_ref,p_assess_route,p_studio_route,
    p_assess_actor,p_studio_actor,campaign.process_run_commit,p_commit,digest_value,
    4000000000,8,1,2,5,p_expires_at
  ) RETURNING * INTO resume_window;

  UPDATE public.ai_provider_configs SET status='active',updated_by=p_operator,updated_at=created_at_value
    WHERE id=provider_config.id;
  UPDATE public.enterprise_ai_capability_routes SET enabled=true,version=version+1,
    updated_by=p_operator,updated_at=created_at_value
    WHERE id IN(assess_route.id,studio_route.id);
  UPDATE public.synthetic_ai_campaign_authorities SET enabled=true,disabled_at=NULL,
    expires_at=p_expires_at,process_run_commit=p_commit WHERE id=campaign.id;

  RETURN jsonb_build_object('status','resumed','resumeWindowId',resume_window.id,
    'campaignId',campaign.id,'providerConfigId',provider_config.id,'keyRefId',key_ref.id,
    'assessRouteId',assess_route.id,'studioRouteId',studio_route.id,'commit',p_commit,
    'expiresAt',p_expires_at,'capUsdNanos',4000000000,'carriedUsdNanos',0,
    'maxCalls',8,'validation',1,'extractions',2,'studio',5,'bindingDigest',digest_value);
END $$;

REVOKE ALL ON FUNCTION public.process_evidence_resume_provider_run(
  uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_evidence_resume_provider_run(
  uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid
) TO service_role;

COMMENT ON FUNCTION public.process_evidence_resume_provider_run(
  uuid,uuid,uuid,bigint,text,text,uuid,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid
) IS 'Resumes the one retained zero-use process-evidence campaign under its original cumulative USD 4 and 1/2/5 operation limits. The controller separately verifies the server secret binding before invocation; no secret value enters PostgreSQL.';

-- Exact normal-role administration control for the dedicated provider operator.
ALTER TABLE public.synthetic_admin_commands
  DROP CONSTRAINT synthetic_admin_commands_operation_check,
  ADD CONSTRAINT synthetic_admin_commands_operation_check CHECK(operation IN(
    'assign_role','revoke','ban_claim','grant_operator_assess_read','remove_operator_assess_read'
  ));

CREATE OR REPLACE FUNCTION public.synthetic_admin_set_operator_assess_read(
 p_actor uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,p_fingerprint text,
 p_request_id uuid,p_key text,p_grant boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 target public.synthetic_admin_targets;
 operator_role public.roles;
 operation_name text;
 request_hash text;
 receipt public.synthetic_admin_commands;
 response jsonb;
 actual_version bigint;
 role_count integer;
BEGIN
 target:=public.synthetic_admin_assert_target(
   p_actor,p_org,p_workspace,p_authorization_version,p_fingerprint
 );
 IF p_request_id IS NULL OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9._:-]{8,200}$' OR p_grant IS NULL
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_INVALID_REQUEST'; END IF;
 operation_name:=CASE WHEN p_grant THEN 'grant_operator_assess_read' ELSE 'remove_operator_assess_read' END;
 request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
   'requestId',p_request_id,'operation',operation_name,'capability','assess.read'
 )::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.synthetic_admin_commands
 WHERE target_id=target.id AND actor_id=p_actor AND operation=operation_name AND idempotency_key=p_key
 FOR SHARE;
 IF receipt.id IS NOT NULL THEN
   IF receipt.request_hash<>request_hash THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN receipt.response;
 END IF;

 SELECT count(*) INTO role_count FROM public.organization_members member
 JOIN public.roles role ON role.id=member.role_id
 WHERE member.org_id=p_org AND member.user_id=p_actor AND member.status='active'
   AND member.deleted_at IS NULL AND role.org_id=p_org AND role.workspace_id IS NULL
   AND role.scope='organization' AND role.slug='exploratory-operator-admin'
   AND role.status='active' AND role.deleted_at IS NULL AND NOT role.is_system;
 IF role_count<>1 OR target.operator_actor_id<>p_actor
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED'; END IF;
 SELECT role.* INTO STRICT operator_role FROM public.organization_members member
 JOIN public.roles role ON role.id=member.role_id
 WHERE member.org_id=p_org AND member.user_id=p_actor AND member.status='active'
   AND member.deleted_at IS NULL AND role.org_id=p_org AND role.workspace_id IS NULL
   AND role.scope='organization' AND role.slug='exploratory-operator-admin'
   AND role.status='active' AND role.deleted_at IS NULL AND NOT role.is_system
 FOR UPDATE OF role;
 -- A capability on a role reaches every active assignee. Fail closed if this
 -- dedicated role has drifted onto any other organization or workspace member.
 IF EXISTS(
   SELECT 1 FROM public.organization_members member
   WHERE member.role_id=operator_role.id AND member.status='active'
     AND member.disabled_at IS NULL AND member.deleted_at IS NULL
     AND (member.org_id<>p_org OR member.user_id<>p_actor)
 ) OR EXISTS(
   SELECT 1 FROM public.workspace_memberships member
   WHERE member.role_id=operator_role.id AND member.status='active'
     AND member.disabled_at IS NULL AND member.deleted_at IS NULL
 ) THEN
   RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.capabilities WHERE capability_key='assess.read')
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_CAPABILITY_INVENTORY_INCOMPLETE'; END IF;

 IF p_grant THEN
   INSERT INTO public.role_capabilities(role_id,capability_key)
   VALUES(operator_role.id,'assess.read') ON CONFLICT DO NOTHING;
   UPDATE public.roles SET permissions=(
     SELECT COALESCE(jsonb_agg(item.value ORDER BY item.value),'[]'::jsonb)
     FROM (SELECT DISTINCT value FROM jsonb_array_elements_text(permissions||'["assess.read"]'::jsonb)) item
   ),updated_by=p_actor,updated_at=statement_timestamp()
   WHERE id=operator_role.id AND NOT permissions @> '["assess.read"]'::jsonb;
 ELSE
   DELETE FROM public.role_capabilities WHERE role_id=operator_role.id AND capability_key='assess.read';
   UPDATE public.roles SET permissions=(
     SELECT COALESCE(jsonb_agg(value ORDER BY value),'[]'::jsonb)
     FROM jsonb_array_elements_text(permissions) AS item(value) WHERE item.value<>'assess.read'
   ),updated_by=p_actor,updated_at=statement_timestamp()
   WHERE id=operator_role.id AND permissions @> '["assess.read"]'::jsonb;
 END IF;
 SELECT version INTO STRICT actual_version FROM public.authorization_versions
 WHERE org_id=p_org AND user_id=p_actor;
 response:=jsonb_build_object(
   'status',CASE WHEN p_grant THEN 'operator_access_granted' ELSE 'operator_access_removed' END,
   'version',actual_version
 );
 INSERT INTO public.synthetic_admin_commands(
   target_id,actor_id,operation,idempotency_key,request_id,request_hash,response
 ) VALUES(target.id,p_actor,operation_name,p_key,p_request_id,request_hash,response);
 INSERT INTO public.privileged_audit_events(
   org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata
 ) VALUES(
   p_org,p_workspace,p_actor,p_request_id,
   CASE WHEN p_grant THEN 'synthetic_admin.operator_access.grant' ELSE 'synthetic_admin.operator_access.remove' END,
   'role',operator_role.id,'succeeded',actual_version,
   jsonb_build_object('capability','assess.read','granted',p_grant)
 );
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.synthetic_admin_set_operator_assess_read(uuid,uuid,uuid,bigint,text,uuid,text,boolean)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_grant_operator_assess_read(
 p_actor uuid,p_org uuid,p_workspace uuid,p_version bigint,p_fingerprint text,p_request_id uuid,p_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.synthetic_admin_set_operator_assess_read(
   p_actor,p_org,p_workspace,p_version,p_fingerprint,p_request_id,p_key,true
 );
$$;
CREATE OR REPLACE FUNCTION public.synthetic_admin_remove_operator_assess_read(
 p_actor uuid,p_org uuid,p_workspace uuid,p_version bigint,p_fingerprint text,p_request_id uuid,p_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.synthetic_admin_set_operator_assess_read(
   p_actor,p_org,p_workspace,p_version,p_fingerprint,p_request_id,p_key,false
 );
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_grant_operator_assess_read(uuid,uuid,uuid,bigint,text,uuid,text)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.synthetic_admin_remove_operator_assess_read(uuid,uuid,uuid,bigint,text,uuid,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_admin_grant_operator_assess_read(uuid,uuid,uuid,bigint,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.synthetic_admin_remove_operator_assess_read(uuid,uuid,uuid,bigint,text,uuid,text) TO service_role;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261103170103';
  new_tip text:='20261105024717';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261105024717'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261105024717');
END
$process_evidence_identity_forward$;
