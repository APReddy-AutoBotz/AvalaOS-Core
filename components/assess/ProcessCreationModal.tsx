import React, { useEffect, useRef, useState } from 'react';
import { useProcessService } from '../../services/processService';
import { useTemplateService } from '../../services/templateService';
import { CriticalityLevel } from '../../types';
import { XMarkIcon } from '../shared/icons';
import { ProcessCreateError } from '../../services/processCreationContract';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { useAuth } from '../auth/AuthProvider';
import { isLocalRuntimeEnabled } from '../../services/supabaseClient';
import { processReadAuthorityKey } from '../../services/processCreationServiceFence';
import { processCreationModalCompletionCurrent, processCreationModalVisible } from './processCreationModalScope';

interface ProcessCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    initialTemplateId?: string;
}

type ProcessCreationFormProps = Omit<ProcessCreationModalProps, 'isOpen'> & { authorityKey: string; currentKey: () => string | null };

const ProcessCreationForm: React.FC<ProcessCreationFormProps> = ({ onClose, onCreated, initialTemplateId, authorityKey, currentKey }) => {
    const { createProcess, createProcessFromTemplate } = useProcessService();
    const { getTemplateById } = useTemplateService();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [criticality, setCriticality] = useState<CriticalityLevel>('Medium');

    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const firstField = useRef<HTMLInputElement>(null);
    const cancelButton = useRef<HTMLButtonElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const busyStatus = useRef<HTMLParagraphElement>(null);
    const errorAlert = useRef<HTMLDivElement>(null);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        (initialTemplateId ? cancelButton.current : firstField.current)?.focus();
        return () => { if (currentKey() === authorityKey && previous?.isConnected) previous.focus(); };
    }, [initialTemplateId, authorityKey, currentKey]);

    useEffect(() => {
        if (busy) busyStatus.current?.focus();
        else if (error) errorAlert.current?.focus();
    }, [busy, error]);

    const sourceTemplate = initialTemplateId ? getTemplateById(initialTemplateId) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (inFlight.current || !processCreationModalCompletionCurrent(authorityKey,currentKey(),mounted.current)) return;
        setError('');

        if (!initialTemplateId && (!name.trim())) {
            setError('Process Name is required for custom processes.');
            return;
        }

        inFlight.current = true;
        setBusy(true);
        try {
            if (initialTemplateId) {
                await createProcessFromTemplate(initialTemplateId);
            } else {
                await createProcess({
                    name,
                    description,
                    department,
                    criticality,
                });
            }
            if (processCreationModalCompletionCurrent(authorityKey,currentKey(),mounted.current)) {
                onCreated?.();
                onClose();
            }
        } catch (err: unknown) {
            const message: Record<ProcessCreateError['code'], string> = {
                INVALID_COMMAND: 'Check the process fields and try again.',
                AUTHENTICATION_REQUIRED: 'Sign in again before creating a process.',
                PERMISSION_DENIED: 'Your current workspace role does not allow process creation.',
                AUTHORITY_STALE: 'Your workspace access changed. Refresh before trying again.',
                FEATURE_DISABLED: 'Process creation is disabled in this workspace.',
                READ_ONLY: 'This workspace is currently read-only.',
                IDEMPOTENCY_CONFLICT: 'This request changed while it was being saved. Refresh before retrying.',
                QUOTA_EXCEEDED: 'This workspace has reached its process limit.',
                COMMAND_UNAVAILABLE: 'The result could not be verified. Retry with these same fields before starting another process.',
            };
            if (processCreationModalCompletionCurrent(authorityKey,currentKey(),mounted.current))
                setError(err instanceof ProcessCreateError ? message[err.code] : 'Process creation could not be verified.');
        } finally {
            if (processCreationModalCompletionCurrent(authorityKey,currentKey(),mounted.current)) {
                inFlight.current = false;
                setBusy(false);
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onKeyDown={event => {
            if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
            if (event.key !== 'Tab') return;
            const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])];
            if (!focusable.length) { event.preventDefault(); return; }
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
            <div ref={dialog} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby="process-create-title" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
                    <h2 id="process-create-title" className="min-w-0 break-words text-xl font-bold text-slate-900 dark:text-white">
                        {initialTemplateId ? `Start from: ${sourceTemplate?.name}` : 'New Assess process'}
                    </h2>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close process form" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto w-full">
                    {error && (
                        <div ref={errorAlert} role="alert" tabIndex={-1} className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium border border-red-200 dark:border-red-900/50">
                            {error}
                        </div>
                    )}

                    {busy && <p ref={busyStatus} role="status" tabIndex={0} className="mb-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-950 focus:outline-none focus:ring-2 focus:ring-indigo-600">Verifying process creation. Please wait for the committed result.</p>}

                    {initialTemplateId ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Create a new process from the <strong>{sourceTemplate?.family}</strong> template. Its fields are starting suggestions; assessment evidence and approval still require your review.
                        </p>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="process-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Process Name *</label>
                                <input ref={firstField} id="process-name" type="text" required maxLength={200} disabled={busy} value={name} onChange={e => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="e.g., Monthly Expense Reconciliation" />
                            </div>
                            <div>
                                <label htmlFor="process-description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea id="process-description" maxLength={4000} disabled={busy} value={description} onChange={e => setDescription(e.target.value)} rows={3}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="Brief overview of the process goals." />
                            </div>
                            <div>
                                <label htmlFor="process-department" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                                <input id="process-department" type="text" maxLength={200} disabled={busy} value={department} onChange={e => setDepartment(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="e.g., Finance, HR, IT" />
                            </div>
                            <div>
                                <label htmlFor="process-criticality" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Assessed Criticality <span className="text-slate-400 font-normal ml-1">(Defaults to Medium)</span>
                                </label>
                                <select id="process-criticality" disabled={busy} value={criticality} onChange={e => setCriticality(e.target.value as CriticalityLevel)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                                    <option value="Low">Low - Minimal operational impact</option>
                                    <option value="Medium">Medium - Standard operational process</option>
                                    <option value="High">High - Significant revenue or compliance impact</option>
                                    <option value="Critical">Critical - Core business continuity dependency</option>
                                </select>
                            </div>
                        </form>
                    )}
                </div>

                <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800">
                    <button ref={cancelButton} type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium">
                        Cancel
                    </button>
                    <button type="button" onClick={handleSubmit} disabled={busy || Boolean(initialTemplateId && !sourceTemplate)} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                        {busy ? 'Verifying creation…' : 'Create process'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ProcessCreationModal: React.FC<ProcessCreationModalProps> = ({ isOpen, onClose, onCreated, initialTemplateId }) => {
    const { currentOrganization, currentWorkspace, tenantContext, sessionState } = useOrganizationContext();
    const { user } = useAuth();
    const authorityKey = processReadAuthorityKey({
        actorId:user?.id, organizationId:currentOrganization?.id, workspaceId:currentWorkspace?.id,
        sessionState, tenantContext, localAuthority:isLocalRuntimeEnabled(),
    });
    const [openedKey,setOpenedKey] = useState<string | null>(null);
    const latestKey = useRef(authorityKey);
    latestKey.current = authorityKey;

    useEffect(() => {
        if (!isOpen) { setOpenedKey(null); return; }
        if (!authorityKey || (openedKey && openedKey !== authorityKey)) { onClose(); return; }
        if (!openedKey) setOpenedKey(authorityKey);
    }, [isOpen,authorityKey,openedKey,onClose]);

    if (!processCreationModalVisible(isOpen,openedKey,authorityKey)) return null;
    return <ProcessCreationForm key={`${authorityKey}:${initialTemplateId ?? 'manual'}`}
        authorityKey={authorityKey} currentKey={() => latestKey.current}
        initialTemplateId={initialTemplateId} onCreated={onCreated} onClose={onClose} />;
};

export default ProcessCreationModal;
