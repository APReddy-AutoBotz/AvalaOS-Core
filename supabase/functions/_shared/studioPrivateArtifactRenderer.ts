import {
  decodeStudioApprovedContent,
  STUDIO_BUSINESS_PDF_RENDERER_VERSION,
  STUDIO_PRIVATE_ARTIFACT_LEGACY_RENDERER_VERSIONS,
  STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS,
  STUDIO_SDD_PDF_RENDERER_VERSION,
  type StudioApprovedContent,
  type StudioApprovedJson,
  type StudioPrivateArtifactRendererVersion,
  type StudioPrivateArtifactType,
} from "./studioPrivateArtifactRpcContract.ts";
import {
  inspectMermaidFlowcharts,
  type MermaidFlowchart,
} from "../../../services/mermaidFlowchart.ts";

export { type StudioApprovedContent } from "./studioPrivateArtifactRpcContract.ts";

export const STUDIO_RENDITION_FORMATS = ["markdown", "pdf", "docx"] as const;
export type StudioRenditionFormat = (typeof STUDIO_RENDITION_FORMATS)[number];
export const STUDIO_CONTENT_NORMALIZER_VERSION =
  "studio-artifact-normalizer-1" as const;

export type StudioNormalizedContent = Readonly<{
  title: string;
  summary: string;
  sections: ReadonlyArray<
    Readonly<{ id?: string; title: string; content: string }>
  >;
}>;

export type StudioRenderingAuthority = Readonly<{
  artifactType: StudioPrivateArtifactType;
  contentSchemaVersion: string;
  templateVersion: string;
  rendererVersion: StudioPrivateArtifactRendererVersion;
}>;

export type StudioRenderedArtifact = Readonly<{
  bytes: Uint8Array;
  byteLength: number;
  sha256: string;
  mimeType: string;
  filename: string;
  format: StudioRenditionFormat;
  rendererVersion: StudioPrivateArtifactRendererVersion;
  templateVersion: string;
  contentSchemaVersion: string;
  normalizerVersion: typeof STUDIO_CONTENT_NORMALIZER_VERSION;
}>;

export type StudioRenditionErrorCode =
  | "INVALID_CONTENT"
  | "CONTENT_OVERSIZED"
  | "UNSUPPORTED_FORMAT"
  | "VERSION_MISMATCH"
  | "OUTPUT_OVERSIZED"
  | "OUTPUT_INVALID";

export class StudioRenditionError extends Error {
  constructor(readonly code: StudioRenditionErrorCode) {
    super(code);
    this.name = "StudioRenditionError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_SOURCE_BYTES = 500_000;
const MAX_OUTPUT_BYTES = 5_000_000;
const MAX_SECTIONS = 500;
const MAX_TITLE = 300;
const MAX_SUMMARY = 100_000;
const MAX_SECTION_CONTENT = 100_000;
const MAX_V2_SUMMARY = 5_000;
const MAX_V2_SECTION_CONTENT = 20_000;
const MIME = {
  markdown: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
const FILENAMES = {
  markdown: "studio-artifact-rendition.md",
  pdf: "studio-artifact-rendition.pdf",
  docx: "studio-artifact-rendition.docx",
} as const;
const invalidText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const loneSurrogate =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/u;
const SYSTEM_TEMPLATE_SECTIONS: Readonly<
  Record<
    StudioPrivateArtifactType,
    readonly Readonly<{ id: string; title: string }>[]
  >
> = {
  brd: [
    { id: "summary", title: "Summary" },
    { id: "objectives", title: "Objectives" },
    { id: "scope", title: "Scope" },
    { id: "requirements", title: "Requirements" },
    { id: "risks", title: "Risks" },
  ],
  frd: [
    { id: "summary", title: "Summary" },
    { id: "functionalRequirements", title: "Functional requirements" },
    { id: "rules", title: "Rules" },
    { id: "interfaces", title: "Interfaces" },
    { id: "acceptanceCriteria", title: "Acceptance criteria" },
  ],
  pdd: [
    { id: "summary", title: "Summary" },
    { id: "process", title: "Process" },
    { id: "roles", title: "Roles" },
    { id: "controls", title: "Controls" },
    { id: "exceptions", title: "Exceptions" },
  ],
  sdd: [
    { id: "summary", title: "Summary" },
    { id: "architecture", title: "Architecture" },
    { id: "components", title: "Components" },
    { id: "interfaces", title: "Interfaces" },
    { id: "dataDesign", title: "Data design" },
    { id: "asIsFlow", title: "As is flow" },
    { id: "toBeFlow", title: "To be flow" },
    { id: "securityControls", title: "Security controls" },
    { id: "operationalDesign", title: "Operational design" },
    { id: "designDecisions", title: "Design decisions" },
    {
      id: "openQuestionsAndProposals",
      title: "Open questions and proposals",
    },
  ],
};
const TEMPLATE_SECTION_INVENTORY = Object.fromEntries(
  Object.entries(SYSTEM_TEMPLATE_SECTIONS).map(([artifactType, sections]) => [
    artifactType,
    sections.map((section) => section.id),
  ]),
) as unknown as Readonly<
  Record<StudioPrivateArtifactType, readonly string[]>
>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const SECTION_ID = /^[a-z][A-Za-z0-9_.-]{0,79}$/u;
const V2_LABELS = new Set([
  "human_authored",
  "template_required",
  "assumption",
]);

const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const exactKeys = (value: object, expected: readonly string[]) => {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length && expected.every((key) => own(value, key))
  );
};
const validString = (
  value: unknown,
  max: number,
  required = false,
): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  (!required || value.trim().length > 0) &&
  value === value.normalize("NFC") &&
  !invalidText.test(value) &&
  !loneSurrogate.test(value);

const assertSafeStrings = (value: StudioApprovedJson): void => {
  if (typeof value === "string") {
    if (!validString(value, MAX_SOURCE_BYTES)) {
      throw new StudioRenditionError("INVALID_CONTENT");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertSafeStrings);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(assertSafeStrings);
  }
};

export const validateStudioApprovedContent = (
  value: unknown,
): StudioApprovedContent => {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  if (encoder.encode(raw).byteLength > MAX_SOURCE_BYTES) {
    throw new StudioRenditionError("CONTENT_OVERSIZED");
  }
  let decoded: StudioApprovedContent;
  try {
    decoded = decodeStudioApprovedContent(value);
  } catch {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  assertSafeStrings(decoded);
  const serialized = JSON.stringify(decoded);
  if (encoder.encode(serialized).byteLength > MAX_SOURCE_BYTES) {
    throw new StudioRenditionError("CONTENT_OVERSIZED");
  }
  return decoded;
};

const stableJsonValue = (value: StudioApprovedJson): StudioApprovedJson => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    const sorted: Record<string, StudioApprovedJson> = {};
    for (const key of Object.keys(value).sort((left, right) =>
      left.localeCompare(right),
    )) {
      sorted[key] = stableJsonValue(value[key]);
    }
    return sorted;
  }
  return value;
};
export const stableCanonicalStudioJson = (value: StudioApprovedJson) =>
  JSON.stringify(stableJsonValue(value), null, 2);
const displayValue = (value: StudioApprovedJson) =>
  typeof value === "string" ? value : stableCanonicalStudioJson(value);
const humanize = (key: string) => {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
  return spaced.length
    ? spaced[0].toUpperCase() + spaced.slice(1)
    : "Canonical field";
};

const normalizeStudioV2ApprovedContent = (
  source: StudioApprovedContent,
  authority: Pick<
    StudioRenderingAuthority,
    "artifactType" | "contentSchemaVersion" | "templateVersion"
  >,
): StudioNormalizedContent => {
  const schemaMatchesSystemTemplate =
    authority.artifactType === "sdd"
      ? authority.contentSchemaVersion === "studio-artifact-2"
      : authority.contentSchemaVersion === "studio-artifact-1";
  if (
    !schemaMatchesSystemTemplate ||
    authority.templateVersion !== `studio-${authority.artifactType}-1` ||
    !exactKeys(source, [
      "contractVersion",
      "title",
      "summary",
      "sections",
      "coverage",
    ]) ||
    source.contractVersion !== "studio-artifact-2" ||
    !validString(source.title, MAX_TITLE, true) ||
    !validString(source.summary, MAX_V2_SUMMARY) ||
    !Array.isArray(source.sections)
  ) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }

  const rawCoverage = source.coverage;
  if (
    !rawCoverage ||
    typeof rawCoverage !== "object" ||
    Array.isArray(rawCoverage) ||
    !exactKeys(rawCoverage, [
      "selectedSourceVersionIds",
      "coveredSourceVersionIds",
      "complete",
    ])
  ) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  const coverage = rawCoverage as Readonly<
    Record<string, StudioApprovedJson>
  >;
  if (
    coverage.complete !== true ||
    !Array.isArray(coverage.selectedSourceVersionIds) ||
    !Array.isArray(coverage.coveredSourceVersionIds)
  ) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  const selectedSourceVersionIds = coverage.selectedSourceVersionIds;
  const coveredSourceVersionIds = coverage.coveredSourceVersionIds;
  if (
    selectedSourceVersionIds.length > 20 ||
    selectedSourceVersionIds.some(
      (value) => typeof value !== "string" || !UUID.test(value),
    ) ||
    new Set(selectedSourceVersionIds).size !== selectedSourceVersionIds.length ||
    JSON.stringify([...selectedSourceVersionIds].sort()) !==
      JSON.stringify([...coveredSourceVersionIds].sort())
  ) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }

  const expectedSections = SYSTEM_TEMPLATE_SECTIONS[authority.artifactType];
  if (source.sections.length !== expectedSections.length) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  const anchoredSources = new Set<string>();
  const sections = source.sections.map((section, index) => {
    if (
      !section ||
      typeof section !== "object" ||
      Array.isArray(section) ||
      !exactKeys(section, ["id", "title", "body", "sourceAnchors", "labels"])
    ) {
      throw new StudioRenditionError("INVALID_CONTENT");
    }
    const mapped = section as Readonly<Record<string, StudioApprovedJson>>;
    const expected = expectedSections[index];
    if (
      !validString(mapped.id, 80, true) ||
      !SECTION_ID.test(mapped.id) ||
      mapped.id !== expected.id ||
      !validString(mapped.title, MAX_TITLE, true) ||
      mapped.title !== expected.title ||
      !validString(mapped.body, MAX_V2_SECTION_CONTENT) ||
      !Array.isArray(mapped.sourceAnchors) ||
      mapped.sourceAnchors.length > 200 ||
      !Array.isArray(mapped.labels) ||
      mapped.labels.length > 3
    ) {
      throw new StudioRenditionError("INVALID_CONTENT");
    }
    const labels = mapped.labels;
    if (
      labels.some(
        (label) => typeof label !== "string" || !V2_LABELS.has(label),
      ) ||
      new Set(labels).size !== labels.length ||
      (mapped.sourceAnchors.length === 0 && labels.length === 0)
    ) {
      throw new StudioRenditionError("INVALID_CONTENT");
    }
    for (const anchor of mapped.sourceAnchors) {
      if (
        !anchor ||
        typeof anchor !== "object" ||
        Array.isArray(anchor) ||
        !exactKeys(anchor, ["sourceVersionId", "locator", "anchorHash"])
      ) {
        throw new StudioRenditionError("INVALID_CONTENT");
      }
      const sourceVersionId = anchor.sourceVersionId;
      const locator = anchor.locator;
      const anchorHash = anchor.anchorHash;
      if (
        typeof sourceVersionId !== "string" ||
        !UUID.test(sourceVersionId) ||
        !selectedSourceVersionIds.includes(sourceVersionId) ||
        !validString(locator, 500, true) ||
        typeof anchorHash !== "string" ||
        !HASH.test(anchorHash)
      ) {
        throw new StudioRenditionError("INVALID_CONTENT");
      }
      anchoredSources.add(sourceVersionId);
    }
    if (mapped.id === "asIsFlow" || mapped.id === "toBeFlow") {
      try {
        if (inspectMermaidFlowcharts(mapped.body, true).length !== 1)
          throw new Error();
      } catch {
        throw new StudioRenditionError("INVALID_CONTENT");
      }
    }
    return { id: mapped.id, title: mapped.title, content: mapped.body };
  });
  if (
    selectedSourceVersionIds.some(
      (sourceVersionId) => !anchoredSources.has(sourceVersionId),
    )
  ) {
    throw new StudioRenditionError("INVALID_CONTENT");
  }
  return { title: source.title, summary: source.summary, sections };
};

export const normalizeStudioApprovedContent = (
  value: unknown,
  authority: Pick<
    StudioRenderingAuthority,
    "artifactType" | "contentSchemaVersion" | "templateVersion"
  > &
    Partial<Pick<StudioRenderingAuthority, "rendererVersion">>,
): StudioNormalizedContent => {
  if (
    !["studio-artifact-1", "studio-artifact-2"].includes(
      authority.contentSchemaVersion,
    )
  ) {
    throw new StudioRenditionError("VERSION_MISMATCH");
  }
  const expectedTemplate = `studio-${authority.artifactType}-1`;
  if (authority.templateVersion !== expectedTemplate) {
    throw new StudioRenditionError("VERSION_MISMATCH");
  }
  const source = validateStudioApprovedContent(value);
  const titleValue = source.title;
  const title = validString(titleValue, MAX_TITLE, true)
    ? titleValue
    : `${authority.artifactType.toUpperCase()} governed artifact`;

  const usesCurrentRenderer = authority.rendererVersion
    ? (Object.values(
        STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS,
      ) as readonly string[]).includes(authority.rendererVersion) ||
      authority.rendererVersion === STUDIO_SDD_PDF_RENDERER_VERSION ||
      authority.rendererVersion === STUDIO_BUSINESS_PDF_RENDERER_VERSION
    : false;
  if (usesCurrentRenderer)
    return normalizeStudioV2ApprovedContent(source, authority);

  // Renderer-1 claims are historical authority. Keep their permissive schema-2
  // normalization byte-compatible so an existing attempt can be reconciled.
  if (authority.contentSchemaVersion === "studio-artifact-2") {
    if (
      source.contractVersion !== "studio-artifact-2" ||
      !validString(source.summary, MAX_SUMMARY) ||
      !Array.isArray(source.sections) ||
      source.sections.length < 1 ||
      source.sections.length > MAX_SECTIONS
    ) {
      throw new StudioRenditionError("INVALID_CONTENT");
    }
    const sections = source.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section))
        throw new StudioRenditionError("INVALID_CONTENT");
      const mapped = section as Readonly<Record<string, StudioApprovedJson>>;
      if (
        !validString(mapped.id, 80, true) ||
        !validString(mapped.title, MAX_TITLE, true) ||
        !validString(mapped.body, MAX_SECTION_CONTENT) ||
        !Array.isArray(mapped.sourceAnchors) ||
        !Array.isArray(mapped.labels)
      ) {
        throw new StudioRenditionError("INVALID_CONTENT");
      }
      if (mapped.id === "asIsFlow" || mapped.id === "toBeFlow") {
        try {
          if (inspectMermaidFlowcharts(mapped.body, true).length !== 1)
            throw new Error();
        } catch {
          throw new StudioRenditionError("INVALID_CONTENT");
        }
      }
      return { id: mapped.id, title: mapped.title, content: mapped.body };
    });
    return { title, summary: source.summary as string, sections };
  }

  if (
    exactKeys(source, ["title", "summary", "sections"]) &&
    validString(source.title, MAX_TITLE, true) &&
    validString(source.summary, MAX_SUMMARY) &&
    Array.isArray(source.sections) &&
    source.sections.length >= 1 &&
    source.sections.length <= MAX_SECTIONS &&
    source.sections.every(
      (section) =>
        section !== null &&
        typeof section === "object" &&
        !Array.isArray(section) &&
        exactKeys(section, ["title", "content"]) &&
        validString(section.title, MAX_TITLE, true) &&
        validString(section.content, MAX_SECTION_CONTENT),
    )
  ) {
    return {
      title: source.title,
      summary: source.summary,
      sections: source.sections.map((section) => {
        const mapped = section as Readonly<Record<string, StudioApprovedJson>>;
        return {
          title: mapped.title as string,
          content: mapped.content as string,
        };
      }),
    };
  }

  if (
    exactKeys(source, ["title", "sections"]) &&
    validString(source.title, MAX_TITLE, true) &&
    Array.isArray(source.sections) &&
    source.sections.length >= 1 &&
    source.sections.length <= MAX_SECTIONS &&
    source.sections.every(
      (section) =>
        section !== null &&
        typeof section === "object" &&
        !Array.isArray(section) &&
        exactKeys(section, ["heading", "body"]) &&
        validString(section.heading, MAX_TITLE, true) &&
        validString(section.body, MAX_SECTION_CONTENT),
    )
  ) {
    return {
      title: source.title,
      summary: "",
      sections: source.sections.map((section) => {
        const mapped = section as Readonly<Record<string, StudioApprovedJson>>;
        return {
          title: mapped.heading as string,
          content: mapped.body as string,
        };
      }),
    };
  }

  const consumed = new Set<string>();
  if (validString(titleValue, MAX_TITLE, true)) consumed.add("title");
  let summary = "";
  const sections: Array<{ title: string; content: string }> = [];
  for (const key of TEMPLATE_SECTION_INVENTORY[authority.artifactType]) {
    if (!own(source, key)) continue;
    consumed.add(key);
    const text = displayValue(source[key]);
    if (key === "summary") summary = text;
    else sections.push({ title: humanize(key), content: text });
  }
  for (const key of Object.keys(source)
    .filter((key) => !consumed.has(key))
    .sort((left, right) => left.localeCompare(right))) {
    sections.push({ title: humanize(key), content: displayValue(source[key]) });
  }
  if (sections.length === 0) {
    sections.push({
      title: "Canonical content",
      content: stableCanonicalStudioJson(source),
    });
  }
  if (
    sections.length > MAX_SECTIONS ||
    summary.length > MAX_SUMMARY ||
    sections.some(
      (section) =>
        section.title.length > MAX_TITLE ||
        section.content.length > MAX_SECTION_CONTENT,
    )
  ) {
    throw new StudioRenditionError("CONTENT_OVERSIZED");
  }
  return { title, summary, sections };
};

const escapeMarkdownText = (value: string) =>
  value
    .replace(/\\/gu, "\\\\")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/([`*_{}\[\]()#+!|])/gu, "\\$1");

export const renderStudioMarkdown = (
  content: StudioNormalizedContent,
): Uint8Array => {
  const output: string[] = [
    `# ${escapeMarkdownText(content.title)}`,
    "",
    escapeMarkdownText(content.summary),
  ];
  for (const section of content.sections) {
    output.push(
      "",
      `## ${escapeMarkdownText(section.title)}`,
      "",
      escapeMarkdownText(section.content),
    );
  }
  output.push("");
  const bytes = encoder.encode(output.join("\n"));
  const decoded = decoder.decode(bytes);
  if (/<(?:script|iframe|object|embed|svg|math|link|meta)\b/iu.test(decoded)) {
    throw new StudioRenditionError("OUTPUT_INVALID");
  }
  return bytes;
};

const asciiPdfText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[\u2010-\u2015]/gu, "-")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[^\x20-\x7e\n\t]/gu, "?");
const pdfLiteral = (value: string) =>
  asciiPdfText(value)
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)");
const asciiBytes = (value: string) => {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1)
    bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
};
const latin1String = (bytes: Uint8Array) => {
  let value = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 16_384)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return value;
};

const wrapLine = (value: string, width: number) => {
  const lines: string[] = [];
  for (const rawLine of asciiPdfText(value)
    .replace(/\t/gu, "    ")
    .split("\n")) {
    const words = rawLine.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      if (word.length > width) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let start = 0; start < word.length; start += width) {
          const piece = word.slice(start, start + width);
          if (piece.length === width) lines.push(piece);
          else current = piece;
        }
      } else if (!current) current = word;
      else if (current.length + word.length + 1 <= width) current += ` ${word}`;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};

// Helvetica is one of the PDF standard fonts, so renderer 4 can wrap against
// its stable widths without embedding a font program. This avoids the uneven
// lines produced by character-count wrapping while keeping the PDF inert and
// deterministic.
const helveticaWidth = (value: string, size: number, bold = false) => {
  let units = 0;
  for (const character of asciiPdfText(value)) {
    if (character === " ") units += 278;
    else if (/[ilI.,'!|:;]/u.test(character)) units += 278;
    else if (/[mwMW@%&]/u.test(character)) units += bold ? 889 : 833;
    else if (/[A-Z0-9]/u.test(character)) units += bold ? 722 : 667;
    else units += bold ? 556 : 500;
  }
  return units * size / 1000;
};

const wrapMeasuredLine = (
  value: string,
  maxWidth: number,
  size: number,
  bold = false,
) => {
  const lines: string[] = [];
  for (const rawLine of asciiPdfText(value).replace(/\t/gu, "    ").split("\n")) {
    const words = rawLine.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (!current || helveticaWidth(next, size, bold) <= maxWidth) {
        current = next;
        continue;
      }
      lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
};
type PdfLine = {
  kind: "text";
  text: string;
  bold: boolean;
  size: number;
  advance: number;
};
type PdfDiagram = {
  kind: "diagram";
  title: string;
  chart: MermaidFlowchart;
  nodeIds: readonly string[];
  part: number;
  parts: number;
  advance: number;
};
type PdfItem = PdfLine | PdfDiagram;
const pdfItems = (
  content: StudioNormalizedContent,
  includeCompleteTransitionLegend = false,
): PdfItem[] => {
  const lines: PdfItem[] = [];
  const add = (
    value: string,
    bold: boolean,
    size: number,
    width: number,
    advance = size + 3,
  ) => {
    for (const text of wrapLine(value, width))
      lines.push({ kind: "text", text, bold, size, advance });
  };
  add(content.title, true, 18, 54, 25);
  add("Executive Summary", true, 13, 76, 19);
  add(content.summary, false, 11, 88, 15);
  lines.push({ kind: "text", text: "", bold: false, size: 11, advance: 8 });
  for (const section of content.sections) {
    if (section.id === "asIsFlow" || section.id === "toBeFlow") {
      const [chart] = inspectMermaidFlowcharts(section.content, true);
      const groups = Array.from(
        { length: Math.ceil(chart.nodes.length / 9) },
        (_, index) =>
          chart.nodes.slice(index * 9, index * 9 + 9).map((node) => node.id),
      );
      groups.forEach((nodeIds, index) =>
        lines.push({
          kind: "diagram",
          title: section.title,
          chart,
          nodeIds,
          part: index + 1,
          parts: groups.length,
          advance: 94 + nodeIds.length * 54,
        }),
      );
      const partByNode = new Map<string, number>();
      groups.forEach((nodeIds, index) =>
        nodeIds.forEach((nodeId) => partByNode.set(nodeId, index + 1)),
      );
      const nodeById = new Map(chart.nodes.map((node) => [node.id, node]));
      groups.forEach((nodeIds, index) => {
        const visible = new Set(nodeIds);
        const sourceOrder = new Map(
          nodeIds.map((nodeId, order) => [nodeId, order]),
        );
        const transitions = chart.edges.filter((edge) => {
          if (!visible.has(edge.from)) return false;
          const targetPart = partByNode.get(edge.to);
          const backward =
            visible.has(edge.to) &&
            sourceOrder.get(edge.to)! <= sourceOrder.get(edge.from)!;
          return targetPart !== index + 1 || backward;
        });
        if (transitions.length) {
          add(`Transitions from diagram part ${index + 1}`, true, 10, 88, 14);
          transitions.forEach((edge) => {
            const from = nodeById.get(edge.from)!;
            const to = nodeById.get(edge.to)!;
            const targetPart = partByNode.get(edge.to)!;
            const qualifier =
              targetPart === index + 1
                ? "cycle/back transition"
                : `continues in part ${targetPart}`;
            add(
              `[${from.id}] ${from.label} --${edge.branchLabel ?? "transition"}--> [${to.id}] ${to.label} (${qualifier})`,
              false,
              8,
              112,
              11,
            );
          });
        }
        const clipped = nodeIds
          .map((nodeId) => nodeById.get(nodeId)!)
          .filter((node) => node.label.length > 12);
        if (clipped.length) {
          add(`Full labels for diagram part ${index + 1}`, true, 10, 88, 14);
          clipped.forEach((node) =>
            add(`[${node.id}] ${node.label}`, false, 8, 112, 11),
          );
        }
      });
      if (includeCompleteTransitionLegend) {
        add("Complete transition legend", true, 10, 88, 14);
        chart.edges.forEach((edge, edgeIndex) => {
          const from = nodeById.get(edge.from)!;
          const to = nodeById.get(edge.to)!;
          add(
            `E${edgeIndex + 1}: [${from.id}] ${from.label} --${edge.branchLabel ?? "transition"}--> [${to.id}] ${to.label}`,
            false,
            8,
            112,
            11,
          );
        });
      }
    } else {
      add(section.title, true, 13, 76, 19);
      add(section.content, false, 11, 88, 15);
    }
    lines.push({ kind: "text", text: "", bold: false, size: 11, advance: 8 });
  }
  return lines;
};

const pdfItemsV4 = (content: StudioNormalizedContent): PdfItem[] => {
  const items: PdfItem[] = [];
  const add = (
    value: string,
    bold: boolean,
    size: number,
    maxWidth: number,
    advance = size + 4,
  ) => {
    for (const text of wrapMeasuredLine(value, maxWidth, size, bold))
      items.push({ kind: "text", text, bold, size, advance });
  };
  add(content.title, true, 18, 468, 25);
  add("Executive Summary", true, 13, 468, 19);
  add(content.summary, false, 11, 468, 16);
  items.push({ kind: "text", text: "", bold: false, size: 11, advance: 9 });
  for (const section of content.sections) {
    if (section.id === "asIsFlow" || section.id === "toBeFlow") {
      const [chart] = inspectMermaidFlowcharts(section.content, true);
      const groups = Array.from(
        { length: Math.ceil(chart.nodes.length / 8) },
        (_, index) => chart.nodes.slice(index * 8, index * 8 + 8).map(node => node.id),
      );
      groups.forEach((nodeIds, index) => {
        items.push({
          kind: "diagram",
          title: section.title,
          chart,
          nodeIds,
          part: index + 1,
          parts: groups.length,
          advance: 80 + nodeIds.length * 64,
        });
        const visible = new Set(nodeIds);
        const transitions = chart.edges.filter(edge => visible.has(edge.from));
        if (transitions.length) {
          add(
            groups.length > 1
              ? `Transition details for part ${index + 1}`
              : "Transition details",
            true,
            10,
            468,
            15,
          );
          for (const edge of transitions) {
            const from = chart.nodes.find(node => node.id === edge.from)!;
            const to = chart.nodes.find(node => node.id === edge.to)!;
            add(
              `[${from.id}] ${from.label} - ${edge.branchLabel ?? "continue"} -> [${to.id}] ${to.label}`,
              false,
              9,
              468,
              13,
            );
          }
        }
      });
    } else {
      add(section.title, true, 13, 468, 19);
      add(section.content, false, 11, 468, 16);
    }
    items.push({ kind: "text", text: "", bold: false, size: 11, advance: 9 });
  }
  return items;
};

const diagramCommands = (diagram: PdfDiagram, top: number) => {
  const areaLeft = 72;
  const areaWidth = 468;
  const height = 34;
  const gap = 28;
  const visible = new Set(diagram.nodeIds);
  const nodes = diagram.nodeIds.map((id) =>
    diagram.chart.nodes.find((node) => node.id === id)!,
  );
  const sourceOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const drawableEdges = diagram.chart.edges.filter(
    (edge) =>
      visible.has(edge.from) &&
      visible.has(edge.to) &&
      sourceOrder.get(edge.to)! > sourceOrder.get(edge.from)!,
  );
  const depth = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of drawableEdges) {
      depth.set(
        edge.to,
        Math.max(depth.get(edge.to)!, depth.get(edge.from)! + 1),
      );
    }
  }
  const levels = new Map<number, typeof nodes>();
  nodes.forEach((node) => {
    const level = Math.min(depth.get(node.id)!, nodes.length - 1);
    levels.set(level, [...(levels.get(level) ?? []), node]);
  });
  const positions = new Map<string, { x: number; y: number; width: number }>();
  [...levels.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([level, levelNodes]) => {
      const column = areaWidth / levelNodes.length;
      const width = Math.min(260, column - 18);
      levelNodes.forEach((node, index) =>
        positions.set(node.id, {
          x: areaLeft + index * column + (column - width) / 2,
          y: top - 48 - level * (height + gap),
          width,
        }),
      );
    });
  const commands = [
    "0.25 w",
    "0 G",
    "0 g",
    "BT",
    "/F2 13 Tf",
    `1 0 0 1 72 ${top} Tm`,
    `(${pdfLiteral(diagram.title)}) Tj`,
    "ET",
  ];
  if (diagram.parts > 1)
    commands.push(
      "BT",
      "/F1 8 Tf",
      `1 0 0 1 72 ${top - 16} Tm`,
      `(Diagram part ${diagram.part} of ${diagram.parts}) Tj`,
      "ET",
    );
  for (const edge of drawableEdges) {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const fromX = from.x + from.width / 2;
    const toX = to.x + to.width / 2;
    const fromY = from.y - height;
    const toY = to.y;
    commands.push(
      `${fromX} ${fromY} m ${toX} ${toY} l S`,
      `${toX - 3} ${toY + 5} m ${toX} ${toY} l ${toX + 3} ${toY + 5} l S`,
    );
    if (edge.branchLabel) {
      const branchLabel = edge.branchLabel.slice(0, 48);
      const branchX = (fromX + toX) / 2 + 5;
      const branchY = (fromY + toY) / 2;
      commands.push(
        "1 g",
        `${branchX - 2} ${branchY - 2} ${branchLabel.length * 4.5 + 4} 10 re f`,
        "0 g",
        "BT",
        "/F1 8 Tf",
        `1 0 0 1 ${branchX} ${branchY} Tm`,
        `(${pdfLiteral(branchLabel)}) Tj`,
        "ET",
      );
    }
  }
  nodes.forEach((node) => {
    const position = positions.get(node.id)!;
    const y = position.y - height;
    commands.push("0.96 g");
    if (node.kind === "decision")
      commands.push(
        `${position.x + position.width / 2} ${y + height} m ${position.x + position.width} ${y + height / 2} l ${position.x + position.width / 2} ${y} l ${position.x} ${y + height / 2} l h B`,
      );
    else commands.push(`${position.x} ${y} ${position.width} ${height} re B`);
    const max = Math.max(12, Math.floor(position.width / 5.6));
    const label =
      node.label.length > max
        ? `${node.label.slice(0, max - 3)}...`
        : node.label;
    const estimatedLabelWidth = Math.min(position.width - 20, label.length * 5);
    const labelX = position.x + (position.width - estimatedLabelWidth) / 2;
    commands.push(
      "0 g",
      "BT",
      "/F1 9 Tf",
      `1 0 0 1 ${labelX} ${y + 13} Tm`,
      `(${pdfLiteral(label)}) Tj`,
      "ET",
    );
  });
  return commands;
};

type PdfPoint = Readonly<{ x: number; y: number }>;
type PdfRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type StudioPdf3DiagramRoute = Readonly<{
  edgeId: string;
  from: string;
  to: string;
  points: readonly PdfPoint[];
  continuation: "none" | "outgoing" | "incoming";
}>;
export type StudioPdf3DiagramPlan = Readonly<{
  nodes: Readonly<Record<string, PdfRect>>;
  routes: readonly StudioPdf3DiagramRoute[];
}>;

const routeSegments = (points: readonly PdfPoint[]) =>
  points.slice(1).map((point, index) => [points[index], point] as const);
const segmentCrossesRect = (
  [start, end]: readonly [PdfPoint, PdfPoint],
  rect: PdfRect,
) => {
  if (start.x === end.x) {
    const low = Math.min(start.y, end.y);
    const high = Math.max(start.y, end.y);
    return start.x > rect.x && start.x < rect.x + rect.width &&
      high > rect.y && low < rect.y + rect.height;
  }
  if (start.y === end.y) {
    const low = Math.min(start.x, end.x);
    const high = Math.max(start.x, end.x);
    return start.y > rect.y && start.y < rect.y + rect.height &&
      high > rect.x && low < rect.x + rect.width;
  }
  return true;
};

export const planStudioPdf3Diagram = (
  diagram: PdfDiagram,
  top: number,
): StudioPdf3DiagramPlan => {
  const height = 34;
  const gap = 28;
  const nodeWidth = 280;
  const nodeX = 166;
  const visible = new Set(diagram.nodeIds);
  const nodes = Object.fromEntries(diagram.nodeIds.map((id, index) => [id, {
    x: nodeX,
    y: top - 48 - index * (height + gap) - height,
    width: nodeWidth,
    height,
  }])) as Record<string, PdfRect>;
  const sourceOrder = new Map(diagram.nodeIds.map((id, index) => [id, index]));
  let sideLane = 0;
  const routes: StudioPdf3DiagramRoute[] = [];
  diagram.chart.edges.forEach((edge, edgeIndex) => {
    const fromVisible = visible.has(edge.from);
    const toVisible = visible.has(edge.to);
    if (!fromVisible && !toVisible) return;
    const edgeId = `E${edgeIndex + 1}`;
    const fromRect = fromVisible ? nodes[edge.from] : undefined;
    const toRect = toVisible ? nodes[edge.to] : undefined;
    const adjacent = fromVisible && toVisible &&
      sourceOrder.get(edge.to)! === sourceOrder.get(edge.from)! + 1;
    if (adjacent) {
      routes.push({ edgeId, from: edge.from, to: edge.to, continuation: "none", points: [
        { x: fromRect!.x + fromRect!.width / 2, y: fromRect!.y },
        { x: toRect!.x + toRect!.width / 2, y: toRect!.y + toRect!.height },
      ] });
      return;
    }
    const right = sideLane % 2 === 1;
    const laneOffset = Math.floor(sideLane / 2) * 16;
    const laneX = right ? 500 + laneOffset : 112 - laneOffset;
    sideLane += 1;
    if (laneX < 32 || laneX > 580)
      throw new StudioRenditionError("OUTPUT_INVALID");
    if (fromRect && toRect) {
      const fromY = fromRect.y + fromRect.height / 2;
      const toY = toRect.y + toRect.height / 2;
      const fromX = right ? fromRect.x + fromRect.width : fromRect.x;
      const toX = right ? toRect.x + toRect.width : toRect.x;
      routes.push({ edgeId, from: edge.from, to: edge.to, continuation: "none", points: [
        { x: fromX, y: fromY }, { x: laneX, y: fromY },
        { x: laneX, y: toY }, { x: toX, y: toY },
      ] });
    } else if (fromRect) {
      const y = fromRect.y + fromRect.height / 2;
      const x = right ? fromRect.x + fromRect.width : fromRect.x;
      routes.push({ edgeId, from: edge.from, to: edge.to, continuation: "outgoing", points: [
        { x, y }, { x: laneX, y }, { x: laneX, y: 78 },
      ] });
    } else if (toRect) {
      const y = toRect.y + toRect.height / 2;
      const x = right ? toRect.x + toRect.width : toRect.x;
      routes.push({ edgeId, from: edge.from, to: edge.to, continuation: "incoming", points: [
        { x: laneX, y: top - 24 }, { x: laneX, y }, { x, y },
      ] });
    }
  });
  for (const route of routes) {
    for (const [nodeId, rect] of Object.entries(nodes)) {
      if (nodeId === route.from || nodeId === route.to) continue;
      if (routeSegments(route.points).some(segment => segmentCrossesRect(segment, rect)))
        throw new StudioRenditionError("OUTPUT_INVALID");
    }
  }
  return { nodes, routes };
};

const diagramCommandsV3 = (diagram: PdfDiagram, top: number) => {
  const plan = planStudioPdf3Diagram(diagram, top);
  const commands = [
    "0.25 w", "0 G", "0 g", "BT", "/F2 13 Tf",
    `1 0 0 1 72 ${top} Tm`, `(${pdfLiteral(diagram.title)}) Tj`, "ET",
  ];
  if (diagram.parts > 1) commands.push(
    "BT", "/F1 8 Tf", `1 0 0 1 72 ${top - 16} Tm`,
    `(Diagram part ${diagram.part} of ${diagram.parts}) Tj`, "ET",
  );
  for (const route of plan.routes) {
    const [first, ...rest] = route.points;
    const path = [`${first.x} ${first.y} m`, ...rest.map(point => `${point.x} ${point.y} l`), "S"];
    commands.push(...path);
    const last = route.points.at(-1)!;
    const before = route.points.at(-2)!;
    if (route.continuation !== "outgoing") {
      if (last.x === before.x)
        commands.push(`${last.x - 3} ${last.y + 5} m ${last.x} ${last.y} l ${last.x + 3} ${last.y + 5} l S`);
      else {
        const direction = last.x > before.x ? -1 : 1;
        commands.push(`${last.x + direction * 5} ${last.y - 3} m ${last.x} ${last.y} l ${last.x + direction * 5} ${last.y + 3} l S`);
      }
    }
    const markerSegment = routeSegments(route.points).reduce((longest, segment) => {
      const length = Math.abs(segment[1].x - segment[0].x) + Math.abs(segment[1].y - segment[0].y);
      const longestLength = Math.abs(longest[1].x - longest[0].x) + Math.abs(longest[1].y - longest[0].y);
      return length > longestLength ? segment : longest;
    });
    const marker = {
      x: (markerSegment[0].x + markerSegment[1].x) / 2,
      y: (markerSegment[0].y + markerSegment[1].y) / 2,
    };
    commands.push("1 g", `${marker.x - 2} ${marker.y - 2} 18 10 re f`, "0 g", "BT", "/F2 8 Tf",
      `1 0 0 1 ${marker.x} ${marker.y} Tm`, `(${route.edgeId}) Tj`, "ET");
  }
  const nodeById = new Map(diagram.chart.nodes.map(node => [node.id, node]));
  for (const [nodeId, rect] of Object.entries(plan.nodes)) {
    const node = nodeById.get(nodeId)!;
    commands.push("0.96 g", `${rect.x} ${rect.y} ${rect.width} ${rect.height} re B`);
    const max = Math.max(12, Math.floor(rect.width / 5.6));
    const label = node.label.length > max ? `${node.label.slice(0, max - 3)}...` : node.label;
    const width = Math.min(rect.width - 20, label.length * 5);
    commands.push("0 g", "BT", "/F1 9 Tf",
      `1 0 0 1 ${rect.x + (rect.width - width) / 2} ${rect.y + 13} Tm`,
      `(${pdfLiteral(label)}) Tj`, "ET");
  }
  return commands;
};

const diagramCommandsV4 = (diagram: PdfDiagram, top: number) => {
  const nodeHeight = 46;
  const nodeWidth = 300;
  const nodeX = 156;
  const step = 64;
  const visible = new Set(diagram.nodeIds);
  const nodes = Object.fromEntries(diagram.nodeIds.map((id, index) => [id, {
    x: nodeX,
    y: top - 42 - index * step - nodeHeight,
    width: nodeWidth,
    height: nodeHeight,
  }])) as Record<string, PdfRect>;
  const sourceOrder = new Map(diagram.nodeIds.map((id, index) => [id, index]));
  let sideLane = 0;
  const routes: StudioPdf3DiagramRoute[] = [];
  diagram.chart.edges.forEach((edge, edgeIndex) => {
    const fromRect = nodes[edge.from];
    const toRect = nodes[edge.to];
    if (!fromRect && !toRect) return;
    const adjacent = fromRect && toRect &&
      sourceOrder.get(edge.to)! === sourceOrder.get(edge.from)! + 1;
    if (adjacent) {
      routes.push({
        edgeId: `E${edgeIndex + 1}`,
        from: edge.from,
        to: edge.to,
        continuation: "none",
        points: [
          { x: fromRect.x + nodeWidth / 2, y: fromRect.y },
          { x: toRect.x + nodeWidth / 2, y: toRect.y + nodeHeight },
        ],
      });
      return;
    }
    const right = sideLane % 2 === 1;
    const laneX = right
      ? 492 + Math.floor(sideLane / 2) * 14
      : 120 - Math.floor(sideLane / 2) * 14;
    sideLane += 1;
    if (laneX < 42 || laneX > 570)
      throw new StudioRenditionError("OUTPUT_INVALID");
    if (fromRect && toRect) {
      const fromY = fromRect.y + nodeHeight / 2;
      const toY = toRect.y + nodeHeight / 2;
      const fromX = right ? fromRect.x + nodeWidth : fromRect.x;
      const toX = right ? toRect.x + nodeWidth : toRect.x;
      routes.push({
        edgeId: `E${edgeIndex + 1}`,
        from: edge.from,
        to: edge.to,
        continuation: "none",
        points: [
          { x: fromX, y: fromY },
          { x: laneX, y: fromY },
          { x: laneX, y: toY },
          { x: toX, y: toY },
        ],
      });
    } else if (fromRect) {
      const y = fromRect.y + nodeHeight / 2;
      const x = right ? fromRect.x + nodeWidth : fromRect.x;
      routes.push({
        edgeId: `E${edgeIndex + 1}`,
        from: edge.from,
        to: edge.to,
        continuation: "outgoing",
        points: [{ x, y }, { x: laneX, y }, { x: laneX, y: 82 }],
      });
    } else {
      const y = toRect.y + nodeHeight / 2;
      const x = right ? toRect.x + nodeWidth : toRect.x;
      routes.push({
        edgeId: `E${edgeIndex + 1}`,
        from: edge.from,
        to: edge.to,
        continuation: "incoming",
        points: [{ x: laneX, y: top - 22 }, { x: laneX, y }, { x, y }],
      });
    }
  });
  const commands = [
    "0.5 w", "0 G", "0 g", "BT", "/F2 13 Tf",
    `1 0 0 1 72 ${top} Tm`, `(${pdfLiteral(diagram.title)}) Tj`, "ET",
  ];
  if (diagram.parts > 1) commands.push(
    "BT", "/F1 9 Tf", `1 0 0 1 72 ${top - 16} Tm`,
    `(Diagram part ${diagram.part} of ${diagram.parts}) Tj`, "ET",
  );
  const edgeById = new Map(
    diagram.chart.edges.map((edge, index) => [`E${index + 1}`, edge]),
  );
  for (const route of routes) {
    const [first, ...rest] = route.points;
    commands.push(
      `${first.x} ${first.y} m`,
      ...rest.map(point => `${point.x} ${point.y} l`),
      "S",
    );
    const last = route.points.at(-1)!;
    const before = route.points.at(-2)!;
    if (route.continuation !== "outgoing") {
      if (last.x === before.x)
        commands.push(
          `${last.x - 4} ${last.y + 6} m ${last.x} ${last.y} l ${last.x + 4} ${last.y + 6} l S`,
        );
      else {
        const direction = last.x > before.x ? -1 : 1;
        commands.push(
          `${last.x + direction * 6} ${last.y - 4} m ${last.x} ${last.y} l ${last.x + direction * 6} ${last.y + 4} l S`,
        );
      }
    }
    const edge = edgeById.get(route.edgeId)!;
    if (edge.branchLabel) {
      const sideRoute = route.points.length > 2;
      const label = asciiPdfText(sideRoute ? route.edgeId : edge.branchLabel);
      const segment = routeSegments(route.points).reduce((longest, candidate) => {
        const length = Math.abs(candidate[1].x - candidate[0].x) +
          Math.abs(candidate[1].y - candidate[0].y);
        const longestLength = Math.abs(longest[1].x - longest[0].x) +
          Math.abs(longest[1].y - longest[0].y);
        return length > longestLength ? candidate : longest;
      });
      const width = Math.min(220, helveticaWidth(label, 9, true) + 8);
      const marker = {
        x: (segment[0].x + segment[1].x) / 2,
        y: (segment[0].y + segment[1].y) / 2,
      };
      const labelX = Math.min(540 - width, Math.max(72, marker.x - width / 2));
      commands.push(
        "1 g",
        `${labelX - 2} ${marker.y - 3} ${width + 4} 13 re f`,
        "0 g", "BT", "/F2 9 Tf",
        `1 0 0 1 ${labelX} ${marker.y} Tm`,
        `(${pdfLiteral(label)}) Tj`, "ET",
      );
    }
  }
  const nodeById = new Map(diagram.chart.nodes.map(node => [node.id, node]));
  for (const [nodeId, rect] of Object.entries(nodes)) {
    const node = nodeById.get(nodeId)!;
    commands.push("0.96 g");
    if (node.kind === "decision") commands.push(
      `${rect.x + rect.width / 2} ${rect.y + rect.height} m ${rect.x + rect.width} ${rect.y + rect.height / 2} l ${rect.x + rect.width / 2} ${rect.y} l ${rect.x} ${rect.y + rect.height / 2} l h B`,
    );
    else commands.push(`${rect.x} ${rect.y} ${rect.width} ${rect.height} re B`);
    const lines = wrapMeasuredLine(node.label, rect.width - 28, 9, true);
    if (lines.length > 3) throw new StudioRenditionError("OUTPUT_INVALID");
    const startY = rect.y + rect.height / 2 + (lines.length - 1) * 5 - 3;
    lines.forEach((line, index) => {
      const width = helveticaWidth(line, 9, true);
      commands.push(
        "0 g", "BT", "/F2 9 Tf",
        `1 0 0 1 ${rect.x + (rect.width - width) / 2} ${startY - index * 11} Tm`,
        `(${pdfLiteral(line)}) Tj`, "ET",
      );
    });
  }
  return commands;
};

const legacyPdfLines = (content: StudioNormalizedContent) => {
  const lines: Array<{
    text: string;
    bold: boolean;
    size: number;
    advance: number;
  }> = [];
  const add = (
    value: string,
    bold: boolean,
    size: number,
    width: number,
    advance = size + 3,
  ) => {
    for (const text of wrapLine(value, width))
      lines.push({ text, bold, size, advance });
  };
  add(content.title, true, 18, 54, 25);
  add("Executive Summary", true, 13, 76, 19);
  add(content.summary, false, 11, 88, 15);
  lines.push({ text: "", bold: false, size: 11, advance: 8 });
  for (const section of content.sections) {
    add(section.title, true, 13, 76, 19);
    add(section.content, false, 11, 88, 15);
    lines.push({ text: "", bold: false, size: 11, advance: 8 });
  }
  return lines;
};

const renderStudioLegacyPdf = (
  content: StudioNormalizedContent,
): Uint8Array => {
  const pages: ReturnType<typeof legacyPdfLines>[] = [[]];
  let y = 720;
  for (const line of legacyPdfLines(content)) {
    if (y - line.advance < 72 && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = 720;
    }
    pages[pages.length - 1].push(line);
    y -= line.advance;
  }
  const pageCount = pages.length;
  const infoId = 5 + pageCount * 2;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  objects.set(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects.set(
    4,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    let cursor = 720;
    const commands = ["BT"];
    for (const line of page) {
      commands.push(
        `/${line.bold ? "F2" : "F1"} ${line.size} Tf`,
        `1 0 0 1 72 ${cursor} Tm`,
        `(${pdfLiteral(line.text)}) Tj`,
      );
      cursor -= line.advance;
    }
    commands.push("ET");
    const stream = `${commands.join("\n")}\n`;
    objects.set(
      streamId,
      `<< /Length ${asciiBytes(stream).byteLength} >>\nstream\n${stream}endstream`,
    );
  });
  objects.set(
    infoId,
    "<< /Title (Governed Studio Artifact) /Author (AvalaOS Studio) /Creator (AvalaOS Studio) /Producer (AvalaOS deterministic studio-pdf-1) /CreationDate (D:20000101000000Z) /ModDate (D:20000101000000Z) >>",
  );
  let pdf = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets = new Array<number>(infoId + 1).fill(0);
  for (let id = 1; id <= infoId; id += 1) {
    offsets[id] = asciiBytes(pdf).byteLength;
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = asciiBytes(pdf).byteLength;
  pdf += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= infoId; id += 1)
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R /ID [<00000000000000000000000000000000><00000000000000000000000000000000>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const bytes = asciiBytes(pdf);
  assertValidStudioPdf(bytes);
  return bytes;
};

export const renderStudioPdf = (
  content: StudioNormalizedContent,
  rendererVersion:
    | "studio-pdf-1"
    | "studio-pdf-2"
    | "studio-pdf-3"
    | "studio-pdf-4" = "studio-pdf-1",
): Uint8Array => {
  const pages: PdfItem[][] = [[]];
  let y = 720;
  const items = rendererVersion === STUDIO_BUSINESS_PDF_RENDERER_VERSION
    ? pdfItemsV4(content)
    : pdfItems(content, rendererVersion === STUDIO_SDD_PDF_RENDERER_VERSION);
  for (const line of items) {
    if (y - line.advance < 72 && pages[pages.length - 1].length > 0) {
      pages.push([]);
      y = 720;
    }
    pages[pages.length - 1].push(line);
    y -= line.advance;
  }
  const pageCount = pages.length;
  const infoId = 5 + pageCount * 2;
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  objects.set(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects.set(
    4,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    let cursor = 720;
    const commands: string[] = [];
    for (const line of page) {
      if (line.kind === "diagram")
        commands.push(...(
          rendererVersion === STUDIO_BUSINESS_PDF_RENDERER_VERSION
            ? diagramCommandsV4(line, cursor)
            : rendererVersion === STUDIO_SDD_PDF_RENDERER_VERSION
              ? diagramCommandsV3(line, cursor)
              : diagramCommands(line, cursor)
        ));
      else
        commands.push(
          "0 g",
          "BT",
          `/${line.bold ? "F2" : "F1"} ${line.size} Tf`,
          `1 0 0 1 72 ${cursor} Tm`,
          `(${pdfLiteral(line.text)}) Tj`,
          "ET",
        );
      cursor -= line.advance;
    }
    const stream = `${commands.join("\n")}\n`;
    objects.set(
      streamId,
      `<< /Length ${asciiBytes(stream).byteLength} >>\nstream\n${stream}endstream`,
    );
  });
  objects.set(
    infoId,
    `<< /Title (Governed Studio Artifact) /Author (AvalaOS Studio) /Creator (AvalaOS Studio) /Producer (AvalaOS deterministic ${rendererVersion}) /CreationDate (D:20000101000000Z) /ModDate (D:20000101000000Z) >>`,
  );

  let pdf = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets = new Array<number>(infoId + 1).fill(0);
  for (let id = 1; id <= infoId; id += 1) {
    offsets[id] = asciiBytes(pdf).byteLength;
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = asciiBytes(pdf).byteLength;
  pdf += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= infoId; id += 1)
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R /ID [<00000000000000000000000000000000><00000000000000000000000000000000>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const bytes = asciiBytes(pdf);
  assertValidStudioPdf(bytes);
  return bytes;
};

const removePdfLiterals = (source: string) => {
  let output = "";
  let depth = 0;
  let escaped = false;
  for (const character of source) {
    if (depth > 0) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    } else if (character === "(") depth = 1;
    else output += character;
  }
  return output;
};

export const assertValidStudioPdf = (bytes: Uint8Array) => {
  const source = latin1String(bytes);
  if (!source.startsWith("%PDF-1.7\n") || !source.endsWith("%%EOF\n"))
    throw new StudioRenditionError("OUTPUT_INVALID");
  const xrefIndex = source.indexOf("xref\n");
  const startMatch = /startxref\n(\d+)\n%%EOF\n$/u.exec(source);
  if (xrefIndex < 0 || !startMatch || Number(startMatch[1]) !== xrefIndex)
    throw new StudioRenditionError("OUTPUT_INVALID");
  const trailerMatch =
    /trailer\n<< \/Size (\d+) \/Root 1 0 R \/Info (\d+) 0 R/u.exec(source);
  if (!trailerMatch || trailerMatch[1] !== String(Number(trailerMatch[2]) + 1))
    throw new StudioRenditionError("OUTPUT_INVALID");
  const xrefMatch =
    /xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)trailer/u.exec(
      source,
    );
  if (!xrefMatch) throw new StudioRenditionError("OUTPUT_INVALID");
  const entries = xrefMatch[2].trim().split("\n");
  if (entries.length !== Number(xrefMatch[1]) - 1)
    throw new StudioRenditionError("OUTPUT_INVALID");
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    if (!source.startsWith(`${index + 1} 0 obj\n`, offset))
      throw new StudioRenditionError("OUTPUT_INVALID");
  });
  const structural = removePdfLiterals(source);
  if (
    /\/(?:JavaScript|JS|EmbeddedFiles|EmbeddedFile|Filespec|AcroForm|XFA|Launch|URI|GoToR|SubmitForm|ImportData)\b/u.test(
      structural,
    )
  ) {
    throw new StudioRenditionError("OUTPUT_INVALID");
  }
};

const xml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
const paragraph = (text: string, style: "Title" | "Heading1" | "BodyText") => {
  const lines = text.split("\n");
  return lines
    .map(
      (line) =>
        `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`,
    )
    .join("");
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const concat = (chunks: readonly Uint8Array[]) => {
  const result = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};
const u16 = (value: number) =>
  new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
const u32 = (value: number) =>
  new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
const readU16 = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8);
const readU32 = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0;
type ZipEntry = { name: string; bytes: Uint8Array };
const storedZip = (entries: readonly ZipEntry[]) => {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0x0021),
      u32(crc),
      u32(entry.bytes.byteLength),
      u32(entry.bytes.byteLength),
      u16(name.byteLength),
      u16(0),
      name,
    ]);
    local.push(localHeader, entry.bytes);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0x0021),
        u32(crc),
        u32(entry.bytes.byteLength),
        u32(entry.bytes.byteLength),
        u16(name.byteLength),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += localHeader.byteLength + entry.bytes.byteLength;
  }
  const centralBytes = concat(central);
  return concat([
    ...local,
    centralBytes,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.byteLength),
    u32(offset),
    u16(0),
  ]);
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Governed Studio Artifact</dc:title><dc:creator>AvalaOS Studio</dc:creator><cp:lastModifiedBy>AvalaOS Studio</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>`;
const appMetadata = (rendererVersion: "studio-docx-1" | "studio-docx-2") =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>AvalaOS deterministic ${rendererVersion}</Application><AppVersion>1.0</AppVersion></Properties>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;

export const renderStudioDocx = (
  content: StudioNormalizedContent,
  rendererVersion: "studio-docx-1" | "studio-docx-2" = "studio-docx-1",
): Uint8Array => {
  const body = [
    paragraph(content.title, "Title"),
    paragraph("Executive Summary", "Heading1"),
    paragraph(content.summary, "BodyText"),
  ];
  for (const section of content.sections)
    body.push(
      paragraph(section.title, "Heading1"),
      paragraph(section.content, "BodyText"),
    );
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", bytes: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", bytes: encoder.encode(ROOT_RELS) },
    {
      name: "docProps/app.xml",
      bytes: encoder.encode(appMetadata(rendererVersion)),
    },
    { name: "docProps/core.xml", bytes: encoder.encode(CORE) },
    { name: "word/_rels/document.xml.rels", bytes: encoder.encode(DOC_RELS) },
    { name: "word/document.xml", bytes: encoder.encode(document) },
    { name: "word/styles.xml", bytes: encoder.encode(STYLES) },
  ];
  const bytes = storedZip(entries);
  inspectStudioDocxEntries(bytes);
  return bytes;
};

export const inspectStudioDocxEntries = (
  bytes: Uint8Array,
): ReadonlyMap<string, Uint8Array> => {
  if (
    bytes.byteLength < 22 ||
    readU32(bytes, bytes.byteLength - 22) !== 0x06054b50
  )
    throw new StudioRenditionError("OUTPUT_INVALID");
  const eocd = bytes.byteLength - 22;
  const count = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  if (count < 1 || centralOffset + centralSize !== eocd)
    throw new StudioRenditionError("OUTPUT_INVALID");
  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (
      readU32(bytes, cursor) !== 0x02014b50 ||
      readU16(bytes, cursor + 10) !== 0
    )
      throw new StudioRenditionError("OUTPUT_INVALID");
    const expectedCrc = readU32(bytes, cursor + 16);
    const size = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const localOffset = readU32(bytes, cursor + 42);
    const name = decoder.decode(
      bytes.slice(cursor + 46, cursor + 46 + nameLength),
    );
    if (
      !name ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === "..") ||
      result.has(name)
    )
      throw new StudioRenditionError("OUTPUT_INVALID");
    if (
      readU32(bytes, localOffset) !== 0x04034b50 ||
      readU16(bytes, localOffset + 8) !== 0
    )
      throw new StudioRenditionError("OUTPUT_INVALID");
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + size);
    if (data.byteLength !== size || crc32(data) !== expectedCrc)
      throw new StudioRenditionError("OUTPUT_INVALID");
    result.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize)
    throw new StudioRenditionError("OUTPUT_INVALID");
  const required = [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/app.xml",
    "docProps/core.xml",
    "word/_rels/document.xml.rels",
    "word/document.xml",
    "word/styles.xml",
  ];
  if (required.some((name) => !result.has(name)))
    throw new StudioRenditionError("OUTPUT_INVALID");
  for (const [name, data] of result) {
    if (
      /\.(?:bin|exe|dll|js|vbs|ole)$/iu.test(name) ||
      /(?:vbaProject|activeX|embeddings|oleObject)/iu.test(name)
    )
      throw new StudioRenditionError("OUTPUT_INVALID");
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const source = decoder.decode(data);
      if (
        /TargetMode\s*=\s*["']External["']/iu.test(source) ||
        /(?:javascript|vbscript|data):/iu.test(source) ||
        /<(?:w:object|o:OLEObject|w:altChunk)\b/iu.test(source)
      )
        throw new StudioRenditionError("OUTPUT_INVALID");
    }
  }
  return result;
};

export const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const renderStudioPrivateArtifact = async (
  value: unknown,
  format: string,
  authority: StudioRenderingAuthority,
): Promise<StudioRenderedArtifact> => {
  if (!(STUDIO_RENDITION_FORMATS as readonly string[]).includes(format)) {
    throw new StudioRenditionError("UNSUPPORTED_FORMAT");
  }
  const typedFormat = format as StudioRenditionFormat;
  const currentRenderer =
    STUDIO_PRIVATE_ARTIFACT_RENDERER_VERSIONS[typedFormat];
  const legacyRenderer =
    STUDIO_PRIVATE_ARTIFACT_LEGACY_RENDERER_VERSIONS[typedFormat];
  if (
    authority.rendererVersion !== currentRenderer &&
    authority.rendererVersion !== legacyRenderer &&
    authority.rendererVersion !== STUDIO_SDD_PDF_RENDERER_VERSION &&
    authority.rendererVersion !== STUDIO_BUSINESS_PDF_RENDERER_VERSION
  ) {
    throw new StudioRenditionError("VERSION_MISMATCH");
  }
  const usesSddPdf3 = authority.rendererVersion === STUDIO_SDD_PDF_RENDERER_VERSION;
  const usesBusinessPdf4 =
    authority.rendererVersion === STUDIO_BUSINESS_PDF_RENDERER_VERSION;
  if (usesSddPdf3 && (
    typedFormat !== "pdf" ||
    authority.artifactType !== "sdd" ||
    authority.contentSchemaVersion !== "studio-artifact-2" ||
    authority.templateVersion !== "studio-sdd-1"
  )) throw new StudioRenditionError("VERSION_MISMATCH");
  if (usesBusinessPdf4 && (
    typedFormat !== "pdf" ||
    authority.contentSchemaVersion !==
      (authority.artifactType === "sdd" ? "studio-artifact-2" : "studio-artifact-1") ||
    authority.templateVersion !== `studio-${authority.artifactType}-1`
  )) throw new StudioRenditionError("VERSION_MISMATCH");
  const usesCurrentRenderer = authority.rendererVersion === currentRenderer;
  const content = normalizeStudioApprovedContent(value, authority);
  const bytes =
    typedFormat === "markdown"
      ? renderStudioMarkdown(content)
      : typedFormat === "pdf"
        ? usesCurrentRenderer || usesSddPdf3 || usesBusinessPdf4 ||
          authority.contentSchemaVersion === "studio-artifact-2"
          ? renderStudioPdf(
              content,
              authority.rendererVersion as
                | "studio-pdf-1"
                | "studio-pdf-2"
                | "studio-pdf-3"
                | "studio-pdf-4",
            )
          : renderStudioLegacyPdf(content)
        : renderStudioDocx(
            content,
            authority.rendererVersion as "studio-docx-1" | "studio-docx-2",
          );
  if (!bytes.byteLength || bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new StudioRenditionError("OUTPUT_OVERSIZED");
  }
  if (typedFormat === "pdf") assertValidStudioPdf(bytes);
  if (typedFormat === "docx") inspectStudioDocxEntries(bytes);
  return Object.freeze({
    bytes,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    mimeType: MIME[typedFormat],
    filename: FILENAMES[typedFormat],
    format: typedFormat,
    rendererVersion: authority.rendererVersion,
    templateVersion: authority.templateVersion,
    contentSchemaVersion: authority.contentSchemaVersion,
    normalizerVersion: STUDIO_CONTENT_NORMALIZER_VERSION,
  });
};
