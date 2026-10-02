import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/enterprise/AssessTranscriptCandidateReview.tsx', 'utf8');

test('legacy candidate apply is limited to exact safe scalar and evidence targets', () => {
  assert.match(source, /candidate\.applicationIntent === 'link_evidence_only' && candidate\.applyTarget === 'evidence'/);
  assert.match(source, /candidate\.applicationIntent === 'set_case_field'/);
  assert.match(source, /\['name', 'description'\]\.includes/);
  assert.doesNotMatch(source, /candidate\.applyTarget \|\| 'evidence'/);
  assert.doesNotMatch(source, /evidence\.unresolved/);
});

test('legacy review no longer exposes internal apply targets as user-authored text', () => {
  assert.doesNotMatch(source, /Allowlisted target/);
  assert.doesNotMatch(source, /onChange=\{event => setSelections\(current => \(\{ \.\.\.current, \[candidate\.id\]: \{ \.\.\.selection, target:/);
  assert.match(source, /friendlyApplyTarget\(selection\.target\)/);
  assert.match(source, /friendlyApplyTarget\(change\.target\)/);
  assert.match(source, /structural or fact-write candidate is retained as review history but cannot be selected/);
  assert.match(source, /Use supporting documents in Assess for typed field mapping/);
  assert.match(source, /!safeLegacyPreview/);
  assert.match(source, /target === 'name'\) return 'Case name'/);
  assert.match(source, /target === 'description'\) return 'Case description'/);
});
