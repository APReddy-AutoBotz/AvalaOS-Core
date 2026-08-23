export const normalizePlaywrightStatus = status => {
  if (status === 'passed') return 'PASS';
  if (['failed', 'timedOut', 'interrupted'].includes(status)) return 'FAIL';
  return 'BLOCKED';
};

const sorted = values => [...values].sort();
const sameValues = (left, right) => JSON.stringify(sorted(left ?? [])) === JSON.stringify(sorted(right ?? []));
const sameObject = (left, right) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
const passEligibleScope = scope => scope?.evidenceScope === 'executed-fixture' && Boolean(scope.organizationId) && Boolean(scope.workspaceId);
const assertionStatus = outcomes => (outcomes ?? []).some(outcome => outcome?.status === 'FAIL')
  ? 'FAIL'
  : (outcomes ?? []).some(outcome => outcome?.status !== 'PASS')
    ? 'BLOCKED'
    : 'PASS';

export const validateRetainedProducerResults = ({ suite, emitted, identity, provenanceByTestId = new Map() }) => {
  const errors = [];
  if (emitted?.schemaVersion !== 2) errors.push(`producer-schema:${suite?.suiteId ?? 'missing'}`);
  if (!Array.isArray(emitted?.results)) return [`producer-result-array:${suite?.suiteId ?? 'missing'}`];
  const allowedTestIds = new Set(suite?.testIds ?? []);
  for (const item of emitted.results) {
    const key = `${item?.suiteId ?? 'missing'}:${item?.testId ?? 'missing'}`;
    if (item?.suiteId !== suite?.suiteId) errors.push(`producer-suite-mismatch:${key}`);
    if (!allowedTestIds.has(item?.testId)) errors.push(`producer-test-id-mismatch:${key}`);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`producer-status:${key}`);
    if (!Array.isArray(item?.assertionOutcomes) || !item.assertionOutcomes.length) errors.push(`producer-assertion-outcomes:${key}`);
    if ((item?.assertionOutcomes ?? []).some(outcome => !outcome?.assertionId || !['PASS', 'FAIL', 'BLOCKED'].includes(outcome?.status))) errors.push(`producer-assertion-outcome-invalid:${key}`);
    const derivedStatus = assertionStatus(item?.assertionOutcomes);
    if (item?.status !== derivedStatus) errors.push(`producer-status-not-derived:${key}`);
    if (!Array.isArray(item?.assertionIds) || !item.assertionIds.length) errors.push(`producer-assertions-missing:${key}`);
    if (!Array.isArray(item?.scenarioIds) || !item.scenarioIds.length) errors.push(`producer-scenarios-missing:${key}`);
    if (!Array.isArray(item?.branchIds) || !item.branchIds.length) errors.push(`producer-branches-missing:${key}`);
    if (!Array.isArray(item?.sourceReferences) || !item.sourceReferences.length) errors.push(`producer-sources-missing:${key}`);
    for (const field of ['releaseSha', 'workflowRunId', 'workflowAttempt', 'environment', 'workflowPath']) {
      if (String(item?.[field]) !== String(identity?.[field])) errors.push(`producer-${field}:${key}`);
    }
    const provenance = provenanceByTestId.get(item?.testId);
    const owner = provenance?.ownership?.find(value => value.kind === 'retained-assertion' && value.ownerId === suite?.suiteId);
    if (!owner || !sameValues(item?.assertionIds, [owner.assertionId]) || !sameValues(item?.scenarioIds, [owner.scenarioId])) errors.push(`producer-ownership:${key}`);
    if (!sameValues(item?.branchIds, provenance ? [provenance.branchId] : [])) errors.push(`producer-branches:${key}`);
    if (!sameValues(item?.sourceReferences, provenance?.sourceReferences ?? [])) errors.push(`producer-sources:${key}`);
    if (!sameObject(item?.scope, provenance?.scope)) errors.push(`producer-scope:${key}`);
    if (item?.status === 'PASS' && !passEligibleScope(item?.scope)) errors.push(`producer-scope-not-executed:${key}`);
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
    const canonical = expected.canonicalCommandBySuiteId?.get(suite?.suiteId);
    if (!canonical || suite?.command !== canonical) errors.push(`suite-command:${suite?.suiteId ?? 'missing'}`);
  }
  const resultSeen = new Set();
  for (const item of manifest?.results ?? []) {
    const key = `${item?.suiteId ?? 'missing'}:${item?.testId ?? 'missing'}`;
    if (!item?.suiteId || !item?.testId || resultSeen.has(key)) errors.push(`duplicate-or-missing-result:${key}`);
    resultSeen.add(key);
    if (!seen.has(item?.suiteId)) errors.push(`result-suite-missing:${key}`);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`invalid-result-status:${key}`);
    if (item?.releaseSha !== expected.releaseSha) errors.push(`result-release-sha:${key}`);
    if (String(item?.workflowRunId) !== String(expected.workflowRunId)) errors.push(`result-workflow-run:${key}`);
    if (String(item?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push(`result-workflow-attempt:${key}`);
    if (item?.environment !== expected.environment) errors.push(`result-environment:${key}`);
    if (item?.workflowPath !== expected.workflowPath) errors.push(`result-workflow-path:${key}`);
    if (!item?.jobId || item?.jobId !== item?.suiteId) errors.push(`result-job:${key}`);
    const canonical = expected.canonicalCommandBySuiteId?.get(item?.suiteId);
    if (!canonical || item?.command !== canonical) errors.push(`result-command:${key}`);
    for (const field of ['assertionIds', 'scenarioIds', 'branchIds', 'sourceReferences']) {
      const values = item?.[field];
      if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length) errors.push(`result-${field}:${key}`);
    }
    if ((item?.sourceReferences ?? []).some(ref => typeof ref !== 'string' || ref.startsWith('/') || ref.includes('..') || /https?:|secret|token|password/iu.test(ref))) errors.push(`result-unsafe-source:${key}`);
    if (!(retainedBindings.get(item?.testId) ?? []).includes(item?.suiteId)) errors.push(`result-binding-mismatch:${key}`);
    const expectedBranches = expected.branchIdsByTestId?.get(item?.testId);
    if (expectedBranches && JSON.stringify([...item.branchIds].sort()) !== JSON.stringify([...expectedBranches].sort())) errors.push(`result-branch-mismatch:${key}`);
    const provenance = expected.provenanceByTestId?.get(item?.testId);
    const expectedKind = manifest?.manifestKind === 'server' ? 'server-assertion' : 'retained-assertion';
    const owner = provenance?.ownership?.find(value => value.kind === expectedKind && value.ownerId === item?.suiteId);
    const expectedAssertionIds = owner?.assertionIds ?? (owner?.assertionId ? [owner.assertionId] : []);
    const expectedScenarioIds = owner?.scenarioIds ?? (owner?.scenarioId ? [owner.scenarioId] : []);
    if (!owner || !sameValues(item?.assertionIds, expectedAssertionIds) || !sameValues(item?.scenarioIds, expectedScenarioIds)) errors.push(`result-ownership:${key}`);
    if (!sameValues(item?.sourceReferences, provenance?.sourceReferences ?? [])) errors.push(`result-source-binding:${key}`);
    if (!sameObject(item?.scope, provenance?.scope)) errors.push(`result-scope-binding:${key}`);
    if (item?.status === 'PASS' && !passEligibleScope(item?.scope)) errors.push(`result-scope-not-executed:${key}`);
    if (!Array.isArray(item?.assertionOutcomes) || !item.assertionOutcomes.length) errors.push(`result-assertion-outcomes:${key}`);
    const outcomeIds = (item?.assertionOutcomes ?? []).map(outcome => outcome?.assertionId);
    if (!sameValues(outcomeIds, item?.assertionIds)) errors.push(`result-assertion-outcome-ids:${key}`);
    const derivedStatus = assertionStatus(item?.assertionOutcomes);
    if (item?.status !== derivedStatus) errors.push(`result-status-not-derived:${key}`);
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
  if (!manifest || manifest.schemaVersion !== 2) errors.push('oracle-schema');
  if (manifest?.releaseSha !== expected.releaseSha) errors.push('oracle-release-sha');
  if (String(manifest?.workflowRunId) !== String(expected.workflowRunId)) errors.push('oracle-workflow-run');
  if (String(manifest?.workflowAttempt) !== String(expected.workflowAttempt)) errors.push('oracle-workflow-attempt');
  if (manifest?.environment !== expected.oracleEnvironment) errors.push('oracle-environment');
  if (manifest?.workflowPath !== expected.oracleWorkflowPath) errors.push('oracle-workflow-path');
  if (manifest?.command !== expected.oracleCommand) errors.push('oracle-command');
  if (!Array.isArray(manifest?.results)) errors.push('oracle-result-array');
  const seen = new Set();
  for (const item of manifest?.results ?? []) {
    const key = item?.testId ?? 'missing';
    if (!item?.testId || seen.has(item.testId)) errors.push(`duplicate-or-missing-oracle:${key}`);
    seen.add(item?.testId);
    const binding = expected.oracleBindingByTestId?.get(item?.testId);
    const provenance = expected.provenanceByTestId?.get(item?.testId);
    if (!binding || !provenance) errors.push(`oracle-binding:${key}`);
    if (!['PASS', 'FAIL', 'BLOCKED'].includes(item?.status)) errors.push(`invalid-oracle-status:${key}`);
    for (const field of ['releaseSha', 'workflowRunId', 'workflowAttempt', 'environment', 'workflowPath', 'command']) {
      const expectedValue = field === 'environment' ? expected.oracleEnvironment
        : field === 'workflowPath' ? expected.oracleWorkflowPath
          : field === 'command' ? expected.oracleCommand
            : expected[field];
      if (String(item?.[field]) !== String(expectedValue)) errors.push(`oracle-${field}:${key}`);
    }
    if (item?.scenario !== binding?.scenario || !sameValues(item?.scenarioIds, binding ? [binding.scenario] : [])) errors.push(`oracle-scenario:${key}`);
    const owner = provenance?.ownership?.find(value => value.kind === 'oracle-scenario' && value.ownerId === binding?.scenario);
    if (!owner || !sameValues(item?.assertionIds, owner.assertionIds) || !sameValues(item?.scenarioIds, owner.scenarioIds)) errors.push(`oracle-ownership:${key}`);
    if (!sameValues(item?.branchIds, provenance ? [provenance.branchId] : [])) errors.push(`oracle-branches:${key}`);
    if (!sameValues(item?.sourceReferences, provenance?.sourceReferences ?? [])) errors.push(`oracle-sources:${key}`);
    if (!sameObject(item?.scope, provenance?.scope)) errors.push(`oracle-scope:${key}`);
    if (!Array.isArray(item?.assertionOutcomes) || !item.assertionOutcomes.length) errors.push(`oracle-assertion-outcomes:${key}`);
    if (!sameValues((item?.assertionOutcomes ?? []).map(outcome => outcome?.assertionId), item?.assertionIds)) errors.push(`oracle-assertion-outcome-ids:${key}`);
    const derived = assertionStatus(item?.assertionOutcomes);
    const scopeBoundStatus = derived === 'FAIL' ? 'FAIL' : derived === 'PASS' && passEligibleScope(item?.scope) ? 'PASS' : 'BLOCKED';
    if (item?.status !== scopeBoundStatus) errors.push(`oracle-status-not-derived:${key}`);
  }
  for (const testId of expected.oracleBindingByTestId?.keys() ?? []) if (!seen.has(testId)) errors.push(`oracle-result-missing:${testId}`);
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
  const blockedResults = requiredSuiteIds.filter(id => resultIndex.get(`${id}:${testId}`)?.status !== 'PASS');
  if (blockedResults.length) return { status: 'BLOCKED', reason: `Exact retained Test ID assertions were skipped or blocked: ${blockedResults.join(', ')}` };
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
