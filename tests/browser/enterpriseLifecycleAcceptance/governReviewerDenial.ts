import { createHash, randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { parseAssessV2ReviewEnvelope } from '../../../supabase/functions/_shared/assessV2ReviewCommand.ts';

type ReviewProjection = Readonly<{
  caseId: string;
  caseVersion: number;
  decisionId: string;
  reviewSequence: number;
  status: string;
  governStatus: string;
  controls: ReadonlyArray<Readonly<{
    controlId: string;
    status?: 'resolved' | 'conditionally-resolved' | 'unresolved';
    condition?: string;
    owner?: string;
    dueDate?: string;
    conditionSatisfied?: boolean;
  }>>;
}>;

export type ReviewerGovernDenial = Readonly<{
  response: Response;
  status: number;
  errorCode?: string;
  requestDigest: string;
  controlCount: number;
  exactCurrentScope: true;
  exactCurrentVersion: true;
  uiDisabled: true;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const requireReviewProjection = (value: unknown): ReviewProjection => {
  if (!isRecord(value) || typeof value.caseId !== 'string' || !Number.isSafeInteger(value.caseVersion)
    || typeof value.decisionId !== 'string' || !Number.isSafeInteger(value.reviewSequence)
    || typeof value.status !== 'string' || typeof value.governStatus !== 'string'
    || !Array.isArray(value.controls) || value.controls.length === 0) {
    throw new Error('GOVERN_REVIEWER_DENIAL_PROJECTION_REJECTED');
  }
  return value as unknown as ReviewProjection;
};

export const exerciseReviewerGovernDenial = async ({
  page,
  workspace,
  apiBaseUrl,
  rationale,
}: Readonly<{
  page: Page;
  workspace: Locator;
  apiBaseUrl: string;
  rationale: string;
}>): Promise<ReviewerGovernDenial> => {
  const apiUrl = new URL(apiBaseUrl);
  if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
    throw new Error('GOVERN_REVIEWER_DENIAL_API_ORIGIN_REJECTED');
  }
  let projectionRequest: Request | undefined;
  const projectionRequestPromise = page.waitForRequest(request => {
    const url = new URL(request.url());
    if (url.origin !== apiUrl.origin || url.pathname !== '/rest/v1/rpc/assess_v2_review_workspace'
      || request.method() !== 'POST') return false;
    projectionRequest = request;
    return true;
  }, { timeout: 15_000 });
  const projectionResponsePromise = page.waitForResponse(response => (
    projectionRequest !== undefined && response.request() === projectionRequest
  ), { timeout: 15_000 });
  const projectionSettled = await Promise.allSettled([
    projectionRequestPromise,
    projectionResponsePromise,
    workspace.getByRole('button', { name: 'Reload committed state', exact: true }).click(),
  ]);
  if (projectionSettled.some(result => result.status === 'rejected')) {
    throw new Error('GOVERN_REVIEWER_DENIAL_PROJECTION_OBSERVATION_REJECTED');
  }
  const observedProjectionRequest = (projectionSettled[0] as PromiseFulfilledResult<Request>).value;
  const projectionResponse = (projectionSettled[1] as PromiseFulfilledResult<Response>).value;
  expect(projectionResponse.request()).toBe(observedProjectionRequest);
  expect(projectionResponse.status()).toBe(200);
  const projection = requireReviewProjection(await projectionResponse.json());
  expect(projection.status).toBe('approved');
  expect(projection.governStatus).toBe('pending');

  const projectionInput = observedProjectionRequest.postDataJSON() as unknown;
  if (!isRecord(projectionInput) || projectionInput.p_case_id !== projection.caseId
    || typeof projectionInput.p_org_id !== 'string' || typeof projectionInput.p_workspace_id !== 'string') {
    throw new Error('GOVERN_REVIEWER_DENIAL_SCOPE_BINDING_REJECTED');
  }
  const projectionHeaders = await observedProjectionRequest.allHeaders();
  const authorization = projectionHeaders.authorization;
  const apiKey = projectionHeaders.apikey;
  if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/u.test(authorization)
    || typeof apiKey !== 'string' || !apiKey) {
    throw new Error('GOVERN_REVIEWER_DENIAL_AUTHENTICATED_HEADERS_REJECTED');
  }

  const controlSelects = workspace.getByLabel(/^Disposition for /u);
  // Observing the RPC body does not mean the client has consumed it or React
  // has replaced the loading state. Require the exact committed control set.
  await expect(controlSelects).toHaveCount(projection.controls.length, { timeout: 15_000 });
  const controlCount = await controlSelects.count();
  expect(controlCount).toBe(projection.controls.length);
  for (let index = 0; index < controlCount; index += 1) {
    await controlSelects.nth(index).selectOption('resolved');
  }
  await workspace.getByLabel('Govern rationale', { exact: true }).fill(rationale);
  const resolveButton = workspace.getByRole('button', { name: 'Resolve Govern controls', exact: true });
  await expect(resolveButton).toBeVisible();
  await expect(resolveButton).toBeDisabled();

  const requestId = randomUUID();
  const authorizationVersion = await page.evaluate(async input => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${input.apiBaseUrl}/functions/v1/tenant-session`, {
        method: 'POST',
        headers: { authorization: input.authorization, apikey: input.apiKey, 'content-type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as unknown;
      if (response.status !== 200 || !body || typeof body !== 'object'
        || !Array.isArray((body as { contexts?: unknown }).contexts)) {
        throw new Error('GOVERN_REVIEWER_DENIAL_TENANT_CONTEXT_REJECTED');
      }
      const context = (body as { contexts: Array<Record<string, unknown>> }).contexts.find(candidate => (
        candidate.organizationId === input.organizationId && candidate.workspaceId === input.workspaceId
      ));
      if (!context || !Number.isSafeInteger(context.authorizationVersion)) {
        throw new Error('GOVERN_REVIEWER_DENIAL_CURRENT_SCOPE_REJECTED');
      }
      return context.authorizationVersion as number;
    } finally {
      window.clearTimeout(timeout);
    }
  }, {
    apiBaseUrl,
    authorization,
    apiKey,
    organizationId: projectionInput.p_org_id,
    workspaceId: projectionInput.p_workspace_id,
  });
  const envelope = parseAssessV2ReviewEnvelope({
    requestId,
    idempotencyKey: `govern:${projection.caseId}:${projection.decisionId}:${projection.reviewSequence}`,
    commandType: 'assessment_v2.govern.resolve',
    organizationId: projectionInput.p_org_id,
    workspaceId: projectionInput.p_workspace_id,
    authorizationVersion,
    expectedVersion: projection.caseVersion,
    payload: {
      caseId: projection.caseId,
      decisionId: projection.decisionId,
      reviewSequence: projection.reviewSequence,
      rationale,
      controlDispositions: projection.controls.map(control => ({
        controlId: control.controlId,
        status: 'resolved',
        condition: control.condition ?? '',
        owner: control.owner ?? '',
        dueDate: control.dueDate ?? '',
        conditionSatisfied: control.conditionSatisfied ?? false,
      })),
    },
  });
  let commandRequest: Request | undefined;
  const commandRequestPromise = page.waitForRequest(request => {
    const url = new URL(request.url());
    if (url.origin !== apiUrl.origin || url.pathname !== '/functions/v1/assess-v2-command'
      || request.method() !== 'POST') return false;
    try {
      if ((request.postDataJSON() as { requestId?: unknown }).requestId !== requestId) return false;
      commandRequest = request;
      return true;
    }
    catch { return false; }
  }, { timeout: 15_000 });
  const commandResponsePromise = page.waitForResponse(response => (
    commandRequest !== undefined && response.request() === commandRequest
  ), { timeout: 15_000 });
  const browserResultPromise = page.evaluate(async input => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const headers = { authorization: input.authorization, apikey: input.apiKey, 'content-type': 'application/json' };
      const response = await fetch(`${input.apiBaseUrl}/functions/v1/assess-v2-command`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input.envelope),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as unknown;
      const errorCode = body && typeof body === 'object' && !Array.isArray(body)
        && (body as { error?: unknown }).error && typeof (body as { error: { code?: unknown } }).error.code === 'string'
        ? (body as { error: { code: string } }).error.code : undefined;
      return { status: response.status, errorCode };
    } finally {
      window.clearTimeout(timeout);
    }
  }, {
    apiBaseUrl,
    authorization,
    apiKey,
    envelope,
  });
  const commandSettled = await Promise.allSettled([
    commandRequestPromise,
    commandResponsePromise,
    browserResultPromise,
  ]);
  if (commandSettled.some(result => result.status === 'rejected')) {
    throw new Error('GOVERN_REVIEWER_DENIAL_COMMAND_OBSERVATION_REJECTED');
  }
  const observedCommandRequest = (commandSettled[0] as PromiseFulfilledResult<Request>).value;
  const response = (commandSettled[1] as PromiseFulfilledResult<Response>).value;
  const browserResult = (commandSettled[2] as PromiseFulfilledResult<{
    status: number;
    errorCode?: string;
  }>).value;
  expect(response.request()).toBe(observedCommandRequest);
  const requestBody = response.request().postDataJSON();
  expect(requestBody).toEqual(envelope);
  expect(parseAssessV2ReviewEnvelope(requestBody)).toEqual(envelope);
  expect(response.status()).toBe(browserResult.status);
  return {
    response,
    status: browserResult.status,
    ...(browserResult.errorCode ? { errorCode: browserResult.errorCode } : {}),
    requestDigest: `sha256:${createHash('sha256').update(response.request().postData() ?? '').digest('hex')}`,
    controlCount,
    exactCurrentScope: true,
    exactCurrentVersion: true,
    uiDisabled: true,
  };
};
