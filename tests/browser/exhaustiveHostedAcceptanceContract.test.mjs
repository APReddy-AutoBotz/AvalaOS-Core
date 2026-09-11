import assert from 'node:assert/strict';
import fs from 'node:fs';

const hostedSpec = fs.readFileSync(new URL('./exhaustiveHostedAcceptance.spec.ts', import.meta.url), 'utf8');
const indexCss = fs.readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
const executionProfileSource = fs.readFileSync(new URL('../../scripts/acceptanceExecutionProfile.mjs', import.meta.url), 'utf8');
const localSandboxConfig = fs.readFileSync(new URL('../../playwright.local-sandbox-regression.config.ts', import.meta.url), 'utf8');
const localNavigationConfig = fs.readFileSync(new URL('../../playwright.local-navigation-regression.config.ts', import.meta.url), 'utf8');
const executionBindings = JSON.parse(fs.readFileSync(new URL('../acceptance/execution-bindings.json', import.meta.url), 'utf8'));
const observerSource = fs.readFileSync(new URL('./authorityRequestObserver.ts', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const customDashboardSource = fs.readFileSync(new URL('../../components/shared/CustomDashboardView.tsx', import.meta.url), 'utf8');
const adminWorkbenchSource = fs.readFileSync(new URL('../../components/admin/AdminWorkbench.tsx', import.meta.url), 'utf8');
const taskCardSource = fs.readFileSync(new URL('../../components/delivery/TaskCard.tsx', import.meta.url), 'utf8');
const taskListSource = fs.readFileSync(new URL('../../components/delivery/TaskListView.tsx', import.meta.url), 'utf8');
const boardsSource = fs.readFileSync(new URL('../../components/delivery/BoardsView.tsx', import.meta.url), 'utf8');
const processCatalogSource = fs.readFileSync(new URL('../../components/assess/ProcessCatalogView.tsx', import.meta.url), 'utf8');
const processModal = fs.readFileSync(new URL('../../components/assess/ProcessCreationModal.tsx', import.meta.url), 'utf8');
const sidebarSource = fs.readFileSync(new URL('../../components/shared/Sidebar.tsx', import.meta.url), 'utf8');

const fieldAssociations = [
  ['process-name', 'input'],
  ['process-description', 'textarea'],
  ['process-department', 'input'],
  ['process-criticality', 'select'],
];

const executableProjectCases = executionBindings.hostedTests
  .filter(binding => binding.scenario)
  .reduce((count, binding) => count + binding.projects.length, 0);
const catalogUnboundProjectCases = executionBindings.hostedTests
  .filter(binding => !binding.scenario)
  .reduce((count, binding) => count + binding.projects.length, 0);
assert.equal(executableProjectCases, 38, 'local Sandbox regression must execute all 38 scenario-bound project cases');
assert.equal(catalogUnboundProjectCases, 30, 'the 30 catalog-unbound project cases must remain explicit not_run skips');
assert.match(hostedSpec, /decodeAcceptanceExecutionProfile\(process\.env/u, 'the shared Sandbox spec must require an explicit execution profile');
assert.match(hostedSpec, /createFullPageContrastAttachment,[\s\S]*decodeAcceptanceExecutionProfile,[\s\S]*summarizeFullPageColorContrast,[\s\S]*from '\.\.\/\.\.\/scripts\/acceptanceExecutionProfile\.mjs'/u, 'full-page browser evidence must use the shared summary and attachment contract');
assert.match(executionProfileSource, /export\s+(?:const|function)\s+summarizeFullPageColorContrast\b/u, 'the execution-profile boundary must export the shared full-page contrast classifier');
assert.match(executionProfileSource, /export\s+(?:const|function)\s+createFullPageContrastAttachment\b/u, 'the execution-profile boundary must export the shared full-page contrast attachment builder');
assert.match(hostedSpec, /\[SYNTHETIC-REGRESSION:\$\{binding\.testId\}\]/u, 'local results must carry distinct synthetic-regression Test-ID titles');
assert.match(hostedSpec, /test\.skip\(!binding\.scenario/u, 'catalog-unbound cases must remain skipped rather than synthesized as passes');
assert.match(executionProfileSource, /LOCAL_SOURCE_FIXTURE_DEPLOY_ID_REJECTED/u, 'local execution must reject a Netlify deploy identity');
assert.match(executionProfileSource, /target\.protocol !== 'http:' \|\| target\.hostname !== '127\.0\.0\.1'/u, 'local execution must bind only exact IPv4 loopback');
assert.match(executionProfileSource, /HOSTED_PREVIEW_NON_LOOPBACK_HTTPS_REQUIRED/u, 'hosted execution must reject loopback origins');
for (const [config, expectedPath] of [
  [localSandboxConfig, 'output/playwright/pr264-synthetic-regression'],
  [localNavigationConfig, 'output/playwright/pr264-synthetic-regression'],
]) {
  assert.match(config, /executionKind !== 'local_source_fixture'/u, 'local Playwright config must fail closed on the execution kind');
  assert.ok(config.includes(expectedPath), 'local Playwright evidence must use its dedicated synthetic-regression artifact tree');
  assert.match(config, /metadata,/u, 'local Playwright report must retain its exact execution metadata');
}

for (const [id, control] of fieldAssociations) {
  assert.match(processModal, new RegExp(`<label\\s+htmlFor="${id}"`, 'u'), `${id} must have an associated visible label`);
  assert.match(processModal, new RegExp(`<${control}\\s+id="${id}"`, 'u'), `${id} label must target its rendered control`);
}

assert.match(
  hostedSpec,
  /getByLabel\('Assessed Criticality'\)\.selectOption\('High'\)/u,
  'hosted process creation must exercise the criticality control through its accessible label',
);
assert.equal(
  hostedSpec.includes("getByTestId('enterprise-intelligence-view')"),
  false,
  'hosted acceptance must not depend on the removed Enterprise Intelligence test id',
);
assert.match(
  hostedSpec,
  /const ENTERPRISE_INTELLIGENCE_SANDBOX_BOUNDARY = 'Enterprise Intelligence requires a server-authorized workspace\. The local synthetic sandbox sends no provider or persistence requests\.';/u,
  'hosted sandbox acceptance must bind to the exact no-provider/no-persistence authority explanation',
);
assert.match(
  hostedSpec,
  /const assertEnterpriseIntelligenceSandboxBoundary = async \(page: Page\) => \{[\s\S]*Enterprise Intelligence unavailable[\s\S]*getByText\(ENTERPRISE_INTELLIGENCE_SANDBOX_BOUNDARY, \{ exact: true \}\)[\s\S]*getByTestId\('enterprise-intelligence-workspace'\)\)\.toHaveCount\(0\)/u,
  'hosted sandbox acceptance must prove the unavailable surface, exact boundary copy, and absence of a server-authorized workspace',
);
assert.equal(
  hostedSpec.includes("getByRole('heading', { name: 'Enterprise Intelligence', exact: true })"),
  false,
  'hosted sandbox acceptance must not accept an authorized Enterprise Intelligence workspace',
);
assert.ok(
  hostedSpec.match(/await assertEnterpriseIntelligenceSandboxBoundary\(page\);/gu)?.length >= 3,
  'every hosted Platform Admin path must assert the same fail-closed sandbox boundary',
);
assert.ok(
  hostedSpec.match(/getByRole\('heading', \{ name: 'AP Invoice Exception Workflow Governed Delivery Pack', exact: true \}\)/gu)?.length >= 3,
  'Delivery Pack acceptance must target the actual project-qualified semantic heading',
);
assert.equal(
  hostedSpec.includes("getByText('Governed Delivery Pack')"),
  false,
  'Delivery Pack acceptance must not regress to the ambiguous badge/text locator',
);
assert.equal(
  hostedSpec.includes("getByRole('heading', { name: 'Governed Delivery Pack', exact: true })"),
  false,
  'Delivery Pack acceptance must not regress to the incorrect short heading',
);
assert.match(
  hostedSpec,
  /urlProjectId: CANONICAL_AP_PROJECT_ID,[\s\S]*persistedProjectId: CANONICAL_AP_PROJECT_ID,[\s\S]*persistedProjectName: CANONICAL_AP_WORKFLOW_NAME,[\s\S]*projectRepresentationsConverged: true,/u,
  'SAFETY-004 must require the exact canonical URL and persisted project identities to converge',
);
assert.match(
  hostedSpec,
  /invalidPersistedScopes = \[[\s\S]*stale-different-project[\s\S]*null,[\s\S]*'\{malformed'[\s\S]*reloadWithPersistedScopeAtDocumentStart\(page, invalidScope\)/u,
  'SAFETY-004 must retain stale, missing, and malformed persisted projects through reconstruction',
);
assert.match(
  hostedSpec,
  /reloadWithPersistedScopeAtDocumentStart[\s\S]*page\.addInitScript[\s\S]*sessionStorage\.getItem\(marker\) !== 'armed'[\s\S]*localStorage\.(?:removeItem|setItem)[\s\S]*page\.reload[\s\S]*the adversarial persisted scope mutation must execute before application startup/u,
  'SAFETY-004 must inject corrupt persisted scope at document start and prove the mutation ran before application startup',
);
assert.ok(
  hostedSpec.match(/\.toEqual\(canonicalDeliveryPackNavigation\)/gu)?.length >= 3,
  'SAFETY-004 must prove exact identity before invalid reconstruction, after setup restoration, and after reload',
);
assert.match(hostedSpec, /not\.toHaveURL\(\/projectId=/u, 'invalid persisted scope must remove URL-only project evidence');
assert.match(
  hostedSpec,
  /canonicalBoardsNavigation[\s\S]*invalidBoardsResponse = await reloadWithPersistedScopeAtDocumentStart\(page, JSON\.stringify\(\{[\s\S]*stale-different-project[\s\S]*not\.toHaveURL\(\/projectId=/u,
  'SAFETY-004 must enforce exact persisted project agreement on the canonical Boards destination through reload',
);

const allowlistBody = hostedSpec.match(/const safeExternalStaticResource = \(url: URL, resourceType: string\): boolean => \{([\s\S]*?)\n\};/u);
assert.ok(allowlistBody, 'safeExternalStaticResource must remain structurally inspectable');
const allowedOrigins = [...allowlistBody[1].matchAll(/url\.origin === '([^']+)'/gu)].map(([, origin]) => origin);
assert.deepEqual(
  allowedOrigins,
  [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://aistudiocdn.com',
  ],
  'diagnostic changes must not broaden the explicit external static-resource allowlist',
);

assert.match(hostedSpec, /const createDiagnosticOriginClassifier = \(\) => \{/u, 'network diagnostics must use an opaque origin classifier');
assert.match(hostedSpec, /const externalOriginClasses = new Map<string, string>\(\);/u, 'raw origins may only be grouped in ephemeral in-memory state');
assert.match(hostedSpec, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/u, 'diagnostics must reject non-HTTP(S) schemes');
assert.match(hostedSpec, /return UNAVAILABLE_NETWORK_ORIGIN_CLASS;/u, 'malformed or non-HTTP(S) URLs must collapse to a fixed sentinel');
assert.match(hostedSpec, /return HOSTED_NETWORK_ORIGIN_CLASS;/u, 'same-origin violations must use a fixed hosted-origin class');
assert.match(hostedSpec, /const originClass = `external-origin-\$\{externalOriginClasses\.size \+ 1\}`;/u, 'unexpected external origins must receive opaque per-observer labels');
assert.match(hostedSpec, /externalOriginClasses\.set\(url\.origin, originClass\);/u, 'origin-to-label mapping must stay inside ephemeral classifier state');
assert.doesNotMatch(hostedSpec, /return url\.origin;/u, 'literal origins must never be returned into retained diagnostic evidence');
assert.doesNotMatch(hostedSpec, /\.(?:search|hash|username|password)\b/u, 'diagnostics must not retain query, fragment, or userinfo fields');

const sampleBody = hostedSpec.match(/sample: \(request, category\) => \(\{([\s\S]*?)\}\),/u);
assert.ok(sampleBody, 'violation sample construction must remain structurally inspectable');
assert.match(sampleBody[1], /method: request\.method\(\)\.toUpperCase\(\)/u, 'violation evidence may retain only normalized method metadata');
assert.match(sampleBody[1], /category: category as NetworkViolationCategory,/u, 'violation evidence must retain the fail-closed category');
assert.match(sampleBody[1], /resourceType: request\.resourceType\(\)/u, 'violation evidence may retain the non-sensitive Playwright resource type');
assert.match(sampleBody[1], /originClass: classifyDiagnosticOrigin\(request\.url\(\)\)/u, 'violation evidence must retain only the opaque origin class');
assert.doesNotMatch(sampleBody[1], /\borigin\s*:/u, 'violation evidence must never retain a literal origin field');
assert.doesNotMatch(sampleBody[1], /request\.headers|request\.postData/u, 'violation evidence must never retain headers or request bodies');
assert.match(observerSource, /page\.on\('request',inspect\)/u, 'the observer must attach before the bounded workflow');
assert.match(observerSource, /samples\.length<maxSamples/u, 'retained violation samples must remain bounded');
assert.match(observerSource, /const stopAfterQuiescence=async\(\{quietPeriodMs,timeoutMs\}:QuiescenceOptions\)=>/u, 'the observer must expose a bounded asynchronous quiescence boundary');
assert.match(observerSource, /requestSequence\+=1;[\s\S]*lastRequestAt=now\(\);/u, 'every request, including allowed resources, must restart quiescence');
assert.match(observerSource, /const startedAt=now\(\);[\s\S]*lastRequestAt=Math\.max\(lastRequestAt,startedAt\);/u, 'pre-sign-out quiet time must never shorten the post-sign-out observation window');
assert.match(observerSource, /if\(sequenceBeforeWait!==requestSequence\)continue;[\s\S]*stop\(\);/u, 'listener removal must follow the final synchronous request-sequence check');
assert.doesNotMatch(hostedSpec, /observer\.stop\(\)/u, 'hosted journeys must never detach the observer without bounded quiescence');
assert.match(
  hostedSpec,
  /runObservedPersonaJourney[\s\S]*enterPersona\(page, label\)[\s\S]*assertActivePersona\(page, userName\)[\s\S]*exerciseRepresentativePersonaPath\(page, label\)[\s\S]*signOutToSandbox\(page\)[\s\S]*observer\.stopAfterQuiescence/u,
  'the observer must cover persona entry, representative feature settlement, sign-out, and post-sign-out quiescence',
);
assert.match(hostedSpec, /const settleLazyLoadedSurface = async \(page: Page\) => \{[\s\S]*requestAnimationFrame\(\(\) => requestAnimationFrame/u, 'representative lazy-loaded surfaces must settle through two rendered frames before sign-out');
assert.doesNotMatch(hostedSpec, /waitForLoadState\('networkidle'\)/u, 'hosted evidence must use semantic readiness plus bounded observer quiescence instead of an unbounded global network-idle heuristic');
for (const persona of ['Process Analyst', 'AP Process Owner', 'Delivery Lead', 'Control Reviewer', 'Automation Contributor', 'Buyer Viewer', 'Platform Admin']) {
  assert.match(hostedSpec, new RegExp(`label === '${persona.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u'), `${persona} must have an explicit representative feature-path branch`);
}
assert.match(hostedSpec, /Process Analyst'[\s\S]*AP Process Owner'[\s\S]*clickProductNav\(page, 'Assess'\)[\s\S]*process-catalog-view/u, 'Assess personas must settle the Process Catalog');
assert.match(hostedSpec, /Delivery Lead'[\s\S]*Control Reviewer'[\s\S]*Automation Contributor'[\s\S]*clickProductNav\(page, 'Delivery'\)[\s\S]*Delivery work board/u, 'Delivery personas must settle the Delivery board');
assert.match(hostedSpec, /Buyer Viewer'[\s\S]*closeProductNavigation\(page\)[\s\S]*selectMyWorkScope\(page\)[\s\S]*clickProductNav\(page, 'Monitor'\)[\s\S]*monitor-overview/u, 'Buyer Viewer must close mobile navigation, restore the required My Work scope, and settle Monitor');
assert.match(hostedSpec, /Platform Admin'[\s\S]*Admin \/ Intelligence[\s\S]*assertEnterpriseIntelligenceSandboxBoundary\(page\)/u, 'Platform Admin must settle the fail-closed Admin / Intelligence sandbox boundary');
assert.match(appSource, /<main id="app-main" tabIndex=\{0\}/u, 'the post-entry skip-link target and primary scroll region must accept sequential keyboard focus');
assert.match(hostedSpec, /isFirstSequentialTabStop[\s\S]*skip link must remain the first sequential keyboard target[\s\S]*skipLink\.focus\(\)[\s\S]*page\.keyboard\.press\('Enter'\)/u, 'every persona must prove first-tab-stop ordering and real keyboard skip-link activation');
const screenAnimationSource = indexCss.slice(indexCss.indexOf('@keyframes kp-screen-in'), indexCss.indexOf('@keyframes kp-linear-sheen'));
assert.ok(screenAnimationSource.startsWith('@keyframes kp-screen-in'), 'the screen-entry keyframe must remain source-inspectable');
assert.match(indexCss, /animation: kp-screen-in 360ms cubic-bezier\(\.2, \.8, \.2, 1\) both;/u, 'screen entry must preserve its declared duration, easing, and fill mode');
assert.match(screenAnimationSource, /from \{\s*transform: translateY\(8px\);\s*\}[\s\S]*to \{\s*transform: translateY\(0\);\s*\}/u, 'screen entry must preserve transform-only vertical motion');
assert.doesNotMatch(screenAnimationSource, /\b(?:opacity|filter)\s*:/u, 'screen entry must not reduce content contrast or visibility while focused');
assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important;/u, 'the existing reduced-motion animation duration must remain active');
assert.match(hostedSpec, /const SCREEN_ANIMATION_SAMPLE_MS = \[0, 60, 90, 117, 120, 180, 360\] as const;/u, 'SANDBOX-009 must retain all seven declared timeline samples');
assert.match(hostedSpec, /const SCREEN_ANIMATION_CONTRAST_SAMPLE_MS = new Set\(\[0, 117, 360\]\);/u, 'scoped Axe must retain the initial, known-vulnerable, and terminal timeline points');
assert.match(hostedSpec, /const READABLE_MOTION_TARGET_SELECTOR = '#app-main \[aria-label="Home attention summary"\] \.av-stat-strip:first-child \.av-eyebrow';/u, 'the strict contrast oracle must bind the reviewed real Home target');
assert.match(customDashboardSource, /<section className="grid gap-3 sm:grid-cols-3" aria-label="Home attention summary">\s*<div className="av-stat-strip"><p className="av-eyebrow">Open work<\/p>/u, 'the readable-motion target must remain real product DOM, not a test fixture');
assert.match(indexCss, /\.av-eyebrow \{[\s\S]*color: var\(--av-color-text-subtle\);[\s\S]*\}[\s\S]*\.av-stat-strip \{[\s\S]*background: var\(--av-color-surface\);/u, 'the real target must retain its subtle-token foreground and opaque stat-strip surface source');
assert.match(hostedSpec, /declaredElapsedMs \/ SCREEN_ANIMATION_DECLARED_DURATION_MS\) \* durationMs/u, 'timeline samples must normalize to the actual effective animation duration');
assert.match(hostedSpec, /assertMainScreenAnimationTimeline\(page, 'no-preference'\)[\s\S]*assertMainScreenAnimationTimeline\(page, 'reduce'\)/u, 'every persona must exercise contrast-checked normal and reduced-motion timelines');
assert.doesNotMatch(hostedSpec, /inspectContrast/u, 'timeline contrast sampling must not offer a bypass flag');
assert.match(hostedSpec, /normal-motion screen animation must retain its declared duration[\s\S]*reduced-motion screen animation must retain a positive effective duration[\s\S]*reduced-motion screen animation must use the existing near-instant rule/u, 'timeline proof must require the expected normal and reduced-motion animation durations');
assert.match(hostedSpec, /normalized animation samples must remain finite and non-negative[\s\S]*normalized animation samples must not exceed the effective duration/u, 'every normalized timeline sample must remain numerically bounded');
assert.match(hostedSpec, /state\.animationName[\s\S]*\.toBe\(SCREEN_ANIMATION_NAME\)/u, 'every timeline sample must prove it sought the expected CSS animation');
assert.match(hostedSpec, /state\.opacity[\s\S]*\.toBe\(1\)[\s\S]*state\.filter[\s\S]*\.toBe\('none'\)[\s\S]*state\.focused[\s\S]*\.toBe\(true\)/u, 'every timeline sample must keep the main opaque, unfiltered, and focused');
assert.match(hostedSpec, /const restoreState = await readMainScreenAnimationState\(page\);[\s\S]*finally \{\s*try \{\s*await page\.emulateMedia\(\{ reducedMotion: originalReducedMotion \}\);\s*\} finally \{\s*await restoreMainScreenAnimation\(page, restoreState\);/u, 'timeline proof must restore both emulated media and the original animation state even when an assertion fails');
assert.doesNotMatch(hostedSpec, /animations:\s*'disabled'/u, 'positive motion proof must not disable CSS animations');
const strictContrastOracle = hostedSpec.match(/const analyzeMainColorContrast = async \(page: Page\) => \{([\s\S]*?)\n\};/u);
assert.ok(strictContrastOracle, 'the strict readable-motion contrast oracle must remain source-inspectable');
assert.match(strictContrastOracle[1], /\.include\(READABLE_MOTION_TARGET_SELECTOR\)[\s\S]*\.withRules\(\['color-contrast'\]\)/u, 'the strict oracle must scan only the real readable-motion target');
assert.doesNotMatch(strictContrastOracle[1], /\.include\('#app-main'\)/u, 'the strict oracle must not treat legitimate full-main gradient incompletes as failures');
assert.match(hostedSpec, /contrast\.violationCount[\s\S]*\.toBe\(0\)[\s\S]*contrast\.incompleteCount[\s\S]*\.toBe\(0\)[\s\S]*contrast\.positiveNodeCount[\s\S]*\.toBe\(1\)/u, 'the strict target oracle must require zero violations, zero incomplete nodes, and exactly one real passed node');
const readableTargetGuard = hostedSpec.match(/const assertReadableMotionTarget = async \(page: Page\) => \{([\s\S]*?)\n\};/u);
assert.ok(readableTargetGuard, 'the real readable-motion target guard must remain source-inspectable');
assert.match(readableTargetGuard[1], /toHaveCount\(1\)[\s\S]*toHaveText\(READABLE_MOTION_TARGET_TEXT\)[\s\S]*toBeVisible\(\)[\s\S]*main\.contains\(element\)[\s\S]*strip\?\.matches\('\.av-stat-strip'\)[\s\S]*backgroundOpaque[\s\S]*backgroundImage[\s\S]*foregroundMatchesSubtleToken/u, 'the target guard must prove unique real DOM, rendered surface, opaque non-image background, and subtle-token foreground');
assert.doesNotMatch(readableTargetGuard[1], /createElement|innerHTML|insertAdjacent/u, 'the readable-motion target guard must not insert a contrast probe or fixture');
assert.match(hostedSpec, /case 'keyboard-a11y':[\s\S]*enterPersona\(page, label\)[\s\S]*assertActivePersona\(page, userName\)[\s\S]*activateSkipLinkWithKeyboard\(page\)[\s\S]*new AxeBuilder\(\{ page \}\)\.analyze\(\)[\s\S]*clickProductNav\(page, 'Home'\)[\s\S]*closeProductNavigation\(page\)[\s\S]*heading', \{ name: 'Home', exact: true \}\)[\s\S]*READABLE_MOTION_TARGET_SELECTOR[\s\S]*assertReadableMotionTarget\(page\)[\s\S]*activateSkipLinkWithKeyboard\(page\)[\s\S]*assertMainScreenAnimationTimeline\(page, 'no-preference'\)[\s\S]*assertMainScreenAnimationTimeline\(page, 'reduce'\)/u, 'SANDBOX-009 must preserve initial keyboard/full-page proof, then navigate to the real Home target and repeat real keyboard focus before both timelines');
assert.match(hostedSpec, /assertContrastOracleRejectsOccludedMotion[\s\S]*qa-adversarial-kp-screen-in[\s\S]*opacity: 0[\s\S]*filter: blur\(3px\)[\s\S]*invisibleContrast\.violationCount[\s\S]*\.toBe\(0\)[\s\S]*invisibleContrast\.incompleteCount[\s\S]*\.toBe\(0\)[\s\S]*invisibleContrast\.positiveNodeCount[\s\S]*\.toBe\(0\)[\s\S]*vulnerableContrast\.violationCount[\s\S]*\.toBeGreaterThan\(0\)[\s\S]*vulnerableContrast\.incompleteCount[\s\S]*\.toBe\(0\)[\s\S]*finally[\s\S]*qa-adversarial-kp-screen-in[\s\S]*the adversarial keyframe override must be absent[\s\S]*assertMainScreenAnimationTimeline\(page, 'no-preference'\)/u, 'the once-per-project negative self-test must reject old occluding motion at 0/90ms, prove cleanup, and reverify production motion');
assert.match(hostedSpec, /expect\(\(\) => assertMainColorContrastResult\(invisibleContrast, 'adversarial 0ms'\)\)\s*\.toThrow\(\/Axe must pass exactly the real readable-motion target\/u\)/u, 'the same positive evidence assertion must actually reject the empty scan');
assert.match(hostedSpec, /expect\(\(\) => assertMainColorContrastResult\(vulnerableContrast, 'adversarial 90ms'\)\)\s*\.toThrow\(\/readable-motion target color contrast violations\/u\)/u, 'the same positive evidence assertion must actually reject the low-contrast scan');
assert.match(hostedSpec, /if \(personaIndex === 0\) await assertContrastOracleRejectsOccludedMotion\(page\)/u, 'the adversarial oracle self-test must run once per browser project, not once per persona');
const keyboardJourneyStart = hostedSpec.indexOf("case 'keyboard-a11y': {");
const keyboardJourneyEnd = hostedSpec.indexOf('\n    case ', keyboardJourneyStart + 1);
assert.ok(keyboardJourneyStart >= 0 && keyboardJourneyEnd > keyboardJourneyStart, 'the keyboard scenario must have an explicit source boundary');
const keyboardJourney = hostedSpec.slice(keyboardJourneyStart, keyboardJourneyEnd);
const requiredHomeScopeJourney = /retainFullPageColorContrastEvidence\(results, testInfo, label, 'initial-entry'\);\s*expect\(results\.violations\.filter\(item => item\.impact === 'serious' \|\| item\.impact === 'critical'\)\)\.toEqual\(\[\]\);\s*await closeProductNavigation\(page\);\s*await selectMyWorkScope\(page\);\s*await clickProductNav\(page, 'Home'\);\s*await closeProductNavigation\(page\);/u;
assert.match(keyboardJourney, requiredHomeScopeJourney, 'every persona must close mobile navigation and select My Work through the real UI before invoking scope-gated Home');
for (const missingStep of ['await closeProductNavigation(page);', 'await selectMyWorkScope(page);']) {
  assert.doesNotMatch(keyboardJourney.replace(missingStep, ''), requiredHomeScopeJourney, 'the Home traversal contract must reject a missing real UI scope precondition');
}
const fullPageEvidenceGuard = hostedSpec.match(/const retainFullPageColorContrastEvidence = async \(([\s\S]*?)\n\};/u);
assert.ok(fullPageEvidenceGuard, 'full-page color-contrast evidence handling must remain source-inspectable');
assert.match(fullPageEvidenceGuard[1], /const attachment = createFullPageContrastAttachment\(\{[\s\S]*results,[\s\S]*metadata: testInfo\.config\.metadata,[\s\S]*persona,[\s\S]*profile,[\s\S]*project: testInfo\.project\.name,[\s\S]*test: testInfo\.title,[\s\S]*observedAt: new Date\(\)\.toISOString\(\),[\s\S]*await testInfo\.attach\(attachment\.name, \{ body: attachment\.body, contentType: attachment\.contentType \}\);[\s\S]*const summary = summarizeFullPageColorContrast\(results\);/u, 'every full-page scan must emit one shared v1 attachment with exact safe execution identity before classification assertions');
const firstFullPageTerminalAssertion = fullPageEvidenceGuard[1].search(/expect\(/u);
const fullPageAttachment = fullPageEvidenceGuard[1].indexOf('await testInfo.attach(');
assert.ok(fullPageAttachment >= 0 && firstFullPageTerminalAssertion > fullPageAttachment, 'full-page evidence attachment must precede every terminal assertion');
assert.equal((fullPageEvidenceGuard[1].match(/await testInfo\.attach\(/gu) ?? []).length, 1, 'the retained helper must emit exactly one attachment for every persona invocation, including clean scans');
assert.match(fullPageEvidenceGuard[1], /summary\.observedNodeCount[\s\S]*toBeGreaterThan\(0\)[\s\S]*summary\.violationNodeCount[\s\S]*toBe\(0\)[\s\S]*summary\.incompleteResultCount[\s\S]*toBeLessThanOrEqual\(MAX_FULL_PAGE_CONTRAST_INCOMPLETE_RESULTS\)/u, 'terminal full-page predicates must use shared observed, violation, and bounded incomplete-result counts');
assert.doesNotMatch(fullPageEvidenceGuard[1], /positiveNodeCount[\s\S]*toBeGreaterThan\(0\)/u, 'full-page acceptance must not regress to a positive-only predicate');
assert.match(fullPageEvidenceGuard[1], /summary\.incompleteNodeCount > 0[\s\S]*summary\.classification[\s\S]*toBe\('unresolved_manual'\)[\s\S]*summary\.classification[\s\S]*toBe\('resolved'\)/u, 'all-incomplete and mixed full-page scans must remain unresolved while only complete nonempty scans resolve');
assert.doesNotMatch(fullPageEvidenceGuard[1], /\.html\b|\.target\b|failureSummary|releaseSha|deployId/u, 'the browser attachment boundary must not retain raw HTML, selectors, infrastructure IDs, or raw failure summaries');
assert.match(keyboardJourney, /const results = await new AxeBuilder\(\{ page \}\)\.analyze\(\);\s*await retainFullPageColorContrastEvidence\(results, testInfo, label, 'initial-entry'\);\s*expect\(results\.violations\.filter\(item => item\.impact === 'serious' \|\| item\.impact === 'critical'\)\)\.toEqual\(\[\]\);/u, 'SANDBOX-009 must attach the full-page summary before its serious/critical terminal assertion');
assert.match(hostedSpec, /case 'serious-critical-a11y':[\s\S]*runObservedPersonaJourney[\s\S]*new AxeBuilder\(\{ page \}\)\.analyze\(\)[\s\S]*retainFullPageColorContrastEvidence\(results, testInfo, label, 'representative-surface'\)[\s\S]*violations\.filter\(item => item\.impact === 'serious' \|\| item\.impact === 'critical'\)/u, 'SAFETY-007 must retain every observed representative journey and attach its full-page summary before the serious/critical assertion');
assert.doesNotMatch(hostedSpec.match(/case 'serious-critical-a11y': \{([\s\S]*?)\n\s*\}/u)?.[1] ?? '', /assertPositiveMainColorContrast|analyzeMainColorContrast/u, 'SAFETY-007 must not promote broad main incompletes into strict target failures');
assert.match(adminWorkbenchSource, /<span className="[^"]*text-slate-600[^"]*">[\s\S]*Sectioned admin structure/u, 'the Platform Admin badge must retain AA-capable foreground contrast');
assert.match(taskCardSource, /text-slate-700 dark:text-slate-200" style=\{\{ backgroundColor: `\$\{epic\.color\}18` \}\}/u, 'dynamic epic color may tint only the background, never become low-contrast foreground text');
assert.match(boardsSource, /overflow-auto[^"]*" tabIndex=\{0\} aria-label="Delivery work board"/u, 'the mobile scrollable board region must be named and keyboard focusable');
assert.match(boardsSource, /text-xs font-semibold text-slate-600 dark:text-slate-400">\{label\}/u, 'mobile board summary labels must retain AA-capable contrast');
assert.match(taskCardSource, /leading-\[1\.15rem\] text-slate-600 dark:text-slate-400/u, 'mobile task descriptions must retain AA-capable contrast');
assert.doesNotMatch(taskCardSource, /text-\[(?:10|11)px\][^"'`]*text-slate-(?:400|500)/u, 'small TaskCard metadata may not use marginal slate foregrounds');
assert.doesNotMatch(taskCardSource, /bg-emerald-50 text-emerald-700/u, 'small TaskCard lineage and status badges may not use the marginal emerald-700 foreground');
assert.match(taskCardSource, /overdue \? 'text-red-700 dark:text-red-400'/u, 'small overdue metadata must retain an AA-capable light-mode red foreground');
assert.match(taskListSource, /overdue \? 'text-red-700 dark:text-red-400'/u, 'Work List overdue dates must retain an AA-capable light-mode red foreground');
assert.doesNotMatch(taskListSource, /text-sm font-black \$\{overdue \? 'text-red-500'/u, 'Work List overdue dates may not regress to the sub-AA red-500 foreground');
assert.doesNotMatch(processCatalogSource, /bg-amber-50 text-amber-700/u, 'small amber catalog badges may not use the marginal amber-700 foreground');
assert.doesNotMatch(processCatalogSource, /bg-emerald-50 text-emerald-700/u, 'small emerald catalog badges may not use the marginal emerald-700 foreground');
assert.match(adminWorkbenchSource, /text-\[var\(--av-color-brand-primary\)\]">Avala Admin</u, 'the small Avala Admin label must use the AA-capable primary foreground');
assert.match(processCatalogSource, /overflow-x-auto[^"]*" tabIndex=\{0\} aria-label="Process catalog table"/u, 'the mobile process catalog scroll region must be named and keyboard focusable');
assert.match(sidebarSource, /aria-label="Close primary navigation"[^\n]*fixed inset-y-0 left-64 right-0 z-40/u, 'the mobile navigation backdrop hitbox must begin outside the higher-layer sidebar');
assert.doesNotMatch(sidebarSource, /aria-label="Close primary navigation"[^\n]*fixed inset-0/u, 'the mobile navigation backdrop may not hide its actionable center beneath the sidebar');
assert.match(hostedSpec, /not\.toHaveURL\(\/projectId=\/u, \{ timeout: 15_000 \}\)/u, 'stale project URL scrubbing must remain fail-closed while allowing bounded hydration under CI load');
assert.match(
  hostedSpec,
  /const SEVEN_PERSONA_SCENARIOS = new Set\(\[[\s\S]*'persona-matrix'[\s\S]*'local-authority'[\s\S]*'network-safety'[\s\S]*'desktop-layout'[\s\S]*'mobile-layout'[\s\S]*'keyboard-a11y'[\s\S]*'serious-critical-a11y'[\s\S]*\]\);/u,
  'every seven-persona scenario must be explicitly enumerated for the bounded extended timeout',
);
assert.match(
  hostedSpec,
  /binding\.scenario && SEVEN_PERSONA_SCENARIOS\.has\(binding\.scenario\)\) testInfo\.setTimeout\(180_000\)/u,
  'every seven-persona scenario needs an explicit bounded budget without skipped assertions or retries',
);
assert.match(
  hostedSpec,
  /type NetworkViolation = \{ method: string; category: NetworkViolationCategory; resourceType: string; originClass: string \};/u,
  'violation evidence schema must remain limited to non-sensitive method, category, resource type, and opaque origin class',
);
assert.doesNotMatch(
  hostedSpec,
  /type NetworkViolation = \{[^\n]*\borigin:\s*string/u,
  'violation evidence schema must not acquire a literal origin field',
);

console.log('Exhaustive hosted acceptance contract checks passed.');
