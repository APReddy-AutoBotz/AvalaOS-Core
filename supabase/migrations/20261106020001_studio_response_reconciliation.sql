BEGIN;

-- A provider response must be durable before semantic validation can fail.
-- This private quarantine is intentionally separate from finalize-eligible
-- staged responses. It contains no browser-readable projection or grant.
DO $studio_response_reconciliation_precondition$
DECLARE marker public.hosted_pilot_environment_identity;
BEGIN
  SELECT * INTO STRICT marker FROM public.hosted_pilot_environment_identity
  WHERE singleton FOR UPDATE;
  IF marker.product_key<>'avalaos-core'
    OR marker.environment_class<>'hosted_nonproduction_pilot'
    OR marker.schema_contract<>'hosted-pilot-2026-08'
    OR marker.migration_tip<>'20261106012003'
    OR marker.production_authorized OR marker.customer_data_authorized
    OR marker.real_provider_calls_authorized
    OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
  THEN RAISE EXCEPTION 'STUDIO_RESPONSE_RECONCILIATION_PRECONDITION'; END IF;
END
$studio_response_reconciliation_precondition$;

ALTER TABLE public.studio_artifact_generation_attempts
  DROP CONSTRAINT studio_artifact_generation_attempts_state_check;
ALTER TABLE public.studio_artifact_generation_attempts
  ADD CONSTRAINT studio_artifact_generation_attempts_state_check CHECK(state IN(
    'requested','claimed','generating','response_staged','reconciling',
    'completed','stale_completed','failed','cancel_requested','cancelled','timed_out',
    'provider_rejected','spent_output_lost'
  ));

ALTER TABLE public.studio_generation_recovery_events
  DROP CONSTRAINT studio_generation_recovery_events_event_type_check;
ALTER TABLE public.studio_generation_recovery_events
  ADD CONSTRAINT studio_generation_recovery_events_event_type_check CHECK(event_type IN(
    'lease_claimed','response_staged','response_replayed','reconciliation_claimed',
    'cancel_requested','cancelled','timed_out','completed','stale_completed','failed',
    'candidate_rejected','spent_output_lost'
  ));

CREATE TABLE public.studio_generation_provider_candidates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.enterprise_ai_budget_reservations(id) ON DELETE RESTRICT,
  original_execution_token uuid NOT NULL,
  original_execution_fence bigint NOT NULL CHECK(original_execution_fence>0),
  source_package_id uuid NOT NULL,
  source_package_hash text NOT NULL CHECK(source_package_hash~'^[0-9a-f]{64}$'),
  template_kind text NOT NULL CHECK(template_kind IN('system','tenant')),
  template_version_id uuid NOT NULL,
  template_hash text NOT NULL CHECK(template_hash~'^[0-9a-f]{64}$'),
  provider_operation_id text CHECK(provider_operation_id IS NULL OR length(provider_operation_id)<=200),
  response_content jsonb NOT NULL CHECK(jsonb_typeof(response_content)='object' AND pg_column_size(response_content)<=1048576),
  response_hash text NOT NULL CHECK(response_hash~'^[0-9a-f]{64}$'),
  input_tokens integer NOT NULL CHECK(input_tokens>=0),
  output_tokens integer NOT NULL CHECK(output_tokens>=0),
  total_tokens integer NOT NULL CHECK(total_tokens>0 AND total_tokens=input_tokens+output_tokens),
  state text NOT NULL DEFAULT 'captured' CHECK(state IN('captured','validated','rejected')),
  rejection_code text CHECK(rejection_code IS NULL OR rejection_code IN(
    'PROVIDER_OUTPUT_INVALID','PROVIDER_OUTPUT_OVERSIZED','SOURCE_COVERAGE_INCOMPLETE'
  )),
  capture_audit_event_id uuid NOT NULL,
  resolution_audit_event_id uuid,
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  resolved_at timestamptz,
  UNIQUE(attempt_id),
  UNIQUE(attempt_id,response_hash),
  FOREIGN KEY(attempt_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_generation_attempts(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  CHECK((state='captured' AND rejection_code IS NULL AND resolution_audit_event_id IS NULL AND resolved_at IS NULL)
    OR (state='validated' AND rejection_code IS NULL AND resolution_audit_event_id IS NULL AND resolved_at IS NOT NULL)
    OR (state='rejected' AND rejection_code IS NOT NULL AND resolution_audit_event_id IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE TABLE public.studio_generation_spent_output_lost_reconciliations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.synthetic_ai_campaign_authorities(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL UNIQUE,
  artifact_id uuid NOT NULL,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.enterprise_ai_budget_reservations(id) ON DELETE RESTRICT,
  debit_id uuid NOT NULL UNIQUE REFERENCES public.synthetic_ai_campaign_effect_debits(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  operator_actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  studio_actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  operator_authorization_version bigint NOT NULL CHECK(operator_authorization_version>0),
  route_id uuid NOT NULL,
  provider_config_id uuid NOT NULL,
  key_ref_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider='openai'),
  model text NOT NULL CHECK(model='gpt-4.1-mini-2025-04-14'),
  execution_token uuid NOT NULL,
  execution_fence bigint NOT NULL CHECK(execution_fence>0),
  reservation_failure_class text NOT NULL CHECK(reservation_failure_class='pre_settlement_persistence_failed'),
  actual_usage_status text NOT NULL CHECK(actual_usage_status='unknown'),
  disposition text NOT NULL CHECK(disposition='spent_output_lost'),
  request_id uuid NOT NULL UNIQUE,
  idempotency_key text NOT NULL CHECK(idempotency_key~'^[A-Za-z0-9._:-]{8,200}$'),
  key_unbound_attestation_digest text NOT NULL CHECK(key_unbound_attestation_digest~'^sha256:[0-9a-f]{64}$'),
  key_unbound_attested_at timestamptz NOT NULL,
  audit_event_id uuid NOT NULL UNIQUE,
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  reconciled_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE(campaign_id,operator_actor_id,idempotency_key),
  FOREIGN KEY(attempt_id,artifact_id,org_id,workspace_id)
    REFERENCES public.studio_artifact_generation_attempts(id,artifact_id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(workspace_id,org_id) REFERENCES public.workspaces(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(route_id,org_id,workspace_id)
    REFERENCES public.enterprise_ai_capability_routes(id,org_id,workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY(provider_config_id,org_id) REFERENCES public.ai_provider_configs(id,org_id) ON DELETE RESTRICT,
  FOREIGN KEY(key_ref_id,org_id) REFERENCES public.ai_provider_key_refs(id,org_id) ON DELETE RESTRICT
);

ALTER TABLE public.studio_generation_provider_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_generation_provider_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.studio_generation_spent_output_lost_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_generation_spent_output_lost_reconciliations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_generation_provider_candidates,
  public.studio_generation_spent_output_lost_reconciliations
FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.studio_generation_candidate_mutation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE'
    OR OLD.state<>'captured' OR NEW.state NOT IN('validated','rejected')
    OR (to_jsonb(NEW)-ARRAY['state','rejection_code','resolution_audit_event_id','resolved_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['state','rejection_code','resolution_audit_event_id','resolved_at'])
  THEN RAISE EXCEPTION 'STUDIO_GENERATION_CANDIDATE_IMMUTABLE'; END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.studio_generation_candidate_mutation_guard()
FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER studio_generation_candidate_mutation_guard
BEFORE UPDATE OR DELETE ON public.studio_generation_provider_candidates
FOR EACH ROW EXECUTE FUNCTION public.studio_generation_candidate_mutation_guard();

CREATE TRIGGER studio_generation_spent_output_lost_immutable
BEFORE UPDATE OR DELETE ON public.studio_generation_spent_output_lost_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.studio_reject_immutable();

CREATE FUNCTION public.studio_artifact_generation_candidate_capture_v1(
  p_attempt_id uuid,p_execution_token uuid,p_execution_fence bigint,
  p_provider_operation_id text,p_response jsonb,
  p_input_tokens integer,p_output_tokens integer,p_total_tokens integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  attempt public.studio_artifact_generation_attempts;
  reservation public.enterprise_ai_budget_reservations;
  candidate public.studio_generation_provider_candidates;
  response_hash_value text;
  audit_id uuid:=gen_random_uuid();
BEGIN
  IF p_attempt_id IS NULL OR p_execution_token IS NULL OR p_execution_fence<1
    OR jsonb_typeof(p_response)<>'object' OR pg_column_size(p_response)>1048576
    OR (p_provider_operation_id IS NOT NULL AND length(p_provider_operation_id)>200)
    OR p_input_tokens<0 OR p_output_tokens<0 OR p_total_tokens<1
    OR p_total_tokens<>p_input_tokens+p_output_tokens
  THEN RAISE EXCEPTION 'INVALID_GENERATION_RESPONSE'; END IF;
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts
  WHERE id=p_attempt_id FOR UPDATE;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_AVAILABLE'; END IF;
  response_hash_value:=public.enterprise_sha256_jsonb(p_response);
  SELECT * INTO candidate FROM public.studio_generation_provider_candidates
  WHERE attempt_id=attempt.id FOR UPDATE;
  IF candidate.id IS NOT NULL THEN
    IF candidate.original_execution_token IS DISTINCT FROM p_execution_token
      OR candidate.original_execution_fence IS DISTINCT FROM p_execution_fence
      OR candidate.provider_operation_id IS DISTINCT FROM p_provider_operation_id
      OR candidate.source_package_id IS DISTINCT FROM attempt.source_package_id
      OR candidate.source_package_hash IS DISTINCT FROM attempt.source_package_hash
      OR candidate.template_kind IS DISTINCT FROM attempt.template_kind
      OR candidate.template_version_id IS DISTINCT FROM COALESCE(attempt.template_id,attempt.tenant_template_version_id)
      OR candidate.template_hash IS DISTINCT FROM attempt.template_hash
      OR candidate.response_hash IS DISTINCT FROM response_hash_value
      OR candidate.response_content IS DISTINCT FROM p_response
      OR candidate.input_tokens IS DISTINCT FROM p_input_tokens
      OR candidate.output_tokens IS DISTINCT FROM p_output_tokens
      OR candidate.total_tokens IS DISTINCT FROM p_total_tokens
    THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('outcome','replayed','attemptId',attempt.id,
      'reservationId',candidate.reservation_id,'state',candidate.state,
      'responseHash',candidate.response_hash,'usage',jsonb_build_object(
        'inputTokens',candidate.input_tokens,'outputTokens',candidate.output_tokens,
        'totalTokens',candidate.total_tokens));
  END IF;
  IF attempt.state<>'generating'
    OR attempt.execution_token IS DISTINCT FROM p_execution_token
    OR attempt.execution_fence IS DISTINCT FROM p_execution_fence
    OR attempt.execution_lease_expires_at IS NULL
    OR attempt.execution_lease_expires_at<=statement_timestamp()
    OR attempt.response_hash IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.studio_generation_staged_responses staged
      WHERE staged.attempt_id=attempt.id)
  THEN RAISE EXCEPTION 'STALE_EXECUTION_FENCE'; END IF;
  SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations
  WHERE studio_attempt_id=attempt.id FOR UPDATE;
  IF reservation.id IS NULL OR reservation.authority_kind<>'studio'
    OR reservation.state<>'reserved' OR reservation.actor_id IS DISTINCT FROM attempt.requested_by
    OR reservation.org_id IS DISTINCT FROM attempt.org_id
    OR reservation.workspace_id IS DISTINCT FROM attempt.workspace_id
    OR reservation.route_id IS DISTINCT FROM attempt.provider_route_id
    OR reservation.provider_config_id IS DISTINCT FROM attempt.provider_config_id
    OR reservation.provider IS DISTINCT FROM attempt.provider_name
    OR reservation.model IS DISTINCT FROM attempt.provider_model
    OR reservation.execution_token IS DISTINCT FROM p_execution_token
    OR reservation.execution_fence IS DISTINCT FROM p_execution_fence
    OR reservation.studio_attempt_id IS DISTINCT FROM attempt.id
    OR reservation.studio_receipt_id IS NULL
    OR reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending
  THEN RAISE EXCEPTION 'GENERATION_RESERVATION_CONFLICT'; END IF;
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES(
    audit_id,attempt.org_id,attempt.workspace_id,attempt.requested_by,attempt.request_id,
    'studio.artifact.generation.candidate.capture','studio_generation_attempt',attempt.id,
    'succeeded',attempt.execution_fence,jsonb_build_object(
      'artifactId',attempt.artifact_id,'responseHash',response_hash_value,
      'inputTokens',p_input_tokens,'outputTokens',p_output_tokens,'totalTokens',p_total_tokens)
  );
  INSERT INTO public.studio_generation_provider_candidates(
    attempt_id,artifact_id,org_id,workspace_id,reservation_id,
    original_execution_token,original_execution_fence,source_package_id,
    source_package_hash,template_kind,template_version_id,template_hash,provider_operation_id,
    response_content,response_hash,input_tokens,output_tokens,total_tokens,
    capture_audit_event_id
  ) VALUES(
    attempt.id,attempt.artifact_id,attempt.org_id,attempt.workspace_id,reservation.id,
    p_execution_token,p_execution_fence,attempt.source_package_id,
    attempt.source_package_hash,attempt.template_kind,
    COALESCE(attempt.template_id,attempt.tenant_template_version_id),attempt.template_hash,
    p_provider_operation_id,p_response,response_hash_value,
    p_input_tokens,p_output_tokens,p_total_tokens,audit_id
  ) RETURNING * INTO candidate;
  RETURN jsonb_build_object('outcome','committed','attemptId',attempt.id,
    'reservationId',candidate.reservation_id,'state',candidate.state,
    'responseHash',candidate.response_hash,'usage',jsonb_build_object(
      'inputTokens',candidate.input_tokens,'outputTokens',candidate.output_tokens,
      'totalTokens',candidate.total_tokens));
END
$$;

CREATE FUNCTION public.studio_artifact_generation_candidate_load_v1(
  p_attempt_id uuid,p_execution_token uuid,p_execution_fence bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE attempt public.studio_artifact_generation_attempts;
  candidate public.studio_generation_provider_candidates;
BEGIN
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts
  WHERE id=p_attempt_id FOR SHARE;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_AVAILABLE'; END IF;
  IF attempt.execution_token IS DISTINCT FROM p_execution_token
    OR attempt.execution_fence IS DISTINCT FROM p_execution_fence
    OR attempt.state NOT IN('generating','reconciling','response_staged')
  THEN RAISE EXCEPTION 'STALE_EXECUTION_FENCE'; END IF;
  SELECT * INTO candidate FROM public.studio_generation_provider_candidates
  WHERE attempt_id=attempt.id;
  IF candidate.id IS NULL OR candidate.state='rejected'
    OR candidate.source_package_id IS DISTINCT FROM attempt.source_package_id
    OR candidate.source_package_hash IS DISTINCT FROM attempt.source_package_hash
    OR candidate.template_kind IS DISTINCT FROM attempt.template_kind
    OR candidate.template_version_id IS DISTINCT FROM COALESCE(attempt.template_id,attempt.tenant_template_version_id)
    OR candidate.template_hash IS DISTINCT FROM attempt.template_hash
  THEN RAISE EXCEPTION 'GENERATION_RESPONSE_NOT_AVAILABLE'; END IF;
  RETURN jsonb_build_object('attemptId',attempt.id,'reservationId',candidate.reservation_id,
    'state',candidate.state,'response',candidate.response_content,
    'providerOperationId',candidate.provider_operation_id,'responseHash',candidate.response_hash,
    'usage',jsonb_build_object('inputTokens',candidate.input_tokens,
      'outputTokens',candidate.output_tokens,'totalTokens',candidate.total_tokens));
END
$$;

CREATE FUNCTION public.studio_artifact_generation_candidate_reject_v1(
  p_attempt_id uuid,p_execution_token uuid,p_execution_fence bigint,p_failure_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE attempt public.studio_artifact_generation_attempts;
  candidate public.studio_generation_provider_candidates;
  reservation public.enterprise_ai_budget_reservations;
  audit_id uuid:=gen_random_uuid();
BEGIN
  IF p_failure_code NOT IN('PROVIDER_OUTPUT_INVALID','PROVIDER_OUTPUT_OVERSIZED','SOURCE_COVERAGE_INCOMPLETE')
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts
  WHERE id=p_attempt_id FOR UPDATE;
  IF attempt.id IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_AVAILABLE'; END IF;
  SELECT * INTO candidate FROM public.studio_generation_provider_candidates
  WHERE attempt_id=attempt.id FOR UPDATE;
  IF candidate.state='rejected' AND attempt.state='provider_rejected' THEN
    IF candidate.rejection_code IS DISTINCT FROM p_failure_code
      OR attempt.execution_token IS DISTINCT FROM p_execution_token
      OR attempt.execution_fence IS DISTINCT FROM p_execution_fence
    THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('outcome','replayed','attemptId',attempt.id,
      'reservationId',candidate.reservation_id,'state','rejected',
      'failureCode',candidate.rejection_code,'responseHash',candidate.response_hash,
      'usage',jsonb_build_object('inputTokens',candidate.input_tokens,
        'outputTokens',candidate.output_tokens,'totalTokens',candidate.total_tokens));
  END IF;
  IF candidate.id IS NULL OR candidate.state<>'captured'
    OR attempt.state<>'generating'
    OR attempt.execution_token IS DISTINCT FROM p_execution_token
    OR attempt.execution_fence IS DISTINCT FROM p_execution_fence
    OR attempt.execution_lease_expires_at IS NULL
    OR attempt.execution_lease_expires_at<=statement_timestamp()
    OR EXISTS(SELECT 1 FROM public.studio_generation_staged_responses staged
      WHERE staged.attempt_id=attempt.id)
    OR EXISTS(SELECT 1 FROM public.studio_artifact_versions version
      WHERE version.generation_attempt_id=attempt.id)
  THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations
  WHERE id=candidate.reservation_id FOR UPDATE;
  IF reservation.id IS NULL OR reservation.state<>'settled'
    OR reservation.studio_attempt_id IS DISTINCT FROM attempt.id
    OR reservation.execution_token IS DISTINCT FROM p_execution_token
    OR reservation.execution_fence IS DISTINCT FROM p_execution_fence
    OR reservation.actual_input_tokens IS DISTINCT FROM candidate.input_tokens
    OR reservation.actual_output_tokens IS DISTINCT FROM candidate.output_tokens
    OR reservation.actual_total_tokens IS DISTINCT FROM candidate.total_tokens
    OR reservation.release_reason IS NOT NULL
  THEN RAISE EXCEPTION 'GENERATION_RESERVATION_CONFLICT'; END IF;
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES(
    audit_id,attempt.org_id,attempt.workspace_id,attempt.requested_by,attempt.request_id,
    'studio.artifact.generation.candidate.reject','studio_generation_attempt',attempt.id,
    'failed',attempt.execution_fence,jsonb_build_object(
      'artifactId',attempt.artifact_id,'responseHash',candidate.response_hash,
      'failureCode',p_failure_code,'terminalState','provider_rejected')
  );
  UPDATE public.studio_generation_provider_candidates SET
    state='rejected',rejection_code=p_failure_code,
    resolution_audit_event_id=audit_id,resolved_at=statement_timestamp()
  WHERE id=candidate.id RETURNING * INTO candidate;
  UPDATE public.studio_artifact_generation_attempts SET
    state='provider_rejected',failure_code=p_failure_code,
    completed_at=statement_timestamp(),execution_lease_expires_at=NULL
  WHERE id=attempt.id RETURNING * INTO attempt;
  INSERT INTO public.studio_generation_recovery_events(
    attempt_id,artifact_id,org_id,workspace_id,execution_fence,event_type,
    failure_code,audit_event_id
  ) VALUES(
    attempt.id,attempt.artifact_id,attempt.org_id,attempt.workspace_id,
    attempt.execution_fence,'candidate_rejected',p_failure_code,audit_id
  );
  RETURN jsonb_build_object('outcome','committed','attemptId',attempt.id,
    'reservationId',candidate.reservation_id,'state','rejected',
    'failureCode',p_failure_code,'responseHash',candidate.response_hash,
    'usage',jsonb_build_object('inputTokens',candidate.input_tokens,
      'outputTokens',candidate.output_tokens,'totalTokens',candidate.total_tokens));
END
$$;

-- Renewal remains fail closed for generic uncertainty. Only a terminal,
-- immutable spent-output-lost disposition may stop an uncertain reservation
-- from blocking the next short-lived window; its debit and Studio slot remain
-- fully counted by the unchanged campaign ledger.
DO $studio_spent_output_lost_renewal_forward$
DECLARE
  procedure_name regprocedure:=
    'public.process_evidence_renew_provider_run_after_use(uuid,uuid,uuid,bigint,text,text,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text,timestamptz,text,timestamptz,timestamptz,bigint)'::regprocedure;
  definition text;
  uncertainty_anchor text:='AND (reservation.state IN(''reserved'',''uncertain'')'||chr(10)||
    '          OR (reservation.state=''released'' AND reservation.release_reason IS NULL)'||chr(10);
  uncertainty_replacement text:='AND (reservation.state=''reserved'''||chr(10)||
    '          OR (reservation.state=''uncertain'' AND NOT EXISTS('||chr(10)||
    '            SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost'||chr(10)||
    '            WHERE lost.reservation_id=reservation.id AND lost.attempt_id=reservation.studio_attempt_id))'||chr(10)||
    '          OR (reservation.state=''released'' AND reservation.release_reason IS NULL)'||chr(10);
  terminal_anchor text:='AND (reservation.id IS NULL OR reservation.state NOT IN(''settled'',''released'')'||chr(10);
  terminal_replacement text:='AND (reservation.id IS NULL OR (reservation.state NOT IN(''settled'',''released'')'||chr(10)||
    '          AND NOT (reservation.state=''uncertain'' AND EXISTS('||chr(10)||
    '            SELECT 1 FROM public.studio_generation_spent_output_lost_reconciliations lost'||chr(10)||
    '            WHERE lost.reservation_id=reservation.id AND lost.attempt_id=reservation.studio_attempt_id)))'||chr(10);
  join_anchor text:='ON reservation.receipt_id=debit.receipt_id AND reservation.org_id=debit.org_id'||chr(10);
  join_replacement text:='ON ((debit.authority_kind=''studio'' AND reservation.authority_kind=''studio'''||chr(10)||
    '          AND reservation.studio_receipt_id=debit.studio_receipt_id'||chr(10)||
    '          AND reservation.studio_attempt_id=debit.studio_attempt_id)'||chr(10)||
    '        OR (debit.authority_kind<>''studio'' AND reservation.receipt_id=debit.receipt_id))'||chr(10)||
    '        AND reservation.org_id=debit.org_id'||chr(10);
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  IF (length(definition)-length(replace(definition,uncertainty_anchor,'')))/length(uncertainty_anchor)<>1
    OR (length(definition)-length(replace(definition,terminal_anchor,'')))/length(terminal_anchor)<>1
    OR (length(definition)-length(replace(definition,join_anchor,'')))/length(join_anchor)<>1
    OR position('studio_generation_spent_output_lost_reconciliations lost' in definition)<>0
  THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_RENEWAL_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,uncertainty_anchor,uncertainty_replacement);
  definition:=replace(definition,terminal_anchor,terminal_replacement);
  definition:=replace(definition,join_anchor,join_replacement);
  EXECUTE definition;
END
$studio_spent_output_lost_renewal_forward$;

-- A fenced reconciliation claim may take over a durable candidate without
-- dispatching the provider. Rebind only that candidate's authoritative
-- reservation; no usage, debit, slot, transfer count, or failure history is
-- reset. Settled usage must already equal the immutable captured usage.
DO $studio_candidate_claim_forward$
DECLARE
  procedure_name regprocedure:=
    'public.studio_artifact_generation_claim_v2(uuid,uuid,integer)'::regprocedure;
  definition text;
  anchor text:=' IF transfer_released_before_effect AND NOT reconcile_only THEN'||chr(10);
  replacement text:=' IF reconcile_only AND EXISTS('||chr(10)||
    '  SELECT 1 FROM public.studio_generation_provider_candidates candidate'||chr(10)||
    '  WHERE candidate.attempt_id=attempt.id AND candidate.reservation_id=reservation.id'||chr(10)||
    '    AND candidate.state IN(''captured'',''validated''))'||chr(10)||
    ' THEN'||chr(10)||
    '  UPDATE public.enterprise_ai_budget_reservations reserved SET'||chr(10)||
    '    execution_token=attempt.execution_token,execution_fence=attempt.execution_fence,'||chr(10)||
    '    updated_at=statement_timestamp()'||chr(10)||
    '  FROM public.studio_generation_provider_candidates candidate'||chr(10)||
    '  WHERE reserved.id=reservation.id AND candidate.attempt_id=attempt.id'||chr(10)||
    '    AND candidate.reservation_id=reserved.id AND candidate.state IN(''captured'',''validated'')'||chr(10)||
    '    AND reserved.state IN(''reserved'',''uncertain'',''settled'')'||chr(10)||
    '    AND NOT reserved.studio_transfer_pending AND NOT reserved.assess_mapping_transfer_pending'||chr(10)||
    '    AND(reserved.state<>''settled'' OR('||chr(10)||
    '      reserved.actual_input_tokens=candidate.input_tokens'||chr(10)||
    '      AND reserved.actual_output_tokens=candidate.output_tokens'||chr(10)||
    '      AND reserved.actual_total_tokens=candidate.total_tokens))'||chr(10)||
    '  RETURNING reserved.* INTO reservation;'||chr(10)||
    '  IF reservation.id IS NULL THEN RAISE EXCEPTION ''GENERATION_RESERVATION_CONFLICT'';END IF;'||chr(10)||
    ' END IF;'||chr(10)||anchor;
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    OR position('studio_generation_provider_candidates candidate' in definition)<>0
  THEN RAISE EXCEPTION 'STUDIO_CANDIDATE_CLAIM_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,anchor,replacement);
END
$studio_candidate_claim_forward$;

REVOKE ALL ON FUNCTION
  public.studio_artifact_generation_candidate_capture_v1(uuid,uuid,bigint,text,jsonb,integer,integer,integer),
  public.studio_artifact_generation_candidate_load_v1(uuid,uuid,bigint),
  public.studio_artifact_generation_candidate_reject_v1(uuid,uuid,bigint,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.studio_artifact_generation_candidate_capture_v1(uuid,uuid,bigint,text,jsonb,integer,integer,integer),
  public.studio_artifact_generation_candidate_load_v1(uuid,uuid,bigint),
  public.studio_artifact_generation_candidate_reject_v1(uuid,uuid,bigint,text)
TO service_role;

REVOKE ALL ON FUNCTION
  public.studio_artifact_generation_stage_v2(uuid,uuid,bigint,text,jsonb),
  public.studio_artifact_generation_finalize_v2(uuid,uuid,bigint)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.studio_artifact_generation_stage_v2(uuid,uuid,bigint,text,jsonb),
  public.studio_artifact_generation_finalize_v2(uuid,uuid,bigint)
TO service_role;

COMMENT ON TABLE public.studio_generation_provider_candidates IS
  'Private bounded raw provider candidate quarantine. Strict validation may stage the exact response or deterministic source-fact postcomposition; the raw candidate remains immutable.';
COMMENT ON TABLE public.studio_generation_spent_output_lost_reconciliations IS
  'Immutable exact-attempt disposition for a charged provider response lost before durable capture. Debit, slot and uncertain reservation remain conservative.';

-- A captured provider candidate becomes finalize-eligible only after the
-- existing service boundary explicitly stages validated content.
DO $studio_candidate_stage_forward$
DECLARE
  procedure_name regprocedure:=
    'public.studio_artifact_generation_stage_v2(uuid,uuid,bigint,text,jsonb)'::regprocedure;
  definition text;
  declaration_anchor text:='DECLARE attempt public.studio_artifact_generation_attempts;staged public.studio_generation_staged_responses;staged_response_hash text;'||chr(10);
  hash_anchor text:=' staged_response_hash:=public.enterprise_sha256_jsonb(p_response);'||chr(10);
  state_anchor text:=' IF attempt.state NOT IN(''generating'',''reconciling'',''cancel_requested'') THEN RAISE EXCEPTION ''VERSION_CONFLICT'';END IF;'||chr(10);
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  IF (length(definition)-length(replace(definition,declaration_anchor,'')))/length(declaration_anchor)<>1
    OR (length(definition)-length(replace(definition,hash_anchor,'')))/length(hash_anchor)<>1
    OR (length(definition)-length(replace(definition,state_anchor,'')))/length(state_anchor)<>1
    OR position('studio_generation_provider_candidates' in definition)<>0
  THEN RAISE EXCEPTION 'STUDIO_CANDIDATE_STAGE_SOURCE_MISMATCH'; END IF;
  definition:=replace(definition,declaration_anchor,
    'DECLARE attempt public.studio_artifact_generation_attempts;staged public.studio_generation_staged_responses;'||
    'candidate public.studio_generation_provider_candidates;staged_response_hash text;'||chr(10));
  definition:=replace(definition,hash_anchor,hash_anchor||
    ' SELECT * INTO candidate FROM public.studio_generation_provider_candidates WHERE attempt_id=attempt.id FOR UPDATE;'||chr(10));
  definition:=replace(definition,state_anchor,state_anchor||
    ' IF candidate.id IS NULL AND EXISTS('||chr(10)||
    '   SELECT 1 FROM public.enterprise_ai_budget_reservations reservation'||chr(10)||
    '   WHERE reservation.authority_kind=''studio'' AND reservation.studio_attempt_id=attempt.id)'||chr(10)||
    ' THEN RAISE EXCEPTION ''GENERATION_CANDIDATE_REQUIRED'';END IF;'||chr(10)||
    ' IF candidate.id IS NOT NULL AND(candidate.state<>''captured'''||chr(10)||
    '   OR candidate.provider_operation_id IS DISTINCT FROM p_provider_operation_id'||chr(10)||
    '   OR candidate.source_package_id IS DISTINCT FROM attempt.source_package_id'||chr(10)||
    '   OR candidate.source_package_hash IS DISTINCT FROM attempt.source_package_hash'||chr(10)||
    '   OR candidate.template_kind IS DISTINCT FROM attempt.template_kind'||chr(10)||
    '   OR candidate.template_version_id IS DISTINCT FROM COALESCE(attempt.template_id,attempt.tenant_template_version_id)'||chr(10)||
    '   OR candidate.template_hash IS DISTINCT FROM attempt.template_hash)'||chr(10)||
    ' THEN RAISE EXCEPTION ''GENERATION_CANDIDATE_MISMATCH'';END IF;'||chr(10)||
    ' IF candidate.id IS NOT NULL THEN'||chr(10)||
    '  UPDATE public.studio_generation_provider_candidates SET state=''validated'',resolved_at=statement_timestamp()'||chr(10)||
    '  WHERE id=candidate.id;'||chr(10)||
    ' END IF;'||chr(10));
  EXECUTE definition;
END
$studio_candidate_stage_forward$;

DO $studio_candidate_finalize_forward$
DECLARE
  procedure_name regprocedure:=
    'public.studio_artifact_generation_finalize_v2(uuid,uuid,bigint)'::regprocedure;
  definition text;
  old_anchor text:=' IF attempt.state NOT IN(''response_staged'',''reconciling'') OR staged.id IS NULL OR staged.execution_token IS DISTINCT FROM p_execution_token OR staged.execution_fence IS DISTINCT FROM p_execution_fence THEN'||chr(10);
  new_anchor text:=' IF attempt.state NOT IN(''response_staged'',''reconciling'') OR staged.id IS NULL OR staged.schema_status IS DISTINCT FROM ''validated'' OR staged.execution_token IS DISTINCT FROM p_execution_token OR staged.execution_fence IS DISTINCT FROM p_execution_fence THEN'||chr(10);
BEGIN
  SELECT replace(pg_get_functiondef(procedure_name),chr(13)||chr(10),chr(10))
  INTO STRICT definition;
  IF (length(definition)-length(replace(definition,old_anchor,'')))/length(old_anchor)<>1
    OR position('staged.schema_status IS DISTINCT FROM ''validated''' in definition)<>0
  THEN RAISE EXCEPTION 'STUDIO_CANDIDATE_FINALIZE_SOURCE_MISMATCH'; END IF;
  EXECUTE replace(definition,old_anchor,new_anchor);
END
$studio_candidate_finalize_forward$;

CREATE FUNCTION public.process_evidence_reconcile_spent_output_lost(
  p_operator uuid,p_org uuid,p_workspace uuid,p_authorization_version bigint,
  p_target_fingerprint text,p_project_ref text,p_campaign uuid,p_attempt uuid,
  p_reservation uuid,p_debit uuid,p_receipt uuid,p_execution_token uuid,
  p_execution_fence bigint,p_route uuid,p_provider_config uuid,p_key_ref uuid,
  p_model text,p_request_id uuid,p_idempotency_key text,
  p_key_unbound_attestation_digest text,p_key_unbound_attested_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  target public.synthetic_admin_targets;
  campaign public.synthetic_ai_campaign_authorities;
  attempt public.studio_artifact_generation_attempts;
  reservation public.enterprise_ai_budget_reservations;
  debit public.synthetic_ai_campaign_effect_debits;
  existing public.studio_generation_spent_output_lost_reconciliations;
  provider_config public.ai_provider_configs;
  key_ref public.ai_provider_key_refs;
  route public.enterprise_ai_capability_routes;
  enterprise_control public.enterprise_intelligence_runtime_control;
  studio_control public.studio_artifact_runtime_control;
  request_host text;
  audit_id uuid:=gen_random_uuid();
  reconciliation_id uuid:=gen_random_uuid();
  now_value timestamptz:=statement_timestamp();
  result_value jsonb;
BEGIN
  IF p_operator IS NULL OR p_campaign IS NULL OR p_attempt IS NULL
    OR p_reservation IS NULL OR p_debit IS NULL OR p_receipt IS NULL
    OR p_execution_token IS NULL OR p_execution_fence<1 OR p_route IS NULL
    OR p_provider_config IS NULL OR p_key_ref IS NULL
    OR p_model IS DISTINCT FROM 'gpt-4.1-mini-2025-04-14'
    OR p_request_id IS NULL OR p_idempotency_key!~'^[A-Za-z0-9._:-]{8,200}$'
    OR p_key_unbound_attestation_digest!~'^sha256:[0-9a-f]{64}$'
    OR p_key_unbound_attested_at IS NULL
    OR p_key_unbound_attested_at>now_value
    OR p_key_unbound_attested_at<now_value-interval '15 minutes'
  THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_BINDING_INVALID'; END IF;
  PERFORM public.pr1b_assert_command_authority(
    p_operator,p_org,p_workspace,'org.admin',p_authorization_version
  );
  target:=public.synthetic_admin_assert_target(
    p_operator,p_org,p_workspace,p_authorization_version,p_target_fingerprint
  );
  request_host:=public.synthetic_ai_campaign_request_host();
  IF request_host IS DISTINCT FROM p_project_ref||'.supabase.co'
    OR target.org_id IS DISTINCT FROM p_org OR target.workspace_id IS DISTINCT FROM p_workspace
    OR target.operator_actor_id IS DISTINCT FROM p_operator OR NOT target.enabled
    OR NOT target.synthetic_only OR target.production_authorized
    OR target.customer_data_authorized OR target.real_provider_calls_authorized
  THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_NOT_AUTHORIZED'; END IF;

  SELECT * INTO existing
  FROM public.studio_generation_spent_output_lost_reconciliations row
  WHERE row.attempt_id=p_attempt OR row.reservation_id=p_reservation OR row.debit_id=p_debit
    OR row.request_id=p_request_id
    OR (row.campaign_id=p_campaign AND row.operator_actor_id=p_operator
      AND row.idempotency_key=p_idempotency_key)
  FOR SHARE;
  IF existing.id IS NOT NULL THEN
    IF existing.campaign_id IS DISTINCT FROM p_campaign
      OR existing.attempt_id IS DISTINCT FROM p_attempt
      OR existing.reservation_id IS DISTINCT FROM p_reservation
      OR existing.debit_id IS DISTINCT FROM p_debit
      OR existing.receipt_id IS DISTINCT FROM p_receipt
      OR existing.org_id IS DISTINCT FROM p_org
      OR existing.workspace_id IS DISTINCT FROM p_workspace
      OR existing.operator_actor_id IS DISTINCT FROM p_operator
      OR existing.operator_authorization_version IS DISTINCT FROM p_authorization_version
      OR existing.route_id IS DISTINCT FROM p_route
      OR existing.provider_config_id IS DISTINCT FROM p_provider_config
      OR existing.key_ref_id IS DISTINCT FROM p_key_ref
      OR existing.model IS DISTINCT FROM p_model
      OR existing.execution_token IS DISTINCT FROM p_execution_token
      OR existing.execution_fence IS DISTINCT FROM p_execution_fence
      OR existing.request_id IS DISTINCT FROM p_request_id
      OR existing.idempotency_key IS DISTINCT FROM p_idempotency_key
      OR existing.key_unbound_attestation_digest IS DISTINCT FROM p_key_unbound_attestation_digest
      OR existing.key_unbound_attested_at IS DISTINCT FROM p_key_unbound_attested_at
    THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_REPLAY_MISMATCH'; END IF;
    RETURN existing.result||jsonb_build_object('replayed',true);
  END IF;

  SELECT * INTO STRICT enterprise_control
  FROM public.enterprise_intelligence_runtime_control WHERE singleton FOR SHARE;
  SELECT * INTO STRICT studio_control
  FROM public.studio_artifact_runtime_control WHERE singleton FOR SHARE;
  SELECT * INTO campaign FROM public.synthetic_ai_campaign_authorities authority
  WHERE authority.id=p_campaign AND authority.target_id=target.id
    AND authority.target_fingerprint=p_target_fingerprint
    AND authority.project_ref=p_project_ref AND authority.server_host=request_host
    AND authority.org_id=p_org AND authority.workspace_id=p_workspace
    AND authority.operator_actor_id=p_operator
    AND authority.provider_config_id=p_provider_config
    AND authority.key_ref_id=p_key_ref AND authority.studio_route_id=p_route
    AND authority.provider='openai' AND authority.endpoint='https://api.openai.com'
    AND authority.model=p_model FOR UPDATE;
  SELECT * INTO provider_config FROM public.ai_provider_configs config
  WHERE config.id=p_provider_config AND config.org_id=p_org
    AND config.provider='openai' AND config.key_ref_id=p_key_ref
    AND config.endpoint_url='https://api.openai.com' AND config.default_model=p_model
    AND config.status='disabled' AND config.deleted_at IS NULL FOR SHARE;
  SELECT * INTO key_ref FROM public.ai_provider_key_refs key_row
  WHERE key_row.id=p_key_ref AND key_row.org_id=p_org AND key_row.provider='openai'
    AND key_row.resolver_type='server_reference' AND key_row.status='active'
    AND key_row.deleted_at IS NULL FOR SHARE;
  SELECT * INTO route FROM public.enterprise_ai_capability_routes route_row
  WHERE route_row.id=p_route AND route_row.org_id=p_org
    AND route_row.workspace_id=p_workspace
    AND route_row.provider_config_id=p_provider_config
    AND route_row.capability='studio.document.generate'
    AND route_row.model=p_model AND NOT route_row.enabled
    AND route_row.deleted_at IS NULL FOR SHARE;
  IF campaign.id IS NULL OR campaign.enabled OR campaign.disabled_at IS NULL
    OR provider_config.id IS NULL OR key_ref.id IS NULL OR route.id IS NULL
    OR enterprise_control.provider_enabled OR studio_control.provider_enabled
    OR EXISTS(SELECT 1 FROM public.synthetic_ai_campaign_authorities enabled
      WHERE enabled.org_id=p_org AND enabled.workspace_id=p_workspace AND enabled.enabled)
    OR EXISTS(SELECT 1 FROM public.enterprise_ai_capability_routes enabled_route
      WHERE enabled_route.org_id=p_org AND enabled_route.workspace_id=p_workspace
        AND enabled_route.provider_config_id=p_provider_config AND enabled_route.enabled)
    OR EXISTS(SELECT 1 FROM public.enterprise_provider_secret_backend_ownerships ownership
      WHERE ownership.key_ref_id=p_key_ref AND ownership.state='written')
  THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_RUNTIME_NOT_OFF'; END IF;

  SELECT * INTO attempt FROM public.studio_artifact_generation_attempts row
  WHERE row.id=p_attempt AND row.org_id=p_org AND row.workspace_id=p_workspace
    AND row.provider_route_id=p_route AND row.provider_config_id=p_provider_config
    AND row.provider_name='openai' AND row.provider_model=p_model FOR UPDATE;
  SELECT * INTO reservation FROM public.enterprise_ai_budget_reservations row
  WHERE row.id=p_reservation AND row.org_id=p_org AND row.workspace_id=p_workspace
    AND row.provider_config_id=p_provider_config FOR UPDATE;
  SELECT * INTO debit FROM public.synthetic_ai_campaign_effect_debits row
  WHERE row.id=p_debit AND row.campaign_id=p_campaign FOR SHARE;
  IF attempt.id IS NULL OR attempt.requested_by IS DISTINCT FROM campaign.process_run_studio_actor
    OR attempt.state NOT IN('generating','reconciling')
    OR attempt.execution_token IS DISTINCT FROM p_execution_token
    OR attempt.execution_fence IS DISTINCT FROM p_execution_fence
    OR (attempt.execution_lease_expires_at IS NOT NULL
      AND attempt.execution_lease_expires_at>now_value)
    OR attempt.response_hash IS NOT NULL OR attempt.provider_operation_id IS NOT NULL
    OR attempt.completed_at IS NOT NULL OR attempt.failure_code IS NOT NULL
    OR reservation.id IS NULL OR reservation.authority_kind<>'studio'
    OR reservation.state<>'uncertain'
    OR reservation.failure_class<>'pre_settlement_persistence_failed'
    OR reservation.release_reason IS NOT NULL
    OR reservation.actual_input_tokens IS NOT NULL
    OR reservation.actual_output_tokens IS NOT NULL
    OR reservation.actual_total_tokens IS NOT NULL
    OR reservation.actor_id IS DISTINCT FROM attempt.requested_by
    OR reservation.route_id IS DISTINCT FROM p_route
    OR reservation.provider IS DISTINCT FROM 'openai'
    OR reservation.capability IS DISTINCT FROM 'studio.document.generate'
    OR reservation.model IS DISTINCT FROM p_model
    OR reservation.studio_receipt_id IS DISTINCT FROM p_receipt
    OR reservation.studio_attempt_id IS DISTINCT FROM p_attempt
    OR reservation.execution_token IS DISTINCT FROM p_execution_token
    OR reservation.execution_fence IS DISTINCT FROM p_execution_fence
    OR reservation.studio_transfer_pending OR reservation.assess_mapping_transfer_pending
    OR debit.id IS NULL OR debit.authority_kind IS DISTINCT FROM 'studio'
    OR debit.receipt_id IS NOT NULL
    OR debit.studio_receipt_id IS DISTINCT FROM p_receipt
    OR debit.studio_attempt_id IS DISTINCT FROM p_attempt
    OR debit.effect_id IS DISTINCT FROM p_attempt
    OR debit.actor_id IS DISTINCT FROM attempt.requested_by
    OR debit.org_id IS DISTINCT FROM p_org OR debit.workspace_id IS DISTINCT FROM p_workspace
    OR debit.execution_token IS DISTINCT FROM p_execution_token
    OR debit.execution_fence IS DISTINCT FROM p_execution_fence
    OR debit.operation<>'studio.document.generate'
    OR debit.route_id IS DISTINCT FROM p_route
    OR debit.provider_config_id IS DISTINCT FROM p_provider_config
    OR debit.key_ref_id IS DISTINCT FROM p_key_ref
    OR debit.provider<>'openai' OR debit.endpoint<>'https://api.openai.com'
    OR debit.model IS DISTINCT FROM p_model OR debit.consumed_at IS NULL
    OR debit.debit_usd_nanos IS DISTINCT FROM campaign.fixed_debit_usd_nanos
    OR EXISTS(SELECT 1 FROM public.studio_generation_provider_candidates candidate
      WHERE candidate.attempt_id=p_attempt)
    OR EXISTS(SELECT 1 FROM public.studio_generation_staged_responses staged
      WHERE staged.attempt_id=p_attempt)
    OR EXISTS(SELECT 1 FROM public.studio_artifact_versions version
      WHERE version.generation_attempt_id=p_attempt)
    OR (SELECT count(*) FROM public.synthetic_ai_campaign_effect_debits candidate_debit
      WHERE candidate_debit.campaign_id=p_campaign
        AND (candidate_debit.studio_receipt_id=p_receipt
          OR candidate_debit.studio_attempt_id=p_attempt
          OR candidate_debit.effect_id=p_attempt))<>1
  THEN RAISE EXCEPTION 'STUDIO_SPENT_OUTPUT_LOST_HISTORY_UNSAFE'; END IF;

  result_value:=jsonb_build_object(
    'status','reconciled','replayed',false,'disposition','spent_output_lost',
    'reconciliationId',reconciliation_id,'campaignId',p_campaign,
    'attemptId',p_attempt,'reservationId',p_reservation,'debitId',p_debit,
    'actualUsage','unknown','reservedUsdNanos',debit.debit_usd_nanos,
    'callAllocationRetained',true,'providerRetryAuthorized',false
  );
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES(
    audit_id,p_org,p_workspace,p_operator,p_request_id,
    'studio.artifact.generation.spent-output-lost.reconcile',
    'studio_generation_attempt',p_attempt,'succeeded',p_execution_fence,
    jsonb_build_object('campaignId',p_campaign,'reservationId',p_reservation,
      'debitId',p_debit,'failureClass','pre_settlement_persistence_failed',
      'disposition','spent_output_lost','actualUsage','unknown',
      'callAllocationRetained',true)
  );
  INSERT INTO public.studio_generation_spent_output_lost_reconciliations(
    id,campaign_id,attempt_id,artifact_id,reservation_id,debit_id,receipt_id,
    org_id,workspace_id,operator_actor_id,studio_actor_id,
    operator_authorization_version,route_id,provider_config_id,key_ref_id,
    provider,model,execution_token,execution_fence,reservation_failure_class,
    actual_usage_status,disposition,request_id,idempotency_key,
    key_unbound_attestation_digest,key_unbound_attested_at,audit_event_id,result
  ) VALUES(
    reconciliation_id,p_campaign,p_attempt,attempt.artifact_id,p_reservation,p_debit,p_receipt,
    p_org,p_workspace,p_operator,attempt.requested_by,p_authorization_version,
    p_route,p_provider_config,p_key_ref,'openai',p_model,p_execution_token,
    p_execution_fence,'pre_settlement_persistence_failed','unknown','spent_output_lost',
    p_request_id,p_idempotency_key,p_key_unbound_attestation_digest,
    p_key_unbound_attested_at,audit_id,result_value
  );
  UPDATE public.studio_artifact_generation_attempts SET
    state='spent_output_lost',failure_code='GENERATION_SPENT_OUTPUT_LOST',
    completed_at=now_value,execution_lease_expires_at=NULL
  WHERE id=p_attempt RETURNING * INTO attempt;
  INSERT INTO public.studio_generation_recovery_events(
    attempt_id,artifact_id,org_id,workspace_id,execution_fence,event_type,
    failure_code,audit_event_id
  ) VALUES(
    attempt.id,attempt.artifact_id,attempt.org_id,attempt.workspace_id,
    attempt.execution_fence,'spent_output_lost','GENERATION_SPENT_OUTPUT_LOST',audit_id
  );
  RETURN result_value;
END
$$;

REVOKE ALL ON FUNCTION
  public.process_evidence_reconcile_spent_output_lost(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,uuid,text,text,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.process_evidence_reconcile_spent_output_lost(uuid,uuid,uuid,bigint,text,text,uuid,uuid,uuid,uuid,uuid,uuid,bigint,uuid,uuid,uuid,text,uuid,text,text,timestamptz)
TO service_role;

-- Advance the exact nonproduction identity and every function which pins it.
DO $studio_response_reconciliation_identity_forward$
DECLARE
  procedure_name regprocedure;
  definition text;
  old_tip text:='20261106012003';
  new_tip text:='20261106020001';
  old_count integer;
  new_count integer;
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS(
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key='avalaos-core'
      AND environment_class='hosted_nonproduction_pilot'
      AND schema_contract='hosted-pilot-2026-08' AND migration_tip=old_tip
      AND NOT production_authorized AND NOT customer_data_authorized
      AND NOT real_provider_calls_authorized
  ) OR EXISTS(SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle='active')
  THEN RAISE EXCEPTION 'STUDIO_RESPONSE_RECONCILIATION_IDENTITY_PRECONDITION'; END IF;
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
    IF old_count<>1 OR new_count<>0
    THEN RAISE EXCEPTION 'LOCAL_REAL_BACKEND_FUNCTION_SOURCE_MISMATCH:%',procedure_name; END IF;
    EXECUTE replace(definition,old_tip,new_tip);
  END LOOP;

  ALTER TABLE public.pr_c_controlled_human_exercises
    DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
  ALTER TABLE public.pr_c_controlled_human_exercises
    ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check CHECK(migration_tip IN(
      '20260904120000','20260924113000','20260926053818','20260928060000',
      '20261003015246','20261003055918','20261003123459','20261003150800',
      '20261004025101','20261004112232','20261008022445','20261009162752',
      '20261010025331','20261010051100','20261010051413','20261010144356',
      '20261011053000','20261019161723','20261103103752','20261103104435',
      '20261103170101','20261103170102','20261103170103','20261105024717',
      '20261105041249','20261105110657','20261105140001','20261105140002',
      '20261105140003','20261105140004','20261106012001','20261106012002',
      '20261106012003','20261106020001'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check CHECK(migration_tip IN(
      '20261010144356','20261011053000','20261019161723','20261103103752',
      '20261103104435','20261103170101','20261103170102','20261103170103',
      '20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001',
      '20261106012002','20261106012003','20261106020001'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity SET migration_tip=new_tip WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK(migration_tip='20261106020001');
END
$studio_response_reconciliation_identity_forward$;

NOTIFY pgrst,'reload schema';
COMMIT;
