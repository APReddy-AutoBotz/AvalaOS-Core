import React, { useState, useRef, useEffect } from 'react';
import { PlusCircleIcon } from '../shared/icons';

interface InlineTaskCreatorProps {
    onAddTask: (title: string) => void | boolean | Promise<boolean>;
    buttonText: string;
    className?: string;
}

const InlineTaskCreator: React.FC<InlineTaskCreatorProps> = ({ onAddTask, buttonText, className }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleSave = async () => {
        if (!title.trim() || submitting) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const result = await onAddTask(title.trim());
            if (result === false) {
                setSubmitError('The task result could not be confirmed. Keep this title and retry.');
                return;
            }
            setTitle('');
            setIsEditing(false);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'The task result could not be confirmed. Keep this title and retry.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        if (submitting) return;
        setTitle('');
        setIsEditing(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!submitting && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                handleCancel();
            }
        };

        if (isEditing) {
            textareaRef.current?.focus();
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing, submitting]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSave();
        }
        if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (isEditing) {
        return (
            <div ref={containerRef} className={`p-2 ${className}`}>
                <div className="bg-white dark:bg-surface-dark p-2 rounded-xl shadow-md border border-slate-300 dark:border-gray-600">
                    <textarea
                        ref={textareaRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter a title for this task..."
                        disabled={submitting}
                        className="w-full text-sm bg-transparent border-none focus:ring-0 p-1 resize-none placeholder-slate-400"
                        rows={3}
                    />
                </div>
                {submitError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300">{submitError}</p>}
                 <div className="flex items-center gap-2 mt-2">
                    <button disabled={submitting} onClick={() => void handleSave()} className="px-3 py-1.5 text-sm font-semibold text-white bg-abz-primary rounded-lg hover:bg-opacity-90 disabled:opacity-50">{submitting ? 'Adding…' : 'Add'}</button>
                    <button disabled={submitting} onClick={handleCancel} className="px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-abz-ink rounded-lg disabled:opacity-50">Cancel</button>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => setIsEditing(true)}
            className={`flex items-center gap-2 p-2 w-full text-left text-sm font-medium text-slate-500 hover:text-abz-primary dark:text-slate-400 dark:hover:text-abz-accent rounded-lg hover:bg-slate-100 dark:hover:bg-abz-ink transition-colors ${className}`}
        >
            <PlusCircleIcon className="w-5 h-5" />
            <span>{buttonText}</span>
        </button>
    );
};

export default InlineTaskCreator;
