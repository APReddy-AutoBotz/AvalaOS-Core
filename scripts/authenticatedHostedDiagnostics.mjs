const STAGES = new Set([
  'DATABASE_CONNECT',
  'DEPLOYMENT_INVENTORY',
  'SOURCE_DOWNLOAD',
  'NATIVE_VAULT',
  'DATABASE_SCOPE_BASELINE',
  'ACTIVATION',
]);

const SQLSTATE_CATEGORIES = new Map([
  ['28P01', 'SQL_AUTHENTICATION'],
  ['28000', 'SQL_AUTHENTICATION'],
  ['42501', 'SQL_PERMISSION'],
  ['3D000', 'SQL_DATABASE_MISSING'],
  ['42P01', 'SQL_OBJECT_MISSING'],
  ['42883', 'SQL_OBJECT_MISSING'],
  ['53300', 'SQL_CAPACITY'],
  ['53400', 'SQL_CAPACITY'],
  ['57P01', 'SQL_UNAVAILABLE'],
  ['57P02', 'SQL_UNAVAILABLE'],
  ['57P03', 'SQL_UNAVAILABLE'],
  ['57014', 'TIMEOUT'],
  ['08000', 'SQL_CONNECTION'],
  ['08001', 'SQL_CONNECTION'],
  ['08003', 'SQL_CONNECTION'],
  ['08004', 'SQL_CONNECTION'],
  ['08006', 'SQL_CONNECTION'],
  ['08007', 'SQL_CONNECTION'],
  ['08P01', 'SQL_CONNECTION'],
  ['40001', 'SQL_CONCURRENCY'],
  ['40P01', 'SQL_CONCURRENCY'],
  ['P0001', 'SQL_REJECTION'],
  ['22P02', 'SQL_INPUT'],
  ['22023', 'SQL_INPUT'],
  ['23503', 'SQL_CONSTRAINT'],
  ['23505', 'SQL_CONSTRAINT'],
  ['23514', 'SQL_CONSTRAINT'],
]);

const NODE_CATEGORIES = new Map([
  ['ETIMEDOUT', 'TIMEOUT'],
  ['ESOCKETTIMEDOUT', 'TIMEOUT'],
  ['UND_ERR_CONNECT_TIMEOUT', 'TIMEOUT'],
  ['ABORT_ERR', 'TIMEOUT'],
  ['ENOTFOUND', 'DNS'],
  ['EAI_AGAIN', 'DNS'],
  ['ECONNREFUSED', 'CONNECTION_REFUSED'],
  ['ECONNRESET', 'CONNECTION_RESET'],
  ['EPIPE', 'CONNECTION_RESET'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS'],
  ['SELF_SIGNED_CERT_IN_CHAIN', 'TLS'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS'],
  ['CERT_HAS_EXPIRED', 'TLS'],
  ['ENOENT', 'EXECUTABLE_NOT_FOUND'],
  ['ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'OUTPUT_BUFFER'],
  ['ENOMEM', 'RESOURCE_EXHAUSTED'],
]);

const CLI_SIGNATURES = Object.freeze([
  ['Cannot find project ref. Have you run supabase link?', 'CLI_CONFIGURATION'],
  ['project_id is required', 'CLI_CONFIGURATION'],
  ['Invalid project ref', 'CLI_CONFIGURATION'],
  ['Access token not provided', 'CLI_AUTHENTICATION'],
  ['Invalid access token format', 'CLI_AUTHENTICATION'],
  ['Invalid access token', 'CLI_AUTHENTICATION'],
  ['Error status 401:', 'CLI_AUTHENTICATION'],
  ['Error status 403:', 'CLI_AUTHENTICATION'],
  ['context deadline exceeded', 'TIMEOUT'],
  ['Client.Timeout exceeded while awaiting headers', 'TIMEOUT'],
  ['stdout maxBuffer length exceeded', 'OUTPUT_BUFFER'],
  ['stderr maxBuffer length exceeded', 'OUTPUT_BUFFER'],
  ['Cannot connect to the Docker daemon', 'CLI_DOCKER_UNAVAILABLE'],
  ['Docker is not running', 'CLI_DOCKER_UNAVAILABLE'],
  ['Is the docker daemon running?', 'CLI_DOCKER_UNAVAILABLE'],
]);

const knownCode = error => {
  const match = String(error?.message ?? '').match(/^(AUTHENTICATED_HOSTED_[A-Z0-9_]{1,120})/u);
  return match?.[1] ?? null;
};

const errorChain = error => {
  const chain = [];
  let current = error;
  while (current && chain.length < 3) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
};

const categoryFor = (error, source) => {
  const chain = errorChain(error);
  for (const item of chain) {
    const code = typeof item?.code === 'string' ? item.code.toUpperCase() : '';
    if (SQLSTATE_CATEGORIES.has(code)) return SQLSTATE_CATEGORIES.get(code);
    if (NODE_CATEGORIES.has(code)) return NODE_CATEGORIES.get(code);
    if (item?.name === 'AbortError' || item?.name === 'TimeoutError') return 'TIMEOUT';
  }
  if (source === 'cli') {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    for (const [signature, category] of CLI_SIGNATURES) if (stderr.includes(signature)) return category;
    return 'CLI_FAILURE';
  }
  return 'UNCLASSIFIED';
};

export async function withAuthenticatedHostedDiagnostic(stage, operation, { source = 'runtime' } = {}) {
  if (!STAGES.has(stage) || !['runtime', 'cli'].includes(source) || typeof operation !== 'function') {
    throw new Error('AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_INPUT_REJECTED');
  }
  try {
    return await operation();
  } catch (error) {
    const preserved = knownCode(error);
    if (preserved) throw new Error(preserved);
    throw new Error(`AUTHENTICATED_HOSTED_RUNNER_DIAGNOSTIC_${stage}_${categoryFor(error, source)}`);
  }
}
