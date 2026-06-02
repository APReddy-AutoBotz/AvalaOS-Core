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
        <div className="p-6 rounded-2xl bg-gradient-to-r from-abz-indigo-600 to-abz-violet-500 text-white shadow-lg">
            <h2 className="text-2xl font-bold">{getGreeting()}, {currentUser.name.split(' ')[0]}!</h2>
            <p className="mt-1 opacity-80">Here's your personalized dashboard for today. Let's make things happen.</p>
        </div>
    );
};

export default WelcomeWidget;
