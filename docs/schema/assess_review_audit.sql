-- AvalaOS Core Assess Review and Audit Persistence
-- Targets: PostgreSQL / Supabase
-- Purpose: make assessment review decisions, override reasons, and approval events append-only.

-- Keep the current JSON document model for low-cost velocity, but persist the review state explicitly.
ALTER TABLE assessments
    ADD COLUMN IF NOT EXISTS review JSONB DEFAULT '{}'::jsonb;

-- Structured immutable event stream for the Assess governance cockpit.
CREATE TABLE IF NOT EXISTS assessment_review_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    process_id UUID NOT NULL REFERENCES assess_processes(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES profiles(id),
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'Comment',
            'Change Request',
            'Approval',
            'Rejection',
            'Override',
            'Handoff',
            'Status Change'
        )
    ),
    status TEXT NOT NULL,
    section_key TEXT,
    reason TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assessment_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see org assessment review events" ON assessment_review_events
    FOR SELECT USING (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can add org assessment review events" ON assessment_review_events
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND actor_id = auth.uid()
    );

CREATE INDEX IF NOT EXISTS idx_assessment_review_events_org_assessment_created
    ON assessment_review_events(org_id, assessment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessment_review_events_process_created
    ON assessment_review_events(process_id, created_at DESC);

-- Extend the general audit log so security reviews have enough provenance.
ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS request_id TEXT,
    ADD COLUMN IF NOT EXISTS source_ip INET,
    ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE POLICY "Users can add own org audit events" ON audit_events
    FOR INSERT WITH CHECK (
        org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
        AND (user_id IS NULL OR user_id = auth.uid())
    );

-- Append-only enforcement for audit tables.
CREATE OR REPLACE FUNCTION prevent_immutable_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit and review events are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_assessment_review_events_update'
    ) THEN
        CREATE TRIGGER prevent_assessment_review_events_update
            BEFORE UPDATE OR DELETE ON assessment_review_events
            FOR EACH ROW EXECUTE FUNCTION prevent_immutable_event_mutation();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'prevent_audit_events_update'
    ) THEN
        CREATE TRIGGER prevent_audit_events_update
            BEFORE UPDATE OR DELETE ON audit_events
            FOR EACH ROW EXECUTE FUNCTION prevent_immutable_event_mutation();
    END IF;
END;
$$;

-- Transactional transition boundary used by the frontend adapter.
-- This keeps assessment status/review JSON, immutable review event, generic audit event,
-- and process status synchronized in one Postgres transaction.
CREATE OR REPLACE FUNCTION transition_assessment_with_audit(
    p_assessment JSONB,
    p_review_event JSONB
)
RETURNS assessments
LANGUAGE plpgsql
AS $$
DECLARE
    v_assessment_id UUID := (p_assessment ->> 'id')::UUID;
    v_process_id UUID := (p_assessment ->> 'process_id')::UUID;
    v_org_id UUID := (p_assessment ->> 'org_id')::UUID;
    v_actor_id UUID := (p_review_event ->> 'actor_id')::UUID;
    v_status TEXT := p_assessment ->> 'status';
    v_review_event assessment_review_events%ROWTYPE;
    v_assessment assessments%ROWTYPE;
BEGIN
    IF v_actor_id <> auth.uid() THEN
        RAISE EXCEPTION 'Actor does not match authenticated user.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM organization_members
        WHERE org_id = v_org_id
          AND user_id = auth.uid()
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'User is not an active member of this organization.';
    END IF;

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
        review,
        scores,
        updated_at
    )
    VALUES (
        v_assessment_id,
        v_process_id,
        v_org_id,
        v_status,
        COALESCE(p_assessment -> 'metadata', '{}'::jsonb),
        COALESCE(p_assessment -> 'responses', '{}'::jsonb),
        COALESCE(p_assessment -> 'evidence_items', '[]'::jsonb),
        COALESCE(p_assessment -> 'assumptions', '[]'::jsonb),
        COALESCE(p_assessment -> 'completion_by_section', '{}'::jsonb),
        COALESCE(p_assessment -> 'review', '{}'::jsonb),
        p_assessment -> 'scores',
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        responses = EXCLUDED.responses,
        evidence_items = EXCLUDED.evidence_items,
        assumptions = EXCLUDED.assumptions,
        completion_by_section = EXCLUDED.completion_by_section,
        review = EXCLUDED.review,
        scores = EXCLUDED.scores,
        updated_at = NOW()
    RETURNING * INTO v_assessment;

    UPDATE assess_processes
    SET status = v_status,
        updated_at = NOW()
    WHERE id = v_process_id
      AND org_id = v_org_id;

    INSERT INTO assessment_review_events (
        org_id,
        assessment_id,
        process_id,
        actor_id,
        event_type,
        status,
        section_key,
        reason,
        payload
    )
    VALUES (
        v_org_id,
        v_assessment_id,
        v_process_id,
        v_actor_id,
        p_review_event ->> 'event_type',
        p_review_event ->> 'status',
        p_review_event ->> 'section_key',
        p_review_event ->> 'reason',
        COALESCE(p_review_event -> 'payload', '{}'::jsonb)
    )
    RETURNING * INTO v_review_event;

    INSERT INTO audit_events (
        org_id,
        user_id,
        action,
        entity_type,
        entity_id,
        payload,
        reason
    )
    VALUES (
        v_org_id,
        v_actor_id,
        'assessment.' || lower(replace(p_review_event ->> 'event_type', ' ', '_')),
        'assessment',
        v_assessment_id,
        COALESCE(p_review_event -> 'payload', '{}'::jsonb) || jsonb_build_object(
            'assessmentReviewEventId', v_review_event.id,
            'processId', v_process_id
        ),
        p_review_event ->> 'reason'
    );

    RETURN v_assessment;
END;
$$;
