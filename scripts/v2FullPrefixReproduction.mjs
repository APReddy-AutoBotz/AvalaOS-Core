const VARIANTS = Object.freeze(['immediate', 'barrier']);
const READ_STAGES = new Set([
  'case-discovery', 'case', 'decision', 'draft-head', 'primitives', 'edges',
  'decision-points', 'exception-paths', 'application-assets', 'application-interactions', 'evidence-links',
]);
const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const boolean = value => value === true;

export function resolveV2FullPrefixLocalSelection({ variant, authenticated, hosted, mode }) {
  if (!variant) return null;
  if (!VARIANTS.includes(variant)) throw new Error('ENTERPRISE_LIFECYCLE_V2_FULL_PREFIX_REPRODUCTION_REJECTED');
  if (authenticated !== true || hosted === true || mode !== 'full_acceptance') {
    throw new Error('ENTERPRISE_LIFECYCLE_V2_FULL_PREFIX_REPRODUCTION_SCOPE_REJECTED');
  }
  return variant;
}
const stage = value => {
  if (!value || typeof value !== 'object' || !READ_STAGES.has(value.stage)) return null;
  const lifecycle = value.lifecycle && typeof value.lifecycle === 'object' ? value.lifecycle : {};
  const failures = lifecycle.transportFailures && typeof lifecycle.transportFailures === 'object'
    ? lifecycle.transportFailures : {};
  return Object.freeze({
    stage: value.stage,
    status: ['passed', 'failed', 'not_reached'].includes(value.status) ? value.status : 'failed',
    httpStatus: Number.isInteger(value.httpStatus) ? value.httpStatus : null,
    rowCount: Number.isSafeInteger(value.rowCount) && value.rowCount >= 0 ? value.rowCount : null,
    lifecycle: Object.freeze({
      requested: number(lifecycle.requested), responseStarted: number(lifecycle.responseStarted),
      completed: number(lifecycle.completed), transportFailed: number(lifecycle.transportFailed),
      pending: number(lifecycle.pending), bodyCompleted: number(lifecycle.bodyCompleted),
      bodyFailed: number(lifecycle.bodyFailed), bodyPending: number(lifecycle.bodyPending),
      transportFailures: Object.freeze({
        aborted: number(failures.aborted), timeout: number(failures.timeout),
        connection: number(failures.connection), protocol: number(failures.protocol),
        blocked: number(failures.blocked), other: number(failures.other),
      }),
    }),
  });
};
const browser = (value, variant) => {
  if (!value || typeof value !== 'object') return null;
  return Object.freeze({
    variant,
    navigation: value.navigation === 'passed' ? 'passed' : 'failed',
    renderOutcome: ['resumed', 'workspace_error', 'public_screen', 'unresolved'].includes(value.renderOutcome)
      ? value.renderOutcome : 'unresolved',
    observerFailure: value.observerFailure !== false,
    serverContextObserved: boolean(value.serverContextObserved),
    sessionObserved: boolean(value.sessionObserved),
    scopeNavigationObserved: boolean(value.scopeNavigationObserved),
    processNavigationObserved: boolean(value.processNavigationObserved),
    readStages: Object.freeze((Array.isArray(value.readStages) ? value.readStages : [])
      .map(stage).filter(item => item !== null)),
    barrier: value.barrier === 'lifecycle-frame' ? 'lifecycle-frame' : 'none',
    diagnosticCheckpointEquivalent: false,
    lifecycleFrameCaptured: boolean(value.lifecycleFrameCaptured),
    caseDelta: Number.isSafeInteger(value.caseDelta) ? value.caseDelta : null,
    caseVersionDelta: Number.isSafeInteger(value.caseVersionDelta) ? value.caseVersionDelta : null,
    failureStage: ['navigation', 'render', 'read-observer', 'browser-state', 'network-queue',
      'lifecycle-frame', 'assertion'].includes(value.failureStage) ? value.failureStage : null,
    queues: Object.freeze({
      network: ['passed', 'failed'].includes(value.queues?.network) ? value.queues.network : 'not_run',
      cases: ['passed', 'failed'].includes(value.queues?.cases) ? value.queues.cases : 'not_run',
    }),
  });
};
const controller = value => value && typeof value === 'object' ? Object.freeze({
  browserCaseCount: number(value.browserCaseCount),
  serverCaseCount: number(value.serverCaseCount),
  actionCount: number(value.actionCount),
  completedActionCount: number(value.completedActionCount),
  caseIds: Object.freeze((Array.isArray(value.caseIds) ? value.caseIds : [])
    .filter(item => typeof item === 'string' && /^[A-Z]+-[0-9]{3}$/u.test(item))),
  contractSatisfied: boolean(value.contractSatisfied),
}) : null;

export function buildV2FullPrefixVariantResult(input) {
  const variant = VARIANTS.includes(input?.variant) ? input.variant : 'immediate';
  const safeBrowser = browser(input?.browser, variant);
  const safeController = controller(input?.controller);
  const execution = input?.execution === 'passed' ? 'passed' : 'failed';
  const cleanup = ['passed', 'failed'].includes(input?.cleanup) ? input.cleanup : 'not_started';
  const readStages = safeBrowser?.readStages ?? [];
  const passed = input?.artifactObserved === true && execution === 'passed' && cleanup === 'passed'
    && safeBrowser?.navigation === 'passed' && safeBrowser.renderOutcome === 'resumed'
    && safeBrowser.observerFailure === false && safeBrowser.serverContextObserved
    && safeBrowser.sessionObserved && safeBrowser.scopeNavigationObserved && safeBrowser.processNavigationObserved
    && readStages.length === 11 && readStages.every(item => item.status === 'passed'
      && item.lifecycle.completed > 0 && item.lifecycle.pending === 0
      && item.lifecycle.bodyCompleted > 0 && item.lifecycle.bodyFailed === 0 && item.lifecycle.bodyPending === 0)
    && safeBrowser.barrier === (variant === 'barrier' ? 'lifecycle-frame' : 'none')
    && safeBrowser.lifecycleFrameCaptured && safeBrowser.caseDelta === 1 && safeBrowser.caseVersionDelta === 1
    && safeBrowser.failureStage === null && safeBrowser.queues.network === 'passed'
    && safeBrowser.queues.cases === 'passed' && safeController?.contractSatisfied === true;
  return Object.freeze({
    variant,
    status: passed ? 'passed' : 'failed',
    execution,
    cleanup,
    artifactObserved: input?.artifactObserved === true,
    browser: safeBrowser,
    controller: safeController,
    network: input?.network && typeof input.network === 'object' ? Object.freeze({
      observedHttpRequests: number(input.network.observedHttpRequests),
      nonLoopbackRequests: number(input.network.nonLoopbackRequests),
    }) : null,
  });
}

export async function runIndependentV2FullPrefixVariants(execute) {
  const results = [];
  for (const variant of VARIANTS) {
    try { results.push(buildV2FullPrefixVariantResult(await execute(variant))); }
    catch { results.push(buildV2FullPrefixVariantResult({ variant })); }
  }
  return Object.freeze(results);
}

export function buildV2FullPrefixResult({ variants, native, baseline }) {
  const safeVariants = Object.freeze(VARIANTS.map(variant =>
    buildV2FullPrefixVariantResult(variants?.find(item => item?.variant === variant) ?? { variant })));
  const safeNative = Object.freeze({
    active: number(native?.active), requests: number(native?.requests), responses: number(native?.responses),
    completed: number(native?.completed), cancelled: number(native?.cancelled), failed: number(native?.failed),
    statusClasses: Object.freeze(Object.fromEntries(Object.entries(native?.statusClasses ?? {})
      .filter(([key, value]) => /^[1-5][0-9]{2}$/u.test(key) && Number.isSafeInteger(value) && value >= 0))),
  });
  const passed = safeVariants.every(item => item.status === 'passed')
    && safeNative.active === 0 && safeNative.failed === 0 && safeNative.requests > 0;
  const reproduced = safeVariants.some(item => item.browser?.navigation === 'passed'
    && item.browser.renderOutcome !== 'resumed');
  return Object.freeze({
    schemaVersion: 'v2-full-prefix-local-reproduction-v1',
    status: passed ? 'passed' : 'failed',
    source: Object.freeze({
      baseline: /^[a-f0-9]{40}$/u.test(baseline ?? '') ? baseline : 'unknown',
      localOnly: true,
    }),
    conclusion: passed ? 'not_reproduced' : reproduced ? 'reproduced' : 'inconclusive',
    variants: safeVariants,
    native: safeNative,
    authority: Object.freeze({
      hostedAccess: false,
      paidCalls: 0,
      criteriaChanged: false,
      journeyTimeoutChanged: false,
      journeyTimeoutMs: 300_000,
      aggregateInfrastructureBudgetMs: 780_000,
    }),
  });
}
