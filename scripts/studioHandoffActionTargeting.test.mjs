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

test('Studio generation binds the consuming approver and preserves independent review and final approval', () => {
  const source = sources.aggregate;
  const at = text => {
    const index = source.indexOf(text);
    assert.ok(index >= 0, `missing journey boundary: ${text}`);
    return index;
  };
  const actorBefore = index => [...source.slice(0, index).matchAll(
    /await enterStudioAs\(page, setup\.actors\.(\w+), settleActorTransitionEvidence\);/gu,
  )].at(-1)?.[1];
  const consume = at("'hosted:govern-studio:source-consume'");
  const finalAccept = at("'hosted:govern-studio:studio-final-accept'");
  const checkpoint = at('    if (governStudioDiagnostic) {');
  const workspace = at("    const studioWorkspace = page.getByTestId('studio-artifact-workspace');");
  const success = at('    const hostedSuccessRoute =');
  const routeEnd = at('    if (hostedAuthenticatedAcceptance) await page.route');
  const generation = source.indexOf('generationApi = await observeApiResponse', routeEnd);
  const submit = at("name: 'Submit for review'");
  const review = at("name: 'Approve review'");
  const approve = at("name: 'Final approve'");
  const failure = at('      const hostedFailureRoute =');
  assert.ok(consume < checkpoint && checkpoint < workspace && workspace < success
    && success < routeEnd && routeEnd < generation && generation < submit
    && submit < review && review < approve && approve < failure);
  const diagnostic = source.slice(checkpoint, workspace);
  assert.match(diagnostic, /await settleCheckpointBoundary\(/u);
  assert.match(diagnostic, /return;\s*\}\s*$/u);
  assert.doesNotMatch(diagnostic, /arm-browser-fault/u);
  for (const boundary of [consume, success, generation, submit]) {
    assert.equal(actorBefore(boundary), 'approver');
  }
  const approvedToConsume = source.slice(finalAccept, consume);
  assert.match(approvedToConsume, /persistedHandoffTargetFromResponse\([\s\S]*'approved'/u);
  assert.doesNotMatch(approvedToConsume, /enterStudioAs\(/u,
    'the same approver must consume the committed ready projection without remounting Studio');
  assert.match(source.slice(consume, checkpoint), /consumeApprovedStudioHandoff\(page, acceptedHandoffTarget\)/u);
  const successRoute = source.slice(success, routeEnd);
  assert.match(successRoute, /persona: 'approver'/u);
  assert.match(successRoute, /kind: 'studio_deterministic_success'/u);
  assert.match(successRoute, /accessToken: \(headers\.authorization \?\? ''\)\.replace/u);
  assert.equal(actorBefore(review), 'reviewer');
  assert.equal(actorBefore(approve), 'author');
  assert.equal(actorBefore(failure), 'author');
  const failureRoute = source.slice(failure, at('      let failedGenerationApi:'));
  assert.match(failureRoute, /persona: 'author'/u);
  assert.match(failureRoute, /kind: 'studio_failure_after_claim'/u);
});

test('all lifecycle template selections bind the protected setup version without ordinal fallback', () => {
  for (const key of ['aggregate', 'scenarios']) {
    const source = sources[key];
    assert.match(source, /authenticatedLifecycleSelectExactStudioTemplate as selectExactStudioTemplate/u, key);
    assert.doesNotMatch(source, /template\.selectOption\(\{ index:/u, key);
    assert.doesNotMatch(source, /template\.locator\('option'\)\)\.toHaveCount\(2\)/u, key);
  }
  assert.equal((sources.aggregate.match(/await selectExactStudioTemplate\(/gu) ?? []).length, 2);
  assert.equal((sources.scenarios.match(/await selectExactStudioTemplate\(/gu) ?? []).length, 1);
  assert.match(sources.aggregate, /selectExactStudioTemplate\(template, setup\.studioTemplate\)/u);
  assert.match(sources.scenarios, /selectExactStudioTemplate\(template, setup\.studioTemplate\)/u);
  const beforeFailure = sources.aggregate.indexOf('const beforeFailure =');
  const failureRoute = sources.aggregate.indexOf('const hostedFailureRoute =', beforeFailure);
  assert.ok(beforeFailure >= 0 && failureRoute > beforeFailure);
  assert.match(sources.aggregate.slice(beforeFailure, failureRoute), /selectExactStudioTemplate\([\s\S]*setup\.studioTemplate/u);
});
