import { useState, useCallback, useEffect } from 'react';
import { Assessment, AssessStatus, AssessmentApprovalEvent, AssessmentReviewComment, AssessmentSectionKey } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { calculateAssessmentScores } from './scoringEngine';
import { assessAdapter } from './adapters/assessAdapter';
import { useAuth } from '../components/auth/AuthProvider';

const CORE_SCORING_FIELDS = [
    { section: 'processStructure' as AssessmentSectionKey, field: 'standardization' },
    { section: 'processStructure' as AssessmentSectionKey, field: 'ruleDeterminism' },
    { section: 'processStructure' as AssessmentSectionKey, field: 'exceptionPredictability' },
    { section: 'processStructure' as AssessmentSectionKey, field: 'processMaturity' },
    { section: 'dataProfile' as AssessmentSectionKey, field: 'inputStructure' },
    { section: 'dataProfile' as AssessmentSectionKey, field: 'unstructuredLoad' },
    { section: 'dataProfile' as AssessmentSectionKey, field: 'dataSensitivity' },
    { section: 'judgment' as AssessmentSectionKey, field: 'judgmentIntensity' },
    { section: 'judgment' as AssessmentSectionKey, field: 'goalAmbiguity' },
    { section: 'systems' as AssessmentSectionKey, field: 'systemReadiness' },
    { section: 'systems' as AssessmentSectionKey, field: 'orchestrationComplexity' },
    { section: 'risk' as AssessmentSectionKey, field: 'riskCriticality' },
    { section: 'risk' as AssessmentSectionKey, field: 'governanceSensitivity' },
    { section: 'risk' as AssessmentSectionKey, field: 'errorReversibility' },
    { section: 'workPattern' as AssessmentSectionKey, field: 'volume' },
    { section: 'workPattern' as AssessmentSectionKey, field: 'manualEffort' },
    { section: 'workPattern' as AssessmentSectionKey, field: 'reworkPain' },
    { section: 'workPattern' as AssessmentSectionKey, field: 'cycleTimePain' },
];

const WORK_PATTERN_CONVERSION = {
    WORKING_DAYS_PER_YEAR: 260,
    WEEKS_PER_YEAR: 52,
    MONTHS_PER_YEAR: 12,
    MINUTES_PER_HOUR: 60,
};

const LOCKED_ASSESSMENT_STATUSES: AssessStatus[] = ['Approved', 'Rejected', 'Handed Off to Docs', 'Handed Off to Delivery', 'Archived'];

function normalizeAssessmentForScoring(assessment: Assessment): Assessment {
    const workPattern = { ...assessment.responses.workPattern };

    if (
        (workPattern.volume === undefined || workPattern.volume === null) &&
        workPattern.rawVolumeValue !== undefined &&
        workPattern.rawVolumeValue !== null
    ) {
        let annualVolume = Number(workPattern.rawVolumeValue);
        const period = workPattern.rawVolumePeriod || 'Day';
        if (period === 'Day') annualVolume *= WORK_PATTERN_CONVERSION.WORKING_DAYS_PER_YEAR;
        if (period === 'Week') annualVolume *= WORK_PATTERN_CONVERSION.WEEKS_PER_YEAR;
        if (period === 'Month') annualVolume *= WORK_PATTERN_CONVERSION.MONTHS_PER_YEAR;
        workPattern.rawVolumePeriod = period;
        workPattern.volume = annualVolume;
    }

    if (
        (workPattern.manualEffort === undefined || workPattern.manualEffort === null) &&
        workPattern.rawEffortValue !== undefined &&
        workPattern.rawEffortValue !== null
    ) {
        let hours = Number(workPattern.rawEffortValue);
        const unit = workPattern.rawEffortUnit || 'Minutes';
        if (unit === 'Minutes') hours = hours / WORK_PATTERN_CONVERSION.MINUTES_PER_HOUR;
        workPattern.rawEffortUnit = unit;
        workPattern.manualEffort = Number(hours.toFixed(2));
    }

    return {
        ...assessment,
        responses: {
            ...assessment.responses,
            workPattern,
        },
    };
}

export function useAssessmentService() {
    const { currentOrganization } = useOrganizationContext();
    const { user } = useAuth();
    const [assessments, setAssessments] = useState<Assessment[]>([]);
    const [loading, setLoading] = useState(false);

    const createApprovalEvent = useCallback((status: AssessStatus, reason?: string): AssessmentApprovalEvent => ({
        id: `review-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status,
        actorId: user?.id || 'system',
        actorName: user?.name,
        reason: reason?.trim() || undefined,
        createdAt: new Date().toISOString(),
    }), [user]);

    const createReviewComment = useCallback((type: AssessmentReviewComment['type'], message: string): AssessmentReviewComment => ({
        id: `review-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        authorId: user?.id || 'system',
        authorName: user?.name,
        type,
        message: message.trim(),
        createdAt: new Date().toISOString(),
    }), [user]);

    const getAssessmentForProcess = useCallback(async (processId: string): Promise<Assessment | null> => {
        if (!currentOrganization) return null;
        try {
            return await assessAdapter.getAssessment(processId, currentOrganization.id);
        } catch (err) {
            console.error('Failed to fetch assessment:', err);
            return null;
        }
    }, [currentOrganization]);

    const saveAssessmentDraft = useCallback(async (assessment: Assessment) => {
        if (!currentOrganization || !user) return;
        if (LOCKED_ASSESSMENT_STATUSES.includes(assessment.status)) {
            throw new Error('This assessment is locked after approval or handoff. Reopen through an authorized workflow before editing.');
        }
        
        const draft: Assessment = {
            ...assessment,
            status: 'Draft',
            metadata: { 
                ...assessment.metadata, 
                lastSavedAt: new Date().toISOString() 
            }
        };

        await assessAdapter.saveAssessment(draft);
        setAssessments(prev => {
            const existing = prev.find(a => a.id === assessment.id);
            return existing ? prev.map(a => a.id === assessment.id ? draft : a) : [...prev, draft];
        });
    }, [currentOrganization, user]);

    const persistAssessment = useCallback(async (nextAssessment: Assessment) => {
        await assessAdapter.saveAssessment(nextAssessment);
        setAssessments(prev => {
            const existing = prev.find(a => a.id === nextAssessment.id);
            return existing ? prev.map(a => a.id === nextAssessment.id ? nextAssessment : a) : [...prev, nextAssessment];
        });
        return nextAssessment;
    }, []);

    const completeAssessment = useCallback(async (assessment: Assessment) => {
        if (!currentOrganization || !user) return;
        const normalizedAssessment = normalizeAssessmentForScoring(assessment);

        // Deep structural validation
        const missingFields: string[] = [];
        for (const req of CORE_SCORING_FIELDS) {
            const sectionData = normalizedAssessment.responses[req.section] as any;
            if (!sectionData || sectionData[req.field] === undefined || sectionData[req.field] === null || sectionData[req.field] === '') {
                missingFields.push(`${req.section}.${req.field}`);
            }
        }

        if (missingFields.length > 0) {
            throw new Error(`Incomplete Assessment: Please fill all core scoring fields. Missing: ${missingFields.join(', ')}`);
        }

        // Execute deterministic scoring
        const scores = calculateAssessmentScores(normalizedAssessment.responses, {
            completionQuality: 100,
            evidenceQuality: normalizedAssessment.metadata.evidenceQuality,
            assumptionQuality: normalizedAssessment.metadata.assumptionQuality,
            stakeholderCoverage: normalizedAssessment.metadata.stakeholderCoverage,
            templateFit: normalizedAssessment.metadata.templateFit
        }, {
            assessmentId: normalizedAssessment.id,
            processId: normalizedAssessment.processId,
            organizationId: currentOrganization.id,
            evidenceItems: normalizedAssessment.evidenceItems,
            assumptions: normalizedAssessment.assumptions,
            status: 'Ready for Review'
        });

        const completedAssessment: Assessment = {
            ...normalizedAssessment,
            status: 'Ready for Review',
            scores,
            metadata: {
                ...normalizedAssessment.metadata,
                completionQuality: 100,
                lastSavedAt: new Date().toISOString()
            }
        };

        return persistAssessment(completedAssessment);
    }, [currentOrganization, user, persistAssessment]);

    const transitionAssessment = useCallback(async (assessment: Assessment, status: AssessStatus, reason?: string) => {
        if (!currentOrganization || !user) throw new Error('Auth required');
        const approvedHandoff = assessment.status === 'Approved' && ['Handed Off to Docs', 'Handed Off to Delivery'].includes(status);
        if (LOCKED_ASSESSMENT_STATUSES.includes(assessment.status) && status !== 'Archived' && !approvedHandoff) {
            throw new Error('This assessment is locked. Reopen or archive through an authorized workflow.');
        }

        const normalizedReason = reason?.trim();
        const restrictedDecision = assessment.scores?.decisionPack?.finalDecision === 'No-Go'
            || assessment.scores?.decisionPack?.finalDecision === 'Governance Review Required'
            || assessment.scores?.gatesTriggered?.some(gate => gate === 'No-Go' || gate === 'Governance Review Required');

        if (['Changes Requested', 'Rejected'].includes(status) && !normalizedReason) {
            throw new Error('Add a reviewer reason before requesting changes or rejecting the assessment.');
        }

        if (status === 'Approved' && restrictedDecision && !normalizedReason) {
            throw new Error('This decision has a governance/no-go gate. Add an approval override reason before approving.');
        }

        const event = createApprovalEvent(status, normalizedReason);
        const isLockingStatus = LOCKED_ASSESSMENT_STATUSES.includes(status);
        const commentType: AssessmentReviewComment['type'] =
            status === 'Changes Requested' ? 'Change Request' :
            status === 'Approved' ? 'Approval' :
            status === 'Rejected' ? 'Rejection' :
            status === 'Handed Off to Docs' || status === 'Handed Off to Delivery' ? 'Handoff' :
            'Comment';
        const statusComment = normalizedReason ? createReviewComment(commentType, normalizedReason) : undefined;
        const overrideEvent = status === 'Approved' && restrictedDecision && normalizedReason ? event : undefined;

        const nextAssessment: Assessment = {
            ...assessment,
            status,
            review: {
                ...assessment.review,
                lastReviewedBy: user.id,
                lastReviewedAt: event.createdAt,
                approvalHistory: [
                    ...(assessment.review?.approvalHistory || []),
                    event,
                ],
                comments: statusComment
                    ? [...(assessment.review?.comments || []), statusComment]
                    : assessment.review?.comments,
                overrideReason: overrideEvent?.reason || assessment.review?.overrideReason,
                overrideReasons: overrideEvent
                    ? [...(assessment.review?.overrideReasons || []), overrideEvent]
                    : assessment.review?.overrideReasons,
                lockedAt: isLockingStatus ? event.createdAt : assessment.review?.lockedAt,
                lockedBy: isLockingStatus ? user.id : assessment.review?.lockedBy,
                lockReason: isLockingStatus ? (normalizedReason || status) : assessment.review?.lockReason,
            },
            metadata: {
                ...assessment.metadata,
                lastSavedAt: new Date().toISOString()
            }
        };
        const savedAssessment = await assessAdapter.transitionAssessmentWithAudit(nextAssessment, {
            assessmentId: nextAssessment.id,
            processId: nextAssessment.processId,
            orgId: nextAssessment.orgId,
            actorId: user.id,
            eventType: commentType === 'Comment' ? 'Status Change' : commentType,
            status,
            reason: normalizedReason,
            payload: {
                previousStatus: assessment.status,
                nextStatus: status,
                restrictedDecision,
                locked: isLockingStatus,
            },
        });
        setAssessments(prev => {
            const existing = prev.find(a => a.id === savedAssessment.id);
            return existing ? prev.map(a => a.id === savedAssessment.id ? savedAssessment : a) : [...prev, savedAssessment];
        });
        return savedAssessment;
    }, [currentOrganization, user, createApprovalEvent, createReviewComment]);

    const submitForReview = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'In Review', reason), [transitionAssessment]);
    const requestChanges = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'Changes Requested', reason), [transitionAssessment]);
    const approveAssessment = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'Approved', reason), [transitionAssessment]);
    const rejectAssessment = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'Rejected', reason), [transitionAssessment]);
    const markHandedOffToDocs = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'Handed Off to Docs', reason), [transitionAssessment]);
    const markHandedOffToDelivery = useCallback((assessment: Assessment, reason?: string) => transitionAssessment(assessment, 'Handed Off to Delivery', reason), [transitionAssessment]);

    return {
        assessments,
        loading,
        getAssessmentForProcess,
        saveAssessmentDraft,
        completeAssessment,
        submitForReview,
        requestChanges,
        approveAssessment,
        rejectAssessment,
        markHandedOffToDocs,
        markHandedOffToDelivery,
    };
}
