import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { classifyEvidenceFile } from '../services/enterpriseIntelligence';
import { decodeBase64, extractEvidenceText, sha256Hex } from '../supabase/functions/_shared/enterpriseIntelligenceIngestion';

const resultPath = process.env.EI_ACCEPTANCE_PARSER_RESULT_PATH;
assert.ok(resultPath, 'EI_ACCEPTANCE_PARSER_RESULT_PATH is required.');

const maximum = classifyEvidenceFile('acceptance.txt', 'text/plain', 12_000_000);
const oversize = classifyEvidenceFile('acceptance.txt', 'text/plain', 12_000_001);
const unsupported = classifyEvidenceFile('acceptance.exe', 'application/octet-stream', 64);
assert.equal(maximum.supported, true);
assert.equal(maximum.mimeType, 'text/plain');
assert.equal(oversize.supported, false);
assert.equal(unsupported.supported, false);

assert.equal(new TextDecoder().decode(decodeBase64('R292ZXJuZWQ=')), 'Governed');
const extractedValue = 'evidence';
const bytes = new TextEncoder().encode(`${extractedValue}${' '.repeat(12_000_000 - extractedValue.length)}`);
const extractedText = await extractEvidenceText(bytes, maximum.mimeType);
assert.equal(extractedText, extractedValue);

writeFileSync(resultPath, `${JSON.stringify({
  maximumBytes: 12_000_000,
  oversizeBytes: 12_000_001,
  maximumAccepted: maximum.supported,
  oversizeRejected: !oversize.supported,
  unsupportedMimeRejected: !unsupported.supported,
  mimeType: maximum.mimeType,
  contentBytes: bytes.byteLength,
  contentHash: await sha256Hex(bytes),
  extractedTextHash: await sha256Hex(new TextEncoder().encode(extractedText)),
  extractedCharacterCount: Array.from(extractedText).length,
})}\n`, { encoding: 'utf8', flag: 'wx' });
