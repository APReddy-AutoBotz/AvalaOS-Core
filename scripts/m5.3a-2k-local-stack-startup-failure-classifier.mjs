import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const scratchDir = path.join(repoRoot, '.agent', 'm5.3a-2k-local-stack-startup-classifier');
const scratchFile = path.join(scratchDir, 'supabase-start.raw.log');

const allowedArgs = new Set(['--classify', '--help']);
const allowedClassifications = new Set([
  'docker-command-unavailable',
  'docker-daemon-unavailable',
  'docker-permission-blocked',
  'supabase-cli-unavailable',
  'local-config-missing',
  'local-config-invalid',
  'port-conflict-suspected',
  'image-pull-or-network-blocked',
  'container-startup-blocked',
  'resource-limit-or-disk-blocked',
  'unknown-local-startup-failure',
  'classification-output-safety-failed',
]);

const outputForbiddenPatterns = [
  /https?:\/\//i,
  /postgres(?:ql)?:\/\//i,
  /\b[a-z0-9]{18,}\.supabase\.co\b/i,
  /\b(?:container|image)\s+id\b/i,
  /\b(?:host|port|database|user)\s*(?:name|value)?\s*[:=]/i,
  /\b(?:db\s*url|database_url)\b/i,
  /\b(?:project\s*ref|project_ref)\b/i,
  /\b(?:service[_ -]?role|anon\s+key|jwt\s+secret|provider[_ -]?key|private[_ -]?token)\b/i,
  /\b(?:bearer|jwt)\b/i,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /[A-Za-z]:[\\/]/,
  /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\//,
  /\b[0-9a-f]{12,64}\b/i,
];

const classifyPatterns = [
  {
    classification: 'docker-command-unavailable',
    confidence: 'high',
    patterns: [
      /docker(?:\.exe)?:?\s*(?:command\s+)?not\s+found/i,
      /'docker'\s+is\s+not\s+recognized/i,
      /spawn\s+docker\s+enoent/i,
    ],
  },
  {
    classification: 'docker-daemon-unavailable',
    confidence: 'high',
    patterns: [
      /cannot\s+connect\s+to\s+the\s+docker\s+daemon/i,
      /is\s+the\s+docker\s+daemon\s+running/i,
      /docker\s+daemon\s+is\s+not\s+running/i,
      /error\s+during\s+connect/i,
      /open\s+.*docker.*pipe/i,
    ],
  },
  {
    classification: 'docker-permission-blocked',
    confidence: 'high',
    patterns: [
      /permission\s+denied/i,
      /access\s+is\s+denied/i,
      /requires\s+elevated\s+privileges/i,
      /not\s+authorized/i,
    ],
  },
  {
    classification: 'local-config-invalid',
    confidence: 'high',
    patterns: [
      /invalid\s+config/i,
      /failed\s+to\s+parse\s+config/i,
      /error\s+parsing\s+config/i,
      /config.*(?:invalid|malformed)/i,
    ],
  },
  {
    classification: 'port-conflict-suspected',
    confidence: 'medium',
    patterns: [
      /address\s+already\s+in\s+use/i,
      /bind.*(?:failed|address)/i,
      /port.*(?:already\s+allocated|already\s+in\s+use|is\s+in\s+use)/i,
      /listen\s+tcp.*address/i,
    ],
  },
  {
    classification: 'image-pull-or-network-blocked',
    confidence: 'medium',
    patterns: [
      /failed\s+to\s+pull/i,
      /pull\s+access\s+denied/i,
      /manifest\s+unknown/i,
      /network\s+(?:is\s+)?(?:unreachable|timeout|timed\s+out)/i,
      /i\/o\s+timeout/i,
      /temporary\s+failure\s+in\s+name\s+resolution/i,
      /tls\s+handshake\s+timeout/i,
      /no\s+such\s+host/i,
    ],
  },
  {
    classification: 'resource-limit-or-disk-blocked',
    confidence: 'medium',
    patterns: [
      /no\s+space\s+left\s+on\s+device/i,
      /disk\s+(?:full|quota|space)/i,
      /out\s+of\s+memory/i,
      /not\s+enough\s+memory/i,
      /resource\s+(?:temporarily\s+)?unavailable/i,
    ],
  },
  {
    classification: 'container-startup-blocked',
    confidence: 'medium',
    patterns: [
      /container.*(?:failed|exited|unhealthy|not\s+running)/i,
      /failed\s+to\s+start/i,
      /service.*(?:failed|unhealthy)/i,
      /healthcheck/i,
    ],
  },
];

const parseArgs = (argv) => {
  const result = {
    help: false,
    classify: false,
    unknownArgs: [],
  };

  for (const arg of argv) {
    if (arg === '--help') {
      result.help = true;
      continue;
    }
    if (arg === '--classify') {
      result.classify = true;
      continue;
    }
    if (!allowedArgs.has(arg)) result.unknownArgs.push(arg);
  }

  return result;
};

const parseDiagnostic = (stdout) => {
  const lines = stdout.split(/\r?\n/);
  const valueFor = (label) => {
    const line = lines.find((candidate) => candidate.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.slice(line.indexOf(':') + 1).trim() : 'unknown';
  };

  return {
    dockerAvailability: valueFor('Docker availability'),
    supabaseAvailability: valueFor('Supabase CLI availability'),
    localConfigPresence: valueFor('Local config presence'),
    readiness: valueFor('Local stack startup readiness'),
    outputSafety: valueFor('Diagnostic output safety'),
  };
};

const removeScratch = () => {
  if (!fs.existsSync(scratchDir)) return 'not-created';
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
    return fs.existsSync(scratchDir) ? 'failed' : 'removed';
  } catch {
    return 'failed';
  }
};

const runDiagnostic = () => {
  const result = spawnSync(process.execPath, [
    path.join(scriptDir, 'm5.3a-2h-local-stack-availability-diagnostics.mjs'),
    '--static',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 15000,
  });

  const stdout = result.stdout || '';
  return {
    status: result.status,
    errorCode: result.error?.code,
    diagnostic: parseDiagnostic(stdout),
  };
};

const preconditionClassification = (diagnosticResult) => {
  const diagnostic = diagnosticResult.diagnostic;

  if (diagnosticResult.errorCode === 'ENOENT') {
    return { classification: 'supabase-cli-unavailable', confidence: 'high' };
  }
  if (diagnostic.supabaseAvailability === 'no') {
    return { classification: 'supabase-cli-unavailable', confidence: 'high' };
  }
  if (diagnostic.dockerAvailability === 'no') {
    return { classification: 'docker-command-unavailable', confidence: 'high' };
  }
  if (diagnostic.localConfigPresence === 'missing') {
    return { classification: 'local-config-missing', confidence: 'high' };
  }
  if (diagnostic.localConfigPresence !== 'present') {
    return { classification: 'unknown-local-startup-failure', confidence: 'low' };
  }
  if (diagnostic.outputSafety !== 'passed') {
    return { classification: 'classification-output-safety-failed', confidence: 'high' };
  }
  if (diagnostic.readiness !== 'ready') {
    return { classification: 'unknown-local-startup-failure', confidence: 'low' };
  }
  return null;
};

const classifyRawOutput = (rawOutput, startResult) => {
  if (startResult.error?.code === 'ENOENT') {
    return { classification: 'supabase-cli-unavailable', confidence: 'high' };
  }

  for (const candidate of classifyPatterns) {
    if (candidate.patterns.some((pattern) => pattern.test(rawOutput))) {
      return {
        classification: candidate.classification,
        confidence: candidate.confidence,
      };
    }
  }

  return {
    classification: 'unknown-local-startup-failure',
    confidence: startResult.status === 0 ? 'low' : 'low',
  };
};

const isOutputSafe = (lines) => lines.every((line) => (
  outputForbiddenPatterns.every((pattern) => !pattern.test(line))
));

function emitResult({
  startupAttempt,
  classification,
  confidence,
  outputSafety = 'passed',
  scratchCleanup = 'not-created',
}, preferredExitCode = 0) {
  const safeClassification = allowedClassifications.has(classification)
    ? classification
    : 'classification-output-safety-failed';

  const lines = [
    `startup attempt: ${startupAttempt}`,
    `classification: ${safeClassification}`,
    `confidence: ${confidence}`,
    `output safety: ${outputSafety}`,
    `scratch cleanup: ${scratchCleanup}`,
    'root cause inferred: no, only sanitized failure category reported',
    'local DB availability: unresolved',
    'schema availability: not proven',
    'artifact SELECT isolation: not verified',
    'tenant isolation: not newly verified',
  ];

  const outputIsSafe = outputSafety === 'passed' && isOutputSafe(lines);
  if (!outputIsSafe) {
    const fallbackLines = [
      `startup attempt: ${startupAttempt}`,
      'classification: classification-output-safety-failed',
      'confidence: high',
      'output safety: failed',
      `scratch cleanup: ${scratchCleanup}`,
      'root cause inferred: no, only sanitized failure category reported',
      'local DB availability: unresolved',
      'schema availability: not proven',
      'artifact SELECT isolation: not verified',
      'tenant isolation: not newly verified',
    ];
    for (const line of fallbackLines) console.log(line);
    process.exit(2);
  }

  for (const line of lines) console.log(line);
  process.exit(scratchCleanup === 'failed' ? 2 : preferredExitCode);
}

const printHelp = () => {
  console.log('Usage: node scripts/m5.3a-2k-local-stack-startup-failure-classifier.mjs --classify');
  console.log('Output uses sanitized category values only.');
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.classify || args.unknownArgs.length > 0) {
  emitResult({
    startupAttempt: 'not-attempted',
    classification: 'classification-output-safety-failed',
    confidence: 'high',
    outputSafety: 'failed',
    scratchCleanup: removeScratch(),
  }, 2);
}

const diagnosticResult = runDiagnostic();
const precondition = preconditionClassification(diagnosticResult);

if (precondition) {
  emitResult({
    startupAttempt: 'not-attempted',
    classification: precondition.classification,
    confidence: precondition.confidence,
    scratchCleanup: removeScratch(),
  }, precondition.classification === 'classification-output-safety-failed' ? 2 : 0);
}

let startResult;
let rawOutput = '';

try {
  fs.rmSync(scratchDir, { recursive: true, force: true });
  fs.mkdirSync(scratchDir, { recursive: true });
  startResult = spawnSync('supabase', ['start'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 120000,
  });
  rawOutput = [
    startResult.stdout || '',
    startResult.stderr || '',
    startResult.error?.code ? `error-code:${startResult.error.code}` : '',
  ].join('\n');
  fs.writeFileSync(scratchFile, rawOutput, 'utf8');
} catch {
  const cleanup = removeScratch();
  emitResult({
    startupAttempt: 'attempted',
    classification: 'unknown-local-startup-failure',
    confidence: 'low',
    scratchCleanup: cleanup,
  }, cleanup === 'failed' ? 2 : 0);
}

const classification = classifyRawOutput(rawOutput, startResult);
const cleanup = removeScratch();

emitResult({
  startupAttempt: 'attempted',
  classification: classification.classification,
  confidence: classification.confidence,
  scratchCleanup: cleanup,
}, cleanup === 'failed' ? 2 : 0);
