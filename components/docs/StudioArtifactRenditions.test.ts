import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/docs/StudioArtifactRenditions.tsx', 'utf8');
for (const token of [
  'Private governed renditions',
  'Not generated',
  'Generating',
  'Generation failed',
  'Available',
  'Download unavailable',
  'Indefinite retention',
  'Legal hold',
  'Deletion requested · approval pending',
  'Deleting',
  'Deleted',
  'Deletion failed',
  'Authorization is stale or revoked',
  'Version conflict',
  'Read-only maintenance',
  'Offline',
  'committed_reload_failed',
  'requesterIsCurrentActor',
  'studio.artifacts.rendition.generate',
  'studio.artifacts.download',
  'studio.artifacts.retention.manage',
  'studio.artifacts.legal_hold.manage',
  'studio.artifacts.delete.request',
  'studio.artifacts.delete.approve',
  'downloadStudioPrivateArtifact',
  'Current committed private rendition state loaded.',
  'Legacy document cards remain non-canonical.',
]) {
  assert.ok(source.includes(token), `private rendition UI contract missing: ${token}`);
}
for (const forbidden of [
  'storage.from(',
  'createSignedUrl',
  'getPublicUrl',
  'service_role',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
  'objectKey',
  'bucketName',
]) {
  assert.ok(!source.includes(forbidden), `private rendition UI exposes forbidden authority: ${forbidden}`);
}
assert.ok(
  source.includes("rendition.state !== 'available'"),
  'download must require committed available state',
);
assert.ok(
  source.includes("result.outcome === 'rendition_failed'") &&
    source.includes("result.outcome === 'deletion_failed'"),
  'external-side-effect failure must remain truthful',
);
console.log(
  'studio artifact renditions UI: 37 state, capability, broker, and false-success assertions passed',
);
