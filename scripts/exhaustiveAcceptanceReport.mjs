import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalHostedTitle,
  deriveInventory,
  loadCatalog,
  loadExecutionBindings,
  loadInventoryDocument,
  oracleBindingMap,
  retainedBindingMap,
  hostedBindingMap,
} from './exhaustiveAcceptanceModel.mjs';
import {
  evaluateHostedTest,
  evaluateRetainedTest,
  flattenPlaywright,
  validateOracleManifest,
  validateRetainedManifest,
} from './exhaustiveAcceptanceEvidence.mjs';

const root = process.cwd();
const out = path.resolve(process.env.ACCEPTANCE_RESULTS_DIR || 'acceptance-results');
fs.mkdirSync(out, { recursive: true });
const loadOptional = file => {
  const resolved = path.resolve(file);
  return fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : null;
};

const catalog = loadCatalog();
const bindings = loadExecutionBindings();
const inventory = deriveInventory(catalog, loadInventoryDocument());
const releaseSha = process.env.RELEASE_SHA || process.env.GITHUB_SHA || 'not-bound';
const deployId = process.env.NETLIFY_DEPLOY_ID || 'not-available';
const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
const executionDisposition = process.env.ACCEPTANCE_EXECUTION_DISPOSITION || 'EXECUTED';
const target = executionDisposition === 'EXECUTED'
  ? process.env.HOSTED_PILOT_URL || 'not-bound'
  : 'not-executed-no-exact-deployment';
const timestamp = new Date().toISOString();

const retainedManifest = loadOptional(process.env.RETAINED_RESULTS_MANIFEST || 'acceptance-results/retained-suite-results.json');
const oracleManifest = loadOptional(process.env.ORACLE_RESULTS_MANIFEST || 'acceptance-results/oracle-results.json');
const playwright = loadOptional(process.env.PLAYWRIGHT_JSON || 'artifacts/exhaustive-acceptance/playwright-results.json');
const executions = flattenPlaywright(playwright);

const expectedBinding = {
  releaseSha,
  workflowRunId,
  workflowAttempt,
  environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT || 'stable-release',
  workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH || '.github/workflows/exhaustive-acceptance.yml',
};
const retainedMap = retainedBindingMap(bindings);
const retainedErrors = validateRetainedManifest(retainedManifest, expectedBinding, retainedMap);
const oracleErrors = validateOracleManifest(oracleManifest, expectedBinding);
const suiteIndex = new Map((retainedManifest?.suites ?? []).map(item => [item.suiteId, item]));
const retainedResultIndex = new Map((retainedManifest?.results ?? []).map(item => [`${item.suiteId}:${item.testId}`, item]));
const oracleIndex = new Map((oracleManifest?.results ?? []).map(item => [item.testId, item]));
const oracleMap = oracleBindingMap(bindings);
const hostedMap = hostedBindingMap(bindings);

const results = (catalog.cases ?? []).map(testCase => {
  let evaluation;
  let actualResult = null;
  let evidenceReferences = [];
  let executionKind = 'unbound';

  if (retainedMap.has(testCase.testId)) {
    executionKind = 'retained';
    const requiredSuiteIds = retainedMap.get(testCase.testId);
    evaluation = evaluateRetainedTest({
      testId: testCase.testId,
      requiredSuiteIds,
      suiteIndex,
      resultIndex: retainedResultIndex,
      manifestErrors: retainedErrors,
    });
    actualResult = (requiredSuiteIds ?? []).map(id => ({
      suiteId: id,
      suiteStatus: suiteIndex.get(id)?.status ?? 'MISSING',
      exactTestIdStatus: retainedResultIndex.get(`${id}:${testCase.testId}`)?.status ?? 'MISSING',
    }));
  } else if (oracleMap.has(testCase.testId)) {
    executionKind = 'oracle';
    if (oracleErrors.length) {
      evaluation = { status: 'BLOCKED', reason: `Oracle evidence binding invalid: ${oracleErrors.join(', ')}` };
    } else {
      const item = oracleIndex.get(testCase.testId);
      if (!item) evaluation = { status: 'BLOCKED', reason: 'Oracle result missing.' };
      else evaluation = { status: item.status, reason: item.status === 'PASS' ? null : `Oracle scenario failed: ${item.scenario}` };
      actualResult = item?.actual ?? null;
    }
  } else if (hostedMap.has(testCase.testId)) {
    executionKind = 'hosted';
    const binding = hostedMap.get(testCase.testId);
    if (executionDisposition !== 'EXECUTED') {
      evaluation = { status: 'BLOCKED', reason: 'Hosted browser execution was not run because this PR is not the exact stable deployment.', evidenceReferences: [] };
    } else if (!binding.scenario) {
      evaluation = { status: 'BLOCKED', reason: binding.blockedReason || 'No deterministic hosted scenario is exposed.', evidenceReferences: [] };
    } else {
      evaluation = evaluateHostedTest({
        title: canonicalHostedTitle(testCase),
        executions,
        requiredProjects: binding.projects,
      });
    }
    evidenceReferences = (evaluation.evidenceReferences ?? []).map(file => path.relative(root, file));
    actualResult = evaluation.status;
  } else {
    evaluation = { status: 'BLOCKED', reason: 'No execution binding declared.' };
  }

  return {
    ...testCase,
    executionKind,
    releaseSha,
    netlifyDeployId: deployId,
    workflowRunId,
    workflowAttempt,
    executionTimestamp: timestamp,
    actualResult,
    status: evaluation.status,
    failureReason: evaluation.reason ?? null,
    evidenceReferences,
  };
});

const resultIndex = new Map(results.map(item => [item.testId, item]));
const declared = inventory.filter(branch => branch.coverageStatus === 'DECLARED');
const sourceBacked = inventory.filter(branch => branch.coverageStatus === 'SOURCE_BACKED');
const uncovered = inventory.filter(branch => branch.coverageStatus === 'UNCOVERED').map(branch => ({ ...branch, status: 'UNCOVERED' }));
const executedBranches = sourceBacked.filter(branch => branch.testIds.some(id => ['PASS', 'FAIL'].includes(resultIndex.get(id)?.status)));
const provenBranches = sourceBacked.filter(branch => branch.testIds.length > 0 && branch.testIds.every(id => resultIndex.get(id)?.status === 'PASS'));

const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, UNCOVERED: uncovered.length };
for (const result of results) counts[result.status] += 1;
const executedCases = counts.PASS + counts.FAIL;
const pct = (n, d) => d ? Number((100 * n / d).toFixed(2)) : 0;

const requiredGateSuites = (bindings.retainedSuites ?? []).filter(suite => suite.requiredGate);
const retainedGateState = requiredGateSuites.map(suite => ({
  suiteId: suite.suiteId,
  status: suiteIndex.get(suite.suiteId)?.status ?? 'MISSING',
}));
const retainedGateFailures = retainedGateState.filter(item => item.status === 'FAIL');
const retainedGateMissing = retainedGateState.filter(item => item.status === 'MISSING');

const overall = counts.FAIL > 0 || retainedGateFailures.length > 0
  ? 'FAILED'
  : counts.BLOCKED > 0 || uncovered.length > 0 || declared.length > 0 || retainedGateMissing.length > 0
    ? 'INCOMPLETE_COVERAGE'
    : 'PASSED';

const group = (items, selector) => Object.values(items.reduce((acc, item) => {
  const keys = selector(item);
  for (const key of keys) {
    acc[key] ??= { name: key, total: 0, pass: 0, fail: 0, blocked: 0 };
    acc[key].total += 1;
    acc[key][item.status.toLowerCase()] += 1;
  }
  return acc;
}, {}));

const summary = {
  overall,
  executionDisposition,
  releaseSha,
  netlifyDeployId: deployId,
  target,
  workflowRunId,
  workflowAttempt,
  executionTimestamp: timestamp,
  totalTests: results.length,
  ...counts,
  passPercentage: pct(counts.PASS, executedCases),
  totalBranches: inventory.length,
  declaredBranches: declared.length,
  sourceBackedBranches: sourceBacked.length,
  sourceBackedCoveragePercentage: pct(sourceBacked.length, inventory.length),
  executedSourceBackedBranches: executedBranches.length,
  executedSourceBackedPercentage: pct(executedBranches.length, inventory.length),
  provenSourceBackedBranches: provenBranches.length,
  provenSourceBackedPercentage: pct(provenBranches.length, inventory.length),
  retainedGateState,
  moduleSummary: group(results, item => [item.module || 'Unassigned']),
  personaSummary: group(results, item => Array.isArray(item.persona) ? item.persona : [item.persona || 'Unassigned']),
};

fs.writeFileSync(path.join(out, 'acceptance-results.json'), `${JSON.stringify({ summary, results, declared, uncovered }, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'source-to-test-coverage.json'), `${JSON.stringify({
  releaseSha,
  totalBranches: inventory.length,
  declaredBranches: declared.map(item => item.branchId),
  sourceBackedBranches: sourceBacked.map(item => item.branchId),
  executedSourceBackedBranches: executedBranches.map(item => item.branchId),
  provenSourceBackedBranches: provenBranches.map(item => item.branchId),
  uncoveredBranches: uncovered,
}, null, 2)}\n`);

const esc = value => String(value ?? '').replace(/[<>&"']/g, char => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[char]));
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="Exhaustive AvalaOS Acceptance" tests="${results.length + uncovered.length}" failures="${counts.FAIL + counts.UNCOVERED}" skipped="${counts.BLOCKED}"><testsuite name="acceptance">`;
for (const result of results) {
  xml += `<testcase classname="${esc(result.module)}" name="${esc(`${result.testId} ${result.title}`)}">`;
  if (result.status === 'FAIL') xml += `<failure message="${esc(result.failureReason)}"/>`;
  if (result.status === 'BLOCKED') xml += `<skipped message="${esc(result.failureReason)}"/>`;
  xml += '</testcase>';
}
for (const branch of uncovered) xml += `<testcase classname="coverage" name="${esc(branch.branchId)}"><failure message="UNCOVERED: ${esc(branch.uncoveredReason)}"/></testcase>`;
xml += '</testsuite></testsuites>\n';
fs.writeFileSync(path.join(out, 'acceptance-junit.xml'), xml);

const moduleRows = summary.moduleSummary.map(item => `| ${item.name} | ${item.total} | ${item.pass} | ${item.fail} | ${item.blocked} |`).join('\n');
const personaRows = summary.personaSummary.map(item => `| ${item.name} | ${item.total} | ${item.pass} | ${item.fail} | ${item.blocked} |`).join('\n');
const failures = results.filter(item => item.status === 'FAIL').map(item => `- **${item.testId} — ${item.title}** (${item.module}; ${item.executionKind}): ${item.failureReason}`).join('\n') || 'None.';
const blocked = results.filter(item => item.status === 'BLOCKED').map(item => `- **${item.testId} — ${item.title}** (${item.executionKind}): ${item.failureReason}`).join('\n') || 'None.';
const declaredMd = declared.map(item => `- **${item.branchId}** — ${item.rule}: source proof not yet registered.`).join('\n') || 'None.';
const uncoveredMd = uncovered.map(item => `- **${item.branchId}** — ${item.rule} (${item.sourceReferences.join(', ')}): ${item.uncoveredReason}`).join('\n') || 'None.';

const markdown = `# Exhaustive AvalaOS Hosted Product Acceptance

## Executive Summary

- Overall: **${overall}**
- Hosted execution: **${executionDisposition}**
- Release SHA: \`${releaseSha}\`
- Netlify deploy: \`${deployId}\`
- Target: ${target}
- Workflow: \`${workflowRunId}\` attempt \`${workflowAttempt}\`
- Tests: ${results.length}; PASS ${counts.PASS}; FAIL ${counts.FAIL}; BLOCKED ${counts.BLOCKED}; UNCOVERED ${counts.UNCOVERED}
- Executed-case pass rate: ${summary.passPercentage}%
- Catalog-declared branches awaiting source proof: ${declared.length}/${inventory.length}
- Source-backed branch coverage: ${summary.sourceBackedCoveragePercentage}% (${sourceBacked.length}/${inventory.length})
- Executed source-backed branch coverage: ${summary.executedSourceBackedPercentage}% (${executedBranches.length}/${inventory.length})
- Proven source-backed branch coverage: ${summary.provenSourceBackedPercentage}% (${provenBranches.length}/${inventory.length})

A 100% pass rate among executed cases is **not** a full product pass while blocked, declared-only, or uncovered cases remain.

## Module Summary

| Module | Total | Pass | Fail | Blocked |
|---|---:|---:|---:|---:|
${moduleRows}

## Persona Summary

| Persona | Total | Pass | Fail | Blocked |
|---|---:|---:|---:|---:|
${personaRows}

## Retained Exact-Run Gates

${retainedGateState.map(item => `- **${item.suiteId}**: ${item.status}`).join('\n')}

## Failures

${failures}

## Blocked

${blocked}

## Declared Branches Awaiting Source Proof

${declaredMd}

## Uncovered Source / Business Requirements

${uncoveredMd}
`;
fs.writeFileSync(path.join(out, 'acceptance-report.md'), markdown);

console.log(JSON.stringify(summary));
if (executionDisposition === 'EXECUTED' && overall !== 'PASSED') process.exitCode = 1;
