import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { WidgetDefinition, WidgetType } from '../types';
import { 
    HomeIcon, ChartPieIcon, ClipboardListIcon, CubeIcon, ChartBarIcon, GripVerticalIcon,
    SparklesIcon
} from './icons';

interface CustomizeDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    allWidgets: WidgetDefinition[];
    visibleWidgets: WidgetType[];
    onSave: (newLayout: WidgetType[]) => void;
}

const widgetIconMap: Record<WidgetType, React.FC<{className: string}>> = {
    [WidgetType.WELCOME]: HomeIcon,
    [WidgetType.STATS]: ChartPieIcon,
    [WidgetType.MY_TASKS]: ClipboardListIcon,
    [WidgetType.PROJECT_HEALTH]: CubeIcon,
    [WidgetType.BURNDOWN_CHART]: ChartBarIcon,
    [WidgetType.TASKS_BY_STATUS]: ChartBarIcon,
    [WidgetType.AI_INSIGHTS]: SparklesIcon,
};

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
    <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-slider"></span>
    </label>
);

const CustomizeDashboardModal: React.FC<CustomizeDashboardModalProps> = ({ isOpen, onClose, allWidgets, visibleWidgets, onSave }) => {
    const [currentSelection, setCurrentSelection] = useState<WidgetType[]>([]);
    const [orderedWidgets, setOrderedWidgets] = useState<WidgetDefinition[]>([]);
    
    // Drag and Drop State
    const draggedItem = useRef<WidgetType | null>(null);
    const dragOverItem = useRef<WidgetType | null>(null);
    const [isDragging, setIsDragging] = useState<boolean>(false);

    useEffect(() => {
        if (isOpen) {
            setCurrentSelection(visibleWidgets);
            // Create an ordered list of all widgets, putting visible ones first
            const visibleSet = new Set(visibleWidgets);
            const visibleDefs = visibleWidgets.map(id => allWidgets.find(w => w.id === id)!);
            const hiddenDefs = allWidgets.filter(w => !visibleSet.has(w.id));
            setOrderedWidgets([...visibleDefs, ...hiddenDefs]);
        }
    }, [isOpen, visibleWidgets, allWidgets]);

    const handleToggle = (widgetId: WidgetType) => {
        const newSelection = currentSelection.includes(widgetId)
            ? currentSelection.filter(id => id !== widgetId)
            : [...currentSelection, widgetId];
        setCurrentSelection(newSelection);
    };

    const handleSave = () => {
        // Filter the ordered list to only include the ones that are toggled on
        const finalLayout = orderedWidgets
            .map(w => w.id)
            .filter(id => currentSelection.includes(id));
        onSave(finalLayout);
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, widgetId: WidgetType) => {
        draggedItem.current = widgetId;
        e.dataTransfer.effectAllowed = 'move';
        // A slight delay to allow the browser to render the drag image
        setTimeout(() => setIsDragging(true), 0);
    };
    
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, widgetId: WidgetType) => {
        e.preventDefault();
        if (draggedItem.current !== widgetId) {
            dragOverItem.current = widgetId;
            const newOrderedWidgets = [...orderedWidgets];
            const dragged = newOrderedWidgets.find(w => w.id === draggedItem.current);
            if (!dragged) return;

            const remainingItems = newOrderedWidgets.filter(w => w.id !== draggedItem.current);
            const dropIndex = remainingItems.findIndex(w => w.id === dragOverItem.current);
            
            remainingItems.splice(dropIndex, 0, dragged);
            setOrderedWidgets(remainingItems);
        }
    };
    
    const handleDragEnd = () => {
        setIsDragging(false);
        draggedItem.current = null;
        dragOverItem.current = null;
    };


    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Customize Your Dashboard">
            <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Toggle widget visibility and drag to reorder.
                </p>
                <div className="space-y-3 p-2 rounded-lg bg-slate-50 dark:bg-abz-ink max-h-96 overflow-y-auto">
                    {orderedWidgets.map(widget => {
                        const Icon = widgetIconMap[widget.id];
                        const isVisible = currentSelection.includes(widget.id);
                        
                        return (
                             <div 
                                key={widget.id}
                                draggable={isVisible}
                                onDragStart={(e) => isVisible && handleDragStart(e, widget.id)}
                                onDragEnter={(e) => isVisible && isDragging && handleDragEnter(e, widget.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()} // Necessary for onDrop to fire
                                className={`flex items-center justify-between p-3 rounded-lg transition-all
                                    ${isVisible ? 'bg-white dark:bg-surface-dark shadow-sm' : 'bg-transparent'}
                                    ${isDragging && draggedItem.current === widget.id ? 'is-dragging' : ''}
                                `}
                            >
                                <div className="flex items-center gap-3">
                                     <div className={`drag-handle ${isVisible ? 'text-slate-400' : 'text-slate-300 dark:text-slate-700'}`}>
                                        <GripVerticalIcon className="w-5 h-5" />
                                    </div>
                                    <Icon className={`w-6 h-6 ${isVisible ? 'text-abz-primary' : 'text-slate-400'} flex-shrink-0`} />
                                    <div>
                                        <h4 className={`font-semibold ${isVisible ? '' : 'text-slate-400'}`}>{widget.title}</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{widget.description}</p>
                                    </div>
                                </div>
                                <ToggleSwitch 
                                    checked={isVisible}
                                    onChange={() => handleToggle(widget.id)}
                                />
                            </div>
                        )
                    })}
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        Save Layout
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default CustomizeDashboardModal;
