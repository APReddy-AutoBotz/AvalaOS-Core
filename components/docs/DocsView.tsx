import React from 'react';
import { DocumentGeneration, DocTemplate } from '../../types';
import { DocumentTextIcon, PlusCircleIcon, SparklesIcon } from '../shared/icons';

interface DocsViewProps {
    generations: DocumentGeneration[];
    templates: DocTemplate[];
    onViewGeneration: (generationId: string) => void;
    onCreateEpic?: (generation: DocumentGeneration) => void;
}

const getPrimaryDocTitle = (generation: DocumentGeneration, template?: DocTemplate): string => {
    if (!template) return "Generated Document";
    const doc = generation.artifacts[template.artifactKey];
    if (doc && 'title' in doc && doc.title && doc.title.trim() !== '' && !doc.title.includes("N/A")) {
        return doc.title;
    }
    return `Document Set (${template.title})`;
};

const DocsView: React.FC<DocsViewProps> = ({ generations, templates, onViewGeneration, onCreateEpic }) => {

    const sortedGenerations = [...generations].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    const artifactCount = generations.reduce((sum, generation) => sum + Object.keys(generation.artifacts || {}).length, 0);

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Governed document vault</p>
                    <h2 className="mt-1 text-3xl font-black text-slate-950 dark:text-white">Document Repository</h2>
                    <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500 dark:text-slate-400">Review generated BRD, PRD, PDD, and delivery artifacts with template traceability.</p>
                </div>
                <div className="flex gap-2">
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{generations.length} runs</span>
                    <span className="rounded-full bg-[#ffbc03]/15 px-3 py-1.5 text-xs font-black text-[#002C4B] ring-1 ring-[#ffbc03]/30 dark:bg-[#ffbc03]/10 dark:text-[#ffcf45] dark:ring-[#ffbc03]/20">{artifactCount} artifacts</span>
                </div>
            </div>

            {sortedGenerations.length === 0 ? (
                <div className="premium-surface rounded-2xl py-16 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ffbc03]/15 text-[#002C4B] ring-1 ring-[#ffbc03]/30 dark:bg-[#ffbc03]/10 dark:text-[#ffcf45] dark:ring-[#ffbc03]/20">
                        <SparklesIcon className="h-8 w-8" />
                    </div>
                    <h3 className="mt-5 text-lg font-black text-slate-950 dark:text-white">No documents yet</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Use Avala Studio to draft the first governed document set from reviewed source context.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedGenerations.map(gen => {
                        const template = templates.find(t => t.id === gen.templateId);
                        const title = getPrimaryDocTitle(gen, template);
                        const generatedDate = new Date(gen.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                        const artifacts = Object.keys(gen.artifacts || {}).length;
                        return (
                            <div key={gen.id} className="card flex min-h-[230px] flex-col justify-between border-slate-200/90 bg-white/90 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] dark:border-slate-800/80 dark:bg-slate-950/80">
                                <div>
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#002C4B] to-[#ffbc03] text-white shadow-lg shadow-[#002C4B]/20">
                                            <DocumentTextIcon className="h-5 w-5" />
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">{artifacts} files</span>
                                    </div>
                                    <h3 className="line-clamp-2 text-lg font-black leading-snug text-slate-950 dark:text-white" title={title}>{title}</h3>
                                    <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                                        Template: <span className="font-black text-slate-700 dark:text-slate-200">{template?.title || 'Unknown'}</span>
                                    </p>
                                </div>
                                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Generated</p>
                                        <p className="text-sm font-black text-slate-700 dark:text-slate-200">{generatedDate}</p>
                                    </div>
                                    <div className="mt-4 flex justify-end gap-2">
                                        {onCreateEpic && (
                                            <button
                                                onClick={() => onCreateEpic(gen)}
                                                className="rounded-xl px-3 py-2 text-xs font-black btn-ghost"
                                                title="Create an Epic from this document"
                                            >
                                                Create Epic
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onViewGeneration(gen.id)}
                                            className="rounded-xl px-4 py-2 text-sm font-black btn-ghost"
                                        >
                                            View
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

export default DocsView;
