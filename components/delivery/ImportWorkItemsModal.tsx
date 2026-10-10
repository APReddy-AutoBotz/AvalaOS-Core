import React, { useState, useEffect } from 'react';
import { WorkItem } from '../../types';
import Modal from '../shared/Modal';
import { CubeIcon, DocumentTextIcon, CheckCircleIcon } from '../shared/icons';

interface ImportWorkItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workItems: WorkItem[];
    onImport: (selectedItems: WorkItem[]) => Promise<boolean>;
}

const workItemIcon = (type: WorkItem['type']) => {
    switch (type) {
        case 'Epic': return <CubeIcon className="w-5 h-5 text-purple-500" />;
        case 'Story': return <DocumentTextIcon className="w-5 h-5 text-green-500" />;
        case 'Task': return <CheckCircleIcon className="w-5 h-5 text-sky-500" />;
    }
}

const ImportWorkItemsModal: React.FC<ImportWorkItemsModalProps> = ({ isOpen, onClose, workItems, onImport }) => {
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Pre-select all items when the modal opens
            setSelectedItems(new Set(workItems.map((_, index) => index)));
            setSubmitting(false);
            setSubmitError(null);
        }
    }, [isOpen]);

    const handleToggleItem = (index: number) => {
        const newSelection = new Set(selectedItems);
        if (newSelection.has(index)) {
            newSelection.delete(index);
        } else {
            newSelection.add(index);
        }
        setSelectedItems(newSelection);
    };
    
    const handleToggleAll = () => {
        if (selectedItems.size === workItems.length) {
            setSelectedItems(new Set()); // Deselect all
        } else {
            setSelectedItems(new Set(workItems.map((_, index) => index))); // Select all
        }
    };

    const handleImportClick = async () => {
        const itemsToImport = workItems.filter((_, index) => selectedItems.has(index));
        setSubmitting(true);
        setSubmitError(null);
        try {
            const committed = await onImport(itemsToImport);
            if (committed) onClose();
            else setSubmitError('The import result could not be confirmed. Review the selected work and retry the same selection.');
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'The import could not be completed. Try the same selection again.');
        } finally {
            setSubmitting(false);
        }
    };
    
    const allSelected = selectedItems.size === workItems.length && workItems.length > 0;

    return (
        <Modal isOpen={isOpen} onClose={submitting ? () => undefined : onClose} title="Import Work Items to Backlog">
            <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Review the generated work items. Uncheck any items you don't want to import.
                </p>
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800">
                    Imported items retain available source lineage and evidence refs. Docs-only lineage remains partial and is not Assess-backed evidence.
                </div>
                {submitError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{submitError}</div>}

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-abz-ink">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            disabled={submitting}
                            onChange={handleToggleAll}
                            className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary"
                        />
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </label>
                    <span className="text-sm font-semibold">{selectedItems.size} / {workItems.length} selected</span>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {workItems.map((item, index) => (
                        <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${selectedItems.has(index) ? 'bg-white dark:bg-surface-dark border-abz-primary/50' : 'bg-slate-50/50 dark:bg-abz-ink/50 border-transparent'}`}>
                            <input
                                type="checkbox"
                                aria-label={`Select ${item.type}: ${item.title}`}
                                checked={selectedItems.has(index)}
                                disabled={submitting}
                                onChange={() => handleToggleItem(index)}
                                className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary mt-1 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    {workItemIcon(item.type)}
                                    <span className="font-semibold text-sm">{item.title}</span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} disabled={submitting} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl disabled:cursor-not-allowed disabled:opacity-50">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleImportClick()}
                        disabled={selectedItems.size === 0 || submitting}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        {submitting ? 'Importing…' : `Import ${selectedItems.size} Item${selectedItems.size !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ImportWorkItemsModal;
