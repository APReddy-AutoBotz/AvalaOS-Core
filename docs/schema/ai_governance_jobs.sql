-- KlarityPM AI governance, provider configuration, generation jobs, and usage events.
-- Purpose: support server-side AI execution without raw browser API keys.

CREATE TABLE IF NOT EXISTS ai_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('gemini', 'groq', 'openai', 'azure_openai', 'anthropic', 'other')),
    display_name TEXT NOT NULL,
    key_reference TEXT NOT NULL,
    default_model TEXT,
    model_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending_review')),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, provider, display_name)
);

CREATE TABLE IF NOT EXISTS prompt_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    template_key TEXT NOT NULL,
    version TEXT NOT NULL,
    purpose TEXT NOT NULL,
    template_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, template_key, version)
);

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    provider_config_id UUID REFERENCES ai_provider_configs(id),
    prompt_template_id UUID REFERENCES prompt_templates(id),
    prompt_version TEXT,
    job_type TEXT NOT NULL CHECK (job_type IN (
        'generate_document',
        'refine_section',
        'test_provider_connection',
        'extract_document_text',
        'export_document',
        'export_decision_pack',
        'other'
    )),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    model TEXT,
    input_refs JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    job_id UUID REFERENCES ai_generation_jobs(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT,
    prompt_template_id UUID REFERENCES prompt_templates(id),
    prompt_version TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_estimate NUMERIC(12,6),
    output_artifact_type TEXT,
    output_artifact_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_org ON ai_provider_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_org_key ON prompt_templates(org_id, template_key);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_org_status ON ai_generation_jobs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_org_created ON ai_usage_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_job ON ai_usage_events(job_id);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_provider_configs_touch ON ai_provider_configs;
CREATE TRIGGER trg_ai_provider_configs_touch
BEFORE UPDATE ON ai_provider_configs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_prompt_templates_touch ON prompt_templates;
CREATE TRIGGER trg_prompt_templates_touch
BEFORE UPDATE ON prompt_templates
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_ai_generation_jobs_touch ON ai_generation_jobs;
CREATE TRIGGER trg_ai_generation_jobs_touch
BEFORE UPDATE ON ai_generation_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE POLICY "Members can read org AI provider configs" ON ai_provider_configs
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );

CREATE POLICY "Members can read org prompt templates" ON prompt_templates
    FOR SELECT USING (
        org_id IS NULL OR org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );

CREATE POLICY "Members can read org AI jobs" ON ai_generation_jobs
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );

CREATE POLICY "Members can read org AI usage events" ON ai_usage_events
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );

CREATE POLICY "Members can create org AI jobs" ON ai_generation_jobs
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );

CREATE POLICY "Members can create org AI usage events" ON ai_usage_events
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active')
    );
