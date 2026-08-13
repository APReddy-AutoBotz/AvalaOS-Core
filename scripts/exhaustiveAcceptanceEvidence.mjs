export const normalizePlaywrightStatus = status => {
  if (status === 'passed') return 'PASS';
  if (['failed', 'timedOut', 'interrupted'].includes(status)) return 'FAIL';
  return 'BLOCKED';
};

export const validateRetainedManifest = (manifest, expected) => {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1) errors.push('manifest-schema');
  if (manifest?.releaseSha !== expected.releaseSha) errors.push('release-sha');
  if (String(manifest?.workflowRunId) !== String(expected.workflowRunId)) errors.push('workflow-run');
  if (String(manifest?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push('workflow-attempt');
  if (!Array.isArray(manifest?.suites)) errors.push('suite-array');
  const seen = new Set();
  for (const suite of manifest?.suites ?? []) {
    if (!suite?.suiteId || seen.has(suite.suiteId)) errors.push(`duplicate-or-missing-suite:${suite?.suiteId ?? 'missing'}`);
    seen.add(suite?.suiteId);
    if (!['PASS', 'FAIL'].includes(suite?.status)) errors.push(`invalid-suite-status:${suite?.suiteId ?? 'missing'}`);
  }
  return errors;
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

export const evaluateRetainedTest = ({ requiredSuiteIds, suiteIndex, manifestErrors }) => {
  if (manifestErrors.length) return { status: 'BLOCKED', reason: `Retained evidence binding invalid: ${manifestErrors.join(', ')}` };
  if (!requiredSuiteIds?.length) return { status: 'BLOCKED', reason: 'No retained suite binding declared.' };
  const missing = requiredSuiteIds.filter(id => !suiteIndex.has(id));
  if (missing.length) return { status: 'BLOCKED', reason: `Retained suite evidence missing: ${missing.join(', ')}` };
  const failed = requiredSuiteIds.filter(id => suiteIndex.get(id)?.status !== 'PASS');
  if (failed.length) return { status: 'FAIL', reason: `Retained suite failed: ${failed.join(', ')}` };
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
