-- KlarityPM Delivery Role Policies
-- Adds role-aware server-side delivery mutation guards for Supabase/PostgreSQL.

CREATE OR REPLACE FUNCTION public.has_org_permission(p_org_id UUID, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM organization_members om
        JOIN roles r ON r.id = om.role_id
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
          AND (
            r.permissions ? p_permission
            OR r.permissions ? 'org.admin'
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
          AND om.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.jsonb_text_array_contains(p_values JSONB, p_value TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT COALESCE(p_values, '[]'::jsonb) ? p_value;
$$;

CREATE OR REPLACE FUNCTION public.delivery_task_has_dependents(p_org_id UUID, p_task_id UUID, p_task_app_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tasks dependent_task
        WHERE dependent_task.org_id = p_org_id
          AND COALESCE(dependent_task.metadata->'dependencyIds', '[]'::jsonb) ? COALESCE(p_task_app_id, p_task_id::TEXT)
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_delivery_task_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id TEXT := auth.uid()::TEXT;
    v_old_assignees JSONB := COALESCE(OLD.metadata->'assigneeIds', '[]'::jsonb);
    v_new_assignees JSONB := COALESCE(NEW.metadata->'assigneeIds', '[]'::jsonb);
    v_old_dependencies JSONB := COALESCE(OLD.metadata->'dependencyIds', '[]'::jsonb);
    v_new_dependencies JSONB := COALESCE(NEW.metadata->'dependencyIds', '[]'::jsonb);
    v_old_order_rank JSONB := COALESCE(OLD.metadata->'orderRank', 'null'::jsonb);
    v_new_order_rank JSONB := COALESCE(NEW.metadata->'orderRank', 'null'::jsonb);
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT public.is_active_org_member(NEW.org_id) THEN
        RAISE EXCEPTION 'delivery task update denied: inactive org membership';
    END IF;

    IF public.has_org_permission(NEW.org_id, 'project.manage')
       OR public.has_org_permission(NEW.org_id, 'task.update') THEN
        IF v_old_assignees <> v_new_assignees
           AND NOT public.has_org_permission(NEW.org_id, 'task.assign')
           AND NOT public.has_org_permission(NEW.org_id, 'project.manage') THEN
            RAISE EXCEPTION 'delivery task update denied: task.assign permission required';
        END IF;
    ELSIF public.has_org_permission(NEW.org_id, 'task.update.own')
          AND public.jsonb_text_array_contains(v_old_assignees, v_user_id) THEN
        IF NEW.project_id IS DISTINCT FROM OLD.project_id
           OR NEW.epic_id IS DISTINCT FROM OLD.epic_id
           OR NEW.sprint_id IS DISTINCT FROM OLD.sprint_id
           OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
           OR v_old_assignees <> v_new_assignees
           OR v_old_dependencies <> v_new_dependencies
           OR v_old_order_rank <> v_new_order_rank THEN
            RAISE EXCEPTION 'delivery task update denied: own-task updates cannot change planning, ordering, assignment, or dependency fields';
        END IF;
    ELSE
        RAISE EXCEPTION 'delivery task update denied: missing task update permission';
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status OR v_old_dependencies <> v_new_dependencies)
       AND NEW.status IN ('In Progress', 'In Review', 'Testing', 'Ready for Release', 'Done')
       AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(v_new_dependencies) AS dependency(app_id)
            JOIN tasks dependency_task
              ON dependency_task.org_id = NEW.org_id
             AND (dependency_task.app_id = dependency.app_id OR dependency_task.id::TEXT = dependency.app_id)
            WHERE dependency_task.status <> 'Done'
       ) THEN
        RAISE EXCEPTION 'delivery task update denied: complete dependency tasks first';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_task_policy ON tasks;
CREATE TRIGGER trg_enforce_delivery_task_policy
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_delivery_task_policy();

DROP POLICY IF EXISTS "Users can see org delivery items" ON tasks;
DROP POLICY IF EXISTS "Users can modify org delivery items" ON tasks;
DROP POLICY IF EXISTS "Delivery members can read tasks" ON tasks;
DROP POLICY IF EXISTS "Delivery members can insert tasks" ON tasks;
DROP POLICY IF EXISTS "Delivery members can update permitted tasks" ON tasks;
DROP POLICY IF EXISTS "Delivery managers can delete permitted tasks" ON tasks;

CREATE POLICY "Delivery members can read tasks" ON tasks
    FOR SELECT USING (public.is_active_org_member(org_id));

CREATE POLICY "Delivery members can insert tasks" ON tasks
    FOR INSERT WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'task.create')
            OR public.has_org_permission(org_id, 'backlog.manage')
            OR public.has_org_permission(org_id, 'workitems.import')
        )
    );

CREATE POLICY "Delivery members can update permitted tasks" ON tasks
    FOR UPDATE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'task.update')
            OR (
                public.has_org_permission(org_id, 'task.update.own')
                AND public.jsonb_text_array_contains(metadata->'assigneeIds', auth.uid()::TEXT)
            )
        )
    )
    WITH CHECK (public.is_active_org_member(org_id));

CREATE POLICY "Delivery managers can delete permitted tasks" ON tasks
    FOR DELETE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'task.delete')
        )
        AND NOT public.delivery_task_has_dependents(org_id, id, app_id)
    );

DROP POLICY IF EXISTS "Users can see org epics" ON epics;
DROP POLICY IF EXISTS "Delivery members can insert epics" ON epics;
DROP POLICY IF EXISTS "Delivery managers can update epics" ON epics;
DROP POLICY IF EXISTS "Delivery managers can delete epics" ON epics;

CREATE POLICY "Users can see org epics" ON epics
    FOR SELECT USING (public.is_active_org_member(org_id));

CREATE POLICY "Delivery members can insert epics" ON epics
    FOR INSERT WITH CHECK (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'backlog.manage')
            OR public.has_org_permission(org_id, 'workitems.import')
        )
    );

CREATE POLICY "Delivery managers can update epics" ON epics
    FOR UPDATE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'backlog.manage')
        )
    )
    WITH CHECK (public.is_active_org_member(org_id));

CREATE POLICY "Delivery managers can delete epics" ON epics
    FOR DELETE USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'backlog.manage')
        )
    );

DROP POLICY IF EXISTS "Users can see org sprints" ON sprints;
DROP POLICY IF EXISTS "Delivery managers can modify sprints" ON sprints;

CREATE POLICY "Users can see org sprints" ON sprints
    FOR SELECT USING (public.is_active_org_member(org_id));

CREATE POLICY "Delivery managers can modify sprints" ON sprints
    FOR ALL USING (
        public.is_active_org_member(org_id)
        AND (
            public.has_org_permission(org_id, 'project.manage')
            OR public.has_org_permission(org_id, 'sprint.manage')
        )
    )
    WITH CHECK (public.is_active_org_member(org_id));

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-4111-8111-111111111111';
    v_admin_role_id UUID;
    v_executive_role_id UUID;
    v_ba_role_id UUID;
    v_developer_role_id UUID;
    v_reviewer_role_id UUID;
    v_process_owner_role_id UUID;
    v_pm_role_id UUID;
BEGIN
    INSERT INTO roles (org_id, name, permissions)
    VALUES
        (v_org_id, 'Admin', '["org.admin","users.manage","roles.manage","integrations.manage","security.manage","byok.manage","audit.read","project.manage","task.create","task.update","task.assign","task.delete","sprint.manage"]'::jsonb),
        (v_org_id, 'Executive Sponsor', '["portfolio.read","reports.read","approvals.review","strategy.read"]'::jsonb),
        (v_org_id, 'Business Analyst', '["project.read","team.read","task.read","backlog.read","roadmap.read","capacity.read","assessment.create","assessment.edit","process.create","docs.generate","docs.read","workitems.import","comments.manage"]'::jsonb),
        (v_org_id, 'Automation Developer', '["project.read","task.read","task.update.own","timesheets.log","automation.execute","docs.read"]'::jsonb),
        (v_org_id, 'QA Reviewer', '["project.read","task.read","assessment.review","docs.read","approvals.review","controls.review","defects.manage","uat.execute","comments.manage"]'::jsonb),
        (v_org_id, 'Process Owner', '["project.read","task.read","assessment.review","docs.read","approvals.review","process.approve","comments.manage"]'::jsonb),
        (v_org_id, 'Project Manager', '["project.manage","project.read","team.read","task.read","task.create","task.update","task.assign","task.delete","backlog.manage","sprint.manage","roadmap.manage","capacity.read","timesheets.read","timesheets.approve","risks.manage","reports.read","docs.read","docs.review","automation.view","workitems.import"]'::jsonb)
    ON CONFLICT (org_id, name) DO UPDATE SET permissions = EXCLUDED.permissions;

    SELECT id INTO v_admin_role_id FROM roles WHERE org_id = v_org_id AND name = 'Admin';
    SELECT id INTO v_executive_role_id FROM roles WHERE org_id = v_org_id AND name = 'Executive Sponsor';
    SELECT id INTO v_ba_role_id FROM roles WHERE org_id = v_org_id AND name = 'Business Analyst';
    SELECT id INTO v_developer_role_id FROM roles WHERE org_id = v_org_id AND name = 'Automation Developer';
    SELECT id INTO v_reviewer_role_id FROM roles WHERE org_id = v_org_id AND name = 'QA Reviewer';
    SELECT id INTO v_process_owner_role_id FROM roles WHERE org_id = v_org_id AND name = 'Process Owner';
    SELECT id INTO v_pm_role_id FROM roles WHERE org_id = v_org_id AND name = 'Project Manager';

    UPDATE organization_members SET role_id = v_executive_role_id WHERE org_id = v_org_id AND user_id = '00000000-0000-4000-8000-000000000001';
    UPDATE organization_members SET role_id = v_ba_role_id WHERE org_id = v_org_id AND user_id = '00000000-0000-4000-8000-000000000002';
    UPDATE organization_members SET role_id = v_reviewer_role_id WHERE org_id = v_org_id AND user_id IN ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000005');
    UPDATE organization_members SET role_id = v_developer_role_id WHERE org_id = v_org_id AND user_id IN ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000006');
    UPDATE organization_members SET role_id = v_process_owner_role_id WHERE org_id = v_org_id AND user_id = '00000000-0000-4000-8000-000000000007';
    UPDATE organization_members SET role_id = v_admin_role_id WHERE org_id = v_org_id AND user_id = '00000000-0000-4000-8000-000000000008';
    UPDATE organization_members SET role_id = v_pm_role_id WHERE org_id = v_org_id AND user_id = '00000000-0000-4000-8000-000000000009';
END;
$$;
