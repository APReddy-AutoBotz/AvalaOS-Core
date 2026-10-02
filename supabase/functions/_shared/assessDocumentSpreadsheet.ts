/** Bounded, inert SpreadsheetML/CSV reading. Never evaluates formulas or fetches relationships. */
export const SPREADSHEET_PARSER_VERSION = 'spreadsheet-grid-v1' as const;
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
export const SPREADSHEET_LIMITS = Object.freeze({
  bytes: 12_000_000, entries: 2_000, expandedBytes: 20_000_000, entryBytes: 5_000_000,
  compressionRatio: 200, sheets: 20, rows: 5_000, columns: 256, cells: 50_000,
  stringCharacters: 16_384, textCharacters: 500_000, xmlDepth: 64, xmlNodes: 250_000,
});
export interface SpreadsheetCell {
  sheet: string; row: number; column: number; address: string; text: string; start: number; end: number;
}
export interface StructuredSpreadsheet {
  parserVersion: typeof SPREADSHEET_PARSER_VERSION;
  text: string;
  sheets: Array<{ name: string; rows: number; columns: number; cellCount: number }>;
  cells: SpreadsheetCell[];
  warnings: string[];
}
const fail = (reason: string): never => { throw new Error(`SPREADSHEET_${reason}`); };
const utf8 = (bytes: Uint8Array) => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('ENCODING_INVALID'); }
};
const boundedString = (value: string) => {
  if (value.length > SPREADSHEET_LIMITS.stringCharacters || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) fail('STRING_INVALID');
  return value.replace(/\r\n?/g, '\n');
};
const columnName = (column: number) => {
  let output = '';
  while (column) { column -= 1; output = String.fromCharCode(65 + column % 26) + output; column = Math.floor(column / 26); }
  return output;
};
const coordinate = (value: string) => {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value);
  if (!match) return fail('CELL_ADDRESS_INVALID');
  const column = [...match[1]].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  if (column > SPREADSHEET_LIMITS.columns || row > SPREADSHEET_LIMITS.rows) fail('GRID_LIMIT');
  return { row, column };
};

function collector() {
  const result: StructuredSpreadsheet = { parserVersion: SPREADSHEET_PARSER_VERSION, text: '', sheets: [], cells: [], warnings: [] };
  const warn = (warning: string) => { if (!result.warnings.includes(warning)) result.warnings.push(warning); };
  const sheet = (name: string) => {
    boundedString(name);
    if (!name.trim() || name.length > 128 || result.sheets.length >= SPREADSHEET_LIMITS.sheets || result.sheets.some(item => item.name.toLowerCase() === name.toLowerCase())) fail('SHEET_INVALID');
    const entry = { name, rows: 0, columns: 0, cellCount: 0 }; result.sheets.push(entry);
    return (row: number, column: number, input: string) => {
      if (row < 1 || column < 1 || row > SPREADSHEET_LIMITS.rows || column > SPREADSHEET_LIMITS.columns) fail('GRID_LIMIT');
      entry.rows = Math.max(entry.rows, row); entry.columns = Math.max(entry.columns, column);
      const text = boundedString(input);
      if (!text.length) return;
      if (result.cells.length >= SPREADSHEET_LIMITS.cells) fail('CELL_LIMIT');
      const address = `${columnName(column)}${row}`;
      // JSON quoting makes embedded newlines and counterfeit coordinate labels
      // inert, and gives identical values at different cells distinct anchors.
      const line = `Sheet ${JSON.stringify(name)} cell ${address}: ${JSON.stringify(text)}\n`;
      if (result.text.length + line.length > SPREADSHEET_LIMITS.textCharacters) fail('TEXT_LIMIT');
      const start = result.text.length; result.text += line;
      result.cells.push({ sheet: name, row, column, address, text, start, end: result.text.length - 1 });
      entry.cellCount += 1;
    };
  };
  return { result, warn, sheet };
}

/** RFC-style comma-separated records, with no guessing of delimiter or header semantics. */
export function parseCsvSpreadsheet(bytes: Uint8Array): StructuredSpreadsheet {
  if (!bytes.length || bytes.length > SPREADSHEET_LIMITS.bytes) fail('BYTES_INVALID');
  const source = utf8(bytes).replace(/^\uFEFF/u, '').replace(/\r\n?/g, '\n');
  const output = collector(); const add = output.sheet('CSV');
  let row = 1, column = 1, value = '', quoted = false, afterQuote = false, first = true;
  let rowWidth = 0; const headers: string[] = []; let firstWidth: number | null = null;
  const field = () => {
    add(row, column, value);
    if (row === 1) headers.push(value);
    rowWidth = column; column += 1; value = ''; afterQuote = false; first = true;
  };
  const record = () => {
    field(); if (firstWidth === null) firstWidth = rowWidth;
    else if (rowWidth !== firstWidth) output.warn('RAGGED_ROWS_COORDINATES_PRESERVED');
    row += 1; column = 1; rowWidth = 0;
  };
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { value += '"'; index += 1; }
        else { quoted = false; afterQuote = true; }
      } else value += character;
    } else if (afterQuote) {
      if (character === ',') field(); else if (character === '\n') record(); else fail('CSV_QUOTE_INVALID');
    } else if (character === '"') {
      if (!first) fail('CSV_QUOTE_INVALID'); quoted = true; first = false;
    } else if (character === ',') field();
    else if (character === '\n') record();
    else { value += character; first = false; }
    if (value.length > SPREADSHEET_LIMITS.stringCharacters) fail('STRING_INVALID');
    if (row > SPREADSHEET_LIMITS.rows && index < source.length - 1) fail('GRID_LIMIT');
  }
  if (quoted) fail('CSV_QUOTE_INVALID');
  if (source.length && !source.endsWith('\n')) record();
  if (headers.some(value => !value.trim())) output.warn('BLANK_HEADERS_COORDINATES_PRESERVED');
  if (new Set(headers.map(value => value.trim().toLowerCase())).size !== headers.length) output.warn('DUPLICATE_HEADERS_COORDINATES_PRESERVED');
  if (output.result.cells.some(cell => /^[=+\-@]/u.test(cell.text))) output.warn('FORMULA_LIKE_TEXT_IS_INERT');
  if (!output.result.cells.length) fail('EMPTY');
  return output.result;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
const safePath = (name: string) => {
  if (!name || name.length > 240 || /[^\u0021-\u007e]|[\\:%?#]/u.test(name) || name.startsWith('/') || name.split('/').some(part => part === '.' || part === '..') || name.includes('//')) fail('ZIP_PATH_INVALID');
  return name;
};
// OPC relationship targets may be package-absolute (for example
// /xl/worksheets/sheet1.xml). That is not an absolute ZIP member or filesystem
// path: strip exactly one package-root slash, then apply the same strict inert
// path checks. Never resolve URLs, percent escapes, traversal or external data.
const relationshipTarget = (relationshipsPath: string, target: string) => {
  if (target.startsWith('/')) return safePath(target.slice(1));
  const relative = safePath(target);
  const marker = relationshipsPath.lastIndexOf('/_rels/');
  const directory = marker < 0 ? '' : relationshipsPath.slice(0, marker + 1);
  return safePath(`${directory}${relative}`);
};
async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => { if (offset < 0 || offset + 2 > bytes.length) return fail('ZIP_INVALID'); return view.getUint16(offset, true); };
  const u32 = (offset: number) => { if (offset < 0 || offset + 4 > bytes.length) return fail('ZIP_INVALID'); return view.getUint32(offset, true); };
  const extra = (start: number, length: number) => {
    const finish = start + length; if (finish > bytes.length) fail('ZIP_INVALID');
    while (start < finish) {
      if (start + 4 > finish) fail('ZIP_INVALID');
      const id = u16(start), size = u16(start + 2);
      if ([0x0001, 0x7075, 0x6375].includes(id)) fail('ZIP_FEATURE_UNSUPPORTED');
      start += 4 + size;
    }
    if (start !== finish) fail('ZIP_INVALID');
  };
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0 || u16(end + 8) !== u16(end + 10)) fail('ZIP_INVALID');
  const count = u16(end + 10), directorySize = u32(end + 12), directory = u32(end + 16);
  if (!count || count > SPREADSHEET_LIMITS.entries || directory + directorySize !== end) fail('ZIP_DIRECTORY_INVALID');
  const entries = new Map<string, Uint8Array>(); const names = new Set<string>(); const spans: Array<[number, number]> = [];
  let offset = directory, total = 0;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || u32(offset) !== 0x02014b50) fail('ZIP_INVALID');
    const flags = u16(offset + 8), method = u16(offset + 10), crc = u32(offset + 16);
    const compressedSize = u32(offset + 20), expandedSize = u32(offset + 24), nameLength = u16(offset + 28);
    const local = u32(offset + 42), next = offset + 46 + nameLength + u16(offset + 30) + u16(offset + 32);
    const fileMode = u32(offset + 38) >>> 16;
    if (next > end || flags & ~0x080e || flags & 1 || ![0, 8].includes(method) || u16(offset + 34) !== 0 || (fileMode & 0xf000) === 0xa000) fail('ZIP_FEATURE_UNSUPPORTED');
    if (expandedSize > SPREADSHEET_LIMITS.entryBytes || compressedSize > SPREADSHEET_LIMITS.bytes || expandedSize > Math.max(compressedSize, 1) * SPREADSHEET_LIMITS.compressionRatio) fail('ZIP_EXPANSION_LIMIT');
    total += expandedSize; if (total > SPREADSHEET_LIMITS.expandedBytes) fail('ZIP_EXPANSION_LIMIT');
    const name = safePath(utf8(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    extra(offset + 46 + nameLength, u16(offset + 30));
    if (names.has(name.toLowerCase())) fail('ZIP_DUPLICATE_PATH'); names.add(name.toLowerCase());
    if (/vba|macro|externalLinks|connections|queryTables|embeddings|activeX|customUI|\.bin$/iu.test(name)) fail('ACTIVE_CONTENT_UNSUPPORTED');
    if (local + 30 > directory || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLength) fail('ZIP_LOCAL_MISMATCH');
    extra(local + 30 + nameLength, u16(local + 28));
    const data = local + 30 + nameLength + u16(local + 28), finish = data + compressedSize;
    if (finish > directory || utf8(bytes.subarray(local + 30, local + 30 + nameLength)) !== name) fail('ZIP_LOCAL_MISMATCH');
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== compressedSize || u32(local + 22) !== expandedSize)) fail('ZIP_LOCAL_MISMATCH');
    let spanEnd = finish;
    if (flags & 8) {
      const descriptor = u32(finish) === 0x08074b50 ? finish + 4 : finish;
      spanEnd = descriptor + 12;
      if (spanEnd > directory || u32(descriptor) !== crc || u32(descriptor + 4) !== compressedSize || u32(descriptor + 8) !== expandedSize) fail('ZIP_DESCRIPTOR_INVALID');
    }
    if (spans.some(([start, priorEnd]) => local < priorEnd && spanEnd > start)) fail('ZIP_OVERLAP'); spans.push([local, spanEnd]);
    let content: Uint8Array;
    if (method === 0) content = bytes.slice(data, finish);
    else {
      if (typeof DecompressionStream === 'undefined') fail('DECOMPRESSION_UNAVAILABLE');
      const reader = new Blob([bytes.slice(data, finish)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.length;
          if (length > expandedSize || length > SPREADSHEET_LIMITS.entryBytes) { await reader.cancel(); fail('ZIP_EXPANSION_LIMIT'); }
          chunks.push(part.value);
        }
      } catch { return fail('ZIP_DECOMPRESSION_INVALID'); }
      finally { reader.releaseLock(); }
      content = new Uint8Array(length); let position = 0;
      for (const chunk of chunks) { content.set(chunk, position); position += chunk.length; }
    }
    if (content.length !== expandedSize || crc32(content) !== crc) fail('ZIP_INTEGRITY_INVALID');
    entries.set(name, content); offset = next;
  }
  if (offset !== end) fail('ZIP_DIRECTORY_INVALID');
  return entries;
}

interface XmlNode { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string }
const entities = (value: string) => value.replace(/&([^;]+);/gu, (_, entity: string) => {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (Object.hasOwn(named, entity)) return named[entity];
  if (!/^#(?:[0-9]+|x[0-9a-f]+)$/iu.test(entity)) return fail('XML_ENTITY_INVALID');
  const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
  if (!Number.isSafeInteger(code) || code < 0x20 && ![9, 10, 13].includes(code) || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) return fail('XML_ENTITY_INVALID');
  return String.fromCodePoint(code);
});
/** Deliberately small strict XML reader: no DTD, entity declarations, network, or recovery parsing. */
function xml(bytes: Uint8Array, budget: { nodes: number }): XmlNode {
  const source = utf8(bytes).replace(/^\uFEFF/u, '');
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/iu.test(source)) fail('XML_FEATURE_UNSUPPORTED');
  const root: XmlNode = { name: '#document', attributes: {}, children: [], text: '' }; const stack = [root];
  const tokens = /<\?xml\s[^?]*\?>|<!--[\s\S]*?-->|<\/[A-Za-z_][\w.:-]*\s*>|<[A-Za-z_][\w.:-]*(?:\s+[^<>]*?)?\s*\/?>|[^<]+/gu;
  let position = 0;
  for (const match of source.matchAll(tokens)) {
    if (match.index !== position) fail('XML_INVALID'); position += match[0].length;
    const token = match[0];
    if (token.startsWith('<?xml') || token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim(); if (stack.length === 1 || stack.at(-1)!.attributes['#qualified'] !== name) fail('XML_INVALID'); stack.pop();
    } else if (token.startsWith('<')) {
      const name = /^<([A-Za-z_][\w.:-]*)/u.exec(token)![1]; const attributes: Record<string, string> = { '#qualified': name };
      const tail = token.slice(name.length + 1).replace(/\/?\s*>$/u, ''); let cursor = 0;
      const attributePattern = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gu;
      for (const attribute of tail.matchAll(attributePattern)) {
        if (attribute.index !== cursor || Object.hasOwn(attributes, attribute[1])) fail('XML_ATTRIBUTE_INVALID');
        const raw = attribute[2] ?? attribute[3];
        if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/iu.test(raw)) fail('XML_ENTITY_INVALID');
        attributes[attribute[1]] = entities(raw); cursor += attribute[0].length;
      }
      if (tail.slice(cursor).trim()) fail('XML_ATTRIBUTE_INVALID');
      const node: XmlNode = { name: name.split(':').at(-1)!, attributes, children: [], text: '' };
      stack.at(-1)!.children.push(node);
      if (++budget.nodes > SPREADSHEET_LIMITS.xmlNodes) fail('XML_NODE_LIMIT');
      if (!token.endsWith('/>')) { stack.push(node); if (stack.length > SPREADSHEET_LIMITS.xmlDepth) fail('XML_DEPTH_LIMIT'); }
    } else {
      if (token.includes('&') && /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/iu.test(token)) fail('XML_ENTITY_INVALID');
      stack.at(-1)!.text += entities(token);
    }
  }
  if (position !== source.length || stack.length !== 1 || root.children.length !== 1 || root.text.trim()) fail('XML_INVALID');
  return root.children[0];
}
const children = (node: XmlNode, name: string) => node.children.filter(child => child.name === name);
const one = (node: XmlNode, name: string) => { const matches = children(node, name); if (matches.length !== 1) return fail('XML_STRUCTURE_INVALID'); return matches[0]; };
const descendants = (node: XmlNode, name: string): XmlNode[] => [...(node.name === name ? [node] : []), ...node.children.flatMap(child => descendants(child, name))];
const richText = (node: XmlNode) => boundedString(descendants(node, 't').map(child => child.text).join(''));

export async function parseXlsxSpreadsheet(bytes: Uint8Array): Promise<StructuredSpreadsheet> {
  if (!bytes.length || bytes.length > SPREADSHEET_LIMITS.bytes) fail('BYTES_INVALID');
  const entries = await readZip(bytes);
  const documents = new Map<string, XmlNode>();
  const xmlBudget = { nodes: 0 };
  for (const [path, content] of entries) {
    if (path.endsWith('.xml') || path.endsWith('.rels')) documents.set(path, xml(content, xmlBudget));
  }
  const required = (path: string, name: string) => { const item = documents.get(path); if (!item || item.name !== name) return fail('XLSX_PART_MISSING'); return item; };
  const types = required('[Content_Types].xml', 'Types');
  if (types.children.some(item => /macro|vba|ole|activex/iu.test(item.attributes.ContentType || ''))) fail('ACTIVE_CONTENT_UNSUPPORTED');
  if (!types.children.some(item => item.attributes.PartName === '/xl/workbook.xml' && item.attributes.ContentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) fail('XLSX_CONTENT_TYPE_INVALID');
  for (const [path, doc] of documents) if (path.endsWith('.rels')) {
    for (const relation of children(doc, 'Relationship')) {
      if (relation.attributes.TargetMode && relation.attributes.TargetMode !== 'Internal' || /externalLink|oleObject|attachedTemplate|vbaProject|connections|queryTable/iu.test(relation.attributes.Type || '')) fail('EXTERNAL_RELATIONSHIP_UNSUPPORTED');
      relationshipTarget(path, relation.attributes.Target || '');
    }
  }
  const workbook = required('xl/workbook.xml', 'workbook');
  const relations = required('xl/_rels/workbook.xml.rels', 'Relationships');
  const relationships = new Map<string, XmlNode>();
  for (const item of children(relations, 'Relationship')) {
    const id = item.attributes.Id; if (!id || relationships.has(id)) fail('RELATIONSHIP_INVALID'); relationships.set(id, item);
  }
  const shared = documents.get('xl/sharedStrings.xml');
  const strings = shared ? children(shared, 'si').map(richText) : [];
  if (strings.length > SPREADSHEET_LIMITS.cells) fail('SHARED_STRING_LIMIT');
  const output = collector(); const sheets = children(one(workbook, 'sheets'), 'sheet'); const sheetPaths = new Set<string>();
  let visitedCells = 0;
  if (!sheets.length || sheets.length > SPREADSHEET_LIMITS.sheets) fail('SHEET_LIMIT');
  for (const sheet of sheets) {
    if (sheet.attributes.state && sheet.attributes.state !== 'visible') {
      if (!['hidden', 'veryHidden'].includes(sheet.attributes.state)) fail('SHEET_INVALID');
      output.warn('HIDDEN_SHEETS_EXCLUDED'); continue;
    }
    const relationshipId = Object.entries(sheet.attributes).find(([key]) => key.endsWith(':id'))?.[1];
    const relation = relationships.get(relationshipId || '');
    if (!relation || !relation.attributes.Type?.endsWith('/worksheet')) fail('SHEET_RELATIONSHIP_INVALID');
    const path = relationshipTarget('xl/_rels/workbook.xml.rels', relation.attributes.Target || '');
    if (!path.startsWith('xl/worksheets/') || sheetPaths.has(path)) fail('SHEET_RELATIONSHIP_INVALID'); sheetPaths.add(path);
    const document = required(path, 'worksheet'); const add = output.sheet(sheet.attributes.name || '');
    const seen = new Set<string>(); const rows = new Set<number>();
    for (const row of children(one(document, 'sheetData'), 'row').sort((left, right) => Number(left.attributes.r) - Number(right.attributes.r))) {
      const rowNumber = Number(row.attributes.r);
      if (!Number.isSafeInteger(rowNumber) || rowNumber < 1 || rowNumber > SPREADSHEET_LIMITS.rows) fail('GRID_LIMIT');
      if (rows.has(rowNumber)) fail('ROW_DUPLICATE'); rows.add(rowNumber);
      for (const cell of children(row, 'c').sort((left, right) => coordinate(left.attributes.r || '').column - coordinate(right.attributes.r || '').column)) {
        if (++visitedCells > SPREADSHEET_LIMITS.cells) fail('CELL_LIMIT');
        const address = cell.attributes.r; const at = coordinate(address || '');
        if (at.row !== rowNumber || seen.has(address)) fail('CELL_ADDRESS_INVALID'); seen.add(address);
        if (children(cell, 'f').length) { output.warn('FORMULA_CELLS_AND_CACHED_VALUES_EXCLUDED'); continue; }
        const type = cell.attributes.t || 'n'; let value = '';
        if (type === 'e') { output.warn('ERROR_CELLS_EXCLUDED'); continue; }
        if (type === 'inlineStr') value = richText(one(cell, 'is'));
        else {
          const values = children(cell, 'v'); if (!values.length) continue; if (values.length !== 1) fail('CELL_VALUE_INVALID');
          const raw = values[0].text;
          if (type === 's') { if (!/^(0|[1-9][0-9]*)$/u.test(raw) || Number(raw) >= strings.length) fail('SHARED_STRING_INVALID'); value = strings[Number(raw)]; }
          else if (type === 'b') { if (!['0', '1'].includes(raw)) fail('CELL_VALUE_INVALID'); value = raw === '1' ? 'true' : 'false'; }
          else if (type === 'n') { if (raw && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(raw) || !Number.isFinite(Number(raw)))) fail('CELL_VALUE_INVALID'); value = raw; if (cell.attributes.s) output.warn('NUMERIC_VALUES_RETAINED_WITHOUT_FORMAT_OR_DATE_INFERENCE'); }
          else if (type === 'd') { if (!/^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?$/u.test(raw)) fail('CELL_VALUE_INVALID'); value = raw; }
          else if (type === 'str') value = raw;
          else fail('CELL_TYPE_UNSUPPORTED');
        }
        add(at.row, at.column, value);
      }
    }
  }
  if (!output.result.cells.length) fail('EMPTY');
  return output.result;
}

export async function extractStructuredSpreadsheet(bytes: Uint8Array, mimeType: 'text/csv' | typeof XLSX_MIME): Promise<StructuredSpreadsheet> {
  if (mimeType === 'text/csv') return parseCsvSpreadsheet(bytes);
  if (mimeType === XLSX_MIME) return parseXlsxSpreadsheet(bytes);
  return fail('FORMAT_UNSUPPORTED');
}
