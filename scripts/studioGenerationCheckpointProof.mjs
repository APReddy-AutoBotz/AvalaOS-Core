import { createHash } from 'node:crypto';

export const STUDIO_GENERATION_CHECKPOINT_SCHEMA = 'studio-generation-checkpoint-local-v1';
export const STUDIO_GENERATION_CHECKPOINT_OUTPUT = 'studio-generation-checkpoint.json';

export const STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS = Object.freeze([
  'scripts/enterpriseLifecyclePostgresFixture.mjs',
  'scripts/enterpriseLifecycleStudioGeneration.mjs',
  'scripts/authenticatedBrowserCorrelation.mjs',
  'scripts/authenticatedHostedControllerAdapters.mjs',
  'scripts/authenticatedHostedObservationAdapter.mjs',
  'scripts/authenticatedHostedObserver.mjs',
  'scripts/studioGenerationCheckpointProof.mjs',
  'scripts/testStudioGenerationCheckpointPostgres.mjs',
  'supabase/functions/_shared/authenticatedSyntheticAuthority.ts',
  'supabase/functions/_shared/studioArtifactCommand.ts',
  'supabase/functions/_shared/studioArtifactDb.ts',
  'supabase/functions/_shared/studioArtifactGeneration.ts',
  'supabase/functions/_shared/studioArtifactHandler.ts',
  'supabase/functions/_shared/studioArtifactTemplateContract.ts',
  'supabase/migrations/20260727120000_studio_governed_artifact_authority.sql',
  'supabase/migrations/20260828120000_governed_multisource_studio_pr_b.sql',
  'supabase/migrations/20261003150800_synthetic_ai_brd_v2_quality_validation_allowance.sql',
  'supabase/migrations/20261004112232_synthetic_ai_brd_v3_quality_validation_allowance.sql',
  'supabase/migrations/20261010144356_authenticated_hosted_exercise_authority.sql',
  'supabase/migrations/20261019161723_local_real_backend_authenticated_acceptance.sql',
]);

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const FAILURE_CODES = new Set([
  'CHECKPOINT_SETUP_FAILED',
  'CHECKPOINT_SOURCE_CHAIN_FAILED',
  'CHECKPOINT_AUTHORITY_FAILED',
  'CHECKPOINT_GENERATION_FAILED',
  'CHECKPOINT_OBSERVATION_FAILED',
  'CHECKPOINT_CLEANUP_FAILED',
  'CHECKPOINT_VALIDATION_FAILED',
]);

const fail = code => { throw new Error(`STUDIO_GENERATION_CHECKPOINT_${code}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys, code) => {
  if (!object(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
};
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
const boolean = value => typeof value === 'boolean';

const stable = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
};

export const studioGenerationCheckpointDigest = value =>
  `sha256:${createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex')}`;

const assertPrivacy = value => {
  const serialized = JSON.stringify(value);
  if (serialized.length > 32_768 || UUID.test(serialized)
    || /Bearer\s|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.|generated content|sourceAnchors/iu.test(serialized)) {
    fail('PRIVACY_REJECTED');
  }
};

export function validateStudioGenerationCheckpointProof(value) {
  exactKeys(value, ['schemaVersion', 'status', 'classification', 'execution', 'sourceBinding', 'runtime',
    'result', 'negativeControls', 'cleanup', 'failure'], 'SHAPE_REJECTED');
  if (value.schemaVersion !== STUDIO_GENERATION_CHECKPOINT_SCHEMA
    || !['PASS', 'FAIL'].includes(value.status)
    || value.classification !== (value.status === 'PASS' ? 'executed_evidence' : 'blocked')) fail('STATUS_REJECTED');

  exactKeys(value.execution, ['kind', 'fullAcceptance', 'hosted', 'promotion', 'timeoutMs',
    'providersEnabled', 'baseHead'], 'EXECUTION_REJECTED');
  if (value.execution.kind !== 'LOCAL_NOT_CI' || value.execution.fullAcceptance !== false
    || value.execution.hosted !== false || value.execution.promotion !== false
    || value.execution.timeoutMs !== 15_000 || value.execution.providersEnabled !== false
    || !SHA.test(value.execution.baseHead)) fail('EXECUTION_REJECTED');

  exactKeys(value.sourceBinding, ['classification', 'digest', 'files', 'migrationChain'], 'SOURCE_REJECTED');
  if (value.sourceBinding.classification !== 'working_tree_snapshot'
    || !DIGEST.test(value.sourceBinding.digest)
    || !Array.isArray(value.sourceBinding.files)
    || value.sourceBinding.files.length !== STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS.length) fail('SOURCE_REJECTED');
  value.sourceBinding.files.forEach((file, index) => {
    exactKeys(file, ['path', 'digest'], 'SOURCE_REJECTED');
    if (file.path !== STUDIO_GENERATION_CHECKPOINT_SOURCE_PATHS[index] || !DIGEST.test(file.digest)) fail('SOURCE_REJECTED');
  });
  if (studioGenerationCheckpointDigest(value.sourceBinding.files) !== value.sourceBinding.digest) fail('SOURCE_REJECTED');
  exactKeys(value.sourceBinding.migrationChain, ['count', 'digest'], 'SOURCE_REJECTED');
  if (!nonnegative(value.sourceBinding.migrationChain.count) || value.sourceBinding.migrationChain.count < 100
    || !DIGEST.test(value.sourceBinding.migrationChain.digest)) fail('SOURCE_REJECTED');

  exactKeys(value.runtime, ['postgresql', 'actualHandler', 'actualResolver', 'actualGenerationDependency',
    'actualObservationReader', 'providerCalls', 'paidCalls', 'egressAttempts', 'budgetReservations',
    'enabledProviderRoutes', 'providerConfigsUsed'], 'RUNTIME_REJECTED');
  for (const key of ['postgresql', 'actualHandler', 'actualResolver', 'actualGenerationDependency', 'actualObservationReader']) {
    if (!boolean(value.runtime[key])) fail('RUNTIME_REJECTED');
  }
  for (const key of ['providerCalls', 'paidCalls', 'egressAttempts', 'budgetReservations',
    'enabledProviderRoutes', 'providerConfigsUsed']) if (!nonnegative(value.runtime[key])) fail('RUNTIME_REJECTED');

  exactKeys(value.result, ['responseStatus', 'outcome', 'attempts', 'versions', 'permit', 'bindings',
    'observation', 'downstream'], 'RESULT_REJECTED');
  if (!nonnegative(value.result.responseStatus)
    || !['generation_completed', 'not_executed', 'fixed_failure'].includes(value.result.outcome)) fail('RESULT_REJECTED');
  exactKeys(value.result.attempts, ['total', 'completed', 'nonterminal'], 'RESULT_REJECTED');
  exactKeys(value.result.versions, ['created', 'aggregateAdvanced', 'currentPointerAdvanced'], 'RESULT_REJECTED');
  exactKeys(value.result.permit, ['armed', 'consumed', 'consumedEvents'], 'RESULT_REJECTED');
  exactKeys(value.result.bindings, ['actor', 'session', 'request', 'payload', 'aggregate', 'sourcePackage',
    'template', 'sourceCoverage'], 'RESULT_REJECTED');
  exactKeys(value.result.observation, ['records', 'attemptRecords', 'versionRecords', 'receiptRecords',
    'auditRecords', 'independentPersistedMatch'], 'RESULT_REJECTED');
  exactKeys(value.result.downstream, ['review', 'approval', 'delivery', 'monitor'], 'RESULT_REJECTED');
  for (const group of [value.result.attempts, value.result.permit, value.result.downstream]) {
    for (const item of Object.values(group)) if (!nonnegative(item)) fail('RESULT_REJECTED');
  }
  for (const key of ['records', 'attemptRecords', 'versionRecords', 'receiptRecords', 'auditRecords']) {
    if (!nonnegative(value.result.observation[key])) fail('RESULT_REJECTED');
  }
  if (!boolean(value.result.observation.independentPersistedMatch)
    || value.result.observation.records < value.result.observation.attemptRecords
      + value.result.observation.versionRecords + value.result.observation.receiptRecords
      + value.result.observation.auditRecords) fail('RESULT_REJECTED');
  if (!nonnegative(value.result.versions.created)
    || !boolean(value.result.versions.aggregateAdvanced) || !boolean(value.result.versions.currentPointerAdvanced)
    || Object.values(value.result.bindings).some(item => !boolean(item))) fail('RESULT_REJECTED');

  exactKeys(value.negativeControls, ['mismatchedPayloadRejected', 'duplicateRequestReplayed',
    'duplicateStateUnchanged', 'foreignScopeExcluded', 'foreignMutationDetected', 'baselineRestored',
    'nonterminalResidueZero'], 'NEGATIVE_REJECTED');
  if (Object.values(value.negativeControls).some(item => !boolean(item))) fail('NEGATIVE_REJECTED');

  exactKeys(value.cleanup, ['exerciseQuiesced', 'activeResidue', 'sessionRevoked', 'armedPermits',
    'terminalHistoryRetained', 'databaseRemoved'], 'CLEANUP_REJECTED');
  if (!boolean(value.cleanup.exerciseQuiesced) || !nonnegative(value.cleanup.activeResidue)
    || !nonnegative(value.cleanup.sessionRevoked) || !nonnegative(value.cleanup.armedPermits)
    || !boolean(value.cleanup.terminalHistoryRetained) || !boolean(value.cleanup.databaseRemoved)) fail('CLEANUP_REJECTED');

  if (value.failure !== null) {
    exactKeys(value.failure, ['code'], 'FAILURE_REJECTED');
    if (!FAILURE_CODES.has(value.failure.code)) fail('FAILURE_REJECTED');
  }
  if (value.status === 'PASS') {
    if (value.failure !== null || value.result.responseStatus !== 201 || value.result.outcome !== 'generation_completed'
      || value.runtime.postgresql !== true || value.runtime.actualHandler !== true
      || value.runtime.actualResolver !== true || value.runtime.actualGenerationDependency !== true
      || value.runtime.actualObservationReader !== true || value.runtime.providerCalls !== 0
      || value.runtime.paidCalls !== 0 || value.runtime.egressAttempts !== 0
      || value.runtime.budgetReservations !== 0 || value.runtime.enabledProviderRoutes !== 0
      || value.runtime.providerConfigsUsed !== 0
      || value.result.attempts.total !== 1 || value.result.attempts.completed !== 1 || value.result.attempts.nonterminal !== 0
      || value.result.versions.created !== 1 || !value.result.versions.aggregateAdvanced || !value.result.versions.currentPointerAdvanced
      || value.result.permit.armed !== 1 || value.result.permit.consumed !== 1 || value.result.permit.consumedEvents !== 1
      || Object.values(value.result.bindings).some(item => item !== true)
      || value.result.observation.attemptRecords !== 1 || value.result.observation.versionRecords !== 1
      || value.result.observation.receiptRecords !== 1 || value.result.observation.auditRecords < 2
      || value.result.observation.independentPersistedMatch !== true
      || Object.values(value.result.downstream).some(item => item !== 0)
      || Object.values(value.negativeControls).some(item => item !== true)
      || value.cleanup.exerciseQuiesced !== true || value.cleanup.activeResidue !== 0
      || value.cleanup.sessionRevoked !== 1 || value.cleanup.armedPermits !== 0
      || value.cleanup.terminalHistoryRetained !== true || value.cleanup.databaseRemoved !== true) fail('PASS_REJECTED');
  } else if (value.failure === null) fail('FAILURE_REJECTED');

  assertPrivacy(value);
  return structuredClone(value);
}
