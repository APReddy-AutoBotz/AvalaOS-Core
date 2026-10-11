import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalDigest } from './assessV1OracleEvidence.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const required = (environment, name, pattern) => {
  const value = environment[name];
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('AUTHENTICATED_HOSTED_ENVIRONMENT_REJECTED');
  return value;
};

export function authenticatedHostedEnvironmentLines(environment, {
  catalog = JSON.parse(fs.readFileSync('tests/acceptance/catalog/test-catalog.json', 'utf8')),
  provenance = JSON.parse(fs.readFileSync('tests/acceptance/source-provenance.json', 'utf8')),
} = {}) {
  const values = {
    AUTHENTICATED_ACCEPTANCE_EXECUTION_KIND: 'hosted_authenticated_synthetic',
    AUTHENTICATED_ACCEPTANCE_AUTH_KIND: 'supabase_auth',
    AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF: required(environment,
      'AUTHENTICATED_ACCEPTANCE_EXPECTED_PROJECT_REF', /^[a-z0-9]{20}$/u),
    AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST: required(environment,
      'AUTHENTICATED_ACCEPTANCE_TARGET_PUBLIC_DIGEST', DIGEST),
    AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST: required(environment, 'AUTHENTICATED_ACCEPTANCE_BACKEND_DIGEST', DIGEST),
    AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION: required(environment,
      'AUTHENTICATED_ACCEPTANCE_MIGRATION_VERSION', /^20[0-9]{12}$/u),
    AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST: required(environment, 'AUTHENTICATED_ACCEPTANCE_MIGRATION_DIGEST', DIGEST),
    AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST: required(environment, 'AUTHENTICATED_ACCEPTANCE_EXERCISE_DIGEST', DIGEST),
    AUTHENTICATED_ACCEPTANCE_CATALOG_DIGEST: canonicalDigest(catalog),
    AUTHENTICATED_ACCEPTANCE_SOURCE_DIGEST: canonicalDigest(provenance.sourceDigests),
    AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST: required(environment, 'AUTHENTICATED_ACCEPTANCE_BASELINE_DIGEST', DIGEST),
    AUTHENTICATED_ACCEPTANCE_SYNTHETIC_ONLY: 'true',
    AUTHENTICATED_ACCEPTANCE_PRODUCTION: 'false',
    AUTHENTICATED_ACCEPTANCE_CUSTOMER_DATA: 'false',
    AUTHENTICATED_ACCEPTANCE_PROVIDERS_ENABLED: 'false',
    AUTHENTICATED_ACCEPTANCE_PAID_CALLS: 'false',
  };
  return Object.entries(values).map(([name, value]) => `${name}=${value}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    console.log(authenticatedHostedEnvironmentLines(process.env).join('\n'));
  } catch {
    console.error('AUTHENTICATED_HOSTED_ENVIRONMENT_REJECTED');
    process.exitCode = 1;
  }
}
