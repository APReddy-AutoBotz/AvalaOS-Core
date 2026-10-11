import { isDeepStrictEqual } from 'node:util';
import {
  AUTHENTICATED_ACCEPTANCE_PROJECTS,
  AUTHENTICATED_ACCEPTANCE_TEST_IDS,
  authenticatedAcceptanceScenario,
} from './authenticatedAcceptanceCases.mjs';
import { requireAuthenticatedHostedBinding } from './authenticatedAcceptanceProfile.mjs';
import {
  authenticatedEvidenceDigest,
  compareAuthenticatedObservation,
  validateAuthenticatedBrowserCorrelations,
} from './authenticatedBrowserCorrelation.mjs';
import { validateAuthenticatedServerObservations } from './authenticatedHostedObserver.mjs';

export const AUTHENTICATED_HOSTED_EVIDENCE_SCHEMA = 'authenticated-acceptance-evidence-v2';
export const AUTHENTICATED_MEASUREMENT_KEYS = Object.freeze([
  'logicalMutations', 'domainWrites', 'generationAttemptWrites', 'receiptWrites', 'auditWrites',
  'secretWrites', 'storageWrites', 'providerCalls', 'paidCalls', 'providerTokens', 'budgetReservations', 'budgetDebits',
  'foreignWrites', 'concurrencyWrites',
]);
const countKey = Object.freeze({
  domain: 'domainWrites', generation_attempt: 'generationAttemptWrites',
  receipt: 'receiptWrites', audit: 'auditWrites', secret: 'secretWrites', storage: 'storageWrites',
  provider_call: 'providerCalls', paid_call: 'paidCalls', provider_token: 'providerTokens',
  budget_reservation: 'budgetReservations', budget_debit: 'budgetDebits',
  foreign: 'foreignWrites',
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, names) => object(value) && isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
const participantKey = value => `${value.persona}:${value.actorHash}:${value.sessionHash}`;
const sortedParticipants = value => [...value].map(participantKey).sort();
const caseKey = value => `${value.testId}:${value.project}`;
const frameIndex = frame => new Map(frame.records.map(row => [row.recordHash, row]));
const changedRows = observation => {
  const before = frameIndex(observation.before);
  const after = frameIndex(observation.after);
  const changes = [];
  for (const recordHash of new Set([...before.keys(), ...after.keys()])) {
    const prior = before.get(recordHash) ?? null;
    const current = after.get(recordHash) ?? null;
    if (!prior || !current || prior.rowHash !== current.rowHash || prior.active !== current.active) {
      changes.push({ prior, current, row: current ?? prior });
    }
  }
  return changes;
};
const targetHash = frame => authenticatedEvidenceDigest(frame.records
  .filter(row => ['domain', 'secret', 'storage'].includes(row.effectKind))
  .map(row => ({ source: row.source, recordHash: row.recordHash, businessRowHash: row.businessRowHash }))
  .sort((a, b) => a.recordHash.localeCompare(b.recordHash)));
const responseDenied = response => response.status >= 400 || [
  'AUTHORIZATION_DENIED', 'CAPABILITY_DENIED', 'CONFLICT', 'STALE_VERSION', 'NETWORK_OFFLINE', 'NETWORK_TIMEOUT',
  'NETWORK_ABORTED', 'PROVIDER_DISABLED', 'SERVER_ERROR_PRECOMMIT',
].includes(response.classification);

// Focused executable seam for the disposable PostgreSQL adapter test. The full
// producer below remains the only acceptance entry point and still requires
// the complete 94-case inventory plus cleanup evidence.
export const reconstructAuthenticatedHostedCaseEvidence = ({ browser, server, definition }) => {
  const key = caseKey(browser);
  const errors = [];
  if (browser.scenario !== server.scenario || !isDeepStrictEqual(browser.window, server.window)) {
    errors.push(`authenticated-case-window-source-mismatch:${key}`);
  }
  if (!isDeepStrictEqual(sortedParticipants(browser.participants), sortedParticipants(server.participants))) {
    errors.push(`authenticated-case-participant-source-mismatch:${key}`);
  }
  const actionsByBinding = new Map();
  for (const action of browser.actions) {
    const values = actionsByBinding.get(action.commandBindingHash) ?? [];
    values.push(action);
    actionsByBinding.set(action.commandBindingHash, values);
  }
  const matchingAction = row => (actionsByBinding.get(row.commandBindingHash) ?? []).find(action =>
    action.requestIdHash === row.requestIdHash && action.actorHash === row.actorHash
    && action.sessionHash === row.sessionHash
    && (!row.commandIdHash || action.response.commandIdHash === row.commandIdHash)
    && (!row.receiptIdHash || action.response.receiptIdHash === row.receiptIdHash)) ?? null;
  const changes = changedRows(server);
  const measurements = Object.fromEntries(AUTHENTICATED_MEASUREMENT_KEYS.map(name => [name, 0]));
  const logicalRequests = new Set();
  let exactPermitPayloadObserved = false;
  for (const change of changes) {
    const row = change.row;
    const concurrencyOnly = row.effectKind === 'domain' && change.prior && change.current
      && change.prior.businessRowHash === change.current.businessRowHash
      && change.prior.rowHash !== change.current.rowHash;
    const measurement = countKey[row.effectKind];
    if (concurrencyOnly) measurements.concurrencyWrites += 1;
    else if (measurement) measurements[measurement] += 1;
    if (row.classification === 'immutable_history' && change.current === null) {
      errors.push(`authenticated-immutable-history-removed:${key}`);
    }
    if (row.effectKind === 'control') {
      if (row.commandBindingHash && row.requestIdHash && row.persistedPayloadHash) {
        const action = matchingAction(row);
        if (!action || action.requestIdHash !== row.requestIdHash
          || action.browserPayloadHash !== row.persistedPayloadHash) {
          errors.push(`authenticated-permit-payload-mismatch:${key}`);
        } else exactPermitPayloadObserved = true;
      }
      continue;
    }
    if (!row.requestIdHash || !row.commandBindingHash) {
      errors.push(`authenticated-change-binding-missing:${key}`); continue;
    }
    const action = matchingAction(row);
    if (!action || action.requestIdHash !== row.requestIdHash) {
      errors.push(`authenticated-change-browser-mismatch:${key}`); continue;
    }
    if (row.actorHash !== action.actorHash || row.sessionHash !== action.sessionHash) {
      errors.push(`authenticated-change-actor-mismatch:${key}`);
    }
    if (row.commandIdHash && action.response.commandIdHash !== row.commandIdHash) {
      errors.push(`authenticated-change-command-mismatch:${key}`);
    }
    if (row.receiptIdHash && action.response.receiptIdHash !== row.receiptIdHash) {
      errors.push(`authenticated-change-receipt-mismatch:${key}`);
    }
    if (change.current && (Date.parse(row.occurredAt) < Date.parse(browser.window.startedAt)
      || Date.parse(row.occurredAt) > Date.parse(browser.window.completedAt))) errors.push(`authenticated-change-window:${key}`);
    if (!concurrencyOnly && ['domain', 'secret'].includes(row.effectKind)) logicalRequests.add(row.requestIdHash);
  }
  measurements.logicalMutations = logicalRequests.size;
  for (const action of browser.actions) {
    if (action.response.commandIdHash && !server.after.records.some(row => row.commandIdHash === action.response.commandIdHash
      && matchingAction(row) === action)) {
      errors.push(`authenticated-command-frame-missing:${key}`);
    }
    if (action.response.receiptIdHash && !server.after.records.some(row => row.effectKind === 'receipt'
      && row.receiptIdHash === action.response.receiptIdHash && matchingAction(row) === action)) {
      errors.push(`authenticated-receipt-frame-missing:${key}`);
    }
  }
  const assertions = browser.assertions.map(observation => ({
    id: observation.id,
    status: compareAuthenticatedObservation(observation) ? 'PASS' : 'FAIL',
  }));
  const assertionStatus = assertions.some(assertion => assertion.status === 'FAIL') ? 'FAIL' : 'PASS';
  const beforeHash = targetHash(server.before);
  const afterHash = targetHash(server.after);
  if (measurements.providerCalls || measurements.paidCalls || measurements.providerTokens
    || measurements.budgetReservations || measurements.budgetDebits || measurements.foreignWrites) {
    errors.push(`authenticated-forbidden-effect:${key}`);
  }
  if (measurements.logicalMutations !== definition.expectedMutationCount) errors.push(`authenticated-business-mutation:${key}`);
  if (definition.expectedMutationCount === 0 && browser.testId !== 'STUDIO-003'
    && (measurements.domainWrites || measurements.reservationWrites || measurements.generationAttemptWrites
      || measurements.receiptWrites || measurements.auditWrites || measurements.secretWrites || measurements.storageWrites
      || beforeHash !== afterHash)) errors.push(`authenticated-zero-write:${key}`);
  if (browser.testId === 'STUDIO-003'
    && (measurements.domainWrites !== 0 || measurements.generationAttemptWrites !== 1 || measurements.receiptWrites !== 1
      || measurements.auditWrites !== 2 || measurements.secretWrites !== 0 || measurements.storageWrites !== 0
      || measurements.concurrencyWrites !== 1 || beforeHash !== afterHash)) {
    errors.push(`authenticated-generation-failure-journal:${key}`);
  }
  if (browser.testId !== 'STUDIO-003' && measurements.concurrencyWrites !== 0) {
    errors.push(`authenticated-unexpected-concurrency-write:${key}`);
  }
  if (['STUDIO-003', 'SAFETY-002'].includes(browser.testId) && !exactPermitPayloadObserved) {
    errors.push(`authenticated-permit-payload-missing:${key}`);
  }
  if (definition.expectedMutationCount > 0 && (measurements.domainWrites + measurements.secretWrites < 1
    || beforeHash === afterHash)) errors.push(`authenticated-positive-write:${key}`);
  if (definition.expectedMutationCount > 0 && definition.expectedAudit === 'required for privileged mutation'
    && (measurements.receiptWrites < 1 || measurements.auditWrites < 1)) errors.push(`authenticated-privileged-audit:${key}`);
  if (browser.testId === 'AI-004' && (measurements.logicalMutations !== 1 || measurements.secretWrites !== 1
    || measurements.receiptWrites !== 1 || measurements.auditWrites !== 1)) errors.push(`authenticated-secret-boundary:${key}`);
  const denialObserved = browser.actions.some(action => responseDenied(action.response));
  if (definition.expectedDenial === true && !denialObserved) errors.push(`authenticated-denial-not-observed:${key}`);
  if (errors.length) throw new Error(errors.join(','));
  const lineageRows = server.after.records.filter(row => row.effectKind === 'domain');
  return {
    testId: browser.testId,
    project: browser.project,
    scenario: authenticatedAcceptanceScenario(browser.testId),
    status: assertionStatus,
    observedAt: browser.window.completedAt,
    participants: structuredClone(browser.participants),
    measurements: { ...measurements, beforeHash, afterHash, denialObserved },
    ui: { actionCount: browser.actions.length, source: browser.source, secretExposure: false },
    lineage: definition.expectedLineage ? {
      chainDigest: authenticatedEvidenceDigest(lineageRows.map(row => ({ source: row.source, recordHash: row.recordHash, rowHash: row.rowHash }))),
      organizationHashes: [...new Set(lineageRows.map(row => row.organizationHash))].sort(),
      workspaceHashes: [...new Set(lineageRows.map(row => row.workspaceHash))].sort(),
      serverDerived: true,
    } : null,
    assertions,
    failureCode: assertionStatus === 'PASS' ? null : 'assertion_failed',
  };
};

export function produceAuthenticatedHostedEvidence({ binding, browserCorrelations, serverObservations, catalog }) {
  requireAuthenticatedHostedBinding(binding, binding);
  const browserErrors = validateAuthenticatedBrowserCorrelations(browserCorrelations, binding);
  const serverErrors = validateAuthenticatedServerObservations(serverObservations, binding);
  if (browserErrors.length || serverErrors.length) throw new Error([...browserErrors, ...serverErrors].join(','));
  const browserIndex = new Map(browserCorrelations.cases.map(row => [caseKey(row), row]));
  const serverIndex = new Map(serverObservations.cases.map(row => [caseKey(row), row]));
  const cases = [];
  for (const testId of AUTHENTICATED_ACCEPTANCE_TEST_IDS) for (const project of AUTHENTICATED_ACCEPTANCE_PROJECTS) {
    const key = `${testId}:${project}`;
    const definition = catalog.cases.find(item => item.testId === testId);
    if (!definition || definition.environment !== 'hosted_authenticated_synthetic') throw new Error(`authenticated-catalog-case:${key}`);
    cases.push(reconstructAuthenticatedHostedCaseEvidence({
      browser: browserIndex.get(key), server: serverIndex.get(key), definition,
    }));
  }
  const resources = serverObservations.cleanup.resources;
  const cleanup = {
    capturedAt: serverObservations.cleanup.capturedAt,
    activeTransientResidue: resources.filter(resource => resource.classification === 'transient' && resource.status === 'active').length,
    removedOrRevokedTransientResources: resources.filter(resource => resource.classification === 'transient'
      && ['removed', 'revoked', 'disarmed', 'inactive'].includes(resource.status)).length,
    retainedImmutableHistory: resources.filter(resource => resource.classification === 'retained_immutable'
      && ['preserved', 'inactive'].includes(resource.status)).length,
    nonExerciseStateHash: serverObservations.cleanup.nonExerciseStateAfterHash,
    digest: authenticatedEvidenceDigest(serverObservations.cleanup),
  };
  return {
    schemaVersion: AUTHENTICATED_HOSTED_EVIDENCE_SCHEMA,
    binding: structuredClone(binding),
    browserCorrelations: structuredClone(browserCorrelations),
    serverObservations: structuredClone(serverObservations),
    cases,
    cleanup,
  };
}

export function validateAuthenticatedHostedEvidence(manifest, expected, catalog) {
  if (!exact(manifest, ['schemaVersion', 'binding', 'browserCorrelations', 'serverObservations', 'cases', 'cleanup'])
    || manifest.schemaVersion !== AUTHENTICATED_HOSTED_EVIDENCE_SCHEMA) return ['authenticated-manifest-shape'];
  try {
    requireAuthenticatedHostedBinding(manifest.binding, expected);
    const reconstructed = produceAuthenticatedHostedEvidence({
      binding: expected,
      browserCorrelations: manifest.browserCorrelations,
      serverObservations: manifest.serverObservations,
      catalog,
    });
    if (!isDeepStrictEqual(reconstructed, manifest)) return ['authenticated-reconstruction-mismatch'];
    return [];
  } catch (error) {
    return [`authenticated-reconstruction-invalid:${error instanceof Error ? error.message : 'unknown'}`];
  }
}
