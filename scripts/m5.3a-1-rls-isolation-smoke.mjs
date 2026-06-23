import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const contractPath = path.join(repoRoot, 'docs', 'schema', 'm5.3a_1_rls_membership_isolation_regression.sql');

const expectedScenarios = [
  'anonymous_denied',
  'authenticated_non_member_denied',
  'disabled_org_member_denied',
  'disabled_workspace_member_denied',
  'cross_org_organization_metadata_denied',
  'cross_org_membership_metadata_denied',
  'cross_workspace_membership_metadata_denied',
  'cross_workspace_role_metadata_denied',
  'system_role_visibility_denied',
  'service_role_not_browser_callable',
  'own_active_profile_readable',
  'own_active_org_membership_readable',
  'own_active_workspace_membership_readable',
  'active_org_metadata_readable',
  'active_workspace_metadata_readable',
  'scoped_role_metadata_readable',
];

const forbiddenEnvironmentTargetNames = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

const allowedLocalTargetTokens = new Set([
  'localhost',
  '127.0.0.1',
  'loopback',
  'docker',
  'docker-local',
]);

const contractForbiddenPatterns = [
  {
    id: 'helper-function-definition',
    regex: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i,
  },
  {
    id: 'rls-policy-definition',
    regex: /\bCREATE\s+POLICY\b/i,
  },
  {
    id: 'applied-schema-alteration',
    regex: /\bALTER\s+TABLE\b/i,
  },
  {
    id: 'rls-enablement',
    regex: /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
  },
  {
    id: 'durable-seed-insert',
    regex: /\bINSERT\s+INTO\s+(?:profiles|organizations|workspaces|roles|organization_members|workspace_memberships)\b/i,
  },
  {
    id: 'artifact-policy-scope',
    regex: /\b(?:assess_processes|assessments|assessment_review_events|projects|document_generations|delivery_work_items)\b/i,
  },
];

const parseArgs = (argv) => {
  const result = { localTarget: null, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
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
    result.unknownArg = true;
  }

  return result;
};

const hasEnvironmentName = (name) =>
  Object.prototype.hasOwnProperty.call(process.env, name);

const sanitizeTargetToken = (value) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9._:-]+$/.test(normalized)) return null;
  if (normalized.includes('://') || normalized.includes('@') || normalized.includes('/')) return null;
  return normalized;
};

const validateContract = () => {
  const failures = [];
  if (!fs.existsSync(contractPath)) {
    return {
      present: false,
      scenarioCount: 0,
      failures: ['contract-file-missing'],
    };
  }

  const contract = fs.readFileSync(contractPath, 'utf8');
  const executableContract = contract.replace(/--.*$/gm, '');
  for (const scenario of expectedScenarios) {
    if (!contract.includes(`'${scenario}'`)) {
      failures.push('scenario-contract-missing-entry');
      break;
    }
  }

  for (const pattern of contractForbiddenPatterns) {
    if (pattern.regex.test(executableContract)) {
      failures.push(pattern.id);
    }
  }

  return {
    present: true,
    scenarioCount: expectedScenarios.length,
    failures,
  };
};

const printHelp = () => {
  console.log('M5.3a-1 local RLS isolation harness');
  console.log('Usage: node scripts/m5.3a-1-rls-isolation-smoke.mjs --local-target <localhost|127.0.0.1|loopback|docker|docker-local>');
  console.log('Output is sanitized. The runner never prints target values or secret values.');
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const environmentTargetCount = forbiddenEnvironmentTargetNames.filter(hasEnvironmentName).length;
const contract = validateContract();
const targetToken = sanitizeTargetToken(args.localTarget);
const localTargetAccepted = targetToken !== null && allowedLocalTargetTokens.has(targetToken);

const failureClassifications = [];

if (args.unknownArg) {
  failureClassifications.push('unknown-argument');
}

if (!contract.present) {
  failureClassifications.push('contract-file-missing');
}

failureClassifications.push(...contract.failures);

if (environmentTargetCount > 0 && !localTargetAccepted) {
  failureClassifications.push('environment-target-variable-present-not-accepted');
}

if (!localTargetAccepted) {
  failureClassifications.push('local-target-proof-missing');
}

const uniqueFailureClassifications = [...new Set(failureClassifications)];
const blockedCount = localTargetAccepted && uniqueFailureClassifications.length === 0
  ? contract.scenarioCount
  : contract.scenarioCount;
const status = uniqueFailureClassifications.length === 0
  ? 'contract-ready-local-target-accepted'
  : 'failed-closed';

console.log('M5.3a-1 local RLS isolation harness');
console.log(`Local target gate: ${localTargetAccepted ? 'accepted' : 'blocked'}`);
console.log(`Environment target variable count: ${environmentTargetCount}`);
console.log(`Scenario contract present: ${contract.present ? 'yes' : 'no'}`);
console.log(`Scenarios declared: ${contract.scenarioCount}`);
console.log('Scenarios executed: 0');
console.log('Pass count: 0');
console.log('Fail count: 0');
console.log(`Blocked count: ${blockedCount}`);
console.log('Tenant isolation verified: no');
console.log(`Harness status: ${status}`);

if (uniqueFailureClassifications.length > 0) {
  console.log('Sanitized failure classifications:');
  for (const classification of uniqueFailureClassifications) {
    console.log(`- ${classification}`);
  }
  process.exitCode = 2;
} else {
  console.log('Sanitized failure classifications: none');
}
