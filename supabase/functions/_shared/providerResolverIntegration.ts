import {
  ProviderResolverDecision,
  ProviderResolverDeps,
  ProviderResolverFailureClass,
  ProviderResolverOperation,
  ProviderResolverProvider,
  resolveProviderForOperation,
} from './providerResolver.ts';
import { ProviderResolverAuditEventShell } from './providerResolverAudit.ts';
import { persistProviderResolverAuditEvent } from './providerResolverAuditDb.ts';
import { buildProviderResolverDbDeps } from './providerResolverDb.ts';
import { ProviderSecretLookupResult, resolveProviderSecretForDecision } from './providerSecretAdapter.ts';

type SafeFailureClass =
  | 'mode_not_allowed'
  | 'audit_context_unsafe'
  | 'key_reference_ineligible'
  | 'secret_reference_unsafe'
  | 'provider_call_blocked'
  | ProviderResolverFailureClass;

export type ProviderGovernedFailureBody = {
  error: string;
  correlationId: string;
  safeUiMessageCategory: string;
  retryCategory: string;
  failureClass: SafeFailureClass;
};

export type ProviderGovernedResult<T> =
  | {
      status: 'blocked';
      httpStatus: number;
      body: ProviderGovernedFailureBody;
    }
  | {
      status: 'allowed';
      provider: ProviderResolverProvider;
      correlationId: string;
      value: T;
    };

export type ProviderGovernedOperationInput<T> = {
  operation: ProviderResolverOperation;
  orgId: string;
  actorId: string;
  requestedProvider?: string | null;
  requestedProviderConfigId?: string | null;
  workspaceId?: string | null;
  evidenceRef?: string | null;
  correlationId?: string | null;
  scannerReference: string;
  runAllowed: (input: {
    provider: ProviderResolverProvider;
    apiKey: string;
    correlationId: string;
  }) => Promise<T>;
};

export type ProviderGovernedOperationDeps = {
  getMode?: () => string | undefined;
  resolverDeps?: ProviderResolverDeps;
  resolveSecret?: (decision: ProviderResolverDecision) => Promise<ProviderSecretLookupResult>;
  persistAudit?: (event: ProviderResolverAuditEventShell) => Promise<{ status: 'persisted' | 'skipped'; reason?: string }>;
};

const readServerMode = () => {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.('AVALA_AI_RUNTIME_MODE');
};

const hasSafeCorrelationIdShape = (value: string) => /^[a-zA-Z0-9._:-]{8,128}$/.test(value);

const createSafeCorrelationId = () => {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  return cryptoApi?.randomUUID?.() || `corr-${Date.now().toString(36)}`;
};

const resolveSafeCorrelationId = (value?: string | null) => {
  const candidate = value?.trim();
  return candidate && hasSafeCorrelationIdShape(candidate) ? candidate : createSafeCorrelationId();
};

const safeFailure = (
  failureClass: SafeFailureClass,
  correlationId: string,
  httpStatus = 403,
): ProviderGovernedResult<never> => ({
  status: 'blocked',
  httpStatus,
  body: {
    error: 'AI provider governance controls blocked this request.',
    correlationId,
    safeUiMessageCategory: failureClass === 'mode_not_allowed'
      ? 'configuration_required'
      : 'provider_controls_required',
    retryCategory: failureClass === 'provider_call_blocked'
      ? 'do_not_retry'
      : 'retry_after_configuration_change',
    failureClass,
  },
});

const safeFailureFromDecision = (decision: ProviderResolverDecision): ProviderGovernedResult<never> => {
  if (decision.status === 'allowed') {
    return safeFailure('provider_call_blocked', decision.correlationId);
  }

  return {
    status: 'blocked',
    httpStatus: 403,
    body: {
      error: 'AI provider governance controls blocked this request.',
      correlationId: decision.correlationId,
      safeUiMessageCategory: decision.safeUiMessageCategory,
      retryCategory: decision.retryCategory,
      failureClass: decision.failureClass,
    },
  };
};

export const runProviderGovernedOperation = async <T>(
  input: ProviderGovernedOperationInput<T>,
  deps: ProviderGovernedOperationDeps = {},
): Promise<ProviderGovernedResult<T>> => {
  const resolverDeps = deps.resolverDeps || buildProviderResolverDbDeps();
  const mode = (deps.getMode || readServerMode)();
  const requestedProvider = input.requestedProvider?.trim() || 'groq';
  const correlationId = resolveSafeCorrelationId(input.correlationId);

  let decision: ProviderResolverDecision;
  try {
    decision = await resolveProviderForOperation({
      mode,
      operation: input.operation,
      requestedProvider,
      requestedProviderConfigId: input.requestedProviderConfigId,
      orgId: input.orgId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      correlationId,
      evidenceRef: input.evidenceRef,
      scannerClassification: {
        status: 'classified',
        reference: input.scannerReference,
      },
    }, resolverDeps);
  } catch {
    return safeFailure('provider_call_blocked', correlationId);
  }

  if (decision.status === 'blocked') {
    try {
      await (deps.persistAudit || persistProviderResolverAuditEvent)(decision.auditEvent);
    } catch {
      // Blocked requests still fail closed; audit persistence is best effort when safe context exists.
    }
    return safeFailureFromDecision(decision);
  }

  try {
    const auditResult = await (deps.persistAudit || persistProviderResolverAuditEvent)(decision.auditEvent);
    if (auditResult.status !== 'persisted') {
      return safeFailure('audit_context_unsafe', decision.correlationId);
    }
  } catch {
    return safeFailure('audit_context_unsafe', decision.correlationId);
  }

  let secret: ProviderSecretLookupResult;
  try {
    secret = await (deps.resolveSecret || resolveProviderSecretForDecision)(decision);
  } catch {
    return safeFailure('key_reference_ineligible', decision.correlationId);
  }

  if (secret.status === 'blocked') {
    return safeFailure(secret.failureClass, secret.correlationId);
  }

  const value = await input.runAllowed({
    provider: decision.provider,
    apiKey: secret.apiKey,
    correlationId: decision.correlationId,
  });

  return {
    status: 'allowed',
    provider: decision.provider,
    correlationId: decision.correlationId,
    value,
  };
};
