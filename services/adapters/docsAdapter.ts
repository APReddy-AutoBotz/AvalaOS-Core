import { getRuntimeDataAccess, supabase } from '../supabaseClient';
import { DocumentGeneration } from '../../types';
import { MOCK_DOCUMENT_GENERATIONS } from '../../data/mockData';

const isUuid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

const relationAppId = (relation: any) => {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.app_id;
};

const fromGenerationRow = (row: any): DocumentGeneration => ({
  id: row.id,
  projectId: relationAppId(row.projects) || row.project_app_id || row.project_id,
  generatedAt: row.generated_at || row.created_at || new Date().toISOString(),
  versionId: row.updated_at || row.generated_at || row.created_at,
  templateId: row.template_id,
  artifacts: row.artifacts || {},
});

async function getProjectUuid(orgId: string, projectId?: string) {
  if (!projectId) return null;
  if (isUuid(projectId)) return projectId;
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId)
    .eq('app_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

export const docsAdapter = {
  async getGenerations(orgId: string, projectId?: string) {
    if (getRuntimeDataAccess() === 'local') {
      const generations = projectId
        ? MOCK_DOCUMENT_GENERATIONS.filter(gen => gen.projectId === projectId)
        : MOCK_DOCUMENT_GENERATIONS;
      return generations.map(generation => ({
        ...generation,
        versionId: generation.versionId || generation.generatedAt,
      }));
    }
    let query = supabase
      .from('document_generations')
      .select('*, projects(app_id)')
      .eq('org_id', orgId)
      .order('generated_at', { ascending: false });
    if (projectId) {
      const projectUuid = await getProjectUuid(orgId, projectId);
      if (!projectUuid) return [];
      query = query.eq('project_id', projectUuid);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromGenerationRow);
  },

  async saveGeneration(generation: Partial<DocumentGeneration> & { org_id: string }) {
    if (getRuntimeDataAccess() === 'local') {
      const generatedAt = generation.generatedAt || new Date().toISOString();
      return {
        ...generation,
        generatedAt,
        versionId: generation.versionId || generatedAt,
      } as DocumentGeneration;
    }
    const projectUuid = await getProjectUuid(generation.org_id, generation.projectId);
    if (!projectUuid) throw new Error('Project not found for document generation.');

    const row: any = {
      org_id: generation.org_id,
      project_id: projectUuid,
      template_id: generation.templateId || 'unknown',
      generated_at: generation.generatedAt || new Date().toISOString(),
      artifacts: generation.artifacts || {},
    };
    if (isUuid(generation.id)) row.id = generation.id;

    const { data, error } = await supabase
      .from('document_generations')
      .upsert([row])
      .select('*, projects(app_id)')
      .single();
    if (error) throw error;
    if (!data) throw new Error('Document persistence did not return an authoritative record.');
    return fromGenerationRow(data);
  },
};
