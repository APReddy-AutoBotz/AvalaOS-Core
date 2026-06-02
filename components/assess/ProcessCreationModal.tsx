import React, { useState } from 'react';
import { useProcessService } from '../../services/processService';
import { useOrganization } from '../../services/organizationService';
import { useTemplateService } from '../../services/templateService';
import { CriticalityLevel } from '../../types';
import { XMarkIcon } from '../shared/icons';
import { useAuth } from '../auth/AuthProvider';

interface ProcessCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated?: () => void;
    initialTemplateId?: string;
}

const ProcessCreationModal: React.FC<ProcessCreationModalProps> = ({ isOpen, onClose, onCreated, initialTemplateId }) => {
    const { currentOrganization } = useOrganization();
    const { createProcess, createProcessFromTemplate } = useProcessService();
    const { getTemplateById } = useTemplateService();
    const { user } = useAuth();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [department, setDepartment] = useState('');
    const [criticality, setCriticality] = useState<CriticalityLevel>('Medium');

    const [error, setError] = useState('');

    if (!isOpen || !currentOrganization) return null;

    const sourceTemplate = initialTemplateId ? getTemplateById(initialTemplateId) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!initialTemplateId && (!name.trim())) {
            setError('Process Name is required for custom processes.');
            return;
        }

        try {
            const userId = user?.id || currentOrganization.members[0]?.userId;
            if (!userId) throw new Error('A signed-in user is required to create a process.');

            if (initialTemplateId) {
                // Ignore form fields if creating directly from template standard. 
                // Or we could pass overrides. The spec implies pre-fills for template creations.
                await createProcessFromTemplate(currentOrganization.id, initialTemplateId, userId);
            } else {
                await createProcess({
                    name,
                    description,
                    department,
                    criticality,
                    ownerId: userId,
                });
            }
            onCreated?.();
            onClose();
        } catch (err: any) {
            setError(err.message || 'An error occurred while creating the process.');
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {initialTemplateId ? `Start from: ${sourceTemplate?.name}` : 'Create New Process'}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto w-full">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium border border-red-200 dark:border-red-900/50">
                            {error}
                        </div>
                    )}

                    {initialTemplateId ? (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            You are provisioning a process tracking entity based on the <strong>{sourceTemplate?.family}</strong> template package. Standard inputs and risk models will be attached automatically when you enter the Guided Assessment mode.
                        </p>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Process Name *</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="e.g., Monthly Expense Reconciliation" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="Brief overview of the process goals." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                                <input type="text" value={department} onChange={e => setDepartment(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="e.g., Finance, HR, IT" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Assessed Criticality <span className="text-slate-400 font-normal ml-1">(Defaults to Medium)</span>
                                </label>
                                <select value={criticality} onChange={e => setCriticality(e.target.value as CriticalityLevel)}
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

                <div className="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                        Create Process
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProcessCreationModal;
