import React, { useState } from 'react';
import { useTemplateService } from '../../services/templateService';
import ProcessCreationModal from './ProcessCreationModal';
import { ClipboardListIcon, DocumentDuplicateIcon, SparklesIcon } from '../shared/icons';

const TemplateLibraryView: React.FC = () => {
    const { availablePacks } = useTemplateService();
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const totalTemplates = availablePacks.reduce((sum, pack) => sum + pack.templates.length, 0);
    const unlockedTemplates = availablePacks.reduce((sum, pack) => sum + (pack.isLocked ? 0 : pack.templates.length), 0);
    const buyerSafePackDescription = (description: string) =>
        description.replace('(Premium Pack)', '(Requires workspace configuration)');

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6 pb-20">
            <div className="premium-surface overflow-hidden rounded-3xl">
                <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="p-7">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Assessment accelerators</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#002C4B] dark:text-white">Process Template Library</h1>
                        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                            Start with industry-ready assessment patterns for process discovery, risk scoring, system context, and recommended documentation handoff.
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 border-t border-slate-200/80 bg-slate-50/70 p-6 dark:border-slate-800/80 dark:bg-slate-950/30 lg:border-l lg:border-t-0">
                        {[
                            { label: 'Packs', value: availablePacks.length, icon: DocumentDuplicateIcon },
                            { label: 'Templates', value: totalTemplates, icon: ClipboardListIcon },
                            { label: 'Available', value: unlockedTemplates, icon: SparklesIcon },
                        ].map(({ label, value, icon: Icon }) => (
                            <div key={label} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200/80 dark:bg-slate-900/70 dark:ring-slate-800">
                                <Icon className="h-5 w-5 text-[#ffbc03]" />
                                <p className="mt-3 text-2xl font-black text-[#002C4B] dark:text-white">{value}</p>
                                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {availablePacks.map(pack => (
                    <section key={pack.id} className={`premium-surface rounded-3xl p-6 ${pack.isLocked ? 'opacity-75' : ''}`}>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-xl font-black text-slate-950 dark:text-white">{pack.name}</h2>
                                    {pack.isPremium && (
                                        <span className="rounded-full bg-[#ffbc03]/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#002C4B] ring-1 ring-[#ffbc03]/35 dark:text-[#ffcf45]">
                                            Workspace Pack
                                        </span>
                                    )}
                                    {pack.isLocked && (
                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800">
                                            Locked
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-400">{buyerSafePackDescription(pack.description)}</p>
                            </div>
                            <span className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                {pack.templates.length} templates
                            </span>
                        </div>

                        {pack.templates.length > 0 ? (
                            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {pack.templates.map(template => (
                                    <div key={template.id} className="card flex h-full flex-col rounded-2xl p-5">
                                        <div className="mb-2">
                                            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#ffbc03]">{template.family}</span>
                                        </div>
                                        <h3 className="text-lg font-black leading-6 text-[#002C4B] dark:text-white">{template.name}</h3>
                                        <p className="mb-5 mt-2 line-clamp-3 flex-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
                                            {template.description}
                                        </p>
                                        <div className="mb-5 flex flex-wrap gap-2">
                                            {template.systemContextLayer.slice(0, 3).map(system => (
                                                <span key={system} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                                    {system}
                                                </span>
                                            ))}
                                        </div>

                                        <button
                                            disabled={pack.isLocked}
                                            onClick={() => setSelectedTemplateId(template.id)}
                                            className={`w-full rounded-xl py-2.5 text-sm font-black transition-all ${pack.isLocked
                                                    ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                                    : 'bg-[#ffbc03] text-[#002C4B] shadow-lg shadow-[#ffbc03]/15 hover:-translate-y-0.5'
                                                }`}
                                        >
                                            {pack.isLocked ? 'Requires workspace configuration' : 'Use Template'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-700">
                                Templates for this pack will be available soon.
                            </div>
                        )}
                    </section>
                ))}
            </div>

            {selectedTemplateId && (
                <ProcessCreationModal
                    isOpen={true}
                    onClose={() => setSelectedTemplateId(null)}
                    initialTemplateId={selectedTemplateId}
                />
            )}
        </div>
    );
};

export default TemplateLibraryView;
