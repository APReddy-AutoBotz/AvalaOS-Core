import { AiProviderType, IAiProvider } from '../types';
import { GeminiProvider } from './geminiProvider';
import { GroqProvider } from './groqProvider';

// Browser provider fallback is gated by aiOrchestrator to explicit local-demo/internal-dev modes.
// Do not accept user-provided raw browser keys here; pilot/production must use server-side Edge AI.
export function getAiProviderApiKey(providerType: AiProviderType): string | undefined {
    if (providerType === 'openai') {
        return undefined;
    }

    if (providerType === 'groq') {
        return import.meta.env.VITE_GROQ_API_KEY;
    }

    return import.meta.env.VITE_GEMINI_API_KEY;
}

export function getAiProvider(providerType: AiProviderType): IAiProvider {
    const apiKeyToUse = getAiProviderApiKey(providerType);

    if (providerType === 'openai') {
        throw new Error("OpenAI provider is disabled until the server-side AI provider boundary is implemented.");
    }

    if (providerType === 'groq') {
        if (!apiKeyToUse) {
            throw new Error("Groq API key is missing. Configure a key before generating AI content.");
        }
        return new GroqProvider(apiKeyToUse);
    }

    if (!apiKeyToUse) {
        throw new Error("Google Gemini API key is missing. Configure a key before generating AI content.");
    }
    return new GeminiProvider(apiKeyToUse);
}
