import React, { useState } from 'react';
import { useProcessService } from '../../services/processService';
import { useOrganization } from '../../services/organizationService';
import ProcessCreationModal from './ProcessCreationModal';
import { ChartBarIcon, CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon } from '../shared/icons';
import type { ProductActionDecision } from '../../services/productActionPolicy';

interface ProcessCatalogViewProps {
    onViewDetail: (processId: string) => void;
    createProcessDecision?: ProductActionDecision;
}

const criticalityClass = (criticality: string) => {
    if (criticality === 'Critical') return 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/60';
    if (criticality === 'High') return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60';
    return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
};

const statusClass = (status: string) => {
    if (status.toLowerCase().includes('complete') || status.toLowerCase().includes('approved') || status.toLowerCase().includes('handed off')) return 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60';
    if (status.toLowerCase().includes('review')) return 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-900/60';
    if (status.toLowerCase().includes('changes')) return 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60';
    if (status.toLowerCase().includes('reject') || status.toLowerCase().includes('no-go')) return 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/60';
    return 'bg-[#002C4B]/10 text-[#002C4B] ring-[#002C4B]/15 dark:bg-[#ffbc03]/10 dark:text-[#ffcf45] dark:ring-[#ffbc03]/20';
};

const ProcessCatalogView: React.FC<ProcessCatalogViewProps> = ({ onViewDetail, createProcessDecision }) => {
    const { currentOrganization } = useOrganization();
    const { processes, loading, refreshProcesses } = useProcessService();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const canCreateProcess = createProcessDecision?.allowed ?? true;
    const createProcessBlockedReason = createProcessDecision && !createProcessDecision.allowed ? createProcessDecision.message : 'Process creation is not authorized in this workspace.';

    if (!currentOrganization) return null;

    const completedCount = processes.filter(process => ['Completed', 'Approved', 'Handed Off to Docs', 'Handed Off to Delivery'].includes(process.status)).length;
    const criticalCount = processes.filter(process => process.criticality === 'Critical' || process.criticality === 'High').length;
    const inFlightCount = processes.filter(process => !['Not Started', 'Completed', 'Approved', 'Archived'].includes(process.status)).length;
    const assessmentStats = [
        { label: 'Processes', value: processes.length, detail: 'enterprise inventory', icon: ChartBarIcon },
        { label: 'Scored', value: completedCount, detail: 'decision packs ready', icon: CheckCircleIcon },
        { label: 'High criticality', value: criticalCount, detail: 'needs control review', icon: ExclamationTriangleIcon },
        { label: 'In motion', value: inFlightCount, detail: 'draft or review', icon: SparklesIcon },
    ];

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6 pb-20">
            <div className="premium-surface overflow-hidden rounded-3xl">
                <div className="flex flex-wrap items-end justify-between gap-4 p-7">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Assessment control room</p>
                        <h1 className="mt-1 text-3xl font-black text-[#002C4B] dark:text-white">Process Catalog</h1>
                        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Track process candidates, criticality, readiness, and where RPA, workflow, AI, agentic AI, or human review should sit.</p>
                    </div>
                    <button
                        onClick={() => canCreateProcess ? setIsCreateModalOpen(true) : alert(createProcessBlockedReason)}
                        disabled={!canCreateProcess}
                        title={!canCreateProcess ? createProcessBlockedReason : undefined}
                        className="rounded-xl bg-gradient-to-r from-[#002C4B] to-[#ffbc03] px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-[#002C4B]/20 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        New Process
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-0 border-t border-slate-200/80 bg-slate-50/70 dark:border-slate-800/80 dark:bg-slate-950/30 md:grid-cols-4">
                    {assessmentStats.map(({ label, value, detail, icon: Icon }) => (
                        <div key={label} className="border-b border-slate-200/80 p-5 last:border-b-0 dark:border-slate-800/80 md:border-b-0 md:border-r md:last:border-r-0">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
                                    <p className="mt-2 text-3xl font-black text-[#002C4B] dark:text-white">{value}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{detail}</p>
                                </div>
                                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ffbc03]/15 text-[#002C4B] dark:text-[#ffcf45]">
                                    <Icon className="h-5 w-5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="premium-surface overflow-hidden rounded-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-4 dark:border-slate-800/80">
                    <div>
                        <h2 className="text-lg font-black text-slate-950 dark:text-white">Assessment inventory</h2>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{processes.length} active process records in {currentOrganization.name}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">Enterprise scope</span>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800/80 dark:bg-slate-900/70 dark:text-slate-500">
                        <tr>
                            <th className="px-6 py-4">Process Name</th>
                            <th className="px-6 py-4">Department</th>
                            <th className="px-6 py-4">Criticality</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map(process => (
                            <tr key={process.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900/80">
                                <td className="px-6 py-4">
                                    <button onClick={() => onViewDetail(process.id)} className="text-left font-black text-slate-950 transition-colors hover:text-[#002C4B] dark:text-white dark:hover:text-[#ffcf45]">
                                        {process.name}
                                    </button>
                                </td>
                                <td className="px-6 py-4 font-semibold text-slate-500 dark:text-slate-400">
                                    {process.department || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${criticalityClass(process.criticality)}`}>
                                        {process.criticality}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${statusClass(process.status)}`}>
                                        {process.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => onViewDetail(process.id)}
                                        className="rounded-xl px-3 py-2 text-sm font-black btn-ghost"
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {loading && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-sm font-semibold text-slate-500">
                                    Loading process catalog...
                                </td>
                            </tr>
                        )}
                        {!loading && processes.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-14 text-center">
                                    <p className="text-base font-black text-slate-900 dark:text-white">No processes found</p>
                                    <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Create a process or use a template to start an assessment.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ProcessCreationModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={refreshProcesses}
            />
        </div>
    );
};

export default ProcessCatalogView;
