import React, { useState, useEffect } from 'react';
import { User, Task, Project, AiInsight } from '../../../types';
import WidgetWrapper from './WidgetWrapper';
import {
    SparklesIcon, ArrowPathIcon, ExclamationTriangleIcon, LightBulbIcon,
    ChatBubbleLeftIcon, BoltIcon
} from '../icons';

interface AiInsightsWidgetProps {
    currentUser: User;
    tasks: Task[];
    projects: Project[];
}

const insightTypeMap: Record<AiInsight['type'], { icon: React.FC<{ className: string }>, color: string }> = {
    'risk': { icon: ExclamationTriangleIcon, color: 'text-abz-red-500' },
    'priority': { icon: LightBulbIcon, color: 'text-abz-amber-500' },
    'summary': { icon: ChatBubbleLeftIcon, color: 'text-abz-azure-500' },
    'bottleneck': { icon: BoltIcon, color: 'text-abz-violet-500' },
};

const AiInsightsWidget: React.FC<AiInsightsWidgetProps> = ({ currentUser, tasks, projects }) => {
    const [insights, setInsights] = useState<AiInsight[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchInsights = async () => {
        setIsLoading(true);
        setError(null);
        setInsights([]);
        setError('Monitor insights are not enabled in this workspace. Assessment, Studio drafting, Delivery, and handoff evidence remain available for review.');
        setIsLoading(false);
    };

    useEffect(() => {
        fetchInsights();
    }, []); // Fetch on initial render

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="space-y-3">
                    {[...Array(2)].map((_, i) => (
                        <div key={i} className="p-3 rounded-lg bg-slate-100 dark:bg-abz-ink animate-pulse">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mt-1"></div>
                        </div>
                    ))}
                </div>
            );
        }

        if (error) {
            return (
                <div className="p-4 text-center">
                    <ExclamationTriangleIcon className="w-10 h-10 mx-auto text-abz-amber-500 mb-2" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {error}
                    </p>
                    <button
                        onClick={fetchInsights}
                        className="mt-2 text-xs text-abz-primary hover:underline"
                    >
                        Recheck
                    </button>
                </div>
            );
        }

        if (insights.length === 0) {
            return (
                <div className="text-center py-8">
                    <SparklesIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
                    <h4 className="mt-4 font-semibold">No monitor signals yet.</h4>
                    <p className="text-sm text-slate-500">Handoff and delivery activity will appear here when available.</p>
                </div>
            )
        }

        return (
            <div className="space-y-3">
                {insights.map((insight, index) => {
                    const config = insightTypeMap[insight.type] || { icon: SparklesIcon, color: 'text-abz-primary' };
                    const Icon = config.icon;
                    return (
                        <div key={index} className="p-3 rounded-lg bg-slate-50 dark:bg-abz-ink border border-slate-200/80 dark:border-gray-800/60">
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={`w-5 h-5 ${config.color}`} />
                                <h4 className="font-bold text-sm">{insight.title}</h4>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300">{insight.content}</p>
                        </div>
                    );
                })}
            </div>
        )
    }

    return (
        <WidgetWrapper icon={SparklesIcon} title="Monitor Insights" isConfigurable={false}>
            <div className="relative">
                <button onClick={fetchInsights} disabled={isLoading} className="absolute top-[-48px] right-[10px] p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
                {renderContent()}
            </div>
        </WidgetWrapper>
    );
};

export default AiInsightsWidget;
