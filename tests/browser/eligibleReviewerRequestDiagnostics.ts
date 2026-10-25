import type { Page, Request } from '@playwright/test';
import { ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA,
  validateEligibleReviewerRequestDiagnostic } from '../../scripts/eligibleReviewerRequestDiagnostic.mjs';

type RouteName = 'queue' | 'workspace' | 'eligible';
const paths: ReadonlyMap<string, RouteName> = new Map([
  ['/rest/v1/rpc/assess_v2_review_queue', 'queue'],
  ['/rest/v1/rpc/assess_v2_review_workspace', 'workspace'],
  ['/rest/v1/rpc/assess_v2_eligible_reviewers', 'eligible'],
] as const);
type Observation = {
  route: RouteName; firstRequestOrdinal: number | null; requestCount: number; responseCount: number;
  pendingCount: number; state: 'not-observed' | 'pending' | 'settled' | 'transport-failed';
  lastHttpStatus: number | null; statusClass: 'unavailable' | 'success' | 'client-error' | 'server-error' | 'other';
  outcome: 'unavailable' | 'pending' | 'empty' | 'success' | 'failed' | 'incomplete';
  elapsedMs: number; elapsedSaturated: boolean;
  pendingStartedAt: number | null;
  latestRequestOrdinal: number | null;
  latestState: 'settled' | 'transport-failed' | null;
  latestOutcome: 'empty' | 'success' | 'failed' | 'incomplete' | null;
  latestHttpStatus: number | null;
  latestStatusClass: Observation['statusClass'];
};
type Selection = { page: Page; pageOrdinal: number; selectionOrdinal: number; startedAt: number; frozen: boolean;
  requestOrdinal: number; ambiguous: boolean; candidateCount: number | null; candidateCountSaturated: boolean;
  observations: Map<RouteName, Observation> };
type RequestBinding = { selection: Selection; route: RouteName; startedAt: number; ordinal: number;
  responseSeen: boolean; bodySeen: boolean; failed: boolean };

const statusClass = (status: number): Observation['statusClass'] => status >= 200 && status <= 299 ? 'success'
  : status >= 400 && status <= 499 ? 'client-error' : status >= 500 && status <= 599 ? 'server-error' : 'other';
const elapsed = (startedAt: number, now: number) => {
  const raw = Math.max(0, Math.round(now - startedAt));
  return { elapsedMs: Math.min(15_000, raw), elapsedSaturated: raw >= 15_000 };
};
const blank = (route: RouteName): Observation => ({ route, firstRequestOrdinal: null, requestCount: 0,
  responseCount: 0, pendingCount: 0, state: 'not-observed', lastHttpStatus: null,
  statusClass: 'unavailable', outcome: 'unavailable', elapsedMs: 0, elapsedSaturated: false,
  pendingStartedAt: null, latestRequestOrdinal: null, latestState: null, latestOutcome: null,
  latestHttpStatus: null, latestStatusClass: 'unavailable' });

export const createEligibleReviewerRequestDiagnostics = ({ backendOrigin, now = () => performance.now() }:
Readonly<{ backendOrigin: string; now?: () => number }>) => {
  const pages = new Map<Page, number>();
  const selections = new Map<Page, Selection>();
  const requests = new WeakMap<Request, RequestBinding>();
  let pageOrdinal = 0;
  const registerPage = (page: Page) => {
    if (!pages.has(page) && pageOrdinal < 9) pages.set(page, ++pageOrdinal);
  };
  const beginSelection = (page: Page) => {
    registerPage(page);
    const prior = selections.get(page);
    if (prior) prior.frozen = true;
    if (!pages.has(page) || (prior?.selectionOrdinal ?? 0) >= 9) return null;
    const selectionOrdinal = (prior?.selectionOrdinal ?? 0) + 1;
    const selection: Selection = { page, pageOrdinal: pages.get(page)!, selectionOrdinal, startedAt: now(),
      frozen: false, requestOrdinal: 0, ambiguous: false, candidateCount: null, candidateCountSaturated: false,
      observations: new Map([
        ['queue', blank('queue')], ['workspace', blank('workspace')], ['eligible', blank('eligible')],
      ]) };
    selections.set(page, selection);
    return Object.freeze({ page, pageOrdinal: selection.pageOrdinal, selectionOrdinal });
  };
  const locate = (request: Request) => {
    try {
      if (request.method() !== 'POST') return null;
      const url = new URL(request.url());
      if (url.origin !== backendOrigin) return null;
      const route = paths.get(url.pathname);
      if (!route) return null;
      const page = request.frame().page();
      const selection = selections.get(page);
      return selection && !selection.frozen ? { selection, route } : null;
    } catch { return null; }
  };
  const onRequest = (request: Request) => {
    if (requests.has(request)) return;
    const located = locate(request);
    if (!located) return;
    const { selection, route } = located;
    const observation = selection.observations.get(route)!;
    if (selection.requestOrdinal >= 99) { selection.ambiguous = true; return; }
    selection.requestOrdinal += 1;
    if (observation.requestCount > 0) selection.ambiguous = true;
    observation.firstRequestOrdinal ??= selection.requestOrdinal;
    observation.latestRequestOrdinal = selection.requestOrdinal;
    observation.requestCount = Math.min(99, observation.requestCount + 1);
    observation.pendingCount = Math.min(99, observation.pendingCount + 1);
    observation.pendingStartedAt ??= now();
    observation.state = 'pending'; observation.outcome = 'pending';
    observation.lastHttpStatus = null; observation.statusClass = 'unavailable';
    observation.elapsedMs = 0; observation.elapsedSaturated = false;
    observation.latestState = null; observation.latestOutcome = null;
    observation.latestHttpStatus = null; observation.latestStatusClass = 'unavailable';
    if (route === 'eligible') {
      selection.candidateCount = null;
      selection.candidateCountSaturated = false;
    }
    requests.set(request, { selection, route, startedAt: now(), ordinal: selection.requestOrdinal,
      responseSeen: false, bodySeen: false, failed: false });
  };
  const onResponse = (request: Request, status: number) => {
    const binding = requests.get(request);
    if (!binding || binding.responseSeen || binding.failed || binding.selection.frozen
      || selections.get(binding.selection.page) !== binding.selection) return;
    binding.responseSeen = true;
    const observation = binding.selection.observations.get(binding.route)!;
    observation.responseCount = Math.min(99, observation.responseCount + 1);
    observation.pendingCount = Math.max(0, observation.pendingCount - 1);
    if (observation.pendingCount === 0) observation.pendingStartedAt = null;
    if (binding.ordinal === observation.latestRequestOrdinal) {
      observation.latestState = 'settled';
      observation.latestHttpStatus = Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : null;
      observation.latestStatusClass = observation.latestHttpStatus === null ? 'other' : statusClass(observation.latestHttpStatus);
      observation.latestOutcome = observation.latestStatusClass === 'success'
        ? (status === 204 ? 'empty' : 'incomplete') : 'failed';
      observation.state = observation.pendingCount > 0 ? 'pending' : observation.latestState;
      observation.outcome = observation.pendingCount > 0 ? 'pending' : observation.latestOutcome;
      observation.lastHttpStatus = observation.pendingCount > 0 ? null : observation.latestHttpStatus;
      observation.statusClass = observation.pendingCount > 0 ? 'unavailable' : observation.latestStatusClass;
      Object.assign(observation, elapsed(binding.startedAt, now()));
    } else if (observation.pendingCount === 0 && observation.latestState && observation.latestOutcome) {
      observation.state = observation.latestState; observation.outcome = observation.latestOutcome;
      observation.lastHttpStatus = observation.latestHttpStatus;
      observation.statusClass = observation.latestStatusClass;
    }
  };
  const onResponseBody = (request: Request, body: unknown) => {
    const binding = requests.get(request);
    if (!binding || !binding.responseSeen || binding.bodySeen || binding.failed || binding.selection.frozen
      || selections.get(binding.selection.page) !== binding.selection) return;
    binding.bodySeen = true;
    const observation = binding.selection.observations.get(binding.route)!;
    if (binding.route !== 'eligible' || binding.ordinal !== observation.latestRequestOrdinal
      || observation.latestStatusClass !== 'success') return;
    if (!Array.isArray(body)) return;
    if (body.length > 99) {
      binding.selection.ambiguous = true;
      observation.latestOutcome = 'incomplete';
      observation.outcome = observation.pendingCount > 0 ? 'pending' : 'incomplete';
      binding.selection.candidateCount = 99;
      binding.selection.candidateCountSaturated = true;
      return;
    }
    const valid = body.every(item => item !== null && typeof item === 'object' && !Array.isArray(item)
      && typeof (item as Record<string, unknown>).actorId === 'string'
      && typeof (item as Record<string, unknown>).label === 'string'
      && Number.isSafeInteger((item as Record<string, unknown>).authorizationVersion));
    if (!valid) return;
    observation.latestOutcome = body.length === 0 ? 'empty' : 'success';
    observation.outcome = observation.pendingCount > 0 ? 'pending' : observation.latestOutcome;
    binding.selection.candidateCount = body.length;
    binding.selection.candidateCountSaturated = false;
  };
  const onRequestFailed = (request: Request) => {
    const binding = requests.get(request);
    if (!binding || binding.failed || binding.bodySeen || binding.selection.frozen
      || selections.get(binding.selection.page) !== binding.selection) return;
    binding.failed = true;
    const observation = binding.selection.observations.get(binding.route)!;
    if (!binding.responseSeen) observation.pendingCount = Math.max(0, observation.pendingCount - 1);
    if (observation.pendingCount === 0) observation.pendingStartedAt = null;
    if (binding.ordinal === observation.latestRequestOrdinal) {
      observation.latestState = 'transport-failed'; observation.latestOutcome = 'failed';
      observation.latestHttpStatus = 0; observation.latestStatusClass = 'other';
      observation.state = observation.pendingCount > 0 ? 'pending' : 'transport-failed';
      observation.lastHttpStatus = observation.pendingCount > 0 ? null : 0;
      observation.statusClass = observation.pendingCount > 0 ? 'unavailable' : 'other';
      observation.outcome = observation.pendingCount > 0 ? 'pending' : 'failed';
      binding.selection.candidateCount = binding.route === 'eligible' ? null : binding.selection.candidateCount;
      binding.selection.candidateCountSaturated = binding.route === 'eligible'
        ? false : binding.selection.candidateCountSaturated;
      Object.assign(observation, elapsed(binding.startedAt, now()));
    } else if (observation.pendingCount === 0 && observation.latestState && observation.latestOutcome) {
      observation.state = observation.latestState; observation.outcome = observation.latestOutcome;
      observation.lastHttpStatus = observation.latestHttpStatus;
      observation.statusClass = observation.latestStatusClass;
    }
  };
  const freeze = (handle: Readonly<{ page: Page; pageOrdinal: number; selectionOrdinal: number }> | null,
    project: string, ui: Readonly<{ workspace: string; candidates: string }>) => {
    if (!handle) return null;
    const selection = selections.get(handle.page);
    if (!selection || selection.frozen || selection.pageOrdinal !== handle.pageOrdinal
      || selection.selectionOrdinal !== handle.selectionOrdinal) return null;
    selection.frozen = true;
    const totalElapsed = elapsed(selection.startedAt, now());
    return validateEligibleReviewerRequestDiagnostic({
      schemaVersion: ELIGIBLE_REVIEWER_REQUEST_DIAGNOSTIC_SCHEMA, project,
      testCategory: 'govern-studio-lifecycle', assertion: 'eligible-reviewer-visible',
      pageOrdinal: selection.pageOrdinal, selectionOrdinal: selection.selectionOrdinal, frozen: true,
      ...totalElapsed, requests: ['queue', 'workspace', 'eligible'].map(route => {
        const observed = selection.observations.get(route as RouteName)!;
        const pendingElapsed = observed.pendingStartedAt === null ? null : elapsed(observed.pendingStartedAt, now());
        return { route: observed.route, firstRequestOrdinal: observed.firstRequestOrdinal,
          requestCount: observed.requestCount, responseCount: observed.responseCount,
          pendingCount: observed.pendingCount, state: observed.pendingCount > 0 ? 'pending' : observed.state,
          lastHttpStatus: observed.lastHttpStatus, statusClass: observed.statusClass,
          outcome: observed.pendingCount > 0 ? 'pending' : observed.outcome,
          elapsedMs: pendingElapsed?.elapsedMs ?? observed.elapsedMs,
          elapsedSaturated: pendingElapsed?.elapsedSaturated ?? observed.elapsedSaturated };
      }), decisionBinding: selection.ambiguous ? 'ambiguous' : 'unavailable',
      candidateCount: (selection.ambiguous && !selection.candidateCountSaturated)
        || selection.observations.get('eligible')!.pendingCount > 0
        ? null : selection.candidateCount,
      candidateCountSaturated: (selection.ambiguous && !selection.candidateCountSaturated)
        || selection.observations.get('eligible')!.pendingCount > 0
        ? false : selection.candidateCountSaturated,
      correlation: selection.ambiguous ? 'ambiguous' : 'exact', ui,
    });
  };
  return Object.freeze({ registerPage, beginSelection, onRequest, onResponse, onResponseBody, onRequestFailed, freeze });
};
