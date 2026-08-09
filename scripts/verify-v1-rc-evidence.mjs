import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const planPath = 'release/v1-rc-evidence-plan.json';
const planBytes = readFileSync(planPath);
const plan = JSON.parse(planBytes);
const errors = [];
if (plan.schemaVersion !== 2) errors.push('Unsupported evidence-plan schema.');
if (!/^[0-9a-f]{40}$/.test(plan.seedHead)) errors.push('Seed head must be an exact SHA.');
for (const check of plan.authoritativeChecks ?? []) {
  try { readFileSync(check.workflow); } catch { errors.push(`Missing composed workflow: ${check.workflow}`); }
  if (!check.id || !check.workflowName) errors.push(`Incomplete workflow identity in plan: ${check.workflow ?? 'unknown'}`);
}

const model = readFileSync('services/releaseCandidateReadinessModel.ts', 'utf8');
for (const id of ['assess-proc-ap-invoice-exception', 'docgen-ap-invoice-exception', 'proj-ap-invoice-exception', 'pack-ap-invoice-exception']) {
  if (!model.includes(id)) errors.push(`Presentation fixture ID missing: ${id}`);
}
if (!model.includes('Presentation-only demo lineage')) errors.push('Demo lineage must be explicitly synthetic presentation only.');

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedHead = process.env.V1_RC_EXPECTED_HEAD?.trim() || head;
if (expectedHead !== head) errors.push(`Checkout identity ${head} does not match expected candidate head ${expectedHead}.`);

let suppliedRuns = [];
if (process.env.V1_RC_WORKFLOW_EVIDENCE_JSON) {
  try { suppliedRuns = JSON.parse(process.env.V1_RC_WORKFLOW_EVIDENCE_JSON); }
  catch { errors.push('V1_RC_WORKFLOW_EVIDENCE_JSON is not valid JSON.'); }
}
if (!Array.isArray(suppliedRuns)) {
  errors.push('Workflow evidence must be an array.');
  suppliedRuns = [];
}

const composedChecks = plan.authoritativeChecks.map(check => {
  const run = suppliedRuns.find(candidate => candidate?.id === check.id);
  if (!run) return { id: check.id, workflowName: check.workflowName, workflowFile: check.workflow, state: 'missing', result: 'not_run' };
  const positive = run.conclusion === 'success';
  for (const field of ['workflowName', 'workflowId', 'runId', 'headSha', 'conclusion', 'provenance']) {
    if (run[field] === undefined || run[field] === '') errors.push(`${check.id} supplied evidence is missing ${field}.`);
  }
  if (run.workflowName !== check.workflowName) errors.push(`${check.id} workflow name does not match the authoritative plan.`);
  if (run.headSha !== head) errors.push(`${check.id} evidence head ${run.headSha} does not match candidate ${head}.`);
  if (!Number.isInteger(Number(run.workflowId)) || !Number.isInteger(Number(run.runId))) errors.push(`${check.id} workflow/run IDs must be exact numeric identities.`);
  return {
    id: check.id,
    workflowName: run.workflowName,
    workflowFile: check.workflow,
    workflowId: Number(run.workflowId),
    runId: Number(run.runId),
    headSha: run.headSha,
    conclusion: run.conclusion,
    provenance: run.provenance,
    state: positive ? 'proven_exact_sha_ci' : 'not_proven',
    result: run.conclusion,
  };
});

if (errors.length) throw new Error(errors.join('\n'));
const allProven = composedChecks.every(check => check.state === 'proven_exact_sha_ci');
const manifest = {
  schemaVersion: 2,
  candidate: plan.candidate,
  commit: head,
  checkoutIdentity: 'pull_request_head_or_event_sha',
  generatorWorkflow: process.env.GITHUB_WORKFLOW ?? 'local-source-verification',
  generatorRunId: process.env.GITHUB_RUN_ID ?? 'local-not-authoritative',
  generatedAt: process.env.GITHUB_RUN_ID ? new Date().toISOString() : 'deterministic-local',
  aggregateProofState: allProven ? 'proven_exact_sha_ci' : 'incomplete_exact_sha_evidence',
  proofBoundary: plan.proofBoundary,
  planSha256: createHash('sha256').update(planBytes).digest('hex'),
  lineageState: 'synthetic_presentation_only_not_server_authority',
  composedChecks,
  liveHostedValidation: 'not_run',
};
mkdirSync('artifacts/v1-rc', { recursive: true });
writeFileSync('artifacts/v1-rc/evidence-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`V1 RC evidence manifest generated for ${head}: ${manifest.aggregateProofState}`);
