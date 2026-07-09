import { AiProviderType, GeneratedArtifacts, ProjectDetails } from '../types';
import {
  ArtifactExportDecision,
  assertArtifactExportExecutionAllowed,
  assertSignedUrlExecutionAllowed,
} from './artifactExportPolicy';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const EDGE_AI_ENABLED = import.meta.env.VITE_AI_EDGE_FUNCTIONS_ENABLED === 'true';

type EdgeGenerateDocumentInput = {
  providerType: AiProviderType;
  projectDetails: ProjectDetails;
  fileContent: string | null;
  fileName: string;
};

type EdgeRefineSectionInput = {
  providerType: AiProviderType;
  sectionTitle: string;
  currentContent: string;
  instructions: string;
};

type EdgeExtractDocumentTextInput = {
  fileId: string;
  storagePath: string;
  fileType: string;
  bucket?: string;
};

type EdgeExportDocumentInput = {
  documentId: string;
  versionId?: string;
  exportType: 'markdown' | 'md' | 'json';
};

type EdgeExportDecisionPackInput = {
  assessmentId: string;
  scoreSetId?: string;
  exportType: 'markdown' | 'md' | 'json';
};

type EdgeExportResult = {
  exportArtifactId: string;
  downloadReference: {
    bucket: string;
    path: string;
  };
  exportType: string;
};

const unwrapEdgeResponse = <T>(payload: unknown): T => {
  const value = payload as any;
  if (value?.error) {
    throw new Error(typeof value.error === 'string' ? value.error : value.error.message || 'AI Edge Function failed.');
  }
  if (value?.data) return value.data as T;
  return value as T;
};

export const isAiEdgeEnabled = () => EDGE_AI_ENABLED && isSupabaseConfigured();

export const aiEdgeClient = {
  async generateDocument(input: EdgeGenerateDocumentInput): Promise<GeneratedArtifacts> {
    const { data, error } = await supabase.functions.invoke('ai-generate-document', {
      body: {
        providerType: input.providerType,
        projectDetails: input.projectDetails,
        source: {
          fileName: input.fileName,
          text: input.fileContent,
        },
      },
    });

    if (error) throw new Error(error.message || 'ai-generate-document failed.');
    return unwrapEdgeResponse<GeneratedArtifacts>(data);
  },

  async refineSection(input: EdgeRefineSectionInput): Promise<string> {
    const { data, error } = await supabase.functions.invoke('ai-refine-section', {
      body: {
        providerType: input.providerType,
        sectionTitle: input.sectionTitle,
        currentContent: input.currentContent,
        instructions: input.instructions,
      },
    });

    if (error) throw new Error(error.message || 'ai-refine-section failed.');
    const response = unwrapEdgeResponse<{ content?: string; refinedContent?: string } | string>(data);
    return typeof response === 'string' ? response : response.refinedContent || response.content || '';
  },

  async extractDocumentText(input: EdgeExtractDocumentTextInput): Promise<{ text: string; chunks: { index: number; text: string }[]; status: string; warnings: string[] }> {
    const { data, error } = await supabase.functions.invoke('extract-document-text', {
      body: input,
    });

    if (error) throw new Error(error.message || 'extract-document-text failed.');
    return unwrapEdgeResponse(data);
  },

  async exportDocument(input: EdgeExportDocumentInput, artifactDecision?: ArtifactExportDecision | null): Promise<EdgeExportResult & { documentId: string; versionId?: string }> {
    assertArtifactExportExecutionAllowed({
      helperId: 'aiEdgeClient.exportDocument',
      operation: 'export',
      decision: artifactDecision,
      expectedAction: 'document.export',
      expectedArtifactType: 'generated_document_export',
      sourceSurfaceId: artifactDecision?.sourceSurfaceId || 'ai-edge.export-document',
    });
    const { data, error } = await supabase.functions.invoke('export-document', {
      body: input,
    });

    if (error) throw new Error(error.message || 'export-document failed.');
    return unwrapEdgeResponse(data);
  },

  async exportDecisionPack(input: EdgeExportDecisionPackInput, artifactDecision?: ArtifactExportDecision | null): Promise<EdgeExportResult & { assessmentId: string; scoreSetId?: string }> {
    assertArtifactExportExecutionAllowed({
      helperId: 'aiEdgeClient.exportDecisionPack',
      operation: 'export',
      decision: artifactDecision,
      expectedAction: 'decision_pack.export',
      expectedArtifactType: 'decision_pack_export',
      sourceSurfaceId: artifactDecision?.sourceSurfaceId || 'ai-edge.export-decision-pack',
    });
    const { data, error } = await supabase.functions.invoke('export-decision-pack', {
      body: input,
    });

    if (error) throw new Error(error.message || 'export-decision-pack failed.');
    return unwrapEdgeResponse(data);
  },

  async createSignedDownloadUrl(reference: { bucket: string; path: string }, artifactDecision?: ArtifactExportDecision | null, expiresInSeconds = 60): Promise<string> {
    assertSignedUrlExecutionAllowed({
      helperId: 'aiEdgeClient.createSignedDownloadUrl',
      decision: artifactDecision,
      sourceSurfaceId: artifactDecision?.sourceSurfaceId || 'ai-edge.create-signed-download-url',
    });
    const { data, error } = await supabase.storage
      .from(reference.bucket)
      .createSignedUrl(reference.path, expiresInSeconds);

    if (error) throw new Error(error.message || 'Unable to create signed download URL.');
    if (!data?.signedUrl) throw new Error('Signed download URL was not returned.');
    return data.signedUrl;
  },
};
