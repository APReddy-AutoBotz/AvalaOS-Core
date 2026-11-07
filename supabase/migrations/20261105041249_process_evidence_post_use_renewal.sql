-- One short-lived continuation for the retained process-evidence campaign
-- after its first real provider effects. The new profile is cumulative: the
-- original three debits remain charged and the campaign can never exceed
-- 2 validation, 4 extraction, 7 Studio, 13 total, or USD 6.1289696 reserved.
DO $process_evidence_post_use_precondition$
DECLARE marker public.hosted_pilot_environment_identity;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity WHERE singleton FOR UPDATE;
  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261105024717'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR pg_catalog.to_regclass('public.process_evidence_provider_post_use_windows') IS NOT NULL
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_MIGRATION_PRECONDITION'; END IF;
END
$process_evidence_post_use_precondition$;

CREATE TABLE public.process_evidence_provider_post_use_windows(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.synthetic_ai_campaign_authorities(id) ON DELETE RESTRICT,
  sequence_number smallint NOT NULL CHECK(sequence_number BETWEEN 1 AND 10),
  prior_resume_window_id uuid UNIQUE
    REFERENCES public.process_evidence_provider_resume_windows(id) ON DELETE RESTRICT,
  prior_post_use_window_id uuid UNIQUE
    REFERENCES public.process_evidence_provider_post_use_windows(id) ON DELETE RESTRICT,
  renewed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
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
  renewed_commit text NOT NULL CHECK(renewed_commit~'^[0-9a-f]{40}$'),
  request_id uuid NOT NULL UNIQUE,
  idempotency_key text NOT NULL CHECK(idempotency_key~'^[A-Za-z0-9._:-]{8,200}$'),
  safe_fingerprint text NOT NULL CHECK(safe_fingerprint~'^sha256:[0-9a-f]{24}$'),
  provider_binding_attestation_digest text NOT NULL UNIQUE
    CHECK(provider_binding_attestation_digest~'^sha256:[0-9a-f]{64}$'),
  provider_binding_attested_at timestamptz NOT NULL,
  credit_attestation_digest text NOT NULL UNIQUE
    CHECK(credit_attestation_digest~'^sha256:[0-9a-f]{64}$'),
  credit_attested_at timestamptz NOT NULL,
  credit_expires_at timestamptz NOT NULL,
  verified_available_credit_usd_nanos bigint NOT NULL CHECK(verified_available_credit_usd_nanos>0),
  baseline_effects smallint NOT NULL CHECK(baseline_effects BETWEEN 3 AND 12),
  baseline_reserved_usd_nanos bigint NOT NULL,
  maximum_effects smallint NOT NULL CHECK(maximum_effects=13),
  maximum_reserved_usd_nanos bigint NOT NULL CHECK(maximum_reserved_usd_nanos=6128969600),
  validation_effects smallint NOT NULL CHECK(validation_effects=2),
  extraction_effects smallint NOT NULL CHECK(extraction_effects=4),
  studio_effects smallint NOT NULL CHECK(studio_effects=7),
  binding_digest text NOT NULL UNIQUE CHECK(binding_digest~'^sha256:[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '2 hours'),
  CHECK(expires_at<=credit_expires_at),
  CHECK(provider_binding_attested_at<=created_at
    AND provider_binding_attested_at>=created_at-interval '15 minutes'),
  CHECK(credit_attested_at<=created_at AND credit_attested_at>=created_at-interval '15 minutes'),
  CHECK((prior_resume_window_id IS NULL)<>(prior_post_use_window_id IS NULL)),
  CHECK(baseline_reserved_usd_nanos=baseline_effects*471459200::bigint),
  CHECK(maximum_reserved_usd_nanos=maximum_effects*471459200::bigint),
  CHECK(assess_actor_id<>renewed_by AND studio_actor_id<>renewed_by AND assess_actor_id<>studio_actor_id),
  UNIQUE(renewed_by,idempotency_key),
  UNIQUE(campaign_id,sequence_number),
  FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(provider_config_id,org_id) REFERENCES public.ai_provider_configs(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(key_ref_id,org_id) REFERENCES public.ai_provider_key_refs(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(assess_route_id,org_id,workspace_id)
    REFERENCES public.enterprise_ai_capability_routes(id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(studio_route_id,org_id,workspace_id)
    REFERENCES public.enterprise_ai_capability_routes(id,org_id,workspace_id) ON DELETE RESTRICT
);

CREATE FUNCTION public.process_evidence_provider_post_use_window_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_WINDOW_IMMUTABLE';
END $$;
REVOKE ALL ON FUNCTION public.process_evidence_provider_post_use_window_immutable()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER process_evidence_provider_post_use_window_immutable
BEFORE UPDATE OR DELETE ON public.process_evidence_provider_post_use_windows
FOR EACH ROW EXECUTE FUNCTION public.process_evidence_provider_post_use_window_immutable();

ALTER TABLE public.process_evidence_provider_post_use_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_evidence_provider_post_use_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.process_evidence_provider_post_use_windows FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.process_evidence_provider_post_use_windows TO service_role;
CREATE INDEX process_evidence_provider_post_use_campaign_idx
  ON public.process_evidence_provider_post_use_windows(campaign_id,sequence_number DESC);

-- The authority row carries the effective cumulative financial ceiling. Both
-- profiles remain valid so the expansion cannot happen until the renewal RPC
-- inserts its immutable window and updates the same campaign transactionally.
ALTER TABLE public.synthetic_ai_campaign_authorities
  DROP CONSTRAINT synthetic_ai_campaign_financial_profile,
  ADD CONSTRAINT synthetic_ai_campaign_financial_profile CHECK (
    (process_run_commit IS NULL AND process_run_assess_actor IS NULL AND process_run_studio_actor IS NULL
     AND campaign_cap_usd_nanos=10000000000 AND carried_usd_nanos=869320000
     AND carried_usd_nanos+19*fixed_debit_usd_nanos<=campaign_cap_usd_nanos
     AND carried_usd_nanos+20*fixed_debit_usd_nanos>campaign_cap_usd_nanos)
    OR (process_run_commit IS NOT NULL AND process_run_commit~'^[0-9a-f]{40}$'
        AND process_run_assess_actor IS NOT NULL AND process_run_studio_actor IS NOT NULL
        AND process_run_assess_actor<>operator_actor_id AND process_run_studio_actor<>operator_actor_id
        AND process_run_assess_actor<>process_run_studio_actor AND carried_usd_nanos=0
        AND campaign_cap_usd_nanos IN(4000000000,6128969600))
  );

-- The historical authority used a one-day horizon from campaign creation.
-- Retain it for every non-process campaign; process renewals instead receive
-- their own independently attested two-hour and credit-expiry bounds.
DO $process_evidence_expiry_constraint$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='public.synthetic_ai_campaign_authorities'::regclass
    AND contype='c'
    AND pg_get_expr(conbin,conrelid,false) LIKE '%expires_at > created_at%'
    AND pg_get_expr(conbin,conrelid,false) LIKE '%24:00:00%';
  EXECUTE format('ALTER TABLE public.synthetic_ai_campaign_authorities DROP CONSTRAINT %I',constraint_name);
END
$process_evidence_expiry_constraint$;
ALTER TABLE public.synthetic_ai_campaign_authorities
  ADD CONSTRAINT synthetic_ai_campaign_expiry_profile CHECK(
    expires_at>created_at AND
    (process_run_commit IS NOT NULL OR expires_at<=created_at+interval '24 hours')
  );

DO $process_evidence_slot_constraint$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='public.synthetic_ai_campaign_effect_debits'::regclass
    AND contype='c' AND pg_get_expr(conbin,conrelid,false) LIKE '%process_run_slot%';
  EXECUTE format('ALTER TABLE public.synthetic_ai_campaign_effect_debits DROP CONSTRAINT %I',constraint_name);
END
$process_evidence_slot_constraint$;
ALTER TABLE public.synthetic_ai_campaign_effect_debits
  ADD CONSTRAINT synthetic_ai_campaign_effect_debits_process_run_slot_check
  CHECK(process_run_slot IS NULL OR process_run_slot BETWEEN 1 AND
    CASE operation WHEN 'provider.validate' THEN 2 WHEN 'assess.evidence.extract' THEN 4
      WHEN 'studio.document.generate' THEN 7 ELSE 0 END);

-- Cumulative admission remains on the original debit ledger. A renewal row
-- selects the expanded profile; without it the original 1/2/5 and eight-effect
-- profile still applies even though the column constraint permits larger slots.
CREATE OR REPLACE FUNCTION public.process_evidence_guard_provider_debit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  campaign public.synthetic_ai_campaign_authorities;
  renewal public.process_evidence_provider_post_use_windows;
  operation_limit integer;
  total_limit integer;
  expected_cap bigint;
  expected_actor uuid;
  operation_count integer;
  total_count integer;
  reserved bigint;
BEGIN
  SELECT * INTO STRICT campaign FROM public.synthetic_ai_campaign_authorities
    WHERE id=NEW.campaign_id FOR UPDATE;
  IF campaign.process_run_commit IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO renewal FROM public.process_evidence_provider_post_use_windows row
    WHERE row.campaign_id=campaign.id ORDER BY row.sequence_number DESC LIMIT 1 FOR SHARE;
  IF renewal.id IS NULL THEN
    total_limit:=8; expected_cap:=4000000000;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 1
      WHEN 'assess.evidence.extract' THEN 2 WHEN 'studio.document.generate' THEN 5 ELSE 0 END;
  ELSE
    total_limit:=13; expected_cap:=6128969600;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 2
      WHEN 'assess.evidence.extract' THEN 4 WHEN 'studio.document.generate' THEN 7 ELSE 0 END;
  END IF;
  IF NOT campaign.enabled OR campaign.disabled_at IS NOT NULL OR campaign.expires_at<=clock_timestamp()
    OR campaign.campaign_cap_usd_nanos<>expected_cap
    OR NEW.workspace_id<>campaign.workspace_id OR NEW.org_id<>campaign.org_id
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_PERMIT_INACTIVE'; END IF;
  CASE NEW.operation
    WHEN 'provider.validate' THEN expected_actor:=campaign.operator_actor_id;
    WHEN 'assess.evidence.extract' THEN expected_actor:=campaign.process_run_assess_actor;
    WHEN 'studio.document.generate' THEN expected_actor:=campaign.process_run_studio_actor;
    ELSE RAISE EXCEPTION 'PROCESS_EVIDENCE_OPERATION_DENIED';
  END CASE;
  IF NEW.actor_id IS DISTINCT FROM expected_actor THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_ACTOR_DENIED'; END IF;
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  SELECT count(*),count(*) FILTER(WHERE debit.operation=NEW.operation),COALESCE(sum(debit.debit_usd_nanos),0)
    INTO total_count,operation_count,reserved
    FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=campaign.id;
  IF total_count>=total_limit OR operation_count>=operation_limit
    OR NEW.debit_usd_nanos<>campaign.fixed_debit_usd_nanos
    OR reserved+NEW.debit_usd_nanos>expected_cap
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_PERMIT_EXHAUSTED'; END IF;
  NEW.process_run_slot:=operation_count+1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.process_evidence_guard_provider_debit()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.process_evidence_renew_provider_run_after_use(
  p_operator uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,
  p_target_fingerprint text,p_project_ref text,p_campaign uuid,p_secret_reference text,
  p_safe_fingerprint text,p_provider_config uuid,p_key_ref uuid,p_assess_route uuid,p_studio_route uuid,
  p_assess_actor uuid,p_studio_actor uuid,p_commit text,p_expires_at timestamptz,
  p_request_id uuid,p_idempotency_key text,p_provider_binding_attestation_digest text,
  p_provider_binding_attested_at timestamptz,p_credit_attestation_digest text,
  p_credit_attested_at timestamptz,p_credit_expires_at timestamptz,
  p_verified_available_credit_usd_nanos bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  target public.synthetic_admin_targets;
  campaign public.synthetic_ai_campaign_authorities;
  prior_window public.process_evidence_provider_resume_windows;
  prior_post_use public.process_evidence_provider_post_use_windows;
  existing public.process_evidence_provider_post_use_windows;
  inserted public.process_evidence_provider_post_use_windows;
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
  debit_count integer;
  consumed_count integer;
  resolved_count integer;
  validation_count integer;
  extraction_count integer;
  studio_count integer;
  sequence_value integer;
  window_id uuid:=gen_random_uuid();
  debit_spend bigint;
  operation_counts jsonb;
  binding_digest_value text;
  result_value jsonb;
BEGIN
  IF p_campaign IS NULL OR p_provider_config IS NULL OR p_key_ref IS NULL
    OR p_assess_route IS NULL OR p_studio_route IS NULL OR p_assess_actor IS NULL OR p_studio_actor IS NULL
    OR p_commit IS NULL OR p_commit!~'^[0-9a-f]{40}$' OR p_request_id IS NULL
    OR p_idempotency_key IS NULL OR p_idempotency_key!~'^[A-Za-z0-9._:-]{8,200}$'
    OR p_safe_fingerprint IS NULL OR p_safe_fingerprint!~'^sha256:[0-9a-f]{24}$'
    OR p_provider_binding_attestation_digest IS NULL
      OR p_provider_binding_attestation_digest!~'^sha256:[0-9a-f]{64}$'
    OR p_credit_attestation_digest IS NULL OR p_credit_attestation_digest!~'^sha256:[0-9a-f]{64}$'
    OR p_expires_at IS NULL OR p_provider_binding_attested_at IS NULL
    OR p_credit_attested_at IS NULL OR p_credit_expires_at IS NULL
    OR p_verified_available_credit_usd_nanos IS NULL OR p_verified_available_credit_usd_nanos<=0
    OR (SELECT count(DISTINCT actor_id)
      FROM unnest(ARRAY[p_operator,p_assess_actor,p_studio_actor]) actor_id)<>3
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_BINDING_INVALID'; END IF;

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
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_NOT_AUTHORIZED'; END IF;

  SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity WHERE singleton FOR SHARE;
  SELECT * INTO STRICT enterprise_control FROM public.enterprise_intelligence_runtime_control WHERE singleton FOR SHARE;
  SELECT * INTO STRICT studio_control FROM public.studio_artifact_runtime_control WHERE singleton FOR SHARE;
  IF marker.product_key<>'avalaos-core' OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08' OR marker.migration_tip<>'20261105041249'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR enterprise_control.provider_enabled OR studio_control.provider_enabled
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_RUNTIME_NOT_OFF'; END IF;

  SELECT * INTO campaign FROM public.synthetic_ai_campaign_authorities authority
    WHERE authority.id=p_campaign AND authority.target_id=target.id
      AND authority.target_fingerprint=p_target_fingerprint AND authority.project_ref=p_project_ref
      AND authority.server_host=request_host AND authority.org_id=p_org AND authority.workspace_id=p_workspace
      AND authority.operator_actor_id=p_operator AND authority.provider_config_id=p_provider_config
      AND authority.key_ref_id=p_key_ref AND authority.assess_route_id=p_assess_route
      AND authority.studio_route_id=p_studio_route FOR UPDATE;
  IF campaign.id IS NULL THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_NOT_AUTHORIZED'; END IF;

  SELECT * INTO existing FROM public.process_evidence_provider_post_use_windows row
    WHERE row.campaign_id=campaign.id
      AND (row.request_id=p_request_id OR (row.renewed_by=p_operator AND row.idempotency_key=p_idempotency_key));
  IF existing.id IS NOT NULL THEN
    IF existing.renewed_by IS DISTINCT FROM p_operator
      OR existing.authorization_version IS DISTINCT FROM p_authorization_version
      OR existing.target_fingerprint IS DISTINCT FROM p_target_fingerprint
      OR existing.project_ref IS DISTINCT FROM p_project_ref OR existing.org_id IS DISTINCT FROM p_org
      OR existing.workspace_id IS DISTINCT FROM p_workspace
      OR existing.provider_config_id IS DISTINCT FROM p_provider_config
      OR existing.key_ref_id IS DISTINCT FROM p_key_ref OR existing.assess_route_id IS DISTINCT FROM p_assess_route
      OR existing.studio_route_id IS DISTINCT FROM p_studio_route
      OR existing.assess_actor_id IS DISTINCT FROM p_assess_actor
      OR existing.studio_actor_id IS DISTINCT FROM p_studio_actor
      OR existing.renewed_commit IS DISTINCT FROM p_commit OR existing.expires_at IS DISTINCT FROM p_expires_at
      OR existing.request_id IS DISTINCT FROM p_request_id
      OR existing.idempotency_key IS DISTINCT FROM p_idempotency_key
      OR existing.safe_fingerprint IS DISTINCT FROM p_safe_fingerprint
      OR existing.provider_binding_attestation_digest IS DISTINCT FROM p_provider_binding_attestation_digest
      OR existing.provider_binding_attested_at IS DISTINCT FROM p_provider_binding_attested_at
      OR existing.credit_attestation_digest IS DISTINCT FROM p_credit_attestation_digest
      OR existing.credit_attested_at IS DISTINCT FROM p_credit_attested_at
      OR existing.credit_expires_at IS DISTINCT FROM p_credit_expires_at
      OR existing.verified_available_credit_usd_nanos IS DISTINCT FROM p_verified_available_credit_usd_nanos
    THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_REPLAY_MISMATCH'; END IF;
    RETURN existing.result||jsonb_build_object('replayed',true);
  END IF;

  IF p_expires_at<=created_at_value OR p_expires_at>created_at_value+interval '2 hours'
    OR p_provider_binding_attested_at>created_at_value
      OR p_provider_binding_attested_at<created_at_value-interval '15 minutes'
    OR p_credit_attested_at>created_at_value
      OR p_credit_attested_at<created_at_value-interval '15 minutes'
    OR p_credit_expires_at<p_expires_at
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_BINDING_INVALID'; END IF;

  SELECT * INTO prior_window FROM public.process_evidence_provider_resume_windows row
    WHERE row.campaign_id=campaign.id FOR SHARE;
  SELECT * INTO prior_post_use FROM public.process_evidence_provider_post_use_windows row
    WHERE row.campaign_id=campaign.id ORDER BY row.sequence_number DESC LIMIT 1 FOR SHARE;
  IF campaign.enabled OR campaign.disabled_at IS NULL
    OR campaign.process_run_commit IS NULL
    OR campaign.process_run_assess_actor IS DISTINCT FROM p_assess_actor
    OR campaign.process_run_studio_actor IS DISTINCT FROM p_studio_actor
    OR campaign.provider<>'openai' OR campaign.endpoint<>'https://api.openai.com'
    OR campaign.model<>'gpt-4.1-mini-2025-04-14'
    OR campaign.allowed_operations IS DISTINCT FROM
      ARRAY['assess.evidence.extract','provider.validate','studio.document.generate']::text[]
    OR campaign.campaign_cap_usd_nanos<>(CASE
      WHEN prior_post_use.id IS NULL THEN 4000000000 ELSE 6128969600 END)
    OR campaign.carried_usd_nanos<>0
    OR campaign.fixed_debit_usd_nanos<>471459200 OR campaign.max_input_tokens<>1047576
    OR campaign.max_output_tokens<>32768 OR campaign.input_price_usd_nanos<>400
    OR campaign.output_price_usd_nanos<>1600
    OR campaign.price_policy_version<>'openai-gpt-4.1-mini-2025-04-14-full-max-2026-09-17-v1'
    OR prior_window.id IS NULL
    OR (prior_post_use.id IS NULL AND prior_window.resumed_commit IS DISTINCT FROM campaign.process_run_commit)
    OR (prior_post_use.id IS NOT NULL AND prior_post_use.renewed_commit IS DISTINCT FROM campaign.process_run_commit)
    OR prior_window.org_id IS DISTINCT FROM p_org OR prior_window.workspace_id IS DISTINCT FROM p_workspace
    OR prior_window.provider_config_id IS DISTINCT FROM p_provider_config
    OR prior_window.key_ref_id IS DISTINCT FROM p_key_ref
    OR prior_window.assess_route_id IS DISTINCT FROM p_assess_route
    OR prior_window.studio_route_id IS DISTINCT FROM p_studio_route
    OR prior_window.assess_actor_id IS DISTINCT FROM p_assess_actor
    OR prior_window.studio_actor_id IS DISTINCT FROM p_studio_actor
    OR (prior_post_use.id IS NOT NULL AND(
      prior_post_use.org_id IS DISTINCT FROM p_org OR prior_post_use.workspace_id IS DISTINCT FROM p_workspace
      OR prior_post_use.provider_config_id IS DISTINCT FROM p_provider_config
      OR prior_post_use.key_ref_id IS DISTINCT FROM p_key_ref
      OR prior_post_use.assess_route_id IS DISTINCT FROM p_assess_route
      OR prior_post_use.studio_route_id IS DISTINCT FROM p_studio_route
      OR prior_post_use.assess_actor_id IS DISTINCT FROM p_assess_actor
      OR prior_post_use.studio_actor_id IS DISTINCT FROM p_studio_actor))
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_NOT_AUTHORIZED'; END IF;

  IF (SELECT count(*) FROM public.synthetic_ai_campaign_authorities)<>1
    OR (SELECT count(*) FROM public.ai_provider_configs)<>1
    OR (SELECT count(*) FROM public.ai_provider_key_refs)<>1
    OR (SELECT count(*) FROM public.enterprise_ai_capability_routes)<>2
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_HISTORY_UNSAFE'; END IF;

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
      AND config.status='disabled' AND config.last_validated_at<=created_at_value
      AND config.last_validated_at>=created_at_value-interval '24 hours'
      AND config.deleted_at IS NULL FOR UPDATE;
  SELECT * INTO key_ref FROM public.ai_provider_key_refs key_row
    WHERE key_row.id=p_key_ref AND key_row.org_id=p_org AND key_row.provider='openai'
      AND key_row.resolver_type='server_reference' AND key_row.secret_ref=p_secret_reference
      -- The environment-backed bootstrap reference does not persist a
      -- fingerprint. The controller binds p_safe_fingerprint to the staged
      -- bytes and Management readback in its separately retained attestation.
      AND key_row.secret_backend_kind IS NULL AND key_row.safe_fingerprint IS NULL
      AND key_row.status='active' AND key_row.deleted_at IS NULL
      AND (key_row.expires_at IS NULL OR key_row.expires_at>p_expires_at) FOR SHARE;
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
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_BINDING_STALE'; END IF;

  SELECT count(*)::integer,count(*) FILTER(WHERE consumed_at IS NOT NULL)::integer,
    COALESCE(sum(debit_usd_nanos),0)::bigint INTO debit_count,consumed_count,debit_spend
  FROM public.synthetic_ai_campaign_effect_debits debit WHERE debit.campaign_id=campaign.id;
  SELECT jsonb_object_agg(operation,n),
    COALESCE(sum(n) FILTER(WHERE operation='provider.validate'),0)::integer,
    COALESCE(sum(n) FILTER(WHERE operation='assess.evidence.extract'),0)::integer,
    COALESCE(sum(n) FILTER(WHERE operation='studio.document.generate'),0)::integer
    INTO operation_counts,validation_count,extraction_count,studio_count
  FROM(SELECT operation,count(*)::integer n FROM public.synthetic_ai_campaign_effect_debits
    WHERE campaign_id=campaign.id GROUP BY operation) counts;
  SELECT count(*)::integer INTO resolved_count
  FROM public.synthetic_ai_campaign_effect_debits debit
  WHERE debit.campaign_id=campaign.id AND(
    debit.consumed_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_budget_reservations reservation
      WHERE reservation.receipt_id=debit.receipt_id AND reservation.org_id=debit.org_id
        AND reservation.workspace_id=debit.workspace_id AND reservation.state='released'
        AND reservation.release_reason IN('before_provider_effect','reconciled_no_effect')
        AND NOT reservation.studio_transfer_pending AND NOT reservation.assess_mapping_transfer_pending));
  sequence_value:=COALESCE(prior_post_use.sequence_number,0)+1;
  IF debit_count NOT BETWEEN 3 AND 12 OR resolved_count<>debit_count
    OR debit_spend<>debit_count*471459200::bigint
    OR validation_count NOT BETWEEN 1 AND 2 OR extraction_count NOT BETWEEN 2 AND 4
    OR studio_count NOT BETWEEN 0 AND 7 OR validation_count+extraction_count+studio_count<>debit_count
    OR p_verified_available_credit_usd_nanos<(13-debit_count)*471459200::bigint
    OR (prior_post_use.id IS NULL AND (debit_count<>3 OR consumed_count<>3
      OR operation_counts IS DISTINCT FROM jsonb_build_object('assess.evidence.extract',2,'provider.validate',1)))
    OR (prior_post_use.id IS NOT NULL AND(
      debit_count<prior_post_use.baseline_effects OR sequence_value>10
      OR prior_post_use.maximum_effects<>13 OR prior_post_use.maximum_reserved_usd_nanos<>6128969600))
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_effect_debits debit
      WHERE debit.campaign_id=campaign.id AND(
        debit.provider_config_id<>p_provider_config OR debit.key_ref_id<>p_key_ref
        OR debit.provider<>'openai' OR debit.endpoint<>'https://api.openai.com'
        OR debit.model<>'gpt-4.1-mini-2025-04-14'
        OR (debit.operation='provider.validate' AND
          (debit.actor_id<>p_operator OR debit.route_id IS NOT NULL
            OR debit.process_run_slot NOT BETWEEN 1 AND 2))
        OR (debit.operation='assess.evidence.extract' AND
          (debit.actor_id<>p_assess_actor OR debit.route_id<>p_assess_route
            OR debit.process_run_slot NOT BETWEEN 1 AND 4))
        OR (debit.operation='studio.document.generate' AND
          (debit.actor_id<>p_studio_actor OR debit.route_id<>p_studio_route
            OR debit.process_run_slot NOT BETWEEN 1 AND 7))))
    OR (SELECT array_agg(process_run_slot ORDER BY process_run_slot)
      FROM public.synthetic_ai_campaign_effect_debits debit
      WHERE debit.campaign_id=campaign.id AND debit.operation='assess.evidence.extract')
      IS DISTINCT FROM ARRAY(SELECT generate_series(1,extraction_count)::smallint)
    OR (SELECT array_agg(process_run_slot ORDER BY process_run_slot)
      FROM public.synthetic_ai_campaign_effect_debits debit
      WHERE debit.campaign_id=campaign.id AND debit.operation='provider.validate')
      IS DISTINCT FROM ARRAY(SELECT generate_series(1,validation_count)::smallint)
    OR COALESCE((SELECT array_agg(process_run_slot ORDER BY process_run_slot)
      FROM public.synthetic_ai_campaign_effect_debits debit
      WHERE debit.campaign_id=campaign.id AND debit.operation='studio.document.generate'),'{}'::smallint[])
      IS DISTINCT FROM ARRAY(SELECT generate_series(1,studio_count)::smallint)
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_budget_reservations reservation
      WHERE reservation.org_id=p_org AND reservation.workspace_id=p_workspace
        AND reservation.provider_config_id=p_provider_config
        AND (reservation.state IN('reserved','uncertain')
          OR (reservation.state='released' AND reservation.release_reason IS NULL)
          OR reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending))
    OR (SELECT count(*) FROM public.enterprise_ai_budget_reservations reservation
      WHERE reservation.org_id=p_org AND reservation.workspace_id=p_workspace
        AND reservation.provider_config_id=p_provider_config)<>extraction_count+studio_count
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_effect_debits debit
      LEFT JOIN public.enterprise_ai_budget_reservations reservation
        ON reservation.receipt_id=debit.receipt_id AND reservation.org_id=debit.org_id
        AND reservation.workspace_id=debit.workspace_id
      WHERE debit.campaign_id=campaign.id AND debit.operation<>'provider.validate'
        AND (reservation.id IS NULL OR reservation.state NOT IN('settled','released')
          OR (reservation.state='settled' AND reservation.actual_total_tokens IS NULL)
          OR (reservation.state='released' AND reservation.release_reason NOT IN('before_provider_effect','reconciled_no_effect'))
          OR reservation.capability<>debit.operation
          OR reservation.actor_id<>debit.actor_id OR reservation.route_id<>debit.route_id
          OR reservation.provider_config_id<>p_provider_config OR reservation.provider<>'openai'
          OR reservation.model<>'gpt-4.1-mini-2025-04-14'))
  THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_POST_USE_HISTORY_UNSAFE'; END IF;

  binding_digest_value:='sha256:'||encode(public.digest(convert_to(concat_ws('|',
    'process-evidence-post-use-v1',campaign.id::text,
    COALESCE(prior_post_use.id,prior_window.id)::text,sequence_value::text,
    p_target_fingerprint,p_project_ref,p_org::text,p_workspace::text,p_operator::text,
    p_authorization_version::text,p_provider_config::text,p_key_ref::text,p_assess_route::text,
    p_studio_route::text,p_assess_actor::text,p_studio_actor::text,campaign.process_run_commit,p_commit,
    p_request_id::text,p_idempotency_key,p_safe_fingerprint,p_provider_binding_attestation_digest,
    p_provider_binding_attested_at::text,p_credit_attestation_digest,p_credit_attested_at::text,
    p_credit_expires_at::text,p_verified_available_credit_usd_nanos::text,
    p_expires_at::text,created_at_value::text),'UTF8'),'sha256'),'hex');
  result_value:=jsonb_build_object('status','renewed','replayed',false,
    'windowId',window_id,'campaignId',campaign.id,'commit',p_commit,'expiresAt',p_expires_at,
    'sequence',sequence_value,'baselineCalls',debit_count,'baselineReservedUsdNanos',debit_spend,
    'maxCalls',13,'maximumReservedUsdNanos',6128969600,
    'validation',2,'extractions',4,'studio',7,
    'remainingValidation',2-validation_count,'remainingExtractions',4-extraction_count,
    'remainingStudio',7-studio_count,
    'providerBindingAttestationDigest',p_provider_binding_attestation_digest,
    'creditAttestationDigest',p_credit_attestation_digest,'creditExpiresAt',p_credit_expires_at,
    'verifiedAvailableCreditUsdNanos',p_verified_available_credit_usd_nanos,
    'bindingDigest',binding_digest_value);
  INSERT INTO public.process_evidence_provider_post_use_windows(
    id,campaign_id,sequence_number,prior_resume_window_id,prior_post_use_window_id,
    renewed_by,authorization_version,target_fingerprint,project_ref,
    server_host,org_id,workspace_id,provider_config_id,key_ref_id,assess_route_id,studio_route_id,
    assess_actor_id,studio_actor_id,previous_commit,renewed_commit,request_id,idempotency_key,
    safe_fingerprint,provider_binding_attestation_digest,provider_binding_attested_at,
    credit_attestation_digest,credit_attested_at,credit_expires_at,verified_available_credit_usd_nanos,
    baseline_effects,baseline_reserved_usd_nanos,maximum_effects,maximum_reserved_usd_nanos,
    validation_effects,extraction_effects,studio_effects,binding_digest,result,expires_at
  ) VALUES(
    window_id,campaign.id,sequence_value,
    CASE WHEN prior_post_use.id IS NULL THEN prior_window.id END,prior_post_use.id,
    p_operator,p_authorization_version,p_target_fingerprint,p_project_ref,
    request_host,p_org,p_workspace,p_provider_config,p_key_ref,p_assess_route,p_studio_route,
    p_assess_actor,p_studio_actor,campaign.process_run_commit,p_commit,p_request_id,p_idempotency_key,
    p_safe_fingerprint,p_provider_binding_attestation_digest,p_provider_binding_attested_at,
    p_credit_attestation_digest,p_credit_attested_at,p_credit_expires_at,p_verified_available_credit_usd_nanos,
    debit_count,debit_spend,13,6128969600,2,4,7,binding_digest_value,result_value,p_expires_at
  ) RETURNING * INTO inserted;

  UPDATE public.ai_provider_configs SET status='active',updated_by=p_operator,updated_at=created_at_value
    WHERE id=provider_config.id;
  UPDATE public.enterprise_ai_capability_routes SET enabled=true,version=version+1,
    updated_by=p_operator,updated_at=created_at_value
    WHERE id IN(assess_route.id,studio_route.id);
  UPDATE public.synthetic_ai_campaign_authorities SET enabled=true,disabled_at=NULL,
    expires_at=p_expires_at,process_run_commit=p_commit,campaign_cap_usd_nanos=6128969600
    WHERE id=campaign.id;
  RETURN inserted.result;
END $$;

REVOKE ALL ON FUNCTION public.process_evidence_renew_provider_run_after_use(
  uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,
  uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_evidence_renew_provider_run_after_use(
  uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,
  uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint
) TO service_role;

COMMENT ON FUNCTION public.process_evidence_renew_provider_run_after_use(
  uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,
  uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint
) IS 'Adds one immutable short-lived window to the retained post-use process-evidence campaign chain without resetting cumulative 2/4/7, 13-call, or USD 6.1289696 reserved ceilings. Provider runtimes remain off for the controller.';

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261105024717';
  new_tip text:='20261105041249';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261105041249'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261105041249');
END
$process_evidence_identity_forward$;
