import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvedBusinessOutputMarkdown,
  sanitizeApprovedBusinessOutputText,
  validateApprovedDeliveryItemEvidence,
} from './canonicalBusinessOutputEvidence';

test('approved business output retains business content and removes identifiers, digests and credentials', () => {
  const markdown = approvedBusinessOutputMarkdown({
    title: 'Approved AP package',
    approvalState: 'Approved v2',
    contentOrigin: 'Providers OFF; test-authored through the normal UI.',
    sections: [{
      heading: 'Lineage',
      body: 'Package 00000000-0000-4000-8000-000000000001 has sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa. Keep AP controls.',
    }],
    remainingGaps: ['Bearer abc.def is not retained.'],
  });
  assert.match(markdown, /Keep AP controls/u);
  assert.match(markdown, /identifier omitted from sanitized evidence/u);
  assert.match(markdown, /digest omitted from sanitized evidence/u);
  assert.match(markdown, /credential omitted/u);
  assert.doesNotMatch(markdown, /00000000-0000-4000-8000-000000000001/u);
  assert.doesNotMatch(markdown, /a{64}/u);
  assert.doesNotMatch(markdown, /abc\.def/u);
});

test('approved business output rejects missing business sections', () => {
  assert.throws(() => approvedBusinessOutputMarkdown({
    title: 'Approved AP package', approvalState: 'Approved', contentOrigin: 'Providers OFF', sections: [], remainingGaps: [],
  }), /CANONICAL_APPROVED_BUSINESS_OUTPUT_INCOMPLETE/u);
  assert.throws(() => approvedBusinessOutputMarkdown({
    title: 'Approved AP package', approvalState: 'Approved', contentOrigin: 'Providers OFF',
    sections: [{ heading: 'Scope', body: '   ' }], remainingGaps: [],
  }), /CANONICAL_APPROVED_BUSINESS_OUTPUT_SECTION_INCOMPLETE/u);
});

test('sanitization preserves multiline business wording', () => {
  assert.equal(sanitizeApprovedBusinessOutputText('Scope\r\nHuman approval required.  '), 'Scope\nHuman approval required.');
});

test('sanitization removes signed URL values, standalone JWTs and synthetic persona emails but preserves ordinary documentation URLs', () => {
  const ordinary = 'Reference https://docs.example.test/guide?section=auth&version=2.';
  const signed = 'Download https://storage.example.test/object?X-Amz-Signature=secret-value&expires=12345.';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';
  const sanitized = sanitizeApprovedBusinessOutputText(`${ordinary}\n${signed}\n${jwt}\nowner@example.invalid`);
  assert.match(sanitized, /https:\/\/docs\.example\.test\/guide\?section=auth&version=2\./u);
  assert.match(sanitized, /X-Amz-Signature=\[credential omitted\]/u);
  assert.match(sanitized, /expires=\[credential omitted\]/u);
  assert.match(sanitized, /\[token omitted from sanitized evidence\]/u);
  assert.match(sanitized, /\[synthetic persona email omitted\]/u);
  assert.doesNotMatch(sanitized, /secret-value|12345|eyJhbGci|owner@example/u);
});

test('sequential sanitization calls cannot retain regular-expression state', () => {
  const first = sanitizeApprovedBusinessOutputText('00000000-0000-4000-8000-000000000001');
  const second = sanitizeApprovedBusinessOutputText('00000000-0000-4000-8000-000000000002');
  assert.equal(first, '[identifier omitted from sanitized evidence]');
  assert.equal(second, '[identifier omitted from sanitized evidence]');
});

test('delivery evidence requires exactly five complete accepted records and honestly permits empty lists', () => {
  const completeItem = {
    title: 'Implement governed AP invoice exception triage',
    description: 'Route evidence-complete exceptions to the owned review queue.',
    acceptanceCriteria: ['Missing evidence produces a review exception.'],
    nonFunctionalRequirements: ['Commands remain idempotent and auditable.'],
    sourceCitation: 'Source citation: BRD artifact v2 · Functional requirements',
    decision: 'Decision: accepted · Verified against the approved BRD.',
    history: 'Immutable history\nv1 · Proposed',
  } as const;
  const fiveItems = Array.from({ length: 5 }, (_, index) => ({
    ...completeItem,
    title: `${completeItem.title} ${index + 1}`,
    ...(index === 2 ? { acceptanceCriteria: [] as readonly string[] } : {}),
    ...(index > 0 ? { nonFunctionalRequirements: [] as readonly string[] } : {}),
  }));
  assert.equal(validateApprovedDeliveryItemEvidence(fiveItems).length, 5);
  assert.throws(
    () => validateApprovedDeliveryItemEvidence([...fiveItems, completeItem, completeItem]),
    /CANONICAL_APPROVED_DELIVERY_ITEM_COUNT_MISMATCH/u,
  );
  assert.throws(
    () => validateApprovedDeliveryItemEvidence(fiveItems.map((item, index) => (
      index === 2
        ? { ...item, acceptanceCriteria: undefined as unknown as readonly string[] }
        : item
    ))),
    /CANONICAL_APPROVED_DELIVERY_ITEM_CONTENT_INCOMPLETE/u,
  );
  assert.throws(
    () => validateApprovedDeliveryItemEvidence(fiveItems.map((item, index) => (
      index === 3
        ? { ...item, nonFunctionalRequirements: [''] }
        : item
    ))),
    /CANONICAL_APPROVED_DELIVERY_ITEM_CONTENT_INCOMPLETE/u,
  );
});

test('approved Decision Pack retains and explains frozen provisional evaluation wording', () => {
  const markdown = approvedBusinessOutputMarkdown({
    title: 'Approved AP Decision Pack',
    approvalState: 'The current case/version was independently approved.',
    contentOrigin: 'Deterministic synthetic evidence; providers OFF.',
    sections: [{
      heading: 'Frozen evaluation',
      body: [
        'Provisional | Partially Evidenced',
        'Deterministic evaluation completed; independent evidence and governance review not yet completed.',
        'Review exception. Exception: Incomplete request. Use a controlled hybrid operating model.',
        'Independent review: pending',
      ].join('\n'),
    }],
    remainingGaps: ['Case-specific business evidence remains incomplete.'],
  });
  assert.match(markdown, /approval applies to the current case\/version and completed Govern control record/u);
  assert.match(markdown, /capture does not rewrite those statements/u);
  assert.match(markdown, /Review exception/u);
  assert.match(markdown, /Incomplete request/u);
});
