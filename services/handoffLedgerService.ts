import { useCallback, useEffect, useState } from 'react';
import { HandoffLedgerEntry } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { useAuth } from '../components/auth/AuthProvider';
import { handoffLedgerAdapter } from './adapters/handoffLedgerAdapter';

type NewHandoffLedgerEntry = Omit<HandoffLedgerEntry, 'id' | 'orgId' | 'createdAt' | 'createdBy'> & {
    id?: string;
    orgId?: string;
    createdBy?: string;
};

export function useHandoffLedger() {
    const { currentOrganization } = useOrganizationContext();
    const { user } = useAuth();
    const [entries, setEntries] = useState<HandoffLedgerEntry[]>([]);

    const refresh = useCallback(async () => {
        if (!currentOrganization) {
            setEntries([]);
            return;
        }
        try {
            setEntries(await handoffLedgerAdapter.list(currentOrganization.id));
        } catch (error) {
            console.error('Failed to load handoff ledger:', error);
            setEntries([]);
        }
    }, [currentOrganization]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const recordHandoff = useCallback(async (entry: NewHandoffLedgerEntry) => {
        if (!currentOrganization || !user) return null;

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
            setEntries(prev => [saved, ...prev.filter(item => item.id !== saved.id)]);
            return saved;
        } catch (error) {
            console.error('Failed to record handoff ledger entry:', error);
            return null;
        }
    }, [currentOrganization, user]);

    return {
        entries,
        recordHandoff,
        refresh,
    };
}
