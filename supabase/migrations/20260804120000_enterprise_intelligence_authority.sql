-- Enterprise Intelligence vertical authority.
--
-- This is additive. It does not alter PR1G scoring, existing Assess decision
-- law, accepted Studio artifact versions, private-artifact retention, Health,
-- deployment state, or any live infrastructure. Browser clients do not write
-- these tables; the Enterprise Intelligence Edge command boundary uses the
-- service role only after resolving the caller's tenant authority.

INSERT INTO public.capabilities (capability_key, module, description) VALUES
  ('org.admin', 'organization', 'Manage organization-scoped governed controls'),
  ('byok.manage', 'admin', 'Register and enable server-managed provider routes'),
  ('security.manage', 'admin', 'Manage security-sensitive provider controls'),
  ('evidence.write', 'assess', 'Capture and extract workspace-scoped evidence'),
  ('evidence.review', 'assess', 'Review workspace-scoped evidence candidates'),
  ('assessment.edit', 'assess', 'Edit workspace-scoped Assess drafts'),
  ('assessment.review', 'assess', 'Review workspace-scoped Assess decisions'),
  ('portfolio.manage', 'assess', 'Create workspace-scoped modernization assessments'),
  ('approvals.review', 'govern', 'Record independent high-impact reviews and approvals'),
  ('docs.approve', 'docs', 'Create governed handoffs from approved Studio documents'),
  ('project.manage', 'delivery', 'Manage governed Delivery work packages'),
  ('project.read', 'delivery', 'Read governed Delivery work packages'),
  ('monitor.manage', 'monitor', 'Create governed Monitor baselines'),
  ('monitor.read', 'monitor', 'Read governed Monitor baselines'),
  ('assemble.manage', 'assemble', 'Create Assemble Phase 1 blueprint drafts')
ON CONFLICT (capability_key) DO UPDATE
SET module = EXCLUDED.module, description = EXCLUDED.description;

INSERT INTO public.role_capabilities (role_id, capability_key)
SELECT r.id, p.value
FROM public.roles r
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(r.permissions) = 'array' THEN r.permissions ELSE '[]'::jsonb END
) p(value)
JOIN public.capabilities c ON c.capability_key = p.value
WHERE p.value IN (
  'org.admin', 'byok.manage', 'security.manage', 'evidence.write', 'evidence.review',
  'assessment.edit', 'assessment.review', 'portfolio.manage', 'approvals.review',
  'docs.approve', 'project.manage', 'project.read', 'monitor.manage', 'monitor.read',
  'assemble.manage'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_capabilities (role_id, capability_key)
SELECT r.id, 'org.admin'
FROM public.roles r
WHERE r.scope = 'organization' AND lower(r.name) = 'admin'
ON CONFLICT DO NOTHING;

ALTER TABLE public.ai_provider_key_refs DROP CONSTRAINT IF EXISTS ai_provider_key_refs_provider_check;
ALTER TABLE public.ai_provider_key_refs
  ADD CONSTRAINT ai_provider_key_refs_provider_check
  CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'openai_compatible')) NOT VALID;

ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_provider_check;
ALTER TABLE public.ai_provider_configs
  ADD CONSTRAINT ai_provider_configs_provider_check
  CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'openai_compatible')) NOT VALID;

ALTER TABLE public.ai_provider_configs ADD COLUMN IF NOT EXISTS endpoint_url TEXT;
ALTER TABLE public.ai_provider_configs ADD COLUMN IF NOT EXISTS deployment_name TEXT;
ALTER TABLE public.ai_provider_configs ADD COLUMN IF NOT EXISTS model_allowlist TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.ai_provider_configs ADD COLUMN IF NOT EXISTS budget_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ai_provider_configs ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ;
ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_model_allowlist_check;
ALTER TABLE public.ai_provider_configs
  ADD CONSTRAINT ai_provider_configs_model_allowlist_check
  CHECK (cardinality(model_allowlist) <= 64);
ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_budget_policy_check;
ALTER TABLE public.ai_provider_configs
  ADD CONSTRAINT ai_provider_configs_budget_policy_check
  CHECK (jsonb_typeof(budget_policy) = 'object');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_provider_configs_id_org_key'
      AND conrelid = 'public.ai_provider_configs'::regclass
  ) THEN
    ALTER TABLE public.ai_provider_configs ADD CONSTRAINT ai_provider_configs_id_org_key UNIQUE (id, org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_provider_key_refs_id_org_key'
      AND conrelid = 'public.ai_provider_key_refs'::regclass
  ) THEN
    ALTER TABLE public.ai_provider_key_refs ADD CONSTRAINT ai_provider_key_refs_id_org_key UNIQUE (id, org_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_provider_configs_key_ref_org_fkey'
      AND conrelid = 'public.ai_provider_configs'::regclass
  ) THEN
    ALTER TABLE public.ai_provider_configs
      ADD CONSTRAINT ai_provider_configs_key_ref_org_fkey
      FOREIGN KEY (key_ref_id, org_id)
      REFERENCES public.ai_provider_key_refs(id, org_id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.enterprise_ai_capability_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  provider_config_id UUID NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN (
    'assess.evidence.extract',
    'assess.evidence.summarize',
    'delivery.work_items.draft',
    'modernization.rationale.draft',
    'assemble.blueprint.draft',
    'studio.document.generate'
  )),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 200),
  enabled BOOLEAN NOT NULL DEFAULT false,
  allowed_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  updated_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT enterprise_ai_capability_routes_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_ai_routes_provider_org_fkey
    FOREIGN KEY (provider_config_id, org_id)
    REFERENCES public.ai_provider_configs(id, org_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS enterprise_ai_one_active_route
  ON public.enterprise_ai_capability_routes(org_id, workspace_id, capability)
  WHERE enabled = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS enterprise_ai_routes_workspace
  ON public.enterprise_ai_capability_routes(org_id, workspace_id, enabled)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.enterprise_ai_command_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  command_type TEXT NOT NULL CHECK (length(btrim(command_type)) BETWEEN 1 AND 120),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  request_id UUID NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('claimed', 'committed', 'failed', 'blocked')),
  resource_id UUID,
  response JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT enterprise_ai_receipts_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  UNIQUE (org_id, actor_id, command_type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.enterprise_ai_job_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  capability TEXT NOT NULL CHECK (capability IN (
    'assess.evidence.extract',
    'assess.evidence.summarize',
    'delivery.work_items.draft',
    'modernization.rationale.draft',
    'assemble.blueprint.draft',
    'studio.document.generate'
  )),
  provider_config_id UUID,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'openai_compatible')),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 200),
  prompt_key TEXT NOT NULL CHECK (length(btrim(prompt_key)) BETWEEN 1 AND 200),
  prompt_version TEXT NOT NULL CHECK (length(btrim(prompt_version)) BETWEEN 1 AND 120),
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  request_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked')),
  token_input INTEGER CHECK (token_input IS NULL OR token_input >= 0),
  token_output INTEGER CHECK (token_output IS NULL OR token_output >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  failure_class TEXT,
  output_hash TEXT CHECK (output_hash IS NULL OR output_hash ~ '^[0-9a-f]{64}$'),
  approval_state TEXT NOT NULL CHECK (approval_state IN ('not_required', 'review_required', 'approved', 'rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object'
    AND NOT (metadata ?| ARRAY[
      'api_key', 'auth_header', 'authorization', 'bearer_token', 'completion',
      'completion_body', 'encrypted_key', 'prompt', 'prompt_body', 'provider_key',
      'raw_completion', 'raw_key', 'raw_prompt', 'response_body', 'secret',
      'secret_value', 'storage_path', 'object_key'
    ])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT enterprise_ai_job_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_ai_job_provider_org_fkey
    FOREIGN KEY (provider_config_id, org_id)
    REFERENCES public.ai_provider_configs(id, org_id) ON DELETE SET NULL,
  UNIQUE (id, org_id),
  UNIQUE (org_id, actor_id, capability, idempotency_key)
);

-- Claim idempotency before any Storage, provider, or state effect. A unique
-- row lock makes a concurrent duplicate observe the in-progress claim instead
-- of executing the command a second time. Completion/failure are forward-only
-- and retain the sanitized response for exact replay.
CREATE OR REPLACE FUNCTION public.enterprise_ai_claim_command(
  p_actor UUID,
  p_org UUID,
  p_workspace UUID,
  p_command_type TEXT,
  p_key TEXT,
  p_request UUID,
  p_hash TEXT
)
RETURNS public.enterprise_ai_command_receipts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_row public.enterprise_ai_command_receipts;
BEGIN
  IF p_actor IS NULL OR p_org IS NULL OR p_workspace IS NULL OR p_request IS NULL
     OR p_key IS NULL OR length(btrim(p_key)) NOT BETWEEN 8 AND 200
     OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'ENTERPRISE_AI_INVALID_COMMAND';
  END IF;
  INSERT INTO public.enterprise_ai_command_receipts(
    org_id, workspace_id, actor_id, command_type, idempotency_key,
    request_id, request_hash, status, response
  ) VALUES (
    p_org, p_workspace, p_actor, p_command_type, p_key,
    p_request, p_hash, 'claimed', '{}'::jsonb
  )
  ON CONFLICT (org_id, actor_id, command_type, idempotency_key) DO NOTHING
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.enterprise_ai_command_receipts
    WHERE org_id = p_org AND workspace_id = p_workspace
      AND actor_id = p_actor AND command_type = p_command_type
      AND idempotency_key = p_key
    FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'ENTERPRISE_AI_NOT_FOUND'; END IF;
    IF v_row.request_hash <> p_hash THEN RAISE EXCEPTION 'ENTERPRISE_AI_IDEMPOTENCY_CONFLICT'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.enterprise_ai_complete_command(
  p_id UUID, p_org UUID, p_workspace UUID, p_response JSONB, p_resource_id UUID DEFAULT NULL
)
RETURNS public.enterprise_ai_command_receipts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_row public.enterprise_ai_command_receipts;
BEGIN
  UPDATE public.enterprise_ai_command_receipts
  SET status = 'committed', response = COALESCE(p_response, '{}'::jsonb),
      resource_id = p_resource_id, completed_at = statement_timestamp()
  WHERE id = p_id AND org_id = p_org AND workspace_id = p_workspace AND status = 'claimed'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED'; END IF;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.enterprise_ai_fail_command(
  p_id UUID, p_org UUID, p_workspace UUID, p_response JSONB, p_blocked BOOLEAN DEFAULT false
)
RETURNS public.enterprise_ai_command_receipts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_row public.enterprise_ai_command_receipts;
BEGIN
  UPDATE public.enterprise_ai_command_receipts
  SET status = CASE WHEN p_blocked THEN 'blocked' ELSE 'failed' END,
      response = COALESCE(p_response, '{}'::jsonb), completed_at = statement_timestamp()
  WHERE id = p_id AND org_id = p_org AND workspace_id = p_workspace AND status = 'claimed'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'ENTERPRISE_AI_RECEIPT_NOT_CLAIMED'; END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_ai_claim_command(UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enterprise_ai_complete_command(UUID, UUID, UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enterprise_ai_fail_command(UUID, UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_ai_claim_command(UUID, UUID, UUID, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.enterprise_ai_complete_command(UUID, UUID, UUID, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.enterprise_ai_fail_command(UUID, UUID, UUID, JSONB, BOOLEAN) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  provider_config_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'openai_compatible')),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 200),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count = 1),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_ai_usage_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_ai_usage_job_org_fkey
    FOREIGN KEY (job_id, org_id)
    REFERENCES public.enterprise_ai_job_ledger(id, org_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_ai_usage_provider_org_fkey
    FOREIGN KEY (provider_config_id, org_id)
    REFERENCES public.ai_provider_configs(id, org_id) ON DELETE RESTRICT,
  UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_evidence_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 240),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('upload', 'pasted_text')),
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'text/plain', 'text/markdown', 'text/csv', 'text/vtt', 'application/x-subrip',
    'text/x-srt', 'text/meeting-notes', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'extracting', 'review', 'deleted', 'failed')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT enterprise_evidence_sources_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  UNIQUE (id, org_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_evidence_source_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  original_filename TEXT NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 240),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content_bytes BIGINT NOT NULL CHECK (content_bytes > 0),
  storage_bucket TEXT NOT NULL DEFAULT 'source-uploads' CHECK (storage_bucket = 'source-uploads'),
  storage_path TEXT NOT NULL CHECK (length(btrim(storage_path)) BETWEEN 1 AND 1024),
  extracted_text_hash TEXT CHECK (extracted_text_hash IS NULL OR extracted_text_hash ~ '^[0-9a-f]{64}$'),
  extracted_character_count INTEGER CHECK (extracted_character_count IS NULL OR extracted_character_count >= 0),
  source_locator_schema TEXT NOT NULL DEFAULT 'source-locator-1',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_evidence_versions_source_fkey
    FOREIGN KEY (source_id, org_id, workspace_id)
    REFERENCES public.enterprise_evidence_sources(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, source_id, org_id, workspace_id),
  UNIQUE (source_id, version),
  UNIQUE (org_id, workspace_id, content_hash)
);

CREATE OR REPLACE FUNCTION public.enterprise_create_evidence_source(p_source JSONB, p_version JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_source public.enterprise_evidence_sources; v_version public.enterprise_evidence_source_versions;
BEGIN
  INSERT INTO public.enterprise_evidence_sources(
    id, org_id, workspace_id, display_name, source_kind, mime_type,
    current_version, status, created_by
  ) VALUES (
    (p_source->>'id')::uuid, (p_source->>'org_id')::uuid, (p_source->>'workspace_id')::uuid,
    p_source->>'display_name', p_source->>'source_kind', p_source->>'mime_type',
    (p_source->>'current_version')::integer, p_source->>'status', (p_source->>'created_by')::uuid
  ) RETURNING * INTO v_source;
  INSERT INTO public.enterprise_evidence_source_versions(
    id, source_id, org_id, workspace_id, version, original_filename,
    content_hash, content_bytes, storage_bucket, storage_path,
    extracted_text_hash, extracted_character_count, created_by
  ) VALUES (
    (p_version->>'id')::uuid, (p_version->>'source_id')::uuid,
    (p_version->>'org_id')::uuid, (p_version->>'workspace_id')::uuid,
    (p_version->>'version')::integer, p_version->>'original_filename',
    p_version->>'content_hash', (p_version->>'content_bytes')::bigint,
    p_version->>'storage_bucket', p_version->>'storage_path',
    p_version->>'extracted_text_hash', (p_version->>'extracted_character_count')::integer,
    (p_version->>'created_by')::uuid
  ) RETURNING * INTO v_version;
  RETURN jsonb_build_object('sourceId', v_source.id, 'sourceVersionId', v_version.id);
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_create_evidence_source(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_create_evidence_source(JSONB, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_evidence_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_version_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  field_key TEXT NOT NULL CHECK (field_key IN (
    'process_objective', 'outcome', 'trigger', 'completion', 'actors', 'systems',
    'steps', 'rules', 'exceptions', 'manual_activities', 'controls_approvals',
    'inputs_outputs', 'volumes_frequencies', 'slas', 'pain_points', 'risks',
    'data_sensitivity', 'automation_opportunities', 'integrations',
    'unresolved_questions', 'assumptions'
  )),
  value TEXT NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 12000),
  safe_excerpt TEXT CHECK (safe_excerpt IS NULL OR length(safe_excerpt) <= 1000),
  excerpt_hash TEXT NOT NULL CHECK (excerpt_hash ~ '^[0-9a-f]{64}$'),
  source_locator TEXT NOT NULL CHECK (length(btrim(source_locator)) BETWEEN 1 AND 400),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  ai_job_id UUID REFERENCES public.enterprise_ai_job_ledger(id) ON DELETE SET NULL,
  prompt_version TEXT,
  suggestion_status TEXT NOT NULL CHECK (suggestion_status IN ('suggested', 'accepted', 'rejected', 'edited')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_evidence_candidates_source_fkey
    FOREIGN KEY (source_id, org_id, workspace_id)
    REFERENCES public.enterprise_evidence_sources(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_evidence_candidates_version_fkey
    FOREIGN KEY (source_version_id, source_id, org_id, workspace_id)
    REFERENCES public.enterprise_evidence_source_versions(id, source_id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_evidence_candidates_job_org_fkey
    FOREIGN KEY (ai_job_id, org_id)
    REFERENCES public.enterprise_ai_job_ledger(id, org_id) ON DELETE SET NULL,
  UNIQUE (id, org_id, workspace_id)
);

CREATE OR REPLACE FUNCTION public.enterprise_commit_evidence_extraction(
  p_job_id UUID,
  p_source_id UUID,
  p_org UUID,
  p_workspace UUID,
  p_output_hash TEXT,
  p_latency_ms INTEGER,
  p_provider_config_id UUID,
  p_provider TEXT,
  p_model TEXT,
  p_token_input INTEGER,
  p_token_output INTEGER,
  p_candidates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE item JSONB;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_candidates, '[]'::jsonb)) LOOP
    INSERT INTO public.enterprise_evidence_candidates(
      id, source_id, source_version_id, org_id, workspace_id, field_key,
      value, safe_excerpt, excerpt_hash, source_locator, confidence,
      ai_job_id, prompt_version, suggestion_status, created_by
    ) VALUES (
      (item->>'id')::uuid, p_source_id, (item->>'sourceVersionId')::uuid,
      p_org, p_workspace, item->>'field', item->>'value', item->>'safeExcerpt',
      item->>'excerptHash', item->>'sourceLocator', (item->>'confidence')::numeric,
      p_job_id, item->>'promptVersion', item->>'status', (item->>'createdBy')::uuid
    );
  END LOOP;
  UPDATE public.enterprise_ai_job_ledger
  SET status = 'succeeded', output_hash = p_output_hash, latency_ms = p_latency_ms,
      token_input = p_token_input, token_output = p_token_output,
      completed_at = statement_timestamp()
  WHERE id = p_job_id AND org_id = p_org AND workspace_id = p_workspace AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTERPRISE_AI_JOB_NOT_RUNNING'; END IF;
  INSERT INTO public.enterprise_ai_usage_ledger(
    job_id, provider_config_id, org_id, workspace_id, provider, model,
    input_tokens, output_tokens
  ) VALUES (p_job_id, p_provider_config_id, p_org, p_workspace, p_provider, p_model, p_token_input, p_token_output);
  UPDATE public.enterprise_evidence_sources
  SET status = 'review', updated_at = statement_timestamp()
  WHERE id = p_source_id AND org_id = p_org AND workspace_id = p_workspace AND deleted_at IS NULL;
  RETURN jsonb_build_object('jobId', p_job_id, 'candidateCount', jsonb_array_length(COALESCE(p_candidates, '[]'::jsonb)));
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_commit_evidence_extraction(UUID, UUID, UUID, UUID, TEXT, INTEGER, UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_commit_evidence_extraction(UUID, UUID, UUID, UUID, TEXT, INTEGER, UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_evidence_candidate_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  previous_value TEXT NOT NULL,
  next_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_evidence_edits_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_evidence_edits_candidate_fkey
    FOREIGN KEY (candidate_id, org_id, workspace_id)
    REFERENCES public.enterprise_evidence_candidates(id, org_id, workspace_id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.enterprise_review_evidence_candidate(
  p_candidate_id UUID, p_org UUID, p_workspace UUID, p_value TEXT,
  p_excerpt_hash TEXT, p_status TEXT, p_actor UUID,
  p_previous_value TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public.enterprise_evidence_candidates
  SET value = p_value, excerpt_hash = p_excerpt_hash, suggestion_status = p_status,
      reviewed_by = p_actor, reviewed_at = statement_timestamp(), updated_at = statement_timestamp()
  WHERE id = p_candidate_id AND org_id = p_org AND workspace_id = p_workspace;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTERPRISE_AI_CANDIDATE_NOT_FOUND'; END IF;
  IF p_status = 'edited' THEN
    INSERT INTO public.enterprise_evidence_candidate_edits(
      candidate_id, org_id, workspace_id, actor_id, previous_value, next_value, reason
    ) VALUES (p_candidate_id, p_org, p_workspace, p_actor, p_previous_value, p_value, p_reason);
  END IF;
  RETURN jsonb_build_object('candidateId', p_candidate_id, 'status', p_status, 'reviewedBy', p_actor);
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_review_evidence_candidate(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_review_evidence_candidate(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_evidence_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  question TEXT NOT NULL CHECK (length(btrim(question)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'deferred')),
  answer TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT enterprise_evidence_questions_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_evidence_questions_source_fkey
    FOREIGN KEY (source_id, org_id, workspace_id)
    REFERENCES public.enterprise_evidence_sources(id, org_id, workspace_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.enterprise_studio_delivery_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  studio_document_id UUID NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('brd', 'frd', 'pdd')),
  studio_version_id UUID NOT NULL,
  studio_version BIGINT NOT NULL CHECK (studio_version > 0),
  studio_content_hash TEXT NOT NULL CHECK (studio_content_hash ~ '^[0-9a-f]{64}$'),
  source_status TEXT NOT NULL CHECK (source_status = 'approved'),
  source_snapshot JSONB NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'stale', 'blocked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_studio_handoffs_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_studio_handoffs_studio_fkey
    FOREIGN KEY (studio_document_id, org_id, workspace_id)
    REFERENCES public.studio_artifact_aggregates(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_studio_handoffs_version_fkey
    FOREIGN KEY (studio_version_id, studio_document_id, org_id, workspace_id)
    REFERENCES public.studio_artifact_versions(id, artifact_id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (org_id, workspace_id, studio_document_id, studio_version, studio_content_hash)
);

CREATE TABLE IF NOT EXISTS public.enterprise_delivery_work_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  handoff_id UUID NOT NULL,
  current_version BIGINT NOT NULL DEFAULT 1 CHECK (current_version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'stale', 'blocked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_work_packages_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_work_packages_handoff_fkey
    FOREIGN KEY (handoff_id, org_id, workspace_id)
    REFERENCES public.enterprise_studio_delivery_handoffs(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (org_id, workspace_id, handoff_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_delivery_work_package_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  version BIGINT NOT NULL CHECK (version > 0),
  studio_document_id UUID NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('brd', 'frd', 'pdd')),
  studio_version_id UUID NOT NULL,
  studio_version BIGINT NOT NULL CHECK (studio_version > 0),
  studio_content_hash TEXT NOT NULL CHECK (studio_content_hash ~ '^[0-9a-f]{64}$'),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) <= 2097152),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'superseded', 'stale', 'blocked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_work_package_versions_package_fkey
    FOREIGN KEY (work_package_id, org_id, workspace_id)
    REFERENCES public.enterprise_delivery_work_packages(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_work_package_versions_studio_fkey
    FOREIGN KEY (studio_version_id, studio_document_id, org_id, workspace_id)
    REFERENCES public.studio_artifact_versions(id, artifact_id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, work_package_id, org_id, workspace_id),
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (work_package_id, version)
);

CREATE TABLE IF NOT EXISTS public.enterprise_delivery_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_version_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  parent_item_id UUID,
  item_type TEXT NOT NULL CHECK (item_type IN ('Epic', 'Story', 'Task', 'Milestone', 'Dependency', 'Risk')),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 400),
  description TEXT NOT NULL DEFAULT '',
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(acceptance_criteria) = 'array'),
  non_functional_requirements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(non_functional_requirements) = 'array'),
  source_section_locator TEXT NOT NULL,
  source_document_id UUID NOT NULL,
  source_document_version BIGINT NOT NULL CHECK (source_document_version > 0),
  source_document_hash TEXT NOT NULL CHECK (source_document_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_work_items_version_fkey
    FOREIGN KEY (package_version_id, org_id, workspace_id)
    REFERENCES public.enterprise_delivery_work_package_versions(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_work_items_parent_fkey
    FOREIGN KEY (parent_item_id, org_id, workspace_id)
    REFERENCES public.enterprise_delivery_work_items(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (package_version_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION public.enterprise_commit_delivery_handoff(
  p_handoff JSONB, p_package JSONB, p_version JSONB, p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE item JSONB;
BEGIN
  INSERT INTO public.enterprise_studio_delivery_handoffs(
    id, org_id, workspace_id, studio_document_id, studio_version_id,
    studio_version, studio_content_hash, artifact_type, source_status,
    source_snapshot, status, created_by
  ) VALUES (
    (p_handoff->>'id')::uuid, (p_handoff->>'org_id')::uuid, (p_handoff->>'workspace_id')::uuid,
    (p_handoff->>'studio_document_id')::uuid, (p_handoff->>'studio_version_id')::uuid,
    (p_handoff->>'studio_version')::bigint, p_handoff->>'studio_content_hash',
    p_handoff->>'artifact_type', p_handoff->>'source_status', p_handoff->'source_snapshot',
    p_handoff->>'status', (p_handoff->>'created_by')::uuid
  );
  INSERT INTO public.enterprise_delivery_work_packages(
    id, org_id, workspace_id, handoff_id, current_version, status, created_by
  ) VALUES (
    (p_package->>'id')::uuid, (p_package->>'org_id')::uuid, (p_package->>'workspace_id')::uuid,
    (p_package->>'handoff_id')::uuid, (p_package->>'current_version')::bigint,
    p_package->>'status', (p_package->>'created_by')::uuid
  );
  INSERT INTO public.enterprise_delivery_work_package_versions(
    id, work_package_id, org_id, workspace_id, version, studio_document_id,
    artifact_type, studio_version_id, studio_version, studio_content_hash,
    content, content_hash, status, created_by
  ) VALUES (
    (p_version->>'id')::uuid, (p_version->>'work_package_id')::uuid,
    (p_version->>'org_id')::uuid, (p_version->>'workspace_id')::uuid,
    (p_version->>'version')::bigint, (p_version->>'studio_document_id')::uuid,
    p_version->>'artifact_type', (p_version->>'studio_version_id')::uuid,
    (p_version->>'studio_version')::bigint, p_version->>'studio_content_hash',
    p_version->'content', p_version->>'content_hash', p_version->>'status',
    (p_version->>'created_by')::uuid
  );
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.enterprise_delivery_work_items(
      id, package_version_id, org_id, workspace_id, parent_item_id, item_type,
      title, description, acceptance_criteria, non_functional_requirements,
      source_section_locator, source_document_id, source_document_version,
      source_document_hash, idempotency_key, created_by
    ) VALUES (
      (item->>'id')::uuid, (p_version->>'id')::uuid, (p_version->>'org_id')::uuid,
      (p_version->>'workspace_id')::uuid, NULLIF(item->>'parentId', '')::uuid,
      item->>'itemType', item->>'title', item->>'description',
      COALESCE(item->'acceptanceCriteria', '[]'::jsonb),
      COALESCE(item->'nonFunctionalRequirements', '[]'::jsonb),
      item->>'sourceSectionLocator', (item->>'sourceDocumentId')::uuid,
      (item->>'sourceDocumentVersion')::bigint, item->>'sourceDocumentHash',
      item->>'idempotencyKey', (item->>'createdBy')::uuid
    );
  END LOOP;
  RETURN jsonb_build_object(
    'handoffId', (p_handoff->>'id')::uuid,
    'workPackageId', (p_package->>'id')::uuid,
    'packageVersionId', (p_version->>'id')::uuid,
    'itemIds', COALESCE((SELECT jsonb_agg(value->>'id') FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_commit_delivery_handoff(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_commit_delivery_handoff(JSONB, JSONB, JSONB, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_monitor_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  work_package_id UUID NOT NULL,
  work_package_version_id UUID NOT NULL,
  studio_document_id UUID NOT NULL,
  studio_version BIGINT NOT NULL CHECK (studio_version > 0),
  studio_content_hash TEXT NOT NULL CHECK (studio_content_hash ~ '^[0-9a-f]{64}$'),
  approved_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(approved_item_ids) = 'array'),
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(milestones) = 'array'),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies) = 'array'),
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers) = 'array'),
  risks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risks) = 'array'),
  readiness TEXT NOT NULL CHECK (readiness IN ('not_ready', 'review_required')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approval_required', 'approved', 'blocked', 'stale')),
  live_telemetry_connected BOOLEAN NOT NULL DEFAULT false CHECK (live_telemetry_connected = false),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_monitor_baselines_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_monitor_baselines_package_fkey
    FOREIGN KEY (work_package_id, org_id, workspace_id)
    REFERENCES public.enterprise_delivery_work_packages(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_monitor_baselines_package_version_fkey
    FOREIGN KEY (work_package_version_id, work_package_id, org_id, workspace_id)
    REFERENCES public.enterprise_delivery_work_package_versions(id, work_package_id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (org_id, workspace_id, work_package_version_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_modernization_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  application_ref UUID NOT NULL,
  application_version BIGINT NOT NULL CHECK (application_version > 0),
  source_assessment_id UUID NOT NULL,
  source_assessment_version BIGINT NOT NULL CHECK (source_assessment_version > 0),
  source_metadata_version_id UUID NOT NULL,
  factor_bands JSONB NOT NULL CHECK (jsonb_typeof(factor_bands) = 'object'),
  model_version TEXT NOT NULL,
  source_decision_model_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'stale', 'blocked')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_modernization_assessments_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_modernization_assessments_application_fkey
    FOREIGN KEY (application_ref, org_id, workspace_id)
    REFERENCES public.assess_application_assets(id, org_id, workspace_id) ON DELETE RESTRICT,
  CONSTRAINT enterprise_modernization_assessments_source_fkey
    FOREIGN KEY (source_assessment_id, application_ref, source_metadata_version_id, org_id, workspace_id)
    REFERENCES public.assess_application_assessment_versions(id, application_id, metadata_version_id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (org_id, workspace_id, application_ref, application_version),
  UNIQUE (id, org_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS public.enterprise_modernization_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modernization_assessment_id UUID NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  primary_disposition TEXT NOT NULL CHECK (primary_disposition IN (
    'retain', 'optimize', 'automate_around', 'integrate', 'api_enable_wrap',
    'refactor', 'replatform', 'rebuild', 'replace', 'assemble', 'retire',
    'insufficient_evidence', 'blocked'
  )),
  alternative_disposition TEXT,
  eligible_dispositions JSONB NOT NULL CHECK (jsonb_typeof(eligible_dispositions) = 'array'),
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers) = 'array'),
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conflicts) = 'array'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'stale', 'blocked')),
  requires_human_approval BOOLEAN NOT NULL DEFAULT true CHECK (requires_human_approval = true),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_modernization_decisions_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_modernization_decisions_assessment_fkey
    FOREIGN KEY (modernization_assessment_id, org_id, workspace_id)
    REFERENCES public.enterprise_modernization_assessments(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (modernization_assessment_id)
);

CREATE OR REPLACE FUNCTION public.enterprise_commit_modernization_assessment(p_assessment JSONB, p_decision JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_assessment public.enterprise_modernization_assessments; v_decision public.enterprise_modernization_decisions;
BEGIN
  INSERT INTO public.enterprise_modernization_assessments(
    id, org_id, workspace_id, application_ref, application_version,
    source_assessment_id, source_assessment_version, source_metadata_version_id,
    factor_bands, model_version, source_decision_model_version, status, created_by
  ) VALUES (
    (p_assessment->>'id')::uuid, (p_assessment->>'org_id')::uuid, (p_assessment->>'workspace_id')::uuid,
    (p_assessment->>'application_ref')::uuid, (p_assessment->>'application_version')::bigint,
    (p_assessment->>'source_assessment_id')::uuid, (p_assessment->>'source_assessment_version')::bigint,
    (p_assessment->>'source_metadata_version_id')::uuid, p_assessment->'factor_bands',
    p_assessment->>'model_version', p_assessment->>'source_decision_model_version',
    p_assessment->>'status', (p_assessment->>'created_by')::uuid
  ) RETURNING * INTO v_assessment;
  INSERT INTO public.enterprise_modernization_decisions(
    id, modernization_assessment_id, org_id, workspace_id, primary_disposition,
    alternative_disposition, eligible_dispositions, blockers, conflicts, status,
    requires_human_approval, created_by
  ) VALUES (
    (p_decision->>'id')::uuid, v_assessment.id, (p_decision->>'org_id')::uuid,
    (p_decision->>'workspace_id')::uuid, p_decision->>'primary_disposition',
    NULLIF(p_decision->>'alternative_disposition', ''), p_decision->'eligible_dispositions',
    p_decision->'blockers', p_decision->'conflicts', p_decision->>'status', true,
    (p_decision->>'created_by')::uuid
  ) RETURNING * INTO v_decision;
  RETURN jsonb_build_object('modernizationAssessmentId', v_assessment.id, 'decisionId', v_decision.id);
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_commit_modernization_assessment(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_commit_modernization_assessment(JSONB, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.enterprise_assemble_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  modernization_decision_id UUID NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('api_enable_wrap', 'refactor', 'rebuild', 'assemble')),
  schema_version TEXT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  structured_content JSONB NOT NULL CHECK (jsonb_typeof(structured_content) = 'object'),
  readable_document TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'edit', 'review', 'approval_required', 'approved', 'stale', 'blocked')),
  code_generation_enabled BOOLEAN NOT NULL DEFAULT false CHECK (code_generation_enabled = false),
  deployment_enabled BOOLEAN NOT NULL DEFAULT false CHECK (deployment_enabled = false),
  infrastructure_changes_enabled BOOLEAN NOT NULL DEFAULT false CHECK (infrastructure_changes_enabled = false),
  credential_access_enabled BOOLEAN NOT NULL DEFAULT false CHECK (credential_access_enabled = false),
  source_system_calls_enabled BOOLEAN NOT NULL DEFAULT false CHECK (source_system_calls_enabled = false),
  runtime_agents_enabled BOOLEAN NOT NULL DEFAULT false CHECK (runtime_agents_enabled = false),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_assemble_blueprints_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_assemble_blueprints_decision_fkey
    FOREIGN KEY (modernization_decision_id, org_id, workspace_id)
    REFERENCES public.enterprise_modernization_decisions(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (modernization_decision_id, version)
);

CREATE TABLE IF NOT EXISTS public.enterprise_high_impact_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('evidence_candidate', 'modernization_decision', 'delivery_work_package', 'monitor_baseline', 'assemble_blueprint')),
  resource_id UUID NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
  reviewer_authorization_version BIGINT NOT NULL CHECK (reviewer_authorization_version > 0),
  resource_hash TEXT NOT NULL CHECK (resource_hash ~ '^[0-9a-f]{64}$'),
  rationale TEXT NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_high_impact_reviews_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  UNIQUE (id, org_id, workspace_id),
  UNIQUE (org_id, workspace_id, resource_type, resource_id, reviewer_id, resource_hash)
);

CREATE TABLE IF NOT EXISTS public.enterprise_high_impact_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('evidence_candidate', 'modernization_decision', 'delivery_work_package', 'monitor_baseline', 'assemble_blueprint')),
  resource_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  reviewed_by UUID NOT NULL REFERENCES public.profiles(id),
  approved_by UUID NOT NULL REFERENCES public.profiles(id),
  review_event_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'rejected')),
  rationale TEXT NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_high_impact_approvals_workspace_org_fkey
    FOREIGN KEY (workspace_id, org_id)
    REFERENCES public.workspaces(id, org_id) ON DELETE CASCADE,
  CONSTRAINT enterprise_high_impact_approval_separation_check
    CHECK (created_by <> reviewed_by AND created_by <> approved_by AND reviewed_by <> approved_by),
  CONSTRAINT enterprise_high_impact_approval_review_event_fkey
    FOREIGN KEY (review_event_id, org_id, workspace_id)
    REFERENCES public.enterprise_high_impact_review_events(id, org_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (org_id, workspace_id, resource_type, resource_id)
);

CREATE OR REPLACE FUNCTION public.enterprise_commit_high_impact_approval(
  p_approval JSONB, p_resource_type TEXT, p_resource_id UUID,
  p_org UUID, p_workspace UUID, p_next_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_current_version BIGINT;
BEGIN
  INSERT INTO public.enterprise_high_impact_approvals(
    org_id, workspace_id, resource_type, resource_id, created_by,
    reviewed_by, approved_by, review_event_id, outcome, rationale
  ) VALUES (
    p_org, p_workspace, p_resource_type, p_resource_id,
    (p_approval->>'created_by')::uuid, (p_approval->>'reviewed_by')::uuid,
    (p_approval->>'approved_by')::uuid, (p_approval->>'review_event_id')::uuid,
    p_approval->>'outcome', p_approval->>'rationale'
  );
  IF p_resource_type = 'evidence_candidate' THEN
    UPDATE public.enterprise_evidence_candidates
    SET suggestion_status = CASE WHEN p_next_status = 'approved' THEN 'accepted' ELSE 'rejected' END,
        updated_at = statement_timestamp()
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace;
  ELSIF p_resource_type = 'modernization_decision' THEN
    UPDATE public.enterprise_modernization_decisions
    SET status = p_next_status
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace;
  ELSIF p_resource_type = 'delivery_work_package' THEN
    SELECT current_version INTO v_current_version
    FROM public.enterprise_delivery_work_packages
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace
    FOR UPDATE;
    UPDATE public.enterprise_delivery_work_packages
    SET status = p_next_status, updated_at = statement_timestamp()
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace;
    UPDATE public.enterprise_delivery_work_package_versions
    SET status = p_next_status
    WHERE work_package_id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace AND version = v_current_version;
  ELSIF p_resource_type = 'monitor_baseline' THEN
    UPDATE public.enterprise_monitor_baselines
    SET status = p_next_status
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace;
  ELSIF p_resource_type = 'assemble_blueprint' THEN
    UPDATE public.enterprise_assemble_blueprints
    SET status = p_next_status
    WHERE id = p_resource_id AND org_id = p_org AND workspace_id = p_workspace;
  END IF;
  RETURN jsonb_build_object('resourceType', p_resource_type, 'resourceId', p_resource_id, 'status', p_next_status);
END;
$$;

REVOKE ALL ON FUNCTION public.enterprise_commit_high_impact_approval(JSONB, TEXT, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enterprise_commit_high_impact_approval(JSONB, TEXT, UUID, UUID, UUID, TEXT) TO service_role;

ALTER TABLE public.enterprise_ai_capability_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_job_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_candidate_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_studio_delivery_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_package_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_monitor_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_modernization_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_modernization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_assemble_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_high_impact_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_high_impact_approvals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.enterprise_ai_capability_routes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_command_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_job_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_ai_usage_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_source_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_candidate_edits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_evidence_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_studio_delivery_handoffs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_package_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_delivery_work_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_monitor_baselines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_modernization_assessments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_modernization_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_assemble_blueprints FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_high_impact_review_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_high_impact_approvals FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'enterprise_ai_capability_routes', 'enterprise_ai_command_receipts',
    'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger',
    'enterprise_evidence_sources', 'enterprise_evidence_source_versions',
    'enterprise_evidence_candidates', 'enterprise_evidence_candidate_edits',
    'enterprise_evidence_questions', 'enterprise_studio_delivery_handoffs',
    'enterprise_delivery_work_packages', 'enterprise_delivery_work_package_versions',
    'enterprise_delivery_work_items', 'enterprise_monitor_baselines',
    'enterprise_modernization_assessments', 'enterprise_modernization_decisions',
    'enterprise_assemble_blueprints', 'enterprise_high_impact_review_events',
    'enterprise_high_impact_approvals'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END $$;

-- Safe read projections are intentionally narrow. Source storage paths,
-- opaque secret references, raw AI prompts, and raw provider outputs are not
-- exposed through browser table reads.
GRANT SELECT ON TABLE public.enterprise_ai_capability_routes TO authenticated;
GRANT SELECT ON TABLE public.enterprise_ai_job_ledger TO authenticated;
GRANT SELECT ON TABLE public.enterprise_ai_usage_ledger TO authenticated;
GRANT SELECT ON TABLE public.enterprise_delivery_work_packages TO authenticated;
GRANT SELECT ON TABLE public.enterprise_delivery_work_package_versions TO authenticated;
GRANT SELECT ON TABLE public.enterprise_delivery_work_items TO authenticated;
GRANT SELECT ON TABLE public.enterprise_monitor_baselines TO authenticated;
GRANT SELECT ON TABLE public.enterprise_modernization_assessments TO authenticated;
GRANT SELECT ON TABLE public.enterprise_modernization_decisions TO authenticated;
GRANT SELECT ON TABLE public.enterprise_assemble_blueprints TO authenticated;

DROP POLICY IF EXISTS enterprise_ai_routes_select_member ON public.enterprise_ai_capability_routes;
CREATE POLICY enterprise_ai_routes_select_member
  ON public.enterprise_ai_capability_routes FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.has_workspace_capability(workspace_id, org_id, 'byok.manage'));

DROP POLICY IF EXISTS enterprise_ai_jobs_select_member ON public.enterprise_ai_job_ledger;
CREATE POLICY enterprise_ai_jobs_select_member
  ON public.enterprise_ai_job_ledger FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'assess.audit.read'));

DROP POLICY IF EXISTS enterprise_ai_usage_select_member ON public.enterprise_ai_usage_ledger;
CREATE POLICY enterprise_ai_usage_select_member
  ON public.enterprise_ai_usage_ledger FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'assess.audit.read'));

DROP POLICY IF EXISTS enterprise_delivery_packages_select_member ON public.enterprise_delivery_work_packages;
CREATE POLICY enterprise_delivery_packages_select_member
  ON public.enterprise_delivery_work_packages FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'project.read'));

DROP POLICY IF EXISTS enterprise_delivery_versions_select_member ON public.enterprise_delivery_work_package_versions;
CREATE POLICY enterprise_delivery_versions_select_member
  ON public.enterprise_delivery_work_package_versions FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'project.read'));

DROP POLICY IF EXISTS enterprise_delivery_items_select_member ON public.enterprise_delivery_work_items;
CREATE POLICY enterprise_delivery_items_select_member
  ON public.enterprise_delivery_work_items FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'project.read'));

DROP POLICY IF EXISTS enterprise_monitor_select_member ON public.enterprise_monitor_baselines;
CREATE POLICY enterprise_monitor_select_member
  ON public.enterprise_monitor_baselines FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'monitor.read'));

DROP POLICY IF EXISTS enterprise_modernization_select_member ON public.enterprise_modernization_assessments;
CREATE POLICY enterprise_modernization_select_member
  ON public.enterprise_modernization_assessments FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'assess.applications.read'));

DROP POLICY IF EXISTS enterprise_modernization_decisions_select_member ON public.enterprise_modernization_decisions;
CREATE POLICY enterprise_modernization_decisions_select_member
  ON public.enterprise_modernization_decisions FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'assess.applications.read'));

DROP POLICY IF EXISTS enterprise_assemble_select_member ON public.enterprise_assemble_blueprints;
CREATE POLICY enterprise_assemble_select_member
  ON public.enterprise_assemble_blueprints FOR SELECT TO authenticated
  USING (public.has_workspace_capability(workspace_id, org_id, 'assess.applications.read'));

-- Provider configuration and key-reference rows are consumed only by the
-- server command boundary. Remove the legacy organization-wide browser read
-- surface so endpoint, budget, and resolver metadata cannot be enumerated.
REVOKE ALL ON TABLE public.ai_provider_configs, public.ai_provider_key_refs FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "Members can read org AI provider configs" ON public.ai_provider_configs;
DROP POLICY IF EXISTS "Members can read org AI provider key refs" ON public.ai_provider_key_refs;

CREATE INDEX IF NOT EXISTS enterprise_evidence_sources_scope
  ON public.enterprise_evidence_sources(org_id, workspace_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS enterprise_evidence_candidates_scope
  ON public.enterprise_evidence_candidates(org_id, workspace_id, source_id, suggestion_status);
CREATE INDEX IF NOT EXISTS enterprise_handoffs_scope
  ON public.enterprise_studio_delivery_handoffs(org_id, workspace_id, status);
CREATE INDEX IF NOT EXISTS enterprise_modernization_scope
  ON public.enterprise_modernization_assessments(org_id, workspace_id, status);

-- Source and version rows are append-only. The command boundary creates a new
-- version for edits and a new work-package/blueprint version for supersession.
CREATE OR REPLACE FUNCTION public.enterprise_reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'ENTERPRISE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS enterprise_source_version_immutable ON public.enterprise_evidence_source_versions;
CREATE TRIGGER enterprise_source_version_immutable
  BEFORE UPDATE OR DELETE ON public.enterprise_evidence_source_versions
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_reject_mutation();
DROP TRIGGER IF EXISTS enterprise_candidate_edit_immutable ON public.enterprise_evidence_candidate_edits;
CREATE TRIGGER enterprise_candidate_edit_immutable
  BEFORE UPDATE OR DELETE ON public.enterprise_evidence_candidate_edits
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_reject_mutation();
DROP TRIGGER IF EXISTS enterprise_delivery_version_immutable ON public.enterprise_delivery_work_package_versions;
CREATE TRIGGER enterprise_delivery_version_immutable
  BEFORE UPDATE OR DELETE ON public.enterprise_delivery_work_package_versions
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_reject_mutation();
DROP TRIGGER IF EXISTS enterprise_high_impact_approval_immutable ON public.enterprise_high_impact_approvals;
CREATE TRIGGER enterprise_high_impact_approval_immutable
  BEFORE UPDATE OR DELETE ON public.enterprise_high_impact_approvals
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_reject_mutation();
DROP TRIGGER IF EXISTS enterprise_high_impact_review_immutable ON public.enterprise_high_impact_review_events;
CREATE TRIGGER enterprise_high_impact_review_immutable
  BEFORE UPDATE OR DELETE ON public.enterprise_high_impact_review_events
  FOR EACH ROW EXECUTE FUNCTION public.enterprise_reject_mutation();

DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
    INSERT INTO storage.buckets(id, name, public)
    VALUES ('source-uploads', 'source-uploads', false)
    ON CONFLICT (id) DO UPDATE SET public = false;
    EXECUTE 'DROP POLICY IF EXISTS enterprise_source_uploads_browser_deny ON storage.objects';
    EXECUTE $policy$
      CREATE POLICY enterprise_source_uploads_browser_deny
      ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id <> 'source-uploads')
      WITH CHECK (bucket_id <> 'source-uploads')
    $policy$;
  END IF;
END
$storage$;

COMMENT ON TABLE public.enterprise_ai_job_ledger IS 'Durable Enterprise Intelligence job ledger. Prompt bodies, completion bodies, provider keys, auth headers, secret payloads, storage paths, and raw customer content are prohibited.';
COMMENT ON TABLE public.enterprise_evidence_source_versions IS 'Immutable server-managed source versions. storage_path is service-only and never a browser projection.';
COMMENT ON TABLE public.enterprise_studio_delivery_handoffs IS 'Exact approved Studio document handoff snapshots. Stale versions require a new handoff and cannot overwrite completed work.';
COMMENT ON TABLE public.enterprise_assemble_blueprints IS 'Assemble Phase 1 structured blueprint drafts. No code, deployment, infrastructure, credentials, source calls, or runtime agents.';
