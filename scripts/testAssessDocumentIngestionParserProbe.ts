import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  classifyEvidenceExtractionFailure,
  extractEvidenceText,
  extractStructuredSpreadsheet,
} from '../supabase/functions/_shared/enterpriseIntelligenceIngestion.ts';
import {
  SPREADSHEET_PARSER_VERSION,
  XLSX_MIME,
} from '../supabase/functions/_shared/assessDocumentSpreadsheet.ts';
import { syntheticWorkbook } from '../tests/fixtures/assessImportSpreadsheets.ts';

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

test('production ingestion and mapping extraction agree on the canonical XLSX text', async () => {
  const bytes = syntheticWorkbook();
  const malformedBytes = syntheticWorkbook([{ name: 'Formula only', cells: '<row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row>' }]);
  const productionText = await extractEvidenceText(bytes, XLSX_MIME);
  const mapping = await extractStructuredSpreadsheet(bytes, XLSX_MIME);
  let malformedFailureCode: string | null = null;
  try {
    await extractEvidenceText(malformedBytes, XLSX_MIME);
  } catch (error) {
    malformedFailureCode = classifyEvidenceExtractionFailure(error, XLSX_MIME);
  }
  assert.equal(mapping.parserVersion, SPREADSHEET_PARSER_VERSION);
  assert.equal(productionText, mapping.text);
  assert.ok(productionText.length > 0);
  assert.ok(mapping.sheets.length > 0);
  assert.ok(mapping.cells.length > 0);
  assert.equal(mapping.cells.find(cell => cell.sheet === 'Process' && cell.address === 'A2')?.text, 'Rules stable');
  assert.equal(mapping.cells.find(cell => cell.sheet === 'Process' && cell.address === 'B2')?.text, 'true');
  assert.equal(malformedFailureCode, 'MALFORMED_SOURCE');
  console.log(`ASSESS_DOCUMENT_XLSX_PROBE ${JSON.stringify({
    mimeType: XLSX_MIME,
    filename: 'synthetic-assess-input.xlsx',
    contentHash: sha256(bytes),
    contentBytes: bytes.byteLength,
    extractedTextHash: sha256(productionText),
    extractedCharacterCount: productionText.length,
    extractedByteCount: new TextEncoder().encode(productionText).byteLength,
    parserVersion: mapping.parserVersion,
    sheetCount: mapping.sheets.length,
    cellCount: mapping.cells.length,
    warnings: mapping.warnings,
    malformedFailureCode,
    malformedContentHash: sha256(malformedBytes),
    malformedContentBytes: malformedBytes.byteLength,
  })}`);
});
