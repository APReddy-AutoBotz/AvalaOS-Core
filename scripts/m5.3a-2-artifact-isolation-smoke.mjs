import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const assertionsPath = path.join(repoRoot, 'docs', 'schema', 'm5.3a_2_artifact_select_isolation_assertions.sql');

const expectedScenarios = [
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

const forbiddenEnvironmentTargetNames = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
];

const localHostByToken = new Map([
  ['localhost', 'localhost'],
  ['127.0.0.1', '127.0.0.1'],
  ['loopback', '127.0.0.1'],
]);

const sqlForbiddenPatterns = [
  {
    id: 'durable-transaction-commit',
    regex: /^\s*COMMIT\s*;?\s*$/im,
  },
  {
    id: 'rls-policy-definition',
    regex: /\bCREATE\s+POLICY\b/i,
  },
  {
    id: 'rls-policy-alteration',
    regex: /\bALTER\s+POLICY\b/i,
  },
  {
    id: 'rls-policy-drop',
    regex: /\bDROP\s+POLICY\b/i,
  },
  {
    id: 'durable-table-alteration',
    regex: /\bALTER\s+TABLE\b/i,
  },
  {
    id: 'durable-table-create',
    regex: /\bCREATE\s+(?!TEMP(?:ORARY)?\s+TABLE\b)[A-Z_]*\s*TABLE\b/i,
  },
  {
    id: 'durable-table-drop',
    regex: /\bDROP\s+TABLE\b/i,
  },
  {
    id: 'function-definition',
    regex: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i,
  },
  {
    id: 'extension-definition',
    regex: /\bCREATE\s+EXTENSION\b/i,
  },
  {
    id: 'provider-call-scope',
    regex: /\b(?:http_get|http_post|net\.|fetch\s*\(|provider_request)\b/i,
  },
  {
    id: 'secret-looking-sql-literal',
    regex: /https?:\/\/|postgres(?:ql)?:\/\/|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b|\b(?:Bearer|bearer)\s+[A-Za-z0-9._~+/=-]{16,}/i,
  },
  {
    id: 'session-authorization',
    regex: /\bSET\s+SESSION\s+AUTHORIZATION\b/i,
  },
  {
    id: 'mutation-update',
    regex: /\bUPDATE\b/i,
  },
  {
    id: 'mutation-delete',
    regex: /\bDELETE\b/i,
  },
  {
    id: 'mutation-truncate',
    regex: /\bTRUNCATE\b/i,
  },
  {
    id: 'mutation-copy',
    regex: /\bCOPY\b/i,
  },
  {
    id: 'procedural-do-block',
    regex: /^\s*DO\b/im,
  },
  {
    id: 'procedural-call',
    regex: /^\s*CALL\b/im,
  },
  {
    id: 'durable-schema-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+SCHEMA\b/i,
  },
  {
    id: 'durable-view-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+(?:MATERIALIZED\s+)?VIEW\b/i,
  },
  {
    id: 'durable-trigger-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+TRIGGER\b/i,
  },
  {
    id: 'durable-procedure-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?PROCEDURE\b/i,
  },
  {
    id: 'durable-role-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+ROLE\b/i,
  },
  {
    id: 'durable-user-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+USER\b/i,
  },
  {
    id: 'durable-database-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+DATABASE\b/i,
  },
  {
    id: 'durable-index-ddl',
    regex: /\b(?:CREATE|ALTER|DROP)\s+(?:UNIQUE\s+)?INDEX\b/i,
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

const splitSqlStatements = (sql) => sql
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

const normalizeSqlStatement = (statement) => statement.replace(/\s+/g, ' ').trim();

const isAllowedTempGrant = (statement) => {
  const normalized = normalizeSqlStatement(statement);
  return /^GRANT SELECT ON TABLE m5_3a_2_fixture_ids TO authenticated$/i.test(normalized)
    || /^GRANT INSERT, SELECT ON TABLE m5_3a_2_scenario_results TO authenticated$/i.test(normalized);
};

const isAllowedRoleStatement = (statement) => {
  const normalized = normalizeSqlStatement(statement);
  return /^SET LOCAL ROLE authenticated$/i.test(normalized)
    || /^RESET ROLE$/i.test(normalized);
};

const hasRoleOrSessionStatement = (statement) => /\b(?:SET(?:\s+LOCAL)?\s+ROLE|RESET\s+ROLE|SET\s+SESSION\s+AUTHORIZATION)\b/i.test(statement);

const hasServiceRoleBehavior = (statement) => /\b(?:service[_-]?role|service\s+role)\b/i.test(statement)
  && /\b(?:SET(?:\s+LOCAL)?\s+ROLE|SET\s+SESSION\s+AUTHORIZATION|GRANT|REVOKE|CREATE\s+ROLE|ALTER\s+ROLE|DROP\s+ROLE|CREATE\s+USER|ALTER\s+USER|DROP\s+USER)\b/i.test(statement);

const validateSqlFile = (sqlPath) => {
  const failures = [];
  if (!fs.existsSync(sqlPath)) {
    return {
      present: false,
      scenarioContractPresent: false,
      scenarioCount: 0,
      failures: ['assertion-file-missing'],
      sql: '',
    };
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const executableSql = stripSqlComments(sql);
  const scenarioContractPresent = expectedScenarios.every((scenario) => sql.includes(`'${scenario}'`));
  if (!scenarioContractPresent) failures.push('artifact-scenario-contract-incomplete');

  if (!/\bBEGIN\s*;/i.test(executableSql)) failures.push('transaction-begin-missing');
  if (!/\bROLLBACK\s*;/i.test(executableSql)) failures.push('transaction-rollback-missing');

  for (const pattern of sqlForbiddenPatterns) {
    if (pattern.regex.test(executableSql)) {
      failures.push(pattern.id);
    }
  }

  for (const statement of splitSqlStatements(executableSql)) {
    if (hasRoleOrSessionStatement(statement) && !isAllowedRoleStatement(statement)) {
      failures.push('unsafe-role-or-session-statement');
      break;
    }
  }

  for (const statement of splitSqlStatements(executableSql)) {
    if (hasServiceRoleBehavior(statement)) {
      failures.push('service-role-sql-behavior');
      break;
    }
  }

  for (const statement of splitSqlStatements(executableSql)) {
    if (/\b(?:GRANT|REVOKE)\b/i.test(statement) && !isAllowedTempGrant(statement)) {
      failures.push('durable-grant-or-revoke');
      break;
    }
  }

  return {
    present: true,
    scenarioContractPresent,
    scenarioCount: expectedScenarios.length,
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
  if (!localHostByToken.has(normalized)) {
    return { accepted: false, rejected: true, token: null };
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
    'M5.3a-2 local artifact SELECT isolation harness',
    'Usage: node scripts/m5.3a-2-artifact-isolation-smoke.mjs --local-target <local-token> [--local-port <port>] [--local-database <name>] [--local-user <name>]',
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
    const row = result.rows.find((candidate) => Object.prototype.hasOwnProperty.call(candidate, 'artifact_select_isolation_verified'));
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
    query_timeout: 10000,
    statement_timeout: 10000,
    application_name: 'm5_3a_2_local_artifact_assertion_harness',
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
        classifications: ['artifact-assertion-summary-missing'],
      };
    }

    return {
      executed: true,
      scenariosDeclared: toInteger(summary.scenarios_declared, expectedScenarios.length),
      scenariosExecuted: toInteger(summary.scenarios_executed),
      passCount: toInteger(summary.pass_count),
      failCount: toInteger(summary.fail_count),
      blockedCount: toInteger(summary.blocked_count),
      artifactSelectIsolationVerified: toBoolean(summary.artifact_select_isolation_verified),
      status: String(summary.harness_status || 'local-artifact-assertions-executed'),
      classifications: parseClassifications(summary.sanitized_classifications),
    };
  } catch {
    return {
      executed: false,
      classifications: [connected ? 'local-artifact-assertion-execution-failed' : 'local-db-connection-unavailable'],
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
    console.log('M5.3a-2 local artifact SELECT isolation harness');
    console.log('Output sanitization: failed');
    console.log('Artifact SELECT isolation verified: no');
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
const assertions = validateSqlFile(assertionsPath);
const target = sanitizeTargetToken(args.localTarget);
const port = validatePort(args.localPort);
const localDatabaseValid = validateIdentifier(args.localDatabase);
const localUserValid = validateIdentifier(args.localUser);

const failureClassifications = [];
if (args.unknownArgs.length > 0) failureClassifications.push('unknown-argument');
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
const artifactSelectIsolationVerified = Boolean(dbResult?.artifactSelectIsolationVerified);
const localDbExecutionStatus = dbResult?.executed ? 'executed' : 'blocked';
const status = uniqueFailureClassifications.length === 0
  ? (dbResult?.status || 'local-artifact-assertions-executed')
  : 'failed-closed';

const outputLines = [
  'M5.3a-2 local artifact SELECT isolation harness',
  `Artifact scenario contract present: ${assertions.scenarioContractPresent ? 'yes' : 'no'}`,
  `Assertion SQL present: ${assertions.present ? 'yes' : 'no'}`,
  `Local target gate: ${target.accepted ? 'accepted' : target.rejected ? 'rejected' : 'blocked'}`,
  `Local DB assertion execution: ${localDbExecutionStatus}`,
  `Scenarios declared: ${scenariosDeclared}`,
  `Scenarios executed: ${scenariosExecuted}`,
  `Pass count: ${passCount}`,
  `Fail count: ${failCount}`,
  `Blocked count: ${blockedCount}`,
  `Artifact SELECT isolation verified: ${artifactSelectIsolationVerified ? 'yes' : 'no'}`,
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
