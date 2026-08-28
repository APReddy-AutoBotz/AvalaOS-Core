import {
  TRANSCRIPT_SOURCE_ROLES,
  TRANSCRIPT_SOURCE_SET_MAX_EXTRACTED_CHARACTERS,
  TRANSCRIPT_SOURCE_SET_MAX_MEMBERS,
  type TranscriptSourceRole,
} from './contracts';

export interface ServerTranscriptSourceBinding {
  sourceId: string;
  sourceVersionId: string;
  contentHash: string;
  extractedTextHash: string;
  extractedCharacterCount: number;
  role: TranscriptSourceRole;
  ordinal: number;
  note?: string;
  state: 'ready' | 'failed' | 'missing' | 'deleted';
}

const scalarCount = (value: string) => Array.from(value).length;

const frame = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return `${bytes.length}:${value}`;
};

const requireHash = (value: string) => {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('TRANSCRIPT_SOURCE_HASH_INVALID');
  return value.toLowerCase();
};

const requireIdentifier = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('TRANSCRIPT_SOURCE_SELECTOR_INVALID');
  }
  return value.toLowerCase();
};

/**
 * Produces the canonical, length-framed manifest bytes hashed by the server.
 * No browser command is allowed to submit this value as authority.
 */
export const frameTranscriptSourceSetManifest = (
  bindings: readonly ServerTranscriptSourceBinding[],
  contractVersion = 'transcript-source-set-manifest-1',
) => {
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > TRANSCRIPT_SOURCE_SET_MAX_MEMBERS) {
    throw new Error('TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT');
  }
  const sorted = [...bindings].sort((left, right) => left.ordinal - right.ordinal);
  const exactVersions = new Set<string>();
  let extractedCharacterCount = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const binding = sorted[index];
    if (binding.ordinal !== index + 1) throw new Error('TRANSCRIPT_SOURCE_SET_ORDINAL_INVALID');
    if (!TRANSCRIPT_SOURCE_ROLES.includes(binding.role)) throw new Error('TRANSCRIPT_SOURCE_ROLE_INVALID');
    if (binding.state !== 'ready') throw new Error('TRANSCRIPT_SOURCE_SET_MEMBER_NOT_READY');
    const sourceVersionId = requireIdentifier(binding.sourceVersionId);
    requireIdentifier(binding.sourceId);
    if (exactVersions.has(sourceVersionId)) throw new Error('TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION');
    exactVersions.add(sourceVersionId);
    if (!Number.isSafeInteger(binding.extractedCharacterCount) || binding.extractedCharacterCount < 0) {
      throw new Error('TRANSCRIPT_SOURCE_CHARACTER_COUNT_INVALID');
    }
    extractedCharacterCount += binding.extractedCharacterCount;
    if (extractedCharacterCount > TRANSCRIPT_SOURCE_SET_MAX_EXTRACTED_CHARACTERS) {
      throw new Error('TRANSCRIPT_SOURCE_SET_CHARACTER_LIMIT');
    }
    if (binding.note !== undefined && scalarCount(binding.note) > 500) throw new Error('TRANSCRIPT_SOURCE_NOTE_LIMIT');
  }
  const fields = [
    frame(contractVersion),
    ...sorted.flatMap(binding => [
      frame(String(binding.ordinal)),
      frame(requireIdentifier(binding.sourceId)),
      frame(requireIdentifier(binding.sourceVersionId)),
      frame(requireHash(binding.contentHash)),
      frame(requireHash(binding.extractedTextHash)),
      frame(binding.role),
      frame(binding.note || ''),
    ]),
  ];
  return {
    framedManifest: fields.join('|'),
    sourceCount: sorted.length,
    extractedCharacterCount,
  };
};

export interface TranscriptSourceSetSelection {
  sourceId: string;
  versionSelector: string;
  role: TranscriptSourceRole;
  note?: string;
}

/** Browser-side validation only; the server reloads every selected identity. */
export const validateTranscriptSourceSetSelection = (selection: readonly TranscriptSourceSetSelection[]) => {
  if (!Array.isArray(selection) || selection.length < 1 || selection.length > TRANSCRIPT_SOURCE_SET_MAX_MEMBERS) {
    throw new Error('TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT');
  }
  const exactVersions = new Set<string>();
  return selection.map((member, index) => {
    const sourceId = requireIdentifier(member.sourceId);
    const versionSelector = requireIdentifier(member.versionSelector);
    if (exactVersions.has(versionSelector)) throw new Error('TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION');
    exactVersions.add(versionSelector);
    if (!TRANSCRIPT_SOURCE_ROLES.includes(member.role)) throw new Error('TRANSCRIPT_SOURCE_ROLE_INVALID');
    const note = member.note?.trim();
    if (note && scalarCount(note) > 500) throw new Error('TRANSCRIPT_SOURCE_NOTE_LIMIT');
    return { sourceId, versionSelector, role: member.role, ordinal: index + 1, ...(note ? { note } : {}) };
  });
};
