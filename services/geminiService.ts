import { AiProviderType, IAiProvider } from '../types';
import { GeminiProvider } from './geminiProvider';
import { GroqProvider } from './groqProvider';

export function getAiProviderApiKey(providerType: AiProviderType, userApiKey: string | null, allowUserKey = false): string | undefined {
    if (providerType === 'openai') {
        return undefined;
    }

    if (providerType === 'groq') {
        return (allowUserKey && userApiKey && userApiKey.trim()) || import.meta.env.VITE_GROQ_API_KEY;
    }

    return (allowUserKey && userApiKey && userApiKey.trim()) || import.meta.env.VITE_GEMINI_API_KEY;
}

export function getAiProvider(providerType: AiProviderType, userApiKey: string | null, allowUserKey = false): IAiProvider {
    const apiKeyToUse = getAiProviderApiKey(providerType, userApiKey, allowUserKey);

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
