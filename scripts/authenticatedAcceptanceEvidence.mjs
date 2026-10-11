import { isDeepStrictEqual } from 'node:util';
import { AUTHENTICATED_ACCEPTANCE_PROJECTS } from './authenticatedAcceptanceCases.mjs';
import { validateAuthenticatedHostedEvidence } from './authenticatedHostedEvidence.mjs';

const block = reason => ({ status: 'BLOCKED', reason, evidenceReferences: [] });

// Hosted authenticated evidence is accepted only through the independently
// reconstructed v2 producer. The former v1 shape trusted supplied counts and
// authority booleans and is intentionally no longer accepted.
export function validateAuthenticatedAcceptanceManifest(manifest, expected, catalog) {
  return validateAuthenticatedHostedEvidence(manifest, expected, catalog);
}

export function evaluateAuthenticatedAcceptanceCase({ testCase, manifest, expected, catalog, manifestErrors }) {
  if (!manifest || !expected) return block('Authenticated hosted execution is not run; local preparation cannot satisfy this requirement.');
  const errors = manifestErrors ?? validateAuthenticatedAcceptanceManifest(manifest, expected, catalog);
  if (errors.length) return block('Authenticated execution evidence is invalid or incomplete.');
  const rows = manifest.cases.filter(row => row.testId === testCase.testId);
  if (!isDeepStrictEqual(rows.map(row => row.project).sort(), [...AUTHENTICATED_ACCEPTANCE_PROJECTS].sort())) {
    return block('Both authenticated browser projects require exact same-run evidence.');
  }
  const status = rows.some(row => row.status === 'FAIL') ? 'FAIL'
    : rows.every(row => row.status === 'PASS') ? 'PASS' : 'BLOCKED';
  return {
    status,
    reason: status === 'PASS' ? null : 'Authenticated case assertions failed or were not completed.',
    actual: rows.map(({ project, status: rowStatus, measurements, participants }) => ({
      project,
      status: rowStatus,
      logicalMutations: measurements.logicalMutations,
      participants: participants.map(({ persona, actorHash, sessionHash }) => ({ persona, actorHash, sessionHash })),
    })),
    scope: status === 'PASS' ? {
      evidenceScope: 'executed-hosted-authenticated-synthetic',
      exerciseDigest: expected.exerciseDigest,
      backendDigest: expected.backendDigest,
      sourceDigest: expected.sourceDigest,
      projects: rows.map(row => ({ project: row.project, participants: row.participants })),
    } : null,
    evidenceReferences: [],
  };
}
