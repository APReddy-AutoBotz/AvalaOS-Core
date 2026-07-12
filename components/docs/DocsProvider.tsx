import React, { createContext, useContext, useState, useEffect } from 'react';
import { DocumentGeneration } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { docsAdapter } from '../../services/adapters/docsAdapter';
import { useAuth } from '../auth/AuthProvider';

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
  const { currentOrganization } = useOrganizationContext();
  const { user } = useAuth();
  const [documentGenerations, setDocumentGenerations] = useState<DocumentGeneration[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDocsData = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const data = await docsAdapter.getGenerations(currentOrganization.id);
      setDocumentGenerations(data);
    } catch (err) {
      console.error('Failed to fetch docs data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocsData();
  }, [currentOrganization]);

  const saveGeneration = async (gen: Partial<DocumentGeneration>): Promise<DocumentGeneration> => {
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

    setDocumentGenerations(prev => {
      const exists = prev.some(item => item.id === saved.id);
      return exists
        ? prev.map(item => item.id === saved.id ? saved : item)
        : [saved, ...prev];
    });
    return saved;
  };

  return (
    <DocsContext.Provider value={{ documentGenerations, loading, saveGeneration, refresh: fetchDocsData }}>
      {children}
    </DocsContext.Provider>
  );
};

export const useDocs = () => {
  const context = useContext(DocsContext);
  if (!context) throw new Error('useDocs must be used within DocsProvider');
  return context;
};
