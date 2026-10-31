import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const journey = fs.readFileSync(
  'tests/browser/enterpriseLifecycleAcceptance/studioDeliveryMonitorJourney.ts', 'utf8',
);
const aggregate = fs.readFileSync(
  'tests/browser/enterpriseLifecycleAcceptance/enterpriseLifecycleAcceptance.spec.ts', 'utf8',
);
const scenarios = fs.readFileSync(
  'tests/browser/enterpriseLifecycleAcceptance/assessmentScenarioJourneys.ts', 'utf8',
);

test('every downstream actor switch joins the hosted actor-transition evidence boundary', () => {
  assert.match(journey, /settleActorTransitionEvidence: \(\) => Promise<void>/u);
  assert.match(journey, /beforeIntentionalNavigation: \(\) => Promise<void>/u);
  assert.doesNotMatch(journey, /beforeIntentionalNavigation\?:/u);
  const calls = [...journey.matchAll(
    /await enterAs\(page,\s*setup\.actors\.(approver|reviewer|outsider),\s*settleActorTransitionEvidence\);/gu,
  )].map(match => match[1]);
  assert.deepEqual(calls, ['approver', 'reviewer', 'approver', 'outsider', 'approver']);
  const directEntries = [...journey.matchAll(/await enterAs\(page,[^;\r\n]+\);/gu)].map(match => match[0]);
  assert.equal(directEntries.length, 5);
  assert.equal(directEntries.every(call => call.includes('settleActorTransitionEvidence')), true);
  const invocation = aggregate.slice(
    aggregate.indexOf('const result = await runStudioDeliveryMonitorJourney({'),
    aggregate.indexOf('const downstreamCases =', aggregate.indexOf('const result = await runStudioDeliveryMonitorJourney({')),
  );
  assert.match(invocation, /enterAs,\s*settleActorTransitionEvidence,/u);
});

test('assessment scenario actor switches require and join the same evidence boundary', () => {
  assert.match(scenarios,
    /runAssessmentScenarioJourneys = async \(page: Page, project: string,\s*settleActorTransitionEvidence: \(\) => Promise<void>,/u);
  assert.match(scenarios,
    /await enterAs\(page, actor, settleActorTransitionEvidence\);/u);
  assert.match(scenarios,
    /await enterAs\(page, setup\.actors\.approver, settleActorTransitionEvidence\);/u);
  const studioActors = [...scenarios.matchAll(
    /await enterStudioAs\(page, setup\.actors\.(approver|reviewer|author), settleActorTransitionEvidence\);/gu,
  )].map(match => match[1]);
  assert.deepEqual(studioActors,
    ['approver', 'reviewer', 'author', 'approver', 'author', 'reviewer', 'author']);
  const directEntries = [...scenarios.matchAll(/await (?:enterAs|enterStudioAs)\(page,[^;\r\n]+\);/gu)]
    .map(match => match[0]);
  assert.equal(directEntries.length, 9);
  assert.equal(directEntries.every(call => call.includes('settleActorTransitionEvidence')), true);
  const processEntries = [...scenarios.matchAll(/await enterProcessAs\([^;]+\);/gu)].map(match => match[0]);
  assert.equal(processEntries.length, 3);
  assert.equal(processEntries.every(call => call.includes('settleActorTransitionEvidence')), true);
  const invocation = aggregate.slice(
    aggregate.indexOf('const scenarioCases = await runAssessmentScenarioJourneys('),
    aggregate.indexOf('authenticatedCases.push(',
      aggregate.indexOf('const scenarioCases = await runAssessmentScenarioJourneys(')),
  );
  assert.match(invocation, /testInfo\.project\.name,\s*settleActorTransitionEvidence,/u);
});

test('focused Chromium regression retains the raw red control and corrected fail-closed boundaries', () => {
  const regression = fs.readFileSync(
    'tests/browser/enterpriseLifecycleAcceptance/downstreamActorTransition.spec.ts', 'utf8',
  );
  assert.match(regression, /raw downstream actor entry crosses an actual pending tracked action/u);
  assert.match(regression, /settled downstream actor entry joins the actual request admission/u);
  assert.match(regression, /AuthenticatedHostedBrowserActionTracker/u);
  assert.match(regression, /installAuthenticatedHostedNetwork/u);
  assert.match(regression, /const activeTrackedActionIds = new Set<string>\(\)/u);
  assert.match(regression, /pendingTrackedActionStarts \+ activeTrackedActionIds\.size/u);
  const trackedBoundary = regression.slice(
    regression.indexOf('const installTrackedBoundary ='), regression.indexOf('test.beforeEach('),
  );
  assert.doesNotMatch(trackedBoundary, /waitForNextObservation:/u);
  assert.match(regression, /authenticatedLifecycleSettleActorNavigationBoundary/u);
  assert.match(regression, /rejected owned-evidence drain prevents navigation and session replacement/u);
  assert.match(regression, /raw-crossed-action/u);
  assert.match(regression, /settled-action/u);
  assert.match(regression, /expect\(cleanup\.map\(result => result\.status\)\)\.toEqual\(\['fulfilled', 'fulfilled'\]\)/u);
  assert.match(regression, /LOCAL_OWNED_EVIDENCE_DRAIN_FAILED/u);
});
