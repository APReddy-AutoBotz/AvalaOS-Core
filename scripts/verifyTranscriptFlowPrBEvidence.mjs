import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadEvidenceContract, validateEvidenceContract, validateEvidenceDirectory } from './transcriptFlowPrBEvidenceContract.mjs';
import { calculatePrBWorkingTreeDigest, validatePrBProvenance } from './transcriptFlowPrBEvidenceScope.mjs';

const root = process.cwd();
const checkedOutGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const baseGitSha = process.env.PR_B_BASE_SHA || '11e670003a73b0ab5a28650b70afac4b267760f4';
const headGitSha = process.env.PR_B_EXACT_HEAD_SHA || checkedOutGitSha;
assert.equal(headGitSha, checkedOutGitSha, 'PR_B_EXACT_HEAD_MISMATCH');
const validated = validateEvidenceContract(root, loadEvidenceContract(root), { baseGitSha });
const changedFiles = validatePrBProvenance(root, baseGitSha, validated.registry, validated.provenance);
const workingTreeDigest = calculatePrBWorkingTreeDigest(root, changedFiles);

const requested = process.env.TRANSCRIPT_FLOW_PR_B_EVIDENCE_DIR;
let evidenceDir = requested ? path.resolve(requested) : null;
if (!evidenceDir) {
  const directory = path.join(root, 'output', 'process-lifecycle-pr-b', baseGitSha, workingTreeDigest);
  const candidates = existsSync(directory)
    ? readdirSync(directory).map(entry => path.join(directory, entry)).filter(entry => statSync(entry).isDirectory())
    : [];
  evidenceDir = candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] || null;
}
assert.ok(evidenceDir, 'PR_B_EVIDENCE_DIRECTORY_MISSING');
const expected = { baseGitSha, headGitSha, workingTreeDigest };
if (process.env.CI) {
  assert.ok(process.env.GITHUB_RUN_ID && process.env.GITHUB_RUN_ATTEMPT, 'PR_B_CI_RUN_IDENTITY_INCOMPLETE');
  expected.runId = process.env.GITHUB_RUN_ID;
  expected.runAttempt = process.env.GITHUB_RUN_ATTEMPT;
}
const verified = validateEvidenceDirectory(root, evidenceDir, expected);
for (const field of ['hostedVerification', 'realProviderVerification', 'controlledHumanVerification', 'deploymentVerification']) {
  assert.equal(verified.manifest[field], 'not_run', `PR_B_REQUIRED_NOT_RUN_BOUNDARY:${field}`);
}
assert.equal(verified.results.some(item => item.result === 'failed' || item.result === 'blocked'), false, 'PR_B_FAILED_OR_BLOCKED_RESULT');
const passedIds = new Set(verified.results.filter(item => item.result === 'passed').map(item => item.testId));
for (const testId of ['IDEMP-002-B', 'PROVIDER-009-B', 'PERF-001', 'MIGRATION-006', 'COMPAT-003']) {
  assert.equal(passedIds.has(testId), true, `PR_B_REQUIRED_EXECUTED_RESULT:${testId}`);
}
console.log(`PR B evidence verification passed: ${verified.results.length} per-assertion results, ${verified.commands.commands.length} exact commands, base ${baseGitSha}, head ${headGitSha}, digest ${workingTreeDigest}.`);
