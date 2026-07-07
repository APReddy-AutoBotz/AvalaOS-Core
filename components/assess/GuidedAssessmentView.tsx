import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '../../services/organizationService';
import { useAssessmentService } from '../../services/assessmentService';
import { useProcessService } from '../../services/processService';
import { AssessmentSectionKey, AssessmentResponses, Assessment, EvidenceItem, Assumption, AssessmentReviewComment } from '../../types';
import { useAuth } from '../auth/AuthProvider';
import {
    ASSESS_SECTIONS,
    AssessQuestionDefinition,
    getAssessFieldOptions,
    getAssessQuestionsForSection,
} from '../../constants/assessQuestionBank';
import {
    getAssessTemplateRuleFromConfig,
    getReviewerCheckpointsForSectionFromConfig,
    useAssessGovernanceConfig,
} from '../../services/assessGovernanceService';
import { buildAvalaGovernLiteCard } from '../../services/avalaGovernLiteService';
import { aiEdgeClient, isAiEdgeEnabled } from '../../services/aiEdgeClient';
import { downloadAssessmentDecisionPack } from '../../services/assessmentExportService';
import AvalaGovernLiteCardPanel from './AvalaGovernLiteCardPanel';

export const CONVERSION_RATES = {
    WORKING_DAYS_PER_YEAR: 260,
    WEEKS_PER_YEAR: 52,
    MONTHS_PER_YEAR: 12,
    MINUTES_PER_HOUR: 60
};

const SECTIONS = ASSESS_SECTIONS;

const COMPLETED_SECTION_KEY = 'scores_results';
const LOCKED_ASSESSMENT_STATUSES = new Set(['Approved', 'Rejected', 'Handed Off to Docs', 'Handed Off to Delivery', 'Archived']);

const DEFAULT_RESPONSES: AssessmentResponses = {
    processStructure: {},
    workPattern: {},
    dataProfile: {},
    judgment: {},
    systems: {},
    risk: {}
};

interface GuidedAssessmentViewProps {
    processId: string;
    onExit: () => void;
}

const GuidedAssessmentView: React.FC<GuidedAssessmentViewProps> = ({ processId, onExit }) => {
    const { currentOrganization } = useOrganization();
    const {
        getAssessmentForProcess,
        saveAssessmentDraft,
        completeAssessment,
        submitForReview,
        requestChanges,
        approveAssessment,
        rejectAssessment,
        markHandedOffToDocs,
        markHandedOffToDelivery,
    } = useAssessmentService();
    const { getProcessById } = useProcessService();
    const { user } = useAuth();
    const { config: assessGovernanceConfig } = useAssessGovernanceConfig();

    const [currentSection, setCurrentSection] = useState<AssessmentSectionKey>('processStructure');
    
    // Core payload state
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [originalAssessment, setOriginalAssessment] = useState<Assessment | null>(null);

    // Unsaved changes state
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [processUnavailable, setProcessUnavailable] = useState(false);
    const [evidenceDraft, setEvidenceDraft] = useState<{ type: EvidenceItem['type']; linkedField: string; description: string; owner: string; sensitivity: NonNullable<EvidenceItem['sensitivity']> }>({
        type: 'SOP',
        linkedField: '',
        description: '',
        owner: '',
        sensitivity: 'Internal',
    });
    const [assumptionDraft, setAssumptionDraft] = useState<{ category: Assumption['category']; description: string; confidence: number; owner: string; reviewDate: string; linkedField: string }>({
        category: 'Volume',
        description: '',
        confidence: 3,
        owner: '',
        reviewDate: '',
        linkedField: '',
    });
    const [reviewCommentDrafts, setReviewCommentDrafts] = useState<Partial<Record<AssessmentSectionKey, string>>>({});
    const [statusReasonDraft, setStatusReasonDraft] = useState('');
    const [exportingDecisionPack, setExportingDecisionPack] = useState<'json' | 'markdown' | null>(null);

    // Initialization
    useEffect(() => {
        if (!currentOrganization) return;
        
        const initAssessment = async () => {
            const processContext = getProcessById(processId, currentOrganization.id);
            if (!processContext) {
                setAssessment(null);
                setOriginalAssessment(null);
                setProcessUnavailable(true);
                setErrorMsg('This process is not available in the current organization context. Return to the process catalog and select an available process.');
                return;
            }

            setProcessUnavailable(false);
            setErrorMsg(null);
            const existing = await getAssessmentForProcess(processId);
            const templateRule = getAssessTemplateRuleFromConfig(processContext.templateId, assessGovernanceConfig);
            
            if (existing) {
                setAssessment(JSON.parse(JSON.stringify(existing)));
                setOriginalAssessment(JSON.parse(JSON.stringify(existing)));
                if (existing.scores) {
                    setCurrentSection(COMPLETED_SECTION_KEY as any);
                }
            } else {
                const responses = JSON.parse(JSON.stringify(DEFAULT_RESPONSES)) as AssessmentResponses;
                if (templateRule?.defaultResponsePatch) {
                    for (const [section, defaults] of Object.entries(templateRule.defaultResponsePatch)) {
                        responses[section as AssessmentSectionKey] = {
                            ...(responses[section as AssessmentSectionKey] as any),
                            ...defaults,
                        } as any;
                    }
                }
                const newAssessment: Assessment = {
                    id: crypto.randomUUID(),
                    processId,
                    orgId: currentOrganization.id,
                    status: 'Not Started',
                    metadata: {
                        completionQuality: 0,
                        templateFit: false,
                        lastSavedAt: new Date().toISOString(),
                        stakeholderCoverage: 1,
                        evidenceQuality: 1,
                        assumptionQuality: 1,
                    },
                    responses,
                    evidenceItems: [],
                    assumptions: [],
                    completionBySection: {
                        processStructure: 0, workPattern: 0, dataProfile: 0, judgment: 0, systems: 0, risk: 0, evidenceAndAssumptions: 0
                    }
                };
                setAssessment(newAssessment);
                setOriginalAssessment(JSON.parse(JSON.stringify(newAssessment)));
            }
        };
        
        initAssessment();
    }, [processId, currentOrganization, getAssessmentForProcess, getProcessById, assessGovernanceConfig]);

    const isDirty = useMemo(() => {
        return JSON.stringify(assessment) !== JSON.stringify(originalAssessment);
    }, [assessment, originalAssessment]);

    const handleSaveDraft = useCallback(async () => {
        if (!assessment || !currentOrganization) return;
        try {
            await saveAssessmentDraft(assessment);
            setOriginalAssessment(JSON.parse(JSON.stringify(assessment)));
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    }, [assessment, currentOrganization, saveAssessmentDraft]);

    const handleComplete = useCallback(async () => {
        if (!assessment || !currentOrganization) return;
        try {
            await completeAssessment(assessment);
            // Refresh to see results
            const updated = await getAssessmentForProcess(processId);
            if (updated) {
                setAssessment(updated);
                setOriginalAssessment(updated);
                setCurrentSection(COMPLETED_SECTION_KEY as any);
                setErrorMsg(null);
                alert('Assessment scored and marked Ready for Review.');
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Validation failed. Please fill all required fields.');
        }
    }, [assessment, currentOrganization, completeAssessment, getAssessmentForProcess, processId]);

    const statusActionRequiresReason = useCallback((kind: 'submit' | 'approve' | 'changes' | 'reject' | 'docs' | 'delivery') => {
        if (!assessment) return false;
        const restrictedDecision = assessment.scores?.decisionPack?.finalDecision === 'No-Go'
            || assessment.scores?.decisionPack?.finalDecision === 'Governance Review Required'
            || assessment.scores?.gatesTriggered?.some(gate => gate === 'No-Go' || gate === 'Governance Review Required');
        return kind === 'changes' || kind === 'reject' || (kind === 'approve' && Boolean(restrictedDecision));
    }, [assessment]);

    const runStatusAction = useCallback(async (
        action: (assessment: Assessment, reason?: string) => Promise<Assessment | undefined>,
        successMessage: string,
        kind: 'submit' | 'approve' | 'changes' | 'reject' | 'docs' | 'delivery',
    ) => {
        if (!assessment) return;
        const reason = statusReasonDraft.trim();
        if (LOCKED_ASSESSMENT_STATUSES.has(assessment.status) && !(assessment.status === 'Approved' && ['docs', 'delivery'].includes(kind))) {
            setErrorMsg('This assessment is locked after approval or handoff. Use the recorded handoff pack instead of editing this decision.');
            return;
        }
        if (statusActionRequiresReason(kind) && !reason) {
            setErrorMsg('Add a review reason before taking this action.');
            return;
        }
        try {
            const updated = await action(assessment, reason || undefined);
            if (updated) {
                setAssessment(updated);
                setOriginalAssessment(updated);
                setStatusReasonDraft('');
                setErrorMsg(null);
                alert(successMessage);
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Unable to update assessment status.');
        }
    }, [assessment, statusReasonDraft, statusActionRequiresReason]);

    const handleExportDecisionPack = useCallback(async (format: 'json' | 'markdown') => {
        if (!assessment?.scores || !currentOrganization) return;
        const processContext = getProcessById(processId, currentOrganization.id);
        setExportingDecisionPack(format);

        try {
            if (isAiEdgeEnabled()) {
                const exportResult = await aiEdgeClient.exportDecisionPack({
                    assessmentId: assessment.id,
                    scoreSetId: assessment.scores.scoreVersion,
                    exportType: format,
                });
                const signedUrl = await aiEdgeClient.createSignedDownloadUrl(exportResult.downloadReference);
                window.open(signedUrl, '_blank', 'noopener,noreferrer');
            } else {
                downloadAssessmentDecisionPack(
                    assessment,
                    processContext?.name,
                    format,
                    processContext ? buildAvalaGovernLiteCard(assessment, processContext) : undefined,
                );
            }
            setErrorMsg(null);
        } catch (err: any) {
            setErrorMsg(err.message || 'Unable to export Decision Pack.');
        } finally {
            setExportingDecisionPack(null);
        }
    }, [assessment, currentOrganization, getProcessById, processId]);

    const attemptExit = useCallback((action: () => void) => {
        if (isDirty) {
            setPendingExitAction(() => action);
            setShowUnsavedModal(true);
        } else {
            action();
        }
    }, [isDirty]);

    const confirmDiscardAndExit = useCallback(() => {
        setShowUnsavedModal(false);
        if (pendingExitAction) pendingExitAction();
    }, [pendingExitAction]);

    const confirmSaveAndExit = useCallback(async () => {
        await handleSaveDraft();
        setShowUnsavedModal(false);
        if (pendingExitAction) pendingExitAction();
    }, [handleSaveDraft, pendingExitAction]);

    const currentSectionIndex = SECTIONS.findIndex(s => s.key === currentSection);

    const handleNext = useCallback(async () => {
        if (isDirty) await handleSaveDraft();
        const nextSec = SECTIONS[currentSectionIndex + 1];
        if (nextSec) {
            setCurrentSection(nextSec.key);
            document.querySelector('.overflow-y-auto')?.scrollTo(0, 0);
        }
    }, [isDirty, handleSaveDraft, currentSectionIndex]);

    const handlePrev = useCallback(async () => {
        if (isDirty) await handleSaveDraft();
        const prevSec = SECTIONS[currentSectionIndex - 1];
        if (prevSec) {
            setCurrentSection(prevSec.key);
            document.querySelector('.overflow-y-auto')?.scrollTo(0, 0);
        }
    }, [isDirty, handleSaveDraft, currentSectionIndex]);

    const handleSectionChange = useCallback(async (newSection: string) => {
        if (isDirty) await handleSaveDraft();
        setCurrentSection(newSection as any);
        document.querySelector('.overflow-y-auto')?.scrollTo(0, 0);
    }, [isDirty, handleSaveDraft]);

    // Field Update Helpers
    const updateResponse = useCallback((section: AssessmentSectionKey, field: string, value: number | string | boolean) => {
        setAssessment(prev => {
            if (!prev) return prev;
            const newResponses = { ...prev.responses } as any;
            if (!newResponses[section]) newResponses[section] = {};
            newResponses[section][field] = value;
            return { ...prev, responses: newResponses as AssessmentResponses };
        });
    }, []);

    const updateMetadata = useCallback((field: keyof Assessment['metadata'], value: number | boolean | string) => {
        setAssessment(prev => prev ? {
            ...prev,
            metadata: {
                ...prev.metadata,
                [field]: value,
            },
        } : prev);
    }, []);

    const updateReviewerNote = useCallback((section: AssessmentSectionKey, value: string) => {
        setAssessment(prev => prev ? {
            ...prev,
            review: {
                ...prev.review,
                reviewerNotes: {
                    ...prev.review?.reviewerNotes,
                    [section]: value,
                },
            },
        } : prev);
    }, []);

    const updateReviewerCheckpoint = useCallback((checkpointId: string, value: boolean) => {
        setAssessment(prev => prev ? {
            ...prev,
            review: {
                ...prev.review,
                checkpoints: {
                    ...prev.review?.checkpoints,
                    [checkpointId]: value,
                },
                lastReviewedAt: new Date().toISOString(),
            },
        } : prev);
    }, []);

    const addReviewComment = useCallback((section: AssessmentSectionKey, type: AssessmentReviewComment['type'] = 'Comment') => {
        if (!user) return;
        const message = reviewCommentDrafts[section]?.trim();
        if (!message) {
            setErrorMsg('Add a reviewer comment before saving it to the thread.');
            return;
        }
        const comment: AssessmentReviewComment = {
            id: `review-comment-${Date.now()}`,
            section,
            authorId: user.id,
            authorName: user.name,
            type,
            message,
            createdAt: new Date().toISOString(),
        };
        setAssessment(prev => prev ? {
            ...prev,
            review: {
                ...prev.review,
                comments: [...(prev.review?.comments || []), comment],
                lastReviewedBy: user.id,
                lastReviewedAt: comment.createdAt,
            },
        } : prev);
        setReviewCommentDrafts(prev => ({ ...prev, [section]: '' }));
        setErrorMsg(null);
    }, [reviewCommentDrafts, user]);

    const updateWorkPattern = useCallback((field: 'rawVolumeValue' | 'rawVolumePeriod' | 'rawEffortValue' | 'rawEffortUnit', value: any) => {
        setAssessment(prev => {
            if (!prev) return prev;
            const wp = { ...prev.responses.workPattern };
            
            // 1. Update the raw field
            (wp as any)[field] = value;

            // 2. Safely apply fallback defaults if user touches only one half of the pair
            // (e.g., they type a number, but period was previously undefined because it's a legacy draft)
            if (field === 'rawVolumeValue' && !wp.rawVolumePeriod && wp.volume) Object.assign(wp, { rawVolumePeriod: 'Year' });
            if (field === 'rawVolumeValue' && !wp.rawVolumePeriod && !wp.volume) Object.assign(wp, { rawVolumePeriod: 'Day' });
            if (field === 'rawVolumePeriod' && wp.rawVolumeValue === undefined && wp.volume) Object.assign(wp, { rawVolumeValue: wp.volume });
            
            if (field === 'rawEffortValue' && !wp.rawEffortUnit && wp.manualEffort) Object.assign(wp, { rawEffortUnit: 'Hours' });
            if (field === 'rawEffortValue' && !wp.rawEffortUnit && !wp.manualEffort) Object.assign(wp, { rawEffortUnit: 'Minutes' });
            if (field === 'rawEffortUnit' && wp.rawEffortValue === undefined && wp.manualEffort) Object.assign(wp, { rawEffortValue: wp.manualEffort });

            // 3. Normalize Volume (to Annual)
            if (wp.rawVolumeValue !== undefined && wp.rawVolumePeriod) {
                let annual = wp.rawVolumeValue;
                if (wp.rawVolumePeriod === 'Day') annual *= CONVERSION_RATES.WORKING_DAYS_PER_YEAR;
                if (wp.rawVolumePeriod === 'Week') annual *= CONVERSION_RATES.WEEKS_PER_YEAR;
                if (wp.rawVolumePeriod === 'Month') annual *= CONVERSION_RATES.MONTHS_PER_YEAR;
                wp.volume = annual;
            }

            // 4. Normalize Effort (to Hours)
            if (wp.rawEffortValue !== undefined && wp.rawEffortUnit) {
                let hours = wp.rawEffortValue;
                if (wp.rawEffortUnit === 'Minutes') hours = hours / CONVERSION_RATES.MINUTES_PER_HOUR;
                wp.manualEffort = Number(hours.toFixed(2));
            }

            return { ...prev, responses: { ...prev.responses, workPattern: wp } };
        });
    }, []);

    const renderScaleInput = (section: AssessmentSectionKey, field: string, label: string, desc: string, isPercent = false, labels?: string[]) => {
        if (!assessment) return null;
        let val = (assessment.responses as any)[section]?.[field];
        
        // Goal Ambiguity Inversion Logic: UI 5 (High Clarity) saves as 1 (Low Ambiguity)
        if (field === 'goalAmbiguity' && val !== undefined && val !== '') {
            val = 6 - val; 
        }

        return (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <label className="block text-sm font-black text-slate-900 dark:text-white">{label}</label>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{desc}</p>
                
                {isPercent ? (
                    <div className="flex items-center gap-2">
                        {labels ? (
                            <div className="flex w-full max-w-2xl flex-col gap-2">
                                {[0, 25, 50, 75, 100].map((num, i) => (
                                    <label key={num} className={`flex cursor-pointer items-center rounded-xl border p-3 transition-colors ${val === num ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] dark:text-[#ffcf45]' : 'border-slate-200 bg-white text-slate-600 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'}`}>
                                        <input 
                                            type="radio" name={`${section}-${field}`} 
                                            checked={val === num} 
                                            onChange={() => updateResponse(section, field, num)}
                                            className="h-4 w-4 text-[#002C4B] focus:ring-[#ffbc03]"
                                        />
                                        <span className="ml-3 text-sm font-bold">{labels[i]}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <>
                                <input 
                                    type="number" min="0" max="100" 
                                    value={val ?? ''}
                                    onChange={(e) => {
                                        const v = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                        updateResponse(section, field, v);
                                    }}
                                    className="w-24 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                />
                                <span className="text-slate-500">%</span>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex w-full max-w-2xl gap-2">
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                onClick={() => {
                                    const saveVal = field === 'goalAmbiguity' ? (6 - num) : num;
                                    updateResponse(section, field, saveVal);
                                }}
                                className={`flex-1 rounded-xl border py-2 text-sm font-black transition-all ${val === num ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] shadow-sm dark:text-[#ffcf45]' : 'border-slate-200 bg-white text-slate-500 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'}`}
                            >
                                {num} <span className="block text-[10px] font-medium opacity-70 mt-0.5">{labels ? labels[num-1] : ''}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderNumericInput = (section: AssessmentSectionKey, field: string, label: string, desc: string, allowDecimal = false) => {
        if (!assessment) return null;
        const val = (assessment.responses as any)[section]?.[field] ?? '';
        return (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <label className="block text-sm font-black text-slate-900 dark:text-white">{label}</label>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{desc}</p>
                <input 
                    type="number" 
                    step={allowDecimal ? "0.1" : "1"}
                    min="0"
                    value={val}
                    onChange={(e) => {
                        const parsed = allowDecimal ? parseFloat(e.target.value) : parseInt(e.target.value);
                        if (!isNaN(parsed)) updateResponse(section, field, parsed);
                        else updateResponse(section, field, ''); // clearing
                    }}
                    className="w-full max-w-xs rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                />
            </div>
        );
    }

    const renderTextAreaInput = (section: AssessmentSectionKey, field: string, label: string, desc: string, placeholder: string) => {
        if (!assessment) return null;
        const val = (assessment.responses as any)[section]?.[field] ?? '';
        return (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <label className="block text-sm font-black text-slate-900 dark:text-white">{label}</label>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{desc}</p>
                <textarea
                    value={val}
                    onChange={(event) => updateResponse(section, field, event.target.value)}
                    placeholder={placeholder}
                    className="mt-3 h-24 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                />
            </div>
        );
    };

    const renderToggleInput = (section: AssessmentSectionKey, field: string, label: string, desc: string) => {
        if (!assessment) return null;
        const val = Boolean((assessment.responses as any)[section]?.[field]);
        return (
            <button
                type="button"
                onClick={() => updateResponse(section, field, !val)}
                className={`rounded-2xl border p-4 text-left transition-all ${val ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] shadow-sm dark:text-[#ffcf45]' : 'border-slate-200 bg-white/90 text-slate-600 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400'}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-black">{label}</div>
                        <p className="mt-1 text-xs font-semibold leading-5 opacity-75">{desc}</p>
                    </div>
                    <span className={`mt-0.5 h-5 w-9 rounded-full p-0.5 transition-colors ${val ? 'bg-[#002C4B]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : ''}`} />
                    </span>
                </div>
            </button>
        );
    };

    const renderMetadataToggle = (field: 'templateFit', label: string, desc: string) => {
        if (!assessment) return null;
        const val = Boolean(assessment.metadata[field]);
        return (
            <button
                type="button"
                onClick={() => updateMetadata(field, !val)}
                className={`rounded-2xl border p-4 text-left transition-all ${val ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] shadow-sm dark:text-[#ffcf45]' : 'border-slate-200 bg-white/90 text-slate-600 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400'}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-black">{label}</div>
                        <p className="mt-1 text-xs font-semibold leading-5 opacity-75">{desc}</p>
                    </div>
                    <span className={`mt-0.5 h-5 w-9 rounded-full p-0.5 transition-colors ${val ? 'bg-[#002C4B]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                        <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : ''}`} />
                    </span>
                </div>
            </button>
        );
    };

    const renderWorkVolumeInput = (question: AssessQuestionDefinition) => {
        if (!assessment) return null;
        return (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <label className="block text-sm font-black text-slate-900 dark:text-white">{question.label}</label>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{question.description}</p>
                    </div>
                    <span className="rounded-full bg-[#002C4B]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-[#ffcf45]">Scoring field</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={assessment.responses.workPattern.rawVolumeValue ?? assessment.responses.workPattern.volume ?? ''}
                        onChange={(e) => updateWorkPattern('rawVolumeValue', e.target.value ? parseInt(e.target.value) : undefined)}
                        className="w-32 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                        placeholder="Value"
                    />
                    <select
                        value={assessment.responses.workPattern.rawVolumePeriod ?? (assessment.responses.workPattern.volume ? 'Year' : '')}
                        onChange={(e) => updateWorkPattern('rawVolumePeriod', e.target.value)}
                        className="w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                    >
                        <option value="" disabled>Select period</option>
                        <option value="Day">Per day</option>
                        <option value="Week">Per week</option>
                        <option value="Month">Per month</option>
                        <option value="Year">Per year</option>
                    </select>
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B]/70 dark:text-[#ffcf45]">Annualized automatically for business value scoring.</p>
            </div>
        );
    };

    const renderWorkEffortInput = (question: AssessQuestionDefinition) => {
        if (!assessment) return null;
        return (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <label className="block text-sm font-black text-slate-900 dark:text-white">{question.label}</label>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{question.description}</p>
                    </div>
                    <span className="rounded-full bg-[#002C4B]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-[#ffcf45]">Scoring field</span>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={assessment.responses.workPattern.rawEffortValue ?? assessment.responses.workPattern.manualEffort ?? ''}
                        onChange={(e) => updateWorkPattern('rawEffortValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="w-32 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                        placeholder="Value"
                    />
                    <select
                        value={assessment.responses.workPattern.rawEffortUnit ?? (assessment.responses.workPattern.manualEffort ? 'Hours' : 'Minutes')}
                        onChange={(e) => updateWorkPattern('rawEffortUnit', e.target.value)}
                        className="w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                    >
                        <option value="Minutes">Minutes</option>
                        <option value="Hours">Hours</option>
                    </select>
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B]/70 dark:text-[#ffcf45]">Standardized automatically for effort saving estimates.</p>
            </div>
        );
    };

    const renderQuestion = (question: AssessQuestionDefinition) => {
        if (question.kind === 'workVolume') return renderWorkVolumeInput(question);
        if (question.kind === 'workEffort') return renderWorkEffortInput(question);
        if (question.kind === 'scale') return renderScaleInput(question.section, question.field, question.label, question.description, false, question.labels);
        if (question.kind === 'percent') return renderScaleInput(question.section, question.field, question.label, question.description, true, question.labels);
        if (question.kind === 'number') return renderNumericInput(question.section, question.field, question.label, question.description, question.allowDecimal);
        if (question.kind === 'textarea') return renderTextAreaInput(question.section, question.field, question.label, question.description, question.placeholder || '');
        if (question.kind === 'toggle') return renderToggleInput(question.section, question.field, question.label, question.description);
        return null;
    };

    const renderReviewerOverlay = (section: AssessmentSectionKey) => {
        if (!assessment || !user || !['Reviewer', 'Admin'].includes(user.orgRole || '')) return null;
        const templateRule = getAssessTemplateRuleFromConfig(currentProcess?.templateId, assessGovernanceConfig);
        const checkpoints = getReviewerCheckpointsForSectionFromConfig(section, assessment, templateRule, assessGovernanceConfig);
        if (checkpoints.length === 0) return null;

        return (
            <div className="mt-8 rounded-3xl border border-[#002C4B]/15 bg-[#002C4B]/5 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ffbc03]">Reviewer overlay</p>
                        <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">Review controls for this section</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            These checks are separated from scoring inputs and are used for approval, governance, and handoff discipline.
                        </p>
                    </div>
                    {templateRule && (
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B] ring-1 ring-[#ffbc03]/40 dark:bg-slate-950 dark:text-[#ffcf45]">
                            {templateRule.label}
                        </span>
                    )}
                </div>

                <div className="mt-5 space-y-3">
                    {checkpoints.map(checkpoint => {
                        const checked = Boolean(assessment.review?.checkpoints?.[checkpoint.id]);
                        return (
                            <button
                                key={checkpoint.id}
                                type="button"
                                onClick={() => updateReviewerCheckpoint(checkpoint.id, !checked)}
                                className={`w-full rounded-2xl border p-4 text-left transition-all ${checked ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] dark:text-[#ffcf45]' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-black">{checkpoint.label}</div>
                                        <p className="mt-1 text-xs font-semibold leading-5 opacity-75">{checkpoint.description}</p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${checked ? 'bg-[#002C4B] text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-900'}`}>
                                        {checked ? 'Done' : checkpoint.requiredFor || 'Check'}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <textarea
                    value={assessment.review?.reviewerNotes?.[section] || ''}
                    onChange={(event) => updateReviewerNote(section, event.target.value)}
                    placeholder="Reviewer notes, override rationale, missing evidence, or approval conditions for this section."
                    className="mt-4 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                />
                <div className="mt-4 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="text-sm font-black text-[#002C4B] dark:text-white">Reviewer thread</h4>
                            <p className="text-xs font-semibold text-slate-500">Structured comments stay separate from scoring and travel into approval history.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900">
                            {(assessment.review?.comments || []).filter(comment => comment.section === section).length} comments
                        </span>
                    </div>
                    <div className="mt-3 space-y-2">
                        {(assessment.review?.comments || [])
                            .filter(comment => comment.section === section)
                            .map(comment => (
                                <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs font-black text-[#002C4B] dark:text-[#ffcf45]">{comment.type}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                            {comment.authorName || comment.authorId} / {new Date(comment.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">{comment.message}</p>
                                </div>
                            ))}
                        {(assessment.review?.comments || []).filter(comment => comment.section === section).length === 0 && (
                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                                No reviewer comments yet.
                            </p>
                        )}
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <textarea
                            value={reviewCommentDrafts[section] || ''}
                            onChange={(event) => setReviewCommentDrafts(prev => ({ ...prev, [section]: event.target.value }))}
                            placeholder="Add a threaded reviewer comment or evidence request."
                            className="min-h-20 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                            type="button"
                            onClick={() => addReviewComment(section)}
                            className="rounded-xl bg-[#002C4B] px-4 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#003c66] sm:self-end"
                        >
                            Add Comment
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderMetadataScale = (field: 'stakeholderCoverage' | 'evidenceQuality' | 'assumptionQuality', label: string, desc: string, labels: string[]) => {
        if (!assessment) return null;
        const val = assessment.metadata[field];
        return (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/88 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                <label className="block text-sm font-black text-slate-900 dark:text-white">{label}</label>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{desc}</p>
                <div className="mt-4 flex gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                        <button
                            key={num}
                            onClick={() => updateMetadata(field, num)}
                            className={`flex-1 rounded-xl border py-2 text-sm font-black transition-all ${val === num
                                ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] shadow-sm dark:text-[#ffcf45]'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                            }`}
                        >
                            {num}
                            <span className="mt-0.5 block text-[10px] font-bold opacity-70">{labels[num - 1]}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    if (processUnavailable) {
        return (
            <div className="p-8 text-center">
                <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-[11px] font-black uppercase tracking-normal text-slate-400">Assessment unavailable</p>
                    <h1 className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">This process is not available in the current organization context.</h1>
                    <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Return to the process catalog and select an available process before opening guided assessment.</p>
                    <button onClick={onExit} className="mt-6 rounded-lg bg-[#ffbc03] px-5 py-3 text-sm font-black text-[#002C4B]">
                        Back to Process Catalog
                    </button>
                </div>
            </div>
        );
    }

    if (!assessment || !currentOrganization) return <div className="p-8">Loading Assessment...</div>;

    const currentProcess = getProcessById(processId, currentOrganization.id);
    const activeSection = SECTIONS.find(s => s.key === currentSection);
    const progressPercent = assessment.scores ? 100 : Math.round(((Math.max(currentSectionIndex, 0) + 1) / SECTIONS.length) * 100);
    const visibleQuestions = assessment ? getAssessQuestionsForSection(currentSection, assessment) : [];
    const fieldOptions = getAssessFieldOptions(assessment);
    const currentTemplateRule = getAssessTemplateRuleFromConfig(currentProcess?.templateId, assessGovernanceConfig);
    const isLockedAssessment = LOCKED_ASSESSMENT_STATUSES.has(assessment.status);
    const governCard = assessment.scores && currentProcess ? buildAvalaGovernLiteCard(assessment, currentProcess) : null;

    const addEvidenceItem = () => {
        if (!evidenceDraft.description.trim()) {
            setErrorMsg('Evidence needs a short description before it can be added.');
            return;
        }
        if (assessGovernanceConfig.evidencePolicy.requireOwnerOnEvidence && !evidenceDraft.owner.trim()) {
            setErrorMsg('Evidence owner is required by the workspace governance policy.');
            return;
        }
        setAssessment(prev => prev ? {
            ...prev,
            evidenceItems: [
                ...prev.evidenceItems,
                {
                    id: `ev-${Date.now()}`,
                    type: evidenceDraft.type,
                    description: evidenceDraft.description.trim(),
                    owner: evidenceDraft.owner.trim() || undefined,
                    sensitivity: evidenceDraft.sensitivity,
                    linkedField: evidenceDraft.linkedField || undefined,
                },
            ],
        } : prev);
        setEvidenceDraft({ type: 'SOP', linkedField: '', description: '', owner: '', sensitivity: 'Internal' });
        setErrorMsg(null);
    };

    const addAssumptionItem = () => {
        if (!assumptionDraft.description.trim()) {
            setErrorMsg('Assumption needs a short description before it can be added.');
            return;
        }
        if (assessGovernanceConfig.evidencePolicy.requireOwnerOnAssumptions && !assumptionDraft.owner.trim()) {
            setErrorMsg('Assumption owner is required by the workspace governance policy.');
            return;
        }
        const defaultReviewDate = new Date(Date.now() + assessGovernanceConfig.evidencePolicy.assumptionReviewDaysDefault * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        setAssessment(prev => prev ? {
            ...prev,
            assumptions: [
                ...prev.assumptions,
                {
                    id: `as-${Date.now()}`,
                    category: assumptionDraft.category,
                    description: assumptionDraft.description.trim(),
                    confidence: assumptionDraft.confidence,
                    owner: assumptionDraft.owner.trim() || undefined,
                    reviewDate: assumptionDraft.reviewDate || defaultReviewDate,
                    linkedField: assumptionDraft.linkedField || undefined,
                },
            ],
        } : prev);
        setAssumptionDraft({ category: 'Volume', description: '', confidence: 3, owner: '', reviewDate: '', linkedField: '' });
        setErrorMsg(null);
    };

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-800 dark:text-slate-200">
            {/* Unsaved Modal */}
            {showUnsavedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold mb-2">Unsaved Changes</h3>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">You have unsaved work. Do you want to save your draft before leaving?</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowUnsavedModal(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                            <button onClick={confirmDiscardAndExit} className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors font-medium">Discard Changes</button>
                            <button onClick={confirmSaveAndExit} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium shadow-sm">Save Draft & Exit</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar Navigation */}
            <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 flex flex-col h-full z-10 shadow-sm relative">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                    <button onClick={() => attemptExit(onExit)} className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-slate-500 transition-colors hover:text-[#002C4B] dark:hover:text-slate-200">
                        Back to Process
                    </button>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Assess</p>
                    <h2 className="mt-1 text-xl font-black text-[#002C4B] dark:text-white leading-tight">Decision Intake</h2>
                    <p className="text-xs font-medium text-slate-500 mt-1 truncate">{currentProcess?.name}</p>
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                            <span>Completion</span>
                            <span>{progressPercent}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div className="h-full rounded-full bg-[#ffbc03]" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {assessment.scores && (
                        <button
                            onClick={() => handleSectionChange(COMPLETED_SECTION_KEY)}
                            className={`mb-4 w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition-all ${currentSection === COMPLETED_SECTION_KEY ? 'border-[#ffbc03]/70 bg-[#ffbc03]/15 text-[#002C4B] shadow-sm dark:text-[#ffcf45]' : 'border-slate-200 bg-white text-slate-700 hover:border-[#ffbc03]/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}
                        >
                            Decision Cockpit
                        </button>
                    )}
                    {SECTIONS.map((sec, index) => (
                        <button
                            key={sec.key}
                            onClick={() => handleSectionChange(sec.key)}
                            className={`w-full rounded-2xl px-4 py-3 text-left transition-all ${currentSection === sec.key ? 'bg-[#002C4B] text-white shadow-lg shadow-[#002C4B]/15' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900'}`}
                        >
                            <span className={`block text-[10px] font-black uppercase tracking-[0.14em] ${currentSection === sec.key ? 'text-[#ffbc03]' : 'text-slate-400'}`}>Step {index + 1}</span>
                            <span className="mt-1 block text-sm font-black">{sec.label}</span>
                        </button>
                    ))}
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50 dark:bg-slate-950">
                    {!assessment.scores ? (
                        <>
                            <button 
                                onClick={handleSaveDraft}
                                className={`w-full rounded-xl py-2.5 font-black transition-all shadow-sm ${isDirty ? 'bg-[#002C4B] text-white shadow-[#002C4B]/20' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}
                            >
                                Save Draft {isDirty && '*'}
                            </button>
                            <button 
                                onClick={handleComplete}
                                className="w-full rounded-xl bg-[#ffbc03] py-2.5 font-black text-[#002C4B] shadow-sm transition-colors hover:bg-[#f3ad00]"
                            >
                                Calculate deterministic score
                            </button>
                        </>
                    ) : (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center dark:border-emerald-800/50 dark:bg-emerald-900/20">
                            <p className="text-sm font-black text-emerald-700 dark:text-emerald-400">Assessed & Scored</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Main Form Area */}
            <div className="flex-1 overflow-y-auto p-8 lg:px-16 xl:px-24 bg-slate-50/50 dark:bg-slate-900/50 pb-32">
                <div className="max-w-3xl mx-auto space-y-8">
                    
                    {errorMsg && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg shadow-sm font-medium">
                            {errorMsg}
                        </div>
                    )}

                    {currentSection === COMPLETED_SECTION_KEY && assessment.scores ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                            <div className="premium-surface rounded-2xl p-6">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-normal text-slate-400">Decision cockpit</p>
                                        <h1 className="mt-1 text-3xl font-black font-display text-slate-900 dark:text-white">
                                            {assessment.scores.recommendation?.category || 'Deterministic Recommendation'}
                                        </h1>
                                        <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                                            {assessment.scores.decisionPack?.executiveSummary}
                                        </p>
                                        <p className="mt-2 text-xs font-semibold text-slate-400">
                                            Score version {assessment.scores.scoreVersion} / evaluated {new Date(assessment.scores.calculatedAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-center">
                                        <div className="rounded-2xl bg-[#002C4B] px-4 py-3 text-white">
                                            <div className="text-xl font-black">{assessment.scores.supportingScores.confidence}%</div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-80">Confidence</div>
                                        </div>
                                        <div className="rounded-2xl bg-[#ffbc03] px-4 py-3 text-[#002C4B]">
                                            <div className="text-xl font-black">{assessment.scores.riskTier}</div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-80">Risk tier</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <div className="card p-5 xl:col-span-2">
                                    <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Operating model</h3>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        {[
                                            ['Primary', assessment.scores.recommendation?.primaryTechnology],
                                            ['Secondary', assessment.scores.recommendation?.secondaryTechnology || 'None'],
                                            ['Execution layer', assessment.scores.recommendation?.executionLayer],
                                            ['Control layer', assessment.scores.recommendation?.controlLayer],
                                            ['Governance', assessment.scores.recommendation?.governanceLayer],
                                            ['Handoff', assessment.scores.handoffEligibility],
                                        ].map(([label, value]) => (
                                            <div key={label} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
                                                <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Lifecycle actions</h3>
                                    {isLockedAssessment && (
                                        <div className="mt-4 rounded-2xl border border-[#ffbc03]/40 bg-[#ffbc03]/10 p-3">
                                            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#002C4B]">Locked decision</div>
                                            <p className="mt-1 text-xs font-semibold leading-5 text-[#002C4B]/75">
                                                {assessment.review?.lockReason || assessment.status}
                                                {assessment.review?.lockedAt ? ` / ${new Date(assessment.review.lockedAt).toLocaleString()}` : ''}
                                            </p>
                                        </div>
                                    )}
                                    <textarea
                                        value={statusReasonDraft}
                                        onChange={(event) => setStatusReasonDraft(event.target.value)}
                                        placeholder="Decision reason, approval condition, override rationale, or handoff note."
                                        className="mt-4 min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                        Reason required for changes, rejection, and governance/no-go approval overrides.
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        <button disabled={isLockedAssessment} onClick={() => runStatusAction(submitForReview, 'Assessment sent for review.', 'submit')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-primary disabled:cursor-not-allowed disabled:opacity-50">Send for Review</button>
                                        <button disabled={isLockedAssessment} onClick={() => runStatusAction(approveAssessment, 'Assessment approved.', 'approve')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Approve</button>
                                        <button disabled={isLockedAssessment} onClick={() => runStatusAction(requestChanges, 'Changes requested.', 'changes')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Request Changes</button>
                                        <button disabled={isLockedAssessment} onClick={() => runStatusAction(rejectAssessment, 'Assessment rejected.', 'reject')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Reject</button>
                                        <button disabled={isLockedAssessment && assessment.status !== 'Approved'} onClick={() => runStatusAction(markHandedOffToDocs, 'Docs handoff snapshot generated.', 'docs')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Record Studio handoff snapshot</button>
                                        <button disabled={isLockedAssessment && assessment.status !== 'Approved'} onClick={() => runStatusAction(markHandedOffToDelivery, 'Delivery handoff snapshot generated.', 'delivery')} className="w-full rounded-xl px-4 py-2 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Record Delivery handoff snapshot</button>
                                    </div>
                                    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Decision Pack export</p>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => handleExportDecisionPack('json')}
                                                disabled={Boolean(exportingDecisionPack)}
                                                className="rounded-xl px-3 py-2 text-xs font-black btn-ghost disabled:cursor-wait disabled:opacity-60"
                                            >
                                                {exportingDecisionPack === 'json' ? 'Exporting...' : 'JSON'}
                                            </button>
                                            <button
                                                onClick={() => handleExportDecisionPack('markdown')}
                                                disabled={Boolean(exportingDecisionPack)}
                                                className="rounded-xl px-3 py-2 text-xs font-black btn-ghost disabled:cursor-wait disabled:opacity-60"
                                            >
                                                {exportingDecisionPack === 'markdown' ? 'Exporting...' : 'Markdown'}
                                            </button>
                                        </div>
                                        <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-400">
                                            Demo mode downloads locally. Pilot mode uses server-side export storage.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {governCard && <AvalaGovernLiteCardPanel governCard={governCard} />}

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div className="card p-5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Approval history</h3>
                                    <div className="mt-4 space-y-3">
                                        {(assessment.review?.approvalHistory || []).map(event => (
                                            <div key={event.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-sm font-black text-[#002C4B] dark:text-white">{event.status}</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                                        {event.actorName || event.actorId} / {new Date(event.createdAt).toLocaleString()}
                                                    </span>
                                                </div>
                                                {event.reason && <p className="mt-1 text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">{event.reason}</p>}
                                            </div>
                                        ))}
                                        {(assessment.review?.approvalHistory || []).length === 0 && (
                                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                                                No lifecycle decisions recorded yet.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-400">Reviewer comments</h3>
                                    <div className="mt-4 space-y-3">
                                        {(assessment.review?.comments || []).slice().reverse().map(comment => (
                                            <div key={comment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-xs font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-[#ffcf45]">
                                                        {comment.type}{comment.section ? ` / ${SECTIONS.find(section => section.key === comment.section)?.label || comment.section}` : ''}
                                                    </span>
                                                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                                        {comment.authorName || comment.authorId} / {new Date(comment.createdAt).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">{comment.message}</p>
                                            </div>
                                        ))}
                                        {(assessment.review?.comments || []).length === 0 && (
                                            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                                                Comments added from section overlays and lifecycle actions will appear here.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                <div className="card p-5">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Why this</h4>
                                    <ul className="mt-3 space-y-2">
                                        {assessment.scores.recommendation?.whyThis.map(item => <li key={item} className="text-sm font-semibold text-slate-600 dark:text-slate-300">{item}</li>)}
                                    </ul>
                                </div>
                                <div className="card p-5">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Why not others</h4>
                                    <ul className="mt-3 space-y-2">
                                        {assessment.scores.recommendation?.whyNotOthers.map(item => <li key={item} className="text-sm font-semibold text-slate-600 dark:text-slate-300">{item}</li>)}
                                    </ul>
                                </div>
                                <div className="card p-5">
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Next actions</h4>
                                    <ul className="mt-3 space-y-2">
                                        {assessment.scores.recommendation?.nextActions.map(item => <li key={item} className="text-sm font-semibold text-slate-600 dark:text-slate-300">{item}</li>)}
                                    </ul>
                                </div>
                            </div>
                            <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                                <h1 className="text-3xl font-bold font-display text-slate-900 dark:text-white">Deterministic Scoring Results</h1>
                                <p className="text-sm text-slate-500 mt-2">Engine Version: {assessment.scores.scoreVersion} • Evaluated: {new Date(assessment.scores.calculatedAt).toLocaleString()}</p>
                            </div>

                            {assessment.scores.gatesTriggered.length > 0 && (
                                <div className="p-6 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl">
                                    <h3 className="text-lg font-bold text-red-900 dark:text-red-400 mb-2 flex items-center gap-2">🛑 Hard Stop Gates Triggered</h3>
                                    <p className="text-sm text-red-700 dark:text-red-300 mb-4">This process hit critical rule violations and is gated from final automation routing.</p>
                                    <ul className="list-disc pl-5 space-y-1 mb-4">
                                        {assessment.scores.gatesTriggered.map((gate, i) => (
                                            <li key={i} className="text-sm font-semibold text-red-800 dark:text-red-200">{gate}</li>
                                        ))}
                                    </ul>
                                    <div className="inline-block px-3 py-1 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 text-xs font-bold rounded">
                                        Primary Outcome: {assessment.scores.primaryGatingOutcome}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Technical Fit Scores (0-100)</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-sm font-medium mb-1"><span>RPA Fit</span><span>{assessment.scores.techFitScores.RPA}</span></div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${assessment.scores.techFitScores.RPA}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm font-medium mb-1"><span>Workflow Fit</span><span>{assessment.scores.techFitScores.Workflow}</span></div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{width: `${assessment.scores.techFitScores.Workflow}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm font-medium mb-1"><span>GenAI Fit</span><span>{assessment.scores.techFitScores.GenAI}</span></div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width: `${assessment.scores.techFitScores.GenAI}%`}}></div></div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm font-medium mb-1"><span>Agentic Fit</span><span>{assessment.scores.techFitScores.Agentic}</span></div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{width: `${assessment.scores.techFitScores.Agentic}%`}}></div></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Control & Confidence</h4>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                                            <span className="text-sm font-medium">Data Confidence</span>
                                            <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{assessment.scores.supportingScores.confidence}%</span>
                                        </div>
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                                            <span className="text-sm font-medium">Raw Value Potential</span>
                                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{assessment.scores.supportingScores.rawValue} pts</span>
                                        </div>
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                                            <span className="text-sm font-medium">Annual Manual Effort</span>
                                            <span className="text-lg font-bold text-slate-700 dark:text-slate-300">{assessment.scores.supportingScores.annualManualEffortHours?.toLocaleString() || '0'} hrs</span>
                                        </div>
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                                            <span className="text-sm font-medium">Estimated Annual Savings</span>
                                            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">${assessment.scores.supportingScores.estimatedAnnualSavings?.toLocaleString() || '0'}</span>
                                        </div>
                                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
                                            <span className="text-sm font-medium">Net First-Year Savings</span>
                                            <span className="text-lg font-bold text-slate-700 dark:text-slate-300">${assessment.scores.supportingScores.estimatedNetFirstYearSavings?.toLocaleString() || '0'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Mandatory Logic HITL</span>
                                            <span className={`px-2 py-1 text-xs font-bold rounded ${assessment.scores.supportingScores.mandatoryHITL ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                {assessment.scores.supportingScores.mandatoryHITL ? 'REQUIRED' : 'OPTIONAL'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-8 rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">
                                    Assess / Step {currentSectionIndex + 1}
                                </p>
                                <h1 className="mt-2 text-3xl font-black font-display text-[#002C4B] dark:text-white">{activeSection?.label}</h1>
                                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{activeSection?.description}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {activeSection?.outputs.map(output => (
                                        <span key={output} className="rounded-full border border-[#ffbc03]/40 bg-[#ffbc03]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#002C4B] dark:text-[#ffcf45]">
                                            {output}
                                        </span>
                                    ))}
                                </div>
                            </div>

                    {currentSection !== 'evidenceAndAssumptions' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            {currentTemplateRule && (
                                <div className="rounded-3xl border border-[#ffbc03]/40 bg-[#ffbc03]/10 p-5 shadow-sm">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#002C4B]/70">Template guidance</p>
                                    <h3 className="mt-1 text-lg font-black text-[#002C4B]">{currentTemplateRule.label}</h3>
                                    <p className="mt-2 text-sm font-semibold leading-6 text-[#002C4B]/75">{currentTemplateRule.focus}</p>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {visibleQuestions
                                            .filter(question => currentTemplateRule.priorityFields.includes(`${question.section}.${question.field}`))
                                            .map(question => (
                                                <span key={`${question.section}.${question.field}`} className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B] ring-1 ring-[#ffbc03]/40">
                                                    Priority: {question.label}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {visibleQuestions.map(question => (
                                <React.Fragment key={`${question.section}.${question.field}`}>
                                    {renderQuestion(question)}
                                </React.Fragment>
                            ))}
                            {renderReviewerOverlay(currentSection)}
                        </div>
                    )}

                    {currentSection === 'evidenceAndAssumptions' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                            <div className="grid gap-4 lg:grid-cols-3">
                                {renderMetadataScale('stakeholderCoverage', 'Stakeholder Coverage', 'How well have the process owner, BA, delivery lead, and risk stakeholders validated this assessment?', ['Single view', 'Limited', 'Partial', 'Covered', 'Validated'])}
                                {renderMetadataScale('evidenceQuality', 'Evidence Quality', 'How strong is the supporting evidence behind the scoring inputs?', ['None', 'Weak', 'Useful', 'Strong', 'Audit-ready'])}
                                {renderMetadataScale('assumptionQuality', 'Assumption Quality', 'How reliable are the assumptions used for effort, volume, value, and risk?', ['Unclear', 'Weak', 'Reasonable', 'Strong', 'Validated'])}
                            </div>

                            {renderMetadataToggle('templateFit', 'Assessment Template Fit', 'The selected template or template pack matches this process family closely enough to improve confidence.')}

                            <div className="rounded-2xl border border-[#002C4B]/15 bg-[#002C4B]/5 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#002C4B]/70 dark:text-[#ffcf45]">Workspace governance policy</p>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    {[
                                        `Minimum evidence for approval: ${assessGovernanceConfig.evidencePolicy.minEvidenceItemsForApproval}`,
                                        assessGovernanceConfig.evidencePolicy.requireOwnerOnEvidence ? 'Evidence owner required' : 'Evidence owner optional',
                                        assessGovernanceConfig.evidencePolicy.requireOwnerOnAssumptions ? 'Assumption owner required' : 'Assumption owner optional',
                                        `Assumption review default: ${assessGovernanceConfig.evidencePolicy.assumptionReviewDaysDefault} days`,
                                    ].map(item => (
                                        <div key={item} className="rounded-xl border border-white/70 bg-white/75 px-3 py-2 text-xs font-black text-[#002C4B] shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                            {item}
                                        </div>
                                    ))}
                                </div>
                                {currentTemplateRule && assessGovernanceConfig.evidencePolicy.requireLinkedEvidenceForProtectedFields && (
                                    <p className="mt-3 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                                        Template focus evidence is expected for: {currentTemplateRule.evidenceFields.join(', ')}.
                                    </p>
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <h3 className="text-lg font-black text-[#002C4B] dark:text-white">Supporting Evidence</h3>
                                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">Attach or describe evidence that supports the decision pack: SOPs, process maps, sample transactions, screenshots, reports, logs, policies, or meeting transcripts.</p>
                                
                                <div className="mb-5 mt-5 grid gap-3 md:grid-cols-2">
                                    <select
                                        value={evidenceDraft.type}
                                        onChange={(event) => setEvidenceDraft(prev => ({ ...prev, type: event.target.value as EvidenceItem['type'] }))}
                                        className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        {assessGovernanceConfig.evidenceTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                    <select
                                        value={evidenceDraft.linkedField}
                                        onChange={(event) => setEvidenceDraft(prev => ({ ...prev, linkedField: event.target.value }))}
                                        className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        <option value="">Link to assessment field</option>
                                        {fieldOptions.map(field => <option key={field.id} value={field.id}>{field.section} / {field.label}</option>)}
                                    </select>
                                    <input
                                        value={evidenceDraft.owner}
                                        onChange={(event) => setEvidenceDraft(prev => ({ ...prev, owner: event.target.value }))}
                                        placeholder="Evidence owner"
                                        className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <select
                                        value={evidenceDraft.sensitivity}
                                        onChange={(event) => setEvidenceDraft(prev => ({ ...prev, sensitivity: event.target.value as NonNullable<EvidenceItem['sensitivity']> }))}
                                        className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        {['Public', 'Internal', 'Confidential', 'Restricted'].map(level => <option key={level} value={level}>{level}</option>)}
                                    </select>
                                    <textarea
                                        value={evidenceDraft.description}
                                        onChange={(event) => setEvidenceDraft(prev => ({ ...prev, description: event.target.value }))}
                                        placeholder="Describe evidence or paste a link. Example: AP SOP v4, SharePoint process map, sampled invoice exceptions report."
                                        className="min-h-24 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] md:col-span-2 dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <button onClick={addEvidenceItem} className="rounded-xl bg-[#002C4B] px-4 py-2 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#003c66] md:col-span-2">
                                        Add Linked Evidence
                                    </button>
                                </div>

                                <div className="space-y-3 mb-4">
                                    {assessment.evidenceItems.map(ev => (
                                        <div key={ev.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">{ev.type}</span>
                                                <span className="text-sm font-medium">{ev.description}</span>
                                                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                                    {ev.linkedField && <span>Field: {fieldOptions.find(field => field.id === ev.linkedField)?.label || ev.linkedField}</span>}
                                                    {ev.owner && <span>Owner: {ev.owner}</span>}
                                                    {ev.sensitivity && <span>{ev.sensitivity}</span>}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setAssessment(prev => prev ? {...prev, evidenceItems: prev.evidenceItems.filter(e => e.id !== ev.id)} : prev)}
                                                className="text-red-500 hover:text-red-700 text-sm font-semibold"
                                            >Remove</button>
                                        </div>
                                    ))}
                                    {assessment.evidenceItems.length === 0 && <p className="text-sm text-slate-500 italic">No evidence added yet.</p>}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[#ffbc03]/40 bg-[#ffbc03]/10 p-6 shadow-sm dark:bg-[#ffbc03]/10">
                                <h3 className="text-lg font-black text-[#002C4B] dark:text-[#ffcf45]">Key Assumptions</h3>
                                <p className="mt-1 text-sm font-semibold leading-6 text-[#002C4B]/75 dark:text-slate-300">Capture assumptions used in the decision. Unvalidated assumptions should remain visible because they reduce confidence and may become review actions.</p>
                                
                                <div className="mb-5 mt-5 grid gap-3 md:grid-cols-2">
                                    <select
                                        value={assumptionDraft.category}
                                        onChange={(event) => setAssumptionDraft(prev => ({ ...prev, category: event.target.value as Assumption['category'] }))}
                                        className="rounded-xl border border-[#ffbc03]/40 bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        {assessGovernanceConfig.assumptionCategories.map(category => <option key={category} value={category}>{category}</option>)}
                                    </select>
                                    <select
                                        value={assumptionDraft.linkedField}
                                        onChange={(event) => setAssumptionDraft(prev => ({ ...prev, linkedField: event.target.value }))}
                                        className="rounded-xl border border-[#ffbc03]/40 bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    >
                                        <option value="">Link to assessment field</option>
                                        {fieldOptions.map(field => <option key={field.id} value={field.id}>{field.section} / {field.label}</option>)}
                                    </select>
                                    <input
                                        value={assumptionDraft.owner}
                                        onChange={(event) => setAssumptionDraft(prev => ({ ...prev, owner: event.target.value }))}
                                        placeholder="Assumption owner"
                                        className="rounded-xl border border-[#ffbc03]/40 bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <input
                                        type="date"
                                        value={assumptionDraft.reviewDate}
                                        onChange={(event) => setAssumptionDraft(prev => ({ ...prev, reviewDate: event.target.value }))}
                                        className="rounded-xl border border-[#ffbc03]/40 bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.12em] text-[#002C4B]/70 dark:text-[#ffcf45]">Assumption confidence: {assumptionDraft.confidence}/5</label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="5"
                                            value={assumptionDraft.confidence}
                                            onChange={(event) => setAssumptionDraft(prev => ({ ...prev, confidence: parseInt(event.target.value) }))}
                                            className="mt-2 w-full accent-[#ffbc03]"
                                        />
                                    </div>
                                    <textarea
                                        value={assumptionDraft.description}
                                        onChange={(event) => setAssumptionDraft(prev => ({ ...prev, description: event.target.value }))}
                                        placeholder="Describe the assumption. Example: invoice volume estimated from last quarter's AP report and expected to grow 10%."
                                        className="min-h-24 rounded-xl border border-[#ffbc03]/40 bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] md:col-span-2 dark:border-slate-700 dark:bg-slate-950"
                                    />
                                    <button onClick={addAssumptionItem} className="rounded-xl bg-[#ffbc03] px-4 py-2 text-sm font-black text-[#002C4B] shadow-sm transition-colors hover:bg-[#f3ad00] md:col-span-2">
                                        Add Linked Assumption
                                    </button>
                                </div>

                                <div className="space-y-3 mb-4">
                                    {assessment.assumptions.map(assumption => (
                                        <div key={assumption.id} className="flex items-center justify-between rounded-xl border border-[#ffbc03]/30 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                                            <div>
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">{assumption.category}</span>
                                                <span className="text-sm font-medium">{assumption.description}</span>
                                                <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                                    {assumption.linkedField && <span>Field: {fieldOptions.find(field => field.id === assumption.linkedField)?.label || assumption.linkedField}</span>}
                                                    {assumption.owner && <span>Owner: {assumption.owner}</span>}
                                                    {assumption.confidence && <span>Confidence {assumption.confidence}/5</span>}
                                                    {assumption.reviewDate && <span>Review {assumption.reviewDate}</span>}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setAssessment(prev => prev ? {...prev, assumptions: prev.assumptions.filter(a => a.id !== assumption.id)} : prev)}
                                                className="text-red-500 hover:text-red-700 text-sm font-semibold"
                                            >Remove</button>
                                        </div>
                                    ))}
                                    {assessment.assumptions.length === 0 && <p className="text-sm text-slate-500 italic">No assumptions recorded.</p>}
                                </div>
                            </div>
                            
                            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <h3 className="text-lg font-black text-[#002C4B] dark:text-white">Handoff Readiness Preview</h3>
                                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">After deterministic scoring, AvalaOS records a Docs and Delivery handoff pack for human review.</p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    {['BRD / PRD / PDD candidates', 'Risk and control matrix', 'Backlog seed items', 'Open questions for reviewers'].map(item => (
                                        <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {renderReviewerOverlay('evidenceAndAssumptions')}
                        </div>
                    )}
                    </>
                    )}

                    {!assessment.scores && currentSection !== COMPLETED_SECTION_KEY && (
                        <div className="flex justify-between items-center py-6 mt-8 border-t border-slate-200 dark:border-slate-800">
                            {currentSectionIndex > 0 ? (
                                <button onClick={handlePrev} className="rounded-xl bg-slate-200 px-6 py-2.5 font-black text-slate-700 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                    Previous
                                </button>
                            ) : <div></div>}
                            
                            {currentSectionIndex < SECTIONS.length - 1 ? (
                                <button onClick={handleNext} className="rounded-xl bg-[#002C4B] px-8 py-2.5 font-black text-white shadow-sm transition-colors hover:bg-[#003c66]">
                                    Save & Continue
                                </button>
                            ) : (
                                <button onClick={handleComplete} className="rounded-xl bg-[#ffbc03] px-8 py-2.5 font-black text-[#002C4B] shadow-sm transition-colors hover:bg-[#f3ad00]">
                                    Calculate deterministic score
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GuidedAssessmentView;
