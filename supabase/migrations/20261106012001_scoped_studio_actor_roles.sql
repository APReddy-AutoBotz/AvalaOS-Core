-- Dedicated, prebound Studio actor roles for the retained nonproduction journey.
-- The shared synthetic-admin presets remain unchanged. Only the table owner may
-- provision bindings; normal role assignment continues through service-only RPCs.

BEGIN;

DO $scoped_studio_role_preflight$
DECLARE
  assign_source text;
  command_constraint text;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key='avalaos-core'
      AND environment_class='hosted_nonproduction_pilot'
      AND schema_contract='hosted-pilot-2026-08'
      AND migration_tip='20261105140004'
      AND NOT production_authorized AND NOT customer_data_authorized
      AND NOT real_provider_calls_authorized
  ) OR EXISTS(
    SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active'
  ) OR EXISTS(
    SELECT 1 FROM public.authenticated_synthetic_permits WHERE state='armed'
  ) OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
    OR EXISTS(SELECT 1 FROM public.ai_provider_configs WHERE status='active')
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_capability_routes WHERE enabled)
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
    OR EXISTS(
      SELECT 1 FROM public.enterprise_ai_budget_reservations
      WHERE state IN('reserved','uncertain')
        OR studio_transfer_pending OR assess_mapping_transfer_pending
    )
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ACTOR_ROLE_PREFLIGHT'; END IF;

  IF to_regclass('public.synthetic_admin_studio_actor_role_bindings') IS NOT NULL
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ACTOR_ROLE_ALREADY_INSTALLED'; END IF;
  SELECT pg_get_functiondef(
    'public.synthetic_admin_assign_role(uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text)'::regprocedure
  ) INTO STRICT assign_source;
  IF assign_source NOT LIKE '%operation=''assign_role''%'
    OR assign_source LIKE '%synthetic_admin_studio_actor_role_bindings%'
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ACTOR_ROLE_PREDECESSOR_MISMATCH'; END IF;
  SELECT pg_get_constraintdef(oid) INTO STRICT command_constraint
  FROM pg_constraint
  WHERE conrelid='public.synthetic_admin_commands'::regclass
    AND conname='synthetic_admin_commands_operation_check';
  IF command_constraint NOT LIKE '%assign_role%'
    OR command_constraint LIKE '%assign_studio_variant%'
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ACTOR_ROLE_COMMAND_CONTRACT_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.capabilities WHERE capability_key=ANY(ARRAY[
    'studio.handoffs.read','studio.handoffs.request','studio.handoffs.consume',
    'studio.templates.read','studio.artifacts.rendition.generate','studio.artifacts.download',
    'studio.handoffs.review','studio.handoffs.approve'
  ]::text[]))<>8
  THEN RAISE EXCEPTION 'SCOPED_STUDIO_ACTOR_ROLE_CAPABILITY_INVENTORY'; END IF;
END
$scoped_studio_role_preflight$;

CREATE TABLE public.synthetic_admin_studio_actor_role_bindings(
  target_id uuid NOT NULL REFERENCES public.synthetic_admin_targets(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.synthetic_admin_accounts(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  base_preset text NOT NULL CHECK(base_preset IN('author','reviewer','approver')),
  base_role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  variant text NOT NULL CHECK(variant IN('studio-author','studio-reviewer','studio-approver')),
  variant_role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  configured_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  configured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY(target_id,account_id),
  UNIQUE(target_id,actor_id),
  UNIQUE(target_id,base_role_id),
  UNIQUE(target_id,variant),
  UNIQUE(variant_role_id),
  CHECK(base_role_id<>variant_role_id),
  CHECK((base_preset,variant) IN(
    ('author','studio-author'),('reviewer','studio-reviewer'),('approver','studio-approver')
  ))
);
ALTER TABLE public.synthetic_admin_studio_actor_role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_admin_studio_actor_role_bindings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.synthetic_admin_studio_actor_role_bindings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.synthetic_admin_studio_actor_role_bindings TO service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_studio_variant_increment(p_variant text)
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE p_variant
  WHEN 'studio-author' THEN ARRAY[
    'studio.handoffs.read','studio.handoffs.request','studio.handoffs.consume',
    'studio.templates.read','studio.artifacts.rendition.generate','studio.artifacts.download'
  ]::text[]
  WHEN 'studio-reviewer' THEN ARRAY['studio.handoffs.read','studio.handoffs.review']::text[]
  WHEN 'studio-approver' THEN ARRAY['studio.handoffs.read','studio.handoffs.approve']::text[]
  ELSE '{}'::text[] END;
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_studio_variant_increment(text)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_validate_studio_actor_role_binding(
  p_target uuid,p_account uuid,p_actor uuid,p_base_preset text,p_base_role uuid,
  p_variant text,p_variant_role uuid,p_require_base boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  target public.synthetic_admin_targets;
  account public.synthetic_admin_accounts;
  base_role public.roles;
  variant_role public.roles;
  preset_role uuid;
  membership_role uuid;
  increments text[];
  base_capabilities text[];
  variant_capabilities text[];
  expected_capabilities text[];
  base_permissions text[];
  variant_permissions text[];
  membership_count integer;
BEGIN
  IF p_target IS NULL OR p_account IS NULL OR p_actor IS NULL OR p_base_role IS NULL
    OR p_variant_role IS NULL OR p_require_base IS NULL
    OR (p_base_preset,p_variant) NOT IN(
      ('author','studio-author'),('reviewer','studio-reviewer'),('approver','studio-approver')
    )
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;

  SELECT * INTO target FROM public.synthetic_admin_targets WHERE id=p_target FOR SHARE;
  SELECT * INTO account FROM public.synthetic_admin_accounts WHERE id=p_account FOR SHARE;
  SELECT role_id INTO preset_role FROM public.synthetic_admin_preset_roles
    WHERE target_id=p_target AND preset=p_base_preset FOR SHARE;
  SELECT * INTO base_role FROM public.roles WHERE id=p_base_role FOR SHARE;
  SELECT * INTO variant_role FROM public.roles WHERE id=p_variant_role FOR SHARE;
  SELECT count(*)::integer,(array_agg(role_id))[1] INTO membership_count,membership_role
  FROM public.workspace_memberships
    WHERE org_id=target.org_id AND workspace_id=target.workspace_id AND user_id=p_actor
      AND status='active' AND disabled_at IS NULL AND deleted_at IS NULL;

  IF target.id IS NULL OR NOT target.enabled OR NOT target.synthetic_only
    OR target.production_authorized OR target.customer_data_authorized
    OR target.real_provider_calls_authorized
    OR account.id IS NULL OR account.target_id IS DISTINCT FROM p_target
    OR account.org_id IS DISTINCT FROM target.org_id
    OR account.workspace_id IS DISTINCT FROM target.workspace_id
    OR account.auth_user_id IS DISTINCT FROM p_actor
    OR account.preset IS DISTINCT FROM p_base_preset OR account.state<>'active'
    OR preset_role IS DISTINCT FROM p_base_role
    OR base_role.id IS NULL OR base_role.org_id IS DISTINCT FROM target.org_id
    OR base_role.workspace_id IS DISTINCT FROM target.workspace_id OR base_role.scope<>'workspace'
    OR base_role.status<>'active' OR base_role.deleted_at IS NOT NULL OR base_role.is_system
    OR variant_role.id IS NULL OR variant_role.org_id IS DISTINCT FROM target.org_id
    OR variant_role.workspace_id IS DISTINCT FROM target.workspace_id OR variant_role.scope<>'workspace'
    OR variant_role.status<>'active' OR variant_role.deleted_at IS NOT NULL OR variant_role.is_system
    OR membership_count<>1 OR membership_role IS NULL OR membership_role NOT IN(p_base_role,p_variant_role)
    OR (p_require_base AND membership_role<>p_base_role)
    OR NOT EXISTS(SELECT 1 FROM public.organization_members member
      WHERE member.org_id=target.org_id AND member.user_id=p_actor AND member.status='active'
        AND member.disabled_at IS NULL AND member.deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.workspace_memberships member
      WHERE member.role_id=p_variant_role AND member.user_id<>p_actor)
    OR EXISTS(SELECT 1 FROM public.synthetic_admin_preset_roles preset
      WHERE preset.role_id=p_variant_role)
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;

  increments:=public.synthetic_admin_studio_variant_increment(p_variant);
  SELECT COALESCE(array_agg(capability_key ORDER BY capability_key),'{}'::text[])
    INTO base_capabilities FROM public.role_capabilities WHERE role_id=p_base_role;
  SELECT COALESCE(array_agg(capability_key ORDER BY capability_key),'{}'::text[])
    INTO variant_capabilities FROM public.role_capabilities WHERE role_id=p_variant_role;
  SELECT COALESCE(array_agg(DISTINCT item.capability ORDER BY item.capability),'{}'::text[])
    INTO expected_capabilities FROM unnest(base_capabilities||increments) AS item(capability);
  IF jsonb_typeof(base_role.permissions)<>'array' OR jsonb_typeof(variant_role.permissions)<>'array'
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;
  SELECT COALESCE(array_agg(DISTINCT item.permission ORDER BY item.permission),'{}'::text[])
    INTO base_permissions FROM jsonb_array_elements_text(base_role.permissions) AS item(permission);
  SELECT COALESCE(array_agg(DISTINCT item.permission ORDER BY item.permission),'{}'::text[])
    INTO variant_permissions FROM jsonb_array_elements_text(variant_role.permissions) AS item(permission);
  IF base_permissions IS DISTINCT FROM base_capabilities
    OR base_capabilities && increments
    OR variant_permissions IS DISTINCT FROM expected_capabilities
    OR variant_capabilities IS DISTINCT FROM expected_capabilities
    OR jsonb_array_length(base_role.permissions)<>cardinality(base_permissions)
    OR jsonb_array_length(variant_role.permissions)<>cardinality(variant_permissions)
    OR EXISTS(SELECT 1 FROM unnest(increments) AS item(capability)
      WHERE NOT EXISTS(SELECT 1 FROM public.capabilities inventory
        WHERE inventory.capability_key=item.capability))
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;
END
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_validate_studio_actor_role_binding(
  uuid,uuid,uuid,text,uuid,text,uuid,boolean
) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_validate_studio_actor_role_binding_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target public.synthetic_admin_targets;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_BINDING_IMMUTABLE'; END IF;
  SELECT * INTO target FROM public.synthetic_admin_targets WHERE id=NEW.target_id FOR SHARE;
  IF target.id IS NULL OR NEW.configured_by<>target.operator_actor_id
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;
  PERFORM public.synthetic_admin_validate_studio_actor_role_binding(
    NEW.target_id,NEW.account_id,NEW.actor_id,NEW.base_preset,NEW.base_role_id,
    NEW.variant,NEW.variant_role_id,true
  );
  PERFORM public.synthetic_admin_assert_studio_role_switch_safe(target.org_id,target.workspace_id);
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_validate_studio_actor_role_binding_insert()
FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER synthetic_admin_studio_actor_role_bindings_validate
BEFORE INSERT ON public.synthetic_admin_studio_actor_role_bindings
FOR EACH ROW EXECUTE FUNCTION public.synthetic_admin_validate_studio_actor_role_binding_insert();
CREATE TRIGGER synthetic_admin_studio_actor_role_bindings_immutable
BEFORE UPDATE OR DELETE ON public.synthetic_admin_studio_actor_role_bindings
FOR EACH ROW EXECUTE FUNCTION public.pr1b_reject_immutable_event_mutation();

CREATE OR REPLACE FUNCTION public.synthetic_admin_assert_studio_role_switch_safe(
  p_org uuid,p_workspace uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_org IS NULL OR p_workspace IS NULL
    OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
    OR EXISTS(SELECT 1 FROM public.ai_provider_configs config
      WHERE config.org_id=p_org AND config.status='active')
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_capability_routes route
      WHERE route.org_id=p_org AND route.workspace_id=p_workspace AND route.enabled)
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities campaign
      WHERE campaign.org_id=p_org AND campaign.workspace_id=p_workspace AND campaign.enabled)
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_budget_reservations reservation
      WHERE reservation.org_id=p_org AND reservation.workspace_id=p_workspace
        AND (reservation.state IN('reserved','uncertain')
          OR reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending))
  THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;
END
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_assert_studio_role_switch_safe(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.synthetic_admin_commands
  DROP CONSTRAINT synthetic_admin_commands_operation_check,
  ADD CONSTRAINT synthetic_admin_commands_operation_check CHECK(operation IN(
    'assign_role','revoke','ban_claim','grant_operator_assess_read',
    'remove_operator_assess_read','assign_studio_variant'
  ));

-- Bound accounts cannot use the legacy preset RPC to escape the prebound
-- base/variant pair. Unbound accounts retain its exact historical behavior.
CREATE OR REPLACE FUNCTION public.synthetic_admin_assign_role(
 p_actor uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,p_fingerprint text,
 p_request_id uuid,p_key text,p_reservation_id uuid,p_expected_version bigint,p_preset text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target public.synthetic_admin_targets; account public.synthetic_admin_accounts;
        v_role_id uuid; request_hash text; receipt public.synthetic_admin_commands; response jsonb;
BEGIN
 target:=public.synthetic_admin_assert_target(p_actor,p_org,p_workspace,p_authorization_version,p_fingerprint);
 IF p_request_id IS NULL OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9._:-]{8,200}$'
   OR p_reservation_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
   OR p_preset IS NULL OR p_preset NOT IN('author','reviewer','approver','viewer')
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_INVALID_REQUEST'; END IF;
 IF EXISTS(SELECT 1 FROM public.synthetic_admin_studio_actor_role_bindings binding
   WHERE binding.target_id=target.id AND binding.account_id=p_reservation_id)
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED'; END IF;
 request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('requestId',p_request_id,'reservationId',p_reservation_id,
  'expectedVersion',p_expected_version,'rolePreset',p_preset)::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.synthetic_admin_commands WHERE target_id=target.id AND actor_id=p_actor
  AND operation='assign_role' AND idempotency_key=p_key FOR SHARE;
 IF receipt.id IS NOT NULL THEN
  IF receipt.request_hash<>request_hash THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN receipt.response;
 END IF;
 SELECT * INTO account FROM public.synthetic_admin_accounts WHERE id=p_reservation_id AND target_id=target.id
  AND org_id=p_org AND workspace_id=p_workspace FOR UPDATE;
 IF account.id IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_NOT_FOUND'; END IF;
 IF account.state<>'active' OR account.version<>p_expected_version
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_VERSION_CONFLICT'; END IF;
 SELECT preset_role.role_id INTO v_role_id FROM public.synthetic_admin_preset_roles preset_role
 WHERE preset_role.target_id=target.id AND preset_role.preset=p_preset FOR SHARE;
 IF v_role_id IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED'; END IF;
 UPDATE public.workspace_memberships SET role_id=v_role_id,updated_by=p_actor,updated_at=statement_timestamp()
 WHERE org_id=p_org AND workspace_id=p_workspace AND user_id=account.auth_user_id AND status='active' AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED'; END IF;
 UPDATE public.synthetic_admin_accounts SET preset=p_preset,version=version+1,updated_at=statement_timestamp()
 WHERE id=account.id RETURNING * INTO account;
 response:=jsonb_build_object('status','active','reservationId',account.id,'version',account.version);
 INSERT INTO public.synthetic_admin_commands(target_id,actor_id,operation,idempotency_key,request_id,request_hash,response)
 VALUES(target.id,p_actor,'assign_role',p_key,p_request_id,request_hash,response);
 INSERT INTO public.privileged_audit_events(org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata)
 VALUES(p_org,p_workspace,p_actor,p_request_id,'synthetic_admin.role.assign','synthetic_admin_account',account.id,'succeeded',account.version,
  jsonb_build_object('rolePreset',p_preset));
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.synthetic_admin_assign_role(
  uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_admin_assign_role(
  uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_assign_studio_variant(
 p_actor uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,p_fingerprint text,
 p_request_id uuid,p_key text,p_reservation_id uuid,p_expected_version bigint,p_preset text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 target public.synthetic_admin_targets;
 account public.synthetic_admin_accounts;
 binding public.synthetic_admin_studio_actor_role_bindings;
 receipt public.synthetic_admin_commands;
 request_hash text;
 response jsonb;
 current_role_id uuid;
 desired_role uuid;
 actual_authorization_version bigint;
BEGIN
 target:=public.synthetic_admin_assert_target(
   p_actor,p_org,p_workspace,p_authorization_version,p_fingerprint
 );
 IF p_request_id IS NULL OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9._:-]{8,200}$'
   OR p_reservation_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
   OR p_preset IS NULL OR p_preset NOT IN(
     'author','reviewer','approver','viewer',
     'studio-author','studio-reviewer','studio-approver'
   )
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_INVALID_REQUEST'; END IF;

 SELECT * INTO binding FROM public.synthetic_admin_studio_actor_role_bindings
 WHERE target_id=target.id AND account_id=p_reservation_id FOR SHARE;
 IF binding.account_id IS NULL THEN
   IF p_preset NOT IN('author','reviewer','approver','viewer')
   THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED'; END IF;
   RETURN public.synthetic_admin_assign_role(
     p_actor,p_org,p_workspace,p_authorization_version,p_fingerprint,
     p_request_id,p_key,p_reservation_id,p_expected_version,p_preset
   );
 END IF;
 IF p_preset NOT IN(binding.base_preset,binding.variant)
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_FEATURE_DISABLED'; END IF;

 request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object(
   'requestId',p_request_id,'reservationId',p_reservation_id,
   'expectedVersion',p_expected_version,'rolePreset',p_preset,
   'bindingActorId',binding.actor_id,'baseRoleId',binding.base_role_id,
   'variantRoleId',binding.variant_role_id
 )::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.synthetic_admin_commands
 WHERE target_id=target.id AND actor_id=p_actor
   AND operation='assign_studio_variant' AND idempotency_key=p_key FOR SHARE;
 IF receipt.id IS NOT NULL THEN
   IF receipt.request_hash<>request_hash
   THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_IDEMPOTENCY_CONFLICT'; END IF;
   RETURN receipt.response;
 END IF;

 SELECT * INTO account FROM public.synthetic_admin_accounts
 WHERE id=p_reservation_id AND target_id=target.id AND org_id=p_org
   AND workspace_id=p_workspace FOR UPDATE;
 IF account.id IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_NOT_FOUND'; END IF;
 IF account.auth_user_id IS DISTINCT FROM binding.actor_id
   OR account.preset IS DISTINCT FROM binding.base_preset
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_STUDIO_VARIANT_UNSAFE'; END IF;
 IF account.state<>'active' OR account.version<>p_expected_version
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_VERSION_CONFLICT'; END IF;
 PERFORM public.synthetic_admin_validate_studio_actor_role_binding(
   binding.target_id,binding.account_id,binding.actor_id,binding.base_preset,
   binding.base_role_id,binding.variant,binding.variant_role_id,false
 );
 PERFORM public.synthetic_admin_assert_studio_role_switch_safe(p_org,p_workspace);

 SELECT role_id INTO STRICT current_role_id FROM public.workspace_memberships
 WHERE org_id=p_org AND workspace_id=p_workspace AND user_id=binding.actor_id
   AND status='active' AND disabled_at IS NULL AND deleted_at IS NULL FOR UPDATE;
 desired_role:=CASE WHEN p_preset=binding.variant
   THEN binding.variant_role_id ELSE binding.base_role_id END;
 IF (desired_role=binding.variant_role_id AND current_role_id<>binding.base_role_id)
   OR (desired_role=binding.base_role_id AND current_role_id<>binding.variant_role_id)
 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_VERSION_CONFLICT'; END IF;
 UPDATE public.workspace_memberships
 SET role_id=desired_role,updated_by=p_actor,updated_at=statement_timestamp()
 WHERE org_id=p_org AND workspace_id=p_workspace AND user_id=binding.actor_id
   AND role_id=current_role_id AND status='active' AND disabled_at IS NULL AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_RECONCILIATION_REQUIRED'; END IF;
 UPDATE public.synthetic_admin_accounts
 SET version=version+1,updated_at=statement_timestamp()
 WHERE id=account.id AND version=p_expected_version RETURNING * INTO account;
 IF account.id IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_VERSION_CONFLICT'; END IF;
 SELECT version INTO STRICT actual_authorization_version
 FROM public.authorization_versions WHERE org_id=p_org AND user_id=binding.actor_id;

 response:=jsonb_build_object(
   'status','active','reservationId',account.id,'version',account.version,
   'rolePreset',p_preset,
   'baseRolePreset',binding.base_preset,'studioVariant',binding.variant,
   'studioVariantActive',p_preset=binding.variant
 );
 INSERT INTO public.synthetic_admin_commands(
   target_id,actor_id,operation,idempotency_key,request_id,request_hash,response
 ) VALUES(
   target.id,p_actor,'assign_studio_variant',p_key,p_request_id,request_hash,response
 );
 INSERT INTO public.privileged_audit_events(
   org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
   outcome,resource_version,metadata
 ) VALUES(
   p_org,p_workspace,p_actor,p_request_id,
   CASE WHEN p_preset=binding.variant
     THEN 'synthetic_admin.studio_variant.assign'
     ELSE 'synthetic_admin.studio_variant.restore' END,
   'synthetic_admin_account',account.id,'succeeded',account.version,
   jsonb_build_object(
     'baseRolePreset',binding.base_preset,'studioVariant',binding.variant,
     'studioVariantActive',p_preset=binding.variant,
     'authorizationVersion',actual_authorization_version
   )
 );
 RETURN response;
END
$$;
REVOKE ALL ON FUNCTION public.synthetic_admin_assign_studio_variant(
  uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.synthetic_admin_assign_studio_variant(
  uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.synthetic_admin_list(
 p_actor uuid,p_org uuid,p_workspace uuid,p_version bigint,p_fingerprint text,p_cursor uuid,p_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 target public.synthetic_admin_targets;
 rows jsonb;
 cursor_id uuid;
 binding public.synthetic_admin_studio_actor_role_bindings;
BEGIN
 target:=public.synthetic_admin_assert_target(p_actor,p_org,p_workspace,p_version,p_fingerprint);
 IF p_limit IS NULL THEN p_limit:=20; END IF;
 IF p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'SYNTHETIC_ADMIN_INVALID_REQUEST'; END IF;
 FOR binding IN SELECT * FROM public.synthetic_admin_studio_actor_role_bindings
   WHERE target_id=target.id ORDER BY account_id
 LOOP
   PERFORM public.synthetic_admin_validate_studio_actor_role_binding(
     binding.target_id,binding.account_id,binding.actor_id,binding.base_preset,
     binding.base_role_id,binding.variant,binding.variant_role_id,false
   );
 END LOOP;
 SELECT COALESCE(jsonb_agg(item.safe_row ORDER BY item.id),'[]'::jsonb),max(item.id::text)::uuid
 INTO rows,cursor_id FROM (
  SELECT account.id,jsonb_build_object(
    'reservationId',account.id,'label',account.label,'loginId',account.synthetic_email,
    'rolePreset',CASE WHEN member.role_id=binding.variant_role_id
      THEN binding.variant ELSE account.preset END,
    'baseRolePreset',account.preset,
    'studioVariant',binding.variant,
    'studioVariantActive',COALESCE(member.role_id=binding.variant_role_id,false),
    'assignableRolePresets',CASE WHEN binding.account_id IS NULL
      THEN jsonb_build_array('author','reviewer','approver','viewer')
      ELSE jsonb_build_array(binding.base_preset,binding.variant) END,
    'state',account.state,'version',account.version
  ) AS safe_row
  FROM public.synthetic_admin_accounts account
  LEFT JOIN public.synthetic_admin_studio_actor_role_bindings binding
    ON binding.target_id=account.target_id AND binding.account_id=account.id
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

COMMENT ON TABLE public.synthetic_admin_studio_actor_role_bindings IS
'DBA-provisioned immutable target/account/actor bindings for one dedicated Studio role variant and exact normal-role restoration.';
COMMENT ON FUNCTION public.synthetic_admin_assign_studio_variant(
  uuid,uuid,uuid,bigint,text,uuid,text,uuid,bigint,text
) IS 'Service-only synthetic-admin role assignment. Bound accounts can select only their exact Studio variant or original base preset; unbound accounts retain legacy preset assignment.';

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261105140004';
  new_tip text:='20261106012001';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261106012001'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261106012001');
END
$process_evidence_identity_forward$;

COMMIT;
