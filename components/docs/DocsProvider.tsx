import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DocumentGeneration } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { docsAdapter } from '../../services/adapters/docsAdapter';
import { useAuth } from '../auth/AuthProvider';
import { getRuntimeDataAccess, getRuntimeModeResolution } from '../../services/supabaseClient';

const DOCUMENT_PERSISTENCE_AUTHORITY_ERROR =
  'Document persistence authority is unavailable. The generated draft was not opened as a saved document.';

interface DocsContextType {
  documentGenerations: DocumentGeneration[];
  loading: boolean;
  saveGeneration: (gen: Partial<DocumentGeneration>) => Promise<DocumentGeneration>;
  refresh: () => Promise<void>;
}

const DocsContext = createContext<DocsContextType | undefined>(undefined);

export const DocsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const runtime = getRuntimeModeResolution();
  const legacyLocalOnly = runtime.status === 'resolved' && runtime.allowLocalAuthority;
  const { currentOrganization, tenantContext } = useOrganizationContext();
  const { user } = useAuth();
  const [documentGenerations, setDocumentGenerations] = useState<DocumentGeneration[]>([]);
  const [loadedAuthorityKey, setLoadedAuthorityKey] = useState<string | null>(legacyLocalOnly ? 'local' : null);
  const [loading, setLoading] = useState(false);
  const fetchSequence = useRef(0);
  const authorityKey = tenantContext
    ? `${tenantContext.userId}:${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}`
    : 'no-server-authority';
  const activeAuthorityKey = useRef(authorityKey);
  activeAuthorityKey.current = authorityKey;

  const fetchDocsData = async () => {
    if (!currentOrganization) {
      fetchSequence.current += 1;
      if (!legacyLocalOnly) {
        setDocumentGenerations([]);
        setLoadedAuthorityKey(null);
      }
      setLoading(false);
      return;
    }
    const requestSequence = ++fetchSequence.current;
    const requestAuthorityKey = authorityKey;
    setLoading(true);
    try {
      if (getRuntimeDataAccess() === 'server') {
        setDocumentGenerations([]);
        setLoadedAuthorityKey(null);
      }
      if (!legacyLocalOnly && !tenantContext) return;
      const data = legacyLocalOnly
        ? await docsAdapter.getGenerations(currentOrganization.id)
        : await docsAdapter.getAuthoritativeGenerations(tenantContext!);
      if (fetchSequence.current !== requestSequence || activeAuthorityKey.current !== requestAuthorityKey) return;
      setDocumentGenerations(data);
      setLoadedAuthorityKey(legacyLocalOnly ? 'local' : requestAuthorityKey);
    } catch (err) {
      console.error('Failed to fetch docs data:', err);
      if (fetchSequence.current === requestSequence && activeAuthorityKey.current === requestAuthorityKey) {
        setDocumentGenerations([]);
        setLoadedAuthorityKey(null);
      }
    } finally {
      if (fetchSequence.current === requestSequence) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocsData();
  }, [currentOrganization, authorityKey]);

  const saveGeneration = async (gen: Partial<DocumentGeneration>): Promise<DocumentGeneration> => {
    if (!legacyLocalOnly || !currentOrganization || !user) {
      throw new Error(DOCUMENT_PERSISTENCE_AUTHORITY_ERROR);
    }
    const newGen = {
      ...gen,
      org_id: currentOrganization.id,
      generatedAt: gen.generatedAt || new Date().toISOString(),
    } as Partial<DocumentGeneration> & { org_id: string };
    const saved = await docsAdapter.saveGeneration(newGen);
    if (!saved?.id) throw new Error(DOCUMENT_PERSISTENCE_AUTHORITY_ERROR);

    setDocumentGenerations(prev => {
      const exists = prev.some(item => item.id === saved.id);
      return exists
        ? prev.map(item => item.id === saved.id ? saved : item)
        : [saved, ...prev];
    });
    return saved;
  };

  return (
    <DocsContext.Provider value={{
      documentGenerations: !legacyLocalOnly && loadedAuthorityKey !== authorityKey ? [] : documentGenerations,
      loading,
      saveGeneration,
      refresh: fetchDocsData,
    }}>
      {children}
    </DocsContext.Provider>
  );
};

export const useDocs = () => {
  const context = useContext(DocsContext);
  if (!context) throw new Error('useDocs must be used within DocsProvider');
  return context;
};
