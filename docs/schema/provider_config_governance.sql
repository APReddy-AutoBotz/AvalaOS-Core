-- AvalaOS Core provider configuration governance schema and RLS.
-- M3.2h scope: schema/RLS only. This migration does not enable provider calls,
-- Supabase Functions, Admin UI writes, runtime behavior, Health, scoring, or
-- browser fallback behavior.

CREATE TABLE IF NOT EXISTS ai_provider_key_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'other')),
    resolver_type TEXT NOT NULL DEFAULT 'server_reference' CHECK (resolver_type IN ('server_reference', 'external_secret_reference', 'manual_placeholder')),
    secret_ref TEXT NOT NULL CHECK (
        length(btrim(secret_ref)) > 0
        AND length(secret_ref) <= 512
        AND secret_ref !~* '^(bearer[[:space:]]|basic[[:space:]]|sk-|sk_|gsk_|AIza)'
    ),
    safe_label TEXT,
    safe_fingerprint TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'active', 'disabled', 'expired', 'retired')),
    rotation_status TEXT CHECK (rotation_status IS NULL OR rotation_status IN ('not_started', 'scheduled', 'rotating', 'rotated', 'failed')),
    last_rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'other')),
    display_name TEXT NOT NULL,
    key_ref_id UUID,
    default_model TEXT,
    model_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_modes TEXT[] NOT NULL DEFAULT '{}'::text[],
    allowed_operations TEXT[] NOT NULL DEFAULT '{}'::text[],
    evidence_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review',
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS key_ref_id UUID;
ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS allowed_modes TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS allowed_operations TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS evidence_ref TEXT;
ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);
ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE ai_provider_configs ALTER COLUMN status SET DEFAULT 'pending_review';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_provider_configs'
          AND column_name = 'key_reference'
    ) THEN
        ALTER TABLE ai_provider_configs ALTER COLUMN key_reference DROP NOT NULL;
        COMMENT ON COLUMN ai_provider_configs.key_reference IS 'Deprecated prior-context field. M3.2h uses key_ref_id and does not authorize raw provider keys, encrypted provider keys, auth headers, browser-readable secret values, or secret-manager payload values in ai_provider_configs.';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ai_provider_configs_key_ref_id_fkey'
    ) THEN
        ALTER TABLE ai_provider_configs
            ADD CONSTRAINT ai_provider_configs_key_ref_id_fkey
            FOREIGN KEY (key_ref_id) REFERENCES ai_provider_key_refs(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_status_check;
ALTER TABLE ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_status_check
    CHECK (status IN ('pending_review', 'active', 'disabled', 'retired'));

ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_display_name_not_empty;
ALTER TABLE ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_display_name_not_empty
    CHECK (length(btrim(display_name)) > 0);

ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_allowed_modes_check;
ALTER TABLE ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_allowed_modes_check
    CHECK (allowed_modes <@ ARRAY['pilot', 'production']::text[]);

ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_allowed_operations_check;
ALTER TABLE ai_provider_configs
    ADD CONSTRAINT ai_provider_configs_allowed_operations_check
    CHECK (allowed_operations <@ ARRAY['generate_document', 'refine_section', 'test_provider_connection']::text[]);

CREATE TABLE IF NOT EXISTS ai_workspace_provider_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    workspace_id UUID,
    provider_config_id UUID NOT NULL REFERENCES ai_provider_configs(id) ON DELETE CASCADE,
    policy_name TEXT NOT NULL CHECK (length(btrim(policy_name)) > 0),
    allowed_modes TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (allowed_modes <@ ARRAY['pilot', 'production']::text[]),
    allowed_operations TEXT[] NOT NULL DEFAULT '{}'::text[] CHECK (allowed_operations <@ ARRAY['generate_document', 'refine_section', 'test_provider_connection']::text[]),
    max_prompt_tokens INTEGER CHECK (max_prompt_tokens IS NULL OR max_prompt_tokens > 0),
    max_output_tokens INTEGER CHECK (max_output_tokens IS NULL OR max_output_tokens > 0),
    policy_document JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_ref TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'active', 'disabled', 'retired')),
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)
);

CREATE TABLE IF NOT EXISTS ai_provider_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
    key_ref_id UUID REFERENCES ai_provider_key_refs(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES profiles(id),
    actor_type TEXT NOT NULL DEFAULT 'server_control' CHECK (actor_type IN ('server_control', 'service_role', 'system', 'ap_review')),
    event_type TEXT NOT NULL CHECK (length(btrim(event_type)) > 0),
    event_outcome TEXT NOT NULL DEFAULT 'recorded' CHECK (event_outcome IN ('recorded', 'approved', 'rejected', 'blocked', 'failed')),
    operation TEXT,
    mode TEXT CHECK (mode IS NULL OR mode IN ('pilot', 'production')),
    evidence_ref TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (
        jsonb_typeof(evidence) = 'object'
        AND NOT (evidence ?| ARRAY[
            'api_key',
            'auth_header',
            'authorization',
            'bearer_token',
            'completion_body',
            'encrypted_key',
            'provider_key',
            'raw_key',
            'secret',
            'secret_value'
        ])
    ),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_provider_key_refs IS 'Service-only provider key reference registry. secret_ref is a reference identifier only and must never contain raw provider keys, encrypted provider keys, auth headers, browser-readable secret values, or secret-manager payload values.';
COMMENT ON COLUMN ai_provider_key_refs.secret_ref IS 'Service-only reference identifier. This column must not store raw provider keys, encrypted provider keys, auth headers, browser-readable secret values, or secret-manager payload values.';
COMMENT ON TABLE ai_provider_configs IS 'Provider configuration governance metadata. This table must not store raw secrets, encrypted secrets, auth headers, browser-readable secret values, or secret-manager payload values.';
COMMENT ON COLUMN ai_provider_configs.key_ref_id IS 'Nullable FK to ai_provider_key_refs.id. The referenced secret_ref remains service-only and is not browser-readable.';
COMMENT ON TABLE ai_workspace_provider_policies IS 'Future-compatible workspace-named provider policy table. M3.2h enforces org_id as the tenant boundary because no AP-approved workspace authority exists yet.';
COMMENT ON COLUMN ai_workspace_provider_policies.workspace_id IS 'Deferred workspace identifier only. No strict FK is added until AP approves the canonical workspace authority.';
COMMENT ON TABLE ai_provider_audit_events IS 'Provider governance audit/evidence events. Evidence JSON must not include raw prompts, completions, provider keys, auth headers, encrypted keys, or secret payload values.';
COMMENT ON COLUMN ai_provider_audit_events.evidence IS 'Structured evidence metadata only. Prohibited fields include raw provider keys, encrypted keys, auth headers, secret payload values, raw prompt bodies, and raw completion bodies.';

ALTER TABLE ai_provider_key_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_workspace_provider_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_audit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_provider_key_refs_org_provider_status
    ON ai_provider_key_refs(org_id, provider, status)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_key_refs_active_fingerprint
    ON ai_provider_key_refs(org_id, provider, safe_fingerprint)
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND safe_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_key_ref_id
    ON ai_provider_configs(key_ref_id);

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org_status
    ON ai_provider_configs(org_id, status)
    WHERE deleted_at IS NULL;

ALTER TABLE ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_org_id_provider_display_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_configs_active_identity
    ON ai_provider_configs(org_id, provider, display_name)
    WHERE deleted_at IS NULL
      AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_workspace_provider_policies_org_status
    ON ai_workspace_provider_policies(org_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_workspace_provider_policies_config
    ON ai_workspace_provider_policies(provider_config_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_workspace_provider_policies_active
    ON ai_workspace_provider_policies(
        org_id,
        provider_config_id,
        COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
        policy_name
    )
    WHERE deleted_at IS NULL
      AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_provider_audit_events_org_occurred
    ON ai_provider_audit_events(org_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_provider_audit_events_config
    ON ai_provider_audit_events(provider_config_id);

CREATE INDEX IF NOT EXISTS idx_ai_provider_audit_events_key_ref
    ON ai_provider_audit_events(key_ref_id);

DROP POLICY IF EXISTS "Members can read org AI provider configs" ON ai_provider_configs;
CREATE POLICY "Members can read org AI provider configs" ON ai_provider_configs
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND org_id IN (
            SELECT org_id
            FROM organization_members
            WHERE user_id = auth.uid()
              AND status = 'active'
        )
    );

DROP POLICY IF EXISTS "Members can read org AI provider policies" ON ai_workspace_provider_policies;
CREATE POLICY "Members can read org AI provider policies" ON ai_workspace_provider_policies
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND org_id IN (
            SELECT org_id
            FROM organization_members
            WHERE user_id = auth.uid()
              AND status = 'active'
        )
    );
