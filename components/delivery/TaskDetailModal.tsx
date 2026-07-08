import React, { useState, useEffect, useRef } from 'react';
import { Task, Project, Epic, User, TaskStatus, TaskPriority, UserStory, AcceptanceCriterion, Attachment, Comment as TaskComment, ALL_STATUSES, ALL_PRIORITIES } from '../../types';
import Modal from '../shared/Modal';

declare global {
    interface Window {
        mermaid: any;
        marked: any;
    }
}

import {
    SparklesIcon, ArrowPathIcon, EyeIcon, FireIcon, CheckCircleIcon, BanIcon, ClockIcon,
    ArrowUpIcon, MinusIcon, ArrowDownIcon, PencilIcon, TrashIcon, UserCircleIcon,
    CalendarDaysIcon, CubeIcon, ClipboardDocumentListIcon, ChatBubbleLeftIcon,
    PlusCircleIcon, PaperClipIcon, PhotoIcon, DocumentIcon, TableCellsIcon,
    DocumentTextIcon, FileIcon
} from '../shared/icons';


interface TaskDetailModalProps {
    task: Task;
    allTasks: Task[];
    project: Project | undefined;
    epic: Epic | undefined;
    users: User[];
    currentUser: User;
    onClose: () => void;
    onUpdateTask: (task: Task) => void;
    onAddTask: (task: Task) => void;
    onDeleteTask: (taskId: string) => void;
}

type ModalTab = 'Details' | 'Subtasks' | 'User Stories' | 'Comments' | 'History';

const statusMap: Record<TaskStatus, { icon: React.FC<{ className?: string }>, color: string, label: string }> = {
    "To Do": { icon: SparklesIcon, color: "text-slate-500", label: "To Do" },
    "In Progress": { icon: ArrowPathIcon, color: "text-abz-primary", label: "In Progress" },
    "In Review": { icon: EyeIcon, color: "text-abz-violet-500", label: "In Review" },
    "Testing": { icon: SparklesIcon, color: "text-abz-indigo-500", label: "Testing" },
    "Ready for Release": { icon: FireIcon, color: "text-abz-teal-500", label: "Ready for Release" },
    "Done": { icon: CheckCircleIcon, color: "text-abz-success", label: "Done" },
    "Blocked": { icon: BanIcon, color: "text-abz-warn", label: "Blocked" },
    "On Hold": { icon: ClockIcon, color: "text-abz-amber-500", label: "On Hold" },
};

const priorityMap: Record<TaskPriority, { icon: React.FC<{ className?: string }>, color: string, label: string }> = {
    "High": { icon: ArrowUpIcon, color: "text-abz-danger", label: "High" },
    "Medium": { icon: MinusIcon, color: "text-abz-warn", label: "Medium" },
    "Low": { icon: ArrowDownIcon, color: "text-slate-400", label: "Low" },
};

const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString);
    const correctedDate = new Date(date.valueOf() + date.getTimezoneOffset() * 60000); // Correct for timezone offset from YYYY-MM-DD
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(correctedDate);
};

const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
}

// ===================================
// Main Component
// ===================================
const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, allTasks, project, epic, users, currentUser, onClose, onUpdateTask, onAddTask, onDeleteTask }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedTask, setEditedTask] = useState<Task>(task);
    const [activeTab, setActiveTab] = useState<ModalTab>('Details');
    const [newComment, setNewComment] = useState("");

    useEffect(() => {
        // Only reset the whole modal state if the task ID changes (i.e., a new task is selected)
        setEditedTask(task);
        setIsEditing(false);
        setActiveTab('Details');
    }, [task.id]);

    useEffect(() => {
        // Keep editedTask in sync with external updates if not currently editing
        if (!isEditing) {
            setEditedTask(task);
        }
    }, [task, isEditing]);


    const handleUpdateAndSave = (updatedTask: Task) => {
        onUpdateTask(updatedTask);
        setEditedTask(updatedTask); // Keep local state in sync
    }

    const handleSaveDetails = () => {
        handleUpdateAndSave(editedTask);
        setIsEditing(false);
    };

    const handleCancelEdit = () => {
        setEditedTask(task); // Revert changes
        setIsEditing(false);
    };

    const handleAddComment = () => {
        if (newComment.trim() === '') return;
        const comment: TaskComment = {
            id: `com-${Date.now()}`,
            userId: currentUser.id,
            content: newComment,
            createdAt: new Date().toISOString()
        };
        const updatedTask = { ...editedTask, comments: [...(editedTask.comments || []), comment] };
        handleUpdateAndSave(updatedTask);
        setNewComment("");
    };

    const subtasks = allTasks.filter(t => t.parentId === task.id);

    const renderContent = () => {
        switch (activeTab) {
            case 'Details':
                return <DetailsTab task={task} epic={epic} project={project} users={users} isEditing={isEditing} editedTask={editedTask} setEditedTask={setEditedTask} onSave={handleSaveDetails} onCancel={handleCancelEdit} onSetEditing={setIsEditing} onDeleteTask={onDeleteTask} />;
            case 'Subtasks':
                return <SubtasksTab parentTask={editedTask} subtasks={subtasks} onUpdateParent={handleUpdateAndSave} onAddTask={onAddTask} onUpdateSubtask={onUpdateTask} onDeleteSubtask={onDeleteTask} />;
            case 'User Stories':
                return <UserStoriesTab task={editedTask} onUpdateTask={handleUpdateAndSave} />;
            case 'Comments':
                return <CommentsTab comments={editedTask.comments || []} users={users} newComment={newComment} onNewCommentChange={setNewComment} onAddComment={handleAddComment} />;
            case 'History':
                return <HistoryTab activityLog={editedTask.activityLog || []} users={users} />;
            default:
                return null;
        }
    }

    const tabItems: { name: ModalTab; icon: React.FC<{ className?: string }> }[] = [
        { name: 'Details', icon: PencilIcon },
        { name: 'Subtasks', icon: ClipboardDocumentListIcon },
        { name: 'User Stories', icon: ClipboardDocumentListIcon },
        { name: 'Comments', icon: ChatBubbleLeftIcon },
        { name: 'History', icon: ArrowPathIcon },
    ];

    return (
        <Modal isOpen={!!task} onClose={onClose} title={task.title}>
            {epic && (
                <div className="px-6 pb-2">
                    <span className="text-xs font-semibold inline-flex items-center px-2 py-0.5 rounded-full" style={{ backgroundColor: `${epic.color}20`, color: epic.color }}>
                        {epic.name}
                    </span>
                </div>
            )}
            <div className="border-b border-slate-200 dark:border-gray-700 mb-4 px-6">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {tabItems.map((tab) => {
                        if (tab.name === 'Subtasks' && task.type === 'Subtask') return null;
                        return (
                            <button
                                key={tab.name}
                                onClick={() => setActiveTab(tab.name)}
                                className={`whitespace-nowrap flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.name
                                    ? 'border-abz-primary text-abz-primary'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600'
                                    }`}
                            >
                                <tab.icon className="w-5 h-5" />
                                <span>{tab.name}</span>
                                {tab.name === 'Subtasks' && <span className="text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-1.5">{subtasks.length}</span>}
                            </button>
                        )
                    })}
                </nav>
            </div>
            <div className="px-6">
                {renderContent()}
            </div>
        </Modal>
    );
};

// ===================================
// Details Tab Component
// ===================================
interface DetailsTabProps {
    task: Task;
    epic: Epic | undefined;
    project: Project | undefined;
    users: User[];
    isEditing: boolean;
    editedTask: Task;
    setEditedTask: React.Dispatch<React.SetStateAction<Task>>;
    onSave: () => void;
    onCancel: () => void;
    onSetEditing: (isEditing: boolean) => void;
    onDeleteTask: (taskId: string) => void;
}
const DetailsTab: React.FC<DetailsTabProps> = ({ task, project, users, isEditing, editedTask, setEditedTask, onSave, onCancel, onSetEditing, onDeleteTask }) => {
    const assignees = users.filter(u => task.assigneeIds.includes(u.id));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setEditedTask(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value, 10) : value }));
    };

    const handleAssigneeChange = (userId: string) => {
        setEditedTask(prev => {
            const currentAssignees = prev.assigneeIds || [];
            const newAssignees = currentAssignees.includes(userId)
                ? currentAssignees.filter(id => id !== userId)
                : [...currentAssignees, userId];
            return { ...prev, assigneeIds: newAssignees };
        });
    };

    const handleDelete = () => {
        if (window.confirm('Remove this task from active delivery views? Retained lineage and audit metadata stay in source state.')) {
            onDeleteTask(task.id);
        }
    };

    if (isEditing) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="status" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                        <select id="status" name="status" value={editedTask.status} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary">
                            {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="priority" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
                        <select id="priority" name="priority" value={editedTask.priority} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary">
                            {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dueDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                        <input id="dueDate" type="date" name="dueDate" value={editedTask.dueDate} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" />
                    </div>
                </div>
                <div>
                    <label htmlFor="storyPoints" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Story Points</label>
                    <input type="number" id="storyPoints" name="storyPoints" value={editedTask.storyPoints || ''} onChange={handleChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" />
                </div>
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                    <textarea id="description" name="description" value={editedTask.description} onChange={handleChange} rows={4} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary"></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assignees</label>
                    <div className="mt-2 space-y-2 p-3 bg-slate-50 dark:bg-abz-ink-900 rounded-lg max-h-32 overflow-y-auto">
                        {users.map(user => (
                            <label key={user.id} className="flex items-center cursor-pointer">
                                <input type="checkbox" checked={editedTask.assigneeIds.includes(user.id)} onChange={() => handleAssigneeChange(user.id)} className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-abz-primary focus:ring-abz-primary bg-transparent" />
                                <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{user.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-4 mt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-semibold rounded-2xl focus:outline-none focus:ring-3 focus:ring-slate-400 btn-ghost">Cancel</button>
                    <button type="button" onClick={onSave} className="px-4 py-2 text-sm font-semibold rounded-2xl btn-primary">Save Changes</button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <MetadataItem icon={statusMap[task.status].icon} color={statusMap[task.status].color} label="Status" value={task.status} />
                <MetadataItem icon={priorityMap[task.priority].icon} color={priorityMap[task.priority].color} label="Priority" value={task.priority} />
                <MetadataItem icon={CalendarDaysIcon} label="Due Date" value={formatDateForDisplay(task.dueDate)} />
                <MetadataItem icon={CubeIcon} label="Project" value={project?.name || 'N/A'} />
            </div>
            {task.storyPoints !== undefined && (
                <div>
                    <h3 className="text-md font-semibold mb-2">Story Points</h3>
                    <div className="text-sm font-bold bg-slate-100 dark:bg-gray-700 rounded-full h-8 w-8 flex items-center justify-center">
                        {task.storyPoints}
                    </div>
                </div>
            )}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-md font-semibold">Description</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onSetEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-abz-ink-900 rounded-lg hover:bg-slate-200 dark:hover:bg-gray-800 focus:outline-none focus:ring-3 focus:ring-abz-primary transition-all">
                            <PencilIcon className="w-4 h-4" /> Edit
                        </button>
                        <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-abz-danger bg-abz-danger/10 rounded-lg hover:bg-abz-danger/20 focus:outline-none focus:ring-3 focus:ring-abz-danger transition-all">
                            <TrashIcon className="w-4 h-4" /> Remove
                        </button>
                    </div>
                </div>
                <div className="prose dark:prose-invert max-w-none text-sm text-slate-600 dark:text-slate-300">
                    {window.marked ? (
                        <div dangerouslySetInnerHTML={{ __html: window.marked.parse(task.description || 'No description provided.') }} />
                    ) : (
                        <p className="whitespace-pre-wrap">{task.description || 'No description provided.'}</p>
                    )}
                </div>
            </div>
            <div>
                <h3 className="text-md font-semibold mb-2">Assignees</h3>
                <div className="flex flex-wrap gap-4">
                    {assignees.map(user => (
                        <div key={user.id} className="flex items-center gap-2">
                            <UserCircleIcon className="w-8 h-8 text-slate-400" />
                            <span className="text-sm font-medium">{user.name}</span>
                        </div>
                    ))}
                    {assignees.length === 0 && <p className="text-sm text-slate-500">Unassigned</p>}
                </div>
            </div>
        </div>
    );
};

const MetadataItem: React.FC<{ icon: React.FC<{ className?: string }>, color?: string, label: string, value: string }> = ({ icon: Icon, color = "text-slate-500 dark:text-slate-400", label, value }) => (
    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-abz-ink-900 rounded-lg">
        <Icon className={`w-5 h-5 ${color}`} />
        <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <p className="font-semibold truncate">{value}</p>
        </div>
    </div>
);

// ===================================
// Subtasks Tab Component
// ===================================
interface SubtasksTabProps {
    parentTask: Task;
    subtasks: Task[];
    onUpdateParent: (task: Task) => void;
    onAddTask: (task: Task) => void;
    onUpdateSubtask: (task: Task) => void;
    onDeleteSubtask: (taskId: string) => void;
}

const SubtaskItem: React.FC<{ subtask: Task; onUpdate: (updatedTask: Task) => void; onDelete: (taskId: string) => void }> = ({ subtask, onUpdate, onDelete }) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [title, setTitle] = useState(subtask.title);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditingTitle) {
            inputRef.current?.focus();
        }
    }, [isEditingTitle]);

    const handleTitleSave = () => {
        if (title.trim() && title !== subtask.title) {
            onUpdate({ ...subtask, title });
        }
        setIsEditingTitle(false);
    };

    const handleStatusChange = (newStatus: TaskStatus) => {
        onUpdate({ ...subtask, status: newStatus });
    };

    const handleDelete = () => {
        if (window.confirm('Are you sure you want to delete this subtask?')) {
            onDelete(subtask.id);
        }
    }

    return (
        <div className="group p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-abz-ink-900 flex items-center gap-3">
            <input
                type="checkbox"
                checked={subtask.status === 'Done'}
                onChange={(e) => handleStatusChange(e.target.checked ? 'Done' : 'To Do')}
                className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary flex-shrink-0"
            />
            {isEditingTitle ? (
                <input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={e => e.key === 'Enter' && handleTitleSave()}
                    className="flex-1 font-medium text-sm bg-white dark:bg-abz-ink-900 border rounded px-1 -m-1"
                />
            ) : (
                <span onClick={() => setIsEditingTitle(true)} className={`flex-1 font-medium text-sm cursor-pointer ${subtask.status === 'Done' ? 'line-through text-slate-500' : ''}`}>
                    {subtask.title}
                </span>
            )}
            <button onClick={handleDelete} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-abz-danger rounded-full transition-opacity">
                <TrashIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

const SubtasksTab: React.FC<SubtasksTabProps> = ({ parentTask, subtasks, onUpdateParent, onAddTask, onUpdateSubtask, onDeleteSubtask }) => {
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

    const handleAddSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && newSubtaskTitle.trim()) {
            const newSubtask: Task = {
                id: `subtask-${Date.now()}`,
                title: newSubtaskTitle.trim(),
                description: '',
                status: 'To Do',
                priority: 'Medium',
                projectId: parentTask.projectId,
                assigneeIds: [],
                startDate: new Date().toISOString().split('T')[0],
                dueDate: parentTask.dueDate,
                type: 'Subtask',
                parentId: parentTask.id,
            };
            onAddTask(newSubtask);
            setNewSubtaskTitle('');
        }
    };

    return (
        <div className="space-y-1">
            {subtasks.map(subtask => (
                <SubtaskItem key={subtask.id} subtask={subtask} onUpdate={onUpdateSubtask} onDelete={onDeleteSubtask} />
            ))}
            <div className="flex items-center gap-3 p-2">
                <PlusCircleIcon className="w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={handleAddSubtask}
                    placeholder="Add a new subtask..."
                    className="w-full text-sm bg-transparent border-none focus:ring-0 p-0 placeholder-slate-400"
                />
            </div>
        </div>
    );
};

// ===================================
// User Stories Tab Component
// ===================================
interface UserStoriesTabProps {
    task: Task;
    onUpdateTask: (task: Task) => void;
}
const UserStoriesTab: React.FC<UserStoriesTabProps> = ({ task, onUpdateTask }) => {
    const [editingStoryId, setEditingStoryId] = useState<string | null>(null);

    const handleUpdateStory = (updatedStory: UserStory) => {
        const updatedStories = (task.userStories || []).map(s => s.id === updatedStory.id ? updatedStory : s);
        onUpdateTask({ ...task, userStories: updatedStories });
        setEditingStoryId(null);
    };

    const handleAcChange = (storyId: string, acId: string, updates: Partial<AcceptanceCriterion>) => {
        const updatedStories = (task.userStories || []).map(s => {
            if (s.id === storyId) {
                const updatedAc = (s.acceptanceCriteria || []).map(ac => ac.id === acId ? { ...ac, ...updates } : ac);
                return { ...s, acceptanceCriteria: updatedAc };
            }
            return s;
        });
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleAddAc = (storyId: string) => {
        const newAc: AcceptanceCriterion = { id: `ac-${Date.now()}`, text: 'New criterion...', completed: false };
        const updatedStories = (task.userStories || []).map(s => {
            if (s.id === storyId) {
                return { ...s, acceptanceCriteria: [...(s.acceptanceCriteria || []), newAc] };
            }
            return s;
        });
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleDeleteAc = (storyId: string, acId: string) => {
        if (!window.confirm("Are you sure you want to delete this criterion?")) return;

        const updatedStories = (task.userStories || []).map(s => {
            if (s.id === storyId) {
                const updatedAc = (s.acceptanceCriteria || []).filter(ac => ac.id !== acId);
                return { ...s, acceptanceCriteria: updatedAc };
            }
            return s;
        });
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleAddAttachment = (storyId: string, file: File) => {
        const newAttachment: Attachment = {
            id: `att-${Date.now()}`,
            fileName: file.name,
            fileType: file.type.split('/')[0] === 'image' ? 'Image' : file.type.includes('pdf') ? 'PDF' : file.type.includes('sheet') ? 'Excel' : 'Word',
            fileSize: `${(file.size / 1024).toFixed(1)} KB`,
            url: '#',
        };
        const updatedStories = (task.userStories || []).map(s => {
            if (s.id === storyId) {
                return { ...s, attachments: [...(s.attachments || []), newAttachment] };
            }
            return s;
        });
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleDeleteAttachment = (storyId: string, attachmentId: string) => {
        if (!window.confirm("Are you sure you want to delete this attachment?")) return;

        const updatedStories = (task.userStories || []).map(s => {
            if (s.id === storyId) {
                const updatedAttachments = (s.attachments || []).filter(att => att.id !== attachmentId);
                return { ...s, attachments: updatedAttachments };
            }
            return s;
        });
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleAddStory = () => {
        const newStory: UserStory = {
            id: `us-${Date.now()}`,
            asA: 'New User Role',
            iWant: 'a new feature',
            soThat: 'I can achieve a new goal',
            acceptanceCriteria: [],
        };
        const updatedStories = [...(task.userStories || []), newStory];
        onUpdateTask({ ...task, userStories: updatedStories });
    };

    const handleDeleteStory = (storyId: string) => {
        if (window.confirm('Are you sure you want to delete this user story?')) {
            const updatedStories = (task.userStories || []).filter(s => s.id !== storyId);
            onUpdateTask({ ...task, userStories: updatedStories });
        }
    };

    return (
        <div className="space-y-4">
            {(task.userStories || []).length > 0 ? (
                (task.userStories || []).map(story => (
                    <UserStoryItem
                        key={story.id}
                        story={story}
                        isEditing={editingStoryId === story.id}
                        onEdit={() => setEditingStoryId(story.id)}
                        onCancel={() => setEditingStoryId(null)}
                        onSave={handleUpdateStory}
                        onAcChange={handleAcChange}
                        onAddAc={handleAddAc}
                        onDeleteAc={handleDeleteAc}
                        onAddAttachment={handleAddAttachment}
                        onDeleteAttachment={handleDeleteAttachment}
                        onDelete={() => handleDeleteStory(story.id)}
                    />
                ))
            ) : (
                <p className="text-center text-sm text-slate-500 py-4">No user stories for this item.</p>
            )}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-gray-700">
                <button
                    onClick={handleAddStory}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium btn-primary"
                >
                    <PlusCircleIcon className="w-5 h-5" />
                    Add User Story
                </button>
            </div>
        </div>
    );
};

// ===================================
// User Story Item Component
// ===================================
interface UserStoryItemProps {
    story: UserStory;
    isEditing: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: (story: UserStory) => void;
    onAcChange: (storyId: string, acId: string, updates: Partial<AcceptanceCriterion>) => void;
    onAddAc: (storyId: string) => void;
    onDeleteAc: (storyId: string, acId: string) => void;
    onAddAttachment: (storyId: string, file: File) => void;
    onDeleteAttachment: (storyId: string, attachmentId: string) => void;
    onDelete: () => void;
}
const UserStoryItem: React.FC<UserStoryItemProps> = ({ story, isEditing, onEdit, onCancel, onSave, onAcChange, onAddAc, onDeleteAc, onAddAttachment, onDeleteAttachment, onDelete }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [editedStory, setEditedStory] = useState(story);

    useEffect(() => {
        setEditedStory(story);
    }, [story]);

    const handleFieldChange = (field: keyof UserStory, value: string) => {
        setEditedStory(prev => ({ ...prev, [field]: value }));
    };

    const commonInputClass = "w-full text-sm p-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary";

    if (isEditing) {
        return (
            <div className="p-4 border border-abz-primary rounded-lg text-sm shadow-md">
                <div className="space-y-3">
                    <div className="flex items-start gap-2">
                        <label htmlFor={`asA-${story.id}`} className="font-semibold text-slate-500 mt-2">As a</label>
                        <input id={`asA-${story.id}`} type="text" value={editedStory.asA} onChange={e => handleFieldChange('asA', e.target.value)} className={commonInputClass} />
                    </div>
                    <div className="flex items-start gap-2">
                        <label htmlFor={`iWant-${story.id}`} className="font-semibold text-slate-500 mt-2">I want</label>
                        <textarea id={`iWant-${story.id}`} value={editedStory.iWant} onChange={e => handleFieldChange('iWant', e.target.value)} className={commonInputClass} rows={2}></textarea>
                    </div>
                    <div className="flex items-start gap-2">
                        <label htmlFor={`soThat-${story.id}`} className="font-semibold text-slate-500 mt-2">So that</label>
                        <textarea id={`soThat-${story.id}`} value={editedStory.soThat} onChange={e => handleFieldChange('soThat', e.target.value)} className={commonInputClass} rows={2}></textarea>
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-4 mt-4 border-t border-slate-200 dark:border-gray-700">
                    <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold rounded-2xl focus:outline-none focus:ring-3 focus:ring-slate-400 btn-ghost">Cancel</button>
                    <button onClick={() => onSave(editedStory)} className="px-4 py-2 text-sm font-semibold rounded-2xl btn-primary">Save Story</button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 border border-slate-200 dark:border-gray-700 rounded-lg text-sm group relative">
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={onEdit}
                    className="p-1.5 text-slate-400 hover:text-abz-primary rounded-full bg-white dark:bg-surface-dark/80 backdrop-blur-sm"
                    title="Edit user story"
                >
                    <PencilIcon className="w-4 h-4" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1.5 text-slate-400 hover:text-abz-danger rounded-full bg-white dark:bg-surface-dark/80 backdrop-blur-sm"
                    title="Delete user story"
                >
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
            <p><span className="font-semibold text-slate-500">As a</span> {story.asA}</p>
            <p className="mt-1"><span className="font-semibold text-slate-500">I want</span> {story.iWant}</p>
            <p className="mt-1"><span className="font-semibold text-slate-500">So that</span> {story.soThat}</p>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-gray-700">
                <h4 className="font-semibold mb-2">Acceptance Criteria</h4>
                <div className="space-y-1">
                    {(story.acceptanceCriteria || []).map(ac => (
                        <div key={ac.id} className="flex items-start gap-2 group/ac -ml-1">
                            <input type="checkbox" checked={ac.completed} onChange={(e) => onAcChange(story.id, ac.id, { completed: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-abz-primary focus:ring-abz-primary flex-shrink-0 mt-1" />
                            <input
                                type="text"
                                value={ac.text}
                                onChange={(e) => onAcChange(story.id, ac.id, { text: e.target.value })}
                                placeholder="Describe acceptance criterion..."
                                className="flex-1 bg-transparent border-0 rounded p-1 -ml-1 w-full focus:bg-white dark:focus:bg-abz-ink-900 focus:ring-1 focus:ring-abz-primary transition-shadow"
                            />
                            <button
                                onClick={() => onDeleteAc(story.id, ac.id)}
                                className="p-1 text-slate-400 hover:text-abz-danger rounded-full opacity-0 group-hover/ac:opacity-100"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    <button onClick={() => onAddAc(story.id)} className="flex items-center gap-2 text-sm text-abz-primary font-medium mt-2"><PlusCircleIcon className="w-4 h-4" /> Add Criterion</button>
                </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-gray-700">
                <h4 className="font-semibold mb-2 flex items-center justify-between">
                    <span>Attachments</span>
                    <button onClick={() => fileInputRef.current?.click()} className="p-1 text-slate-400 hover:text-abz-primary rounded-full"><PaperClipIcon className="w-4 h-4" /></button>
                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files && onAddAttachment(story.id, e.target.files[0])} />
                </h4>
                <div className="space-y-1">
                    {(story.attachments || []).map(att => <AttachmentItem key={att.id} attachment={att} onDelete={() => onDeleteAttachment(story.id, att.id)} />)}
                </div>
            </div>
        </div>
    );
};

// ===================================
// Attachment Item Component
// ===================================
const getFileIcon = (fileType: string) => {
    if (fileType.includes('Image')) return <PhotoIcon className="w-5 h-5 text-slate-500" />;
    if (fileType.includes('PDF')) return <DocumentIcon className="w-5 h-5 text-red-500" />;
    if (fileType.includes('Excel')) return <TableCellsIcon className="w-5 h-5 text-green-500" />;
    if (fileType.includes('Word')) return <DocumentTextIcon className="w-5 h-5 text-[#002C4B] dark:text-[#ffcf45]" />;
    return <FileIcon className="w-5 h-5 text-slate-500" />;
};

const AttachmentItem: React.FC<{ attachment: Attachment; onDelete: () => void; }> = ({ attachment, onDelete }) => (
    <div className="flex items-center gap-3 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-abz-ink-900 group">
        {getFileIcon(attachment.fileType)}
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium flex-1 truncate">{attachment.fileName}</a>
        <span className="text-xs text-slate-400">{attachment.fileSize}</span>
        <button onClick={onDelete} className="p-1 text-slate-400 hover:text-abz-danger rounded-full opacity-0 group-hover:opacity-100"><TrashIcon className="w-4 h-4" /></button>
    </div>
);


// ===================================
// Comments Tab Component
// ===================================
interface CommentsTabProps {
    comments: TaskComment[];
    users: User[];
    newComment: string;
    onNewCommentChange: (value: string) => void;
    onAddComment: () => void;
}
const CommentsTab: React.FC<CommentsTabProps> = ({ comments, users, newComment, onNewCommentChange, onAddComment }) => {
    const getUser = (id: string) => users.find(u => u.id === id);
    return (
        <div>
            <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                {comments.map(comment => {
                    const user = getUser(comment.userId);
                    return (
                        <div key={comment.id} className="flex items-start gap-3">
                            <UserCircleIcon className="w-8 h-8 text-slate-400 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="bg-slate-100 dark:bg-abz-ink-900 p-3 rounded-lg">
                                    <div className="flex items-baseline justify-between">
                                        <p className="font-semibold text-sm">{user?.name || 'Unknown User'}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(comment.createdAt)}</p>
                                    </div>
                                    <p className="text-sm mt-1">{comment.content}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {comments.length === 0 && <p className="text-center text-sm text-slate-500 py-4">No comments yet.</p>}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                <textarea value={newComment} onChange={e => onNewCommentChange(e.target.value)} placeholder="Add a comment..." rows={3} className="w-full text-sm p-2 bg-white dark:bg-surface-dark rounded-md border border-slate-300 dark:border-gray-600 focus:ring-abz-primary focus:border-abz-primary"></textarea>
                <button onClick={onAddComment} className="mt-2 btn-primary">Post Comment</button>
            </div>
        </div>
    );
};

// ===================================
// History Tab Component
// ===================================
interface HistoryTabProps {
    activityLog: Task['activityLog'];
    users: User[];
}
const HistoryTab: React.FC<HistoryTabProps> = ({ activityLog, users }) => {
    const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown User';
    return (
        <div className="space-y-4">
            {[...(activityLog || [])].reverse().map(activity => (
                <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <UserCircleIcon className="w-6 h-6 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-slate-600 dark:text-slate-300">
                            <span className="font-semibold">{getUserName(activity.userId)}</span> {activity.change}
                            {activity.previousValue && activity.newValue && (
                                <> from <span className="font-medium italic">{activity.previousValue}</span> to <span className="font-medium italic">{activity.newValue}</span></>
                            )}
                            .
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{formatRelativeTime(activity.createdAt)}</p>
                    </div>
                </div>
            ))}
            {(!activityLog || activityLog.length === 0) && <p className="text-center text-sm text-slate-500 py-4">No activity history for this task.</p>}
        </div>
    );
};


export default TaskDetailModal;
