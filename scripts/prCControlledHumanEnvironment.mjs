import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { canonicalSupabasePublicOrigin } from '../services/supabasePublicCredential.mjs';
import { CONTROLLED_HUMAN_CATALOG, CONTROLLED_HUMAN_EXECUTION_ORDER, CONTROLLED_HUMAN_SERVER_ACTIONS, HUMAN_DUTY_BY_PERSONA, validateControlledHumanProofPairs } from './prCControlledHumanEvidenceContract.mjs';

const { Client } = pg;
export const CONTROLLER_VERSION = 'pr-c-controlled-human-controller-1';
export const ATTESTATION_VERSION = 'pr-c-controlled-human-attestation-1';
export const FIXTURE_PATH = 'testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json';
export const EXPECTED_MIGRATION_TIP = '20260904120000';
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const PREVIEW_ORIGIN = 'https://deploy-preview-264--avalaos-pilot.netlify.app';
export const FEATURE_FLAGS = Object.freeze([
  'transcript_source_sets_enabled','assess_multisource_apply_enabled','unified_byok_gateway_enabled','governed_journeys_enabled',
  'studio_multisource_enabled','studio_tenant_templates_enabled','module_handoffs_enabled','direct_studio_planning_enabled',
  'direct_delivery_planning_enabled','delivery_item_review_enabled','monitor_approved_baseline_enabled',
]);
const DOMAIN_FAMILIES = Object.freeze({
  assess_processes:'assess_process',assess_v2_cases:'assess_case',assess_v2_studio_handoffs:'assess_studio_handoff',
  enterprise_module_handoffs:'module_handoff',studio_artifacts:'studio_artifact',studio_source_packages:'studio_source_package',
  delivery_handoffs:'delivery_handoff',delivery_packages:'delivery_work_package',monitor_baselines:'monitor_baseline',
  pilot_environments:'pilot_environment',pilot_tenants:'pilot_tenant',
});
const RESOURCE_FAMILY_LIMITS = Object.freeze({
  assess_process:4,assess_case:4,assess_review_resolution:16,assess_studio_handoff:4,evidence_source:12,evidence_source_version:24,
  source_set:8,source_set_version:16,input_bundle:8,input_bundle_version:16,evidence_candidate:32,
  candidate_relationship_review:32,assess_conflict:16,assess_conflict_resolution:32,tenant_template:8,
  tenant_template_version:16,tenant_template_review:16,tenant_template_approval:16,module_handoff:8,module_handoff_review:16,module_handoff_approval:16,
  studio_artifact:12,studio_artifact_review:24,studio_artifact_approval:24,studio_source_package:12,studio_artifact_version:32,delivery_handoff:16,delivery_handoff_review:32,delivery_handoff_approval:32,
  delivery_source_package:16,delivery_work_package:16,delivery_item:100,delivery_item_version:200,
  delivery_item_decision:300,delivery_package_review:32,delivery_package_approval:32,delivery_package_blocker:64,
  monitor_baseline:16,pilot_environment:1,pilot_tenant:1,
});
const RESOURCE_TABLES = Object.freeze({
  assess_process:'assess_processes',assess_case:'assess_v2_cases',assess_review_resolution:'assess_v2_review_resolutions',assess_studio_handoff:'assess_v2_studio_handoffs',
  evidence_source:'enterprise_evidence_sources',evidence_source_version:'enterprise_evidence_source_versions',
  source_set:'enterprise_source_sets',source_set_version:'enterprise_source_set_versions',input_bundle:'enterprise_module_input_bundles',
  input_bundle_version:'enterprise_module_input_bundle_versions',evidence_candidate:'enterprise_evidence_candidates',
  candidate_relationship_review:'enterprise_evidence_candidate_relationship_reviews',assess_conflict:'enterprise_assess_evidence_conflicts',
  assess_conflict_resolution:'enterprise_assess_evidence_conflict_resolutions',tenant_template:'studio_tenant_template_aggregates',
  tenant_template_version:'studio_tenant_template_versions',tenant_template_review:'studio_tenant_template_review_events',
  tenant_template_approval:'studio_tenant_template_approval_events',module_handoff:'enterprise_module_handoffs',module_handoff_review:'enterprise_module_handoff_review_events',module_handoff_approval:'enterprise_module_handoff_approval_events',studio_artifact:'studio_artifact_aggregates',
  studio_artifact_review:'studio_artifact_review_resolutions',studio_artifact_approval:'studio_artifact_approval_resolutions',
  studio_source_package:'studio_artifact_source_packages',studio_artifact_version:'studio_artifact_versions',delivery_handoff:'enterprise_delivery_handoffs',delivery_handoff_review:'enterprise_delivery_handoff_review_events',delivery_handoff_approval:'enterprise_delivery_handoff_approval_events',
  delivery_source_package:'enterprise_delivery_source_packages',delivery_work_package:'enterprise_delivery_work_packages',
  delivery_item:'enterprise_delivery_work_item_aggregates',delivery_item_version:'enterprise_delivery_work_item_versions',
  delivery_item_decision:'enterprise_delivery_work_item_decisions',delivery_package_review:'enterprise_delivery_package_review_events',
  delivery_package_approval:'enterprise_delivery_package_approval_events',delivery_package_blocker:'enterprise_delivery_package_blocker_events',
  monitor_baseline:'enterprise_monitor_baselines',pilot_environment:'pilot_operations_environments',pilot_tenant:'pilot_operations_tenants',
});
const HUMAN_ROLES=Object.freeze(['requester','reviewer','approver']);
const BROWSER_ATTESTATION_STEP = /^(?:select-|complete-remaining-|inspect-|compare-|verify-|reload-|desktop-|pixel-|zoom-|keyboard-|focused-|preserve-|logical-|non-color-)/u;
const STEP_ACTIONS = Object.freeze(Object.fromEntries(CONTROLLED_HUMAN_SERVER_ACTIONS.map(item=>[item.stepId,[item.action]])));

function fail(code) { throw new Error(code); }
function timestampMs(value) { return value instanceof Date?value.getTime():Date.parse(value); }
function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
}
export function validateControlledHumanObserverEnvelopeBridge(pairs) {
  validateControlledHumanProofPairs(pairs);
  const positive=CONTROLLED_HUMAN_SERVER_ACTIONS.filter(item=>item.observationKind==='server_event').map(item=>item.stepId).sort();
  const negative=CONTROLLED_HUMAN_SERVER_ACTIONS.filter(item=>item.observationKind==='negative_attempt').map(item=>item.stepId).sort();
  const actualPositive=pairs.filter(item=>item.binding.result==='succeeded').map(item=>item.stepId).sort();
  const actualNegative=pairs.filter(item=>item.binding.result==='denied').map(item=>item.stepId).sort();
  if(JSON.stringify(actualPositive)!==JSON.stringify(positive)||JSON.stringify(actualNegative)!==JSON.stringify(negative))
    fail('PR_C_CONTROLLED_HUMAN_OBSERVER_ENVELOPE_SET_REJECTED');
  return Object.freeze({total:pairs.length,positive:actualPositive.length,negative:actualNegative.length});
}
function stepResourceKind(stepId) {
  const action=STEP_ACTIONS[stepId]?.[0]??'';
  if(action.startsWith('delivery.handoff.'))return 'delivery_handoff';
  if(action.startsWith('delivery.item.')||action.startsWith('delivery.package.'))return 'delivery_work_package';
  if(action.startsWith('monitor.'))return 'monitor_baseline';
  if(action.startsWith('studio.')||action.startsWith('pr_c.controlled_human.synthetic_studio_'))return 'studio_artifact';
  if(action.startsWith('transcript.')||action.startsWith('assessment_v2.')||/assess|transcript|conflict/u.test(stepId))return 'assess';
  if(/handoff/u.test(stepId))return 'delivery_handoff';
  if(/baseline|monitor/u.test(stepId))return 'monitor_baseline';
  if(/item|package|delivery|proposal|descendant/u.test(stepId))return 'delivery_work_package';
  return 'controlled_human_exercise';
}
function stepObservationContract(stepId,negative) {
  if(negative&&(/-denied$/u.test(stepId)||/^reject-stale-/u.test(stepId)))return {observationKind:'negative_attempt',expectedResult:'denied',expectedActions:STEP_ACTIONS[stepId]??[]};
  if(negative&&/^(?:verify-|decline-|stop-with-no-)/u.test(stepId))return {observationKind:'no_effect',expectedResult:'no_effect_observed'};
  if(BROWSER_ATTESTATION_STEP.test(stepId)||!STEP_ACTIONS[stepId])return {observationKind:'human_attestation',expectedResult:'attested',expectedActions:[]};
  return {observationKind:'server_event',expectedResult:'succeeded',expectedActions:STEP_ACTIONS[stepId]};
}
export function controlledHumanStepEvidenceSpec(stepId,negative=false) {
  const observation=stepObservationContract(stepId,negative);const resourceKind=stepResourceKind(stepId);
  return Object.freeze({...observation,resourceKind,resourceFamilies:Object.freeze([...resourceFamilies(resourceKind)])});
}
function expectedDutySteps(humanRole) {
  if(!HUMAN_ROLES.includes(humanRole))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_ROLE_REJECTED');
  const catalog=new Map(CONTROLLED_HUMAN_CATALOG.map(record=>[record.checkpointId,record]));
  return CONTROLLED_HUMAN_EXECUTION_ORDER.flatMap(checkpointId=>{
    const checkpoint=catalog.get(checkpointId);
    return checkpoint.steps.filter(step=>HUMAN_DUTY_BY_PERSONA[step.personaKey]===humanRole)
      .map(step=>({...step,...stepObservationContract(step.stepId,step.negative),checkpointId,action:step.stepId,resourceKind:stepResourceKind(step.stepId)}));
  });
}
function exactObserverRequest(humanRole,steps) {
  const expected=expectedDutySteps(humanRole);
  if(!Array.isArray(steps)||steps.length!==expected.length)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED');
  let priorCompleted=-Infinity;
  return steps.map((record,index)=>{
    exactKeys(record,['checkpointId','stepId','personaKey','startedAt','completedAt','attemptDigest','bindingToken'],'PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED');
    const wanted=expected[index];
    if(record.checkpointId!==wanted.checkpointId||record.stepId!==wanted.stepId||record.personaKey!==wanted.personaKey)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED');
    const started=timestampMs(record.startedAt);const completed=timestampMs(record.completedAt);
    if(!Number.isFinite(started)||!Number.isFinite(completed)||new Date(started).toISOString()!==record.startedAt||new Date(completed).toISOString()!==record.completedAt
      ||completed<=started||started<=priorCompleted||!DIGEST.test(record.attemptDigest))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TIME_REJECTED');
    const requiresBinding=wanted.observationKind==='server_event'||wanted.observationKind==='negative_attempt';
    if(requiresBinding?!DIGEST.test(record.bindingToken):record.bindingToken!==null)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_BINDING_REJECTED');
    priorCompleted=completed;
    return {...record,negative:wanted.negative,action:wanted.action,resourceKind:wanted.resourceKind,observationKind:wanted.observationKind,expectedResult:wanted.expectedResult};
  });
}
function resourceFamilies(resourceKind) {
  if(resourceKind==='assess')return ['assess_process','assess_case','assess_studio_handoff','evidence_source','evidence_source_version','source_set','source_set_version','input_bundle','input_bundle_version','evidence_candidate','candidate_relationship_review','assess_conflict','assess_conflict_resolution'];
  if(resourceKind==='studio_artifact')return ['tenant_template','tenant_template_version','tenant_template_review','tenant_template_approval','studio_artifact','studio_source_package','studio_artifact_version','module_handoff'];
  if(resourceKind==='delivery_handoff')return ['module_handoff','delivery_handoff','delivery_source_package'];
  if(resourceKind==='delivery_work_package')return ['delivery_handoff','delivery_source_package','delivery_work_package','delivery_item','delivery_item_version','delivery_item_decision','delivery_package_review','delivery_package_approval','delivery_package_blocker'];
  if(resourceKind==='monitor_baseline')return ['monitor_baseline'];
  return [];
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex')}`; }
export function deterministicUuid(exerciseId, label) {
  const hex = createHash('sha256').update(`${exerciseId}\0${label}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function validateSupabaseTargetTuple(projectRef, apiUrl, databaseUrl, expectedPublicTargetDigest=process.env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST) {
  if (typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/u.test(projectRef)) fail('PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH');
  let api;
  let database;
  try {
    api = new URL(apiUrl);
    database = new URL(databaseUrl);
  } catch {
    fail('PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH');
  }
  const apiMatches = api.protocol === 'https:'
    && api.hostname === `${projectRef}.supabase.co`
    && api.username === '' && api.password === ''
    && api.pathname === '/' && api.search === '' && api.hash === '';
  const publicOrigin=canonicalSupabasePublicOrigin(apiUrl);
  const actualPublicTargetDigest=publicOrigin===null?null:sha256(`pr-c-controlled-human-public-target\0${publicOrigin}`);
  const databaseProtocolMatches = ['postgres:', 'postgresql:'].includes(database.protocol);
  const databasePathMatches = database.pathname === '/postgres' && database.hash === '';
  let databaseTlsMatches = false;
  try {
    databaseTlsMatches = validatePrivilegedPostgresConnectionString(databaseUrl, { allowLoopback: false });
  } catch {
    databaseTlsMatches = false;
  }
  const directMatches = database.hostname === `db.${projectRef}.supabase.co`
    && decodeURIComponent(database.username) === 'postgres'
    && ['', '5432'].includes(database.port);
  const poolerMatches = /^[a-z0-9-]+[.]pooler[.]supabase[.]com$/u.test(database.hostname)
    && decodeURIComponent(database.username) === `postgres.${projectRef}`
    && ['', '5432', '6543'].includes(database.port);
  if (!apiMatches || !DIGEST.test(expectedPublicTargetDigest??'') || actualPublicTargetDigest!==expectedPublicTargetDigest
    || !databaseProtocolMatches || !databasePathMatches || !databaseTlsMatches || (!directMatches && !poolerMatches)) {
    fail('PR_C_CONTROLLED_HUMAN_SUPABASE_TARGET_MISMATCH');
  }
  return true;
}

export function validatePrivilegedPostgresConnectionString(connectionString, { allowLoopback = true } = {}) {
  let parsed;
  try { parsed = new URL(connectionString); } catch { fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REJECTED');
  const local = ['localhost','127.0.0.1','::1'].includes(parsed.hostname);
  const entries = [...parsed.searchParams.entries()].map(([key,value])=>[key.toLowerCase(),value.toLowerCase()]);
  const forbidden = new Set(['uselibpqcompat','ssl','rejectunauthorized','sslcert','sslkey','sslrootcert']);
  if (entries.some(([key])=>forbidden.has(key))) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
  const modes=entries.filter(([key])=>key==='sslmode').map(([,value])=>value);
  if (local) {
    if (!allowLoopback || modes.length !== 0 || entries.length !== 0) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
    return true;
  }
  if (modes.length !== 1 || modes[0] !== 'verify-full' || entries.some(([key])=>key!=='sslmode')) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REQUIRED');
  const probe = new Client({ connectionString });
  if (probe.connectionParameters?.ssl === false || probe.connectionParameters?.ssl?.rejectUnauthorized === false) fail('PR_C_CONTROLLED_HUMAN_DATABASE_TLS_REJECTED');
  return true;
}
export async function loadCanonicalCapabilityInventory(root = process.cwd()) {
  const capabilities = new Set();
  for (const name of (await readdir(join(root,'supabase/migrations'))).filter(item=>item.endsWith('.sql')).sort()) {
    const source=await readFile(join(root,'supabase/migrations',name),'utf8');
    for(const block of source.matchAll(/INSERT\s+INTO\s+public[.]capabilities\s*\([^)]*capability_key[^)]*\)\s*VALUES([\s\S]*?)(?:ON\s+CONFLICT|;)/giu))
      for(const tuple of block[1].matchAll(/\(\s*'([^']+)'\s*,/gu))capabilities.add(tuple[1]);
  }
  if(!capabilities.size)fail('PR_C_CONTROLLED_HUMAN_CAPABILITY_INVENTORY_EMPTY');
  return capabilities;
}
export function validateFixtureCapabilities(fixture, capabilityInventory) {
  if(!(capabilityInventory instanceof Set)||!capabilityInventory.size)fail('PR_C_CONTROLLED_HUMAN_CAPABILITY_INVENTORY_EMPTY');
  const referenced=[...(fixture.personas??[]).flatMap(persona=>persona.capabilities??[]),...(fixture.journeyCapabilityContract??[]).flatMap(value=>value.required??[])];
  if(referenced.some(capability=>typeof capability!=='string'||!capabilityInventory.has(capability)))fail('PR_C_CONTROLLED_HUMAN_UNKNOWN_CAPABILITY');
  return true;
}
export async function loadFixture(path = FIXTURE_PATH, root = process.cwd()) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture.contractVersion !== 'pr-c-controlled-human-fixture-1'
    || fixture.environmentClass !== 'hosted_nonproduction_pilot'
    || fixture.pullRequestNumber !== 264
    || fixture.authority?.expectedMigrationTip !== EXPECTED_MIGRATION_TIP
    || fixture.authority?.productionAuthorized !== false
    || fixture.authority?.customerDataAuthorized !== false
    || fixture.authority?.realProviderCallsAuthorized !== false
    || fixture.authority?.syntheticOnly !== true
    || !Array.isArray(fixture.personas) || fixture.personas.length !== 12
    || new Set(fixture.personas.map(persona => persona.key)).size !== fixture.personas.length
    || !Array.isArray(fixture.journeyCapabilityContract) || fixture.journeyCapabilityContract.length !== 13
    || JSON.stringify([...(fixture.featureFlags??[])].sort()) !== JSON.stringify([...FEATURE_FLAGS].sort())) fail('PR_C_CONTROLLED_HUMAN_FIXTURE_INVALID');
  const personas = fixture.personas.map(persona => ({ ...persona, capabilities: [...persona.capabilities].sort() }));
  const personasByKey = new Map(personas.map(persona => [persona.key, persona]));
  for (const checkpoint of fixture.journeyCapabilityContract) {
    const persona = personasByKey.get(checkpoint.personaKey);
    if (!persona || !Array.isArray(checkpoint.required) || !checkpoint.required.length
      || new Set(checkpoint.required).size !== checkpoint.required.length
      || checkpoint.required.some(capability => !persona.capabilities.includes(capability))) fail('PR_C_CONTROLLED_HUMAN_JOURNEY_CAPABILITY_CONTRACT_INVALID');
  }
  const dutyPersonas=['requester','studio_reviewer','studio_approver'].map(key=>personasByKey.get(key));
  if(dutyPersonas.some(value=>!value)||new Set(dutyPersonas.map(value=>value.key)).size!==3)fail('PR_C_CONTROLLED_HUMAN_SEPARATION_OF_DUTY_INVALID');
  validateFixtureCapabilities(fixture,await loadCanonicalCapabilityInventory(root));
  const personaManifestDigest = sha256(personas);
  const fixtureManifestDigest = sha256(fixture);
  return Object.freeze({ fixture, personas, personaManifestDigest, fixtureManifestDigest });
}

export function relevantCheckoutChanges(status) {
  return status.split(/\r?\n/u).filter(Boolean).filter(line => {
    const path = line.slice(3).replaceAll('\\','/');
    return path !== '.agent/pr-c-client-tests/' && !path.startsWith('.agent/pr-c-client-tests/')
      && path !== 'artifacts/' && !path.startsWith('artifacts/');
  }).join('\n');
}
export function checkoutIdentity(cwd = process.cwd()) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--short', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  const dirty = relevantCheckoutChanges(status);
  return { head, dirty };
}

export function deriveContext(env, fixtureState, checkout = checkoutIdentity()) {
  const values = {
    environmentClass: env.PR_C_CONTROLLED_HUMAN_ENVIRONMENT_CLASS,
    prNumber: Number(env.PR_C_CONTROLLED_HUMAN_PR_NUMBER),
    releaseSha: env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA,
    reviewHeadSha: env.PR_C_CONTROLLED_HUMAN_REVIEW_HEAD_SHA,
    deployId: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ID,
    deployOrigin: env.PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN,
    exerciseId: env.PR_C_CONTROLLED_HUMAN_EXERCISE_ID,
    targetFingerprint: env.PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT,
    publicTargetDigest: env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST,
    siteName: env.PR_C_CONTROLLED_HUMAN_SITE_NAME,
    netlifyContext: env.PR_C_CONTROLLED_HUMAN_NETLIFY_CONTEXT,
  };
  if (values.environmentClass !== 'hosted_nonproduction_pilot') fail('PR_C_CONTROLLED_HUMAN_ENVIRONMENT_REJECTED');
  if (values.prNumber !== 264) fail('PR_C_CONTROLLED_HUMAN_PR_REJECTED');
  if (!SHA.test(values.releaseSha ?? '') || values.reviewHeadSha !== values.releaseSha || checkout.head !== values.releaseSha) fail('PR_C_CONTROLLED_HUMAN_SHA_REJECTED');
  if (checkout.dirty) fail('PR_C_CONTROLLED_HUMAN_DIRTY_CHECKOUT');
  if (!DEPLOY_ID.test(values.deployId ?? '')) fail('PR_C_CONTROLLED_HUMAN_DEPLOY_REJECTED');
  if (values.deployOrigin !== PREVIEW_ORIGIN || values.siteName !== 'avalaos-pilot' || values.netlifyContext !== 'deploy-preview') fail('PR_C_CONTROLLED_HUMAN_PREVIEW_REJECTED');
  if (!UUID.test(values.exerciseId ?? '')) fail('PR_C_CONTROLLED_HUMAN_EXERCISE_REJECTED');
  if (!DIGEST.test(values.targetFingerprint ?? '')) fail('PR_C_CONTROLLED_HUMAN_TARGET_REJECTED');
  if (!DIGEST.test(values.publicTargetDigest ?? '')) fail('PR_C_CONTROLLED_HUMAN_PUBLIC_TARGET_REJECTED');
  if (fixtureState.fixture.preview.originPattern !== '^https://deploy-preview-264--avalaos-pilot\\.netlify\\.app$') fail('PR_C_CONTROLLED_HUMAN_PREVIEW_CONTRACT_REJECTED');
  const exerciseDigest = sha256({
    contractVersion: CONTROLLER_VERSION,
    environmentClass: values.environmentClass,
    prNumber: values.prNumber,
    releaseSha: values.releaseSha,
    reviewHeadSha: values.reviewHeadSha,
    exerciseId: values.exerciseId,
    targetFingerprint: values.targetFingerprint,
    publicTargetDigest: values.publicTargetDigest,
    personaManifestDigest: fixtureState.personaManifestDigest,
    fixtureManifestDigest: fixtureState.fixtureManifestDigest,
    migrationTip: EXPECTED_MIGRATION_TIP,
  });
  if (env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST !== undefined
    && env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST !== exerciseDigest) fail('PR_C_CONTROLLED_HUMAN_EXERCISE_REJECTED');
  return Object.freeze({ ...values, exerciseDigest, personaManifestDigest: fixtureState.personaManifestDigest,
    fixtureManifestDigest: fixtureState.fixtureManifestDigest, migrationTip: EXPECTED_MIGRATION_TIP });
}

export function safeResult(phase, status, context, extra = {}) {
  const result = {
    contractVersion: CONTROLLER_VERSION, phase, status,
    environmentClass: context.environmentClass, prNumber: context.prNumber,
    releaseSha: context.releaseSha, reviewHeadSha: context.reviewHeadSha,
    deployId: context.deployId, deployOrigin: context.deployOrigin,
    exerciseDigest: context.exerciseDigest, targetFingerprint: context.targetFingerprint,
    publicTargetDigest: context.publicTargetDigest,
    personaManifestDigest: context.personaManifestDigest, fixtureManifestDigest: context.fixtureManifestDigest,
    migrationTip: context.migrationTip, productionAuthorized: false, customerDataAuthorized: false,
    realProviderCallsAuthorized: false, ...extra,
  };
  const forbidden = canonicalJson(result);
  if (/password|service[_-]?role|database_url|access[_-]?token|refresh[_-]?token|@example[.]invalid/iu.test(forbidden)) fail('PR_C_CONTROLLED_HUMAN_EVIDENCE_LEAK');
  return result;
}

export function assertTargetInventory(inventory, context, { allowSeeded = true, allowRecoverableAuth = false } = {}) {
  exactKeys(inventory, ['actualTargetFingerprint','marker','counts','recoverableAuthUsers','domainCounts','ownedResourceCounts','unownedResourceRows','providerRows','unsafeDeprovisionedRows','exercise','priorExercises'], 'PR_C_CONTROLLED_HUMAN_INVENTORY_FIELDS');
  if (inventory.actualTargetFingerprint !== context.targetFingerprint) fail('PR_C_CONTROLLED_HUMAN_TARGET_FINGERPRINT_MISMATCH');
  const marker = inventory.marker;
  if (!marker || marker.product_key !== 'avalaos-core' || marker.environment_class !== 'hosted_nonproduction_pilot'
    || marker.migration_tip !== EXPECTED_MIGRATION_TIP || marker.production_authorized !== false
    || marker.customer_data_authorized !== false || marker.real_provider_calls_authorized !== false) fail('PR_C_CONTROLLED_HUMAN_MARKER_MISMATCH');
  if (Number(inventory.providerRows) !== 0) fail('PR_C_CONTROLLED_HUMAN_PROVIDER_STATE_REJECTED');
  if (Number(inventory.unsafeDeprovisionedRows) !== 0) fail('PR_C_CONTROLLED_HUMAN_PARTIAL_RESET_REJECTED');
  if(!Array.isArray(inventory.priorExercises)) fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
  const priorDigests=new Set();
  for(const prior of inventory.priorExercises){
    if(!prior||prior.lifecycle!=='deprovisioned'||prior.exercise_digest===context.exerciseDigest||priorDigests.has(prior.exercise_digest)
      || !DIGEST.test(prior.exercise_digest??'')||!SHA.test(prior.release_sha??'')||prior.review_head_sha!==prior.release_sha
      || !DEPLOY_ID.test(prior.deploy_id??'')||prior.deploy_origin!==PREVIEW_ORIGIN
      || prior.target_fingerprint!==context.targetFingerprint||!DIGEST.test(prior.persona_manifest_digest??'')||!DIGEST.test(prior.fixture_manifest_digest??'')
      || prior.migration_tip!==EXPECTED_MIGRATION_TIP) fail('PR_C_CONTROLLED_HUMAN_HISTORY_REJECTED');
    priorDigests.add(prior.exercise_digest);
  }
  const cycleCount=inventory.priorExercises.length+(inventory.exercise?1:0);
  const recoverable=Number(inventory.recoverableAuthUsers);
  if(!Number.isSafeInteger(recoverable)||recoverable<0||recoverable>12||(!allowRecoverableAuth&&recoverable!==0)||inventory.exercise&&recoverable!==0)fail('PR_C_CONTROLLED_HUMAN_AUTH_RECOVERY_REJECTED');
  const expectedCounts={auth_users:12*cycleCount+recoverable,profiles:12*cycleCount,organizations:2*cycleCount,workspaces:3*cycleCount,exercises:cycleCount};
  if(Object.entries(expectedCounts).some(([key,value])=>Number(inventory.counts[key])!==value)) fail('PR_C_CONTROLLED_HUMAN_UNEXPECTED_DATA');
  if(Number(inventory.unownedResourceRows)!==0) fail('PR_C_CONTROLLED_HUMAN_UNOWNED_RESOURCE_REJECTED');
  if(!inventory.ownedResourceCounts||typeof inventory.ownedResourceCounts!=='object'||Array.isArray(inventory.ownedResourceCounts)) fail('PR_C_CONTROLLED_HUMAN_RESOURCE_INVENTORY_REJECTED');
  for(const [family,countValue] of Object.entries(inventory.ownedResourceCounts)) {
    const count=Number(countValue);const limit=RESOURCE_FAMILY_LIMITS[family];
    if(!limit||!Number.isSafeInteger(count)||count<0||count>limit*cycleCount) fail('PR_C_CONTROLLED_HUMAN_RESOURCE_BOUND_REJECTED');
  }
  for(const [domain,family] of Object.entries(DOMAIN_FAMILIES)) {
    if(Number(inventory.domainCounts?.[domain])!==Number(inventory.ownedResourceCounts[family]??0)) fail('PR_C_CONTROLLED_HUMAN_UNEXPECTED_DOMAIN_DATA');
  }
  if (inventory.exercise) {
    if (!allowSeeded || inventory.exercise.exercise_digest !== context.exerciseDigest
      || inventory.exercise.release_sha !== context.releaseSha || inventory.exercise.review_head_sha !== context.reviewHeadSha
      || inventory.exercise.deploy_id !== context.deployId || inventory.exercise.deploy_origin !== context.deployOrigin
      || inventory.exercise.target_fingerprint !== context.targetFingerprint
      || inventory.exercise.persona_manifest_digest !== context.personaManifestDigest
      || inventory.exercise.fixture_manifest_digest !== context.fixtureManifestDigest
      || inventory.exercise.migration_tip !== context.migrationTip
      || !['active','read_only','deprovisioned'].includes(inventory.exercise.lifecycle)) fail('PR_C_CONTROLLED_HUMAN_EXERCISE_REPLAY_REJECTED');
  }
  return true;
}

export class PostgresEnvironmentAdapter {
  constructor(connectionString) {
    if (!connectionString) fail('PR_C_CONTROLLED_HUMAN_DATABASE_URL_REQUIRED');
    validatePrivilegedPostgresConnectionString(connectionString);
    this.client = new Client({ connectionString, application_name: 'avalaos_pr_c_controlled_human' });
  }
  async connect() { await this.client.connect(); }
  async close() { await this.client.end().catch(() => undefined); }
  async inspect(context) {
    const identity = (await this.client.query(`select (select system_identifier::text from pg_control_system()) system_identifier,current_database() database_name,current_user database_role`)).rows[0];
    const actualTargetFingerprint = sha256(`${identity.system_identifier}\0${identity.database_name}\0${identity.database_role}`);
    const marker = (await this.client.query(`select product_key,environment_class,migration_tip,production_authorized,customer_data_authorized,real_provider_calls_authorized from public.hosted_pilot_environment_identity where singleton`)).rows[0] ?? null;
    const counts = (await this.client.query(`select
      (select count(*)::int from auth.users) auth_users,
      (select count(*)::int from public.profiles) profiles,
      (select count(*)::int from public.organizations) organizations,
      (select count(*)::int from public.workspaces) workspaces,
      (select count(*)::int from public.pr_c_controlled_human_exercises) exercises`)).rows[0];
    const recoverableAuthUsers=Number((await this.client.query(`select count(*)::int count from auth.users where raw_user_meta_data->>'synthetic'='true' and raw_user_meta_data->>'exerciseDigest'=$1 and not exists(select 1 from public.pr_c_controlled_human_persona_bindings binding where binding.auth_user_id=auth.users.id)`,[context.exerciseDigest])).rows[0].count);
    const domainCounts = (await this.client.query(`select
      (select count(*)::int from public.assess_processes) assess_processes,
      (select count(*)::int from public.assess_v2_cases) assess_v2_cases,
      (select count(*)::int from public.assess_v2_studio_handoffs) assess_v2_studio_handoffs,
      (select count(*)::int from public.enterprise_module_handoffs) enterprise_module_handoffs,
      (select count(*)::int from public.studio_artifact_aggregates) studio_artifacts,
      (select count(*)::int from public.studio_artifact_source_packages) studio_source_packages,
      (select count(*)::int from public.enterprise_delivery_handoffs) delivery_handoffs,
      (select count(*)::int from public.enterprise_delivery_work_packages) delivery_packages,
      (select count(*)::int from public.enterprise_monitor_baselines) monitor_baselines,
      (select count(*)::int from public.pilot_operations_environments) pilot_environments,
      (select count(*)::int from public.pilot_operations_tenants) pilot_tenants`)).rows[0];
    const ownedRows=(await this.client.query(`select resource_family,count(*)::int count
      from public.pr_c_controlled_human_resource_ownership group by resource_family order by resource_family`)).rows;
    const ownedResourceCounts=Object.fromEntries(ownedRows.map(row=>[row.resource_family,Number(row.count)]));
    const unownedSql=Object.entries(RESOURCE_TABLES).map(([family,table])=>`select '${family}' family,resource.id
      from public.${table} resource left join public.pr_c_controlled_human_resource_ownership ownership
      on ownership.resource_family='${family}' and ownership.resource_id=resource.id where ownership.resource_id is null`).join(' union all ');
    const unownedResourceRows=Number((await this.client.query(`select count(*)::int count from (${unownedSql}) unowned`)).rows[0].count);
    const providerState=(await this.client.query(`select public.pr_c_controlled_human_provider_state() state`)).rows[0].state;
    const providerRows=Number(providerState.unsafeRows)+Number(providerState.providerEgress)+Number(providerState.providerCalls);
    const unsafeDeprovisionedRows=(await this.client.query(`select
      (select count(*) from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and profile.status<>'disabled')+
      (select count(*) from public.workspace_memberships membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and membership.status='active')+
      (select count(*) from public.organization_members membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and membership.status='active')+
      (select count(*) from public.organizations organization where organization.status<>'suspended' and exists(select 1 from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and binding.org_id=organization.id))+
      (select count(*) from public.workspaces workspace where workspace.status<>'suspended' and exists(select 1 from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned' and binding.workspace_id=workspace.id))+
      (select count(*) from public.pilot_operations_environments environment join public.pr_c_controlled_human_exercises exercise on exercise.org_id=environment.org_id and exercise.workspace_id=environment.workspace_id where exercise.lifecycle='deprovisioned' and (environment.lifecycle<>'deactivated' or not environment.maintenance or not environment.read_only))+
      (select count(*) from public.pilot_operations_tenants tenant join public.pr_c_controlled_human_exercises exercise on exercise.org_id=tenant.org_id and exercise.workspace_id=tenant.workspace_id where exercise.lifecycle='deprovisioned' and tenant.lifecycle<>'deprovisioned')+
      (select count(*) from auth.sessions session join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=session.user_id join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.lifecycle='deprovisioned') total`)).rows[0].total;
    const exercise = (await this.client.query(`select exercise_digest,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,lifecycle,concurrency_version from public.pr_c_controlled_human_exercises where exercise_digest=$1`,[context.exerciseDigest])).rows[0] ?? null;
    const priorExercises=(await this.client.query(`select exercise_digest,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,lifecycle,concurrency_version from public.pr_c_controlled_human_exercises where exercise_digest<>$1 order by created_at,exercise_digest`,[context.exerciseDigest])).rows;
    return { actualTargetFingerprint, marker, counts, recoverableAuthUsers, domainCounts, ownedResourceCounts, unownedResourceRows, providerRows, unsafeDeprovisionedRows, exercise, priorExercises };
  }
  async seed(context, fixtureState, users) {
    const db = this.client; await db.query('begin');
    try {
      await db.query(`select pg_advisory_xact_lock(hashtextextended($1,0))`, [context.targetFingerprint]);
      const existing = (await db.query(`select exercise_digest,lifecycle from public.pr_c_controlled_human_exercises where exercise_digest=$1 for update`,[context.exerciseDigest])).rows[0];
      if (existing) { if (existing.lifecycle !== 'active') fail('PR_C_CONTROLLED_HUMAN_EXERCISE_REPLAY_REJECTED'); await db.query('rollback'); return { replayed:true, personaCount:users.length, studioArtifactCount:2, eligibleStudioArtifactCount:2, packageCount:2, baselineCount:1, lifecycle:'active', concurrencyVersion:1 }; }
      const ids = buildIdentifiers(context, fixtureState);
      await db.query(`update public.enterprise_intelligence_runtime_control set enabled=true,read_only=false,provider_enabled=false,delivery_enabled=true,updated_at=statement_timestamp() where singleton`);
      await db.query(`update public.studio_artifact_runtime_control set enabled=true,read_only=false,provider_enabled=false,updated_at=statement_timestamp() where singleton`);
      for (const user of users) await db.query(`insert into public.profiles(id,email,full_name,status,metadata) values($1,$2,$3,$4,$5::jsonb)`,
        [user.id,user.email,`Synthetic ${user.key}`,user.state==='revoked'?'disabled':'active',JSON.stringify({synthetic:true,exerciseDigest:context.exerciseDigest,personaKey:user.key})]);
      const requester = users.find(user => user.key === 'requester'); const crossActor = users.find(user => user.key === 'cross_org_actor');
      await db.query(`insert into public.organizations(id,name,slug,status,settings,created_by) values
        ($1,'Synthetic PR 264 controlled human',$6,'active',$2::jsonb,$3),
        ($4,'Synthetic PR 264 isolation',$7,'active',$2::jsonb,$5)`,
        [ids.mainOrg,JSON.stringify({syntheticOnly:true,exerciseDigest:context.exerciseDigest}),requester.id,ids.crossOrg,crossActor.id,`pr-264-controlled-${context.exerciseDigest.slice(7,19)}`,`pr-264-isolation-${context.exerciseDigest.slice(7,19)}`]);
      await db.query(`insert into public.workspaces(id,org_id,name,slug,status,metadata,created_by) values
        ($1,$2,'Controlled Delivery','controlled-delivery','active',$3::jsonb,$4),
        ($5,$2,'Isolation Workspace','isolation-workspace','active',$3::jsonb,$4),
        ($6,$7,'Cross Organization','cross-organization','active',$3::jsonb,$8)`,
        [ids.deliveryWorkspace,ids.mainOrg,JSON.stringify({syntheticOnly:true,exerciseDigest:context.exerciseDigest}),requester.id,ids.otherWorkspace,ids.crossWorkspace,ids.crossOrg,crossActor.id]);
      for (const org of [{id:ids.mainOrg,role:ids.mainOrgRole,actor:requester.id,key:'main'}, {id:ids.crossOrg,role:ids.crossOrgRole,actor:crossActor.id,key:'cross'}])
        await db.query(`insert into public.roles(id,org_id,name,slug,scope,permissions,status,is_system,created_by) values($1,$2,$3,$4,'organization','[]','active',false,$5)`,[org.role,org.id,`Synthetic ${org.key} member`,`${org.key}-member`,org.actor]);
      await db.query(`insert into public.pr_c_controlled_human_exercises(id,exercise_digest,environment_class,pull_request_number,release_sha,review_head_sha,deploy_id,deploy_origin,target_fingerprint,public_target_digest,persona_manifest_digest,fixture_manifest_digest,migration_tip,org_id,workspace_id,lifecycle)
        values($1,$2,'hosted_nonproduction_pilot',264,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'active')`,[context.exerciseId,context.exerciseDigest,context.releaseSha,context.deployId,context.deployOrigin,context.targetFingerprint,context.publicTargetDigest,context.personaManifestDigest,context.fixtureManifestDigest,context.migrationTip,ids.mainOrg,ids.deliveryWorkspace]);
      for (const user of users) {
        const persona = fixtureState.personas.find(value => value.key === user.key); const scope = persona.workspace === 'delivery' ? {org:ids.mainOrg,workspace:ids.deliveryWorkspace,orgRole:ids.mainOrgRole} : persona.workspace === 'other' ? {org:ids.mainOrg,workspace:ids.otherWorkspace,orgRole:ids.mainOrgRole} : {org:ids.crossOrg,workspace:ids.crossWorkspace,orgRole:ids.crossOrgRole};
        const roleId = ids.roles[user.key]; const state = user.state === 'revoked' ? 'suspended' : 'active';
        const scopeActor=persona.workspace==='cross_org'?crossActor.id:requester.id;
        await db.query(`insert into public.roles(id,org_id,workspace_id,name,slug,scope,permissions,status,is_system,created_by) values($1,$2,$3,$4,$5,'workspace',$6::jsonb,'active',false,$7)`,[roleId,scope.org,scope.workspace,`Synthetic ${user.key}`,`pr264-${user.key.replaceAll('_','-')}`,JSON.stringify(persona.capabilities),scopeActor]);
        for (const capability of persona.capabilities) await db.query(`insert into public.role_capabilities(role_id,capability_key) values($1,$2) on conflict do nothing`,[roleId,capability]);
        await db.query(`insert into public.organization_members(org_id,user_id,role_id,status,joined_at,created_by) values($1,$2,$3,$4,statement_timestamp(),$5)`,[scope.org,user.id,scope.orgRole,state,scopeActor]);
        await db.query(`insert into public.workspace_memberships(org_id,workspace_id,user_id,role_id,status,joined_at,disabled_at,created_by) values($1,$2,$3,$4,$5,statement_timestamp(),case when $5='suspended' then statement_timestamp() end,$6)`,[scope.org,scope.workspace,user.id,roleId,state,scopeActor]);
        await db.query(`insert into public.authorization_versions(org_id,user_id,version) values($1,$2,1) on conflict(org_id,user_id) do nothing`,[scope.org,user.id]);
        await db.query(`insert into public.pr_c_controlled_human_persona_bindings(exercise_id,org_id,workspace_id,persona_key,auth_user_id,role_id,expected_state,capability_digest,credential_generation_digest)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[context.exerciseId,scope.org,scope.workspace,user.key,user.id,roleId,user.state,sha256(persona.capabilities),user.credentialGenerationDigest]);
      }
      for(const checkpoint of CONTROLLED_HUMAN_CATALOG) for(const step of checkpoint.steps) {
        const persona=fixtureState.personas.find(value=>value.key===step.personaKey);
        const observation=stepObservationContract(step.stepId,step.negative);
        await db.query(`insert into public.pr_c_controlled_human_step_contracts(exercise_id,checkpoint_id,step_id,persona_key,negative,action,resource_kind,observation_kind,expected_result,expected_actions,capability_digest)
          values($1,$2,$3,$4,$5,$3,$6,$7,$8,$9::text[],$10)`,[context.exerciseId,checkpoint.checkpointId,step.stepId,step.personaKey,step.negative,stepResourceKind(step.stepId),observation.observationKind,observation.expectedResult,observation.expectedActions??[],sha256(persona.capabilities)]);
      }
      const journeyIds=buildJourneyIdentifiers(context);
      await db.query(`insert into public.pilot_operations_environments(id,org_id,workspace_id,environment_type,lifecycle,expected_schema_version,required_capabilities,maintenance,read_only,created_by) values($1,$2,$3,'pilot_candidate','active_non_live',$4,'[]',false,false,$5)`,[journeyIds.pilotEnvironment,ids.mainOrg,ids.deliveryWorkspace,context.migrationTip,requester.id]);
      await db.query(`insert into public.pilot_operations_tenants(id,org_id,workspace_id,environment_id,lifecycle,created_by) values($1,$2,$3,$4,'active',$5)`,[journeyIds.pilotTenant,ids.mainOrg,ids.deliveryWorkspace,journeyIds.pilotEnvironment,requester.id]);
      for (const workspace of [ids.deliveryWorkspace,ids.otherWorkspace]) await db.query(`insert into public.enterprise_transcript_workspace_flags(org_id,workspace_id,transcript_source_sets_enabled,assess_multisource_apply_enabled,unified_byok_gateway_enabled,governed_journeys_enabled,studio_multisource_enabled,studio_tenant_templates_enabled,module_handoffs_enabled,direct_studio_planning_enabled,direct_delivery_planning_enabled,delivery_item_review_enabled,monitor_approved_baseline_enabled,updated_by)
        values($1,$2,$3,$3,$3,$3,$3,$3,$3,$3,$3,$3,$3,$4)`,[ids.mainOrg,workspace,workspace===ids.deliveryWorkspace,requester.id]);
      await db.query(`insert into public.enterprise_transcript_workspace_flags(org_id,workspace_id,module_handoffs_enabled,direct_delivery_planning_enabled,delivery_item_review_enabled,monitor_approved_baseline_enabled,updated_by) values($1,$2,false,false,false,false,$3)`,[ids.crossOrg,ids.crossWorkspace,crossActor.id]);
      const requesterAuthorizationVersion=Number((await db.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[ids.mainOrg,requester.id])).rows[0]?.version);
      if(!Number.isSafeInteger(requesterAuthorizationVersion)||requesterAuthorizationVersion<1) fail('PR_C_CONTROLLED_HUMAN_AUTHORIZATION_VERSION_REJECTED');
      const byKey=Object.fromEntries(users.map(user=>[user.key,user]));
      const authorizationVersions={};
      for(const key of new Set(fixtureState.fixture.journeyCapabilityContract.map(value=>value.personaKey))) authorizationVersions[key]=Number((await db.query(`select version from public.authorization_versions where org_id=$1 and user_id=$2`,[ids.mainOrg,byKey[key].id])).rows[0].version);
      for (const checkpoint of fixtureState.fixture.journeyCapabilityContract) {
        const actor = byKey[checkpoint.personaKey];
        const authorizationVersion = authorizationVersions[checkpoint.personaKey];
        for (const capability of checkpoint.required) await db.query(
          `select public.pr1b_assert_command_authority($1,$2,$3,$4,$5)`,
          [actor.id,ids.mainOrg,ids.deliveryWorkspace,capability,authorizationVersion],
        );
      }
      const studioSeed=await seedStudioJourneyFixtures(db,context,fixtureState,ids,byKey,authorizationVersions);
      const prerequisiteSeed=await seedTranscriptAndTemplatePrerequisites(db,context,fixtureState,ids,byKey,authorizationVersions);
      const command = makeManualCommand(context, fixtureState, ids, requester.id,requesterAuthorizationVersion);
      const packageResult = (await db.query(`select public.enterprise_delivery_monitor_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;
      let commandOrdinal=20;
      const invoke=async(actorKey,action,payload,key)=>{
        // The canonical command validates its own deferred integrity checks by
        // switching constraints to IMMEDIATE. Restore the transaction default
        // before the next command so a second package can insert its aggregate
        // before its source row inside that command's atomic unit.
        await db.query('set constraints all deferred');
        const ordinal=commandOrdinal++;const actor=byKey[actorKey];const request={action,actorId:actor.id,organizationId:ids.mainOrg,workspaceId:ids.deliveryWorkspace,authorizationVersion:authorizationVersions[actorKey],receiptId:deterministicUuid(context.exerciseId,`baseline-receipt-${ordinal}`),requestId:deterministicUuid(context.exerciseId,`baseline-request-${ordinal}`),idempotencyKey:`pr264-${key}-${context.exerciseDigest.slice(7,19)}`,executionToken:deterministicUuid(context.exerciseId,`baseline-token-${ordinal}`),executionFence:ordinal,...payload};
        return (await db.query(`select public.enterprise_delivery_monitor_command($1::jsonb) result`,[JSON.stringify(request)])).rows[0].result;
      };
      const baselineFixture=fixtureState.fixture.seed.approvedBaselinePackage;
      const baselinePackage=await invoke('delivery_author','delivery.package.create.manual',{manualBrief:baselineFixture.brief,items:baselineFixture.items},'baseline-create');
      const accepted=await invoke('requester','delivery.item.review',{itemAggregateId:baselinePackage.items[0].aggregateId,expectedAggregateVersion:1,expectedItemVersionId:baselinePackage.items[0].versionId,outcome:'accepted',rationale:'Synthetic baseline item accepted for controlled comparison.'},'baseline-item-accept');
      const reviewed=await invoke('delivery_reviewer','delivery.package.review.resolve',{workPackageId:baselinePackage.resourceId,expectedPackageVersion:1,expectedPackageVersionId:baselinePackage.packageVersionId,expectedPackageAggregateVersion:2,outcome:'approved',rationale:'Independent synthetic controlled-human review.'},'baseline-review');
      const approved=await invoke('delivery_approver','delivery.package.approval.resolve',{workPackageId:baselinePackage.resourceId,expectedPackageVersion:1,expectedPackageVersionId:baselinePackage.packageVersionId,expectedPackageAggregateVersion:2,outcome:'approved',rationale:'Independent synthetic controlled-human approval.'},'baseline-approve');
      const baseline=await invoke('delivery_approver','monitor.baseline.create',{workPackageId:baselinePackage.resourceId,expectedPackageVersion:1,expectedPackageVersionId:baselinePackage.packageVersionId},'baseline-create-monitor');
      const seedDigest = sha256({exerciseDigest:context.exerciseDigest,personaCount:users.length,studioSeed,prerequisiteSeed,packageResult,baselinePackage,accepted,reviewed,approved,baseline,providerCalls:0});
      await db.query(`insert into public.pr_c_controlled_human_operation_events(exercise_id,sequence,operation,safe_result_digest) values($1,1,'seeded',$2)`,[context.exerciseId,seedDigest]);
      await db.query('commit');
      return { replayed:false, personaCount:users.length, studioArtifactCount:2, eligibleStudioArtifactCount:2,packageCount:2,baselineCount:1,transcriptSourceCount:prerequisiteSeed.sourceCount,sourceSetCount:prerequisiteSeed.sourceSetCount,inputBundleCount:prerequisiteSeed.inputBundleCount,candidateCount:prerequisiteSeed.candidateCount,conflictCount:prerequisiteSeed.conflictCount,tenantTemplateCount:prerequisiteSeed.templateCount,lifecycle:'active',concurrencyVersion:1 };
    } catch (error) { await db.query('rollback'); throw error; }
  }
  async verify(context, expectedPersonaCount) {
    const row = (await this.client.query(`select exercise.lifecycle,exercise.concurrency_version,
      (select count(*)::int from public.pr_c_controlled_human_persona_bindings where exercise_id=exercise.id) persona_count,
      (select count(*)::int from public.workspace_memberships membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id and binding.exercise_id=exercise.id where membership.status='active') active_memberships,
      (select count(*)::int from public.enterprise_delivery_work_packages where org_id=exercise.org_id and workspace_id=exercise.workspace_id) package_count,
      (select count(*)::int from public.enterprise_monitor_baselines where org_id=exercise.org_id and workspace_id=exercise.workspace_id and status='approved') baseline_count,
      (select count(*)::int from public.studio_artifact_aggregates where org_id=exercise.org_id and workspace_id=exercise.workspace_id) studio_artifact_count,
      (select count(*)::int from public.studio_artifact_aggregates where org_id=exercise.org_id and workspace_id=exercise.workspace_id and lifecycle='approved') approved_studio_artifact_count,
      (select count(*)::int from public.studio_artifact_source_packages where org_id=exercise.org_id and workspace_id=exercise.workspace_id and source_mode='assess_handoff' and lineage_classification='assessed' and planning_only=false) assessed_studio_artifact_count,
      (select count(*)::int from public.studio_artifact_source_packages where org_id=exercise.org_id and workspace_id=exercise.workspace_id and source_mode='manual_brief' and lineage_classification='not_assessed' and planning_only=true) direct_studio_artifact_count,
      (select count(*)::int from public.enterprise_delivery_handoffs where org_id=exercise.org_id and workspace_id=exercise.workspace_id) delivery_handoff_count,
      (select count(*)::int from public.enterprise_evidence_sources where org_id=exercise.org_id and workspace_id=exercise.workspace_id and status<>'deleted') transcript_source_count,
      (select count(*)::int from public.enterprise_source_sets where org_id=exercise.org_id and workspace_id=exercise.workspace_id) source_set_count,
      (select count(*)::int from public.enterprise_module_input_bundles where org_id=exercise.org_id and workspace_id=exercise.workspace_id) input_bundle_count,
      (select count(*)::int from public.enterprise_evidence_candidates where org_id=exercise.org_id and workspace_id=exercise.workspace_id) candidate_count,
      (select count(*)::int from public.enterprise_assess_evidence_conflicts where org_id=exercise.org_id and workspace_id=exercise.workspace_id) conflict_count,
      (select count(*)::int from public.studio_tenant_template_aggregates where org_id=exercise.org_id and workspace_id=exercise.workspace_id and lifecycle='approved') tenant_template_count,
      (select count(*)::int from public.pilot_operations_environments environment where environment.org_id=exercise.org_id and environment.workspace_id=exercise.workspace_id and environment.lifecycle='active_non_live' and not environment.maintenance and not environment.read_only) pilot_environment_count,
      (select count(*)::int from public.pilot_operations_tenants tenant where tenant.org_id=exercise.org_id and tenant.workspace_id=exercise.workspace_id and tenant.lifecycle='active') pilot_tenant_count,
      (select count(*)::int from public.ai_provider_configs config where not(
        config.status='disabled' and config.key_ref_id is null and config.default_model='synthetic-no-provider'
        and config.display_name='PR C controlled-human offline provenance'
        and exists(select 1 from public.pr_c_controlled_human_exercises provenance_exercise
          where provenance_exercise.org_id=config.org_id and config.evidence_ref='pr-c-controlled-human:'||provenance_exercise.exercise_digest)))
      + (select count(*)::int from public.hosted_pilot_provider_simulations) provider_rows,
      (flags.transcript_source_sets_enabled::int+flags.assess_multisource_apply_enabled::int+flags.unified_byok_gateway_enabled::int+flags.governed_journeys_enabled::int+
       flags.studio_multisource_enabled::int+flags.studio_tenant_templates_enabled::int+flags.module_handoffs_enabled::int+flags.direct_studio_planning_enabled::int+
       flags.direct_delivery_planning_enabled::int+flags.delivery_item_review_enabled::int+flags.monitor_approved_baseline_enabled::int) feature_flag_count,
      control.enabled runtime_enabled,control.provider_enabled,control.read_only,studio_control.enabled studio_runtime_enabled,studio_control.read_only studio_read_only,studio_control.provider_enabled studio_provider_enabled
      from public.pr_c_controlled_human_exercises exercise
      join public.enterprise_transcript_workspace_flags flags on flags.org_id=exercise.org_id and flags.workspace_id=exercise.workspace_id
      cross join public.enterprise_intelligence_runtime_control control cross join public.studio_artifact_runtime_control studio_control where exercise.exercise_digest=$1 and control.singleton and studio_control.singleton`,[context.exerciseDigest])).rows[0];
    const requester=(await this.client.query(`select auth_user_id from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.exercise_digest=$1 and binding.persona_key='requester'`,[context.exerciseDigest])).rows[0]?.auth_user_id;
    const requesterAuthorizationVersion=Number((await this.client.query(`select version from public.authorization_versions where org_id=(select org_id from public.pr_c_controlled_human_exercises where exercise_digest=$1) and user_id=$2`,[context.exerciseDigest,requester])).rows[0]?.version);
    const projection=(await this.client.query(`select public.enterprise_delivery_workspace_projection((select org_id from public.pr_c_controlled_human_exercises where exercise_digest=$1),(select workspace_id from public.pr_c_controlled_human_exercises where exercise_digest=$1),$2::jsonb) projection`,[context.exerciseDigest,JSON.stringify({actorId:requester,authorizationVersion:requesterAuthorizationVersion})])).rows[0]?.projection;
    const eligibleIds=new Set((projection?.eligibleStudioArtifacts??[]).map(value=>value.studioArtifactId));
    if (!row || row.lifecycle !== 'active' || Number(row.persona_count) !== expectedPersonaCount || Number(row.active_memberships) !== expectedPersonaCount - 1
      || Number(row.package_count) < 2 || Number(row.baseline_count) < 1 || Number(row.provider_rows) !== 0 || row.provider_enabled || row.studio_provider_enabled || row.read_only || row.studio_read_only
      || !row.runtime_enabled || !row.studio_runtime_enabled || Number(row.studio_artifact_count)<2 || Number(row.approved_studio_artifact_count)<2 || Number(row.assessed_studio_artifact_count)<1 || Number(row.direct_studio_artifact_count)<1
      || Number(row.transcript_source_count)<4 || Number(row.source_set_count)<2 || Number(row.input_bundle_count)<2 || Number(row.candidate_count)<2 || Number(row.conflict_count)<1 || Number(row.tenant_template_count)<1
      || Number(row.pilot_environment_count)!==1 || Number(row.pilot_tenant_count)!==1 || eligibleIds.size<2
      || Number(row.feature_flag_count)!==FEATURE_FLAGS.length) fail('PR_C_CONTROLLED_HUMAN_VERIFY_REJECTED');
    return { personaCount:Number(row.persona_count), activeMembershipCount:Number(row.active_memberships), studioArtifactCount:Number(row.studio_artifact_count), eligibleStudioArtifactCount:eligibleIds.size, packageCount:Number(row.package_count), baselineCount:Number(row.baseline_count),transcriptSourceCount:Number(row.transcript_source_count),sourceSetCount:Number(row.source_set_count),inputBundleCount:Number(row.input_bundle_count),candidateCount:Number(row.candidate_count),conflictCount:Number(row.conflict_count),tenantTemplateCount:Number(row.tenant_template_count),providerRowCount:0,lifecycle:row.lifecycle,concurrencyVersion:Number(row.concurrency_version),featureFlagCount:Number(row.feature_flag_count) };
  }
  async quiesce(context, expectedVersion) {
    const digest = sha256({exerciseDigest:context.exerciseDigest,operation:'quiesce',expectedVersion});
    return (await this.client.query(`select public.pr_c_controlled_human_quiesce($1,$2,$3) result`,[context.exerciseDigest,expectedVersion,digest])).rows[0].result;
  }
  async prepareRecovery(context,operation,expectedVersion,authorityDigest=sha256({exerciseDigest:context.exerciseDigest,operation,expectedVersion})) {
    return (await this.client.query(`select public.pr_c_controlled_human_prepare_recovery($1,$2,$3,$4,$5,$6,$7,statement_timestamp()+interval '2 hours') result`,
      [context.exerciseDigest,context.releaseSha,context.deployId,context.targetFingerprint,authorityDigest,operation,expectedVersion])).rows[0].result;
  }
  async recordAuthUser(context,userId) {
    await this.client.query(`select public.pr_c_controlled_human_record_auth_user($1,$2,$3)`,[context.exerciseDigest,context.releaseSha,userId]);
  }
  async completeRecovery(context,operation) {
    await this.client.query(`select public.pr_c_controlled_human_complete_recovery($1,$2,$3)`,[context.exerciseDigest,context.releaseSha,operation]);
  }
  async recoveryAuthority(context,operation) {
    return (await this.client.query(`select state,expires_at<=statement_timestamp() expired,expected_version from public.pr_c_controlled_human_recovery_authorities where exercise_digest=$1 and release_sha=$2 and deploy_id=$3 and target_fingerprint=$4 and operation=$5`,
      [context.exerciseDigest,context.releaseSha,context.deployId,context.targetFingerprint,operation])).rows[0]??null;
  }
  async bindQuiescedHistory(context,expectedVersion,historyDigest) {
    return (await this.client.query(`select public.pr_c_controlled_human_bind_quiesced_history($1,$2,$3) result`,[context.exerciseDigest,expectedVersion,historyDigest])).rows[0].result;
  }
  async revokeSessions(context) {
    await this.client.query('begin'); try {
      const count = (await this.client.query(`with deleted as (delete from auth.sessions where user_id in (select auth_user_id from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.exercise_digest=$1) returning id) select count(*)::int count from deleted`,[context.exerciseDigest])).rows[0].count;
      await this.client.query('commit'); return Number(count);
    } catch (error) { await this.client.query('rollback'); throw error; }
  }
  async boundUserIds(context) {
    return (await this.client.query(`select binding.auth_user_id from public.pr_c_controlled_human_persona_bindings binding join public.pr_c_controlled_human_exercises exercise on exercise.id=binding.exercise_id where exercise.exercise_digest=$1 order by binding.persona_key`,[context.exerciseDigest])).rows.map(row=>row.auth_user_id);
  }
  async finalizeDeprovision(context, expectedVersion, sessionCount, credentialCount) {
    const sessionDigest=sha256({exerciseDigest:context.exerciseDigest,operation:'sessions_revoked',sessionCount});
    const credentialDigest=sha256({exerciseDigest:context.exerciseDigest,operation:'credentials_disabled',credentialCount});
    const resultDigest=sha256({exerciseDigest:context.exerciseDigest,operation:'deprovision',immutableHistoryRetained:true,domainRowsDeleted:false});
    return (await this.client.query(`select public.pr_c_controlled_human_finalize_deprovision($1,$2,$3,$4,$5) result`,[context.exerciseDigest,expectedVersion,sessionDigest,credentialDigest,resultDigest])).rows[0].result;
  }
  async lifecycleInspection(context) {
    const providerState=(await this.client.query(`select public.pr_c_controlled_human_provider_state() state`)).rows[0].state;
    const state=(await this.client.query(`select exercise.id,exercise.lifecycle,exercise.concurrency_version,
      (flags.transcript_source_sets_enabled::int+flags.assess_multisource_apply_enabled::int+flags.unified_byok_gateway_enabled::int+flags.governed_journeys_enabled::int+
       flags.studio_multisource_enabled::int+flags.studio_tenant_templates_enabled::int+flags.module_handoffs_enabled::int+flags.direct_studio_planning_enabled::int+
       flags.direct_delivery_planning_enabled::int+flags.delivery_item_review_enabled::int+flags.monitor_approved_baseline_enabled::int) feature_flag_count,
      (control.read_only::int+studio_control.read_only::int) runtime_read_only_count,
      (control.provider_enabled::int+studio_control.provider_enabled::int) runtime_provider_enabled_count,
      (select count(*)::int from public.pr_c_controlled_human_persona_bindings where exercise_id=exercise.id) bound_persona_count,
      (select count(*)::int from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id where binding.exercise_id=exercise.id and profile.status='active') active_profile_count,
      (select count(*)::int from public.workspace_memberships membership join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=membership.user_id where binding.exercise_id=exercise.id and membership.status='active') active_membership_count,
      (select count(distinct organization.id)::int from public.organizations organization join public.pr_c_controlled_human_persona_bindings binding on binding.org_id=organization.id where binding.exercise_id=exercise.id and organization.status='active') active_organization_count,
      (select count(distinct workspace.id)::int from public.workspaces workspace join public.pr_c_controlled_human_persona_bindings binding on binding.workspace_id=workspace.id where binding.exercise_id=exercise.id and workspace.status='active') active_workspace_count,
      (select count(*)::int from public.pilot_operations_environments environment where environment.org_id=exercise.org_id and environment.workspace_id=exercise.workspace_id and environment.lifecycle<>'deactivated') active_pilot_environment_count,
      (select count(*)::int from public.pilot_operations_tenants tenant where tenant.org_id=exercise.org_id and tenant.workspace_id=exercise.workspace_id and tenant.lifecycle<>'deprovisioned') active_pilot_tenant_count,
      (select count(*)::int from auth.sessions session join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=session.user_id where binding.exercise_id=exercise.id) active_session_count,
      (select count(*)::int from public.ai_provider_audit_events where org_id=exercise.org_id and workspace_id=exercise.workspace_id) provider_egress_count,
      ((select count(*) from public.ai_provider_configs config where not(
          config.status='disabled' and config.key_ref_id is null and config.default_model='synthetic-no-provider'
          and config.display_name='PR C controlled-human offline provenance'
          and exists(select 1 from public.pr_c_controlled_human_exercises provenance_exercise
            where provenance_exercise.org_id=config.org_id and config.evidence_ref='pr-c-controlled-human:'||provenance_exercise.exercise_digest)))+
       (select count(*) from public.ai_provider_key_refs)+
       (select count(*) from public.enterprise_ai_capability_routes route where not(
          route.enabled=false and route.deleted_at is null and route.capability='assess.evidence.extract' and route.model='synthetic-no-provider'
          and exists(select 1 from public.ai_provider_configs config where config.id=route.provider_config_id and config.org_id=route.org_id
            and config.status='disabled' and config.key_ref_id is null and config.default_model='synthetic-no-provider'
            and exists(select 1 from public.pr_c_controlled_human_exercises provenance_exercise
              where provenance_exercise.org_id=config.org_id and provenance_exercise.workspace_id=route.workspace_id
                and config.evidence_ref='pr-c-controlled-human:'||provenance_exercise.exercise_digest))))+
       (select count(*) from public.enterprise_ai_budget_reservations)+
       (select count(*) from public.enterprise_ai_job_ledger job where not(
          job.provider_config_id is not null and job.provider='groq' and job.model='synthetic-no-provider'
          and job.prompt_key='controlled-human-offline' and job.status='succeeded' and job.token_input is null and job.token_output is null and job.latency_ms is null
          and job.metadata->>'controlledHumanSyntheticNoProvider'='true'
          and exists(select 1 from public.pr_c_controlled_human_exercises provenance_exercise
            where provenance_exercise.org_id=job.org_id and provenance_exercise.workspace_id=job.workspace_id
              and job.metadata->>'exerciseDigest'=provenance_exercise.exercise_digest)))+
       (select count(*) from public.studio_artifact_generation_attempts)+(select count(*) from public.hosted_pilot_provider_simulations))::int real_provider_call_count,
      (select count(*)::int from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id where binding.exercise_id=exercise.id and coalesce((profile.metadata->>'synthetic')::boolean,false)=false) customer_data_record_count,
      (select count(*)::int from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id where binding.exercise_id=exercise.id and profile.email not like 'prc264.%@example.invalid') external_user_count
      ,exercise.quiesced_history_digest
      from public.pr_c_controlled_human_exercises exercise join public.enterprise_transcript_workspace_flags flags on flags.org_id=exercise.org_id and flags.workspace_id=exercise.workspace_id
      cross join public.enterprise_intelligence_runtime_control control cross join public.studio_artifact_runtime_control studio_control
      where exercise.exercise_digest=$1 and control.singleton and studio_control.singleton`,[context.exerciseDigest])).rows[0];
    if(!state)fail('PR_C_CONTROLLED_HUMAN_EXERCISE_REPLAY_REJECTED');
    const events=(await this.client.query(`select sequence,operation,safe_result_digest from public.pr_c_controlled_human_operation_events where exercise_id=$1 order by sequence`,[state.id])).rows;
    const ownership=(await this.client.query(`select resource_family,array_agg(resource_id order by resource_id) resource_ids from public.pr_c_controlled_human_resource_ownership where exercise_id=$1 group by resource_family order by resource_family`,[state.id])).rows;
    let missing=0;
    for(const row of ownership) {
      const table=RESOURCE_TABLES[row.resource_family];if(!table)fail('PR_C_CONTROLLED_HUMAN_RESOURCE_INVENTORY_REJECTED');
      missing+=Number((await this.client.query(`select count(*)::int count from unnest($1::uuid[]) owned_id(value) where not exists(select 1 from public.${table} resource where resource.id=owned_id.value)`,[row.resource_ids])).rows[0].count);
    }
    const operationEventDigest=sha256(events.map(event=>({sequence:Number(event.sequence),operation:event.operation,safeResultDigest:event.safe_result_digest})));
    const immutableHistoryDigest=sha256({events:operationEventDigest,ownership:ownership.map(row=>({family:row.resource_family,resourceIds:row.resource_ids}))});
    const safety={providerEgress:Number(providerState.providerEgress),realProviderCalls:Number(providerState.unsafeRows)+Number(providerState.providerCalls),customerDataRecords:Number(state.customer_data_record_count),externalUsers:Number(state.external_user_count)};
    const safeState={lifecycle:state.lifecycle,concurrencyVersion:Number(state.concurrency_version),featureFlagCountEnabled:Number(state.feature_flag_count),runtimeControlReadOnlyCount:Number(state.runtime_read_only_count),runtimeControlProviderEnabledCount:Number(state.runtime_provider_enabled_count),activeMembershipCount:Number(state.active_membership_count),activeProfileCount:Number(state.active_profile_count),activeOrganizationCount:Number(state.active_organization_count),activeWorkspaceCount:Number(state.active_workspace_count),activePilotEnvironmentCount:Number(state.active_pilot_environment_count),activePilotTenantCount:Number(state.active_pilot_tenant_count),activeSessionCount:Number(state.active_session_count),boundPersonaCount:Number(state.bound_persona_count),immutableHistoryRetained:missing===0,domainRowsDeleted:missing,operationEventCount:events.length,operationEventDigest,immutableHistoryDigest,quiescedHistoryDigest:state.quiesced_history_digest??null,safety};
    return {...safeState,postInspectionDigest:sha256(safeState)};
  }
  async observeDuty(context,humanRole,requestedSteps,requestDigest) {
    const request=exactObserverRequest(humanRole,requestedSteps);
    if(!DIGEST.test(requestDigest)||requestDigest!==sha256({humanRole,steps:requestedSteps}))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED');
    const db=this.client;await db.query('begin');
    try {
      const state=(await db.query(`select exercise.id,exercise.org_id,exercise.workspace_id,exercise.lifecycle,exercise.concurrency_version,exercise.quiesced_at,
        clock_timestamp() observed_at,(select min(created_at) from public.pr_c_controlled_human_operation_events where exercise_id=exercise.id and operation='seeded') seeded_at
        from public.pr_c_controlled_human_exercises exercise where exercise.exercise_digest=$1 for share`,[context.exerciseDigest])).rows[0];
      if(!state||state.lifecycle!=='read_only'||!state.seeded_at||!state.quiesced_at)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_STATE_REJECTED');
      if(request.some(step=>timestampMs(step.startedAt)<timestampMs(state.seeded_at)))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_BEFORE_EXERCISE_REJECTED');
      if(request.some(step=>timestampMs(step.completedAt)>timestampMs(state.observed_at)))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_FUTURE_REJECTED');
      const quiescedAt=timestampMs(state.quiesced_at);
      if(request.some(step=>step.stepId==='verify-history-readable-and-actions-absent'
        ? timestampMs(step.startedAt)<quiescedAt
        : timestampMs(step.completedAt)>=quiescedAt))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_QUIESCE_ORDER_REJECTED');
      const existing=(await db.query(`select checkpoint_id,step_id,request_digest,safe_record,observed_at from public.pr_c_controlled_human_step_observations where exercise_id=$1 and human_role=$2 order by observed_at,checkpoint_id,step_id`,[state.id,humanRole])).rows;
      if(existing.length) {
        if(existing.length!==request.length||existing.some(row=>row.request_digest!==requestDigest))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REPLAY_REJECTED');
        const indexed=new Map(existing.map(row=>[`${row.checkpoint_id}\0${row.step_id}`,row]));
        const records=request.map(step=>indexed.get(`${step.checkpointId}\0${step.stepId}`));
        if(records.some(value=>!value))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REPLAY_REJECTED');
        const lifecycle=await this.lifecycleInspection(context);await db.query('commit');
        return {humanRole,observedAt:new Date(Math.max(...records.map(row=>timestampMs(row.observed_at)))).toISOString(),lifecycle:lifecycle.lifecycle,concurrencyVersion:lifecycle.concurrencyVersion,
          operationEventSequence:lifecycle.operationEventCount,operationEventDigest:lifecycle.operationEventDigest,immutableHistoryDigest:lifecycle.immutableHistoryDigest,steps:records.map(row=>row.safe_record)};
      }
      const contracts=(await db.query(`select contract.checkpoint_id,contract.step_id,contract.persona_key,contract.negative,contract.action contract_action,contract.resource_kind,contract.observation_kind,contract.expected_result,contract.expected_actions,contract.capability_digest,
        intent.action catalog_action,intent.target_family,intent.target_version_dimension,intent.effect_family,intent.transition_kind,intent.selector_schema,intent.effect_resolver,intent.expected_outcome,intent.expected_denial_code,intent.replay_of_step_id,
        binding.auth_user_id,binding.org_id,binding.workspace_id,binding.role_id,binding.expected_state,profile.status profile_status,
        membership.status membership_status,authority.version authorization_version,
        coalesce(array_agg(capability.capability_key order by capability.capability_key) filter(where capability.capability_key is not null),array[]::text[]) capabilities
        from public.pr_c_controlled_human_step_contracts contract
        left join public.pr_c_controlled_human_intent_catalog intent on intent.checkpoint_id=contract.checkpoint_id and intent.step_id=contract.step_id
        join public.pr_c_controlled_human_persona_bindings binding on binding.exercise_id=contract.exercise_id and binding.persona_key=contract.persona_key
        join public.profiles profile on profile.id=binding.auth_user_id
        join public.workspace_memberships membership on membership.org_id=binding.org_id and membership.workspace_id=binding.workspace_id and membership.user_id=binding.auth_user_id
        join public.authorization_versions authority on authority.org_id=binding.org_id and authority.user_id=binding.auth_user_id
        left join public.role_capabilities capability on capability.role_id=binding.role_id
        where contract.exercise_id=$1 and contract.persona_key=any($2::text[])
        group by contract.exercise_id,contract.checkpoint_id,contract.step_id,intent.checkpoint_id,intent.step_id,binding.exercise_id,binding.persona_key,binding.auth_user_id,binding.org_id,binding.workspace_id,binding.role_id,binding.expected_state,profile.status,membership.status,authority.version`,
        [state.id,[...new Set(request.map(step=>step.personaKey))]])).rows;
      const contractMap=new Map(contracts.map(row=>[`${row.checkpoint_id}\0${row.step_id}`,row]));
      if(contracts.length!==request.length)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CONTRACT_REJECTED');
      const ownership=(await db.query(`select resource_family,resource_id,created_at from public.pr_c_controlled_human_resource_ownership where exercise_id=$1 order by resource_family,resource_id`,[state.id])).rows;
      const receipts=(await db.query(`select * from (
        select 'assess' source,id,actor_id,request_id,command_type action,status,coalesce(response->>'errorCode','') failure_code,CASE WHEN coalesce(response->>'resourceId','')~'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (response->>'resourceId')::uuid END resource_id,response,created_at,coalesce(completed_at,created_at) event_at from public.assess_command_receipts where org_id=$1 and workspace_id=$2
        union all select 'studio',id,actor_id,request_id,command_type,status,coalesce(failure_code,''),resource_id,response,created_at,coalesce(completed_at,created_at) from public.studio_artifact_command_receipts where org_id=$1 and workspace_id=$2
        union all select 'tenant_template',id,actor_id,request_id,command_type,status,coalesce(failure_code,''),resource_id,response,created_at,coalesce(completed_at,created_at) from public.studio_tenant_template_command_receipts where org_id=$1 and workspace_id=$2
        union all select 'module_handoff',id,actor_id,request_id,command_type,status,coalesce(failure_code,''),resource_id,response,created_at,coalesce(completed_at,created_at) from public.enterprise_module_handoff_command_receipts where org_id=$1 and workspace_id=$2
        union all select 'delivery',id,actor_id,request_id,action,status,coalesce(failure_code,''),resource_id,response,created_at,coalesce(completed_at,created_at) from public.enterprise_delivery_monitor_command_receipts where org_id=$1 and workspace_id=$2
        union all select 'synthetic_generation',id,actor_id,request_id,'pr_c.controlled_human.synthetic_studio_generate',status,'',artifact_id,response,created_at,coalesce(completed_at,created_at) from public.pr_c_controlled_human_synthetic_generation_receipts where exercise_id=$3
        union all select 'enterprise_ai',id,actor_id,initial_request_id,command_type,status,coalesce(response->>'errorCode',''),resource_id,response,created_at,coalesce(completed_at,created_at) from public.enterprise_ai_command_receipts where org_id=$1 and workspace_id=$2
      ) receipt order by event_at,id`,[state.org_id,state.workspace_id,state.id])).rows;
      const audits=(await db.query(`select id,actor_id,request_id,action,resource_type,resource_id,outcome,resource_version,metadata,created_at from public.privileged_audit_events where org_id=$1 and workspace_id=$2 order by created_at,id`,[state.org_id,state.workspace_id])).rows;
      const deliveryAttempts=(await db.query(`select id,receipt_id,actor_id,action,request_id,created_at from public.enterprise_delivery_monitor_command_attempts where org_id=$1 and workspace_id=$2 order by created_at,id`,[state.org_id,state.workspace_id])).rows;
      const deliveryEffects=(await db.query(`select id,receipt_id,actor_id,action,resource_id,audit_id,created_at from public.enterprise_delivery_monitor_effects where org_id=$1 and workspace_id=$2 order by created_at,id`,[state.org_id,state.workspace_id])).rows;
      const aiEffects=(await db.query(`select id,receipt_id,operation_type action,resource_id,committed_at created_at from public.enterprise_ai_effect_journal where org_id=$1 and workspace_id=$2 order by committed_at,id`,[state.org_id,state.workspace_id])).rows;
      const actionAnchors=(await db.query(`select id,checkpoint_id,step_id,persona_key,actor_id,observation_kind,action,target_family,target_id,expected_version,transition_kind,created_family,request_id,actor_authorization_version,selector_bindings,selector_digest,intent_digest,challenge_token,safe_anchor,created_at
        from public.pr_c_controlled_human_action_anchors where exercise_id=$1 order by created_at,checkpoint_id,step_id`,[state.id])).rows;
      const actionBindings=(await db.query(`select anchor_id,checkpoint_id,step_id,persona_key,actor_id,observation_kind,action,result,denial_proof_kind,resource_family,resource_id,expected_version,observed_version,request_id,receipt_source,receipt_id,audit_id,intent_digest,denial_code_digest,binding_token,safe_record,created_at
        from public.pr_c_controlled_human_action_bindings where exercise_id=$1 order by created_at,checkpoint_id,step_id`,[state.id])).rows;
      const safetyRaw=(await db.query(`select
        (select count(*)::int from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id where binding.exercise_id=$1 and coalesce((profile.metadata->>'synthetic')::boolean,false)=false) customer_data_records,
        (select count(*)::int from public.profiles profile join public.pr_c_controlled_human_persona_bindings binding on binding.auth_user_id=profile.id where binding.exercise_id=$1 and profile.email not like 'prc264.%@example.invalid') external_users`,[state.id])).rows[0];
      const providerState=(await db.query(`select public.pr_c_controlled_human_provider_state() state`)).rows[0].state;
      const safety={providerEgress:Number(providerState.providerEgress),realProviderCalls:Number(providerState.unsafeRows)+Number(providerState.providerCalls),customerDataRecords:Number(safetyRaw.customer_data_records),externalUsers:Number(safetyRaw.external_users)};
      if(Object.values(safety).some(value=>value!==0))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_SAFETY_REJECTED');
      const lifecycle=await this.lifecycleInspection(context);
      const records=[];const usedCausalEvents=new Set();const usedAttemptDigests=new Set();const usedBindingTokens=new Set();
      const databaseDigest=async value=>(await db.query(`select 'sha256:'||public.pr_c_controlled_human_sha256_jsonb($1::jsonb) digest`,[JSON.stringify(value)])).rows[0].digest;
      for(const step of request) {
        const contract=contractMap.get(`${step.checkpointId}\0${step.stepId}`);
        if(!contract||contract.persona_key!==step.personaKey||contract.contract_action!==step.action||contract.resource_kind!==step.resourceKind||contract.negative!==step.negative
          ||contract.observation_kind!==step.observationKind||contract.expected_result!==step.expectedResult)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CONTRACT_REJECTED');
        const requiresBinding=contract.observation_kind==='server_event'||contract.observation_kind==='negative_attempt';
        if(requiresBinding&&(!contract.target_family||!contract.effect_family||!contract.transition_kind||!contract.effect_resolver
          ||contract.catalog_action!==(Array.isArray(contract.expected_actions)?contract.expected_actions[0]:null)))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CATALOG_REJECTED');
        const actualCapabilityDigest=sha256(contract.capabilities);
        if(actualCapabilityDigest!==contract.capability_digest)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_AUTHORITY_REJECTED');
        const start=timestampMs(step.startedAt);const completed=timestampMs(step.completedAt);
        const windowReceipts=receipts.filter(value=>value.actor_id===contract.auth_user_id&&timestampMs(value.event_at)>=start&&timestampMs(value.event_at)<=completed);
        const windowAudits=audits.filter(value=>value.actor_id===contract.auth_user_id&&timestampMs(value.created_at)>=start&&timestampMs(value.created_at)<=completed);
        if(usedAttemptDigests.has(step.attemptDigest))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_ATTEMPT_REUSE_REJECTED');
        usedAttemptDigests.add(step.attemptDigest);
        const expectedActions=Array.isArray(contract.expected_actions)?contract.expected_actions:[];
        const successfulReceipts=windowReceipts.filter(value=>['succeeded','committed'].includes(value.status)&&expectedActions.includes(value.action));
        const successfulAudits=windowAudits.filter(value=>value.outcome==='succeeded'&&expectedActions.includes(value.action));
        const families=requiresBinding?[contract.observation_kind==='negative_attempt'?contract.target_family:contract.effect_family]:resourceFamilies(contract.resource_kind);
        const currentResources=ownership.filter(value=>families.includes(value.resource_family));
        const windowResources=currentResources.filter(value=>timestampMs(value.created_at)>=start&&timestampMs(value.created_at)<=completed);
        let exactAnchor=null;let exactBinding=null;let exactReceipt=null;let exactAudit=null;let exactEffect=null;let exactAttempt=null;
        if(requiresBinding) {
          const matches=actionBindings.filter(value=>value.binding_token===step.bindingToken);
          if(matches.length!==1||usedBindingTokens.has(step.bindingToken))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_BINDING_REJECTED');
          usedBindingTokens.add(step.bindingToken);exactBinding=matches[0];exactAnchor=actionAnchors.find(value=>value.id===exactBinding.anchor_id);
          if(exactBinding.checkpoint_id!==step.checkpointId||exactBinding.step_id!==step.stepId||exactBinding.persona_key!==step.personaKey
            ||exactBinding.actor_id!==contract.auth_user_id||exactBinding.observation_kind!==contract.observation_kind||exactBinding.action!==expectedActions[0]
            ||!expectedActions.includes(exactBinding.action)||timestampMs(exactBinding.created_at)<start||timestampMs(exactBinding.created_at)>completed
            ||!exactAnchor||exactAnchor.checkpoint_id!==step.checkpointId||exactAnchor.step_id!==step.stepId||exactAnchor.persona_key!==step.personaKey
            ||exactAnchor.actor_id!==contract.auth_user_id||exactAnchor.action!==exactBinding.action||exactAnchor.request_id!==exactBinding.request_id
            ||exactAnchor.challenge_token!==exactBinding.safe_record.anchorToken||timestampMs(exactAnchor.created_at)<start
            ||timestampMs(exactAnchor.created_at)>timestampMs(exactBinding.created_at)||Number(exactBinding.observed_version)<0
            ||exactAnchor.target_family!==contract.target_family||exactAnchor.transition_kind!==contract.transition_kind
            ||exactBinding.resource_family!==(contract.observation_kind==='negative_attempt'?contract.target_family:contract.effect_family))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_BINDING_REJECTED');
          const safe=exactBinding.safe_record;
          exactKeys(safe,['contractVersion','stepId','action','result','resourceFamily','resourceDigest','expectedVersion','observedVersion','requestDigest','receiptDigest','auditDigest','intentDigest','denialCodeDigest','bindingToken','anchorToken','causalParentBindingToken','causalParentResourceDigest','causalLineageDigest','issuedAt'],'PR_C_CONTROLLED_HUMAN_OBSERVER_BINDING_REJECTED');
          const anchorSafe=exactAnchor.safe_anchor;
          exactKeys(anchorSafe,['contractVersion','stepId','action','targetFamily','targetDigest','expectedVersion','transitionKind','selectorDigest','intentDigest','requestDigest','challengeToken','anchoredAt'],'PR_C_CONTROLLED_HUMAN_OBSERVER_ANCHOR_REJECTED');
          const resourceDigest=await databaseDigest({resourceFamily:exactBinding.resource_family,resourceId:exactBinding.resource_id});
          const requestIdentityDigest=await databaseDigest({requestId:exactBinding.request_id});
          const targetDigest=await databaseDigest({resourceFamily:exactAnchor.target_family,resourceId:exactAnchor.target_id});
          const selectorDigest=await databaseDigest(exactAnchor.selector_bindings);
          const proofSentinel=await databaseDigest({proof:'not_applicable'});
          const receiptIdentityDigest=contract.observation_kind==='negative_attempt'?proofSentinel:await databaseDigest({source:exactBinding.receipt_source,receiptId:exactBinding.receipt_id});
          const auditIdentityDigest=contract.observation_kind==='negative_attempt'?proofSentinel:await databaseDigest({auditId:exactBinding.audit_id});
          const recomputedToken=await databaseDigest({anchorToken:exactAnchor.challenge_token,intentDigest:exactAnchor.intent_digest,action:exactBinding.action,resourceFamily:exactBinding.resource_family,resourceId:exactBinding.resource_id,
            expectedVersion:Number(exactBinding.expected_version),observedVersion:Number(exactBinding.observed_version),requestId:exactBinding.request_id,receiptId:exactBinding.receipt_id,auditId:exactBinding.audit_id,denialCodeDigest:exactBinding.denial_code_digest});
          const causalProof=step.checkpointId==='CH-03'
            ?(await db.query(`select public.pr_c_controlled_human_step_causal_proof($1,$2,$3) proof`,[state.id,step.stepId,exactBinding.resource_id])).rows[0].proof
            :{causalParentBindingToken:proofSentinel,causalParentResourceDigest:proofSentinel,causalLineageDigest:proofSentinel};
          if(anchorSafe.contractVersion!=='pr-c-controlled-human-step-anchor-1'||anchorSafe.stepId!==step.stepId||anchorSafe.action!==exactBinding.action
            ||anchorSafe.targetFamily!==exactAnchor.target_family||anchorSafe.targetDigest!==targetDigest||Number(anchorSafe.expectedVersion)!==Number(exactAnchor.expected_version)
            ||anchorSafe.transitionKind!==exactAnchor.transition_kind||anchorSafe.selectorDigest!==selectorDigest||anchorSafe.intentDigest!==exactAnchor.intent_digest||anchorSafe.requestDigest!==requestIdentityDigest
            ||anchorSafe.challengeToken!==exactAnchor.challenge_token||Math.abs(timestampMs(anchorSafe.anchoredAt)-timestampMs(exactAnchor.created_at))>=1
            ||safe.contractVersion!=='pr-c-controlled-human-step-binding-3'||safe.stepId!==step.stepId||safe.action!==exactBinding.action||safe.result!==exactBinding.result
            ||safe.resourceFamily!==exactBinding.resource_family||safe.resourceDigest!==resourceDigest||Number(safe.expectedVersion)!==Number(exactBinding.expected_version)
            ||Number(safe.observedVersion)!==Number(exactBinding.observed_version)||safe.requestDigest!==requestIdentityDigest||safe.receiptDigest!==receiptIdentityDigest
            ||safe.auditDigest!==auditIdentityDigest||safe.intentDigest!==exactAnchor.intent_digest||safe.denialCodeDigest!==exactBinding.denial_code_digest||safe.anchorToken!==exactAnchor.challenge_token||safe.bindingToken!==recomputedToken||safe.bindingToken!==step.bindingToken
            ||safe.causalParentBindingToken!==causalProof.causalParentBindingToken||safe.causalParentResourceDigest!==causalProof.causalParentResourceDigest||safe.causalLineageDigest!==causalProof.causalLineageDigest
            ||Math.abs(timestampMs(safe.issuedAt)-timestampMs(exactBinding.created_at))>=1)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_BINDING_REJECTED');
          if(exactAnchor.transition_kind==='same'&&(exactBinding.resource_family!==contract.target_family||exactBinding.resource_id!==exactAnchor.target_id||Number(exactBinding.observed_version)!==Number(exactAnchor.expected_version)))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(exactAnchor.transition_kind==='increment_one'&&(exactBinding.resource_family!==contract.effect_family||Number(exactBinding.observed_version)!==Number(exactAnchor.expected_version)+1
            ||(contract.effect_family===contract.target_family&&exactBinding.resource_id!==exactAnchor.target_id)))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(exactAnchor.transition_kind==='create_one'&&(exactBinding.resource_family!==contract.effect_family||Number(exactBinding.observed_version)!==1))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(exactAnchor.transition_kind==='create_zero'&&(exactBinding.resource_family!==contract.effect_family||Number(exactBinding.observed_version)!==0))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(exactAnchor.transition_kind==='replay_existing'&&(exactBinding.resource_family!==contract.effect_family||Number(exactBinding.observed_version)<=0))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(Number(exactBinding.observed_version)===0&&exactAnchor.transition_kind!=='create_zero')fail('PR_C_CONTROLLED_HUMAN_OBSERVER_TRANSITION_REJECTED');
          if(contract.observation_kind==='server_event') {
            exactReceipt=receipts.find(value=>value.source===exactBinding.receipt_source&&value.id===exactBinding.receipt_id);
            exactAudit=audits.find(value=>value.id===exactBinding.audit_id);
            const exactOwned=ownership.filter(value=>value.resource_family===exactBinding.resource_family&&value.resource_id===exactBinding.resource_id);
            const replay=contract.transition_kind==='replay_existing';
            if(exactOwned.length!==1||!exactReceipt||exactReceipt.actor_id!==contract.auth_user_id||exactReceipt.action!==exactBinding.action
              ||!['succeeded','committed'].includes(exactReceipt.status)||(!replay&&exactReceipt.request_id!==exactBinding.request_id))
              fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CAUSAL_RESOURCE_REJECTED');
            if(replay){
              const attempts=deliveryAttempts.filter(value=>value.receipt_id===exactBinding.receipt_id&&value.request_id===exactBinding.request_id
                &&value.actor_id===contract.auth_user_id&&value.action===exactBinding.action);
              if(attempts.length!==1||timestampMs(attempts[0].created_at)<start||timestampMs(attempts[0].created_at)>completed)fail(`PR_C_CONTROLLED_HUMAN_OBSERVER_REPLAY_REJECTED:${step.stepId}:${JSON.stringify({attempts:attempts.length,time:attempts[0]?timestampMs(attempts[0].created_at)-start:null,end:attempts[0]?completed-timestampMs(attempts[0].created_at):null})}`);
              exactAttempt=attempts[0];
              const prior=actionBindings.filter(value=>value.checkpoint_id===step.checkpointId&&value.step_id===contract.replay_of_step_id&&value.result==='succeeded');
              if(prior.length!==1||prior[0].receipt_id!==exactBinding.receipt_id||prior[0].audit_id!==exactBinding.audit_id
                ||prior[0].resource_family!==exactBinding.resource_family||prior[0].resource_id!==exactBinding.resource_id
                ||Number(prior[0].observed_version)!==Number(exactBinding.observed_version))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REPLAY_REJECTED');
            }else if(timestampMs(exactReceipt.event_at)<start||timestampMs(exactReceipt.event_at)>completed)fail(`PR_C_CONTROLLED_HUMAN_OBSERVER_CAUSAL_RESOURCE_REJECTED:${step.stepId}:receipt-window:${timestampMs(exactReceipt.event_at)-start}:${completed-timestampMs(exactReceipt.event_at)}`);
            if(contract.effect_resolver==='enterprise_ai_conflict'){
              const effects=aiEffects.filter(value=>value.receipt_id===exactBinding.receipt_id&&value.action===exactBinding.action&&value.resource_id===exactAnchor.target_id);
              if(exactBinding.receipt_source!=='enterprise_ai'||exactBinding.audit_id!==null||exactAudit||effects.length!==1
                ||timestampMs(effects[0].created_at)<start||timestampMs(effects[0].created_at)>completed)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CAUSAL_RESOURCE_REJECTED');
              exactEffect=effects[0];
            }else{
              if(!exactAudit||exactAudit.actor_id!==contract.auth_user_id||exactAudit.action!==exactBinding.action||exactAudit.outcome!=='succeeded'
                ||(!replay&&exactAudit.request_id!==exactBinding.request_id)||(!replay&&(timestampMs(exactAudit.created_at)<start||timestampMs(exactAudit.created_at)>completed)))
                fail(`PR_C_CONTROLLED_HUMAN_OBSERVER_CAUSAL_RESOURCE_REJECTED:${step.stepId}:${JSON.stringify({audit:!!exactAudit,actor:exactAudit?.actor_id===contract.auth_user_id,action:exactAudit?.action===exactBinding.action,outcome:exactAudit?.outcome,request:exactAudit?.request_id===exactBinding.request_id,time:exactAudit?timestampMs(exactAudit.created_at)-start:null,end:exactAudit?completed-timestampMs(exactAudit.created_at):null})}`);
              if(contract.effect_resolver.startsWith('delivery_')){
                const effects=deliveryEffects.filter(value=>value.receipt_id===exactBinding.receipt_id&&value.audit_id===exactBinding.audit_id
                  &&value.actor_id===contract.auth_user_id&&value.action===exactBinding.action);
                if(effects.length!==1)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_CAUSAL_RESOURCE_REJECTED');
                exactEffect=effects[0];
              }
            }
          } else {
            if(exactBinding.result!=='denied'||!['denied_audit','server_denied_attempt'].includes(exactBinding.denial_proof_kind))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_DENIAL_PROOF_REJECTED');
            if(exactBinding.denial_proof_kind==='denied_audit') {
              exactAudit=audits.find(value=>value.id===exactBinding.audit_id);
              if(!exactAudit||exactAudit.actor_id!==contract.auth_user_id||exactAudit.request_id!==exactBinding.request_id||exactAudit.action!==exactBinding.action
                ||exactAudit.outcome!=='denied'||exactAudit.resource_type!==exactBinding.resource_family||exactAudit.resource_id!==exactBinding.resource_id
                ||Number(exactAudit.resource_version)!==Number(exactBinding.observed_version)||timestampMs(exactAudit.created_at)<start||timestampMs(exactAudit.created_at)>completed)
                fail('PR_C_CONTROLLED_HUMAN_OBSERVER_DENIAL_PROOF_REJECTED');
            } else if(exactBinding.audit_id!==null)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_DENIAL_PROOF_REJECTED');
          }
        }
        const observedDeltas={receipt:successfulReceipts.length,audit:successfulAudits.length,
          target:windowResources.filter(value=>['assess_process','assess_case','assess_studio_handoff','module_handoff','studio_artifact','studio_source_package','delivery_handoff','delivery_source_package','delivery_work_package'].includes(value.resource_family)).length,
          itemVersion:windowResources.filter(value=>value.resource_family==='delivery_item_version').length,
          approval:windowResources.filter(value=>['tenant_template_approval','delivery_package_approval'].includes(value.resource_family)).length,
          baseline:windowResources.filter(value=>value.resource_family==='monitor_baseline').length};
        const hasSideEffect=Object.values(observedDeltas).some(value=>value!==0);
        if(contract.expected_result!=='succeeded'&&hasSideEffect)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_NEGATIVE_EFFECT_REJECTED');
        const isVerifyHistory=step.checkpointId==='CH-13'&&step.stepId==='verify-history-readable-and-actions-absent';
        if(isVerifyHistory&&(state.lifecycle!=='read_only'||lifecycle.runtimeControlReadOnlyCount!==2))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_STATE_REJECTED');
        const denialIntent=contract.observation_kind==='negative_attempt';
        const denialProofKind=denialIntent?exactBinding?.denial_proof_kind:null;
        if(denialIntent&&!denialProofKind)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_DENIAL_PROOF_REJECTED');
        const observedKind=denialIntent?'negative_attempt':contract.observation_kind;
        const observedResult=denialIntent?'denied':contract.expected_result;
        const controlledState=sha256({exerciseDigest:context.exerciseDigest,lifecycle:state.lifecycle,concurrencyVersion:Number(state.concurrency_version),operationEventDigest:lifecycle.operationEventDigest});
        const resourceDigest=exactBinding?.safe_record.resourceDigest??(isVerifyHistory?lifecycle.immutableHistoryDigest:contract.resource_kind==='controlled_human_exercise'?controlledState:step.attemptDigest);
        const version=exactBinding?Number(exactBinding.observed_version):isVerifyHistory||contract.resource_kind==='controlled_human_exercise'?lifecycle.concurrencyVersion:0;
        const resourceFamily=exactBinding?.resource_family??contract.resource_kind;
        const bindingToken=exactBinding?.binding_token??sha256('not-applicable');
        const causalEvent=exactAttempt
          ?{kind:'delivery_command_attempt',id:exactAttempt.id,requestId:exactAttempt.request_id,receiptId:exactAttempt.receipt_id,action:exactAttempt.action,eventAt:new Date(exactAttempt.created_at).toISOString()}
          :exactEffect
            ?{kind:contract.effect_resolver==='enterprise_ai_conflict'?'enterprise_ai_effect':'delivery_effect',id:exactEffect.id,receiptId:exactEffect.receipt_id,action:exactEffect.action,resourceId:exactEffect.resource_id,eventAt:new Date(exactEffect.created_at).toISOString()}
            :exactAudit
              ?{kind:'privileged_audit',id:exactAudit.id,requestId:exactAudit.request_id,action:exactAudit.action,resourceType:exactAudit.resource_type,resourceId:exactAudit.resource_id,resourceVersion:Number(exactAudit.resource_version),eventAt:new Date(exactAudit.created_at).toISOString()}
              :exactReceipt
                ?{kind:'command_receipt',id:exactReceipt.id,requestId:exactReceipt.request_id,action:exactReceipt.action,resourceId:exactReceipt.resource_id,eventAt:new Date(exactReceipt.event_at).toISOString()}
                :null;
        const causalEventDigest=causalEvent?sha256(causalEvent):sha256('not-applicable');
        if(causalEvent&&usedCausalEvents.has(causalEventDigest))fail('PR_C_CONTROLLED_HUMAN_OBSERVER_EVENT_REUSE_REJECTED');if(causalEvent)usedCausalEvents.add(causalEventDigest);
        const base={checkpointId:step.checkpointId,stepId:step.stepId,personaKey:step.personaKey,
          authenticatedPersonaDigest:sha256({exerciseDigest:context.exerciseDigest,personaKey:contract.persona_key,authUserId:contract.auth_user_id,roleId:contract.role_id,expectedState:contract.expected_state,profileStatus:contract.profile_status,membershipStatus:contract.membership_status,authorizationVersion:Number(contract.authorization_version)}),
          capabilityDigest:actualCapabilityDigest,scopeDigest:sha256({exerciseDigest:context.exerciseDigest,orgId:contract.org_id,workspaceId:contract.workspace_id}),
          action:exactBinding?.action??contract.contract_action,resourceKind:contract.resource_kind,resourceFamily,observationKind:observedKind,humanAttemptDigest:step.attemptDigest,bindingToken,safeBindingDigest:exactBinding?sha256(exactBinding.safe_record):sha256({safeBinding:'not_applicable'}),causalEventDigest,resourceDigest,expectedVersion:exactBinding?Number(exactBinding.expected_version):version,version,
          requestIdentityDigest:exactBinding?.safe_record.requestDigest??sha256('not-applicable'),receiptDigest:exactBinding?.safe_record.receiptDigest??sha256('not-applicable'),
          auditDigest:exactBinding?.safe_record.auditDigest??sha256('not-applicable'),result:observedResult,denialProofKind:denialProofKind??'not_applicable',
          denialCodeDigest:exactBinding?.safe_record.denialCodeDigest??sha256('absence'),observedDeltas,safety,serverObservedAt:new Date(state.observed_at).toISOString()};
        const record={...base,inspectionDigest:sha256(base)};records.push(record);
        await db.query(`insert into public.pr_c_controlled_human_step_observations(exercise_id,checkpoint_id,step_id,persona_key,human_role,request_digest,started_at,completed_at,inspection_digest,safe_record,observed_at)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,[state.id,step.checkpointId,step.stepId,step.personaKey,humanRole,requestDigest,step.startedAt,step.completedAt,record.inspectionDigest,JSON.stringify(record),state.observed_at]);
      }
      await db.query('commit');
      return {humanRole,observedAt:new Date(state.observed_at).toISOString(),lifecycle:state.lifecycle,concurrencyVersion:Number(state.concurrency_version),operationEventSequence:lifecycle.operationEventCount,operationEventDigest:lifecycle.operationEventDigest,immutableHistoryDigest:lifecycle.immutableHistoryDigest,steps:records};
    } catch(error) {await db.query('rollback');throw error}
  }
}

export function buildIdentifiers(context, fixtureState) {
  return { mainOrg:deterministicUuid(context.exerciseId,'organization-main'),crossOrg:deterministicUuid(context.exerciseId,'organization-cross'),
    deliveryWorkspace:deterministicUuid(context.exerciseId,'workspace-delivery'),otherWorkspace:deterministicUuid(context.exerciseId,'workspace-other'),crossWorkspace:deterministicUuid(context.exerciseId,'workspace-cross'),
    mainOrgRole:deterministicUuid(context.exerciseId,'org-role-main'),crossOrgRole:deterministicUuid(context.exerciseId,'org-role-cross'),
    roles:Object.fromEntries(fixtureState.personas.map(persona=>[persona.key,deterministicUuid(context.exerciseId,`role-${persona.key}`)])) };
}
function buildJourneyIdentifiers(context,suffix='') {
  const id=label=>deterministicUuid(context.exerciseId,`${label}${suffix}`);
  return {
    assessProcess:id('assess-process'),assessCase:id('assess-case'),assessSourceVersion:id('assess-source-version'),assessDecision:id('assess-decision'),
    assessEvidence:id('assess-evidence'),assessReview:id('assess-review'),assessAttestation:id('assess-attestation'),assessResolution:id('assess-resolution'),
    assessGovern:id('assess-govern'),assessHandoff:id('assess-studio-handoff'),moduleHandoff:id('module-handoff-assess-studio'),pilotEnvironment:id('pilot-environment'),pilotTenant:id('pilot-tenant'),
    assessedVersion:id('studio-version-assessed'),
    directArtifact:id('studio-artifact-direct'),directSourcePackage:id('studio-source-package-direct'),directVersion:id('studio-version-direct'),
    assessSourceSet:id('assess-source-set'),assessSourceSetVersion:id('assess-source-set-version'),assessInputBundle:id('assess-input-bundle'),assessInputBundleVersion:id('assess-input-bundle-version'),
    studioSourceSet:id('studio-source-set'),studioSourceSetVersion:id('studio-source-set-version'),studioInputBundle:id('studio-input-bundle'),studioInputBundleVersion:id('studio-input-bundle-version'),
    customTemplate:id('tenant-template'),customTemplateVersion:id('tenant-template-version'),customTemplateReview:id('tenant-template-review'),customTemplateApproval:id('tenant-template-approval'),
    assessConflict:id('assess-conflict'),
  };
}

async function seedTranscriptAndTemplatePrerequisites(db,context,fixtureState,ids,actors,authorizationVersions) {
  await db.query('set constraints all deferred');
  const journey=buildJourneyIdentifiers(context);const hash=value=>sha256(value).slice(7);
  const sourceRows=[];
  for(const [owner,labels] of Object.entries(fixtureState.fixture.seed.transcriptSets)) {
    for(let index=0;index<labels.length;index++) {
      const sourceId=deterministicUuid(context.exerciseId,`${owner}-transcript-${index+1}`);
      const versionId=deterministicUuid(context.exerciseId,`${owner}-transcript-version-${index+1}`);
      const content=`${labels[index]}\nSynthetic-only content for controlled-human verification.`;
      const contentHash=hash(content);
      await db.query(`insert into public.enterprise_evidence_sources(id,org_id,workspace_id,display_name,source_kind,mime_type,current_version,status,created_by)
        values($1,$2,$3,$4,'pasted_text','text/plain',1,'review',$5)`,[sourceId,ids.mainOrg,ids.deliveryWorkspace,labels[index],actors.requester.id]);
      await db.query(`insert into public.enterprise_evidence_source_versions(id,source_id,org_id,workspace_id,version,original_filename,content_hash,content_bytes,storage_path,extracted_text_hash,extracted_character_count,extraction_status,parser_kind,parser_version,provenance_hash,created_by)
        values($1,$2,$3,$4,1,$5,$6,$7,$8,$6,$9,'parsed','text_native','controlled-human-parser-1',$10,$11)`,
      [versionId,sourceId,ids.mainOrg,ids.deliveryWorkspace,`${owner}-synthetic-${index+1}.txt`,contentHash,Buffer.byteLength(content),`${ids.mainOrg}/${ids.deliveryWorkspace}/enterprise-evidence/${sourceId}.bin`,content.length,hash({exerciseDigest:context.exerciseDigest,owner,index,contentHash}),actors.requester.id]);
      sourceRows.push({owner,sourceId,versionId,contentHash,characterCount:content.length,label:labels[index]});
    }
  }
  for(const owner of ['assess','studio']) {
    const sourceSetId=journey[`${owner}SourceSet`];const versionId=journey[`${owner}SourceSetVersion`];
    const inputBundleId=journey[`${owner}InputBundle`];const inputBundleVersionId=journey[`${owner}InputBundleVersion`];
    const sources=sourceRows.filter(row=>row.owner===owner);const manifestHash=hash(sources.map(row=>({sourceId:row.sourceId,versionId:row.versionId,contentHash:row.contentHash})));
    await db.query(`insert into public.enterprise_source_sets(id,org_id,workspace_id,owner_module,display_label,description,current_version,status,created_by)
      values($1,$2,$3,$4,$5,'Synthetic-only exact controlled-human source set',1,'locked',$6)`,[sourceSetId,ids.mainOrg,ids.deliveryWorkspace,owner,`Synthetic ${owner} transcript set`,actors.requester.id]);
    await db.query(`insert into public.enterprise_source_set_versions(id,source_set_id,org_id,workspace_id,version,purpose,manifest_hash,source_count,extracted_character_count,status,created_by)
      values($1,$2,$3,$4,1,$5,$6,$7,$8,'locked',$9)`,[versionId,sourceSetId,ids.mainOrg,ids.deliveryWorkspace,`Synthetic ${owner} controlled-human input`,manifestHash,sources.length,sources.reduce((sum,row)=>sum+row.characterCount,0),actors.requester.id]);
    for(let index=0;index<sources.length;index++) await db.query(`insert into public.enterprise_source_set_version_items(source_set_version_id,source_set_id,source_version_id,source_id,org_id,workspace_id,ordinal,semantic_role,content_hash,extracted_text_hash,extracted_character_count)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,[versionId,sourceSetId,sources[index].versionId,sources[index].sourceId,ids.mainOrg,ids.deliveryWorkspace,index+1,index===0?'primary':'supporting',sources[index].contentHash,sources[index].characterCount]);
    const bundleHash=hash({owner,sourceSetId,versionId,manifestHash});
    await db.query(`insert into public.enterprise_module_input_bundles(id,org_id,workspace_id,owner_module,current_version,created_by) values($1,$2,$3,$4,1,$5)`,[inputBundleId,ids.mainOrg,ids.deliveryWorkspace,owner,actors.requester.id]);
    await db.query(`insert into public.enterprise_module_input_bundle_versions(id,input_bundle_id,org_id,workspace_id,version,bundle_hash,status,created_by) values($1,$2,$3,$4,1,$5,'locked',$6)`,[inputBundleVersionId,inputBundleId,ids.mainOrg,ids.deliveryWorkspace,bundleHash,actors.requester.id]);
    await db.query(`insert into public.enterprise_module_input_bundle_items(input_bundle_version_id,input_bundle_id,org_id,workspace_id,ordinal,item_kind,source_set_version_id,source_set_id,resource_hash,declared_purpose) values($1,$2,$3,$4,1,'source_set',$5,$6,$7,$8)`,[inputBundleVersionId,inputBundleId,ids.mainOrg,ids.deliveryWorkspace,versionId,sourceSetId,manifestHash,`Synthetic ${owner} transcript selection`]);
  }
  const assessSources=sourceRows.filter(row=>row.owner==='assess');const candidateIds=[];
  for(let index=0;index<assessSources.length;index++) {
    const candidateId=deterministicUuid(context.exerciseId,`assess-candidate-${index+1}`);candidateIds.push(candidateId);
    const source=assessSources[index];
    await db.query(`insert into public.enterprise_evidence_candidates(id,source_id,source_version_id,org_id,workspace_id,field_key,value,safe_excerpt,excerpt_hash,provenance_hash,version,source_locator,confidence,suggestion_status,created_by)
      values($1,$2,$3,$4,$5,'process_objective',$6,$6,$7,$8,1,$9,1,'accepted',$10)`,[candidateId,source.sourceId,source.versionId,ids.mainOrg,ids.deliveryWorkspace,`Synthetic objective ${index+1}`,hash(`excerpt-${index}`),hash({sourceVersionId:source.versionId,candidateId}),'normalized-text:v1:chars:0-10',actors.requester.id]);
  }
  await db.query(`insert into public.enterprise_assess_evidence_conflicts(id,org_id,workspace_id,assess_case_id,input_bundle_version_id,input_bundle_id,application_intent,target_key,candidate_ids,candidate_binding_hash,is_material,created_by)
    values($1,$2,$3,$4,$5,$6,'set_case_field','process_objective',$7::uuid[],$8,true,$9)`,[journey.assessConflict,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessInputBundleVersion,journey.assessInputBundle,candidateIds,hash(candidateIds),actors.requester.id]);
  const template=fixtureState.fixture.seed.customTemplate;const fieldSchema={type:'object',properties:{context:{type:'string'},requirements:{type:'array'}},additionalProperties:false};
  const templateHash=hash({sections:template.sections,fieldSchema});
  await db.query(`insert into public.studio_tenant_template_aggregates(id,org_id,workspace_id,safe_name,safe_description,artifact_class,current_version,current_version_id,current_approved_version_id,lifecycle,lifecycle_version,created_by)
    values($1,$2,$3,$4,$5,$6,1,$7,$7,'approved',5,$8)`,[journey.customTemplate,ids.mainOrg,ids.deliveryWorkspace,template.name,template.description,template.artifactClass,journey.customTemplateVersion,actors.requester.id]);
  await db.query(`insert into public.studio_tenant_template_versions(id,template_id,org_id,workspace_id,version,artifact_class,section_definitions,field_schema,renderer_compatibility_version,content_schema_version,template_hash,status,authored_by,author_authorization_version)
    values($1,$2,$3,$4,1,$5,$6::jsonb,$7::jsonb,'studio-renderer-2','studio-artifact-2',$8,'approved',$9,$10)`,[journey.customTemplateVersion,journey.customTemplate,ids.mainOrg,ids.deliveryWorkspace,template.artifactClass,JSON.stringify(template.sections),JSON.stringify(fieldSchema),templateHash,actors.requester.id,authorizationVersions.requester]);
  await db.query(`insert into public.studio_tenant_template_review_events(id,template_id,template_version_id,org_id,workspace_id,reviewer_id,reviewer_authorization_version,outcome,rationale) values($1,$2,$3,$4,$5,$6,$7,'approved','Independent synthetic template review')`,[journey.customTemplateReview,journey.customTemplate,journey.customTemplateVersion,ids.mainOrg,ids.deliveryWorkspace,actors.studio_reviewer.id,authorizationVersions.studio_reviewer]);
  await db.query(`insert into public.studio_tenant_template_approval_events(id,template_id,template_version_id,review_event_id,org_id,workspace_id,approver_id,approver_authorization_version,outcome,rationale) values($1,$2,$3,$4,$5,$6,$7,$8,'approved','Independent synthetic template approval')`,[journey.customTemplateApproval,journey.customTemplate,journey.customTemplateVersion,journey.customTemplateReview,ids.mainOrg,ids.deliveryWorkspace,actors.studio_approver.id,authorizationVersions.studio_approver]);
  return {sourceCount:4,sourceSetCount:2,inputBundleCount:2,candidateCount:2,conflictCount:1,templateCount:1};
}
export async function seedAssessUpstream(db,context,ids,actors,authorizationVersions,suffix='') {
  const journey=buildJourneyIdentifiers(context,suffix);const requester=actors.requester;const reviewer=actors.studio_reviewer;const approver=actors.studio_approver;
  const label=value=>`${value}${suffix}`;
  const receipts=Array.from({length:6},(_,index)=>deterministicUuid(context.exerciseId,label(`assess-receipt-${index}`)));
  await db.query(`insert into public.assess_processes(id,org_id,workspace_id,name,status) values($1,$2,$3,'Synthetic controlled-human Assess process','Draft')`,[journey.assessProcess,ids.mainOrg,ids.deliveryWorkspace]);
  await db.query(`insert into public.assess_v2_cases(id,org_id,workspace_id,process_id,owner_id,status,version) values($1,$2,$3,$4,$5,'in_review',2)`,[journey.assessCase,ids.mainOrg,ids.deliveryWorkspace,journey.assessProcess,requester.id]);
  await db.query(`insert into public.assess_v2_case_versions(id,case_id,org_id,workspace_id,version,name,source_kind,created_by) values($1,$2,$3,$4,1,'Synthetic assessed Studio source','create',$5)`,[journey.assessSourceVersion,journey.assessCase,ids.mainOrg,ids.deliveryWorkspace,requester.id]);
  await db.query(`update public.assess_v2_cases set head_version_id=$1 where id=$2`,[journey.assessSourceVersion,journey.assessCase]);
  for(let index=0;index<receipts.length;index++) await db.query(`insert into public.assess_command_receipts(id,org_id,workspace_id,actor_id,command_type,idempotency_key,request_id,request_hash,status,response,completed_at) values($1,$2,$3,$4,'controlled-human-fixture',$5,$6,$7,'succeeded','{}',statement_timestamp())`,[receipts[index],ids.mainOrg,ids.deliveryWorkspace,requester.id,`pr264-assess-${index}${suffix}`,deterministicUuid(context.exerciseId,label(`assess-request-${index}`)),sha256(label(`assess-request-${index}`)).slice(7)]);
  const hash='0'.repeat(64);const output={trace:[{fieldIds:['claim.synthetic'],evidenceIds:[journey.assessEvidence]}],controls:['Audit'],actionControls:[]};
  await db.query(`insert into public.assess_v2_decision_versions(id,case_id,source_version_id,org_id,workspace_id,schema_version,rule_set_version,decision_version,validation_status,input_snapshot,evidence_snapshot,output_snapshot,input_hash,evidence_hash,output_hash,receipt_id,created_by,created_at) values($1,$2,$3,$4,$5,'schema','rules','decision-pr264','reviewer-ready','{}','[]',$6::jsonb,$7,$7,$7,$8,$9,statement_timestamp())`,[journey.assessDecision,journey.assessCase,journey.assessSourceVersion,ids.mainOrg,ids.deliveryWorkspace,JSON.stringify(output),hash,receipts[0],requester.id]);
  await db.query(`insert into public.assess_v2_evidence_links(id,version_id,case_id,org_id,workspace_id,payload) values($1,$2,$3,$4,$5,$6::jsonb)`,[journey.assessEvidence,journey.assessSourceVersion,journey.assessCase,ids.mainOrg,ids.deliveryWorkspace,JSON.stringify({claimIds:['claim.synthetic'],status:'submitted',validated:false,owner:requester.id})]);
  const claims=JSON.stringify([{claimId:'claim.synthetic',evidenceIds:[journey.assessEvidence]}]);
  await db.query(`insert into public.assess_v2_review_assignments(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_schema_version,review_sequence,material_claims,reviewer_id,assigned_by,assigned_reviewer_authorization_version,assigned_by_authorization_version,request_id,receipt_id,audit_event_id) values($1,$2,$3,$4,$5,1,$6,'decision-pr264','assess-v2-review-2026-07',1,$7::jsonb,$8,$9,$10,$11,$12,$13,$14)`,[journey.assessReview,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessSourceVersion,journey.assessDecision,claims,reviewer.id,requester.id,authorizationVersions.studio_reviewer,authorizationVersions.requester,deterministicUuid(context.exerciseId,label('assess-review-request')),receipts[1],deterministicUuid(context.exerciseId,label('assess-review-audit'))]);
  await db.query(`insert into public.assess_v2_evidence_attestations(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,review_schema_version,review_sequence,evidence_id,claim_ids,evidence_submitter_id,reviewer_id,reviewer_authorization_version,outcome,rationale,request_id,receipt_id,audit_event_id) values($1,$2,$3,$4,$5,1,$6,'decision-pr264',$7,'assess-v2-review-2026-07',1,$8,array['claim.synthetic'],$9,$10,$11,'accepted','Synthetic evidence accepted',$12,$13,$14)`,[journey.assessAttestation,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessSourceVersion,journey.assessDecision,journey.assessReview,journey.assessEvidence,requester.id,reviewer.id,authorizationVersions.studio_reviewer,deterministicUuid(context.exerciseId,label('assess-attestation-request')),receipts[2],deterministicUuid(context.exerciseId,label('assess-attestation-audit'))]);
  await db.query(`insert into public.assess_v2_review_resolutions(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_id,review_schema_version,review_sequence,resolution,reviewed_confidence,rationale,reviewer_id,reviewer_authorization_version,request_id,receipt_id,audit_event_id) values($1,$2,$3,$4,$5,1,$6,'decision-pr264',$7,'assess-v2-review-2026-07',1,'approved','Verified','Synthetic controlled-human review complete',$8,$9,$10,$11,$12)`,[journey.assessResolution,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessSourceVersion,journey.assessDecision,journey.assessReview,reviewer.id,authorizationVersions.studio_reviewer,deterministicUuid(context.exerciseId,label('assess-resolution-request')),receipts[3],deterministicUuid(context.exerciseId,label('assess-resolution-audit'))]);
  await db.query(`insert into public.assess_v2_govern_resolutions(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,decision_version,review_resolution_id,review_schema_version,review_sequence,actions,required_controls,review_frequency,accountable_owner,rationale,resolver_id,resolver_authorization_version,request_id,receipt_id,audit_event_id) values($1,$2,$3,$4,$5,1,$6,'decision-pr264',$7,'assess-v2-review-2026-07',1,'[]',$8::jsonb,'annual','synthetic-owner','Synthetic controlled-human governance complete',$9,$10,$11,$12,$13)`,[journey.assessGovern,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessSourceVersion,journey.assessDecision,journey.assessResolution,JSON.stringify([{controlId:'Audit',status:'resolved',condition:'',owner:'',dueDate:'',conditionSatisfied:false}]),approver.id,authorizationVersions.studio_approver,deterministicUuid(context.exerciseId,label('assess-govern-request')),receipts[4],deterministicUuid(context.exerciseId,label('assess-govern-audit'))]);
  const packageValue={contractVersion:'pr-c-controlled-human-assess-handoff-1',source:`synthetic-approved-assess${suffix}`};const packageHash=(await db.query(`select public.enterprise_sha256_jsonb($1::jsonb) hash`,[JSON.stringify(packageValue)])).rows[0].hash;
  await db.query(`insert into public.assess_v2_studio_handoffs(id,org_id,workspace_id,case_id,source_version_id,source_case_version,decision_id,review_resolution_id,govern_resolution_id,package,package_hash,schema_version,rule_set_version,decision_version,review_schema_version,review_sequence,handed_off_by,handoff_authorization_version,request_id,receipt_id,audit_event_id) values($1,$2,$3,$4,$5,1,$6,$7,$8,$9::jsonb,$10,'schema','rules','decision-pr264','assess-v2-review-2026-07',1,$11,$12,$13,$14,$15)`,[journey.assessHandoff,ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessSourceVersion,journey.assessDecision,journey.assessResolution,journey.assessGovern,JSON.stringify(packageValue),packageHash,requester.id,authorizationVersions.requester,deterministicUuid(context.exerciseId,label('assess-handoff-request')),receipts[5],deterministicUuid(context.exerciseId,label('assess-handoff-audit'))]);
  await db.query(`insert into public.assess_v2_studio_sources(org_id,workspace_id,case_id,decision_id,handoff_id,source_context) values($1,$2,$3,$4,$5,'{}')`,[ids.mainOrg,ids.deliveryWorkspace,journey.assessCase,journey.assessDecision,journey.assessHandoff]);
  return {journey,packageHash};
}
async function approveStudioArtifact(db,context,ids,actors,authorizationVersions,{artifactId,versionId}) {
  let aggregate=1;let ordinal=0;
  const invoke=async(commandType,actorKey,payload,label)=>{
    const actor=actors[actorKey];const command={commandType,requestId:deterministicUuid(context.exerciseId,`studio-${label}-request`),idempotencyKey:`pr264-studio-${label}`,organizationId:ids.mainOrg,workspaceId:ids.deliveryWorkspace,actorId:actor.id,authorizationVersion:authorizationVersions[actorKey],expectedAggregateVersion:aggregate,expectedArtifactVersion:1,payload};
    const result=(await db.query(`select public.studio_artifact_command_claim($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;aggregate++;ordinal++;return result;
  };
  await invoke('studio.artifact.review.submit','requester',{artifactId,artifactVersionId:versionId},`${artifactId.slice(0,8)}-submit`);
  await invoke('studio.artifact.review.assign','requester',{artifactId,artifactVersionId:versionId,reviewerId:actors.studio_reviewer.id},`${artifactId.slice(0,8)}-assign`);
  await invoke('studio.artifact.review.resolve','studio_reviewer',{artifactId,artifactVersionId:versionId,outcome:'approve',rationale:'Independent synthetic Studio review',conditions:[]},`${artifactId.slice(0,8)}-review`);
  await invoke('studio.artifact.approval.resolve','studio_approver',{artifactId,artifactVersionId:versionId,outcome:'approve',rationale:'Independent synthetic Studio approval',conditions:[]},`${artifactId.slice(0,8)}-approve`);
  const row=(await db.query(`select aggregate.aggregate_version,aggregate.lifecycle,aggregate.current_approved_version_id,version.lifecycle version_lifecycle from public.studio_artifact_aggregates aggregate join public.studio_artifact_versions version on version.id=$2 and version.artifact_id=aggregate.id where aggregate.id=$1`,[artifactId,versionId])).rows[0];
  if(Number(row?.aggregate_version)!==5||row.lifecycle!=='approved'||row.version_lifecycle!=='approved'||row.current_approved_version_id!==versionId) fail('PR_C_CONTROLLED_HUMAN_STUDIO_APPROVAL_REJECTED');
  return {artifactId,versionId,aggregateVersion:5};
}
async function insertHumanStudioVersion(db,context,ids,{artifactId,sourcePackageId,versionId,artifactType,content,actorId,authorizationVersion}) {
  const template=(await db.query(`select * from public.studio_system_template_versions where artifact_type=$1 and superseded_at is null order by created_at desc limit 1`,[artifactType])).rows[0];
  if(!template?.id) fail('PR_C_CONTROLLED_HUMAN_STUDIO_TEMPLATE_REJECTED');
  const safe=(await db.query(`select public.studio_pr_b_structured_artifact_content_safe($1::jsonb,package) safe from public.studio_artifact_source_packages package where package.id=$2 and package.artifact_id=$3`,[JSON.stringify(content),sourcePackageId,artifactId])).rows[0]?.safe;
  if(!safe) fail('PR_C_CONTROLLED_HUMAN_STUDIO_CONTENT_REJECTED');
  await db.query(`insert into public.studio_artifact_versions(id,artifact_id,org_id,workspace_id,version,template_id,content_schema_version,renderer_version,content,content_hash,lifecycle,author_id,author_authorization_version) values($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb,public.enterprise_sha256_jsonb($8::jsonb),'draft',$9,$10)`,[versionId,artifactId,ids.mainOrg,ids.deliveryWorkspace,template.id,template.content_schema_version,template.renderer_version,JSON.stringify(content),actorId,authorizationVersion]);
  await db.query(`update public.studio_artifact_aggregates set current_version_id=$2,aggregate_version=1 where id=$1`,[artifactId,versionId]);
  return {templateVersionId:template.id,templateVersion:template.template_version,templateHash:template.template_hash};
}
async function seedStudioJourneyFixtures(db,context,fixtureState,ids,actors,authorizationVersions) {
  const {journey,packageHash}=await seedAssessUpstream(db,context,ids,actors,authorizationVersions);let moduleOrdinal=0;
  const moduleCommand=async(commandType,actorKey,expectedVersion,payload,label)=>{
    const actor=actors[actorKey];const command={actorId:actor.id,organizationId:ids.mainOrg,workspaceId:ids.deliveryWorkspace,requestId:deterministicUuid(context.exerciseId,`module-${label}-request`),authorizationVersion:authorizationVersions[actorKey],expectedVersion,idempotencyKey:`pr264-module-${label}`,commandType,handoffId:journey.moduleHandoff,payload};
    moduleOrdinal++;return (await db.query(`select public.enterprise_assess_studio_handoff_command($1::jsonb) result`,[JSON.stringify(command)])).rows[0].result;
  };
  await moduleCommand('handoff.request','requester',0,{upstreamHandoffId:journey.assessHandoff,artifactType:'brd'},'request');
  await moduleCommand('handoff.review.resolve','studio_reviewer',1,{outcome:'approve',rationale:'Independent synthetic handoff review'},'review');
  await moduleCommand('handoff.approval.resolve','studio_approver',2,{outcome:'approve',rationale:'Independent synthetic handoff approval'},'approve');
  const consumed=await moduleCommand('handoff.consume','requester',3,{},'consume');
  const assessedArtifactId=consumed.resourceId;const assessedSourcePackageId=consumed.sourcePackageId;
  if(!UUID.test(assessedArtifactId??'')||!UUID.test(assessedSourcePackageId??'')) fail('PR_C_CONTROLLED_HUMAN_ASSESSED_STUDIO_BINDING_REJECTED');
  const assessedFixture=fixtureState.fixture.seed.assessedStudioArtifact;const assessedAnchor={sourceVersionId:journey.assessSourceVersion,locator:'assess:accepted-handoff',anchorHash:packageHash};
  const assessedContent={contractVersion:'studio-artifact-2',title:assessedFixture.title,summary:assessedFixture.summary,sections:[{...assessedFixture.section,sourceAnchors:[assessedAnchor],labels:['human_authored']}],coverage:{selectedSourceVersionIds:[journey.assessSourceVersion],coveredSourceVersionIds:[journey.assessSourceVersion],complete:true}};
  const assessedTemplate=await insertHumanStudioVersion(db,context,ids,{artifactId:assessedArtifactId,sourcePackageId:assessedSourcePackageId,versionId:journey.assessedVersion,artifactType:assessedFixture.artifactType,content:assessedContent,actorId:actors.requester.id,authorizationVersion:authorizationVersions.requester});
  const assessed=await approveStudioArtifact(db,context,ids,actors,authorizationVersions,{artifactId:assessedArtifactId,versionId:journey.assessedVersion});
  const directFixture=fixtureState.fixture.seed.directStudioArtifact;
  const directSourceCommand={actorId:actors.requester.id,organizationId:ids.mainOrg,workspaceId:ids.deliveryWorkspace,artifactId:journey.directArtifact,sourcePackageId:journey.directSourcePackage,requestId:deterministicUuid(context.exerciseId,'direct-source-request'),idempotencyKey:'pr264-direct-studio-source',authorizationVersion:authorizationVersions.requester,payload:{sourceMode:'manual_brief',artifactType:directFixture.artifactType,manualBrief:directFixture.manualBrief}};
  const directSource=(await db.query(`select public.studio_artifact_source_package_create($1::jsonb) result`,[JSON.stringify(directSourceCommand)])).rows[0].result;
  if(directSource.resourceId!==journey.directArtifact||directSource.sourcePackageId!==journey.directSourcePackage||directSource.lineageClassification!=='not_assessed'||directSource.planningOnly!==true) fail('PR_C_CONTROLLED_HUMAN_DIRECT_STUDIO_BINDING_REJECTED');
  const directContent={contractVersion:'studio-artifact-2',title:directFixture.title,summary:directFixture.summary,sections:[{...directFixture.section,sourceAnchors:[],labels:['human_authored']}],coverage:{selectedSourceVersionIds:[],coveredSourceVersionIds:[],complete:true}};
  const directTemplate=await insertHumanStudioVersion(db,context,ids,{artifactId:journey.directArtifact,sourcePackageId:journey.directSourcePackage,versionId:journey.directVersion,artifactType:directFixture.artifactType,content:directContent,actorId:actors.requester.id,authorizationVersion:authorizationVersions.requester});
  const direct=await approveStudioArtifact(db,context,ids,actors,authorizationVersions,{artifactId:journey.directArtifact,versionId:journey.directVersion});
  const humanReady=await seedAssessUpstream(db,context,ids,actors,authorizationVersions,'-human');
  return {assessed:{...assessed,sourcePackageId:assessedSourcePackageId,template:assessedTemplate,lineageClassification:'assessed',planningOnly:false},direct:{...direct,sourcePackageId:journey.directSourcePackage,template:directTemplate,lineageClassification:'not_assessed',planningOnly:true},humanReady:{assessHandoffDigest:sha256(humanReady.journey.assessHandoff),sourceVersion:1},eligibleCount:2,moduleHandoffVersion:4};
}
function makeManualCommand(context, fixtureState, ids, requesterId,authorizationVersion) {
  const uuid = label => deterministicUuid(context.exerciseId,label);
  return { action:'delivery.package.create.manual',actorId:requesterId,organizationId:ids.mainOrg,workspaceId:ids.deliveryWorkspace,
    authorizationVersion,receiptId:uuid('seed-receipt'),requestId:uuid('seed-request'),idempotencyKey:`pr264-${context.exerciseDigest.slice(7,31)}`,
    executionToken:uuid('seed-execution'),executionFence:1,manualBrief:fixtureState.fixture.seed.manualPlanningPackage.brief,items:fixtureState.fixture.seed.manualPlanningPackage.items };
}

export class SupabaseAdminAdapter {
  constructor(url, serviceRoleKey) {
    if (!url || !serviceRoleKey) fail('PR_C_CONTROLLED_HUMAN_SUPABASE_ADMIN_REQUIRED');
    let parsed; try { parsed = new URL(url); } catch { fail('PR_C_CONTROLLED_HUMAN_SUPABASE_URL_REJECTED'); }
    if (parsed.protocol !== 'https:' || !/[.]supabase[.]co$/u.test(parsed.hostname)) fail('PR_C_CONTROLLED_HUMAN_SUPABASE_URL_REJECTED');
    this.client = createClient(url, serviceRoleKey, { auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false} });
  }
  async discoverUsers(context,fixtureState) {
    const all=[];
    for(let page=1;page<=50;page+=1){const response=await this.client.auth.admin.listUsers({page,perPage:1000});if(response.error||!Array.isArray(response.data?.users))fail('PR_C_CONTROLLED_HUMAN_AUTH_DISCOVERY_REJECTED');all.push(...response.data.users);if(response.data.users.length<1000)break;if(page===50)fail('PR_C_CONTROLLED_HUMAN_AUTH_DISCOVERY_REJECTED')}
    const exact=all.filter(user=>user.user_metadata?.synthetic===true&&user.user_metadata?.exerciseDigest===context.exerciseDigest);
    const byPersona=new Map();
    for(const user of exact){const key=user.user_metadata?.personaKey;if(!fixtureState.personas.some(persona=>persona.key===key)||byPersona.has(key)||user.email!==`prc264.${key}.${context.exerciseDigest.slice(7,19)}@example.invalid`)fail('PR_C_CONTROLLED_HUMAN_AUTH_DISCOVERY_REJECTED');byPersona.set(key,user)}
    return byPersona;
  }
  async ensureUsers(context, fixtureState, passwordBundle, onUser = async()=>undefined, afterExternalMutation = async()=>undefined) {
    exactKeys(passwordBundle, fixtureState.personas.map(persona=>persona.key), 'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_REJECTED');
    const passwords = Object.values(passwordBundle);
    if (new Set(passwords).size !== passwords.length || passwords.some(value=>typeof value!=='string'||value.length<16||value.length>128)) fail('PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_REJECTED');
    const byPersona=await this.discoverUsers(context,fixtureState);
    const users=[];
    for (const persona of fixtureState.personas) {
        const email = `prc264.${persona.key}.${context.exerciseDigest.slice(7,19)}@example.invalid`;
        let user=byPersona.get(persona.key);
        if(!user){const response=await this.client.auth.admin.createUser({email,password:passwordBundle[persona.key],email_confirm:true,user_metadata:{synthetic:true,exerciseDigest:context.exerciseDigest,personaKey:persona.key}});if(response.error||!response.data?.user?.id)fail('PR_C_CONTROLLED_HUMAN_AUTH_CREATE_REJECTED');user=response.data.user;await afterExternalMutation(user,users.length+1)}
        const safe={id:user.id,email,key:persona.key,state:persona.state,credentialGenerationDigest:sha256({exerciseDigest:context.exerciseDigest,personaKey:persona.key,authUserId:user.id})};
        await onUser(safe);users.push(safe);
    }
    return users;
  }
  async createUsers(context,fixtureState,passwordBundle) {
    return this.ensureUsers(context,fixtureState,passwordBundle);
  }
  async deleteUsers(userIds) {
    const failures=[];
    for (const id of userIds) {
      const response=await this.client.auth.admin.deleteUser(id).catch(()=>null);
      if(!response||response.error)failures.push(sha256({id,error:response?.error?.code??'unknown'}));
    }
    if(failures.length)fail('PR_C_CONTROLLED_HUMAN_AUTH_COMPENSATION_REJECTED');
  }
  async disableUsers(userIds,afterExternalMutation=async()=>undefined) {
    const failures=[];
    for(const [index,id] of userIds.entries()){const response=await this.client.auth.admin.updateUserById(id,{ban_duration:'876000h'}).catch(()=>null);if(!response||response.error)failures.push(sha256({id,error:response?.error?.code??'unknown'}));else await afterExternalMutation(id,index+1)}
    if(failures.length)fail('PR_C_CONTROLLED_HUMAN_AUTH_DISABLE_REJECTED');
    return userIds.length;
  }
}

export async function preflight(context, database) {
  const inventory = await database.inspect(context); assertTargetInventory(inventory, context);
  return safeResult('preflight','passed',context,{disposition:inventory.exercise?'exact_replay':inventory.priorExercises.length?'retained_history_ready':'dedicated_empty',existingLifecycle:inventory.exercise?.lifecycle??null,priorDeprovisionedExerciseCount:inventory.priorExercises.length,unexpectedDataCount:0,providerRowCount:0});
}
export function plan(context, fixtureState) {
  return safeResult('plan','passed',context,{personaCount:fixtureState.personas.length,featureFlagCount:fixtureState.fixture.featureFlags.length,seedStudioArtifactCount:2,eligibleStudioArtifactCount:2,seedPackageCount:2,seedBaselineCount:1,operations:['create_admin_auth_users','seed_exact_synthetic_scope','seed_approved_assessed_studio_artifact','seed_approved_direct_studio_artifact','verify_studio_to_delivery_eligibility','seed_canonical_manual_draft','seed_canonical_approved_baseline','verify_public_attestation'],deprovisionOperations:['disable_flags_and_set_read_only','revoke_exact_sessions','suspend_exact_memberships','retain_immutable_history']});
}
async function failureBoundary(options,name) { if(options?.afterMutation) await options.afterMutation(name); }
export async function apply(context, fixtureState, database, admin, passwordBundle, options={}) {
  const inventory=await database.inspect(context); assertTargetInventory(inventory,context,{allowRecoverableAuth:true});
  let users=[]; try {
    if (inventory.exercise) {
      const verified=await database.verify(context,fixtureState.personas.length);
      if(database.completeRecovery)await database.completeRecovery(context,'apply');
      return safeResult('apply','passed',context,{...verified,replayed:true,authUsersCreated:0});
    }
    if(!database.prepareRecovery||!database.recordAuthUser||!database.completeRecovery)fail('PR_C_CONTROLLED_HUMAN_RECOVERY_AUTHORITY_REQUIRED');
    await database.prepareRecovery(context,'apply',0);
    await failureBoundary(options,'apply-recovery-authority');
    const ensure=admin.ensureUsers?.bind(admin)??admin.createUsers?.bind(admin);
    if(!ensure)fail('PR_C_CONTROLLED_HUMAN_SUPABASE_ADMIN_REQUIRED');
    let recordedUsers=0;
    users=await ensure(context,fixtureState,passwordBundle,async user=>{await database.recordAuthUser(context,user.id);recordedUsers+=1;await failureBoundary(options,`apply-auth-user-${recordedUsers}`)},async(_user,index)=>failureBoundary(options,`apply-auth-user-created-${index}`));
    await failureBoundary(options,'apply-auth-users-complete');
    const seeded=await database.seed(context,fixtureState,users);
    await failureBoundary(options,'apply-database-committed');
    await database.completeRecovery(context,'apply');
    await failureBoundary(options,'apply-recovery-completed');
    return safeResult('apply','passed',context,{...seeded,authUsersCreated:users.length,providerRowCount:0,zeroEgress:true});
  } catch (error) { if (users.length&&!error?.simulatedCrash) await admin.deleteUsers(users.map(user=>user.id)); throw error; }
}
export async function verify(context, fixtureState, database) {
  const inventory=await database.inspect(context); assertTargetInventory(inventory,context);
  const verified=await database.verify(context,fixtureState.personas.length);
  const attestation={attested:true,contractVersion:ATTESTATION_VERSION,environmentClass:context.environmentClass,prNumber:264,releaseSha:context.releaseSha,reviewHeadSha:context.reviewHeadSha,deployId:context.deployId,deployOrigin:context.deployOrigin,exerciseDigest:context.exerciseDigest,targetFingerprint:context.targetFingerprint,publicTargetDigest:context.publicTargetDigest,personaManifestDigest:context.personaManifestDigest,fixtureManifestDigest:context.fixtureManifestDigest,migrationTip:context.migrationTip,productionAuthorized:false,customerDataAuthorized:false,realProviderCallsAuthorized:false};
  return safeResult('verify','passed',context,{...verified,attestation,zeroEgress:true,unexpectedDataCount:0});
}
export async function quiesce(context,database,expectedVersion,options={}) {
  const inventory=await database.inspect(context);assertTargetInventory(inventory,context);
  const lifecycle=inventory.exercise?.lifecycle;const currentVersion=Number(inventory.exercise?.concurrency_version);
  if(!((lifecycle==='active'&&currentVersion===expectedVersion)||(lifecycle==='read_only'&&currentVersion===expectedVersion+1)))fail('PR_C_CONTROLLED_HUMAN_STATE_MISMATCH');
  if(!database.prepareRecovery||!database.bindQuiescedHistory||!database.completeRecovery)fail('PR_C_CONTROLLED_HUMAN_RECOVERY_AUTHORITY_REQUIRED');
  await database.prepareRecovery(context,'quiesce',expectedVersion);await failureBoundary(options,'quiesce-recovery-authority');
  const transition=await database.quiesce(context,expectedVersion);await failureBoundary(options,'quiesce-database-committed');
  const inspection=await database.lifecycleInspection(context);
  if(inspection.lifecycle!=='read_only'||inspection.concurrencyVersion!==Number(transition.concurrencyVersion)||inspection.featureFlagCountEnabled!==0||inspection.runtimeControlReadOnlyCount!==2||inspection.runtimeControlProviderEnabledCount!==0)fail('PR_C_CONTROLLED_HUMAN_QUIESCE_VERIFY_REJECTED');
  if(!transition.transitionedAt)fail('PR_C_CONTROLLED_HUMAN_QUIESCE_VERIFY_REJECTED');
  await database.bindQuiescedHistory(context,inspection.concurrencyVersion,inspection.immutableHistoryDigest);await failureBoundary(options,'quiesce-history-bound');
  await database.completeRecovery(context,'quiesce');
  return safeResult('quiesce','passed',context,{...inspection,quiescedHistoryDigest:inspection.immutableHistoryDigest,operationEventSequence:Number(transition.operationEventSequence),transitionedAt:new Date(transition.transitionedAt).toISOString()});
}
function assertDeprovisionedInspection(inspection) {
  const zeroSafety=inspection.safety&&JSON.stringify(Object.keys(inspection.safety).sort())===JSON.stringify(['customerDataRecords','externalUsers','providerEgress','realProviderCalls'])
    && Object.values(inspection.safety).every(value=>Number.isSafeInteger(value)&&value===0);
  if(inspection.lifecycle!=='deprovisioned'||inspection.featureFlagCountEnabled!==0||inspection.runtimeControlReadOnlyCount!==2||inspection.runtimeControlProviderEnabledCount!==0
    ||inspection.activeMembershipCount!==0||inspection.activeProfileCount!==0||inspection.activeOrganizationCount!==0||inspection.activeWorkspaceCount!==0
    ||inspection.activePilotEnvironmentCount!==0||inspection.activePilotTenantCount!==0||inspection.activeSessionCount!==0||inspection.boundPersonaCount!==12
    ||!inspection.immutableHistoryRetained||inspection.domainRowsDeleted!==0||!zeroSafety)fail('PR_C_CONTROLLED_HUMAN_PARTIAL_RESET_REJECTED');
  return inspection;
}
export async function postDeprovisionVerify(context,database) {
  const inventory=await database.inspect(context);assertTargetInventory(inventory,context);
  return safeResult('post-deprovision-verify','passed',context,{...assertDeprovisionedInspection(await database.lifecycleInspection(context)),replayed:true});
}
export async function checkpointObserve(context,database,humanRecord) {
  exactKeys(humanRecord,['humanRole','steps'],'PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED');
  exactObserverRequest(humanRecord.humanRole,humanRecord.steps);
  const inventory=await database.inspect(context);assertTargetInventory(inventory,context);
  const requestDigest=sha256(humanRecord);const observed=await database.observeDuty(context,humanRecord.humanRole,humanRecord.steps,requestDigest);
  const inspectionDigest=sha256({requestDigest,observed});
  return safeResult('checkpoint-observe','passed',context,{humanRole:humanRecord.humanRole,requestDigest,...observed,inspectionDigest});
}
export async function deprovision(context, database, expectedVersion, admin, options={}) {
  const inventory=await database.inspect(context); assertTargetInventory(inventory,context);
  if (inventory.exercise?.lifecycle==='deprovisioned') {
    if(!admin?.disableUsers)fail('PR_C_CONTROLLED_HUMAN_SUPABASE_ADMIN_REQUIRED');
    const sessionCount=await database.revokeSessions(context);const userIds=await database.boundUserIds(context);
    if(userIds.length!==12||new Set(userIds).size!==12)fail('PR_C_CONTROLLED_HUMAN_AUTH_BINDING_REJECTED');
    const credentialCount=await admin.disableUsers(userIds);if(credentialCount!==userIds.length)fail('PR_C_CONTROLLED_HUMAN_AUTH_DISABLE_REJECTED');
    const inspection=assertDeprovisionedInspection(await database.lifecycleInspection(context));
    if(database.completeRecovery)await database.completeRecovery(context,'deprovision');
    return safeResult('deprovision','passed',context,{...inspection,replayed:true,sessionsRevoked:sessionCount,credentialsDisabled:credentialCount});
  }
  if (inventory.exercise?.lifecycle==='active') await quiesce(context,database,expectedVersion,options);
  const refreshed=await database.inspect(context); const version=Number(refreshed.exercise?.concurrency_version);
  if (refreshed.exercise?.lifecycle!=='read_only'||!Number.isSafeInteger(version)) fail('PR_C_CONTROLLED_HUMAN_PARTIAL_RESET_REJECTED');
  if(!database.prepareRecovery||!database.completeRecovery)fail('PR_C_CONTROLLED_HUMAN_RECOVERY_AUTHORITY_REQUIRED');
  await database.prepareRecovery(context,'deprovision',version);await failureBoundary(options,'deprovision-recovery-authority');
  const frozen=await database.lifecycleInspection(context);if(!frozen.quiescedHistoryDigest||frozen.quiescedHistoryDigest!==frozen.immutableHistoryDigest)fail('PR_C_CONTROLLED_HUMAN_FROZEN_HISTORY_REJECTED');
  const sessionCount=await database.revokeSessions(context);await failureBoundary(options,'deprovision-sessions-revoked');
  if(!admin?.disableUsers)fail('PR_C_CONTROLLED_HUMAN_SUPABASE_ADMIN_REQUIRED');
  const userIds=await database.boundUserIds(context);if(userIds.length!==12||new Set(userIds).size!==12)fail('PR_C_CONTROLLED_HUMAN_AUTH_BINDING_REJECTED');
  const credentialCount=await admin.disableUsers(userIds,async(_id,index)=>failureBoundary(options,`deprovision-credential-${index}`));if(credentialCount!==userIds.length)fail('PR_C_CONTROLLED_HUMAN_AUTH_DISABLE_REJECTED');await failureBoundary(options,'deprovision-credentials-disabled');
  const result=await database.finalizeDeprovision(context,version,sessionCount,credentialCount);await failureBoundary(options,'deprovision-database-committed');
  const inspection=assertDeprovisionedInspection(await database.lifecycleInspection(context));
  if(inspection.lifecycle!==result.lifecycle||inspection.concurrencyVersion!==Number(result.concurrencyVersion))fail('PR_C_CONTROLLED_HUMAN_PARTIAL_RESET_REJECTED');
  if(result.quiescedHistoryDigest!==frozen.quiescedHistoryDigest)fail('PR_C_CONTROLLED_HUMAN_FROZEN_HISTORY_REJECTED');
  await database.completeRecovery(context,'deprovision');await failureBoundary(options,'deprovision-recovery-completed');
  return safeResult('deprovision','passed',context,{...inspection,quiescedHistoryDigest:frozen.quiescedHistoryDigest,replayed:false,sessionsRevoked:sessionCount+Number(result.lateSessionsRevoked??0),credentialsDisabled:credentialCount});
}

export async function recoverReset(context,fixtureState,database,admin,reason,options={}) {
  if(!['abort','expiry'].includes(reason)||!database.recoveryAuthority||!database.prepareRecovery||!database.completeRecovery||!admin?.discoverUsers)fail('PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED');
  const source=await database.recoveryAuthority(context,'apply');
  if(!source||(reason==='expiry'&&!source.expired))fail('PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED');
  const inventory=await database.inspect(context);assertTargetInventory(inventory,context,{allowRecoverableAuth:true});
  await database.prepareRecovery(context,reason,Number(inventory.exercise?.concurrency_version??0));await failureBoundary(options,`${reason}-recovery-authority`);
  if(!inventory.exercise){
    const discovered=await admin.discoverUsers(context,fixtureState);const ids=[...discovered.values()].map(user=>user.id);
    if(ids.length)await admin.deleteUsers(ids);await failureBoundary(options,`${reason}-partial-auth-removed`);
    const recoveredInventory=await database.inspect(context);assertTargetInventory(recoveredInventory,context);
    if(recoveredInventory.exercise)fail('PR_C_CONTROLLED_HUMAN_RECOVERY_REJECTED');
    await database.completeRecovery(context,reason);
    return safeResult('recover-reset','passed',context,{reason,recoveredPartialAuthUserCount:ids.length,lifecycle:'absent',immutableHistoryRetained:true,domainRowsDeleted:0});
  }
  const result=await deprovision(context,database,Number(inventory.exercise.concurrency_version),admin,options);
  await database.completeRecovery(context,reason);
  return safeResult('recover-reset','passed',context,{reason,recoveredPartialAuthUserCount:0,lifecycle:result.lifecycle,immutableHistoryRetained:true,domainRowsDeleted:0,deprovisionDigest:sha256(result)});
}

async function emit(result, outputPath) {
  const bytes=`${JSON.stringify(result,null,2)}\n`;
  if (outputPath) await writeFile(outputPath,bytes,{encoding:'utf8',mode:0o600,flag:'wx'});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
async function loadAuthority(args,expectedPhases,context) {
  const authorityIndex=args.indexOf('--authority');const authorityPath=authorityIndex>=0?args[authorityIndex+1]:undefined;
  if(!authorityPath)fail('PR_C_CONTROLLED_HUMAN_AUTHORITY_REQUIRED');
  let authority;try{authority=JSON.parse(await readFile(authorityPath,'utf8'))}catch{fail('PR_C_CONTROLLED_HUMAN_AUTHORITY_REJECTED')}
  if(authority?.contractVersion!==CONTROLLER_VERSION||authority.status!=='passed'||!expectedPhases.includes(authority.phase)
    ||authority.releaseSha!==context.releaseSha||authority.reviewHeadSha!==context.reviewHeadSha||authority.deployId!==context.deployId||authority.deployOrigin!==context.deployOrigin
    ||authority.exerciseDigest!==context.exerciseDigest||authority.targetFingerprint!==context.targetFingerprint||authority.personaManifestDigest!==context.personaManifestDigest
    ||authority.fixtureManifestDigest!==context.fixtureManifestDigest||authority.migrationTip!==context.migrationTip||!Number.isSafeInteger(Number(authority.concurrencyVersion))) fail('PR_C_CONTROLLED_HUMAN_AUTHORITY_REJECTED');
  return {authority,authorityDigest:sha256(authority)};
}
async function main() {
  const [phase,...args]=process.argv.slice(2); if (!['preflight','plan','apply','verify','quiesce','checkpoint-observe','deprovision','recover-reset','post-deprovision-verify'].includes(phase)) fail('usage: prCControlledHumanEnvironment.mjs <preflight|plan|apply|verify|quiesce|checkpoint-observe|deprovision|recover-reset|post-deprovision-verify> [--request path] [--output path]');
  const outputIndex=args.indexOf('--output'); const outputPath=outputIndex>=0?args[outputIndex+1]:undefined;
  if (outputIndex>=0&&!outputPath) fail('PR_C_CONTROLLED_HUMAN_OUTPUT_REQUIRED');
  const fixtureState=await loadFixture(); const context=deriveContext(process.env,fixtureState);
  if (phase==='plan') return emit(plan(context,fixtureState),outputPath);
  const database=new PostgresEnvironmentAdapter(process.env.PR_C_CONTROLLED_HUMAN_DATABASE_URL); await database.connect();
  try {
    if (phase==='preflight') return emit(await preflight(context,database),outputPath);
    if (phase==='verify') return emit(await verify(context,fixtureState,database),outputPath);
    if (phase==='quiesce') {const {authority,authorityDigest}=await loadAuthority(args,['verify'],context);return emit({...await quiesce(context,database,Number(authority.concurrencyVersion)),authorityDigest},outputPath)}
    if (phase==='post-deprovision-verify') {const {authorityDigest}=await loadAuthority(args,['deprovision'],context);return emit({...await postDeprovisionVerify(context,database),authorityDigest},outputPath)}
    if (phase==='checkpoint-observe') {
      const requestIndex=args.indexOf('--request');const requestPath=requestIndex>=0?args[requestIndex+1]:undefined;if(!requestPath)fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REQUIRED');
      let request;try{request=JSON.parse(await readFile(requestPath,'utf8'))}catch{fail('PR_C_CONTROLLED_HUMAN_OBSERVER_REQUEST_REJECTED')}
      return emit(await checkpointObserve(context,database,request),outputPath);
    }
    if(phase==='recover-reset') {
      const reasonIndex=args.indexOf('--reason');const reason=reasonIndex>=0?args[reasonIndex+1]:undefined;
      const admin=new SupabaseAdminAdapter(process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL,process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY);
      return emit(await recoverReset(context,fixtureState,database,admin,reason),outputPath);
    }
    if (phase==='deprovision') {
      const admin=new SupabaseAdminAdapter(process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL,process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY);
      const {authority,authorityDigest}=await loadAuthority(args,['apply','quiesce','verify'],context);
      return emit({...await deprovision(context,database,Number(authority.concurrencyVersion),admin),authorityDigest},outputPath);
    }
    let passwords; try { passwords=JSON.parse(process.env.PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON??''); } catch { fail('PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_REJECTED'); }
    const admin=new SupabaseAdminAdapter(process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_URL,process.env.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY);
    return emit(await apply(context,fixtureState,database,admin,passwords),outputPath);
  } finally { await database.close(); }
}

if (process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/[A-Za-z]:/u,value=>value.slice(1)).replaceAll('/','\\').toLowerCase()===process.argv[1].toLowerCase()) {
  main().catch(error=>{ process.stderr.write(`${error instanceof Error?error.message:'PR_C_CONTROLLED_HUMAN_FAILED'}\n`);process.exitCode=1; });
}
