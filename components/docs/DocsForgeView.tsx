import React, { useState } from 'react';
import LandingPage from '../shared/LandingPage';
import ProcessingView from '../assess/ProcessingView';
import { aiOrchestrator } from '../../services/aiOrchestrator';
import { GeneratedArtifacts, ProjectDetails, DocTemplate, Project, AiProviderType, AssessToStudioHandoffPayload } from '../../types';
import type { ProductActionDecision } from '../../services/productActionPolicy';
import {
    attachAssessToStudioSourceContext,
    getAssessToStudioSourceContextSummary,
    renderAssessToStudioSourceContext,
} from '../../services/assessToStudioHandoff';

interface DocsForgeViewProps {
    project: Project | null;
    docTemplates: DocTemplate[];
    onCancel: () => void;
    onComplete: (projectDetails: ProjectDetails, artifacts: GeneratedArtifacts) => void;
    aiProviderType: AiProviderType;
    onAiProviderTypeChange: (provider: AiProviderType) => void;
    sourceContext?: AssessToStudioHandoffPayload | null;
    generationDecision?: ProductActionDecision;
}

const DocsForgeView: React.FC<DocsForgeViewProps> = ({ project, docTemplates, onCancel, onComplete, aiProviderType, onAiProviderTypeChange, sourceContext, generationDecision }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const sourceSummary = getAssessToStudioSourceContextSummary(sourceContext);

    const handleProjectCreate = async (projectDetails: ProjectDetails, file: File | null) => {
        if (generationDecision && !generationDecision.allowed) {
            alert(generationDecision.message);
            return;
        }
        setIsProcessing(true);
        
        try {
            let fileContent: string | null = null;
            if (file) {
                fileContent = await file.text();
            }
            const assessSourceContent = sourceContext ? renderAssessToStudioSourceContext(sourceContext) : null;
            const combinedSourceContent = [assessSourceContent, fileContent].filter(Boolean).join('\n\n');
            const sourceFileName = sourceContext
                ? file
                    ? `${sourceContext.sourceLabel} + ${file.name}`
                    : `${sourceContext.sourceLabel}.md`
                : file?.name || "N/A";
        
            const artifacts = await aiOrchestrator.generateArtifacts(
                aiProviderType, 
                projectDetails, 
                combinedSourceContent || null,
                sourceFileName
            );
            onComplete(projectDetails, attachAssessToStudioSourceContext(artifacts, sourceContext));

        } catch (err: any) {
            const errorMessage = "Avala Studio could not complete generation with the selected settings. Review the source context, draft provider settings, and workspace configuration before trying again.";
            console.error("Error generating artifacts:", err);
            alert(errorMessage);
            setIsProcessing(false);
        }
    };

    if (isProcessing) {
        return <ProcessingView />;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            {sourceSummary && (
                <div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-50">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">Avala Assess source context</p>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-lg font-black">{sourceSummary.title}</h2>
                            <p className="mt-1 text-sm font-semibold leading-6 opacity-80">{sourceSummary.subtitle}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                            {sourceSummary.chips.slice(0, 4).map(chip => (
                                <span key={chip} className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-emerald-800 ring-1 ring-emerald-200 dark:bg-white/10 dark:text-emerald-100 dark:ring-white/10">
                                    {chip}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm font-semibold sm:grid-cols-3">
                        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-emerald-100 dark:bg-white/10 dark:ring-white/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Evidence refs</p>
                            <p className="mt-1 text-xl font-black">{sourceSummary.evidenceCount}</p>
                        </div>
                        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-emerald-100 dark:bg-white/10 dark:ring-white/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Assumptions</p>
                            <p className="mt-1 text-xl font-black">{sourceSummary.assumptionCount}</p>
                        </div>
                        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-emerald-100 dark:bg-white/10 dark:ring-white/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">Document set</p>
                            <p className="mt-1 text-sm font-black">{sourceSummary.documentTypes.join(', ') || 'Template selected below'}</p>
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-semibold leading-5 opacity-75">
                        Studio will use this read-only Assess context as source evidence for editable review drafts that require human sign-off. Scores, gates, risk tiers, and recommendations remain owned by the deterministic assessment record and human review.
                    </p>
                </div>
            )}
            <LandingPage 
                docTemplates={docTemplates} 
                onProjectCreate={handleProjectCreate} 
                onCancel={onCancel} 
                aiProviderType={aiProviderType}
                onAiProviderTypeChange={onAiProviderTypeChange}
                sourceContext={sourceContext}
                canSubmit={generationDecision?.allowed ?? true}
                submitBlockedReason={generationDecision && !generationDecision.allowed ? generationDecision.message : undefined}
            />
        </div>
    );
};

export default DocsForgeView;
