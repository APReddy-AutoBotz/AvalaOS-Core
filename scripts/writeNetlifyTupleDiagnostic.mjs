import { mkdir, writeFile } from 'node:fs/promises';

const payload = {
  commitRef: process.env.COMMIT_REF ?? null,
  context: process.env.CONTEXT ?? null,
  siteName: process.env.SITE_NAME ?? null,
  branch: process.env.BRANCH ?? null,
  url: process.env.URL ?? null,
  deployUrl: process.env.DEPLOY_URL ?? null,
  deployPrimeUrl: process.env.DEPLOY_PRIME_URL ?? null,
  stableTestingAuthorizationPresent: Boolean(process.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING),
  stableTestingAuthorizationMatches: process.env.AVALAOS_HOSTED_NONPRODUCTION_STABLE_TESTING === 'authorized',
};

await mkdir('dist', { recursive: true });
await writeFile('dist/netlify-tuple.json', JSON.stringify(payload, null, 2), 'utf8');
await writeFile('dist/index.html', '<!doctype html><meta charset="utf-8"><title>AvalaOS Netlify tuple diagnostic</title><pre>Diagnostic artifact only.</pre>', 'utf8');
console.log('Safe Netlify tuple diagnostic written.');
