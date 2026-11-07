BEGIN;

-- Restore the provider-free authenticated synthetic plan branch removed when
-- the SDD-only prompt was added. The synthetic contract remains prompt-v1;
-- prompt-v4 is available only to a fully bound provider plan.
DO $studio_synthetic_prompt_precondition$
DECLARE
  marker public.hosted_pilot_environment_identity;
  constraint_definition text;
  constraint_validated boolean;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT marker
  FROM public.hosted_pilot_environment_identity
  WHERE singleton
  FOR UPDATE;

  SELECT pg_get_constraintdef(constraint_row.oid,false),constraint_row.convalidated
  INTO STRICT constraint_definition,constraint_validated
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid='public.studio_artifact_generation_attempts'::regclass
    AND constraint_row.conname='studio_generation_provider_plan_check'
    AND constraint_row.contype='c';

  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261106190001'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
    OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
    OR NOT constraint_validated
    OR position('studio-pr-b-4' IN constraint_definition)=0
    OR position('authenticated_synthetic' IN constraint_definition)<>0
  THEN
    RAISE EXCEPTION 'STUDIO_SYNTHETIC_PROMPT_COMPATIBILITY_PRECONDITION';
  END IF;
END
$studio_synthetic_prompt_precondition$;

ALTER TABLE public.studio_artifact_generation_attempts
  DROP CONSTRAINT studio_generation_provider_plan_check,
  ADD CONSTRAINT studio_generation_provider_plan_check CHECK(
    (provider_plan_state='legacy_unverified' AND transport_kind='provider'
      AND provider_route_id IS NULL AND provider_config_id IS NULL AND provider_name IS NULL AND provider_model IS NULL
      AND prompt_key IS NULL AND prompt_version IS NULL AND provider_plan_hash IS NULL AND authenticated_synthetic_permit_id IS NULL)
    OR(provider_plan_state='bound' AND transport_kind='provider' AND authenticated_synthetic_permit_id IS NULL
      AND provider_route_id IS NOT NULL AND provider_config_id IS NOT NULL
      AND provider_name IN('openai','azure_openai','anthropic','gemini','groq','openai_compatible')
      AND length(btrim(provider_model)) BETWEEN 1 AND 200
      AND prompt_key IS NOT NULL AND prompt_version IS NOT NULL AND provider_plan_hash IS NOT NULL
      AND prompt_key='studio-multisource-generation'
      AND prompt_version IN('studio-pr-b-1','studio-pr-b-2','studio-pr-b-3','studio-pr-b-4')
      AND provider_plan_hash~'^[0-9a-f]{64}$')
    OR(provider_plan_state='authenticated_synthetic' AND transport_kind='authenticated_synthetic'
      AND authenticated_synthetic_permit_id IS NOT NULL AND provider_route_id IS NULL AND provider_config_id IS NULL
      AND provider_name IS NULL AND provider_model IS NULL AND prompt_key='studio-multisource-generation'
      AND prompt_version='studio-pr-b-1' AND provider_plan_hash~'^[0-9a-f]{64}$')
  );

-- Converge every routine that binds the exact installed migration identity.
-- Function metadata is part of the authority contract and must not drift.
DO $studio_synthetic_prompt_compatibility_identity$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106190001';
  new_tip text:='20261106191539';
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
      jsonb_build_object('owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
        'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
        'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
        'config',procedure_row.proconfig,'acl',procedure_row.proacl)
    INTO STRICT definition,metadata_before
    FROM pg_proc procedure_row
    WHERE procedure_row.oid=procedure_name;

    old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
    new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
    IF old_count<>1 OR new_count<>0 THEN
      RAISE EXCEPTION 'STUDIO_SYNTHETIC_PROMPT_COMPATIBILITY_FUNCTION_SOURCE_MISMATCH:%',procedure_name;
    END IF;

    EXECUTE replace(definition,old_tip,new_tip);
    SELECT jsonb_build_object('owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl)
    INTO STRICT metadata_after
    FROM pg_proc procedure_row
    WHERE procedure_row.oid=procedure_name;
    IF metadata_after IS DISTINCT FROM metadata_before THEN
      RAISE EXCEPTION 'STUDIO_SYNTHETIC_PROMPT_COMPATIBILITY_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;
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
      '20261106070101','20261106153001','20261106170001','20261106190001','20261106191539'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK (migration_tip IN (
      '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101',
      '20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003',
      '20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001',
      '20261106190001','20261106191539'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
      CHECK(migration_tip='20261106191539');
END
$studio_synthetic_prompt_compatibility_identity$;

NOTIFY pgrst,'reload schema';
COMMIT;
