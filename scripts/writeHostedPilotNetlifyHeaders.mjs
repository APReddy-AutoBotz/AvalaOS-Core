import { mkdir, writeFile } from 'node:fs/promises';

const release = process.env.COMMIT_REF?.trim();
const context = process.env.CONTEXT?.trim();

if (!/^[0-9a-f]{40}$/.test(release ?? '')) {
  throw new Error('NETLIFY_HOSTED_PILOT_RELEASE_REQUIRED');
}
if (!['deploy-preview', 'branch-deploy'].includes(context ?? '')) {
  throw new Error('NETLIFY_HOSTED_PILOT_NONPRODUCTION_CONTEXT_REQUIRED');
}

await mkdir('dist', { recursive: true });
await writeFile(
  'dist/_headers',
  `/*\n  X-AvalaOS-Release: ${release}\n  X-AvalaOS-Environment: hosted_nonproduction_pilot\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  X-Frame-Options: DENY\n`,
  'utf8',
);

console.log('Hosted non-production response identity headers generated for exact Netlify commit.');
