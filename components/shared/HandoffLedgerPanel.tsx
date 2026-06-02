import React from 'react';
import { HandoffLedgerEntry, ProductModuleKey } from '../../types';
import { ArrowPathIcon, CheckCircleIcon } from './icons';

interface HandoffLedgerPanelProps {
    entries: HandoffLedgerEntry[];
    title?: string;
    compact?: boolean;
}

const moduleLabel: Record<ProductModuleKey, string> = {
    assess: 'Assess',
    docs: 'Docs',
    delivery: 'Delivery',
    monitor: 'Monitor',
};

const statusClass = (status: HandoffLedgerEntry['status']) => {
    if (status === 'Completed' || status === 'Accepted') return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/50';
    if (status === 'Blocked') return 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/30 dark:text-red-200 dark:ring-red-900/50';
    if (status === 'Submitted') return 'bg-[#ffbc03]/15 text-[#002C4B] ring-[#ffbc03]/30 dark:text-[#ffcf45]';
    return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800';
};

const HandoffLedgerPanel: React.FC<HandoffLedgerPanelProps> = ({ entries, title = 'Handoff Ledger', compact = false }) => {
    const visibleEntries = compact ? entries.slice(0, 3) : entries.slice(0, 8);

    return (
        <section className="premium-surface rounded-3xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Traceability</p>
                    <h2 className="mt-1 text-xl font-black text-[#002C4B] dark:text-white">{title}</h2>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                        Auditable transitions between modules, including source records, target records, and evidence references.
                    </p>
                </div>
                <span className="rounded-full bg-[#ffbc03]/15 px-3 py-1.5 text-xs font-black text-[#002C4B] ring-1 ring-[#ffbc03]/30 dark:text-[#ffcf45]">
                    {entries.length} records
                </span>
            </div>

            {visibleEntries.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                    <ArrowPathIcon className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-200">No handoffs recorded yet</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Move a decision pack into Docs or import document work items into Delivery to create the first ledger record.</p>
                </div>
            ) : (
                <div className="mt-6 space-y-3">
                    {visibleEntries.map(entry => (
                        <div key={entry.id} className="rounded-2xl border border-slate-200/80 bg-white/66 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                            {moduleLabel[entry.fromModule]} &rarr; {moduleLabel[entry.toModule]}
                                        </span>
                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${statusClass(entry.status)}`}>
                                            {entry.status}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm font-black text-slate-950 dark:text-white">{entry.title}</p>
                                    <p className="mt-1 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{entry.summary}</p>
                                </div>
                                <div className="text-right">
                                    <CheckCircleIcon className="ml-auto h-5 w-5 text-[#ffbc03]" />
                                    <p className="mt-2 text-xs font-bold text-slate-500">{new Date(entry.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default HandoffLedgerPanel;
