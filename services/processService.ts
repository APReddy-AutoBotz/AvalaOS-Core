import { useState, useCallback, useEffect, useRef } from 'react';
import { AssessProcess } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { ALL_TEMPLATE_PACKS } from '../constants/starterPacks';
import { assessAdapter } from './adapters/assessAdapter';
import { useAuth } from '../components/auth/AuthProvider';
import { clientRequestContextIsLoading, clientRequestContextKey, createContextRequestGate } from './contextRequestGate';

export function useProcessService() {
    const { currentOrganization, currentWorkspace, sessionState } = useOrganizationContext();
    const { user } = useAuth();
    const [processes, setProcesses] = useState<AssessProcess[]>([]);
    const [loading, setLoading] = useState(false);
    const [settledContextKey, setSettledContextKey] = useState<string | null>(null);
    const requestGate = useRef(createContextRequestGate()).current;

    const requestContext = currentOrganization && currentWorkspace && ['ready', 'read_only'].includes(sessionState)
        ? {
            actorId: user?.id,
            organizationId: currentOrganization.id,
            workspaceId: currentWorkspace.id,
        }
        : null;
    // Effects start after render. Treat a newly authorized or changed context as
    // loading immediately so route hydration cannot validate an entity against
    // the previous context's empty process collection before the fetch begins.
    const contextLoading = clientRequestContextIsLoading(requestContext, settledContextKey, loading);

    const fetchProcesses = useCallback(async () => {
        if (!requestContext) {
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
            if (requestGate.accepts(ticket, requestContext)) setProcesses(data);
        } catch (err) {
            console.error('Failed to fetch processes:', err);
        } finally {
            if (requestGate.accepts(ticket, requestContext)) {
                setSettledContextKey(clientRequestContextKey(requestContext));
                setLoading(false);
            }
        }
    }, [currentOrganization, currentWorkspace, requestGate, sessionState, user?.id]);

    useEffect(() => {
        fetchProcesses();
    }, [fetchProcesses]);

    const checkCreationLimit = useCallback(() => {
        if (!currentOrganization) return { allowed: false, error: 'Organization context not found.' };
        
        // This logic should ideally be moved to the backend or provider
        const maxProcesses = currentOrganization.subscriptionTier === 'Free_Trial' ? 10 : 1000;
        if (processes.length >= maxProcesses) {
            return {
                allowed: false,
                error: `Limit Reached. You can only create up to ${maxProcesses} processes.`
            };
        }
        return { allowed: true };
    }, [currentOrganization, processes.length]);

    const createProcess = useCallback(async (data: Partial<AssessProcess>) => {
        if (!currentOrganization || !user) throw new Error('Auth required');
        
        const limitCheck = checkCreationLimit();
        if (!limitCheck.allowed) throw new Error(limitCheck.error);

        const newProcessData: Omit<AssessProcess, 'id' | 'createdAt' | 'updatedAt'> = {
            orgId: currentOrganization.id,
            workspaceId: currentWorkspace?.id,
            name: data.name || 'Untitled Process',
            description: data.description || '',
            ownerId: data.ownerId || user.id,
            department: data.department || '',
            criticality: data.criticality || 'Medium',
            status: 'Draft',
            templateId: data.templateId
        };

        const saved = await assessAdapter.createProcess(newProcessData);
        setProcesses(prev => [...prev, saved]);
        return saved;
    }, [checkCreationLimit, currentOrganization, currentWorkspace?.id, user]);

    const createProcessFromTemplate = useCallback(async (orgId: string, templateId: string, ownerId: string) => {
        const template = ALL_TEMPLATE_PACKS.flatMap(pack => pack.templates).find(item => item.id === templateId);
        if (!template) throw new Error('Template not found');

        return createProcess({
            orgId,
            ownerId,
            name: template.name,
            description: template.description,
            department: template.defaultFields.department || '',
            criticality: template.defaultFields.criticality || 'Medium',
            templateId,
        });
    }, [createProcess]);

    const getProcessById = useCallback((processId: string, orgId: string) => {
        return processes.find(process => process.id === processId && process.orgId === orgId) || null;
    }, [processes]);

    const updateProcess = useCallback(async (processId: string, updates: Partial<AssessProcess>) => {
        // Implement via adapter if needed, for now local update + sync
        setProcesses(prev => prev.map(p => p.id === processId ? { ...p, ...updates } : p));
    }, []);

    return {
        processes,
        loading: contextLoading,
        createProcess,
        createProcessFromTemplate,
        getProcessById,
        updateProcess,
        refreshProcesses: fetchProcesses
    };
}
