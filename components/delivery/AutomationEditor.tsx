import React, { useState } from 'react';
import { 
    Automation, Project, User, AutomationTriggerType, AutomationActionType, 
    AutomationConditionField, AutomationConditionOperator, TaskStatus, ALL_STATUSES,
    ALL_PRIORITIES, ALL_TASK_TYPES, TaskPriority, TaskType
} from '../../types';
import { BoltIcon, ChevronRightIcon, PlusCircleIcon, TrashIcon, XIcon } from '../shared/icons';

interface AutomationEditorProps {
    project: Project;
    users: User[];
    automation?: Automation;
    onSave: (automation: Omit<Automation, 'id'> | Automation) => void;
    onCancel: () => void;
}

const triggerOptions: { value: AutomationTriggerType, label: string }[] = [
    { value: 'task_status_changed', label: 'Task status is changed' },
    { value: 'task_created', label: 'Task is created' },
];

const actionOptions: { value: AutomationActionType, label: string }[] = [
    { value: 'change_status', label: 'Change status to...' },
    { value: 'set_assignee', label: 'Assign to...' },
    { value: 'add_comment', label: 'Add comment' },
];

const conditionFieldOptions: { value: AutomationConditionField, label: string }[] = [
    { value: 'priority', label: 'Priority' },
    { value: 'type', label: 'Type' },
];

const conditionOperatorOptions: { value: AutomationConditionOperator, label: string }[] = [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
];

const AutomationEditor: React.FC<AutomationEditorProps> = ({ project, users, automation, onSave, onCancel }) => {
    const [editedAutomation, setEditedAutomation] = useState<Omit<Automation, 'id'> | Automation>(
        automation || {
            name: '',
            description: '',
            projectId: project.id,
            isEnabled: true,
            trigger: { type: 'task_status_changed', config: { toStatus: 'Done' } },
            conditions: [],
            actions: [],
        }
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditedAutomation(prev => ({ ...prev, [name]: value }));
    };

    const handleTriggerTypeChange = (type: AutomationTriggerType) => {
        const newTrigger = { type, config: {} };
        if (type === 'task_status_changed') {
            newTrigger.config = { toStatus: 'Done' };
        }
        setEditedAutomation(prev => ({ ...prev, trigger: newTrigger }));
    };

    const handleTriggerConfigChange = (field: string, value: any) => {
        setEditedAutomation(prev => ({ 
            ...prev, 
            trigger: { ...prev.trigger, config: { ...prev.trigger.config, [field]: value } }
        }));
    };

    const handleAddCondition = () => {
        const newCondition = {
            field: 'priority' as AutomationConditionField,
            operator: 'is' as AutomationConditionOperator,
            value: 'Medium' as TaskPriority
        };
        setEditedAutomation(prev => ({ ...prev, conditions: [...prev.conditions, newCondition]}));
    };

    const handleConditionChange = (index: number, field: keyof Automation['conditions'][0], value: any) => {
        const newConditions = [...editedAutomation.conditions];
        const oldCondition = newConditions[index];
        newConditions[index] = { ...oldCondition, [field]: value };
        // If field changes, reset value to a sensible default
        if (field === 'field') {
            newConditions[index].value = value === 'priority' ? ALL_PRIORITIES[0] : ALL_TASK_TYPES[0];
        }
        setEditedAutomation(prev => ({ ...prev, conditions: newConditions }));
    };
    
    const handleRemoveCondition = (index: number) => {
        setEditedAutomation(prev => ({...prev, conditions: prev.conditions.filter((_, i) => i !== index)}));
    };
    
    const handleAddAction = () => {
        const newAction = {
            id: `action-${Date.now()}`,
            type: 'change_status' as AutomationActionType,
            config: { status: 'To Do' as TaskStatus }
        };
        setEditedAutomation(prev => ({...prev, actions: [...prev.actions, newAction]}));
    };

    const handleActionChange = (id: string, newType: AutomationActionType) => {
        const newActions = editedAutomation.actions.map(action => {
            if (action.id === id) {
                let newConfig = {};
                if (newType === 'change_status') newConfig = { status: 'To Do' };
                if (newType === 'set_assignee') newConfig = { assigneeIds: [] };
                if (newType === 'add_comment') newConfig = { comment: '' };
                return { ...action, type: newType, config: newConfig };
            }
            return action;
        });
        setEditedAutomation(prev => ({...prev, actions: newActions}));
    };

    const handleActionConfigChange = (id: string, field: string, value: any) => {
        const newActions = editedAutomation.actions.map(action => 
            action.id === id ? { ...action, config: { ...action.config, [field]: value } } : action
        );
        setEditedAutomation(prev => ({...prev, actions: newActions}));
    };

    const handleRemoveAction = (id: string) => {
        setEditedAutomation(prev => ({...prev, actions: prev.actions.filter(a => a.id !== id)}));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(editedAutomation);
    };

    const renderConditionValueInput = (condition: Automation['conditions'][0], index: number) => {
        switch (condition.field) {
            case 'priority':
                return (
                    <select value={condition.value} onChange={(e) => handleConditionChange(index, 'value', e.target.value as TaskPriority)} className="input-field">
                        {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                );
            case 'type':
                 return (
                    <select value={condition.value} onChange={(e) => handleConditionChange(index, 'value', e.target.value as TaskType)} className="input-field">
                        {ALL_TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                );
            default:
                return null;
        }
    };
    
    const renderActionConfig = (action: Automation['actions'][0]) => {
        switch (action.type) {
            case 'change_status':
                return (
                     <select value={action.config.status} onChange={(e) => handleActionConfigChange(action.id, 'status', e.target.value as TaskStatus)} className="input-field">
                        {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                );
            case 'set_assignee':
                return (
                     <select value={action.config.assigneeIds?.[0] || ''} onChange={(e) => handleActionConfigChange(action.id, 'assigneeIds', [e.target.value])} className="input-field">
                        <option value="">Select User...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                );
            case 'add_comment':
                 return (
                    <textarea value={action.config.comment || ''} onChange={(e) => handleActionConfigChange(action.id, 'comment', e.target.value)} className="input-field" placeholder="Your comment here..."></textarea>
                );
            default:
                return null;
        }
    }

    return (
        <div className="max-w-3xl mx-auto">
             <button onClick={onCancel} className="text-sm font-semibold text-slate-500 hover:text-abz-primary mb-4">
                &larr; Back to all automations
            </button>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold">Rule Details</h2>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium">Automation Name</label>
                            <input type="text" id="name" name="name" value={editedAutomation.name} onChange={handleInputChange} className="mt-1 block w-full input-field" placeholder="e.g., Assign QA on testing" required />
                        </div>
                         <div>
                            <label htmlFor="description" className="block text-sm font-medium">Description</label>
                            <textarea id="description" name="description" value={editedAutomation.description} onChange={handleInputChange} className="mt-1 block w-full input-field" rows={2} placeholder="A short description of what this rule does."></textarea>
                        </div>
                    </div>
                </div>

                {/* WHEN - Trigger */}
                <div className="card p-6">
                    <h3 className="font-bold text-lg mb-4">When...</h3>
                    <div className="flex items-center gap-4">
                        <select 
                            value={editedAutomation.trigger.type} 
                            onChange={(e) => handleTriggerTypeChange(e.target.value as AutomationTriggerType)}
                            className="input-field"
                        >
                            {triggerOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        {editedAutomation.trigger.type === 'task_status_changed' && (
                             <select 
                                value={editedAutomation.trigger.config.toStatus} 
                                onChange={(e) => handleTriggerConfigChange('toStatus', e.target.value as TaskStatus)}
                                className="input-field"
                            >
                                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        )}
                    </div>
                </div>

                {/* IF - Conditions */}
                <div className="card p-6">
                    <h3 className="font-bold text-lg mb-4">If...</h3>
                     <div className="space-y-4">
                        {editedAutomation.conditions.map((condition, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="h-px flex-1 bg-slate-200 dark:bg-gray-700"></div>
                                        <span className="text-xs font-bold text-slate-400">AND</span>
                                        <div className="h-px flex-1 bg-slate-200 dark:bg-gray-700"></div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-abz-ink-900 rounded-lg">
                                    <select value={condition.field} onChange={(e) => handleConditionChange(index, 'field', e.target.value as AutomationConditionField)} className="input-field">
                                        {conditionFieldOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                    <select value={condition.operator} onChange={(e) => handleConditionChange(index, 'operator', e.target.value as AutomationConditionOperator)} className="input-field">
                                        {conditionOperatorOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                    <div className="flex-1">{renderConditionValueInput(condition, index)}</div>
                                    <button type="button" onClick={() => handleRemoveCondition(index)} className="p-2 text-slate-400 hover:text-abz-danger">
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </React.Fragment>
                        ))}
                        <button type="button" onClick={handleAddCondition} className="flex items-center gap-2 text-sm font-medium text-abz-primary mt-4">
                            <PlusCircleIcon className="w-5 h-5" /> Add Condition
                        </button>
                    </div>
                </div>

                {/* THEN - Actions */}
                <div className="card p-6">
                    <h3 className="font-bold text-lg mb-4">Then...</h3>
                    <div className="space-y-4">
                        {editedAutomation.actions.map(action => (
                            <div key={action.id} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-abz-ink-900 rounded-lg">
                                 <select value={action.type} onChange={(e) => handleActionChange(action.id, e.target.value as AutomationActionType)} className="input-field">
                                    {actionOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                                <div className="flex-1">
                                    {renderActionConfig(action)}
                                </div>
                                <button type="button" onClick={() => handleRemoveAction(action.id)} className="p-2 text-slate-400 hover:text-abz-danger">
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={handleAddAction} className="flex items-center gap-2 text-sm font-medium text-abz-primary mt-4">
                            <PlusCircleIcon className="w-5 h-5" /> Add Action
                        </button>
                    </div>
                </div>

                 <div className="flex justify-end gap-4 pt-4">
                    <button type="button" onClick={onCancel} className="px-6 py-2 text-md font-semibold rounded-2xl btn-ghost">Cancel</button>
                    <button type="submit" className="px-6 py-2 text-md font-semibold rounded-2xl btn-primary">Save Automation</button>
                </div>

            </form>
             <style>{`
                .input-field {
                    background-color: white;
                    border: 1px solid #d1d5db;
                    border-radius: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                }
                .input-field:focus {
                    outline: 2px solid transparent;
                    outline-offset: 2px;
                    border-color: var(--abz-indigo-500);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
                }
                .dark .input-field {
                    background-color: var(--abz-ink-900);
                    border-color: #4b5563;
                }
            `}</style>
        </div>
    );
};

export default AutomationEditor;
