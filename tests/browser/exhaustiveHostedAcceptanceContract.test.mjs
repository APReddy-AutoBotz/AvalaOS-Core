import assert from 'node:assert/strict';
import fs from 'node:fs';

const hostedSpec = fs.readFileSync(new URL('./exhaustiveHostedAcceptance.spec.ts', import.meta.url), 'utf8');
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

const diagnosticBody = hostedSpec.match(/const diagnosticOrigin = \(requestUrl: string\): string => \{([\s\S]*?)\n\};/u);
assert.ok(diagnosticBody, 'origin-only diagnostic sanitizer must remain present');
assert.match(diagnosticBody[1], /const url = new URL\(requestUrl\);/u, 'diagnostics must parse the request URL before extracting evidence');
assert.match(diagnosticBody[1], /url\.protocol !== 'http:' && url\.protocol !== 'https:'/u, 'diagnostics must reject non-HTTP(S) schemes');
assert.match(diagnosticBody[1], /return url\.origin;/u, 'diagnostics must retain only URL origin');
assert.ok(
  diagnosticBody[1].match(/return UNAVAILABLE_NETWORK_ORIGIN;/gu)?.length >= 2,
  'non-HTTP(S) and malformed URLs must collapse to the fixed non-sensitive sentinel',
);
assert.doesNotMatch(
  diagnosticBody[1], /\.(?:pathname|search|hash|username|password)\b/u,
  'diagnostics must not extract path, query, fragment, or userinfo fields',
);
assert.equal(
  new URL('https://user:password@example.com:8443/private/path?token=secret#fragment').origin,
  'https://example.com:8443',
  'WHATWG URL origin must exclude userinfo, path, query, and fragment from the exact expression used by diagnostics',
);
assert.match(
  hostedSpec,
  /samples\.push\(\{ method: request\.method\(\)\.toUpperCase\(\), category, origin: diagnosticOrigin\(request\.url\(\)\) \}\);/u,
  'violation samples must retain only normalized method, category, and sanitized origin',
);
assert.match(
  hostedSpec,
  /type NetworkViolation = \{ method: string; category: NetworkViolationCategory; origin: string \};/u,
  'violation evidence schema must not acquire raw URL or header fields',
);

console.log('Exhaustive hosted acceptance contract checks passed.');
