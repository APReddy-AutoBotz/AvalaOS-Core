-- PR #217 post-merge forward fix.
-- Additive only: the accepted 20260729163251 migration remains immutable.

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('studio_rendition_attempts','studio_rendition_deletion_attempts')
      AND column_name = 'execution_fence'
      AND data_type <> 'bigint'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'PR217_FORWARD_FIX_DIRTY_UPGRADE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.studio_rendition_deletion_attempts a
    JOIN public.studio_renditions r ON r.id = a.rendition_id
    WHERE a.state IN ('requested', 'reconciliation_required', 'reconciling')
      AND r.lifecycle <> 'deleting'
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'PR217_FORWARD_FIX_DIRTY_UPGRADE';
  END IF;
END
$preflight$;

-- Historical deletion requests are immutable evidence. The accepted migration's
-- unconditional rendition uniqueness prevented a governed retry after a failed
-- deletion, so the effective command function now serializes the one-unresolved
-- request invariant under the rendition row/advisory lock instead.
DROP INDEX IF EXISTS public.studio_one_unresolved_deletion_request;
CREATE INDEX IF NOT EXISTS studio_deletion_requests_rendition_history
  ON public.studio_rendition_deletion_requests(rendition_id, created_at, id);

ALTER TABLE public.studio_rendition_attempts
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS execution_fence bigint NOT NULL DEFAULT 0 CHECK (execution_fence >= 0);

ALTER TABLE public.studio_rendition_deletion_attempts
  ADD COLUMN IF NOT EXISTS state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS execution_fence bigint NOT NULL DEFAULT 0 CHECK (execution_fence >= 0),
  ADD COLUMN IF NOT EXISTS execution_claimed_at timestamptz;

ALTER TABLE public.studio_rendition_deletion_attempts
  DROP CONSTRAINT IF EXISTS studio_rendition_deletion_attempts_state_check;
ALTER TABLE public.studio_rendition_deletion_attempts
  ADD CONSTRAINT studio_rendition_deletion_attempts_state_check
  CHECK (state IN ('requested', 'executing', 'completed', 'failed', 'reconciliation_required', 'reconciling'));

CREATE OR REPLACE FUNCTION public.studio_private_state_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.state_changed_at := clock_timestamp();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_studio_rendition_attempt_state_timestamp ON public.studio_rendition_attempts;
CREATE TRIGGER trg_studio_rendition_attempt_state_timestamp
BEFORE UPDATE ON public.studio_rendition_attempts
FOR EACH ROW EXECUTE FUNCTION public.studio_private_state_timestamp();

DROP TRIGGER IF EXISTS trg_studio_deletion_attempt_state_timestamp ON public.studio_rendition_deletion_attempts;
CREATE TRIGGER trg_studio_deletion_attempt_state_timestamp
BEFORE UPDATE ON public.studio_rendition_deletion_attempts
FOR EACH ROW EXECUTE FUNCTION public.studio_private_state_timestamp();

CREATE OR REPLACE FUNCTION public.studio_rendition_attempt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (to_jsonb(NEW) - ARRAY[
       'state','storage_provider','bucket_id','object_key','content_hash','byte_length',
       'mime_type','safe_filename','failure_code','reconciliation_count',
       'reconciliation_claimed_at','execution_fence','state_changed_at',
       'started_at','rendered_at','completed_at'
     ]) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY[
          'state','storage_provider','bucket_id','object_key','content_hash','byte_length',
          'mime_type','safe_filename','failure_code','reconciliation_count',
          'reconciliation_claimed_at','execution_fence','state_changed_at',
          'started_at','rendered_at','completed_at'
        ])
  THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_PRIVATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.studio_deletion_attempt_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (to_jsonb(NEW) - ARRAY[
       'state','failure_code','reconciliation_count','reconciliation_claimed_at',
       'execution_fence','execution_claimed_at','state_changed_at','completed_at'
     ]) IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY[
          'state','failure_code','reconciliation_count','reconciliation_claimed_at',
          'execution_fence','execution_claimed_at','state_changed_at','completed_at'
        ])
  THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_PRIVATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_studio_deletion_attempt_status_guard ON public.studio_rendition_deletion_attempts;
CREATE TRIGGER trg_studio_deletion_attempt_status_guard
BEFORE UPDATE OR DELETE ON public.studio_rendition_deletion_attempts
FOR EACH ROW EXECUTE FUNCTION public.studio_deletion_attempt_guard();

CREATE INDEX IF NOT EXISTS studio_rendition_attempt_due_work
  ON public.studio_rendition_attempts(state, state_changed_at, reconciliation_claimed_at, created_at, id);
CREATE INDEX IF NOT EXISTS studio_deletion_attempt_due_work
  ON public.studio_rendition_deletion_attempts(state, state_changed_at, reconciliation_claimed_at, execution_claimed_at, created_at, id);

CREATE OR REPLACE FUNCTION public.studio_private_projection_unchecked(
  p_org uuid,
  p_workspace uuid,
  p_artifact_version uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
WITH version_scope AS (
  SELECT v.id, v.artifact_id, v.version, v.lifecycle, v.org_id, v.workspace_id, a.artifact_type
  FROM public.studio_artifact_versions v
  JOIN public.studio_artifact_aggregates a
    ON a.id = v.artifact_id
   AND a.org_id = v.org_id
   AND a.workspace_id = v.workspace_id
  WHERE v.id = p_artifact_version
    AND v.org_id = p_org
    AND v.workspace_id = p_workspace
),
canonical AS (
  SELECT
    r.format,
    0 AS source_rank,
    r.id,
    r.lifecycle_version AS version,
    CASE
      WHEN r.lifecycle = 'deleting' AND da.state = 'reconciliation_required' THEN 'deletion_reconciliation_required'
      WHEN r.lifecycle = 'deleting' AND da.state = 'reconciling' THEN 'deletion_reconciling'
      WHEN r.lifecycle = 'deleting' AND da.state = 'failed' THEN 'deletion_failed'
      ELSE r.lifecycle
    END AS public_state,
    r.mime_type,
    r.safe_filename,
    r.byte_length,
    r.content_hash,
    r.renderer_version,
    CASE WHEN retention.value ->> 'indefinite' = 'true' THEN 'indefinite' ELSE 'until' END AS retention_mode,
    CASE WHEN retention.value ->> 'indefinite' = 'true' THEN NULL ELSE retention.value ->> 'retentionUntil' END AS retention_until,
    COALESCE(holds.items, '[]'::jsonb) AS active_holds,
    CASE
      WHEN dr.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'requestId', dr.id,
        'state', CASE WHEN ds.id IS NULL THEN 'pending' ELSE ds.outcome END,
        'requesterIsCurrentActor', dr.requested_by IS NOT DISTINCT FROM auth.uid()
      )
    END AS deletion,
    da.failure_code,
    GREATEST(r.updated_at, COALESCE(da.state_changed_at, r.updated_at)) AS updated_at
  FROM version_scope v
  JOIN public.studio_renditions r
    ON r.artifact_version_id = v.id
   AND r.org_id = v.org_id
   AND r.workspace_id = v.workspace_id
  LEFT JOIN LATERAL (
    SELECT public.studio_effective_retention(r.id) AS value
  ) retention ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('holdId', h.hold_id, 'placedAt', h.created_at)
      ORDER BY h.created_at, h.hold_id
    ) AS items
    FROM public.studio_rendition_legal_hold_events h
    WHERE h.rendition_id = r.id
      AND h.event_type = 'placed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.studio_rendition_legal_hold_events released
        WHERE released.hold_id = h.hold_id
          AND released.event_type = 'released'
      )
  ) holds ON true
  LEFT JOIN LATERAL (
    SELECT request.*
    FROM public.studio_rendition_deletion_requests request
    WHERE request.rendition_id = r.id
    ORDER BY request.created_at DESC, request.id DESC
    LIMIT 1
  ) dr ON true
  LEFT JOIN public.studio_rendition_deletion_resolutions ds ON ds.request_id = dr.id
  LEFT JOIN public.studio_rendition_deletion_attempts da ON da.resolution_id = ds.id
),
attempt_candidates AS (
  SELECT
    x.format,
    1 AS source_rank,
    x.rendition_id AS id,
    1::bigint AS version,
    CASE x.state
      WHEN 'uploaded' THEN 'uploading'
      ELSE x.state
    END AS public_state,
    x.mime_type,
    x.safe_filename,
    x.byte_length,
    x.content_hash,
    x.renderer_version,
    NULL::text AS retention_mode,
    NULL::text AS retention_until,
    '[]'::jsonb AS active_holds,
    NULL::jsonb AS deletion,
    x.failure_code,
    x.state_changed_at AS updated_at,
    row_number() OVER (
      PARTITION BY x.format
      ORDER BY x.state_changed_at DESC, x.created_at DESC, x.id DESC
    ) AS ordinal
  FROM version_scope v
  JOIN public.studio_rendition_attempts x
    ON x.artifact_version_id = v.id
   AND x.org_id = v.org_id
   AND x.workspace_id = v.workspace_id
  WHERE x.state IN ('requested','rendering','uploaded','reconciliation_required','reconciling','failed')
    AND NOT EXISTS (
      SELECT 1 FROM canonical c WHERE c.format = x.format
    )
),
effective AS (
  SELECT format, source_rank, id, version, public_state, mime_type, safe_filename,
         byte_length, content_hash, renderer_version, retention_mode, retention_until,
         active_holds, deletion, failure_code, updated_at
  FROM canonical
  UNION ALL
  SELECT format, source_rank, id, version, public_state, mime_type, safe_filename,
         byte_length, content_hash, renderer_version, retention_mode, retention_until,
         active_holds, deletion, failure_code, updated_at
  FROM attempt_candidates
  WHERE ordinal = 1
)
SELECT jsonb_build_object(
  'artifactId', v.artifact_id,
  'artifactVersionId', v.id,
  'artifactVersion', v.version,
  'artifactType', v.artifact_type,
  'approved', v.lifecycle = 'approved',
  'readOnly', NOT control.enabled OR control.read_only,
  'renditions', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'version', e.version,
        'format', e.format,
        'state', e.public_state,
        'mimeType', e.mime_type,
        'filename', e.safe_filename,
        'byteLength', e.byte_length,
        'sha256', e.content_hash,
        'rendererVersion', e.renderer_version,
        'retentionMode', e.retention_mode,
        'retentionUntil', e.retention_until,
        'legalHoldActive', jsonb_array_length(e.active_holds) > 0,
        'activeHolds', e.active_holds,
        'deletion', e.deletion,
        'failureCode', e.failure_code,
        'updatedAt', e.updated_at
      )
      ORDER BY e.format, e.source_rank, e.id
    )
    FROM effective e
  ), '[]'::jsonb)
)
FROM version_scope v
CROSS JOIN public.studio_private_artifact_runtime_control control
WHERE control.singleton
$$;

CREATE OR REPLACE FUNCTION public.studio_private_artifact_projection(
  p_org uuid,
  p_workspace uuid,
  p_artifact_version uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
SELECT CASE
  WHEN public.has_workspace_capability(p_workspace, p_org, 'studio.artifacts.read')
  THEN public.studio_private_projection_unchecked(p_org, p_workspace, p_artifact_version)
  ELSE NULL
END
$$;

DO $legacy$
BEGIN
  IF to_regprocedure('public.studio_private_artifact_command_claim_pr217_accepted(jsonb)') IS NULL THEN
    ALTER FUNCTION public.studio_private_artifact_command_claim(jsonb)
      RENAME TO studio_private_artifact_command_claim_pr217_accepted;
  END IF;
END
$legacy$;

CREATE OR REPLACE FUNCTION public.studio_private_artifact_command_claim(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
#variable_conflict use_variable
DECLARE
  command_type text := p_command ->> 'commandType';
  actor uuid;
  org uuid;
  workspace uuid;
  authorization_version bigint;
  command_idempotency_key text;
  request_hash text;
  required_capability text;
  expected_artifact bigint;
  expected_rendition bigint;
  artifact_version_id uuid;
  rendition_id uuid;
  command_hold_id uuid;
  format_name text;
  renderer text;
  v public.studio_artifact_versions;
  r public.studio_renditions;
  result jsonb;
  prior_receipt public.studio_private_artifact_command_receipts;
  expected_payload_keys text[];
BEGIN
  IF p_command IS NULL
     OR jsonb_typeof(p_command) <> 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command) key)
        IS DISTINCT FROM ARRAY[
          'actorId','authorizationVersion','commandType','expectedArtifactVersion',
          'expectedRenditionVersion','idempotencyKey','organizationId','payload',
          'requestId','workspaceId'
        ]::text[]
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;

  BEGIN
    actor := (p_command ->> 'actorId')::uuid;
    org := (p_command ->> 'organizationId')::uuid;
    workspace := (p_command ->> 'workspaceId')::uuid;
    authorization_version := (p_command ->> 'authorizationVersion')::bigint;
    command_idempotency_key := p_command ->> 'idempotencyKey';
    expected_artifact := NULLIF(p_command ->> 'expectedArtifactVersion', '')::bigint;
    expected_rendition := NULLIF(p_command ->> 'expectedRenditionVersion', '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END;

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
  request_hash := encode(public.digest(convert_to(p_command::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO prior_receipt
  FROM public.studio_private_artifact_command_receipts receipt
  WHERE receipt.org_id = org
    AND receipt.actor_id = actor
    AND receipt.command_type = command_type
    AND receipt.idempotency_key = command_idempotency_key
  FOR UPDATE;
  IF prior_receipt.id IS NOT NULL THEN
    IF prior_receipt.workspace_id IS DISTINCT FROM workspace
       OR prior_receipt.request_hash IS DISTINCT FROM request_hash
    THEN
      RAISE EXCEPTION USING MESSAGE = 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN public.studio_private_artifact_command_claim_pr217_accepted(p_command);
  END IF;

  expected_payload_keys := CASE command_type
    WHEN 'studio.rendition.generate' THEN ARRAY['artifactId','artifactVersionId','format']
    WHEN 'studio.retention.policy.publish' THEN ARRAY['artifactType','indefinite','rationale','retentionDays']
    WHEN 'studio.rendition.retention.extend' THEN ARRAY['extendUntil','indefinite','rationale','renditionId']
    WHEN 'studio.legal_hold.place' THEN ARRAY['rationale','renditionId']
    WHEN 'studio.legal_hold.release' THEN ARRAY['holdId','rationale','renditionId']
    WHEN 'studio.rendition.deletion.request' THEN ARRAY['rationale','renditionId']
    WHEN 'studio.rendition.deletion.resolve' THEN ARRAY['deletionRequestId','outcome','rationale','renditionId']
    ELSE NULL
  END;
  IF expected_payload_keys IS NULL
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command -> 'payload') key)
        IS DISTINCT FROM expected_payload_keys
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;

  IF command_type = 'studio.retention.policy.publish' THEN
    IF expected_artifact IS NOT NULL OR expected_rendition IS NOT NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
    END IF;
  ELSIF command_type = 'studio.rendition.generate' THEN
    BEGIN
      artifact_version_id := (p_command #>> '{payload,artifactVersionId}')::uuid;
      format_name := p_command #>> '{payload,format}';
      renderer := CASE format_name
        WHEN 'markdown' THEN 'studio-markdown-1'
        WHEN 'pdf' THEN 'studio-pdf-1'
        WHEN 'docx' THEN 'studio-docx-1'
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
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
    END;
    IF v.id IS NULL
       OR (p_command #>> '{payload,artifactId}')::uuid IS DISTINCT FROM v.artifact_id
       OR expected_artifact IS DISTINCT FROM v.version
       OR expected_rendition IS NOT NULL
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
    END IF;
    -- Exact receipt replay has already returned above. A new command for a
    -- canonical version/format/renderer tombstone must stop before receipt,
    -- attempt, rendering, upload, or any provider effect.
    IF EXISTS (
      SELECT 1
      FROM public.studio_renditions canonical
      WHERE canonical.artifact_version_id = v.id
        AND canonical.org_id = org
        AND canonical.workspace_id = workspace
        AND canonical.format = format_name
        AND canonical.renderer_version = renderer
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
    END IF;
  ELSE
    BEGIN
      rendition_id := (p_command #>> '{payload,renditionId}')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
    END;
    SELECT * INTO r
    FROM public.studio_renditions
    WHERE id = rendition_id AND org_id = org AND workspace_id = workspace
    FOR UPDATE;
    IF r.id IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
    END IF;
    IF expected_artifact IS DISTINCT FROM r.artifact_version
       OR expected_rendition IS DISTINCT FROM r.lifecycle_version
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text, 0));

    IF command_type = 'studio.rendition.retention.extend'
       AND (
         r.lifecycle NOT IN ('available','deletion_requested','deletion_failed')
         OR EXISTS (
           SELECT 1
           FROM public.studio_rendition_deletion_attempts active_attempt
           WHERE active_attempt.rendition_id = r.id
             AND active_attempt.state IN (
               'requested','executing','reconciliation_required','reconciling'
             )
         )
       )
    THEN
      RAISE EXCEPTION USING MESSAGE = 'STUDIO_DELETION_BLOCKED';
    END IF;
    IF command_type = 'studio.rendition.deletion.request'
       AND EXISTS (
         SELECT 1
         FROM public.studio_rendition_deletion_requests unresolved
         WHERE unresolved.rendition_id = r.id
           AND NOT EXISTS (
             SELECT 1
             FROM public.studio_rendition_deletion_resolutions resolution
             WHERE resolution.request_id = unresolved.id
           )
       )
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VERSION_CONFLICT';
    END IF;
    IF command_type = 'studio.legal_hold.place' AND r.lifecycle IN ('deleting','deleted') THEN
      RAISE EXCEPTION USING MESSAGE = 'STUDIO_DELETION_BLOCKED';
    END IF;
    IF command_type = 'studio.legal_hold.release' THEN
      BEGIN
        command_hold_id := (p_command #>> '{payload,holdId}')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
      END;
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_rendition_legal_hold_events placed
        WHERE placed.hold_id = command_hold_id
          AND placed.event_type = 'placed'
          AND placed.rendition_id = r.id
          AND placed.org_id = org
          AND placed.workspace_id = workspace
          AND NOT EXISTS (
            SELECT 1 FROM public.studio_rendition_legal_hold_events released
            WHERE released.hold_id = placed.hold_id AND released.event_type = 'released'
          )
      ) THEN
        RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
      END IF;
    END IF;
  END IF;

  result := public.studio_private_artifact_command_claim_pr217_accepted(p_command);
  IF command_type = 'studio.rendition.deletion.resolve' AND result ? 'deletionClaim' THEN
    result := (result - 'deletionClaim') || jsonb_build_object(
      'deletionClaim',
      (result -> 'deletionClaim') - 'objectKey'
    );
  END IF;
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION public.studio_private_artifact_reconciliation_due(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_COMMAND';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind', due.kind, 'attemptId', due.attempt_id)
                     ORDER BY due.due_at, due.kind, due.attempt_id)
    FROM (
      SELECT 'rendition'::text AS kind, r.id AS attempt_id,
             COALESCE(r.reconciliation_claimed_at, r.state_changed_at, r.created_at) AS due_at
      FROM public.studio_rendition_attempts r
      WHERE (
        r.state = 'reconciliation_required'
        OR (r.state IN ('requested','rendering','uploaded')
            AND r.state_changed_at <= now() - interval '5 minutes')
        OR (r.state = 'reconciling'
            AND r.reconciliation_claimed_at <= now() - interval '5 minutes')
      )
      UNION ALL
      SELECT 'deletion'::text, d.id,
             COALESCE(d.execution_claimed_at, d.reconciliation_claimed_at, d.state_changed_at, d.created_at)
      FROM public.studio_rendition_deletion_attempts d
      WHERE (
        d.state = 'reconciliation_required'
        OR (d.state IN ('requested','executing')
            AND d.state_changed_at <= now() - interval '5 minutes')
        OR (d.state = 'reconciling'
            AND d.reconciliation_claimed_at <= now() - interval '5 minutes')
      )
      ORDER BY due_at, kind, attempt_id
      LIMIT p_limit
    ) due
  ), '[]'::jsonb);
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_reconciliation_claim(p_attempt uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  x public.studio_rendition_attempts;
  v public.studio_artifact_versions;
  control public.studio_private_artifact_runtime_control;
  phase text;
  next_count integer;
  next_fence bigint;
  extension text;
  expected_key text;
  expected_mime text;
BEGIN
  SELECT * INTO x FROM public.studio_rendition_attempts WHERE id = p_attempt FOR UPDATE;
  IF x.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM public.studio_assert_actor(
    x.requested_by, x.org_id, x.workspace_id,
    'studio.artifacts.rendition.generate', x.requester_authorization_version
  );
  SELECT * INTO control FROM public.studio_private_artifact_runtime_control WHERE singleton FOR SHARE;
  IF NOT control.enabled OR control.read_only OR NOT control.provider_enabled THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_READ_ONLY';
  END IF;
  SELECT version.* INTO v
  FROM public.studio_artifact_versions version
  JOIN public.studio_artifact_aggregates aggregate
    ON aggregate.id = version.artifact_id
   AND aggregate.org_id = version.org_id
   AND aggregate.workspace_id = version.workspace_id
  WHERE version.id = x.artifact_version_id
    AND version.artifact_id = x.artifact_id
    AND version.org_id = x.org_id
    AND version.workspace_id = x.workspace_id
    AND aggregate.current_approved_version_id = version.id
    AND aggregate.lifecycle = 'approved'
    AND version.lifecycle = 'approved'
  FOR SHARE OF version, aggregate;
  IF v.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  IF x.state IN ('available','failed') THEN RETURN NULL; END IF;
  IF x.state IN ('requested','rendering','uploaded')
     AND x.state_changed_at > now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF x.state = 'reconciling'
     AND x.reconciliation_claimed_at > now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF x.state NOT IN ('requested','rendering','uploaded','reconciliation_required','reconciling') THEN
    RETURN NULL;
  END IF;
  next_count := CASE
    WHEN x.state = 'reconciliation_required' THEN GREATEST(x.reconciliation_count, 1)
    WHEN x.state = 'reconciling' THEN x.reconciliation_count + 1
    ELSE GREATEST(x.reconciliation_count + 1, 1)
  END;
  IF next_count >= 3 THEN
    UPDATE public.studio_rendition_attempts
    SET state = 'failed', failure_code = 'RECONCILIATION_EXHAUSTED',
        reconciliation_count = 3, reconciliation_claimed_at = NULL, completed_at = now()
    WHERE id = x.id;
    RETURN NULL;
  END IF;
  phase := CASE WHEN x.state IN ('requested','rendering') THEN 'pre_render' ELSE 'verify_or_upload' END;
  next_fence := x.execution_fence + 1;
  UPDATE public.studio_rendition_attempts
  SET state = 'reconciling', failure_code = NULL,
      reconciliation_count = next_count, reconciliation_claimed_at = now(),
      execution_fence = next_fence, completed_at = NULL
  WHERE id = x.id;

  IF phase = 'verify_or_upload' THEN
    extension := CASE x.format WHEN 'markdown' THEN 'md' ELSE x.format END;
    expected_key := format('%s/%s/studio-artifacts/%s.%s', x.org_id, x.workspace_id, x.opaque_object_id, extension);
    expected_mime := CASE x.format
      WHEN 'markdown' THEN 'text/markdown; charset=utf-8'
      WHEN 'pdf' THEN 'application/pdf'
      ELSE 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    END;
    IF x.storage_provider IS DISTINCT FROM 'supabase'
       OR x.bucket_id IS DISTINCT FROM 'studio-private-artifacts'
       OR x.object_key IS DISTINCT FROM expected_key
       OR x.content_hash !~ '^[0-9a-f]{64}$'
       OR x.byte_length <= 0
       OR x.mime_type IS DISTINCT FROM expected_mime
       OR x.safe_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'COMMAND_UNAVAILABLE';
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'phase', phase,
    'attemptId', x.id,
    'renditionId', x.rendition_id,
    'organizationId', x.org_id,
    'workspaceId', x.workspace_id,
    'artifactId', x.artifact_id,
    'artifactVersionId', x.artifact_version_id,
    'artifactVersion', x.artifact_version,
    'artifactType', x.artifact_type,
    'format', x.format,
    'opaqueObjectId', x.opaque_object_id,
    'approvedContent', v.content,
    'contentSchemaVersion', x.content_schema_version,
    'rendererVersion', x.renderer_version,
    'templateVersion', x.template_version,
    'reconciliationCount', next_count,
    'fence', next_fence,
    'objectKey', CASE WHEN phase = 'verify_or_upload' THEN x.object_key END,
    'byteLength', CASE WHEN phase = 'verify_or_upload' THEN x.byte_length END,
    'sha256', CASE WHEN phase = 'verify_or_upload' THEN x.content_hash END,
    'mimeType', CASE WHEN phase = 'verify_or_upload' THEN x.mime_type END,
    'filename', CASE WHEN phase = 'verify_or_upload' THEN x.safe_filename END
  ));
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_reconciliation_rendered(
  p_attempt uuid,
  p_fence bigint,
  p_object_key text,
  p_hash text,
  p_byte_length bigint,
  p_mime text,
  p_safe_filename text,
  p_renderer_version text,
  p_template_version text,
  p_content_schema_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  x public.studio_rendition_attempts;
  extension text;
  expected_key text;
  expected_mime text;
BEGIN
  SELECT * INTO x FROM public.studio_rendition_attempts WHERE id = p_attempt FOR UPDATE;
  IF x.id IS NULL OR x.state <> 'reconciling' OR x.execution_fence <> p_fence THEN
    RAISE EXCEPTION USING MESSAGE = 'AUTHORITY_STALE';
  END IF;
  PERFORM public.studio_assert_actor(
    x.requested_by, x.org_id, x.workspace_id,
    'studio.artifacts.rendition.generate', x.requester_authorization_version
  );
  extension := CASE x.format WHEN 'markdown' THEN 'md' ELSE x.format END;
  expected_key := format('%s/%s/studio-artifacts/%s.%s', x.org_id, x.workspace_id, x.opaque_object_id, extension);
  expected_mime := CASE x.format
    WHEN 'markdown' THEN 'text/markdown; charset=utf-8'
    WHEN 'pdf' THEN 'application/pdf'
    ELSE 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  END;
  IF p_object_key IS DISTINCT FROM expected_key
     OR p_hash !~ '^[0-9a-f]{64}$'
     OR p_byte_length <= 0
     OR p_mime IS DISTINCT FROM expected_mime
     OR p_safe_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
     OR p_renderer_version IS DISTINCT FROM x.renderer_version
     OR p_template_version IS DISTINCT FROM x.template_version
     OR p_content_schema_version IS DISTINCT FROM x.content_schema_version
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_RENDITION_METADATA';
  END IF;
  UPDATE public.studio_rendition_attempts
  SET storage_provider = 'supabase', bucket_id = 'studio-private-artifacts',
      object_key = p_object_key, content_hash = p_hash, byte_length = p_byte_length,
      mime_type = p_mime, safe_filename = p_safe_filename, rendered_at = now()
  WHERE id = x.id;
  RETURN jsonb_build_object('outcome','committed','attemptId',x.id,'state','reconciling');
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_reconciliation_complete(
  p_attempt uuid,
  p_fence bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE x public.studio_rendition_attempts;
BEGIN
  SELECT * INTO x FROM public.studio_rendition_attempts WHERE id = p_attempt FOR UPDATE;
  IF x.id IS NULL OR x.state <> 'reconciling' OR x.execution_fence <> p_fence THEN
    RAISE EXCEPTION USING MESSAGE = 'AUTHORITY_STALE';
  END IF;
  RETURN public.studio_rendition_attempt_complete(p_attempt);
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_reconciliation_fail(
  p_attempt uuid,
  p_fence bigint,
  p_failure text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  x public.studio_rendition_attempts;
  audit_id uuid := gen_random_uuid();
  target_state text;
  next_count integer;
BEGIN
  SELECT * INTO x FROM public.studio_rendition_attempts WHERE id = p_attempt FOR UPDATE;
  IF x.id IS NULL OR x.state <> 'reconciling' OR x.execution_fence <> p_fence THEN
    RAISE EXCEPTION USING MESSAGE = 'AUTHORITY_STALE';
  END IF;
  IF p_failure !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_FAILURE';
  END IF;
  target_state := CASE
    WHEN p_failure IN ('UPLOAD_OUTCOME_UNKNOWN','AVAILABLE_COMPLETION_FAILED')
      THEN 'reconciliation_required'
    ELSE 'failed'
  END;
  next_count := CASE
    WHEN target_state = 'reconciliation_required'
      THEN LEAST(x.reconciliation_count + 1, 3)
    ELSE x.reconciliation_count
  END;
  UPDATE public.studio_rendition_attempts
  SET state = target_state,
      failure_code = p_failure,
      reconciliation_count = next_count,
      reconciliation_claimed_at = NULL,
      completed_at = CASE WHEN target_state = 'failed' THEN now() ELSE NULL END,
      state_changed_at = now()
  WHERE id = x.id;
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES (
    audit_id,x.org_id,x.workspace_id,x.requested_by,x.request_id,
    'studio.rendition.reconciliation.fail','studio_rendition_attempt',x.id,
    CASE WHEN target_state = 'failed' THEN 'failed' ELSE 'succeeded' END,6,
    jsonb_build_object(
      'attemptId',x.id,'failureCode',p_failure,'state',target_state,
      'reconciliationCount',next_count,'fence',p_fence
    )
  );
  RETURN jsonb_build_object(
    'outcome','committed','attemptId',x.id,'state',target_state
  );
END
$$;

CREATE OR REPLACE FUNCTION public.studio_deletion_reconciliation_claim(p_attempt uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  a public.studio_rendition_deletion_attempts;
  d public.studio_rendition_deletion_resolutions;
  r public.studio_renditions;
  audit_id uuid := gen_random_uuid();
  command_request_id uuid;
  next_count integer;
  resulting_version bigint;
BEGIN
  SELECT * INTO a FROM public.studio_rendition_deletion_attempts WHERE id = p_attempt FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  SELECT * INTO d FROM public.studio_rendition_deletion_resolutions WHERE id = a.resolution_id AND outcome = 'approved';
  IF d.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM public.studio_assert_actor(
    d.resolved_by, d.org_id, d.workspace_id,
    'studio.artifacts.delete.approve', d.resolver_authorization_version
  );
  SELECT * INTO r FROM public.studio_renditions
  WHERE id = a.rendition_id AND org_id = a.org_id AND workspace_id = a.workspace_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
  IF a.state = 'completed' AND r.lifecycle = 'deleted' THEN RETURN NULL; END IF;
  IF a.state = 'failed' THEN RETURN NULL; END IF;
  IF r.lifecycle <> 'deleting' THEN
    RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
  END IF;
  IF a.state IN ('requested','executing')
     AND a.state_changed_at > now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF a.state = 'reconciling'
     AND a.reconciliation_claimed_at > now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF a.state NOT IN ('requested','executing','reconciliation_required','reconciling') THEN RETURN NULL; END IF;
  next_count := a.reconciliation_count + 1;
  IF next_count > 3 THEN
    SELECT cr.request_id INTO command_request_id
    FROM public.studio_private_artifact_command_receipts cr
    WHERE cr.id = d.receipt_id;
    IF command_request_id IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
    END IF;
    UPDATE public.studio_rendition_deletion_attempts
    SET state = 'failed', failure_code = 'DELETION_RECONCILIATION_EXHAUSTED',
        reconciliation_count = 3, reconciliation_claimed_at = NULL,
        execution_claimed_at = NULL, completed_at = now()
    WHERE id = a.id;
    UPDATE public.studio_renditions
    SET lifecycle = 'deletion_failed', lifecycle_version = lifecycle_version + 1, updated_at = now()
    WHERE id = r.id
    RETURNING lifecycle_version INTO resulting_version;
    INSERT INTO public.privileged_audit_events(
      id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
      outcome,resource_version,metadata
    ) VALUES (
      audit_id,r.org_id,r.workspace_id,d.resolved_by,command_request_id,
      'studio.rendition.deletion.reconciliation.exhausted','studio_rendition',r.id,
      'failed',resulting_version,
      jsonb_build_object(
        'deletionAttemptId',a.id,'deletionRequestId',a.request_id,
        'resolutionId',d.id,'executionFence',a.execution_fence,
        'failureCode','DELETION_RECONCILIATION_EXHAUSTED',
        'reconciliationCount',3,'resultingLifecycleVersion',resulting_version
      )
    );
    RETURN NULL;
  END IF;
  UPDATE public.studio_rendition_deletion_attempts
  SET state = 'reconciling', failure_code = NULL,
      reconciliation_count = next_count, reconciliation_claimed_at = now(),
      execution_claimed_at = NULL, completed_at = NULL
  WHERE id = a.id;
  RETURN jsonb_build_object(
    'deletionAttemptId', a.id,
    'renditionId', r.id,
    'organizationId', r.org_id,
    'workspaceId', r.workspace_id,
    'reconciliationCount', next_count
  );
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_deletion_execution_claim(p_attempt uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  a public.studio_rendition_deletion_attempts;
  d public.studio_rendition_deletion_resolutions;
  r public.studio_renditions;
  control public.studio_private_artifact_runtime_control;
  retention jsonb;
  holds integer;
  next_fence bigint;
BEGIN
  SELECT * INTO a FROM public.studio_rendition_deletion_attempts WHERE id = p_attempt FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  SELECT * INTO d FROM public.studio_rendition_deletion_resolutions WHERE id = a.resolution_id AND outcome = 'approved';
  IF d.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM public.studio_assert_actor(
    d.resolved_by, d.org_id, d.workspace_id,
    'studio.artifacts.delete.approve', d.resolver_authorization_version
  );
  SELECT * INTO r FROM public.studio_renditions
  WHERE id = a.rendition_id AND org_id = a.org_id AND workspace_id = a.workspace_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
  SELECT * INTO control FROM public.studio_private_artifact_runtime_control WHERE singleton FOR SHARE;
  IF NOT control.enabled OR control.read_only OR NOT control.provider_enabled OR NOT control.deletion_enabled THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_READ_ONLY';
  END IF;
  retention := public.studio_effective_retention(r.id);
  holds := public.studio_active_hold_count(r.id);
  IF r.lifecycle <> 'deleting'
     OR holds > 0
     OR retention ->> 'indefinite' = 'true'
     OR COALESCE((retention ->> 'retentionUntil')::timestamptz, 'infinity') > now()
  THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_DELETION_BLOCKED';
  END IF;
  IF a.state = 'executing'
     AND a.execution_claimed_at > now() - interval '5 minutes' THEN RETURN NULL; END IF;
  IF a.state NOT IN ('requested','reconciling','reconciliation_required','executing') THEN RETURN NULL; END IF;
  next_fence := a.execution_fence + 1;
  UPDATE public.studio_rendition_deletion_attempts
  SET state = 'executing', execution_fence = next_fence,
      execution_claimed_at = now(), reconciliation_claimed_at = NULL,
      failure_code = NULL,
      reconciliation_count = CASE
        WHEN a.state = 'requested' AND a.reconciliation_count = 0 THEN 1
        ELSE a.reconciliation_count
      END
  WHERE id = a.id;
  RETURN jsonb_build_object(
    'deletionAttemptId', a.id,
    'renditionId', r.id,
    'organizationId', r.org_id,
    'workspaceId', r.workspace_id,
    'objectKey', r.object_key,
    'reconciliationCount', CASE
      WHEN a.state = 'requested' AND a.reconciliation_count = 0 THEN 1
      ELSE a.reconciliation_count
    END,
    'fence', next_fence
  );
END
$$;

DROP FUNCTION IF EXISTS public.studio_rendition_deletion_complete(uuid,bigint);

CREATE OR REPLACE FUNCTION public.studio_rendition_deletion_complete(
  p_attempt uuid,
  p_fence bigint,
  p_provider_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  a public.studio_rendition_deletion_attempts;
  d public.studio_rendition_deletion_resolutions;
  r public.studio_renditions;
  retention jsonb;
  holds integer;
  audit_id uuid := gen_random_uuid();
  command_request_id uuid;
  resulting_version bigint;
BEGIN
  SELECT * INTO a FROM public.studio_rendition_deletion_attempts WHERE id = p_attempt FOR UPDATE;
  IF a.id IS NULL OR a.state <> 'executing' OR a.execution_fence <> p_fence THEN
    RAISE EXCEPTION USING MESSAGE = 'AUTHORITY_STALE';
  END IF;
  SELECT * INTO d FROM public.studio_rendition_deletion_resolutions WHERE id = a.resolution_id;
  IF d.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM public.studio_assert_actor(
    d.resolved_by, d.org_id, d.workspace_id,
    'studio.artifacts.delete.approve', d.resolver_authorization_version
  );
  IF p_provider_outcome NOT IN ('deleted','missing') THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_PROVIDER_OUTCOME';
  END IF;
  SELECT cr.request_id INTO command_request_id
  FROM public.studio_private_artifact_command_receipts cr
  WHERE cr.id = d.receipt_id;
  IF command_request_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
  END IF;
  SELECT * INTO r FROM public.studio_renditions WHERE id = a.rendition_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(r.id::text, 0));
  retention := public.studio_effective_retention(r.id);
  holds := public.studio_active_hold_count(r.id);
  IF r.lifecycle <> 'deleting'
     OR holds > 0
     OR retention ->> 'indefinite' = 'true'
     OR COALESCE((retention ->> 'retentionUntil')::timestamptz, 'infinity') > now()
  THEN
    RAISE EXCEPTION USING MESSAGE = 'STUDIO_DELETION_BLOCKED';
  END IF;
  UPDATE public.studio_rendition_deletion_attempts
  SET state = 'completed', failure_code = NULL, execution_claimed_at = NULL,
      reconciliation_claimed_at = NULL, completed_at = now()
  WHERE id = a.id;
  UPDATE public.studio_renditions
  SET lifecycle = 'deleted', lifecycle_version = lifecycle_version + 1,
      updated_at = now(), deleted_at = now()
  WHERE id = r.id
  RETURNING lifecycle_version INTO resulting_version;
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES (
    audit_id,r.org_id,r.workspace_id,d.resolved_by,command_request_id,
    'studio.rendition.deletion.complete','studio_rendition',r.id,
    'succeeded',resulting_version,
    jsonb_build_object(
      'deletionAttemptId',a.id,'deletionRequestId',a.request_id,
      'resolutionId',d.id,'executionFence',p_fence,
      'reconciliationCount',a.reconciliation_count,
      'providerOutcome',p_provider_outcome,'format',r.format,
      'contentHash',r.content_hash,'byteLength',r.byte_length,
      'resultingLifecycleVersion',resulting_version
    )
  );
  RETURN jsonb_build_object('outcome','committed','attemptId',a.id,'state','deleted');
END
$$;

CREATE OR REPLACE FUNCTION public.studio_rendition_deletion_fail(
  p_attempt uuid,
  p_fence bigint,
  p_failure text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  a public.studio_rendition_deletion_attempts;
  d public.studio_rendition_deletion_resolutions;
  r public.studio_renditions;
  audit_id uuid := gen_random_uuid();
  command_request_id uuid;
  target_state text;
  resulting_version bigint;
BEGIN
  SELECT * INTO a FROM public.studio_rendition_deletion_attempts WHERE id = p_attempt FOR UPDATE;
  IF a.id IS NULL OR a.state <> 'executing' OR a.execution_fence <> p_fence THEN
    RAISE EXCEPTION USING MESSAGE = 'AUTHORITY_STALE';
  END IF;
  IF p_failure !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'INVALID_FAILURE';
  END IF;
  SELECT * INTO d FROM public.studio_rendition_deletion_resolutions WHERE id = a.resolution_id;
  IF d.id IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE'; END IF;
  PERFORM public.studio_assert_actor(
    d.resolved_by, d.org_id, d.workspace_id,
    'studio.artifacts.delete.approve', d.resolver_authorization_version
  );
  SELECT cr.request_id INTO command_request_id
  FROM public.studio_private_artifact_command_receipts cr
  WHERE cr.id = d.receipt_id;
  IF command_request_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'RESOURCE_NOT_AVAILABLE';
  END IF;
  SELECT * INTO r FROM public.studio_renditions WHERE id = a.rendition_id FOR UPDATE;
  target_state := CASE
    WHEN p_failure IN ('DELETE_OUTCOME_UNKNOWN','TOMBSTONE_COMPLETION_FAILED')
      THEN 'reconciliation_required'
    ELSE 'failed'
  END;
  UPDATE public.studio_rendition_deletion_attempts
  SET state = target_state, failure_code = p_failure,
      execution_claimed_at = NULL, reconciliation_claimed_at = NULL,
      completed_at = CASE WHEN target_state = 'failed' THEN now() ELSE NULL END
  WHERE id = a.id;
  IF target_state = 'failed' THEN
    UPDATE public.studio_renditions
    SET lifecycle = 'deletion_failed', lifecycle_version = lifecycle_version + 1, updated_at = now()
    WHERE id = r.id
    RETURNING lifecycle_version INTO resulting_version;
  ELSE
    resulting_version := r.lifecycle_version;
  END IF;
  INSERT INTO public.privileged_audit_events(
    id,org_id,workspace_id,actor_id,request_id,action,resource_type,resource_id,
    outcome,resource_version,metadata
  ) VALUES (
    audit_id,r.org_id,r.workspace_id,d.resolved_by,command_request_id,
    'studio.rendition.deletion.fail','studio_rendition',r.id,
    CASE WHEN target_state = 'failed' THEN 'failed' ELSE 'succeeded' END,
    resulting_version,
    jsonb_build_object(
      'deletionAttemptId',a.id,'deletionRequestId',a.request_id,
      'resolutionId',d.id,'executionFence',p_fence,
      'failureCode',p_failure,'targetState',target_state,
      'reconciliationCount',a.reconciliation_count,
      'resultingLifecycleVersion',resulting_version
    )
  );
  RETURN jsonb_build_object(
    'outcome','committed','attemptId',a.id,
    'state', CASE WHEN target_state = 'failed' THEN 'deletion_failed' ELSE target_state END
  );
END
$$;

REVOKE ALL ON FUNCTION public.studio_private_artifact_command_claim_pr217_accepted(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.studio_rendition_deletion_complete(uuid),
  public.studio_rendition_deletion_fail(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.studio_private_state_timestamp(),
  public.studio_deletion_attempt_guard(),
  public.studio_private_artifact_reconciliation_due(integer),
  public.studio_rendition_reconciliation_rendered(uuid,bigint,text,text,bigint,text,text,text,text,text),
  public.studio_rendition_reconciliation_complete(uuid,bigint),
  public.studio_rendition_reconciliation_fail(uuid,bigint,text),
  public.studio_rendition_deletion_execution_claim(uuid),
  public.studio_rendition_deletion_complete(uuid,bigint,text),
  public.studio_rendition_deletion_fail(uuid,bigint,text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.studio_private_artifact_projection(uuid,uuid,uuid),
  public.studio_private_artifact_command_claim(jsonb),
  public.studio_rendition_reconciliation_claim(uuid),
  public.studio_deletion_reconciliation_claim(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.studio_private_artifact_projection(uuid,uuid,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.studio_private_artifact_command_claim(jsonb),
  public.studio_private_artifact_reconciliation_due(integer),
  public.studio_rendition_reconciliation_claim(uuid),
  public.studio_rendition_reconciliation_rendered(uuid,bigint,text,text,bigint,text,text,text,text,text),
  public.studio_rendition_reconciliation_complete(uuid,bigint),
  public.studio_rendition_reconciliation_fail(uuid,bigint,text),
  public.studio_deletion_reconciliation_claim(uuid),
  public.studio_rendition_deletion_execution_claim(uuid),
  public.studio_rendition_deletion_complete(uuid,bigint,text),
  public.studio_rendition_deletion_fail(uuid,bigint,text)
  TO service_role;

COMMENT ON FUNCTION public.studio_private_artifact_reconciliation_due(integer)
IS 'Service-only bounded discovery of stale Studio private-artifact attempt identifiers. No Storage binding is returned.';
COMMENT ON FUNCTION public.studio_rendition_deletion_execution_claim(uuid)
IS 'Service-only fenced execution-time guard. Rechecks retention and active holds before any provider deletion.';
