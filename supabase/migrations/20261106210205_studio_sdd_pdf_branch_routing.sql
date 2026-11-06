BEGIN;

-- Route only an exact approved SDD V2 system document to the renderer that
-- includes the governed As-Is and To-Be branches. Historical receipts and
-- every legacy/non-SDD rendition keep their existing renderer identities.
DO $studio_sdd_pdf_branch_precondition$
DECLARE
  marker public.hosted_pilot_environment_identity;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT marker
  FROM public.hosted_pilot_environment_identity
  WHERE singleton
  FOR UPDATE;

  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261106191539'
    OR marker.production_authorized OR marker.customer_data_authorized OR marker.real_provider_calls_authorized
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
    OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
    OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
  THEN
    RAISE EXCEPTION 'STUDIO_SDD_PDF_BRANCH_PRECONDITION';
  END IF;
END
$studio_sdd_pdf_branch_precondition$;

DO $studio_sdd_pdf_branch_routing$
DECLARE
  procedure_name regprocedure:='public.studio_private_artifact_command_claim(jsonb)'::regprocedure;
  definition text;
  old_source text;
  replacement text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
      'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
      'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
      'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
      'kind',procedure_row.prokind,'returnType',procedure_row.prorettype)
  INTO STRICT definition,metadata_before
  FROM pg_proc procedure_row
  WHERE procedure_row.oid=procedure_name;

  old_source:=$old$  IF NOT COALESCE(is_v2_system_document, false) THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id$old$;
  replacement:=$new$  IF NOT COALESCE(is_v2_system_document, false) THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF format_name='pdf' AND artifact_type='sdd' THEN
    renderer:='studio-pdf-3';
  END IF;
  IF (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id$new$;
  IF (length(definition)-length(replace(definition,old_source,'')))/length(old_source)<>1
  THEN
    RAISE EXCEPTION 'STUDIO_SDD_PDF_BRANCH_SOURCE_MISMATCH';
  END IF;

  EXECUTE replace(definition,old_source,replacement);
  SELECT jsonb_build_object('owner',procedure_row.proowner,'securityDefiner',procedure_row.prosecdef,
    'leakproof',procedure_row.proleakproof,'strict',procedure_row.proisstrict,
    'volatility',procedure_row.provolatile,'parallel',procedure_row.proparallel,
    'config',procedure_row.proconfig,'acl',procedure_row.proacl,'language',procedure_row.prolang,
    'kind',procedure_row.prokind,'returnType',procedure_row.prorettype)
  INTO STRICT metadata_after
  FROM pg_proc procedure_row
  WHERE procedure_row.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before THEN
    RAISE EXCEPTION 'STUDIO_SDD_PDF_BRANCH_AUTHORITY_DRIFT';
  END IF;
END
$studio_sdd_pdf_branch_routing$;

COMMENT ON FUNCTION public.studio_private_artifact_command_claim(jsonb) IS
  'Service-only command authority. Exact system-template V2 content derives renderer-2 server-side, except exact SDD V2 PDF uses renderer-3 for governed As-Is/To-Be branches; contractless historical content remains on renderer-1.';

-- Advance every routine that binds the exact installed migration identity.
DO $studio_sdd_pdf_branch_identity$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106191539';
  new_tip text:='20261106210205';
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
      RAISE EXCEPTION 'STUDIO_SDD_PDF_BRANCH_FUNCTION_SOURCE_MISMATCH:%',procedure_name;
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
      RAISE EXCEPTION 'STUDIO_SDD_PDF_BRANCH_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;
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
      '20261106070101','20261106153001','20261106170001','20261106190001','20261106191539','20261106210205'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK (migration_tip IN (
      '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101',
      '20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003',
      '20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001',
      '20261106190001','20261106191539','20261106210205'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
      CHECK(migration_tip='20261106210205');
END
$studio_sdd_pdf_branch_identity$;

NOTIFY pgrst,'reload schema';
COMMIT;
