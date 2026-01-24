import React from 'react';
import { CogIcon } from '../icons';

interface WidgetWrapperProps {
    icon: React.FC<{ className: string }>;
    title: string;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    isConfigurable?: boolean;
    isConfiguring?: boolean;
    onToggleConfigure?: () => void;
    childrenConfig?: React.ReactNode;
}

const WidgetWrapper: React.FC<WidgetWrapperProps> = ({
    icon: Icon, title, children, className, contentClassName = "p-4",
    isConfigurable, isConfiguring, onToggleConfigure, childrenConfig
}) => {
    return (
        <div className={`card h-full flex flex-col ${className}`}>
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-200/80 dark:border-gray-800/60">
                <div className="flex items-center gap-3">
                    <Icon className="w-6 h-6 text-abz-primary" />
                    <h3 className="font-bold text-md text-text-light dark:text-text-dark">{title}</h3>
                </div>
                {isConfigurable && (
                    <button onClick={onToggleConfigure} className={`p-1.5 rounded-full transition-colors ${isConfiguring ? 'bg-abz-primary/10 text-abz-primary' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>
                        <CogIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
            {isConfiguring && childrenConfig && (
                <div className="p-4 border-b border-slate-200/80 dark:border-gray-800/60 bg-slate-50 dark:bg-abz-ink">
                    {childrenConfig}
                </div>
            )}
            <div className={`flex-1 ${contentClassName}`}>
                {children}
            </div>
        </div>
    );
};

export default WidgetWrapper;
