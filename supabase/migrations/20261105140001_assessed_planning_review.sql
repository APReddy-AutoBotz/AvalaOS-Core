-- Independently reviewed assessed work may enter Studio for documentation and
-- planning while unresolved facts remain explicit. Verified implementation
-- readiness and Govern authority remain unchanged.
-- Rollback: put Assess V2 in read-only mode and retain immutable rows for repair.

DO $preflight$
BEGIN
 IF EXISTS(SELECT 1 FROM public.assess_v2_review_resolutions
  WHERE resolution NOT IN('approved','changes_requested','rejected'))
  OR EXISTS(SELECT 1 FROM public.assess_v2_studio_handoffs
  WHERE govern_resolution_id IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.assess_v2_runtime_control
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
 THEN RAISE EXCEPTION 'ASSESSED_PLANNING_PREFLIGHT_FAILED'; END IF;
END $preflight$;

ALTER TABLE public.assess_v2_review_resolutions
 DROP CONSTRAINT assess_v2_review_resolutions_resolution_check;
ALTER TABLE public.assess_v2_review_resolutions
 ADD CONSTRAINT assess_v2_review_resolutions_resolution_check
 CHECK(resolution IN('approved','planning_approved','changes_requested','rejected'));
ALTER TABLE public.assess_v2_review_resolutions
 ADD COLUMN approval_purpose text NOT NULL DEFAULT 'implementation_readiness'
 CHECK(approval_purpose IN('implementation_readiness','documentation_planning'));
ALTER TABLE public.assess_v2_review_resolutions
 ADD CONSTRAINT assess_v2_review_resolution_purpose_match CHECK(
  (resolution='planning_approved' AND approval_purpose='documentation_planning')
  OR(resolution<>'planning_approved' AND approval_purpose='implementation_readiness'));

ALTER TABLE public.assess_v2_cases DROP CONSTRAINT assess_v2_cases_status_check;
ALTER TABLE public.assess_v2_cases ADD CONSTRAINT assess_v2_cases_status_check
 CHECK(status IN('draft','reviewer_ready','in_review','approved','planning_approved',
 'changes_requested','rejected','govern_resolved','handed_off','superseded'));

ALTER TABLE public.assess_v2_studio_handoffs
 ADD COLUMN approval_purpose text NOT NULL DEFAULT 'implementation_readiness'
 CHECK(approval_purpose IN('implementation_readiness','documentation_planning'));
ALTER TABLE public.assess_v2_studio_handoffs
 ALTER COLUMN govern_resolution_id DROP NOT NULL;
ALTER TABLE public.assess_v2_studio_handoffs
 ADD CONSTRAINT assess_v2_studio_handoff_purpose_authority CHECK(
  (approval_purpose='implementation_readiness' AND govern_resolution_id IS NOT NULL)
  OR(approval_purpose='documentation_planning' AND govern_resolution_id IS NULL));
ALTER TABLE public.assess_v2_studio_handoffs
 ADD CONSTRAINT assess_v2_studio_handoffs_review_resolution_fk
 FOREIGN KEY(review_resolution_id,case_id,decision_id,workspace_id,org_id)
 REFERENCES public.assess_v2_review_resolutions(id,case_id,decision_id,workspace_id,org_id)
 ON DELETE RESTRICT;
CREATE UNIQUE INDEX assess_v2_studio_handoffs_decision_review_unique
 ON public.assess_v2_studio_handoffs(decision_id,review_resolution_id);

CREATE OR REPLACE FUNCTION public.pr1e_planning_claim_sets(p_review uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH claim_sets AS (
  SELECT claim->>'claimId' claim_id,COALESCE((
   SELECT jsonb_agg(evidence.id ORDER BY evidence.id)
   FROM jsonb_array_elements_text(claim->'evidenceIds') linked(evidence_id)
   JOIN public.assess_v2_evidence_links evidence
    ON evidence.id=linked.evidence_id::uuid
   WHERE evidence.version_id=assignment.source_version_id
    AND COALESCE(evidence.payload->>'status','')='submitted'
    AND (evidence.payload->>'validUntil' IS NULL
      OR (evidence.payload->>'validUntil')::timestamptz>now())
    AND NOT COALESCE((evidence.payload->>'contradictory')::boolean,false)
    AND COALESCE(evidence.payload->'claimIds','[]') ? (claim->>'claimId')
    AND (SELECT latest.outcome
     FROM public.assess_v2_evidence_attestations latest
     WHERE latest.review_id=assignment.id AND latest.evidence_id=evidence.id
      AND latest.claim_ids @> ARRAY[claim->>'claimId']
     ORDER BY latest.reviewed_at DESC,latest.id DESC LIMIT 1)='accepted'
  ),'[]'::jsonb) accepted_evidence_ids
  FROM public.assess_v2_review_assignments assignment
  CROSS JOIN LATERAL jsonb_array_elements(assignment.material_claims) claim
  WHERE assignment.id=p_review
 )
 SELECT jsonb_build_object(
  'acceptedEvidence',COALESCE(jsonb_agg(jsonb_build_object(
    'claimId',claim_id,'evidenceIds',accepted_evidence_ids) ORDER BY claim_id)
    FILTER(WHERE jsonb_array_length(accepted_evidence_ids)>0),'[]'::jsonb),
  'unresolvedQuestions',COALESCE(jsonb_agg(jsonb_build_object('claimId',claim_id)
    ORDER BY claim_id) FILTER(WHERE jsonb_array_length(accepted_evidence_ids)=0),
    '[]'::jsonb))
 FROM claim_sets
$$;
REVOKE ALL ON FUNCTION public.pr1e_planning_claim_sets(uuid)
 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pr1e_resolve_assess_v2_planning(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_case_id uuid,p_decision_id uuid,
 p_expected_version bigint,p_request_id uuid,p_idempotency_key text,
 p_authorization_version bigint,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.assess_v2_cases;d public.assess_v2_decision_versions;
 sv public.assess_v2_case_versions;a public.assess_v2_review_assignments;
 rr public.assess_v2_review_resolutions;r public.assess_command_receipts;
 control public.assess_v2_runtime_control;request_hash text;actual_confidence text;
 claim_sets jsonb;audit_id uuid:=gen_random_uuid();result jsonb;
BEGIN
 PERFORM public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,
  'assess.v2.approve',p_authorization_version);
 request_hash:=encode(public.digest(concat_ws('|','assessment_v2.review.plan',p_org_id,
  p_workspace_id,p_case_id,p_decision_id,p_expected_version,p_payload::text),'sha256'),'hex');
 SELECT * INTO control FROM public.assess_v2_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT control.enabled THEN RETURN public.pr1e_review_result('FEATURE_DISABLED');END IF;
 SELECT * INTO r FROM public.assess_command_receipts
  WHERE org_id=p_org_id AND actor_id=p_actor_id
   AND command_type='assessment_v2.review.plan' AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF r.id IS NOT NULL THEN
  IF r.request_hash<>request_hash OR r.workspace_id<>p_workspace_id OR r.status<>'succeeded'
  THEN RETURN public.pr1e_review_result('IDEMPOTENCY_CONFLICT');END IF;
  RETURN jsonb_build_object('outcome','replayed','resource',r.response);
 END IF;
 IF control.read_only THEN RETURN public.pr1e_review_result('READ_ONLY');END IF;
 SELECT * INTO c FROM public.assess_v2_cases WHERE id=p_case_id AND org_id=p_org_id
  AND workspace_id=p_workspace_id AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO d FROM public.assess_v2_decision_versions WHERE id=p_decision_id
  AND case_id=p_case_id AND org_id=p_org_id AND workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO sv FROM public.assess_v2_case_versions WHERE id=d.source_version_id
  AND case_id=p_case_id AND org_id=p_org_id AND workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO a FROM public.assess_v2_review_assignments WHERE case_id=p_case_id
  AND decision_id=p_decision_id AND source_version_id=d.source_version_id
  AND review_sequence=(p_payload->>'reviewSequence')::bigint;
 IF c.id IS NULL OR d.id IS NULL OR sv.id IS NULL OR a.id IS NULL
  THEN RETURN public.pr1e_review_result('NOT_FOUND');END IF;
 IF c.version<>p_expected_version OR d.source_version_id<>c.head_version_id
  THEN RETURN public.pr1e_review_result('VERSION_CONFLICT');END IF;
 IF c.status NOT IN('reviewer_ready','in_review') OR c.owner_id=p_actor_id
  OR a.reviewer_id<>p_actor_id OR p_payload->>'resolution'<>'planning_approved'
  OR a.assigned_reviewer_authorization_version<>p_authorization_version
  OR btrim(COALESCE(p_payload->>'rationale',''))=''
  OR jsonb_typeof(COALESCE(p_payload->'conditions','null'::jsonb))<>'array'
  OR jsonb_array_length(a.material_claims)=0
  THEN RETURN public.pr1e_review_result('INVALID_COMMAND');END IF;
 -- Review every submitted evidence record bound to a material claim. Claims with no
 -- evidence remain explicit unresolved questions and do not become Verified.
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(a.material_claims) claim
  CROSS JOIN LATERAL jsonb_array_elements_text(claim->'evidenceIds') linked(evidence_id)
  JOIN public.assess_v2_evidence_links evidence ON evidence.id=linked.evidence_id::uuid
  WHERE evidence.version_id=a.source_version_id AND NOT EXISTS(
   SELECT 1 FROM public.assess_v2_evidence_attestations latest
   WHERE latest.review_id=a.id AND latest.evidence_id=evidence.id)
 ) THEN RETURN public.pr1e_review_result('INVALID_COMMAND');END IF;
 actual_confidence:=d.output_snapshot->>'confidence';
 IF actual_confidence NOT IN('Verified','Partially Evidenced','Assumption-Led','Insufficient Evidence')
  THEN RETURN public.pr1e_review_result('INVALID_COMMAND');END IF;
 claim_sets:=public.pr1e_planning_claim_sets(a.id);
 IF jsonb_array_length(claim_sets->'acceptedEvidence')=0
  THEN RETURN public.pr1e_review_result('INVALID_COMMAND');END IF;
 r:=public.pr1b_claim_command(p_actor_id,p_org_id,p_workspace_id,
  'assessment_v2.review.plan',p_idempotency_key,p_request_id,request_hash);
 INSERT INTO public.assess_v2_review_resolutions(
  org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,
  decision_version,review_id,review_schema_version,review_sequence,resolution,
  reviewed_confidence,conditions,rationale,reviewer_id,reviewer_authorization_version,
  request_id,receipt_id,audit_event_id,approval_purpose
 ) VALUES(
  p_org_id,p_workspace_id,c.id,d.source_version_id,sv.version,d.id,d.decision_version,
  a.id,a.review_schema_version,a.review_sequence,'planning_approved',actual_confidence,
  p_payload->'conditions',p_payload->>'rationale',p_actor_id,p_authorization_version,
  p_request_id,r.id,audit_id,'documentation_planning'
 ) RETURNING * INTO rr;
 UPDATE public.assess_v2_cases SET status='planning_approved',version=version+1,
  updated_at=now() WHERE id=c.id;
 INSERT INTO public.privileged_audit_events(
  id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
  outcome,resource_version,metadata
 ) VALUES(
  audit_id,p_org_id,p_workspace_id,p_actor_id,p_request_id,'assessment_v2.review.plan',
  'assess_v2_case',c.id,'succeeded',c.version+1,
  jsonb_build_object('decisionId',d.id,'sourceVersionId',d.source_version_id,
   'receiptId',r.id,'reviewResolutionId',rr.id,'approvalPurpose','documentation_planning',
   'actualConfidence',actual_confidence,'claimSets',claim_sets));
 result:=public.pr1e_review_projection(p_org_id,p_workspace_id,c.id,d.id);
 UPDATE public.assess_command_receipts SET status='succeeded',response=result,
  completed_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('outcome','committed','resource',result);
EXCEPTION WHEN unique_violation THEN RETURN public.pr1e_review_result('VERSION_CONFLICT');
 WHEN OTHERS THEN
  IF SQLERRM LIKE '%PR1B_IDEMPOTENCY_CONFLICT%' THEN
   RETURN public.pr1e_review_result('IDEMPOTENCY_CONFLICT');
  ELSIF SQLERRM LIKE '%PR1B_AUTHORIZATION_STALE%' THEN
   RETURN public.pr1e_review_result('AUTHORIZATION_STALE');
  END IF;RAISE;
END $$;

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
 'actions',COALESCE(g.actions,d.output_snapshot->'actionControls','[]'),
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

CREATE OR REPLACE FUNCTION public.pr1e_handoff_assess_v2_planning(
 p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_case_id uuid,p_decision_id uuid,
 p_expected_version bigint,p_request_id uuid,p_idempotency_key text,
 p_authorization_version bigint,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.assess_v2_cases;d public.assess_v2_decision_versions;
 sv public.assess_v2_case_versions;a public.assess_v2_review_assignments;
 rr public.assess_v2_review_resolutions;r public.assess_command_receipts;
 control public.assess_v2_runtime_control;request_hash text;claim_sets jsonb;
 package jsonb;handoff public.assess_v2_studio_handoffs;
 audit_id uuid:=gen_random_uuid();result jsonb;
BEGIN
 PERFORM public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,
  'assess.v2.studio.handoff',p_authorization_version);
 request_hash:=encode(public.digest(concat_ws('|','assessment_v2.studio.plan_handoff',
  p_org_id,p_workspace_id,p_case_id,p_decision_id,p_expected_version,p_payload::text),
  'sha256'),'hex');
 SELECT * INTO control FROM public.assess_v2_runtime_control WHERE singleton=true FOR SHARE;
 IF NOT control.enabled THEN RETURN public.pr1e_review_result('FEATURE_DISABLED');END IF;
 SELECT * INTO r FROM public.assess_command_receipts WHERE org_id=p_org_id
  AND actor_id=p_actor_id AND command_type='assessment_v2.studio.plan_handoff'
  AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF r.id IS NOT NULL THEN
  IF r.request_hash<>request_hash OR r.workspace_id<>p_workspace_id OR r.status<>'succeeded'
  THEN RETURN public.pr1e_review_result('IDEMPOTENCY_CONFLICT');END IF;
  RETURN jsonb_build_object('outcome','replayed','resource',r.response);
 END IF;
 IF control.read_only THEN RETURN public.pr1e_review_result('READ_ONLY');END IF;
 SELECT * INTO c FROM public.assess_v2_cases WHERE id=p_case_id AND org_id=p_org_id
  AND workspace_id=p_workspace_id AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO d FROM public.assess_v2_decision_versions WHERE id=p_decision_id
  AND case_id=p_case_id AND org_id=p_org_id AND workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO sv FROM public.assess_v2_case_versions WHERE id=d.source_version_id
  AND case_id=p_case_id AND org_id=p_org_id AND workspace_id=p_workspace_id FOR SHARE;
 SELECT * INTO rr FROM public.assess_v2_review_resolutions WHERE case_id=p_case_id
  AND decision_id=p_decision_id AND source_version_id=d.source_version_id
  AND review_sequence=(p_payload->>'reviewSequence')::bigint
  AND resolution='planning_approved' AND approval_purpose='documentation_planning'
  ORDER BY resolved_at DESC LIMIT 1;
 SELECT * INTO a FROM public.assess_v2_review_assignments WHERE id=rr.review_id;
 IF c.id IS NULL OR d.id IS NULL OR sv.id IS NULL OR rr.id IS NULL OR a.id IS NULL
  THEN RETURN public.pr1e_review_result('NOT_FOUND');END IF;
 IF c.version<>p_expected_version OR d.source_version_id<>c.head_version_id
  THEN RETURN public.pr1e_review_result('VERSION_CONFLICT');END IF;
 IF c.status<>'planning_approved'
  OR p_payload->>'approvalPurpose'<>'documentation_planning'
  OR c.owner_id=p_actor_id
  OR EXISTS(SELECT 1 FROM public.assess_v2_govern_resolutions g
   WHERE g.review_resolution_id=rr.id)
  THEN RETURN public.pr1e_review_result('INVALID_COMMAND');END IF;
 PERFORM public.pr1b_assert_command_authority(rr.reviewer_id,p_org_id,p_workspace_id,
  'assess.v2.approve',rr.reviewer_authorization_version);
 claim_sets:=public.pr1e_planning_claim_sets(a.id);
 package:=jsonb_build_object(
  'approvalPurpose','documentation_planning',
  'reviewedConfidence',rr.reviewed_confidence,
  'acceptedEvidence',claim_sets->'acceptedEvidence',
  'unresolvedQuestions',claim_sets->'unresolvedQuestions',
  'lineage',jsonb_build_object('organizationId',p_org_id,'workspaceId',p_workspace_id,
   'caseId',c.id,'sourceCaseVersion',sv.version,'sourceVersionId',d.source_version_id,
   'decisionId',d.id,'decisionVersion',d.decision_version,
   'reviewResolutionId',rr.id,'governResolutionId',NULL),
  'process',d.input_snapshot,'decision',d.output_snapshot,
  'evidenceSubmissions',d.evidence_snapshot,
  'attestations',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY reviewed_at),'[]')
   FROM public.assess_v2_evidence_attestations x WHERE x.review_id=rr.review_id),
  'approval',to_jsonb(rr),'govern',NULL,
  'versions',jsonb_build_object(
   'schema','assess-v2-reviewed-planning-handoff.v1',
   'assessmentSchema',d.schema_version,'ruleSet',d.rule_set_version,
   'decision',d.decision_version,'reviewSchema',rr.review_schema_version,
   'reviewSequence',rr.review_sequence),
  'canonicalHashes',jsonb_build_object('input',d.input_hash,
   'evidence',d.evidence_hash,'output',d.output_hash));
 r:=public.pr1b_claim_command(p_actor_id,p_org_id,p_workspace_id,
  'assessment_v2.studio.plan_handoff',p_idempotency_key,p_request_id,request_hash);
 INSERT INTO public.assess_v2_studio_handoffs(
  org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,
  review_resolution_id,govern_resolution_id,package,package_hash,schema_version,
  rule_set_version,decision_version,review_schema_version,review_sequence,
  handed_off_by,handoff_authorization_version,request_id,receipt_id,audit_event_id,
  approval_purpose
 ) VALUES(
  p_org_id,p_workspace_id,c.id,d.source_version_id,sv.version,d.id,rr.id,NULL,package,
  encode(public.digest(convert_to(package::text,'UTF8'),'sha256'),'hex'),
  'assess-v2-reviewed-planning-handoff.v1',d.rule_set_version,d.decision_version,
  rr.review_schema_version,rr.review_sequence,p_actor_id,p_authorization_version,
  p_request_id,r.id,audit_id,'documentation_planning'
 ) RETURNING * INTO handoff;
 INSERT INTO public.assess_v2_studio_sources(
  org_id,workspace_id,case_id,decision_id,handoff_id,source_context
 ) VALUES(p_org_id,p_workspace_id,c.id,d.id,handoff.id,package);
 UPDATE public.assess_v2_cases SET status='handed_off',version=version+1,
  updated_at=now() WHERE id=c.id;
 INSERT INTO public.privileged_audit_events(
  id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
  outcome,resource_version,metadata
 ) VALUES(
  audit_id,p_org_id,p_workspace_id,p_actor_id,p_request_id,
  'assessment_v2.studio.plan_handoff','assess_v2_case',c.id,'succeeded',c.version+1,
  jsonb_build_object('decisionId',d.id,'reviewResolutionId',rr.id,
   'handoffId',handoff.id,'approvalPurpose','documentation_planning',
   'actualConfidence',rr.reviewed_confidence,'claimSets',claim_sets));
 result:=public.pr1e_review_projection(p_org_id,p_workspace_id,c.id,d.id);
 UPDATE public.assess_command_receipts SET status='succeeded',response=result,
  completed_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('outcome','committed','resource',result);
EXCEPTION WHEN unique_violation THEN RETURN public.pr1e_review_result('VERSION_CONFLICT');
 WHEN OTHERS THEN
  IF SQLERRM LIKE '%PR1B_IDEMPOTENCY_CONFLICT%' THEN
   RETURN public.pr1e_review_result('IDEMPOTENCY_CONFLICT');
  ELSIF SQLERRM LIKE '%PR1B_AUTHORIZATION_STALE%' THEN
   RETURN public.pr1e_review_result('AUTHORIZATION_STALE');
  END IF;RAISE;
END $$;

REVOKE ALL ON FUNCTION public.pr1e_resolve_assess_v2_planning(
 uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pr1e_handoff_assess_v2_planning(
 uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pr1e_resolve_assess_v2_planning(
 uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pr1e_handoff_assess_v2_planning(
 uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb) TO service_role;

-- Advance every exact-tip authority function under a guarded, one-occurrence
-- replacement. This retains every existing authorization and provider-off
-- predicate while moving the shared nonproduction identity atomically.
DO $process_evidence_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261105110657';
  new_tip text:='20261105140001';
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
      '20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001'
    ));

  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK(migration_tip IN('20261010144356','20261011053000','20261019161723','20261103103752','20261103104435','20261103170101','20261103170102','20261103170103','20261105024717','20261105041249','20261105110657','20261105140001'));

  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip='20261105140001'
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261105140001');
END
$process_evidence_identity_forward$;
