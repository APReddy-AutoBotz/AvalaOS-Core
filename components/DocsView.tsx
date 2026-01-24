import React from 'react';
import { DocumentGeneration, DocTemplate } from '../types';
import { DocumentTextIcon, PlusCircleIcon, SparklesIcon } from './icons';

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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-text-light dark:text-text-dark">Document Repository</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Review and access all AI-generated documents for this project.</p>
                </div>
            </div>

            {sortedGenerations.length === 0 ? (
                <div className="text-center py-16 bg-white/50 dark:bg-surface-dark/50 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                    <SparklesIcon className="w-20 h-20 mx-auto text-abz-primary/10 animate-pulse-glow" />
                    <h3 className="mt-4 text-lg font-semibold">No Documents Yet</h3>
                    <p className="text-slate-500 dark:text-slate-400">Use the AI Assistant in the header to generate your first document set.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedGenerations.map(gen => {
                        const template = templates.find(t => t.id === gen.templateId);
                        const title = getPrimaryDocTitle(gen, template);
                        return (
                            <div key={gen.id} className="card p-5 flex flex-col justify-between">
                                <div>
                                    <DocumentTextIcon className="w-8 h-8 text-abz-primary mb-3" />
                                    <h3 className="font-bold text-lg truncate" title={title}>{title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        Using template: <span className="font-medium">{template?.title || 'Unknown'}</span>
                                    </p>
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-gray-800 flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">Generated on</p>
                                        <p className="text-sm font-semibold">
                                            {new Date(gen.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onCreateEpic && onCreateEpic(gen)}
                                        className="px-3 py-2 text-xs font-semibold rounded-xl btn-ghost mr-2"
                                        title="Create an Epic from this document"
                                    >
                                        Create Epic
                                    </button>
                                    <button
                                        onClick={() => onViewGeneration(gen.id)}
                                        className="px-4 py-2 text-sm font-semibold rounded-xl btn-ghost"
                                    >
                                        View
                                    </button>
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