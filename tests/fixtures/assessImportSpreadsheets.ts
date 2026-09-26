import { deflateRawSync } from 'node:zlib';

// Synthetic fixture generator. It does not read documents or access providers.
const encode = (value: string) => new TextEncoder().encode(value);
const checksum = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
export interface SyntheticZipEntry { name: string; text: string; compressed?: boolean; localName?: string; flags?: number; crc?: number; advertisedSize?: number }
export function syntheticZip(entries: SyntheticZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = []; const directoryParts: Uint8Array[] = []; let offset = 0;
  for (const entry of entries) {
    const raw = encode(entry.text); const compressed = entry.compressed ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = encode(entry.name); const localName = encode(entry.localName ?? entry.name);
    const crc = entry.crc ?? checksum(raw); const flags = entry.flags ?? 0;
    const local = new Uint8Array(30 + localName.length + compressed.length + (flags & 8 ? 16 : 0)); const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, flags, true); l.setUint16(8, entry.compressed ? 8 : 0, true);
    l.setUint32(14, crc, true); l.setUint32(18, compressed.length, true); l.setUint32(22, entry.advertisedSize ?? raw.length, true); l.setUint16(26, localName.length, true);
    local.set(localName, 30); local.set(compressed, 30 + localName.length); localParts.push(local);
    if (flags & 8) {
      const descriptor = 30 + localName.length + compressed.length;
      l.setUint32(descriptor, 0x08074b50, true); l.setUint32(descriptor + 4, crc, true);
      l.setUint32(descriptor + 8, compressed.length, true); l.setUint32(descriptor + 12, entry.advertisedSize ?? raw.length, true);
    }
    const central = new Uint8Array(46 + name.length); const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, entry.compressed ? 8 : 0, true);
    c.setUint32(16, crc, true); c.setUint32(20, compressed.length, true); c.setUint32(24, entry.advertisedSize ?? raw.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.set(name, 46); directoryParts.push(central); offset += local.length;
  }
  const directorySize = directoryParts.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length); let cursor = 0;
  for (const part of [...localParts, ...directoryParts, end]) { result.set(part, cursor); cursor += part.length; }
  return result;
}
export interface SyntheticSheet { name: string; cells: string; state?: string }
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const inlineCell = (address: string, value: string) => `<c r="${address}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
export function syntheticWorkbookEntries(sheets: SyntheticSheet[] = [
  { name: 'Process', cells: `<row r="1">${inlineCell('A1', 'Process name')}${inlineCell('B1', 'Synthetic invoice review')}</row><row r="2">${inlineCell('A2', 'Rules stable')}<c r="B2" t="b"><v>1</v></c></row>` },
  { name: 'Systems', cells: `<row r="1">${inlineCell('A1', 'Application')}${inlineCell('B1', 'Synthetic ERP')}</row>` },
]): SyntheticZipEntry[] {
  return [
    { name: '[Content_Types].xml', text: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>' },
    { name: '_rels/.rels', text: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', text: `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"${sheet.state ? ` state="${sheet.state}"` : ''}/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>` },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet.cells}</sheetData></worksheet>`, compressed: true })),
  ];
}
export const syntheticWorkbook = (sheets?: SyntheticSheet[]) => syntheticZip(syntheticWorkbookEntries(sheets));
