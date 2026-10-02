import { useState, useCallback, useEffect, useRef } from 'react';
import { AssessProcess } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { ALL_TEMPLATE_PACKS } from '../constants/starterPacks';
import { assessAdapter } from './adapters/assessAdapter';
import { useAuth } from '../components/auth/AuthProvider';
import { createContextRequestGate } from './contextRequestGate';
import { getRuntimeDataAccess, isLocalRuntimeEnabled } from './supabaseClient';
import { createProcessViaCommand } from './processCreationClient';
import { ProcessCreateError, PROCESS_CREATE_CAPABILITY, type ProcessCreateInput } from './processCreationContract';
import { announceProcessCreation, creationCompletionMatchesAuthority, processReadAuthorityKey, processScopeKey, subscribeProcessCreation, visibleProcessesForAuthority } from './processCreationServiceFence';

// Uncertain requests retain their original fields/key per actor/workspace, even
// if a different workspace is visited before exact replay can be reconciled.
const pendingProcessCreations = new Map<string,{ inputKey: string; anchor: { requestId: string; idempotencyKey: string; processId: string } }>();

export function useProcessService() {
    const { currentOrganization, currentWorkspace, tenantContext, sessionState } = useOrganizationContext();
    const { user } = useAuth();
    const [processes, setProcesses] = useState<AssessProcess[]>([]);
    const [loading, setLoading] = useState(false);
    const [settledContextKey, setSettledContextKey] = useState<string | null>(null);
    const requestGate = useRef(createContextRequestGate()).current;

    const authorizedKey = processReadAuthorityKey({
        actorId: user?.id, organizationId: currentOrganization?.id, workspaceId: currentWorkspace?.id,
        sessionState, tenantContext, localAuthority: isLocalRuntimeEnabled(),
    });
    const scopeKey = processScopeKey(user?.id,currentOrganization?.id,currentWorkspace?.id);
    const requestContext = authorizedKey && currentOrganization && currentWorkspace
        ? {
            actorId: user?.id,
            organizationId: currentOrganization.id,
            workspaceId: currentWorkspace.id,
        }
        : null;
    // Effects start after render. Treat a newly authorized or changed context as
    // loading immediately so route hydration cannot validate an entity against
    // the previous context's empty process collection before the fetch begins.
    const contextLoading = Boolean(authorizedKey && (loading || settledContextKey !== authorizedKey));
    const visibleProcesses = visibleProcessesForAuthority(processes,settledContextKey,authorizedKey);
    const latestAuthorityKey = useRef(authorizedKey);
    latestAuthorityKey.current = authorizedKey;

    const fetchProcesses = useCallback(async () => {
        if (!requestContext || !authorizedKey) {
            requestGate.invalidate();
            setProcesses([]);
            setLoading(false);
            setSettledContextKey(null);
            return;
        }
        const ticket = requestGate.start(requestContext);
        setProcesses([]);
        setLoading(true);
        try {
            const data = await assessAdapter.getProcesses(currentOrganization.id, currentWorkspace.id);
            if (requestGate.accepts(ticket, requestContext) && latestAuthorityKey.current === authorizedKey) setProcesses(data);
        } catch (err) {
            console.error('Failed to fetch processes:', err);
        } finally {
            if (requestGate.accepts(ticket, requestContext) && latestAuthorityKey.current === authorizedKey) {
                setSettledContextKey(authorizedKey);
                setLoading(false);
            }
        }
    }, [currentOrganization, currentWorkspace, requestGate, sessionState, user?.id, authorizedKey]);

    useEffect(() => {
        fetchProcesses();
    }, [fetchProcesses]);

    useEffect(() => subscribeProcessCreation(eventScope => {
        if (scopeKey && eventScope === scopeKey) void fetchProcesses();
    }), [scopeKey,fetchProcesses]);

    const createProcess = useCallback(async (data: Partial<AssessProcess>) => {
        if (!currentOrganization || !currentWorkspace || !user || !requestContext) throw new ProcessCreateError('AUTHENTICATION_REQUIRED');
        const creationFence = authorizedKey;
        if (!scopeKey || !creationFence) throw new ProcessCreateError('AUTHORITY_STALE');
        const input: ProcessCreateInput = {
            name: data.name ?? '', description: data.description ?? '', department: data.department ?? '',
            criticality: data.criticality ?? 'Medium', templateId: data.templateId,
        };
        if (getRuntimeDataAccess() === 'local') {
            const saved = await assessAdapter.createProcess({
                orgId: currentOrganization.id, workspaceId: currentWorkspace.id, ownerId: user.id,
                ...input, status: 'Not Started',
            });
            if (!creationCompletionMatchesAuthority(creationFence,latestAuthorityKey.current)) throw new ProcessCreateError('AUTHORITY_STALE');
            announceProcessCreation(scopeKey);
            return saved;
        }
        if (sessionState !== 'ready' || !tenantContext || tenantContext.userId !== user.id ||
            tenantContext.organizationId !== currentOrganization.id || tenantContext.workspaceId !== currentWorkspace.id ||
            !tenantContext.capabilities.includes(PROCESS_CREATE_CAPABILITY) || !tenantContext.capabilities.includes('assess.read')) {
            throw new ProcessCreateError('PERMISSION_DENIED');
        }
        const inputKey = JSON.stringify(input);
        const pending = pendingProcessCreations.get(scopeKey);
        if (pending && pending.inputKey !== inputKey) {
            throw new ProcessCreateError('COMMAND_UNAVAILABLE');
        }
        const savedAnchor = pending?.inputKey === inputKey ? pending.anchor : undefined;
        const anchor = savedAnchor ?? { requestId: crypto.randomUUID(), idempotencyKey: `process.create.${crypto.randomUUID()}`, processId: crypto.randomUUID() };
        pendingProcessCreations.set(scopeKey,{ inputKey, anchor });
        try {
            const { process } = await createProcessViaCommand(tenantContext, input, undefined, anchor);
            if (!creationCompletionMatchesAuthority(creationFence,latestAuthorityKey.current)) throw new ProcessCreateError('AUTHORITY_STALE');
            if (pendingProcessCreations.get(scopeKey)?.anchor.requestId === anchor.requestId) pendingProcessCreations.delete(scopeKey);
            announceProcessCreation(scopeKey);
            return process;
        } catch (error) {
            if (!(error instanceof ProcessCreateError && ['COMMAND_UNAVAILABLE','AUTHORITY_STALE','PERMISSION_DENIED'].includes(error.code)) &&
                pendingProcessCreations.get(scopeKey)?.anchor.requestId === anchor.requestId) pendingProcessCreations.delete(scopeKey);
            throw error;
        }
    }, [currentOrganization, currentWorkspace, requestContext, sessionState, tenantContext, user, authorizedKey, scopeKey]);

    const createProcessFromTemplate = useCallback(async (templateId: string) => {
        const template = ALL_TEMPLATE_PACKS.flatMap(pack => pack.templates).find(item => item.id === templateId);
        if (!template) throw new Error('Template not found');

        return createProcess({
            name: template.name,
            description: template.description,
            department: template.defaultFields.department || '',
            criticality: template.defaultFields.criticality || 'Medium',
            templateId,
        });
    }, [createProcess]);

    const getProcessById = useCallback((processId: string, orgId: string) => {
        return visibleProcesses.find(process => process.id === processId && process.orgId === orgId &&
            (process.workspaceId === currentWorkspace?.id || (isLocalRuntimeEnabled() && !process.workspaceId))) || null;
    }, [visibleProcesses,currentWorkspace?.id]);

    const updateProcess = useCallback(async (processId: string, updates: Partial<AssessProcess>) => {
        // Implement via adapter if needed, for now local update + sync
        setProcesses(prev => prev.map(p => p.id === processId ? { ...p, ...updates } : p));
    }, []);

    return {
        processes: visibleProcesses,
        loading: contextLoading,
        createProcess,
        createProcessFromTemplate,
        getProcessById,
        updateProcess,
        refreshProcesses: fetchProcesses
    };
}
