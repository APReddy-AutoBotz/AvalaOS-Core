import { expect, type Page, type Request, type Response } from '@playwright/test';
import { authenticatedLifecycleValidateProcessNavigation } from './authenticatedLifecycleHarness';

export type AuthenticatedAcceptanceMode = 'full_acceptance' | 'v2_primary_prefix_diagnostic';
export type V2ReloadDiagnosticPhase = 'before-create' | 'before-reload' | 'after-reload';
export type V2ReloadRenderOutcome = 'resumed' | 'workspace_error' | 'public_screen' | 'unresolved';
export type V2ReloadReadStage = typeof V2_RELOAD_READ_STAGES[number];
export type V2ReloadReadStageStatus = 'passed' | 'failed' | 'not_reached';

export type V2ReloadReadStageLifecycle = Readonly<{
  requested: number;
  responseStarted: number;
  completed: number;
  transportFailed: number;
  pending: number;
  bodyCompleted: number;
  bodyFailed: number;
  bodyPending: number;
  transportFailures: Readonly<{
    aborted: number;
    timeout: number;
    connection: number;
    protocol: number;
    blocked: number;
    other: number;
  }>;
}>;

export type V2ReloadReadStageObservation = Readonly<{
  stage: V2ReloadReadStage;
  status: V2ReloadReadStageStatus;
  httpStatus: number | null;
  rowCount: number | null;
  lifecycle: V2ReloadReadStageLifecycle;
}>;

export type V2ReloadReadObservation = Readonly<{
  serverContextObserved: boolean;
  readStages: readonly V2ReloadReadStageObservation[];
}>;

export type V2ReloadReadObserverCompletion = Readonly<{
  observation: V2ReloadReadObservation;
  observerFailure: boolean;
}>;

export type V2ReloadDiagnosticCheckpoint = Readonly<{
  schemaVersion: 'authenticated-v2-reload-checkpoint-v2';
  phase: V2ReloadDiagnosticPhase;
  projectName: string;
  persona: 'author';
  accessToken: string | null;
  browser: Readonly<{
    sessionObserved: boolean;
    selectedScopeObserved: boolean;
    selectedProcessObserved: boolean;
    serverContextObserved: boolean;
    resumedDraftRendered: boolean;
    failureRendered: boolean;
    readStages: readonly V2ReloadReadStageObservation[];
  }>;
}>;

export type V2ReloadDiagnosticCheckpointResponse = Readonly<{
  recorded: true;
  phase: V2ReloadDiagnosticPhase;
  sessionContinuity: 'verified' | 'missing' | 'invalid';
  continue: boolean;
}>;

export const V2_RELOAD_READ_STAGES = Object.freeze([
  'case-discovery',
  'case',
  'decision',
  'draft-head',
  'primitives',
  'edges',
  'decision-points',
  'exception-paths',
  'application-assets',
  'application-interactions',
  'evidence-links',
] as const);

const SERIAL_READ_STAGES = V2_RELOAD_READ_STAGES.slice(0, 4);
const CHILD_READ_STAGES = new Set<V2ReloadReadStage>(V2_RELOAD_READ_STAGES.slice(4));
const V2_RELOAD_ROW_COUNT_CAP = 10_000;
const V2_RELOAD_REQUEST_COUNT_CAP = 8;
const V2_RELOAD_RENDER_TIMEOUT_MS = 20_000;
const phaseOrder = Object.freeze<V2ReloadDiagnosticPhase[]>(['before-create', 'before-reload', 'after-reload']);
const notReachedStages = () => V2_RELOAD_READ_STAGES.map(stage => Object.freeze({
  stage,
  status: 'not_reached' as const,
  httpStatus: null,
  rowCount: null,
  lifecycle: Object.freeze({
    requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
    bodyCompleted: 0, bodyFailed: 0, bodyPending: 0,
    transportFailures: Object.freeze({ aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 }),
  }),
}));

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
};

const fixedError = (code: string) => new Error(`AUTHENTICATED_V2_RELOAD_${code}`);

const validateReadStageLifecycle = (input: unknown, status: V2ReloadReadStageStatus): V2ReloadReadStageLifecycle => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !exactKeys(input as Record<string, unknown>, [
      'requested', 'responseStarted', 'completed', 'transportFailed', 'pending',
      'bodyCompleted', 'bodyFailed', 'bodyPending',
      'transportFailures',
    ])) throw fixedError('READ_STAGE_LIFECYCLE_REJECTED');
  const row = input as Record<string, unknown>;
  for (const key of [
    'requested', 'responseStarted', 'completed', 'transportFailed', 'pending',
    'bodyCompleted', 'bodyFailed', 'bodyPending',
  ] as const) {
    if (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0
      || (row[key] as number) > V2_RELOAD_REQUEST_COUNT_CAP) {
      throw fixedError('READ_STAGE_LIFECYCLE_REJECTED');
    }
  }
  const requested = row.requested as number;
  const responseStarted = row.responseStarted as number;
  const completed = row.completed as number;
  const transportFailed = row.transportFailed as number;
  const pending = row.pending as number;
  const bodyCompleted = row.bodyCompleted as number;
  const bodyFailed = row.bodyFailed as number;
  const bodyPending = row.bodyPending as number;
  if (!row.transportFailures || typeof row.transportFailures !== 'object' || Array.isArray(row.transportFailures)
    || !exactKeys(row.transportFailures as Record<string, unknown>, [
      'aborted', 'timeout', 'connection', 'protocol', 'blocked', 'other',
    ])) throw fixedError('READ_STAGE_LIFECYCLE_REJECTED');
  const transportFailures = row.transportFailures as Record<string, unknown>;
  for (const key of ['aborted', 'timeout', 'connection', 'protocol', 'blocked', 'other'] as const) {
    if (!Number.isSafeInteger(transportFailures[key]) || (transportFailures[key] as number) < 0
      || (transportFailures[key] as number) > V2_RELOAD_REQUEST_COUNT_CAP) {
      throw fixedError('READ_STAGE_LIFECYCLE_REJECTED');
    }
  }
  const safeTransportFailures = Object.freeze({
    aborted: transportFailures.aborted as number,
    timeout: transportFailures.timeout as number,
    connection: transportFailures.connection as number,
    protocol: transportFailures.protocol as number,
    blocked: transportFailures.blocked as number,
    other: transportFailures.other as number,
  });
  const classifiedTransportFailures = Object.values(safeTransportFailures).reduce((sum, value) => sum + value, 0);
  if (responseStarted > requested || completed > responseStarted
    || completed + transportFailed + pending !== requested
    || bodyCompleted + bodyFailed + bodyPending !== responseStarted
    || classifiedTransportFailures !== transportFailed
    || (status === 'not_reached' && requested !== 0)
    || (status !== 'not_reached' && requested === 0)
    || (status === 'passed' && (responseStarted !== requested || completed !== requested
      || transportFailed !== 0 || pending !== 0 || bodyCompleted !== requested
      || bodyFailed !== 0 || bodyPending !== 0))) {
    throw fixedError('READ_STAGE_LIFECYCLE_REJECTED');
  }
  return Object.freeze({
    requested, responseStarted, completed, transportFailed, pending, bodyCompleted, bodyFailed, bodyPending,
    transportFailures: safeTransportFailures,
  });
};

export const resolveAuthenticatedAcceptanceMode = (raw: string | undefined): AuthenticatedAcceptanceMode => {
  if (raw === undefined) return 'full_acceptance';
  if (raw === 'full_acceptance' || raw === 'v2_primary_prefix_diagnostic') return raw;
  throw fixedError('MODE_REJECTED');
};

const validateReadStageObservation = (input: unknown): V2ReloadReadStageObservation => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !exactKeys(input as Record<string, unknown>, ['stage', 'status', 'httpStatus', 'rowCount', 'lifecycle'])) {
    throw fixedError('READ_STAGE_SHAPE_REJECTED');
  }
  const row = input as Record<string, unknown>;
  if (!V2_RELOAD_READ_STAGES.includes(row.stage as V2ReloadReadStage)
    || !['passed', 'failed', 'not_reached'].includes(row.status as string)) {
    throw fixedError('READ_STAGE_VALUE_REJECTED');
  }
  const stage = row.stage as V2ReloadReadStage;
  const status = row.status as V2ReloadReadStageStatus;
  const httpStatus = row.httpStatus;
  const rowCount = row.rowCount;
  const lifecycle = validateReadStageLifecycle(row.lifecycle, status);
  if (status === 'not_reached') {
    if (httpStatus !== null || rowCount !== null) throw fixedError('READ_STAGE_NOT_REACHED_REJECTED');
  } else if (status === 'passed') {
    if (!Number.isSafeInteger(httpStatus) || (httpStatus as number) < 200 || (httpStatus as number) > 299
      || !Number.isSafeInteger(rowCount) || (rowCount as number) < 0 || (rowCount as number) > V2_RELOAD_ROW_COUNT_CAP) {
      throw fixedError('READ_STAGE_PASSED_REJECTED');
    }
    if (['case-discovery', 'case', 'draft-head'].includes(stage) && rowCount !== 1) {
      throw fixedError('READ_STAGE_CARDINALITY_REJECTED');
    }
    if (stage === 'decision' && (rowCount as number) > 1) throw fixedError('READ_STAGE_CARDINALITY_REJECTED');
  } else {
    const noResponse = httpStatus === null && rowCount === null;
    const httpFailure = Number.isSafeInteger(httpStatus) && (httpStatus as number) >= 100
      && (httpStatus as number) <= 599
      && (rowCount === null || (Number.isSafeInteger(rowCount) && (rowCount as number) >= 0
        && (rowCount as number) <= V2_RELOAD_ROW_COUNT_CAP));
    if (!noResponse && !httpFailure) throw fixedError('READ_STAGE_FAILED_REJECTED');
  }
  if (lifecycle.responseStarted === 0 && httpStatus !== null) throw fixedError('READ_STAGE_STATUS_REJECTED');
  if (status !== 'not_reached' && lifecycle.responseStarted > 0 && httpStatus === null
    && !(lifecycle.requested > 1 && lifecycle.transportFailed > 0)) {
    throw fixedError('READ_STAGE_STATUS_REJECTED');
  }
  return Object.freeze({
    stage, status, httpStatus: httpStatus as number | null, rowCount: rowCount as number | null, lifecycle,
  });
};

export const createV2ReloadReadAccumulator = () => {
  const requested = new Set<V2ReloadReadStage>();
  const observations = new Map<V2ReloadReadStage, V2ReloadReadStageObservation>();
  return Object.freeze({
    begin(stage: V2ReloadReadStage) {
      if (!V2_RELOAD_READ_STAGES.includes(stage)) throw fixedError('READ_STAGE_UNKNOWN');
      if (requested.has(stage)) throw fixedError('READ_STAGE_DUPLICATE');
      requested.add(stage);
    },
    record(input: unknown) {
      const observation = validateReadStageObservation(input);
      if (!requested.has(observation.stage)) throw fixedError('READ_STAGE_NOT_REQUESTED');
      if (observations.has(observation.stage)) throw fixedError('READ_STAGE_DUPLICATE_RESULT');
      if (observation.status === 'not_reached') throw fixedError('READ_STAGE_REACHED_AS_NOT_REACHED');
      observations.set(observation.stage, observation);
    },
    snapshot(): readonly V2ReloadReadStageObservation[] {
      for (const stage of requested) {
        if (!observations.has(stage)) throw fixedError('READ_STAGE_INCOMPLETE');
      }
      const result = V2_RELOAD_READ_STAGES.map(stage => observations.get(stage)
        ?? Object.freeze({
          stage, status: 'not_reached' as const, httpStatus: null, rowCount: null,
          lifecycle: Object.freeze({
            requested: 0, responseStarted: 0, completed: 0, transportFailed: 0, pending: 0,
            bodyCompleted: 0, bodyFailed: 0, bodyPending: 0,
            transportFailures: Object.freeze({ aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 }),
          }),
        }));
      let serialStopped = false;
      for (const stage of SERIAL_READ_STAGES) {
        const observation = result[V2_RELOAD_READ_STAGES.indexOf(stage)];
        if (serialStopped && observation.status !== 'not_reached') throw fixedError('READ_STAGE_SERIAL_ORDER_REJECTED');
        if (observation.status === 'not_reached') serialStopped = true;
      }
      const head = result[V2_RELOAD_READ_STAGES.indexOf('draft-head')];
      if (head.status === 'not_reached' && result.some(row => CHILD_READ_STAGES.has(row.stage) && row.status !== 'not_reached')) {
        throw fixedError('READ_STAGE_CHILD_ORDER_REJECTED');
      }
      return Object.freeze(result);
    },
  });
};

const caseProjectionSelect = 'id,org_id,workspace_id,process_id,owner_id,status,version,schema_version,rule_set_version,source_v1_assessment_id,source_v1_score_version,created_at,updated_at,head_version_id';
const draftHeadSelect = 'name,description,agent_necessity,imported_facts';
const childStageByResource = Object.freeze<Record<string, V2ReloadReadStage>>({
  assess_v2_primitives: 'primitives',
  assess_v2_edges: 'edges',
  assess_v2_decision_points: 'decision-points',
  assess_v2_exception_paths: 'exception-paths',
  assess_v2_application_assets: 'application-assets',
  assess_v2_application_interactions: 'application-interactions',
  assess_v2_evidence_links: 'evidence-links',
});

const classifyV2ReadRequest = (request: Request): V2ReloadReadStage | null => {
  let url: URL;
  try { url = new URL(request.url()); } catch { throw fixedError('READ_REQUEST_REJECTED'); }
  const prefix = '/rest/v1/';
  if (!url.pathname.startsWith(prefix)) return null;
  const resource = url.pathname.slice(prefix.length);
  if (!resource.startsWith('assess_v2_')) return null;
  if (request.method() !== 'GET' || resource.includes('/')) throw fixedError('READ_REQUEST_REJECTED');
  const select = url.searchParams.get('select');
  if (resource === 'assess_v2_cases') {
    if (select === 'id') return 'case-discovery';
    if (select === caseProjectionSelect) return 'case';
    throw fixedError('READ_REQUEST_CASE_SHAPE_REJECTED');
  }
  if (resource === 'assess_v2_decision_versions') return 'decision';
  if (resource === 'assess_v2_case_versions') {
    if (select === draftHeadSelect) return 'draft-head';
    throw fixedError('READ_REQUEST_HEAD_SHAPE_REJECTED');
  }
  const child = childStageByResource[resource];
  if (!child || select !== 'payload') throw fixedError('READ_REQUEST_CHILD_SHAPE_REJECTED');
  return child;
};

const countedRows = (body: unknown): number | null => {
  const count = Array.isArray(body) ? body.length : body === null ? 0 : body && typeof body === 'object' ? 1 : null;
  if (count !== null && count > V2_RELOAD_ROW_COUNT_CAP) throw fixedError('READ_STAGE_ROW_COUNT_REJECTED');
  return count;
};

export const aggregateV2ReloadReadStageResults = (
  stage: V2ReloadReadStage,
  observed: readonly V2ReloadReadStageObservation[],
  expectedCount: number,
): V2ReloadReadStageObservation => {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || expectedCount > V2_RELOAD_REQUEST_COUNT_CAP
    || observed.length !== expectedCount) {
    return validateReadStageObservation({
      stage, status: 'failed', httpStatus: null, rowCount: null,
      lifecycle: {
        requested: expectedCount, responseStarted: 0, completed: 0, transportFailed: 0, pending: expectedCount,
        bodyCompleted: 0, bodyFailed: 0, bodyPending: 0,
        transportFailures: { aborted: 0, timeout: 0, connection: 0, protocol: 0, blocked: 0, other: 0 },
      },
    });
  }
  const validated = observed.map(validateReadStageObservation);
  if (validated.some(item => item.stage !== stage || item.status === 'not_reached')) {
    throw fixedError('READ_STAGE_AGGREGATE_REJECTED');
  }
  const lifecycle = Object.freeze({
    requested: validated.reduce((sum, item) => sum + item.lifecycle.requested, 0),
    responseStarted: validated.reduce((sum, item) => sum + item.lifecycle.responseStarted, 0),
    completed: validated.reduce((sum, item) => sum + item.lifecycle.completed, 0),
    transportFailed: validated.reduce((sum, item) => sum + item.lifecycle.transportFailed, 0),
    pending: validated.reduce((sum, item) => sum + item.lifecycle.pending, 0),
    bodyCompleted: validated.reduce((sum, item) => sum + item.lifecycle.bodyCompleted, 0),
    bodyFailed: validated.reduce((sum, item) => sum + item.lifecycle.bodyFailed, 0),
    bodyPending: validated.reduce((sum, item) => sum + item.lifecycle.bodyPending, 0),
    transportFailures: Object.freeze({
      aborted: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.aborted, 0),
      timeout: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.timeout, 0),
      connection: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.connection, 0),
      protocol: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.protocol, 0),
      blocked: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.blocked, 0),
      other: validated.reduce((sum, item) => sum + item.lifecycle.transportFailures.other, 0),
    }),
  });
  const failure = validated.find(item => item.status === 'failed');
  const capturedStatuses = [...new Set(validated.flatMap(item => item.httpStatus === null ? [] : [item.httpStatus]))];
  if (failure) return validateReadStageObservation({
    stage,
    status: 'failed',
    httpStatus: failure.httpStatus ?? (capturedStatuses.length === 1 ? capturedStatuses[0] : null),
    rowCount: failure.rowCount,
    lifecycle,
  });
  const first = validated[0];
  const consistent = validated.every(item => item.httpStatus === first.httpStatus && item.rowCount === first.rowCount);
  return consistent ? validateReadStageObservation({ ...first, lifecycle }) : validateReadStageObservation({
    stage, status: 'failed', httpStatus: first.httpStatus, rowCount: null, lifecycle,
  });
};

export const installV2ReloadReadObserver = (page: Page) => {
  const accumulator = createV2ReloadReadAccumulator();
  const requestStages = new Map<Request, V2ReloadReadStage>();
  const requestCounts = new Map<V2ReloadReadStage, number>();
  type RequestState = {
    stage: V2ReloadReadStage;
    httpStatus: number | null;
    rowCount: number | null;
    bodyState: 'pending' | 'completed' | 'failed';
    terminal: 'pending' | 'completed' | 'transport_failed';
    transportFailureClass: keyof V2ReloadReadStageLifecycle['transportFailures'] | null;
  };
  const requestStates = new Map<Request, RequestState>();
  let serverContextObserved = false;
  let observerError: unknown = null;
  let completed = false;
  let acceptResults = true;

  const retainError = (error: unknown) => { if (!observerError) observerError = error; };
  const onRequest = (request: Request) => {
    try {
      const stage = classifyV2ReadRequest(request);
      if (stage) {
        const count = (requestCounts.get(stage) ?? 0) + 1;
        if (count > V2_RELOAD_REQUEST_COUNT_CAP) throw fixedError('READ_STAGE_REQUEST_COUNT_REJECTED');
        requestCounts.set(stage, count);
        if (count === 1) accumulator.begin(stage);
        requestStages.set(request, stage);
        requestStates.set(request, {
          stage, httpStatus: null, rowCount: null, bodyState: 'pending', terminal: 'pending',
          transportFailureClass: null,
        });
      }
    } catch (error) { retainError(error); }
  };
  const onResponse = (response: Response) => {
    const url = new URL(response.url());
    if (url.pathname === '/functions/v1/tenant-session' && response.status() >= 200 && response.status() <= 299) {
      serverContextObserved = true;
    }
    const stage = requestStages.get(response.request());
    if (!stage) return;
    const state = requestStates.get(response.request());
    if (!state || state.httpStatus !== null) {
      retainError(fixedError('READ_STAGE_RESPONSE_REJECTED'));
      return;
    }
    state.httpStatus = response.status();
    if (response.status() < 200 || response.status() > 299) state.bodyState = 'completed';
    void (async () => {
      let rowCount: number | null = null;
      if (response.status() >= 200 && response.status() <= 299) {
        try { rowCount = countedRows(await response.json()); } catch (error) {
          if (!acceptResults) return;
          state.bodyState = 'failed';
          if (error instanceof Error && error.message.startsWith('AUTHENTICATED_V2_RELOAD_')) throw error;
          return;
        }
      }
      if (!acceptResults) return;
      state.rowCount = rowCount;
      state.bodyState = 'completed';
    })().catch(retainError);
  };
  const onRequestFinished = (request: Request) => {
    const state = requestStates.get(request);
    if (!state || !acceptResults) return;
    if (state.terminal !== 'pending') retainError(fixedError('READ_STAGE_TERMINAL_REJECTED'));
    else state.terminal = 'completed';
  };
  const onRequestFailed = (request: Request) => {
    const state = requestStates.get(request);
    if (!state || !acceptResults) return;
    if (state.terminal !== 'pending') retainError(fixedError('READ_STAGE_TERMINAL_REJECTED'));
    else {
      state.terminal = 'transport_failed';
      const errorText = request.failure()?.errorText ?? '';
      state.transportFailureClass = /abort/iu.test(errorText) ? 'aborted'
        : /timed?\s*out|timeout/iu.test(errorText) ? 'timeout'
          : /connection|econn|socket|reset/iu.test(errorText) ? 'connection'
            : /protocol|http2|quic/iu.test(errorText) ? 'protocol'
              : /blocked|denied/iu.test(errorText) ? 'blocked' : 'other';
    }
  };

  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfinished', onRequestFinished);
  page.on('requestfailed', onRequestFailed);

  return Object.freeze({
    async complete(): Promise<V2ReloadReadObserverCompletion> {
      if (completed) throw fixedError('READ_OBSERVER_ALREADY_COMPLETED');
      completed = true;
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfinished', onRequestFinished);
      page.off('requestfailed', onRequestFailed);
      // Let body parsing that already settled in this JavaScript turn publish its
      // bounded row count. Network events are detached, so held transports remain
      // pending and cannot race the immutable snapshot.
      await Promise.resolve();
      acceptResults = false;
      for (const stage of requestCounts.keys()) {
        try {
          const observed = [...requestStates.values()].filter(state => state.stage === stage).map(state => {
            const completed = state.terminal === 'completed' ? 1 : 0;
            const transportFailed = state.terminal === 'transport_failed' ? 1 : 0;
            const pending = state.terminal === 'pending' ? 1 : 0;
            const transportFailures = {
              aborted: state.transportFailureClass === 'aborted' ? 1 : 0,
              timeout: state.transportFailureClass === 'timeout' ? 1 : 0,
              connection: state.transportFailureClass === 'connection' ? 1 : 0,
              protocol: state.transportFailureClass === 'protocol' ? 1 : 0,
              blocked: state.transportFailureClass === 'blocked' ? 1 : 0,
              other: state.transportFailureClass === 'other' ? 1 : 0,
            };
            const exactCardinality = !['case-discovery', 'case', 'draft-head'].includes(stage) || state.rowCount === 1;
            const decisionCardinality = stage !== 'decision' || state.rowCount === 0 || state.rowCount === 1;
            const passed = completed === 1 && state.bodyState === 'completed'
              && state.httpStatus !== null && state.httpStatus >= 200 && state.httpStatus <= 299
              && state.rowCount !== null && exactCardinality && decisionCardinality;
            return validateReadStageObservation({
              stage,
              status: passed ? 'passed' : 'failed',
              httpStatus: state.httpStatus,
              rowCount: passed ? state.rowCount : null,
              lifecycle: {
                requested: 1,
                responseStarted: state.httpStatus === null ? 0 : 1,
                completed,
                transportFailed,
                pending,
                bodyCompleted: state.httpStatus === null || state.bodyState !== 'completed' ? 0 : 1,
                bodyFailed: state.httpStatus === null || state.bodyState !== 'failed' ? 0 : 1,
                bodyPending: state.httpStatus === null || state.bodyState !== 'pending' ? 0 : 1,
                transportFailures,
              },
            });
          });
          const aggregate = aggregateV2ReloadReadStageResults(stage, observed, requestCounts.get(stage) ?? 0);
          accumulator.record(aggregate);
        }
        catch (error) { retainError(error); }
      }
      let readStages: readonly V2ReloadReadStageObservation[];
      try { readStages = accumulator.snapshot(); }
      catch (error) {
        retainError(error);
        readStages = notReachedStages();
      }
      return Object.freeze({
        observation: Object.freeze({ serverContextObserved, readStages }),
        observerFailure: observerError !== null,
      });
    },
  });
};

type RawBrowserState = Readonly<{
  accessToken: string | null;
  scopeBinding: string | null;
  processBinding: string | null;
  serverContextVisible: boolean;
}>;

const readRawBrowserState = async (page: Page): Promise<RawBrowserState> => {
  let raw: Readonly<{
    accessToken: string | null;
    search: string;
    persistedView: unknown;
    persistedScope: unknown;
  }>;
  try {
    raw = await page.evaluate(() => {
      const authKeys = Object.keys(localStorage).filter(key => key.startsWith('sb-'));
      let accessToken: string | null = null;
      if (authKeys.length === 1) {
        try {
          const stored = JSON.parse(localStorage.getItem(authKeys[0]) || '{}');
          const candidate = stored.access_token ?? stored.currentSession?.access_token;
          if (typeof candidate === 'string' && candidate) accessToken = candidate;
        } catch { /* missing is classified by the parent */ }
      }
      let persistedView: unknown = null;
      let persistedScope: unknown = null;
      try { persistedView = JSON.parse(localStorage.getItem('avalaos-core-v1-view') || 'null'); } catch { /* invalid */ }
      try { persistedScope = JSON.parse(localStorage.getItem('avalaos-core-v1-scope') || 'null'); } catch { /* invalid */ }
      return { accessToken, search: window.location.search, persistedView, persistedScope };
    });
  } catch {
    return Object.freeze({
      accessToken: null,
      scopeBinding: null,
      processBinding: null,
      serverContextVisible: false,
    });
  }
  try {
    const navigation = authenticatedLifecycleValidateProcessNavigation({
      search: raw.search,
      persistedView: raw.persistedView,
      persistedScope: raw.persistedScope,
    });
    return Object.freeze({
      accessToken: raw.accessToken,
      scopeBinding: JSON.stringify(navigation.scope),
      processBinding: navigation.processId,
      serverContextVisible: await page.getByText('Server context active', { exact: true }).isVisible().catch(() => false),
    });
  } catch {
    return Object.freeze({
      accessToken: raw.accessToken,
      scopeBinding: null,
      processBinding: null,
      serverContextVisible: await page.getByText('Server context active', { exact: true }).isVisible().catch(() => false),
    });
  }
};

export const createV2ReloadBrowserCheckpointBuilder = (
  page: Page,
  input: Readonly<{ projectName: string; persona: 'author' }>,
) => {
  let nextPhase = 0;
  let baseline: RawBrowserState | null = null;
  return Object.freeze({
    async checkpoint(
      phase: V2ReloadDiagnosticPhase,
      options: Readonly<{
        readObservation?: V2ReloadReadObservation;
        renderOutcome?: V2ReloadRenderOutcome;
      }> = {},
    ): Promise<V2ReloadDiagnosticCheckpoint> {
      if (phaseOrder[nextPhase] !== phase) throw fixedError('CHECKPOINT_ORDER_REJECTED');
      const current = await readRawBrowserState(page);
      if (phase === 'before-create') baseline = current;
      if (!baseline) throw fixedError('CHECKPOINT_BASELINE_REQUIRED');
      const readObservation = options.readObservation ?? Object.freeze({
        serverContextObserved: false,
        readStages: notReachedStages(),
      });
      if (phase === 'after-reload' && !options.readObservation) throw fixedError('CHECKPOINT_READS_REQUIRED');
      if (phase !== 'after-reload' && options.readObservation) throw fixedError('CHECKPOINT_READS_REJECTED');
      const renderOutcome = options.renderOutcome ?? 'unresolved';
      if (phase !== 'after-reload' && renderOutcome !== 'unresolved') throw fixedError('CHECKPOINT_RENDER_REJECTED');
      nextPhase += 1;
      return Object.freeze({
        schemaVersion: 'authenticated-v2-reload-checkpoint-v2',
        phase,
        projectName: input.projectName,
        persona: input.persona,
        accessToken: current.accessToken,
        browser: Object.freeze({
          sessionObserved: current.accessToken !== null,
          selectedScopeObserved: current.scopeBinding !== null && current.scopeBinding === baseline.scopeBinding,
          selectedProcessObserved: current.processBinding !== null && current.processBinding === baseline.processBinding,
          serverContextObserved: phase === 'after-reload'
            ? readObservation.serverContextObserved : current.serverContextVisible,
          resumedDraftRendered: renderOutcome === 'resumed',
          failureRendered: renderOutcome === 'workspace_error' || renderOutcome === 'public_screen',
          readStages: readObservation.readStages.map(validateReadStageObservation),
        }),
      });
    },
  });
};

export const classifyV2ReloadRenderOutcome = (input: unknown): V2ReloadRenderOutcome => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !exactKeys(input as Record<string, unknown>, ['resumed', 'workspaceError', 'publicScreen'])) {
    throw fixedError('RENDER_SHAPE_REJECTED');
  }
  const values = input as Record<string, unknown>;
  if (typeof values.resumed !== 'boolean' || typeof values.workspaceError !== 'boolean'
    || typeof values.publicScreen !== 'boolean') throw fixedError('RENDER_VALUE_REJECTED');
  const visible = [values.resumed, values.workspaceError, values.publicScreen].filter(Boolean).length;
  if (visible === 0) return 'unresolved';
  if (visible !== 1) throw fixedError('RENDER_AMBIGUOUS');
  if (values.resumed) return 'resumed';
  return values.workspaceError ? 'workspace_error' : 'public_screen';
};

export const observeV2ReloadRenderOutcome = async (page: Page): Promise<Exclude<V2ReloadRenderOutcome, 'unresolved'>> => {
  const resumed = page.getByText('Existing V2 draft resumed from the current immutable authoring version.', { exact: true });
  const workspaceError = page.getByRole('heading', { name: 'Workspace unavailable', exact: true });
  const publicScreen = page.getByRole('heading', { name: /Evaluate before you automate/u });
  try {
    await expect(resumed.or(workspaceError).or(publicScreen)).toBeVisible({ timeout: V2_RELOAD_RENDER_TIMEOUT_MS });
  } catch {
    throw fixedError('RENDER_OUTCOME_MISSING');
  }
  const outcome = classifyV2ReloadRenderOutcome({
    resumed: await resumed.isVisible(),
    workspaceError: await workspaceError.isVisible(),
    publicScreen: await publicScreen.isVisible(),
  });
  if (outcome === 'unresolved') throw fixedError('RENDER_OUTCOME_MISSING');
  return outcome;
};

export const assertV2ReloadCheckpointResponse = (
  input: unknown,
  phase: V2ReloadDiagnosticPhase,
): V2ReloadDiagnosticCheckpointResponse => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !exactKeys(input as Record<string, unknown>, ['recorded', 'phase', 'sessionContinuity', 'continue'])) {
    throw fixedError('CHECKPOINT_RESPONSE_SHAPE_REJECTED');
  }
  const value = input as Record<string, unknown>;
  if (value.recorded !== true || value.phase !== phase
    || !['verified', 'missing', 'invalid'].includes(value.sessionContinuity as string)
    || typeof value.continue !== 'boolean'
    || (phase === 'after-reload' && value.continue !== false)
    || (phase !== 'after-reload' && value.continue !== true)) {
    throw fixedError('CHECKPOINT_RESPONSE_VALUE_REJECTED');
  }
  return Object.freeze(value as unknown as V2ReloadDiagnosticCheckpointResponse);
};
