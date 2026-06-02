-- KlarityPM RLS Regression Checks: Assess Review Events and Handoff Ledger
-- Target: local Supabase/Postgres test database
-- Usage: run after initial_schema.sql, assess_review_audit.sql, and handoff_ledger_entries.sql.
-- The transaction rolls back all fixture data.

BEGIN;

DO $$
DECLARE
    v_user_a UUID := '00000000-0000-0000-0000-0000000000a1';
    v_user_b UUID := '00000000-0000-0000-0000-0000000000b2';
    v_org_a UUID := '10000000-0000-0000-0000-0000000000a1';
    v_org_b UUID := '10000000-0000-0000-0000-0000000000b2';
    v_process_a UUID := '20000000-0000-0000-0000-0000000000a1';
    v_process_b UUID := '20000000-0000-0000-0000-0000000000b2';
    v_assessment_a UUID := '30000000-0000-0000-0000-0000000000a1';
    v_assessment_b UUID := '30000000-0000-0000-0000-0000000000b2';
    v_visible_count INTEGER;
BEGIN
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES
        (v_user_a, 'rls-user-a@klaritypm.test', 'test', NOW(), NOW(), NOW()),
        (v_user_b, 'rls-user-b@klaritypm.test', 'test', NOW(), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, email, full_name)
    VALUES
        (v_user_a, 'rls-user-a@klaritypm.test', 'RLS User A'),
        (v_user_b, 'rls-user-b@klaritypm.test', 'RLS User B')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organizations (id, name, slug, is_trial)
    VALUES
        (v_org_a, 'RLS Org A', 'rls-org-a', false),
        (v_org_b, 'RLS Org B', 'rls-org-b', false)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organization_members (org_id, user_id, status)
    VALUES
        (v_org_a, v_user_a, 'active'),
        (v_org_b, v_user_b, 'active')
    ON CONFLICT (org_id, user_id) DO NOTHING;

    INSERT INTO assess_processes (id, org_id, name, description, owner_id, department, criticality, status)
    VALUES
        (v_process_a, v_org_a, 'RLS Process A', 'Tenant A process', v_user_a, 'Finance', 'Medium', 'Ready for Review'),
        (v_process_b, v_org_b, 'RLS Process B', 'Tenant B process', v_user_b, 'Finance', 'Medium', 'Ready for Review')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO assessments (
        id,
        process_id,
        org_id,
        status,
        metadata,
        responses,
        evidence_items,
        assumptions,
        completion_by_section,
        review
    )
    VALUES
        (
            v_assessment_a,
            v_process_a,
            v_org_a,
            'Ready for Review',
            '{"completionQuality":100,"templateFit":true,"lastSavedAt":"2026-04-29T00:00:00.000Z","stakeholderCoverage":4,"evidenceQuality":4,"assumptionQuality":4}'::jsonb,
            '{}'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb
        ),
        (
            v_assessment_b,
            v_process_b,
            v_org_b,
            'Ready for Review',
            '{"completionQuality":100,"templateFit":true,"lastSavedAt":"2026-04-29T00:00:00.000Z","stakeholderCoverage":4,"evidenceQuality":4,"assumptionQuality":4}'::jsonb,
            '{}'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb
        )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO assessment_review_events (org_id, assessment_id, process_id, actor_id, event_type, status, reason, payload)
    VALUES
        (v_org_a, v_assessment_a, v_process_a, v_user_a, 'Approval', 'Approved', 'Tenant A seed approval', '{}'::jsonb),
        (v_org_b, v_assessment_b, v_process_b, v_user_b, 'Approval', 'Approved', 'Tenant B seed approval', '{}'::jsonb);

    INSERT INTO handoff_ledger_entries (
        org_id,
        from_module,
        to_module,
        status,
        source_type,
        source_id,
        target_type,
        target_id,
        title,
        summary,
        created_by,
        evidence_refs,
        metadata
    )
    VALUES
        (v_org_a, 'assess', 'docs', 'Submitted', 'Decision Pack', v_assessment_a::TEXT, 'Document Generation', 'pending', 'Tenant A handoff', 'Tenant A handoff summary', v_user_a, '[]'::jsonb, '{}'::jsonb),
        (v_org_b, 'assess', 'docs', 'Submitted', 'Decision Pack', v_assessment_b::TEXT, 'Document Generation', 'pending', 'Tenant B handoff', 'Tenant B handoff summary', v_user_b, '[]'::jsonb, '{}'::jsonb);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

DO $$
DECLARE
    v_visible_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_visible_count FROM assessment_review_events;
    IF v_visible_count <> 1 THEN
        RAISE EXCEPTION 'RLS failed: user A should see exactly 1 assessment_review_events row, saw %', v_visible_count;
    END IF;

    SELECT COUNT(*) INTO v_visible_count FROM handoff_ledger_entries;
    IF v_visible_count <> 1 THEN
        RAISE EXCEPTION 'RLS failed: user A should see exactly 1 handoff_ledger_entries row, saw %', v_visible_count;
    END IF;
END;
$$;

DO $$
BEGIN
    INSERT INTO assessment_review_events (
        org_id,
        assessment_id,
        process_id,
        actor_id,
        event_type,
        status,
        reason,
        payload
    )
    VALUES (
        '10000000-0000-0000-0000-0000000000b2',
        '30000000-0000-0000-0000-0000000000b2',
        '20000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000a1',
        'Comment',
        'In Review',
        'Cross-tenant write should fail',
        '{}'::jsonb
    );
    RAISE EXCEPTION 'RLS failed: cross-tenant assessment_review_events insert succeeded';
EXCEPTION
    WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
        NULL;
END;
$$;

DO $$
BEGIN
    INSERT INTO handoff_ledger_entries (
        org_id,
        from_module,
        to_module,
        status,
        source_type,
        source_id,
        title,
        summary,
        created_by,
        evidence_refs,
        metadata
    )
    VALUES (
        '10000000-0000-0000-0000-0000000000b2',
        'assess',
        'docs',
        'Submitted',
        'Decision Pack',
        'cross-tenant-source',
        'Cross tenant handoff',
        'Cross tenant handoff should fail',
        '00000000-0000-0000-0000-0000000000a1',
        '[]'::jsonb,
        '{}'::jsonb
    );
    RAISE EXCEPTION 'RLS failed: cross-tenant handoff_ledger_entries insert succeeded';
EXCEPTION
    WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
        NULL;
END;
$$;

DO $$
BEGIN
    UPDATE assessment_review_events
    SET reason = 'Mutation should fail'
    WHERE org_id = '10000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'Immutability failed: assessment_review_events update succeeded';
EXCEPTION
    WHEN raise_exception OR insufficient_privilege THEN
        NULL;
END;
$$;

DO $$
BEGIN
    DELETE FROM assessment_review_events
    WHERE org_id = '10000000-0000-0000-0000-0000000000a1';
    RAISE EXCEPTION 'Immutability failed: assessment_review_events delete succeeded';
EXCEPTION
    WHEN raise_exception OR insufficient_privilege THEN
        NULL;
END;
$$;

DO $$
BEGIN
    PERFORM transition_assessment_with_audit(
        '{
            "id":"30000000-0000-0000-0000-0000000000b2",
            "process_id":"20000000-0000-0000-0000-0000000000b2",
            "org_id":"10000000-0000-0000-0000-0000000000b2",
            "status":"Approved",
            "metadata":{"completionQuality":100,"templateFit":true,"lastSavedAt":"2026-04-29T00:00:00.000Z","stakeholderCoverage":4,"evidenceQuality":4,"assumptionQuality":4},
            "responses":{},
            "evidence_items":[],
            "assumptions":[],
            "completion_by_section":{},
            "review":{},
            "scores":null
        }'::jsonb,
        '{
            "org_id":"10000000-0000-0000-0000-0000000000b2",
            "assessment_id":"30000000-0000-0000-0000-0000000000b2",
            "process_id":"20000000-0000-0000-0000-0000000000b2",
            "actor_id":"00000000-0000-0000-0000-0000000000a1",
            "event_type":"Approval",
            "status":"Approved",
            "reason":"Cross tenant RPC should fail",
            "payload":{}
        }'::jsonb
    );
    RAISE EXCEPTION 'RLS failed: cross-tenant transition_assessment_with_audit succeeded';
EXCEPTION
    WHEN raise_exception OR insufficient_privilege THEN
        NULL;
END;
$$;

DO $$
BEGIN
    PERFORM transition_assessment_with_audit(
        '{
            "id":"30000000-0000-0000-0000-0000000000a1",
            "process_id":"20000000-0000-0000-0000-0000000000a1",
            "org_id":"10000000-0000-0000-0000-0000000000a1",
            "status":"Approved",
            "metadata":{"completionQuality":100,"templateFit":true,"lastSavedAt":"2026-04-29T00:00:00.000Z","stakeholderCoverage":4,"evidenceQuality":4,"assumptionQuality":4},
            "responses":{},
            "evidence_items":[],
            "assumptions":[],
            "completion_by_section":{},
            "review":{"approvalHistory":[]},
            "scores":null
        }'::jsonb,
        '{
            "org_id":"10000000-0000-0000-0000-0000000000a1",
            "assessment_id":"30000000-0000-0000-0000-0000000000a1",
            "process_id":"20000000-0000-0000-0000-0000000000a1",
            "actor_id":"00000000-0000-0000-0000-0000000000a1",
            "event_type":"Approval",
            "status":"Approved",
            "reason":"Tenant A valid approval",
            "payload":{"test":"valid-tenant-transition"}
        }'::jsonb
    );
END;
$$;

ROLLBACK;

SELECT 'RLS regression checks passed: Assess review events, transition RPC, and handoff ledger tenant isolation are enforced.' AS result;
