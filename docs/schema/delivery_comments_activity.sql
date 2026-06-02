-- AvalaOS Core Delivery Comments and Activity
-- Moves collaboration history out of task metadata into tenant-scoped, queryable tables.

CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    app_id TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id),
    change TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_comments_task_app_id ON task_comments(task_id, app_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_org_task_created ON task_comments(org_id, task_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_activity_events_task_app_id ON task_activity_events(task_id, app_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_events_org_task_created ON task_activity_events(org_id, task_id, created_at);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see org task comments" ON task_comments;
CREATE POLICY "Users can see org task comments" ON task_comments
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can add org task comments" ON task_comments;
CREATE POLICY "Users can add org task comments" ON task_comments
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND (user_id IS NULL OR user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can update own org task comments" ON task_comments;
CREATE POLICY "Users can update own org task comments" ON task_comments
    FOR UPDATE USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND (user_id IS NULL OR user_id = auth.uid())
    )
    WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND (user_id IS NULL OR user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can see org task activity" ON task_activity_events;
CREATE POLICY "Users can see org task activity" ON task_activity_events
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Users can add org task activity" ON task_activity_events;
CREATE POLICY "Users can add org task activity" ON task_activity_events
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND (user_id IS NULL OR user_id = auth.uid())
    );
