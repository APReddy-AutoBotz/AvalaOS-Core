import {
  CONTROLLED_HUMAN_CATALOG,
  CONTROLLED_HUMAN_SERVER_ACTIONS,
} from './prCControlledHumanEvidenceContract.mjs';

const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;
const BROWSER_API_GLOBAL = '__prCSyntheticBrowserApiV1';

const CONTROLLED_RPCS = new Set([
  'pr_c_controlled_human_public_attestation',
  'pr_c_controlled_human_list_step_bindings',
  'pr_c_controlled_human_anchor_step',
  'pr_c_controlled_human_complete_step',
  'pr_c_controlled_human_execute_denied_step',
]);

const READ_RPCS = new Set([
  'enterprise_assess_studio_handoff_projection',
  'enterprise_transcript_module_projection',
  'studio_artifact_eligible_reviewers',
  'studio_artifact_handoffs',
  'studio_artifact_projection',
  'studio_artifact_projection_v2',
  'studio_artifact_source_package_projection',
  'studio_artifact_summary_projection_v2',
  'studio_artifact_workspace_projection_v2',
  'studio_tenant_template_projection',
]);

const FUNCTION_ALLOWLIST = new Set([
  'tenant-session',
  'enterprise-intelligence-query',
  'enterprise-intelligence-command',
  'studio-artifact-command',
]);

const EXPECTED_PERSONA = new Map();
for (const checkpoint of CONTROLLED_HUMAN_CATALOG) {
  for (const step of checkpoint.steps) EXPECTED_PERSONA.set(`${checkpoint.checkpointId}\0${step.stepId}`, step.personaKey);
}
const SERVER_ACTION = new Map(CONTROLLED_HUMAN_SERVER_ACTIONS.map(record => [`${record.checkpointId}\0${record.stepId}`, record]));

const prerequisite = (checkpointId, stepId, personaKey, action, functionName) => Object.freeze({ checkpointId, stepId, personaKey, action, functionName });
const PREREQUISITES = Object.freeze([
  prerequisite('CH-02', 'edit-structured-document', 'requester', 'studio.artifact.draft.revise', 'studio-artifact-command'),
  prerequisite('CH-02', 'edit-structured-document', 'requester', 'studio.artifact.review.submit', 'studio-artifact-command'),
  prerequisite('CH-02', 'edit-structured-document', 'requester', 'studio.artifact.review.assign', 'studio-artifact-command'),
  prerequisite('CH-03', 'generate-source-bound-document', 'requester', 'studio.artifact.review.submit', 'studio-artifact-command'),
  prerequisite('CH-03', 'generate-source-bound-document', 'studio_reviewer', 'studio.artifact.review.assign', 'studio-artifact-command'),
  prerequisite('CH-03', 'generate-source-bound-document', 'studio_reviewer', 'studio.artifact.review.resolve', 'studio-artifact-command'),
  prerequisite('CH-04', 'verify-changes-create-no-target-draft', 'requester', 'delivery.handoff.request', 'enterprise-intelligence-command'),
  prerequisite('CH-06', 'compare-immutable-descendant-history', 'delivery_author', 'delivery.item.review', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'handoff-direct-studio-plan', 'delivery_target_acceptor', 'delivery.handoff.review.resolve', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'handoff-direct-studio-plan', 'delivery_approver', 'delivery.handoff.approval.resolve', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'handoff-direct-studio-plan', 'delivery_consumer', 'delivery.handoff.consume', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'handoff-direct-studio-plan', 'delivery_author', 'delivery.item.review', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'handoff-direct-studio-plan', 'delivery_reviewer', 'delivery.package.review.resolve', 'enterprise-intelligence-command'),
  prerequisite('CH-10', 'approve-direct-planning-package', 'delivery_approver', 'monitor.baseline.create', 'enterprise-intelligence-command'),
  prerequisite('CH-11', 'create-manual-delivery-package', 'delivery_author', 'delivery.item.review', 'enterprise-intelligence-command'),
]);
const PREREQUISITE = new Map(PREREQUISITES.map(record => [`${record.checkpointId}\0${record.stepId}\0${record.personaKey}\0${record.action}`, record]));

const fail = code => { throw new Error(code); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const cloneJson = value => {
  try { return JSON.parse(JSON.stringify(value)); } catch { fail('PR_C_SYNTHETIC_BROWSER_API_REQUEST_REJECTED'); }
};

const normalizeBinding = binding => {
  if (!record(binding) || !record(binding.preview) || !record(binding.backend)
    || binding.repository !== 'APReddy-AutoBotz/AvalaOS-Core' || Number(binding.prNumber) !== 264
    || binding.branch !== 'controller/governed-delivery-monitor-pr-c-20260831'
    || !SHA.test(binding.exactHead ?? '') || binding.preview.releaseSha !== binding.exactHead
    || !DEPLOY_ID.test(binding.preview.deployId ?? '') || binding.preview.origin !== 'https://deploy-preview-264--avalaos-pilot.netlify.app'
    || binding.preview.environment !== 'hosted_nonproduction_pilot'
    || !DIGEST.test(binding.backend.exerciseDigest ?? '') || !DIGEST.test(binding.backend.targetFingerprint ?? '')
    || !DIGEST.test(binding.backend.publicTargetDigest ?? '') || !DIGEST.test(binding.backend.personaManifestDigest ?? '')
    || !DIGEST.test(binding.backend.fixtureManifestDigest ?? '') || binding.backend.migrationTip !== '20260926053818') {
    fail('PR_C_SYNTHETIC_BROWSER_API_BINDING_REJECTED');
  }
  return Object.freeze({
    releaseSha: binding.exactHead,
    reviewHeadSha: binding.exactHead,
    deployId: binding.preview.deployId,
    deployOrigin: binding.preview.origin,
    exerciseDigest: binding.backend.exerciseDigest,
    targetFingerprint: binding.backend.targetFingerprint,
    publicTargetDigest: binding.backend.publicTargetDigest,
    personaManifestDigest: binding.backend.personaManifestDigest,
    fixtureManifestDigest: binding.backend.fixtureManifestDigest,
    migrationTip: binding.backend.migrationTip,
  });
};

const validateIdentity = identity => {
  if (!exactKeys(identity, ['applicationActorDigest', 'applicationSessionDigest'])
    || !DIGEST.test(identity.applicationActorDigest ?? '') || !DIGEST.test(identity.applicationSessionDigest ?? '')) {
    fail('PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED');
  }
  return Object.freeze(cloneJson(identity));
};

const safeRuntimeError = (error, fallback) => {
  const match = String(error && typeof error === 'object' && 'message' in error ? error.message : '').match(/PR_C_SYNTHETIC_BROWSER_API_[A-Z_]+/u);
  return new Error(match?.[0] ?? fallback);
};

function installBrowserRuntime(config) {
  if (globalThis[config.globalName]) {
    if (typeof globalThis[config.globalName].matchesAttachment !== 'function'
      || !globalThis[config.globalName].matchesAttachment(config.personaKey, config.binding)) {
      throw new Error('PR_C_SYNTHETIC_BROWSER_API_ATTACH_REJECTED');
    }
    return;
  }
  const storageKey = `pr-c-synthetic-api:${config.binding.exerciseDigest}`;
  const baseFetch = globalThis.fetch.bind(globalThis);
  const state = { origin: null, apiKey: null, targetRejected: false, identity: config.identity ?? null, lastCommand: null };
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const error = code => { throw new Error(code); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonicalJson = value => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  };
  const sha256 = async value => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return `sha256:${[...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  };
  const credentialFree = value => {
    if (!value || typeof value !== 'object') return true;
    if (Array.isArray(value)) return value.every(credentialFree);
    for (const [key, child] of Object.entries(value)) {
      if (['access_token', 'refresh_token', 'apikey', 'api_key', 'authorization'].includes(key.toLowerCase())) return false;
      if (!credentialFree(child)) return false;
    }
    return true;
  };
  const restore = () => {
    try {
      const persisted = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (isObject(persisted) && persisted.publicTargetDigest === config.binding.publicTargetDigest) {
        if (typeof persisted.origin === 'string' && typeof persisted.apiKey === 'string') {
          state.origin = persisted.origin; state.apiKey = persisted.apiKey;
        }
        if (isObject(persisted.identity)) state.identity = persisted.identity;
      }
    } catch { /* unrelated or unavailable session storage */ }
  };
  const persist = () => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ publicTargetDigest: config.binding.publicTargetDigest, origin: state.origin, apiKey: state.apiKey, identity: state.identity })); } catch { /* storage denial becomes a later identity failure */ }
  };
  restore();

  const captureTarget = async (input, init) => {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); } catch { return; }
    if (!/^[a-z0-9]{20}[.]supabase[.]co$/u.test(url.hostname) || url.protocol !== 'https:') return;
    const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
    if (init?.headers) for (const [key, value] of new Headers(init.headers)) headers.set(key, value);
    const apiKey = headers.get('apikey');
    if (!apiKey) return;
    const actual = await sha256(`pr-c-controlled-human-public-target\0${url.origin}`);
    if (actual !== config.binding.publicTargetDigest || (state.origin && state.origin !== url.origin) || (state.apiKey && state.apiKey !== apiKey)) {
      state.targetRejected = true; state.origin = null; state.apiKey = null; return;
    }
    state.origin = url.origin; state.apiKey = apiKey; persist();
  };

  const observedFunctions = new Set(['enterprise-intelligence-command', 'studio-artifact-command', 'pr-c-controlled-human-synthetic-generation']);
  globalThis.fetch = async (input, init) => {
    await captureTarget(input, init);
    let observedName = '';
    let observedRequest = null;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      observedName = url.pathname.startsWith('/functions/v1/') ? url.pathname.slice('/functions/v1/'.length) : '';
      const method = String(init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
      const rawBody = typeof init?.body === 'string' ? init.body
        : typeof Request !== 'undefined' && input instanceof Request ? await input.clone().text() : '';
      if (observedFunctions.has(observedName) && method === 'POST' && rawBody) observedRequest = JSON.parse(rawBody);
    } catch { /* non-command request */ }
    const response = await baseFetch(input, init);
    try {
      if (observedRequest && response.ok) {
        const responseBody = await response.clone().json();
        if (isObject(observedRequest) && isObject(responseBody) && responseBody.ok === true && credentialFree(observedRequest) && credentialFree(responseBody)) {
          state.lastCommand = {
            functionName: observedName,
            commandType: typeof observedRequest.commandType === 'string' ? observedRequest.commandType : typeof observedRequest.action === 'string' ? observedRequest.action : null,
            requestId: typeof observedRequest.requestId === 'string' ? observedRequest.requestId : null,
            status: response.status,
            body: clone(observedRequest),
            response: clone(responseBody),
          };
        }
      }
    } catch { /* non-command response */ }
    return response;
  };

  const session = () => {
    const candidates = new Map();
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.access_token === 'string' && typeof value.user?.id === 'string') {
        try {
          const encoded = value.access_token.split('.')[1];
          const padded = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4);
          const payload = JSON.parse(atob(padded));
          if (payload.sub === value.user.id && typeof payload.session_id === 'string') {
            candidates.set(`${payload.sub}\0${payload.session_id}\0${value.access_token}`, { authUserId: payload.sub, sessionId: payload.session_id, accessToken: value.access_token });
          }
        } catch { /* unrelated application state */ }
      }
      for (const child of Object.values(value)) visit(child);
    };
    for (let index = 0; index < localStorage.length; index += 1) {
      const raw = localStorage.getItem(localStorage.key(index));
      if (!raw) continue;
      try { visit(JSON.parse(raw)); } catch { /* unrelated application state */ }
    }
    if (candidates.size !== 1) error('PR_C_SYNTHETIC_BROWSER_API_SESSION_REJECTED');
    return [...candidates.values()][0];
  };
  const requireTarget = () => {
    if (state.targetRejected || !state.origin || !state.apiKey || location.origin !== config.binding.deployOrigin) error('PR_C_SYNTHETIC_BROWSER_API_TARGET_REJECTED');
  };
  const requireIdentity = async () => {
    requireTarget();
    if (!state.identity) error('PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED');
    const current = session();
    const actorDigest = await sha256(canonicalJson({ exerciseDigest: config.binding.exerciseDigest, personaKey: config.personaKey, authUserId: current.authUserId }));
    const sessionDigest = await sha256(canonicalJson({ exerciseDigest: config.binding.exerciseDigest, personaKey: config.personaKey, sessionId: current.sessionId }));
    if (actorDigest !== state.identity.applicationActorDigest || sessionDigest !== state.identity.applicationSessionDigest) error('PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED');
    return current;
  };
  const fetchJson = async (path, body) => {
    const current = await requireIdentity();
    let response;
    try {
      response = await baseFetch(`${state.origin}${path}`, {
        method: 'POST', headers: { apikey: state.apiKey, authorization: `Bearer ${current.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { error('PR_C_SYNTHETIC_BROWSER_API_OUTCOME_UNKNOWN'); }
    let payload;
    try { payload = await response.json(); } catch { error('PR_C_SYNTHETIC_BROWSER_API_OUTCOME_UNKNOWN'); }
    if (!response.ok) error('PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
    if (!credentialFree(payload)) error('PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
    return payload;
  };
  const attestationArgs = () => ({
    p_release_sha: config.binding.releaseSha,
    p_review_head_sha: config.binding.reviewHeadSha,
    p_deploy_id: config.binding.deployId,
    p_deploy_origin: config.binding.deployOrigin,
    p_exercise_digest: config.binding.exerciseDigest,
    p_public_target_digest: config.binding.publicTargetDigest,
  });
  const validateAttestation = value => {
    if (!isObject(value) || value.attested !== true || value.contractVersion !== 'pr-c-controlled-human-attestation-1'
      || value.environmentClass !== 'hosted_nonproduction_pilot' || Number(value.prNumber) !== 264
      || value.releaseSha !== config.binding.releaseSha || value.reviewHeadSha !== config.binding.reviewHeadSha
      || value.deployId !== config.binding.deployId || value.deployOrigin !== config.binding.deployOrigin
      || value.exerciseDigest !== config.binding.exerciseDigest || value.targetFingerprint !== config.binding.targetFingerprint
      || value.publicTargetDigest !== config.binding.publicTargetDigest || value.personaManifestDigest !== config.binding.personaManifestDigest
      || value.fixtureManifestDigest !== config.binding.fixtureManifestDigest || value.migrationTip !== config.binding.migrationTip
      || value.productionAuthorized !== false || value.customerDataAuthorized !== false || value.realProviderCallsAuthorized !== false) {
      error('PR_C_SYNTHETIC_BROWSER_API_ATTESTATION_REJECTED');
    }
    return value;
  };
  const attest = async () => validateAttestation(await fetchJson('/rest/v1/rpc/pr_c_controlled_human_public_attestation', attestationArgs()));
  const freshContext = async () => {
    await attest();
    const current = session();
    const value = await fetchJson('/functions/v1/tenant-session', {});
    if (!isObject(value) || !Array.isArray(value.contexts)) error('PR_C_SYNTHETIC_BROWSER_API_CONTEXT_REJECTED');
    const contexts = value.contexts.filter(item => isObject(item) && item.userId === current.authUserId
      && typeof item.organizationId === 'string' && typeof item.workspaceId === 'string'
      && Number.isSafeInteger(item.authorizationVersion) && item.authorizationVersion > 0 && Array.isArray(item.capabilities));
    if (contexts.length !== 1) error('PR_C_SYNTHETIC_BROWSER_API_CONTEXT_REJECTED');
    return clone(contexts[0]);
  };
  const scopeMatches = (body, context) => {
    const pairs = [['organizationId', 'organizationId'], ['workspaceId', 'workspaceId'], ['p_org_id', 'organizationId'], ['p_workspace_id', 'workspaceId'], ['p_org', 'organizationId'], ['p_workspace', 'workspaceId']];
    for (const [input, expected] of pairs) if (Object.hasOwn(body, input) && body[input] !== context[expected]) return false;
    return true;
  };
  const api = {
    matchesAttachment(personaKey, binding) {
      return personaKey === config.personaKey && JSON.stringify(binding) === JSON.stringify(config.binding);
    },
    async setIdentity(identity) {
      if (!isObject(identity) || !/^sha256:[0-9a-f]{64}$/u.test(identity.applicationActorDigest ?? '') || !/^sha256:[0-9a-f]{64}$/u.test(identity.applicationSessionDigest ?? '')) error('PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED');
      const previous = state.identity;
      state.identity = clone(identity);
      try { await requireIdentity(); } catch (failure) { state.identity = previous; throw failure; }
      persist(); return true;
    },
    async context() { return freshContext(); },
    async verifyStudioTransport() {
      await attest();
      const current = await requireIdentity();
      let response;
      try {
        // An empty envelope is rejected before authority lookup or mutation.
        // Exercise actual browser CORS before any journey can commit a write.
        response = await baseFetch(`${state.origin}/functions/v1/studio-artifact-command`, {
          method: 'POST', headers: { apikey: state.apiKey, authorization: `Bearer ${current.accessToken}`, 'content-type': 'application/json' }, body: '{}',
        });
      } catch { error('PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_UNREADABLE'); }
      // A resolved native fetch with a readable body proves browser CORS. The
      // allow-origin header itself is not exposed to cross-origin JavaScript.
      let payload;
      try { payload = await response.json(); } catch { error('PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_REJECTED'); }
      if (response.status !== 400 || payload?.ok !== false || payload?.outcome !== 'failed_before_commit' || payload?.error?.code !== 'INVALID_COMMAND')
        error('PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_REJECTED');
      return { readable: true, rejectedBeforeCommit: true };
    },
    async rpc(name, args, controlled) {
      await attest();
      if (name === 'pr_c_controlled_human_public_attestation') return validateAttestation(await fetchJson(`/rest/v1/rpc/${name}`, args));
      if (!controlled) {
        const context = await freshContext();
        if (!scopeMatches(args, context)) error('PR_C_SYNTHETIC_BROWSER_API_SCOPE_REJECTED');
      }
      return fetchJson(`/rest/v1/rpc/${name}`, args);
    },
    async invoke(name, body) {
      await attest();
      if (name === 'tenant-session') return { contexts: [await freshContext()] };
      const context = await freshContext();
      if (!scopeMatches(body, context)) error('PR_C_SYNTHETIC_BROWSER_API_SCOPE_REJECTED');
      return fetchJson(`/functions/v1/${name}`, body);
    },
    lastCommand() { return state.lastCommand ? clone(state.lastCommand) : null; },
  };
  Object.defineProperty(globalThis, config.globalName, { value: api, configurable: false, enumerable: false, writable: false });
}

const evaluate = async (page, method, args, fallback) => {
  try {
    return await page.evaluate(({ globalName, method, args }) => {
      const api = globalThis[globalName];
      if (!api || typeof api[method] !== 'function') throw new Error('PR_C_SYNTHETIC_BROWSER_API_ATTACH_REJECTED');
      return api[method](...args);
    }, { globalName: BROWSER_API_GLOBAL, method, args });
  } catch (error) { throw safeRuntimeError(error, fallback); }
};

const validateControlledArgs = (name, args, binding) => {
  if (!record(args)) fail('PR_C_SYNTHETIC_BROWSER_API_REQUEST_REJECTED');
  if (name === 'pr_c_controlled_human_public_attestation') {
    const expected = {
      p_release_sha: binding.releaseSha, p_review_head_sha: binding.reviewHeadSha, p_deploy_id: binding.deployId,
      p_deploy_origin: binding.deployOrigin, p_exercise_digest: binding.exerciseDigest, p_public_target_digest: binding.publicTargetDigest,
    };
    if (!exactKeys(args, Object.keys(expected)) || Object.entries(expected).some(([key, value]) => args[key] !== value)) fail('PR_C_SYNTHETIC_BROWSER_API_BINDING_REJECTED');
  } else if (args.p_exercise_digest !== binding.exerciseDigest) fail('PR_C_SYNTHETIC_BROWSER_API_BINDING_REJECTED');
};

const validateExpectation = (expectation, personaKey, functionName, action) => {
  if (!exactKeys(expectation, ['checkpointId', 'stepId', 'action']) || expectation.action !== action) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
  const key = `${expectation.checkpointId}\0${expectation.stepId}\0${personaKey}\0${action}`;
  const allowed = PREREQUISITE.get(key);
  if (!allowed || allowed.functionName !== functionName) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
  return allowed;
};

export async function attachSyntheticBrowserApi({ page, personaKey, binding, identity } = {}) {
  if (!page || typeof page.addInitScript !== 'function' || typeof page.evaluate !== 'function'
    || typeof personaKey !== 'string' || ![...EXPECTED_PERSONA.values()].includes(personaKey)) fail('PR_C_SYNTHETIC_BROWSER_API_ATTACH_REJECTED');
  const normalizedBinding = normalizeBinding(binding);
  let expectedIdentity = identity === undefined ? null : validateIdentity(identity);
  const init = { globalName: BROWSER_API_GLOBAL, personaKey, binding: normalizedBinding, identity: expectedIdentity };
  try {
    await page.addInitScript(installBrowserRuntime, init);
    await page.evaluate(installBrowserRuntime, init);
  } catch (error) { throw safeRuntimeError(error, 'PR_C_SYNTHETIC_BROWSER_API_ATTACH_REJECTED'); }

  let activeAnchor = null;
  return Object.freeze({
    async setIdentity(nextIdentity) {
      expectedIdentity = validateIdentity(nextIdentity);
      await evaluate(page, 'setIdentity', [expectedIdentity], 'PR_C_SYNTHETIC_BROWSER_API_IDENTITY_REJECTED');
      return expectedIdentity;
    },
    async context() { return evaluate(page, 'context', [], 'PR_C_SYNTHETIC_BROWSER_API_CONTEXT_REJECTED'); },
    async verifyStudioTransport() {
      if (personaKey !== 'requester' || activeAnchor) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
      return evaluate(page, 'verifyStudioTransport', [], 'PR_C_SYNTHETIC_BROWSER_API_STUDIO_TRANSPORT_REJECTED');
    },
    async rpc(name, args) {
      if (!CONTROLLED_RPCS.has(name) && !READ_RPCS.has(name)) fail('PR_C_SYNTHETIC_BROWSER_API_ENDPOINT_REJECTED');
      const input = cloneJson(args);
      const controlled = CONTROLLED_RPCS.has(name);
      if (controlled) validateControlledArgs(name, input, normalizedBinding);
      if (name === 'pr_c_controlled_human_anchor_step') {
        const key = `${input.p_checkpoint_id}\0${input.p_step_id}`;
        const action = SERVER_ACTION.get(key);
        if (!action || EXPECTED_PERSONA.get(key) !== personaKey || activeAnchor) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
        const value = await evaluate(page, 'rpc', [name, input, true], 'PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
        if (!record(value) || !record(value.safeAnchor) || !record(value.execution)
          || value.safeAnchor.action !== action.action || !DIGEST.test(value.safeAnchor.challengeToken ?? '') || !UUID.test(value.execution.requestId ?? '')) {
          fail('PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
        }
        activeAnchor = { action, safeAnchor: value.safeAnchor, execution: value.execution, commandSucceeded: false };
        return value;
      }
      if (name === 'pr_c_controlled_human_complete_step' || name === 'pr_c_controlled_human_execute_denied_step') {
        if (!activeAnchor || input.p_challenge_token !== activeAnchor.safeAnchor.challengeToken) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
        const denied = name === 'pr_c_controlled_human_execute_denied_step';
        if ((denied && activeAnchor.action.observationKind !== 'negative_attempt')
          || (!denied && (activeAnchor.action.observationKind !== 'server_event' || !activeAnchor.commandSucceeded))) fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
        const value = await evaluate(page, 'rpc', [name, input, true], 'PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
        activeAnchor = null;
        return value;
      }
      return evaluate(page, 'rpc', [name, input, controlled], 'PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED');
    },
    async invoke(functionName, body, expectation) {
      if (!FUNCTION_ALLOWLIST.has(functionName)) fail('PR_C_SYNTHETIC_BROWSER_API_ENDPOINT_REJECTED');
      const input = cloneJson(body);
      if (!record(input)) fail('PR_C_SYNTHETIC_BROWSER_API_REQUEST_REJECTED');
      if (functionName === 'tenant-session') {
        if (Object.keys(input).length !== 0 || expectation !== undefined) fail('PR_C_SYNTHETIC_BROWSER_API_REQUEST_REJECTED');
        return evaluate(page, 'invoke', [functionName, input], 'PR_C_SYNTHETIC_BROWSER_API_CONTEXT_REJECTED');
      }
      const action = input.commandType;
      if (functionName === 'enterprise-intelligence-query') {
        if (expectation !== undefined || typeof action === 'string') fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
      } else {
        if (typeof action !== 'string' || !UUID.test(input.requestId ?? '') || !SAFE_IDEMPOTENCY_KEY.test(input.idempotencyKey ?? '')) fail('PR_C_SYNTHETIC_BROWSER_API_REQUEST_REJECTED');
        if (activeAnchor) {
          const anchoredExpectation = exactKeys(expectation, ['checkpointId', 'stepId', 'action'])
            && expectation.checkpointId === activeAnchor.action.checkpointId
            && expectation.stepId === activeAnchor.action.stepId
            && expectation.action === activeAnchor.action.action;
          if (activeAnchor.action.observationKind !== 'server_event' || activeAnchor.action.transitionKind !== 'replay_existing'
            || activeAnchor.action.action !== action || input.requestId !== activeAnchor.execution.requestId
            || typeof activeAnchor.execution.businessIdempotencyKey !== 'string'
            || input.idempotencyKey !== activeAnchor.execution.businessIdempotencyKey || !anchoredExpectation
            || functionName !== 'enterprise-intelligence-command') fail('PR_C_SYNTHETIC_BROWSER_API_ACTION_REJECTED');
        } else validateExpectation(expectation, personaKey, functionName, action);
      }
      const value = await evaluate(page, 'invoke', [functionName, input], 'PR_C_SYNTHETIC_BROWSER_API_OUTCOME_UNKNOWN');
      if (activeAnchor) activeAnchor.commandSucceeded = true;
      return value;
    },
    async lastCommand() { return evaluate(page, 'lastCommand', [], 'PR_C_SYNTHETIC_BROWSER_API_RESPONSE_REJECTED'); },
  });
}
