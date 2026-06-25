import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const allowedArgs = new Set(['--static', '--help', '-h']);

const forbiddenOutputPatterns = [
  /https?:\/\//i,
  /postgres(?:ql)?:\/\//i,
  /\b[a-z0-9]{18,}\.supabase\.co\b/i,
  /\b(?:container|image)\s+id\b/i,
  /\b(?:host|port|database|user)\s*(?:name|value)?\s*[:=]/i,
  /\b(?:db\s*url|database_url)\b/i,
  /\b(?:project\s*ref|project_ref)\b/i,
  /\b(?:service[_ -]?role|provider[_ -]?key|private[_ -]?token)\b/i,
  /\b(?:bearer|jwt)\b/i,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /[A-Za-z]:[\\/]/,
  /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\//,
];

const parseArgs = (argv) => {
  const result = {
    help: false,
    staticMode: false,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--static') {
      result.staticMode = true;
      continue;
    }
    if (!allowedArgs.has(arg)) {
      result.unknownArgs.push(arg);
    }
  }

  return result;
};

const commandAvailability = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    stdio: 'ignore',
    timeout: 5000,
    windowsHide: true,
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') return { status: 'no', unsafe: false };
    return { status: 'unknown', unsafe: true };
  }

  if (result.status === 0) return { status: 'yes', unsafe: false };
  return { status: 'unknown', unsafe: true };
};

const localConfigPresence = () => {
  try {
    return fs.existsSync(path.join(repoRoot, 'supabase', 'config.toml')) ? 'present' : 'missing';
  } catch {
    return 'unknown';
  }
};

const combineReadiness = ({ dockerAvailability, supabaseAvailability, configPresence, outputSafety }) => {
  if (outputSafety !== 'passed') return 'unknown';
  if (dockerAvailability === 'unknown' || supabaseAvailability === 'unknown' || configPresence === 'unknown') {
    return 'unknown';
  }
  if (dockerAvailability === 'yes' && supabaseAvailability === 'yes' && configPresence === 'present') {
    return 'ready';
  }
  return 'blocked';
};

const isOutputSafe = (lines) => lines.every(
  (line) => forbiddenOutputPatterns.every((pattern) => !pattern.test(line)),
);

function emit(lines, exitCode) {
  if (!isOutputSafe(lines)) {
    console.log('M5.3a-2h local stack availability diagnostics');
    console.log('Diagnostic output safety: failed');
    console.log('Remediation readiness: unknown');
    console.log('Artifact SELECT isolation verified: no');
    console.log('Tenant isolation verified: no');
    console.log('Sanitized failure classifications:');
    console.log('- diagnostic-output-safety-failed');
    process.exit(exitCode === 0 ? 2 : exitCode);
  }

  for (const line of lines) {
    console.log(line);
  }
  process.exit(exitCode);
}

const printHelp = () => {
  emit([
    'M5.3a-2h local stack availability diagnostics',
    'Usage: node scripts/m5.3a-2h-local-stack-availability-diagnostics.mjs --static',
    'Output uses sanitized category values only.',
  ], 0);
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
}

const failureClassifications = [];
if (args.unknownArgs.length > 0) {
  failureClassifications.push('unknown-argument');
}

const docker = commandAvailability('docker', ['--version']);
const supabase = commandAvailability('supabase', ['--version']);
const configPresence = localConfigPresence();

if (docker.unsafe) failureClassifications.push('docker-availability-unknown');
if (supabase.unsafe) failureClassifications.push('supabase-cli-availability-unknown');
if (configPresence === 'unknown') failureClassifications.push('local-config-presence-unknown');

const diagnosticOutputSafety = failureClassifications.includes('unknown-argument') ? 'failed' : 'passed';
if (diagnosticOutputSafety !== 'passed') {
  failureClassifications.push('diagnostic-output-safety-failed');
}

const localStackStartupReadiness = combineReadiness({
  dockerAvailability: docker.status,
  supabaseAvailability: supabase.status,
  configPresence,
  outputSafety: diagnosticOutputSafety,
});

const remediationReadiness = localStackStartupReadiness;
const uniqueFailureClassifications = [...new Set(failureClassifications)];

const outputLines = [
  'M5.3a-2h local stack availability diagnostics',
  `Mode: ${args.staticMode ? 'static-no-db' : 'static-no-db'}`,
  `Docker availability: ${docker.status}`,
  `Supabase CLI availability: ${supabase.status}`,
  `Local config presence: ${configPresence}`,
  `Local stack startup readiness: ${localStackStartupReadiness}`,
  `Diagnostic output safety: ${diagnosticOutputSafety}`,
  `Remediation readiness: ${remediationReadiness}`,
  'Supabase stack command: not-run',
  'DB command: not-run',
  'DB connection: not-made',
  'Schema bootstrap execution: not-run',
  'Schema readiness check: not-run',
  'RLS harness execution: not-run',
  'Artifact assertion execution: not-run',
  'Docker container listing: not-run',
  'Docker image listing: not-run',
  'Docker port listing: not-run',
  'Remote Supabase validation: not-run',
  'Provider call: not-run',
  'Artifact SELECT isolation verified: no',
  'Tenant isolation verified: no',
  'Local DB availability resolved: no',
  'Schema availability proven: no',
  'Hosted-pilot readiness claimed: no',
  'Production readiness claimed: no',
  'Root cause inferred: no',
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
