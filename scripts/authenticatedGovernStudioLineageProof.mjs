import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA =
  'authenticated-govern-studio-lineage-postgres-proof-v1';
export const AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_MAX_BYTES = 12_288;
export const AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SOURCE_PATHS = Object.freeze([
  'scripts/authenticatedGovernStudioLineageProof.mjs',
  'scripts/governPreparationIdentity.mjs',
  'scripts/testAuthenticatedGovernStudioLineagePostgres.mjs',
  'scripts/authenticatedHostedController.mjs',
  'scripts/authenticatedHostedControllerAdapters.mjs',
  'scripts/authenticatedHostedObservationAdapter.mjs',
  'scripts/authenticatedGovernStudioDiagnostic.mjs',
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'supabase/functions/_shared/assessV2Command.ts',
  'supabase/functions/_shared/assessV2Handlers.ts',
  'supabase/functions/_shared/assessV2ReviewCommand.ts',
  'supabase/functions/_shared/assessV2ReviewHandlers.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
]);

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value)
  && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const unsafe = value => /https?:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|access[_-]?token|authorization|service[_-]?role/iu
  .test(JSON.stringify(value));

export const authenticatedGovernStudioLineageProofDigest = value =>
  `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;

export function validateAuthenticatedGovernStudioLineageProof(value) {
  if (!exactKeys(value, ['schemaVersion', 'status', 'source', 'runtime', 'positive', 'negative', 'cleanup'])
    || !exactKeys(value.source, ['releaseSha', 'runId', 'attempt', 'workflow', 'job', 'sourceDigest'])
    || !exactKeys(value.runtime, ['postgresql', 'productionHandlers', 'providersEnabled', 'providerCalls', 'paidCalls'])
    || !exactKeys(value.positive, ['verified', 'actionCount', 'lineageDigest'])
    || !exactKeys(value.negative, [
      'resourceSubstitutionRejected', 'receiptSubstitutionRejected', 'actorSubstitutionRejected',
      'extraScopedRowRejected',
    ])
    || !exactKeys(value.cleanup, ['databaseRemoved'])
    || value.schemaVersion !== AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_SCHEMA
    || value.status !== 'PASS' || !SHA.test(value.source.releaseSha ?? '')
    || !POSITIVE_INTEGER.test(value.source.runId ?? '') || !POSITIVE_INTEGER.test(value.source.attempt ?? '')
    || value.source.workflow !== 'Authenticated Product Acceptance Preparation'
    || value.source.job !== 'connected-browser' || !DIGEST.test(value.source.sourceDigest ?? '')
    || value.runtime.postgresql !== true || value.runtime.productionHandlers !== true
    || value.runtime.providersEnabled !== false || value.runtime.providerCalls !== 0 || value.runtime.paidCalls !== 0
    || value.positive.verified !== true || value.positive.actionCount !== 8
    || !DIGEST.test(value.positive.lineageDigest ?? '')
    || Object.values(value.negative).some(item => item !== true)
    || value.cleanup.databaseRemoved !== true) return null;
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > AUTHENTICATED_GOVERN_STUDIO_LINEAGE_PROOF_MAX_BYTES || unsafe(value)) return null;
  return Object.freeze(structuredClone(value));
}
