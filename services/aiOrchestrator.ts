import { getAiProvider, getAiProviderApiKey } from './geminiService';
import { aiEdgeClient, isAiEdgeEnabled } from './aiEdgeClient';
import { AiProviderType, ProjectDetails, GeneratedArtifacts } from '../types';

const providerLabel: Record<AiProviderType, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
  openai: 'OpenAI',
};

const isTransientProviderError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    '503',
    '502',
    '504',
    '500',
    '429',
    'unavailable',
    'high demand',
    'rate limit',
    'temporarily',
    'timeout',
    'failed to fetch',
    'networkerror',
  ].some(token => message.includes(token));
};

const fallbackOrder = (providerType: AiProviderType): AiProviderType[] => {
  const preferred: AiProviderType[] = ['groq', 'gemini'];
  return preferred.filter(provider => provider !== providerType);
};

const appendFallbackNote = (artifacts: GeneratedArtifacts, attemptedProvider: AiProviderType, fallbackProvider: AiProviderType, originalError: any): GeneratedArtifacts => {
  const reason = String(originalError?.message || originalError || 'Provider unavailable');
  return {
    ...artifacts,
    qualityGate: {
      ...artifacts.qualityGate,
      gapPoints: [
        ...(artifacts.qualityGate?.gapPoints || []),
        `${providerLabel[attemptedProvider]} was unavailable, so generation completed with ${providerLabel[fallbackProvider]}. Original provider error: ${reason.slice(0, 220)}`
      ],
    },
  };
};

export const aiOrchestrator = {
  async generateArtifacts(
    providerType: AiProviderType, 
    userApiKey: string | null, 
    projectDetails: ProjectDetails, 
    fileContent: string | null, 
    fileName: string
  ): Promise<GeneratedArtifacts> {
    if (isAiEdgeEnabled()) {
      return aiEdgeClient.generateDocument({
        providerType,
        projectDetails,
        fileContent,
        fileName,
      });
    }

    // Transitional dev/demo fallback. Pilot and production must enable Edge Functions.
    const provider = getAiProvider(providerType, userApiKey, false);
    try {
      return await provider.generateProjectArtifacts(projectDetails, fileContent, fileName);
    } catch (error) {
      if (!isTransientProviderError(error)) {
        throw error;
      }

      for (const fallbackProviderType of fallbackOrder(providerType)) {
        const fallbackKey = getAiProviderApiKey(fallbackProviderType, null, false);
        if (!fallbackKey) continue;

        try {
          console.warn(`${providerLabel[providerType]} generation failed. Falling back to ${providerLabel[fallbackProviderType]}.`, error);
          const fallbackProvider = getAiProvider(fallbackProviderType, null, false);
          const artifacts = await fallbackProvider.generateProjectArtifacts(projectDetails, fileContent, fileName);
          return appendFallbackNote(artifacts, providerType, fallbackProviderType, error);
        } catch (fallbackError) {
          console.warn(`${providerLabel[fallbackProviderType]} fallback generation failed.`, fallbackError);
        }
      }

      throw error;
    }
  },

  async refineSection(
    providerType: AiProviderType,
    userApiKey: string | null,
    sectionTitle: string,
    currentContent: string,
    instructions: string
  ): Promise<string> {
    if (isAiEdgeEnabled()) {
      return aiEdgeClient.refineSection({
        providerType,
        sectionTitle,
        currentContent,
        instructions,
      });
    }

    // Transitional dev/demo fallback. Pilot and production must enable Edge Functions.
    const provider = getAiProvider(providerType, userApiKey, false);
    return await provider.refineSectionContent(currentContent, `${sectionTitle}\n\n${instructions}`);
  }
};
