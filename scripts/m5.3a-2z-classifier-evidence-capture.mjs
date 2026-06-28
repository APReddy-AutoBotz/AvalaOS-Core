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

const topLevelLabels = new Map([
  ['startup attempt', 'startupAttemptStatus'],
  ['classification', 'classification'],
  ['confidence', 'confidence'],
  ['output safety', 'outputSafetyResult'],
  ['scratch cleanup', 'scratchCleanupResult'],
  ['root cause inferred', 'rootCauseInferred'],
  ['local db availability', 'localDbAvailability'],
  ['schema availability', 'schemaAvailability'],
  ['artifact select isolation', 'artifactSelectIsolation'],
  ['tenant isolation', 'tenantIsolation'],
]);

const requiredTopLevelFields = new Set(topLevelLabels.values());

const redactedSignalFields = new Set([
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

const forbiddenContentPatterns = [
  { category: 'raw-output-like', pattern: /\b(?:stdout|stderr|raw\s+(?:output|log)|scratch\s+output|stack\s+trace|traceback)\b/i },
  { category: 'literal-command-string', pattern: /\bnode(?:\.exe)?\s+\S+/i },
  { category: 'literal-command-string', pattern: /\bnpm(?:\.cmd)?\s+run\b/i },
  { category: 'literal-command-string', pattern: /\bsupabase(?:\.exe)?\s+\w+/i },
  { category: 'literal-command-string', pattern: /\bdocker(?:\.exe)?\s+\w+/i },
  { category: 'target-or-url-like', pattern: /https?:\/\//i },
  { category: 'target-or-url-like', pattern: /postgres(?:ql)?:\/\//i },
  { category: 'target-or-url-like', pattern: /\b[a-z0-9]{18,}\.supabase\.co\b/i },
  { category: 'target-or-url-like', pattern: /\b(?:host|port|database|user)\s*(?:name|value)?\s*[:=]/i },
  { category: 'target-or-url-like', pattern: /\b(?:db\s*url|database_url|project\s*ref|project_ref)\b/i },
  { category: 'secret-like', pattern: /\b(?:service[_ -]?role|anon\s+key|jwt\s+secret|provider[_ -]?key|private[_ -]?token)\b/i },
  { category: 'secret-like', pattern: /\b(?:bearer|jwt)\b/i },
  { category: 'secret-like', pattern: /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { category: 'local-path-like', pattern: /[A-Za-z]:[\\/]/ },
  { category: 'local-path-like', pattern: /(?:^|[\s'"])(?:\/Users|\/home|\/var|\/tmp|\/mnt|\/Volumes)\// },
  { category: 'container-image-id-like', pattern: /\b(?:container|image)\s+id\b/i },
  { category: 'container-image-id-like', pattern: /\b[0-9a-f]{12,64}\b/i },
];

const proofBoundaries = {
  classifierCategoryNewlyProven: 'no',
  realEvidenceRerun: 'no',
  rootCauseInferred: 'no',
  localDbAvailability: 'unresolved',
  schemaAvailability: 'not proven',
  artifactSelectIsolation: 'not verified',
  tenantIsolation: 'not newly verified',
  hostedReadiness: 'not proven',
  productionReadiness: 'not proven',
};

const failClosed = (reasonCategory) => ({
  ok: false,
  status: 'fail-closed',
  reasonCategory,
  capture: null,
  proofBoundaries,
});

const captured = (capture) => ({
  ok: true,
  status: 'captured',
  reasonCategory: 'none',
  capture,
  proofBoundaries,
});

const normalizeLines = (input) => {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(/\r?\n/);
  return null;
};

const unsafeCategoryFor = (value) => {
  for (const candidate of forbiddenContentPatterns) {
    if (candidate.pattern.test(value)) return candidate.category;
  }
  return null;
};

const parseLine = (line) => {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) return null;
  const label = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();
  if (!label || !value) return null;
  return { label, value };
};

const normalizeRootCause = (value) => {
  const normalized = value.toLowerCase();
  if (normalized === 'no' || normalized.startsWith('no,') || normalized === 'not inferred') {
    return 'no';
  }
  return null;
};

const parseBoolean = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

const parseKnownPatternFamilyCounts = (value) => {
  const result = {};
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== patternFamilyLabels.length) return null;

  for (const part of parts) {
    const [label, countValue] = part.split('=').map((token) => token.trim());
    if (!patternFamilyLabels.includes(label)) return null;
    if (Object.hasOwn(result, label)) return null;
    if (!/^\d+$/.test(countValue)) return null;
    const count = Number(countValue);
    if (!Number.isSafeInteger(count)) return null;
    result[label] = count;
  }

  if (patternFamilyLabels.some((label) => !Object.hasOwn(result, label))) return null;
  return result;
};

const parseSanitizedCategoryCandidates = (value) => {
  const candidates = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (candidates.length === 0) return null;
  if (candidates.some((candidate) => !allowedClassifications.has(candidate))) return null;
  return candidates;
};

const validateTopLevel = (topLevel) => {
  for (const field of requiredTopLevelFields) {
    if (!Object.hasOwn(topLevel, field)) return 'missing-required-field';
  }

  if (!signalEnums.startupAttemptStatus.has(topLevel.startupAttemptStatus)) return 'malformed-field-value';
  if (!allowedClassifications.has(topLevel.classification)) return 'malformed-field-value';
  if (!signalEnums.confidence.has(topLevel.confidence)) return 'malformed-field-value';
  if (!signalEnums.outputSafetyResult.has(topLevel.outputSafetyResult)) return 'malformed-field-value';
  if (!signalEnums.scratchCleanupResult.has(topLevel.scratchCleanupResult)) return 'malformed-field-value';

  const rootCause = normalizeRootCause(topLevel.rootCauseInferred);
  if (rootCause !== 'no') return 'root-cause-implied';
  topLevel.rootCauseInferred = rootCause;

  if (topLevel.localDbAvailability !== 'unresolved') return 'readiness-implied';
  if (topLevel.schemaAvailability !== 'not proven') return 'readiness-implied';
  if (topLevel.artifactSelectIsolation !== 'not verified') return 'readiness-implied';
  if (topLevel.tenantIsolation !== 'not newly verified') return 'readiness-implied';
  if (topLevel.outputSafetyResult !== 'passed') return 'output-safety-failed';
  if (topLevel.scratchCleanupResult === 'failed') return 'scratch-cleanup-failed';

  return null;
};

const validateRedactedSignal = (signal, topLevel) => {
  for (const field of redactedSignalFields) {
    if (!Object.hasOwn(signal, field)) return 'missing-required-field';
  }

  if (Object.keys(signal).some((field) => !redactedSignalFields.has(field))) return 'unapproved-field';

  for (const [field, allowedValues] of Object.entries(signalEnums)) {
    if (!allowedValues.has(signal[field])) return 'malformed-field-value';
  }

  if (typeof signal.timeoutFlag !== 'boolean') return 'malformed-field-value';
  if (!signal.knownPatternFamilyCounts) return 'malformed-field-value';
  if (!Array.isArray(signal.sanitizedCategoryCandidates)) return 'malformed-field-value';
  if (!signal.sanitizedCategoryCandidates.includes(topLevel.classification)) return 'malformed-field-value';

  if (signal.startupAttemptStatus !== topLevel.startupAttemptStatus) return 'malformed-field-value';
  if (signal.confidence !== topLevel.confidence) return 'malformed-field-value';
  if (signal.outputSafetyResult !== topLevel.outputSafetyResult) return 'malformed-field-value';
  if (signal.scratchCleanupResult !== topLevel.scratchCleanupResult) return 'malformed-field-value';

  if (signal.outputSafetyResult !== 'passed') return 'output-safety-failed';
  if (signal.scratchCleanupResult === 'failed') return 'scratch-cleanup-failed';
  if (signal.noSecretsConfirmation !== 'passed') return 'unsafe-confirmation-failed';
  if (signal.noLocalPathConfirmation !== 'passed') return 'unsafe-confirmation-failed';
  if (signal.noRawLogConfirmation !== 'passed') return 'unsafe-confirmation-failed';

  return null;
};

const parseRedactedSignalValue = (field, value) => {
  if (field === 'timeoutFlag') return parseBoolean(value);
  if (field === 'knownPatternFamilyCounts') return parseKnownPatternFamilyCounts(value);
  if (field === 'sanitizedCategoryCandidates') return parseSanitizedCategoryCandidates(value);
  if (Object.hasOwn(signalEnums, field) && signalEnums[field].has(value)) return value;
  return null;
};

function captureSanitizedClassifierEvidence(input) {
  const rawLines = normalizeLines(input);
  if (!rawLines) return failClosed('malformed-input');

  const lines = rawLines.map((line) => String(line).trim()).filter(Boolean);
  if (lines.length === 0) return failClosed('missing-output');

  const topLevel = {};
  const redactedSignal = {};

  for (const line of lines) {
    const unsafeCategory = unsafeCategoryFor(line);
    if (unsafeCategory) return failClosed(unsafeCategory);

    const parsed = parseLine(line);
    if (!parsed) return failClosed('malformed-line');

    const normalizedLabel = parsed.label.toLowerCase();
    if (normalizedLabel.startsWith('redacted signal ')) {
      const field = parsed.label.slice('redacted signal '.length).trim();
      if (!redactedSignalFields.has(field)) return failClosed('unapproved-field');
      if (Object.hasOwn(redactedSignal, field)) return failClosed('duplicate-field');
      const parsedValue = parseRedactedSignalValue(field, parsed.value);
      if (parsedValue === null) return failClosed('malformed-field-value');
      redactedSignal[field] = parsedValue;
      continue;
    }

    const topLevelField = topLevelLabels.get(normalizedLabel);
    if (!topLevelField) return failClosed('unapproved-field');
    if (Object.hasOwn(topLevel, topLevelField)) return failClosed('duplicate-field');
    topLevel[topLevelField] = parsed.value;
  }

  const topLevelFailure = validateTopLevel(topLevel);
  if (topLevelFailure) return failClosed(topLevelFailure);

  const signalFailure = validateRedactedSignal(redactedSignal, topLevel);
  if (signalFailure) return failClosed(signalFailure);

  return captured({
    ...topLevel,
    redactedSignal,
  });
}

export {
  allowedClassifications,
  captureSanitizedClassifierEvidence,
  proofBoundaries,
};
