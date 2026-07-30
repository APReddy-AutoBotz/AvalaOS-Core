export const STUDIO_RENDITION_FORMATS = ['markdown', 'pdf', 'docx'] as const;
export type StudioRenditionFormat = typeof STUDIO_RENDITION_FORMATS[number];

export type StudioApprovedContent = Readonly<{
  title: string;
  summary: string;
  sections: ReadonlyArray<Readonly<{ title: string; content: string }>>;
}>;

export type StudioRenderedArtifact = Readonly<{
  bytes: Uint8Array;
  byteLength: number;
  sha256: string;
  mimeType: string;
  filename: string;
  format: StudioRenditionFormat;
  rendererVersion: 'markdown-v1' | 'pdf-v1' | 'docx-v1';
  templateVersion: 'standard_business_brief-v1';
}>;

export type StudioRenditionErrorCode =
  | 'INVALID_CONTENT'
  | 'CONTENT_OVERSIZED'
  | 'UNSUPPORTED_FORMAT'
  | 'OUTPUT_OVERSIZED'
  | 'OUTPUT_INVALID';

export class StudioRenditionError extends Error {
  constructor(readonly code: StudioRenditionErrorCode) {
    super(code);
    this.name = 'StudioRenditionError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_SOURCE_BYTES = 500_000;
const MAX_OUTPUT_BYTES = 5_000_000;
const MAX_SECTIONS = 100;
const MAX_TITLE = 300;
const MAX_SUMMARY = 5_000;
const MAX_SECTION_CONTENT = 20_000;
const MIME = {
  markdown: 'text/markdown; charset=utf-8',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
const FILENAMES = {
  markdown: 'studio-artifact-rendition.md',
  pdf: 'studio-artifact-rendition.pdf',
  docx: 'studio-artifact-rendition.docx',
} as const;
const VERSIONS = { markdown: 'markdown-v1', pdf: 'pdf-v1', docx: 'docx-v1' } as const;
const TEMPLATE_VERSION = 'standard_business_brief-v1' as const;
const invalidText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/u;

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const exactKeys = (value: object, expected: readonly string[]) => {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => own(value, key));
};
const validString = (value: unknown, max: number, required = false): value is string => (
  typeof value === 'string' &&
  value.length <= max &&
  (!required || value.trim().length > 0) &&
  value === value.normalize('NFC') &&
  !invalidText.test(value) &&
  !loneSurrogate.test(value)
);

export const validateStudioApprovedContent = (value: unknown): StudioApprovedContent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !exactKeys(value, ['title', 'summary', 'sections'])) {
    throw new StudioRenditionError('INVALID_CONTENT');
  }
  const candidate = value as Record<string, unknown>;
  if (!validString(candidate.title, MAX_TITLE, true) ||
      !validString(candidate.summary, MAX_SUMMARY) ||
      !Array.isArray(candidate.sections) ||
      candidate.sections.length < 1 || candidate.sections.length > MAX_SECTIONS) {
    throw new StudioRenditionError('INVALID_CONTENT');
  }
  for (const section of candidate.sections) {
    if (typeof section !== 'object' || section === null || Array.isArray(section) ||
        !exactKeys(section, ['title', 'content'])) {
      throw new StudioRenditionError('INVALID_CONTENT');
    }
    const record = section as Record<string, unknown>;
    if (!validString(record.title, MAX_TITLE, true) ||
        !validString(record.content, MAX_SECTION_CONTENT)) {
      throw new StudioRenditionError('INVALID_CONTENT');
    }
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new StudioRenditionError('INVALID_CONTENT');
  }
  if (encoder.encode(serialized).byteLength > MAX_SOURCE_BYTES) {
    throw new StudioRenditionError('CONTENT_OVERSIZED');
  }
  return value as StudioApprovedContent;
};

const escapeMarkdownText = (value: string) => value
  .replace(/\\/gu, '\\\\')
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/([`*_{}\[\]()#+!|])/gu, '\\$1');

export const renderStudioMarkdown = (content: StudioApprovedContent): Uint8Array => {
  const output: string[] = [
    `# ${escapeMarkdownText(content.title)}`,
    '',
    escapeMarkdownText(content.summary),
  ];
  for (const section of content.sections) {
    output.push('', `## ${escapeMarkdownText(section.title)}`, '', escapeMarkdownText(section.content));
  }
  output.push('');
  const bytes = encoder.encode(output.join('\n'));
  const decoded = decoder.decode(bytes);
  if (/<(?:script|iframe|object|embed|svg|math|link|meta)\b/iu.test(decoded)) {
    throw new StudioRenditionError('OUTPUT_INVALID');
  }
  return bytes;
};

const asciiPdfText = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/gu, '')
  .replace(/[\u2010-\u2015]/gu, '-')
  .replace(/[\u2018\u2019]/gu, "'")
  .replace(/[\u201c\u201d]/gu, '"')
  .replace(/[^\x20-\x7e\n\t]/gu, '?');
const pdfLiteral = (value: string) => asciiPdfText(value)
  .replace(/\\/gu, '\\\\')
  .replace(/\(/gu, '\\(')
  .replace(/\)/gu, '\\)');
const asciiBytes = (value: string) => {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
};
const latin1String = (bytes: Uint8Array) => {
  let value = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 16_384) value += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return value;
};

const wrapLine = (value: string, width: number) => {
  const lines: string[] = [];
  for (const rawLine of asciiPdfText(value).replace(/\t/gu, '    ').split('\n')) {
    const words = rawLine.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let current = '';
    for (const word of words) {
      if (word.length > width) {
        if (current) { lines.push(current); current = ''; }
        for (let start = 0; start < word.length; start += width) {
          const piece = word.slice(start, start + width);
          if (piece.length === width) lines.push(piece); else current = piece;
        }
      } else if (!current) current = word;
      else if (current.length + word.length + 1 <= width) current += ` ${word}`;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
};
type PdfLine = { text: string; bold: boolean; size: number; advance: number };
const pdfLines = (content: StudioApprovedContent): PdfLine[] => {
  const lines: PdfLine[] = [];
  const add = (value: string, bold: boolean, size: number, width: number, advance = size + 3) => {
    for (const text of wrapLine(value, width)) lines.push({ text, bold, size, advance });
  };
  add(content.title, true, 18, 54, 25);
  add('Executive Summary', true, 13, 76, 19);
  add(content.summary, false, 11, 88, 15);
  lines.push({ text: '', bold: false, size: 11, advance: 8 });
  for (const section of content.sections) {
    add(section.title, true, 13, 76, 19);
    add(section.content, false, 11, 88, 15);
    lines.push({ text: '', bold: false, size: 11, advance: 8 });
  }
  return lines;
};

export const renderStudioPdf = (content: StudioApprovedContent): Uint8Array => {
  const pages: PdfLine[][] = [[]];
  let y = 720;
  for (const line of pdfLines(content)) {
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
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const streamId = pageId + 1;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    let cursor = 720;
    const commands = ['BT'];
    for (const line of page) {
      commands.push(`/${line.bold ? 'F2' : 'F1'} ${line.size} Tf`, `1 0 0 1 72 ${cursor} Tm`, `(${pdfLiteral(line.text)}) Tj`);
      cursor -= line.advance;
    }
    commands.push('ET');
    const stream = `${commands.join('\n')}\n`;
    objects.set(streamId, `<< /Length ${asciiBytes(stream).byteLength} >>\nstream\n${stream}endstream`);
  });
  objects.set(infoId, '<< /Title (Governed Studio Artifact) /Author (AvalaOS Studio) /Creator (AvalaOS Studio) /Producer (AvalaOS deterministic pdf-v1) /CreationDate (D:20000101000000Z) /ModDate (D:20000101000000Z) >>');

  let pdf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  const offsets = new Array<number>(infoId + 1).fill(0);
  for (let id = 1; id <= infoId; id += 1) {
    offsets[id] = asciiBytes(pdf).byteLength;
    pdf += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = asciiBytes(pdf).byteLength;
  pdf += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= infoId; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R /ID [<00000000000000000000000000000000><00000000000000000000000000000000>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const bytes = asciiBytes(pdf);
  assertValidStudioPdf(bytes);
  return bytes;
};

const removePdfLiterals = (source: string) => {
  let output = '';
  let depth = 0;
  let escaped = false;
  for (const character of source) {
    if (depth > 0) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
    } else if (character === '(') depth = 1;
    else output += character;
  }
  return output;
};

export const assertValidStudioPdf = (bytes: Uint8Array) => {
  const source = latin1String(bytes);
  if (!source.startsWith('%PDF-1.7\n') || !source.endsWith('%%EOF\n')) throw new StudioRenditionError('OUTPUT_INVALID');
  const xrefIndex = source.indexOf('xref\n');
  const startMatch = /startxref\n(\d+)\n%%EOF\n$/u.exec(source);
  if (xrefIndex < 0 || !startMatch || Number(startMatch[1]) !== xrefIndex) throw new StudioRenditionError('OUTPUT_INVALID');
  const trailerMatch = /trailer\n<< \/Size (\d+) \/Root 1 0 R \/Info (\d+) 0 R/u.exec(source);
  if (!trailerMatch || trailerMatch[1] !== String(Number(trailerMatch[2]) + 1)) throw new StudioRenditionError('OUTPUT_INVALID');
  const xrefMatch = /xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)trailer/u.exec(source);
  if (!xrefMatch) throw new StudioRenditionError('OUTPUT_INVALID');
  const entries = xrefMatch[2].trim().split('\n');
  if (entries.length !== Number(xrefMatch[1]) - 1) throw new StudioRenditionError('OUTPUT_INVALID');
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    if (!source.startsWith(`${index + 1} 0 obj\n`, offset)) throw new StudioRenditionError('OUTPUT_INVALID');
  });
  const structural = removePdfLiterals(source);
  if (/\/(?:JavaScript|JS|EmbeddedFiles|EmbeddedFile|Filespec|AcroForm|XFA|Launch|URI|GoToR|SubmitForm|ImportData)\b/u.test(structural)) {
    throw new StudioRenditionError('OUTPUT_INVALID');
  }
};

const xml = (value: string) => value
  .replace(/&/gu, '&amp;')
  .replace(/</gu, '&lt;')
  .replace(/>/gu, '&gt;')
  .replace(/"/gu, '&quot;')
  .replace(/'/gu, '&apos;');
const paragraph = (text: string, style: 'Title' | 'Heading1' | 'BodyText') => {
  const lines = text.split('\n');
  return lines.map((line) => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r></w:p>`).join('');
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
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
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
};
const u16 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
const u32 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
const readU16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const readU32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
type ZipEntry = { name: string; bytes: Uint8Array };
const storedZip = (entries: readonly ZipEntry[]) => {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const localHeader = concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021), u32(crc), u32(entry.bytes.byteLength), u32(entry.bytes.byteLength), u16(name.byteLength), u16(0), name]);
    local.push(localHeader, entry.bytes);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x0021), u32(crc), u32(entry.bytes.byteLength), u32(entry.bytes.byteLength), u16(name.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += localHeader.byteLength + entry.bytes.byteLength;
  }
  const centralBytes = concat(central);
  return concat([...local, centralBytes, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.byteLength), u32(offset), u16(0)]);
};

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Governed Studio Artifact</dc:title><dc:creator>AvalaOS Studio</dc:creator><cp:lastModifiedBy>AvalaOS Studio</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2000-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>`;
const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>AvalaOS deterministic docx-v1</Application><AppVersion>1.0</AppVersion></Properties>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;

export const renderStudioDocx = (content: StudioApprovedContent): Uint8Array => {
  const body = [paragraph(content.title, 'Title'), paragraph('Executive Summary', 'Heading1'), paragraph(content.summary, 'BodyText')];
  for (const section of content.sections) body.push(paragraph(section.title, 'Heading1'), paragraph(section.content, 'BodyText'));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', bytes: encoder.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', bytes: encoder.encode(ROOT_RELS) },
    { name: 'docProps/app.xml', bytes: encoder.encode(APP) },
    { name: 'docProps/core.xml', bytes: encoder.encode(CORE) },
    { name: 'word/_rels/document.xml.rels', bytes: encoder.encode(DOC_RELS) },
    { name: 'word/document.xml', bytes: encoder.encode(document) },
    { name: 'word/styles.xml', bytes: encoder.encode(STYLES) },
  ];
  const bytes = storedZip(entries);
  inspectStudioDocxEntries(bytes);
  return bytes;
};

export const inspectStudioDocxEntries = (bytes: Uint8Array): ReadonlyMap<string, Uint8Array> => {
  if (bytes.byteLength < 22 || readU32(bytes, bytes.byteLength - 22) !== 0x06054b50) throw new StudioRenditionError('OUTPUT_INVALID');
  const eocd = bytes.byteLength - 22;
  const count = readU16(bytes, eocd + 10);
  const centralSize = readU32(bytes, eocd + 12);
  const centralOffset = readU32(bytes, eocd + 16);
  if (count < 1 || centralOffset + centralSize !== eocd) throw new StudioRenditionError('OUTPUT_INVALID');
  const result = new Map<string, Uint8Array>();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (readU32(bytes, cursor) !== 0x02014b50 || readU16(bytes, cursor + 10) !== 0) throw new StudioRenditionError('OUTPUT_INVALID');
    const expectedCrc = readU32(bytes, cursor + 16);
    const size = readU32(bytes, cursor + 24);
    const nameLength = readU16(bytes, cursor + 28);
    const extraLength = readU16(bytes, cursor + 30);
    const commentLength = readU16(bytes, cursor + 32);
    const localOffset = readU32(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.includes('\\') || name.startsWith('/') || name.split('/').some((part) => part === '..') || result.has(name)) throw new StudioRenditionError('OUTPUT_INVALID');
    if (readU32(bytes, localOffset) !== 0x04034b50 || readU16(bytes, localOffset + 8) !== 0) throw new StudioRenditionError('OUTPUT_INVALID');
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + size);
    if (data.byteLength !== size || crc32(data) !== expectedCrc) throw new StudioRenditionError('OUTPUT_INVALID');
    result.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new StudioRenditionError('OUTPUT_INVALID');
  const required = ['[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'];
  if (required.some((name) => !result.has(name))) throw new StudioRenditionError('OUTPUT_INVALID');
  for (const [name, data] of result) {
    if (/\.(?:bin|exe|dll|js|vbs|ole)$/iu.test(name) || /(?:vbaProject|activeX|embeddings|oleObject)/iu.test(name)) throw new StudioRenditionError('OUTPUT_INVALID');
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const source = decoder.decode(data);
      if (/TargetMode\s*=\s*["']External["']/iu.test(source) || /(?:javascript|vbscript|data):/iu.test(source) || /<(?:w:object|o:OLEObject|w:altChunk)\b/iu.test(source)) throw new StudioRenditionError('OUTPUT_INVALID');
    }
  }
  return result;
};

export const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const renderStudioPrivateArtifact = async (
  value: unknown,
  format: string,
): Promise<StudioRenderedArtifact> => {
  if (!(STUDIO_RENDITION_FORMATS as readonly string[]).includes(format)) throw new StudioRenditionError('UNSUPPORTED_FORMAT');
  const content = validateStudioApprovedContent(value);
  const typedFormat = format as StudioRenditionFormat;
  const bytes = typedFormat === 'markdown' ? renderStudioMarkdown(content) : typedFormat === 'pdf' ? renderStudioPdf(content) : renderStudioDocx(content);
  if (!bytes.byteLength || bytes.byteLength > MAX_OUTPUT_BYTES) throw new StudioRenditionError('OUTPUT_OVERSIZED');
  if (typedFormat === 'pdf') assertValidStudioPdf(bytes);
  if (typedFormat === 'docx') inspectStudioDocxEntries(bytes);
  return Object.freeze({
    bytes,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    mimeType: MIME[typedFormat],
    filename: FILENAMES[typedFormat],
    format: typedFormat,
    rendererVersion: VERSIONS[typedFormat],
    templateVersion: TEMPLATE_VERSION,
  });
};
