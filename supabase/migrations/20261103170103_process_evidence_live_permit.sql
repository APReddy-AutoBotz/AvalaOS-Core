-- A new synthetic target can opt into the one-day process-evidence run.
-- No target, route, credential, authority or reservation is created by migration.
ALTER TABLE public.synthetic_ai_campaign_authorities
  ADD COLUMN process_run_commit text,
  ADD COLUMN process_run_assess_actor uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN process_run_studio_actor uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  DROP CONSTRAINT synthetic_ai_campaign_authorities_campaign_cap_usd_nanos_check,
  DROP CONSTRAINT synthetic_ai_campaign_authorities_carried_usd_nanos_check,
  DROP CONSTRAINT synthetic_ai_campaign_authorities_check3,
  DROP CONSTRAINT synthetic_ai_campaign_authorities_check4,
  ADD CONSTRAINT synthetic_ai_campaign_financial_profile CHECK (
    (process_run_commit IS NULL AND process_run_assess_actor IS NULL AND process_run_studio_actor IS NULL
     AND campaign_cap_usd_nanos=10000000000 AND carried_usd_nanos=869320000
     AND carried_usd_nanos+19*fixed_debit_usd_nanos<=campaign_cap_usd_nanos
     AND carried_usd_nanos+20*fixed_debit_usd_nanos>campaign_cap_usd_nanos)
    OR (process_run_commit IS NOT NULL AND process_run_commit~'^[0-9a-f]{40}$'
        AND process_run_assess_actor IS NOT NULL AND process_run_studio_actor IS NOT NULL
        AND process_run_assess_actor<>operator_actor_id AND process_run_studio_actor<>operator_actor_id
        AND process_run_assess_actor<>process_run_studio_actor
        AND campaign_cap_usd_nanos=4000000000 AND carried_usd_nanos=0)
  );

-- The unique slot is also a backstop for a caller using an older transaction
-- snapshot. Even then two effects cannot both occupy the last allowed slot.
ALTER TABLE public.synthetic_ai_campaign_effect_debits ADD COLUMN process_run_slot smallint
  CHECK (process_run_slot IS NULL OR process_run_slot BETWEEN 1 AND
    CASE operation WHEN 'provider.validate' THEN 1 WHEN 'assess.evidence.extract' THEN 2
      WHEN 'studio.document.generate' THEN 5 ELSE 0 END);
CREATE UNIQUE INDEX process_evidence_provider_operation_slot
  ON public.synthetic_ai_campaign_effect_debits(campaign_id,operation,process_run_slot)
  WHERE process_run_slot IS NOT NULL;

-- Reserve against the existing immutable debit ledger before any provider
-- effect. No success or settlement filter: failed/unknown attempts count.
CREATE FUNCTION public.process_evidence_guard_provider_debit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  campaign public.synthetic_ai_campaign_authorities;
  operation_limit integer;
  expected_actor uuid;
  operation_count integer;
  total_count integer;
  reserved bigint;
BEGIN
  SELECT * INTO STRICT campaign FROM public.synthetic_ai_campaign_authorities
    WHERE id=NEW.campaign_id FOR UPDATE;
  IF campaign.process_run_commit IS NULL THEN RETURN NEW; END IF;
  IF NOT campaign.enabled OR campaign.expires_at<=clock_timestamp()
    OR NEW.workspace_id<>campaign.workspace_id OR NEW.org_id<>campaign.org_id THEN
    RAISE EXCEPTION 'PROCESS_EVIDENCE_PERMIT_INACTIVE';
  END IF;
  CASE NEW.operation
    WHEN 'provider.validate' THEN operation_limit:=1; expected_actor:=campaign.operator_actor_id;
    WHEN 'assess.evidence.extract' THEN operation_limit:=2; expected_actor:=campaign.process_run_assess_actor;
    WHEN 'studio.document.generate' THEN operation_limit:=5; expected_actor:=campaign.process_run_studio_actor;
    ELSE RAISE EXCEPTION 'PROCESS_EVIDENCE_OPERATION_DENIED';
  END CASE;
  IF NEW.actor_id IS DISTINCT FROM expected_actor THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_ACTOR_DENIED'; END IF;
  IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
  SELECT count(*),count(*) FILTER(WHERE d.operation=NEW.operation),COALESCE(sum(d.debit_usd_nanos),0)
    INTO total_count,operation_count,reserved
    FROM public.synthetic_ai_campaign_effect_debits d WHERE d.campaign_id=campaign.id;
  IF total_count>=8 OR operation_count>=operation_limit OR NEW.debit_usd_nanos<>campaign.fixed_debit_usd_nanos
    OR reserved+NEW.debit_usd_nanos>campaign.campaign_cap_usd_nanos THEN
    RAISE EXCEPTION 'PROCESS_EVIDENCE_PERMIT_EXHAUSTED';
  END IF;
  NEW.process_run_slot:=operation_count+1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.process_evidence_guard_provider_debit() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER process_evidence_guard_provider_debit
  BEFORE INSERT OR UPDATE OF consumed_at ON public.synthetic_ai_campaign_effect_debits
  FOR EACH ROW EXECUTE FUNCTION public.process_evidence_guard_provider_debit();

-- Operator-only setup, in a single transaction. The existing bootstrap
-- requires an empty nonproduction target and binds the host, routes, model,
-- active tenant authority and server-only key reference. No key value here.
CREATE FUNCTION public.process_evidence_open_provider_run(
  p_operator uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,
  p_target_fingerprint text,p_project_ref text,p_approval_digest text,p_secret_reference text,
  p_provider_config uuid,p_key_ref uuid,p_assess_route uuid,p_studio_route uuid,p_expires_at timestamptz,
  p_commit text,p_assess_actor uuid,p_studio_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE created jsonb; actor uuid;
BEGIN
  IF p_commit IS NULL OR p_commit!~'^[0-9a-f]{40}$' OR p_expires_at IS NULL
    OR p_expires_at<=clock_timestamp() OR p_expires_at>statement_timestamp()+interval '24 hours'
    OR (SELECT count(DISTINCT id) FROM unnest(ARRAY[p_operator,p_assess_actor,p_studio_actor]) id)<>3
    THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RUN_BINDING_INVALID'; END IF;
  FOREACH actor IN ARRAY ARRAY[p_assess_actor,p_studio_actor] LOOP
    IF NOT EXISTS(SELECT 1 FROM public.workspace_memberships member
      WHERE member.org_id=p_org AND member.workspace_id=p_workspace AND member.user_id=actor AND member.status='active')
      THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_ACTOR_DENIED'; END IF;
  END LOOP;
  created:=public.synthetic_ai_campaign_bootstrap(p_operator,p_org,p_workspace,p_authorization_version,
    p_target_fingerprint,p_project_ref,p_approval_digest,p_secret_reference,
    p_provider_config,p_key_ref,p_assess_route,p_studio_route,p_expires_at);
  UPDATE public.synthetic_ai_campaign_authorities SET process_run_commit=p_commit,
    process_run_assess_actor=p_assess_actor,process_run_studio_actor=p_studio_actor,
    campaign_cap_usd_nanos=4000000000,carried_usd_nanos=0
    WHERE id=(created->>'campaignId')::uuid AND process_run_commit IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROCESS_EVIDENCE_RUN_BINDING_INVALID'; END IF;
  RETURN created || jsonb_build_object('capUsdNanos',4000000000,'carriedUsdNanos',0,'commit',p_commit,
    'expiresAt',p_expires_at,'maxCalls',8,'validation',1,'extractions',2,'studio',5);
END $$;
REVOKE ALL ON FUNCTION public.process_evidence_open_provider_run(uuid,uuid,uuid,bigint,text,text,text,text,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261103170102';
  new_tip text:='20261103170103';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261103170103'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261103170103');
END
$process_evidence_identity_forward$;
