export type ProviderType = 'gemini' | 'groq';

export type ProjectDetails = {
  company?: string;
  project?: string;
  domain?: string;
  templateId?: string;
};

const getProviderKey = (provider: ProviderType) => {
  if (provider === 'groq') return Deno.env.get('GROQ_API_KEY');
  return Deno.env.get('GEMINI_API_KEY');
};

export const assertSupportedProvider = (provider: string): ProviderType => {
  if (provider === 'groq' || provider === 'gemini') return provider;
  throw new Error('Requested AI provider is not enabled server-side.');
};

const buildDocumentPrompt = (projectDetails: ProjectDetails, fileName: string, sourceText: string | null) => `
You are KlarityPM, an enterprise automation and AI delivery documentation assistant.

Generate a governed starter documentation pack for:
- Company: ${projectDetails.company || 'Unknown'}
- Process/Project: ${projectDetails.project || 'Target process'}
- Domain: ${projectDetails.domain || 'Enterprise operations'}
- Template ID: ${projectDetails.templateId || 'standard'}
- Source file: ${fileName || 'N/A'}

Source material:
---
${sourceText?.trim() || 'No source material was provided. Create an industry baseline starter draft and clearly label assumptions and validation gaps.'}
---

Return one valid JSON object with this shape:
{
  "brd": {"title": "...", "sections": [{"key": "...", "title": "...", "content": "...", "citations": []}]},
  "frd": {"title": "...", "sections": [{"key": "...", "title": "...", "content": "...", "citations": []}]},
  "pdd": {"title": "...", "sections": [{"key": "...", "title": "...", "content": "...", "citations": []}]},
  "qualityGate": {"title": "Quality Gate", "ambiguityPoints": [], "gapPoints": []},
  "diagrams": {
    "asIs": {"title": "As-Is Process", "mermaidCode": "flowchart TD\\nA[Start] --> B[Review]"},
    "toBe": {"title": "To-Be Process", "mermaidCode": "flowchart TD\\nA[Start] --> B[Automated review]"}
  },
  "workItems": [{"type": "Epic", "title": "...", "description": "...", "acceptanceCriteria": []}]
}

Rules:
- Output JSON only.
- Include BRD/PDD-style content suitable for enterprise review.
- Include assumptions and quality gaps when source material is thin or absent.
- AI must not claim deterministic Assess scores or final recommendations.
- Human approval is required before downstream handoff.
`;

export const callGroqJson = async (apiKey: string, prompt: string, system: string) => {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq request failed with status ${response.status}.`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq response did not include content.');
  return {
    content,
    usage: {
      inputTokens: payload?.usage?.prompt_tokens || 0,
      outputTokens: payload?.usage?.completion_tokens || 0,
      totalTokens: payload?.usage?.total_tokens || 0,
      model: payload?.model || Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
    },
  };
};

export const callGeminiText = async (apiKey: string, prompt: string, system: string) => {
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: system }] },
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}.`);
  const payload = await response.json();
  const content = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('');
  if (!content) throw new Error('Gemini response did not include content.');
  return {
    content,
    usage: {
      inputTokens: payload?.usageMetadata?.promptTokenCount || 0,
      outputTokens: payload?.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: payload?.usageMetadata?.totalTokenCount || 0,
      model,
    },
  };
};

export const generateDocumentWithProvider = async (
  provider: ProviderType,
  projectDetails: ProjectDetails,
  fileName: string,
  sourceText: string | null,
) => {
  const apiKey = getProviderKey(provider);
  if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY is not configured server-side.`);

  const system = 'You generate governed enterprise process documentation for KlarityPM. Return valid JSON only.';
  const prompt = buildDocumentPrompt(projectDetails, fileName, sourceText);
  const result = provider === 'groq'
    ? await callGroqJson(apiKey, prompt, system)
    : await callGeminiText(apiKey, prompt, system);

  return {
    artifacts: JSON.parse(result.content),
    usage: result.usage,
  };
};

export const refineSectionWithProvider = async (
  provider: ProviderType,
  sectionTitle: string,
  currentContent: string,
  instructions: string,
) => {
  const apiKey = getProviderKey(provider);
  if (!apiKey) throw new Error(`${provider.toUpperCase()}_API_KEY is not configured server-side.`);

  const system = 'You refine one section of a governed enterprise document. Return the revised section text only.';
  const prompt = `
Section: ${sectionTitle}

Current content:
---
${currentContent}
---

Refinement instruction:
${instructions}
`;

  if (provider === 'groq') {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq refinement failed with status ${response.status}.`);
    const payload = await response.json();
    return {
      refinedContent: payload?.choices?.[0]?.message?.content || currentContent,
      usage: {
        inputTokens: payload?.usage?.prompt_tokens || 0,
        outputTokens: payload?.usage?.completion_tokens || 0,
        totalTokens: payload?.usage?.total_tokens || 0,
        model: payload?.model || Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
      },
    };
  }

  const result = await callGeminiText(apiKey, prompt, system);
  return {
    refinedContent: result.content,
    usage: result.usage,
  };
};
