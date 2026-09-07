import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseWorkflowYaml } from './checkWorkflowYaml.mjs';
import { CHECKPOINT_WORKFLOW, EDGE_DEPLOY_WORKFLOW, PREPARE_WORKFLOW, PREVIEW_ORIGIN, QUIESCE_WORKFLOW, RECOVERY_WORKFLOW, VERIFY_WORKFLOW } from './prCControlledHumanEvidenceContract.mjs';
import {
  CONTROLLED_HUMAN_PHASE_SECRETS,
  CONTROLLED_HUMAN_SECRET_SENTINEL,
  validateControlledHumanWorkflowSecrets,
} from './prCControlledHumanWorkflowSecrets.mjs';

const PRIMARY_WORKFLOW = '.github/workflows/transcript-flow-pr-c.yml';
const PHASE_BY_WORKFLOW = new Map([
  [EDGE_DEPLOY_WORKFLOW, 'edge'],
  [PREPARE_WORKFLOW, 'prepare'],
  [QUIESCE_WORKFLOW, 'quiesce'],
  [CHECKPOINT_WORKFLOW, 'checkpoint'],
  [VERIFY_WORKFLOW, 'verify'],
  [RECOVERY_WORKFLOW, 'recover'],
]);
const EXPECTED_PROTECTED_CALLERS = Object.freeze({
  controlled_human_edge: Object.freeze({
    phase: 'edge',
    uses: `./${EDGE_DEPLOY_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'edge' }}",
    needs: 'controlled_human_authority',
  }),
  controlled_human_prepare: Object.freeze({
    phase: 'prepare',
    uses: `./${PREPARE_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'prepare' }}",
    needs: 'controlled_human_authority',
  }),
  controlled_human_quiesce: Object.freeze({
    phase: 'quiesce',
    uses: `./${QUIESCE_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'quiesce' }}",
    needs: 'controlled_human_authority',
  }),
  controlled_human_requester: Object.freeze({
    phase: 'checkpoint',
    uses: `./${CHECKPOINT_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' }}",
    needs: 'controlled_human_authority',
  }),
  controlled_human_approver: Object.freeze({
    phase: 'checkpoint',
    uses: `./${CHECKPOINT_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' && needs.controlled_human_requester.result == 'success' }}",
    needs: Object.freeze(['controlled_human_authority', 'controlled_human_requester']),
  }),
  controlled_human_reviewer: Object.freeze({
    phase: 'checkpoint',
    uses: `./${CHECKPOINT_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'checkpoints' && needs.controlled_human_approver.result == 'success' }}",
    needs: Object.freeze(['controlled_human_authority', 'controlled_human_approver']),
  }),
  controlled_human_final: Object.freeze({
    phase: 'verify',
    uses: `./${VERIFY_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'final' }}",
    needs: 'controlled_human_authority',
  }),
  controlled_human_recovery: Object.freeze({
    phase: 'recover',
    uses: `./${RECOVERY_WORKFLOW}`,
    if: "${{ needs.controlled_human_authority.outputs.phase == 'abort' || needs.controlled_human_authority.outputs.phase == 'expiry' }}",
    needs: 'controlled_human_authority',
  }),
});

const DATABASE_URL = 'PR_C_CONTROLLED_HUMAN_DATABASE_URL';
const EVIDENCE_HMAC_KEY = 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY';
const EXERCISE_ID = 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID';
const PASSWORD_BUNDLE_JSON = 'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON';
const PROJECT_REF = 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF';
const SERVICE_ROLE_KEY = 'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY';
const SUPABASE_URL = 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL';
const ACCESS_TOKEN = 'PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN';
const ALL_PROTECTED_SECRET_NAMES = Object.freeze([...new Set(Object.values(CONTROLLED_HUMAN_PHASE_SECRETS).flat())].sort());
const sameBindings = (...names) => Object.fromEntries(names.map(name => [name, name]));
const EXPECTED_PHASE_SECRET_CONSUMERS = new Map([
  [EDGE_DEPLOY_WORKFLOW, [
    ['Bind Supabase project, API and database without disclosure', { SUPABASE_PROJECT_REF: PROJECT_REF, ...sameBindings(SUPABASE_URL, DATABASE_URL) }],
    ['Capture provider deployment baseline', { SUPABASE_PROJECT_REF: PROJECT_REF, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN }],
    ['Apply and verify exact additive migration on the dedicated database', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Deploy only the allowlisted functions', { SUPABASE_PROJECT_REF: PROJECT_REF, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN }],
    ['Produce provider-attested deployment and runtime manifest', { SUPABASE_PROJECT_REF: PROJECT_REF, SUPABASE_ACCESS_TOKEN: ACCESS_TOKEN, ...sameBindings(EVIDENCE_HMAC_KEY) }],
  ]],
  [PREPARE_WORKFLOW, [
    ['Verify signed exact deployed Edge source manifest before backend access', sameBindings(EVIDENCE_HMAC_KEY)],
    ['Bind Supabase Admin API and database to the exact deployed project', { SUPABASE_PROJECT_REF: PROJECT_REF, ...sameBindings(SUPABASE_URL, DATABASE_URL) }],
    ['Authenticate service-role authority against the exact Supabase API without retaining response data', sameBindings(SUPABASE_URL, SERVICE_ROLE_KEY)],
    ['Preflight dedicated synthetic target', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Produce bounded seed plan', sameBindings(EXERCISE_ID)],
    ['Apply bounded synthetic seed', sameBindings(DATABASE_URL, EXERCISE_ID, SUPABASE_URL, SERVICE_ROLE_KEY, PASSWORD_BUNDLE_JSON)],
    ['Verify exact seed and zero-egress boundary', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Build immutable preparation binding', sameBindings(EVIDENCE_HMAC_KEY)],
    ['Protected exact-bound abort recovery after failed seed or evidence assembly', sameBindings(DATABASE_URL, EXERCISE_ID, SUPABASE_URL, SERVICE_ROLE_KEY)],
  ]],
  [QUIESCE_WORKFLOW, [
    ['Bind Supabase project, API and database before lifecycle mutation', { SUPABASE_PROJECT_REF: PROJECT_REF, ...sameBindings(SUPABASE_URL, DATABASE_URL) }],
    ['Reverify exact preview and active synthetic state', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Enter exact server-enforced read-only state before any read-only human observation', sameBindings(DATABASE_URL, EXERCISE_ID)],
  ]],
  [CHECKPOINT_WORKFLOW, [
    ['Derive backend observer records from the exact synthetic read-only scope', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Sign human attestation and independently observed server evidence', sameBindings(EVIDENCE_HMAC_KEY)],
  ]],
  [VERIFY_WORKFLOW, [
    ['Revalidate immutable human comments and exact signed observation bytes', sameBindings(EVIDENCE_HMAC_KEY)],
    ['Validate preparation and every signed human/server checkpoint before reset', sameBindings(EVIDENCE_HMAC_KEY)],
    ['Bind Supabase project, API and database before lifecycle mutation', { SUPABASE_PROJECT_REF: PROJECT_REF, ...sameBindings(SUPABASE_URL, DATABASE_URL) }],
    ['Deprovision exact synthetic exercise directly from frozen read-only state', sameBindings(DATABASE_URL, EXERCISE_ID, SUPABASE_URL, SERVICE_ROLE_KEY)],
    ['Independently re-inspect post-deprovision state', sameBindings(DATABASE_URL, EXERCISE_ID)],
    ['Build verified human session from recomputed evidence', sameBindings(EVIDENCE_HMAC_KEY)],
  ]],
  [RECOVERY_WORKFLOW, [
    ['Bind Supabase project, API, and database to one exact synthetic target', { SUPABASE_PROJECT_REF: PROJECT_REF, ...sameBindings(SUPABASE_URL, DATABASE_URL) }],
    ['Complete exact server-authorized abort or expiry recovery', sameBindings(DATABASE_URL, EXERCISE_ID, SUPABASE_URL, SERVICE_ROLE_KEY)],
  ]],
]);

const load = async workflowPath => {
  const source = (await readFile(workflowPath, 'utf8')).replaceAll('\r\n','\n');
  return { source, workflow: parseWorkflowYaml(source, workflowPath) };
};
const assertReusable = ({source,workflow}) => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
  assert.doesNotMatch(source, /workflow_dispatch/u);
  assert.match(source, /github\.event_name == 'pull_request'/u);
  assert.match(source, /github\.event\.pull_request\.number == 264/u);
};
const assertPinned = source => {
  const uses = [...source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gmu)].map(match=>match[1]);
  assert.ok(uses.length > 0);
  for (const use of uses) assert.match(use, /^[^@]+@[0-9a-f]{40}$/u);
};
const assertNoJobSecrets = workflow => {
  for (const job of Object.values(workflow.jobs)) for (const value of Object.values(job.env ?? {})) assert.doesNotMatch(String(value), /secrets\./u);
};

const sorted = values => [...values].sort();
// Include whole-context serialization, not only dotted or indexed secret access.
const SECRET_EXPRESSION = /\$\{\{(?:(?!\}\})[\s\S])*?\bsecrets\b(?:(?!\}\})[\s\S])*\}\}/iu;
const pathKey = key => `[${JSON.stringify(key)}]`;
const walkYaml = (value, path = '$', leaves = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkYaml(item, `${path}[${index}]`, leaves));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walkYaml(item, `${path}${pathKey(key)}`, leaves);
  } else {
    leaves.push({ path, value });
  }
  return leaves;
};
const secretExpressionLeaves = value => walkYaml(value).filter(leaf => typeof leaf.value === 'string' && SECRET_EXPRESSION.test(leaf.value));
const exactSecretExpression = name => `\${{ secrets.${name} }}`;
const sortedLeaves = leaves => [...leaves].sort((left, right) => left.path.localeCompare(right.path));
const stepPath = (jobName, stepIndex, envName) => `$${pathKey('jobs')}${pathKey(jobName)}${pathKey('steps')}[${stepIndex}]${pathKey('env')}${pathKey(envName)}`;

const assertProtectedStepDoesNotExport = (step, workflowPath) => {
  const run = String(step.run ?? '');
  assert.doesNotMatch(run, /GITHUB_(?:ENV|OUTPUT|PATH|STEP_SUMMARY)/u, `${workflowPath}:${step.name} persistence channel`);
  assert.doesNotMatch(String(step.uses ?? ''), /^actions\/upload-artifact@/u, `${workflowPath}:${step.name} upload channel`);
  assert.equal(step.outputs, undefined, `${workflowPath}:${step.name} step outputs`);
  const secretEnvNames = Object.keys(step.env ?? {}).filter(name => SECRET_EXPRESSION.test(String(step.env[name])));
  const diagnosticSink = /(?:\becho\b|\bprintf\b|\bprintenv\b|console\.(?:log|error|warn|info)|core\.(?:setOutput|notice|warning|error|debug)|::(?:debug|notice|warning|error))/u;
  for (const line of run.split('\n').filter(candidate => diagnosticSink.test(candidate))) {
    for (const envName of secretEnvNames) {
      const escaped = envName.replaceAll(/[$()*+.?[\]^{|}\\]/gu, '\\$&');
      assert.doesNotMatch(line, new RegExp(`(?:\\$\\{?${escaped}\\}?|process\\.env\\.${escaped}|process\\.env\\[['\"]${escaped}['\"]\\])`, 'u'));
    }
  }
};

const assertPhaseSecretContract = ({ source, workflow }, workflowPath) => {
  const phase = PHASE_BY_WORKFLOW.get(workflowPath);
  assert.ok(phase, `known phase for ${workflowPath}`);
  const expected = CONTROLLED_HUMAN_PHASE_SECRETS[phase];
  const declarations = workflow.on.workflow_call.secrets;
  assert.deepEqual(sorted(Object.keys(declarations ?? {})), sorted(expected));
  for (const name of expected) assert.deepEqual(declarations[name], { required: true });

  const jobs = Object.entries(workflow.jobs);
  assert.equal(jobs.length, 1);
  const [jobName, job] = jobs[0];
  assert.equal(job.environment, 'hosted-nonproduction-pilot');
  assertNoJobSecrets(workflow);
  for (const name of ALL_PROTECTED_SECRET_NAMES) assert.equal(Object.hasOwn(job.env ?? {}, name), false, `${workflowPath} must step-scope ${name}`);
  const command = `node scripts/prCControlledHumanWorkflowSecrets.mjs ${phase}`;
  const guardIndexes = job.steps.flatMap((step, index) => step.run === command ? [index] : []);
  assert.equal(guardIndexes.length, 1, `${workflowPath} exact secret guard count`);
  const [guardIndex] = guardIndexes;
  const installIndexes = job.steps.flatMap((step, index) => step.run === 'npm ci' ? [index] : []);
  assert.equal(installIndexes.length, 1, `${workflowPath} exact dependency install count`);
  assert.equal(guardIndex, installIndexes[0] + 1, `${workflowPath} guard must immediately follow dependency installation`);
  const guard = job.steps[guardIndex];
  assert.equal(guard.if, undefined, `${workflowPath} secret guard cannot be conditional`);
  assert.equal(guard['continue-on-error'], undefined, `${workflowPath} secret guard cannot continue on error`);
  assert.deepEqual(sorted(Object.keys(guard.env ?? {})), sorted(expected));
  const expectedLeaves = [];
  for (const name of expected) {
    assert.equal(guard.env[name], exactSecretExpression(name));
    expectedLeaves.push({ path: stepPath(jobName, guardIndex, name), value: exactSecretExpression(name) });
  }

  for (const [stepName, bindings] of EXPECTED_PHASE_SECRET_CONSUMERS.get(workflowPath)) {
    const indexes = job.steps.flatMap((step, index) => step.name === stepName ? [index] : []);
    assert.equal(indexes.length, 1, `${workflowPath}:${stepName} exact consumer count`);
    const [index] = indexes;
    for (const [envName, secretName] of Object.entries(bindings)) {
      assert.equal(job.steps[index].env?.[envName], exactSecretExpression(secretName), `${workflowPath}:${stepName}:${envName}`);
      expectedLeaves.push({ path: stepPath(jobName, index, envName), value: exactSecretExpression(secretName) });
    }
  }

  const actualLeaves = secretExpressionLeaves(workflow);
  assert.deepEqual(sortedLeaves(actualLeaves), sortedLeaves(expectedLeaves), `${workflowPath} secret expression paths`);
  const firstSecretIndex = job.steps.findIndex(step => secretExpressionLeaves(step).length > 0);
  assert.equal(firstSecretIndex, guardIndex, `${workflowPath} guards the first protected reference`);
  for (const step of job.steps.filter(candidate => secretExpressionLeaves(candidate.env ?? {}).length > 0)) assertProtectedStepDoesNotExport(step, workflowPath);
  assert.doesNotMatch(source, /secrets:\s*inherit/u);
};

const assertCallerSecretContract = ({ source, workflow }) => {
  assert.doesNotMatch(source, /secrets:\s*inherit/u);
  assert.deepEqual(secretExpressionLeaves(workflow), [], 'primary workflow cannot read secret contexts');
  const protectedUses = new Set(Object.values(EXPECTED_PROTECTED_CALLERS).map(entry => entry.uses));
  const actualProtectedCallers = Object.entries(workflow.jobs)
    .filter(([, job]) => job.secrets !== undefined || protectedUses.has(job.uses) || String(job.uses ?? '').startsWith('./.github/workflows/pr264-controlled-human-'))
    .map(([jobName]) => jobName);
  assert.deepEqual(sorted(actualProtectedCallers), sorted(Object.keys(EXPECTED_PROTECTED_CALLERS)));
  for (const [jobName, contract] of Object.entries(EXPECTED_PROTECTED_CALLERS)) {
    const job = workflow.jobs[jobName];
    assert.equal(job.uses, contract.uses, `${jobName} exact called workflow`);
    assert.equal(job.if, contract.if, `${jobName} exact phase condition`);
    assert.deepEqual(job.needs, contract.needs, `${jobName} exact sequencing`);
    const mapping = job.secrets;
    const expected = CONTROLLED_HUMAN_PHASE_SECRETS[contract.phase];
    assert.deepEqual(sorted(Object.keys(mapping ?? {})), sorted(expected));
    for (const name of expected) assert.equal(mapping[name], CONTROLLED_HUMAN_SECRET_SENTINEL);
  }
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!Object.hasOwn(EXPECTED_PROTECTED_CALLERS, jobName)) assert.equal(job.secrets, undefined, `${jobName} must not receive protected values`);
  }
};

const syntheticPhaseValues = phase => Object.fromEntries(
  CONTROLLED_HUMAN_PHASE_SECRETS[phase].map((name, index) => [name, `synthetic-marker-${phase}-${index}`]),
);

const runSecretCli = (phase, values = {}) => spawnSync(
  process.execPath,
  ['scripts/prCControlledHumanWorkflowSecrets.mjs', phase],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: values,
  },
);

const PINNED_CA_VERIFY_COMMAND = 'node scripts/prCControlledHumanPostgresTls.mjs verify-ca';
const DATABASE_TLS_GUARDS = new Map([
  [CHECKPOINT_WORKFLOW, [
    ['Derive backend observer records from the exact synthetic read-only scope', 'Verify pinned Supabase CA for backend observer'],
  ]],
  [EDGE_DEPLOY_WORKFLOW, [
    ['Apply and verify exact additive migration on the dedicated database', 'Verify pinned Supabase CA for controlled migration'],
  ]],
  [PREPARE_WORKFLOW, [
    ['Preflight dedicated synthetic target', 'Verify pinned Supabase CA for target preflight'],
    ['Apply bounded synthetic seed', 'Verify pinned Supabase CA for seed apply'],
    ['Verify exact seed and zero-egress boundary', 'Verify pinned Supabase CA for seed verification'],
    ['Protected exact-bound abort recovery after failed seed or evidence assembly', 'Verify pinned Supabase CA for abort recovery'],
  ]],
  [QUIESCE_WORKFLOW, [
    ['Reverify exact preview and active synthetic state', 'Verify pinned Supabase CA for active-state verification'],
    ['Enter exact server-enforced read-only state before any read-only human observation', 'Verify pinned Supabase CA for read-only transition'],
  ]],
  [RECOVERY_WORKFLOW, [
    ['Complete exact server-authorized abort or expiry recovery', 'Verify pinned Supabase CA for abort or expiry recovery'],
  ]],
  [VERIFY_WORKFLOW, [
    ['Deprovision exact synthetic exercise directly from frozen read-only state', 'Verify pinned Supabase CA for deprovision'],
    ['Independently re-inspect post-deprovision state', 'Verify pinned Supabase CA for post-deprovision inspection'],
  ]],
]);

test('each reusable phase declares, scopes, and preflights only its exact protected secret set', async () => {
  for (const workflowPath of PHASE_BY_WORKFLOW.keys()) {
    assertPhaseSecretContract(await load(workflowPath), workflowPath);
  }
});

test('protected secret presence validation fails closed without disclosing synthetic values', () => {
  for (const phase of Object.keys(CONTROLLED_HUMAN_PHASE_SECRETS)) {
    const valid = syntheticPhaseValues(phase);
    assert.deepEqual(
      validateControlledHumanWorkflowSecrets(phase, valid, { exact: true }),
      { status: 'present', phase },
    );
    for (const name of CONTROLLED_HUMAN_PHASE_SECRETS[phase]) {
      for (const rejected of [undefined, '', '   ', CONTROLLED_HUMAN_SECRET_SENTINEL, `  ${CONTROLLED_HUMAN_SECRET_SENTINEL}  `]) {
        const candidate = { ...valid };
        if (rejected === undefined) delete candidate[name];
        else candidate[name] = rejected;
        assert.throws(
          () => validateControlledHumanWorkflowSecrets(phase, candidate),
          error => {
            assert.match(error.message, /^PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:[a-z-]+:[A-Z0-9_-]+$/u);
            for (const marker of Object.values(valid)) assert.doesNotMatch(error.message, new RegExp(marker, 'u'));
            assert.doesNotMatch(error.message, /length|hash|https?:|postgres|eyJ|-----BEGIN/iu);
            return true;
          },
        );
      }
    }
    assert.throws(
      () => validateControlledHumanWorkflowSecrets(phase, { ...valid, PR_C_CONTROLLED_HUMAN_UNKNOWN: 'synthetic-extra' }, { exact: true }),
      /PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED/u,
    );
  }
  assert.throws(
    () => validateControlledHumanWorkflowSecrets('unknown', {}),
    /PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:unknown-phase/u,
  );
});

test('protected secret CLI accepts only known complete phases and emits bounded diagnostics', () => {
  for (const phase of Object.keys(CONTROLLED_HUMAN_PHASE_SECRETS)) {
    const values = syntheticPhaseValues(phase);
    const accepted = runSecretCli(phase, values);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.deepEqual(JSON.parse(accepted.stdout), {
      status: 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRETS_PRESENT',
      phase,
    });
    assert.equal(accepted.stderr, '');
    for (const marker of Object.values(values)) {
      assert.doesNotMatch(`${accepted.stdout}${accepted.stderr}`, new RegExp(marker, 'u'));
    }

    for (const name of CONTROLLED_HUMAN_PHASE_SECRETS[phase]) {
      for (const rejectedValue of [undefined, '', '   ', CONTROLLED_HUMAN_SECRET_SENTINEL, `  ${CONTROLLED_HUMAN_SECRET_SENTINEL}  `]) {
        const candidate = { ...values };
        if (rejectedValue === undefined) delete candidate[name];
        else candidate[name] = rejectedValue;
        const rejected = runSecretCli(phase, candidate);
        assert.notEqual(rejected.status, 0);
        assert.equal(rejected.stdout, '');
        assert.match(rejected.stderr, /^PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:[a-z-]+:[A-Z0-9_-]+\r?\n$/u);
        for (const marker of Object.values(values)) {
          assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, new RegExp(marker, 'u'));
        }
      }
    }
  }
  const unknown = runSecretCli('unknown-phase');
  assert.notEqual(unknown.status, 0);
  assert.equal(unknown.stdout, '');
  assert.equal(unknown.stderr, 'PR264_CONTROLLED_HUMAN_WORKFLOW_SECRET_REJECTED:unknown-phase:invalid-input\n');
});

test('workflow secret contracts reject declaration, mapping, environment, and ordering mutations', async () => {
  const phaseCases = [];
  for (const workflowPath of PHASE_BY_WORKFLOW.keys()) phaseCases.push([workflowPath, await load(workflowPath)]);

  const [edgePath, edgeLoaded] = phaseCases.find(([workflowPath]) => workflowPath === EDGE_DEPLOY_WORKFLOW);
  const edgePhase = PHASE_BY_WORKFLOW.get(edgePath);
  const edgeSecret = CONTROLLED_HUMAN_PHASE_SECRETS[edgePhase][0];
  const edgeJob = loaded => Object.values(loaded.workflow.jobs)[0];
  const edgeStep = (loaded, name) => edgeJob(loaded).steps.find(step => step.name === name);
  const edgeConsumerName = 'Bind Supabase project, API and database without disclosure';
  for (const [mutationName, mutate] of [
    ['missing declaration', loaded => { delete loaded.workflow.on.workflow_call.secrets[edgeSecret]; }],
    ['optional declaration', loaded => { loaded.workflow.on.workflow_call.secrets[edgeSecret].required = false; }],
    ['extra declaration', loaded => { loaded.workflow.on.workflow_call.secrets.PR_C_CONTROLLED_HUMAN_UNKNOWN = { required: true }; }],
    ['wrong environment', loaded => { edgeJob(loaded).environment = 'another-environment'; }],
    ['job-global secret expression', loaded => { edgeJob(loaded).env[DATABASE_URL] = exactSecretExpression(DATABASE_URL); }],
    ['job-global phase secret literal', loaded => { edgeJob(loaded).env[DATABASE_URL] = CONTROLLED_HUMAN_SECRET_SENTINEL; }],
    ['job-global cross-phase secret literal', loaded => { edgeJob(loaded).env[PASSWORD_BUNDLE_JSON] = CONTROLLED_HUMAN_SECRET_SENTINEL; }],
    ['displaced guard', loaded => {
      const steps = Object.values(loaded.workflow.jobs)[0].steps;
      const guardIndex = steps.findIndex(step => step.run === `node scripts/prCControlledHumanWorkflowSecrets.mjs ${edgePhase}`);
      steps.push(steps.splice(guardIndex, 1)[0]);
    }],
    ['duplicate guard', loaded => { edgeJob(loaded).steps.push(structuredClone(edgeStep(loaded, 'Require exact protected Edge phase secrets'))); }],
    ['conditional guard', loaded => { edgeStep(loaded, 'Require exact protected Edge phase secrets').if = '${{ always() }}'; }],
    ['continuing guard', loaded => { edgeStep(loaded, 'Require exact protected Edge phase secrets')['continue-on-error'] = true; }],
    ['pre-guard reference', loaded => { edgeJob(loaded).steps[0].env = { [DATABASE_URL]: exactSecretExpression(DATABASE_URL) }; }],
    ['run expression', loaded => { edgeJob(loaded).steps[0].run = `echo ${exactSecretExpression(DATABASE_URL)}`; }],
    ['whole secret context in pre-guard run', loaded => { edgeJob(loaded).steps[0].run = '${{ toJSON(secrets) }}'; }],
    ['with expression and bracket syntax', loaded => { edgeJob(loaded).steps[0].with.leak = "${{ secrets['PR_C_CONTROLLED_HUMAN_DATABASE_URL'] }}"; }],
    ['job condition expression', loaded => { edgeJob(loaded).if = exactSecretExpression(DATABASE_URL); }],
    ['job output expression', loaded => { edgeJob(loaded).outputs = { leak: exactSecretExpression(DATABASE_URL) }; }],
    ['step output expression', loaded => { edgeStep(loaded, edgeConsumerName).outputs = { leak: exactSecretExpression(DATABASE_URL) }; }],
    ['workflow defaults expression', loaded => { loaded.workflow.defaults = { run: { shell: exactSecretExpression(DATABASE_URL) } }; }],
    ['container expression', loaded => { edgeJob(loaded).container = { credentials: { password: exactSecretExpression(DATABASE_URL) } }; }],
    ['service expression', loaded => { edgeJob(loaded).services = { synthetic: { env: { TOKEN: exactSecretExpression(DATABASE_URL) } } }; }],
    ['arbitrary alias', loaded => {
      const step = edgeStep(loaded, edgeConsumerName);
      step.env.PROJECT_REF_ALIAS = step.env.SUPABASE_PROJECT_REF;
      delete step.env.SUPABASE_PROJECT_REF;
    }],
    ['mismatched alias value', loaded => { edgeStep(loaded, edgeConsumerName).env.SUPABASE_PROJECT_REF = exactSecretExpression(DATABASE_URL); }],
    ['diagnostic value', loaded => { edgeStep(loaded, edgeConsumerName).run += '\necho "$SUPABASE_PROJECT_REF"'; }],
    ...['GITHUB_ENV', 'GITHUB_OUTPUT', 'GITHUB_PATH', 'GITHUB_STEP_SUMMARY'].map(channel => [
      `${channel} persistence`,
      loaded => { edgeStep(loaded, edgeConsumerName).run += `\nprintf '%s' "$SUPABASE_PROJECT_REF" >> "$${channel}"`; },
    ]),
    ['upload with protected env', loaded => {
      edgeJob(loaded).steps.push({
        name: 'Forbidden upload',
        uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
        env: { [DATABASE_URL]: exactSecretExpression(DATABASE_URL) },
        with: { path: 'synthetic-output' },
      });
    }],
    ['new diagnostic consumer', loaded => {
      edgeJob(loaded).steps.push({
        env: { [edgeSecret]: exactSecretExpression(edgeSecret) },
        run: 'echo forbidden >> "$GITHUB_ENV"',
      });
    }],
  ]) {
    const changed = structuredClone(edgeLoaded);
    mutate(changed);
    assert.throws(() => assertPhaseSecretContract(changed, edgePath), mutationName);
  }

  const primary = await load(PRIMARY_WORKFLOW);
  const caller = 'controlled_human_edge';
  const callerSecret = CONTROLLED_HUMAN_PHASE_SECRETS.edge[0];
  for (const [mutationName, mutate] of [
    ['missing caller mapping', loaded => { delete loaded.workflow.jobs[caller].secrets[callerSecret]; }],
    ['caller secret expression', loaded => { loaded.workflow.jobs[caller].secrets[callerSecret] = exactSecretExpression(DATABASE_URL); }],
    ['whole secret context in caller with', loaded => { loaded.workflow.jobs[caller].with.leak = '${{ secrets }}'; }],
    ['extra caller mapping', loaded => { loaded.workflow.jobs[caller].secrets.PR_C_CONTROLLED_HUMAN_UNKNOWN = CONTROLLED_HUMAN_SECRET_SENTINEL; }],
    ['inherited caller secrets', loaded => { loaded.workflow.jobs[caller].secrets = 'inherit'; loaded.source += '\n# secrets: inherit\n'; }],
    ['alternate caller alias', loaded => { loaded.workflow.jobs[caller].secrets[callerSecret] = 'alternate-alias'; }],
    ['cross-phase caller name', loaded => { loaded.workflow.jobs[caller].secrets[PASSWORD_BUNDLE_JSON] = CONTROLLED_HUMAN_SECRET_SENTINEL; }],
    ['swapped called workflow', loaded => { loaded.workflow.jobs[caller].uses = `./${PREPARE_WORKFLOW}`; }],
    ['wrong phase condition', loaded => { loaded.workflow.jobs[caller].if = "${{ needs.controlled_human_authority.outputs.phase == 'prepare' }}"; }],
    ['extra protected caller', loaded => { loaded.workflow.jobs.controlled_human_extra = structuredClone(loaded.workflow.jobs[caller]); }],
    ['broken checkpoint sequence', loaded => { loaded.workflow.jobs.controlled_human_reviewer.needs = ['controlled_human_authority', 'controlled_human_requester']; }],
  ]) {
    const changed = structuredClone(primary);
    mutate(changed);
    assert.throws(() => assertCallerSecretContract(changed), mutationName);
  }
});

test('package and workflow authority expose no stale resume path', async () => {
  const packageJson=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(Object.hasOwn(packageJson.scripts,'pr-c-controlled-human:resume'),false);
  for(const workflowPath of [CHECKPOINT_WORKFLOW,EDGE_DEPLOY_WORKFLOW,PREPARE_WORKFLOW,QUIESCE_WORKFLOW,RECOVERY_WORKFLOW,VERIFY_WORKFLOW]) {
    const source=await readFile(workflowPath,'utf8');
    assert.doesNotMatch(source,/pr-c-controlled-human:resume|prCControlledHumanEnvironment[.]mjs resume|\bresume --authority\b/u);
  }
});
test('every reusable phase binds the protected public target digest into controller context',async()=>{
  for(const workflowPath of [CHECKPOINT_WORKFLOW,EDGE_DEPLOY_WORKFLOW,PREPARE_WORKFLOW,QUIESCE_WORKFLOW,RECOVERY_WORKFLOW,VERIFY_WORKFLOW]) {
    const {source,workflow}=await load(workflowPath);
    assert.equal(workflow.on.workflow_call.inputs.public_target_digest.required,true);
    const job=Object.values(workflow.jobs)[0];
    assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST,'${{ inputs.public_target_digest }}');
    assert.match(source,/PR_C_CONTROLLED_HUMAN_EXPECTED_PUBLIC_TARGET_DIGEST/u);
  }
});

test('every direct PostgreSQL workflow step immediately verifies the tracked pinned Supabase CA', async () => {
  for (const [workflowPath, expectedBindings] of DATABASE_TLS_GUARDS) {
    const { source, workflow } = await load(workflowPath);
    const jobs = Object.values(workflow.jobs);
    assert.equal(jobs.length, 1, `${workflowPath} must retain one auditable job`);
    const steps = jobs[0].steps;
    const actualVerifierSteps = steps.filter(step => step.run === PINNED_CA_VERIFY_COMMAND);
    assert.equal(actualVerifierSteps.length, expectedBindings.length, `${workflowPath} verifier count`);
    for (const [databaseStepName, verifierStepName] of expectedBindings) {
      const databaseIndex = steps.findIndex(step => step.name === databaseStepName);
      assert.ok(databaseIndex > 0, `${workflowPath}:${databaseStepName} must exist after a guard`);
      const verifier = steps[databaseIndex - 1];
      assert.equal(verifier.name, verifierStepName, `${workflowPath}:${databaseStepName} guard name`);
      assert.equal(verifier.run, PINNED_CA_VERIFY_COMMAND, `${workflowPath}:${databaseStepName} guard command`);
      assert.equal(verifier.env, undefined, `${workflowPath}:${databaseStepName} guard must not receive credentials`);
    }
    assert.doesNotMatch(source, /NODE_EXTRA_CA_CERTS|PGSSLROOTCERT|BEGIN (?:RSA )?PRIVATE KEY|BEGIN CERTIFICATE|sslmode=(?:disable|allow|prefer|require|verify-ca)|rejectUnauthorized\s*[:=]\s*false/iu);
    assert.doesNotMatch(source, /secrets\.[A-Z0-9_]*(?:CA|CERTIFICATE|SSLROOTCERT)/u);
  }
});
const assertProtectedEnvironmentSecrets = ({ source, workflow }, names) => {
  assert.equal(workflow.on.workflow_call.inputs.exercise_id, undefined);
  assert.deepEqual(sorted(Object.keys(workflow.on.workflow_call.secrets)), sorted(names));
  for (const name of names) assert.match(source, new RegExp(`secrets\\.${name}`, 'u'));
  assert.doesNotMatch(source, /secrets\.(?:database_url|exercise_id|supabase_url|supabase_access_token|supabase_project_ref|supabase_service_role_key|password_bundle_json|evidence_hmac_key)/u);
};

test('preparation is reusable from exact-head PR CI, action-pinned, and step-scopes protected values', async () => {
  const loaded=await load(PREPARE_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_PASSWORD_BUNDLE_JSON', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs.prepare;
  assert.equal(job.environment,'hosted-nonproduction-pilot'); assert.equal(job.env.PR_C_CONTROLLED_HUMAN_DEPLOY_ORIGIN,PREVIEW_ORIGIN);
  assert.match(source,/pull\.head\.sha !== process\.env\.EXPECTED_HEAD/u); assert.match(source,/artifact\.digest !== process\.env\.EXPECTED_ARTIFACT_DIGEST/u);
  assert.match(source,/run\.event !== 'pull_request'/u); assert.match(source,/output\/controlled-human\/verify\.json/u);
  const preparationIndex=job.steps.findIndex(step=>String(step.run??'').startsWith('node scripts/buildPrCControlledHumanPreparation.mjs '));
  const templateIndex=job.steps.findIndex(step=>String(step.run??'').startsWith('node scripts/writePrCControlledHumanObservationTemplates.mjs '));
  assert.ok(preparationIndex>=0&&templateIndex>preparationIndex);
  assert.equal(job.steps[templateIndex].run,'node scripts/writePrCControlledHumanObservationTemplates.mjs --preparation output/controlled-human/preparation.json --output-directory output/controlled-human/templates');
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_RELEASE_SHA,'${{ inputs.exact_head_sha }}');
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXERCISE_DIGEST,'${{ inputs.exercise_digest }}');
  assert.match(source,/recover-reset --reason abort/u);
  const abortVerifier=job.steps.find(step=>step.name==='Verify pinned Supabase CA for abort recovery');
  const abortRecovery=job.steps.find(step=>step.name==='Protected exact-bound abort recovery after failed seed or evidence assembly');
  assert.equal(abortVerifier.id,'verify_abort_recovery_ca');
  assert.equal(abortVerifier.if,"${{ failure() && steps.apply.outcome != 'skipped' }}");
  assert.equal(abortRecovery.if,"${{ failure() && steps.apply.outcome != 'skipped' && steps.verify_abort_recovery_ca.outcome == 'success' }}");
  const checkout=job.steps.find(step=>String(step.uses??'').startsWith('actions/checkout@')); assert.equal(checkout.with['persist-credentials'],false);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('Edge workflow retains provider baseline, provider receipt and runtime observation without claiming local equality', async () => {
  const loaded=await load(EDGE_DEPLOY_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_ACCESS_TOKEN', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs['deploy-exact-edge-source']; assert.equal(job.environment,'hosted-nonproduction-pilot');
  assert.match(source,/--provider-baseline output\/controlled-human\/provider-baseline\.json/u);
  assert.match(source,/provider-attested deployment and runtime manifest/u);
  assert.match(source,/pr-c-controlled-human-synthetic-generation/u);
  assert.doesNotMatch(source,/verified_exact_source|deployedSourceDigest/u);
  assert.match(source,/supabase\/setup-cli@3c2f5e2ae34c34e428e8e206e2c4d21fa2d20fbf/u);
  assert.doesNotMatch(source,/console\.(?:log|error)|response\.(?:text|arrayBuffer)\(/u);
});

test('checkpoint workflow binds immutable PR comments to application duties and backend observations', async () => {
  const loaded=await load(CHECKPOINT_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const job=workflow.jobs.capture; assert.equal(job.environment,'hosted-nonproduction-pilot');
  assert.match(source,/issues\.getComment/u); assert.match(source,/comment\.created_at !== comment\.updated_at/u);
  assert.match(source,/\$\{kind\} run identity mismatch/u); assert.match(source,/immutable \$\{kind\} artifact missing or ambiguous/u);
  assert.match(source,/comment\.user\?\.type !== 'User'/u); assert.match(source,/checkpoint-observe --request/u);
  assert.match(source,/serverBinding\?\.bindingToken \?\? null/u);
  assert.match(source,/quiesce_run_id/u); assert.match(source,/Validate the exact pre-comment read-only transition/u);
  assert.doesNotMatch(source,/prCControlledHumanEnvironment\.mjs quiesce/u);
  assert.match(source,/--quiesce .* --comment .* --observer /u); assert.match(source,/rmSync\('output\/controlled-human\/private'/u);
  assert.doesNotMatch(source,/OBSERVATIONS_JSON|GITHUB_ACTOR/u);
});

test('quiesce workflow enters server-enforced read-only before comments can attest that state', async () => {
  const loaded=await load(QUIESCE_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF']);
  const {source,workflow}=loaded; const job=workflow.jobs.quiesce; assert.equal(job.environment,'hosted-nonproduction-pilot');
  const active=job.steps.findIndex(step=>step.name==='Reverify exact preview and active synthetic state');
  const transition=job.steps.findIndex(step=>step.name==='Enter exact server-enforced read-only state before any read-only human observation');
  const upload=job.steps.findIndex(step=>String(step.uses??'').startsWith('actions/upload-artifact@'));
  assert.ok(active>=0 && active<transition && transition<upload);
  assert.match(source,/quiesce --authority output\/controlled-human\/current-verify\.json/u);
  assert.match(source,/pr264-controlled-human-quiesce-/u);
  assert.doesNotMatch(source,/issues\.(?:getComment|listComments)/u);
});

test('final verification validates signed evidence then deprovisions directly from frozen read-only state', async () => {
  const loaded=await load(VERIFY_WORKFLOW); assertReusable(loaded); assertPinned(loaded.source); assertNoJobSecrets(loaded.workflow);
  assertProtectedEnvironmentSecrets(loaded, ['PR_C_CONTROLLED_HUMAN_DATABASE_URL', 'PR_C_CONTROLLED_HUMAN_EXERCISE_ID', 'PR_C_CONTROLLED_HUMAN_SUPABASE_URL', 'PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY', 'PR_C_CONTROLLED_HUMAN_SUPABASE_PROJECT_REF', 'PR_C_CONTROLLED_HUMAN_EVIDENCE_HMAC_KEY']);
  const {source,workflow}=loaded; const steps=workflow.jobs.verify.steps;
  const immutableComments=steps.findIndex(step=>step.name==='Revalidate immutable human comments and exact signed observation bytes');
  const validate=steps.findIndex(step=>step.name==='Validate preparation and every signed human/server checkpoint before reset');
  const deprovision=steps.findIndex(step=>step.name==='Deprovision exact synthetic exercise directly from frozen read-only state');
  const post=steps.findIndex(step=>step.name==='Independently re-inspect post-deprovision state');
  const session=steps.findIndex(step=>step.name==='Build verified human session from recomputed evidence');
  assert.ok(immutableComments>=0 && immutableComments<validate && validate<deprovision && deprovision<post && post<session);
  assert.doesNotMatch(source,/\bresume\b/u); assert.match(source,/deprovision --authority .*quiesce\.json/u);
  assert.match(source,/post-deprovision-verify --authority .*deprovision\.json/u);
  assert.match(source,/--post-deprovision .*post-deprovision\.json/u);
  assert.match(source,/issues\.getComment/u); assert.match(source,/comment\.created_at !== comment\.updated_at/u);
  assert.match(source,/checkpoint\.signerDigest !== signerDigest/u); assert.match(source,/observation-bytes/u);
  assert.equal(workflow.permissions.issues, 'read');
  assert.doesNotMatch(source,/gh pr merge|git push|netlify deploy|supabase functions deploy/iu);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('manual recovery executes only trusted current PR code while prior exact-head authority remains data', async () => {
  const {source,workflow}=await load(RECOVERY_WORKFLOW);assertPinned(source);assertNoJobSecrets(workflow);
  assert.deepEqual(Object.keys(workflow.on),['workflow_call','workflow_dispatch']);
  for (const input of ['exact_head_sha','trusted_execution_sha','netlify_deploy_id','exercise_digest','target_fingerprint','public_target_digest','reason']) assert.equal(workflow.on.workflow_call.inputs[input].required,true);
  assert.equal(workflow.on.workflow_dispatch.inputs.public_target_digest.required,true);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.reason.options,['abort','expiry']);
  const job=workflow.jobs.recover;assert.equal(job.environment,'hosted-nonproduction-pilot');assert.equal(workflow.concurrency['cancel-in-progress'],false);
  assert.equal(job.env.PR_C_CONTROLLED_HUMAN_EXPECTED_EXERCISE_DIGEST,'${{ inputs.exercise_digest }}');
  assert.match(source,/pulls\.listCommits/u);assert.match(source,/head was not part of PR 264/u);assert.match(source,/untrusted PR source/u);assert.match(source,/unauthorized actor/u);
  assert.match(source,/pull\.head\.sha !== process\.env\.TRUSTED_EXECUTION_SHA/u);
  assert.match(source,/ref: \$\{\{ inputs\.trusted_execution_sha \}\}/u);assert.doesNotMatch(source,/ref: \$\{\{ inputs\.exact_head_sha \}\}/u);
  assert.match(source,/PR_C_CONTROLLED_HUMAN_TRUSTED_RECOVERY_SHA: \$\{\{ inputs\.trusted_execution_sha \}\}/u);assert.match(source,/PR_C_CONTROLLED_HUMAN_RECOVERY_MODE: trusted-current-pr-head/u);
  assert.match(source,/recover-reset --reason \$\{\{ inputs\.reason \}\}/u);assert.match(source,/pr_c_controlled_human_recovery_authorities/u);
  assert.match(source,/secrets\.PR_C_CONTROLLED_HUMAN_SUPABASE_SERVICE_ROLE_KEY/u);assert.doesNotMatch(source,/secrets:\s*inherit/u);
  assert.doesNotMatch(source,/https:\/\/(?:www\.)?avalaos\.com/iu);
});

test('primary PR C workflow exposes only exact trusted label phases and prior immutable producers', async () => {
  const { source, workflow } = await load('.github/workflows/transcript-flow-pr-c.yml');
  assertCallerSecretContract({ source, workflow });
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'labeled']);
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  for (const permission of ['actions', 'contents', 'issues', 'pull-requests']) assert.equal(workflow.permissions[permission], 'read');
  for (const label of ['pr264-controlled-human-edge', 'pr264-controlled-human-prepare', 'pr264-controlled-human-quiesce', 'pr264-controlled-human-checkpoints', 'pr264-controlled-human-final', 'pr264-controlled-human-abort', 'pr264-controlled-human-expiry']) assert.match(source, new RegExp(label, 'u'));
  assert.match(source, /github\.event\.action == 'labeled'/u);
  assert.match(source, /apreddy-autobotz/u);
  assert.match(source, /run\.id !== context\.runId/u);
  assert.match(source, /run\.status === 'completed'/u);
  assert.match(source, /run\.conclusion === 'success'/u);
  assert.match(source, /preview\.headers\.get\('x-avalaos-netlify-deploy-id'\)/u);
  assert.match(source, /new Set\(\[\.\.\.selected\.values\(\)\]/u);
  assert.match(source, /RECOVERY_HEAD_SHA/u);
  assert.match(source, /trusted-execution-sha/u);
  assert.match(source, /EXPECTED_PUBLIC_TARGET_DIGEST/u);
  assert.match(source, /pulls\.listCommits/u);
  assert.match(source, /phase === 'abort' \|\| phase === 'expiry'/u);
  assert.match(source, /trusted_execution_sha: \$\{\{ needs\.controlled_human_authority\.outputs\.trusted-execution-sha \}\}/u);
  assert.match(source, /needs: \[controlled_human_authority, controlled_human_requester\]/u);
  assert.match(source, /needs: \[controlled_human_authority, controlled_human_approver\]/u);
for (const called of [EDGE_DEPLOY_WORKFLOW, PREPARE_WORKFLOW, QUIESCE_WORKFLOW, CHECKPOINT_WORKFLOW, VERIFY_WORKFLOW, RECOVERY_WORKFLOW]) assert.match(source, new RegExp(`uses: \\.\\/${called.replaceAll('.', '\\.').replaceAll('/', '\\/')}`, 'u'));
  assert.doesNotMatch(source, /secrets:\s*inherit/u);
});
