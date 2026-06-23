import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const contractPath = path.join(repoRoot, 'docs', 'schema', 'm5.3a_1_rls_membership_isolation_regression.sql');
const assertionsPath = path.join(repoRoot, 'docs', 'schema', 'm5.3a_1_rls_membership_isolation_assertions.sql');

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

const localHostByToken = new Map([
  ['localhost', 'localhost'],
  ['127.0.0.1', '127.0.0.1'],
  ['loopback', '127.0.0.1'],
]);

const sqlForbiddenPatterns = [
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
    id: 'durable-table-create',
    regex: /\bCREATE\s+TABLE\b/i,
  },
  {
    id: 'durable-transaction-commit',
    regex: /(?:^|;)\s*COMMIT\b/im,
  },
  {
    id: 'artifact-policy-scope',
    regex: /\b(?:assess_processes|assessments|assessment_review_events|projects|document_generations|delivery_work_items)\b/i,
  },
  {
    id: 'mutation-policy-check',
    regex: /\b(?:UPDATE|DELETE)\s+(?:FROM\s+)?(?:profiles|organizations|workspaces|roles|organization_members|workspace_memberships)\b/i,
  },
];

const outputForbiddenPatterns = [
  /https?:\/\//i,
  /postgres(?:ql)?:\/\//i,
  /\b[a-z0-9]{18,}\.supabase\.co\b/i,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/=-]{16,}/,
  /\b(?:service[_ -]?role|provider[_ -]?key|private[_ -]?token)\b/i,
];

const parseArgs = (argv) => {
  const result = {
    help: false,
    localTarget: null,
    localPort: null,
    localDatabase: 'postgres',
    localUser: 'postgres',
    unknownArgs: [],
  };

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
    if (arg === '--local-port') {
      result.localPort = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--local-port=')) {
      result.localPort = arg.slice('--local-port='.length);
      continue;
    }
    if (arg === '--local-database') {
      result.localDatabase = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--local-database=')) {
      result.localDatabase = arg.slice('--local-database='.length);
      continue;
    }
    if (arg === '--local-user') {
      result.localUser = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg.startsWith('--local-user=')) {
      result.localUser = arg.slice('--local-user='.length);
      continue;
    }
    result.unknownArgs.push(arg);
  }

  return result;
};

const hasEnvironmentName = (name) => Object.prototype.hasOwnProperty.call(process.env, name);

const stripSqlComments = (sql) => sql
  .replace(/--.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const validateSqlFile = (sqlPath, { requireScenarios = false } = {}) => {
  const failures = [];
  if (!fs.existsSync(sqlPath)) {
    return {
      present: false,
      scenarioCount: 0,
      failures: ['assertion-file-missing'],
      sql: '',
    };
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const executableSql = stripSqlComments(sql);

  if (requireScenarios) {
    for (const scenario of expectedScenarios) {
      if (!sql.includes(`'${scenario}'`)) {
        failures.push('scenario-contract-missing-entry');
        break;
      }
    }
  }

  for (const pattern of sqlForbiddenPatterns) {
    if (pattern.regex.test(executableSql)) {
      failures.push(pattern.id);
    }
  }

  return {
    present: true,
    scenarioCount: requireScenarios ? expectedScenarios.length : 0,
    failures,
    sql,
  };
};

const sanitizeTargetToken = (value) => {
  if (!value) return { accepted: false, rejected: false, token: null };
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('://') || normalized.includes('@') || normalized.includes('/')) {
    return { accepted: false, rejected: true, token: null };
  }
  if (!/^[a-z0-9._:-]+$/.test(normalized)) {
    return { accepted: false, rejected: true, token: null };
  }
  if (!allowedLocalTargetTokens.has(normalized)) {
    return { accepted: false, rejected: true, token: normalized };
  }
  return { accepted: true, rejected: false, token: normalized };
};

const validatePort = (value) => {
  if (value === null || value === undefined || value === '') return { valid: true, port: 54322 };
  if (!/^\d{1,5}$/.test(value)) return { valid: false, port: null };
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { valid: false, port: null };
  return { valid: true, port };
};

const validateIdentifier = (value) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value || '');

const printHelp = () => {
  const lines = [
    'M5.3a-1 local RLS isolation harness',
    'Usage: node scripts/m5.3a-1-rls-isolation-smoke.mjs --local-target <local-token> [--local-port <port>] [--local-database <name>] [--local-user <name>]',
    'The runner requires explicit local target proof before DB action.',
    'Output is sanitized. The runner never prints target values, row payloads, claims, or secret values.',
  ];
  emit(lines, 0);
};

const toInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value) => value === true || value === 'true' || value === 't' || value === '1';

const parseClassifications = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const findSummaryRow = (queryResult) => {
  const results = Array.isArray(queryResult) ? queryResult : [queryResult];
  for (const result of results.toReversed()) {
    if (!Array.isArray(result.rows)) continue;
    const row = result.rows.find((candidate) => Object.prototype.hasOwnProperty.call(candidate, 'scenarios_declared'));
    if (row) return row;
  }
  return null;
};

const runAssertions = async ({ targetToken, port, database, user, sql }) => {
  const host = localHostByToken.get(targetToken);
  if (!host) {
    return {
      executed: false,
      classifications: ['local-target-accepted-but-not-connectable'],
    };
  }

  const client = new Client({
    host,
    port,
    database,
    user,
    password: 'postgres',
    connectionTimeoutMillis: 1200,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'm5_3a_1_local_assertion_harness',
  });

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const queryResult = await client.query(sql);
    const summary = findSummaryRow(queryResult);
    if (!summary) {
      return {
        executed: true,
        classifications: ['assertion-summary-missing'],
      };
    }

    return {
      executed: true,
      scenariosDeclared: toInteger(summary.scenarios_declared, expectedScenarios.length),
      scenariosExecuted: toInteger(summary.scenarios_executed),
      passCount: toInteger(summary.pass_count),
      failCount: toInteger(summary.fail_count),
      blockedCount: toInteger(summary.blocked_count),
      tenantIsolationVerified: toBoolean(summary.tenant_isolation_verified),
      status: String(summary.harness_status || 'local-db-assertions-executed'),
      classifications: parseClassifications(summary.sanitized_classifications),
    };
  } catch {
    return {
      executed: false,
      classifications: [connected ? 'local-db-assertion-execution-failed' : 'local-db-connection-unavailable'],
    };
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch {
        return {
          executed: false,
          classifications: ['local-db-cleanup-failed'],
        };
      }
    }
  }
};

const isOutputSafe = (lines) => lines.every((line) => outputForbiddenPatterns.every((pattern) => !pattern.test(line)));

function emit(lines, exitCode) {
  if (!isOutputSafe(lines)) {
    console.log('M5.3a-1 local RLS isolation harness');
    console.log('Output sanitization: failed');
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

const environmentTargetCount = forbiddenEnvironmentTargetNames.filter(hasEnvironmentName).length;
const contract = validateSqlFile(contractPath, { requireScenarios: true });
const assertions = validateSqlFile(assertionsPath, { requireScenarios: true });
const target = sanitizeTargetToken(args.localTarget);
const port = validatePort(args.localPort);
const localDatabaseValid = validateIdentifier(args.localDatabase);
const localUserValid = validateIdentifier(args.localUser);

const failureClassifications = [];
if (args.unknownArgs.length > 0) failureClassifications.push('unknown-argument');
if (!contract.present) failureClassifications.push('contract-file-missing');
failureClassifications.push(...contract.failures);
if (!assertions.present) failureClassifications.push('assertion-file-missing');
failureClassifications.push(...assertions.failures);
if (target.rejected) failureClassifications.push('local-target-rejected');
if (!target.accepted) failureClassifications.push('local-target-proof-missing');
if (!port.valid) failureClassifications.push('invalid-local-port');
if (!localDatabaseValid) failureClassifications.push('invalid-local-database');
if (!localUserValid) failureClassifications.push('invalid-local-user');
if (environmentTargetCount > 0 && !target.accepted) {
  failureClassifications.push('environment-target-variable-present-not-accepted');
}

const canAttemptDb = failureClassifications.length === 0
  && target.accepted
  && assertions.present
  && assertions.failures.length === 0
  && port.valid
  && localDatabaseValid
  && localUserValid;

let dbResult = null;
if (canAttemptDb) {
  dbResult = await runAssertions({
    targetToken: target.token,
    port: port.port,
    database: args.localDatabase,
    user: args.localUser,
    sql: assertions.sql,
  });
  failureClassifications.push(...(dbResult.classifications || []));
}

const uniqueFailureClassifications = [...new Set(failureClassifications)];
const scenariosDeclared = dbResult?.scenariosDeclared ?? expectedScenarios.length;
const scenariosExecuted = dbResult?.scenariosExecuted ?? 0;
const passCount = dbResult?.passCount ?? 0;
const failCount = dbResult?.failCount ?? 0;
const blockedCount = dbResult?.blockedCount ?? (scenariosDeclared - scenariosExecuted);
const tenantIsolationVerified = Boolean(dbResult?.tenantIsolationVerified);
const localDbExecutionStatus = dbResult?.executed ? 'executed' : 'blocked';
const status = uniqueFailureClassifications.length === 0
  ? (dbResult?.status || 'local-db-assertions-executed')
  : 'failed-closed';

const outputLines = [
  'M5.3a-1 local RLS isolation harness',
  `Local target gate: ${target.accepted ? 'accepted' : target.rejected ? 'rejected' : 'blocked'}`,
  `Local DB assertion execution: ${localDbExecutionStatus}`,
  `Environment target variable count: ${environmentTargetCount}`,
  `Scenario contract present: ${contract.present ? 'yes' : 'no'}`,
  `Assertion contract present: ${assertions.present ? 'yes' : 'no'}`,
  `Scenarios declared: ${scenariosDeclared}`,
  `Scenarios executed: ${scenariosExecuted}`,
  `Pass count: ${passCount}`,
  `Fail count: ${failCount}`,
  `Blocked count: ${blockedCount}`,
  `Tenant isolation verified: ${tenantIsolationVerified ? 'yes' : 'no'}`,
  `Harness status: ${status}`,
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
