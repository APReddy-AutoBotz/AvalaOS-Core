import { getAiProvider } from './geminiService';
import { aiEdgeClient, isAiEdgeEnabled } from './aiEdgeClient';
import { getAiExecutionPolicy, resolveAiMode } from './aiMode';
import { getRuntimeDataAccess } from './supabaseClient';
import { AiProviderType, ProjectDetails, GeneratedArtifacts } from '../types';

const getCurrentAiExecutionPolicy = () =>
  getAiExecutionPolicy({
    modeResolution: resolveAiMode({
      configuredMode: import.meta.env.VITE_AVALA_RUNTIME_MODE,
      isAutomatedTestContext:
        import.meta.env.MODE === 'test' &&
        import.meta.env.VITE_AVALA_AUTOMATED_TEST_CONTEXT === 'true',
    }),
    edgeEnabled: isAiEdgeEnabled(),
    dataAccess: getRuntimeDataAccess(),
  });

export const aiOrchestrator = {
  async generateArtifacts(
    providerType: AiProviderType, 
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
    const provider = getAiProvider(providerType, aiPolicy);
    // A governed request is bound to the selected provider. A transient
    // failure is surfaced for review; it must never silently switch tenants,
    // models, or provider credentials.
    return await provider.generateProjectArtifacts(projectDetails, fileContent, fileName);
  },

  async refineSection(
    providerType: AiProviderType,
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
    const provider = getAiProvider(providerType, aiPolicy);
    return await provider.refineSectionContent(currentContent, `${sectionTitle}\n\n${instructions}`);
  }
};
