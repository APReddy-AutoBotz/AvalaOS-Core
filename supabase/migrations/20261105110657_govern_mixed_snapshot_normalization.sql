-- Normalize mixed immutable Assess V2 snapshots without granting authority to
-- an interaction whose declared mode remains Unknown. Historical action-array
-- snapshots retain their existing projection; the narrow current-shape
-- exception permits a canonical Unknown/Not Applicable decision to project no
-- action authority at all.
DO $govern_mixed_snapshot_normalization$
DECLARE
  marker public.hosted_pilot_environment_identity;
  runtime_control public.assess_v2_runtime_control;
  prior_owner name;
  prior_acl aclitem[];
  prior_config text[];
  prior_security_definer boolean;
  prior_volatility "char";
  prior_definition text;
  decision_record record;
BEGIN
  LOCK TABLE public.assess_v2_runtime_control IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT runtime_control
  FROM public.assess_v2_runtime_control WHERE singleton FOR UPDATE;
  IF NOT runtime_control.read_only THEN
    RAISE EXCEPTION 'PR1E_GOVERN_MIXED_SNAPSHOT_MAINTENANCE_REQUIRED';
  END IF;

  LOCK TABLE public.assess_v2_decision_versions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assess_v2_review_resolutions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assess_v2_govern_resolutions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.assess_v2_studio_handoffs IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO STRICT marker
  FROM public.hosted_pilot_environment_identity WHERE singleton FOR UPDATE;
  SELECT r.rolname,p.proacl,p.proconfig,p.prosecdef,p.provolatile,
         replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10))
  INTO STRICT prior_owner,prior_acl,prior_config,prior_security_definer,
              prior_volatility,prior_definition
  FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure;

  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261105041249'
    OR marker.production_authorized OR marker.customer_data_authorized
    OR marker.real_provider_calls_authorized
    OR prior_security_definer OR prior_volatility<>'i'
    OR prior_config IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
    OR position('PR1E_GOVERN_ACTION_AUTHORITY_INVALID' in prior_definition)=0
    OR position('interactionDecisions' in prior_definition)=0
    OR position('actionControls' in prior_definition)=0
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
  THEN
    RAISE EXCEPTION 'PR1E_GOVERN_MIXED_SNAPSHOT_SOURCE_MISMATCH';
  END IF;

  CREATE OR REPLACE FUNCTION public.pr1e_normalize_govern_actions(
    p_input_snapshot jsonb,
    p_output_snapshot jsonb
  ) RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path=pg_catalog
  AS $function$
  DECLARE
    input_interactions jsonb;
    decisions jsonb;
    legacy_actions jsonb;
    normalized jsonb;
  BEGIN
    IF jsonb_typeof(p_input_snapshot) IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_output_snapshot) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';
    END IF;

    IF p_output_snapshot ? 'interactionDecisions' THEN
      IF p_output_snapshot ? 'actionControls'
        OR jsonb_typeof(p_input_snapshot->'interactions') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_output_snapshot->'interactionDecisions') IS DISTINCT FROM 'array'
      THEN RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';END IF;
      input_interactions:=p_input_snapshot->'interactions';
      decisions:=p_output_snapshot->'interactionDecisions';
      IF jsonb_array_length(input_interactions)<>jsonb_array_length(decisions)
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(input_interactions) input
          WHERE jsonb_typeof(input) IS DISTINCT FROM 'object'
            OR COALESCE(input->>'id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            OR COALESCE(input->>'mode','') NOT IN('read','write','event','ui','operational')
            OR jsonb_typeof(input->'facts') IS DISTINCT FROM 'object'
            OR jsonb_typeof(input->'facts'->'highImpact') IS DISTINCT FROM 'boolean'
            OR jsonb_typeof(input->'facts'->'financialAction') IS DISTINCT FROM 'boolean'
        )
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(input_interactions) input
          GROUP BY lower(input->>'id') HAVING count(*)<>1
        )
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(decisions) decision
          WHERE jsonb_typeof(decision) IS DISTINCT FROM 'object'
            OR COALESCE(decision->>'interactionId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            OR jsonb_typeof(decision->'allowedActions') IS DISTINCT FROM 'array'
            OR jsonb_typeof(decision->'approvalBoundActions') IS DISTINCT FROM 'array'
            OR jsonb_typeof(decision->'prohibitedActions') IS DISTINCT FROM 'array'
            OR EXISTS(
              SELECT 1 FROM jsonb_array_elements(
                (CASE WHEN jsonb_typeof(decision->'allowedActions')='array' THEN decision->'allowedActions' ELSE '[]'::jsonb END)
                ||(CASE WHEN jsonb_typeof(decision->'approvalBoundActions')='array' THEN decision->'approvalBoundActions' ELSE '[]'::jsonb END)
                ||(CASE WHEN jsonb_typeof(decision->'prohibitedActions')='array' THEN decision->'prohibitedActions' ELSE '[]'::jsonb END)
              ) action
              WHERE jsonb_typeof(action) IS DISTINCT FROM 'string' OR btrim(COALESCE(action#>>'{}',''))=''
            )
            OR EXISTS(
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(decision->'allowedActions')='array' THEN decision->'allowedActions' ELSE '[]'::jsonb END) action
              GROUP BY action HAVING count(*)<>1
            )
            OR EXISTS(
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(decision->'approvalBoundActions')='array' THEN decision->'approvalBoundActions' ELSE '[]'::jsonb END) action
              GROUP BY action HAVING count(*)<>1
            )
            OR EXISTS(
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(decision->'prohibitedActions')='array' THEN decision->'prohibitedActions' ELSE '[]'::jsonb END) action
              GROUP BY action HAVING count(*)<>1
            )
        )
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(decisions) decision
          GROUP BY lower(decision->>'interactionId') HAVING count(*)<>1
        )
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(input_interactions) input
          WHERE (SELECT count(*) FROM jsonb_array_elements(decisions) decision
                 WHERE lower(decision->>'interactionId')=lower(input->>'id'))<>1
        )
        OR EXISTS(
          SELECT 1 FROM jsonb_array_elements(decisions) decision
          WHERE (SELECT count(*) FROM jsonb_array_elements(input_interactions) input
                 WHERE lower(input->>'id')=lower(decision->>'interactionId'))<>1
        )
      THEN RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';END IF;

      -- Readiness metadata did not exist on every retained modern snapshot, so
      -- non-empty historical action arrays remain compatible. When present it
      -- must be canonical. A declared Unknown interaction can carry safe
      -- prohibitions, but never allowed or approval-bound authority.
      IF EXISTS(
        SELECT 1
        FROM jsonb_array_elements(decisions) decision
        JOIN jsonb_array_elements(input_interactions) input
          ON lower(input->>'id')=lower(decision->>'interactionId')
        WHERE decision ? 'readiness' AND (
          jsonb_typeof(decision->'readiness') IS DISTINCT FROM 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(
                CASE WHEN jsonb_typeof(decision->'readiness')='object' THEN decision->'readiness' ELSE '{}'::jsonb END
              ) key)<>5
          OR EXISTS(
            SELECT 1 FROM jsonb_each(
              CASE WHEN jsonb_typeof(decision->'readiness')='object' THEN decision->'readiness' ELSE '{}'::jsonb END
            ) readiness(key,value)
            WHERE key NOT IN('read','write','event','ui','operational')
              OR jsonb_typeof(value) IS DISTINCT FROM 'string'
              OR value#>>'{}' NOT IN('Ready','Conditional','Prohibited','Unknown','Not Applicable')
          )
          OR decision->'readiness'->>(input->>'mode') IS NULL
          OR (
            decision->'readiness'->>(input->>'mode')='Unknown'
            AND (
              EXISTS(
                SELECT 1 FROM jsonb_each_text(
                  CASE WHEN jsonb_typeof(decision->'readiness')='object' THEN decision->'readiness' ELSE '{}'::jsonb END
                ) readiness(key,value)
                WHERE key<>(input->>'mode') AND value<>'Not Applicable'
              )
              OR jsonb_array_length(decision->'allowedActions')<>0
              OR jsonb_array_length(decision->'approvalBoundActions')<>0
              OR jsonb_typeof(decision->'requiredControls') IS DISTINCT FROM 'array'
              OR jsonb_typeof(decision->'evidenceGaps') IS DISTINCT FROM 'array'
              OR jsonb_typeof(decision->'ruleIds') IS DISTINCT FROM 'array'
              OR jsonb_array_length(CASE WHEN jsonb_typeof(decision->'requiredControls')='array' THEN decision->'requiredControls' ELSE '[]'::jsonb END)=0
              OR jsonb_array_length(CASE WHEN jsonb_typeof(decision->'ruleIds')='array' THEN decision->'ruleIds' ELSE '[]'::jsonb END)=0
              OR EXISTS(
                SELECT 1 FROM jsonb_array_elements(
                  (CASE WHEN jsonb_typeof(decision->'requiredControls')='array' THEN decision->'requiredControls' ELSE '[]'::jsonb END)
                  ||(CASE WHEN jsonb_typeof(decision->'evidenceGaps')='array' THEN decision->'evidenceGaps' ELSE '[]'::jsonb END)
                  ||(CASE WHEN jsonb_typeof(decision->'ruleIds')='array' THEN decision->'ruleIds' ELSE '[]'::jsonb END)
                ) metadata
                WHERE jsonb_typeof(metadata) IS DISTINCT FROM 'string'
                  OR btrim(COALESCE(metadata#>>'{}',''))=''
              )
              OR EXISTS(
                SELECT 1 FROM (
                  SELECT metadata FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(decision->'requiredControls')='array' THEN decision->'requiredControls' ELSE '[]'::jsonb END
                  ) metadata GROUP BY metadata HAVING count(*)<>1
                  UNION ALL
                  SELECT metadata FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(decision->'evidenceGaps')='array' THEN decision->'evidenceGaps' ELSE '[]'::jsonb END
                  ) metadata GROUP BY metadata HAVING count(*)<>1
                  UNION ALL
                  SELECT metadata FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(decision->'ruleIds')='array' THEN decision->'ruleIds' ELSE '[]'::jsonb END
                  ) metadata GROUP BY metadata HAVING count(*)<>1
                ) duplicates
              )
            )
          )
        )
      ) OR EXISTS(
        SELECT 1
        FROM jsonb_array_elements(decisions) decision
        JOIN jsonb_array_elements(input_interactions) input
          ON lower(input->>'id')=lower(decision->>'interactionId')
        WHERE jsonb_array_length(decision->'allowedActions')
              +jsonb_array_length(decision->'approvalBoundActions')
              +jsonb_array_length(decision->'prohibitedActions')=0
          AND (
            jsonb_typeof(decision->'readiness') IS DISTINCT FROM 'object'
            OR decision->'readiness'->>(input->>'mode') IS DISTINCT FROM 'Unknown'
          )
      ) THEN
        RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';
      END IF;

      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',(input->>'id')||':'||category.category||':'||action.ordinality,
          'actionId',(input->>'id')||':'||category.category||':'||action.ordinality,
          'label',action.value#>>'{}',
          'category',category.category,
          'highImpact',input->>'mode'='write' AND (input->'facts'->>'highImpact')::boolean,
          'financial',input->>'mode'='write' AND (input->'facts'->>'financialAction')::boolean,
          'externalCommunication',false,
          'irreversible',false
        ) ORDER BY input_ordinality,category.category_ordinality,action.ordinality
      ),'[]'::jsonb) INTO normalized
      FROM jsonb_array_elements(input_interactions) WITH ORDINALITY inputs(input,input_ordinality)
      JOIN LATERAL (
        SELECT decision FROM jsonb_array_elements(decisions) decision
        WHERE lower(decision->>'interactionId')=lower(input->>'id')
      ) matched ON true
      CROSS JOIN LATERAL (
        VALUES
          ('allowed',1,matched.decision->'allowedActions'),
          ('approval-bound',2,matched.decision->'approvalBoundActions'),
          ('prohibited',3,matched.decision->'prohibitedActions')
      ) category(category,category_ordinality,actions)
      CROSS JOIN LATERAL jsonb_array_elements(category.actions) WITH ORDINALITY action(value,ordinality);
      RETURN normalized;
    ELSIF p_output_snapshot ? 'actionControls' THEN
      IF jsonb_typeof(p_output_snapshot->'actionControls') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';
      END IF;
      legacy_actions:=p_output_snapshot->'actionControls';
      IF EXISTS(
        SELECT 1 FROM jsonb_array_elements(legacy_actions) action
        WHERE jsonb_typeof(action) IS DISTINCT FROM 'object'
          OR jsonb_typeof(action->'actionId') IS DISTINCT FROM 'string'
          OR btrim(COALESCE(action->>'actionId',''))=''
          OR jsonb_typeof(action->'category') IS DISTINCT FROM 'string'
          OR COALESCE(action->>'category','') NOT IN('allowed','approval-bound','evidence-bound','prohibited')
          OR (action ? 'highImpact' AND jsonb_typeof(action->'highImpact') IS DISTINCT FROM 'boolean')
          OR (action ? 'financial' AND jsonb_typeof(action->'financial') IS DISTINCT FROM 'boolean')
          OR (action ? 'externalCommunication' AND jsonb_typeof(action->'externalCommunication') IS DISTINCT FROM 'boolean')
          OR (action ? 'irreversible' AND jsonb_typeof(action->'irreversible') IS DISTINCT FROM 'boolean')
          OR (action ? 'id' AND (jsonb_typeof(action->'id') IS DISTINCT FROM 'string' OR btrim(COALESCE(action->>'id',''))=''))
          OR (action ? 'label' AND (jsonb_typeof(action->'label') IS DISTINCT FROM 'string' OR btrim(COALESCE(action->>'label',''))=''))
      ) OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(legacy_actions) action
        GROUP BY action->>'actionId' HAVING count(*)<>1
      ) THEN RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';END IF;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',COALESCE(NULLIF(btrim(action->>'id'),''),action->>'actionId'),
        'actionId',action->>'actionId',
        'label',COALESCE(NULLIF(btrim(action->>'label'),''),action->>'actionId'),
        'category',action->>'category',
        'highImpact',COALESCE((action->>'highImpact')::boolean,false),
        'financial',COALESCE((action->>'financial')::boolean,false),
        'externalCommunication',COALESCE((action->>'externalCommunication')::boolean,false),
        'irreversible',COALESCE((action->>'irreversible')::boolean,false)
      ) ORDER BY ordinality),'[]'::jsonb) INTO normalized
      FROM jsonb_array_elements(legacy_actions) WITH ORDINALITY legacy(action,ordinality);
      RETURN normalized;
    END IF;
    RAISE EXCEPTION 'PR1E_GOVERN_ACTION_AUTHORITY_INVALID';
  END
  $function$;

  -- Fail closed before exposing the replacement if any retained resolution or
  -- handoff would change meaning. The surrounding migration transaction rolls
  -- back the function replacement on any exception.
  FOR decision_record IN
    SELECT d.id,d.input_snapshot,d.output_snapshot
    FROM public.assess_v2_decision_versions d ORDER BY d.id
  LOOP
    BEGIN
      PERFORM public.pr1e_normalize_govern_actions(
        decision_record.input_snapshot,decision_record.output_snapshot);
      IF EXISTS(
        SELECT 1 FROM public.assess_v2_govern_resolutions g
        WHERE g.decision_id=decision_record.id
          AND NOT public.pr1e_govern_actions_match(
            decision_record.input_snapshot,decision_record.output_snapshot,g.actions)
      ) OR EXISTS(
        SELECT 1 FROM public.assess_v2_govern_resolutions g
        JOIN public.assess_v2_review_resolutions rr ON rr.id=g.review_resolution_id
        WHERE g.decision_id=decision_record.id AND g.resolver_id=rr.reviewer_id
          AND public.pr1e_govern_requires_independent_resolver(
            decision_record.input_snapshot,decision_record.output_snapshot)
      ) OR EXISTS(
        SELECT 1 FROM public.assess_v2_studio_handoffs h
        WHERE h.decision_id=decision_record.id
          AND NOT public.pr1e_govern_actions_match(
            decision_record.input_snapshot,decision_record.output_snapshot,
            h.package#>'{govern,actions}')
      ) THEN
        RAISE EXCEPTION 'PR1E_GOVERN_MIXED_SNAPSHOT_HISTORY_REQUIRES_REVIEW';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%PR1E_GOVERN_MIXED_SNAPSHOT_HISTORY_REQUIRES_REVIEW%' THEN RAISE;END IF;
      RAISE EXCEPTION 'PR1E_GOVERN_MIXED_SNAPSHOT_HISTORY_REQUIRES_REVIEW';
    END;
  END LOOP;

  IF (SELECT r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM prior_owner
    OR (SELECT proacl FROM pg_proc
        WHERE oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM prior_acl
    OR (SELECT proconfig FROM pg_proc
        WHERE oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM prior_config
    OR (SELECT prosecdef FROM pg_proc
        WHERE oid='public.pr1e_normalize_govern_actions(jsonb,jsonb)'::regprocedure)
      IS DISTINCT FROM prior_security_definer
  THEN
    RAISE EXCEPTION 'PR1E_GOVERN_MIXED_SNAPSHOT_FUNCTION_CONTRACT_CHANGED';
  END IF;
END
$govern_mixed_snapshot_normalization$;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261105041249';
  new_tip text:='20261105110657';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261105110657'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261105110657');
END
$process_evidence_identity_forward$;
