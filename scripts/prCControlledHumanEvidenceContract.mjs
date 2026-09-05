import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const PREPARATION_SCHEMA_VERSION = 'governed-delivery-monitor-pr-c-controlled-human-preparation-2';
export const EDGE_MANIFEST_SCHEMA_VERSION = 'governed-delivery-monitor-pr-c-edge-deployment-manifest-2';
export const CHECKPOINT_SCHEMA_VERSION = 'governed-delivery-monitor-pr-c-human-checkpoint-3';
export const SESSION_SCHEMA_VERSION = 'governed-delivery-monitor-pr-c-human-session-2';
export const CONTROLLER_SCHEMA_VERSION = 'pr-c-controlled-human-controller-1';
export const PR_NUMBER = 264;
export const PR_BRANCH = 'controller/governed-delivery-monitor-pr-c-20260831';
export const ENVIRONMENT = 'hosted_nonproduction_pilot';
export const PR_C_WORKFLOW = '.github/workflows/transcript-flow-pr-c.yml';
export const PREPARE_WORKFLOW = '.github/workflows/pr264-controlled-human-prepare.yml';
export const QUIESCE_WORKFLOW = '.github/workflows/pr264-controlled-human-quiesce.yml';
export const CHECKPOINT_WORKFLOW = '.github/workflows/pr264-controlled-human-checkpoint.yml';
export const VERIFY_WORKFLOW = '.github/workflows/pr264-controlled-human-verify.yml';
export const EDGE_DEPLOY_WORKFLOW = '.github/workflows/pr264-controlled-human-edge-deploy.yml';
export const RECOVERY_WORKFLOW = '.github/workflows/pr264-controlled-human-recover.yml';
export const PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HMAC_DIGEST = /^hmac-sha256:[0-9a-f]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const SAFE_LABEL = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
let SERVER_EVENT_STEPS;

const loadServerActionCatalog = () => {
  const migration = readFileSync(path.resolve('supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql'), 'utf8');
  const marker = 'INSERT INTO public.pr_c_controlled_human_intent_catalog';
  const start = migration.indexOf(marker);
  const end = migration.indexOf(';', start);
  if (!(start >= 0 && end > start)) throw new Error('PR_C_CH_SERVER_ACTION_CATALOG_MISSING');
  const values = migration.slice(start, end);
  const rows = [];
  const rowPattern = /\('([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)',(?:'([^']+)'|NULL),(?:'([^']+)'|NULL),(?:'([^']+)'|NULL)\)/gu;
  for (const match of values.matchAll(rowPattern)) {
    rows.push(Object.freeze({
      checkpointId: match[1], stepId: match[2], observationKind: match[3], action: match[4], targetFamily: match[5],
      targetVersionDimension: match[6], effectFamily: match[7], transitionKind: match[8], selectorSchema: match[9],
      effectResolver: match[10], expectedOutcome: match[11] ?? null, expectedDenialCode: match[12] ?? null,
      replayOfStepId: match[13] ?? null,
    }));
  }
  if (rows.length !== 42) throw new Error('PR_C_CH_SERVER_ACTION_CATALOG_PARSE');
  return Object.freeze(rows);
};

// This projection is parsed from the authoritative SQL rows. Evidence code can
// consume the server-owned contract, but cannot maintain a parallel action map.
export const CONTROLLED_HUMAN_SERVER_ACTIONS = loadServerActionCatalog();
SERVER_EVENT_STEPS = new Set(CONTROLLED_HUMAN_SERVER_ACTIONS.filter(item => item.observationKind === 'server_event').map(item => item.stepId));
const serverActionByStep = new Map(CONTROLLED_HUMAN_SERVER_ACTIONS.map(item=>[`${item.checkpointId}\0${item.stepId}`,item]));
if(CONTROLLED_HUMAN_SERVER_ACTIONS.length!==42||SERVER_EVENT_STEPS.size!==34)throw new Error('PR_C_CH_SERVER_ACTION_CATALOG_DRIFT');

const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const assertObject = (value, code) => assert(value && typeof value === 'object' && !Array.isArray(value), code);
const assertExactKeys = (value, required, optional, code) => {
  assertObject(value, code);
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  assert(required.every(key => Object.hasOwn(value, key)), `${code}_REQUIRED`);
  assert(keys.every(key => allowed.has(key)), `${code}_UNKNOWN`);
};
const assertDigest = (value, code) => assert(typeof value === 'string' && DIGEST.test(value), code);
const assertSafeLabel = (value, code) => assert(typeof value === 'string' && SAFE_LABEL.test(value), code);
const assertTimestamp = (value, code) => assert(typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)), code);
const assertNonnegativeInteger = (value, code) => assert(Number.isSafeInteger(value) && value >= 0, code);
const sortedUnique = (values, code) => assert(Array.isArray(values) && JSON.stringify(values) === JSON.stringify([...new Set(values)].sort()), code);

export const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const sha256Digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export const canonicalDigest = value => sha256Digest(canonicalJson(value));

export const REQUIRED_EDGE_FUNCTIONS = Object.freeze([
  'assess-command',
  'assess-v2-command',
  'enterprise-intelligence-command',
  'enterprise-intelligence-query',
  'studio-artifact-command',
  'studio-private-artifact-command',
  'tenant-context',
  'tenant-session',
  'pr-c-controlled-human-synthetic-generation',
]);
export const CONTROLLED_HUMAN_MIGRATION_PATH = 'supabase/migrations/20260904120000_pr_c_controlled_human_exercise_authority.sql';
export const CONTROLLED_HUMAN_MIGRATION_TIP = '20260904120000';
export const CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP = '20260831062024';

export const HUMAN_DUTY_BY_PERSONA = Object.freeze({
  requester: 'requester',
  delivery_author: 'requester',
  delivery_consumer: 'requester',
  studio_reviewer: 'reviewer',
  delivery_target_acceptor: 'reviewer',
  delivery_reviewer: 'reviewer',
  monitor_viewer: 'reviewer',
  revoked_actor: 'reviewer',
  same_org_other_workspace: 'reviewer',
  cross_org_actor: 'reviewer',
  studio_approver: 'approver',
  delivery_approver: 'approver',
});

const step = (stepId, personaKey, negative = false) => Object.freeze({ stepId, personaKey, negative });

export const CONTROLLED_HUMAN_CATALOG = Object.freeze([
  {
    checkpointId: 'CH-01', journeyId: 'assess-only', humanRole: 'requester',
    testIds: ['PATH-001', 'SRCSET-004', 'SRCSET-006'],
    steps: [
      step('select-two-assess-transcripts', 'requester'), step('complete-remaining-assess-fields-manually', 'requester'),
      step('resolve-material-assess-conflict', 'requester'), step('approve-assess-result', 'studio_reviewer'),
      step('decline-studio-handoff', 'requester', true), step('verify-no-studio-resource', 'requester', true),
    ],
  },
  {
    checkpointId: 'CH-02', journeyId: 'studio-only', humanRole: 'requester',
    testIds: ['PATH-001', 'STUDIO-TR-001', 'STUDIO-TR-003', 'TEMPLATE-PRB-001'],
    steps: [
      step('select-two-different-studio-transcripts', 'requester'), step('select-custom-template', 'requester'),
      step('edit-structured-document', 'requester'), step('review-studio-document', 'studio_reviewer'),
      step('approve-studio-document', 'studio_approver'), step('stop-with-no-delivery-resource', 'requester', true),
    ],
  },
  {
    checkpointId: 'CH-03', journeyId: 'assess-plus-different-studio-sources', humanRole: 'requester',
    testIds: ['PATH-002', 'HANDOFF-PRB-001', 'SOURCEPKG-PRB-001', 'STUDIO-TR-004'],
    steps: [
      step('verify-approved-assess-handoff-ready', 'studio_approver'), step('add-disjoint-studio-supplements', 'requester'),
      step('request-studio-handoff', 'requester'),
      step('review-studio-handoff', 'studio_reviewer'), step('approve-studio-handoff', 'studio_approver'),
      step('accept-studio-handoff', 'requester'),
      step('generate-source-bound-document', 'requester'), step('approve-hybrid-studio-document', 'studio_approver'),
    ],
  },
  {
    checkpointId: 'CH-04', journeyId: 'full-governed', humanRole: 'requester',
    testIds: ['HANDOFF-001', 'HANDOFF-002', 'HANDOFF-003'],
    steps: [
      step('preview-approved-studio-handoff', 'requester'), step('request-exact-studio-handoff', 'requester'),
      step('verify-request-creates-no-delivery-package', 'requester', true), step('request-handoff-changes', 'delivery_target_acceptor', true),
      step('verify-changes-create-no-target-draft', 'delivery_target_acceptor', true), step('reject-new-exact-handoff-request', 'delivery_target_acceptor', true),
      step('verify-rejection-creates-no-target-draft', 'delivery_target_acceptor', true),
    ],
  },
  {
    checkpointId: 'CH-05', journeyId: 'full-governed', humanRole: 'approver',
    testIds: ['HANDOFF-004', 'HANDOFF-005', 'HANDOFF-007', 'HANDOFF-008', 'IDEMP-003'],
    steps: [
      step('request-fresh-exact-handoff', 'requester'), step('review-handoff-independently', 'delivery_target_acceptor'),
      step('approve-handoff-independently', 'delivery_approver'), step('consume-approved-handoff-once', 'delivery_consumer'),
      step('replay-consumption-same-target', 'delivery_consumer'), step('verify-replay-created-no-second-package', 'delivery_consumer', true),
    ],
  },
  {
    checkpointId: 'CH-06', journeyId: 'full-governed', humanRole: 'reviewer',
    testIds: ['DELIVERY-TR-001', 'DELIVERY-TR-002', 'DELIVERY-TR-003', 'DELIVERY-TR-004'],
    steps: [
      step('inspect-deterministic-item-citations', 'delivery_author'), step('edit-one-item-with-rationale', 'delivery_author'),
      step('compare-immutable-descendant-history', 'delivery_author'), step('decide-every-current-proposal', 'delivery_author'),
      step('verify-complete-bounded-item-set', 'delivery_reviewer'),
    ],
  },
  {
    checkpointId: 'CH-07', journeyId: 'full-governed', humanRole: 'reviewer',
    testIds: ['DELIVERY-TR-003', 'DELIVERY-TR-005', 'MONITOR-TR-001'],
    steps: [
      step('request-package-changes', 'delivery_reviewer'), step('verify-monitor-unchanged-while-blocked', 'delivery_reviewer', true),
      step('commit-only-explicitly-edited-descendants', 'delivery_author'), step('review-complete-revised-package', 'delivery_reviewer'),
      step('approve-exact-revised-package', 'delivery_approver'),
    ],
  },
  {
    checkpointId: 'CH-08', journeyId: 'full-governed', humanRole: 'approver',
    testIds: ['MONITOR-TR-001', 'IDEMP-003'],
    steps: [
      step('create-baseline-with-exact-package-selectors', 'delivery_approver'), step('replay-baseline-creation', 'delivery_approver'),
      step('verify-replay-same-baseline', 'delivery_approver'), step('verify-replay-created-no-second-baseline', 'delivery_approver', true),
    ],
  },
  {
    checkpointId: 'CH-09', journeyId: 'full-governed', humanRole: 'reviewer',
    testIds: ['MONITOR-TR-002', 'MONITOR-TR-003', 'MONITOR-TR-004'],
    steps: [
      step('compare-enterprise-and-primary-monitor', 'monitor_viewer'), step('verify-minimized-baseline-parity', 'monitor_viewer'),
      step('verify-no-hashes-or-approval-identities', 'monitor_viewer', true), step('verify-no-monitor-mutation-controls', 'monitor_viewer', true),
      step('verify-legacy-metrics-non-authoritative', 'monitor_viewer'),
    ],
  },
  {
    checkpointId: 'CH-10', journeyId: 'direct-planning', humanRole: 'requester',
    testIds: ['PATH-003', 'MONITOR-TR-004'],
    steps: [
      step('create-direct-studio-plan', 'requester'), step('handoff-direct-studio-plan', 'requester'),
      step('approve-direct-planning-package', 'delivery_approver'), step('verify-direct-plan-remains-not-assessed', 'monitor_viewer'),
    ],
  },
  {
    checkpointId: 'CH-11', journeyId: 'direct-delivery', humanRole: 'approver',
    testIds: ['PATH-004', 'DELIVERY-TR-006', 'MONITOR-TR-004'],
    steps: [
      step('create-manual-delivery-package', 'delivery_author'), step('review-manual-delivery-package', 'delivery_reviewer'),
      step('approve-manual-delivery-package', 'delivery_approver'), step('create-read-only-manual-baseline', 'delivery_approver'),
      step('verify-manual-path-remains-not-assessed', 'monitor_viewer'),
    ],
  },
  {
    checkpointId: 'CH-12', journeyId: 'negative', humanRole: 'reviewer',
    testIds: ['AUTH-002', 'HANDOFF-006', 'MONITOR-TR-003'],
    steps: [
      step('revoked-actor-projection-denied', 'revoked_actor', true), step('revoked-actor-mutation-denied', 'revoked_actor', true),
      step('same-org-other-workspace-projection-denied', 'same_org_other_workspace', true), step('same-org-other-workspace-mutation-denied', 'same_org_other_workspace', true),
      step('cross-org-projection-denied', 'cross_org_actor', true), step('cross-org-mutation-denied', 'cross_org_actor', true),
      step('verify-zero-negative-side-effects', 'delivery_reviewer', true),
    ],
  },
  {
    checkpointId: 'CH-13', journeyId: 'recovery', humanRole: 'approver',
    testIds: ['DELIVERY-TR-006', 'IDEMP-003', 'MONITOR-TR-003'],
    steps: [
      step('simulate-response-loss', 'delivery_author'), step('reload-and-reconcile-one-effect', 'delivery_author'),
      step('reject-stale-authorization', 'delivery_author', true), step('reject-stale-source-change', 'delivery_author', true),
      step('verify-history-readable-and-actions-absent', 'monitor_viewer'),
    ],
  },
  {
    checkpointId: 'CH-14', journeyId: 'recovery', humanRole: 'reviewer',
    testIds: ['A11Y-001', 'A11Y-002', 'A11Y-003', 'A11Y-004', 'PERF-001', 'PERF-002-B'],
    steps: [
      step('desktop-chrome-journey', 'delivery_author'), step('pixel-7-journey', 'delivery_author'),
      step('zoom-200-percent', 'delivery_author'), step('keyboard-only-handoff', 'requester'),
      step('keyboard-only-item-edit', 'delivery_author'), step('focused-rationale-error-summary', 'delivery_author'),
      step('preserve-invalid-input', 'delivery_author'), step('logical-focus-return', 'delivery_author'),
      step('non-color-status-and-citation-cues', 'monitor_viewer'), step('verify-no-horizontal-overflow', 'monitor_viewer'),
    ],
  },
].map(record => Object.freeze({ ...record, testIds: Object.freeze([...record.testIds].sort()), steps: Object.freeze(record.steps) })));

export const REQUIRED_JOURNEYS = Object.freeze([
  'assess-only', 'studio-only', 'assess-plus-different-studio-sources', 'full-governed',
  'direct-planning', 'direct-delivery', 'negative', 'recovery',
]);

export const CONTROLLED_HUMAN_EXECUTION_ORDER = Object.freeze([
  'CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-05', 'CH-06', 'CH-07', 'CH-08',
  'CH-09', 'CH-10', 'CH-11', 'CH-12', 'CH-14', 'CH-13',
]);

const catalogByCheckpoint = new Map(CONTROLLED_HUMAN_CATALOG.map(record => [record.checkpointId, record]));

export const buildHumanObservationTemplate = humanRole => {
  assert(['requester', 'reviewer', 'approver'].includes(humanRole), 'PR_C_CH_HUMAN_ROLE');
  return CONTROLLED_HUMAN_EXECUTION_ORDER.map(checkpointId => catalogByCheckpoint.get(checkpointId)).filter(record => record.steps.some(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === humanRole)).map(record => {
    return {
      checkpointId: record.checkpointId,
      journeyId: record.journeyId,
      testIds: record.testIds,
      steps: record.steps.filter(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === humanRole).map(item => ({
        stepId: item.stepId,
        personaKey: item.personaKey,
        outcome: 'not_run',
        startedAt: '',
        completedAt: '',
        browserArtifact: {
          artifactId: '',
          route: '',
          viewport: '',
          assertions: [],
          interactionSequence: [],
          serverAnchor: null,
          serverBinding: null,
        },
      })),
    };
  });
};

const recursivelyRejectUnsafeEvidence = (value, route = '$') => {
  if (Array.isArray(value)) return value.forEach((item, index) => recursivelyRejectUnsafeEvidence(item, `${route}[${index}]`));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert(!/^(?:email|password|secret|token|apiKey|serviceRoleKey|databaseUrl|databaseUri|projectRef|organizationId|workspaceId|userId|actorId|rawLog|logs|sourceText|transcript|customerData)$/iu.test(key), `PR_C_CH_UNSAFE_KEY:${route}.${key}`);
      recursivelyRejectUnsafeEvidence(child, `${route}.${key}`);
    }
    return;
  }
  if (typeof value !== 'string') return;
  assert(!/postgres(?:ql)?:\/\//iu.test(value), `PR_C_CH_DATABASE_URL:${route}`);
  assert(!/(?:^|\s)[^\s@]+@[^\s@]+\.[^\s@]+(?:$|\s)/u.test(value), `PR_C_CH_EMAIL:${route}`);
  assert(!/(?:sk-[A-Za-z0-9_-]{12,}|gsk_[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{20,}\.)/u.test(value), `PR_C_CH_CREDENTIAL:${route}`);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value), `PR_C_CH_RAW_UUID:${route}`);
  if (/https?:\/\//iu.test(value)) assert(value === PREVIEW_ORIGIN && /(?:\.origin|\.deployOrigin)$/u.test(route), `PR_C_CH_URL:${route}`);
  assert(!/[a-z0-9]{20}\.supabase\.co/iu.test(value), `PR_C_CH_PROJECT_REF:${route}`);
};

const sourceFiles = (directory, prefix) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap(name => {
    const absolute = path.join(directory, name);
    const relative = `${prefix}/${name}`.replaceAll('\\', '/');
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute, relative);
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name) || name === '.DS_Store') return [];
    return [relative];
  });
};

export const buildRequiredEdgeSourceManifest = root => REQUIRED_EDGE_FUNCTIONS.map(name => {
  const paths = [...sourceFiles(path.join(root, 'supabase/functions/_shared'), 'supabase/functions/_shared'),
    ...sourceFiles(path.join(root, `supabase/functions/${name}`), `supabase/functions/${name}`)].sort();
  assert(paths.some(relative => relative === `supabase/functions/${name}/index.ts`), `PR_C_CH_EDGE_ENTRY:${name}`);
  const records = paths.map(relative => ({ path: relative, digest: sha256Digest(readFileSync(path.join(root, relative))) }));
  return { name, sourceDigest: canonicalDigest(records) };
});

const edgeSigningPayload = manifest => {
  const { signature, ...payload } = manifest;
  return canonicalJson(payload);
};

const validateMigrationRecord = (record, expectedPhase, common, migrationDigest) => {
  assertObject(record, `PR_C_CH_MIGRATION_${expectedPhase.toUpperCase()}`);
  assert(record.contractVersion === CONTROLLER_SCHEMA_VERSION && record.phase === expectedPhase && record.status === 'passed', `PR_C_CH_MIGRATION_IDENTITY:${expectedPhase}`);
  assert(record.environmentClass === ENVIRONMENT && record.prNumber === PR_NUMBER, `PR_C_CH_MIGRATION_ENVIRONMENT:${expectedPhase}`);
  assert(record.releaseSha === common.exactHead && record.reviewHeadSha === common.exactHead, `PR_C_CH_MIGRATION_HEAD:${expectedPhase}`);
  assert(record.deployId === common.deployId && record.deployOrigin === PREVIEW_ORIGIN, `PR_C_CH_MIGRATION_PREVIEW:${expectedPhase}`);
  assert(record.exerciseDigest === common.exerciseDigest && record.targetFingerprint === common.targetFingerprint, `PR_C_CH_MIGRATION_SCOPE:${expectedPhase}`);
  assert(record.personaManifestDigest === common.personaManifestDigest && record.fixtureManifestDigest === common.fixtureManifestDigest, `PR_C_CH_MIGRATION_FIXTURE:${expectedPhase}`);
  assert(record.migrationDigest === migrationDigest && record.priorMigrationTip === CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP && record.migrationTip === CONTROLLED_HUMAN_MIGRATION_TIP, `PR_C_CH_MIGRATION_SOURCE:${expectedPhase}`);
  assert(record.providerRowCount === 0 && record.unexpectedDataCount === 0, `PR_C_CH_MIGRATION_COUNTS:${expectedPhase}`);
  assert(record.productionAuthorized === false && record.customerDataAuthorized === false && record.realProviderCallsAuthorized === false, `PR_C_CH_MIGRATION_STOP_STATES:${expectedPhase}`);
  if (expectedPhase === 'migration-preflight') assert(['exact_additive_apply', 'exact_replay'].includes(record.disposition), 'PR_C_CH_MIGRATION_DISPOSITION');
  if (expectedPhase === 'migration-apply') assert(typeof record.replayed === 'boolean', 'PR_C_CH_MIGRATION_REPLAY');
  recursivelyRejectUnsafeEvidence(record);
};

const buildMigrationBinding = ({ root, migrationRecords, common }) => {
  assert(Array.isArray(migrationRecords) && migrationRecords.length === 3, 'PR_C_CH_MIGRATION_PHASE_SET');
  const phases = ['migration-preflight', 'migration-apply', 'migration-verify'];
  const byPhase = new Map(migrationRecords.map(record => [record.phase, record]));
  assert(byPhase.size === phases.length && phases.every(phase => byPhase.has(phase)), 'PR_C_CH_MIGRATION_PHASE_SET');
  const sourceDigest = sha256Digest(readFileSync(path.join(root, CONTROLLED_HUMAN_MIGRATION_PATH)));
  phases.forEach(phase => validateMigrationRecord(byPhase.get(phase), phase, common, sourceDigest));
  return {
    sourcePath: CONTROLLED_HUMAN_MIGRATION_PATH,
    sourceDigest,
    priorMigrationTip: CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP,
    migrationTip: CONTROLLED_HUMAN_MIGRATION_TIP,
    phaseDigests: Object.fromEntries(phases.map(phase => [phase, canonicalDigest(byPhase.get(phase))])),
  };
};

const validateProviderFunctionObservation = (record, expectedName, code) => {
  assertExactKeys(record, ['name', 'identityDigest', 'bundleDigest', 'deploymentReceiptDigest', 'version', 'updatedAtDigest', 'runtimeStatus', 'observedAt'], [], code);
  assert(record.name === expectedName, `${code}_NAME`);
  for (const field of ['identityDigest', 'bundleDigest', 'deploymentReceiptDigest', 'updatedAtDigest']) assertDigest(record[field], `${code}_${field}`);
  assert(Number.isSafeInteger(record.version) && record.version > 0, `${code}_VERSION`);
  assert(Number.isSafeInteger(record.runtimeStatus) && record.runtimeStatus >= 200 && record.runtimeStatus < 500 && record.runtimeStatus !== 404, `${code}_RUNTIME`);
  assertTimestamp(record.observedAt, `${code}_OBSERVED_AT`);
};

export const createEdgeDeploymentManifest = ({ root, exactHead, targetFingerprint, exerciseDigest, deployId, personaManifestDigest, fixtureManifestDigest, migrationRecords, providerObservation, producer, signingKey }) => {
  assert(typeof signingKey === 'string' && signingKey.length >= 32, 'PR_C_CH_EDGE_SIGNING_KEY');
  const migration = buildMigrationBinding({
    root,
    migrationRecords,
    common: { exactHead, targetFingerprint, exerciseDigest, deployId, personaManifestDigest, fixtureManifestDigest },
  });
  assert(Array.isArray(providerObservation) && providerObservation.length === REQUIRED_EDGE_FUNCTIONS.length, 'PR_C_CH_EDGE_PROVIDER_SET');
  providerObservation.forEach((record, index) => validateProviderFunctionObservation(record, REQUIRED_EDGE_FUNCTIONS[index], `PR_C_CH_EDGE_PROVIDER:${index}`));
  const providerDigests = providerObservation.flatMap(record => [record.identityDigest, record.bundleDigest, record.deploymentReceiptDigest, record.updatedAtDigest]);
  assert(new Set(providerDigests).size === providerDigests.length, 'PR_C_CH_EDGE_PROVIDER_DIGEST_REUSE');
  const unsigned = {
    schemaVersion: EDGE_MANIFEST_SCHEMA_VERSION,
    environment: ENVIRONMENT,
    exactHead,
    targetFingerprint,
    exerciseDigest,
    productionAuthorized: false,
    customerDataAuthorized: false,
    realProviderCallsAuthorized: false,
    producer,
    migration,
    functions: buildRequiredEdgeSourceManifest(root).map((record, index) => ({
      ...record,
      deploymentStatus: 'provider_attested_runtime_reachable',
      provider: providerObservation[index],
    })),
  };
  return { ...unsigned, signature: `hmac-sha256:${hmac(signingKey, edgeSigningPayload(unsigned))}` };
};

export const validateEdgeDeploymentManifest = (manifest, { root, exactHead, targetFingerprint, exerciseDigest, producer, signingKey }) => {
  assertExactKeys(manifest,
    ['schemaVersion', 'environment', 'exactHead', 'targetFingerprint', 'exerciseDigest', 'productionAuthorized', 'customerDataAuthorized', 'realProviderCallsAuthorized', 'producer', 'migration', 'functions', 'signature'],
    [], 'PR_C_CH_EDGE_MANIFEST');
  assert(manifest.schemaVersion === EDGE_MANIFEST_SCHEMA_VERSION, 'PR_C_CH_EDGE_SCHEMA');
  assert(manifest.environment === ENVIRONMENT, 'PR_C_CH_EDGE_ENVIRONMENT');
  assert(manifest.exactHead === exactHead && SHA.test(exactHead), 'PR_C_CH_EDGE_HEAD');
  assert(manifest.targetFingerprint === targetFingerprint && DIGEST.test(targetFingerprint), 'PR_C_CH_EDGE_TARGET');
  assert(manifest.exerciseDigest === exerciseDigest && DIGEST.test(exerciseDigest), 'PR_C_CH_EDGE_EXERCISE');
  assert(manifest.productionAuthorized === false && manifest.customerDataAuthorized === false && manifest.realProviderCallsAuthorized === false, 'PR_C_CH_EDGE_STOP_STATES');
  assertExactKeys(manifest.producer, ['workflowPath', 'event', 'runId', 'runAttempt', 'conclusion', 'artifactName'], [], 'PR_C_CH_EDGE_PRODUCER');
  assert(manifest.producer.workflowPath === EDGE_DEPLOY_WORKFLOW && manifest.producer.event === 'pull_request' && RUN_ID.test(manifest.producer.runId) && Number.isSafeInteger(manifest.producer.runAttempt) && manifest.producer.runAttempt > 0 && manifest.producer.conclusion === 'success', 'PR_C_CH_EDGE_PRODUCER_IDENTITY');
  assertSafeLabel(manifest.producer.artifactName, 'PR_C_CH_EDGE_ARTIFACT_NAME');
  if (producer) assert(canonicalJson(manifest.producer) === canonicalJson(producer), 'PR_C_CH_EDGE_PRODUCER_BINDING');
  assertExactKeys(manifest.migration, ['sourcePath', 'sourceDigest', 'priorMigrationTip', 'migrationTip', 'phaseDigests'], [], 'PR_C_CH_EDGE_MIGRATION');
  assert(manifest.migration.sourcePath === CONTROLLED_HUMAN_MIGRATION_PATH
    && manifest.migration.sourceDigest === sha256Digest(readFileSync(path.join(root, CONTROLLED_HUMAN_MIGRATION_PATH)))
    && manifest.migration.priorMigrationTip === CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP
    && manifest.migration.migrationTip === CONTROLLED_HUMAN_MIGRATION_TIP, 'PR_C_CH_EDGE_MIGRATION_SOURCE');
  assertExactKeys(manifest.migration.phaseDigests, ['migration-preflight', 'migration-apply', 'migration-verify'], [], 'PR_C_CH_EDGE_MIGRATION_PHASES');
  Object.values(manifest.migration.phaseDigests).forEach(value => assertDigest(value, 'PR_C_CH_EDGE_MIGRATION_PHASE_DIGEST'));
  assert(Array.isArray(manifest.functions), 'PR_C_CH_EDGE_FUNCTIONS');
  const expected = buildRequiredEdgeSourceManifest(root);
  assert(JSON.stringify(manifest.functions.map(record => record.name)) === JSON.stringify(REQUIRED_EDGE_FUNCTIONS), 'PR_C_CH_EDGE_FUNCTION_SET');
  for (const [index, record] of manifest.functions.entries()) {
    assertExactKeys(record, ['name', 'sourceDigest', 'deploymentStatus', 'provider'], [], `PR_C_CH_EDGE_FUNCTION:${index}`);
    assert(record.name === expected[index].name, `PR_C_CH_EDGE_FUNCTION_NAME:${index}`);
    assert(record.sourceDigest === expected[index].sourceDigest, `PR_C_CH_EDGE_SOURCE_DIGEST:${record.name}`);
    assert(record.deploymentStatus === 'provider_attested_runtime_reachable', `PR_C_CH_EDGE_DEPLOYMENT_STATUS:${record.name}`);
    validateProviderFunctionObservation(record.provider, record.name, `PR_C_CH_EDGE_PROVIDER:${record.name}`);
  }
  const providerDigests = manifest.functions.flatMap(record => [record.provider.identityDigest, record.provider.bundleDigest, record.provider.deploymentReceiptDigest, record.provider.updatedAtDigest]);
  assert(new Set(providerDigests).size === providerDigests.length, 'PR_C_CH_EDGE_PROVIDER_DIGEST_REUSE');
  assert(typeof signingKey === 'string' && signingKey.length >= 32 && HMAC_DIGEST.test(manifest.signature), 'PR_C_CH_EDGE_SIGNATURE_FORMAT');
  const actual = Buffer.from(manifest.signature.slice('hmac-sha256:'.length), 'hex');
  const expectedSignature = Buffer.from(hmac(signingKey, edgeSigningPayload(manifest)), 'hex');
  assert(actual.length === expectedSignature.length && timingSafeEqual(actual, expectedSignature), 'PR_C_CH_EDGE_SIGNATURE');
  recursivelyRejectUnsafeEvidence(manifest);
  return manifest;
};

const validateControllerRecord = (record, expectedPhase, common) => {
  assertObject(record, `PR_C_CH_CONTROLLER_${expectedPhase.toUpperCase()}`);
  assert(record.contractVersion === CONTROLLER_SCHEMA_VERSION, `PR_C_CH_CONTROLLER_SCHEMA:${expectedPhase}`);
  assert(record.phase === expectedPhase, `PR_C_CH_CONTROLLER_PHASE:${expectedPhase}`);
  assert(record.status === 'passed', `PR_C_CH_CONTROLLER_STATUS:${expectedPhase}`);
  assert(record.releaseSha === common.exactHead && record.reviewHeadSha === common.exactHead, `PR_C_CH_CONTROLLER_HEAD:${expectedPhase}`);
  assert(record.prNumber === PR_NUMBER, `PR_C_CH_CONTROLLER_PR:${expectedPhase}`);
  assert(record.deployId === common.deployId && record.deployOrigin === PREVIEW_ORIGIN, `PR_C_CH_CONTROLLER_PREVIEW:${expectedPhase}`);
  assert(record.exerciseDigest === common.exerciseDigest && record.targetFingerprint === common.targetFingerprint && record.publicTargetDigest === common.publicTargetDigest, `PR_C_CH_CONTROLLER_SCOPE:${expectedPhase}`);
  assert(record.personaManifestDigest === common.personaManifestDigest && record.fixtureManifestDigest === common.fixtureManifestDigest, `PR_C_CH_CONTROLLER_FIXTURE:${expectedPhase}`);
  assert(record.productionAuthorized === false && record.customerDataAuthorized === false && record.realProviderCallsAuthorized === false, `PR_C_CH_CONTROLLER_STOP_STATES:${expectedPhase}`);
  if (expectedPhase === 'preflight') {
    assert(['dedicated_empty', 'exact_replay'].includes(record.disposition) && record.unexpectedDataCount === 0 && record.providerRowCount === 0, 'PR_C_CH_CONTROLLER_PREFLIGHT_COUNTS');
  } else if (expectedPhase === 'plan') {
    assert(record.personaCount === 12 && record.featureFlagCount === 11
      && record.seedStudioArtifactCount === 2 && record.eligibleStudioArtifactCount === 2
      && record.seedPackageCount === 2 && record.seedBaselineCount === 1
      && Array.isArray(record.operations) && Array.isArray(record.deprovisionOperations), 'PR_C_CH_CONTROLLER_PLAN_COUNTS');
  } else if (expectedPhase === 'apply') {
    assert(record.personaCount === 12 && record.studioArtifactCount === 2 && record.eligibleStudioArtifactCount === 2
      && record.packageCount === 2 && record.baselineCount === 1 && record.lifecycle === 'active'
      && record.concurrencyVersion === 1 && record.providerRowCount === 0 && record.zeroEgress === true
      && [0, 12].includes(record.authUsersCreated), 'PR_C_CH_CONTROLLER_APPLY_COUNTS');
  } else if (expectedPhase === 'verify') {
    assert(record.personaCount === 12 && record.activeMembershipCount === 11
      && record.studioArtifactCount === 2 && record.eligibleStudioArtifactCount === 2
      && record.packageCount === 2 && record.baselineCount === 1 && record.providerRowCount === 0
      && record.lifecycle === 'active' && record.concurrencyVersion === 1 && record.featureFlagCount === 11
      && record.zeroEgress === true && record.unexpectedDataCount === 0, 'PR_C_CH_CONTROLLER_VERIFY_COUNTS');
  } else if (expectedPhase === 'deprovision') {
    assert(record.lifecycle === 'deprovisioned' && record.featureFlagCountEnabled === 0 && record.runtimeControlReadOnlyCount === 2
      && record.runtimeControlProviderEnabledCount === 0 && record.activeMembershipCount === 0 && record.activeProfileCount === 0
      && record.activeOrganizationCount === 0 && record.activeWorkspaceCount === 0 && record.activePilotEnvironmentCount === 0
      && record.activePilotTenantCount === 0 && record.activeSessionCount === 0 && record.boundPersonaCount === 12
      && record.immutableHistoryRetained === true && record.domainRowsDeleted === 0, 'PR_C_CH_CONTROLLER_DEPROVISION_COUNTS');
    for (const field of ['postInspectionDigest', 'immutableHistoryDigest', 'quiescedHistoryDigest', 'operationEventDigest']) assertDigest(record[field], `PR_C_CH_CONTROLLER_DEPROVISION_${field}`);
    validateSafetyObservation(record.safety, 'PR_C_CH_CONTROLLER_DEPROVISION_SAFETY');
  } else if (expectedPhase === 'post-deprovision-verify') {
    assert(record.lifecycle === 'deprovisioned' && record.replayed === true && record.featureFlagCountEnabled === 0
      && record.runtimeControlReadOnlyCount === 2 && record.runtimeControlProviderEnabledCount === 0
      && record.activeMembershipCount === 0 && record.activeProfileCount === 0 && record.activeOrganizationCount === 0
      && record.activeWorkspaceCount === 0 && record.activePilotEnvironmentCount === 0 && record.activePilotTenantCount === 0
      && record.activeSessionCount === 0 && record.boundPersonaCount === 12 && record.immutableHistoryRetained === true
      && record.domainRowsDeleted === 0, 'PR_C_CH_CONTROLLER_POST_DEPROVISION_COUNTS');
    for (const field of ['postInspectionDigest', 'immutableHistoryDigest', 'operationEventDigest']) assertDigest(record[field], `PR_C_CH_CONTROLLER_POST_DEPROVISION_${field}`);
    validateSafetyObservation(record.safety, 'PR_C_CH_CONTROLLER_POST_DEPROVISION_SAFETY');
  } else if (expectedPhase === 'quiesce') {
    assert(record.lifecycle === 'read_only' && record.featureFlagCountEnabled === 0 && record.runtimeControlReadOnlyCount === 2
      && record.runtimeControlProviderEnabledCount === 0, 'PR_C_CH_CONTROLLER_QUIESCE');
    for (const field of ['operationEventDigest', 'immutableHistoryDigest']) assertDigest(record[field], `PR_C_CH_CONTROLLER_QUIESCE_${field}`);
    assertTimestamp(record.transitionedAt, 'PR_C_CH_CONTROLLER_QUIESCE_TRANSITION');
  }
  recursivelyRejectUnsafeEvidence(record);
};

export const validateQuiesceRecord = (preparation, quiesceRecord) => {
  validatePreparationEvidence(preparation);
  validateControllerRecord(quiesceRecord, 'quiesce', {
    exactHead: preparation.exactHead,
    deployId: preparation.preview.deployId,
    exerciseDigest: preparation.backend.exerciseDigest,
    targetFingerprint: preparation.backend.targetFingerprint,
    publicTargetDigest: preparation.backend.publicTargetDigest,
    personaManifestDigest: preparation.backend.personaManifestDigest,
    fixtureManifestDigest: preparation.backend.fixtureManifestDigest,
  });
  return quiesceRecord;
};

export const buildPreparationEvidence = ({ root, exactHead, github, preview, controllerRecords, edgeDeployment, edgeProducer, edgeSigningKey, edgeArtifactDigest, createdAt }) => {
  assert(SHA.test(exactHead), 'PR_C_CH_PREPARATION_HEAD');
  assertExactKeys(github, ['workflowPath', 'runId', 'runAttempt', 'conclusion', 'artifactName', 'artifactDigest'], [], 'PR_C_CH_GITHUB');
  assert(github.workflowPath === PR_C_WORKFLOW && RUN_ID.test(String(github.runId)) && Number.isSafeInteger(github.runAttempt) && github.runAttempt > 0 && github.conclusion === 'success', 'PR_C_CH_GITHUB_IDENTITY');
  assertSafeLabel(github.artifactName, 'PR_C_CH_GITHUB_ARTIFACT_NAME');
  assertDigest(github.artifactDigest, 'PR_C_CH_GITHUB_ARTIFACT_DIGEST');
  assertExactKeys(preview, ['origin', 'deployId', 'releaseSha', 'context', 'reviewId', 'siteName', 'environment'], [], 'PR_C_CH_PREVIEW');
  assert(preview.origin === PREVIEW_ORIGIN && DEPLOY_ID.test(preview.deployId) && preview.releaseSha === exactHead, 'PR_C_CH_PREVIEW_IDENTITY');
  assert(preview.context === 'deploy-preview' && preview.reviewId === PR_NUMBER && preview.siteName === 'avalaos-pilot' && preview.environment === ENVIRONMENT, 'PR_C_CH_PREVIEW_BOUNDARY');
  assert(Array.isArray(controllerRecords) && controllerRecords.length === 4, 'PR_C_CH_CONTROLLER_PHASE_SET');
  const byPhase = new Map(controllerRecords.map(record => [record.phase, record]));
  assert(byPhase.size === 4 && ['preflight', 'plan', 'apply', 'verify'].every(phase => byPhase.has(phase)), 'PR_C_CH_CONTROLLER_PHASE_SET');
  const verify = byPhase.get('verify');
  const common = {
    exactHead, deployId: preview.deployId, exerciseDigest: verify.exerciseDigest, targetFingerprint: verify.targetFingerprint, publicTargetDigest: verify.publicTargetDigest,
    personaManifestDigest: verify.personaManifestDigest, fixtureManifestDigest: verify.fixtureManifestDigest,
  };
  for (const phase of ['preflight', 'plan', 'apply', 'verify']) validateControllerRecord(byPhase.get(phase), phase, common);
  assertDigest(common.exerciseDigest, 'PR_C_CH_EXERCISE_DIGEST');
  assertDigest(common.targetFingerprint, 'PR_C_CH_TARGET_FINGERPRINT');
  assertDigest(common.personaManifestDigest, 'PR_C_CH_PERSONA_DIGEST');
  assertDigest(common.fixtureManifestDigest, 'PR_C_CH_FIXTURE_DIGEST');
  validateEdgeDeploymentManifest(edgeDeployment, { root, exactHead, targetFingerprint: common.targetFingerprint, exerciseDigest: common.exerciseDigest, producer: edgeProducer, signingKey: edgeSigningKey });
  assertDigest(edgeArtifactDigest, 'PR_C_CH_EDGE_ARTIFACT_DIGEST');
  assertTimestamp(createdAt, 'PR_C_CH_PREPARATION_TIMESTAMP');
  const result = {
    schemaVersion: PREPARATION_SCHEMA_VERSION,
    status: 'ready_for_controlled_human',
    controlledHumanDisposition: 'not_run',
    prNumber: PR_NUMBER,
    branch: PR_BRANCH,
    exactHead,
    environment: ENVIRONMENT,
    github,
    preview,
    backend: {
      targetFingerprint: common.targetFingerprint,
      publicTargetDigest: common.publicTargetDigest,
      exerciseDigest: common.exerciseDigest,
      personaManifestDigest: common.personaManifestDigest,
      fixtureManifestDigest: common.fixtureManifestDigest,
      migrationTip: verify.migrationTip,
      seedCounts: {
        studioArtifactCount: verify.studioArtifactCount,
        eligibleStudioArtifactCount: verify.eligibleStudioArtifactCount,
        packageCount: verify.packageCount,
        approvedBaselineCount: verify.baselineCount,
      },
      concurrencyVersion: verify.concurrencyVersion,
      controllerPhaseDigests: Object.fromEntries(['preflight', 'plan', 'apply', 'verify'].map(phase => [phase, canonicalDigest(byPhase.get(phase))])),
      productionAuthorized: false,
      customerDataAuthorized: false,
      realProviderCallsAuthorized: false,
      realProviderCallCount: 0,
      providerEgressCount: 0,
    },
    edgeDeployment: { manifestDigest: canonicalDigest(edgeDeployment), artifactDigest: edgeArtifactDigest, producer: edgeDeployment.producer, migration: edgeDeployment.migration, functions: edgeDeployment.functions },
    createdAt,
  };
  recursivelyRejectUnsafeEvidence(result);
  return result;
};

export const validatePreparationEvidence = preparation => {
  assertExactKeys(preparation, ['schemaVersion', 'status', 'controlledHumanDisposition', 'prNumber', 'branch', 'exactHead', 'environment', 'github', 'preview', 'backend', 'edgeDeployment', 'createdAt'], [], 'PR_C_CH_PREPARATION');
  assert(preparation.schemaVersion === PREPARATION_SCHEMA_VERSION && preparation.status === 'ready_for_controlled_human' && preparation.controlledHumanDisposition === 'not_run', 'PR_C_CH_PREPARATION_STATUS');
  assert(preparation.prNumber === PR_NUMBER && preparation.branch === PR_BRANCH && SHA.test(preparation.exactHead) && preparation.environment === ENVIRONMENT, 'PR_C_CH_PREPARATION_SCOPE');
  assertExactKeys(preparation.github, ['workflowPath', 'runId', 'runAttempt', 'conclusion', 'artifactName', 'artifactDigest'], [], 'PR_C_CH_PREPARATION_GITHUB_RECORD');
  assert(preparation.github.workflowPath === PR_C_WORKFLOW && RUN_ID.test(String(preparation.github.runId)) && Number.isSafeInteger(preparation.github.runAttempt) && preparation.github.runAttempt > 0 && preparation.github.conclusion === 'success', 'PR_C_CH_PREPARATION_GITHUB');
  assertSafeLabel(preparation.github.artifactName, 'PR_C_CH_PREPARATION_ARTIFACT_NAME');
  assertDigest(preparation.github.artifactDigest, 'PR_C_CH_PREPARATION_ARTIFACT');
  assertExactKeys(preparation.preview, ['origin', 'deployId', 'releaseSha', 'context', 'reviewId', 'siteName', 'environment'], [], 'PR_C_CH_PREPARATION_PREVIEW_RECORD');
  assert(preparation.preview.origin === PREVIEW_ORIGIN && DEPLOY_ID.test(preparation.preview.deployId) && preparation.preview.releaseSha === preparation.exactHead && preparation.preview.context === 'deploy-preview' && preparation.preview.reviewId === PR_NUMBER && preparation.preview.siteName === 'avalaos-pilot' && preparation.preview.environment === ENVIRONMENT, 'PR_C_CH_PREPARATION_PREVIEW');
  assertExactKeys(preparation.backend, ['targetFingerprint', 'publicTargetDigest', 'exerciseDigest', 'personaManifestDigest', 'fixtureManifestDigest', 'migrationTip', 'seedCounts', 'concurrencyVersion', 'controllerPhaseDigests', 'productionAuthorized', 'customerDataAuthorized', 'realProviderCallsAuthorized', 'realProviderCallCount', 'providerEgressCount'], [], 'PR_C_CH_PREPARATION_BACKEND_RECORD');
  for (const key of ['targetFingerprint', 'publicTargetDigest', 'exerciseDigest', 'personaManifestDigest', 'fixtureManifestDigest']) assertDigest(preparation.backend[key], `PR_C_CH_PREPARATION_BACKEND:${key}`);
  assertExactKeys(preparation.backend.seedCounts, ['studioArtifactCount', 'eligibleStudioArtifactCount', 'packageCount', 'approvedBaselineCount'], [], 'PR_C_CH_PREPARATION_SEED_COUNTS');
  assert(preparation.backend.seedCounts.studioArtifactCount === 2
    && preparation.backend.seedCounts.eligibleStudioArtifactCount === 2
    && preparation.backend.seedCounts.packageCount === 2
    && preparation.backend.seedCounts.approvedBaselineCount === 1
    && preparation.backend.concurrencyVersion === 1, 'PR_C_CH_PREPARATION_SEED_BINDING');
  assert(preparation.backend.productionAuthorized === false && preparation.backend.customerDataAuthorized === false && preparation.backend.realProviderCallsAuthorized === false && preparation.backend.realProviderCallCount === 0 && preparation.backend.providerEgressCount === 0, 'PR_C_CH_PREPARATION_STOP_STATES');
  assertExactKeys(preparation.backend.controllerPhaseDigests, ['preflight', 'plan', 'apply', 'verify'], [], 'PR_C_CH_PREPARATION_CONTROLLER_DIGESTS');
  Object.values(preparation.backend.controllerPhaseDigests).forEach(value => assertDigest(value, 'PR_C_CH_PREPARATION_CONTROLLER_DIGEST'));
  assertExactKeys(preparation.edgeDeployment, ['manifestDigest', 'artifactDigest', 'producer', 'migration', 'functions'], [], 'PR_C_CH_PREPARATION_EDGE_RECORD');
  assertDigest(preparation.edgeDeployment.manifestDigest, 'PR_C_CH_PREPARATION_EDGE_DIGEST');
  assertDigest(preparation.edgeDeployment.artifactDigest, 'PR_C_CH_PREPARATION_EDGE_ARTIFACT_DIGEST');
  assertExactKeys(preparation.edgeDeployment.producer, ['workflowPath', 'event', 'runId', 'runAttempt', 'conclusion', 'artifactName'], [], 'PR_C_CH_PREPARATION_EDGE_PRODUCER');
  assert(preparation.edgeDeployment.producer.workflowPath === EDGE_DEPLOY_WORKFLOW && preparation.edgeDeployment.producer.event === 'pull_request' && preparation.edgeDeployment.producer.conclusion === 'success' && RUN_ID.test(preparation.edgeDeployment.producer.runId) && Number.isSafeInteger(preparation.edgeDeployment.producer.runAttempt) && preparation.edgeDeployment.producer.runAttempt > 0, 'PR_C_CH_PREPARATION_EDGE_PRODUCER_IDENTITY');
  assertExactKeys(preparation.edgeDeployment.migration, ['sourcePath', 'sourceDigest', 'priorMigrationTip', 'migrationTip', 'phaseDigests'], [], 'PR_C_CH_PREPARATION_MIGRATION');
  assert(preparation.edgeDeployment.migration.sourcePath === CONTROLLED_HUMAN_MIGRATION_PATH
    && preparation.edgeDeployment.migration.sourceDigest === sha256Digest(readFileSync(path.resolve(CONTROLLED_HUMAN_MIGRATION_PATH)))
    && preparation.edgeDeployment.migration.priorMigrationTip === CONTROLLED_HUMAN_PRIOR_MIGRATION_TIP
    && preparation.edgeDeployment.migration.migrationTip === CONTROLLED_HUMAN_MIGRATION_TIP, 'PR_C_CH_PREPARATION_MIGRATION_SOURCE');
  assertDigest(preparation.edgeDeployment.migration.sourceDigest, 'PR_C_CH_PREPARATION_MIGRATION_DIGEST');
  assertExactKeys(preparation.edgeDeployment.migration.phaseDigests, ['migration-preflight', 'migration-apply', 'migration-verify'], [], 'PR_C_CH_PREPARATION_MIGRATION_PHASES');
  Object.values(preparation.edgeDeployment.migration.phaseDigests).forEach(value => assertDigest(value, 'PR_C_CH_PREPARATION_MIGRATION_PHASE_DIGEST'));
  assert(Array.isArray(preparation.edgeDeployment.functions) && preparation.edgeDeployment.functions.length === REQUIRED_EDGE_FUNCTIONS.length, 'PR_C_CH_PREPARATION_EDGE_FUNCTIONS');
  assert(JSON.stringify(preparation.edgeDeployment.functions.map(record => record.name)) === JSON.stringify(REQUIRED_EDGE_FUNCTIONS), 'PR_C_CH_PREPARATION_EDGE_FUNCTION_SET');
  for (const record of preparation.edgeDeployment.functions) {
    assertExactKeys(record, ['name', 'sourceDigest', 'deploymentStatus', 'provider'], [], `PR_C_CH_PREPARATION_EDGE:${record.name}`);
    assertDigest(record.sourceDigest, `PR_C_CH_PREPARATION_EDGE_SOURCE:${record.name}`);
    assert(record.deploymentStatus === 'provider_attested_runtime_reachable', `PR_C_CH_PREPARATION_EDGE_DEPLOYED:${record.name}`);
    validateProviderFunctionObservation(record.provider, record.name, `PR_C_CH_PREPARATION_EDGE_PROVIDER:${record.name}`);
  }
  assertTimestamp(preparation.createdAt, 'PR_C_CH_PREPARATION_CREATED');
  recursivelyRejectUnsafeEvidence(preparation);
  return preparation;
};

const expectedDutySteps = humanRole => CONTROLLED_HUMAN_EXECUTION_ORDER.map(checkpointId => catalogByCheckpoint.get(checkpointId)).flatMap(record => record.steps
  .filter(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === humanRole)
  .map(item => ({ ...item, checkpointId: record.checkpointId, journeyId: record.journeyId, testIds: record.testIds })));

const serverExpectation = expected => {
  const actionContract=expected.checkpointId
    ? serverActionByStep.get(`${expected.checkpointId}\0${expected.stepId}`)
    : CONTROLLED_HUMAN_SERVER_ACTIONS.find(item=>item.stepId===expected.stepId);
  if(actionContract)return {observationKind:actionContract.observationKind,result:actionContract.observationKind==='negative_attempt'?'denied':'succeeded',denialIntent:actionContract.observationKind==='negative_attempt',zeroEffect:actionContract.observationKind==='negative_attempt',actionContract};
  if (expected.negative && /^(?:verify-|decline-|stop-with-no-)/u.test(expected.stepId)) return { observationKind: 'no_effect', result: 'no_effect_observed', zeroEffect: true };
  if (SERVER_EVENT_STEPS.has(expected.stepId)) return { observationKind: 'server_event', result: 'succeeded', zeroEffect: false };
  return { observationKind: 'human_attestation', result: 'attested', zeroEffect: false };
};

export const buildServerObserverRequest = (humanRole, observations) => ({
  humanRole,
  steps: observations.flatMap(record => record.steps.map(stepRecord => ({
    checkpointId: record.checkpointId,
    stepId: stepRecord.stepId,
    personaKey: stepRecord.personaKey,
    startedAt: stepRecord.startedAt,
    completedAt: stepRecord.completedAt,
    attemptDigest: sha256Digest(Buffer.from(canonicalJson(stepRecord.browserArtifact), 'utf8')),
    bindingToken: stepRecord.browserArtifact.serverBinding?.bindingToken ?? null,
  }))),
});

const STEP_ANCHOR_VERSION = 'pr-c-controlled-human-step-anchor-1';
const STEP_ANCHOR_FIELDS = ['contractVersion','stepId','action','targetFamily','targetDigest','expectedVersion','transitionKind','selectorDigest','intentDigest','requestDigest','challengeToken','anchoredAt'];
const STEP_BINDING_VERSION = 'pr-c-controlled-human-step-binding-3';
const STEP_BINDING_FIELDS = ['contractVersion', 'stepId', 'action', 'result', 'resourceFamily', 'resourceDigest', 'expectedVersion', 'observedVersion', 'requestDigest', 'receiptDigest', 'auditDigest', 'intentDigest', 'denialCodeDigest', 'bindingToken', 'anchorToken', 'causalParentBindingToken', 'causalParentResourceDigest', 'causalLineageDigest', 'issuedAt'];

const validateStepAnchor = (anchor, expected, code) => {
  const expectation=serverExpectation(expected);const required=expectation.observationKind==='server_event'||expectation.denialIntent;
  if(!required){assert(anchor===null,`${code}_UNEXPECTED`);return null;}
  assertExactKeys(anchor,STEP_ANCHOR_FIELDS,[],code);
  assert(anchor.contractVersion===STEP_ANCHOR_VERSION&&anchor.stepId===expected.stepId,`${code}_IDENTITY`);
  assertSafeLabel(anchor.action,`${code}_ACTION`);assertSafeLabel(anchor.targetFamily,`${code}_TARGET_FAMILY`);
  for(const field of ['targetDigest','selectorDigest','intentDigest','requestDigest','challengeToken'])assertDigest(anchor[field],`${code}_${field}`);
  assertNonnegativeInteger(anchor.expectedVersion,`${code}_EXPECTED_VERSION`);
  const contract=expectation.actionContract;
  assert(contract&&anchor.action===contract.action&&anchor.targetFamily===contract.targetFamily&&anchor.transitionKind===contract.transitionKind,`${code}_CATALOG`);
  assert(['same','increment_one','create_one','create_zero','replay_existing'].includes(anchor.transitionKind),`${code}_TRANSITION`);assertTimestamp(anchor.anchoredAt,`${code}_ANCHORED_AT`);
  return anchor;
};

const validateStepBinding = (binding, expected, code) => {
  const expectation = serverExpectation(expected);
  const required = expectation.observationKind === 'server_event' || expectation.denialIntent;
  if (!required) {
    assert(binding === null, `${code}_UNEXPECTED`);
    return null;
  }
  assertExactKeys(binding, STEP_BINDING_FIELDS, [], code);
  assert(binding.contractVersion === STEP_BINDING_VERSION && binding.stepId === expected.stepId, `${code}_IDENTITY`);
  assertSafeLabel(binding.action, `${code}_ACTION`);
  assert(binding.result === expectation.result, `${code}_RESULT`);
  assertSafeLabel(binding.resourceFamily, `${code}_RESOURCE_FAMILY`);
  for (const field of ['resourceDigest', 'requestDigest', 'receiptDigest', 'auditDigest', 'intentDigest', 'denialCodeDigest', 'bindingToken','anchorToken','causalParentBindingToken','causalParentResourceDigest','causalLineageDigest']) assertDigest(binding[field], `${code}_${field}`);
  assertNonnegativeInteger(binding.expectedVersion, `${code}_EXPECTED_VERSION`);
  assertNonnegativeInteger(binding.observedVersion, `${code}_OBSERVED_VERSION`);
  assert(binding.expectedVersion >= 0 && binding.observedVersion >= 0, `${code}_VERSION_BINDING`);
  const contract=expectation.actionContract;
  assert(contract&&binding.action===contract.action&&binding.resourceFamily===(contract.observationKind==='negative_attempt'?contract.targetFamily:contract.effectFamily),`${code}_CATALOG`);
  assertTimestamp(binding.issuedAt, `${code}_ISSUED_AT`);
  return binding;
};

const validateBoundTransition = (anchor, binding, expected, code) => {
  assert(anchor.stepId===binding.stepId&&anchor.action===binding.action&&anchor.challengeToken===binding.anchorToken
    &&anchor.requestDigest===binding.requestDigest&&anchor.intentDigest===binding.intentDigest&&anchor.expectedVersion===binding.expectedVersion,`${code}_TWO_PHASE_IDENTITY`);
  const contract=serverExpectation(expected).actionContract;
  if(binding.result==='denied'||anchor.transitionKind==='same')assert(binding.observedVersion===anchor.expectedVersion&&binding.resourceFamily===anchor.targetFamily&&binding.resourceDigest===anchor.targetDigest,`${code}_SAME_TRANSITION`);
  else if(anchor.transitionKind==='increment_one')assert(binding.observedVersion===anchor.expectedVersion+1&&binding.resourceFamily===contract.effectFamily
    &&(contract.effectFamily!==contract.targetFamily||binding.resourceDigest===anchor.targetDigest),`${code}_INCREMENT_TRANSITION`);
  else if(anchor.transitionKind==='create_one')assert(binding.observedVersion===1&&binding.resourceFamily===contract.effectFamily,`${code}_CREATE_TRANSITION`);
  else if(anchor.transitionKind==='create_zero')assert(binding.observedVersion===0&&binding.resourceFamily===contract.effectFamily,`${code}_CREATE_ZERO_TRANSITION`);
  else assert(anchor.transitionKind==='replay_existing'&&binding.resourceFamily===contract.effectFamily&&binding.observedVersion>0,`${code}_REPLAY_TRANSITION`);
  assert(binding.observedVersion!==0||anchor.transitionKind==='create_zero',`${code}_ZERO_VERSION`);
};

export const validateControlledHumanProofPairs = (pairs, serverSteps) => {
  assert(Array.isArray(pairs)&&pairs.length===CONTROLLED_HUMAN_SERVER_ACTIONS.length,'PR_C_CH_AUTHENTIC_PAIR_COUNT');
  const expectedKeys=CONTROLLED_HUMAN_SERVER_ACTIONS.map(item=>`${item.checkpointId}\0${item.stepId}`).sort();
  const actualKeys=pairs.map(item=>`${item.checkpointId}\0${item.stepId}`).sort();
  assert(new Set(actualKeys).size===actualKeys.length&&JSON.stringify(actualKeys)===JSON.stringify(expectedKeys),'PR_C_CH_AUTHENTIC_PAIR_SET');
  const byStep=new Map();
  for(const [index,pair] of pairs.entries()){
    assertExactKeys(pair,['checkpointId','stepId','anchor','binding'],[],`PR_C_CH_AUTHENTIC_PAIR:${index}`);
    const contract=serverActionByStep.get(`${pair.checkpointId}\0${pair.stepId}`);
    assert(contract,`PR_C_CH_AUTHENTIC_PAIR:${index}_CATALOG`);
    const expected={checkpointId:pair.checkpointId,stepId:pair.stepId,negative:contract.observationKind==='negative_attempt'};
    const anchor=validateStepAnchor(pair.anchor,expected,`PR_C_CH_AUTHENTIC_PAIR:${index}_ANCHOR`);
    const binding=validateStepBinding(pair.binding,expected,`PR_C_CH_AUTHENTIC_PAIR:${index}_BINDING`);
    validateBoundTransition(anchor,binding,expected,`PR_C_CH_AUTHENTIC_PAIR:${index}`);
    byStep.set(`${pair.checkpointId}\0${pair.stepId}`,{contract,anchor,binding});
  }
  if(serverSteps!==undefined){
    assert(Array.isArray(serverSteps),'PR_C_CH_AUTHENTIC_SERVER_BINDING_SET');
    const observedByStep=new Map();
    for(const record of serverSteps){
      const key=`${record?.checkpointId}\0${record?.stepId}`;
      if(!byStep.has(key))continue;
      assert(!observedByStep.has(key),'PR_C_CH_AUTHENTIC_SERVER_BINDING_REUSE');
      observedByStep.set(key,record);
    }
    assert(observedByStep.size===pairs.length,'PR_C_CH_AUTHENTIC_SERVER_BINDING_SET');
    for(const [key,{binding}] of byStep){
      const observed=observedByStep.get(key);
      assertDigest(observed?.safeBindingDigest,'PR_C_CH_AUTHENTIC_SAFE_BINDING_DIGEST');
      assert(observed.safeBindingDigest===canonicalDigest(binding),'PR_C_CH_AUTHENTIC_SAFE_BINDING_MISMATCH');
    }
  }
  for(const record of byStep.values())if(record.contract.transitionKind==='replay_existing'){
    const original=byStep.get(`${record.contract.checkpointId}\0${record.contract.replayOfStepId}`);
    assert(original&&record.binding.resourceFamily===original.binding.resourceFamily
      &&record.binding.resourceDigest===original.binding.resourceDigest
      &&record.binding.observedVersion===original.binding.observedVersion
      &&record.binding.receiptDigest===original.binding.receiptDigest
      &&record.binding.auditDigest===original.binding.auditDigest
      &&record.binding.requestDigest!==original.binding.requestDigest
      &&record.binding.bindingToken!==original.binding.bindingToken,'PR_C_CH_AUTHENTIC_REPLAY_LINEAGE');
  }
  const ch03=stepId=>byStep.get(`CH-03\0${stepId}`)?.binding;
  const requested=ch03('request-studio-handoff');
  const reviewed=ch03('review-studio-handoff');
  const approved=ch03('approve-studio-handoff');
  const consumed=ch03('accept-studio-handoff');
  const generated=ch03('generate-source-bound-document');
  const hybridApproved=ch03('approve-hybrid-studio-document');
  assert(requested&&reviewed&&approved&&consumed&&generated&&hybridApproved,'PR_C_CH_AUTHENTIC_CH03_CHAIN_SET');
  assert(reviewed.causalParentBindingToken===requested.bindingToken
    &&reviewed.causalParentResourceDigest===requested.resourceDigest
    &&reviewed.causalLineageDigest===requested.causalLineageDigest,'PR_C_CH_AUTHENTIC_CH03_REVIEW_CHAIN');
  assert(approved.causalParentBindingToken===reviewed.bindingToken
    &&approved.causalParentResourceDigest===requested.resourceDigest
    &&approved.causalLineageDigest===requested.causalLineageDigest,'PR_C_CH_AUTHENTIC_CH03_APPROVAL_CHAIN');
  assert(consumed.causalParentBindingToken===approved.bindingToken
    &&consumed.causalParentResourceDigest===requested.resourceDigest,'PR_C_CH_AUTHENTIC_CH03_CONSUME_CHAIN');
  assert(generated.causalParentBindingToken===consumed.bindingToken
    &&generated.causalParentResourceDigest===consumed.resourceDigest
    &&generated.causalLineageDigest===consumed.causalLineageDigest,'PR_C_CH_AUTHENTIC_CH03_GENERATION_CHAIN');
  assert(hybridApproved.causalParentBindingToken===generated.bindingToken
    &&hybridApproved.causalParentResourceDigest===generated.resourceDigest
    &&hybridApproved.causalLineageDigest===generated.causalLineageDigest,'PR_C_CH_AUTHENTIC_CH03_HYBRID_APPROVAL_CHAIN');
  return pairs;
};

const validateBrowserArtifact = (artifact, expected, code) => {
  assertExactKeys(artifact, ['artifactId', 'route', 'viewport', 'assertions', 'interactionSequence', 'serverAnchor', 'serverBinding'], [], code);
  assertSafeLabel(artifact.artifactId, `${code}_ID`);
  assert(typeof artifact.route === 'string' && /^\/[a-z0-9/_?=&.-]{0,255}$/u.test(artifact.route), `${code}_ROUTE`);
  assertSafeLabel(artifact.viewport, `${code}_VIEWPORT`);
  sortedUnique(artifact.assertions, `${code}_ASSERTIONS`);
  assert(artifact.assertions.length > 0 && artifact.assertions.every(value => typeof value === 'string' && SAFE_LABEL.test(value)), `${code}_ASSERTIONS`);
  assert(Array.isArray(artifact.interactionSequence) && artifact.interactionSequence.length > 0 && artifact.interactionSequence.length <= 50
    && artifact.interactionSequence.every(value => typeof value === 'string' && SAFE_LABEL.test(value)), `${code}_INTERACTIONS`);
  const anchor=validateStepAnchor(artifact.serverAnchor,expected,`${code}_SERVER_ANCHOR`);
  const binding=validateStepBinding(artifact.serverBinding, expected, `${code}_SERVER_BINDING`);
  if(anchor&&binding)validateBoundTransition(anchor,binding,expected,code);
  const bytes = Buffer.from(canonicalJson(artifact), 'utf8');
  return { content: artifact, byteLength: bytes.length, digest: sha256Digest(bytes) };
};

const validateHumanStep = (observation, expected, code) => {
  assertExactKeys(observation, ['stepId', 'personaKey', 'outcome', 'startedAt', 'completedAt', 'browserArtifact'], [], code);
  assert(observation.stepId === expected.stepId && observation.personaKey === expected.personaKey, `${code}_IDENTITY`);
  assert(observation.outcome === 'passed', `${code}_OUTCOME`);
  assertTimestamp(observation.startedAt, `${code}_STARTED`);
  assertTimestamp(observation.completedAt, `${code}_COMPLETED`);
  assert(Date.parse(observation.completedAt) > Date.parse(observation.startedAt), `${code}_ORDER`);
  const artifact = validateBrowserArtifact(observation.browserArtifact, expected, `${code}_BROWSER`);
  const issuedAt = observation.browserArtifact.serverBinding?.issuedAt;
  const anchoredAt = observation.browserArtifact.serverAnchor?.anchoredAt;
  if (anchoredAt) assert(Date.parse(anchoredAt) >= Date.parse(observation.startedAt) && Date.parse(anchoredAt) < Date.parse(observation.completedAt), `${code}_ANCHOR_TIME_BOUNDARY`);
  if (issuedAt) assert(Date.parse(issuedAt) >= Date.parse(observation.startedAt) && Date.parse(issuedAt) <= Date.parse(observation.completedAt), `${code}_BINDING_TIME_BOUNDARY`);
  if(anchoredAt&&issuedAt)assert(Date.parse(anchoredAt)<=Date.parse(issuedAt),`${code}_TWO_PHASE_TIME_ORDER`);
  return artifact;
};

const validateObservedDeltas = (deltas, negative, code) => {
  const fields = ['receipt', 'audit', 'target', 'itemVersion', 'approval', 'baseline'];
  assertExactKeys(deltas, fields, [], code);
  fields.forEach(field => assertNonnegativeInteger(deltas[field], `${code}_${field}`));
  if (negative) assert(fields.every(field => deltas[field] === 0), `${code}_NEGATIVE_EFFECT`);
};

const validateSafetyObservation = (safety, code) => {
  const fields = ['providerEgress', 'realProviderCalls', 'customerDataRecords', 'externalUsers'];
  assertExactKeys(safety, fields, [], code);
  fields.forEach(field => assertNonnegativeInteger(safety[field], `${code}_${field}`));
  assert(fields.every(field => safety[field] === 0), `${code}_STOP_COUNT`);
};

const validateServerStep = (record, expected, browserBinding, code) => {
  assertExactKeys(record, ['checkpointId', 'stepId', 'personaKey', 'authenticatedPersonaDigest', 'capabilityDigest', 'scopeDigest', 'action', 'resourceKind', 'resourceFamily', 'humanAttemptDigest', 'bindingToken', 'safeBindingDigest', 'causalEventDigest', 'resourceDigest', 'expectedVersion', 'version', 'requestIdentityDigest', 'receiptDigest', 'auditDigest', 'observationKind', 'result', 'denialProofKind', 'denialCodeDigest', 'observedDeltas', 'safety', 'serverObservedAt', 'inspectionDigest'], [], code);
  assert(record.checkpointId === expected.checkpointId && record.stepId === expected.stepId && record.personaKey === expected.personaKey, `${code}_IDENTITY`);
  for (const field of ['authenticatedPersonaDigest', 'capabilityDigest', 'scopeDigest', 'humanAttemptDigest', 'bindingToken', 'safeBindingDigest', 'causalEventDigest', 'resourceDigest', 'requestIdentityDigest', 'receiptDigest', 'auditDigest', 'denialCodeDigest', 'inspectionDigest']) assertDigest(record[field], `${code}_${field}`);
  assertSafeLabel(record.action, `${code}_ACTION`);
  assertSafeLabel(record.resourceKind, `${code}_RESOURCE`);
  assertSafeLabel(record.resourceFamily, `${code}_RESOURCE_FAMILY`);
  assertNonnegativeInteger(record.expectedVersion, `${code}_EXPECTED_VERSION`);
  assertNonnegativeInteger(record.version, `${code}_VERSION`);
  const expectation = serverExpectation(expected);
  if (expectation.denialIntent) {
    assert(record.observationKind === 'negative_attempt' && record.result === 'denied'
      && ['denied_audit','server_denied_attempt'].includes(record.denialProofKind), `${code}_DENIAL_PROOF`);
  } else {
    assert(record.observationKind === expectation.observationKind && record.result === expectation.result && record.denialProofKind === 'not_applicable', `${code}_RESULT`);
  }
  validateObservedDeltas(record.observedDeltas, expectation.zeroEffect, `${code}_DELTAS`);
  if (expectation.observationKind === 'server_event') assert((record.version > 0 || expectation.actionContract?.transitionKind === 'create_zero')
    && (record.version !== 0 || expectation.actionContract?.transitionKind === 'create_zero')
    && record.causalEventDigest !== canonicalDigest('not-applicable'), `${code}_CAUSAL_EVENT`);
  if (expectation.observationKind === 'server_event' || expectation.denialIntent) {
    assert(browserBinding && record.bindingToken === browserBinding.bindingToken && record.action === browserBinding.action
      && record.resourceFamily === browserBinding.resourceFamily && record.resourceDigest === browserBinding.resourceDigest
      && record.expectedVersion === browserBinding.expectedVersion && record.version === browserBinding.observedVersion
      && record.requestIdentityDigest === browserBinding.requestDigest && record.receiptDigest === browserBinding.receiptDigest
      && record.auditDigest === browserBinding.auditDigest, `${code}_EXACT_BINDING`);
    assert(record.safeBindingDigest===canonicalDigest(browserBinding),`${code}_SAFE_BINDING_DIGEST`);
  } else assert(record.safeBindingDigest===canonicalDigest({safeBinding:'not_applicable'}),`${code}_SAFE_BINDING_DIGEST`);
  validateSafetyObservation(record.safety, `${code}_SAFETY`);
  assertTimestamp(record.serverObservedAt, `${code}_TIME`);
};

export const validateControlledHumanObservedDuty = ({ humanRole, requestedSteps, serverSteps, proofPairs }) => {
  assert(['requester','reviewer','approver'].includes(humanRole), 'PR_C_CH_OBSERVED_DUTY_ROLE');
  const expected=expectedDutySteps(humanRole);
  assert(Array.isArray(requestedSteps)&&Array.isArray(serverSteps)&&requestedSteps.length===expected.length&&serverSteps.length===expected.length,'PR_C_CH_OBSERVED_DUTY_COUNT');
  const pairMap=new Map(proofPairs.map(pair=>[`${pair.checkpointId}\0${pair.stepId}`,pair]));
  const expectedMachineKeys=[];const observedMachineKeys=[];
  expected.forEach((item,index)=>{
    const request=requestedSteps[index];
    assert(request&&request.checkpointId===item.checkpointId&&request.stepId===item.stepId&&request.personaKey===item.personaKey,'PR_C_CH_OBSERVED_DUTY_REQUEST');
    const contract=serverExpectation(item);const requiresBinding=contract.observationKind==='server_event'||contract.denialIntent;
    const key=`${item.checkpointId}\0${item.stepId}`;const pair=pairMap.get(key);
    if(requiresBinding){
      expectedMachineKeys.push(key);assert(pair&&request.bindingToken===pair.binding.bindingToken,'PR_C_CH_OBSERVED_DUTY_BINDING');observedMachineKeys.push(key);
    }else assert(!pair&&request.bindingToken===null,'PR_C_CH_OBSERVED_DUTY_UNEXPECTED_BINDING');
    assert(serverSteps[index]?.humanAttemptDigest===request.attemptDigest,'PR_C_CH_OBSERVED_DUTY_ATTEMPT');
    validateServerStep(serverSteps[index],item,pair?.binding??null,`PR_C_CH_OBSERVED_DUTY:${humanRole}:${index}`);
  });
  assert(JSON.stringify(observedMachineKeys)===JSON.stringify(expectedMachineKeys),'PR_C_CH_OBSERVED_DUTY_COVERAGE');
  return Object.freeze({humanRole,stepCount:serverSteps.length,machineStepKeys:Object.freeze(observedMachineKeys)});
};

const validateServerObserver = ({ preparation, humanRole, observations, serverObserver }) => {
  assertExactKeys(serverObserver, ['contractVersion', 'phase', 'status', 'environmentClass', 'releaseSha', 'reviewHeadSha', 'prNumber', 'deployId', 'deployOrigin', 'exerciseDigest', 'targetFingerprint', 'publicTargetDigest', 'personaManifestDigest', 'fixtureManifestDigest', 'migrationTip', 'productionAuthorized', 'customerDataAuthorized', 'realProviderCallsAuthorized', 'humanRole', 'requestDigest', 'observedAt', 'lifecycle', 'concurrencyVersion', 'operationEventSequence', 'operationEventDigest', 'immutableHistoryDigest', 'inspectionDigest', 'steps'], [], 'PR_C_CH_SERVER_OBSERVER');
  assert(serverObserver.contractVersion === CONTROLLER_SCHEMA_VERSION && serverObserver.phase === 'checkpoint-observe' && serverObserver.status === 'passed', 'PR_C_CH_SERVER_OBSERVER_STATUS');
  assert(serverObserver.environmentClass === ENVIRONMENT && serverObserver.migrationTip === CONTROLLED_HUMAN_MIGRATION_TIP, 'PR_C_CH_SERVER_OBSERVER_ENVIRONMENT');
  assert(serverObserver.releaseSha === preparation.exactHead && serverObserver.reviewHeadSha === preparation.exactHead && serverObserver.prNumber === PR_NUMBER, 'PR_C_CH_SERVER_OBSERVER_HEAD');
  assert(serverObserver.deployId === preparation.preview.deployId && serverObserver.deployOrigin === PREVIEW_ORIGIN, 'PR_C_CH_SERVER_OBSERVER_PREVIEW');
  assert(serverObserver.exerciseDigest === preparation.backend.exerciseDigest && serverObserver.targetFingerprint === preparation.backend.targetFingerprint && serverObserver.publicTargetDigest === preparation.backend.publicTargetDigest
    && serverObserver.personaManifestDigest === preparation.backend.personaManifestDigest && serverObserver.fixtureManifestDigest === preparation.backend.fixtureManifestDigest, 'PR_C_CH_SERVER_OBSERVER_SCOPE');
  assert(serverObserver.productionAuthorized === false && serverObserver.customerDataAuthorized === false && serverObserver.realProviderCallsAuthorized === false, 'PR_C_CH_SERVER_OBSERVER_STOP_STATES');
  assert(serverObserver.humanRole === humanRole && serverObserver.requestDigest === canonicalDigest(buildServerObserverRequest(humanRole, observations)), 'PR_C_CH_SERVER_OBSERVER_REQUEST');
  assertTimestamp(serverObserver.observedAt, 'PR_C_CH_SERVER_OBSERVER_TIME');
  assert(['active', 'read_only'].includes(serverObserver.lifecycle) && Number.isSafeInteger(serverObserver.concurrencyVersion) && serverObserver.concurrencyVersion > 0, 'PR_C_CH_SERVER_OBSERVER_LIFECYCLE');
  assert(Number.isSafeInteger(serverObserver.operationEventSequence) && serverObserver.operationEventSequence > 0, 'PR_C_CH_SERVER_OBSERVER_EVENTS');
  assertDigest(serverObserver.operationEventDigest, 'PR_C_CH_SERVER_OBSERVER_EVENT_DIGEST');
  assertDigest(serverObserver.immutableHistoryDigest, 'PR_C_CH_SERVER_OBSERVER_HISTORY_DIGEST');
  assertDigest(serverObserver.inspectionDigest, 'PR_C_CH_SERVER_OBSERVER_INSPECTION_DIGEST');
  const expected = expectedDutySteps(humanRole);
  assert(Array.isArray(serverObserver.steps) && serverObserver.steps.length === expected.length, 'PR_C_CH_SERVER_OBSERVER_STEP_SET');
  const humanSteps = observations.flatMap(record => record.steps);
  serverObserver.steps.forEach((record, index) => validateServerStep(record, expected[index], humanSteps[index].browserArtifact.serverBinding, `PR_C_CH_SERVER_STEP:${index}`));
  const causalEvents=serverObserver.steps.filter((record,index)=>serverExpectation(expected[index]).observationKind==='server_event').map(record=>record.causalEventDigest);
  assert(new Set(causalEvents).size===causalEvents.length,'PR_C_CH_SERVER_OBSERVER_CAUSAL_EVENT_REUSE');
  const bindingTokens=humanSteps.map(record=>record.browserArtifact.serverBinding?.bindingToken).filter(Boolean);
  assert(new Set(bindingTokens).size===bindingTokens.length,'PR_C_CH_SERVER_OBSERVER_BINDING_REUSE');
  expected.forEach((item,index)=>{
    const contract=serverExpectation(item).actionContract;
    if(contract?.transitionKind!=='replay_existing')return;
    const originalIndex=expected.findIndex(candidate=>candidate.checkpointId===item.checkpointId&&candidate.stepId===contract.replayOfStepId);
    const replay=humanSteps[index].browserArtifact.serverBinding;const original=humanSteps[originalIndex]?.browserArtifact.serverBinding;
    assert(original&&replay&&replay.resourceFamily===original.resourceFamily&&replay.resourceDigest===original.resourceDigest
      &&replay.observedVersion===original.observedVersion&&replay.receiptDigest===original.receiptDigest&&replay.auditDigest===original.auditDigest
      &&replay.requestDigest!==original.requestDigest,'PR_C_CH_SERVER_OBSERVER_REPLAY_LINEAGE');
  });
  assert(serverObserver.steps.every((record,index) => record.humanAttemptDigest === sha256Digest(Buffer.from(canonicalJson(humanSteps[index].browserArtifact),'utf8'))), 'PR_C_CH_SERVER_OBSERVER_ATTEMPT_BINDING');
  assert(new Set(serverObserver.steps.map(record => record.humanAttemptDigest)).size === expected.length, 'PR_C_CH_SERVER_OBSERVER_ATTEMPT_REUSE');
  assert(new Set(serverObserver.steps.map(record => record.inspectionDigest)).size === expected.length, 'PR_C_CH_SERVER_OBSERVER_DIGEST_REUSE');
  recursivelyRejectUnsafeEvidence(serverObserver);
  return serverObserver;
};

const checkpointSigningPayload = checkpoint => {
  const { signature, ...payload } = checkpoint;
  return canonicalJson(payload);
};

const hmac = (key, value) => createHmac('sha256', key).update(value).digest('hex');

export const createHumanCheckpoint = ({ preparation, quiesceRecord, humanRole, actor, comment, workflowRunId, workflowRunAttempt, observations, serverObserver, signingKey, capturedAt }) => {
  validatePreparationEvidence(preparation);
  const common = {
    exactHead: preparation.exactHead,
    deployId: preparation.preview.deployId,
    exerciseDigest: preparation.backend.exerciseDigest,
    targetFingerprint: preparation.backend.targetFingerprint,
    publicTargetDigest: preparation.backend.publicTargetDigest,
    personaManifestDigest: preparation.backend.personaManifestDigest,
    fixtureManifestDigest: preparation.backend.fixtureManifestDigest,
  };
  validateControllerRecord(quiesceRecord, 'quiesce', common);
  assert(typeof signingKey === 'string' && signingKey.length >= 32, 'PR_C_CH_SIGNING_KEY');
  assert(typeof actor === 'string' && actor.length > 0, 'PR_C_CH_ACTOR');
  assert(['requester', 'reviewer', 'approver'].includes(humanRole), 'PR_C_CH_HUMAN_ROLE');
  const expectedSteps = expectedDutySteps(humanRole);
  const expectedIds = [...new Set(expectedSteps.map(record => record.checkpointId))];
  assert(Array.isArray(observations) && JSON.stringify(observations.map(record => record.checkpointId)) === JSON.stringify(expectedIds), 'PR_C_CH_ROLE_CHECKPOINT_SET');
  const normalizedBrowserArtifacts = [];
  const normalized = observations.map((record, recordIndex) => {
    const expected = catalogByCheckpoint.get(record.checkpointId);
    assertExactKeys(record, ['checkpointId', 'journeyId', 'testIds', 'steps'], [], `PR_C_CH_CHECKPOINT:${recordIndex}`);
    assert(record.journeyId === expected.journeyId, `PR_C_CH_JOURNEY:${record.checkpointId}`);
    sortedUnique(record.testIds, `PR_C_CH_TEST_IDS:${record.checkpointId}`);
    assert(JSON.stringify(record.testIds) === JSON.stringify(expected.testIds), `PR_C_CH_TEST_ID_SET:${record.checkpointId}`);
    const owned = expected.steps.filter(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === humanRole);
    assert(Array.isArray(record.steps) && record.steps.length === owned.length, `PR_C_CH_STEP_SET:${record.checkpointId}`);
    const steps = record.steps.map((observation, index) => {
      const browserArtifact = validateHumanStep(observation, owned[index], `PR_C_CH_STEP:${record.checkpointId}:${index}`);
      normalizedBrowserArtifacts.push(browserArtifact);
      return { ...observation, browserArtifact };
    });
    return { ...record, steps };
  });
  validateServerObserver({ preparation, humanRole, observations, serverObserver });
  assert(new Set(normalizedBrowserArtifacts.map(record => record.digest)).size === normalizedBrowserArtifacts.length, 'PR_C_CH_BROWSER_DIGEST_REUSE');
  assertExactKeys(comment, ['commentId', 'createdAt', 'updatedAt'], [], 'PR_C_CH_COMMENT');
  assert(RUN_ID.test(String(comment.commentId)) && comment.createdAt === comment.updatedAt, 'PR_C_CH_COMMENT_IDENTITY');
  assertTimestamp(comment.createdAt, 'PR_C_CH_COMMENT_TIME');
  assertTimestamp(capturedAt, 'PR_C_CH_CAPTURED_AT');
  const preparationTime = Date.parse(preparation.createdAt);
  const quiesceTime = Date.parse(quiesceRecord.transitionedAt);
  const captureTime = Date.parse(capturedAt);
  const allStepTimes = normalized.flatMap(record => record.steps.flatMap(item => [Date.parse(item.startedAt), Date.parse(item.completedAt)]));
  assert(allStepTimes.every(value => value >= preparationTime && value <= captureTime) && Date.parse(comment.createdAt) >= Math.max(...allStepTimes) && Date.parse(comment.createdAt) <= captureTime, 'PR_C_CH_STEP_TIME_BOUNDARY');
  assert(new Set(allStepTimes).size === allStepTimes.length, 'PR_C_CH_STEP_TIME_REUSE');
  const normalizedSteps = normalized.flatMap(record => record.steps);
  const readOnlySteps = normalizedSteps.filter(record => record.stepId === 'verify-history-readable-and-actions-absent');
  const activeSteps = normalizedSteps.filter(record => record.stepId !== 'verify-history-readable-and-actions-absent');
  assert(activeSteps.every(record => Date.parse(record.completedAt) < quiesceTime), 'PR_C_CH_ACTIVE_STEP_AFTER_QUIESCE');
  assert((humanRole === 'reviewer' && readOnlySteps.length === 1 && Date.parse(readOnlySteps[0].startedAt) >= quiesceTime)
    || (humanRole !== 'reviewer' && readOnlySteps.length === 0), 'PR_C_CH_READ_ONLY_STEP_BEFORE_QUIESCE');
  assert(Date.parse(serverObserver.observedAt) >= Math.max(...allStepTimes) && Date.parse(serverObserver.observedAt) <= captureTime, 'PR_C_CH_SERVER_OBSERVER_TIME_BOUNDARY');
  assert(RUN_ID.test(String(workflowRunId)) && Number.isSafeInteger(workflowRunAttempt) && workflowRunAttempt > 0, 'PR_C_CH_CAPTURE_RUN');
  const signerDigest = `hmac-sha256:${hmac(signingKey, `actor\0${actor}`)}`;
  const unsigned = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    status: 'human_observation',
    automationGenerated: false,
    preparationDigest: canonicalDigest(preparation),
    quiesceDigest: canonicalDigest(quiesceRecord),
    humanRole,
    signerDigest,
    capture: { workflowPath: CHECKPOINT_WORKFLOW, event: 'pull_request', runId: String(workflowRunId), runAttempt: workflowRunAttempt, commentId: String(comment.commentId), commentCreatedAt: comment.createdAt, capturedAt },
    serverObserver: { artifactDigest: canonicalDigest(serverObserver), record: serverObserver },
    checkpoints: normalized,
  };
  recursivelyRejectUnsafeEvidence(unsigned);
  return { ...unsigned, signature: `hmac-sha256:${hmac(signingKey, checkpointSigningPayload(unsigned))}` };
};

export const validateHumanCheckpoint = ({ preparation, quiesceRecord, checkpoint, signingKey }) => {
  validatePreparationEvidence(preparation);
  const common = {
    exactHead: preparation.exactHead,
    deployId: preparation.preview.deployId,
    exerciseDigest: preparation.backend.exerciseDigest,
    targetFingerprint: preparation.backend.targetFingerprint,
    publicTargetDigest: preparation.backend.publicTargetDigest,
    personaManifestDigest: preparation.backend.personaManifestDigest,
    fixtureManifestDigest: preparation.backend.fixtureManifestDigest,
  };
  validateControllerRecord(quiesceRecord, 'quiesce', common);
  assertExactKeys(checkpoint, ['schemaVersion', 'status', 'automationGenerated', 'preparationDigest', 'quiesceDigest', 'humanRole', 'signerDigest', 'capture', 'serverObserver', 'checkpoints', 'signature'], [], 'PR_C_CH_CHECKPOINT_RECORD');
  assert(checkpoint.schemaVersion === CHECKPOINT_SCHEMA_VERSION && checkpoint.status === 'human_observation' && checkpoint.automationGenerated === false, 'PR_C_CH_CHECKPOINT_STATUS');
  assert(checkpoint.preparationDigest === canonicalDigest(preparation), 'PR_C_CH_CHECKPOINT_PREPARATION');
  assert(checkpoint.quiesceDigest === canonicalDigest(quiesceRecord), 'PR_C_CH_CHECKPOINT_QUIESCE');
  assert(HMAC_DIGEST.test(checkpoint.signerDigest) && HMAC_DIGEST.test(checkpoint.signature), 'PR_C_CH_CHECKPOINT_SIGNATURE_FORMAT');
  assertExactKeys(checkpoint.capture, ['workflowPath', 'event', 'runId', 'runAttempt', 'commentId', 'commentCreatedAt', 'capturedAt'], [], 'PR_C_CH_CHECKPOINT_CAPTURE');
  assert(checkpoint.capture.workflowPath === CHECKPOINT_WORKFLOW && checkpoint.capture.event === 'pull_request' && RUN_ID.test(checkpoint.capture.runId) && Number.isSafeInteger(checkpoint.capture.runAttempt) && checkpoint.capture.runAttempt > 0 && RUN_ID.test(checkpoint.capture.commentId), 'PR_C_CH_CHECKPOINT_CAPTURE_IDENTITY');
  assertTimestamp(checkpoint.capture.commentCreatedAt, 'PR_C_CH_CHECKPOINT_COMMENT_TIME');
  assertTimestamp(checkpoint.capture.capturedAt, 'PR_C_CH_CHECKPOINT_CAPTURED_AT');
  assertExactKeys(checkpoint.serverObserver, ['artifactDigest', 'record'], [], 'PR_C_CH_CHECKPOINT_SERVER_OBSERVER');
  assert(checkpoint.serverObserver.artifactDigest === canonicalDigest(checkpoint.serverObserver.record), 'PR_C_CH_CHECKPOINT_SERVER_OBSERVER_DIGEST');
  const expectedSteps = expectedDutySteps(checkpoint.humanRole);
  const expectedIds = [...new Set(expectedSteps.map(record => record.checkpointId))];
  assert(Array.isArray(checkpoint.checkpoints) && JSON.stringify(checkpoint.checkpoints.map(record => record.checkpointId)) === JSON.stringify(expectedIds), 'PR_C_CH_CHECKPOINT_DUTY_SET');
  const browserDigests = [];
  for (const record of checkpoint.checkpoints) {
    const catalog = catalogByCheckpoint.get(record.checkpointId);
    assertExactKeys(record, ['checkpointId', 'journeyId', 'testIds', 'steps'], [], `PR_C_CH_CHECKPOINT_RETAINED:${record.checkpointId}`);
    assert(record.journeyId === catalog?.journeyId && JSON.stringify(record.testIds) === JSON.stringify(catalog.testIds), `PR_C_CH_CHECKPOINT_RETAINED_BINDING:${record.checkpointId}`);
    const owned = catalog.steps.filter(item => HUMAN_DUTY_BY_PERSONA[item.personaKey] === checkpoint.humanRole);
    assert(record.steps.length === owned.length, `PR_C_CH_CHECKPOINT_RETAINED_STEPS:${record.checkpointId}`);
    record.steps.forEach((stepRecord, index) => {
      assertExactKeys(stepRecord, ['stepId', 'personaKey', 'outcome', 'startedAt', 'completedAt', 'browserArtifact'], [], `PR_C_CH_CHECKPOINT_RETAINED_STEP:${record.checkpointId}:${index}`);
      assert(stepRecord.stepId === owned[index].stepId && stepRecord.personaKey === owned[index].personaKey && stepRecord.outcome === 'passed', `PR_C_CH_CHECKPOINT_RETAINED_STEP_BINDING:${record.checkpointId}:${index}`);
      assertExactKeys(stepRecord.browserArtifact, ['content', 'byteLength', 'digest'], [], `PR_C_CH_CHECKPOINT_RETAINED_BROWSER:${record.checkpointId}:${index}`);
      const recomputed = validateBrowserArtifact(stepRecord.browserArtifact.content, owned[index], `PR_C_CH_CHECKPOINT_RETAINED_BROWSER_CONTENT:${record.checkpointId}:${index}`);
      assert(stepRecord.browserArtifact.byteLength === recomputed.byteLength && stepRecord.browserArtifact.digest === recomputed.digest, `PR_C_CH_CHECKPOINT_RETAINED_BROWSER_BYTES:${record.checkpointId}:${index}`);
      browserDigests.push(recomputed.digest);
    });
  }
  assert(new Set(browserDigests).size === browserDigests.length, 'PR_C_CH_CHECKPOINT_BROWSER_DIGEST_REUSE');
  const rawForRequestDigest = checkpoint.checkpoints.map(record => ({ ...record, steps: record.steps.map(stepRecord => ({ ...stepRecord, browserArtifact: stepRecord.browserArtifact.content })) }));
  validateServerObserver({ preparation, humanRole: checkpoint.humanRole, observations: rawForRequestDigest, serverObserver: checkpoint.serverObserver.record });
  const quiesceTime = Date.parse(quiesceRecord.transitionedAt);
  const retainedSteps = checkpoint.checkpoints.flatMap(record => record.steps);
  const readOnlySteps = retainedSteps.filter(record => record.stepId === 'verify-history-readable-and-actions-absent');
  assert(retainedSteps.filter(record => record.stepId !== 'verify-history-readable-and-actions-absent').every(record => Date.parse(record.completedAt) < quiesceTime), 'PR_C_CH_ACTIVE_STEP_AFTER_QUIESCE');
  assert((checkpoint.humanRole === 'reviewer' && readOnlySteps.length === 1 && Date.parse(readOnlySteps[0].startedAt) >= quiesceTime)
    || (checkpoint.humanRole !== 'reviewer' && readOnlySteps.length === 0), 'PR_C_CH_READ_ONLY_STEP_BEFORE_QUIESCE');
  const actualSignature = Buffer.from(checkpoint.signature.slice('hmac-sha256:'.length), 'hex');
  const directExpected = Buffer.from(hmac(signingKey, checkpointSigningPayload(checkpoint)), 'hex');
  assert(directExpected.length === actualSignature.length && timingSafeEqual(directExpected, actualSignature), 'PR_C_CH_CHECKPOINT_SIGNATURE');
  recursivelyRejectUnsafeEvidence(checkpoint);
  return checkpoint;
};

const validateDefectHistory = (records, exactHead) => {
  assert(Array.isArray(records), 'PR_C_CH_DEFECT_HISTORY');
  for (const [index, record] of records.entries()) {
    assertExactKeys(record, ['defectDigest', 'classification', 'disposition', 'invalidatedSessionDigest', 'invalidatedHead', 'fixHead', 'invalidatedCheckpointIds', 'retestedCheckpointIds'], [], `PR_C_CH_DEFECT:${index}`);
    assertDigest(record.defectDigest, `PR_C_CH_DEFECT_DIGEST:${index}`);
    assert(record.classification === 'material' && record.disposition === 'fixed_retested', `PR_C_CH_DEFECT_STATUS:${index}`);
    assertDigest(record.invalidatedSessionDigest, `PR_C_CH_DEFECT_SESSION:${index}`);
    assert(SHA.test(record.invalidatedHead) && record.invalidatedHead !== exactHead && record.fixHead === exactHead, `PR_C_CH_DEFECT_HEAD:${index}`);
    const all = CONTROLLED_HUMAN_CATALOG.map(item => item.checkpointId);
    assert(JSON.stringify(record.invalidatedCheckpointIds) === JSON.stringify(all) && JSON.stringify(record.retestedCheckpointIds) === JSON.stringify(all), `PR_C_CH_DEFECT_FULL_RETEST:${index}`);
  }
};

export const buildVerifiedHumanSession = ({ preparation, checkpoints, quiesceRecord, deprovisionRecord, postDeprovisionRecord, signingKey, defectHistory = [], completedAt }) => {
  validatePreparationEvidence(preparation);
  assert(Array.isArray(checkpoints) && checkpoints.length === 3, 'PR_C_CH_SESSION_CHECKPOINT_FILES');
  checkpoints.forEach(checkpoint => validateHumanCheckpoint({ preparation, quiesceRecord, checkpoint, signingKey }));
  const byRole = new Map(checkpoints.map(checkpoint => [checkpoint.humanRole, checkpoint]));
  assert(byRole.size === 3 && ['requester', 'reviewer', 'approver'].every(role => byRole.has(role)), 'PR_C_CH_SESSION_HUMAN_ROLES');
  assert(new Set(checkpoints.map(checkpoint => checkpoint.signerDigest)).size === 3, 'PR_C_CH_SESSION_DISTINCT_HUMANS');
  const fragments = checkpoints.flatMap(checkpoint => checkpoint.checkpoints.map(record => ({ ...record, humanRole: checkpoint.humanRole })));
  const ordered = CONTROLLED_HUMAN_CATALOG.map(expected => {
    const ownedFragments = fragments.filter(record => record.checkpointId === expected.checkpointId);
    const steps = expected.steps.map(stepRecord => ownedFragments.flatMap(record => record.steps).find(candidate => candidate.stepId === stepRecord.stepId));
    assert(steps.every(Boolean) && new Set(ownedFragments.flatMap(record => record.steps).map(record => record.stepId)).size === expected.steps.length, `PR_C_CH_SESSION_CHECKPOINT_SET:${expected.checkpointId}`);
    return { checkpointId: expected.checkpointId, journeyId: expected.journeyId, testIds: expected.testIds, steps };
  });
  assert(ordered.every(record => record.steps.every(stepRecord => stepRecord.outcome === 'passed')), 'PR_C_CH_SESSION_STEP_FAILURE');
  const common = {
    exactHead: preparation.exactHead,
    deployId: preparation.preview.deployId,
    exerciseDigest: preparation.backend.exerciseDigest,
    targetFingerprint: preparation.backend.targetFingerprint,
    publicTargetDigest: preparation.backend.publicTargetDigest,
    personaManifestDigest: preparation.backend.personaManifestDigest,
    fixtureManifestDigest: preparation.backend.fixtureManifestDigest,
  };
  validateControllerRecord(quiesceRecord, 'quiesce', common);
  validateControllerRecord(deprovisionRecord, 'deprovision', common);
  validateControllerRecord(postDeprovisionRecord, 'post-deprovision-verify', common);
  assert(deprovisionRecord.status === 'passed', 'PR_C_CH_DEPROVISION_STATUS');
  assert(deprovisionRecord.lifecycle === 'deprovisioned', 'PR_C_CH_DEPROVISION_LIFECYCLE');
  assert(postDeprovisionRecord.postInspectionDigest !== deprovisionRecord.postInspectionDigest, 'PR_C_CH_POST_DEPROVISION_INDEPENDENCE');
  assert(postDeprovisionRecord.immutableHistoryDigest === deprovisionRecord.immutableHistoryDigest, 'PR_C_CH_POST_DEPROVISION_HISTORY');
  assert(deprovisionRecord.concurrencyVersion > quiesceRecord.concurrencyVersion
    && deprovisionRecord.operationEventSequence > quiesceRecord.operationEventSequence, 'PR_C_CH_LIFECYCLE_VERSION_ORDER');
  assert(deprovisionRecord.quiescedHistoryDigest === quiesceRecord.immutableHistoryDigest, 'PR_C_CH_FROZEN_HISTORY_BINDING');
  validateDefectHistory(defectHistory, preparation.exactHead);
  assertTimestamp(completedAt, 'PR_C_CH_SESSION_COMPLETED');
  assert(Date.parse(completedAt) >= Math.max(...checkpoints.map(checkpoint => Date.parse(checkpoint.capture.capturedAt))), 'PR_C_CH_SESSION_TIME_ORDER');
  const executionIndex = new Map(CONTROLLED_HUMAN_EXECUTION_ORDER.map((checkpointId, index) => [checkpointId, index]));
  const stepRecords = ordered.flatMap(record => record.steps.map((stepRecord, index) => ({ ...stepRecord, checkpointId: record.checkpointId, stepIndex: index })))
    .sort((left, right) => executionIndex.get(left.checkpointId) - executionIndex.get(right.checkpointId) || left.stepIndex - right.stepIndex);
  const allTimes = stepRecords.flatMap(record => [Date.parse(record.startedAt), Date.parse(record.completedAt)]);
  assert(new Set(allTimes).size === allTimes.length && allTimes.every((value, index) => index === 0 || value > allTimes[index - 1]), 'PR_C_CH_SESSION_STEP_TIME_ORDER');
  const browserDigests = stepRecords.map(record => record.browserArtifact.digest);
  const authenticProofPairs = stepRecords.flatMap(record => {
    const artifact = record.browserArtifact.content;
    return artifact.serverAnchor && artifact.serverBinding
      ? [{ checkpointId: record.checkpointId, stepId: record.stepId, anchor: artifact.serverAnchor, binding: artifact.serverBinding }]
      : [];
  });
  const serverSteps = checkpoints.flatMap(checkpoint => checkpoint.serverObserver.record.steps);
  validateControlledHumanProofPairs(authenticProofPairs,serverSteps);
  const causalEvents=serverSteps.filter(record=>record.observationKind==='server_event').map(record=>record.causalEventDigest);
  const inspectReadOnly = serverSteps.find(record => record.stepId === 'verify-history-readable-and-actions-absent');
  assert(inspectReadOnly?.resourceDigest === quiesceRecord.immutableHistoryDigest && inspectReadOnly.version === quiesceRecord.concurrencyVersion, 'PR_C_CH_READ_ONLY_STEP_BINDING');
  assert(new Set(browserDigests).size === browserDigests.length && new Set(serverSteps.map(record => record.inspectionDigest)).size === serverSteps.length
    && new Set(causalEvents).size===causalEvents.length, 'PR_C_CH_SESSION_DIGEST_REUSE');
  const aggregateSafety = serverSteps.reduce((totals, record) => Object.fromEntries(Object.keys(totals).map(key => [key, totals[key] + record.safety[key]])), { providerEgress: 0, realProviderCalls: 0, customerDataRecords: 0, externalUsers: 0 });
  assert(Object.values(aggregateSafety).every(value => value === 0), 'PR_C_CH_SESSION_OBSERVED_SAFETY');
  const result = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    status: 'passed',
    controlledHumanDisposition: 'executed',
    evidenceBasis: 'human_attested_plus_server_observed',
    preparationDigest: canonicalDigest(preparation),
    exactHead: preparation.exactHead,
    github: preparation.github,
    preview: preparation.preview,
    backendBinding: {
      targetFingerprint: preparation.backend.targetFingerprint,
      publicTargetDigest: preparation.backend.publicTargetDigest,
      exerciseDigest: preparation.backend.exerciseDigest,
      seedControllerDigest: preparation.backend.controllerPhaseDigests.apply,
      resetControllerDigest: canonicalDigest(deprovisionRecord),
      postResetVerificationDigest: canonicalDigest(postDeprovisionRecord),
      quiesceControllerDigest: canonicalDigest(quiesceRecord),
      edgeDeploymentManifestDigest: preparation.edgeDeployment.manifestDigest,
    },
    humanParticipants: ['requester', 'reviewer', 'approver'].map(role => ({ role, signerDigest: byRole.get(role).signerDigest })),
    journeys: REQUIRED_JOURNEYS.map(journeyId => ({ journeyId, checkpointIds: ordered.filter(record => record.journeyId === journeyId).map(record => record.checkpointId), outcome: 'passed' })),
    checkpoints: ordered.map(record => ({ checkpointId: record.checkpointId, journeyId: record.journeyId, outcome: 'passed', stepCount: record.steps.length, observationDigest: canonicalDigest(record), signedCheckpointDigests: [...new Set(record.steps.map(stepRecord => canonicalDigest(byRole.get(HUMAN_DUTY_BY_PERSONA[stepRecord.personaKey]))))].sort() })),
    totals: {
      journeyCount: REQUIRED_JOURNEYS.length,
      checkpointCount: ordered.length,
      stepCount: stepRecords.length,
      passedStepCount: stepRecords.length,
      failedStepCount: 0,
      blockedStepCount: 0,
      providerEgressCount: aggregateSafety.providerEgress,
      realProviderCallCount: aggregateSafety.realProviderCalls,
      customerDataRecordCount: aggregateSafety.customerDataRecords,
      externalUserCount: aggregateSafety.externalUsers,
    },
    defectHistory,
    lifecycleControl: { quiesceDigest: canonicalDigest(quiesceRecord), quiescedHistoryDigest: quiesceRecord.immutableHistoryDigest },
    reset: { status: 'verified_deprovisioned', controllerDigest: canonicalDigest(deprovisionRecord), postVerificationDigest: canonicalDigest(postDeprovisionRecord), postInspectionDigest: postDeprovisionRecord.postInspectionDigest },
    completedAt,
  };
  recursivelyRejectUnsafeEvidence(result);
  return result;
};

export const validateVerifiedHumanSession = session => {
  assertExactKeys(session, ['schemaVersion', 'status', 'controlledHumanDisposition', 'evidenceBasis', 'preparationDigest', 'exactHead', 'github', 'preview', 'backendBinding', 'humanParticipants', 'journeys', 'checkpoints', 'totals', 'defectHistory', 'lifecycleControl', 'reset', 'completedAt'], [], 'PR_C_CH_SESSION');
  assert(session.schemaVersion === SESSION_SCHEMA_VERSION && session.status === 'passed' && session.controlledHumanDisposition === 'executed' && session.evidenceBasis === 'human_attested_plus_server_observed', 'PR_C_CH_SESSION_STATUS');
  assertDigest(session.preparationDigest, 'PR_C_CH_SESSION_PREPARATION');
  assert(SHA.test(session.exactHead), 'PR_C_CH_SESSION_HEAD');
  assertExactKeys(session.github, ['workflowPath', 'runId', 'runAttempt', 'conclusion', 'artifactName', 'artifactDigest'], [], 'PR_C_CH_SESSION_GITHUB');
  assert(session.github.workflowPath === PR_C_WORKFLOW && RUN_ID.test(String(session.github.runId)) && Number.isSafeInteger(session.github.runAttempt) && session.github.runAttempt > 0 && session.github.conclusion === 'success', 'PR_C_CH_SESSION_GITHUB_IDENTITY');
  assertDigest(session.github.artifactDigest, 'PR_C_CH_SESSION_ARTIFACT');
  assertExactKeys(session.preview, ['origin', 'deployId', 'releaseSha', 'context', 'reviewId', 'siteName', 'environment'], [], 'PR_C_CH_SESSION_PREVIEW');
  assert(session.preview.origin === PREVIEW_ORIGIN && DEPLOY_ID.test(session.preview.deployId) && session.preview.releaseSha === session.exactHead && session.preview.context === 'deploy-preview' && session.preview.reviewId === PR_NUMBER && session.preview.siteName === 'avalaos-pilot' && session.preview.environment === ENVIRONMENT, 'PR_C_CH_SESSION_PREVIEW_IDENTITY');
  assertExactKeys(session.backendBinding, ['targetFingerprint', 'publicTargetDigest', 'exerciseDigest', 'seedControllerDigest', 'resetControllerDigest', 'postResetVerificationDigest', 'quiesceControllerDigest', 'edgeDeploymentManifestDigest'], [], 'PR_C_CH_SESSION_BACKEND');
  Object.values(session.backendBinding).forEach(value => assertDigest(value, 'PR_C_CH_SESSION_BACKEND_DIGEST'));
  assert(Array.isArray(session.humanParticipants) && session.humanParticipants.length === 3 && new Set(session.humanParticipants.map(record => record.signerDigest)).size === 3, 'PR_C_CH_SESSION_PARTICIPANTS');
  assert(JSON.stringify(session.humanParticipants.map(record => record.role)) === JSON.stringify(['requester', 'reviewer', 'approver']), 'PR_C_CH_SESSION_PARTICIPANT_ROLES');
  for (const participant of session.humanParticipants) {
    assertExactKeys(participant, ['role', 'signerDigest'], [], `PR_C_CH_SESSION_PARTICIPANT:${participant.role}`);
    assert(HMAC_DIGEST.test(participant.signerDigest), `PR_C_CH_SESSION_PARTICIPANT_DIGEST:${participant.role}`);
  }
  assert(JSON.stringify(session.journeys.map(record => record.journeyId)) === JSON.stringify(REQUIRED_JOURNEYS) && session.journeys.every(record => record.outcome === 'passed'), 'PR_C_CH_SESSION_JOURNEYS');
  for (const journey of session.journeys) {
    assertExactKeys(journey, ['journeyId', 'checkpointIds', 'outcome'], [], `PR_C_CH_SESSION_JOURNEY:${journey.journeyId}`);
    const expected = CONTROLLED_HUMAN_CATALOG.filter(record => record.journeyId === journey.journeyId).map(record => record.checkpointId);
    assert(JSON.stringify(journey.checkpointIds) === JSON.stringify(expected), `PR_C_CH_SESSION_JOURNEY_CHECKPOINTS:${journey.journeyId}`);
  }
  assert(JSON.stringify(session.checkpoints.map(record => record.checkpointId)) === JSON.stringify(CONTROLLED_HUMAN_CATALOG.map(record => record.checkpointId)) && session.checkpoints.every(record => record.outcome === 'passed'), 'PR_C_CH_SESSION_CHECKPOINTS');
  session.checkpoints.forEach((record, index) => {
    assertExactKeys(record, ['checkpointId', 'journeyId', 'outcome', 'stepCount', 'observationDigest', 'signedCheckpointDigests'], [], `PR_C_CH_SESSION_CHECKPOINT:${index}`);
    assert(record.journeyId === CONTROLLED_HUMAN_CATALOG[index].journeyId && record.stepCount === CONTROLLED_HUMAN_CATALOG[index].steps.length, `PR_C_CH_SESSION_CHECKPOINT_BINDING:${index}`);
    assertDigest(record.observationDigest, `PR_C_CH_SESSION_OBSERVATION_DIGEST:${index}`);
    sortedUnique(record.signedCheckpointDigests, `PR_C_CH_SESSION_SIGNED_DIGEST_SET:${index}`);
    record.signedCheckpointDigests.forEach(value => assertDigest(value, `PR_C_CH_SESSION_SIGNED_DIGEST:${index}`));
  });
  assertExactKeys(session.totals, ['journeyCount', 'checkpointCount', 'stepCount', 'passedStepCount', 'failedStepCount', 'blockedStepCount', 'providerEgressCount', 'realProviderCallCount', 'customerDataRecordCount', 'externalUserCount'], [], 'PR_C_CH_SESSION_TOTAL_RECORD');
  assert(session.totals.journeyCount === 8 && session.totals.checkpointCount === 14 && session.totals.passedStepCount === session.totals.stepCount && session.totals.failedStepCount === 0 && session.totals.blockedStepCount === 0 && session.totals.providerEgressCount === 0 && session.totals.realProviderCallCount === 0 && session.totals.customerDataRecordCount === 0 && session.totals.externalUserCount === 0, 'PR_C_CH_SESSION_TOTALS');
  assertExactKeys(session.lifecycleControl, ['quiesceDigest', 'quiescedHistoryDigest'], [], 'PR_C_CH_SESSION_LIFECYCLE');
  Object.values(session.lifecycleControl).forEach(value => assertDigest(value, 'PR_C_CH_SESSION_LIFECYCLE_DIGEST'));
  assertExactKeys(session.reset, ['status', 'controllerDigest', 'postVerificationDigest', 'postInspectionDigest'], [], 'PR_C_CH_SESSION_RESET_RECORD');
  assert(session.reset.status === 'verified_deprovisioned', 'PR_C_CH_SESSION_RESET');
  assertDigest(session.reset.controllerDigest, 'PR_C_CH_SESSION_RESET_DIGEST');
  assertDigest(session.reset.postVerificationDigest, 'PR_C_CH_SESSION_POST_RESET_DIGEST');
  assertDigest(session.reset.postInspectionDigest, 'PR_C_CH_SESSION_POST_INSPECTION_DIGEST');
  validateDefectHistory(session.defectHistory, session.exactHead);
  assertTimestamp(session.completedAt, 'PR_C_CH_SESSION_TIMESTAMP');
  recursivelyRejectUnsafeEvidence(session);
  return session;
};

export const controlledHumanEvidenceDisposition = session => {
  if (!session) return { testId: 'CONTROLLED-HUMAN', result: 'not_run', reason: 'No verified signed human session artifact exists for this exact head.' };
  validateVerifiedHumanSession(session);
  return { testId: 'CONTROLLED-HUMAN', result: 'passed', sessionDigest: canonicalDigest(session), exactHead: session.exactHead };
};
