-- AvalaOS Core Platform RLS Membership Policies
-- Targets: PostgreSQL / Supabase
-- Purpose: allow membership-based tenant policies to resolve the current user's active org memberships.

CREATE POLICY "Users can see own active memberships" ON organization_members
    FOR SELECT USING (
        user_id = auth.uid()
        AND status = 'active'
    );

CREATE POLICY "Users can see org roles for their memberships" ON roles
    FOR SELECT USING (
        org_id IN (
            SELECT org_id
            FROM organization_members
            WHERE user_id = auth.uid()
              AND status = 'active'
        )
    );
