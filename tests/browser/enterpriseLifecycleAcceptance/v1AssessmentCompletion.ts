import { expect, type Dialog, type Page, type Request, type Response } from '@playwright/test';
import { ASSESS_V1_SCORE_VERSION } from '../../../services/assessV1Compatibility';

const ASSESS_COMMAND_PATH = '/functions/v1/assess-command';
const FINALIZED_MESSAGE = 'Assessment scored and marked Ready for Review.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 60_000;

export const V1_ASSESSMENT_COMPLETION_MILESTONE = 'hosted:primary:v1-assessment-completion';
export const V1_ASSESSMENT_COMPLETION_TIMEOUT = 'ENTERPRISE_LIFECYCLE_BROWSER_V1_COMPLETION_TIMEOUT';
export const V1_ASSESSMENT_DISCOVERY_VISIBILITY_TIMEOUT_INVALID =
  'V1_ASSESSMENT_DISCOVERY_VISIBILITY_TIMEOUT_INVALID';

export const resolveV1AssessmentDiscoveryVisibilityTimeoutMs = (
  scopedTimeoutMs: number,
  overallTimeoutMs: number,
  overallRemainingMs: number,
) => {
  if (!Number.isFinite(scopedTimeoutMs) || scopedTimeoutMs <= 0 || scopedTimeoutMs > overallTimeoutMs) {
    throw new Error(V1_ASSESSMENT_DISCOVERY_VISIBILITY_TIMEOUT_INVALID);
  }
  return Math.min(scopedTimeoutMs, Math.max(1, overallRemainingMs));
};

type JsonObject = Record<string, unknown>;
type CommandType = 'assessment.create' | 'assessment.response.upsert' | 'assessment.finalize';
type ActionReference = Promise<string | null>;

export type V1AssessmentCompletionIdentity = Readonly<{
  actorId: string;
  processId: string;
}>;

export type V1AssessmentCompletionResult = Readonly<{
  assessmentId: string;
  commandTypes: readonly CommandType[];
  finalizationActionId: ActionReference;
  finalizationResponse: Response;
  logicalMutations: 1;
}>;

type RunStep = <T>(title: string, operation: () => Promise<T>) => Promise<T>;

type CompletionOptions = Readonly<{
  page: Page;
  identity: V1AssessmentCompletionIdentity;
  actionReference: (request: Request) => ActionReference;
  runStep?: RunStep;
  timeoutMs?: number;
  discoveryVisibilityTimeoutMs?: number;
}>;

class CompletionDeadline {
  readonly #expiresAt: number;
  #cancelled = false;

  constructor(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error('V1_ASSESSMENT_COMPLETION_TIMEOUT_INVALID');
    }
    this.#expiresAt = Date.now() + timeoutMs;
  }

  cancel() { this.#cancelled = true; }

  remaining() {
    return Math.max(1, this.#expiresAt - Date.now());
  }

  assertActive() {
    if (this.#cancelled || Date.now() >= this.#expiresAt) {
      throw new Error(V1_ASSESSMENT_COMPLETION_TIMEOUT);
    }
  }

  async bound<T>(operation: Promise<T>): Promise<T> {
    this.assertActive();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(V1_ASSESSMENT_COMPLETION_TIMEOUT)), this.remaining());
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readJwtIdentity = (request: Request) => {
  const authorization = request.headers().authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;
  try {
    const normalized = encodedPayload.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as unknown;
    return isObject(payload) && typeof payload.sub === 'string' && typeof payload.session_id === 'string'
      ? { actorId: payload.sub, sessionId: payload.session_id } : null;
  } catch {
    return null;
  }
};

const readRequestBody = (request: Request): JsonObject => {
  const body = request.postDataJSON() as unknown;
  if (!isObject(body)) throw new Error('V1_ASSESSMENT_COMMAND_BODY_INVALID');
  return body;
};

const chooseLegacyScale = async (page: Page, deadline: CompletionDeadline, label: string, value = 4) => {
  deadline.assertActive();
  const field = page.getByText(label, { exact: true }).locator('..');
  await expect(field).toBeVisible({ timeout: deadline.remaining() });
  deadline.assertActive();
  await field.getByRole('button', { name: new RegExp(`^${value}(?:\\s|$)`, 'u') }).click({ timeout: deadline.remaining() });
};

const clickSection = async (page: Page, deadline: CompletionDeadline, name: RegExp) => {
  deadline.assertActive();
  await page.getByRole('button', { name }).click({ timeout: deadline.remaining() });
};

const completeLegacyDiscoveryInputs = async (page: Page, deadline: CompletionDeadline) => {
  for (const label of ['Process Standardization', 'Rule Clarity', 'Process Maturity', 'Exception Predictability']) {
    await chooseLegacyScale(page, deadline, label);
  }
  await clickSection(page, deadline, /Work Pattern & Business Value$/u);
  const volume = page.getByText('Transaction Volume', { exact: true })
    .locator('xpath=ancestor::div[.//input[@placeholder="Value"]][1]');
  await expect(volume).toBeVisible({ timeout: deadline.remaining() });
  deadline.assertActive();
  await volume.getByPlaceholder('Value').fill('2400', { timeout: deadline.remaining() });
  deadline.assertActive();
  await volume.locator('select').selectOption('Year', { timeout: deadline.remaining() });
  const effort = page.getByText('Average Manual Effort per Transaction', { exact: true })
    .locator('xpath=ancestor::div[.//input[@placeholder="Value"]][1]');
  await expect(effort).toBeVisible({ timeout: deadline.remaining() });
  deadline.assertActive();
  await effort.getByPlaceholder('Value').fill('30', { timeout: deadline.remaining() });
  deadline.assertActive();
  await effort.locator('select').selectOption('Minutes', { timeout: deadline.remaining() });
  await chooseLegacyScale(page, deadline, 'Rework Impact');
  await chooseLegacyScale(page, deadline, 'SLA / Turnaround Pressure');
  await clickSection(page, deadline, /Data Readiness$/u);
  deadline.assertActive();
  await page.getByText('Mostly Databases & APIs (75%)', { exact: true }).click({ timeout: deadline.remaining() });
  await chooseLegacyScale(page, deadline, 'Unstructured Content Load');
  await chooseLegacyScale(page, deadline, 'Data Sensitivity');
  await clickSection(page, deadline, /Decision Complexity$/u);
  await chooseLegacyScale(page, deadline, 'Human Judgment Required');
  await chooseLegacyScale(page, deadline, 'Goal Clarity');
  await clickSection(page, deadline, /Systems & Integration Readiness$/u);
  await chooseLegacyScale(page, deadline, 'System Readiness');
  await chooseLegacyScale(page, deadline, 'Orchestration Complexity');
  await clickSection(page, deadline, /Governance, Risk & HITL$/u);
  await chooseLegacyScale(page, deadline, 'Business Risk Criticality');
  await chooseLegacyScale(page, deadline, 'Governance / Compliance Sensitivity');
  await chooseLegacyScale(page, deadline, 'Error Reversibility');
  await clickSection(page, deadline, /Evidence, Confidence & Handoff$/u);
};

type ObservedCommand = Readonly<{
  type: CommandType;
  request: Request;
  response: Response;
  body: JsonObject;
  resource: JsonObject;
}>;

const observeCommands = (
  page: Page,
  deadline: CompletionDeadline,
  identity: V1AssessmentCompletionIdentity,
) => {
  const commands: ObservedCommand[] = [];
  let tail = Promise.resolve();
  let complete: ((commands: readonly ObservedCommand[]) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  let settled = false;
  const finalized = new Promise<readonly ObservedCommand[]>((resolve, rejectPromise) => {
    complete = resolve;
    reject = rejectPromise;
  });

  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    reject?.(error instanceof Error ? error : new Error('V1_ASSESSMENT_COMMAND_OBSERVATION_FAILED'));
  };

  const onResponse = (response: Response) => {
    if (settled) return;
    let pathname = '';
    try { pathname = new URL(response.url()).pathname; } catch { return; }
    if (pathname !== ASSESS_COMMAND_PATH) return;
    tail = tail.then(async () => {
      if (settled) return;
      const request = response.request();
      const body = readRequestBody(request);
      const type = body.commandType;
      if (type !== 'assessment.create' && type !== 'assessment.response.upsert' && type !== 'assessment.finalize') {
        throw new Error('V1_ASSESSMENT_COMMAND_TYPE_INVALID');
      }
      const jwtIdentity = readJwtIdentity(request);
      if (jwtIdentity?.actorId !== identity.actorId) throw new Error('V1_ASSESSMENT_ACTOR_MISMATCH');
      if (typeof body.organizationId !== 'string' || !UUID.test(body.organizationId)
        || typeof body.workspaceId !== 'string' || !UUID.test(body.workspaceId)) {
        throw new Error('V1_ASSESSMENT_SCOPE_INVALID');
      }
      const first = commands[0]?.body;
      if (first && (body.organizationId !== first.organizationId || body.workspaceId !== first.workspaceId)) {
        throw new Error('V1_ASSESSMENT_SCOPE_MISMATCH');
      }
      const firstJwtIdentity = commands[0] ? readJwtIdentity(commands[0].request) : null;
      if (firstJwtIdentity && jwtIdentity?.sessionId !== firstJwtIdentity.sessionId) {
        throw new Error('V1_ASSESSMENT_SESSION_MISMATCH');
      }
      const payload = isObject(body.payload) ? body.payload : {};
      if (type === 'assessment.create' && payload.processId !== identity.processId) {
        throw new Error('V1_ASSESSMENT_PROCESS_MISMATCH');
      }
      const expectedVersion = body.expectedVersion;
      if (type !== 'assessment.create' && (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1)) {
        throw new Error('V1_ASSESSMENT_EXPECTED_VERSION_INVALID');
      }

      if (response.status() !== 200) {
        const rejection = type === 'assessment.create' ? 'CREATE'
          : type === 'assessment.response.upsert' ? 'UPSERT' : 'FINALIZE';
        throw new Error(`V1_ASSESSMENT_${rejection}_REJECTED`);
      }
      const responseBody = await deadline.bound(response.json() as Promise<unknown>);
      if (!isObject(responseBody) || responseBody.ok !== true || responseBody.outcome !== 'committed'
        || !isObject(responseBody.resource)) {
        throw new Error('V1_ASSESSMENT_COMMAND_RESPONSE_INVALID');
      }
      const resource = responseBody.resource;
      if (typeof resource.assessmentId !== 'string' || !UUID.test(resource.assessmentId)
        || !Number.isSafeInteger(resource.version)) throw new Error('V1_ASSESSMENT_RESOURCE_INVALID');
      const previous = commands.at(-1);
      if (previous && resource.assessmentId !== previous.resource.assessmentId) {
        throw new Error('V1_ASSESSMENT_ID_MISMATCH');
      }
      if (previous && type !== 'assessment.create' && expectedVersion !== previous.resource.version) {
        throw new Error('V1_ASSESSMENT_VERSION_CHAIN_MISMATCH');
      }
      if (type !== 'assessment.create' && payload.assessmentId !== resource.assessmentId) {
        throw new Error('V1_ASSESSMENT_PAYLOAD_ID_MISMATCH');
      }
      if (type === 'assessment.create' && (resource.version !== 1 || resource.status !== 'Draft')) {
        throw new Error('V1_ASSESSMENT_CREATE_RESOURCE_INVALID');
      }
      if (type === 'assessment.create' && body.requestId !== resource.assessmentId) {
        throw new Error('V1_ASSESSMENT_CREATE_ID_MISMATCH');
      }
      if (type !== 'assessment.create'
        && resource.version !== (expectedVersion as number) + 1) {
        throw new Error('V1_ASSESSMENT_RESOURCE_VERSION_INVALID');
      }
      if (type === 'assessment.response.upsert' && resource.status !== 'Draft') {
        throw new Error('V1_ASSESSMENT_UPSERT_RESOURCE_INVALID');
      }
      if (type === 'assessment.finalize'
        && (resource.status !== 'Ready for Review' || resource.scoreVersion !== ASSESS_V1_SCORE_VERSION)) {
        throw new Error('V1_ASSESSMENT_FINAL_RESOURCE_INVALID');
      }
      commands.push({ type, request, response, body, resource });
      if (type === 'assessment.finalize') {
        settled = true;
        complete?.(commands);
      }
    }).catch(fail);
  };
  page.on('response', onResponse);
  // Rejections can arrive while the click promise is still unwinding. Register
  // a handler immediately; callers still await the original promise below.
  void finalized.catch(() => undefined);

  return {
    finalized,
    dispose: () => page.off('response', onResponse),
    settle: async () => { await tail.catch(() => undefined); },
    fail,
  };
};

const runInner = async (options: CompletionOptions, deadline: CompletionDeadline): Promise<V1AssessmentCompletionResult> => {
  const runStep: RunStep = options.runStep ?? (async (_title, operation) => operation());
  const observer = observeCommands(options.page, deadline, options.identity);
  let dialogAccepted = false;
  let dialogFailure: Error | null = null;
  const onDialog = async (dialog: Dialog) => {
    if (dialog.message() !== FINALIZED_MESSAGE) {
      dialogFailure = new Error('V1_ASSESSMENT_DIALOG_MESSAGE_INVALID');
      await dialog.dismiss().catch(() => undefined);
      return;
    }
    try {
      await dialog.accept();
      dialogAccepted = true;
    } catch {
      dialogFailure = new Error('V1_ASSESSMENT_DIALOG_CLOSE_FAILED');
    }
  };
  options.page.on('dialog', onDialog);

  try {
    await runStep('v1-assessment:open-and-complete-discovery', async () => {
      deadline.assertActive();
      const resume = options.page.getByRole('button', { name: 'Resume Assessment', exact: true });
      const start = options.page.getByRole('button', { name: 'Start New Assessment', exact: true });
      if (await resume.isVisible().catch(() => false)) {
        await resume.click({ timeout: deadline.remaining() });
      } else {
        await start.click({ timeout: deadline.remaining() });
      }
      deadline.assertActive();
      if (options.discoveryVisibilityTimeoutMs === undefined) {
        await expect(options.page.getByTestId('enterprise-assess')).toBeVisible({ timeout: deadline.remaining() });
      } else {
        const visibilityTimeoutMs = resolveV1AssessmentDiscoveryVisibilityTimeoutMs(
          options.discoveryVisibilityTimeoutMs,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          deadline.remaining(),
        );
        try {
          await options.page.getByTestId('enterprise-assess').waitFor({
            state: 'visible',
            timeout: visibilityTimeoutMs,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'TimeoutError') {
            throw new Error(V1_ASSESSMENT_COMPLETION_TIMEOUT);
          }
          throw error;
        }
        deadline.assertActive();
      }
      await completeLegacyDiscoveryInputs(options.page, deadline);
    });

    const commands = await runStep('v1-assessment:commit-finalization', async () => {
      deadline.assertActive();
      await options.page.getByRole('button', { name: 'Calculate deterministic score', exact: true }).last()
        .click({ timeout: deadline.remaining() });
      return deadline.bound(observer.finalized);
    });

    await runStep('v1-assessment:verify-authoritative-readback', async () => {
      await options.page.waitForFunction((missingReadback) => {
        const text = document.body?.innerText ?? '';
        return text.includes('Assessed & Scored') || text.includes(missingReadback);
      }, 'The finalized assessment is not available in this workspace.', { timeout: deadline.remaining() });
      if (await options.page.getByText('The finalized assessment is not available in this workspace.', { exact: false })
        .first().isVisible().catch(() => false)) {
        throw new Error('V1_ASSESSMENT_READBACK_MISSING');
      }
      await expect(options.page.getByText('Assessed & Scored', { exact: true }))
        .toBeVisible({ timeout: deadline.remaining() });
      await expect(options.page.getByRole('button', { name: 'Send for Review', exact: true }))
        .toBeVisible({ timeout: deadline.remaining() });
      if (dialogFailure) throw dialogFailure;
      if (!dialogAccepted) throw new Error('V1_ASSESSMENT_DIALOG_MISSING');
    });

    const types = commands.map(command => command.type);
    const start = types[0] === 'assessment.create' ? 1 : 0;
    const validSequence = types.length >= start + 2
      && types.at(-1) === 'assessment.finalize'
      && types.slice(start, -1).every(type => type === 'assessment.response.upsert');
    if (!validSequence) throw new Error('V1_ASSESSMENT_COMMAND_SEQUENCE_INVALID');
    const final = commands.at(-1)!;
    return {
      assessmentId: final.resource.assessmentId as string,
      commandTypes: types,
      finalizationActionId: options.actionReference(final.request),
      finalizationResponse: final.response,
      logicalMutations: 1,
    };
  } finally {
    observer.dispose();
    options.page.off('dialog', onDialog);
    await observer.settle();
  }
};

export const runV1AssessmentCompletion = async (
  options: CompletionOptions,
): Promise<V1AssessmentCompletionResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = new CompletionDeadline(timeoutMs);
  if (options.discoveryVisibilityTimeoutMs !== undefined) {
    resolveV1AssessmentDiscoveryVisibilityTimeoutMs(options.discoveryVisibilityTimeoutMs, timeoutMs, timeoutMs);
  }
  const runStep: RunStep = options.runStep ?? (async (_title, operation) => operation());
  let operation: Promise<V1AssessmentCompletionResult> | undefined;
  return runStep(V1_ASSESSMENT_COMPLETION_MILESTONE, async () => {
    try {
      operation = runInner(options, deadline);
      return await deadline.bound(operation);
    } catch (error) {
      deadline.cancel();
      if (operation) await operation.catch(() => undefined);
      if (error instanceof Error && error.message === V1_ASSESSMENT_COMPLETION_TIMEOUT) throw error;
      throw error;
    }
  });
};
