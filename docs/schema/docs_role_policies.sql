-- KlarityPM Docs Role Policies
-- Depends on helper functions from delivery_role_policies.sql:
--   public.is_active_org_member
--   public.has_org_permission

ALTER TABLE document_generations
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.touch_document_generation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_document_generation_updated_at ON document_generations;
CREATE TRIGGER trg_touch_document_generation_updated_at
    BEFORE UPDATE ON document_generations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_document_generation_updated_at();

DROP POLICY IF EXISTS "Users can see org docs" ON document_generations;
DROP POLICY IF EXISTS "Users can modify org docs" ON document_generations;
DROP POLICY IF EXISTS "Docs members can read permitted documents" ON document_generations;
DROP POLICY IF EXISTS "Docs members can generate documents" ON document_generations;
DROP POLICY IF EXISTS "Docs reviewers can update permitted documents" ON document_generations;
DROP POLICY IF EXISTS "Docs managers can delete permitted documents" ON document_generations;

CREATE POLICY "Docs members can read permitted documents" ON document_generations
    FOR SELECT USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'docs.read')
            OR public.has_org_permission(org_id, 'docs.generate')
            OR public.has_org_permission(org_id, 'docs.review')
            OR public.has_org_permission(org_id, 'approvals.review')
            OR public.has_org_permission(org_id, 'project.manage')
        )
    );

CREATE POLICY "Docs members can generate documents" ON document_generations
    FOR INSERT WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'docs.generate')
            OR public.has_org_permission(org_id, 'project.manage')
        )
    );

CREATE POLICY "Docs reviewers can update permitted documents" ON document_generations
    FOR UPDATE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'docs.generate')
            OR public.has_org_permission(org_id, 'docs.review')
            OR public.has_org_permission(org_id, 'approvals.review')
            OR public.has_org_permission(org_id, 'project.manage')
        )
    )
    WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'docs.generate')
            OR public.has_org_permission(org_id, 'docs.review')
            OR public.has_org_permission(org_id, 'approvals.review')
            OR public.has_org_permission(org_id, 'project.manage')
        )
    );

CREATE POLICY "Docs managers can delete permitted documents" ON document_generations
    FOR DELETE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'org.admin')
        )
    );
