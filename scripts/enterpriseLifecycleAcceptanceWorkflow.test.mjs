import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import spec from '../config/pilot-acceptance-spec.json' with { type: 'json' };
import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';

test('Pilot Acceptance runs the connected lifecycle once and gates on downloaded validated evidence', async () => {
  const workflow = parseWorkflowYaml(
    await readFile('.github/workflows/pilot-acceptance.yml', 'utf8'),
    'pilot-acceptance.yml',
  );
  const postgresSteps = workflow.jobs['disposable-postgresql-16'].steps;
  const migration = postgresSteps.find(step => step.name === 'Immutable Govern action authority and upgrade safety');
  assert.equal(migration?.run, 'node scripts/testGovernImmutableActionAuthorityPostgres.mjs');
  assert.match(migration?.env?.GOVERN_ACTION_AUTHORITY_DATABASE_URL || '', /127[.]0[.]0[.]1/u);
  const orchestrator = postgresSteps.find(step => step.name === 'Connected Assess Govern Studio lifecycle evidence');
  assert.match(orchestrator?.run || '', /^node scripts\/testEnterpriseLifecycleAcceptancePostgres[.]mjs --output output\/acceptance\/enterprise-lifecycle\/backend-evidence[.]json$/mu);
  assert.match(orchestrator?.run || '', /^node scripts\/runEnterpriseLifecycleAcceptanceBrowser[.]mjs$/mu);
  assert.equal(
    String(orchestrator?.run || '').match(/testEnterpriseLifecycleAcceptancePostgres[.]mjs/gu)?.length,
    1,
    'the complete backend capability must run once',
  );
  assert.equal(
    postgresSteps.filter(step => String(step.run || '').includes('runEnterpriseLifecycleAcceptanceBrowser.mjs')).length,
    1,
    'the complete browser capability must run once',
  );
  assert.equal(orchestrator?.env?.PILOT_ACCEPTANCE_HEAD, '${{ env.CANDIDATE_SHA }}');
  assert.match(orchestrator?.env?.ENTERPRISE_LIFECYCLE_DATABASE_URL || '', /127[.]0[.]0[.]1/u);

  const upload = postgresSteps.find(step => step.name === 'Upload connected enterprise lifecycle evidence');
  assert.equal(upload?.uses, 'actions/upload-artifact@v4');
  assert.equal(upload?.with?.name, 'connected-enterprise-lifecycle-${{ env.CANDIDATE_SHA }}-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(upload?.with?.['if-no-files-found'], 'error');
  assert.deepEqual(String(upload?.with?.path || '').trim().split(/\r?\n/u).map(value => value.trim()), [
    'output/acceptance/enterprise-lifecycle/backend-evidence.json',
    'output/acceptance/enterprise-lifecycle/browser-evidence.json',
  ], 'only the two sanitized aggregate artifacts may be uploaded');
  assert.equal(upload?.with?.['retention-days'], 14);

  const evidenceSteps = workflow.jobs['evidence-manifest'].steps;
  const download = evidenceSteps.find(step => step.id === 'lifecycle_download');
  const validate = evidenceSteps.find(step => step.id === 'lifecycle_evidence');
  const synthesize = evidenceSteps.find(step => step.name === 'Generate exact-head pilot gate results');
  assert.equal(download?.uses, 'actions/download-artifact@v4');
  assert.equal(download?.with?.name, upload?.with?.name, 'download identity must bind candidate, run and attempt exactly');
  assert.equal(download?.with?.path, 'output/acceptance/enterprise-lifecycle');
  assert.equal(download?.['continue-on-error'], true);
  assert.equal(validate?.['continue-on-error'], true);
  assert.equal(validate?.if, "steps.lifecycle_download.outcome == 'success'");
  assert.match(validate?.run || '', /verify:enterprise-lifecycle-acceptance-evidence/u);
  assert.equal(validate?.env?.PILOT_ACCEPTANCE_HEAD, '${{ env.CANDIDATE_SHA }}');
  assert.equal(synthesize?.env?.LIFECYCLE_EVIDENCE_RESULT, '${{ steps.lifecycle_evidence.outcome }}');
  assert.match(synthesize?.run || '', /'connected-enterprise-lifecycle': lifecycleEvidence/u);
  assert.match(synthesize?.run || '', /evidenceDigest/u);
  assert.doesNotMatch(
    synthesize?.run || '',
    /'connected-enterprise-lifecycle': pass\([^)]*POSTGRES_RESULT/iu,
    'aggregate job success must not substitute for the downloaded proof',
  );
  assert.equal(spec.requiredGates.filter(gate => gate === 'connected-enterprise-lifecycle').length, 1);
});
