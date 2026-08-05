import {
  isSupportedEvidenceMimeType,
  type SupportedEvidenceMimeType,
} from '../../../services/enterpriseIntelligence.ts';

export const MAX_EVIDENCE_BYTES = 12_000_000;
export const MAX_EXTRACTED_EVIDENCE_CHARACTERS = 500_000;
const MAX_DOCX_ENTRIES = 2_000;
const MAX_DOCX_ENTRY_BYTES = 20_000_000;
const MAX_PDF_STREAM_BYTES = 20_000_000;

export type EvidenceExtractionFailureCode = 'OCR_REQUIRED' | 'UNSUPPORTED_FORMAT' | 'MALFORMED_SOURCE';

export const classifyEvidenceExtractionFailure = (
  error: unknown,
  mimeType: string,
): EvidenceExtractionFailureCode | null => {
  const message = String((error as { message?: unknown })?.message || error || '');
  if (message.includes('PDF_TEXT_LAYER_REQUIRED')) return 'OCR_REQUIRED';
  if (message.includes('EVIDENCE_MIME_UNSUPPORTED')) return 'UNSUPPORTED_FORMAT';
  if (
    mimeType.startsWith('text/')
    || mimeType === 'application/x-subrip'
    || message.startsWith('PDF_')
    || message.startsWith('DOCX_')
    || message.startsWith('EVIDENCE_TEXT_')
    || error instanceof TypeError
  ) return 'MALFORMED_SOURCE';
  return null;
};

export const decodeBase64 = (value: string) => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('INVALID_BASE64');
  }
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
};

export const sha256Hex = async (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

const decodePdfLiteral = (value: string) => value.replace(/\\(\\|\(|\)|n|r|t|b|f|[0-7]{1,3})/g, (_, escaped: string) => {
  if (escaped === 'n') return '\n';
  if (escaped === 'r') return '\r';
  if (escaped === 't') return '\t';
  if (escaped === 'b') return '\b';
  if (escaped === 'f') return '\f';
  if (/^[0-7]/.test(escaped)) return String.fromCharCode(parseInt(escaped, 8));
  return escaped;
});

const extractPdfFragments = (raw: string) => {
  const fragments: string[] = [];
  for (const match of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    fragments.push(decodePdfLiteral(match[1]));
  }
  for (const match of raw.matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g)) {
    for (const literal of match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) {
      fragments.push(decodePdfLiteral(literal[1]));
    }
  }
  return fragments;
};

const inflatePdfStream = async (bytes: Uint8Array) => {
  if (bytes.byteLength > MAX_PDF_STREAM_BYTES) throw new Error('PDF_STREAM_TOO_LARGE');
  if (typeof DecompressionStream === 'undefined') throw new Error('PDF_DECOMPRESSION_UNAVAILABLE');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  if (inflated.byteLength > MAX_PDF_STREAM_BYTES) throw new Error('PDF_STREAM_TOO_LARGE');
  return inflated;
};

const extractPdfText = async (bytes: Uint8Array) => {
  const raw = new TextDecoder('latin1').decode(bytes);
  if (!raw.startsWith('%PDF-')) throw new Error('PDF_SIGNATURE_INVALID');
  const fragments = extractPdfFragments(raw);

  for (const streamMatch of raw.matchAll(/<<(.*?)>>\s*stream\r?\n/gms)) {
    if (!/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])/.test(streamMatch[1])) continue;
    const contentStart = (streamMatch.index || 0) + streamMatch[0].length;
    const endMarker = raw.indexOf('endstream', contentStart);
    if (endMarker < 0) throw new Error('PDF_STREAM_INVALID');
    let contentEnd = endMarker;
    while (contentEnd > contentStart && (bytes[contentEnd - 1] === 0x0a || bytes[contentEnd - 1] === 0x0d)) contentEnd -= 1;
    const compressed = bytes.slice(contentStart, contentEnd);
    const inflated = await inflatePdfStream(compressed);
    fragments.push(...extractPdfFragments(new TextDecoder('latin1').decode(inflated)));
  }

  const text = fragments.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('PDF_TEXT_LAYER_REQUIRED');
  return text;
};

const readUInt32 = (view: DataView, offset: number) => view.getUint32(offset, true);
const readUInt16 = (view: DataView, offset: number) => view.getUint16(offset, true);

const inflateRaw = async (bytes: Uint8Array) => {
  if (bytes.byteLength > MAX_DOCX_ENTRY_BYTES) throw new Error('DOCX_ENTRY_TOO_LARGE');
  if (typeof DecompressionStream === 'undefined') throw new Error('DOCX_DECOMPRESSION_UNAVAILABLE');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
  if (inflated.byteLength > MAX_DOCX_ENTRY_BYTES) throw new Error('DOCX_ENTRY_TOO_LARGE');
  return inflated;
};

const extractDocxXml = async (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let centralDirectoryOffset = -1;
  let entryCount = 0;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (readUInt32(view, offset) === 0x06054b50) {
      entryCount = readUInt16(view, offset + 10);
      centralDirectoryOffset = readUInt32(view, offset + 16);
      break;
    }
  }
  if (centralDirectoryOffset < 0) throw new Error('DOCX_ZIP_DIRECTORY_MISSING');
  if (entryCount < 1 || entryCount > MAX_DOCX_ENTRIES || centralDirectoryOffset >= bytes.length) {
    throw new Error('DOCX_ZIP_DIRECTORY_INVALID');
  }

  let offset = centralDirectoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset < 0 || offset + 46 > bytes.length) throw new Error('DOCX_ZIP_ENTRY_INVALID');
    if (readUInt32(view, offset) !== 0x02014b50) throw new Error('DOCX_ZIP_ENTRY_INVALID');
    const method = readUInt16(view, offset + 10);
    const compressedSize = readUInt32(view, offset + 20);
    const uncompressedSize = readUInt32(view, offset + 24);
    const nameLength = readUInt16(view, offset + 28);
    const extraLength = readUInt16(view, offset + 30);
    const commentLength = readUInt16(view, offset + 32);
    const localHeaderOffset = readUInt32(view, offset + 42);
    if (
      compressedSize > MAX_DOCX_ENTRY_BYTES
      || uncompressedSize > MAX_DOCX_ENTRY_BYTES
      || localHeaderOffset + 30 > bytes.length
      || offset + 46 + nameLength + extraLength + commentLength > bytes.length
    ) throw new Error('DOCX_ZIP_ENTRY_INVALID');
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === 'word/document.xml') {
      if (readUInt32(view, localHeaderOffset) !== 0x04034b50) throw new Error('DOCX_ZIP_LOCAL_HEADER_INVALID');
      const localNameLength = readUInt16(view, localHeaderOffset + 26);
      const localExtraLength = readUInt16(view, localHeaderOffset + 28);
      const contentStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      if (contentStart < 0 || contentStart + compressedSize > bytes.length) throw new Error('DOCX_ZIP_ENTRY_INVALID');
      const compressed = bytes.slice(contentStart, contentStart + compressedSize);
      const content = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      if (!content) throw new Error('DOCX_COMPRESSION_UNSUPPORTED');
      return new TextDecoder().decode(content);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('DOCX_DOCUMENT_XML_MISSING');
};

const stripXml = (value: string) => value
  .replace(/<w:tab\s*\/?>(\s*)/g, '\t')
  .replace(/<w:br\s*\/?>(\s*)/g, '\n')
  .replace(/<\/w:p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const extractEvidenceText = async (
  bytes: Uint8Array,
  mimeType: SupportedEvidenceMimeType,
) => {
  if (!isSupportedEvidenceMimeType(mimeType)) throw new Error('EVIDENCE_MIME_UNSUPPORTED');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_BYTES) throw new Error('EVIDENCE_BYTES_INVALID');
  let text: string;
  if (mimeType === 'application/pdf') text = await extractPdfText(bytes);
  else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') text = stripXml(await extractDocxXml(bytes));
  else {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .trim();
    if (text.includes('\u0000')) throw new Error('EVIDENCE_TEXT_BINARY');
  }
  if (!text) throw new Error('EVIDENCE_TEXT_EMPTY');
  if (text.length > MAX_EXTRACTED_EVIDENCE_CHARACTERS) throw new Error('EVIDENCE_TEXT_TOO_LARGE');
  return text;
};
