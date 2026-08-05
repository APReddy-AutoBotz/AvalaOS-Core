import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { classifyEvidenceExtractionFailure, decodeBase64, extractEvidenceText, sha256Hex } from './enterpriseIntelligenceIngestion';

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
  const compressed = deflateSync(new TextEncoder().encode('BT (Compressed governed evidence) Tj ET'));
  const prefix = new TextEncoder().encode(`%PDF-1.4\n1 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`);
  const suffix = new TextEncoder().encode('\nendstream\nendobj\n%%EOF');
  const bytes = new Uint8Array(prefix.length + compressed.length + suffix.length);
  bytes.set(prefix, 0);
  bytes.set(compressed, prefix.length);
  bytes.set(suffix, prefix.length + compressed.length);
  assert.equal(await extractEvidenceText(bytes, 'application/pdf'), 'Compressed governed evidence');
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
