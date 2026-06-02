import React, { useEffect, useState } from 'react';
import { useProcessService } from '../../services/processService';
import { useOrganization } from '../../services/organizationService';
import { useTemplateService } from '../../services/templateService';
import { useAssessmentService } from '../../services/assessmentService';
import { Assessment } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { isModuleEnabled } from '../../constants/moduleConfig';
import {
    ArrowLeftIcon,
    ChartPieIcon,
    CheckCircleIcon,
    ClipboardDocumentListIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
} from '../shared/icons';

interface ProcessDetailStubViewProps {
    processId: string;
    onBack: () => void;
    onStartAssessment: (id: string) => void;
    onGenerateDocs?: (payload: { processId: string; processName: string; assessmentId?: string; decision?: string }) => void;
}

const ProcessDetailStubView: React.FC<ProcessDetailStubViewProps> = ({ processId, onBack, onStartAssessment, onGenerateDocs }) => {
    const { currentOrganization } = useOrganization();
    const { currentOrganization: orgContext } = useOrganizationContext();
    const { processes, getProcessById, loading } = useProcessService();
    const { getTemplateById } = useTemplateService();
    const { getAssessmentForProcess } = useAssessmentService();
    const [assessment, setAssessment] = useState<Assessment | null>(null);
    const [assessmentLoading, setAssessmentLoading] = useState(false);

    useEffect(() => {
        let active = true;
        setAssessmentLoading(true);
        getAssessmentForProcess(processId)
            .then(result => {
                if (active) setAssessment(result);
            })
            .finally(() => {
                if (active) setAssessmentLoading(false);
            });
        return () => {
            active = false;
        };
    }, [getAssessmentForProcess, processId]);

    if (!currentOrganization) return null;

    const process = getProcessById(processId, currentOrganization.id);

    if (loading || processes.length === 0) {
        return <div className="p-8 text-center text-slate-500">Loading process...</div>;
    }

    if (!process) {
        return (
            <div className="p-8 text-center">
                <p>Process not found or you do not have permission.</p>
                <button onClick={onBack} className="mt-4 text-primary hover:underline">Go Back</button>
            </div>
        );
    }

    const template = process.templateId ? getTemplateById(process.templateId) : null;
    const scores = assessment?.scores;
    const docsEnabled = isModuleEnabled('docs', orgContext?.enabledModules);
    const topFit = scores?.techFitScores
        ? Object.entries(scores.techFitScores)
            .filter(([, value]) => typeof value === 'number')
            .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
        : null;

    const stats = [
        { label: 'Decision', value: scores?.gateDecision || 'In discovery', icon: CheckCircleIcon },
        { label: 'Best fit', value: topFit ? topFit[0] : 'Pending score', icon: SparklesIcon },
        { label: 'Risk tier', value: scores?.riskTier || process.criticality, icon: ExclamationTriangleIcon },
        { label: 'Confidence', value: scores?.confidenceBand || `${assessment?.metadata.completionQuality || 0}% complete`, icon: ChartPieIcon },
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6 pb-20">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm font-medium"
            >
                <ArrowLeftIcon className="w-4 h-4" /> Back to Catalog
            </button>

            <div className="premium-surface overflow-hidden rounded-3xl">
                <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
                    <div className="p-7">
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className="rounded-full bg-[#ffbc03]/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#002C4B] ring-1 ring-[#ffbc03]/35 dark:text-[#ffcf45]">
                                {assessment?.status || process.status}
                            </span>
                            {template && (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                    {template.family}
                                </span>
                            )}
                        </div>
                        <h1 className="max-w-4xl text-3xl font-black tracking-tight text-[#002C4B] dark:text-white md:text-4xl">{process.name}</h1>
                        <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-slate-600 dark:text-slate-300">{process.description || 'No description provided.'}</p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <button
                                onClick={() => onStartAssessment(process.id)}
                                className="rounded-xl bg-gradient-to-r from-[#002C4B] to-[#ffbc03] px-5 py-3 text-sm font-black text-white shadow-xl shadow-[#002C4B]/15 transition-transform hover:-translate-y-0.5"
                            >
                                {process.status === 'Not Started' ? 'Start Assessment' : process.status === 'Draft' || process.status === 'Changes Requested' ? 'Resume Assessment' : 'Open Decision Pack'}
                            </button>
                            {docsEnabled ? (
                                <button
                                    onClick={() => onGenerateDocs?.({
                                        processId: process.id,
                                        processName: process.name,
                                        assessmentId: assessment?.id,
                                        decision: scores?.gateDecision,
                                    })}
                                    className="rounded-xl px-5 py-3 text-sm font-black btn-ghost"
                                >
                                    Generate BRD / PDD
                                </button>
                            ) : (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-black text-slate-400 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-500">
                                    Docs module not enabled
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="border-t border-slate-200/80 bg-gradient-to-br from-[#002C4B] to-[#00192b] p-7 text-white lg:border-l lg:border-t-0 dark:border-slate-700/80">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Operating model</p>
                        <h2 className="mt-3 text-2xl font-black">{scores?.recommendation?.category || 'Assessment pending'}</h2>
                        <p className="mt-3 text-sm font-semibold leading-6 text-white/70">
                            {scores?.recommendation
                                ? `${scores.recommendation.primaryTechnology} with ${scores.recommendation.controlLayer}.`
                                : assessmentLoading ? 'Loading decision pack...' : 'Complete assessment scoring to generate the automation decision.'}
                        </p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Readiness</p>
                                <p className="mt-2 text-3xl font-black">{Math.round(scores?.supportingScores.handoffReadiness || assessment?.metadata.completionQuality || 0)}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">Priority</p>
                                <p className="mt-2 text-sm font-black leading-5 text-[#ffdf77]">{scores?.priorityTier?.replace('Tier ', 'T') || process.criticality}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="premium-surface rounded-2xl p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
                                <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">{value}</p>
                            </div>
                            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffbc03]/15 text-[#002C4B] dark:text-[#ffcf45]">
                                <Icon className="h-5 w-5" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {scores ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_0.75fr]">
                    <section className="premium-surface rounded-3xl p-6">
                        <div className="flex items-center gap-3">
                            <DocumentTextIcon className="h-5 w-5 text-[#ffbc03]" />
                            <h2 className="text-xl font-black text-slate-950 dark:text-white">Decision rationale</h2>
                        </div>
                        <div className="mt-6 grid gap-5 md:grid-cols-2">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">Why this model</p>
                                <ul className="mt-3 space-y-3">
                                    {scores.decisionPack?.whyThisRecommendation.map(item => (
                                        <li key={item} className="rounded-2xl bg-emerald-50/80 p-4 text-sm font-semibold leading-6 text-emerald-950 ring-1 ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-900/60">{item}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">Governance controls</p>
                                <ul className="mt-3 space-y-3">
                                    {scores.decisionPack?.governanceControls.map(item => (
                                        <li key={item} className="rounded-2xl bg-[#ffbc03]/10 p-4 text-sm font-semibold leading-6 text-[#002C4B] ring-1 ring-[#ffbc03]/25 dark:text-[#ffefb0]">{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section className="premium-surface rounded-3xl p-6">
                        <div className="flex items-center gap-3">
                            <ClipboardDocumentListIcon className="h-5 w-5 text-[#ffbc03]" />
                            <h2 className="text-xl font-black text-slate-950 dark:text-white">Handoff pack</h2>
                        </div>
                        <div className="mt-5 space-y-4">
                            <div className={`rounded-2xl p-4 ring-1 ${docsEnabled ? 'bg-emerald-50 text-emerald-950 ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-100 dark:ring-emerald-900/60' : 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-slate-800'}`}>
                                <p className="text-sm font-black">{docsEnabled ? 'Ready to generate requirements documents' : 'Docs handoff unavailable in this workspace'}</p>
                                <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
                                    {docsEnabled
                                        ? 'Use the approved decision pack as the source context for BRD, PRD, PDD, diagrams, and approval artifacts.'
                                        : 'Enable Docs in Settings to continue from assessment decision into document generation.'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Documents required</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {scores.handoffPack?.requiredDocumentTypes.map(docType => (
                                        <span key={docType} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800">{docType}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Backlog seeds</p>
                                <ul className="mt-3 space-y-2">
                                    {scores.handoffPack?.suggestedBacklogItems.slice(0, 4).map(item => (
                                        <li key={item.title} className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{item.title}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{item.type}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>
                </div>
            ) : (
                <div className="premium-surface rounded-3xl p-8 text-center">
                    <p className="text-lg font-black text-slate-950 dark:text-white">Decision pack not generated yet</p>
                    <p className="mx-auto mt-2 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">This process has discovery metadata, but it still needs a completed assessment before KlarityPM can recommend RPA, workflow, GenAI, agentic AI, or human-in-the-loop controls.</p>
                    <button onClick={() => onStartAssessment(process.id)} className="mt-5 rounded-xl bg-[#ffbc03] px-5 py-3 text-sm font-black text-[#002C4B] shadow-lg shadow-[#ffbc03]/20">
                        Continue Assessment
                    </button>
                </div>
            )}

            <section className="premium-surface rounded-3xl p-6">
                <h2 className="text-lg font-black text-slate-950 dark:text-white mb-4">Process metadata foundation</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/50 dark:ring-slate-800">
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Process ID</span>
                        <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{process.id}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/50 dark:ring-slate-800">
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Department</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{process.department || 'Not Specified'}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/50 dark:ring-slate-800">
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Owner User ID</span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{process.ownerId}</span>
                    </div>
                    <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/50 dark:ring-slate-800">
                        <span className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Criticality</span>
                        <span className={`text-sm font-black ${process.criticality === 'High' || process.criticality === 'Critical' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
                            {process.criticality}
                        </span>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ProcessDetailStubView;
