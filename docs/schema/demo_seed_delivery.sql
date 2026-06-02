-- KlarityPM Delivery Demo Seed for Supabase
-- Seeds projects, epics, sprints, and tasks using stable app_id values from the prototype.

DO $$
DECLARE
    v_org_id UUID := '11111111-1111-4111-8111-111111111111';
BEGIN
    INSERT INTO projects (id, org_id, app_id, name, description, owner_id, lifecycle_stage, health_status)
    VALUES
        ('bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'proj-1', 'AP Invoice Automation', 'Automate invoice intake, validation, exception routing, and SAP posting for Accounts Payable.', '00000000-0000-4000-8000-000000000009', 'Development', 'On Track'),
        ('bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'proj-2', 'Customer Support AI Assist', 'GenAI-assisted case summarization, suggested responses, and human handoff for Tier 1 support.', '00000000-0000-4000-8000-000000000004', 'Testing', 'At Risk'),
        ('bbbbbbbb-0000-4000-8000-000000000003', v_org_id, 'proj-3', 'Employee Onboarding Workflow', 'Workflow orchestration for HR, IT access, equipment, policy acknowledgements, and first-week tasks.', '00000000-0000-4000-8000-000000000002', 'Analysis & Design', 'On Track'),
        ('bbbbbbbb-0000-4000-8000-000000000004', v_org_id, 'proj-4', 'Claims Intake Agentic Triage', 'Bounded agentic triage for claims intake, document classification, validation, and adjuster escalation.', '00000000-0000-4000-8000-000000000008', 'Planning', 'At Risk'),
        ('bbbbbbbb-0000-4000-8000-000000000005', v_org_id, 'proj-5', 'Month-End Close Control Pack', 'Finance close documentation, reconciliations, evidence collection, and approval control automation.', '00000000-0000-4000-8000-000000000007', 'Deployment', 'On Track')
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        owner_id = EXCLUDED.owner_id,
        lifecycle_stage = EXCLUDED.lifecycle_stage,
        health_status = EXCLUDED.health_status,
        updated_at = NOW();

    INSERT INTO epics (id, project_id, org_id, app_id, name, color)
    VALUES
        ('cccccccc-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-101', 'Capture and Classify Invoices', '#0F766E'),
        ('cccccccc-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-102', 'Validation and Exception Rules', '#D97706'),
        ('cccccccc-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'epic-103', 'SAP Posting and Controls', '#2563EB'),
        ('cccccccc-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'epic-201', 'Knowledge Retrieval and Guardrails', '#7C3AED'),
        ('cccccccc-0000-4000-8000-000000000202', 'bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'epic-202', 'Agent Assist Experience', '#0891B2'),
        ('cccccccc-0000-4000-8000-000000000203', 'bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'epic-203', 'Human Handoff and QA', '#DC2626'),
        ('cccccccc-0000-4000-8000-000000000301', 'bbbbbbbb-0000-4000-8000-000000000003', v_org_id, 'epic-301', 'Onboarding Intake and Approvals', '#4F46E5'),
        ('cccccccc-0000-4000-8000-000000000302', 'bbbbbbbb-0000-4000-8000-000000000003', v_org_id, 'epic-302', 'Provisioning Orchestration', '#16A34A'),
        ('cccccccc-0000-4000-8000-000000000303', 'bbbbbbbb-0000-4000-8000-000000000003', v_org_id, 'epic-303', 'Employee Readiness Experience', '#CA8A04'),
        ('cccccccc-0000-4000-8000-000000000401', 'bbbbbbbb-0000-4000-8000-000000000004', v_org_id, 'epic-401', 'Document Classification', '#0E7490'),
        ('cccccccc-0000-4000-8000-000000000402', 'bbbbbbbb-0000-4000-8000-000000000004', v_org_id, 'epic-402', 'Agentic Triage Controls', '#BE123C'),
        ('cccccccc-0000-4000-8000-000000000403', 'bbbbbbbb-0000-4000-8000-000000000004', v_org_id, 'epic-403', 'Adjuster Escalation Workflow', '#4338CA'),
        ('cccccccc-0000-4000-8000-000000000501', 'bbbbbbbb-0000-4000-8000-000000000005', v_org_id, 'epic-501', 'Evidence Collection', '#059669'),
        ('cccccccc-0000-4000-8000-000000000502', 'bbbbbbbb-0000-4000-8000-000000000005', v_org_id, 'epic-502', 'Close Review and Sign-off', '#B45309'),
        ('cccccccc-0000-4000-8000-000000000503', 'bbbbbbbb-0000-4000-8000-000000000005', v_org_id, 'epic-503', 'Control Pack Reporting', '#2563EB')
    ON CONFLICT (org_id, app_id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        name = EXCLUDED.name,
        color = EXCLUDED.color;

    INSERT INTO sprints (id, project_id, org_id, app_id, name, start_date, end_date, status, goal, capacity)
    VALUES
        ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'sprint-1', 'AP Automation Pilot', '2026-04-15', '2026-04-28', 'Active', 'Prove invoice capture, PO match, and exception routing with real AP samples.', 34),
        ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', v_org_id, 'sprint-2', 'AP Posting Hardening', '2026-04-29', '2026-05-12', 'Upcoming', 'Harden SAP posting, controls, and audit evidence before UAT.', 31),
        ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'sprint-3', 'Support AI UAT', '2026-04-08', '2026-04-21', 'Completed', 'Validate draft replies and escalation triggers with support leads.', 29),
        ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', v_org_id, 'sprint-4', 'Support AI Governance Fixes', '2026-04-22', '2026-05-05', 'Active', 'Close guardrail findings before pilot expansion.', 24),
        ('dddddddd-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000003', v_org_id, 'sprint-5', 'Onboarding Discovery', '2026-04-22', '2026-05-05', 'Active', 'Map onboarding requests, approval paths, and provisioning bottlenecks.', 26)
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
        ('eeeeeeee-0000-4000-8000-000000000101', v_org_id, 'task-101', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000101', 'dddddddd-0000-4000-8000-000000000001', 'Map current invoice intake paths', 'Document email, supplier portal, shared drive, and manual handoff intake paths with volume split and owners.', 'Done', 'High', 'Task', '00000000-0000-4000-8000-000000000002', 3, '2026-04-15', '2026-04-17', '{"assigneeIds":["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000007"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000102', v_org_id, 'task-102', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000101', 'dddddddd-0000-4000-8000-000000000001', 'Build OCR confidence threshold rules', 'Define confidence bands for auto-post, AP review, and vendor clarification queues.', 'In Progress', 'High', 'Task', '00000000-0000-4000-8000-000000000006', 8, '2026-04-18', '2026-04-29', '{"assigneeIds":["00000000-0000-4000-8000-000000000006"],"dependencyIds":["task-101"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000103', v_org_id, 'task-103', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'PO match exception policy review', 'Review policy for PO mismatch, duplicate invoice, blocked vendor, and tax variance exceptions.', 'In Review', 'High', 'Story', '00000000-0000-4000-8000-000000000007', 5, '2026-04-19', '2026-04-28', '{"assigneeIds":["00000000-0000-4000-8000-000000000007","00000000-0000-4000-8000-000000000001"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000104', v_org_id, 'task-104', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000103', 'dddddddd-0000-4000-8000-000000000002', 'SAP posting connector smoke test', 'Run controlled posting into SAP sandbox and capture audit evidence for approvals.', 'To Do', 'High', 'Task', '00000000-0000-4000-8000-000000000006', 8, '2026-04-29', '2026-05-06', '{"assigneeIds":["00000000-0000-4000-8000-000000000006","00000000-0000-4000-8000-000000000008"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000105', v_org_id, 'task-105', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000102', 'dddddddd-0000-4000-8000-000000000001', 'Bug: duplicate invoice check misses credit memos', 'Credit memo documents with negative values bypass the duplicate check rule.', 'Blocked', 'Medium', 'Bug', '00000000-0000-4000-8000-000000000005', 3, '2026-04-24', '2026-04-30', '{"assigneeIds":["00000000-0000-4000-8000-000000000005","00000000-0000-4000-8000-000000000006"],"reporterId":"00000000-0000-4000-8000-000000000007"}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000201', v_org_id, 'task-201', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000201', 'dddddddd-0000-4000-8000-000000000003', 'Review knowledge base gaps for top 30 intents', 'Identify missing or stale support policy articles before the AI assistant pilot.', 'Done', 'High', 'Task', '00000000-0000-4000-8000-000000000004', 5, '2026-04-08', '2026-04-12', '{"assigneeIds":["00000000-0000-4000-8000-000000000004","00000000-0000-4000-8000-000000000002"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000202', v_org_id, 'task-202', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000201', 'dddddddd-0000-4000-8000-000000000004', 'Configure PII redaction in case summaries', 'Mask customer IDs, payment references, and sensitive free-text values before prompt construction.', 'Testing', 'High', 'Task', '00000000-0000-4000-8000-000000000004', 8, '2026-04-22', '2026-04-30', '{"assigneeIds":["00000000-0000-4000-8000-000000000004","00000000-0000-4000-8000-000000000008"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000203', v_org_id, 'task-203', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000202', 'dddddddd-0000-4000-8000-000000000004', 'Design agent handoff banner for support reps', 'Show why a case needs human review and what the model already checked.', 'In Progress', 'Medium', 'Task', '00000000-0000-4000-8000-000000000003', 5, '2026-04-23', '2026-05-02', '{"assigneeIds":["00000000-0000-4000-8000-000000000003"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000204', v_org_id, 'task-204', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000203', 'dddddddd-0000-4000-8000-000000000004', 'Validate escalation triggers with compliance', 'Confirm mandatory human handoff for refund disputes, legal threats, and vulnerable customer signals.', 'In Review', 'High', 'Story', '00000000-0000-4000-8000-000000000005', 5, '2026-04-22', '2026-04-29', '{"assigneeIds":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000005"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000301', v_org_id, 'task-301', 'bbbbbbbb-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000301', 'dddddddd-0000-4000-8000-000000000005', 'Facilitate onboarding process discovery workshop', 'Run a joint HR, IT, facilities, and manager workshop to capture current delays and handoffs.', 'Done', 'High', 'Task', '00000000-0000-4000-8000-000000000002', 3, '2026-04-22', '2026-04-24', '{"assigneeIds":["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000302', v_org_id, 'task-302', 'bbbbbbbb-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000301', 'dddddddd-0000-4000-8000-000000000005', 'Draft onboarding BRD from transcript notes', 'Use discovery notes to generate a first BRD covering request intake, approvals, SLAs, and exceptions.', 'In Progress', 'High', 'Story', '00000000-0000-4000-8000-000000000002', 5, '2026-04-24', '2026-05-01', '{"assigneeIds":["00000000-0000-4000-8000-000000000002"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000303', v_org_id, 'task-303', 'bbbbbbbb-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000302', 'dddddddd-0000-4000-8000-000000000005', 'Prototype access provisioning checklist', 'Create role-based checklist rules for application access, equipment, and manager readiness.', 'To Do', 'Medium', 'Task', '00000000-0000-4000-8000-000000000008', 5, '2026-04-29', '2026-05-05', '{"assigneeIds":["00000000-0000-4000-8000-000000000008"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000401', v_org_id, 'task-401', 'bbbbbbbb-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000401', NULL, 'Define claims document taxonomy', 'Create classes for FNOL form, policy, medical bill, photo evidence, police report, and missing evidence notice.', 'To Do', 'High', 'Task', '00000000-0000-4000-8000-000000000008', 8, '2026-05-01', '2026-05-10', '{"assigneeIds":["00000000-0000-4000-8000-000000000008","00000000-0000-4000-8000-000000000004"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000402', v_org_id, 'task-402', 'bbbbbbbb-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000402', NULL, 'Assess agent decision boundaries', 'Document what the agent can decide, recommend, or must escalate to an adjuster.', 'To Do', 'High', 'Story', '00000000-0000-4000-8000-000000000004', 13, '2026-05-03', '2026-05-15', '{"assigneeIds":["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000004"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000403', v_org_id, 'task-403', 'bbbbbbbb-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000403', NULL, 'Design adjuster review queue', 'Create review states for high-value, low-confidence, and legally sensitive claim packets.', 'On Hold', 'Medium', 'Task', '00000000-0000-4000-8000-000000000003', 5, '2026-05-08', '2026-05-20', '{"assigneeIds":["00000000-0000-4000-8000-000000000003"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000501', v_org_id, 'task-501', 'bbbbbbbb-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000501', NULL, 'Collect close evidence sources', 'Inventory reconciliation files, sign-off emails, variance comments, and system screenshots used in close.', 'Done', 'High', 'Task', '00000000-0000-4000-8000-000000000007', 3, '2026-04-01', '2026-04-05', '{"assigneeIds":["00000000-0000-4000-8000-000000000007","00000000-0000-4000-8000-000000000002"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000502', v_org_id, 'task-502', 'bbbbbbbb-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000502', NULL, 'Build control pack approval checklist', 'Create required review items for reconciliations, material variances, and controller sign-off.', 'Ready for Release', 'High', 'Story', '00000000-0000-4000-8000-000000000007', 8, '2026-04-08', '2026-04-22', '{"assigneeIds":["00000000-0000-4000-8000-000000000007","00000000-0000-4000-8000-000000000005"]}'::jsonb),
        ('eeeeeeee-0000-4000-8000-000000000503', v_org_id, 'task-503', 'bbbbbbbb-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000503', NULL, 'Create executive close dashboard metrics', 'Expose close readiness, missing evidence, late approvals, and unresolved material variances.', 'Testing', 'Medium', 'Task', '00000000-0000-4000-8000-000000000008', 5, '2026-04-16', '2026-04-29', '{"assigneeIds":["00000000-0000-4000-8000-000000000008"]}'::jsonb)
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
