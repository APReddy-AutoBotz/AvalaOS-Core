import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = {
  harness: 'tests/browser/authenticatedLifecycleHarness.ts',
  aggregate: 'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts',
  scenarios: 'tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts',
  persona: 'tests/browser/enterpriseLifecycleAcceptance/studioHandoffPersonaContract.spec.ts',
  center: 'components/docs/StudioHandoffCenter.tsx',
};

const sources = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => (
  [key, await readFile(file, 'utf8')]
))));

test('eligible Request remains a dedicated unbound API and persisted actions require an exact target', () => {
  assert.match(sources.harness, /authenticatedLifecycleOpenEligibleStudioHandoffRequest/u);
  assert.match(sources.harness, /authenticatedLifecycleOpenPersistedStudioHandoffDecision/u);
  assert.match(sources.harness, /data-handoff-id=.*data-handoff-version=/u);
  assert.match(sources.harness, /target\.handoffVersion !== prior\.handoffVersion \+ 1/u);
  assert.match(sources.harness, /request\.expectedAggregateVersion === validatedTarget\.handoffVersion/u);
  assert.match(sources.harness, /request\.payload\?\.handoffId === validatedTarget\.handoffId/u);
  assert.match(sources.harness, /request\.payload\?\.handoffVersion === validatedTarget\.handoffVersion/u);
  assert.doesNotMatch(sources.harness, /export const authenticatedLifecycleOpenStudioHandoffDecision/u);
  assert.doesNotMatch(sources.harness, /export const authenticatedLifecycleCommitStudioHandoffAction/u);

  const eligibleStart = sources.harness.indexOf('export const authenticatedLifecycleOpenEligibleStudioHandoffRequest');
  const eligibleEnd = sources.harness.indexOf('export const authenticatedLifecycleCommitEligibleStudioHandoffRequest');
  assert.ok(eligibleStart >= 0 && eligibleEnd > eligibleStart);
  const eligibleBody = sources.harness.slice(eligibleStart, eligibleEnd);
  assert.match(eligibleBody, /Request handoff/u);
  assert.doesNotMatch(eligibleBody, /Approve review|Final accept|Final reject|Start Studio draft|Withdraw/u);
});

test('every persisted acceptance caller chains the validated response target', () => {
  for (const key of ['aggregate', 'scenarios', 'persona']) {
    const source = sources[key];
    assert.match(source, /persistedHandoffTargetFromResponse/u, key);
    assert.match(source, /authenticatedLifecycleCommitPersistedStudioHandoffAction/u, key);
    assert.doesNotMatch(source, /authenticatedLifecycle(?:Open|Commit)StudioHandoff/u, key);
  }
  assert.match(sources.center, /data-handoff-version=\{item\.version\?\?undefined\}/u);
});
