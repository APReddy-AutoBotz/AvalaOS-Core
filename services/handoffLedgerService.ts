import { useCallback, useEffect, useRef, useState } from 'react';
import { HandoffLedgerEntry } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { useAuth } from '../components/auth/AuthProvider';
import { handoffLedgerAdapter } from './adapters/handoffLedgerAdapter';
import { clientRequestContextKey, createContextRequestGate } from './contextRequestGate';

type NewHandoffLedgerEntry = Omit<HandoffLedgerEntry, 'id' | 'orgId' | 'createdAt' | 'createdBy'> & {
    id?: string;
    orgId?: string;
    createdBy?: string;
};

export function useHandoffLedger() {
    const { currentOrganization, currentWorkspace, sessionState } = useOrganizationContext();
    const { user } = useAuth();
    const [entries, setEntries] = useState<HandoffLedgerEntry[]>([]);
    const requestGate = useRef(createContextRequestGate()).current;
    const activeContextKey = useRef<string | null>(null);

    const refresh = useCallback(async () => {
        if (!currentOrganization || !currentWorkspace || !['ready', 'read_only'].includes(sessionState)) {
            requestGate.invalidate();
            activeContextKey.current = null;
            setEntries([]);
            return;
        }
        const requestContext = {
            actorId: user?.id,
            organizationId: currentOrganization.id,
            workspaceId: currentWorkspace.id,
        };
        const ticket = requestGate.start(requestContext);
        activeContextKey.current = clientRequestContextKey(requestContext);
        setEntries([]);
        try {
            const nextEntries = await handoffLedgerAdapter.list(currentOrganization.id);
            if (requestGate.accepts(ticket, requestContext)) setEntries(nextEntries);
        } catch (error) {
            console.error('Failed to load handoff ledger:', error);
            if (requestGate.accepts(ticket, requestContext)) setEntries([]);
        }
    }, [currentOrganization, currentWorkspace, requestGate, sessionState, user?.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const recordHandoff = useCallback(async (entry: NewHandoffLedgerEntry) => {
        if (!currentOrganization || !currentWorkspace || !user || !['ready', 'read_only'].includes(sessionState)) return null;

        const commandContextKey = clientRequestContextKey({
            actorId: user.id,
            organizationId: currentOrganization.id,
            workspaceId: currentWorkspace.id,
        });

        const now = new Date().toISOString();
        const nextEntry: HandoffLedgerEntry = {
            ...entry,
            id: entry.id || crypto.randomUUID(),
            orgId: entry.orgId || currentOrganization.id,
            createdAt: now,
            createdBy: entry.createdBy || user.id,
        };

        try {
            const saved = await handoffLedgerAdapter.record(nextEntry);
            if (commandContextKey === activeContextKey.current) {
                setEntries(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
            }
            return saved;
        } catch (error) {
            console.error('Failed to record handoff ledger entry:', error);
            return null;
        }
    }, [currentOrganization, currentWorkspace, sessionState, user]);

    return {
        entries,
        recordHandoff,
        refresh,
    };
}
