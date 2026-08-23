import assert from 'node:assert/strict';
import fs from 'node:fs';

const hostedSpec = fs.readFileSync(new URL('./exhaustiveHostedAcceptance.spec.ts', import.meta.url), 'utf8');
const observerSource = fs.readFileSync(new URL('./authorityRequestObserver.ts', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const adminWorkbenchSource = fs.readFileSync(new URL('../../components/admin/AdminWorkbench.tsx', import.meta.url), 'utf8');
const taskCardSource = fs.readFileSync(new URL('../../components/delivery/TaskCard.tsx', import.meta.url), 'utf8');
const boardsSource = fs.readFileSync(new URL('../../components/delivery/BoardsView.tsx', import.meta.url), 'utf8');
const processCatalogSource = fs.readFileSync(new URL('../../components/assess/ProcessCatalogView.tsx', import.meta.url), 'utf8');
const processModal = fs.readFileSync(new URL('../../components/assess/ProcessCreationModal.tsx', import.meta.url), 'utf8');

const fieldAssociations = [
  ['process-name', 'input'],
  ['process-description', 'textarea'],
  ['process-department', 'input'],
  ['process-criticality', 'select'],
];

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
  /invalidPersistedScopes = \[[\s\S]*stale-different-project[\s\S]*null,[\s\S]*'\{malformed'[\s\S]*page\.reload/u,
  'SAFETY-004 must retain stale, missing, and malformed persisted projects through reconstruction',
);
assert.ok(
  hostedSpec.match(/\.toEqual\(canonicalDeliveryPackNavigation\)/gu)?.length >= 3,
  'SAFETY-004 must prove exact identity before invalid reconstruction, after setup restoration, and after reload',
);
assert.match(hostedSpec, /not\.toHaveURL\(\/projectId=/u, 'invalid persisted scope must remove URL-only project evidence');
assert.match(
  hostedSpec,
  /canonicalBoardsNavigation[\s\S]*stale-different-project[\s\S]*invalidBoardsResponse = await page\.reload[\s\S]*not\.toHaveURL\(\/projectId=/u,
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
assert.match(observerSource, /stop:\(\)=>page\.off\('request',inspect\)/u, 'the observer must expose one explicit stop boundary');
assert.match(appSource, /<main id="app-main" tabIndex=\{-1\}/u, 'the post-entry skip-link target must accept programmatic focus');
assert.match(hostedSpec, /isFirstSequentialTabStop[\s\S]*skip link must remain the first sequential keyboard target[\s\S]*skipLink\.focus\(\)[\s\S]*page\.keyboard\.press\('Enter'\)/u, 'every persona must prove first-tab-stop ordering and real keyboard skip-link activation');
assert.match(adminWorkbenchSource, /<span className="[^"]*text-slate-600[^"]*">[\s\S]*Sectioned admin structure/u, 'the Platform Admin badge must retain AA-capable foreground contrast');
assert.match(taskCardSource, /text-slate-700 dark:text-slate-200" style=\{\{ backgroundColor: `\$\{epic\.color\}18` \}\}/u, 'dynamic epic color may tint only the background, never become low-contrast foreground text');
assert.match(boardsSource, /overflow-auto[^"]*" tabIndex=\{0\} aria-label="Delivery work board"/u, 'the mobile scrollable board region must be named and keyboard focusable');
assert.match(boardsSource, /text-xs font-semibold text-slate-600 dark:text-slate-400">\{label\}/u, 'mobile board summary labels must retain AA-capable contrast');
assert.match(taskCardSource, /leading-\[1\.15rem\] text-slate-600 dark:text-slate-400/u, 'mobile task descriptions must retain AA-capable contrast');
assert.doesNotMatch(processCatalogSource, /bg-amber-50 text-amber-700/u, 'small amber catalog badges may not use the marginal amber-700 foreground');
assert.match(hostedSpec, /not\.toHaveURL\(\/projectId=\/u, \{ timeout: 15_000 \}\)/u, 'stale project URL scrubbing must remain fail-closed while allowing bounded hydration under CI load');
assert.match(hostedSpec, /binding\.scenario === 'keyboard-a11y'\) testInfo\.setTimeout\(180_000\)/u, 'the seven-persona keyboard and axe scenario needs an explicit bounded budget without skipped assertions');
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
