import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectMermaidFlowcharts } from '../../../services/mermaidFlowchart';
import {
  StudioRenditionError,
  assertValidStudioPdf,
  inspectStudioDocxEntries,
  normalizeStudioApprovedContent,
  planStudioPdf3Diagram,
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
const exactSections = {
  brd: [
    ['summary', 'Summary'], ['objectives', 'Objectives'], ['scope', 'Scope'],
    ['requirements', 'Requirements'], ['risks', 'Risks'],
  ],
  frd: [
    ['summary', 'Summary'], ['functionalRequirements', 'Functional requirements'],
    ['rules', 'Rules'], ['interfaces', 'Interfaces'],
    ['acceptanceCriteria', 'Acceptance criteria'],
  ],
  pdd: [
    ['summary', 'Summary'], ['process', 'Process'], ['roles', 'Roles'],
    ['controls', 'Controls'], ['exceptions', 'Exceptions'],
  ],
  sdd: [
    ['summary', 'Summary'], ['architecture', 'Architecture'],
    ['components', 'Components'], ['interfaces', 'Interfaces'],
    ['dataDesign', 'Data design'], ['asIsFlow', 'As is flow'],
    ['toBeFlow', 'To be flow'], ['securityControls', 'Security controls'],
    ['operationalDesign', 'Operational design'],
    ['designDecisions', 'Design decisions'],
    ['openQuestionsAndProposals', 'Open questions and proposals'],
  ],
} as const;
const v2Content = (
  artifactType: keyof typeof exactSections,
  bodies: Readonly<Record<string, string>> = {},
) => ({
  contractVersion: 'studio-artifact-2',
  title: `Synthetic ${artifactType.toUpperCase()}`,
  summary: 'Source-grounded planning content.',
  sections: exactSections[artifactType].map(([id, title]) => ({
    id,
    title,
    body: bodies[id] ?? `${title} business content.`,
    sourceAnchors: [],
    labels: ['template_required'],
  })),
  coverage: {
    selectedSourceVersionIds: [],
    coveredSourceVersionIds: [],
    complete: true,
  },
});
const renderV2 = (
  artifactType: keyof typeof exactSections,
  value: unknown,
  format: 'markdown' | 'pdf' | 'docx',
) => renderStudioPrivateArtifact(value, format, {
  artifactType,
  contentSchemaVersion: artifactType === 'sdd' ? 'studio-artifact-2' : 'studio-artifact-1',
  templateVersion: `studio-${artifactType}-1`,
  rendererVersion: format === 'markdown'
    ? 'studio-markdown-2'
    : format === 'pdf'
      ? 'studio-pdf-2'
      : 'studio-docx-2',
});
const renderSddPdf3 = (value: unknown) => renderStudioPrivateArtifact(value, 'pdf', {
  artifactType: 'sdd',
  contentSchemaVersion: 'studio-artifact-2',
  templateVersion: 'studio-sdd-1',
  rendererVersion: 'studio-pdf-3',
});
const renderPdf4 = (
  artifactType: keyof typeof exactSections,
  value: unknown,
) => renderStudioPrivateArtifact(value, 'pdf', {
  artifactType,
  contentSchemaVersion: artifactType === 'sdd' ? 'studio-artifact-2' : 'studio-artifact-1',
  templateVersion: `studio-${artifactType}-1`,
  rendererVersion: 'studio-pdf-4',
});

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
  assert.equal(first.sha256, '2e1fa0766956d060e057bb4af85d9304e80b42560b6a05e9bfaac1df68d7fff7');
});
void test('renderer-2 exports schema-1 BRD V2 prose instead of raw JSON', async () => {
  const content = v2Content('brd', {
    summary: 'Accounts Payable receives invoice-status enquiries.',
    requirements: 'Use ready invoice-status GET. Bank-details POST is prohibited. PATCH availability remains unknown.',
  });
  const pdf = await renderV2('brd', content, 'pdf');
  const source = new TextDecoder('latin1').decode(pdf.bytes);
  assert.equal(pdf.rendererVersion, 'studio-pdf-2');
  assert.match(source, /Accounts Payable receives invoice-status enquiries/u);
  assert.match(source, /Bank-details POST is prohibited/u);
  assert.match(source, /PATCH availability/u);
  assert.match(source, /remains unknown/u);
  assert.match(source, /AvalaOS deterministic studio-pdf-2/u);
  assert.doesNotMatch(source, /sourceAnchors|anchorHash|"contractVersion"|"id"/u);

  const markdown = decode((await renderV2('brd', content, 'markdown')).bytes);
  assert.match(markdown, /## Requirements/u);
  assert.doesNotMatch(markdown, /sourceAnchors|anchorHash|contractVersion/u);
  const docx = inspectStudioDocxEntries((await renderV2('brd', content, 'docx')).bytes);
  assert.match(decode(docx.get('word/document.xml')!), /PATCH availability remains unknown/u);
  assert.match(decode(docx.get('docProps/app.xml')!), /studio-docx-2/u);
});
void test('renderer-2 requires the frozen V2 system-template dialect', async () => {
  const valid = v2Content('brd');
  const mutants: unknown[] = [
    { ...valid, unexpected: true },
    { ...valid, sections: valid.sections.slice(0, -1) },
    { ...valid, sections: valid.sections.map((section, index) => index === 0 ? { ...section, title: 'Overview' } : section) },
    { ...valid, sections: valid.sections.map((section, index) => index === 0 ? { ...section, labels: [] } : section) },
    { ...valid, coverage: { ...valid.coverage, complete: false } },
  ];
  for (const mutant of mutants) {
    await assert.rejects(() => renderV2('brd', mutant, 'pdf'), errorCode('INVALID_CONTENT'));
  }
  await assert.rejects(
    () => renderStudioPrivateArtifact(fixture, 'pdf', {
      artifactType: 'brd', contentSchemaVersion: 'studio-artifact-1',
      templateVersion: 'studio-brd-1', rendererVersion: 'studio-pdf-2',
    }),
    errorCode('INVALID_CONTENT'),
  );
});
void test('renderer-2 binds every selected source to one exact anchor', async () => {
  const sourceVersionId = '11111111-1111-4111-8111-111111111111';
  const valid = v2Content('frd');
  const anchored = {
    ...valid,
    sections: valid.sections.map((section, index) => index === 0 ? {
      ...section,
      sourceAnchors: [{ sourceVersionId, locator: 'page:1', anchorHash: 'a'.repeat(64) }],
      labels: [],
    } : section),
    coverage: {
      selectedSourceVersionIds: [sourceVersionId],
      coveredSourceVersionIds: [sourceVersionId],
      complete: true,
    },
  };
  await assert.doesNotReject(() => renderV2('frd', anchored, 'markdown'));
  await assert.rejects(
    () => renderV2('frd', {
      ...anchored,
      coverage: { ...anchored.coverage, coveredSourceVersionIds: [] },
    }, 'markdown'),
    errorCode('INVALID_CONTENT'),
  );
  await assert.rejects(
    () => renderV2('frd', {
      ...anchored,
      sections: anchored.sections.map((section, index) => index === 0 ? {
        ...section,
        sourceAnchors: [{ ...section.sourceAnchors[0], extra: 'not allowed' }],
      } : section),
    }, 'markdown'),
    errorCode('INVALID_CONTENT'),
  );
});
void test('renderer-2 keeps strict SDD flows as bounded vector diagrams', async () => {
  const content = v2Content('sdd', {
    asIsFlow: 'flowchart TD\n  A[Request] --> B[Manual review]',
    toBeFlow: 'flowchart LR\n  A[Request] --> B[Ready GET]\n  B --> C{Exception}\n  C -->|Yes| D[Human judgment]\n  C -->|No| E[Complete]',
  });
  const result = await renderV2('sdd', content, 'pdf');
  const pdf = new TextDecoder('latin1').decode(result.bytes);
  assert.equal(result.rendererVersion, 'studio-pdf-2');
  assert.match(pdf, /As is flow/u);
  assert.match(pdf, /To be flow/u);
  assert.match(pdf, /Human judgment/u);
  assert.match(pdf, /\d+ \d+ \d+ \d+ re B/u);
  assert.doesNotMatch(pdf, /flowchart (?:TD|LR)/u);
});
void test('renderer-3 routes every canonical SDD branch visibly and emits a complete transition legend', async () => {
  const asIsFlow = [
    'flowchart TD',
    'A[Receive query and acknowledge within two working days]',
    'B[Human verifies requester authority]',
    'C[Analyst identifies stated invoice reference]',
    'D[Read and verify invoice status]',
    'E[Human investigates ambiguity or dispute]',
    'F[Human approves and sends reply]',
    'G[Record original source and approved reply]',
    'A --> B', 'B -->|Verified| C', 'B -->|Unresolved| E',
    'C -->|Exact reference| D', 'C -->|Missing or ambiguous| E',
    'D -->|Verified status| F', 'D -->|Error or dispute| E',
    'E -->|Resolved for reply| F', 'F --> G',
  ].join('\n');
  const toBeFlow = [
    'flowchart TD',
    'A[Proposed workflow capture and acknowledgment]',
    'B[Human verifies requester authority]',
    'C[Proposed rules validate exact invoice and supplier references]',
    'D[Ready read-only GET retrieves invoice status]',
    'E[Human reviews missing records errors or disputes]',
    'F[Prepare reply from verified status]',
    'G[Human approves and sends reply]',
    'H[Proposed evidence record links source and approved reply]',
    'A --> B', 'B -->|Verified| C', 'B -->|Unresolved| E',
    'C -->|Exact match| D', 'C -->|Invalid or ambiguous| E',
    'D -->|Matching status| F', 'D -->|Not found denied or technical failure| E',
    'E -->|Resolved for reply| F', 'F --> G', 'G --> H',
  ].join('\n');
  const content = v2Content('sdd', { asIsFlow, toBeFlow });
  const historicalPdf2 = await renderV2('sdd', content, 'pdf');
  assert.equal(historicalPdf2.sha256, '2781e80ae0c2b702c41c43da2f5d6b1058ca50ce7d49575cac6957f199edb82f');
  const first = await renderSddPdf3(content);
  const second = await renderSddPdf3(content);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.rendererVersion, 'studio-pdf-3');
  const pdf = new TextDecoder('latin1').decode(first.bytes);
  assert.match(pdf, /AvalaOS deterministic studio-pdf-3/u);
  assert.equal((pdf.match(/Complete transition legend/g) ?? []).length, 2);
  for (const expected of [
    'E3: [B] Human verifies requester authority --Unresolved-->',
    'E5: [C] Analyst identifies stated invoice reference --Missing or ambiguous-->',
    'E6: [D] Read and verify invoice status --Verified status-->',
    'E7: [D] Ready read-only GET retrieves invoice status --Not found denied or technical failure-->',
  ]) assert.ok(pdf.includes(expected), expected);

  const chart = inspectMermaidFlowcharts(asIsFlow, true)[0];
  const plan = planStudioPdf3Diagram({
    kind: 'diagram', title: 'As is flow', chart,
    nodeIds: chart.nodes.map(node => node.id), part: 1, parts: 1, advance: 472,
  }, 720);
  assert.equal(plan.routes.length, chart.edges.length);
  assert.equal(new Set(plan.routes.map(route => route.edgeId)).size, chart.edges.length);
  assert.ok(plan.routes.find(route => route.edgeId === 'E3')!.points.length > 2);
});
void test('renderer-3 is authorized only for the exact SDD V2 schema and template', async () => {
  const content = v2Content('sdd', {
    asIsFlow: 'flowchart TD\nA[Start] --> B[Review]',
    toBeFlow: 'flowchart TD\nA[Start] --> B[Ready GET]',
  });
  await assert.doesNotReject(() => renderSddPdf3(content));
  for (const authority of [
    { artifactType: 'brd' as const, contentSchemaVersion: 'studio-artifact-1', templateVersion: 'studio-brd-1' },
    { artifactType: 'sdd' as const, contentSchemaVersion: 'studio-artifact-1', templateVersion: 'studio-sdd-1' },
    { artifactType: 'sdd' as const, contentSchemaVersion: 'studio-artifact-2', templateVersion: 'studio-brd-1' },
  ]) await assert.rejects(() => renderStudioPrivateArtifact(content, 'pdf', {
    ...authority, rendererVersion: 'studio-pdf-3',
  }), errorCode('VERSION_MISMATCH'));
});
void test('renderer-4 deterministically exports every exact business document while preserving renderer-2 and renderer-3 bytes', async () => {
  for (const artifactType of ['brd', 'pdd', 'frd'] as const) {
    const content = v2Content(artifactType, {
      summary: 'Readable business content with supported facts, proposed choices and unanswered questions.',
    });
    const historical = await renderV2(artifactType, content, 'pdf');
    const historicalReplay = await renderV2(artifactType, content, 'pdf');
    const current = await renderPdf4(artifactType, content);
    const currentReplay = await renderPdf4(artifactType, content);
    assert.deepEqual(historical.bytes, historicalReplay.bytes);
    assert.deepEqual(current.bytes, currentReplay.bytes);
    assert.notEqual(current.sha256, historical.sha256);
    assert.equal(current.rendererVersion, 'studio-pdf-4');
    const source = new TextDecoder('latin1').decode(current.bytes);
    assert.match(source, /AvalaOS deterministic studio-pdf-4/u);
    assert.match(source, /Readable business content/u);
    assert.doesNotMatch(source.replace(/\([^)]*\)/gu, ''), /\/(?:JavaScript|AcroForm|EmbeddedFiles|URI)\b/u);
  }

  const sdd = v2Content('sdd', {
    asIsFlow: 'flowchart TD\nA[Receive query] -->|Verified| B[Human approves reply]',
    toBeFlow: 'flowchart TD\nA[Capture request] -->|Ready GET| B[Retrieve invoice status]',
  });
  const historical = await renderSddPdf3(sdd);
  const historicalReplay = await renderSddPdf3(sdd);
  const current = await renderPdf4('sdd', sdd);
  assert.deepEqual(historical.bytes, historicalReplay.bytes);
  assert.notEqual(current.sha256, historical.sha256);
  assert.equal(current.rendererVersion, 'studio-pdf-4');
});

void test('renderer-4 exports an appended UI-authored planning question without weakening required sections or source binding', async () => {
  const base = v2Content('frd');
  const appendix = {
    id: 'section-dd481ada-5473-40ac-8d25-197c4c4de0a7',
    title: 'Open questions',
    body: 'Question: Is invoice PATCH supported and authorized, or must the implementation retain the blocker?',
    sourceAnchors: [],
    labels: ['human_authored'],
  };
  const current = await renderPdf4('frd', {
    ...base,
    sections: [...base.sections, appendix],
  });
  const pdf = new TextDecoder('latin1').decode(current.bytes);
  assert.match(pdf, /Open questions/u);
  assert.match(pdf, /Is invoice PATCH supported and authorized/u);

  await assert.rejects(() => renderV2('frd', {
    ...base,
    sections: [...base.sections, appendix],
  }, 'pdf'), errorCode('INVALID_CONTENT'));

  for (const rejected of [
    { ...appendix, id: 'openQuestions' },
    { ...appendix, labels: ['assumption'] },
    {
      ...appendix,
      sourceAnchors: [{
        sourceVersionId: '11111111-1111-4111-8111-111111111111',
        locator: 'page:1',
        anchorHash: 'a'.repeat(64),
      }],
    },
  ]) {
    await assert.rejects(() => renderPdf4('frd', {
      ...base,
      sections: [...base.sections, rejected],
    }), errorCode('INVALID_CONTENT'));
  }
});

void test('renderer-4 keeps retained business flow labels and branch meaning readable without ellipsis', async () => {
  const asIsFlow = [
    'flowchart TD',
    'A[Receive query and acknowledge within two working days]',
    'B[Human verifies requester authority]',
    'C[Analyst identifies stated invoice reference]',
    'D[Read and verify invoice status]',
    'E[Human investigates ambiguity or dispute]',
    'F[Human approves and sends reply]',
    'G[Record original source and approved reply]',
    'A --> B', 'B -->|Verified| C', 'B -->|Unresolved| E',
    'C -->|Exact reference| D', 'C -->|Missing or ambiguous| E',
    'D -->|Verified status| F', 'D -->|Error or dispute| E',
    'E -->|Resolved for reply| F', 'F --> G',
  ].join('\n');
  const toBeFlow = [
    'flowchart TD',
    'A[Proposed workflow capture and acknowledgment]',
    'B[Human verifies requester authority]',
    'C[Proposed rules validate exact invoice and supplier references]',
    'D[Ready read-only GET retrieves invoice status]',
    'E[Human reviews missing records errors or disputes]',
    'F[Prepare reply from verified status]',
    'G[Human approves and sends reply]',
    'H[Proposed evidence record links source and approved reply]',
    'A --> B', 'B -->|Verified| C', 'B -->|Unresolved| E',
    'C -->|Exact match| D', 'C -->|Invalid or ambiguous| E',
    'D -->|Matching status| F', 'D -->|Not found denied or technical failure| E',
    'E -->|Resolved for reply| F', 'F --> G', 'G --> H',
  ].join('\n');
  const first = await renderPdf4('sdd', v2Content('sdd', { asIsFlow, toBeFlow }));
  const second = await renderPdf4('sdd', v2Content('sdd', { asIsFlow, toBeFlow }));
  assert.deepEqual(first.bytes, second.bytes);
  const pdf = new TextDecoder('latin1').decode(first.bytes);
  for (const text of [
    'Receive query and acknowledge within two working days',
    'Proposed rules validate exact invoice and supplier references',
    'Not found denied or technical failure',
    'Transition details',
  ]) assert.ok(pdf.includes(text), text);
  assert.doesNotMatch(pdf, /\.\.\./u);
  assert.doesNotMatch(pdf, /flowchart TD/u);
  assert.match(pdf, /\/F2 9 Tf/u);
});

void test('renderer-4 rejects non-system, wrong-schema and wrong-template authority', async () => {
  const content = v2Content('brd');
  await assert.doesNotReject(() => renderPdf4('brd', content));
  for (const authority of [
    { artifactType: 'brd' as const, contentSchemaVersion: 'studio-artifact-2', templateVersion: 'studio-brd-1' },
    { artifactType: 'brd' as const, contentSchemaVersion: 'studio-artifact-1', templateVersion: 'studio-sdd-1' },
  ]) await assert.rejects(() => renderStudioPrivateArtifact(content, 'pdf', {
    ...authority, rendererVersion: 'studio-pdf-4',
  }), errorCode('VERSION_MISMATCH'));
});
void test('canonical SDD schema v2 renders As-Is and To-Be as bounded vector diagrams', async () => {
  const anchor = { sourceVersionId: '11111111-1111-4111-8111-111111111111', locator: 'page:1', anchorHash: 'a'.repeat(64) };
  const flow = (id: string, title: string, body: string) => ({ id, title, body, sourceAnchors: [anchor], labels: [] });
  const content = {
    contractVersion: 'studio-artifact-2', title: 'Synthetic SDD export', summary: 'Synthetic renderer verification.',
    coverage: { selectedSourceVersionIds: [anchor.sourceVersionId], coveredSourceVersionIds: [anchor.sourceVersionId], complete: true },
    sections: [
      flow('summary', 'Summary', 'A source-bound synthetic design.'),
      flow('asIsFlow', 'As-Is flow', 'flowchart TD\n  A[Request] --> B{Evidence complete}\n  B -->|Yes| C[Human approval]\n  B -->|No| D[Request evidence]'),
      flow('toBeFlow', 'To-Be flow', 'flowchart LR\n  A[Request] --> B[API validation]\n  B --> C{Exception}\n  C -->|Yes| D[Human judgment]\n  C -->|No| E[Workflow completion]'),
    ],
  };
  const result = await renderStudioPrivateArtifact(content, 'pdf', {
    artifactType: 'sdd', contentSchemaVersion: 'studio-artifact-2', templateVersion: 'studio-sdd-1', rendererVersion: 'studio-pdf-1',
  });
  const pdf = new TextDecoder('latin1').decode(result.bytes);
  assert.match(pdf, /Synthetic SDD export/u);
  assert.match(pdf, /As-Is flow/u);
  assert.match(pdf, /To-Be flow/u);
  assert.match(pdf, /\d+ \d+ \d+ \d+ re B/u);
  assert.doesNotMatch(pdf, /flowchart (?:TD|LR)/u);
});
void test('schema v2 PDF preserves cycles, cross-page transitions, and full clipped labels', async () => {
  const body = [
    'flowchart TD',
    '  A0[Start] --> A1[Collect detailed request evidence]',
    '  A1 --> A2[Validate source package]',
    '  A2 --> A3[Check policy]',
    '  A3 --> A4[Route work]',
    '  A4 --> A5[Inspect exception]',
    '  A5 --> A6[Request review]',
    '  A6 --> A7[Record decision]',
    '  A7 --> A8[Prepare handoff]',
    '  A8 --> A9[Independent approval]',
    '  A9 --> A10[Publish package]',
    '  A10 --> A11[Complete]',
    '  A6 -->|Follow up| A4',
    '  A11 -->|Reopen| A2',
  ].join('\n');
  const content = {
    contractVersion: 'studio-artifact-2', title: 'Large loop SDD', summary: 'Synthetic export boundary test.',
    coverage: { selectedSourceVersionIds: [], coveredSourceVersionIds: [], complete: true },
    sections: [{ id: 'asIsFlow', title: 'As-Is flow', body, sourceAnchors: [], labels: ['template_required'] }],
  };
  const result = await renderStudioPrivateArtifact(content, 'pdf', {
    artifactType: 'sdd', contentSchemaVersion: 'studio-artifact-2', templateVersion: 'studio-sdd-1', rendererVersion: 'studio-pdf-1',
  });
  const pdf = new TextDecoder('latin1').decode(result.bytes);
  assert.match(pdf, /Diagram part 1 of 2/u);
  assert.match(pdf, /Diagram part 2 of 2/u);
  assert.match(pdf, /Transitions from diagram part 1/u);
  assert.match(pdf, /cycle\/back transition/u);
  assert.match(pdf, /continues in part 2/u);
  assert.match(pdf, /continues in part 1/u);
  assert.match(pdf, /\[A1\] Collect detailed request evidence/u);
  assert.doesNotMatch(pdf, /flowchart TD/u);
});
void test('canonical SDD schema v2 rejects unsupported Mermaid before export', async () => {
  const content = {
    contractVersion: 'studio-artifact-2', title: 'SDD', summary: '', coverage: { selectedSourceVersionIds: [], coveredSourceVersionIds: [], complete: true },
    sections: [{ id: 'asIsFlow', title: 'As-Is flow', body: 'flowchart TD\nA --> B --> C', sourceAnchors: [], labels: ['template_required'] }],
  };
  await assert.rejects(() => renderStudioPrivateArtifact(content, 'pdf', {
    artifactType: 'sdd', contentSchemaVersion: 'studio-artifact-2', templateVersion: 'studio-sdd-1', rendererVersion: 'studio-pdf-1',
  }), errorCode('INVALID_CONTENT'));
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

void test('BRD FRD PDD and SDD template-keyed content preserves canonical inventory and nested data', async () => {
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
    {
      authority: { artifactType: 'sdd' as const, templateVersion: 'studio-sdd-1' },
      content: {
        title: 'SDD',
        summary: 'Summary',
        architecture: { boundary: 'governed service' },
        components: ['Studio'],
        interfaces: [{ name: 'Unknown API', status: 'proposal' }],
        dataDesign: { sourceBinding: 'immutable' },
        asIsFlow: 'flowchart TD\n  A[Start] --> B[Review]',
        toBeFlow: 'flowchart TD\n  A[Start] --> B[API]\n  B --> C[Human review]',
        securityControls: ['server authorization'],
        operationalDesign: { owner: 'Unassigned' },
        designDecisions: ['API-first where supported'],
        openQuestionsAndProposals: ['Confirm API operation availability'],
      },
    },
  ];
  for (const fixtureCase of fixtures) {
    const normalized = normalizeStudioApprovedContent(fixtureCase.content, {
      ...fixtureCase.authority,
      contentSchemaVersion: 'studio-artifact-1',
    });
    assert.match(JSON.stringify(normalized), /Summary/u);
    assert.match(JSON.stringify(normalized), /review|functionalRequirements|objectives|one|F1|architecture/u);
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
