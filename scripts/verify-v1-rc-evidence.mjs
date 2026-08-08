import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const planPath = 'release/v1-rc-evidence-plan.json';
const planBytes = readFileSync(planPath);
const plan = JSON.parse(planBytes);
const errors = [];
if (plan.schemaVersion !== 1) errors.push('Unsupported evidence-plan schema.');
if (!/^[0-9a-f]{40}$/.test(plan.seedHead)) errors.push('Seed head must be an exact SHA.');
for (const check of plan.authoritativeChecks ?? []) {
  try { readFileSync(check.workflow); } catch { errors.push(`Missing composed workflow: ${check.workflow}`); }
}
const model = readFileSync('services/releaseCandidateReadinessModel.ts', 'utf8');
for (const id of ['assess-proc-ap-invoice-exception', 'docgen-ap-invoice-exception', 'proj-ap-invoice-exception', 'pack-ap-invoice-exception']) {
  if (!model.includes(id)) errors.push(`Canonical lineage ID missing: ${id}`);
}
if (errors.length) throw new Error(errors.join('\n'));

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const manifest = {
  schemaVersion: 1,
  candidate: plan.candidate,
  commit: head,
  workflow: process.env.GITHUB_WORKFLOW ?? 'local-source-verification',
  runId: process.env.GITHUB_RUN_ID ?? 'local-not-authoritative',
  generatedAt: process.env.GITHUB_RUN_ID ? new Date().toISOString() : 'deterministic-local',
  proofState: 'proven_ci_or_local_synthetic',
  proofBoundary: plan.proofBoundary,
  planSha256: createHash('sha256').update(planBytes).digest('hex'),
  composedChecks: plan.authoritativeChecks.map(({ id, workflow }) => ({ id, workflow, result: 'required-separate-authoritative-check' })),
  liveHostedValidation: 'not_run',
};
mkdirSync('artifacts/v1-rc', { recursive: true });
writeFileSync('artifacts/v1-rc/evidence-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`V1 RC evidence plan verified for ${head}`);
