-- KlarityPM Lifecycle Handoff Ledger Persistence
-- Targets: PostgreSQL / Supabase
-- Purpose: persist Assess -> Docs -> Delivery -> Monitor handoff events beyond browser storage.

CREATE TABLE IF NOT EXISTS handoff_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_module TEXT NOT NULL CHECK (from_module IN ('assess', 'docs', 'delivery', 'monitor')),
    to_module TEXT NOT NULL CHECK (to_module IN ('assess', 'docs', 'delivery', 'monitor')),
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Submitted', 'Accepted', 'Completed', 'Blocked')),
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES profiles(id),
    evidence_refs JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE handoff_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see org handoff ledger entries" ON handoff_ledger_entries
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can add org handoff ledger entries" ON handoff_ledger_entries
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can update org handoff ledger status" ON handoff_ledger_entries
    FOR UPDATE USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    )
    WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE INDEX IF NOT EXISTS idx_handoff_ledger_entries_org_created
    ON handoff_ledger_entries(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_handoff_ledger_entries_source
    ON handoff_ledger_entries(org_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_handoff_ledger_entries_target
    ON handoff_ledger_entries(org_id, target_type, target_id);
