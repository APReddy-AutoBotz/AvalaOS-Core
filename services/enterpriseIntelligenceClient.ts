import {
  beginControlledHumanCommand,
  completeControlledHumanCommand,
  executeControlledHumanDeniedCommand,
  getControlledHumanEvidenceState,
  getRuntimeDataAccess,
  isControlledHumanRuntimeEnabled,
  isSupabaseConfigured,
  supabase,
} from './supabaseClient';
import {
  buildEnterpriseSelectorPayloads,
  decodeEnterpriseIntelligenceProjection,
  ENTERPRISE_AI_CAPABILITIES,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseApprovalResourceType,
  type EnterpriseIntelligenceProjection,
} from './enterpriseIntelligence';
import type { TranscriptAssessApplicationIntent } from './transcriptFlow/contracts';
import {
  ASSESS_DOCUMENT_MAPPING_MAX_PROPOSALS,
  isAssessMappingJsonValue,
  type AssessMappingJsonValue,
  type AssessMappingPreviewManifest,
} from './assessImport/contracts';
import { validateTranscriptSourceSetSelection } from './transcriptFlow/sourceSets';
import {
  buildDeliveryMonitorSelectorPayload,
  type DeliveryMonitorCommandInput,
} from './deliveryMonitor/commands';
import type {
  DeliveryBaselineEligibilityPageRequest,
  DeliveryItemPageRequest,
  DeliveryWorkspaceProjection,
  MonitorApprovedBaselinesProjection,
} from './deliveryMonitor/contracts';

type DeliveryCommandFields<Action extends DeliveryMonitorCommandInput['action']> =
  Extract<DeliveryMonitorCommandInput, { action: Action }> extends infer Command
    ? Command extends DeliveryMonitorCommandInput ? Omit<Command, 'action'> : never
    : never;

type DeliveryCommandInput<Action extends DeliveryMonitorCommandInput['action']> =
  DeliveryCommandFields<Action> & { organizationId: string; workspaceId: string };

type TranscriptSourceSetLineageSelector = {
  sourceSetId: string;
  sourceSetVersionSelector: string;
  expectedVersion: number;
};

const encodeTranscriptSourceSetLineage = (items: TranscriptSourceSetLineageSelector[]) => {
  if (items.length < 1 || items.length > 20
    || new Set(items.map(item => item.sourceSetId)).size !== items.length
    || new Set(items.map(item => item.sourceSetVersionSelector)).size !== items.length) {
    throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
  }
  return items.map((item, index) => {
    if (!Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 1) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return {
      sourceSetId: requireUuidSelector(item.sourceSetId),
      sourceSetVersionSelector: requireUuidSelector(item.sourceSetVersionSelector),
      expectedVersion: item.expectedVersion,
      ordinal: index + 1,
    };
  });
};

const commandEnabled = () => getRuntimeDataAccess() === 'server' && isSupabaseConfigured();

const createCryptographicUuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const createId = () => createCryptographicUuid();

export const createEnterpriseActionIdempotencyKey = (operation: string) => (
  `ei:${operation}:${createCryptographicUuid()}`
);

const isRetryableTransportError = (error: unknown) => {
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError';
};

const waitForProviderAuthorityRetry = (milliseconds: number) => new Promise<void>(resolve => {
  globalThis.setTimeout(resolve, milliseconds);
});

const lifecycleAuthorizationVersion = Symbol('enterprise-provider-lifecycle-authorization-version');

type LifecycleResult = Record<string, unknown> & {
  [lifecycleAuthorizationVersion]?: number;
};

export const getProviderLifecycleAuthorizationVersion = (value: unknown) => (
  typeof value === 'object' && value
    ? (value as LifecycleResult)[lifecycleAuthorizationVersion]
    : undefined
);

const responseErrorCode = async (data: unknown, error: unknown) => {
  const direct = data as { code?: unknown; error?: { code?: unknown } } | null;
  const directCode = direct?.error?.code || direct?.code;
  if (typeof directCode === 'string') return directCode;
  const context = typeof error === 'object' && error && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (!context || typeof context !== 'object' || !('clone' in context)) return undefined;
  try {
    const clone = (context as { clone: () => { json: () => Promise<unknown> } }).clone();
    const body = await clone.json() as { code?: unknown; error?: { code?: unknown } } | null;
    const code = body?.error?.code || body?.code;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
};

const errorMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Your session expired. Sign in again before continuing.',
  AUTHORIZATION_STALE: 'Your authorization changed. Reload the workspace before continuing.',
  TENANT_ACCESS_DENIED: 'Access to this workspace was denied or revoked.',
  PERMISSION_DENIED: 'You do not have the server capability required for this action.',
  RESOURCE_NOT_FOUND: 'The selected resource is no longer available in this workspace.',
  RESOURCE_STALE: 'The selected resource changed on the server. Reload before continuing.',
  IDEMPOTENCY_CONFLICT: 'This request conflicts with a previously claimed operation. Reload before retrying.',
  COMMAND_IN_PROGRESS: 'The same operation is still in progress. Reload before retrying.',
  COMMAND_OUTCOME_UNKNOWN: 'The server may have committed this command, but the response was lost. Reload committed state before retrying.',
  COMMAND_BLOCKED: 'The server blocked this lifecycle transition. No success was recorded.',
  COMMAND_UNAVAILABLE: 'The governed server operation is unavailable. No fallback was used.',
  BUDGET_EXHAUSTED: 'The configured provider budget is exhausted. No provider call was made.',
  SOURCE_INCOMPLETE: 'Every selected source must complete extraction before this bundle can run.',
  STUDIO_SOURCE_INPUT_INVALID: 'Choose a supported bounded Studio text source and try again.',
  STUDIO_SOURCE_FLOW_DISABLED: 'Studio source intake is disabled for this workspace.',
  STUDIO_SOURCE_EXTRACTION_DISABLED: 'Studio source extraction is unavailable. No provider call was made.',
  STUDIO_SOURCE_BINDING_STALE: 'The exact Studio bundle, source, extraction, or candidate binding changed. Reload before continuing.',
  SOURCE_COVERAGE_INCOMPLETE: 'Every selected Studio source needs an accepted grounded candidate before a direct package can be created.',
  TRANSCRIPT_SOURCE_SET_MEMBER_LIMIT: 'A source set must contain between 1 and 20 exact source versions.',
  TRANSCRIPT_SOURCE_SET_DUPLICATE_VERSION: 'The same exact source version cannot appear twice in one source set.',
  TRANSCRIPT_ASSESS_MATERIAL_CONFLICT_UNRESOLVED: 'Resolve every material conflict before applying or finalizing this Assess draft.',
  TRANSCRIPT_ASSESS_TARGET_STALE: 'The Assess draft or preview changed. Reload and preview the exact changes again.',
  ASSESS_DOCUMENT_MAPPING_DISABLED: 'Supporting-document mapping is disabled for this workspace.',
  SOURCE_TOO_LARGE: 'The selected documents exceed the bounded AI analysis size. No provider call was made.',
  ASSESS_DOCUMENT_MAPPING_STALE: 'The Assess draft, source bundle, or mapping catalog changed. Reload before continuing.',
  ENTERPRISE_PROJECTION_UNAVAILABLE: 'The Enterprise Intelligence projection is unavailable. Existing records were not replaced with local data.',
  HANDOFF_NOT_ELIGIBLE: 'The selected Studio version is not eligible for a Delivery handoff.',
  HANDOFF_STALE: 'The handoff changed or its source is no longer current. Reload before continuing.',
  MODULE_ROUTE_NOT_ALLOWED: 'The organization route policy does not permit this handoff.',
};

export class EnterpriseIntelligenceClientError extends Error {
  constructor(public readonly code: string) {
    super(errorMessages[code] || 'The Enterprise Intelligence operation could not be completed.');
    this.name = 'EnterpriseIntelligenceClientError';
  }
}

const requireUuidSelector = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new EnterpriseIntelligenceClientError('RESOURCE_NOT_FOUND');
  }
  return value;
};

export const STUDIO_SOURCE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/vtt',
  'application/x-subrip',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const requireStudioBoundedText = (value: unknown, minimum: number, maximum: number, code = 'STUDIO_SOURCE_INPUT_INVALID') => {
  if (typeof value !== 'string') throw new EnterpriseIntelligenceClientError(code);
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  if (length < minimum || length > maximum) throw new EnterpriseIntelligenceClientError(code);
  return trimmed;
};

const requireStudioSourceMimeType = (value: unknown) => {
  if (!STUDIO_SOURCE_MIME_TYPES.includes(value as typeof STUDIO_SOURCE_MIME_TYPES[number])) {
    throw new EnterpriseIntelligenceClientError('STUDIO_SOURCE_INPUT_INVALID');
  }
  return value as typeof STUDIO_SOURCE_MIME_TYPES[number];
};

const decodeStudioSourceCreateResult = (value: unknown): StudioSourceCreateResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  const item = value as Record<string, unknown>;
  const allowed = ['ok', 'replayed', 'resourceId', 'sourceId', 'sourceVersionId', 'version', 'displayName', 'mimeType', 'status', 'failureCode', 'extractedCharacterCount', 'ingestion'] as const;
  if (Object.keys(item).some(key => !allowed.includes(key as typeof allowed[number]))
    || item.ok !== true || typeof item.replayed !== 'boolean'
    || !Number.isSafeInteger(item.version) || Number(item.version) < 1
    || !Number.isSafeInteger(item.extractedCharacterCount) || Number(item.extractedCharacterCount) < 0
    || item.ingestion !== 'server_managed' || !['review', 'failed'].includes(String(item.status))) {
    throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  }
  const resourceId = requireUuidSelector(String(item.resourceId));
  const sourceId = requireUuidSelector(String(item.sourceId));
  const sourceVersionId = requireUuidSelector(String(item.sourceVersionId));
  if (!sameUuidSelector(resourceId, sourceId)) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  const status = item.status as StudioSourceCreateResult['status'];
  const failureCode = item.failureCode === undefined ? undefined : requireStudioBoundedText(item.failureCode, 1, 120, 'COMMAND_UNAVAILABLE');
  if ((status === 'failed') !== Boolean(failureCode)) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  return {
    resourceId,
    sourceId,
    sourceVersionId,
    version: Number(item.version),
    displayName: requireStudioBoundedText(item.displayName, 1, 240, 'COMMAND_UNAVAILABLE'),
    mimeType: requireStudioSourceMimeType(item.mimeType),
    status,
    ...(failureCode ? { failureCode } : {}),
    extractedCharacterCount: Number(item.extractedCharacterCount),
    ingestion: 'server_managed',
  };
};

export type StudioSourceCreateResult = {
  resourceId: string;
  sourceId: string;
  sourceVersionId: string;
  version: number;
  displayName: string;
  mimeType: string;
  status: 'review' | 'failed';
  failureCode?: string;
  extractedCharacterCount: number;
  ingestion: 'server_managed';
};

export type StudioBundleSourceSelector = {
  ordinal: number;
  sourceSetId: string;
  sourceSetVersionId: string;
  expectedSourceSetVersion: number;
  sourceId: string;
  sourceVersionId: string;
};

export type StudioCandidateReviewInput = {
  organizationId: string;
  workspaceId: string;
  candidateId: string;
  candidateVersion: number;
  extractionJobId: string;
  extractionBindingId: string;
  inputBundleId: string;
  inputBundleVersionId: string;
  expectedInputBundleVersion: number;
  sourceSetId: string;
  sourceSetVersionId: string;
  expectedSourceSetVersion: number;
  sourceId: string;
  sourceVersionId: string;
  status: 'accepted' | 'rejected' | 'edited';
  value?: string;
  reason?: string;
};

const sameUuidSelector = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

const requireAssessMappingPreviewManifest = (manifest: AssessMappingPreviewManifest): AssessMappingPreviewManifest => {
  const keys = ['previewBatchId', 'manifestVersion', 'catalogId', 'catalogHash', 'caseId', 'caseVersion', 'inputBundleId', 'inputBundleVersionId',
    'targetCount', 'sourceCount', 'itemCount', 'reviewedCount', 'conflictCount', 'unresolvedConflictCount', 'itemSetHash', 'conflictSetHash', 'resolutionSetHash', 'displayedSetHash'] as const;
  if (!manifest || typeof manifest !== 'object' || Object.keys(manifest).some(key => !keys.includes(key as typeof keys[number]))
    || Object.keys(manifest).length !== keys.length || !Number.isSafeInteger(manifest.caseVersion) || manifest.caseVersion < 1
    || !Number.isSafeInteger(manifest.manifestVersion) || manifest.manifestVersion < 1
    || [manifest.targetCount, manifest.sourceCount, manifest.itemCount, manifest.reviewedCount, manifest.conflictCount, manifest.unresolvedConflictCount].some(value => !Number.isSafeInteger(value) || value < 0)
    || ![manifest.catalogHash, manifest.itemSetHash, manifest.conflictSetHash, manifest.resolutionSetHash, manifest.displayedSetHash].every(value => /^[0-9a-f]{64}$/.test(value))) {
    throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
  }
  return { ...manifest, previewBatchId: requireUuidSelector(manifest.previewBatchId), catalogId: requireUuidSelector(manifest.catalogId),
    caseId: requireUuidSelector(manifest.caseId), inputBundleId: requireUuidSelector(manifest.inputBundleId), inputBundleVersionId: requireUuidSelector(manifest.inputBundleVersionId) };
};

const canonicalControlledHumanJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalControlledHumanJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalControlledHumanJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const controlledHumanDigest = async (value: unknown) => {
  if (!globalThis.crypto?.subtle) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalControlledHumanJson(value)));
  return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const controlledHumanTextDigest = async (value: unknown) => {
  if (typeof value !== 'string' || !globalThis.crypto?.subtle) throw new EnterpriseIntelligenceClientError('COMMAND_BLOCKED');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

export const controlledHumanTarget = (commandType: string, workspaceId: string, payload: Record<string, unknown>) => {
  const id = (key: string) => typeof payload[key] === 'string' ? String(payload[key]) : '';
  const version = (...keys: string[]) => {
    const value = keys.map(key => payload[key]).find(candidate => Number.isSafeInteger(candidate) && Number(candidate) >= 0);
    return Number(value ?? 1);
  };
  if (commandType === 'delivery.handoff.request') return { targetFamily: 'studio_artifact', targetId: id('studioArtifactId'), expectedVersion: version('expectedAggregateVersion') };
  if (commandType.startsWith('delivery.handoff.')) return { targetFamily: 'delivery_handoff', targetId: id('handoffId'), expectedVersion: version('expectedHandoffVersion', 'expectedVersion') };
  if (commandType === 'delivery.item.review') return { targetFamily: 'delivery_item', targetId: id('itemAggregateId'), expectedVersion: version('expectedAggregateVersion') };
  if (commandType === 'delivery.package.revision.commit') return { targetFamily: 'delivery_work_package', targetId: id('workPackageId'), expectedVersion: version('expectedPackageAggregateVersion') };
  if (commandType === 'delivery.package.review.resolve' || commandType === 'delivery.package.approval.resolve') return { targetFamily: 'delivery_work_package', targetId: id('workPackageId'), expectedVersion: version('expectedPackageVersion') };
  if (commandType === 'monitor.baseline.create') return { targetFamily: 'delivery_work_package', targetId: id('workPackageId'), expectedVersion: version('expectedPackageVersion') };
  if (commandType === 'delivery.package.create.manual') return { targetFamily: 'workspace', targetId: workspaceId, expectedVersion: 1 };
  if (commandType === 'assessment_v2.review.resolve') return { targetFamily: 'assess_case', targetId: id('caseId'), expectedVersion: version('expectedVersion') };
  if (commandType === 'transcript.assess.conflict.resolve') return { targetFamily: 'assess_conflict', targetId: id('conflictId'), expectedVersion: version('resolutionVersion') };
  return null;
};

const controlledHumanSelectors = async (commandType: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const digest = (key: string) => controlledHumanDigest(payload[key] ?? null);
  switch (commandType) {
    case 'transcript.assess.conflict.resolve':
      return {
        conflictId: payload.conflictId, resolutionVersion: payload.resolutionVersion, resolution: payload.resolution,
        candidateId: payload.candidateId ?? null, authoredValueDigest: await digest('authoredValue'), rationaleDigest: await digest('rationale'),
      };
    case 'delivery.handoff.request':
      return {
        targetWorkspaceId: payload.targetWorkspaceId, studioArtifactId: payload.studioArtifactId,
        studioArtifactVersionId: payload.studioArtifactVersionId, expectedAggregateVersion: payload.expectedAggregateVersion,
        expectedCurrentVersionId: payload.expectedCurrentVersionId, expectedApprovedVersionId: payload.expectedApprovedVersionId,
      };
    case 'delivery.handoff.review.resolve':
    case 'delivery.handoff.approval.resolve':
      return {
        handoffId: payload.handoffId, expectedHandoffVersion: payload.expectedHandoffVersion,
        outcome: payload.outcome, rationaleDigest: await digest('rationale'),
      };
    case 'delivery.handoff.consume':
      return { handoffId: payload.handoffId, expectedHandoffVersion: payload.expectedHandoffVersion };
    case 'delivery.package.create.manual':
      if (getControlledHumanEvidenceState().armedStep?.observationKind === 'negative_attempt') {
        const denialItems = [{
          clientKey: 'item-0001', itemType: 'Task', title: 'Synthetic denial probe',
          description: 'Synthetic non-production authorization denial probe.',
          acceptanceCriteria: ['The real production authority rejects this request.'],
          nonFunctionalRequirements: ['No side effect is committed.'],
        }];
        return {
          manualBriefDigest: await controlledHumanTextDigest('Synthetic controlled-human denial probe'),
          orderedItemsDigest: await controlledHumanDigest(denialItems), itemCount: 1,
        };
      }
      return {
        manualBriefDigest: await controlledHumanTextDigest(payload.manualBrief), orderedItemsDigest: await digest('items'),
        itemCount: Array.isArray(payload.items) ? payload.items.length : -1,
      };
    case 'delivery.item.review':
      {
      const base = {
        itemAggregateId: payload.itemAggregateId, expectedAggregateVersion: payload.expectedAggregateVersion,
        expectedItemVersionId: payload.expectedItemVersionId, outcome: payload.outcome,
        rationaleDigest: await digest('rationale'),
        ...(payload.outcome === 'edited' ? { authoredItemDigest: await digest('item') } : {}),
      };
      if (getControlledHumanEvidenceState().armedStep?.stepId !== 'decide-every-current-proposal') return base;
      const completeSet = Array.isArray(payload.controlledHumanCompleteItemSet)
        ? [...payload.controlledHumanCompleteItemSet].sort((left, right) => String((left as Record<string, unknown>).itemAggregateId).localeCompare(String((right as Record<string, unknown>).itemAggregateId)))
        : [];
      return { ...base, completeItemSetDigest: await controlledHumanDigest(completeSet), completeItemCount: completeSet.length };
      }
    case 'delivery.package.revision.commit':
      return {
        workPackageId: payload.workPackageId, expectedPackageVersion: payload.expectedPackageVersion,
        expectedPackageVersionId: payload.expectedPackageVersionId,
        expectedPackageAggregateVersion: payload.expectedPackageAggregateVersion,
        expectedItemsDigest: await digest('expectedItems'), expectedItemCount: Array.isArray(payload.expectedItems) ? payload.expectedItems.length : -1,
        itemRevisionsDigest: await digest('itemRevisions'), revisionCount: Array.isArray(payload.itemRevisions) ? payload.itemRevisions.length : -1,
      };
    case 'delivery.package.review.resolve':
    case 'delivery.package.approval.resolve':
      return {
        workPackageId: payload.workPackageId, expectedPackageVersion: payload.expectedPackageVersion,
        expectedPackageVersionId: payload.expectedPackageVersionId,
        expectedPackageAggregateVersion: payload.expectedPackageAggregateVersion,
        outcome: payload.outcome, rationaleDigest: await digest('rationale'),
      };
    case 'monitor.baseline.create':
      return {
        workPackageId: payload.workPackageId, expectedPackageVersion: payload.expectedPackageVersion,
        expectedPackageVersionId: payload.expectedPackageVersionId,
      };
    default:
      throw new EnterpriseIntelligenceClientError('COMMAND_BLOCKED');
  }
};

const invokeCommand = async <T>(input: {
  commandType: string;
  organizationId: string;
  workspaceId: string;
  payload: Record<string, unknown>;
  controlledSelectorPayload?: Record<string, unknown>;
  outcomeUnknownCodes?: readonly string[];
}): Promise<T> => {
  if (!commandEnabled()) throw new Error('Enterprise Intelligence requires server runtime authority.');
  const controlledTarget = isControlledHumanRuntimeEnabled() ? controlledHumanTarget(input.commandType, input.workspaceId, input.payload) : null;
  if (isControlledHumanRuntimeEnabled() && !controlledTarget) throw new EnterpriseIntelligenceClientError('COMMAND_BLOCKED');
  const controlledAnchor = controlledTarget ? await beginControlledHumanCommand({ action: input.commandType, ...controlledTarget, selectorBindings: await controlledHumanSelectors(input.commandType, input.controlledSelectorPayload ?? input.payload) }) : null;
  if (controlledAnchor && getControlledHumanEvidenceState().armedStep?.observationKind === 'negative_attempt') {
    await executeControlledHumanDeniedCommand(controlledAnchor);
    throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
  }
  const body = {
    commandType: input.commandType,
    requestId: controlledAnchor?.requestId ?? createId(),
    idempotencyKey: controlledAnchor?.businessIdempotencyKey ?? createEnterpriseActionIdempotencyKey(input.commandType),
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    payload: input.payload,
  };
  let invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body });
  if (isRetryableTransportError(invocation.error)) {
    const retryBody = controlledAnchor && getControlledHumanEvidenceState().armedStep?.stepId === 'simulate-response-loss'
      ? { ...body, requestId: createId() }
      : body;
    invocation = await supabase.functions.invoke('enterprise-intelligence-command', { body: retryBody });
    if (isRetryableTransportError(invocation.error)) {
      throw new EnterpriseIntelligenceClientError('COMMAND_OUTCOME_UNKNOWN');
    }
  }
  const { data, error } = invocation;
  const response = data as { ok?: boolean; error?: { code?: string; message?: string }; [key: string]: unknown } | null;
  const errorCode = input.outcomeUnknownCodes?.length
    ? await responseErrorCode(data, error)
    : response?.error?.code;
  if (input.outcomeUnknownCodes?.includes(errorCode || '')) {
    throw new EnterpriseIntelligenceClientError('COMMAND_OUTCOME_UNKNOWN');
  }
  if (error) throw new EnterpriseIntelligenceClientError(errorCode || response?.error?.code || 'COMMAND_UNAVAILABLE');
  if (!response?.ok) throw new EnterpriseIntelligenceClientError(errorCode || response?.error?.code || 'COMMAND_BLOCKED');
  if (controlledAnchor) await completeControlledHumanCommand(controlledAnchor);
  return response as T;
};

const invokeDeliveryMonitor = <T>(input: {
  organizationId: string;
  workspaceId: string;
  command: DeliveryMonitorCommandInput;
}) => {
  const payload = buildDeliveryMonitorSelectorPayload(input.command);
  const completeSet = input.command.action === 'delivery.item.review' ? input.command.controlledHumanCompleteItemSet : undefined;
  return invokeCommand<T>({
    commandType: input.command.action,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    payload,
    ...(completeSet ? { controlledSelectorPayload: { ...payload, controlledHumanCompleteItemSet: completeSet } } : {}),
    outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'],
  });
};

const invokeDeliveryMonitorAction = <Action extends DeliveryMonitorCommandInput['action']>(
  action: Action,
  input: DeliveryCommandInput<Action>,
) => {
  const { organizationId, workspaceId, ...commandInput } = input as unknown as {
    organizationId: string;
    workspaceId: string;
    [key: string]: unknown;
  };
  return invokeDeliveryMonitor({
    organizationId,
    workspaceId,
    command: { ...commandInput, action } as unknown as DeliveryMonitorCommandInput,
  });
};

const invokeProviderLifecycle = async <T>(input: {
  operation: string;
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion: number;
  payload: Record<string, unknown>;
}): Promise<T> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  const requestId = createId();
  const idempotencyKey = createEnterpriseActionIdempotencyKey(input.operation);
  let activePayload: Record<string, unknown> | undefined = input.payload;
  let expectedAuthorizationVersion = input.expectedAuthorizationVersion;
  try {
    for (let staleRecoveryAttempt = 0; staleRecoveryAttempt <= 1; staleRecoveryAttempt += 1) {
      const body = {
        operation: input.operation,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        expectedAuthorizationVersion,
        payload: activePayload,
        requestId,
        idempotencyKey,
      };
      let invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });
      if (isRetryableTransportError(invocation.error)) {
        invocation = await supabase.functions.invoke('enterprise-provider-lifecycle', { body });
      }
      const response = invocation.data as { ok?: boolean; error?: { code?: string }; [key: string]: unknown } | null;
      const errorCode = await responseErrorCode(invocation.data, invocation.error);
      if (!invocation.error && response?.ok) {
        const result = { ...response } as LifecycleResult;
        Object.defineProperty(result, lifecycleAuthorizationVersion, {
          configurable: false,
          enumerable: false,
          value: expectedAuthorizationVersion,
          writable: false,
        });
        return result as T;
      }
      if (errorCode !== 'AUTHORIZATION_STALE' || staleRecoveryAttempt === 1) {
        throw new EnterpriseIntelligenceClientError(errorCode || 'COMMAND_UNAVAILABLE');
      }

      const providerConfigId = typeof activePayload?.providerConfigId === 'string'
        ? activePayload.providerConfigId
        : undefined;
      const routeId = typeof activePayload?.routeId === 'string' ? activePayload.routeId : undefined;
      const authorityBody = {
        operation: input.operation,
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        ...(providerConfigId ? { providerConfigId } : {}),
        ...(routeId ? { routeId } : {}),
      };
      let refreshedAuthorizationVersion: number | undefined;
      for (let recheckAttempt = 0; recheckAttempt < 3; recheckAttempt += 1) {
        const authorityInvocation = await supabase.functions.invoke(
          'enterprise-provider-lifecycle-authority',
          { body: authorityBody },
        );
        if (isRetryableTransportError(authorityInvocation.error)) {
          if (recheckAttempt < 2) {
            await waitForProviderAuthorityRetry(25 * (recheckAttempt + 1));
            continue;
          }
          throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
        }
        const authorityData = authorityInvocation.data as {
          authorized?: unknown;
          authorizationVersion?: unknown;
        } | null;
        if (authorityInvocation.error
          || typeof authorityData?.authorized !== 'boolean'
          || (authorityData.authorized
            && (!Number.isSafeInteger(authorityData.authorizationVersion)
              || Number(authorityData.authorizationVersion) < 1))) {
          throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
        }
        if (!authorityData.authorized) {
          if ((input.operation === 'provider.secret.bind' || input.operation === 'provider.secret.rotate')
            && providerConfigId) {
            const recoveryBody = {
              operation: input.operation,
              organizationId: input.organizationId,
              workspaceId: input.workspaceId,
              providerConfigId,
              requestId,
              idempotencyKey,
            };
            let recoveryAttempt = 0;
            for (;;) {
              const recoveryInvocation = await supabase.functions.invoke(
                'enterprise-provider-lifecycle-recovery',
                { body: recoveryBody },
              );
              const recoveryData = recoveryInvocation.data as { ok?: unknown; terminal?: unknown } | null;
              if (!recoveryInvocation.error && recoveryData?.ok === true && recoveryData.terminal === true) break;
              const recoveryErrorCode = await responseErrorCode(
                recoveryInvocation.data,
                recoveryInvocation.error,
              );
              if (recoveryErrorCode === 'PERMISSION_DENIED') {
                throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
              }
              if (recoveryErrorCode !== 'COMMAND_IN_PROGRESS'
                && recoveryErrorCode !== 'PERSISTENCE_UNAVAILABLE'
                && !isRetryableTransportError(recoveryInvocation.error)) {
                throw new EnterpriseIntelligenceClientError(recoveryErrorCode || 'COMMAND_UNAVAILABLE');
              }
              recoveryAttempt += 1;
              await waitForProviderAuthorityRetry(Math.min(1_000, 50 * (2 ** Math.min(recoveryAttempt, 5))));
            }
          }
          throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
        }
        refreshedAuthorizationVersion = Number(authorityData.authorizationVersion);
        break;
      }
      if (!refreshedAuthorizationVersion) {
        throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
      }
      expectedAuthorizationVersion = refreshedAuthorizationVersion;
    }
    throw new EnterpriseIntelligenceClientError('COMMAND_UNAVAILABLE');
  } finally {
    if (activePayload && typeof activePayload.providerKey === 'string') {
      activePayload.providerKey = undefined;
    }
    activePayload = undefined;
  }
};

export type EnterpriseIntelligenceProjectionRequest = {
  organizationId: string;
  workspaceId: string;
  expectedAuthorizationVersion?: number;
  deliveryItemPage?: DeliveryItemPageRequest;
  deliveryBaselineEligibilityPage?: DeliveryBaselineEligibilityPageRequest;
  assessDocumentMappingScope?: { caseId: string; caseVersion: number; inputBundleId?: string; inputBundleVersionId?: string };
};

const loadProjection = async (input: EnterpriseIntelligenceProjectionRequest): Promise<EnterpriseIntelligenceProjection> => {
  if (!commandEnabled()) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  const requestedOrganizationId = requireUuidSelector(input.organizationId);
  const requestedWorkspaceId = requireUuidSelector(input.workspaceId);
  if (input.assessDocumentMappingScope) {
    const scope = input.assessDocumentMappingScope;
    if (!Number.isSafeInteger(scope.caseVersion) || scope.caseVersion < 1 || (scope.inputBundleId === undefined) !== (scope.inputBundleVersionId === undefined)) {
      throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    }
    requireUuidSelector(scope.caseId);
    if (scope.inputBundleId && scope.inputBundleVersionId) { requireUuidSelector(scope.inputBundleId); requireUuidSelector(scope.inputBundleVersionId); }
  }
  const armedProjection = isControlledHumanRuntimeEnabled() ? getControlledHumanEvidenceState().armedStep : null;
  if (armedProjection?.observationKind === 'negative_attempt' && armedProjection.action === 'delivery.workspace.projection') {
    const anchor = await beginControlledHumanCommand({ action: armedProjection.action, targetFamily: 'workspace', targetId: requestedWorkspaceId,
      expectedVersion: input.expectedAuthorizationVersion ?? 1, selectorBindings: {} });
    if (!anchor) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    await executeControlledHumanDeniedCommand(anchor);
    throw new EnterpriseIntelligenceClientError('PERMISSION_DENIED');
  }
  const { data, error } = await supabase.functions.invoke('enterprise-intelligence-query', {
    body: { ...input, organizationId: requestedOrganizationId, workspaceId: requestedWorkspaceId },
  });
  const response = data as { projection?: unknown; code?: string } | null;
  if (error) {
    throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  }
  if (!response?.projection) throw new EnterpriseIntelligenceClientError(response?.code || 'ENTERPRISE_PROJECTION_UNAVAILABLE');
  const projection = decodeEnterpriseIntelligenceProjection(response.projection);
  if (!sameUuidSelector(projection.organizationId, requestedOrganizationId)
    || !sameUuidSelector(projection.workspaceId, requestedWorkspaceId)) {
    throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
  }
  return projection;
};

export const enterpriseIntelligenceClient = {
  loadProjection,

  async loadDeliveryWorkspace(input: Parameters<typeof loadProjection>[0]): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    if (!projection.deliveryWorkspace) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    return projection.deliveryWorkspace;
  },

  async loadDeliveryItemPage(input: EnterpriseIntelligenceProjectionRequest & { deliveryItemPage: DeliveryItemPageRequest }): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    const workspace = projection.deliveryWorkspace;
    if (!workspace
      || !sameUuidSelector(workspace.organizationId, input.organizationId)
      || !sameUuidSelector(workspace.workspaceId, input.workspaceId)
      || workspace.packages.length !== 1
      || !sameUuidSelector(workspace.packages[0].id, input.deliveryItemPage.packageId)
      || !workspace.packages[0].itemPage.cursorApplied) {
      throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    }
    return workspace;
  },

  async loadDeliveryBaselineEligibilityPage(input: EnterpriseIntelligenceProjectionRequest & { deliveryBaselineEligibilityPage: DeliveryBaselineEligibilityPageRequest }): Promise<DeliveryWorkspaceProjection> {
    const projection = await loadProjection(input);
    const workspace = projection.deliveryWorkspace;
    if (!workspace
      || !sameUuidSelector(workspace.organizationId, input.organizationId)
      || !sameUuidSelector(workspace.workspaceId, input.workspaceId)
      || !workspace.page.baselineEligibilityCursorApplied) {
      throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    }
    return workspace;
  },

  async loadMonitorApprovedBaselines(input: Parameters<typeof loadProjection>[0]): Promise<MonitorApprovedBaselinesProjection> {
    const projection = await loadProjection(input);
    if (!projection.monitorApprovedBaselines) throw new EnterpriseIntelligenceClientError('ENTERPRISE_PROJECTION_UNAVAILABLE');
    return projection.monitorApprovedBaselines;
  },

  registerProvider(input: {
    organizationId: string;
    workspaceId: string;
    expectedAuthorizationVersion: number;
    provider: EnterpriseAiProvider;
    displayName: string;
    endpoint?: string;
    deployment?: string;
    defaultModel: string;
    modelAllowlist: string[];
    capabilities?: EnterpriseAiCapability[];
    budget?: { dailyRequests?: number; monthlyTokens?: number };
  }) {
    return invokeProviderLifecycle({
      operation: 'provider.register',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      expectedAuthorizationVersion: input.expectedAuthorizationVersion,
      payload: {
        provider: input.provider,
        displayName: input.displayName,
        endpoint: input.endpoint,
        deployment: input.deployment,
        defaultModel: input.defaultModel,
        modelAllowlist: input.modelAllowlist,
        budget: input.budget,
        capabilities: input.capabilities || [...ENTERPRISE_AI_CAPABILITIES],
      },
    });
  },

  bindProviderSecret(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; providerKey?: string; preProvisionedReference?: string }) {
    return invokeProviderLifecycle({ operation: 'provider.secret.bind', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, providerKey: input.providerKey, preProvisionedReference: input.preProvisionedReference } });
  },

  validateProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.validate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  activateProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.activate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  rotateProviderSecret(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; providerKey?: string; preProvisionedReference?: string }) {
    return invokeProviderLifecycle({ operation: 'provider.secret.rotate', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, providerKey: input.providerKey, preProvisionedReference: input.preProvisionedReference } });
  },

  revokeProvider(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string }) {
    return invokeProviderLifecycle({ operation: 'provider.revoke', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId } });
  },

  toggleProviderRoute(input: { organizationId: string; workspaceId: string; expectedAuthorizationVersion: number; providerConfigId: string; routeId: string; capability: EnterpriseAiCapability; enabled: boolean; allowedRoles?: string[] }) {
    return invokeProviderLifecycle({ operation: 'provider.route.toggle', organizationId: input.organizationId, workspaceId: input.workspaceId, expectedAuthorizationVersion: input.expectedAuthorizationVersion, payload: { providerConfigId: input.providerConfigId, routeId: input.routeId, capability: input.capability, enabled: input.enabled, ...(input.allowedRoles ? { allowedRoles: input.allowedRoles } : {}) } });
  },

  async createStudioSource(input: {
    organizationId: string;
    workspaceId: string;
    displayName: string;
    sourceKind: 'upload' | 'pasted_text';
    filename: string;
    mimeType: string;
    contentBase64: string;
  }): Promise<StudioSourceCreateResult> {
    const displayName = requireStudioBoundedText(input.displayName, 1, 240);
    const filename = requireStudioBoundedText(input.filename, 1, 240);
    if (/[\\/]/u.test(filename)
      || !['upload', 'pasted_text'].includes(input.sourceKind)
      || typeof input.contentBase64 !== 'string'
      || input.contentBase64.length < 4
      || input.contentBase64.length > 16_000_000
      || input.contentBase64.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(input.contentBase64)) {
      throw new EnterpriseIntelligenceClientError('STUDIO_SOURCE_INPUT_INVALID');
    }
    const mimeType = requireStudioSourceMimeType(input.mimeType);
    const response = await invokeCommand({
      commandType: 'studio.source.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: { displayName, sourceKind: input.sourceKind, filename, mimeType, contentBase64: input.contentBase64 },
      outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'],
    });
    return decodeStudioSourceCreateResult(response);
  },

  extractStudioBundle(input: {
    organizationId: string;
    workspaceId: string;
    inputBundleId: string;
    inputBundleVersionId: string;
    expectedInputBundleVersion: number;
    sources: StudioBundleSourceSelector[];
  }) {
    if (!Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || input.sources.length < 1 || input.sources.length > 20
      || new Set(input.sources.map(source => source.sourceVersionId.toLowerCase())).size !== input.sources.length) {
      throw new EnterpriseIntelligenceClientError('STUDIO_SOURCE_BINDING_STALE');
    }
    const sources = input.sources.map((source, index) => {
      if (source.ordinal !== index + 1 || !Number.isSafeInteger(source.expectedSourceSetVersion) || source.expectedSourceSetVersion < 1) {
        throw new EnterpriseIntelligenceClientError('STUDIO_SOURCE_BINDING_STALE');
      }
      return {
        ordinal: source.ordinal,
        sourceSetId: requireUuidSelector(source.sourceSetId),
        sourceSetVersionId: requireUuidSelector(source.sourceSetVersionId),
        expectedSourceSetVersion: source.expectedSourceSetVersion,
        sourceId: requireUuidSelector(source.sourceId),
        sourceVersionId: requireUuidSelector(source.sourceVersionId),
      };
    });
    return invokeCommand({
      commandType: 'studio.bundle.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionId: requireUuidSelector(input.inputBundleVersionId),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sources,
      },
      outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'],
    });
  },

  reviewStudioCandidate(input: StudioCandidateReviewInput) {
    const reason = input.reason?.trim();
    const value = input.value?.trim();
    if (!Number.isSafeInteger(input.candidateVersion) || input.candidateVersion < 1
      || !Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || !Number.isSafeInteger(input.expectedSourceSetVersion) || input.expectedSourceSetVersion < 1
      || !['accepted', 'rejected', 'edited'].includes(input.status)
      || ((input.status === 'rejected' || input.status === 'edited') && (!reason || Array.from(reason).length < 4 || Array.from(reason).length > 2_000))
      || (input.status === 'edited' && (!value || Array.from(value).length > 12_000))
      || (input.status !== 'edited' && input.value !== undefined)
      || (input.status === 'accepted' && reason && Array.from(reason).length > 2_000)) {
      throw new EnterpriseIntelligenceClientError('STUDIO_SOURCE_BINDING_STALE');
    }
    return invokeCommand({
      commandType: 'studio.candidate.review',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        candidateId: requireUuidSelector(input.candidateId),
        candidateVersion: input.candidateVersion,
        extractionJobId: requireUuidSelector(input.extractionJobId),
        extractionBindingId: requireUuidSelector(input.extractionBindingId),
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionId: requireUuidSelector(input.inputBundleVersionId),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetId: requireUuidSelector(input.sourceSetId),
        sourceSetVersionId: requireUuidSelector(input.sourceSetVersionId),
        expectedSourceSetVersion: input.expectedSourceSetVersion,
        sourceId: requireUuidSelector(input.sourceId),
        sourceVersionId: requireUuidSelector(input.sourceVersionId),
        status: input.status,
        ...(input.status === 'edited' ? { value } : {}),
        ...(reason ? { reason } : {}),
      },
      outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'],
    });
  },

  createEvidenceSource(input: {
    organizationId: string;
    workspaceId: string;
    displayName: string;
    filename: string;
    mimeType: string;
    contentBase64: string;
    sourceKind?: 'upload' | 'pasted_text';
  }) {
    return invokeCommand({
      commandType: 'evidence.source.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  extractEvidence(input: { organizationId: string; workspaceId: string; sourceId: string; sourceVersionId?: string; providerConfigId?: string }) {
    return invokeCommand({
      commandType: 'evidence.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.evidenceExtraction(input.sourceId),
    });
  },

  promoteEvidenceToAssess(input: { organizationId: string; workspaceId: string; sourceId: string; assessDraftId: string; candidateIds: string[] }) {
    return invokeCommand({
      commandType: 'evidence.assess.promote',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.assessPromotion(input.sourceId, input.assessDraftId, input.candidateIds),
    });
  },

  reviewEvidenceCandidate(input: { organizationId: string; workspaceId: string; candidateId: string; status: 'accepted' | 'rejected' | 'edited'; value?: string; reason?: string }) {
    return invokeCommand({
      commandType: 'evidence.candidate.review',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  commitTranscriptSourceSet(input: {
    organizationId: string;
    workspaceId: string;
    sourceSetId?: string;
    expectedVersion?: number;
    label: string;
    description?: string;
    members: Array<{ sourceId: string; versionSelector: string; role: 'primary' | 'supporting' | 'contradictory' | 'reference'; note?: string }>;
  }) {
    const label = input.label.trim();
    const description = input.description?.trim();
    if (!label || Array.from(label).length > 240 || (description && Array.from(description).length > 1_000)) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
    }
    return invokeCommand({
      commandType: 'transcript.source-set.create-version',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.sourceSetId ? { sourceSetId: requireUuidSelector(input.sourceSetId) } : {}),
        displayLabel: label,
        ...(description ? { description } : {}),
        ownerModule: 'assess',
        purpose: description || label,
        lock: true,
        expectedVersion: input.expectedVersion ?? 0,
        items: validateTranscriptSourceSetSelection(input.members).map(member => ({
          sourceVersionId: member.versionSelector,
          ordinal: member.ordinal,
          role: member.role,
          ...(member.note ? { note: member.note } : {}),
        })),
      },
    });
  },

  commitStudioTranscriptSourceSet(input: {
    organizationId: string;
    workspaceId: string;
    sourceSetId?: string;
    expectedVersion?: number;
    label: string;
    description?: string;
    members: Array<{ sourceId: string; versionSelector: string; role: 'primary' | 'supporting' | 'contradictory' | 'reference'; note?: string }>;
  }) {
    const label = input.label.trim();
    const description = input.description?.trim();
    if (!label || Array.from(label).length > 240 || (description && Array.from(description).length > 1_000)) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_SOURCE_SET_INPUT_INVALID');
    return invokeCommand({
      commandType: 'transcript.source-set.create-version', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { ...(input.sourceSetId ? { sourceSetId: requireUuidSelector(input.sourceSetId) } : {}), displayLabel: label, ...(description ? { description } : {}), ownerModule: 'studio', purpose: description || label, lock: true, expectedVersion: input.expectedVersion ?? 0, items: validateTranscriptSourceSetSelection(input.members).map(member => ({ sourceVersionId: member.versionSelector, ordinal: member.ordinal, role: member.role, ...(member.note ? { note: member.note } : {}) })) },
    });
  },

  lockTranscriptInputBundle(input: { organizationId: string; workspaceId: string; inputBundleId?: string; expectedVersion?: number; sourceSetVersionSelectors: string[]; label: string }) {
    const sourceSetVersionSelectors = input.sourceSetVersionSelectors.map(requireUuidSelector);
    if (!input.label.trim() || sourceSetVersionSelectors.length < 1 || sourceSetVersionSelectors.length > 20 || new Set(sourceSetVersionSelectors).size !== sourceSetVersionSelectors.length) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return invokeCommand({
      commandType: 'transcript.input-bundle.lock',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.inputBundleId ? { inputBundleId: requireUuidSelector(input.inputBundleId) } : {}),
        ownerModule: 'assess',
        expectedVersion: input.expectedVersion ?? 0,
        sourceSets: sourceSetVersionSelectors.map((sourceSetVersionId, index) => ({ sourceSetVersionId, ordinal: index + 1, purpose: input.label.trim() })),
      },
    });
  },

  lockStudioTranscriptInputBundle(input: { organizationId: string; workspaceId: string; inputBundleId?: string; expectedVersion?: number; sourceSetVersionSelectors: string[]; label: string }) {
    const sourceSetVersionSelectors = input.sourceSetVersionSelectors.map(requireUuidSelector);
    if (!input.label.trim() || sourceSetVersionSelectors.length < 1 || sourceSetVersionSelectors.length > 20 || new Set(sourceSetVersionSelectors).size !== sourceSetVersionSelectors.length) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    return invokeCommand({ commandType: 'transcript.input-bundle.lock', organizationId: input.organizationId, workspaceId: input.workspaceId, payload: { ...(input.inputBundleId ? { inputBundleId: requireUuidSelector(input.inputBundleId) } : {}), ownerModule: 'studio', expectedVersion: input.expectedVersion ?? 0, sourceSets: sourceSetVersionSelectors.map((sourceSetVersionId,index) => ({ sourceSetVersionId, ordinal:index+1, purpose:input.label.trim() })) } });
  },

  setTranscriptJourneyState(input: { organizationId: string; workspaceId: string; journeyId?: string; desiredExitModule: 'assess' | 'studio' | 'delivery' | 'monitor'; status: 'active' | 'stopped' }) {
    return invokeCommand({
      commandType: 'transcript.journey.set-state',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        ...(input.journeyId ? { journeyId: requireUuidSelector(input.journeyId) } : {}),
        entryModule: 'assess',
        desiredExitModule: input.desiredExitModule,
        status: input.status,
      },
    });
  },

  extractTranscriptAssessBundle(input: {
    organizationId: string;
    workspaceId: string;
    inputBundleId: string;
    inputBundleVersionSelector: string;
    expectedInputBundleVersion: number;
    selections: Array<TranscriptSourceSetLineageSelector & { sourceVersionSelector: string }>;
  }) {
    const inputBundleId = requireUuidSelector(input.inputBundleId);
    const inputBundleVersionSelector = requireUuidSelector(input.inputBundleVersionSelector);
    if (!Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || input.selections.length < 1 || input.selections.length > 20
      || new Set(input.selections.map(item => item.sourceVersionSelector)).size !== input.selections.length) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_INPUT_BUNDLE_INVALID');
    }
    return Promise.all(input.selections.map(selection => invokeCommand({
      commandType: 'transcript.assess.extract',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        inputBundleId, inputBundleVersionSelector, expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetId: requireUuidSelector(selection.sourceSetId),
        sourceSetVersionSelector: requireUuidSelector(selection.sourceSetVersionSelector),
        expectedSourceSetVersion: selection.expectedVersion,
        sourceVersionSelector: requireUuidSelector(selection.sourceVersionSelector),
      },
    })));
  },

  reviewTranscriptAssessCandidate(input: {
    organizationId: string; workspaceId: string; candidateId: string; candidateVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetId: string; sourceSetVersionSelector: string; expectedSourceSetVersion: number; sourceVersionSelector: string;
    status: 'accepted' | 'rejected' | 'edited'; value?: string; reason?: string;
    relationship?: 'neutral' | 'supporting' | 'contradictory'; applicationIntent?: TranscriptAssessApplicationIntent; applyTarget?: string;
  }) {
    if (!Number.isSafeInteger(input.candidateVersion) || input.candidateVersion < 1
      || !Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || !Number.isSafeInteger(input.expectedSourceSetVersion) || input.expectedSourceSetVersion < 1) {
      throw new EnterpriseIntelligenceClientError('TRANSCRIPT_CANDIDATE_STALE');
    }
    return invokeCommand({
      commandType: 'transcript.assess.candidate.review',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        candidateId: requireUuidSelector(input.candidateId), candidateVersion: input.candidateVersion, status: input.status,
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetId: requireUuidSelector(input.sourceSetId),
        sourceSetVersionSelector: requireUuidSelector(input.sourceSetVersionSelector),
        expectedSourceSetVersion: input.expectedSourceSetVersion,
        sourceVersionSelector: requireUuidSelector(input.sourceVersionSelector),
        ...(input.value !== undefined ? { value: input.value } : {}), ...(input.reason ? { reason: input.reason } : {}),
        ...(input.relationship ? { relationship: input.relationship } : {}), ...(input.applicationIntent ? { applicationIntent: input.applicationIntent } : {}),
        ...(input.applyTarget ? { applyTarget: input.applyTarget } : {}),
      },
    });
  },

  previewTranscriptAssessApply(input: {
    organizationId: string; workspaceId: string; assessDraftId: string; expectedDraftVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetVersions: TranscriptSourceSetLineageSelector[];
    selections: Array<{ candidateId: string; candidateVersion: number; intent: TranscriptAssessApplicationIntent; target: string }>;
  }) {
    if (input.selections.length < 1 || input.selections.length > 100) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_ASSESS_BATCH_LIMIT');
    return invokeCommand({
      commandType: 'transcript.assess.apply.preview',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        assessDraftId: requireUuidSelector(input.assessDraftId),
        expectedDraftVersion: input.expectedDraftVersion,
        inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetVersions: encodeTranscriptSourceSetLineage(input.sourceSetVersions),
        selections: input.selections.map(selection => ({ ...selection, candidateId: requireUuidSelector(selection.candidateId) })),
      },
    });
  },

  resolveTranscriptAssessConflict(input: { organizationId: string; workspaceId: string; conflictId: string; resolutionVersion: number; resolution: 'choose_candidate' | 'retain_manual' | 'authored_resolution'; candidateId?: string; authoredValue?: string; rationale: string }) {
    if (!Number.isSafeInteger(input.resolutionVersion) || input.resolutionVersion < 0 || input.rationale.trim().length < 4) throw new EnterpriseIntelligenceClientError('TRANSCRIPT_CONFLICT_RESOLUTION_INVALID');
    return invokeCommand({
      commandType: 'transcript.assess.conflict.resolve',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        conflictId: requireUuidSelector(input.conflictId), resolutionVersion: input.resolutionVersion, resolution: input.resolution,
        ...(input.candidateId ? { candidateId: requireUuidSelector(input.candidateId) } : {}),
        ...(input.authoredValue ? { authoredValue: input.authoredValue } : {}), rationale: input.rationale.trim(),
      },
    });
  },

  applyTranscriptAssessPreview(input: {
    organizationId: string; workspaceId: string; previewBatchId: string; assessDraftId: string; expectedDraftVersion: number;
    inputBundleId: string; inputBundleVersionSelector: string; expectedInputBundleVersion: number;
    sourceSetVersions: TranscriptSourceSetLineageSelector[];
  }) {
    return invokeCommand({
      commandType: 'transcript.assess.apply.commit',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: {
        previewBatchId: requireUuidSelector(input.previewBatchId), assessDraftId: requireUuidSelector(input.assessDraftId),
        expectedDraftVersion: input.expectedDraftVersion, inputBundleId: requireUuidSelector(input.inputBundleId),
        inputBundleVersionSelector: requireUuidSelector(input.inputBundleVersionSelector),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        sourceSetVersions: encodeTranscriptSourceSetLineage(input.sourceSetVersions),
      },
    });
  },

  evaluateModernization(input: { organizationId: string; workspaceId: string; applicationId: string; assessmentVersionId?: string }) {
    return invokeCommand({
      commandType: 'modernization.evaluate',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: buildEnterpriseSelectorPayloads.modernization(input.applicationId),
    });
  },

  recordReview(input: { organizationId: string; workspaceId: string; resourceType: EnterpriseApprovalResourceType; resourceId: string; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.review.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  recordApproval(input: { organizationId: string; workspaceId: string; resourceType: EnterpriseApprovalResourceType; resourceId: string; outcome: 'approved' | 'rejected'; rationale: string }) {
    return invokeCommand({
      commandType: 'approval.record',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },

  handoffStudioDocument(input: { organizationId: string; workspaceId: string; studioDocumentId: string; studioVersion?: number; studioContentHash?: string }) {
    void input;
    throw new EnterpriseIntelligenceClientError('COMMAND_BLOCKED');
  },

  analyzeAssessDocuments(input: {
    organizationId: string; workspaceId: string; caseId: string; expectedCaseVersion: number;
    inputBundleId: string; inputBundleVersionId: string; expectedInputBundleVersion: number;
    providerConfigId?: string;
    selections: Array<{ sourceSetId: string; sourceSetVersionId: string; expectedSourceSetVersion: number; sourceId: string; sourceVersionId: string }>;
  }) {
    if (!Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 1
      || !Number.isSafeInteger(input.expectedInputBundleVersion) || input.expectedInputBundleVersion < 1
      || input.selections.length < 1 || input.selections.length > 20
      || new Set(input.selections.map(item => item.sourceVersionId.toLowerCase())).size !== input.selections.length) {
      throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    }
    return invokeCommand({
      commandType: 'assess.document-map.analyze', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: {
        caseId: requireUuidSelector(input.caseId), expectedCaseVersion: input.expectedCaseVersion,
        inputBundleId: requireUuidSelector(input.inputBundleId), inputBundleVersionId: requireUuidSelector(input.inputBundleVersionId),
        expectedInputBundleVersion: input.expectedInputBundleVersion,
        ...(input.providerConfigId ? { providerConfigId: requireUuidSelector(input.providerConfigId) } : {}),
        selections: input.selections.map(item => {
          if (!Number.isSafeInteger(item.expectedSourceSetVersion) || item.expectedSourceSetVersion < 1) throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
          return { sourceSetId: requireUuidSelector(item.sourceSetId), sourceSetVersionId: requireUuidSelector(item.sourceSetVersionId), expectedSourceSetVersion: item.expectedSourceSetVersion, sourceId: requireUuidSelector(item.sourceId), sourceVersionId: requireUuidSelector(item.sourceVersionId) };
        }),
      },
    });
  },

  reviewAssessDocumentProposal(input: {
    organizationId: string; workspaceId: string; proposalId: string; proposalVersion: number;
    catalogId: string; targetSelectorId: string; caseId: string; expectedCaseVersion: number;
    status: 'accepted' | 'rejected' | 'edited'; editedValue?: AssessMappingJsonValue; reason?: string;
  }) {
    if (!Number.isSafeInteger(input.proposalVersion) || input.proposalVersion < 1
      || !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 1
      || (input.status === 'edited' && !isAssessMappingJsonValue(input.editedValue))
      || (input.status !== 'edited' && input.editedValue !== undefined)
      || (input.reason !== undefined && input.reason.trim().length > 2_000)) throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    return invokeCommand({
      commandType: 'assess.document-map.proposal.review', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { proposalId: requireUuidSelector(input.proposalId), proposalVersion: input.proposalVersion, catalogId: requireUuidSelector(input.catalogId), targetSelectorId: requireUuidSelector(input.targetSelectorId), caseId: requireUuidSelector(input.caseId), expectedCaseVersion: input.expectedCaseVersion, status: input.status, ...(input.editedValue !== undefined ? { editedValue: input.editedValue } : {}), ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}) },
    });
  },

  previewAssessDocumentMapping(input: {
    organizationId: string; workspaceId: string; catalogId: string; catalogHash: string;
    caseId: string; expectedCaseVersion: number; inputBundleId: string; inputBundleVersionId: string;
    selections: Array<{ proposalId: string; proposalVersion: number; targetSelectorId: string; effectiveValue: AssessMappingJsonValue }>;
  }) {
    if (!/^[0-9a-f]{64}$/.test(input.catalogHash) || !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 1
      || input.selections.length < 1 || input.selections.length > ASSESS_DOCUMENT_MAPPING_MAX_PROPOSALS
      || new Set(input.selections.map(item => item.proposalId.toLowerCase())).size !== input.selections.length
      || input.selections.some(item => !Number.isSafeInteger(item.proposalVersion) || item.proposalVersion < 1 || !isAssessMappingJsonValue(item.effectiveValue))) {
      throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    }
    return invokeCommand({
      commandType: 'assess.document-map.preview', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { catalogId: requireUuidSelector(input.catalogId), catalogHash: input.catalogHash, caseId: requireUuidSelector(input.caseId), expectedCaseVersion: input.expectedCaseVersion, inputBundleId: requireUuidSelector(input.inputBundleId), inputBundleVersionId: requireUuidSelector(input.inputBundleVersionId), selections: input.selections.map(item => ({ ...item, proposalId: requireUuidSelector(item.proposalId), targetSelectorId: requireUuidSelector(item.targetSelectorId) })) },
    });
  },

  resolveAssessDocumentMappingConflict(input: {
    organizationId: string; workspaceId: string; conflictId: string; resolutionVersion: number;
    resolution: 'choose_candidate' | 'retain_manual' | 'authored_resolution'; proposalId?: string;
    authoredValue?: AssessMappingJsonValue; rationale: string;
  }) {
    if (!Number.isSafeInteger(input.resolutionVersion) || input.resolutionVersion < 0 || input.rationale.trim().length < 4 || input.rationale.trim().length > 2_000
      || (input.resolution === 'choose_candidate' && (!input.proposalId || input.authoredValue !== undefined))
      || (input.resolution === 'authored_resolution' && (!isAssessMappingJsonValue(input.authoredValue) || input.proposalId !== undefined))
      || (input.resolution === 'retain_manual' && (input.proposalId !== undefined || input.authoredValue !== undefined))) throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    return invokeCommand({ commandType: 'assess.document-map.conflict.resolve', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { conflictId: requireUuidSelector(input.conflictId), resolutionVersion: input.resolutionVersion, resolution: input.resolution, ...(input.proposalId ? { proposalId: requireUuidSelector(input.proposalId) } : {}), ...(input.authoredValue !== undefined ? { authoredValue: input.authoredValue } : {}), rationale: input.rationale.trim() } });
  },

  commitAssessDocumentMapping(input: {
    organizationId: string; workspaceId: string; previewBatchId: string; catalogId: string; catalogHash: string;
    caseId: string; expectedCaseVersion: number; inputBundleId: string; inputBundleVersionId: string;
    previewManifest: AssessMappingPreviewManifest;
  }) {
    if (!/^[0-9a-f]{64}$/.test(input.catalogHash) || !Number.isSafeInteger(input.expectedCaseVersion) || input.expectedCaseVersion < 1) throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    const previewManifest = requireAssessMappingPreviewManifest(input.previewManifest);
    if (!sameUuidSelector(previewManifest.previewBatchId, input.previewBatchId) || !sameUuidSelector(previewManifest.catalogId, input.catalogId)
      || previewManifest.catalogHash !== input.catalogHash || !sameUuidSelector(previewManifest.caseId, input.caseId)
      || previewManifest.caseVersion !== input.expectedCaseVersion || !sameUuidSelector(previewManifest.inputBundleId, input.inputBundleId)
      || !sameUuidSelector(previewManifest.inputBundleVersionId, input.inputBundleVersionId)) throw new EnterpriseIntelligenceClientError('ASSESS_DOCUMENT_MAPPING_STALE');
    return invokeCommand({ commandType: 'assess.document-map.commit', organizationId: input.organizationId, workspaceId: input.workspaceId,
      payload: { previewBatchId: requireUuidSelector(input.previewBatchId), catalogId: requireUuidSelector(input.catalogId), catalogHash: input.catalogHash, caseId: requireUuidSelector(input.caseId), expectedCaseVersion: input.expectedCaseVersion, inputBundleId: requireUuidSelector(input.inputBundleId), inputBundleVersionId: requireUuidSelector(input.inputBundleVersionId), previewManifest },
      outcomeUnknownCodes: ['COMMAND_OUTCOME_UNKNOWN', 'RECEIPT_FINALIZATION_FAILED'] });
  },

  requestDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.request'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.request', input);
  },

  resolveDeliveryHandoffReview(input: DeliveryCommandInput<'delivery.handoff.review.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.review.resolve', input);
  },

  resolveDeliveryHandoffApproval(input: DeliveryCommandInput<'delivery.handoff.approval.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.approval.resolve', input);
  },

  withdrawDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.withdraw'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.withdraw', input);
  },

  consumeDeliveryHandoff(input: DeliveryCommandInput<'delivery.handoff.consume'>) {
    return invokeDeliveryMonitorAction('delivery.handoff.consume', input);
  },

  createManualDeliveryPackage(input: DeliveryCommandInput<'delivery.package.create.manual'>) {
    return invokeDeliveryMonitorAction('delivery.package.create.manual', input);
  },

  reviewDeliveryItem(input: DeliveryCommandInput<'delivery.item.review'>) {
    return invokeDeliveryMonitorAction('delivery.item.review', input);
  },

  commitDeliveryPackageRevision(input: DeliveryCommandInput<'delivery.package.revision.commit'>) {
    return invokeDeliveryMonitorAction('delivery.package.revision.commit', input);
  },

  resolveDeliveryPackageReview(input: DeliveryCommandInput<'delivery.package.review.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.package.review.resolve', input);
  },

  resolveDeliveryPackageApproval(input: DeliveryCommandInput<'delivery.package.approval.resolve'>) {
    return invokeDeliveryMonitorAction('delivery.package.approval.resolve', input);
  },

  createMonitorBaseline(input: DeliveryCommandInput<'monitor.baseline.create'>) {
    return invokeDeliveryMonitorAction('monitor.baseline.create', input);
  },

  createAssembleBlueprint(input: { organizationId: string; workspaceId: string; modernizationDecisionId: string; name: string }) {
    return invokeCommand({
      commandType: 'assemble.blueprint.create',
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      payload: input,
    });
  },
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};
