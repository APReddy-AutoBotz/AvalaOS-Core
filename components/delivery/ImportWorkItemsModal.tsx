import React, { useState, useEffect } from 'react';
import { WorkItem } from '../../types';
import Modal from '../shared/Modal';
import { CubeIcon, DocumentTextIcon, CheckCircleIcon } from '../shared/icons';

interface ImportWorkItemsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workItems: WorkItem[];
    onImport: (selectedItems: WorkItem[]) => void;
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

    useEffect(() => {
        if (isOpen) {
            // Pre-select all items when the modal opens
            setSelectedItems(new Set(workItems.map((_, index) => index)));
        }
    }, [isOpen, workItems]);

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

    const handleImportClick = () => {
        const itemsToImport = workItems.filter((_, index) => selectedItems.has(index));
        onImport(itemsToImport);
    };
    
    const allSelected = selectedItems.size === workItems.length && workItems.length > 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import Work Items to Backlog">
            <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Review the generated work items. Uncheck any items you don't want to import.
                </p>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-abz-ink">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allSelected}
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
                                checked={selectedItems.has(index)}
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
                    <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleImportClick}
                        disabled={selectedItems.size === 0}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        Import {selectedItems.size} Item{selectedItems.size !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ImportWorkItemsModal;
