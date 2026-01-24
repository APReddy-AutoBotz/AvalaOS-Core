import React, { useState, useRef, useEffect } from 'react';
import { PlusCircleIcon } from './icons';

interface InlineTaskCreatorProps {
    onAddTask: (title: string) => void;
    buttonText: string;
    className?: string;
}

const InlineTaskCreator: React.FC<InlineTaskCreatorProps> = ({ onAddTask, buttonText, className }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing) {
            textareaRef.current?.focus();
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing]);

    const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
            handleCancel();
        }
    };

    const handleSave = () => {
        if (title.trim()) {
            onAddTask(title.trim());
        }
        setTitle('');
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTitle('');
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
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
                        className="w-full text-sm bg-transparent border-none focus:ring-0 p-1 resize-none placeholder-slate-400"
                        rows={3}
                    />
                </div>
                 <div className="flex items-center gap-2 mt-2">
                    <button onClick={handleSave} className="px-3 py-1.5 text-sm font-semibold text-white bg-abz-primary rounded-lg hover:bg-opacity-90">Add</button>
                    <button onClick={handleCancel} className="px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-abz-ink rounded-lg">Cancel</button>
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
