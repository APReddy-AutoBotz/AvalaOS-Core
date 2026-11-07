-- Route new renditions of every exact approved system document to renderer 4.
-- Historical renderer 1, 2 and 3 rows and object identities remain immutable.
--
-- Rollback: stop requesting renderer 4 and keep serving existing approved
-- renderer 1/2/3 renditions. Change installed routing only through a later
-- forward migration.

BEGIN;

DO $studio_pdf4_precondition$
DECLARE marker public.hosted_pilot_environment_identity;
BEGIN
 LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity
  WHERE singleton FOR UPDATE;
 IF marker.product_key<>'avalaos-core'
  OR marker.environment_class<>'hosted_nonproduction_pilot'
  OR marker.schema_contract<>'hosted-pilot-2026-08'
  OR marker.migration_tip<>'20261107110000'
  OR marker.production_authorized OR marker.customer_data_authorized
  OR marker.real_provider_calls_authorized
  OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
  OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
  OR (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton)
  OR (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
 THEN RAISE EXCEPTION 'STUDIO_PDF4_PRECONDITION';END IF;
END $studio_pdf4_precondition$;

DO $studio_pdf4_routing$
DECLARE
 procedure_name regprocedure:='public.studio_private_artifact_command_claim(jsonb)'::regprocedure;
 definition text;old_source text;replacement text;metadata_before jsonb;metadata_after jsonb;
BEGIN
 SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
  jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,
   'leakproof',p.proleakproof,'strict',p.proisstrict,'volatility',p.provolatile,
   'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl,
   'language',p.prolang,'kind',p.prokind,'returnType',p.prorettype)
 INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
 old_source:=$old$  IF NOT COALESCE(is_v2_system_document, false) THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF format_name='pdf' AND artifact_type='sdd' THEN
    renderer:='studio-pdf-3';
  END IF;
  IF (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id$old$;
 replacement:=$new$  IF NOT COALESCE(is_v2_system_document, false) THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF format_name='pdf' THEN
    renderer:='studio-pdf-4';
  END IF;
  IF (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id$new$;
 IF (length(definition)-length(replace(definition,old_source,'')))/length(old_source)<>1
 THEN RAISE EXCEPTION 'STUDIO_PDF4_SOURCE_MISMATCH';END IF;
 EXECUTE replace(definition,old_source,replacement);
 SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,
   'leakproof',p.proleakproof,'strict',p.proisstrict,'volatility',p.provolatile,
   'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl,
   'language',p.prolang,'kind',p.prokind,'returnType',p.prorettype)
 INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
 IF metadata_after IS DISTINCT FROM metadata_before
 THEN RAISE EXCEPTION 'STUDIO_PDF4_AUTHORITY_DRIFT';END IF;
END $studio_pdf4_routing$;

COMMENT ON FUNCTION public.studio_private_artifact_command_claim(jsonb) IS
 'Service-only command authority. Exact system-template V2 PDFs use renderer 4 for readable business prose and governed flow labels; historical renderer identities remain immutable.';

NOTIFY pgrst,'reload schema';
COMMIT;
