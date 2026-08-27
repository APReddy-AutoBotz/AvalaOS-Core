import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { calculatePrAWorkingTreeDigest } from './transcriptFlowEvidenceScope.mjs';
import { validateEvidenceDirectory, validateProvenance } from './transcriptFlowEvidenceContract.mjs';

const root = process.cwd();
const checkedOutGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const baseGitSha = process.env.PR_A_BASE_SHA || checkedOutGitSha;
const headGitSha = process.env.PR_A_EXACT_HEAD_SHA || checkedOutGitSha;
assert.equal(headGitSha, checkedOutGitSha, 'PR_A_EXACT_HEAD_MISMATCH');
const workingTreeDigest = calculatePrAWorkingTreeDigest(root);
validateProvenance(root, baseGitSha);

const requested = process.env.TRANSCRIPT_FLOW_EVIDENCE_DIR;
let evidenceDir = requested ? path.resolve(requested) : null;
if (!evidenceDir) {
  const directory = path.join(root, 'output', 'process-lifecycle', baseGitSha, workingTreeDigest);
  const candidates = existsSync(directory)
    ? readdirSync(directory).map(entry => path.join(directory, entry)).filter(entry => statSync(entry).isDirectory())
    : [];
  evidenceDir = candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] || null;
}
assert.ok(evidenceDir, 'PR_A_EVIDENCE_DIRECTORY_MISSING');
const expected = { baseGitSha, headGitSha, workingTreeDigest };
if (process.env.CI) {
  assert.ok(process.env.GITHUB_RUN_ID && process.env.GITHUB_RUN_ATTEMPT, 'PR_A_CI_RUN_IDENTITY_INCOMPLETE');
  expected.runId = process.env.GITHUB_RUN_ID; expected.runAttempt = process.env.GITHUB_RUN_ATTEMPT;
}
const verified = validateEvidenceDirectory(root, evidenceDir, expected);
const byTest = new Map();
for (const result of verified.results) {
  const rows = byTest.get(result.testId) || []; rows.push(result); byTest.set(result.testId, rows);
}
for (const testId of ['PERF-002-B', 'PERF-003', 'PERF-004', 'IDEMP-002-B', 'PROVIDER-009-B']) {
  assert.equal(byTest.get(testId)?.every(item => item.result === 'not_run'), true, `PR_A_REQUIRED_NOT_RUN:${testId}`);
}
assert.equal(byTest.get('PERF-002-A')?.some(item => item.result === 'passed'), true, 'PR_A_PERF_002_A_NOT_PASSED');
assert.equal(verified.results.some(item => item.result === 'failed' || item.result === 'blocked'), false, 'PR_A_FAILED_OR_BLOCKED_RESULT');
console.log(`PR A evidence verification passed: ${verified.results.length} per-assertion results, ${verified.commands.commands.length} exact commands, base ${baseGitSha}, head ${headGitSha}, digest ${workingTreeDigest}.`);
