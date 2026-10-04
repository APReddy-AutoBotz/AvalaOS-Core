import type { StudioCanonicalSourceAnchorDto } from '../../../services/studioArtifacts/contracts.ts';
import type { JsonObject } from './studioArtifactCommand.ts';
import {
  normalizeStudioArtifactTemplate,
  type StudioArtifactTemplateContract,
} from './studioArtifactTemplateContract.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const MAX_SECTION_CHARACTERS = 20_000;
const MAX_SOURCE_FACTS_CHARACTERS = 12_000;
const MAX_DOCUMENT_CHARACTERS = 500_000;
const MAX_SOURCE_CHARACTERS = 110_000;
const MAX_ITEMS = 200;

const AGENT_NECESSITY_FIELDS = [
  'irreducibleAmbiguity',
  'adaptiveNextStep',
  'toolOrPathSelection',
  'incrementalValue',
  'controllable',
] as const;

type SourceFactsBlock = Readonly<{
  body: string;
  anchor: StudioCanonicalSourceAnchorDto;
}>;

export class StudioBrdSourceFactsError extends Error {
  constructor() {
    super('STUDIO_BRD_SOURCE_FACTS_INVALID');
    this.name = 'StudioBrdSourceFactsError';
  }
}

function invalid(): never { throw new StudioBrdSourceFactsError(); }
const object = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const wellFormed = (value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
};

const sourceText = (value: unknown, maximum: number): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > maximum || !wellFormed(value)) invalid();
  return value;
};

const escaped = (value: string) => value
  .replace(/\r\n?|\n/g, '\\n')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');

const display = (value: unknown, maximum = 4_000): string => {
  if (value === undefined || value === null) return 'Unknown';
  if (typeof value === 'string') return escaped(sourceText(value, maximum) ?? 'Unknown');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  invalid();
};

const sourceArray = (value: unknown): readonly unknown[] | null => {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_ITEMS) invalid();
  return value;
};

const stringList = (value: unknown, maximum = 2_000): string => {
  const values = sourceArray(value);
  if (values === null) return 'Unknown';
  if (values.length === 0) return 'None stated';
  return values.map(item => {
    if (typeof item !== 'string') invalid();
    return display(item, maximum);
  }).join('; ');
};

const scalarFact = (value: unknown): string => {
  if (value === undefined || value === null) return 'value=Unknown, status=Unknown';
  if (!object(value)) invalid();
  const status = value.status === undefined || value.status === null
    ? 'Unknown'
    : typeof value.status === 'string' && ['known', 'unknown', 'suggested', 'assumed'].includes(value.status)
      ? escaped(value.status)
      : invalid();
  return `value=${display(value.value, 200)}, status=${status}`;
};

const necessityLines = (value: unknown, indentation: string) => {
  if (value !== undefined && value !== null && !object(value)) invalid();
  const facts = value as JsonObject | null | undefined;
  return AGENT_NECESSITY_FIELDS.map(field =>
    `${indentation}- ${field}: ${scalarFact(facts?.[field])}`);
};

const resolvedPrimitiveName = (id: unknown, namesById: ReadonlyMap<string, string>) => {
  if (typeof id !== 'string' || !UUID.test(id)) invalid();
  const name = namesById.get(id);
  return name ?? invalid();
};

/**
 * Derives a bounded, review-only projection from the server-loaded accepted
 * Assess handoff. Identifiers, lineage, evidence and governance metadata are
 * deliberately used only for exact reference resolution and never rendered.
 */
export const deriveStudioBrdSourceFacts = (
  sourcePackage: JsonObject,
  canonicalSourceAnchors: readonly StudioCanonicalSourceAnchorDto[],
  selectedSourceVersionIds: readonly string[],
): SourceFactsBlock | null => {
  const assessPackage = sourcePackage.assessPackage;
  const sourceMode = sourcePackage.sourceMode;
  if (assessPackage === undefined || assessPackage === null) {
    if (sourceMode === 'assess_handoff' || sourceMode === 'assess_plus_transcript_bundle') invalid();
    return null;
  }
  if (sourceMode !== 'assess_handoff' && sourceMode !== 'assess_plus_transcript_bundle') invalid();
  if (!object(assessPackage) || !object(assessPackage.process)
    || JSON.stringify(assessPackage.process).length > MAX_SOURCE_CHARACTERS) invalid();
  const process = assessPackage.process;
  const packageSelected = sourceArray(sourcePackage.selectedSourceVersionIds);
  if (packageSelected === null || packageSelected.length !== selectedSourceVersionIds.length
    || packageSelected.some((id, index) => typeof id !== 'string' || !UUID.test(id)
      || id !== selectedSourceVersionIds[index])
    || new Set(selectedSourceVersionIds).size !== selectedSourceVersionIds.length) invalid();
  const assessAnchors = canonicalSourceAnchors.filter(anchor => anchor.locator === 'assess:accepted-handoff');
  if (assessAnchors.length !== 1 || !UUID.test(assessAnchors[0].sourceVersionId)
    || !HASH.test(assessAnchors[0].anchorHash)
    || !selectedSourceVersionIds.includes(assessAnchors[0].sourceVersionId)) invalid();

  const primitives = sourceArray(process.primitives);
  const namesById = new Map<string, string>();
  const primitiveRows: Array<{ sort: string; lines: string[] }> = [];
  if (primitives !== null) {
    for (const raw of primitives) {
      if (!object(raw) || typeof raw.id !== 'string' || !UUID.test(raw.id) || namesById.has(raw.id)) invalid();
      const rawName = sourceText(raw.name, 200);
      const resolvedName = rawName === null ? 'Unknown' : escaped(rawName);
      namesById.set(raw.id, resolvedName);
      const volumeShare = display(raw.volumeShare, 200);
      const manualEffort = display(raw.manualEffort, 200);
      const lines = [
        `  - Name: ${resolvedName}`,
        `    - Type: ${display(raw.type, 100)}`,
        `    - Description: ${display(raw.description)}`,
        `    - Trigger: ${display(raw.trigger, 2_000)}`,
        `    - Owner: ${display(raw.owner, 200)}`,
        `    - Inputs: ${stringList(raw.inputs)}`,
        `    - Outputs: ${stringList(raw.outputs)}`,
        `    - Rules: ${stringList(raw.rules)}`,
        `    - Volume share: ${volumeShare}`,
        `    - Manual effort: ${manualEffort}`,
        '    - Agent necessity:',
        ...necessityLines(raw.agentNecessity, '      '),
      ];
      primitiveRows.push({ sort: resolvedName.toLocaleLowerCase('en-US'), lines });
    }
  }
  const duplicateNames = new Set<string>();
  const seenNames = new Set<string>();
  for (const name of namesById.values()) {
    if (seenNames.has(name)) duplicateNames.add(name);
    seenNames.add(name);
  }

  const edgeValues = sourceArray(process.edges);
  const edgeRows = edgeValues === null ? null : edgeValues.map(raw => {
    if (!object(raw)) invalid();
    const from = resolvedPrimitiveName(raw.fromPrimitiveId, namesById);
    const to = resolvedPrimitiveName(raw.toPrimitiveId, namesById);
    if (duplicateNames.has(from) || duplicateNames.has(to)) invalid();
    return `  - From ${from} to ${to}; condition: ${display(raw.condition, 2_000)}`;
  }).sort((left, right) => left.localeCompare(right, 'en'));

  const decisionValues = sourceArray(process.decisionPoints);
  const decisionRows = decisionValues === null ? null : decisionValues.map(raw => {
    if (!object(raw)) invalid();
    const primitive = resolvedPrimitiveName(raw.primitiveId, namesById);
    if (duplicateNames.has(primitive)) invalid();
    return [
      `  - Primitive: ${primitive}`,
      `    - Decision: ${display(raw.name, 200)}`,
      `    - Outcomes: ${stringList(raw.outcomeLabels, 200)}`,
      `    - Rule: ${display(raw.ruleDescription, 2_000)}`,
    ].join('\n');
  }).sort((left, right) => left.localeCompare(right, 'en'));

  const exceptionValues = sourceArray(process.exceptionPaths);
  const exceptionRows = exceptionValues === null ? null : exceptionValues.map(raw => {
    if (!object(raw)) invalid();
    const from = resolvedPrimitiveName(raw.fromPrimitiveId, namesById);
    if (duplicateNames.has(from)) invalid();
    const resolutionIds = sourceArray(raw.resolutionPrimitiveIds);
    const resolutions = resolutionIds === null
      ? 'Unknown'
      : resolutionIds.length === 0
        ? 'None stated'
        : resolutionIds.map(id => {
          const name = resolvedPrimitiveName(id, namesById);
          if (duplicateNames.has(name)) invalid();
          return name;
        }).join('; ');
    return [
      `  - From primitive: ${from}`,
      `    - Exception: ${display(raw.name, 200)}`,
      `    - Trigger: ${display(raw.trigger, 2_000)}`,
      `    - Resolution primitives: ${resolutions}`,
    ].join('\n');
  }).sort((left, right) => left.localeCompare(right, 'en'));

  const assetValues = sourceArray(process.assets);
  const assetRows = assetValues === null ? null : assetValues.map(raw => {
    if (!object(raw)) invalid();
    return [
      `  - Name: ${display(raw.name, 200)}`,
      `    - Accountable owner: ${display(raw.accountableOwner, 200)}`,
      `    - Technical health: ${display(raw.technicalHealth, 100)}`,
    ].join('\n');
  }).sort((left, right) => left.localeCompare(right, 'en'));

  const rows = (values: readonly string[] | null, label: string) => [
    `- ${label}:`,
    ...(values === null ? ['  - Unknown'] : values.length === 0 ? ['  - None stated'] : values),
  ];
  const primitiveLines = primitiveRows.sort((left, right) => left.sort.localeCompare(right.sort, 'en'))
    .flatMap(row => row.lines);
  const body = [
    'Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):',
    ...rows(primitives === null ? null : primitiveLines, 'Process primitives (not ordered)'),
    ...rows(edgeRows, 'Explicit workflow edges'),
    ...rows(decisionRows, 'Decisions and outcomes'),
    ...rows(exceptionRows, 'Exception paths'),
    ...rows(assetRows, 'Application assets'),
    '- Process agent necessity:',
    ...necessityLines(process.agentNecessity, '  '),
  ].join('\n');
  if (body.length > MAX_SOURCE_FACTS_CHARACTERS || body.length >= MAX_SECTION_CHARACTERS
    || JSON.stringify({ body, anchor: assessAnchors[0] }).length > MAX_DOCUMENT_CHARACTERS) invalid();
  return { body, anchor: { ...assessAnchors[0] } };
};

const targetSectionIndex = (template: StudioArtifactTemplateContract) => {
  const requirements = template.sections.findIndex(section => section.id === 'requirements');
  if (requirements >= 0) return requirements;
  const narrative = template.sections.findIndex(section => section.required && section.fieldKind === 'narrative');
  return narrative >= 0 ? narrative : 0;
};

/** Appends source-rendered facts after the already-validated model narrative. */
export const composeStudioBrdSourceFacts = (
  draft: JsonObject,
  block: SourceFactsBlock | null,
  templatePayload: JsonObject,
): JsonObject => {
  if (block === null) return draft;
  const template = normalizeStudioArtifactTemplate(templatePayload);
  if (!Array.isArray(draft.sections) || draft.sections.length !== template.sections.length) invalid();
  const index = targetSectionIndex(template);
  const sections = draft.sections.map((raw, sectionIndex) => {
    if (sectionIndex !== index) return raw;
    if (!object(raw) || typeof raw.body !== 'string' || !Array.isArray(raw.sourceAnchors)
      || !Array.isArray(raw.labels)) invalid();
    const body = `${raw.body}\n\n${block.body}`;
    if (body.length > MAX_SECTION_CHARACTERS) invalid();
    const key = (anchor: StudioCanonicalSourceAnchorDto) =>
      `${anchor.sourceVersionId}\u0000${anchor.locator}\u0000${anchor.anchorHash}`;
    const sourceAnchors = [...raw.sourceAnchors];
    if (!sourceAnchors.some(anchor => object(anchor) && key(anchor as unknown as StudioCanonicalSourceAnchorDto) === key(block.anchor))) {
      sourceAnchors.push({ ...block.anchor });
    }
    return { ...raw, body, sourceAnchors };
  });
  const composed = { ...draft, sections };
  if (JSON.stringify(composed).length > MAX_DOCUMENT_CHARACTERS) invalid();
  return composed;
};
