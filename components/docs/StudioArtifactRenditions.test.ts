import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/docs/StudioArtifactRenditions.tsx', 'utf8');
const browserSource = readFileSync('tests/browser/studioPrivateArtifacts.spec.ts', 'utf8');
const cssSource = readFileSync('index.css', 'utf8');

const assertGhostTransitionContract = (candidate: string) => {
  const ghostRule = candidate.match(/\.btn-ghost\s*\{([^}]+)\}/u)?.[1] ?? '';
  assert.ok(ghostRule, 'btn-ghost CSS rule must remain source inspectable');
  const transitionValue = ghostRule.match(/transition\s*:\s*([^;]+);/u)?.[1] ?? '';
  const transitions = transitionValue
    .split(',')
    .map(value => value.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  assert.deepEqual(
    transitions,
    [
      'background-color 180ms ease',
      'border-color 180ms ease',
      'color 180ms ease',
    ],
    'btn-ghost may animate only its three visual color properties',
  );
  assert.equal(transitions.some(value => /(?:^|\s)(?:all|opacity)(?:\s|$)/u.test(value)), false,
    'btn-ghost must never transition disabled-state opacity');
};

assertGhostTransitionContract(cssSource);
const replaceGhostTransition = (replacement: string) => cssSource.replace(
  /(\.btn-ghost\s*\{[^}]*?)transition:\s*background-color 180ms ease,\s*border-color 180ms ease,\s*color 180ms ease;([^}]*\})/u,
  (_match, before, after) => `${before}${replacement}${after}`,
);
const transitionMutants = [
  replaceGhostTransition('transition: all 180ms ease;'),
  replaceGhostTransition(
    'transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, opacity 180ms ease;',
  ),
  replaceGhostTransition(
    'transition: background-color 180ms ease, color 180ms ease;',
  ),
];
for (const mutant of transitionMutants) {
  assert.notEqual(mutant, cssSource, 'each transition negative must mutate the actual source');
  assert.throws(() => assertGhostTransitionContract(mutant),
    'transition broadening, opacity animation, and required-property omission must fail closed');
}

for (const token of [
  'gateFirstPrivateProjection',
  'firstPrivateProjectionStarted',
  'MutationObserver',
  "getByRole('button', { name: 'Download unavailable' })",
  "getByRole('button', { name: 'Download Markdown' })",
  'animation.transitionProperty === \'opacity\'',
  "expect(disabledStyle.opacity).toBe('0.5')",
  "expect(enabledStyle.immediateOpacity).toBe('1')",
  "expect(enabledStyle.firstFrameOpacity).toBe('1')",
  'immediateOpacityTransitions',
  'firstFrameOpacityTransitions',
  "not.toContain('all')",
  "not.toContain('opacity')",
]) {
  assert.ok(browserSource.includes(token), `private rendition transition regression missing: ${token}`);
}
for (const forbidden of ['page.waitForTimeout(', 'page.emulateMedia(', 'page.addStyleTag(']) {
  assert.ok(!browserSource.includes(forbidden), `private rendition regression weakens real timing: ${forbidden}`);
}
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
  'deletion_reconciliation_required',
  'deletion_reconciling',
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
  /canonicalRenditionMutationStates[\s\S]+?'available'[\s\S]+?'deletion_requested'[\s\S]+?'deletion_failed'[\s\S]+?canonicalRenditionMutationStates\.has\(rendition\.state\)/u,
  'canonical rendition mutations must use the exact server-supported state allowlist',
);
assert.equal(
  source.match(/\{rendition && canonicalMutationAllowed && \(/gu)?.length,
  2,
  'legal-hold placement and retention extension must share the canonical allowlist',
);
console.log(
  'studio artifact renditions UI: 46 state, capability, recovery, broker, and false-success assertions passed',
);
