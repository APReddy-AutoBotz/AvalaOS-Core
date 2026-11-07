BEGIN;

-- Keep the accepted renderer-1 command path intact for contractless historical
-- content and every non-generation command. The public service RPC below owns
-- the renderer-2 selection for exact system-template V2 documents.
ALTER FUNCTION public.studio_private_artifact_command_claim(jsonb)
  RENAME TO studio_private_artifact_command_claim_renderer1_legacy;

REVOKE ALL ON FUNCTION public.studio_private_artifact_command_claim_renderer1_legacy(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.studio_private_artifact_command_claim(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_variable
DECLARE
  command_type text;
  actor uuid;
  org uuid;
  workspace uuid;
  request_id uuid;
  authorization_version bigint;
  command_idempotency_key text;
  request_hash text;
  required_capability text;
  expected_artifact bigint;
  expected_rendition bigint;
  artifact_version_id uuid;
  format_name text;
  renderer text;
  template_version text;
  artifact_type text;
  v public.studio_artifact_versions;
  control public.studio_private_artifact_runtime_control;
  prior_receipt public.studio_private_artifact_command_receipts;
  receipt public.studio_private_artifact_command_receipts;
  attempt public.studio_rendition_attempts;
  audit_id uuid := gen_random_uuid();
  placeholder_resource_id uuid := gen_random_uuid();
  response jsonb;
  claim jsonb;
  is_v2_system_document boolean := false;
BEGIN
  IF p_command IS NULL
     OR jsonb_typeof(p_command) <> 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command) key)
        IS DISTINCT FROM ARRAY[
          'actorId','authorizationVersion','commandType','expectedArtifactVersion',
          'expectedRenditionVersion','idempotencyKey','organizationId','payload',
          'requestId','workspaceId'
        ]::text[]
     OR jsonb_typeof(p_command -> 'payload') <> 'object'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;

  BEGIN
    command_type := p_command ->> 'commandType';
    actor := (p_command ->> 'actorId')::uuid;
    org := (p_command ->> 'organizationId')::uuid;
    workspace := (p_command ->> 'workspaceId')::uuid;
    request_id := (p_command ->> 'requestId')::uuid;
    authorization_version := (p_command ->> 'authorizationVersion')::bigint;
    command_idempotency_key := p_command ->> 'idempotencyKey';
    expected_artifact := NULLIF(p_command ->> 'expectedArtifactVersion', '')::bigint;
    expected_rendition := NULLIF(p_command ->> 'expectedRenditionVersion', '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END;
  IF command_idempotency_key IS NULL
     OR length(btrim(command_idempotency_key)) NOT BETWEEN 1 AND 200
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;

  -- Current actor authority is checked before receipt or resource disclosure.
  required_capability := CASE command_type
      WHEN 'studio.rendition.generate' THEN 'studio.artifacts.rendition.generate'
      WHEN 'studio.retention.policy.publish' THEN 'studio.artifacts.retention.manage'
      WHEN 'studio.rendition.retention.extend' THEN 'studio.artifacts.retention.manage'
      WHEN 'studio.legal_hold.place' THEN 'studio.artifacts.legal_hold.manage'
      WHEN 'studio.legal_hold.release' THEN 'studio.artifacts.legal_hold.manage'
      WHEN 'studio.rendition.deletion.request' THEN 'studio.artifacts.delete.request'
      WHEN 'studio.rendition.deletion.resolve' THEN 'studio.artifacts.delete.approve'
      ELSE NULL
    END;
  IF required_capability IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;
  PERFORM public.studio_assert_actor(
    actor, org, workspace, required_capability, authorization_version
  );

  request_hash := encode(
    public.digest(convert_to(p_command::text, 'UTF8'), 'sha256'), 'hex'
  );
  SELECT * INTO prior_receipt
  FROM public.studio_private_artifact_command_receipts existing
  WHERE existing.org_id = org
    AND existing.actor_id = actor
    AND existing.command_type = command_type
    AND existing.idempotency_key = command_idempotency_key
  FOR UPDATE;
  IF prior_receipt.id IS NOT NULL THEN
    IF prior_receipt.workspace_id IS DISTINCT FROM workspace
       OR prior_receipt.request_hash IS DISTINCT FROM request_hash
    THEN
      RAISE EXCEPTION USING MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;

  IF command_type <> 'studio.rendition.generate' THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command -> 'payload') key)
       IS DISTINCT FROM ARRAY['artifactId','artifactVersionId','format']::text[]
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;
  BEGIN
    artifact_version_id := (p_command #>> '{payload,artifactVersionId}')::uuid;
    format_name := p_command #>> '{payload,format}';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END;
  renderer := CASE format_name
    WHEN 'markdown' THEN 'studio-markdown-2'
    WHEN 'pdf' THEN 'studio-pdf-2'
    WHEN 'docx' THEN 'studio-docx-2'
    ELSE NULL
  END;
  IF renderer IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;

  SELECT version.* INTO v
  FROM public.studio_artifact_versions version
  JOIN public.studio_artifact_aggregates aggregate
    ON aggregate.id = version.artifact_id
   AND aggregate.org_id = version.org_id
   AND aggregate.workspace_id = version.workspace_id
  WHERE version.id = artifact_version_id
    AND version.org_id = org
    AND version.workspace_id = workspace
    AND aggregate.current_approved_version_id = version.id
    AND aggregate.lifecycle = 'approved'
    AND version.lifecycle = 'approved'
  FOR SHARE OF version, aggregate;
  IF v.id IS NOT NULL THEN
    SELECT aggregate.artifact_type, template.template_version,
      v.content ->> 'contractVersion' = 'studio-artifact-2'
      AND template.template_version = 'studio-' || aggregate.artifact_type || '-1'
      AND template.artifact_type = aggregate.artifact_type
      AND v.content_schema_version = CASE aggregate.artifact_type
        WHEN 'sdd' THEN 'studio-artifact-2'
        ELSE 'studio-artifact-1'
      END
    INTO artifact_type, template_version, is_v2_system_document
    FROM public.studio_artifact_aggregates aggregate
    JOIN public.studio_system_template_versions template ON template.id = v.template_id
    WHERE aggregate.id = v.artifact_id
      AND aggregate.org_id = org
      AND aggregate.workspace_id = workspace;
  END IF;

  -- Contractless/legacy approved documents remain byte-compatible on the
  -- accepted renderer-1 path. Only exact system-template V2 content advances.
  IF NOT COALESCE(is_v2_system_document, false) THEN
    RETURN public.studio_private_artifact_command_claim_renderer1_legacy(p_command);
  END IF;
  IF (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id
     OR expected_artifact IS DISTINCT FROM v.version
     OR expected_rendition IS NOT NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
  END IF;

  SELECT * INTO control
  FROM public.studio_private_artifact_runtime_control
  WHERE singleton
  FOR SHARE;
  IF NOT control.enabled THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_FEATURE_DISABLED';
  END IF;
  IF control.read_only OR NOT control.provider_enabled THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_READ_ONLY';
  END IF;

  PERFORM public.studio_rendition_generation_lock(
    org, workspace, v.id, format_name, renderer
  );
  IF EXISTS (
    SELECT 1 FROM public.studio_renditions canonical
    WHERE canonical.artifact_version_id = v.id
      AND canonical.org_id = org
      AND canonical.workspace_id = workspace
      AND canonical.format = format_name
      AND canonical.renderer_version = renderer
  ) OR EXISTS (
    SELECT 1 FROM public.studio_rendition_attempts active
    WHERE active.artifact_version_id = v.id
      AND active.org_id = org
      AND active.workspace_id = workspace
      AND active.format = format_name
      AND active.renderer_version = renderer
      AND active.state IN (
        'requested','rendering','uploaded','reconciliation_required','reconciling'
      )
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
  END IF;

  INSERT INTO public.studio_private_artifact_command_receipts(
    org_id, workspace_id, actor_id, command_type, idempotency_key, request_id,
    request_hash, status, resource_id, response
  ) VALUES (
    org, workspace, actor, command_type, command_idempotency_key, request_id,
    request_hash, 'committed', placeholder_resource_id, '{}'::jsonb
  ) RETURNING * INTO receipt;

  INSERT INTO public.studio_rendition_attempts(
    org_id, workspace_id, artifact_id, artifact_version_id, artifact_version,
    artifact_type, format, renderer_version, template_version,
    content_schema_version, requested_by, requester_authorization_version,
    request_id, receipt_id, state
  ) VALUES (
    org, workspace, v.artifact_id, v.id, v.version,
    artifact_type, format_name, renderer, template_version,
    v.content_schema_version, actor, authorization_version,
    request_id, receipt.id, 'requested'
  ) RETURNING * INTO attempt;

  response := jsonb_build_object(
    'attemptId', attempt.id,
    'renditionId', attempt.rendition_id,
    'artifactVersionId', attempt.artifact_version_id,
    'format', attempt.format,
    'state', attempt.state,
    'rendererVersion', attempt.renderer_version,
    'templateVersion', attempt.template_version,
    'contentSchemaVersion', attempt.content_schema_version
  );
  claim := jsonb_build_object(
    'disposition', 'execute',
    'requestId', request_id,
    'attemptId', attempt.id,
    'renditionId', attempt.rendition_id,
    'organizationId', attempt.org_id,
    'workspaceId', attempt.workspace_id,
    'opaqueObjectId', attempt.opaque_object_id,
    'artifactId', attempt.artifact_id,
    'artifactVersionId', attempt.artifact_version_id,
    'artifactType', attempt.artifact_type,
    'format', attempt.format,
    'approvedContent', v.content,
    'contentSchemaVersion', attempt.content_schema_version,
    'rendererVersion', attempt.renderer_version,
    'templateVersion', attempt.template_version,
    'reconciliationCount', attempt.reconciliation_count
  );
  INSERT INTO public.privileged_audit_events(
    id, org_id, workspace_id, actor_id, request_id, action, resource_type,
    resource_id, outcome, resource_version, metadata
  ) VALUES (
    audit_id, org, workspace, actor, request_id, command_type,
    'studio_rendition_attempt', attempt.id, 'succeeded', 1,
    jsonb_build_object('receiptId', receipt.id, 'rendererVersion', renderer)
  );
  UPDATE public.studio_private_artifact_command_receipts
  SET resource_id = attempt.id, response = response
  WHERE id = receipt.id;

  RETURN jsonb_build_object(
    'outcome', 'committed',
    'receiptId', receipt.id,
    'resourceId', attempt.id,
    'resource', response,
    'renditionClaim', claim
  );
END
$$;

REVOKE ALL ON FUNCTION public.studio_private_artifact_command_claim(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.studio_private_artifact_command_claim(jsonb)
  TO service_role;

COMMENT ON FUNCTION public.studio_private_artifact_command_claim(jsonb) IS
  'Service-only command authority. Exact system-template studio-artifact-2 content derives renderer-2 server-side; contractless historical content remains on renderer-1.';
COMMENT ON FUNCTION public.studio_private_artifact_command_claim_renderer1_legacy(jsonb) IS
  'Private preserved renderer-1 and non-generation command implementation. No runtime role may invoke it directly.';

-- Advance the exact hosted nonproduction identity without changing any
-- production/customer/provider authorization disposition.
DO $studio_v2_renderer_identity_forward$
DECLARE old_tip text := '20261106020001'; new_tip text := '20261106040803';
BEGIN
  LOCK TABLE public.hosted_pilot_environment_identity IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (
    SELECT 1 FROM public.hosted_pilot_environment_identity
    WHERE singleton AND product_key = 'avalaos-core'
      AND environment_class = 'hosted_nonproduction_pilot'
      AND schema_contract = 'hosted-pilot-2026-08'
      AND migration_tip = old_tip
      AND NOT production_authorized
      AND NOT customer_data_authorized
      AND NOT real_provider_calls_authorized
  ) OR EXISTS (
    SELECT 1 FROM public.authenticated_synthetic_exercises WHERE lifecycle = 'active'
  ) THEN
    RAISE EXCEPTION 'STUDIO_V2_RENDERER_IDENTITY_PRECONDITION';
  END IF;

  ALTER TABLE public.pr_c_controlled_human_exercises
    DROP CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check;
  ALTER TABLE public.pr_c_controlled_human_exercises
    ADD CONSTRAINT pr_c_controlled_human_exercises_migration_tip_check
    CHECK (migration_tip IN (
      '20260904120000','20260924113000','20260926053818','20260928060000',
      '20261003015246','20261003055918','20261003123459','20261003150800',
      '20261004025101','20261004112232','20261008022445','20261009162752',
      '20261010025331','20261010051100','20261010051413','20261010144356',
      '20261011053000','20261019161723','20261103103752','20261103104435',
      '20261103170101','20261103170102','20261103170103','20261105024717',
      '20261105041249','20261105110657','20261105140001','20261105140002',
      '20261105140003','20261105140004','20261106012001','20261106012002',
      '20261106012003','20261106020001','20261106040803'
    ));
  ALTER TABLE public.authenticated_synthetic_exercises
    DROP CONSTRAINT authenticated_synthetic_exercises_migration_tip_check;
  ALTER TABLE public.authenticated_synthetic_exercises
    ADD CONSTRAINT authenticated_synthetic_exercises_migration_tip_check
    CHECK (migration_tip IN (
      '20261010144356','20261011053000','20261019161723','20261103103752',
      '20261103104435','20261103170101','20261103170102','20261103170103',
      '20261105024717','20261105041249','20261105110657','20261105140001',
      '20261105140002','20261105140003','20261105140004','20261106012001',
      '20261106012002','20261106012003','20261106020001','20261106040803'
    ));
  ALTER TABLE public.hosted_pilot_environment_identity
    DROP CONSTRAINT hosted_pilot_environment_identity_migration_tip_check;
  UPDATE public.hosted_pilot_environment_identity
  SET migration_tip = new_tip
  WHERE singleton;
  ALTER TABLE public.hosted_pilot_environment_identity
    ADD CONSTRAINT hosted_pilot_environment_identity_migration_tip_check
    CHECK (migration_tip = '20261106040803');
END
$studio_v2_renderer_identity_forward$;

NOTIFY pgrst, 'reload schema';
COMMIT;
