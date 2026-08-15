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

assert.equal(
  hostedSpec.includes("getByTestId('enterprise-intelligence-view')"),
  false,
  'hosted acceptance must not depend on the removed Enterprise Intelligence test id',
);
assert.ok(
  hostedSpec.match(/getByRole\('heading', \{ name: 'Governed Delivery Pack', exact: true \}\)/gu)?.length >= 3,
  'Delivery Pack acceptance must target the unique semantic heading rather than duplicate visible text',
);
assert.equal(
  hostedSpec.includes("getByText('Governed Delivery Pack')"),
  false,
  'Delivery Pack acceptance must not regress to the ambiguous text locator',
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
assert.match(diagnosticBody[1], /return new URL\(requestUrl\)\.origin;/u, 'diagnostics must retain only URL origin');
assert.match(diagnosticBody[1], /return INVALID_NETWORK_ORIGIN;/u, 'malformed URLs must use the fixed sentinel');
assert.doesNotMatch(
  diagnosticBody[1], /\.(?:pathname|search|hash|username|password)\b/u,
  'diagnostics must not extract path, query, fragment, or userinfo fields',
);
assert.match(
  hostedSpec,
  /samples\.push\(\{ method: request\.method\(\), category, origin: diagnosticOrigin\(request\.url\(\)\) \}\);/u,
  'violation samples must retain only method, category, and sanitized origin',
);
assert.match(
  hostedSpec,
  /type NetworkViolation = \{ method: string; category: NetworkViolationCategory; origin: string \};/u,
  'violation evidence schema must not acquire raw URL or header fields',
);

console.log('Exhaustive hosted acceptance contract checks passed.');
