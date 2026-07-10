import { AiProviderType, IAiProvider } from '../types';
import type { AiExecutionPolicy } from './aiMode';
import { GeminiProvider } from './geminiProvider';
import { GroqProvider } from './groqProvider';

type BrowserFallbackPolicy = Extract<
  AiExecutionPolicy,
  { boundary: 'browser-demo-test-fallback' }
>;

export function getAiProviderApiKey(
  providerType: AiProviderType,
  policy: BrowserFallbackPolicy,
): string | undefined {
  if (!policy.allowBrowserFallback) return undefined;
  if (providerType === 'openai') return undefined;
  if (providerType === 'groq') return import.meta.env.VITE_GROQ_API_KEY;
  return import.meta.env.VITE_GEMINI_API_KEY;
}

export function getAiProvider(
  providerType: AiProviderType,
  policy: BrowserFallbackPolicy,
): IAiProvider {
  const apiKeyToUse = getAiProviderApiKey(providerType, policy);

  if (providerType === 'openai') {
    throw new Error('OpenAI browser execution is disabled.');
  }
  if (!apiKeyToUse) {
    throw new Error('An approved local demo/test provider key is not configured.');
  }
  return providerType === 'groq'
    ? new GroqProvider(apiKeyToUse)
    : new GeminiProvider(apiKeyToUse);
}
