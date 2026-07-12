import { useState, useCallback, useEffect } from 'react';
import { DocumentGeneration } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { docsAdapter } from './adapters/docsAdapter';
import { useAuth } from '../components/auth/AuthProvider';

const DOCUMENT_PERSISTENCE_AUTHORITY_ERROR =
  'Document persistence authority is unavailable. The generated draft was not opened as a saved document.';

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

  const saveGeneration = useCallback(async (
    gen: Partial<DocumentGeneration>,
  ): Promise<DocumentGeneration> => {
    if (!currentOrganization || !user) {
      throw new Error(DOCUMENT_PERSISTENCE_AUTHORITY_ERROR);
    }
    const newGen = {
      ...gen,
      org_id: currentOrganization.id,
      generatedAt: gen.generatedAt || new Date().toISOString(),
    } as Partial<DocumentGeneration> & { org_id: string };
    const saved = await docsAdapter.saveGeneration(newGen);
    if (!saved?.id) throw new Error(DOCUMENT_PERSISTENCE_AUTHORITY_ERROR);

    setGenerations(prev => {
      const exists = prev.some(item => item.id === saved.id);
      return exists
        ? prev.map(item => item.id === saved.id ? saved : item)
        : [saved, ...prev];
    });
    return saved;
  }, [currentOrganization, user]);

  return {
    generations,
    loading,
    saveGeneration,
    refresh: fetchDocsData,
  };
}
