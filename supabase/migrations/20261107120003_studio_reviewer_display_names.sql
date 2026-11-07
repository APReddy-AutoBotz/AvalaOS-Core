BEGIN;
-- Display the profile name in the existing eligible reviewer list.
CREATE OR REPLACE FUNCTION public.studio_artifact_eligible_reviewers(p_org_id uuid,p_workspace_id uuid,p_artifact_id uuid,p_artifact_version_id uuid)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('actorId',p.id,'displayName',COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.email),''),p.id::text))
 FROM public.studio_artifact_aggregates a
 JOIN public.studio_artifact_versions v ON v.id=p_artifact_version_id AND v.artifact_id=a.id AND v.org_id=a.org_id AND v.workspace_id=a.workspace_id
 JOIN public.profiles p ON p.id<>a.created_by AND p.id<>v.author_id
 WHERE a.id=p_artifact_id AND a.org_id=p_org_id AND a.workspace_id=p_workspace_id
  AND a.current_version_id=v.id AND v.lifecycle='reviewer_ready'
  AND public.has_workspace_capability(p_workspace_id,p_org_id,'studio.artifacts.review')
  AND p.status='active' AND p.deleted_at IS NULL
  AND public.pr1e_actor_has_workspace_capability(p.id,p_org_id,p_workspace_id,'studio.artifacts.review')
 ORDER BY COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.email),''),p.id::text),p.id
$$;

DO $business_review_identity$
DECLARE procedure_name regprocedure;definition text;old_tip text:='20261107110000';new_tip text:='20261107120003';
 old_count integer;new_count integer;metadata_before jsonb;metadata_after jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity WHERE singleton AND migration_tip=old_tip
   AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized)
 THEN RAISE EXCEPTION 'BUSINESS_REVIEW_IDENTITY_PRECONDITION';END IF;
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
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),jsonb_build_object(
   'owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,
   'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
  old_count:=(length(definition)-length(replace(definition,old_tip,'')))/length(old_tip);
  new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
  IF old_count<>1 OR new_count<>0 THEN RAISE EXCEPTION 'BUSINESS_REVIEW_FUNCTION_SOURCE_MISMATCH:%',procedure_name;END IF;
  EXECUTE replace(definition,old_tip,new_tip);
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,'strict',p.proisstrict,
   'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before THEN RAISE EXCEPTION 'BUSINESS_REVIEW_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;END IF;
 END LOOP;
 ALTER TABLE public.pr_c_controlled_human_exercises DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
 ALTER TABLE public.pr_c_controlled_human_exercises ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK(migration_tip IN(
  '20260904120000','20260924113000','20260926053818','20260928060000','20261003015246','20261003055918','20261003123459','20261003150800',
  '20261004025101','20261004112232','20261008022445','20261009162752','20261010025331','20261010051100','20261010051413','20261010144356',
  '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717',
  '20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001','20261106012002',
  '20261106012003','20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001','20261106190001',
  '20261106191539','20261106210205','20261107110000','20261107120003'));
 ALTER TABLE public.authenticated_synthetic_exercises DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
 ALTER TABLE public.authenticated_synthetic_exercises ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip IN(
  '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103',
  '20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004','20261106012001',
  '20261106012002','20261106012003','20261106020001','20261106040803','20261106045007','20261106070101','20261106153001','20261106170001',
  '20261106190001','20261106191539','20261106210205','20261107110000','20261107120003'));
 ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
 UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
 ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check CHECK(migration_tip='20261107120003');
END $business_review_identity$;

NOTIFY pgrst,'reload schema';
COMMIT;
