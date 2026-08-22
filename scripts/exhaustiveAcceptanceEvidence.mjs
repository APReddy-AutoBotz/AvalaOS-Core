export const normalizePlaywrightStatus = status => {
  if (status === 'passed') return 'PASS';
  if (['failed', 'timedOut', 'interrupted'].includes(status)) return 'FAIL';
  return 'BLOCKED';
};

export const validateRetainedProducerResults = ({ suite, emitted }) => {
  const errors = [];
  if (!Array.isArray(emitted?.results)) return [`producer-result-array:${suite?.suiteId ?? 'missing'}`];
  const allowedTestIds = new Set(suite?.testIds ?? []);
  for (const item of emitted.results) {
    const key = `${item?.suiteId ?? 'missing'}:${item?.testId ?? 'missing'}`;
    if (item?.suiteId !== suite?.suiteId) errors.push(`producer-suite-mismatch:${key}`);
    if (!allowedTestIds.has(item?.testId)) errors.push(`producer-test-id-mismatch:${key}`);
    if (!Array.isArray(item?.assertionIds) || !item.assertionIds.length) errors.push(`producer-assertions-missing:${key}`);
    if (!Array.isArray(item?.scenarioIds) || !item.scenarioIds.length) errors.push(`producer-scenarios-missing:${key}`);
    if (!Array.isArray(item?.branchIds) || !item.branchIds.length) errors.push(`producer-branches-missing:${key}`);
    if (!Array.isArray(item?.sourceReferences) || !item.sourceReferences.length) errors.push(`producer-sources-missing:${key}`);
  }
  return errors;
};

export const validateRetainedManifest = (manifest, expected, retainedBindings = new Map()) => {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 3) errors.push('manifest-schema');
  if (manifest?.releaseSha !== expected.releaseSha) errors.push('release-sha');
  if (String(manifest?.workflowRunId) !== String(expected.workflowRunId)) errors.push('workflow-run');
  if (String(manifest?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push('workflow-attempt');
  if (manifest?.environment !== expected.environment) errors.push('environment');
  if (manifest?.workflowPath !== expected.workflowPath) errors.push('workflow-path');
  if (!Array.isArray(manifest?.suites)) errors.push('suite-array');
  if (!Array.isArray(manifest?.results)) errors.push('result-array');
  const seen = new Set();
  for (const suite of manifest?.suites ?? []) {
    if (!suite?.suiteId || seen.has(suite.suiteId)) errors.push(`duplicate-or-missing-suite:${suite?.suiteId ?? 'missing'}`);
    seen.add(suite?.suiteId);
    if (!['PASS', 'FAIL'].includes(suite?.status)) errors.push(`invalid-suite-status:${suite?.suiteId ?? 'missing'}`);
  }
  const resultSeen = new Set();
  for (const item of manifest?.results ?? []) {
    const key = `${item?.suiteId ?? 'missing'}:${item?.testId ?? 'missing'}`;
    if (!item?.suiteId || !item?.testId || resultSeen.has(key)) errors.push(`duplicate-or-missing-result:${key}`);
    resultSeen.add(key);
    if (!seen.has(item?.suiteId)) errors.push(`result-suite-missing:${key}`);
    if (!['PASS', 'FAIL'].includes(item?.status)) errors.push(`invalid-result-status:${key}`);
    if (item?.releaseSha !== expected.releaseSha) errors.push(`result-release-sha:${key}`);
    if (String(item?.workflowRunId) !== String(expected.workflowRunId)) errors.push(`result-workflow-run:${key}`);
    if (String(item?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push(`result-workflow-attempt:${key}`);
    if (item?.environment !== expected.environment) errors.push(`result-environment:${key}`);
    if (item?.workflowPath !== expected.workflowPath) errors.push(`result-workflow-path:${key}`);
    if (!item?.jobId || item?.jobId !== item?.suiteId) errors.push(`result-job:${key}`);
    for (const field of ['assertionIds', 'scenarioIds', 'branchIds', 'sourceReferences']) {
      const values = item?.[field];
      if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length) errors.push(`result-${field}:${key}`);
    }
    if ((item?.sourceReferences ?? []).some(ref => typeof ref !== 'string' || ref.startsWith('/') || ref.includes('..') || /https?:|secret|token|password/iu.test(ref))) errors.push(`result-unsafe-source:${key}`);
    if (!(retainedBindings.get(item?.testId) ?? []).includes(item?.suiteId)) errors.push(`result-binding-mismatch:${key}`);
  }
  return errors;
};

export const validateServerManifest = (manifest, expected, serverBindings = new Map()) => {
  const errors = validateRetainedManifest(manifest, expected, serverBindings);
  if (manifest?.manifestKind !== 'server') errors.push('server-manifest-kind');
  return errors;
};

export const evaluateCompositeTest = components => {
  if (!Array.isArray(components) || !components.length) return { status: 'BLOCKED', reason: 'No evidence components declared.' };
  const failed = components.filter(item => item?.status === 'FAIL');
  if (failed.length) return { status: 'FAIL', reason: `Required component failed: ${failed.map(item => item.name).join(', ')}` };
  const blocked = components.filter(item => item?.status !== 'PASS');
  if (blocked.length) return { status: 'BLOCKED', reason: `Required component missing or blocked: ${blocked.map(item => item.name).join(', ')}` };
  return { status: 'PASS', reason: null };
};

export const validateOracleManifest = (manifest, expected) => {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1) errors.push('oracle-schema');
  if (manifest?.releaseSha !== expected.releaseSha) errors.push('oracle-release-sha');
  if (String(manifest?.workflowRunId) !== String(expected.workflowRunId)) errors.push('oracle-workflow-run');
  if (String(manifest?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push('oracle-workflow-attempt');
  if (!Array.isArray(manifest?.results)) errors.push('oracle-result-array');
  const seen = new Set();
  for (const item of manifest?.results ?? []) {
    if (!item?.testId || seen.has(item.testId)) errors.push(`duplicate-or-missing-oracle:${item?.testId ?? 'missing'}`);
    seen.add(item?.testId);
    if (!['PASS', 'FAIL'].includes(item?.status)) errors.push(`invalid-oracle-status:${item?.testId ?? 'missing'}`);
  }
  return errors;
};

export const evaluateRetainedTest = ({ testId, requiredSuiteIds, suiteIndex, resultIndex, manifestErrors }) => {
  if (manifestErrors.length) return { status: 'BLOCKED', reason: `Retained evidence binding invalid: ${manifestErrors.join(', ')}` };
  if (!requiredSuiteIds?.length) return { status: 'BLOCKED', reason: 'No retained suite binding declared.' };
  const missing = requiredSuiteIds.filter(id => !suiteIndex.has(id));
  if (missing.length) return { status: 'BLOCKED', reason: `Retained suite evidence missing: ${missing.join(', ')}` };
  const failed = requiredSuiteIds.filter(id => suiteIndex.get(id)?.status !== 'PASS');
  if (failed.length) return { status: 'FAIL', reason: `Retained suite failed: ${failed.join(', ')}` };
  const missingResults = requiredSuiteIds.filter(id => !resultIndex.has(`${id}:${testId}`));
  if (missingResults.length) return { status: 'BLOCKED', reason: `Exact retained Test ID evidence missing: ${missingResults.join(', ')}` };
  const failedResults = requiredSuiteIds.filter(id => resultIndex.get(`${id}:${testId}`)?.status === 'FAIL');
  if (failedResults.length) return { status: 'FAIL', reason: `Exact retained Test ID evidence failed: ${failedResults.join(', ')}` };
  return { status: 'PASS', reason: null };
};

export const flattenPlaywright = report => {
  const flat = [];
  const walk = suite => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec.tests ?? []) {
        flat.push({
          title: spec.title,
          project: test.projectName,
          results: test.results ?? [],
          expectedStatus: test.expectedStatus,
        });
      }
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return flat;
};

export const evaluateHostedTest = ({ title, executions, requiredProjects }) => {
  const matches = executions.filter(item => item.title === title);
  if (!matches.length) return { status: 'BLOCKED', reason: 'No exact hosted Playwright result was supplied.', evidenceReferences: [] };

  const byProject = new Map();
  for (const match of matches) {
    if (byProject.has(match.project)) {
      return { status: 'BLOCKED', reason: `Duplicate hosted execution for ${match.project}.`, evidenceReferences: [] };
    }
    byProject.set(match.project, match);
  }

  const missingProjects = requiredProjects.filter(project => !byProject.has(project));
  if (missingProjects.length) return { status: 'BLOCKED', reason: `Hosted execution missing project(s): ${missingProjects.join(', ')}`, evidenceReferences: [] };

  const statuses = [];
  const evidenceReferences = [];
  const reasons = [];
  for (const project of requiredProjects) {
    const execution = byProject.get(project);
    const last = execution.results.at(-1);
    const status = normalizePlaywrightStatus(last?.status);
    statuses.push(status);
    if (last?.error?.message) reasons.push(`${project}: ${last.error.message}`);
    for (const attachment of last?.attachments ?? []) if (attachment.path) evidenceReferences.push(attachment.path);
  }

  if (statuses.includes('FAIL')) return { status: 'FAIL', reason: reasons.join(' | ') || 'Hosted browser execution failed.', evidenceReferences };
  if (statuses.includes('BLOCKED')) return { status: 'BLOCKED', reason: reasons.join(' | ') || 'Hosted browser case was skipped or not executed.', evidenceReferences };
  return { status: 'PASS', reason: null, evidenceReferences };
};
