const PUBLIC_ATTESTATION_PATH = '/rest/v1/rpc/pr_c_controlled_human_public_attestation';
const BUSINESS_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const PRODUCT_PATH = /^\/(?:functions\/v1\/[a-z0-9-]+|rest\/v1\/rpc\/[a-z0-9_]+)$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

const exactOrigin = (value, name) => {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`AUTHENTICATED_BROWSER_${name}_ORIGIN_REJECTED`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || value.replace(/\/$/u, '') !== parsed.origin) {
    throw new Error(`AUTHENTICATED_BROWSER_${name}_ORIGIN_REJECTED`);
  }
  return parsed.origin;
};

const header = (headers, name) => {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return '';
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === 'string' ? found[1] : '';
};

export const createAuthenticatedHostedRequestClassifier = ({ backendOrigin, appOrigin }) => {
  const backend = exactOrigin(backendOrigin, 'BACKEND');
  const app = exactOrigin(appOrigin, 'APP');
  if (backend === app) throw new Error('AUTHENTICATED_BROWSER_ORIGINS_NOT_DISTINCT');
  return ({ url, method, headers = {} }) => {
    let parsed;
    try { parsed = new URL(url); } catch {
      return Object.freeze({ kind: 'outside', route: null });
    }
    const normalizedMethod = typeof method === 'string' ? method.toUpperCase() : '';
    if (!PRODUCT_PATH.test(parsed.pathname)) {
      return Object.freeze({ kind: 'outside', route: null });
    }
    if (parsed.origin !== backend) {
      return Object.freeze({ kind: 'rejected-product-origin', route: parsed.pathname });
    }
    if (parsed.pathname === PUBLIC_ATTESTATION_PATH && parsed.search === '' && normalizedMethod === 'POST') {
      return Object.freeze({ kind: 'public-attestation', route: parsed.pathname });
    }
    const requestedMethod = header(headers, 'access-control-request-method').toUpperCase();
    if (normalizedMethod === 'OPTIONS' && header(headers, 'origin') === app
      && BUSINESS_METHODS.has(requestedMethod)) {
      return Object.freeze({ kind: 'cors-preflight', route: parsed.pathname });
    }
    return Object.freeze({ kind: 'business-action', route: parsed.pathname });
  };
};

const requestDescription = async request => {
  const headers = await request.allHeaders();
  return { url: request.url(), method: request.method(), headers };
};

export class AuthenticatedHostedBrowserActionTracker {
  constructor({ backendOrigin, appOrigin, startAction, prepareAction = undefined, finishAction,
    actionDiagnostics = undefined }) {
    if (typeof startAction !== 'function' || typeof finishAction !== 'function') {
      throw new Error('AUTHENTICATED_BROWSER_TRACKER_CALLBACK_REJECTED');
    }
    if (prepareAction !== undefined && typeof prepareAction !== 'function') {
      throw new Error('AUTHENTICATED_BROWSER_TRACKER_CALLBACK_REJECTED');
    }
    if (actionDiagnostics !== undefined && (!actionDiagnostics || typeof actionDiagnostics !== 'object'
      || (actionDiagnostics.onStart !== undefined && typeof actionDiagnostics.onStart !== 'function')
      || (actionDiagnostics.onSettled !== undefined && typeof actionDiagnostics.onSettled !== 'function'))) {
      throw new Error('AUTHENTICATED_BROWSER_TRACKER_CALLBACK_REJECTED');
    }
    this.classifyRequest = createAuthenticatedHostedRequestClassifier({ backendOrigin, appOrigin });
    this.startAction = startAction;
    this.prepareAction = prepareAction ?? null;
    this.finishAction = finishAction;
    this.actionDiagnostics = actionDiagnostics ?? null;
    this.classifications = new WeakMap();
    this.actionReferences = new WeakMap();
    this.preparations = new WeakMap();
    this.finishes = new WeakMap();
    this.originalRequests = new WeakMap();
  }

  aliasRequest(alias, original) {
    if (!alias || !original || (typeof alias !== 'object' && typeof alias !== 'function')
      || (typeof original !== 'object' && typeof original !== 'function')) {
      throw new Error('AUTHENTICATED_BROWSER_REQUEST_ALIAS_REJECTED');
    }
    const existing = this.originalRequests.get(alias);
    if (existing && existing !== original) throw new Error('AUTHENTICATED_BROWSER_REQUEST_ALIAS_REJECTED');
    this.originalRequests.set(alias, original);
    return alias;
  }

  originalRequest(request) { return this.originalRequests.get(request) ?? request; }

  observeAction(name, request, classification) {
    try { this.actionDiagnostics?.[name]?.(this.originalRequest(request), classification); }
    catch { /* diagnostics never affect action authority */ }
  }

  classify(request) {
    const existing = this.classifications.get(request);
    if (existing) return existing;
    const pending = requestDescription(request).then(value => this.classifyRequest(value));
    this.classifications.set(request, pending);
    return pending;
  }

  begin(request) {
    const existing = this.actionReferences.get(request);
    if (existing) return existing;
    const pending = (async () => {
      const classification = await this.classify(request);
      if (classification.kind === 'rejected-product-origin') {
        throw new Error('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
      }
      if (classification.kind !== 'business-action') return null;
      const headers = await request.allHeaders();
      let requestBody = { method: request.method(), route: classification.route };
      try { requestBody = request.postDataJSON() ?? requestBody; } catch { /* body-free product query */ }
      this.observeAction('onStart', request, classification);
      let result;
      try {
        result = await this.startAction({
          accessToken: (header(headers, 'authorization')).replace(/^Bearer\s+/iu, ''),
          requestBody,
          route: classification.route,
        });
      } finally { this.observeAction('onSettled', request, classification); }
      if (!result || typeof result.actionId !== 'string') {
        throw new Error('AUTHENTICATED_BROWSER_ACTION_START_REJECTED');
      }
      return result.actionId;
    })();
    this.actionReferences.set(request, pending);
    return pending;
  }

  reference(request) {
    return (async () => {
      const classification = await this.classify(request);
      if (classification.kind === 'rejected-product-origin') {
        throw new Error('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
      }
      if (classification.kind !== 'business-action') return null;
      const existing = this.actionReferences.get(request);
      if (!existing) throw new Error('AUTHENTICATED_BROWSER_ACTION_START_MISSING');
      return existing;
    })();
  }

  prepare(request, status, responseBody) {
    if (!this.prepareAction) return Promise.resolve(null);
    const existing = this.preparations.get(request);
    if (existing) return existing;
    const pending = (async () => {
      const classification = await this.classify(request);
      if (classification.kind === 'rejected-product-origin') {
        throw new Error('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
      }
      if (classification.kind !== 'business-action') return null;
      if (!Number.isInteger(status) || status < 0 || status > 599) {
        throw new Error('AUTHENTICATED_BROWSER_ACTION_PREPARATION_REJECTED');
      }
      const actionReference = this.actionReferences.get(request);
      if (!actionReference) throw new Error('AUTHENTICATED_BROWSER_ACTION_START_MISSING');
      const actionId = await actionReference;
      if (!actionId) return null;
      const ack = await this.prepareAction({ actionId, status, responseBody });
      if (!ack || !DIGEST.test(ack.preparationId ?? '') || !DIGEST.test(ack.responseDigest ?? '')
        || Object.keys(ack).length !== 2) {
        throw new Error('AUTHENTICATED_BROWSER_ACTION_PREPARATION_REJECTED');
      }
      return Object.freeze({ status, preparationId: ack.preparationId, responseDigest: ack.responseDigest });
    })();
    this.preparations.set(request, pending);
    return pending;
  }

  finish(request, status, responseBody) {
    const existing = this.finishes.get(request);
    if (existing) return existing;
    const pending = (async () => {
      const classification = await this.classify(request);
      if (classification.kind === 'rejected-product-origin') {
        throw new Error('AUTHENTICATED_BROWSER_PRODUCT_ORIGIN_REJECTED');
      }
      if (classification.kind !== 'business-action') return null;
      const actionReference = this.actionReferences.get(request);
      if (!actionReference) throw new Error('AUTHENTICATED_BROWSER_ACTION_START_MISSING');
      const actionId = await actionReference;
      if (!actionId) return null;
      if (this.prepareAction) {
        const preparation = this.preparations.get(request);
        if (!preparation) throw new Error('AUTHENTICATED_BROWSER_ACTION_PREPARATION_MISSING');
        const prepared = await preparation;
        if (!prepared || prepared.status !== status) {
          throw new Error('AUTHENTICATED_BROWSER_ACTION_PREPARATION_MISMATCH');
        }
        await this.finishAction({ actionId, status, preparationMode: 'server-owned',
          preparationId: prepared.preparationId, responseDigest: prepared.responseDigest });
      } else {
        await this.finishAction({ actionId, responseBody, status });
      }
      return actionId;
    })();
    this.finishes.set(request, pending);
    return pending;
  }
}

export const AUTHENTICATED_HOSTED_PUBLIC_ATTESTATION_PATH = PUBLIC_ATTESTATION_PATH;
