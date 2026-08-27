import assert from 'node:assert/strict';
import {
  frameTranscriptSourceSetManifest,
  validateTranscriptSourceSetSelection,
  type ServerTranscriptSourceBinding,
} from './sourceSets';

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000004',
];

const binding = (index: number): ServerTranscriptSourceBinding => ({
  sourceId: ids[index * 2],
  sourceVersionId: ids[index * 2 + 1],
  contentHash: String(index + 1).repeat(64),
  extractedTextHash: String(index + 5).repeat(64),
  extractedCharacterCount: 125,
  role: index === 0 ? 'primary' : 'supporting',
  ordinal: index + 1,
  state: 'ready',
});

const one = frameTranscriptSourceSetManifest([binding(0)]);
assert.equal(one.sourceCount, 1);
assert.equal(one.extractedCharacterCount, 125);
assert.match(one.framedManifest, /^32:transcript-source-set-manifest-1\|/);

const ordered = frameTranscriptSourceSetManifest([binding(0), binding(1)]);
const reordered = frameTranscriptSourceSetManifest([
  { ...binding(1), ordinal: 1 },
  { ...binding(0), ordinal: 2 },
]);
assert.notEqual(ordered.framedManifest, reordered.framedManifest);

assert.throws(
  () => frameTranscriptSourceSetManifest([binding(0), { ...binding(0), ordinal: 2 }]),
  /TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION/,
);
assert.throws(
  () => frameTranscriptSourceSetManifest([{ ...binding(0), state: 'failed' }]),
  /TRANSCRIPT_SOURCE_SET_MEMBER_NOT_READY/,
);
assert.throws(
  () => frameTranscriptSourceSetManifest([{ ...binding(0), extractedCharacterCount: 2_000_001 }]),
  /TRANSCRIPT_SOURCE_SET_CHARACTER_LIMIT/,
);
assert.throws(() => frameTranscriptSourceSetManifest([]), /TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), ordinal: 2 }]), /TRANSCRIPT_SOURCE_SET_ORDINAL_INVALID/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), role: 'invalid' as never }]), /TRANSCRIPT_SOURCE_ROLE_INVALID/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), sourceId: 'not-a-uuid' }]), /TRANSCRIPT_SOURCE_SELECTOR_INVALID/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), contentHash: 'not-a-hash' }]), /TRANSCRIPT_SOURCE_HASH_INVALID/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), extractedCharacterCount: 1.5 }]), /TRANSCRIPT_SOURCE_CHARACTER_COUNT_INVALID/);
assert.throws(() => frameTranscriptSourceSetManifest([{ ...binding(0), note: 'x'.repeat(501) }]), /TRANSCRIPT_SOURCE_NOTE_LIMIT/);

assert.deepEqual(validateTranscriptSourceSetSelection([
  { sourceId: ids[0], versionSelector: ids[1], role: 'primary' },
  { sourceId: ids[2], versionSelector: ids[3], role: 'contradictory', note: 'Conflicts with the opening statement' },
]), [
  { sourceId: ids[0], versionSelector: ids[1], role: 'primary', ordinal: 1 },
  { sourceId: ids[2], versionSelector: ids[3], role: 'contradictory', ordinal: 2, note: 'Conflicts with the opening statement' },
]);
assert.throws(() => validateTranscriptSourceSetSelection([]), /TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT/);
assert.throws(() => validateTranscriptSourceSetSelection([
  { sourceId: ids[0], versionSelector: ids[1], role: 'primary' },
  { sourceId: ids[2], versionSelector: ids[1], role: 'supporting' },
]), /TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION/);
assert.throws(() => validateTranscriptSourceSetSelection([
  { sourceId: ids[0], versionSelector: ids[1], role: 'invalid' as never },
]), /TRANSCRIPT_SOURCE_ROLE_INVALID/);
assert.throws(() => validateTranscriptSourceSetSelection([
  { sourceId: ids[0], versionSelector: ids[1], role: 'primary', note: 'x'.repeat(501) },
]), /TRANSCRIPT_SOURCE_NOTE_LIMIT/);

console.log('Transcript source-set domain tests passed.');
