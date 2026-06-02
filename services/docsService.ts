import { useState, useCallback, useEffect } from 'react';
import { DocumentGeneration } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { docsAdapter } from './adapters/docsAdapter';
import { useAuth } from '../components/auth/AuthProvider';

export function useDocsService() {
  const { currentOrganization } = useOrganizationContext();
  const { user } = useAuth();
  const [generations, setGenerations] = useState<DocumentGeneration[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocsData = useCallback(async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const data = await docsAdapter.getGenerations(currentOrganization.id);
      setGenerations(data);
    } catch (err) {
      console.error('Failed to fetch docs data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchDocsData();
  }, [fetchDocsData]);

  const saveGeneration = useCallback(async (gen: Partial<DocumentGeneration>) => {
    if (!currentOrganization || !user) return;
    const newGen = { ...gen, org_id: currentOrganization.id } as any;
    const saved = await docsAdapter.saveGeneration(newGen);
    setGenerations(prev => [...prev, saved]);
    return saved;
  }, [currentOrganization, user]);

  return {
    generations,
    loading,
    saveGeneration,
    refresh: fetchDocsData
  };
}
