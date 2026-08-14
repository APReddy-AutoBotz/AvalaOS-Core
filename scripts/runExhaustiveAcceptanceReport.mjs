import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.env.ACCEPTANCE_RESULTS_DIR || 'acceptance-results');
const FAILURE_CODE = 'DECLARATION_PREFLIGHT_FAILED';

const xmlEscape = value => String(value ?? '').replace(/[<>&"']/g, char => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
}[char]));

const writeFailClosedArtifacts = () => {
  fs.mkdirSync(out, { recursive: true });
  const releaseSha = process.env.RELEASE_SHA || process.env.GITHUB_SHA || 'not-bound';
  const netlifyDeployId = process.env.NETLIFY_DEPLOY_ID || 'not-available';
  const workflowRunId = String(process.env.GITHUB_RUN_ID || 'local');
  const workflowAttempt = String(process.env.GITHUB_RUN_ATTEMPT || 'local');
  const executionTimestamp = new Date().toISOString();
  const summary = {
    overall: 'FAILED',
    executionDisposition: 'NOT_EXECUTED',
    releaseSha,
    netlifyDeployId,
    target: 'not-executed-declaration-preflight-failed',
    workflowRunId,
    workflowAttempt,
    executionTimestamp,
    totalTests: 0,
    PASS: 0,
    FAIL: 1,
    BLOCKED: 0,
    UNCOVERED: 0,
    preflightFailure: FAILURE_CODE,
  };
  const result = {
    testId: 'DECLARATION-PREFLIGHT',
    title: 'Acceptance declaration preflight',
    module: 'Acceptance',
    executionKind: 'preflight',
    releaseSha,
    netlifyDeployId,
    workflowRunId,
    workflowAttempt,
    executionTimestamp,
    actualResult: null,
    status: 'FAIL',
    failureReason: FAILURE_CODE,
    evidenceReferences: [],
  };

  fs.writeFileSync(
    path.join(out, 'acceptance-results.json'),
    `${JSON.stringify({ summary, results: [result], declared: [], uncovered: [] }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(out, 'source-to-test-coverage.json'),
    `${JSON.stringify({
      releaseSha,
      totalBranches: 0,
      declaredBranches: [],
      sourceBackedBranches: [],
      executedSourceBackedBranches: [],
      provenSourceBackedBranches: [],
      uncoveredBranches: [],
      preflightFailure: FAILURE_CODE,
    }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(out, 'acceptance-junit.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="Exhaustive AvalaOS Acceptance" tests="1" failures="1" skipped="0"><testsuite name="acceptance"><testcase classname="acceptance" name="${xmlEscape(FAILURE_CODE)}"><failure message="${xmlEscape(FAILURE_CODE)}"/></testcase></testsuite></testsuites>\n`,
  );
  fs.writeFileSync(
    path.join(out, 'acceptance-report.md'),
    `# Exhaustive AvalaOS Hosted Product Acceptance\n\n## Executive Summary\n\n- Overall: **FAILED**\n- Declaration preflight: **${FAILURE_CODE}**\n- Release SHA: \`${releaseSha}\`\n- Netlify deploy: \`${netlifyDeployId}\`\n- Workflow: \`${workflowRunId}\` attempt \`${workflowAttempt}\`\n\nDetailed parser, declaration, endpoint, and credential content is intentionally excluded from this evidence artifact.\n`,
  );
};

try {
  await import('./exhaustiveAcceptanceReport.mjs');
} catch {
  writeFailClosedArtifacts();
  console.error(`[exhaustive-acceptance] ${FAILURE_CODE}`);
  process.exitCode = 1;
}
