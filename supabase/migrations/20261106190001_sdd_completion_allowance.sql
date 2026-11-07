BEGIN;

-- Add one SDD-specific prompt identity and one cumulative completion profile.
-- Historical prompt plans, windows, reservations and debits remain immutable.
DO $sdd_completion_precondition$
DECLARE marker public.hosted_pilot_environment_identity;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity WHERE singleton FOR UPDATE;
  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261106170001'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
    OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
  THEN RAISE EXCEPTION 'SDD_COMPLETION_PRECONDITION'; END IF;
END
$sdd_completion_precondition$;

ALTER TABLE public.studio_artifact_generation_attempts
  DROP CONSTRAINT studio_generation_provider_plan_check,
  ADD CONSTRAINT studio_generation_provider_plan_check CHECK(
    (provider_plan_state='legacy_unverified' AND provider_route_id IS NULL AND provider_config_id IS NULL AND provider_name IS NULL AND provider_model IS NULL AND prompt_key IS NULL AND prompt_version IS NULL AND provider_plan_hash IS NULL)
    OR(provider_plan_state='bound' AND provider_route_id IS NOT NULL AND provider_config_id IS NOT NULL
      AND provider_name IN('openai','azure_openai','anthropic','gemini','groq','openai_compatible')
      AND length(btrim(provider_model)) BETWEEN 1 AND 200
      AND prompt_key IS NOT NULL AND prompt_version IS NOT NULL AND provider_plan_hash IS NOT NULL
      AND prompt_key='studio-multisource-generation'
      AND prompt_version IN('studio-pr-b-1','studio-pr-b-2','studio-pr-b-3','studio-pr-b-4')
      AND provider_plan_hash~'^[0-9a-f]{64}$')
  );

DO $sdd_completion_prompt_functions$
DECLARE
  procedure_name regprocedure;
  definition text;
  old text;
  replacement text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  procedure_name:='public.studio_artifact_generation_request_v2_base_20261103(jsonb)'::regprocedure;
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
      'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
  old:='prompt_version:=CASE artifact.artifact_type WHEN ''brd'' THEN ''studio-pr-b-3'' ELSE ''studio-pr-b-1'' END;';
  replacement:='prompt_version:=CASE artifact.artifact_type WHEN ''brd'' THEN ''studio-pr-b-3'' WHEN ''sdd'' THEN ''studio-pr-b-4'' ELSE ''studio-pr-b-1'' END;';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_REQUEST_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,old,replacement);
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
    'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before
  THEN RAISE EXCEPTION 'SDD_COMPLETION_REQUEST_AUTHORITY_DRIFT'; END IF;

  procedure_name:='public.studio_artifact_generation_claim_v2(uuid,uuid,integer)'::regprocedure;
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
      'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
  old:='attempt.prompt_version NOT IN(''studio-pr-b-1'',''studio-pr-b-2'',''studio-pr-b-3'')';
  replacement:='attempt.prompt_version NOT IN(''studio-pr-b-1'',''studio-pr-b-2'',''studio-pr-b-3'',''studio-pr-b-4'')';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_CLAIM_VERSION_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);
  old:='OR(attempt.prompt_version IN(''studio-pr-b-2'',''studio-pr-b-3'') AND artifact.artifact_type<>''brd'')';
  replacement:='OR(attempt.prompt_version IN(''studio-pr-b-2'',''studio-pr-b-3'') AND artifact.artifact_type<>''brd'')'||chr(10)||
    '    OR(attempt.prompt_version=''studio-pr-b-4'' AND artifact.artifact_type<>''sdd'')';
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_CLAIM_ARTIFACT_MISMATCH'; END IF;
  EXECUTE replace(definition,old,replacement);
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
    'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before
  THEN RAISE EXCEPTION 'SDD_COMPLETION_CLAIM_AUTHORITY_DRIFT'; END IF;
END
$sdd_completion_prompt_functions$;

-- Preserve every historical 13-call row while permitting only the exact
-- 17-call completion tuple on new immutable windows.
DO $sdd_completion_window_constraints$
DECLARE constraint_name name;
BEGIN
  FOR constraint_name IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid='public.process_evidence_provider_post_use_windows'::regclass
      AND con.contype='c' AND pg_get_expr(con.conbin,con.conrelid,false)
        ~ '(baseline_effects|baseline_reserved_usd_nanos|maximum_effects|maximum_reserved_usd_nanos|validation_effects|extraction_effects|studio_effects)'
  LOOP
    EXECUTE format('ALTER TABLE public.process_evidence_provider_post_use_windows DROP CONSTRAINT %I',constraint_name);
  END LOOP;
END
$sdd_completion_window_constraints$;

ALTER TABLE public.process_evidence_provider_post_use_windows
  ADD CONSTRAINT process_evidence_post_use_baseline_profile_check CHECK(
    baseline_effects BETWEEN 3 AND 16
    AND baseline_reserved_usd_nanos=baseline_effects*471459200::bigint),
  ADD CONSTRAINT process_evidence_post_use_limit_profile_check CHECK(
    (maximum_effects=13 AND maximum_reserved_usd_nanos=6128969600
      AND validation_effects=2 AND extraction_effects=4 AND studio_effects=7
      AND baseline_effects BETWEEN 3 AND 12)
    OR (maximum_effects=17 AND maximum_reserved_usd_nanos=8014806400
      AND validation_effects=2 AND extraction_effects=4 AND studio_effects=11
      AND baseline_effects BETWEEN 12 AND 16)),
  ADD CONSTRAINT process_evidence_post_use_maximum_debit_check
    CHECK(maximum_reserved_usd_nanos=maximum_effects*471459200::bigint);

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
        AND campaign_cap_usd_nanos IN(4000000000,6128969600,8014806400))
  );

DO $sdd_completion_slot_constraint$
DECLARE constraint_name name;
BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='public.synthetic_ai_campaign_effect_debits'::regclass
    AND contype='c' AND pg_get_expr(conbin,conrelid,false) LIKE '%process_run_slot%';
  EXECUTE format('ALTER TABLE public.synthetic_ai_campaign_effect_debits DROP CONSTRAINT %I',constraint_name);
END
$sdd_completion_slot_constraint$;
ALTER TABLE public.synthetic_ai_campaign_effect_debits
  ADD CONSTRAINT synthetic_ai_campaign_effect_debits_process_run_slot_check
  CHECK(process_run_slot IS NULL OR process_run_slot BETWEEN 1 AND
    CASE operation WHEN 'provider.validate' THEN 2 WHEN 'assess.evidence.extract' THEN 4
      WHEN 'studio.document.generate' THEN 11 ELSE 0 END);

DO $sdd_completion_debit_guard$
DECLARE
  procedure_name regprocedure:='public.process_evidence_guard_provider_debit()'::regprocedure;
  definition text;
  old text;
  replacement text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
      'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
  old:=$old$  IF renewal.id IS NULL THEN
    total_limit:=8; expected_cap:=4000000000;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 1
      WHEN 'assess.evidence.extract' THEN 2 WHEN 'studio.document.generate' THEN 5 ELSE 0 END;
  ELSE
    total_limit:=13; expected_cap:=6128969600;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 2
      WHEN 'assess.evidence.extract' THEN 4 WHEN 'studio.document.generate' THEN 7 ELSE 0 END;
  END IF;$old$;
  replacement:=$new$  IF renewal.id IS NULL THEN
    total_limit:=8; expected_cap:=4000000000;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 1
      WHEN 'assess.evidence.extract' THEN 2 WHEN 'studio.document.generate' THEN 5 ELSE 0 END;
  ELSIF renewal.maximum_effects=13 AND renewal.maximum_reserved_usd_nanos=6128969600
      AND renewal.validation_effects=2 AND renewal.extraction_effects=4 AND renewal.studio_effects=7 THEN
    total_limit:=13; expected_cap:=6128969600;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 2
      WHEN 'assess.evidence.extract' THEN 4 WHEN 'studio.document.generate' THEN 7 ELSE 0 END;
  ELSIF renewal.maximum_effects=17 AND renewal.maximum_reserved_usd_nanos=8014806400
      AND renewal.validation_effects=2 AND renewal.extraction_effects=4 AND renewal.studio_effects=11 THEN
    total_limit:=17; expected_cap:=8014806400;
    operation_limit:=CASE NEW.operation WHEN 'provider.validate' THEN 2
      WHEN 'assess.evidence.extract' THEN 4 WHEN 'studio.document.generate' THEN 11 ELSE 0 END;
  ELSE RAISE EXCEPTION 'PROCESS_EVIDENCE_PERMIT_INACTIVE';
  END IF;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_DEBIT_GUARD_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,old,replacement);
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
    'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before
  THEN RAISE EXCEPTION 'SDD_COMPLETION_DEBIT_GUARD_AUTHORITY_DRIFT'; END IF;
END
$sdd_completion_debit_guard$;

DO $sdd_completion_renewal$
DECLARE
  procedure_name regprocedure:=
    'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure;
  definition text;
  old text;
  replacement text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
      'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;

  old:=$old$  binding_digest_value text;
  result_value jsonb;$old$;
  replacement:=$new$  binding_digest_value text;
  result_value jsonb;
  completion_profile boolean;
  maximum_effects_value integer;
  maximum_reserved_value bigint;
  maximum_studio_value integer;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_DECLARATION_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    OR campaign.campaign_cap_usd_nanos<>(CASE
      WHEN prior_post_use.id IS NULL THEN 4000000000 ELSE 6128969600 END)$old$;
  replacement:=$new$    OR campaign.campaign_cap_usd_nanos<>(CASE
      WHEN prior_post_use.id IS NULL THEN 4000000000 ELSE prior_post_use.maximum_reserved_usd_nanos END)$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_CAP_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$  sequence_value:=COALESCE(prior_post_use.sequence_number,0)+1;
  IF debit_count NOT BETWEEN 3 AND 12 OR resolved_count<>debit_count$old$;
  replacement:=$new$  sequence_value:=COALESCE(prior_post_use.sequence_number,0)+1;
  completion_profile:=prior_post_use.maximum_effects=17
    OR (prior_post_use.maximum_effects=13 AND debit_count=12
      AND validation_count=2 AND extraction_count=4 AND studio_count=6);
  maximum_effects_value:=CASE WHEN completion_profile THEN 17 ELSE 13 END;
  maximum_reserved_value:=CASE WHEN completion_profile THEN 8014806400 ELSE 6128969600 END;
  maximum_studio_value:=CASE WHEN completion_profile THEN 11 ELSE 7 END;
  IF debit_count NOT BETWEEN 3 AND 16 OR debit_count>=maximum_effects_value OR resolved_count<>debit_count$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_PROFILE_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    OR validation_count NOT BETWEEN 1 AND 2 OR extraction_count NOT BETWEEN 2 AND 4
    OR studio_count NOT BETWEEN 0 AND 7 OR validation_count+extraction_count+studio_count<>debit_count
    OR p_verified_available_credit_usd_nanos<(13-debit_count)*471459200::bigint$old$;
  replacement:=$new$    OR validation_count NOT BETWEEN 1 AND 2 OR extraction_count NOT BETWEEN 2 AND 4
    OR studio_count NOT BETWEEN 0 AND maximum_studio_value
    OR validation_count+extraction_count+studio_count<>debit_count
    OR p_verified_available_credit_usd_nanos<(maximum_effects_value-debit_count)*471459200::bigint$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_LIMIT_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    OR (prior_post_use.id IS NOT NULL AND(
      debit_count<prior_post_use.baseline_effects OR sequence_value>10
      OR prior_post_use.maximum_effects<>13 OR prior_post_use.maximum_reserved_usd_nanos<>6128969600))$old$;
  replacement:=$new$    OR (prior_post_use.id IS NOT NULL AND(
      debit_count<prior_post_use.baseline_effects OR sequence_value>10
      OR NOT ((prior_post_use.maximum_effects=13 AND prior_post_use.maximum_reserved_usd_nanos=6128969600
        AND prior_post_use.validation_effects=2 AND prior_post_use.extraction_effects=4 AND prior_post_use.studio_effects=7)
        OR (prior_post_use.maximum_effects=17 AND prior_post_use.maximum_reserved_usd_nanos=8014806400
          AND prior_post_use.validation_effects=2 AND prior_post_use.extraction_effects=4 AND prior_post_use.studio_effects=11))))$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_PRIOR_PROFILE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$            OR debit.process_run_slot NOT BETWEEN 1 AND 7))))$old$;
  replacement:=$new$            OR debit.process_run_slot NOT BETWEEN 1 AND maximum_studio_value))))$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_SLOT_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  -- Only an immutable, exact spent-output-lost journal may coexist with an
  -- uncertain reservation. Generic uncertainty remains a hard stop.
  old:=$old$        AND (reservation.state='reserved'
          OR (reservation.state='uncertain' AND NOT EXISTS(
            SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost
            WHERE lost.reservation_id=reservation.id AND lost.attempt_id=reservation.studio_attempt_id))
          OR (reservation.state='released' AND reservation.release_reason IS NULL)$old$;
  replacement:=$new$        AND (reservation.state='reserved'
          OR (reservation.state='uncertain' AND NOT EXISTS(
            SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost
            WHERE lost.campaign_id=campaign.id AND lost.reservation_id=reservation.id
              AND lost.attempt_id=reservation.studio_attempt_id
              AND lost.org_id=p_org AND lost.workspace_id=p_workspace
              AND lost.provider_config_id=p_provider_config AND lost.key_ref_id=p_key_ref
              AND lost.route_id=p_studio_route AND lost.studio_actor_id=p_studio_actor
              AND lost.actual_usage_status='unknown' AND lost.disposition='spent_output_lost'))
          OR (reservation.state='released' AND reservation.release_reason IS NULL)$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_UNCERTAIN_SCAN_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$        AND (reservation.id IS NULL OR (reservation.state NOT IN('settled','released')
          AND NOT (reservation.state='uncertain' AND EXISTS(
            SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost
            WHERE lost.reservation_id=reservation.id AND lost.attempt_id=reservation.studio_attempt_id)))
          OR (reservation.state='settled' AND reservation.actual_total_tokens IS NULL)$old$;
  replacement:=$new$        AND (reservation.id IS NULL
          OR (reservation.state NOT IN('settled','released') AND NOT(
            reservation.state='uncertain' AND EXISTS(
              SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost
              WHERE lost.campaign_id=campaign.id AND lost.reservation_id=reservation.id
                AND lost.debit_id=debit.id AND lost.attempt_id=reservation.studio_attempt_id
                AND lost.org_id=p_org AND lost.workspace_id=p_workspace
                AND lost.provider_config_id=p_provider_config AND lost.key_ref_id=p_key_ref
                AND lost.route_id=p_studio_route AND lost.studio_actor_id=p_studio_actor
                AND lost.actual_usage_status='unknown' AND lost.disposition='spent_output_lost')))
          OR (reservation.state='settled' AND reservation.actual_total_tokens IS NULL)$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_UNCERTAIN_JOIN_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    'maxCalls',13,'maximumReservedUsdNanos',6128969600,
    'validation',2,'extractions',4,'studio',7,
    'remainingValidation',2-validation_count,'remainingExtractions',4-extraction_count,
    'remainingStudio',7-studio_count,$old$;
  replacement:=$new$    'maxCalls',maximum_effects_value,'maximumReservedUsdNanos',maximum_reserved_value,
    'validation',2,'extractions',4,'studio',maximum_studio_value,
    'remainingValidation',2-validation_count,'remainingExtractions',4-extraction_count,
    'remainingStudio',maximum_studio_value-studio_count,$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_RESULT_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    debit_count,debit_spend,13,6128969600,2,4,7,binding_digest_value,result_value,p_expires_at$old$;
  replacement:=$new$    debit_count,debit_spend,maximum_effects_value,maximum_reserved_value,2,4,maximum_studio_value,
    binding_digest_value,result_value,p_expires_at$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_INSERT_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$    expires_at=p_expires_at,process_run_commit=p_commit,campaign_cap_usd_nanos=6128969600$old$;
  replacement:=$new$    expires_at=p_expires_at,process_run_commit=p_commit,campaign_cap_usd_nanos=maximum_reserved_value$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_UPDATE_MISMATCH'; END IF;
  definition:=replace(definition,old,replacement);

  EXECUTE definition;
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
    'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before
  THEN RAISE EXCEPTION 'SDD_COMPLETION_RENEWAL_AUTHORITY_DRIFT'; END IF;
END
$sdd_completion_renewal$;

-- Converge the shared hosted identity while preserving function metadata.
DO $sdd_completion_identity$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106170001';
  new_tip text:='20261106190001';
  old_count integer;
  new_count integer;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
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
    SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
      jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
        'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
        'config',p.proconfig,'acl',p.proacl)
    INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
    old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
    new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
    IF old_count<>1 OR new_count<>0 THEN
      RAISE EXCEPTION 'SDD_COMPLETION_FUNCTION_SOURCE_MISMATCH:%',procedure_name;
    END IF;
    EXECUTE replace(definition,old_tip,new_tip);
    SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,
      'config',p.proconfig,'acl',p.proacl)
    INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
    IF metadata_after IS DISTINCT FROM metadata_before THEN
      RAISE EXCEPTION 'SDD_COMPLETION_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;
    END IF;
  END LOOP;

  ALTER TABLE public.pr_c_controlled_human_exercises
    DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
  ALTER TABLE public.pr_c_controlled_human_exercises
    ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK (migration_tip IN (
      '20260904120000','20260924113000','20260926053818','20260928060000','20261003015246','20261003055918',
      '20261003123459','20261003150800','20261004025101','20261004112232','20261008022445','20261009162752',
      '20261010025331','20261010051100','20261010051413','20261010144356','20261011053000','20261019161723',
      '20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717',
      '20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004',
      '20261106012001','20261106012002','20261106012003','20261106020001','20261106040803','20261106045007',
      '20261106070101','20261106153001','20261106170001','20261106190001'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK (migration_tip IN (
      '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101',
      '20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003',
      '20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001',
      '20261106190001'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
      CHECK(migration_tip='20261106190001');
END
$sdd_completion_identity$;

COMMENT ON FUNCTION public.process_evidence_renew_provider_run_after_use(
  uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,
  uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint
) IS 'Adds immutable short-lived windows without resetting cumulative usage. Historical 13-call windows remain valid; only the exact retained 12-call 2/4/6 ledger may enter the 17-call 2/4/11 SDD completion profile.';

NOTIFY pgrst,'reload schema';
COMMIT;
