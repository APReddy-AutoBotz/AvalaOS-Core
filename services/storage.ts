
import { useState, useEffect } from 'react';

const APP_PREFIX = 'klarity-pm-v1';

export const StorageKeys = {
    THEME: `${APP_PREFIX}-theme`,
    CURRENT_USER: `${APP_PREFIX}-current-user`,
    SCOPE: `${APP_PREFIX}-scope`,
    VIEW: `${APP_PREFIX}-view`,
    TASKS: `${APP_PREFIX}-tasks`,
    PROJECTS: `${APP_PREFIX}-projects`,
    EPICS: `${APP_PREFIX}-epics`,
    SPRINTS: `${APP_PREFIX}-sprints`,
    TEAMS: `${APP_PREFIX}-teams`,
    USERS: `${APP_PREFIX}-users`,
    DOC_TEMPLATES: `${APP_PREFIX}-doc-templates`,
    AUTOMATIONS: `${APP_PREFIX}-automations`,
    TIMESHEETS: `${APP_PREFIX}-timesheets`,
    DOC_GENERATIONS: `${APP_PREFIX}-doc-generations`,
    API_KEY: `${APP_PREFIX}-api-key`,
    AI_PROVIDER: `${APP_PREFIX}-ai-provider`,
};

export class StorageService {
    static load<T>(key: string, defaultValue: T): T {
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (e) {
            console.error(`Failed to load key ${key}`, e);
            return defaultValue;
        }
    }

    static save<T>(key: string, value: T): void {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error(`Failed to save key ${key}`, e);
        }
    }

    static clear(): void {
        localStorage.clear();
        window.location.reload();
    }
}

export function usePersistentState<T>(key: string, defaultValue: T) {
    const [state, setState] = useState<T>(() => {
        return StorageService.load(key, defaultValue);
    });

    useEffect(() => {
        StorageService.save(key, state);
    }, [key, state]);

    return [state, setState] as const;
}
