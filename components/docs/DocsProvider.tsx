import React, { createContext, useContext, useState, useEffect } from 'react';
import { DocumentGeneration, GeneratedArtifacts } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import { docsAdapter } from '../../services/adapters/docsAdapter';
import { useAuth } from '../auth/AuthProvider';

interface DocsContextType {
  documentGenerations: DocumentGeneration[];
  loading: boolean;
  saveGeneration: (gen: Partial<DocumentGeneration>) => Promise<DocumentGeneration | undefined>;
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

  const saveGeneration = async (gen: Partial<DocumentGeneration>) => {
    if (!currentOrganization || !user) return;
    const newGen = { 
      ...gen, 
      org_id: currentOrganization.id,
      generatedAt: gen.generatedAt || new Date().toISOString()
    } as any;
    const saved = await docsAdapter.saveGeneration(newGen);
    setDocumentGenerations(prev => {
      const existingIndex = prev.findIndex(item => item.id === saved.id);
      if (existingIndex >= 0) {
        return prev.map(item => item.id === saved.id ? saved : item);
      }
      return [saved, ...prev];
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
