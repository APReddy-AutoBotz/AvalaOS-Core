-- Restore the immutable Govern action-boundary projection that migration 140001
-- accidentally replaced while retaining the assessed planning fields.
-- Rollback: set Assess V2 read-only and apply an additive forward correction.

DO $assessed_planning_govern_projection_predecessor$
DECLARE
  definition text;
  old_actions text:='COALESCE(g.actions,d.output_snapshot->''actionControls'',''[]'')';
  governed_actions text:='public.pr1e_normalize_govern_actions(d.input_snapshot,d.output_snapshot)';
BEGIN
  LOCK TABLE public.assess_v2_runtime_control IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM public.assess_v2_runtime_control
    WHERE singleton AND read_only)
   OR EXISTS(SELECT 1 FROM public.enterprise_intelligence_runtime_control
    WHERE singleton AND provider_enabled)
   OR EXISTS(SELECT 1 FROM public.studio_artifact_runtime_control
    WHERE singleton AND provider_enabled)
   OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities WHERE enabled)
   OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises
    WHERE lifecycle='active')
   OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_permits
    WHERE state='armed' AND expires_at>statement_timestamp())
   OR NOT EXISTS(SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND migration_tip='20261105140003'
     AND NOT production_authorized AND NOT customer_data_authorized
     AND NOT real_provider_calls_authorized)
  THEN RAISE EXCEPTION 'ASSESSED_PLANNING_GOVERN_PROJECTION_PREFLIGHT_FAILED';END IF;

  SELECT replace(pg_get_functiondef(
    'public.pr1e_review_projection(uuid,uuid,uuid,uuid)'::regprocedure),
    chr(13)||chr(10),chr(10)) INTO STRICT definition;
  IF (length(definition)-length(replace(definition,old_actions,'')))/length(old_actions)<>1
   OR (length(definition)-length(replace(definition,governed_actions,'')))/length(governed_actions)<>0
   OR position('''approvalPurpose'',COALESCE(rr.approval_purpose,''implementation_readiness'')' in definition)=0
   OR position('''acceptedEvidence'',COALESCE(claim_sets.value->''acceptedEvidence'',''[]'')' in definition)=0
   OR position('''unresolvedQuestions'',COALESCE(claim_sets.value->''unresolvedQuestions'',''[]'')' in definition)=0
   OR position('LEFT JOIN public.assess_v2_studio_handoffs h ON h.review_resolution_id=rr.id' in definition)=0
  THEN RAISE EXCEPTION 'ASSESSED_PLANNING_GOVERN_PROJECTION_PREDECESSOR_MISMATCH';END IF;
END
$assessed_planning_govern_projection_predecessor$;

CREATE OR REPLACE FUNCTION public.pr1e_review_projection(
 p_org uuid,p_workspace uuid,p_case uuid,p_decision uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
SELECT jsonb_build_object(
 'assignmentId',COALESCE(a.id::text,''),'caseId',c.id,'caseName',v.name,
 'caseVersion',c.version,'sourceCaseVersion',sv.version,'sourceVersionId',d.source_version_id,
 'decisionId',d.id,'decisionVersion',d.decision_version,
 'reviewSchemaVersion',COALESCE(a.review_schema_version,'assess-v2-review-2026-07'),
 'reviewSequence',COALESCE(a.review_sequence,1),
 'status',CASE WHEN c.status='handed_off' AND rr.resolution='planning_approved'
   THEN 'planning_approved' WHEN c.status IN('govern_resolved','handed_off')
   THEN 'approved' ELSE c.status END,
 'approvalPurpose',COALESCE(rr.approval_purpose,'implementation_readiness'),
 'authorLabel',c.owner_id::text,'reviewerLabel',COALESCE(a.reviewer_id::text,''),
 'evidence',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',e.id,'claimIds',e.payload->'claimIds',
   'sourceType',COALESCE(e.payload->>'sourceType','unknown'),
   'submitterLabel',COALESCE(e.payload->>'owner',e.payload->>'submittedBy','submitted'),
   'capturedAt',COALESCE(e.payload->>'capturedAt',sv.created_at::text),
   'expiresAt',e.payload->>'validUntil','status',COALESCE(t.outcome,'submitted'),
   'rationale',t.rationale) ORDER BY e.id)
  FROM public.assess_v2_evidence_links e LEFT JOIN LATERAL(
   SELECT x.outcome,x.rationale FROM public.assess_v2_evidence_attestations x
   WHERE x.review_id=a.id AND x.evidence_id=e.id
   ORDER BY x.reviewed_at DESC,x.id DESC LIMIT 1)t ON true
  WHERE e.version_id=d.source_version_id),'[]'),
 'requiredClaimIds',COALESCE((SELECT jsonb_agg(x->>'claimId' ORDER BY x->>'claimId')
  FROM jsonb_array_elements(COALESCE(a.material_claims,'[]')) x),'[]'),
 'acceptedEvidence',COALESCE(claim_sets.value->'acceptedEvidence','[]'),
 'unresolvedQuestions',COALESCE(claim_sets.value->'unresolvedQuestions','[]'),
 'confidence',COALESCE(rr.reviewed_confidence,d.output_snapshot->>'confidence',
  'Partially Evidenced'),'conditions',COALESCE(rr.conditions,'[]'),
 'actions',public.pr1e_normalize_govern_actions(d.input_snapshot,d.output_snapshot),
 'controls',COALESCE(g.required_controls,(SELECT COALESCE(jsonb_agg(control
   ORDER BY control->>'controlId'),'[]') FROM (
   SELECT jsonb_build_object('controlId',x->>'id','label',
    COALESCE(x->>'control',x->>'id'),'status','unresolved') control
   FROM jsonb_array_elements(COALESCE(d.output_snapshot->'controlRequirements','[]')) x
   WHERE COALESCE((x->>'required')::boolean,false)
   UNION SELECT jsonb_build_object('controlId',value,'label',value,'status','unresolved')
   FROM jsonb_array_elements_text(COALESCE(d.output_snapshot->'controls','[]')) value
  ) required_controls)),
 'governStatus',CASE WHEN g.id IS NULL THEN 'pending' ELSE 'resolved' END,
 'handoffStatus',CASE WHEN h.id IS NOT NULL THEN 'committed'
  WHEN rr.resolution='planning_approved' THEN 'ready'
  WHEN g.id IS NOT NULL THEN 'ready' ELSE 'not_ready' END,
 'handedOffAt',h.handed_off_at)
FROM public.assess_v2_cases c
JOIN public.assess_v2_decision_versions d ON d.id=p_decision AND d.case_id=c.id
 AND d.org_id=c.org_id AND d.workspace_id=c.workspace_id
JOIN public.assess_v2_case_versions sv ON sv.id=d.source_version_id AND sv.case_id=c.id
JOIN public.assess_v2_case_versions v ON v.id=c.head_version_id
LEFT JOIN public.assess_v2_review_assignments a ON a.decision_id=d.id
LEFT JOIN public.assess_v2_review_resolutions rr ON rr.review_id=a.id
LEFT JOIN public.assess_v2_govern_resolutions g ON g.review_resolution_id=rr.id
LEFT JOIN public.assess_v2_studio_handoffs h ON h.review_resolution_id=rr.id
LEFT JOIN LATERAL(SELECT public.pr1e_planning_claim_sets(a.id) value) claim_sets ON true
WHERE c.id=p_case AND c.org_id=p_org AND c.workspace_id=p_workspace
 AND c.deleted_at IS NULL ORDER BY a.assigned_at DESC LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.pr1e_review_projection(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pr1e_review_projection(uuid,uuid,uuid,uuid)
 TO service_role;

DO $assessed_planning_govern_projection_postcondition$
DECLARE definition text;
BEGIN
 SELECT replace(pg_get_functiondef(
  'public.pr1e_review_projection(uuid,uuid,uuid,uuid)'::regprocedure),
  chr(13)||chr(10),chr(10)) INTO STRICT definition;
 IF position('COALESCE(g.actions,d.output_snapshot->''actionControls'',''[]'')' in definition)<>0
  OR position('''actions'',public.pr1e_normalize_govern_actions(d.input_snapshot,d.output_snapshot)' in definition)=0
  OR position('''approvalPurpose'',COALESCE(rr.approval_purpose,''implementation_readiness'')' in definition)=0
  OR position('''acceptedEvidence'',COALESCE(claim_sets.value->''acceptedEvidence'',''[]'')' in definition)=0
  OR position('''unresolvedQuestions'',COALESCE(claim_sets.value->''unresolvedQuestions'',''[]'')' in definition)=0
 THEN RAISE EXCEPTION 'ASSESSED_PLANNING_GOVERN_PROJECTION_POSTCONDITION_FAILED';END IF;
END
$assessed_planning_govern_projection_postcondition$;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261105140003';
  new_tip text:='20261105140004';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001','20261105140002','20261105140003','20261105140004'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261105140004'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261105140004');
END
$process_evidence_identity_forward$;
