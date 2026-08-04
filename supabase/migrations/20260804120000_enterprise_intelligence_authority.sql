-- Enterprise Intelligence vertical authority.
--
-- This is additive. It does not alter PR1G scoring, existing Assess decision
-- law, accepted Studio artifact versions, private-artifact retention, Health,
-- deployment state, or any live infrastructure. Browser clients do not write
-- these tables; the Enterprise Intelligence Edge command boundary uses the
-- service role only after resolving the caller's tenant authority.

-- Fail before any capability/provider mutation when an earlier or manually
-- created Enterprise Intelligence schema is present. This migration is the
-- sole authority for these unaccepted objects; CREATE TABLE IF NOT EXISTS
-- would otherwise bless unknown columns, constraints, ACLs, and policies.
DO $enterprise_intelligence_preflight$
DECLARE
  dirty_relation TEXT;
BEGIN
  SELECT relation_name INTO dirty_relation
  FROM unnest(ARRAY[
    'enterprise_intelligence_runtime_control',
    'enterprise_ai_capability_routes', 'enterprise_ai_command_receipts',
    'enterprise_ai_job_ledger', 'enterprise_ai_usage_ledger',
    'enterprise_evidence_sources', 'enterprise_evidence_source_versions',
    'enterprise_evidence_candidates', 'enterprise_evidence_candidate_edits',
    'enterprise_evidence_questions', 'enterprise_evidence_assess_promotions',
    'enterprise_studio_delivery_handoffs', 'enterprise_delivery_work_packages',
    'enterprise_delivery_work_package_versions', 'enterprise_delivery_work_items',
    'enterprise_monitor_baselines', 'enterprise_modernization_assessments',
    'enterprise_modernization_decisions', 'enterprise_assemble_blueprints',
    'enterprise_high_impact_review_events', 'enterprise_high_impact_approvals'
  ]) AS expected(relation_name)
  WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
  ORDER BY relation_name
  LIMIT 1;

  IF dirty_relation IS NOT NULL THEN
    RAISE EXCEPTION 'ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA relation=%', dirty_relation;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_provider_configs'
      AND column_name IN ('endpoint_url', 'deployment_name', 'model_allowlist', 'budget_policy', 'last_validated_at')
  ) THEN
    RAISE EXCEPTION 'ENTERPRISE_INTELLIGENCE_DIRTY_SCHEMA relation=ai_provider_configs';
  END IF;
END
$enterprise_intelligence_preflight$;

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

ALTER TABLE public.ai_provider_configs ADD COLUMN endpoint_url TEXT;
ALTER TABLE public.ai_provider_configs ADD COLUMN deployment_name TEXT;
ALTER TABLE public.ai_provider_configs ADD COLUMN model_allowlist TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.ai_provider_configs ADD COLUMN budget_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.ai_provider_configs ADD COLUMN last_validated_at TIMESTAMPTZ;
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
      REFERENCES public.ai_provider_key_refs(id, org_id) ON DELETE SET NULL (key_ref_id);
  END IF;
END $$;

CREATE TABLE public.enterprise_intelligence_runtime_control (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled BOOLEAN NOT NULL DEFAULT true,
  read_only BOOLEAN NOT NULL DEFAULT false,
  provider_enabled BOOLEAN NOT NULL DEFAULT true,
  ingestion_enabled BOOLEAN NOT NULL DEFAULT true,
  delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  assemble_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.enterprise_intelligence_runtime_control(singleton) VALUES (true);

CREATE TABLE public.enterprise_ai_capability_routes (
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
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
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

CREATE TABLE public.enterprise_ai_command_receipts (
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

CREATE TABLE public.enterprise_ai_job_ledger (
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
    REFERENCES public.ai_provider_configs(id, org_id) ON DELETE SET NULL (provider_config_id),
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
LANGUAGE ãovòÚ$z{-®éÜj×—6UöWf–FVæ6Uö76W75÷&öÖ÷F–öç2rÂvVçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×2rÀ¢vVçFW'&—6Uö†–v…ö–×7E÷&Wf–WuöWfVçG2rÂvVçFW'&—6Uö†–v…ö–×7Eö&÷fÇ2p¢ÒÄôõ ¢U„T5UDRf÷&ÖB‚tE$õE$”ttU"”bU„•5E2VçFW'&—6UòT•öf–æÅö–Ö×WF&ÆRôâV&Æ–2âT’rÂF&ÆUöæÖRÂF&ÆUöæÖR“°¢U„T5UDRf÷&ÖB‚t5$TDRE$”ttU"VçFW'&—6UòT•öf–æÅö–Ö×WF&ÆR$Tdõ$RUDDRõ"DTÄUDRôâV&Æ–2âT’dõ"T4‚$õrU„T5UDReTä5D”ôâV&Æ–2æVçFW'&—6U÷&V¦V7Eö×WFF–öâ‚’rÂF&ÆUöæÖRÂF&ÆUöæÖR“°¢TäBÄôõ°¤Tä@¢FVçFW'&—6Uö–Ö×WF&ÆU÷F&ÆW2C° ¤5$TDRõ"$UÄ4ReTä5D”ôâV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷&ö¦V7F–öâ‡ö÷&rUT”BÂ÷v÷&·76RUT”BÂ÷6÷W&6RUT”B¥$UEU$å2¥4ôä"ÄäuTtR7Â5D$ÄR4T5U$•E’DTd”äU"4UB6V&6…÷F‚Òuö6FÆör2B@¢4TÄT5B44Rt„TâäõB€¢V&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂvWf–FVæ6Rçw&—FRr¢õ"V&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂvWf–FVæ6Rç&Wf–Wrr¢õ"V&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂv76W76ÖVçBæVF—Br¢’D„TâåTÄÂTÅ4R€¢4TÄT5B§6öæ%ö'V–ÆEöö&¦V7B€¢w6÷W&6T–BrÂ2æ–BÂwfW'6–öârÂ2æ7W'&VçE÷fW'6–öâÂvÆ–fV7–6ÆUfW'6–öârÂ2æÆ–fV7–6ÆU÷fW'6–öâÀ¢vF—7Æ”æÖRrÂ2æF—7Æ•öæÖRÂw6÷W&6T¶–æBrÂ2ç6÷W&6Uö¶–æBÂvÖ–ÖUG—RrÂ2æÖ–ÖU÷G—RÀ¢w7FGW2rÂ2ç7FGW2Âv7&VFVDBrÂ2æ7&VFVEöBÀ¢wfW'6–öç2rÂ4ôÄU44R‚…4TÄT5B§6öæ%övr†§6öæ%ö'V–ÆEöö&¦V7B€¢w6÷W&6UfW'6–öä–BrÂbæ–BÂwfW'6–öârÂbçfW'6–öâÂv÷&–v–æÄf–ÆVæÖRrÂbæ÷&–v–æÅöf–ÆVæÖRÀ¢v6öçFVçD†6‚rÂbæ6öçFVçEö†6‚Âv6öçFVçD'—FW2rÂbæ6öçFVçEö'—FW2À¢vW‡G&7FVEFW‡D†6‚rÂbæW‡G&7FVE÷FW‡Eö†6‚ÂvW‡G&7FVD6†&7FW$6÷VçBrÂbæW‡G&7FVEö6†&7FW%ö6÷VçBÀ¢vW‡G&7F–öå7FGW2rÂbæW‡G&7F–öå÷7FGW2Âw'6W$¶–æBrÂbç'6W%ö¶–æBÀ¢w'6W%fW'6–öârÂbç'6W%÷fW'6–öâÂvf–ÇW&T6öFRrÂbæW‡G&7F–öåöf–ÇW&Uö6öFRÀ¢w&÷fVææ6T†6‚rÂbç&÷fVææ6Uö†6‚Âv7&VFVDBrÂbæ7&VFVEö@¢’õ$DU"%’bçfW'6–öâ’e$ôÒV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷fW'6–öç2`¢t„U$Rbç6÷W&6Uö–BÒ2æ–BäBbæ÷&uö–BÒ2æ÷&uö–BäBbçv÷&·76Uö–BÒ2çv÷&·76Uö–B’ÂuµÒs£¦§6öæ"’À¢v6æF–FFW2rÂ4ôÄU44R‚…4TÄT5B§6öæ%övr†§6öæ%ö'V–ÆEöö&¦V7B€¢v6æF–FFT–BrÂ2æ–BÂw6÷W&6UfW'6–öä–BrÂ2ç6÷W&6U÷fW'6–öåö–BÀ¢vf–VÆD¶W’rÂ2æf–VÆEö¶W’ÂwfÇVRrÂ2çfÇVRÂw6fTW†6W'BrÂ2ç6fUöW†6W'BÀ¢w6÷W&6TÆö6F÷"rÂ2ç6÷W&6UöÆö6F÷"Âv6öæf–FVæ6RrÂ2æ6öæf–FVæ6RÀ¢w7FGW2rÂ2ç7VvvW7F–öå÷7FGW2ÂwfW'6–öârÂ2çfW'6–öâÀ¢w&÷fVææ6T†6‚rÂ2ç&÷fVææ6Uö†6‚Âw&Wf–WvVDBrÂ2ç&Wf–WvVEö@¢’õ$DU"%’2æ7&VFVEöBÂ2æ–B’e$ôÒV&Æ–2æVçFW'&—6UöWf–FVæ6Uö6æF–FFW20¢t„U$R2ç6÷W&6Uö–BÒ2æ–BäB2æ÷&uö–BÒ2æ÷&uö–BäB2çv÷&·76Uö–BÒ2çv÷&·76Uö–B’ÂuµÒs£¦§6öæ"¢’e$ôÒV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6W20¢t„U$R2æ–BÒ÷6÷W&6RäB2æ÷&uö–BÒö÷&räB2çv÷&·76Uö–BÒ÷v÷&·76RäB2æFVÆWFVEöB•2åTÄÀ¢’Tä@¢BC° ¤5$TDRõ"$UÄ4ReTä5D”ôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷6¶vU÷&ö¦V7F–öâ‡ö÷&rUT”BÂ÷v÷&·76RUT”BÂ÷6¶vRUT”B¥$UEU$å2¥4ôä"ÄäuTtR7Â5D$ÄR4T5U$•E’DTd”äU"4UB6V&6…÷F‚Òuö6FÆör2B@¢4TÄT5B44Rt„TâäõBV&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂw&ö¦V7Bç&VBr’D„TâåTÄÂTÅ4R€¢4TÄT5B§6öæ%ö'V–ÆEöö&¦V7B€¢wv÷&µ6¶vT–BrÂæ–BÂwfW'6–öârÂæ7W'&VçE÷fW'6–öâÂw7FGW2rÂç7FGW2À¢v†æFöfd–BrÂæ†æFöfeö–BÂw&VDöæÇ’rÂ7FÂç&VEööæÇ’õ"äõB7FÂæVæ&ÆVBõ"äõB7FÂæFVÆ—fW'•öVæ&ÆVBÀ¢v7W'&VçBrÂ§6öæ%ö'V–ÆEöö&¦V7B€¢w6¶vUfW'6–öä–BrÂbæ–BÂv6öçFVçD†6‚rÂbæ6öçFVçEö†6‚À¢w7GVF–ôFö7VÖVçD–BrÂbç7GVF–õöFö7VÖVçEö–BÂw7GVF–õfW'6–öä–BrÂbç7GVF–õ÷fW'6–öåö–BÀ¢w7GVF–õfW'6–öârÂbç7GVF–õ÷fW'6–öâÂw7GVF–ô6öçFVçD†6‚rÂbç7GVF–õö6öçFVçEö†6‚À¢v'F–f7EG—RrÂbæ'F–f7E÷G—RÂw7FGW2rÂbç7FGW2Âv6öçFVçBrÂbæ6öçFVç@¢’À¢v—FV×2rÂ4ôÄU44R‚…4TÄT5B§6öæ%övr†§6öæ%ö'V–ÆEöö&¦V7B€¢v–BrÂ’æ–BÂw&VçD–BrÂ’ç&VçEö—FVÕö–BÂv—FVÕG—RrÂ’æ—FVÕ÷G—RÀ¢wF—FÆRrÂ’çF—FÆRÂvFW67&—F–öârÂ’æFW67&—F–öâÀ¢v66WFæ6T7&—FW&–rÂ’æ66WFæ6Uö7&—FW&–À¢væöägVæ7F–öæÅ&WV—&VÖVçG2rÂ’ææöåögVæ7F–öæÅ÷&WV—&VÖVçG2À¢w6÷W&6U6V7F–öäÆö6F÷"rÂ’ç6÷W&6U÷6V7F–öåöÆö6F÷ ¢’õ$DU"%’’æ—FVÕ÷G—RÂ’æ–B’e$ôÒV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×2¢t„U$R’ç6¶vU÷fW'6–öåö–BÒbæ–BäB’æ÷&uö–BÒæ÷&uö–BäB’çv÷&·76Uö–BÒçv÷&·76Uö–B’ÂuµÒs£¦§6öæ"¢’e$ôÒV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vW2 ¢¤ô”âV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vU÷fW'6–öç2`¢ôâbçv÷&µ÷6¶vUö–BÒæ–BäBbçfW'6–öâÒæ7W'&VçE÷fW'6–öà¢äBbæ÷&uö–BÒæ÷&uö–BäBbçv÷&·76Uö–BÒçv÷&·76Uö–@¢5$õ52¤ô”âV&Æ–2æVçFW'&—6Uö–çFVÆÆ–vVæ6U÷'VçF–ÖUö6öçG&öÂ7FÀ¢t„U$R7FÂç6–ævÆWFöâäBæ–BÒ÷6¶vRäBæ÷&uö–BÒö÷&räBçv÷&·76Uö–BÒ÷v÷&·76P¢’Tä@¢BC° ¤5$TDRõ"$UÄ4ReTä5D”ôâV&Æ–2æVçFW'&—6UöÖöæ—F÷%÷&ö¦V7F–öâ‡ö÷&rUT”BÂ÷v÷&·76RUT”BÂö&6VÆ–æRUT”B¥$UEU$å2¥4ôä"ÄäuTtR7Â5D$ÄR4T5U$•E’DTd”äU"4UB6V&6…÷F‚Òuö6FÆör2B@¢4TÄT5B44Rt„TâäõBV&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂvÖöæ—F÷"ç&VBr’D„TâåTÄÂTÅ4R€¢4TÄT5B§6öæ%ö'V–ÆEöö&¦V7B€¢v&6VÆ–æT–BrÂÒæ–BÂwv÷&µ6¶vT–BrÂÒçv÷&µ÷6¶vUö–BÀ¢wv÷&µ6¶vUfW'6–öä–BrÂÒçv÷&µ÷6¶vU÷fW'6–öåö–BÂwfW'6–öârÂÒçfW'6–öâÀ¢w&W6÷W&6T†6‚rÂÒç&W6÷W&6Uö†6‚Âv&÷fVD—FVÔ–G2rÂÒæ&÷fVEö—FVÕö–G2À¢vÖ–ÆW7FöæW2rÂÒæÖ–ÆW7FöæW2ÂvFWVæFVæ6–W2rÂÒæFWVæFVæ6–W2À¢v&Æö6¶W'2rÂÒæ&Æö6¶W'2Âw&—6·2rÂÒç&—6·2Âw&VF–æW72rÂÒç&VF–æW72À¢w7FGW2rÂÒç7FGW2ÂvÆ—fUFVÆVÖWG'”6öææV7FVBrÂfÇ6P¢’e$ôÒV&Æ–2æVçFW'&—6UöÖöæ—F÷%ö&6VÆ–æW2Ğ¢t„U$RÒæ–BÒö&6VÆ–æRäBÒæ÷&uö–BÒö÷&räBÒçv÷&·76Uö–BÒ÷v÷&·76P¢’Tä@¢BC° ¤5$TDRõ"$UÄ4ReTä5D”ôâV&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çE÷&ö¦V7F–öâ‡ö÷&rUT”BÂ÷v÷&·76RUT”BÂö&ÇVW&–çBUT”B¥$UEU$å2¥4ôä"ÄäuTtR7Â5D$ÄR4T5U$•E’DTd”äU"4UB6V&6…÷F‚Òuö6FÆör2B@¢4TÄT5B44Rt„TâäõBV&Æ–2æ†5÷v÷&·76Uö6&–Æ—G’‡÷v÷&·76RÂö÷&rÂv76VÖ&ÆRæÖævRr’D„TâåTÄÂTÅ4R€¢4TÄT5B§6öæ%ö'V–ÆEöö&¦V7B€¢v&ÇVW&–çD–BrÂ"æ–BÂvÖöFW&æ—¦F–öäFV6—6–öä–BrÂ"æÖöFW&æ—¦F–öåöFV6—6–öåö–BÀ¢vF—7÷6—F–öârÂ"æF—7÷6—F–öâÂw66†VÖfW'6–öârÂ"ç66†VÖ÷fW'6–öâÀ¢wfW'6–öârÂ"çfW'6–öâÂw&W6÷W&6T†6‚rÂ"ç&W6÷W&6Uö†6‚À¢w7G'V7GW&VD6öçFVçBrÂ"ç7G'V7GW&VEö6öçFVçBÂw&VF&ÆTFö7VÖVçBrÂ"ç&VF&ÆUöFö7VÖVçBÀ¢w7FGW2rÂ"ç7FGW2Âv6öFTvVæW&F–öäVæ&ÆVBrÂfÇ6RÂvFWÆ÷–ÖVçDVæ&ÆVBrÂfÇ6RÀ¢v–æg&7G'V7GW&T6†ævW4Væ&ÆVBrÂfÇ6RÂv7&VFVçF–Ä66W74Væ&ÆVBrÂfÇ6RÀ¢w6÷W&6U7—7FVÔ6ÆÇ4Væ&ÆVBrÂfÇ6RÂw'VçF–ÖTvVçG4Væ&ÆVBrÂfÇ6RÀ¢vÆ—fUFVÆVÖWG'”Væ&ÆVBrÂfÇ6P¢’e$ôÒV&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG2 ¢t„U$R"æ–BÒö&ÇVW&–çBäB"æ÷&uö–BÒö÷&räB"çv÷&·76Uö–BÒ÷v÷&·76P¢’Tä@¢BC° ¤DòFVçFW'&—6Uöf–æÅö6Â@¤DT4Ä$RF&ÆUöæÖRDU…C°¤$Tt”à¢dõ$T4‚F&ÆUöæÖR”â%$’%$•°¢vVçFW'&—6Uö–çFVÆÆ–vVæ6U÷'VçF–ÖUö6öçG&öÂrÀ¢vVçFW'&—6Uö•ö6&–Æ—G•÷&÷WFW2rÂvVçFW'&—6Uö•ö6öÖÖæE÷&V6V—G2rÀ¢vVçFW'&—6Uö•ö¦ö%öÆVFvW"rÂvVçFW'&—6Uö•÷W6vUöÆVFvW"rÀ¢vVçFW'&—6UöWf–FVæ6U÷6÷W&6W2rÂvVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷fW'6–öç2rÀ¢vVçFW'&—6UöWf–FVæ6Uö6æF–FFW2rÂvVçFW'&—6UöWf–FVæ6Uö6æF–FFUöVF—G2rÀ¢vVçFW'&—6UöWf–FVæ6U÷VW7F–öç2rÂvVçFW'&—6UöWf–FVæ6Uö76W75÷&öÖ÷F–öç2rÀ¢vVçFW'&—6U÷7GVF–õöFVÆ—fW'•ö†æFöfg2rÂvVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vW2rÀ¢vVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vU÷fW'6–öç2rÂvVçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×2rÀ¢vVçFW'&—6UöÖöæ—F÷%ö&6VÆ–æW2rÂvVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG2rÀ¢vVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç2rÂvVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG2rÀ¢vVçFW'&—6Uö†–v…ö–×7E÷&Wf–WuöWfVçG2rÂvVçFW'&—6Uö†–v…ö–×7Eö&÷fÇ2p¢ÒÄôõ ¢U„T5UDRf÷&ÖB‚tÅDU"D$ÄRV&Æ–2âT’Tä$ÄR$õrÄUdTÂ4T5U$•E’rÂF&ÆUöæÖR“°¢U„T5UDRf÷&ÖB‚tÅDU"D$ÄRV&Æ–2âT’dõ$4R$õrÄUdTÂ4T5U$•E’rÂF&ÆUöæÖR“°¢U„T5UDRf÷&ÖB‚u$Udô´RÄÂôâD$ÄRV&Æ–2âT’e$ôÒT$Ä”2ÂæöâÂWF†VçF–6FVBÂ6W'f–6U÷&öÆRrÂF&ÆUöæÖR“°¢U„T5UDRf÷&ÖB‚tu$åB4TÄT5BôâD$ÄRV&Æ–2âT’Dò6W'f–6U÷&öÆRrÂF&ÆUöæÖR“°¢TäBÄôõ°¤Tä@¢FVçFW'&—6Uöf–æÅö6ÂC° ¤E$õôÄ”5’”bU„•5E2VçFW'&—6Uö•÷&÷WFW5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6Uö•ö6&–Æ—G•÷&÷WFW3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6Uö•ö¦ö'5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6Uö•ö¦ö%öÆVFvW#°¤E$õôÄ”5’”bU„•5E2VçFW'&—6Uö•÷W6vU÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6Uö•÷W6vUöÆVFvW#°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöFVÆ—fW'•÷6¶vW5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vW3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöFVÆ—fW'•÷fW'6–öç5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vU÷fW'6–öç3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöFVÆ—fW'•ö—FV×5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöÖöæ—F÷%÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöÖöæ—F÷%ö&6VÆ–æW3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöÖöFW&æ—¦F–öå÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåö76W76ÖVçG3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç5÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6UöÖöFW&æ—¦F–öåöFV6—6–öç3°¤E$õôÄ”5’”bU„•5E2VçFW'&—6Uö76VÖ&ÆU÷6VÆV7EöÖVÖ&W"ôâV&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çG3° ¤E$õeTä5D”ôâV&Æ–2æVçFW'&—6Uö6öÖÖ—EöFVÆ—fW'•ö†æFöfeöÆVv7•÷VçG'W7FVB„¥4ôä"Â¥4ôä"Â¥4ôä"Â¥4ôä"“°¤E$õeTä5D”ôâV&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöFW&æ—¦F–öåö76W76ÖVçEöÆVv7•÷VçG'W7FVB„¥4ôä"Â¥4ôä"“°¤E$õeTä5D”ôâV&Æ–2æVçFW'&—6Uö6öÖÖ—Eö†–v…ö–×7Eö&÷fÅöÆVv7•÷VçG'W7FVB„¥4ôä"ÂDU…BÂUT”BÂUT”BÂUT”BÂDU…B“° ¥$Udô´RÄÂôâeTä5D”ôà¢V&Æ–2æVçFW'&—6U÷6†#Seö§6öæ"„¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö76W'E÷w&—F&ÆR…DU…B’À¢V&Æ–2æVçFW'&—6U÷6÷W&6U÷fW'6–öåöFW&—fR‚’À¢V&Æ–2æVçFW'&—6Uö6æF–FFUöFW&—fR‚’À¢V&Æ–2æVçFW'&—6U÷6÷W&6U÷fW'6–öåöwV&B‚’À¢V&Æ–2æVçFW'&—6Uö6æF–FFUöwV&B‚’À¢V&Æ–2æVçFW'&—6U÷&V6V—EöwV&B‚’À¢V&Æ–2æVçFW'&—6Uö¦ö%öwV&B‚’À¢V&Æ–2æVçFW'&—6U÷7FGW5ööæÇ•öwV&B‚’À¢V&Æ–2æVçFW'&—6U÷&W6÷W&6U÷6æ6†÷B…DU…BÂUT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6U÷&Wf–WuöWfVçEöFW&—fR‚’À¢V&Æ–2æVçFW'&—6Uö&÷fÅöFW&—fR‚’À¢V&Æ–2æVçFW'&—6U÷&V¦V7Eö×WFF–öâ‚¤e$ôÒT$Ä”2ÂæöâÂWF†VçF–6FVBÂ6W'f–6U÷&öÆS° ¥$Udô´RÄÂôâeTä5D”ôà¢V&Æ–2æVçFW'&—6Uö•ö6Æ–Õö6öÖÖæB…UT”BÂUT”BÂUT”BÂDU…BÂDU…BÂUT”BÂDU…B’À¢V&Æ–2æVçFW'&—6Uö•ö6ö×ÆWFUö6öÖÖæB…UT”BÂUT”BÂUT”BÂ¥4ôä"ÂUT”B’À¢V&Æ–2æVçFW'&—6Uö•öf–Åö6öÖÖæB…UT”BÂUT”BÂUT”BÂ¥4ôä"Â$ôôÄTâ’À¢V&Æ–2æVçFW'&—6U÷&÷f–FW%öÆ–fV7–6ÆU÷G&ç6—F–öâ…DU…BÂUT”BÂUT”BÂUT”BÂ$”t”åBÂ¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö7&VFUöWf–FVæ6U÷6÷W&6R„¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6U÷&V6÷&E÷6÷W&6UöW‡G&7F–öåöf–ÇW&R…UT”BÂUT”BÂUT”BÂDU…B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöWf–FVæ6UöW‡G&7F–öâ…UT”BÂUT”BÂUT”BÂUT”BÂDU…BÂ”åDTtU"ÂUT”BÂDU…BÂDU…BÂ”åDTtU"Â”åDTtU"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6U÷&Wf–WuöWf–FVæ6Uö6æF–FFR…UT”BÂUT”BÂUT”BÂDU…BÂDU…BÂDU…BÂUT”BÂDU…BÂDU…B’À¢V&Æ–2æVçFW'&—6U÷&öÖ÷FUöWf–FVæ6U÷Fõö76W75÷c"…UT”BÂUT”BÂ$”t”åBÂUT”BÂUT”BÂUT”BÂUT”BÂDU…BÂ$”t”åB’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöFVÆ—fW'•ö†æFöfb„¥4ôä"Â¥4ôä"Â¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöæ—F÷%ö&6VÆ–æR„¥4ôä"ÂUT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöFW&æ—¦F–öåö76W76ÖVçB„¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—Eö76VÖ&ÆUö&ÇVW&–çB„¥4ôä"ÂUT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—Eö†–v…ö–×7Eö&÷fÂ„¥4ôä"ÂDU…BÂUT”BÂUT”BÂUT”BÂDU…B¤e$ôÒT$Ä”2ÂæöâÂWF†VçF–6FVC° ¤u$åBU„T5UDRôâeTä5D”ôà¢V&Æ–2æVçFW'&—6Uö•ö6Æ–Õö6öÖÖæB…UT”BÂUT”BÂUT”BÂDU…BÂDU…BÂUT”BÂDU…B’À¢V&Æ–2æVçFW'&—6Uö•ö6ö×ÆWFUö6öÖÖæB…UT”BÂUT”BÂUT”BÂ¥4ôä"ÂUT”B’À¢V&Æ–2æVçFW'&—6Uö•öf–Åö6öÖÖæB…UT”BÂUT”BÂUT”BÂ¥4ôä"Â$ôôÄTâ’À¢V&Æ–2æVçFW'&—6U÷&÷f–FW%öÆ–fV7–6ÆU÷G&ç6—F–öâ…DU…BÂUT”BÂUT”BÂUT”BÂ$”t”åBÂ¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö7&VFUöWf–FVæ6U÷6÷W&6R„¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6U÷&V6÷&E÷6÷W&6UöW‡G&7F–öåöf–ÇW&R…UT”BÂUT”BÂUT”BÂDU…B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöWf–FVæ6UöW‡G&7F–öâ…UT”BÂUT”BÂUT”BÂUT”BÂDU…BÂ”åDTtU"ÂUT”BÂDU…BÂDU…BÂ”åDTtU"Â”åDTtU"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6U÷&Wf–WuöWf–FVæ6Uö6æF–FFR…UT”BÂUT”BÂUT”BÂDU…BÂDU…BÂDU…BÂUT”BÂDU…BÂDU…B’À¢V&Æ–2æVçFW'&—6U÷&öÖ÷FUöWf–FVæ6U÷Fõö76W75÷c"…UT”BÂUT”BÂ$”t”åBÂUT”BÂUT”BÂUT”BÂUT”BÂDU…BÂ$”t”åB’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöFVÆ—fW'•ö†æFöfb„¥4ôä"Â¥4ôä"Â¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöæ—F÷%ö&6VÆ–æR„¥4ôä"ÂUT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—EöÖöFW&æ—¦F–öåö76W76ÖVçB„¥4ôä"Â¥4ôä"’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—Eö76VÖ&ÆUö&ÇVW&–çB„¥4ôä"ÂUT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö6öÖÖ—Eö†–v…ö–×7Eö&÷fÂ„¥4ôä"ÂDU…BÂUT”BÂUT”BÂUT”BÂDU…B¥Dò6W'f–6U÷&öÆS° ¥$Udô´RÄÂôâeTä5D”ôà¢V&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6UöFVÆ—fW'•÷6¶vU÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6UöÖöæ—F÷%÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çE÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B¤e$ôÒT$Ä”2Âæöã°¤u$åBU„T5UDRôâeTä5D”ôà¢V&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6UöFVÆ—fW'•÷6¶vU÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6UöÖöæ—F÷%÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’À¢V&Æ–2æVçFW'&—6Uö76VÖ&ÆUö&ÇVW&–çE÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B¥DòWF†VçF–6FVC° ¤5$TDR”äDU‚VçFW'&—6Uö•÷&V6V—G5÷66÷RôâV&Æ–2æVçFW'&—6Uö•ö6öÖÖæE÷&V6V—G2†÷&uö–BÂv÷&·76Uö–BÂ7F÷%ö–BÂ7FGW2“°¤5$TDR”äDU‚VçFW'&—6Uö•ö¦ö'5÷&÷f–FW%÷66÷RôâV&Æ–2æVçFW'&—6Uö•ö¦ö%öÆVFvW"‡&÷f–FW%ö6öæf–uö–BÂ÷&uö–BÂv÷&·76Uö–BÂ7FGW2“°¤5$TDR”äDU‚VçFW'&—6Uö•÷W6vU÷&÷f–FW%÷66÷RôâV&Æ–2æVçFW'&—6Uö•÷W6vUöÆVFvW"‡&÷f–FW%ö6öæf–uö–BÂ÷&uö–BÂv÷&·76Uö–BÂ&V6÷&FVEöB“°¤5$TDR”äDU‚VçFW'&—6UöWf–FVæ6U÷fW'6–öç5÷66÷RôâV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷fW'6–öç2†÷&uö–BÂv÷&·76Uö–BÂ6÷W&6Uö–BÂfW'6–öâ“°¤5$TDR”äDU‚VçFW'&—6UöWf–FVæ6UöVF—G5ö6æF–FFU÷66÷RôâV&Æ–2æVçFW'&—6UöWf–FVæ6Uö6æF–FFUöVF—G2†6æF–FFUö–BÂ÷&uö–BÂv÷&·76Uö–B“°¤5$TDR”äDU‚VçFW'&—6UöWf–FVæ6U÷&öÖ÷F–öç5ö66U÷66÷RôâV&Æ–2æVçFW'&—6UöWf–FVæ6Uö76W75÷&öÖ÷F–öç2†76W75ö66Uö–BÂ÷&uö–BÂv÷&·76Uö–BÂ76W75ö66U÷fW'6–öâ“°¤5$TDR”äDU‚VçFW'&—6U÷6¶vU÷fW'6–öç5÷66÷RôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µ÷6¶vU÷fW'6–öç2‡v÷&µ÷6¶vUö–BÂ÷&uö–BÂv÷&·76Uö–BÂfW'6–öâ“°¤5$TDR”äDU‚VçFW'&—6U÷v÷&µö—FV×5÷&VçE÷66÷RôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷v÷&µö—FV×2‡&VçEö—FVÕö–BÂ÷&uö–BÂv÷&·76Uö–B’t„U$R&VçEö—FVÕö–B•2äõBåTÄÃ°¤5$TDR”äDU‚VçFW'&—6Uö†–v…÷&Wf–Ww5÷&W6÷W&6U÷66÷RôâV&Æ–2æVçFW'&—6Uö†–v…ö–×7E÷&Wf–WuöWfVçG2‡&W6÷W&6U÷G—RÂ&W6÷W&6Uö–BÂ÷&uö–BÂv÷&·76Uö–BÂ7&VFVEöB“° ¤4ôÔÔTåBôâD$ÄRV&Æ–2æVçFW'&—6Uö–çFVÆÆ–vVæ6U÷'VçF–ÖUö6öçG&öÂ•2tf–ÂÖ6Æ÷6VB6÷W&6RÖÆWfVÂ&öÆÆ&6²6öçG&öÂâ&VEööæÇ’7F÷2ÆÂVçFW'&—6R–çFVÆÆ–vVæ6R×WFF–öâv†–ÆR&W6W'f–ær6fR&ö¦V7F–öç2âs°¤4ôÔÔTåBôâD$ÄRV&Æ–2æVçFW'&—6UöWf–FVæ6Uö76W75÷&öÖ÷F–öç2•2t–Ö×WF&ÆR66WFVBÖ6æF–FFR&÷fVææ6R&öÖ÷FVB–çFòöæR–Ö×WF&ÆR76W72c"G&gBfW'6–öââs°¤4ôÔÔTåBôâeTä5D”ôâV&Æ–2æVçFW'&—6UöWf–FVæ6U÷6÷W&6U÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’•2t6&–Æ—G’×66÷VB6÷W&6Rö6æF–FFR&ö¦V7F–öâW†6ÇVF–ær'V6¶WBæBö&¦V7BF‚WF†÷&—G’âs°¤4ôÔÔTåBôâeTä5D”ôâV&Æ–2æVçFW'&—6UöFVÆ—fW'•÷6¶vU÷&ö¦V7F–öâ…UT”BÂUT”BÂUT”B’•2t6&–Æ—G’×66÷VB6æöæ–6ÂFVÆ—fW'’6¶vR&ö¦V7F–öâv—F‚6W'fW"ÖFW&—fVB”G2æB†6†W2âs°