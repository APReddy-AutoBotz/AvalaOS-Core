import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const requiredFiles = [
  'docs/planning/m5.3a-2c-local-db-availability-and-schema-bootstrap-plan.md',
  'docs/quality/m5.3a-2c-local-db-availability-and-schema-bootstrap-planning-evidence.md',
  'docs/quality/m5.3a-2c-local-db-availability-and-schema-bootstrap-plan-post-merge-verification.md',
  'scripts/m5.3a-1-rls-isolation-smoke.mjs',
  'scripts/m5.3a-2-artifact-isolation-smoke.mjs',
  'docs/schema/m5.3a_1_rls_membership_isolation_assertions.sql',
  'docs/schema/m5.3a_2_artifact_select_isolation_assertions.sql',
  'supabase/migrations/20260607153000_m5_3a_1_rls_helpers_membership_select_policies.sql',
  'supabase/migrations/20260607153500_m5_3a_2_artifact_select_policies.sql',
  'package.json',
];

const artifactScenarios = [
  'active_member_reads_assess_processes',
  'active_member_reads_assessments',
  'active_member_reads_review_events',
  'active_member_reads_projects',
  'active_member_reads_document_generations',
  'active_member_reads_delivery_work_items',
  'cross_org_artifacts_denied',
  'cross_workspace_artifacts_denied',
  'anonymous_artifacts_denied',
  'authenticated_non_member_artifacts_denied',
  'disabled_org_member_artifacts_denied',
  'disabled_workspace_member_artifacts_denied',
  'nullable_workspace_artifacts_denied',
  'deleted_artifacts_denied',
  'cross_workspace_parent_source_denied',
  'json_payloads_and_lineage_do_not_grant_access',
  'nullable_org_policy_guardrails_present',
  'orphan_parent_policy_guardrails_present',
];

const localTargetTokens = new Set([
  'localhost',
  '127.0.0.1',
  'loopback',
  'docker',
  'docker-local',
]);

const outputForbiddenPatterns = [
  /https?:\/\//i,
  /postgres(?:ql)?:\/\//i,
  /\b[a-z0-9]{18,}\.supabase\.co\b/i,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/=-]{16,}/,
  /\b(?:service[_ -]?role|provider[_ -]?key|private[_ -]?token)\b/i,
];

const readText = (repoRelativePath) => fs.readFileSync(path.join(repoRoot, repoRelativePath), 'utf8');
const exists = (repoRelativePath) => fs.existsSync(path.join(repoRoot, repoRelativePath));

const parseArgs = (argv) => {
  const result = {
    help: false,
    staticMode: false,
    requireTargetProof: false,
    localTarget: null,
    unknownArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--static') {
      result.staticMode = true;
      continue;
    }
    if (arg === '--require-target-proof') {
      result.requireTargetProof = true;
      continue;
    }
    if (arg === '--local-target') {
      result.localTarget = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--local-target=')) {
      result.localTarget = arg.slice('--local-target='.length);
      continue;
    }
    result.unknownArgs.push(arg);
  }

  return result;
};

const classifyLocalTarget = (value) => {
  if (!value) return { gate: 'blocked', classification: null };
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('://') || normalized.includes('@') || normalized.includes('/')) {
    return { gate: 'rejected', classification: 'local-target-rejected' };
  }
  if (!/^[a-z0-9._:-]+$/.test(normalized)) {
    return { gate: 'rejected', classification: 'local-target-rejected' };
  }
  if (!localTargetTokens.has(normalized)) {
    return { gate: 'rejected', classification: 'local-target-rejected' };
  }
  return { gate: 'accepted', classification: null };
};

const addCheck = (checks, id, passed, failureClassification) => {
  checks.push({ id, passed: Boolean(passed), failureClassification });
};

const validatePackageScripts = (checks) => {
  const packageJson = JSON.parse(readText('package.json'));
  const scripts = packageJson.scripts || {};

  addCheck(
    checks,
    'm5.3a-1-harness-script-present',
    scripts['test:rls:m5.3a-1'] === 'node scripts/m5.3a-1-rls-isolation-smoke.mjs',
    'm5-3a-1-harness-package-script-missing',
  );
  addCheck(
    checks,
    'm5.3a-2-harness-script-present',
    scripts['test:rls:m5.3a-2'] === 'node scripts/m5.3a-2-artifact-isolation-smoke.mjs',
    'm5-3a-2-harness-package-script-missing',
  );
};

const validateHarnessSource = (checks) => {
  const artifactHarness = readText('scripts/m5.3a-2-artifact-isolation-smoke.mjs');
  const membershipHarness = readText('scripts/m5.3a-1-rls-isolation-smoke.mjs');

  addCheck(checks, 'artifact-harness-local-target-proof', artifactHarness.includes('sanitizeTargetToken'), 'artifact-harness-target-proof-missing');
  addCheck(checks, 'artifact-harness-output-sanitization', artifactHarness.includes('outputForbiddenPatterns'), 'artifact-harness-output-sanitization-missing');
  addCheck(checks, 'artifact-harness-no-env-fallback', artifactHarness.includes('environment-target-variable-present-not-accepted'), 'artifact-harness-env-fallback-guard-missing');
  addCheck(checks, 'artifact-harness-remote-rejection', artifactHarness.includes('local-target-rejected'), 'artifact-harness-remote-rejection-missing');
  addCheck(checks, 'artifact-harness-db-unavailable-classification', artifactHarness.includes('local-db-connection-unavailable'), 'artifact-harness-db-unavailable-classification-missing');

  addCheck(checks, 'membership-harness-local-target-proof', membershipHarness.includes('sanitizeTargetToken'), 'membership-harness-target-proof-missing');
  addCheck(checks, 'membership-harness-output-sanitization', membershipHarness.includes('outputForbiddenPatterns'), 'membership-harness-output-sanitization-missing');
  addCheck(checks, 'membership-harness-no-env-fallback', membershipHarness.includes('environment-target-variable-present-not-accepted'), 'membership-harness-env-fallback-guard-missing');
};

const validateAssertions = (checks) => {
  const artifactAssertions = readText('docs/schema/m5.3a_2_artifact_select_isolation_assertions.sql');

  addCheck(checks, 'artifact-assertion-begin-present', /\bBEGIN\s*;/i.test(artifactAssertions), 'artifact-assertion-begin-missing');
  addCheck(checks, 'artifact-assertion-rollback-present', /\bROLLBACK\s*;/i.test(artifactAssertions), 'artifact-assertion-rollback-missing');
  addCheck(checks, 'artifact-assertion-no-commit', !/(^|;)\s*COMMIT\b/im.test(artifactAssertions), 'artifact-assertion-commit-present');
  addCheck(checks, 'artifact-assertion-scenario-count', artifactScenarios.every((scenario) => artifactAssertions.includes(`'${scenario}'`)), 'artifact-assertion-scenario-contract-incomplete');
  addCheck(checks, 'artifact-assertion-no-policy-definition', !/\bCREATE\s+POLICY\b/i.test(artifactAssertions), 'artifact-assertion-policy-definition-present');
  addCheck(checks, 'artifact-assertion-no-helper-definition', !/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(artifactAssertions), 'artifact-assertion-helper-definition-present');
};

const validateMigrationPrerequisites = (checks) => {
  const membershipPolicies = readText('supabase/migrations/20260607153000_m5_3a_1_rls_helpers_membership_select_policies.sql');
  const artifactPolicies = readText('supabase/migrations/20260607153500_m5_3a_2_artifact_select_policies.sql');

  addCheck(checks, 'membership-org-helper-present', membershipPolicies.includes('public.is_active_org_member(p_org_id uuid)'), 'membership-org-helper-missing');
  addCheck(checks, 'membership-workspace-helper-present', membershipPolicies.includes('public.is_active_workspace_member(p_workspace_id uuid, p_org_id uuid)'), 'membership-workspace-helper-missing');
  addCheck(checks, 'membership-select-policies-present', (membershipPolicies.match(/CREATE POLICY m5_3a_1_/g) || []).length === 6, 'membership-select-policy-count-mismatch');
  addCheck(checks, 'artifact-select-policies-present', (artifactPolicies.match(/CREATE POLICY m5_3a_2_/g) || []).length === 6, 'artifact-select-policy-count-mismatch');
  addCheck(checks, 'artifact-policies-select-only', !/\bFOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(artifactPolicies), 'artifact-policy-nonselect-scope-present');
  addCheck(checks, 'artifact-workspace-helper-used', (artifactPolicies.match(/is_active_workspace_member/g) || []).length >= 6, 'artifact-policy-workspace-helper-missing');
};

const printHelp = () => {
  emit([
    'M5.3a-2d local DB bootstrap readiness preflight',
    'Usage: node scripts/m5.3a-2d-local-db-bootstrap-readiness.mjs --static',
    'Optional: add target proof flags only for sanitized classification; this tool never opens a DB connection.',
    'Output is counts-only and never prints target, payload, claim, DB URL, or secret values.',
  ], 0);
};

const isOutputSafe = (lines) => lines.every((line) => outputForbiddenPatterns.every((pattern) => !pattern.test(line)));

function emit(lines, exitCode) {
  if (!isOutputSafe(lines)) {
    console.log('M5.3a-2d local DB bootstrap readiness preflight');
    console.log('Output sanitization: failed');
    console.log('Artifact SELECT isolation verified: no');
    console.log('Tenant isolation verified: no');
    console.log('Sanitized failure classifications:');
    console.log('- output-sanitization-failed');
    process.exit(exitCode === 0 ? 2 : exitCode);
  }

  for (const line of lines) {
    console.log(line);
  }
  process.exit(exitCode);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
}

const checks = [];
const missingFiles = [];

for (const requiredFile of requiredFiles) {
  const present = exists(requiredFile);
  if (!present) missingFiles.push(requiredFile);
  addCheck(checks, `required-file:${requiredFile}`, present, 'required-file-missing');
}

if (missingFiles.length === 0) {
  validatePackageScripts(checks);
  validateHarnessSource(checks);
  validateAssertions(checks);
  validateMigrationPrerequisites(checks);
}

const target = classifyLocalTarget(args.localTarget);
const failureClassifications = [];
if (args.unknownArgs.length > 0) failureClassifications.push('unknown-argument');
if (args.requireTargetProof && target.gate !== 'accepted') failureClassifications.push('local-target-proof-missing');
if (target.classification) failureClassifications.push(target.classification);
for (const check of checks) {
  if (!check.passed) failureClassifications.push(check.failureClassification);
}

const uniqueFailureClassifications = [...new Set(failureClassifications)];
const passedCount = checks.filter((check) => check.passed).length;
const failedCount = checks.length - passedCount;
const status = uniqueFailureClassifications.length === 0
  ? 'static-readiness-passed'
  : 'failed-closed';

const outputLines = [
  'M5.3a-2d local DB bootstrap readiness preflight',
  `Mode: ${args.staticMode ? 'static-no-db' : 'static-no-db'}`,
  `Local target gate: ${target.gate}`,
  'Local DB action: not-attempted',
  'Schema bootstrap execution: not-attempted',
  'Execution path added: no',
  'Package script added: no',
  `Required tracked files checked: ${requiredFiles.length}`,
  `Required tracked files present: ${requiredFiles.length - missingFiles.length}`,
  `Static checks passed: ${passedCount}`,
  `Static checks failed: ${failedCount}`,
  `Artifact scenarios expected: ${artifactScenarios.length}`,
  'Artifact SELECT isolation verified: no',
  'Tenant isolation verified: no',
  'Local DB availability resolved: no',
  'Schema availability proven: no',
  `Readiness status: ${status}`,
];

if (uniqueFailureClassifications.length > 0) {
  outputLines.push('Sanitized failure classifications:');
  for (const classification of uniqueFailureClassifications) {
    outputLines.push(`- ${classification}`);
  }
  emit(outputLines, 2);
}

outputLines.push('Sanitized failure classifications: none');
emit(outputLines, 0);
