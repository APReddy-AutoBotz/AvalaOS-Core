import { getAiProvider, getAiProviderApiKey } from './geminiService';
import { aiEdgeClient, isAiEdgeEnabled } from './aiEdgeClient';
import { getAiExecutionPolicy, resolveAiMode } from './aiMode';
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

const getCurrentAiExecutionPolicy = () =>
  getAiExecutionPolicy({
    modeResolution: resolveAiMode({
      configuredMode: import.meta.env.VITE_AVALA_AI_MODE,
      isDev: import.meta.env.DEV,
      isProd: import.meta.env.PROD,
    }),
    edgeEnabled: isAiEdgeEnabled(),
  });

export const aiOrchestrator = {
  async generateArtifacts(
    providerType: AiProviderType, 
    userApiKey: string | null, 
    projectDetails: ProjectDetails, 
    fileContent: string | null, 
    fileName: string
  ): Promise<GeneratedArtifacts> {
    const aiPolicy = getCurrentAiExecutionPolicy();

    if (aiPolicy.status === 'blocked') {
      throw aiPolicy.error;
    }

    if (aiPolicy.boundary === 'edge') {
      return aiEdgeClient.generateDocument({
        providerType,
        projectDetails,
        fileContent,
        fileName,
      });
    }

    console.warn(`Avala AI is using ${aiPolicy.fallbackLabel}. Pilot and production require server-side Edge AI.`);
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
    const aiPolicy = getCurrentAiExecutionPolicy();

    if (aiPolicy.status === 'blocked') {
      throw aiPolicy.error;
    }

    if (aiPolicy.boundary === 'edge') {
      return aiEdgeClient.refineSection({
        providerType,
        sectionTitle,
        currentContent,
        instructions,
      });
    }

    console.warn(`Avala AI is using ${aiPolicy.fallbackLabel}. Pilot and production require server-side Edge AI.`);
    const provider = getAiProvider(providerType, userApiKey, false);
    return await provider.refineSectionContent(currentContent, `${sectionTitle}\n\n${instructions}`);
  }
};
