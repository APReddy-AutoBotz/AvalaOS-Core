import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/docs/StudioArtifactRenditions.tsx', 'utf8');
for (const token of [
  'Private governed renditions',
  'Not generated',
  'Generation requested',
  'Rendering',
  'Uploading',
  'Generation reconciliation required',
  'Reconciling generation',
  'Generation failed',
  'Available',
  'Download unavailable',
  'Indefinite retention',
  'Legal hold',
  'Deletion requested — approval pending',
  'Deleting',
  'Deletion reconciliation required',
  'Reconciling deletion',
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
  'Pending availability snapshot',
  'activeHolds',
  'holdId: hold.holdId',
  'Place another legal hold',
  'committed_reconciliation_pending',
  'external effect is unconfirmed',
  'Request deletion again',
  'immutable deleted tombstone',
  'new approved artifact version',
  "'deletion_reconciliation_required'",
  "'deletion_reconciling'",
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
  source.includes("result.outcome === 'committed_reconciliation_pending'") &&
    source.includes("result.outcome === 'rendition_failed'") &&
    source.includes("result.outcome === 'deletion_failed'"),
  'external-side-effect failure must remain truthful',
);
assert.match(
  source,
  /legalHoldPlacementBlockedStates[\s\S]+?'deleting'[\s\S]+?'deletion_reconciliation_required'[\s\S]+?'deletion_reconciling'[\s\S]+?'deleted'[\s\S]+?!legalHoldPlacementBlockedStates\.has\(rendition\.state\)/u,
  'legal-hold placement must be hidden during deletion execution and recovery',
);
console.log(
  'studio artifact renditions UI: 45 state, capability, recovery, broker, and false-success assertions passed',
);
