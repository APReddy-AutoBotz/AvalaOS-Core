import React, { useState } from 'react';
import { Automation, Project, User, ALL_STATUSES } from '../../types';
import { BoltIcon, PlusCircleIcon, PencilIcon, TrashIcon, ChevronRightIcon } from '../shared/icons';
import AutomationEditor from './AutomationEditor';

interface AutomationsViewProps {
    project: Project;
    automations: Automation[];
    users: User[];
    onCreate: (automation: Omit<Automation, 'id'>) => void;
    onUpdate: (automation: Automation) => void;
    onDelete: (automationId: string) => void;
    onToggle: (automationId: string, isEnabled: boolean) => void;
}

const triggerDescriptions: Record<string, (config: any) => string> = {
    task_status_changed: (config) => `When a task status changes to "${config.toStatus}"`,
    task_created: () => `When a task is created`,
};

const conditionDescriptions = (conditions: Automation['conditions']): string | null => {
    if (!conditions || conditions.length === 0) return null;
    
    const descriptions = conditions.map(c => {
        const field = c.field.charAt(0).toUpperCase() + c.field.slice(1);
        return `${field} ${c.operator} "${c.value}"`;
    });
    
    return "If " + descriptions.join(' and ');
}

const actionDescriptions: Record<string, (config: any, users: User[]) => string> = {
    change_status: (config) => `change status to "${config.status}"`,
    set_assignee: (config, users) => {
        const names = (config.assigneeIds || [])
            .map((id: string) => users.find(u => u.id === id)?.name || 'Unknown')
            .join(', ');
        return `assign to ${names}`;
    },
    add_comment: (config) => `add comment: "${config.comment?.substring(0, 20)}..."`,
};

const AutomationItem: React.FC<{ automation: Automation; onEdit: () => void; onDelete: () => void; onToggle: (isEnabled: boolean) => void; users: User[] }> = ({ automation, onEdit, onDelete, onToggle, users }) => {
    const triggerDesc = triggerDescriptions[automation.trigger.type]?.(automation.trigger.config) || 'Unknown Trigger';
    const conditionDesc = conditionDescriptions(automation.conditions);
    
    return (
        <div className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${automation.isEnabled ? 'bg-abz-emerald-500/10 text-abz-emerald-500' : 'bg-slate-100 dark:bg-abz-ink-900 text-slate-400'}`}>
                    <BoltIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="font-bold">{automation.name}</h3>
                    <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center flex-wrap">
                        <span>{triggerDesc}</span>
                        {conditionDesc && (
                             <React.Fragment>
                                <ChevronRightIcon className="w-4 h-4 mx-1" />
                                <span className="font-semibold italic">{conditionDesc}</span>
                            </React.Fragment>
                        )}
                        {automation.actions.map((action, i) => (
                           <React.Fragment key={action.id}>
                             <ChevronRightIcon className="w-4 h-4 mx-1" />
                             <span>{actionDescriptions[action.type]?.(action.config, users)}</span>
                           </React.Fragment>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div 
                    onClick={() => onToggle(!automation.isEnabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-abz-primary focus:ring-offset-2 ${automation.isEnabled ? 'bg-abz-primary' : 'bg-gray-200 dark:bg-gray-700'}`}
                >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${automation.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                 <button onClick={onEdit} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-abz-ink-900 hover:text-abz-primary">
                    <PencilIcon className="w-4 h-4" />
                </button>
                <button onClick={onDelete} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-abz-ink-900 hover:text-abz-danger">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};


const AutomationsView: React.FC<AutomationsViewProps> = ({ project, automations, users, onCreate, onUpdate, onDelete, onToggle }) => {
    const [editingAutomation, setEditingAutomation] = useState<Automation | 'new' | null>(null);

    const handleSave = (automationData: Omit<Automation, 'id'> | Automation) => {
        if ('id' in automationData) {
            onUpdate(automationData);
        } else {
            onCreate(automationData);
        }
        setEditingAutomation(null);
    };
    
    const handleDelete = (automationId: string) => {
        if(window.confirm('Are you sure you want to delete this automation?')) {
            onDelete(automationId);
        }
    };

    if (editingAutomation) {
        return (
            <AutomationEditor 
                project={project}
                users={users}
                automation={editingAutomation === 'new' ? undefined : editingAutomation}
                onSave={handleSave}
                onCancel={() => setEditingAutomation(null)}
            />
        );
    }
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                 <p className="text-slate-500 dark:text-slate-400 mt-1">Create rules to automate actions in your project.</p>
                <button onClick={() => setEditingAutomation('new')} className="flex items-center gap-2 text-sm font-semibold btn-primary">
                    <PlusCircleIcon className="h-5 w-5" />
                    <span>New Automation</span>
                </button>
            </div>

            {automations.length > 0 ? (
                 <div className="space-y-4">
                    {automations.map(auto => (
                        <AutomationItem 
                            key={auto.id}
                            automation={auto}
                            onEdit={() => setEditingAutomation(auto)}
                            onDelete={() => handleDelete(auto.id)}
                            onToggle={(isEnabled) => onToggle(auto.id, isEnabled)}
                            users={users}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-white/50 dark:bg-surface-dark/50 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                    <BoltIcon className="w-20 h-20 mx-auto text-abz-primary/10 animate-pulse-glow" />
                    <h3 className="mt-4 text-lg font-semibold">No Automations Yet</h3>
                    <p className="text-slate-500 dark:text-slate-400">Click "New Automation" to create your first rule.</p>
                </div>
            )}
        </div>
    );
};

export default AutomationsView;
