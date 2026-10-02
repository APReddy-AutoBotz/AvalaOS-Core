import type { JsonObject } from './studioArtifactCommand.ts';

export const STUDIO_TEMPLATE_ARTIFACT_TYPES = ['brd', 'frd', 'pdd'] as const;
export const STUDIO_TEMPLATE_FIELD_KINDS = [
  'narrative', 'requirements', 'rules', 'controls', 'risks', 'interfaces', 'acceptance_criteria',
] as const;

export type StudioArtifactTemplateSectionContract = Readonly<{
  id: string;
  title: string;
  required: boolean;
  fieldKind: typeof STUDIO_TEMPLATE_FIELD_KINDS[number] | 'system';
}>;

export type StudioArtifactTemplateContract = Readonly<{
  kind: 'system' | 'tenant';
  artifactType: typeof STUDIO_TEMPLATE_ARTIFACT_TYPES[number] | null;
  sections: readonly StudioArtifactTemplateSectionContract[];
}>;

export class StudioArtifactTemplateContractError extends Error {
  constructor() {
    super('STUDIO_TEMPLATE_CONTRACT_INVALID');
    this.name = 'StudioArtifactTemplateContractError';
  }
}

const SECTION_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const object = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: JsonObject, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};
const invalid = (): never => { throw new StudioArtifactTemplateContractError(); };

const systemSectionTitle = (id: string) => {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : invalid();
};

/**
 * Converts the two persisted template payload unions into one trusted,
 * bounded generation contract. Raw template JSON remains untrusted provider
 * input. Only allowlisted system titles and safe tenant IDs/required flags may
 * enter the system instruction; tenant titles remain validation-only data.
 */
export const normalizeStudioArtifactTemplate = (payload: JsonObject): StudioArtifactTemplateContract => {
  let kind: StudioArtifactTemplateContract['kind'];
  let artifactType: StudioArtifactTemplateContract['artifactType'];
  let sections: StudioArtifactTemplateSectionContract[];

  if (exact(payload, ['artifactType', 'sections'])) {
    const rawSections = payload.sections;
    if (typeof payload.artifactType !== 'string'
      || !STUDIO_TEMPLATE_ARTIFACT_TYPES.includes(payload.artifactType as never)
      || !Array.isArray(rawSections) || rawSections.length < 1 || rawSections.length > 100) invalid();
    kind = 'system';
    artifactType = payload.artifactType as StudioArtifactTemplateContract['artifactType'];
    sections = (rawSections as unknown[]).map(value => {
      if (typeof value !== 'string' || !SECTION_ID.test(value)) invalid();
      const id = value as string;
      return { id, title: systemSectionTitle(id), required: true, fieldKind: 'system' as const };
    });
  } else if (exact(payload, ['sectionDefinitions', 'fieldSchema'])) {
    const rawSections = payload.sectionDefinitions;
    if (!Array.isArray(rawSections) || rawSections.length < 1
      || rawSections.length > 100 || !object(payload.fieldSchema)) invalid();
    kind = 'tenant';
    artifactType = null;
    sections = (rawSections as unknown[]).map(value => {
      if (!object(value)) invalid();
      const section = value as JsonObject;
      if (!exact(section, ['id', 'title', 'required', 'fieldKind'])
        || typeof section.id !== 'string' || !SECTION_ID.test(section.id)
        || typeof section.title !== 'string' || !section.title.trim() || section.title.length > 160
        || typeof section.required !== 'boolean'
        || typeof section.fieldKind !== 'string'
        || !STUDIO_TEMPLATE_FIELD_KINDS.includes(section.fieldKind as never)) invalid();
      return {
        id: section.id as string,
        title: (section.title as string).trim(),
        required: section.required as boolean,
        fieldKind: section.fieldKind as StudioArtifactTemplateSectionContract['fieldKind'],
      };
    });
  } else invalid();

  if (new Set(sections.map(section => section.id)).size !== sections.length) invalid();
  return { kind, artifactType, sections };
};
