import { AiProviderType, IAiProvider } from '../types';
import { GeminiProvider } from './geminiProvider';
import { OpenAiProvider } from './openAiProvider';

export function getAiProvider(providerType: AiProviderType, userApiKey: string | null): IAiProvider {
    if (providerType === 'openai') {
        if (!userApiKey) {
            throw new Error("OpenAI API key is required. Please provide a key in Advanced Options.");
        }
        return new OpenAiProvider(userApiKey);
    }

    // Default to Gemini
    // Priority: user's custom key (if provided) > environment variable (default)
    // Check if userApiKey is truthy and not an empty string
    const apiKeyToUse = (userApiKey && userApiKey.trim()) || import.meta.env.VITE_GEMINI_API_KEY;

    // Debug logging (remove in production)
    console.log('🔑 API Key Debug:', {
        hasUserKey: !!(userApiKey && userApiKey.trim()),
        hasEnvGeminiKey: !!import.meta.env.VITE_GEMINI_API_KEY,
        usingKey: apiKeyToUse ? `${apiKeyToUse.substring(0, 10)}...` : 'none'
    });

    if (!apiKeyToUse) {
        throw new Error("Google Gemini API key is missing. Please provide a key or ensure the default key is configured.");
    }
    return new GeminiProvider(apiKeyToUse);
}
