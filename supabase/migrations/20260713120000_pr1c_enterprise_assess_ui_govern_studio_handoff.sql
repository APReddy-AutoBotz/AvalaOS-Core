-- PR 1C: enterprise Assess UI authority, Govern resolution, and Studio handoff.
-- Additive and forward-fix only. No scoring formula, weight, threshold, hard stop,
-- recommendation rule, deployment behavior, or live-system action is introduced.

INSERT INTO public.capabilities (capability_key, module, description) VALUES
  ('govern.resolve', 'govern', 'Resolve workspace-scoped Assess governance decisions'),
  ('studio.handoff.create', 'docs', 'Create a governed workspace-scoped Studio handoff')
ON CONFLICT (capability_key) DO UPDATE
SET module=EXCLUDED.module, description=EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.assessment_studio_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  process_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assessment_version bigint NOT NULL CHECK(assessment_version > 0),
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','accepted','blocked','archived')),
  reason text,
  decision_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr1c_handoff_workspace_org_fkey FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id),
  CONSTRAINT pr1c_handoff_assessment_ancestry_fkey FOREIGN KEY(assessment_id,workspace_id,org_id) REFERENCES public.assessments(id,workspace_id,org_id),
  CONSTRAINT pr1c_handoff_process_ancestry_fkey FOREIGN KEY(process_id,workspace_id,org_id) REFERENCES public.assess_processes(id,workspace_id,org_id),
  CONSTRAINT pr1c_handoff_reason_check CHECK(reason IS NULL OR length(reason) BETWEEN 1 AND 1000),
  CONSTRAINT pr1c_handoff_safe_snapshot_check CHECK(NOT (decision_snapshot ?| ARRAY['secret','token','signedUrl','rawContent','customerData']))
);

CREATE UNIQUE INDEX IF NOT EXISTS pr1c_one_active_studio_handoff_per_assessment
ON public.assessment_studio_handoffs(assessment_id)
WHERE status IN('submitted','accepted');

DROP TRIGGER IF EXISTS trg_pr1c_handoff_immutable ON public.assessment_studio_handoffs;
CREATE TRIGGER trg_pr1c_handoff_immutable
BEFORE UPDATE OR DELETE ON public.assessment_studio_handoffs
FOR EACH ROW EXECUTE FUNCTION public.pr1b_reject_immutable_event_mutation();

CREATE OR REPLACE FUNCTION public.pr1c_list_tenant_contexts(p_actor_id uuid)
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object(
    'userId',p.id,
    'organizationId',o.id,
    'organizationName',o.name,
    'workspaceId',w.id,
    'workspaceName',w.name,
    'authorizationVersion',COALESCE(av.version,1),
    'capabilities',COALESCE((
      SELECT jsonb_agg(c.capability_key ORDER BY c.capability_key)
      FROM (
        SELECT organization_capability.capability_key
        FROM public.roles organization_role
        JOIN public.role_capabilities organization_capability ON organization_capability.role_id=organization_role.id
        WHERE organization_role.id=om.role_id
          AND organization_role.scope='organization'
          AND organization_role.org_id=o.id
          AND organization_role.workspace_id IS NULL
          AND organization_role.status='active'
          AND organization_role.deleted_at IS NULL
        UNION
        SELECT workspace_capability.capability_key
        FROM public.roles workspace_role
        JOIN public.role_capabilities workspace_capability ON workspace_capability.role_id=workspace_role.id
        WHERE workspace_role.id=wm.role_id
          AND workspace_role.scope='workspace'
          AND workspace_role.org_id=o.id
          AND workspace_role.workspace_id=w.id
          AND workspace_role.status='active'
          AND workspace_role.deleted_at IS NULL
      ) c
    ),'[]'::jsonb)
  )
  FROM public.profiles p
  JOIN public.organization_members om ON om.user_id=p.id
  JOIN public.organizations o ON o.id=om.org_id
  JOIN public.workspace_memberships wm ON wm.user_id=p.id AND wm.org_id=o.id
  JOIN public.workspaces w ON w.id=wm.workspace_id AND w.org_id=o.id
  LEFT JOIN public.authorization_versions av ON av.org_id=o.id AND av.user_id=p.id
  WHERE p.id=p_actor_id
    AND p.status='active' AND p.deleted_at IS NULL
    AND om.status='active' AND om.deleted_at IS NULL
    AND wm.status='active' AND wm.deleted_at IS NULL
    AND o.status='active' AND o.deleted_at IS NULL
    AND w.status='active' AND w.deleted_at IS NULL
  ORDER BY o.name,o.id,w.name,w.id;
$$;

CREATE OR REPLACE FUNCTION public.pr1c_govern_resolve(
  p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_assessment_id uuid,
  p_resolution text,p_reason text,p_expected_version bigint,p_request_id uuid,
  p_idempotency_key text,p_authorization_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  r public.assess_command_receipts;
  a public.assessments;
  v_target text;
  v_event text;
  v_reason text:=NULLIF(btrim(p_reason),'');
  v_restricted boolean;
  h text:=md5(concat_ws('|',p_org_id,p_workspace_id,p_assessment_id,p_expected_version,p_resolution,v_reason));
  result jsonb;
BEGIN
  PERFORM public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,'govern.resolve',p_authorization_version);
  IF p_resolution NOT IN('submit','approve','request_changes','reject')
     OR p_expected_version IS NULL OR length(COALESCE(v_reason,'')) > 1000
     OR (p_resolution IN('request_changes','reject') AND v_reason IS NULL) THEN
    RAISE EXCEPTION 'PR1B_INVALID_COMMAND';
  END IF;
  r:=public.pr1b_claim_command(p_actor_id,p_org_id,p_workspace_id,'govern.resolve',p_idempotency_key,p_request_id,h);
  IF r.status='succeeded' THEN RETURN r.response; END IF;

  SELECT * INTO a FROM public.assessments
  WHERE id=p_assessment_id AND org_id=p_org_id AND workspace_id=p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR1B_NOT_FOUND'; END IF;
  IF a.version<>p_expected_version THEN RAISE EXCEPTION 'PR1B_VERSION_CONFLICT'; END IF;

  v_restricted:=COALESCE(a.scores#>>'{decisionPack,finalDecision}',a.scores->>'gateDecision','')
    IN('No-Go','Governance Review Required');
  IF p_resolution='submit' AND a.status='Ready for Review' THEN
    v_target:='In Review'; v_event:='Status Change';
  ELSIF p_resolution='approve' AND a.status IN('Ready for Review','In Review') THEN
    IF v_restricted AND v_reason IS NULL THEN RAISE EXCEPTION 'PR1B_INVALID_COMMAND'; END IF;
    v_target:='Approved'; v_event:='Approval';
  ELSIF p_resolution='request_changes' AND a.status IN('Ready for Review','In Review') THEN
    v_target:='Changes Requested'; v_event:='Change Request';
  ELSIF p_resolution='reject' AND a.status IN('Ready for Review','In Review') THEN
    v_target:='Rejected'; v_event:='Rejection';
  ELSE
    RAISE EXCEPTION 'PR1B_INVALID_COMMAND';
  END IF;

  UPDATE public.assessments SET
    status=v_target,
    version=version+1,
    updated_by=p_actor_id,
    approved_by=CASE WHEN v_target='Approved' THEN p_actor_id ELSE approved_by END,
    rejected_by=CASE WHEN v_target='Rejected' THEN p_actor_id ELSE rejected_by END,
    review=jsonb_set(COALESCE(review,'{}'::jsonb),'{governResolution}',jsonb_build_object(
      'resolution',p_resolution,'reason',v_reason,'actorId',p_actor_id,'resolvedAt',now()
    ),true),
    updated_at=now()
  WHERE id=a.id
  RETURNING * INTO a;

  INSERT INTO public.assessment_review_events(
    org_id,workspace_id,assessment_id,process_id,actor_id,event_type,status,reason,payload,correlation_id
  ) VALUES(
    p_org_id,p_workspace_id,a.id,a.process_id,p_actor_id,v_event,v_target,v_reason,
    jsonb_build_object('resolution',p_resolution,'restrictedDecision',v_restricted,'resourceVersion',a.version),
    p_request_id::text
  );
  INSERT INTO public.privileged_audit_events(
    org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata
  ) VALUES(
    p_org_id,p_workspace_id,p_actor_id,p_request_id,'govern.resolve','assessment',a.id,'succeeded',a.version,
    jsonb_build_object('resolution',p_resolution,'status',v_target)
  );
  result:=jsonb_build_object('ok',true,'outcome','committed','resource',jsonb_build_object(
    'assessmentId',a.id,'version',a.version,'status',a.status
  ));
  UPDATE public.assess_command_receipts SET status='succeeded',response=result,completed_at=now() WHERE id=r.id;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%PR1B_%' THEN RAISE LOG 'PR1C_COMMAND_UNAVAILABLE function=pr1c_govern_resolve sqlstate=%',SQLSTATE; END IF;
  RETURN public.pr1b_error_envelope(SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.pr1c_create_studio_handoff(
  p_actor_id uuid,p_org_id uuid,p_workspace_id uuid,p_assessment_id uuid,
  p_reason text,p_expected_version bigint,p_request_id uuid,p_idempotency_key text,
  p_authorization_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  r public.assess_command_receipts;
  a public.assessments;
  ho public.assessment_studio_handoffs;
  v_reason text:=NULLIF(btrim(p_reason),'');
  h text:=md5(concat_ws('|',p_org_id,p_workspace_id,p_assessment_id,p_expected_version,v_reason));
  result jsonb;
BEGIN
  PERFORM public.pr1b_assert_command_authority(p_actor_id,p_org_id,p_workspace_id,'studio.handoff.create',p_authorization_version);
  IF p_expected_version IS NULL OR length(COALESCE(v_reason,'')) > 1000 THEN RAISE EXCEPTION 'PR1B_INVALID_COMMAND'; END IF;
  r:=public.pr1b_claim_command(p_actor_id,p_org_id,p_workspace_id,'studio_handoff.create',p_idempotency_key,p_request_id,h);
  IF r.status='succeeded' THEN RETURN r.response; END IF;

  SELECT * INTO a FROM public.assessments
  WHERE id=p_assessment_id AND org_id=p_org_id AND workspace_id=p_workspace_id AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PR1B_NOT_FOUND'; END IF;
  IF a.version<>p_expected_version THEN RAISE EXCEPTION 'PR1B_VERSION_CONFLICT'; END IF;
  IF a.status<>'Approved' THEN RAISE EXCEPTION 'PR1B_INVALID_COMMAND'; END IF;

  INSERT INTO public.assessment_studio_handoffs(
    org_id,workspace_id,assessment_id,process_id,actor_id,assessment_version,reason,decision_snapshot
  ) VALUES(
    p_org_id,p_workspace_id,a.id,a.process_id,p_actor_id,a.version,v_reason,jsonb_build_object(
      'scoreVersion',a.score_version,
      'gateDecision',COALESCE(a.scores#>>'{decisionPack,finalDecision}',a.scores->>'gateDecision'),
      'riskTier',a.scores->>'riskTier',
      'handoffEligibility',a.scores->>'handoffEligibility'
    )
  ) RETURNING * INTO ho;

  UPDATE public.assessments SET
    status='Handed Off to Docs',
    version=version+1,
    updated_by=p_actor_id,
    review=jsonb_set(COALESCE(review,'{}'::jsonb),'{studioHandoff}',jsonb_build_object(
      'handoffId',ho.id,'reason',v_reason,'actorId',p_actor_id,'createdAt',ho.created_at
    ),true),
    updated_at=now()
  WHERE id=a.id
  RETURNING * INTO a;

  INSERT INTO public.assessment_review_events(
    org_id,workspace_id,assessment_id,process_id,actor_id,event_type,status,reason,payload,correlation_id
  ) VALUES(
    p_org_id,p_workspace_id,a.id,a.process_id,p_actor_id,'Handoff',a.status,v_reason,
    jsonb_build_object('handoffId',ho.id,'resourceVersion',a.version),p_request_id::text
  );
  INSERT INTO public.privileged_audit_events(
    org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata
  ) VALUES(
    p_org_id,p_workspace_id,p_actor_id,p_request_id,'studio_handoff.create','assessment',a.id,'succeeded',a.version,
    jsonb_build_object('handoffId',ho.id,'status',a.status)
  );
  result:=jsonb_build_object('ok',true,'outcome','committed','resource',jsonb_build_object(
    'assessmentId',a.id,'version',a.version,'status',a.status,'handoffId',ho.id
  ));
  UPDATE public.assess_command_receipts SET status='succeeded',response=result,completed_at=now() WHERE id=r.id;
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RETURN public.pr1b_error_envelope('PR1B_IDEMPOTENCY_CONFLICT');
WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%PR1B_%' THEN RAISE LOG 'PR1C_COMMAND_UNAVAILABLE function=pr1c_create_studio_handoff sqlstate=%',SQLSTATE; END IF;
  RETURN public.pr1b_error_envelope(SQLERRM);
END;
$$;

ALTER TABLE public.assessment_studio_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_studio_handoffs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pr1c_studio_handoff_read ON public.assessment_studio_handoffs;
CREATE POLICY pr1c_studio_handoff_read ON public.assessment_studio_handoffs
FOR SELECT TO authenticated
USING(public.has_workspace_capability(workspace_id,org_id,'assess.read'));

REVOKE ALL ON public.assessment_studio_handoffs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.assessment_studio_handoffs TO authenticated;
REVOKE ALL ON FUNCTION public.pr1c_list_tenant_contexts(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pr1c_govern_resolve(uuid,uuid,uuid,uuid,text,text,bigint,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pr1c_create_studio_handoff(uuid,uuid,uuid,uuid,text,bigint,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pr1c_list_tenant_contexts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pr1c_govern_resolve(uuid,uuid,uuid,uuid,text,text,bigint,uuid,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.pr1c_create_studio_handoff(uuid,uuid,uuid,uuid,text,bigint,uuid,text,bigint) TO service_role;

COMMENT ON TABLE public.assessment_studio_handoffs IS 'Immutable PR 1C Govern-approved Studio handoff record with exact tenant ancestry.';
COMMENT ON FUNCTION public.pr1c_list_tenant_contexts(uuid) IS 'Service-role-only fresh UI session projection after Edge caller authentication.';
