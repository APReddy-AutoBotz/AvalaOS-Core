import { useState, useCallback, useEffect } from 'react';
import { AssessProcess } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { ALL_TEMPLATE_PACKS } from '../constants/starterPacks';
import { assessAdapter } from './adapters/assessAdapter';
import { useAuth } from '../components/auth/AuthProvider';

export function useProcessService() {
    const { currentOrganization, currentWorkspace, sessionState } = useOrganizationContext();
    const { user } = useAuth();
    const [processes, setProcesses] = useState<AssessProcess[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchProcesses = useCallback(async () => {
        if (!currentOrganization || !currentWorkspace || !['ready', 'read_only'].includes(sessionState)) return;
        setLoading(true);
        try {
            const data = await assessAdapter.getProcesses(currentOrganization.id, currentWorkspace.id);
            setProcesses(data);
        } catch (err) {
            console.error('Failed to fetch processes:', err);
        } finally {
            setLoading(false);
        }
    }, [currentOrganization, currentWorkspace, sessionState]);

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
    }, [currentOrganization, user, checkCreationLimit]);

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
        loading,
        createProcess,
        createProcessFromTemplate,
        getProcessById,
        updateProcess,
        refreshProcesses: fetchProcesses
    };
}
