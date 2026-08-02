export type StudioDraftValidationResult =
  | { valid: true; content: Record<string, unknown>; error: null }
  | { valid: false; content: null; error: string };

export function validateStudioDraftContent(draft: string): StudioDraftValidationResult {
  try {
    const content = JSON.parse(draft) as unknown;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return {
        valid: false,
        content: null,
        error: 'Enter a structured JSON object. Arrays, primitive values, and empty input are not accepted.',
      };
    }
    return { valid: true, content: content as Record<string, unknown>, error: null };
  } catch {
    return {
      valid: false,
      content: null,
      error: 'Enter valid structured JSON before committing this revision.',
    };
  }
}
