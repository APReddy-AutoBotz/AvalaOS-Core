import { deflateRawSync, deflateSync } from 'node:zlib';

const text = (value: string) => Buffer.from(value, 'utf8');

const crcTable = Array.from({ length: 256 }, (_, entry) => {
  let value = entry;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (value: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (entries: Array<{ name: string; value: string }>) => {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = text(entry.name);
    const raw = text(entry.value);
    const compressed = deflateRawSync(raw, { level: 9 });
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 8);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
};

export const createEnterprisePdfFixture = () => {
  const stream = deflateSync(text('BT /F1 12 Tf 72 720 Td (Synthetic process evidence for governed browser testing.) Tj ET'), { level: 9 });
  const objects = [
    text('<< /Type /Catalog /Pages 2 0 R >>'),
    text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    text('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([text(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`), stream, text('\nendstream')]),
    text('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const parts = [text('%PDF-1.7\n% deterministic\n')];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(parts.reduce((total, part) => total + part.length, 0));
    parts.push(text(`${index + 1} 0 obj\n`), objects[index], text('\nendobj\n'));
  }
  const xref = parts.reduce((total, part) => total + part.length, 0);
  parts.push(text(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  offsets.slice(1).forEach(offset => parts.push(text(`${String(offset).padStart(10, '0')} 00000 n \n`)));
  parts.push(text(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(parts);
};

export const createEnterpriseDocxFixture = () => zip([
  {
    name: '[Content_Types].xml',
    value: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  },
  {
    name: '_rels/.rels',
    value: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  },
  {
    name: 'word/document.xml',
    value: '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic governed evidence fixture.</w:t></w:r></w:p></w:body></w:document>',
  },
]);

export const enterpriseDocumentFixtures = [
  { name: 'synthetic-evidence.pdf', mimeType: 'application/pdf', create: createEnterprisePdfFixture },
  { name: 'synthetic-evidence.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', create: createEnterpriseDocxFixture },
] as const;
