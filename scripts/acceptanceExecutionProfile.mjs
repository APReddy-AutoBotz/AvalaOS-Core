import { createHash } from 'node:crypto';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const NETLIFY_DEPLOY_ID_PATTERN = /^[0-9a-f]{24}$/u;
const INVOCATION_ID_PATTERN = /^[0-9a-f]{32}$/u;
const REPORT_AREA_PATTERN = /^[a-z][a-z0-9-]*$/u;
const ALLOWED_EXECUTION_KINDS = new Set(['hosted_preview', 'local_source_fixture', 'declaration_only']);
const FULL_PAGE_CONTRAST_SCHEMA_VERSION = 'acceptance-full-page-contrast-v1';
const FULL_PAGE_CONTRAST_CONTENT_TYPE = 'application/json';
const FULL_PAGE_CONTRAST_MAX_BYTES = 64 * 1024;
const FULL_PAGE_CONTRAST_MAX_INCOMPLETE_RESULTS = 4;
const FULL_PAGE_CONTRAST_PERSONAS = Object.freeze([
  'Process Analyst',
  'AP Process Owner',
  'Delivery Lead',
  'Control Reviewer',
  'Automation Contributor',
  'Buyer Viewer',
  'Platform Admin',
]);
const FULL_PAGE_CONTRAST_PROJECTS = new Set(['desktop-chromium', 'pixel-7-chromium']);
const FULL_PAGE_CONTRAST_TEST_PROFILES = new Map([
  ['SANDBOX-009', 'initial-entry'],
  ['SAFETY-007', 'representative-surface'],
]);
const FULL_PAGE_CONTRAST_BODY_KEYS = [
  'classification',
  'diagnostics',
  'executionBindingDigest',
  'executionProfile',
  'incompleteNodeCount',
  'incompleteResultCount',
  'observedAt',
  'observedNodeCount',
  'persona',
  'positiveNodeCount',
  'profile',
  'project',
  'schemaVersion',
  'test',
  'violationNodeCount',
].sort();
const FULL_PAGE_CONTRAST_SUMMARY_KEYS = [
  'classification',
  'diagnostics',
  'incompleteNodeCount',
  'incompleteResultCount',
  'observedNodeCount',
  'positiveNodeCount',
  'violationNodeCount',
].sort();
const FULL_PAGE_CONTRAST_DIAGNOSTIC_KEYS = ['nodeCount', 'reasonCategoryCounts', 'resultOrdinal'].sort();
const FULL_PAGE_CONTRAST_REASON_CATEGORIES = new Set(['color-contrast', 'unknown_reason']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const requiredString = (value, code) => {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) throw new Error(code);
  return value;
};

const isPlainObject = value => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const canonicalValue = (value, seen = new Set()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('FULL_PAGE_CONTRAST_CANONICAL_VALUE_INVALID');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => canonicalValue(item, seen));
    if (!isPlainObject(value)) throw new Error('FULL_PAGE_CONTRAST_CANONICAL_VALUE_INVALID');
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key], seen)]));
  } finally {
    seen.delete(value);
  }
};

const canonicalJson = value => JSON.stringify(canonicalValue(value));

const exactKeys = (value, expected) => (
  isPlainObject(value) && sameJson(Object.keys(value).sort(), expected)
);

const safeCount = value => Number.isSafeInteger(value) && value >= 0;

const personaSlug = persona => persona.toLowerCase().replace(/[^a-z0-9]+/gu, '-');

const releaseShaFrom = environment => {
  const acceptanceSha = environment.ACCEPTANCE_RELEASE_SHA;
  const expectedSha = environment.EXPECTED_RELEASE_SHA;
  if (acceptanceSha && expectedSha && acceptanceSha !== expectedSha) {
    throw new Error('ACCEPTANCE_EXECUTION_RELEASE_SHA_CONFLICT');
  }
  const releaseSha = requiredString(acceptanceSha ?? expectedSha, 'ACCEPTANCE_EXECUTION_RELEASE_SHA_REQUIRED');
  if (!SHA_PATTERN.test(releaseSha)) throw new Error('ACCEPTANCE_EXECUTION_RELEASE_SHA_INVALID');
  return releaseSha;
};

const parseOrigin = (value, code) => {
  const raw = requiredString(value, code);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(code);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error(code);
  }
  return url;
};

const isLoopbackHostname = hostname => hostname === '127.0.0.1' || hostname === '[::1]';

export const decodeAcceptanceExecutionProfile = (environment, { expectedCheckoutSha } = {}) => {
  const kind = requiredString(environment.ACCEPTANCE_EXECUTION_KIND, 'ACCEPTANCE_EXECUTION_KIND_REQUIRED');
  if (!ALLOWED_EXECUTION_KINDS.has(kind)) throw new Error('ACCEPTANCE_EXECUTION_KIND_INVALID');
  const releaseSha = releaseShaFrom(environment);

  if (kind === 'declaration_only') {
    if (
      environment.HOSTED_PILOT_URL
      || environment.NETLIFY_DEPLOY_ID
      || environment.LOCAL_ACCEPTANCE_BASE_URL
      || environment.ACCEPTANCE_CHECKOUT_SHA
      || environment.ACCEPTANCE_INVOCATION_ID
    ) {
      throw new Error('ACCEPTANCE_DECLARATION_RUNTIME_BINDING_REJECTED');
    }
    return Object.freeze({
      schemaVersion: 'acceptance-execution-profile-v1',
      evidenceKind: 'acceptance-catalog-declaration',
      executionKind: kind,
      releaseSha,
      checkoutSha: null,
      sourceIdentity: 'catalog_declaration',
      invocationId: null,
      targetOrigin: null,
      deployId: null,
    });
  }

  if (kind === 'local_source_fixture') {
    if (environment.HOSTED_PILOT_URL) throw new Error('LOCAL_SOURCE_FIXTURE_HOSTED_URL_REJECTED');
    if (environment.NETLIFY_DEPLOY_ID) throw new Error('LOCAL_SOURCE_FIXTURE_DEPLOY_ID_REJECTED');
    const checkoutSha = requiredString(environment.ACCEPTANCE_CHECKOUT_SHA, 'LOCAL_SOURCE_FIXTURE_CHECKOUT_SHA_REQUIRED');
    if (!SHA_PATTERN.test(checkoutSha)) throw new Error('LOCAL_SOURCE_FIXTURE_CHECKOUT_SHA_INVALID');
    if (expectedCheckoutSha && checkoutSha !== expectedCheckoutSha) throw new Error('LOCAL_SOURCE_FIXTURE_REAL_CHECKOUT_SHA_MISMATCH');
    if (releaseSha !== checkoutSha) throw new Error('LOCAL_SOURCE_FIXTURE_RELEASE_SHA_MISMATCH');
    const invocationId = requiredString(
      environment.ACCEPTANCE_INVOCATION_ID,
      'LOCAL_SOURCE_FIXTURE_INVOCATION_ID_REQUIRED',
    );
    if (!INVOCATION_ID_PATTERN.test(invocationId)) {
      throw new Error('LOCAL_SOURCE_FIXTURE_INVOCATION_ID_INVALID');
    }
    const target = parseOrigin(environment.LOCAL_ACCEPTANCE_BASE_URL, 'LOCAL_SOURCE_FIXTURE_ORIGIN_INVALID');
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
      throw new Error('LOCAL_SOURCE_FIXTURE_LOOPBACK_REQUIRED');
    }
    return Object.freeze({
      schemaVersion: 'acceptance-execution-profile-v1',
      evidenceKind: 'exact-head-synthetic-regression',
      executionKind: kind,
      releaseSha,
      checkoutSha,
      sourceIdentity: 'governed_working_tree_candidate',
      invocationId,
      targetOrigin: target.origin,
      deployId: null,
    });
  }

  if (
    environment.LOCAL_ACCEPTANCE_BASE_URL
    || environment.ACCEPTANCE_CHECKOUT_SHA
    || environment.ACCEPTANCE_INVOCATION_ID
  ) {
    throw new Error('HOSTED_PREVIEW_LOCAL_BINDING_REJECTED');
  }
  const deployId = requiredString(environment.NETLIFY_DEPLOY_ID, 'HOSTED_PREVIEW_DEPLOY_ID_REQUIRED');
  if (!NETLIFY_DEPLOY_ID_PATTERN.test(deployId)) throw new Error('HOSTED_PREVIEW_DEPLOY_ID_INVALID');
  const target = parseOrigin(environment.HOSTED_PILOT_URL, 'HOSTED_PREVIEW_ORIGIN_INVALID');
  if (target.protocol !== 'https:' || isLoopbackHostname(target.hostname) || target.hostname === 'localhost') {
    throw new Error('HOSTED_PREVIEW_NON_LOOPBACK_HTTPS_REQUIRED');
  }
  return Object.freeze({
    schemaVersion: 'acceptance-execution-profile-v1',
    evidenceKind: 'hosted-preview-acceptance',
    executionKind: kind,
    releaseSha,
    checkoutSha: null,
    sourceIdentity: 'committed_exact_head',
    invocationId: null,
    targetOrigin: target.origin,
    deployId,
  });
};

export const createAcceptanceReportMetadata = ({ profile, exactCommand, configPath, sourcePaths }) => {
  if (!Array.isArray(exactCommand) || exactCommand.length < 2 || exactCommand.some(item => typeof item !== 'string' || !item)) {
    throw new Error('ACCEPTANCE_REPORT_COMMAND_INVALID');
  }
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0 || sourcePaths.some(item => typeof item !== 'string' || !item)) {
    throw new Error('ACCEPTANCE_REPORT_SOURCE_INVALID');
  }
  requiredString(configPath, 'ACCEPTANCE_REPORT_CONFIG_INVALID');
  // Playwright appends its bounded `actualWorkers` field to config metadata.
  // Keep this object mutable for that framework-owned addition; the result
  // verifier below admits no other metadata fields.
  return {
    schemaVersion: 'acceptance-report-profile-v1',
    ci: {},
    evidenceKind: profile.evidenceKind,
    executionKind: profile.executionKind,
    exactCommand: [...exactCommand],
    configPath,
    sourcePaths: [...sourcePaths],
    exactHead: profile.releaseSha,
    targetOrigin: profile.targetOrigin,
    deployId: profile.deployId,
    ...(profile.executionKind === 'local_source_fixture' ? {
      sourceIdentity: profile.sourceIdentity,
      invocationId: profile.invocationId,
    } : {}),
  };
};

export const createSyntheticRegressionOutputRoot = ({ profile, reportArea }) => {
  if (
    profile?.executionKind !== 'local_source_fixture'
    || profile.sourceIdentity !== 'governed_working_tree_candidate'
    || !INVOCATION_ID_PATTERN.test(profile.invocationId ?? '')
  ) {
    throw new Error('SYNTHETIC_REGRESSION_LOCAL_PROFILE_REQUIRED');
  }
  const area = requiredString(reportArea, 'SYNTHETIC_REGRESSION_REPORT_AREA_INVALID');
  if (!REPORT_AREA_PATTERN.test(area)) throw new Error('SYNTHETIC_REGRESSION_REPORT_AREA_INVALID');
  return `output/playwright/pr264-synthetic-regression/${profile.releaseSha}/${area}/${profile.invocationId}`;
};

const validateAxeCheckArray = (value, code) => {
  if (!Array.isArray(value)) throw new Error(code);
  for (const check of value) {
    if (!isPlainObject(check) || typeof check.id !== 'string' || check.id.length === 0) throw new Error(code);
  }
};

const validateAxeNode = node => {
  if (!isPlainObject(node)) throw new Error('FULL_PAGE_CONTRAST_AXE_NODE_INVALID');
  validateAxeCheckArray(node.any, 'FULL_PAGE_CONTRAST_AXE_CHECKS_INVALID');
  validateAxeCheckArray(node.all, 'FULL_PAGE_CONTRAST_AXE_CHECKS_INVALID');
  validateAxeCheckArray(node.none, 'FULL_PAGE_CONTRAST_AXE_CHECKS_INVALID');
};

const colorContrastResults = (results, collectionName) => {
  const collection = results[collectionName];
  if (!Array.isArray(collection)) throw new Error('FULL_PAGE_CONTRAST_AXE_RESULTS_INVALID');
  const relevant = [];
  for (const result of collection) {
    if (!isPlainObject(result) || typeof result.id !== 'string' || !Array.isArray(result.nodes)) {
      throw new Error('FULL_PAGE_CONTRAST_AXE_RESULT_INVALID');
    }
    for (const node of result.nodes) validateAxeNode(node);
    if (result.id === 'color-contrast') {
      if (result.nodes.length === 0) throw new Error('FULL_PAGE_CONTRAST_AXE_EMPTY_RESULT_INVALID');
      relevant.push(result);
    }
  }
  return relevant;
};

const summarizedClassification = ({ observedNodeCount, violationNodeCount, incompleteNodeCount }) => {
  if (observedNodeCount === 0) return 'empty_scan';
  if (violationNodeCount > 0) return 'violations_detected';
  if (incompleteNodeCount > 0) return 'unresolved_manual';
  return 'resolved';
};

export const summarizeFullPageColorContrast = results => {
  if (!isPlainObject(results)) throw new Error('FULL_PAGE_CONTRAST_AXE_RESULTS_INVALID');
  const passes = colorContrastResults(results, 'passes');
  const violations = colorContrastResults(results, 'violations');
  const incomplete = colorContrastResults(results, 'incomplete');
  const positiveNodeCount = passes.reduce((count, result) => count + result.nodes.length, 0);
  const violationNodeCount = violations.reduce((count, result) => count + result.nodes.length, 0);
  const incompleteNodeCount = incomplete.reduce((count, result) => count + result.nodes.length, 0);
  const observedNodeCount = positiveNodeCount + violationNodeCount + incompleteNodeCount;
  if (![positiveNodeCount, violationNodeCount, incompleteNodeCount, observedNodeCount].every(Number.isSafeInteger)) {
    throw new Error('FULL_PAGE_CONTRAST_AXE_COUNT_INVALID');
  }
  const diagnostics = incomplete.map((result, resultIndex) => {
    const reasonCategoryCounts = { 'color-contrast': 0, unknown_reason: 0 };
    for (const node of result.nodes) {
      const checks = [...node.any, ...node.all, ...node.none];
      const category = checks.some(check => check.id === 'color-contrast') ? 'color-contrast' : 'unknown_reason';
      reasonCategoryCounts[category] += 1;
    }
    for (const category of Object.keys(reasonCategoryCounts)) {
      if (reasonCategoryCounts[category] === 0) delete reasonCategoryCounts[category];
    }
    return Object.freeze({
      resultOrdinal: resultIndex + 1,
      nodeCount: result.nodes.length,
      reasonCategoryCounts: Object.freeze(reasonCategoryCounts),
    });
  });
  return Object.freeze({
    classification: summarizedClassification({ observedNodeCount, violationNodeCount, incompleteNodeCount }),
    positiveNodeCount,
    violationNodeCount,
    incompleteNodeCount,
    observedNodeCount,
    incompleteResultCount: incomplete.length,
    diagnostics: Object.freeze(diagnostics),
  });
};

const validateBindingMetadata = metadata => {
  if (!isPlainObject(metadata)) throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
  const allowedKeys = new Set([
    'actualWorkers', 'ci', 'configPath', 'deployId', 'evidenceKind', 'exactCommand', 'exactHead', 'executionKind',
    'invocationId', 'schemaVersion', 'sourceIdentity', 'sourcePaths', 'targetOrigin', 'workflowRuntime',
  ]);
  if (Object.keys(metadata).some(key => !allowedKeys.has(key))) throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
  if (
    metadata.schemaVersion !== 'acceptance-report-profile-v1'
    || !isPlainObject(metadata.ci)
    || Object.keys(metadata.ci).length !== 0
    || !['hosted_preview', 'local_source_fixture'].includes(metadata.executionKind)
    || !Array.isArray(metadata.exactCommand)
    || metadata.exactCommand.length < 2
    || metadata.exactCommand.some(value => typeof value !== 'string' || value.length === 0 || value !== value.trim())
    || !Array.isArray(metadata.sourcePaths)
    || metadata.sourcePaths.length === 0
    || metadata.sourcePaths.some(value => typeof value !== 'string' || value.length === 0 || value !== value.trim())
    || typeof metadata.configPath !== 'string'
    || metadata.configPath.length === 0
    || metadata.configPath !== metadata.configPath.trim()
    || !SHA_PATTERN.test(metadata.exactHead ?? '')
    || (Object.hasOwn(metadata, 'actualWorkers') && metadata.actualWorkers !== 1)
  ) {
    throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
  }
  if (metadata.executionKind === 'local_source_fixture') {
    if (
      metadata.evidenceKind !== 'exact-head-synthetic-regression'
      || metadata.sourceIdentity !== 'governed_working_tree_candidate'
      || !INVOCATION_ID_PATTERN.test(metadata.invocationId ?? '')
      || metadata.deployId !== null
      || Object.hasOwn(metadata, 'workflowRuntime')
    ) {
      throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
    }
    const target = parseOrigin(metadata.targetOrigin, 'FULL_PAGE_CONTRAST_METADATA_INVALID');
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1') {
      throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
    }
  } else {
    if (
      metadata.evidenceKind !== 'hosted-preview-acceptance'
      || !NETLIFY_DEPLOY_ID_PATTERN.test(metadata.deployId ?? '')
      || Object.hasOwn(metadata, 'sourceIdentity')
      || Object.hasOwn(metadata, 'invocationId')
      || !isPlainObject(metadata.workflowRuntime)
      || metadata.workflowRuntime.authority !== 'github-actions'
      || metadata.workflowRuntime.releaseSha !== metadata.exactHead
    ) {
      throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
    }
    const target = parseOrigin(metadata.targetOrigin, 'FULL_PAGE_CONTRAST_METADATA_INVALID');
    if (target.protocol !== 'https:' || isLoopbackHostname(target.hostname) || target.hostname === 'localhost') {
      throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
    }
    for (const field of ['workflowPath', 'workflowRef', 'repository', 'eventName', 'runId', 'runAttempt', 'workflowSha']) {
      if (typeof metadata.workflowRuntime[field] !== 'string' || metadata.workflowRuntime[field].length === 0) {
        throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
      }
    }
    if (!SHA_PATTERN.test(metadata.workflowRuntime.workflowSha)) throw new Error('FULL_PAGE_CONTRAST_METADATA_INVALID');
  }
  const normalized = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== 'actualWorkers'));
  return canonicalValue(normalized);
};

const executionBindingDigest = ({ metadata, project, title }) => {
  const normalizedMetadata = validateBindingMetadata(metadata);
  return `sha256:${createHash('sha256').update(canonicalJson({ metadata: normalizedMetadata, project, title })).digest('hex')}`;
};

const validateContrastIdentity = ({ persona, profile, project, test: title }) => {
  requiredString(persona, 'FULL_PAGE_CONTRAST_PERSONA_INVALID');
  if (!FULL_PAGE_CONTRAST_PERSONAS.includes(persona)) throw new Error('FULL_PAGE_CONTRAST_PERSONA_INVALID');
  if (!['initial-entry', 'representative-surface'].includes(profile)) throw new Error('FULL_PAGE_CONTRAST_PROFILE_INVALID');
  if (!FULL_PAGE_CONTRAST_PROJECTS.has(project)) throw new Error('FULL_PAGE_CONTRAST_PROJECT_INVALID');
  requiredString(title, 'FULL_PAGE_CONTRAST_TEST_INVALID');
};

const canonicalUtcTimestamp = value => {
  const raw = requiredString(value, 'FULL_PAGE_CONTRAST_OBSERVED_AT_INVALID');
  const epoch = Date.parse(raw);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== raw) {
    throw new Error('FULL_PAGE_CONTRAST_OBSERVED_AT_INVALID');
  }
  return { raw, epoch };
};

export const createFullPageContrastAttachment = ({ results, metadata, persona, profile, project, test: title, observedAt }) => {
  validateContrastIdentity({ persona, profile, project, test: title });
  const observed = canonicalUtcTimestamp(observedAt);
  const summary = summarizeFullPageColorContrast(results);
  const body = canonicalJson({
    schemaVersion: FULL_PAGE_CONTRAST_SCHEMA_VERSION,
    ...summary,
    executionProfile: metadata?.executionKind,
    persona,
    profile,
    project,
    test: title,
    executionBindingDigest: executionBindingDigest({ metadata, project, title }),
    observedAt: observed.raw,
  });
  if (Buffer.byteLength(body, 'utf8') > FULL_PAGE_CONTRAST_MAX_BYTES) {
    throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_TOO_LARGE');
  }
  return Object.freeze({
    name: `full-page-contrast-summary-${profile}-${personaSlug(persona)}`,
    contentType: FULL_PAGE_CONTRAST_CONTENT_TYPE,
    body,
  });
};

const validateRetainedSummary = (body, expected) => {
  if (!exactKeys(body, FULL_PAGE_CONTRAST_BODY_KEYS)) throw new Error('FULL_PAGE_CONTRAST_BODY_SHAPE_INVALID');
  if (
    body.schemaVersion !== FULL_PAGE_CONTRAST_SCHEMA_VERSION
    || body.executionProfile !== expected.metadata.executionKind
    || body.persona !== expected.persona
    || body.profile !== expected.profile
    || body.project !== expected.project
    || body.test !== expected.title
    || body.executionBindingDigest !== expected.digest
  ) {
    throw new Error('FULL_PAGE_CONTRAST_BODY_BINDING_INVALID');
  }
  const observed = canonicalUtcTimestamp(body.observedAt);
  if (observed.epoch < expected.attemptStart || observed.epoch > expected.attemptEnd) {
    throw new Error('FULL_PAGE_CONTRAST_OBSERVED_AT_OUTSIDE_ATTEMPT');
  }
  const summary = Object.fromEntries(FULL_PAGE_CONTRAST_SUMMARY_KEYS.map(key => [key, body[key]]));
  for (const key of ['positiveNodeCount', 'violationNodeCount', 'incompleteNodeCount', 'observedNodeCount', 'incompleteResultCount']) {
    if (!safeCount(summary[key])) throw new Error('FULL_PAGE_CONTRAST_COUNT_INVALID');
  }
  const addedObserved = summary.positiveNodeCount + summary.violationNodeCount + summary.incompleteNodeCount;
  if (!Number.isSafeInteger(addedObserved) || summary.observedNodeCount !== addedObserved) {
    throw new Error('FULL_PAGE_CONTRAST_COUNT_INVALID');
  }
  if (summary.incompleteResultCount > FULL_PAGE_CONTRAST_MAX_INCOMPLETE_RESULTS) {
    throw new Error('FULL_PAGE_CONTRAST_INCOMPLETE_GROUP_CAP_EXCEEDED');
  }
  if (!Array.isArray(summary.diagnostics) || summary.diagnostics.length !== summary.incompleteResultCount) {
    throw new Error('FULL_PAGE_CONTRAST_DIAGNOSTICS_INVALID');
  }
  let diagnosticNodes = 0;
  for (const [index, diagnostic] of summary.diagnostics.entries()) {
    if (
      !exactKeys(diagnostic, FULL_PAGE_CONTRAST_DIAGNOSTIC_KEYS)
      || diagnostic.resultOrdinal !== index + 1
      || !Number.isSafeInteger(diagnostic.nodeCount)
      || diagnostic.nodeCount <= 0
      || !isPlainObject(diagnostic.reasonCategoryCounts)
    ) {
      throw new Error('FULL_PAGE_CONTRAST_DIAGNOSTICS_INVALID');
    }
    const reasonKeys = Object.keys(diagnostic.reasonCategoryCounts);
    if (
      reasonKeys.length === 0
      || reasonKeys.some(key => !FULL_PAGE_CONTRAST_REASON_CATEGORIES.has(key))
      || reasonKeys.some(key => !Number.isSafeInteger(diagnostic.reasonCategoryCounts[key]) || diagnostic.reasonCategoryCounts[key] <= 0)
      || reasonKeys.reduce((count, key) => count + diagnostic.reasonCategoryCounts[key], 0) !== diagnostic.nodeCount
    ) {
      throw new Error('FULL_PAGE_CONTRAST_DIAGNOSTICS_INVALID');
    }
    diagnosticNodes += diagnostic.nodeCount;
  }
  if (!Number.isSafeInteger(diagnosticNodes) || diagnosticNodes !== summary.incompleteNodeCount) {
    throw new Error('FULL_PAGE_CONTRAST_DIAGNOSTICS_INVALID');
  }
  const derivedClassification = summarizedClassification(summary);
  if (summary.classification !== derivedClassification) throw new Error('FULL_PAGE_CONTRAST_CLASSIFICATION_INVALID');
  if (summary.violationNodeCount !== 0 || summary.observedNodeCount === 0) {
    throw new Error('FULL_PAGE_CONTRAST_GREEN_RESULT_INVALID');
  }
  return summary.classification === 'unresolved_manual';
};

export const verifyFullPageContrastAttachments = ({ testId, title, project, attempt, metadata }) => {
  const profile = FULL_PAGE_CONTRAST_TEST_PROFILES.get(testId);
  if (!profile) return Object.freeze({ summaryCount: 0, unresolvedPersonaCount: 0 });
  validateContrastIdentity({ persona: FULL_PAGE_CONTRAST_PERSONAS[0], profile, project, test: title });
  const titlePrefix = metadata?.executionKind === 'local_source_fixture'
    ? `[SYNTHETIC-REGRESSION:${testId}] `
    : `[${testId}] `;
  if (typeof title !== 'string' || !title.startsWith(titlePrefix)) throw new Error('FULL_PAGE_CONTRAST_TEST_INVALID');
  if (!isPlainObject(attempt) || !Array.isArray(attempt.attachments) || attempt.attachments.length !== FULL_PAGE_CONTRAST_PERSONAS.length) {
    throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_COUNT_INVALID');
  }
  const attemptStart = canonicalUtcTimestamp(attempt.startTime).epoch;
  if (typeof attempt.duration !== 'number' || !Number.isFinite(attempt.duration) || attempt.duration < 0) {
    throw new Error('FULL_PAGE_CONTRAST_ATTEMPT_TIME_INVALID');
  }
  const attemptEnd = attemptStart + attempt.duration;
  if (!Number.isSafeInteger(attemptEnd)) throw new Error('FULL_PAGE_CONTRAST_ATTEMPT_TIME_INVALID');
  const digest = executionBindingDigest({ metadata, project, title });
  const expectedNames = new Set(FULL_PAGE_CONTRAST_PERSONAS.map(persona => (
    `full-page-contrast-summary-${profile}-${personaSlug(persona)}`
  )));
  const seenPersonas = new Set();
  let unresolvedPersonaCount = 0;
  for (const attachment of attempt.attachments) {
    if (
      !exactKeys(attachment, ['body', 'contentType', 'name'])
      || typeof attachment.name !== 'string'
      || !expectedNames.has(attachment.name)
      || attachment.contentType !== FULL_PAGE_CONTRAST_CONTENT_TYPE
      || typeof attachment.body !== 'string'
      || attachment.body.length === 0
      || !BASE64_PATTERN.test(attachment.body)
    ) {
      throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_INVALID');
    }
    const bytes = Buffer.from(attachment.body, 'base64');
    if (
      bytes.length === 0
      || bytes.length > FULL_PAGE_CONTRAST_MAX_BYTES
      || bytes.toString('base64') !== attachment.body
    ) {
      throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_INVALID');
    }
    const decoded = bytes.toString('utf8');
    if (!Buffer.from(decoded, 'utf8').equals(bytes)) throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_INVALID');
    let body;
    try {
      body = JSON.parse(decoded);
    } catch {
      throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_INVALID');
    }
    if (!isPlainObject(body) || canonicalJson(body) !== decoded || !FULL_PAGE_CONTRAST_PERSONAS.includes(body.persona)) {
      throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_INVALID');
    }
    const expectedName = `full-page-contrast-summary-${profile}-${personaSlug(body.persona)}`;
    if (attachment.name !== expectedName || seenPersonas.has(body.persona)) {
      throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_PERSONA_INVALID');
    }
    seenPersonas.add(body.persona);
    if (validateRetainedSummary(body, {
      metadata,
      persona: body.persona,
      profile,
      project,
      title,
      digest,
      attemptStart,
      attemptEnd,
    })) unresolvedPersonaCount += 1;
  }
  if (seenPersonas.size !== FULL_PAGE_CONTRAST_PERSONAS.length) {
    throw new Error('FULL_PAGE_CONTRAST_ATTACHMENT_PERSONA_INVALID');
  }
  return Object.freeze({ summaryCount: FULL_PAGE_CONTRAST_PERSONAS.length, unresolvedPersonaCount });
};

const collectPlaywrightTests = report => {
  const tests = [];
  const visitSuite = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({
          title: spec.title,
          projectName: test.projectName,
          status: test.status,
          expectedStatus: test.expectedStatus,
          annotations: test.annotations,
          results: test.results,
        });
      }
    }
    for (const child of suite.suites ?? []) visitSuite(child);
  };
  for (const suite of report.suites ?? []) visitSuite(suite);
  return tests;
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const LOCAL_REPORT_METADATA_KEYS = [
  'ci',
  'configPath',
  'deployId',
  'evidenceKind',
  'exactCommand',
  'exactHead',
  'executionKind',
  'invocationId',
  'schemaVersion',
  'sourceIdentity',
  'sourcePaths',
  'targetOrigin',
].sort();

export const verifySyntheticRegressionResultInventory = ({
  report,
  expectedMetadata,
  expectedProjects,
  expectedTestIds,
  executableTestIds,
}) => {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('SYNTHETIC_REGRESSION_REPORT_INVALID');
  if (!Array.isArray(report.errors) || report.errors.length !== 0) throw new Error('SYNTHETIC_REGRESSION_REPORT_ERRORS');
  const actualMetadata = report.config?.metadata;
  if (!actualMetadata || typeof actualMetadata !== 'object' || Array.isArray(actualMetadata)) {
    throw new Error('SYNTHETIC_REGRESSION_METADATA_MISMATCH');
  }
  const expectedMetadataKeys = Object.keys(expectedMetadata).sort();
  const actualMetadataKeys = Object.keys(actualMetadata).filter(key => key !== 'actualWorkers').sort();
  if (
    !sameJson(expectedMetadataKeys, LOCAL_REPORT_METADATA_KEYS)
    || !sameJson(actualMetadataKeys, LOCAL_REPORT_METADATA_KEYS)
    || !expectedMetadata.ci
    || typeof expectedMetadata.ci !== 'object'
    || Array.isArray(expectedMetadata.ci)
    || Object.keys(expectedMetadata.ci).length !== 0
    || !actualMetadata.ci
    || typeof actualMetadata.ci !== 'object'
    || Array.isArray(actualMetadata.ci)
    || Object.keys(actualMetadata.ci).length !== 0
    || expectedMetadataKeys.some(key => !sameJson(actualMetadata[key], expectedMetadata[key]))
    || actualMetadata.actualWorkers !== 1
  ) {
    throw new Error('SYNTHETIC_REGRESSION_METADATA_MISMATCH');
  }
  const tests = collectPlaywrightTests(report);
  const expectedKeys = [];
  const executable = new Set(executableTestIds);
  for (const projectName of expectedProjects) {
    for (const testId of expectedTestIds) expectedKeys.push(`${projectName}\0${testId}`);
  }
  if (tests.length !== expectedKeys.length || tests.length === 0) throw new Error('SYNTHETIC_REGRESSION_RESULT_COUNT_MISMATCH');

  const actualKeys = [];
  let passed = 0;
  let skipped = 0;
  for (const result of tests) {
    const match = result.title.match(/^\[SYNTHETIC-REGRESSION:([A-Z0-9-]+)\]\s/u);
    if (!match) throw new Error('SYNTHETIC_REGRESSION_TITLE_INVALID');
    const testId = match[1];
    actualKeys.push(`${result.projectName}\0${testId}`);
    const shouldExecute = executable.has(testId);
    const results = Array.isArray(result.results) ? result.results : [];
    if (results.length !== 1) throw new Error('SYNTHETIC_REGRESSION_ATTEMPT_COUNT_MISMATCH');
    const attempt = results[0];
    if ((attempt.retry ?? 0) !== 0 || attempt.error || (Array.isArray(attempt.errors) && attempt.errors.length > 0)) {
      throw new Error('SYNTHETIC_REGRESSION_ATTEMPT_INVALID');
    }
    if (shouldExecute) {
      if (
        result.status !== 'expected'
        || result.expectedStatus !== 'passed'
        || attempt.status !== 'passed'
        || !Array.isArray(result.annotations)
        || result.annotations.length !== 0
      ) {
        throw new Error('SYNTHETIC_REGRESSION_STATUS_MISMATCH');
      }
      verifyFullPageContrastAttachments({
        testId,
        title: result.title,
        project: result.projectName,
        attempt,
        metadata: expectedMetadata,
      });
      passed += 1;
    } else {
      const annotations = Array.isArray(result.annotations) ? result.annotations : [];
      if (
        result.status !== 'skipped'
        || result.expectedStatus !== 'skipped'
        || attempt.status !== 'skipped'
        || annotations.length !== 1
        || annotations[0]?.type !== 'skip'
        || typeof annotations[0]?.description !== 'string'
        || annotations[0].description.length === 0
      ) {
        throw new Error('SYNTHETIC_REGRESSION_STATUS_MISMATCH');
      }
      skipped += 1;
    }
  }
  actualKeys.sort();
  expectedKeys.sort();
  if (!sameJson(actualKeys, expectedKeys) || new Set(actualKeys).size !== actualKeys.length) {
    throw new Error('SYNTHETIC_REGRESSION_INVENTORY_MISMATCH');
  }
  return Object.freeze({ total: tests.length, passed, skipped });
};
