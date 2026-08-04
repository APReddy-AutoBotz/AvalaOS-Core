import assert from 'node:assert/strict';
import { decodeBase64, extractEvidenceText, sha256Hex } from './enterpriseIntelligenceIngestion';

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
  const bytes = new TextEncoder().encode('WEBVTT\n\n00:00.000 --> 00:01.000\nA governed note');
  assert.equal(await extractEvidenceText(bytes, 'text/vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nA governed note');
});

await test('extracts text PDF literals without treating embedded content as instructions', async () => {
  const bytes = new TextEncoder().encode('BT (AvalaOS evidence) Tj ET');
  assert.equal(await extractEvidenceText(bytes, 'application/pdf'), 'AvalaOS evidence');
});
