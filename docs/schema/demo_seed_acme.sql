-- AvalaOS Core canonical demo seed for Supabase
-- Creates Avala Demo Enterprise, demo personas, memberships, and the AP Assess process.
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
        'Avala Demo Enterprise',
        'avala-demo-enterprise',
        false,
        '{
            "profile": {
                "industry": "Finance Operations / Shared Services",
                "size": "1000+",
                "geography": "North America, Europe, India",
                "strategicGoals": "Evaluate AP invoice exceptions, govern handoff readiness, and prove evidence-backed delivery before execution."
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
        (v_contributor_role_id, v_org_id, 'Contributor', '["project.read","team.read","task.read","backlog.read","roadmap.read","capacity.read","assessment.create","assessment.edit","process.create","docs.generate","docs.read","workitems.import","comments.manage"]'::jsonb),
        (v_reviewer_role_id, v_org_id, 'Reviewer', '["project.read","portfolio.read","task.read","assessment.review","process.approve","docs.read","docs.approve","approvals.review","controls.review"]'::jsonb)
    ON CONFLICT (org_id, name) DO UPDATE SET permissions = EXCLUDED.permissions;

    WITH demo_users(id, email, full_name, role_title, org_role, role_id) AS (
        VALUES
            ('00000000-0000-4000-8000-000000000001'::uuid, 'sarah.chen@avala-demo.example', 'Sarah Chen', 'Buyer Viewer', 'Buyer', v_buyer_role_id),
            ('00000000-0000-4000-8000-000000000002'::uuid, 'maya.patel@avala-demo.example', 'Maya Patel', 'Process Analyst', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000003'::uuid, 'owen.brooks@avala-demo.example', 'Owen Brooks', 'Change Reviewer', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000004'::uuid, 'david.rodriguez@avala-demo.example', 'David Rodriguez', 'Solution Contributor', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000005'::uuid, 'emily.white@avala-demo.example', 'Emily White', 'Control Reviewer', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000006'::uuid, 'frank.miller@avala-demo.example', 'Frank Miller', 'Automation Contributor', 'Contributor', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000007'::uuid, 'priya.nair@avala-demo.example', 'Priya Nair', 'AP Process Owner', 'Reviewer', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000008'::uuid, 'henry.wilson@avala-demo.example', 'Henry Wilson', 'Platform Admin', 'Admin', v_admin_role_id),
            ('00000000-0000-4000-8000-000000000009'::uuid, 'alicia.morgan@avala-demo.example', 'Alicia Morgan', 'Delivery Lead', 'Contributor', v_contributor_role_id)
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
            ('00000000-0000-4000-8000-000000000001'::uuid, 'sarah.chen@avala-demo.example', 'Sarah Chen', v_buyer_role_id),
            ('00000000-0000-4000-8000-000000000002'::uuid, 'maya.patel@avala-demo.example', 'Maya Patel', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000003'::uuid, 'owen.brooks@avala-demo.example', 'Owen Brooks', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000004'::uuid, 'david.rodriguez@avala-demo.example', 'David Rodriguez', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000005'::uuid, 'emily.white@avala-demo.example', 'Emily White', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000006'::uuid, 'frank.miller@avala-demo.example', 'Frank Miller', v_contributor_role_id),
            ('00000000-0000-4000-8000-000000000007'::uuid, 'priya.nair@avala-demo.example', 'Priya Nair', v_reviewer_role_id),
            ('00000000-0000-4000-8000-000000000008'::uuid, 'henry.wilson@avala-demo.example', 'Henry Wilson', v_admin_role_id),
            ('00000000-0000-4000-8000-000000000009'::uuid, 'alicia.morgan@avala-demo.example', 'Alicia Morgan', v_contributor_role_id)
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

    DELETE FROM assess_processes
    WHERE org_id = v_org_id
      AND id IN (
        'aaaaaaaa-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000002',
        'aaaaaaaa-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000005'
      );

    INSERT INTO assess_processes (id, org_id, name, description, owner_id, department, criticality, status, template_id, created_at, updated_at)
    VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001', v_org_id, 'AP Invoice Exception Handling', 'Accounts Payable reviews invoice intake, PO/GRN matching gaps, duplicate risks, vendor master issues, tax variances, and payment-block decisions before downstream work begins.', '00000000-0000-4000-8000-000000000007', 'Finance Operations / Accounts Payable', 'High', 'Completed', 'tpl-p2p-invoice-ingestion', '2026-06-10T09:00:00.000Z', '2026-06-13T16:00:00.000Z')
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
