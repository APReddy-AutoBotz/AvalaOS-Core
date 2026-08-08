import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync } from 'node:zlib';
import {
  classifyEvidenceExtractionFailure,
  decodeBase64,
  extractEvidenceText,
  readBoundedStream,
  readPdfExpandedStream,
  sha256Hex,
} from './enterpriseIntelligenceIngestion';

const joinBytes = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const compressedPdfStreams = (...expandedStreams: Uint8Array[]) => joinBytes(
  new TextEncoder().encode('%PDF-1.4\n'),
  ...expandedStreams.flatMap((expanded, index) => {
    const compressed = new Uint8Array(deflateSync(expanded));
    return [
      new TextEncoder().encode(`${index + 1} 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),
      compressed,
      new TextEncoder().encode('\nendstream\nendobj\n'),
    ];
  }),
  new TextEncoder().encode('%%EOF'),
);

const compressedPdf = (expanded: Uint8Array) => compressedPdfStreams(expanded);

const compressedDocx = (expanded: Uint8Array, advertisedExpandedBytes = expanded.byteLength) => {
  const name = new TextEncoder().encode('word/document.xml');
  const compressed = new Uint8Array(deflateRawSync(expanded));
  const local = new Uint8Array(30 + name.byteLength);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(18, compressed.byteLength, true);
  localView.setUint32(22, advertisedExpandedBytes, true);
  localView.setUint16(26, name.byteLength, true);
  local.set(name, 30);

  const central = new Uint8Array(46 + name.byteLength);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(20, compressed.byteLength, true);
  centralView.setUint32(24, advertisedExpandedBytes, true);
  centralView.setUint16(28, name.byteLength, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.byteLength, true);
  endView.setUint32(16, local.byteLength + compressed.byteLength, true);
  return joinBytes(local, compressed, central, end);
};

const test = async (name: string, callback: () => Promise<void> | void) => {
  try {
    await callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

await test('decodes supported source bytes without exposing a storage path', async () => {
  const bytes = decodeBase64('SGVsbG8gQXZhbGFPcw==');
  assert.equal(new TextDecoder().decode(bytes), 'Hello AvalaOs');
  assert.equal((await sha256Hex(bytes)).length, 64);
});

await test('extracts transcript formats as text', async () => {
  const bytes = new TextEncoder().encode('\uFEFFWEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nA governed note');
  assert.equal(await extractEvidenceText(bytes, 'text/vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nA governed note');
});

await test('extracts text PDF literals without treating embedded content as instructions', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.4\nBT (AvalaOS evidence) Tj ET\n%%EOF');
  assert.equal(await extractEvidenceText(bytes, 'application/pdf'), 'AvalaOS evidence');
});

await test('extracts a compressed PDF text stream', async () => {
  const bytes = compressedPdf(new TextEncoder().encode('BT (Compressed governed evidence) Tj ET'));
  assert.equal(await extractEvidenceText(bytes, 'application/pdf'), 'Compressed governed evidence');
});

await test('cancels bounded decompression before an oversized stream is fully materialized', async () => {
  let pulls = 0;
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(4));
      if (pulls === 10) controller.close();
    },
    cancel() { cancellations += 1; },
  });
  await assert.rejects(readBoundedStream(stream, 8, 'PDF_STREAM_TOO_LARGE'), /PDF_STREAM_TOO_LARGE/);
  assert.equal(cancellations, 1);
  assert.ok(pulls < 10, `bounded reader consumed ${pulls} chunks`);
});

await test('rejects a small PDF decompression bomb while a valid near-limit stream succeeds', async () => {
  const bomb = compressedPdf(new Uint8Array(20_000_001).fill(0x20));
  assert.ok(bomb.byteLength < 12_000_000);
  await assert.rejects(extractEvidenceText(bomb, 'application/pdf'), /PDF_STREAM_TOO_LARGE/);

  const literal = new TextEncoder().encode('BT (Near limit governed PDF evidence) Tj ET');
  const expanded = joinBytes(new Uint8Array(19_999_900).fill(0x20), literal);
  assert.equal(await extractEvidenceText(compressedPdf(expanded), 'application/pdf'), 'Near limit governed PDF evidence');
});

await test('enforces one cumulative expanded-byte budget across every PDF stream', async () => {
  const overBudget = compressedPdfStreams(
    new Uint8Array(10_000_000).fill(0x20),
    new Uint8Array(10_000_001).fill(0x20),
  );
  assert.ok(overBudget.byteLength < 12_000_000);
  await assert.rejects(extractEvidenceText(overBudget, 'application/pdf'), /PDF_STREAM_TOO_LARGE/);

  const literal = new TextEncoder().encode('BT (Cumulative near limit PDF evidence) Tj ET');
  const withinBudget = compressedPdfStreams(
    new Uint8Array(10_000_000).fill(0x20),
    joinBytes(new Uint8Array(9_999_900).fill(0x20), literal),
  );
  assert.equal(
    await extractEvidenceText(withinBudget, 'application/pdf'),
    'Cumulative near limit PDF evidence',
  );
});

await test('cancels a later PDF stream as soon as the document budget is exhausted', async () => {
  const budget = { remainingBytes: 6 };
  let pulls = 0;
  let cancellations = 0;
  const laterStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(4));
      if (pulls === 10) controller.close();
    },
    cancel() { cancellations += 1; },
  });
  await assert.rejects(readPdfExpandedStream(laterStream, budget), /PDF_STREAM_TOO_LARGE/);
  assert.equal(cancellations, 1);
  assert.ok(pulls < 10, `cumulative PDF reader consumed ${pulls} chunks`);
  assert.equal(budget.remainingBytes, 6, 'failed stream must not consume a partially retained budget');
});

await test('rejects a lying DOCX decompression bomb while a valid near-limit entry succeeds', async () => {
  const bomb = compressedDocx(new Uint8Array(20_000_001).fill(0x20), 1);
  assert.ok(bomb.byteLength < 12_000_000);
  await assert.rejects(
    extractEvidenceText(bomb, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    /DOCX_ENTRY_TOO_LARGE/,
  );

  const prefix = new TextEncoder().encode('<w:document><w:body><!--');
  const suffix = new TextEncoder().encode('--><w:p><w:t>Near limit governed DOCX evidence</w:t></w:p></w:body></w:document>');
  const expanded = joinBytes(prefix, new Uint8Array(19_999_800).fill(0x78), suffix);
  assert.equal(
    await extractEvidenceText(compressedDocx(expanded), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    'Near limit governed DOCX evidence',
  );
});

await test('fails truthfully when a scanned PDF has no text layer and OCR is unavailable', async () => {
  const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Subtype /Image >>\nendobj\n%%EOF');
  await assert.rejects(
    extractEvidenceText(bytes, 'application/pdf'),
    /PDF_TEXT_LAYER_REQUIRED/,
  );
});

await test('classifies deterministic parser failures without collapsing them into availability errors', async () => {
  const scannedPdf = new Error('PDF_TEXT_LAYER_REQUIRED');
  const malformedDocx = new Error('DOCX_ZIP_DIRECTORY_MISSING');
  const unsupported = new Error('EVIDENCE_MIME_UNSUPPORTED');
  assert.equal(classifyEvidenceExtractionFailure(scannedPdf, 'application/pdf'), 'OCR_REQUIRED');
  assert.equal(classifyEvidenceExtractionFailure(malformedDocx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'MALFORMED_SOURCE');
  assert.equal(classifyEvidenceExtractionFailure(unsupported, 'application/octet-stream'), 'UNSUPPORTED_FORMAT');
  assert.equal(classifyEvidenceExtractionFailure(new Error('network unavailable'), 'application/pdf'), null);
});

await test('rejects malformed DOCX and invalid UTF-8 as deterministic malformed sources', async () => {
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  await assert.rejects(extractEvidenceText(docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), /DOCX_/);
  try {
    await extractEvidenceText(new Uint8Array([0xc3, 0x28]), 'text/plain');
    assert.fail('invalid UTF-8 must fail');
  } catch (error) {
    assert.equal(classifyEvidenceExtractionFailure(error, 'text/plain'), 'MALFORMED_SOURCE');
  }
});

await test('rejects binary content disguised as native text', async () => {
  await assert.rejects(
    extractEvidenceText(new Uint8Array([0x41, 0x00, 0x42]), 'text/plain'),
    /EVIDENCE_TEXT_BINARY/,
  );
});
