

import React from 'react';
import Modal from '../shared/Modal';
import { AiSprintPlan, Task, User, AiTaskAssignment } from '../../types';
import { SparklesIcon, UserCircleIcon } from '../shared/icons';

interface AiSprintPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: AiSprintPlan | null;
    tasks: Task[];
    users: User[];
    onAccept: () => void;
}

const AiSprintPlanModal: React.FC<AiSprintPlanModalProps> = ({ isOpen, onClose, plan, tasks, users, onAccept }) => {
    if (!plan) return null;
    
    const tasksById = new Map(tasks.map(t => [t.id, t]));
    const usersById: Map<string, User> = new Map(users.map(u => [u.id, u]));

    const tasksInPlan = plan.sprintTaskIds
        .map(id => tasksById.get(id))
        .filter((t): t is Task => !!t);

    // Fix: Explicitly typing the Map ensures its values are correctly typed as `AiTaskAssignment`,
    // allowing TypeScript to correctly infer the type of `assignee` and prevent the 'unknown' type error.
    const assignmentsByTaskId: Map<string, AiTaskAssignment> = new Map(plan.taskAssignments.map(a => [a.taskId, a]));
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="AI Generated Sprint Plan">
             <div className="space-y-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <SparklesIcon className="w-6 h-6 text-abz-primary" />
                        <h3 className="text-lg font-bold">AI Rationale</h3>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-abz-ink p-3 rounded-lg border border-slate-200 dark:border-gray-700">
                        {plan.rationale}
                    </p>
                </div>
                <div>
                    <h3 className="text-lg font-bold mb-2">Proposed Sprint Backlog ({tasksInPlan.length} items)</h3>
                    <div className="max-h-80 overflow-y-auto space-y-3 pr-2">
                        {tasksInPlan.map(task => {
                            const assignment = assignmentsByTaskId.get(task.id);
                            const assignee = assignment ? usersById.get(assignment.assigneeId) : null;
                            return (
                                <div key={task.id} className="p-3 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-surface-dark">
                                    <p className="font-semibold text-sm">{task.title}</p>
                                    <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100 dark:border-gray-800">
                                        <div className="flex items-center gap-2 text-sm">
                                            <UserCircleIcon className="w-5 h-5 text-slate-400" />
                                            <span className="font-medium">{assignee?.name || 'Unassigned'}</span>
                                        </div>
                                        {assignment && (
                                            <div className="flex items-start gap-1 text-xs text-slate-500 dark:text-slate-400 italic">
                                                <SparklesIcon className="w-3 h-3 mt-0.5 flex-shrink-0 text-abz-primary"/>
                                                <span>{assignment.reason}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onAccept}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        Accept and Apply Plan
                    </button>
                </div>
             </div>
        </Modal>
    )
}

export default AiSprintPlanModal;
