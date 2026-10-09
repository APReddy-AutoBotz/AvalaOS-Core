const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DEPLOY_PATTERN = /^[0-9a-f]{24}$/u;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/u;
const PROJECTS = Object.freeze(['desktop-chromium', 'pixel-7-chromium']);
const ATTACHMENT_NAME = 'hosted-sandbox-acceptance-v1';
const SCHEMA_VERSION = 'hosted-sandbox-acceptance-v1';
const SOURCE_IDENTITY = 'committed_exact_head';
const EVIDENCE_SCOPE = 'executed-hosted-sandbox-local';
const FIXTURE_ID = 'synthetic-default';
const ATTEMPT_WINDOW_NAME = 'hosted-sandbox-attempt-window-v1';
const REQUIRED_SOURCE_PATHS = Object.freeze([
  'tests/browser/exhaustiveHostedAcceptance.spec.ts',
  'scripts/hostedSandboxAcceptanceEvidence.mjs',
]);

const personas = [
  'process-analyst', 'ap-process-owner', 'delivery-lead', 'control-reviewer',
  'automation-contributor', 'buyer-viewer', 'platform-admin',
];
const personaTargets = personas.map(persona => `persona-entry:${persona}`);
const invalidScopeTargets = [
  'invalid-scope-reconstruction:initial-stale-boards',
  'invalid-scope-reconstruction:stale-delivery-pack',
  'invalid-scope-reconstruction:missing-delivery-pack',
  'invalid-scope-reconstruction:malformed-delivery-pack',
];

const caseDefinition = (scenario, targetActions) => Object.freeze({
  scenario,
  targetActions: Object.freeze([...targetActions]),
});

export const HOSTED_SANDBOX_ACCEPTANCE_CASES = Object.freeze({
  'SANDBOX-001': caseDefinition('sandbox-access', []),
  'SANDBOX-002': caseDefinition('persona-matrix', personaTargets),
  'SANDBOX-003': caseDefinition('local-authority', []),
  'SANDBOX-004': caseDefinition('network-safety', []),
  'SANDBOX-005': caseDefinition('reload-reconstruction', []),
  'SANDBOX-006': caseDefinition('sandbox-accepted-descendant', []),
  'SANDBOX-007': caseDefinition('desktop-layout', []),
  'SANDBOX-008': caseDefinition('mobile-layout', []),
  'SANDBOX-009': caseDefinition('keyboard-a11y', []),
  'PUBLIC-001': caseDefinition('public-landing', []),
  'PUBLIC-002': caseDefinition('sign-in-separation', []),
  'PUBLIC-003': caseDefinition('sandbox-accepted-descendant', []),
  'PUBLIC-004': caseDefinition('release-identity', []),
  'ASSESS-001': caseDefinition('process-create', ['process-create']),
  'ASSESS-004': caseDefinition('incomplete-assessment', ['incomplete-process-create']),
  'SAFETY-004': caseDefinition('reload-reconstruction', invalidScopeTargets),
  'SAFETY-006': caseDefinition('horizontal-overflow', []),
  'SAFETY-007': caseDefinition('serious-critical-a11y', []),
});

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};
const exactKeys = (value, expected, code) => {
  assert(isPlainObject(value), code);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), code);
};
const requiredString = (value, code) => {
  assert(typeof value === 'string' && value.length > 0 && value === value.trim(), code);
  return value;
};
const canonicalValue = value => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
};
const canonicalJson = value => JSON.stringify(canonicalValue(value));
const exactArray = (actual, expected, code) => {
  assert(Array.isArray(actual), code);
  assert(JSON.stringify(actual) === JSON.stringify(expected), code);
};
const uniqueSanitizedActions = (actions, code) => {
  assert(Array.isArray(actions), code);
  assert(actions.every(action => typeof action === 'string'
    && /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/u.test(action)), code);
  assert(new Set(actions).size === actions.length, code);
  return [...actions];
};
const canonicalTimestamp = (value, code) => {
  requiredString(value, code);
  const epoch = Date.parse(value);
  assert(Number.isFinite(epoch) && new Date(epoch).toISOString() === value, code);
  return epoch;
};
const reportMetadataBinding = metadata => {
  assert(isPlainObject(metadata), 'HOSTED_SANDBOX_METADATA_INVALID');
  assert(metadata.executionKind === 'hosted_preview', 'HOSTED_SANDBOX_HOSTED_PROFILE_REQUIRED');
  assert(SHA_PATTERN.test(metadata.exactHead ?? ''), 'HOSTED_SANDBOX_HEAD_INVALID');
  assert(DEPLOY_PATTERN.test(metadata.deployId ?? ''), 'HOSTED_SANDBOX_DEPLOY_INVALID');
  const origin = new URL(requiredString(metadata.targetOrigin, 'HOSTED_SANDBOX_ORIGIN_INVALID'));
  assert(origin.protocol === 'https:' && origin.origin === metadata.targetOrigin,
    'HOSTED_SANDBOX_ORIGIN_INVALID');
  assert(Array.isArray(metadata.sourcePaths) && metadata.sourcePaths.length > 0
    && metadata.sourcePaths.every(path => typeof path === 'string' && path.length > 0 && path === path.trim())
    && REQUIRED_SOURCE_PATHS.every(path => metadata.sourcePaths.includes(path)),
  'HOSTED_SANDBOX_SOURCE_PATHS_INVALID');
  const runtime = metadata.workflowRuntime;
  assert(isPlainObject(runtime), 'HOSTED_SANDBOX_WORKFLOW_INVALID');
  assert(POSITIVE_DECIMAL_PATTERN.test(String(runtime.runId ?? ''))
    && POSITIVE_DECIMAL_PATTERN.test(String(runtime.runAttempt ?? '')),
  'HOSTED_SANDBOX_WORKFLOW_INVALID');
  const workflowPath = requiredString(runtime.workflowPath, 'HOSTED_SANDBOX_WORKFLOW_INVALID');
  return Object.freeze({
    profile: Object.freeze({
      exactHead: metadata.exactHead,
      deployId: metadata.deployId,
      targetOrigin: metadata.targetOrigin,
      sourceIdentity: SOURCE_IDENTITY,
      sourcePaths: Object.freeze([...metadata.sourcePaths]),
    }),
    workflow: Object.freeze({
      runId: String(runtime.runId),
      runAttempt: String(runtime.runAttempt),
      workflowPath,
    }),
  });
};

const validateCatalogAndBinding = (testCase, binding) => {
  assert(isPlainObject(testCase) && isPlainObject(binding), 'HOSTED_SANDBOX_CASE_BINDING_INVALID');
  const definition = HOSTED_SANDBOX_ACCEPTANCE_CASES[testCase.testId];
  assert(definition, 'HOSTED_SANDBOX_TEST_ID_UNSUPPORTED');
  assert(binding.testId === testCase.testId
    && binding.scenario === definition.scenario
    && testCase.fixture === FIXTURE_ID
    && testCase.environment === 'hosted_sandbox'
    && Number(testCase.expectedMutationCount) === definition.targetActions.length,
  'HOSTED_SANDBOX_CASE_BINDING_INVALID');
  exactArray(binding.projects, PROJECTS, 'HOSTED_SANDBOX_PROJECT_BINDING_INVALID');
  return definition;
};

const validateMeasurement = (definition, measurement) => {
  exactKeys(measurement, ['targetActions', 'supportingActions'], 'HOSTED_SANDBOX_MEASUREMENT_INVALID');
  const targetActions = uniqueSanitizedActions(measurement.targetActions, 'HOSTED_SANDBOX_TARGET_ACTION_INVALID');
  const supportingActions = uniqueSanitizedActions(measurement.supportingActions,
    'HOSTED_SANDBOX_SUPPORTING_ACTION_INVALID');
  exactArray(targetActions, definition.targetActions, 'HOSTED_SANDBOX_TARGET_ACTION_MISMATCH');
  return Object.freeze({
    targetActions: Object.freeze(targetActions),
    supportingActions: Object.freeze(supportingActions),
  });
};

export const createHostedSandboxAcceptanceAttachment = ({
  testCase, binding, metadata, project, measurement, observedAt,
}) => {
  const definition = validateCatalogAndBinding(testCase, binding);
  assert(PROJECTS.includes(project) && binding.projects.includes(project),
    'HOSTED_SANDBOX_PROJECT_INVALID');
  const measured = validateMeasurement(definition, measurement);
  const reportBinding = reportMetadataBinding(metadata);
  canonicalTimestamp(observedAt, 'HOSTED_SANDBOX_OBSERVED_AT_INVALID');
  const body = {
    schemaVersion: SCHEMA_VERSION,
    scope: Object.freeze({ evidenceScope: EVIDENCE_SCOPE, fixtureId: FIXTURE_ID }),
    profile: reportBinding.profile,
    workflow: reportBinding.workflow,
    project,
    scenario: definition.scenario,
    testId: testCase.testId,
    fixture: Object.freeze({ id: FIXTURE_ID, authority: 'browser-local-synthetic-state' }),
    observedAt,
    actual: Object.freeze({
      targetMutationCount: measured.targetActions.length,
      supportingActionCount: measured.supportingActions.length,
    }),
    measurement: measured,
  };
  return Object.freeze({
    name: ATTACHMENT_NAME,
    contentType: 'application/json',
    body: canonicalJson(body),
  });
};

const decodeAttachmentBody = attachment => {
  exactKeys(attachment, ['name', 'contentType', 'body'], 'HOSTED_SANDBOX_ATTACHMENT_INVALID');
  assert(attachment.name === ATTACHMENT_NAME && attachment.contentType === 'application/json'
    && typeof attachment.body === 'string' && attachment.body.length > 0,
  'HOSTED_SANDBOX_ATTACHMENT_INVALID');
  const decoded = Buffer.from(attachment.body, 'base64');
  assert(decoded.length > 0 && decoded.toString('base64') === attachment.body,
    'HOSTED_SANDBOX_ATTACHMENT_ENCODING_INVALID');
  let body;
  try { body = JSON.parse(decoded.toString('utf8')); } catch { throw new Error('HOSTED_SANDBOX_ATTACHMENT_JSON_INVALID'); }
  assert(canonicalJson(body) === decoded.toString('utf8'), 'HOSTED_SANDBOX_ATTACHMENT_CANONICAL_INVALID');
  return body;
};

const validateAttachmentBody = ({ body, testCase, binding, execution, attempt }) => {
  exactKeys(body, [
    'schemaVersion', 'scope', 'profile', 'workflow', 'project', 'scenario', 'testId',
    'fixture', 'observedAt', 'actual', 'measurement',
  ], 'HOSTED_SANDBOX_BODY_INVALID');
  assert(body.schemaVersion === SCHEMA_VERSION, 'HOSTED_SANDBOX_SCHEMA_INVALID');
  exactKeys(body.scope, ['evidenceScope', 'fixtureId'], 'HOSTED_SANDBOX_SCOPE_INVALID');
  assert(body.scope.evidenceScope === EVIDENCE_SCOPE && body.scope.fixtureId === FIXTURE_ID,
    'HOSTED_SANDBOX_SCOPE_INVALID');
  exactKeys(body.fixture, ['id', 'authority'], 'HOSTED_SANDBOX_FIXTURE_INVALID');
  assert(body.fixture.id === FIXTURE_ID && body.fixture.authority === 'browser-local-synthetic-state',
    'HOSTED_SANDBOX_FIXTURE_INVALID');
  const definition = validateCatalogAndBinding(testCase, binding);
  assert(body.testId === testCase.testId && body.scenario === definition.scenario
    && body.project === execution.project, 'HOSTED_SANDBOX_EXECUTION_BINDING_INVALID');
  const expectedBinding = reportMetadataBinding(execution.reportMetadata);
  assert(canonicalJson(body.profile) === canonicalJson(expectedBinding.profile)
    && canonicalJson(body.workflow) === canonicalJson(expectedBinding.workflow),
  'HOSTED_SANDBOX_PROFILE_BINDING_INVALID');
  const measured = validateMeasurement(definition, body.measurement);
  exactKeys(body.actual, ['targetMutationCount', 'supportingActionCount'],
    'HOSTED_SANDBOX_ACTUAL_INVALID');
  assert(body.actual.targetMutationCount === measured.targetActions.length
    && body.actual.supportingActionCount === measured.supportingActions.length,
  'HOSTED_SANDBOX_ACTUAL_INVALID');
  const observedEpoch = canonicalTimestamp(body.observedAt, 'HOSTED_SANDBOX_OBSERVED_AT_INVALID');
  const { startEpoch, endEpoch } = readHostedSandboxAttemptWindow({attempt, title: execution.title, project: execution.project});
  assert(observedEpoch >= startEpoch && observedEpoch <= endEpoch,
  'HOSTED_SANDBOX_OBSERVED_AT_OUTSIDE_ATTEMPT');
  return body;
};

export const verifyHostedSandboxAttachments = ({ testCase, binding, executions }) => {
  const definition = validateCatalogAndBinding(testCase, binding);
  assert(Array.isArray(executions), 'HOSTED_SANDBOX_EXECUTIONS_INVALID');
  const titlePattern = new RegExp(`^\\[${testCase.testId}\\]\\s`, 'u');
  const matches = executions.filter(execution => titlePattern.test(execution?.title ?? ''));
  assert(matches.length === PROJECTS.length, 'HOSTED_SANDBOX_EXECUTION_COUNT_INVALID');
  const actualByProject = {};
  const seenProjects = new Set();
  let firstBinding = null;
  let firstMeasurement = null;
  for (const execution of matches) {
    assert(PROJECTS.includes(execution.project) && !seenProjects.has(execution.project),
      'HOSTED_SANDBOX_EXECUTION_PROJECT_INVALID');
    seenProjects.add(execution.project);
    assert(execution.executionKind === 'hosted_preview'
      && execution.expectedStatus === 'passed'
      && execution.status === 'expected'
      && Array.isArray(execution.annotations) && execution.annotations.length === 0
      && Array.isArray(execution.results) && execution.results.length === 1,
    'HOSTED_SANDBOX_EXECUTION_INVALID');
    const attempt = execution.results[0];
    assert(attempt?.status === 'passed' && (attempt.retry ?? 0) === 0
      && !attempt.error && (!Array.isArray(attempt.errors) || attempt.errors.length === 0),
    'HOSTED_SANDBOX_EXECUTION_INVALID');
    const attachments = (attempt.attachments ?? []).filter(item => item?.name === ATTACHMENT_NAME);
    assert(attachments.length === 1, 'HOSTED_SANDBOX_ATTACHMENT_COUNT_INVALID');
    const body = validateAttachmentBody({
      body: decodeAttachmentBody(attachments[0]), testCase, binding, execution, attempt,
    });
    const executionBinding = canonicalJson({ profile: body.profile, workflow: body.workflow });
    if (firstBinding === null) firstBinding = executionBinding;
    else assert(executionBinding === firstBinding, 'HOSTED_SANDBOX_CROSS_EXECUTION_BINDING_INVALID');
    const executionMeasurement = canonicalJson({ actual: body.actual, measurement: body.measurement });
    if (firstMeasurement === null) firstMeasurement = executionMeasurement;
    else assert(executionMeasurement === firstMeasurement,
      'HOSTED_SANDBOX_CROSS_EXECUTION_MEASUREMENT_INVALID');
    actualByProject[execution.project] = Object.freeze({
      targetMutationCount: body.actual.targetMutationCount,
      supportingActionCount: body.actual.supportingActionCount,
    });
  }
  exactArray([...seenProjects].sort(), [...PROJECTS].sort(), 'HOSTED_SANDBOX_PROJECT_BINDING_INVALID');
  const targetCounts = Object.values(actualByProject).map(item => item.targetMutationCount);
  assert(targetCounts.every(count => count === definition.targetActions.length),
    'HOSTED_SANDBOX_TARGET_COUNT_INVALID');
  const orderedActualByProject = Object.fromEntries(PROJECTS.map(project => [project, actualByProject[project]]));
  return Object.freeze({
    scope: Object.freeze({ evidenceScope: EVIDENCE_SCOPE, fixtureId: FIXTURE_ID }),
    actual: Object.freeze({
      logicalMutationCount: targetCounts[0],
      byProject: Object.freeze(orderedActualByProject),
    }),
  });
};

// JSON result.duration excludes some worker setup and hooks. Record the actual
// wall-clock completion in the controller reporter, before JSON serialization.
export default class HostedSandboxAttemptWindowReporter {
  onTestEnd(test, result) {
    if (!result.attachments.some(item => item.name === ATTACHMENT_NAME)) return;
    result.attachments.push({
      name: ATTEMPT_WINDOW_NAME,
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        startTime: result.startTime.toISOString(),
        endedAt: new Date().toISOString(),
        retry: result.retry,
        title: test.title,
        project: test.parent.project().name,
      })),
    });
  }
}

export const readHostedSandboxAttemptWindow = ({attempt, title, project}) => {
  const windows = (attempt.attachments ?? []).filter(item => item?.name === ATTEMPT_WINDOW_NAME);
  assert(windows.length === 1, 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  const windowAttachment = windows[0];
  assert(windowAttachment.contentType === 'application/json' && typeof windowAttachment.body === 'string',
    'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  const windowBytes = Buffer.from(windowAttachment.body, 'base64');
  assert(windowBytes.toString('base64') === windowAttachment.body, 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  const window = JSON.parse(windowBytes.toString('utf8'));
  exactKeys(window, ['startTime', 'endedAt', 'retry', 'title', 'project'], 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  assert(window.startTime === attempt.startTime && window.retry === attempt.retry
    && window.title === title && window.project === project,
  'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  const startEpoch = canonicalTimestamp(window.startTime, 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  const endEpoch = canonicalTimestamp(window.endedAt, 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  assert(endEpoch >= startEpoch, 'HOSTED_SANDBOX_ATTEMPT_WINDOW_INVALID');
  return {startEpoch, endEpoch};
};
