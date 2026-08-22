
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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
    static load<T>(key: string, defaultValue: T, preserveMissing = false): T {
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : preserveMissing ? null as T : defaultValue;
        } catch (e) {
            console.error(`Failed to load key ${key}`, e);
            return preserveMissing ? null as T : defaultValue;
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
        enabled ? StorageService.load(key, defaultValue, key === StorageKeys.SCOPE || key === StorageKeys.VIEW) : defaultValue
    ));
    const latestState = useRef(state);

    const setPersistentState = useCallback((nextState: T | ((previous: T) => T)) => {
        const resolved = typeof nextState === 'function'
            ? (nextState as (previous: T) => T)(latestState.current)
            : nextState;
        latestState.current = resolved;
        if (enabled) StorageService.save(key, resolved);
        setState(resolved);
    }, [enabled, key]);

    useLayoutEffect(() => {
        latestState.current = state;
    }, [enabled, key, state]);

    return [state, setPersistentState] as const;
}
