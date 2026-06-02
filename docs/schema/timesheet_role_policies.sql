-- KlarityPM Timesheet Role Policies
-- Depends on helper functions from delivery_role_policies.sql:
--   public.is_active_org_member
--   public.has_org_permission

ALTER TABLE timesheet_entries
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheet_entries_org_user_task_date
    ON timesheet_entries(org_id, user_id, task_id, date);

CREATE OR REPLACE FUNCTION public.touch_timesheet_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_timesheet_updated_at ON timesheet_entries;
CREATE TRIGGER trg_touch_timesheet_updated_at
    BEFORE UPDATE ON timesheet_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_timesheet_updated_at();

DROP POLICY IF EXISTS "Users can see org timesheets" ON timesheet_entries;
DROP POLICY IF EXISTS "Users can modify org timesheets" ON timesheet_entries;
DROP POLICY IF EXISTS "Delivery members can read permitted timesheets" ON timesheet_entries;
DROP POLICY IF EXISTS "Delivery members can insert permitted timesheets" ON timesheet_entries;
DROP POLICY IF EXISTS "Delivery members can update permitted timesheets" ON timesheet_entries;
DROP POLICY IF EXISTS "Delivery members can delete permitted timesheets" ON timesheet_entries;

CREATE POLICY "Delivery members can read permitted timesheets" ON timesheet_entries
    FOR SELECT USING (
        public.is_active_org_member(org_id)
        AND (
            user_id = auth.uid()
            OR public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'timesheets.read')
            OR public.has_org_permission(org_id, 'timesheets.approve')
        )
    );

CREATE POLICY "Delivery members can insert permitted timesheets" ON timesheet_entries
    FOR INSERT WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            (
                user_id = auth.uid()
                AND public.has_org_permission(org_id, 'timesheets.log')
            )
            OR public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'timesheets.approve')
        )
    );

CREATE POLICY "Delivery members can update permitted timesheets" ON timesheet_entries
    FOR UPDATE USING (
        public.is_active_org_member(org_id)
        AND (
            (
                user_id = auth.uid()
                AND public.has_org_permission(org_id, 'timesheets.log')
            )
            OR public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'timesheets.approve')
        )
    )
    WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            (
                user_id = auth.uid()
                AND public.has_org_permission(org_id, 'timesheets.log')
            )
            OR public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'timesheets.approve')
        )
    );

CREATE POLICY "Delivery members can delete permitted timesheets" ON timesheet_entries
    FOR DELETE USING (
        public.is_active_org_member(org_id)
        AND (
            (
                user_id = auth.uid()
                AND public.has_org_permission(org_id, 'timesheets.log')
            )
            OR public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'timesheets.approve')
        )
    );
