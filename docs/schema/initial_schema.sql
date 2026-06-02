-- KlarityPM Initial Production Schema (Phase 1)
-- Targets: PostgreSQL / Supabase

-- 1. Organizations (Tenants)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb,
    is_trial BOOLEAN DEFAULT TRUE,
    trial_expires_at TIMESTAMPTZ
);

-- 2. Profiles (User data mapped to Auth ID)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 3. Roles and Permissions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g., 'Admin', 'Contributor', 'Executive'
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, name)
);

-- 4. Organization Memberships (Linking Users to Orgs)
CREATE TABLE organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id),
    status TEXT DEFAULT 'active', -- 'active', 'invited', 'suspended'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, user_id)
);

-- 5. Audit Log (Immutable)
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID,
    action TEXT NOT NULL, -- e.g., 'org.create', 'user.login'
    entity_type TEXT NOT NULL,
    entity_id UUID,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for existing tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
CREATE POLICY "Users can see own profile" ON profiles 
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can see member organizations" ON organizations
    FOR SELECT USING (
        id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can see org audit logs" ON audit_events
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

-- 6. Assess Processes
CREATE TABLE assess_processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES profiles(id),
    department TEXT,
    criticality TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High', 'Critical'
    status TEXT DEFAULT 'Not Started', -- 'Not Started', 'Draft', 'Completed'
    template_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Assessments (The deep payload)
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID REFERENCES assess_processes(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'Not Started',
    metadata JSONB DEFAULT '{}'::jsonb,
    responses JSONB DEFAULT '{}'::jsonb,
    evidence_items JSONB DEFAULT '[]'::jsonb,
    assumptions JSONB DEFAULT '[]'::jsonb,
    completion_by_section JSONB DEFAULT '{}'::jsonb,
    scores JSONB, -- Final deterministic scoring results
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for new tables
ALTER TABLE assess_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Assess
CREATE POLICY "Users can see org processes" ON assess_processes
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

-- 8. Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES profiles(id),
    lifecycle_stage TEXT DEFAULT 'Planning',
    health_status TEXT DEFAULT 'On Track',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Epics
CREATE TABLE epics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#4F46E5',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Sprints
CREATE TABLE sprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'Upcoming', -- 'Upcoming', 'Active', 'Completed'
    goal TEXT,
    capacity INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    epic_id UUID REFERENCES epics(id) ON DELETE SET NULL,
    sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'To Do',
    priority TEXT DEFAULT 'Medium',
    type TEXT DEFAULT 'Task',
    owner_id UUID REFERENCES profiles(id),
    story_points INTEGER DEFAULT 0,
    start_date DATE,
    due_date DATE,
    parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}'::jsonb, -- For subtaskIds, dependencyIds, userStories, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Document Generations
CREATE TABLE document_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    artifacts JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Timesheet Entries
CREATE TABLE timesheet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    hours NUMERIC(4,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for new tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE epics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Delivery & Docs
CREATE POLICY "Users can see org projects" ON projects
    FOR SELECT USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can modify org projects" ON projects
    FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can see org delivery items" ON tasks
    FOR SELECT USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can modify org delivery items" ON tasks
    FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can see org docs" ON document_generations
    FOR SELECT USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can modify org docs" ON document_generations
    FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can see org timesheets" ON timesheet_entries
    FOR SELECT USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can modify org timesheets" ON timesheet_entries
    FOR ALL USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can modify org processes" ON assess_processes
    FOR ALL USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can see org assessments" ON assessments
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can modify org assessments" ON assessments
    FOR ALL USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );
