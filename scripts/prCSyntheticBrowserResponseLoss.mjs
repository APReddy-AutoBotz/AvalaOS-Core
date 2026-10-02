import { createHash } from 'node:crypto';

const ENDPOINT_PATTERN = '**/functions/v1/enterprise-intelligence-command';
const ENDPOINT_PATH = '/functions/v1/enterprise-intelligence-command';
const ACTION = 'delivery.package.revision.commit';
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;

const fail = code => { throw new Error(code); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, required) => record(value)
  && Object.keys(value).sort().join('\0') === [...required].sort().join('\0');
const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const publicTargetDigest = origin => `sha256:${createHash('sha256').update(`pr-c-controlled-human-public-target\0${origin}`).digest('hex')}`;
const safeError = error => {
  const match = String(error && typeof error === 'object' && 'message' in error ? error.message : '').match(/PR_C_SYNTHETIC_RESPONSE_LOSS_[A-Z_]+/u);
  return new Error(match?.[0] ?? 'PR_C_SYNTHETIC_RESPONSE_LOSS_REJECTED');
};

const validateEnvelope = (body, { organizationId, workspaceId }) => {
  if (!exactKeys(body, ['commandType', 'requestId', 'idempotencyKey', 'organizationId', 'workspaceId', 'payload'])
    || body.commandType !== ACTION || body.organizationId !== organizationId || body.workspaceId !== workspaceId
    || !UUID.test(body.requestId ?? '') || !IDEMPOTENCY_KEY.test(body.idempotencyKey ?? '')) {
    fail('PR_C_SYNTHETIC_RESPONSE_LOSS_REQUEST_REJECTED');
  }
  const payload = body.payload;
  if (!exactKeys(payload, ['workPackageId', 'expectedPackageVersion', 'expectedPackageVersionId', 'expectedPackageAggregateVersion', 'expectedItems', 'itemRevisions'])
    || !UUID.test(payload.workPackageId ?? '') || !UUID.test(payload.expectedPackageVersionId ?? '')
    || !Number.isSafeInteger(payload.expectedPackageVersion) || payload.expectedPackageVersion < 1
    || !Number.isSafeInteger(payload.expectedPackageAggregateVersion) || payload.expectedPackageAggregateVersion < 1
    || !Array.isArray(payload.expectedItems) || payload.expectedItems.length < 1 || payload.expectedItems.length > 250
    || !Array.isArray(payload.itemRevisions) || payload.itemRevisions.length < 1 || payload.itemRevisions.length > 250) {
    fail('PR_C_SYNTHETIC_RESPONSE_LOSS_REQUEST_REJECTED');
  }
  return body;
};

const validateResponse = (value, body) => {
  if (!exactKeys(value, ['ok', 'outcome', 'receiptId', 'action', 'resourceId', 'resourceVersion', 'packageVersionId'])
    || value.ok !== true || value.outcome !== 'committed' || value.action !== ACTION
    || !UUID.test(value.receiptId ?? '') || value.resourceId !== body.payload.workPackageId
    || !Number.isSafeInteger(value.resourceVersion) || value.resourceVersion !== body.payload.expectedPackageVersion + 1
    || !UUID.test(value.packageVersionId ?? '') || value.packageVersionId === body.payload.expectedPackageVersionId) {
    fail('PR_C_SYNTHETIC_RESPONSE_LOSS_RESPONSE_REJECTED');
  }
  return value;
};

const sameRetry = (original, retry) => original.requestId !== retry.requestId
  && original.idempotencyKey === retry.idempotencyKey
  && canonicalJson({ ...original, requestId: null }) === canonicalJson({ ...retry, requestId: null });

// This helper is deliberately a network fault around an already-issued UI
// command. It never constructs or sends a mutation of its own.
export async function executeSyntheticResponseLoss({
  page,
  organizationId,
  workspaceId,
  publicTargetDigest: expectedPublicTargetDigest,
  execute,
} = {}) {
  if (!page || typeof page.route !== 'function' || typeof page.unroute !== 'function' || typeof execute !== 'function'
    || !UUID.test(organizationId ?? '') || !UUID.test(workspaceId ?? '') || !DIGEST.test(expectedPublicTargetDigest ?? '')) {
    fail('PR_C_SYNTHETIC_RESPONSE_LOSS_INPUT_REJECTED');
  }
  let original = null;
  let retry = null;
  let intercepted = 0;
  let routeFailure = null;

  const handler = async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.continue();
    let url;
    try { url = new URL(request.url()); } catch { return route.continue(); }
    if (url.pathname !== ENDPOINT_PATH || url.search || publicTargetDigest(url.origin) !== expectedPublicTargetDigest) {
      routeFailure = 'PR_C_SYNTHETIC_RESPONSE_LOSS_TARGET_REJECTED';
      return route.abort('blockedbyclient');
    }
    let body;
    try { body = validateEnvelope(request.postDataJSON(), { organizationId, workspaceId }); }
    catch (error) {
      // Other enterprise commands are outside this one-shot fault and remain
      // untouched. A malformed or wrong-scope revision is rejected.
      let candidate = null;
      try { candidate = request.postDataJSON(); } catch { /* malformed JSON */ }
      if (record(candidate) && candidate.commandType !== ACTION) return route.continue();
      routeFailure = safeError(error).message;
      return route.abort('blockedbyclient');
    }
    intercepted += 1;
    if (intercepted > 2) {
      routeFailure = 'PR_C_SYNTHETIC_RESPONSE_LOSS_ATTEMPT_COUNT_REJECTED';
      return route.abort('blockedbyclient');
    }
    try {
      if (intercepted === 1) {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        if (typeof response.ok !== 'function' || !response.ok()) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_RESPONSE_REJECTED');
        const responseBody = validateResponse(await response.json(), body);
        original = { body, response: responseBody, status: response.status() };
        return route.abort('failed');
      }
      if (!original || !sameRetry(original.body, body)) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_RETRY_IDENTITY_REJECTED');
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      if (typeof response.ok !== 'function' || !response.ok()) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_RESPONSE_REJECTED');
      const responseBody = validateResponse(await response.json(), body);
      if (responseBody.receiptId !== original.response.receiptId || responseBody.resourceId !== original.response.resourceId
        || responseBody.resourceVersion !== original.response.resourceVersion
        || canonicalJson(responseBody) !== canonicalJson(original.response)) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_RETRY_RESULT_REJECTED');
      retry = { body, response: responseBody, status: response.status() };
      return route.fulfill({ response });
    } catch (error) {
      routeFailure = safeError(error).message;
      return route.abort('failed');
    }
  };

  let executeFailure = null;
  let cleanupFailure = false;
  await page.route(ENDPOINT_PATTERN, handler);
  try { await execute(); }
  catch { executeFailure = 'PR_C_SYNTHETIC_RESPONSE_LOSS_EXECUTE_REJECTED'; }
  finally {
    try { await page.unroute(ENDPOINT_PATTERN, handler); } catch { cleanupFailure = true; }
  }
  if (cleanupFailure) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_CLEANUP_REJECTED');
  if (routeFailure) fail(routeFailure);
  if (executeFailure) fail(executeFailure);
  if (intercepted !== 2 || !original || !retry) fail('PR_C_SYNTHETIC_RESPONSE_LOSS_ATTEMPT_COUNT_REJECTED');
  return Object.freeze({
    original,
    retry,
    facts: Object.freeze({
      action: ACTION,
      attemptCount: intercepted,
      sameIdempotency: original.body.idempotencyKey === retry.body.idempotencyKey,
      samePayload: canonicalJson(original.body.payload) === canonicalJson(retry.body.payload),
      differentRequestId: original.body.requestId !== retry.body.requestId,
      sameReceipt: original.response.receiptId === retry.response.receiptId,
      oneCommittedEffect: original.response.resourceId === retry.response.resourceId
        && original.response.resourceVersion === retry.response.resourceVersion,
    }),
  });
}
