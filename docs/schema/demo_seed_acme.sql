-- AvalaOS Core Demo Seed for Supabase
-- Creates the Acme demo organization, demo personas, memberships, and Assess process catalog.
-- Demo password for all users: demo123

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-4111-8111-111111111111';
    v_admin_role_id UUID := '22222222-2222-4222-8222-222222222201';
    v_buyer_role_id UUID := '22222222-2222-4222-8222-222222222202';
    v_contributor_role_id UUID := '22222222-2222-4222-8222-222222222203';
    v_reviewer_role_id UUID := '22222222-2222-4222-8222-222222222204';
BEGIN
    INSERT INTO organizations (id, name, slug, is_trial, settings)
    VALUES (
        v_org_id,
        'Acme Global Operations',
        'acme-global-operations',
        false,
        '{
            "profile": {
                "industry": "Shared Services, Finance Operations, Customer Operations",
                "size": "1000+",
                "geography": "North America, Europe, India",
                "strategicGoals": "Scale automation safely, reduce manual cycle time, and govern AI adoption across enterprise processes."
            },
            "enabledModules": ["assess", "docs", "delivery", "monitor"]
        }'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        is_trial = EXCLUDED.is_trial,
        settings = EXCLUDED.settings,
        updated_at = NOW();

    INSERT INTO roles (id, org_id, name, permissions)
    VALUES
        (v_admin_role_id, v_org_id, 'Admin', '["org.admin","users.manage","roles.manage","integrations.manage","security.manage","byok.manage","audit.read"]'::jsonb),
        (v_buyer_role_id, v_org_id, 'Buyer', '["portfolio.read","reports.read","approvals.review","strategy.read"]'::jsonb),
        (v_contributor_role_id, v_org_id, 'Contributor', '["project.read","task.read","assessment.create","assessment.edit","docs.generate","docs.read","workitems.import"]'::jsonb),
        (v_reviewer_role_id, v_org_id, 'Reviewer', '["project.read","task.read","assessment.review","docs.read","approvals.review","controls.review"]'::jsonb)
    ON CONFLICT (org_id, name) DO UPDATE SET permissions = EXCLUDED.permissions;

    WITH demo_users(id, email, full_name, role_title, org_role, role_id) AS (
        VALUES
            ('00000000-0000-4000-8000-000000000001'::uuid, 'sarah.chen@acmeoperations.com', 'Sarah Chen', 'Chief Transformation Officer', 'Buyer', v_buyer_role_id),
            ('00000000-0000-4000-8000-000000000002'::uuid, 'maya.patel@acmeoperations.com', 'Maya Patel', 'Lead Business Analyst', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000003'::uuid, 'owen.brooks@acmeoperations.com', 'Owen Brooks', 'Change & Experience Lead', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000004'::uuid, 'david.rodriguez@acmeoperations.com', 'David Rodriguez', 'AI Solutions Lead', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000005'::uuid, 'emily.white@acmeoperations.com', 'Emily White', 'QA & UAT Manager', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000006'::uuid, 'frank.miller@acmeoperations.com', 'Frank Miller', 'Automation Developer', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000007'::uuid, 'priya.nair@acmeoperations.com', 'Priya Nair', 'Finance Process Owner', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000008'::uuid, 'henry.wilson@acmeoperations.com', 'Henry Wilson', 'Enterprise Platform Admin', 'Admin', v_admin_role_id),
            ('00000000-0000-4000-8000-000000000009'::uuid, 'alicia.morgan@acmeoperations.com', 'Alicia Morgan', 'Senior Project Manager', 'Contributor', v_contributor_role_id)
    )
    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
    )
    SELECT
        id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        email,
        crypt('demo123', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', full_name, 'role_title', role_title, 'org_role', org_role),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    FROM demo_users
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = NOW();

    WITH demo_users(id, email, full_name, role_id) AS (
        VALUES
            ('00000000-0000-4000-8000-000000000001'::uuid, 'sarah.chen@acmeoperations.com', 'Sarah Chen', v_buyer_role_id),
            ('00000000-0000-4000-8000-000000000002'::uuid, 'maya.patel@acmeoperations.com', 'Maya Patel', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000003'::uuid, 'owen.brooks@acmeoperations.com', 'Owen Brooks', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000004'::uuid, 'david.rodriguez@acmeoperations.com', 'David Rodriguez', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000005'::uuid, 'emily.white@acmeoperations.com', 'Emily White', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000006'::uuid, 'frank.miller@acmeoperations.com', 'Frank Miller', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000007'::uuid, 'priya.nair@acmeoperations.com', 'Priya Nair', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000008'::uuid, 'henry.wilson@acmeoperations.com', 'Henry Wilson', v_admin_role_id),
            ('00000000-0000-4000-8000-000000000009'::uuid, 'alicia.morgan@acmeoperations.com', 'Alicia Morgan', v_contributor_role_id)
    )
    INSERT INTO profiles (id, email, full_name)
    SELECT id, email, full_name
    FROM demo_users
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();

    WITH demo_users(id, role_id) AS (
        VALUES
            ('00000000-0000-4000-8000-000000000001'::uuid, v_buyer_role_id),
            ('00000000-0000-4000-8000-000000000002'::uuid, v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000003'::uuid, v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000004'::uuid, v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000005'::uuid, v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000006'::uuid, v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000007'::uuid, v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000008'::uuid, v_admin_role_id),
            ('00000000-0000-4000-8000-000000000009'::uuid, v_contributor_role_id)
    )
    INSERT INTO organization_members (org_id, user_id, role_id, status)
    SELECT v_org_id, id, role_id, 'active'
    FROM demo_users
    ON CONFLICT (org_id, user_id) DO UPDATE SET
        role_id = EXCLUDED.role_id,
        status = EXCLUDED.status;

    INSERT INTO assess_processes (id, org_id, name, description, owner_id, department, criticality, status, template_id, created_at, updated_at)
    VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001', v_org_id, 'Vendor Invoice Intake and SAP Posting', 'Invoices arrive through email, shared drives, and supplier portals, then AP validates PO match, tax, duplicates, and posts approved invoices to SAP.', '00000000-0000-4000-8000-000000000007', 'Finance', 'High', 'Completed', 'tpl-p2p-invoice-ingestion', '2026-04-02T09:00:00.000Z', '2026-04-25T16:00:00.000Z'),
        ('aaaaaaaa-0000-4000-8000-000000000002', v_org_id, 'Tier 1 Support Case Summarization', 'Support agents summarize incoming cases, search policy articles, draft replies, and escalate sensitive issues to senior specialists.', '00000000-0000-4000-8000-000000000004', 'Customer Operations', 'Medium', 'Draft', NULL, '2026-04-05T10:30:00.000Z', '2026-04-24T12:15:00.000Z'),
        ('aaaaaaaa-0000-4000-8000-000000000003', v_org_id, 'New Hire Onboarding Request Flow', 'HR coordinates offer acceptance, laptop procurement, access provisioning, policy acknowledgement, and manager readiness before day one.', '00000000-0000-4000-8000-000000000002', 'Human Resources', 'High', 'Draft', NULL, '2026-04-07T08:45:00.000Z', '2026-04-23T14:00:00.000Z'),
        ('aaaaaaaa-0000-4000-8000-000000000004', v_org_id, 'Claims Intake Document Triage', 'Claims packets are classified, checked for missing evidence, routed by risk and complexity, and escalated to adjusters when judgment is required.', '00000000-0000-4000-8000-000000000008', 'Operations', 'Critical', 'Not Started', NULL, '2026-04-12T11:00:00.000Z', '2026-04-12T11:00:00.000Z'),
        ('aaaaaaaa-0000-4000-8000-000000000005', v_org_id, 'Month-End Close Evidence Pack', 'Finance teams collect reconciliations, approvals, variance explanations, and control evidence before executive close sign-off.', '00000000-0000-4000-8000-000000000007', 'Finance', 'High', 'Completed', NULL, '2026-03-28T09:20:00.000Z', '2026-04-26T18:10:00.000Z')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        owner_id = EXCLUDED.owner_id,
        department = EXCLUDED.department,
        criticality = EXCLUDED.criticality,
        status = EXCLUDED.status,
        template_id = EXCLUDED.template_id,
        updated_at = EXCLUDED.updated_at;
END;
$$;
