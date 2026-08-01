import React from 'react';
import { User } from '../../../types';

interface WelcomeWidgetProps {
    currentUser: User;
}

const WelcomeWidget: React.FC<WelcomeWidgetProps> = ({ currentUser }) => {
    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <div className="rounded-[var(--av-radius-panel)] bg-[var(--av-color-brand-primary)] p-6 text-white shadow-[var(--av-shadow-sm)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">Role-based command center</p>
            <h2 className="mt-2 text-2xl font-bold">{getGreeting()}, {currentUser.name.split(' ')[0]}.</h2>
            <p className="mt-1 text-sm text-slate-200">Review the decisions, handoffs, and delivery signals that need your attention.</p>
        </div>
    );
};

export default WelcomeWidget;
