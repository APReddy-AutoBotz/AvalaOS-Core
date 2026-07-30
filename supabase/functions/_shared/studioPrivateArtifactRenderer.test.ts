import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StudioRenditionError,
  assertValidStudioPdf,
  inspectStudioDocxEntries,
  normalizeStudioApprovedContent,
  renderStudioPrivateArtifact,
  sha256Hex,
  validateStudioApprovedContent,
} from './studioPrivateArtifactRenderer';

const fixture = {
  title: 'Business Brief',
  summary: 'A deterministic summary.',
  sections: [
    { title: 'Context', content: 'Current state and evidence.' },
    { title: 'Decision', content: 'Proceed with governed controls.' },
  ],
};
const renderingAuthority = {
  artifactType: 'brd' as const,
  contentSchemaVersion: 'studio-artifact-1',
  templateVersion: 'studio-brd-1',
  rendererVersion: 'studio-markdown-1' as const,
};
const render = (value: unknown, format: string) =>
  renderStudioPrivateArtifact(value, format, {
    ...renderingAuthority,
    rendererVersion:
      format === 'markdown'
        ? 'studio-markdown-1'
        : format === 'pdf'
          ? 'studio-pdf-1'
          : 'studio-docx-1',
  });
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const errorCode = (code: string) => (error: unknown) => error instanceof StudioRenditionError && error.code === code;

void test('renderer accepts bounded canonical objects without dropping fields', () => {
  assert.deepEqual(validateStudioApprovedContent(fixture), fixture);
  const extended = { ...fixture, actorId: 'canonical-source-field' };
  assert.deepEqual(validateStudioApprovedContent(extended), extended);
  assert.match(
    JSON.stringify(normalizeStudioApprovedContent(extended, renderingAuthority)),
    /canonical-source-field/u,
  );
});
void test('renderer deterministically normalizes the accepted PR 216 fixture shape', () => {
  assert.deepEqual(
    normalizeStudioApprovedContent(
      { title: 'Accepted fixture', sections: [{ heading: 'Scope', body: 'Exact body' }] },
      renderingAuthority,
    ),
    {
      title: 'Accepted fixture',
      summary: '',
      sections: [{ title: 'Scope', content: 'Exact body' }],
    },
  );
});
void test('renderer rejects non-normalized and control-bearing text', () => {
  assert.throws(() => validateStudioApprovedContent({ ...fixture, title: 'Cafe\u0301' }), errorCode('INVALID_CONTENT'));
  assert.throws(() => validateStudioApprovedContent({ ...fixture, summary: 'bad\u0000value' }), errorCode('INVALID_CONTENT'));
});
void test('renderer rejects lone Unicode surrogates', () => {
  assert.throws(() => validateStudioApprovedContent({ ...fixture, title: 'bad\ud800' }), errorCode('INVALID_CONTENT'));
});
void test('renderer rejects oversized structured content', () => {
  const sections = Array.from({ length: 30 }, (_, index) => ({ title: `Section ${index}`, content: 'x'.repeat(20_000) }));
  assert.throws(() => validateStudioApprovedContent({ title: 'A', summary: '', sections }), errorCode('CONTENT_OVERSIZED'));
});
void test('renderer rejects unsupported formats before rendering', async () => {
  await assert.rejects(() => render(fixture, 'html'), errorCode('UNSUPPORTED_FORMAT'));
});

void test('Markdown output is exact UTF-8 with stable ordering and newline', async () => {
  const result = await render(fixture, 'markdown');
  assert.equal(decode(result.bytes), '# Business Brief\n\nA deterministic summary\.\n\n## Context\n\nCurrent state and evidence\.\n\n## Decision\n\nProceed with governed controls\.\n');
});
void test('Markdown escapes executable HTML and unsafe Markdown links', async () => {
  const hostile = { title: '<script>alert(1)</script>', summary: '[run](javascript:alert(1))', sections: [{ title: 'Unsafe', content: '<img src=x onerror=alert(1)>' }] };
  const source = decode((await render(hostile, 'markdown')).bytes);
  assert.doesNotMatch(source, /<script|<img|\[run\]\(javascript:/iu);
  assert.match(source, /&lt;script&gt;/u);
  assert.match(source, /\\\[run\\\]\\\(javascript:alert\\\(1\\\)\\\)/u);
});
void test('Markdown generation is byte-for-byte deterministic', async () => {
  const first = await render(fixture, 'markdown');
  const second = await render(fixture, 'markdown');
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.sha256, second.sha256);
});
void test('Markdown metadata has canonical safe values', async () => {
  const result = await render({ ...fixture, title: 'Secret Customer Title' }, 'markdown');
  assert.equal(result.mimeType, 'text/markdown; charset=utf-8');
  assert.equal(result.filename, 'studio-artifact-rendition.md');
  assert.equal(result.rendererVersion, 'studio-markdown-1');
  assert.doesNotMatch(result.filename, /secret|customer/iu);
});

void test('PDF has a valid header, xref, trailer, and EOF', async () => {
  const result = await render(fixture, 'pdf');
  const source = String.fromCharCode(...result.bytes);
  assert.match(source, /^%PDF-1\.7/u);
  assert.match(source, /xref\n0 \d+\n/u);
  assert.match(source, /trailer\n<</u);
  assert.match(source, /%%EOF\n$/u);
  assert.doesNotThrow(() => assertValidStudioPdf(result.bytes));
});
void test('PDF includes deterministic semantic content and fixed metadata', async () => {
  const source = String.fromCharCode(...(await render(fixture, 'pdf')).bytes);
  assert.match(source, /\(Business Brief\) Tj/u);
  assert.match(source, /\(Context\) Tj/u);
  assert.match(source, /D:20000101000000Z/u);
});
void test('PDF wraps content across multiple Letter pages', async () => {
  const long = { title: 'Long Brief', summary: 'summary', sections: [{ title: 'Evidence', content: 'governed evidence '.repeat(900) }] };
  const source = String.fromCharCode(...(await render(long, 'pdf')).bytes);
  const count = /\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/u.exec(source);
  assert.ok(count && Number(count[1]) > 1);
  assert.match(source, /\/MediaBox \[0 0 612 792\]/u);
});
void test('PDF uses only safe standard Helvetica fonts', async () => {
  const source = String.fromCharCode(...(await render(fixture, 'pdf')).bytes);
  assert.match(source, /\/BaseFont \/Helvetica\b/u);
  assert.match(source, /\/BaseFont \/Helvetica-Bold\b/u);
  assert.doesNotMatch(source, /\/FontFile|\/FontFile2|\/FontFile3/u);
});
void test('PDF contains no active content, forms, attachments, or external references', async () => {
  const source = String.fromCharCode(...(await render({ ...fixture, summary: '/JavaScript is discussed as inert text.' }, 'pdf')).bytes);
  const structural = source.replace(/\([^)]*\)/gu, '');
  assert.doesNotMatch(structural, /\/(?:JavaScript|JS|EmbeddedFiles|AcroForm|XFA|URI|GoToR)\b/u);
});
void test('PDF structural validator rejects an active-content dictionary name', async () => {
  const result = await render(fixture, 'pdf');
  const source = String.fromCharCode(...result.bytes).replace('/Producer', '/JS      ');
  const bytes = Uint8Array.from(source, (character) => character.charCodeAt(0));
  assert.throws(() => assertValidStudioPdf(bytes), errorCode('OUTPUT_INVALID'));
});
void test('PDF generation is byte-for-byte deterministic with correct metadata', async () => {
  const first = await render(fixture, 'pdf');
  const second = await render(fixture, 'pdf');
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.mimeType, 'application/pdf');
  assert.equal(first.filename, 'studio-artifact-rendition.pdf');
  assert.equal(first.rendererVersion, 'studio-pdf-1');
});

void test('DOCX is a valid deterministic ZIP with required OOXML package entries', async () => {
  const result = await render(fixture, 'docx');
  assert.deepEqual(Array.from(result.bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  const entries = inspectStudioDocxEntries(result.bytes);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) assert.ok(entries.has(name), name);
});
void test('DOCX contains expected escaped semantic text', async () => {
  const hostile = { ...fixture, summary: 'A < B & C > D' };
  const entries = inspectStudioDocxEntries((await render(hostile, 'docx')).bytes);
  const document = decode(entries.get('word/document.xml')!);
  assert.match(document, /Business Brief/u);
  assert.match(document, /A &lt; B &amp; C &gt; D/u);
});
void test('DOCX applies standard_business_brief Letter and one-inch margin tokens', async () => {
  const entries = inspectStudioDocxEntries((await render(fixture, 'docx')).bytes);
  const document = decode(entries.get('word/document.xml')!);
  const styles = decode(entries.get('word/styles.xml')!);
  assert.match(document, /w:pgSz w:w="12240" w:h="15840"/u);
  assert.match(document, /w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/u);
  assert.match(styles, /w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/u);
  assert.match(styles, /w:sz w:val="22"/u);
  assert.match(styles, /w:spacing w:before="240" w:after="120"/u);
});
void test('DOCX uses fixed safe metadata and ZIP timestamps', async () => {
  const result = await render(fixture, 'docx');
  const entries = inspectStudioDocxEntries(result.bytes);
  assert.match(decode(entries.get('docProps/core.xml')!), /2000-01-01T00:00:00Z/u);
  assert.equal(result.bytes[10], 0);
  assert.equal(result.bytes[11], 0);
  assert.equal(result.bytes[12], 0x21);
  assert.equal(result.bytes[13], 0);
});
void test('DOCX has no macros, OLE, ActiveX, remote images, or external relationships', async () => {
  const entries = inspectStudioDocxEntries((await render(fixture, 'docx')).bytes);
  const names = [...entries.keys()].join('\n');
  const xml = [...entries.values()].map(decode).join('\n');
  assert.doesNotMatch(names, /vbaProject|activeX|embeddings|\.bin/iu);
  assert.doesNotMatch(xml, /TargetMode="External"|javascript:|vbscript:|<w:object|OLEObject/iu);
});
void test('DOCX structural validator detects byte corruption', async () => {
  const result = await render(fixture, 'docx');
  const tampered = result.bytes.slice();
  tampered[80] ^= 0xff;
  assert.throws(() => inspectStudioDocxEntries(tampered), errorCode('OUTPUT_INVALID'));
});
void test('DOCX generation is byte-for-byte deterministic with correct metadata', async () => {
  const first = await render(fixture, 'docx');
  const second = await render(fixture, 'docx');
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(first.filename, 'studio-artifact-rendition.docx');
  assert.equal(first.rendererVersion, 'studio-docx-1');
});

void test('BRD FRD and PDD template-keyed content preserves canonical inventory and nested data', async () => {
  const fixtures = [
    {
      authority: { artifactType: 'brd' as const, templateVersion: 'studio-brd-1' },
      content: { title: 'BRD', summary: 'Summary', objectives: ['one', 'two'], scope: { in: ['A'], out: ['B'] }, requirements: [{ id: 'R1', priority: 1 }], risks: { security: true } },
    },
    {
      authority: { artifactType: 'frd' as const, templateVersion: 'studio-frd-1' },
      content: { title: 'FRD', summary: 'Summary', functionalRequirements: [{ id: 'F1', rules: ['A', 'B'] }], rules: { deterministic: true }, interfaces: ['API'], acceptanceCriteria: { passed: false } },
    },
    {
      authority: { artifactType: 'pdd' as const, templateVersion: 'studio-pdd-1' },
      content: { title: 'PDD', summary: 'Summary', process: [{ step: 1, actions: ['review'] }], roles: { approver: ['human'] }, controls: ['retention'], exceptions: { none: null } },
    },
  ];
  for (const fixtureCase of fixtures) {
    const normalized = normalizeStudioApprovedContent(fixtureCase.content, {
      ...fixtureCase.authority,
      contentSchemaVersion: 'studio-artifact-1',
    });
    assert.match(JSON.stringify(normalized), /Summary/u);
    assert.match(JSON.stringify(normalized), /review|functionalRequirements|objectives|one|F1/u);
    for (const format of ['markdown', 'pdf', 'docx'] as const) {
      const result = await renderStudioPrivateArtifact(fixtureCase.content, format, {
        ...fixtureCase.authority,
        contentSchemaVersion: 'studio-artifact-1',
        rendererVersion:
          format === 'markdown'
            ? 'studio-markdown-1'
            : format === 'pdf'
              ? 'studio-pdf-1'
              : 'studio-docx-1',
      });
      assert.equal(result.templateVersion, fixtureCase.authority.templateVersion);
      assert.equal(result.contentSchemaVersion, 'studio-artifact-1');
    }
  }
});

void test('fallback canonical JSON has stable key order and no silent field loss', () => {
  const first = normalizeStudioApprovedContent(
    { title: 'Nested', zeta: { b: 2, a: 1 }, alpha: [{ y: true, x: false }] },
    renderingAuthority,
  );
  const second = normalizeStudioApprovedContent(
    { alpha: [{ x: false, y: true }], zeta: { a: 1, b: 2 }, title: 'Nested' },
    renderingAuthority,
  );
  assert.deepEqual(first, second);
  assert.match(JSON.stringify(first), /Alpha/u);
  assert.match(JSON.stringify(first), /Zeta/u);
  assert.equal(JSON.stringify(first).includes('\\"a\\": 1'), true);
});

void test('all formats report exact byte length and SHA-256 parity', async () => {
  for (const format of ['markdown', 'pdf', 'docx'] as const) {
    const result = await render(fixture, format);
    assert.equal(result.byteLength, result.bytes.byteLength);
    assert.equal(result.sha256, await sha256Hex(result.bytes));
    assert.match(result.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(result.templateVersion, 'studio-brd-1');
  }
});
