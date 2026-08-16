
import { useState, useLayoutEffect } from 'react';

const APP_PREFIX = 'avalaos-core-v1';

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
    ORGANIZATION: `${APP_PREFIX}-organization`,
    AUDIT_LOGS: `${APP_PREFIX}-audit-logs`,
    HANDOFF_LEDGER: `${APP_PREFIX}-handoff-ledger`,
    ASSESS_PROCESSES: `${APP_PREFIX}-assess-processes`,
    ASSESSMENTS: `${APP_PREFIX}-assessments`,
    ASSESS_GOVERNANCE_CONFIG: `${APP_PREFIX}-assess-governance-config`,
};

let legacyProviderKeyCleanupAttempted = false;

/** One-way startup cleanup. This key is never read or used for AI execution. */
export const clearLegacyBrowserProviderKey = () => {
    if (legacyProviderKeyCleanupAttempted) return;
    legacyProviderKeyCleanupAttempted = true;
    try {
        localStorage.removeItem(StorageKeys.API_KEY);
    } catch {
        // Storage access can be unavailable; the application remains fail-closed.
    }
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

export function usePersistentState<T>(
    key: string,
    defaultValue: T,
    options: { enabled?: boolean } = {},
) {
    const enabled = options.enabled ?? true;
    const [state, setState] = useState<T>(() => (
        enabled ? StorageService.load(key, defaultValue) : defaultValue
    ));

    useLayoutEffect(() => {
        if (enabled) StorageService.save(key, state);
    }, [enabled, key, state]);

    return [state, setState] as const;
}
