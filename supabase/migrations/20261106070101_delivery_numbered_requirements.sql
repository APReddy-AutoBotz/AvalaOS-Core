BEGIN;

-- Numbered statements are requirements only inside an explicit Requirements
-- section and only when they begin with a bounded imperative verb. Explicit
-- REQ/BR/FR/NFR/AC identities remain valid in other non-excluded sections.
-- The deterministic Assess source-facts tail is evidence, never work-item input.
DO $delivery_numbered_requirements$
DECLARE
  procedure_name regprocedure := 'public.studio_delivery_apply_requirement_command(uuid,uuid,uuid,bigint,uuid,text,text,jsonb)'::regprocedure;
  definition text;
  old text;
  replacement text;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
    jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;

  old:=$old$ section_body text;line_match boolean;$old$;
  replacement:=$new$ section_body text;line_match boolean;document_has_explicit_requirements boolean;
 section_is_explicit_requirement boolean;duplicate_numbered_identity text;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_DECLARATION_MISMATCH';
  END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$ IF publication.id IS NULL OR artifact_version.id IS NULL OR artifact_version.lifecycle<>'approved' THEN
  RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND';
 END IF;

 FOR item,item_index IN$old$;
  replacement:=$new$ IF publication.id IS NULL OR artifact_version.id IS NULL OR artifact_version.lifecycle<>'approved' THEN
  RAISE EXCEPTION 'STUDIO_DELIVERY_NOT_FOUND';
 END IF;

  SELECT EXISTS(
  SELECT 1 FROM jsonb_array_elements(artifact_version.content->'sections') section
  WHERE (regexp_replace(regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g'),'[-_]+',' ','g')||' '||(section->>'title'))
    ~* '(^|[[:space:]])requirements?([[:space:]]|$)'
   AND (regexp_replace(regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g'),'[-_]+',' ','g')||' '||(section->>'title'))
    !~* '(^|[^a-z])(questions?|assumptions?|proposals?|flows?|diagrams?)([^a-z]|$)'
   AND COALESCE(section->>'body',section->>'content') !~* '(^|\n)[[:space:]]*(flowchart|graph)[[:space:]]+'
 ) INTO document_has_explicit_requirements;
 IF document_has_explicit_requirements THEN
  SELECT candidate.numbered_identity INTO duplicate_numbered_identity
  FROM (
   SELECT (regexp_match(btrim(source_line),'^([0-9]+)[.)][[:space:]]+'))[1] numbered_identity
   FROM jsonb_array_elements(artifact_version.content->'sections') section
   CROSS JOIN LATERAL regexp_split_to_table(COALESCE(section->>'body',section->>'content'),E'\\r?\\n')
    WITH ORDINALITY source(source_line,line_ordinal)
   WHERE (regexp_replace(regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g'),'[-_]+',' ','g')||' '||(section->>'title'))
      ~* '(^|[[:space:]])requirements?([[:space:]]|$)'
    AND (regexp_replace(regexp_replace(COALESCE(section->>'id',section->>'key'),'([a-z])([A-Z])',E'\\1 \\2','g'),'[-_]+',' ','g')||' '||(section->>'title'))
      !~* '(^|[^a-z])(questions?|assumptions?|proposals?|flows?|diagrams?)([^a-z]|$)'
    AND COALESCE(section->>'body',section->>'content') !~* '(^|\n)[[:space:]]*(flowchart|graph)[[:space:]]+'
    AND line_ordinal<COALESCE((SELECT min(sentinel_ordinal)
      FROM regexp_split_to_table(COALESCE(section->>'body',section->>'content'),E'\\r?\\n')
       WITH ORDINALITY sentinel(sentinel_line,sentinel_ordinal)
      WHERE btrim(sentinel_line)='Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):'),2147483647)
    AND btrim(source_line)!~*'^([0-9]+[.)][[:space:]]*)?(REQ|BR|FR|NFR|AC)[-_ ]?[0-9]+[[:space:]]*[:.-]'
    AND btrim(source_line)!~'\?$'
    AND btrim(source_line)!~*'^([0-9]+[.)][[:space:]]*)?((open[[:space:]]+)?question|assume|assumption|proposal|proposed|speculative)([[:space:]:.-]|$)'
    AND length(btrim(source_line)) BETWEEN 1 AND 2000
    AND (btrim(source_line)~*'^[0-9]+[.)][[:space:]]+(accept|acknowledge|address|allow|apply|approve|assign|authenticate|authorize|calculate|capture|classify|collect|compare|complete|configure|confirm|create|detect|disable|display|document|draft|enforce|ensure|exclude|extract|generate|handle|identify|import|keep|log|maintain|notify|persist|preserve|prevent|publish|record|reject|require|resolve|restrict|retain|retrieve|review|route|save|send|store|support|track|update|use|validate|verify|withhold)([^a-z]|$)'
     OR btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')
  ) candidate
  GROUP BY candidate.numbered_identity HAVING count(*)>1 LIMIT 1;
  IF duplicate_numbered_identity IS NOT NULL THEN RAISE EXCEPTION 'STUDIO_DELIVERY_INVALID_COMMAND';END IF;
 END IF;

 FOR item,item_index IN$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_CONTEXT_MISMATCH';
  END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$   AND COALESCE(section->>'body',section->>'content') !~* '(^|\n)[[:space:]]*(flowchart|graph)[[:space:]]+';
   SELECT EXISTS(SELECT 1 FROM regexp_split_to_table(COALESCE(section_body,''),E'\\r?\\n') source_line$old$;
  replacement:=$new$   AND COALESCE(section->>'body',section->>'content') !~* '(^|\n)[[:space:]]*(flowchart|graph)[[:space:]]+';
   section_is_explicit_requirement:=COALESCE(
    (regexp_replace(regexp_replace(btrim(link->>'sectionId'),'([a-z])([A-Z])',E'\\1 \\2','g'),'[-_]+',' ','g')||' '||btrim(link->>'sectionTitle'))
      ~* '(^|[[:space:]])requirements?([[:space:]]|$)',false);
   IF item->>'proposalRole'<>'discovery' AND section_body IS NOT NULL THEN
    SELECT COALESCE(string_agg(source_line,E'\n' ORDER BY line_ordinal),'') INTO section_body
    FROM regexp_split_to_table(section_body,E'\\r?\\n') WITH ORDINALITY source(source_line,line_ordinal)
    WHERE line_ordinal<COALESCE((SELECT min(sentinel_ordinal)
      FROM regexp_split_to_table(section_body,E'\\r?\\n') WITH ORDINALITY sentinel(sentinel_line,sentinel_ordinal)
      WHERE btrim(sentinel_line)='Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):'),2147483647);
   END IF;
   SELECT EXISTS(SELECT 1 FROM regexp_split_to_table(COALESCE(section_body,''),E'\\r?\\n') source_line$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_SENTINEL_MISMATCH';
  END IF;
  definition:=replace(definition,old,replacement);

  old:=$old$OR btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')))) INTO line_match;$old$;
  replacement:=$new$OR ((NOT document_has_explicit_requirements OR section_is_explicit_requirement)
       AND btrim(source_line)~*'(^|[[:space:]])(must|shall|required to|needs to)([[:space:]]|$)')
      OR (document_has_explicit_requirements AND section_is_explicit_requirement
       AND btrim(source_line)~*'^[0-9]+[.)][[:space:]]+(accept|acknowledge|address|allow|apply|approve|assign|authenticate|authorize|calculate|capture|classify|collect|compare|complete|configure|confirm|create|detect|disable|display|document|draft|enforce|ensure|exclude|extract|generate|handle|identify|import|keep|log|maintain|notify|persist|preserve|prevent|publish|record|reject|require|resolve|restrict|retain|retrieve|review|route|save|send|store|support|track|update|use|validate|verify|withhold)([^a-z]|$)'))))) INTO line_match;$new$;
  IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_PREDICATE_MISMATCH';
  END IF;
  definition:=replace(definition,old,replacement);

  EXECUTE definition;
  SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
    'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
  INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
  IF metadata_after IS DISTINCT FROM metadata_before THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_AUTHORITY_DRIFT';
  END IF;
END
$delivery_numbered_requirements$;

-- Converge the dedicated synthetic identity from the installed 125 marker to
-- this migration. Each routine must contain exactly one old tip, and every
-- execution attribute and ACL must survive CREATE OR REPLACE unchanged.
DO $delivery_numbered_requirements_identity$
DECLARE
  procedure_name regprocedure;
  definition text;
  function_old_tip text := '20261106045007';
  marker_old_tip text := '20261106045007';
  new_tip text := '20261106070101';
  old_count integer;
  new_count integer;
  metadata_before jsonb;
  metadata_after jsonb;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key='avalaos-core' AND environment_class='hosted_nonproduction_pilot'
      AND schema_contract='hosted-pilot-2026-08' AND migration_tip=marker_old_tip
      AND NOT production_authorized AND NOT customer_data_authorized AND NOT real_provider_calls_authorized
  ) OR EXISTS (SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active') THEN
    RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_IDENTITY_PRECONDITION';
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
    SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10)),
      jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
        'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
    INTO STRICT definition,metadata_before FROM pg_proc p WHERE p.oid=procedure_name;
    old_count:=(length(definition)-length(replace(definition,function_old_tip,'')))/length(function_old_tip);
    new_count:=(length(definition)-length(replace(definition,new_tip,'')))/length(new_tip);
    IF old_count<>1 OR new_count<>0 THEN
      RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_FUNCTION_SOURCE_MISMATCH:%',procedure_name;
    END IF;
    EXECUTE replace(definition,function_old_tip,new_tip);
    SELECT jsonb_build_object('owner',p.proowner,'securityDefiner',p.prosecdef,'leakproof',p.proleakproof,
      'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl)
    INTO STRICT metadata_after FROM pg_proc p WHERE p.oid=procedure_name;
    IF metadata_after IS DISTINCT FROM metadata_before THEN
      RAISE EXCEPTION 'DELIVERY_NUMBERED_REQUIREMENTS_FUNCTION_AUTHORITY_DRIFT:%',procedure_name;
    END IF;
  END LOOP;

  ALTER TABLE public.pr_c_controlled_human_exercises DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
  ALTER TABLE public.pr_c_controlled_human_exercises ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check
    CHECK (migration_tip IN (
      '20260904120000','20260924113000','20260926053818','20260928060000','20261003015246','20261003055918',
      '20261003123459','20261003150800','20261004025101','20261004112232','20261008022445','20261009162752',
      '20261010025331','20261010051100','20261010051413','20261010144356','20261011053000','20261019161723',
      '20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717',
      '20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004',
      '20261106012001','20261106012002','20261106012003','20261106020001','20261106040803','20261106045007',
      '20261106070101'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK (migration_tip IN (
      '20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101',
      '20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001','20261106012002','20261106012003',
      '20261106020001','20261106040803','20261106045007','20261106070101'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK (migration_tip='20261106070101');
END
$delivery_numbered_requirements_identity$;

NOTIFY pgrst,'reload schema';
COMMIT;
