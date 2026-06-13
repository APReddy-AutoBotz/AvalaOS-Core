-- AvalaOS Core canonical Delivery demo seed for Supabase
-- Seeds the AP Invoice Exception Workflow project, epics, sprints, and tasks.

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-4111-8111-111111111111';
BEGIN
    DELETE FROM tasks
    WHERE org_id = v_org_id
      AND app_id IN (
        'task-101',
        'task-102',
        'task-103',
        'task-104',
        'task-105',
        'task-201',
        'task-202',
        'task-203',
        'task-204',
        'task-301',
        'task-302',
        'task-303',
        'task-401',
        'task-402',
        'task-403',
        'task-501',
        'task-502',
        'task-503',
        'task-ap-exception-map',
        'task-ap-doc-review',
        'task-ap-owner-review',
        'task-ap-delivery-pack',
        'task-ap-monitor-readiness'
      );

    DELETE FROM sprints
    WHERE org_id = v_org_id
      AND app_id IN (
        'sprint-1',
        'sprint-2',
        'sprint-3',
        'sprint-4',
        'sprint-5',
        'sprint-ap-1',
        'sprint-ap-2'
      );

    DELETE FROM epics
    WHERE org_id = v_org_id
      AND app_id IN (
        'epic-101',
        'epic-102',
        'epic-103',
        'epic-201',
        'epic-202',
        'epic-203',
        'epic-301',
        'epic-302',
        'epic-303',
        'epic-401',
        'epic-402',
        'epic-403',
        'epic-501',
        'epic-502',
        'epic-503',
        'epic-ap-foundation',
        'epic-ap-review',
        'epic-ap-monitor'
      );

    DELETE FROM projects
    WHERE org_id = v_org_id
      AND app_id IN (
        'proj-1',
        'proj-2',
        'proj-3',
        'proj-4',
        'proj-5',
        'proj-ap-invoice-exception'
      );

    INSERT INTO projects (id, org_id, app_id, name, description, owner_id, lifecycle_stage, health_status)
    VALUES
        ('bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'proj-ap-invoice-exception', 'AP Invoice Exception Workflow', 'Governed delivery plan for AP invoice exception intake, PO/GRN review, evidence-backed owner review, and Monitor readiness signals.', '00000000-0000-4000-8000-000000000009', 'Review', 'On Track')
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        owner_id = EXCLUDED.owner_id,
        lifecycle_stage = EXCLUDED.lifecycle_stage,
        health_status = EXCLUDED.health_status,
        updated_at = NOW();

    INSERT INTO epics (id, project_id, org_id, app_id, name, color)
    VALUES
        ('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-ap-foundation', 'AP Invoice Exception Workflow Foundation', '#0F766E'),
        ('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-ap-review', 'AP Evidence And Owner Review', '#D97706'),
        ('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-ap-monitor', 'AP Monitor Readiness', '#2563EB')
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        name = EXCLUDED.name,
        color = EXCLUDED.color;

    INSERT INTO sprints (id, project_id, org_id, app_id, name, start_date, end_date, status, goal, capacity)
    VALUES
        ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'sprint-ap-1', 'AP Exception Foundation Review', '2026-06-10', '2026-06-24', 'Active', 'Review canonical AP exception work items, evidence refs, source lineage, and Delivery Pack readiness.', 30),
        ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'sprint-ap-2', 'AP Monitor Readiness Review', '2026-06-25', '2026-07-08', 'Upcoming', 'Validate Monitor readiness signals and handoff evidence review before buyer-demo rehearsal.', 24)
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = EXCLUDED.status,
        goal = EXCLUDED.goal,
        capacity = EXCLUDED.capacity;

    INSERT INTO tasks (id, org_id, app_id, project_id, epic_id, sprint_id, title, description, status, priority, type, owner_id, story_points, start_date, due_date, metadata)
    VALUES
        ('eeeeeeee-0000-4000-8000-000000000101', v_org_id, 'task-ap-exception-map', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000101', 'dddddddd-0000-4000-8000-000000000001', 'Map AP exception intake and matching rules', 'Review invoice intake channels, PO/GRN matching rules, vendor master checks, duplicate detection, and tax variance routing against AP evidence refs.', 'In Review', 'High', 'Story', '00000000-0000-4000-8000-000000000002', 5, '2026-06-10', '2026-06-17', '{"assigneeIds":["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000007"],"sourceLineage":{"processId":"proc-ap-invoice-exception","assessmentId":"assess-proc-ap-invoice-exception","documentGenerationId":"docgen-ap-invoice-exception","deliveryPackId":"pack-ap-invoice-exception","lineageCompleteness":"complete","evidenceRefs":["ev-ap-exception-map","ev-ap-owner-review"],"handoffLedgerEntryIds":["handoff-ap-docs-delivery"]}}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000102', v_org_id, 'task-ap-doc-review', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'Review AP Studio artifacts for evidence coverage', 'Confirm BRD, PDD, FRD, quality gate, and work item candidates remain review artifacts tied to the completed AP assessment.', 'Testing', 'High', 'Task', '00000000-0000-4000-8000-000000000005', 3, '2026-06-12', '2026-06-19', '{"assigneeIds":["00000000-0000-4000-8000-000000000005"],"sourceLineage":{"processId":"proc-ap-invoice-exception","assessmentId":"assess-proc-ap-invoice-exception","documentGenerationId":"docgen-ap-invoice-exception","deliveryPackId":"pack-ap-invoice-exception","lineageCompleteness":"complete","evidenceRefs":["ev-ap-sop","ev-ap-owner-review"],"handoffLedgerEntryIds":["handoff-ap-assess-docs","handoff-ap-docs-delivery"]}}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000103', v_org_id, 'task-ap-owner-review', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'Capture AP owner review and blocked actions', 'Record human review requirements for payment-block updates, vendor communication, and external action before any handoff is treated as ready.', 'In Review', 'High', 'Story', '00000000-0000-4000-8000-000000000007', 5, '2026-06-13', '2026-06-21', '{"assigneeIds":["00000000-0000-4000-8000-000000000007","00000000-0000-4000-8000-000000000005"],"sourceLineage":{"processId":"proc-ap-invoice-exception","assessmentId":"assess-proc-ap-invoice-exception","documentGenerationId":"docgen-ap-invoice-exception","deliveryPackId":"pack-ap-invoice-exception","lineageCompleteness":"complete","evidenceRefs":["ev-ap-owner-review","ev-ap-policy"],"handoffLedgerEntryIds":["handoff-ap-docs-delivery"]}}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000104', v_org_id, 'task-ap-delivery-pack', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'Prepare AP Delivery Pack review', 'Confirm Delivery Pack sources, handoff ledger entries, evidence refs, blocker summary, and approval checklist before buyer-demo rehearsal.', 'Ready for Release', 'High', 'Task', '00000000-0000-4000-8000-000000000009', 5, '2026-06-17', '2026-06-24', '{"assigneeIds":["00000000-0000-4000-8000-000000000009"],"sourceLineage":{"processId":"proc-ap-invoice-exception","assessmentId":"assess-proc-ap-invoice-exception","documentGenerationId":"docgen-ap-invoice-exception","deliveryPackId":"pack-ap-invoice-exception","lineageCompleteness":"complete","evidenceRefs":["ev-ap-exception-report","ev-ap-owner-review"],"handoffLedgerEntryIds":["handoff-ap-assess-docs","handoff-ap-docs-delivery"]}}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000105', v_org_id, 'task-ap-monitor-readiness', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000103', 'dddddddd-0000-4000-8000-000000000002', 'Validate AP Monitor readiness signals', 'Review exception aging, open review items, evidence count, and handoff metadata as demo readiness signals, not live production telemetry.', 'To Do', 'Medium', 'Task', '00000000-0000-4000-8000-000000000001', 3, '2026-06-25', '2026-07-02', '{"assigneeIds":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000009"],"sourceLineage":{"processId":"proc-ap-invoice-exception","assessmentId":"assess-proc-ap-invoice-exception","documentGenerationId":"docgen-ap-invoice-exception","deliveryPackId":"pack-ap-invoice-exception","lineageCompleteness":"complete","evidenceRefs":["ev-ap-owner-review"],"handoffLedgerEntryIds":["handoff-ap-docs-delivery"]}}'::jsonb)
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        epic_id = EXCLUDED.epic_id,
        sprint_id = EXCLUDED.sprint_id,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        type = EXCLUDED.type,
        owner_id = EXCLUDED.owner_id,
        story_points = EXCLUDED.story_points,
        start_date = EXCLUDED.start_date,
        due_date = EXCLUDED.due_date,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
END;
$$;
