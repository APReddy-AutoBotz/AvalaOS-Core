import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const scratchDir = path.join(repoRoot, '.agent', 'm5.3a-2k-local-stack-startup-classifier');
const scratchFile = path.join(scratchDir, 'supabase-start.raw.log');

const SAFE_OUTPUT_BYTE_BUDGET = 262144;
const SAFE_OUTPUT_LINE_BUDGET = 500;
const STARTUP_CAPTURE_MAX_BUFFER_BYTES = SAFE_OUTPUT_BYTE_BUDGET;
const STARTUP_TIMEOUT_MS = 120000;

const allowedArgs = new Set(['--classify', '--help']);
const allowedClassifications = new Set([
  'docker-command-unavailable',
  'docker-context-unavailable',
  'docker-daemon-unavailable',
  'docker-desktop-wsl-integration-blocked',
  'docker-permission-blocked',
  'docker-credential-helper-blocked',
  'docker-api-version-blocked',
  'supabase-cli-unavailable',
  'supabase-cli-runtime-error',
  'local-config-missing',
  'local-config-invalid',
  'local-port-conflict-suspected',
  'port-conflict-suspected',
  'image-pull-or-network-blocked',
  'image-platform-or-architecture-blocked',
  'compose-project-startup-blocked',
  'container-healthcheck-timeout',
  'container-startup-blocked',
  'local-volume-mount-blocked',
  'local-file-permission-blocked',
  'resource-limit-or-disk-blocked',
  'supabase-service-start-timeout',
  'local-startup-timeout-with-oversized-output',
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

const signalFields = new Set([
  'startupAttemptStatus',
  'exitResultClass',
  'commandPhaseClass',
  'outputSizeBucket',
  'lineCountBucket',
  'timeoutFlag',
  'knownPatternFamilyCounts',
  'sanitizedCategoryCandidates',
  'confidence',
  'outputSafetyResult',
  'scratchCleanupResult',
  'safetyBlockReasonCategory',
  'noSecretsConfirmation',
  'noLocalPathConfirmation',
  'noRawLogConfirmation',
]);

const signalEnums = {
  startupAttemptStatus: new Set(['attempted', 'not-attempted']),
  exitResultClass: new Set(['success', 'nonzero-exit', 'timeout', 'spawn-error', 'killed', 'unknown']),
  commandPhaseClass: new Set([
    'preflight',
    'supabase-cli-invocation',
    'image-resolution',
    'image-pull',
    'container-create',
    'service-start',
    'health-wait',
    'cleanup',
    'unknown',
  ]),
  outputSizeBucket: new Set(['none', 'small', 'medium', 'large', 'oversized', 'unknown']),
  lineCountBucket: new Set(['none', 'small', 'medium', 'large', 'oversized', 'unknown']),
  confidence: new Set(['high', 'medium', 'low']),
  outputSafetyResult: new Set(['passed', 'failed']),
  scratchCleanupResult: new Set(['removed', 'not-created', 'failed']),
  safetyBlockReasonCategory: new Set([
    'none',
    'raw-output-unsafe',
    'secret-like',
    'local-path-like',
    'target-like',
    'container-image-id-like',
    'raw-log-like',
    'output-too-large',
    'unknown',
  ]),
  noSecretsConfirmation: new Set(['passed', 'failed', 'unknown']),
  noLocalPathConfirmation: new Set(['passed', 'failed', 'unknown']),
  noRawLogConfirmation: new Set(['passed', 'failed', 'unknown']),
};

const patternFamilyLabels = [
  'docker',
  'supabase-cli',
  'network',
  'health',
  'permission',
  'config',
  'resource',
  'unknown',
];

const classificationFamilies = {
  'docker-command-unavailable': 'docker',
  'docker-context-unavailable': 'docker',
  'docker-daemon-unavailable': 'docker',
  'docker-desktop-wsl-integration-blocked': 'docker',
  'docker-permission-blocked': 'permission',
  'docker-credential-helper-blocked': 'docker',
  'docker-api-version-blocked': 'docker',
  'supabase-cli-unavailable': 'supabase-cli',
  'supabase-cli-runtime-error': 'supabase-cli',
  'local-config-missing': 'config',
  'local-config-invalid': 'config',
  'local-port-conflict-suspected': 'network',
  'port-conflict-suspected': 'network',
  'image-pull-or-network-blocked': 'network',
  'image-platform-or-architecture-blocked': 'docker',
  'compose-project-startup-blocked': 'docker',
  'container-healthcheck-timeout': 'health',
  'container-startup-blocked': 'docker',
  'local-volume-mount-blocked': 'permission',
  'local-file-permission-blocked': 'permission',
  'resource-limit-or-disk-blocked': 'resource',
  'supabase-service-start-timeout': 'health',
  'local-startup-timeout-with-oversized-output': 'unknown',
  'unknown-local-startup-failure': 'unknown',
  'classification-output-safety-failed': 'unknown',
};

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
    classification: 'docker-context-unavailable',
    confidence: 'high',
    patterns: [
      /docker\s+context.*(?:not\s+found|does\s+not\s+exist|unavailable|invalid)/i,
      /context\s+["']?[^"'\s]+["']?\s+(?:not\s+found|does\s+not\s+exist|unavailable|invalid)/i,
      /current\s+docker\s+context.*(?:not\s+found|unavailable|invalid)/i,
      /unable\s+to\s+resolve\s+docker\s+endpoint/i,
    ],
  },
  {
    classification: 'docker-desktop-wsl-integration-blocked',
    confidence: 'medium',
    patterns: [
      /\bwsl\b.*(?:integration|distribution|distro).*(?:blocked|disabled|not\s+enabled|not\s+running|unavailable)/i,
      /docker\s+desktop.*\bwsl\b.*(?:blocked|disabled|not\s+enabled|not\s+running|unavailable)/i,
      /\bwsl\b.*docker.*(?:blocked|disabled|not\s+enabled|not\s+running|unavailable)/i,
      /the\s+command\s+['"]?wsl(?:\.exe)?['"]?.*(?:failed|not\s+found|is\s+not\s+recognized)/i,
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
    classification: 'docker-credential-helper-blocked',
    confidence: 'medium',
    patterns: [
      /docker-credential-[a-z0-9_-]+/i,
      /credential\s+(?:helper|store|manager).*(?:failed|error|not\s+found|unavailable|denied)/i,
      /error\s+(?:saving|getting|retrieving)\s+credentials/i,
      /credentials?.*(?:not\s+found|unavailable|denied|helper)/i,
    ],
  },
  {
    classification: 'docker-api-version-blocked',
    confidence: 'medium',
    patterns: [
      /client\s+version.*server\s+version/i,
      /api\s+version.*(?:too\s+new|too\s+old|unsupported|mismatch|not\s+supported)/i,
      /docker\s+api.*(?:unsupported|mismatch|version)/i,
      /server\s+api\s+version/i,
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
    classification: 'local-port-conflict-suspected',
    confidence: 'medium',
    patterns: [
      /address\s+already\s+in\s+use/i,
      /bind.*(?:failed|address)/i,
      /port.*(?:already\s+allocated|already\s+in\s+use|is\s+in\s+use)/i,
      /listen\s+tcp.*address/i,
    ],
  },
  {
    classification: 'local-volume-mount-blocked',
    confidence: 'medium',
    patterns: [
      /(?:bind\s+)?mount.*(?:denied|failed|invalid|not\s+found|permission)/i,
      /mounts?\s+denied/i,
      /volume.*(?:failed|denied|permission|not\s+found|invalid)/i,
      /file\s+sharing.*(?:disabled|not\s+enabled|denied)/i,
      /drive.*(?:not\s+shared|sharing)/i,
    ],
  },
  {
    classification: 'local-file-permission-blocked',
    confidence: 'medium',
    patterns: [
      /\beacces\b/i,
      /\beperm\b/i,
      /operation\s+not\s+permitted/i,
      /permission\s+denied.*(?:file|directory|mkdir|open|read|write|unlink|rename)/i,
      /access\s+is\s+denied.*(?:file|directory|mkdir|open|read|write|unlink|rename)/i,
      /read-only\s+file\s+system/i,
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
    classification: 'image-platform-or-architecture-blocked',
    confidence: 'medium',
    patterns: [
      /no\s+matching\s+manifest\s+for/i,
      /platform.*(?:not\s+supported|unsupported|mismatch|no\s+match)/i,
      /architecture.*(?:not\s+supported|unsupported|mismatch)/i,
      /exec\s+format\s+error/i,
      /image.*(?:platform|architecture).*(?:unsupported|mismatch|not\s+supported)/i,
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
    classification: 'container-healthcheck-timeout',
    confidence: 'medium',
    patterns: [
      /health\s*check.*(?:timeout|timed\s+out|failed|unhealthy)/i,
      /healthcheck.*(?:timeout|timed\s+out|failed|unhealthy)/i,
      /container.*(?:unhealthy|health.*failed)/i,
      /timed\s+out\s+waiting.*(?:healthy|health)/i,
    ],
  },
  {
    classification: 'supabase-service-start-timeout',
    confidence: 'medium',
    patterns: [
      /timed\s+out\s+waiting\s+for\s+(?:the\s+)?(?:supabase\s+)?(?:service|services|stack)/i,
      /(?:supabase\s+)?(?:service|services|stack).*timed\s+out/i,
      /waiting\s+for.*(?:service|services|stack).*(?:timeout|timed\s+out)/i,
      /failed\s+to\s+start.*within.*timeout/i,
    ],
  },
  {
    classification: 'compose-project-startup-blocked',
    confidence: 'medium',
    patterns: [
      /compose.*(?:project|service).*(?:failed|blocked|exited|unhealthy)/i,
      /docker\s+compose.*(?:failed|error|exited)/i,
      /dependency\s+failed\s+to\s+start/i,
      /failed\s+to\s+create.*(?:container|service)/i,
      /failed\s+to\s+recreate/i,
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
  {
    classification: 'supabase-cli-runtime-error',
    confidence: 'medium',
    patterns: [
      /supabase.*(?:panic|runtime\s+error|internal\s+error|unexpected\s+error)/i,
      /fatal\s+error.*supabase/i,
      /failed\s+to\s+run\s+supabase/i,
      /supabase.*(?:exit\s+status|exited\s+with)/i,
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

const outputSizeBucketFor = (rawOutput) => {
  if (typeof rawOutput !== 'string') return 'unknown';
  const size = Buffer.byteLength(rawOutput, 'utf8');
  if (size === 0) return 'none';
  if (size <= 4096) return 'small';
  if (size <= 65536) return 'medium';
  if (size <= SAFE_OUTPUT_BYTE_BUDGET) return 'large';
  return 'oversized';
};

const lineCountBucketFor = (rawOutput) => {
  if (typeof rawOutput !== 'string') return 'unknown';
  if (rawOutput.length === 0) return 'none';
  const lines = rawOutput.split(/\r?\n/).filter((line) => line.length > 0).length;
  if (lines === 0) return 'none';
  if (lines <= 25) return 'small';
  if (lines <= 100) return 'medium';
  if (lines <= SAFE_OUTPUT_LINE_BUDGET) return 'large';
  return 'oversized';
};

const outputBudgetStatusFor = (rawOutput) => {
  if (typeof rawOutput !== 'string') {
    return {
      byteLength: 0,
      lineCount: 0,
      outputSizeBucket: 'unknown',
      lineCountBucket: 'unknown',
      outputBudgetPressure: false,
    };
  }

  const byteLength = Buffer.byteLength(rawOutput, 'utf8');
  const lineCount = rawOutput.length === 0
    ? 0
    : rawOutput.split(/\r?\n/).filter((line) => line.length > 0).length;

  return {
    byteLength,
    lineCount,
    outputSizeBucket: outputSizeBucketFor(rawOutput),
    lineCountBucket: lineCountBucketFor(rawOutput),
    outputBudgetPressure: byteLength > SAFE_OUTPUT_BYTE_BUDGET || lineCount > SAFE_OUTPUT_LINE_BUDGET,
  };
};

const buildBoundedStartupCapture = (segments, { forceOutputBudgetPressure = false } = {}) => {
  const rawOutput = segments
    .filter((segment) => typeof segment === 'string' && segment.length > 0)
    .join('\n');
  const initialBudget = outputBudgetStatusFor(rawOutput);
  const outputBudget = forceOutputBudgetPressure
    ? {
      ...initialBudget,
      outputSizeBucket: 'oversized',
      outputBudgetPressure: true,
    }
    : initialBudget;

  return {
    rawOutput: outputBudget.outputBudgetPressure ? '' : rawOutput,
    scratchOutput: outputBudget.outputBudgetPressure ? 'redacted-output-budget-pressure\n' : rawOutput,
    outputBudget,
  };
};

const exitResultClassFor = (startResult) => {
  if (!startResult) return 'unknown';
  if (startResult.status === 0) return 'success';
  if (startResult.error?.code === 'ETIMEDOUT') return 'timeout';
  if (startResult.error) return 'spawn-error';
  if (startResult.signal) return 'killed';
  if (typeof startResult.status === 'number' && startResult.status !== 0) return 'nonzero-exit';
  return 'unknown';
};

const commandPhaseClassFor = (classification) => {
  if (classification === 'supabase-cli-unavailable' || classification === 'supabase-cli-runtime-error') {
    return 'supabase-cli-invocation';
  }
  if (classification === 'local-config-missing' || classification === 'local-config-invalid') {
    return 'preflight';
  }
  if (classification === 'image-pull-or-network-blocked' || classification === 'image-platform-or-architecture-blocked') {
    return 'image-pull';
  }
  if (classification === 'compose-project-startup-blocked' || classification === 'container-startup-blocked') {
    return 'container-create';
  }
  if (classification === 'container-healthcheck-timeout' || classification === 'supabase-service-start-timeout') {
    return 'health-wait';
  }
  if (
    classification === 'docker-command-unavailable'
    || classification === 'docker-context-unavailable'
    || classification === 'docker-daemon-unavailable'
    || classification === 'docker-desktop-wsl-integration-blocked'
    || classification === 'docker-permission-blocked'
    || classification === 'docker-credential-helper-blocked'
    || classification === 'docker-api-version-blocked'
  ) {
    return 'preflight';
  }
  return 'unknown';
};

const matchedClassificationsFor = (rawOutput, fallbackClassification) => {
  const matches = [];
  if (typeof rawOutput === 'string' && rawOutput.length > 0) {
    for (const candidate of classifyPatterns) {
      if (candidate.patterns.some((pattern) => pattern.test(rawOutput))) {
        matches.push(candidate.classification);
      }
    }
  }
  const unique = [...new Set(matches.filter((value) => allowedClassifications.has(value)))];
  return unique.length > 0 ? unique : [fallbackClassification];
};

const countKnownPatternFamilies = (rawOutput, classification) => {
  const counts = Object.fromEntries(patternFamilyLabels.map((label) => [label, 0]));

  if (typeof rawOutput === 'string' && rawOutput.length > 0) {
    for (const candidate of classifyPatterns) {
      const family = classificationFamilies[candidate.classification] || 'unknown';
      if (candidate.patterns.some((pattern) => pattern.test(rawOutput))) {
        counts[family] += 1;
      }
    }
  }

  if (Object.values(counts).every((count) => count === 0)) {
    const family = classificationFamilies[classification] || 'unknown';
    counts[family] = 1;
  }

  return counts;
};

const formatKnownPatternFamilyCounts = (counts) => patternFamilyLabels
  .map((label) => `${label}=${Number.isSafeInteger(counts[label]) ? counts[label] : 0}`)
  .join(',');

const safetyBlockReasonFor = (signal) => {
  if (signal.outputSizeBucket === 'oversized' || signal.lineCountBucket === 'oversized') return 'output-too-large';
  if (signal.outputSafetyResult !== 'passed') return 'raw-output-unsafe';
  if (signal.scratchCleanupResult === 'failed') return 'unknown';
  return 'none';
};

const isRedactedTimeoutOversizedSignal = (signal) => (
  signal.outputSafetyResult === 'passed'
  && signal.scratchCleanupResult === 'removed'
  && signal.noSecretsConfirmation === 'passed'
  && signal.noLocalPathConfirmation === 'passed'
  && signal.noRawLogConfirmation === 'passed'
  && signal.exitResultClass === 'timeout'
  && signal.timeoutFlag === true
  && signal.safetyBlockReasonCategory === 'output-too-large'
  && (
    signal.outputSizeBucket === 'oversized'
    || signal.lineCountBucket === 'oversized'
  )
);

const classifyFromRedactedSignal = ({ classification, confidence, signal }) => {
  if (classification !== 'unknown-local-startup-failure') {
    return { classification, confidence };
  }

  // Category-only refinement from sanitized fields; this does not infer root cause.
  if (!isRedactedTimeoutOversizedSignal(signal)) {
    return { classification, confidence };
  }

  return {
    classification: 'local-startup-timeout-with-oversized-output',
    confidence: 'low',
  };
};

const buildRedactedSignal = ({
  startupAttempt,
  classification,
  confidence,
  outputSafety,
  scratchCleanup,
  rawOutput = '',
  startResult = null,
  outputBudget = null,
}) => {
  const safeClassification = allowedClassifications.has(classification)
    ? classification
    : 'classification-output-safety-failed';
  const signal = {
    startupAttemptStatus: startupAttempt === 'attempted' ? 'attempted' : 'not-attempted',
    exitResultClass: startupAttempt === 'attempted' ? exitResultClassFor(startResult) : 'unknown',
    commandPhaseClass: commandPhaseClassFor(safeClassification),
    outputSizeBucket: outputBudget?.outputSizeBucket || outputSizeBucketFor(rawOutput),
    lineCountBucket: outputBudget?.lineCountBucket || lineCountBucketFor(rawOutput),
    timeoutFlag: exitResultClassFor(startResult) === 'timeout',
    knownPatternFamilyCounts: countKnownPatternFamilies(rawOutput, safeClassification),
    sanitizedCategoryCandidates: matchedClassificationsFor(rawOutput, safeClassification),
    confidence: signalEnums.confidence.has(confidence) ? confidence : 'low',
    outputSafetyResult: outputSafety === 'passed' ? 'passed' : 'failed',
    scratchCleanupResult: signalEnums.scratchCleanupResult.has(scratchCleanup) ? scratchCleanup : 'failed',
    safetyBlockReasonCategory: 'none',
    noSecretsConfirmation: outputSafety === 'passed' ? 'passed' : 'failed',
    noLocalPathConfirmation: outputSafety === 'passed' ? 'passed' : 'failed',
    noRawLogConfirmation: outputSafety === 'passed' ? 'passed' : 'failed',
  };
  signal.safetyBlockReasonCategory = safetyBlockReasonFor(signal);
  return signal;
};

function renderSignalLines(signal) {
  return [
    `redacted signal startupAttemptStatus: ${signal.startupAttemptStatus}`,
    `redacted signal exitResultClass: ${signal.exitResultClass}`,
    `redacted signal commandPhaseClass: ${signal.commandPhaseClass}`,
    `redacted signal outputSizeBucket: ${signal.outputSizeBucket}`,
    `redacted signal lineCountBucket: ${signal.lineCountBucket}`,
    `redacted signal timeoutFlag: ${signal.timeoutFlag ? 'true' : 'false'}`,
    `redacted signal knownPatternFamilyCounts: ${formatKnownPatternFamilyCounts(signal.knownPatternFamilyCounts)}`,
    `redacted signal sanitizedCategoryCandidates: ${signal.sanitizedCategoryCandidates.join(',')}`,
    `redacted signal confidence: ${signal.confidence}`,
    `redacted signal outputSafetyResult: ${signal.outputSafetyResult}`,
    `redacted signal scratchCleanupResult: ${signal.scratchCleanupResult}`,
    `redacted signal safetyBlockReasonCategory: ${signal.safetyBlockReasonCategory}`,
    `redacted signal noSecretsConfirmation: ${signal.noSecretsConfirmation}`,
    `redacted signal noLocalPathConfirmation: ${signal.noLocalPathConfirmation}`,
    `redacted signal noRawLogConfirmation: ${signal.noRawLogConfirmation}`,
  ];
}

const validateRedactedSignal = (signal) => {
  const keys = Object.keys(signal);
  if (keys.length !== signalFields.size) return false;
  if (keys.some((key) => !signalFields.has(key))) return false;

  for (const [field, allowed] of Object.entries(signalEnums)) {
    if (!allowed.has(signal[field])) return false;
  }

  if (typeof signal.timeoutFlag !== 'boolean') return false;
  if (!signal.knownPatternFamilyCounts || typeof signal.knownPatternFamilyCounts !== 'object') return false;

  const familyKeys = Object.keys(signal.knownPatternFamilyCounts);
  if (familyKeys.length !== patternFamilyLabels.length) return false;
  if (familyKeys.some((key) => !patternFamilyLabels.includes(key))) return false;
  if (Object.values(signal.knownPatternFamilyCounts).some((value) => !Number.isSafeInteger(value) || value < 0)) return false;

  if (!Array.isArray(signal.sanitizedCategoryCandidates)) return false;
  if (signal.sanitizedCategoryCandidates.length === 0) return false;
  if (signal.sanitizedCategoryCandidates.some((value) => !allowedClassifications.has(value))) return false;

  return isOutputSafe(renderSignalLines(signal));
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
const classifyBoundedOutput = (capture, startResult) => {
  if (capture?.outputBudget?.outputBudgetPressure) {
    return {
      classification: 'unknown-local-startup-failure',
      confidence: 'low',
    };
  }

  return classifyRawOutput(capture?.rawOutput || '', startResult);
};

const isOutputSafe = (lines) => lines.every((line) => (
  outputForbiddenPatterns.every((pattern) => !pattern.test(line))
));

function createResult({
  startupAttempt,
  classification,
  confidence,
  outputSafety = 'passed',
  scratchCleanup = 'not-created',
  rawOutput = '',
  startResult = null,
  outputBudget = null,
}, preferredExitCode = 0) {
  const safeClassification = allowedClassifications.has(classification)
    ? classification
    : 'classification-output-safety-failed';

  const failClosedLines = [
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

  if (scratchCleanup === 'failed') {
    return {
      lines: failClosedLines,
      exitCode: 2,
      classification: 'classification-output-safety-failed',
      outputIsSafe: false,
    };
  }

  const initialSignal = buildRedactedSignal({
    startupAttempt,
    classification: safeClassification,
    confidence,
    outputSafety,
    scratchCleanup,
    rawOutput,
    startResult,
    outputBudget,
  });
  const redactedClassification = classifyFromRedactedSignal({
    classification: safeClassification,
    confidence,
    signal: initialSignal,
  });
  const signal = redactedClassification.classification === safeClassification
    && redactedClassification.confidence === confidence
    ? initialSignal
    : buildRedactedSignal({
      startupAttempt,
      classification: redactedClassification.classification,
      confidence: redactedClassification.confidence,
      outputSafety,
      scratchCleanup,
      rawOutput,
      startResult,
      outputBudget,
    });

  const baseLines = [
    `startup attempt: ${startupAttempt}`,
    `classification: ${redactedClassification.classification}`,
    `confidence: ${redactedClassification.confidence}`,
    `output safety: ${outputSafety}`,
    `scratch cleanup: ${scratchCleanup}`,
    'root cause inferred: no, only sanitized failure category reported',
    'local DB availability: unresolved',
    'schema availability: not proven',
    'artifact SELECT isolation: not verified',
    'tenant isolation: not newly verified',
  ];

  const signalLines = validateRedactedSignal(signal) ? renderSignalLines(signal) : [];
  const lines = signalLines.length > 0 ? [...baseLines, ...signalLines] : failClosedLines;
  const outputIsSafe = outputSafety === 'passed' && isOutputSafe(lines) && signalLines.length > 0;

  if (!outputIsSafe) {
    return {
      lines: failClosedLines,
      exitCode: 2,
      classification: 'classification-output-safety-failed',
      signal,
      outputIsSafe: false,
    };
  }

  return {
    lines,
    exitCode: preferredExitCode,
    classification: redactedClassification.classification,
    signal,
    outputIsSafe: true,
  };
}

function emitResult(options, preferredExitCode = 0) {
  const result = createResult(options, preferredExitCode);
  for (const line of result.lines) console.log(line);
  process.exit(result.exitCode);
}

const writeScratchCapture = (capture) => {
  fs.writeFileSync(scratchFile, capture.scratchOutput, 'utf8');
};

function printHelp() {
  console.log('Usage: node scripts/m5.3a-2k-local-stack-startup-failure-classifier.mjs --classify');
  console.log('Output uses sanitized category values only.');
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

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
  let capture = {
    rawOutput: '',
    scratchOutput: '',
    outputBudget: outputBudgetStatusFor(''),
  };

  try {
    fs.rmSync(scratchDir, { recursive: true, force: true });
    fs.mkdirSync(scratchDir, { recursive: true });
    startResult = spawnSync('supabase', ['start'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: STARTUP_TIMEOUT_MS,
      maxBuffer: STARTUP_CAPTURE_MAX_BUFFER_BYTES,
    });
    capture = buildBoundedStartupCapture([
      startResult.stdout || '',
      startResult.stderr || '',
      startResult.error?.code ? `error-code:${startResult.error.code}` : '',
    ], { forceOutputBudgetPressure: startResult.error?.code === 'ENOBUFS' });
    writeScratchCapture(capture);
  } catch {
    const cleanup = removeScratch();
    emitResult({
      startupAttempt: 'attempted',
      classification: 'unknown-local-startup-failure',
      confidence: 'low',
      scratchCleanup: cleanup,
    }, cleanup === 'failed' ? 2 : 0);
  }

  const classification = classifyBoundedOutput(capture, startResult);
  const cleanup = removeScratch();

  emitResult({
    startupAttempt: 'attempted',
    classification: classification.classification,
    confidence: classification.confidence,
    scratchCleanup: cleanup,
    rawOutput: capture.rawOutput,
    outputBudget: capture.outputBudget,
    startResult,
  }, cleanup === 'failed' ? 2 : 0);
}

export {
  SAFE_OUTPUT_BYTE_BUDGET,
  SAFE_OUTPUT_LINE_BUDGET,
  STARTUP_CAPTURE_MAX_BUFFER_BYTES,
  buildBoundedStartupCapture,
  buildRedactedSignal,
  classifyBoundedOutput,
  classifyFromRedactedSignal,
  createResult,
  outputBudgetStatusFor,
  parseArgs,
  validateRedactedSignal,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
