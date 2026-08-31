import { runBudgetedProviderEffect, type ProviderBudgetReservation, type ProviderBudgetReservationInput } from './providerBudget.ts';
import {
  callStudioArtifactProvider,
  estimateStudioProviderInputTokens,
  StudioProviderGatewayError,
  type StudioProviderGatewayResult,
  type StudioProviderPlan,
} from './studioArtifactProvider.ts';
import type { JsonObject } from './studioArtifactCommand.ts';
import { rpc } from './supabase.ts';
import type { StudioCanonicalSourceAnchorDto } from '../../../services/studioArtifacts/contracts.ts';

export const STUDIO_GENERATION_FAILURE_CODES = [
  'PROVIDER_GOVERNANCE_BLOCKED', 'PROVIDER_REQUEST_FAILED', 'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT', 'PROVIDER_CANCELLED', 'PROVIDER_OUTPUT_INVALID', 'PROVIDER_OUTPUT_OVERSIZED',
  'PROVIDER_MODEL_MISMATCH', 'PROVIDER_USAGE_INVALID', 'SOURCE_COVERAGE_INCOMPLETE',
  'GENERATION_COMPLETION_CONFLICT', 'GENERATION_START_CONFLICT', 'GENERATION_UNCERTAIN',
] as const;
export type StudioGenerationFailureCode = typeof STUDIO_GENERATION_FAILURE_CODES[number];

export type StudioGenerationClaim = Readonly<{
  attemptId: string;
  artifactId: string;
  receiptId: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  authorizationVersion: number;
  requestId: string;
  executionToken: string;
  executionFence: number;
  leaseExpiresAt: string;
  sourcePackageId: string;
  sourcePackageVersion: number;
  sourcePackage: JsonObject;
  sourcePackageHash: string;
  selectedSourceVersionIds: readonly string[];
  sourceAnchors: readonly StudioCanonicalSourceAnchorDto[];
  sourcePackageHead: number;
  templateId: string;
  templateVersionId: string;
  templateVersion: string | number;
  templatePayload: JsonObject;
  templateHash: string;
  templateHead: number;
  expectedArtifactHead: number;
  manualBrief: string | null;
  providerPlan: StudioProviderPlan;
  maximumOutputTokens: number;
  timeoutMs: number;
  providerAllowed: boolean;
  reconcileOnly: boolean;
}>;

export type StudioGenerationFinalization =
  | { state: 'completed'; resource: unknown }
  | { state: 'stale'; resource?: unknown }
  | { state: 'failed'; failureCode: StudioGenerationFailureCode }
  | { state: 'uncertain'; failureCode: StudioGenerationFailureCode }
  | { state: 'in_progress'; resource?: unknown };

export interface StudioGenerationDependencies {
  runProvider(input: Parameters<typeof callStudioArtifactProvider>[0]): Promise<StudioProviderGatewayResult>;
  stage(input: {
    attemptId: string; executionToken: string; executionFence: number;
    providerOperationId?: string; response: JsonObject;
  }): Promise<void>;
  finalize(input: {
    attemptId: string; executionToken: string; executionFence: number;
    sourcePackageHead: number; templateHead: number; expectedArtifactHead: number;
  }): Promise<{ state: 'completed' | 'stale' | 'in_progress'; resource?: unknown }>;
  fail(attemptId: string, failureCode: StudioGenerationFailureCode): Promise<void>;
  runBudgeted?: typeof runBudgetedProviderEffect;
  signal?: AbortSignal;
}

type JsonDraft = JsonObject & {
  contractVersion?: unknown;
  title: unknown;
  summary: unknown;
  sections: unknown;
  coverage?: unknown;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const SECTION_ID = /^[a-z][a-z0-9_.-]{0,79}$/;
const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const exact = (value: JsonObject, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};
const uniqueStrings = (value: unknown, maximum: number) => {
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== 'string')) return null;
  const items = value as string[]; return new Set(items).size === items.length ? items : null;
};
const validTree = (value: unknown, depth = 0): boolean => depth <= 10 && (
  value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)
  || typeof value === 'string' && value.length <= 20_000
  || Array.isArray(value) && value.length <= 200 && value.every(item => validTree(item, depth + 1))
  || object(value) && Object.keys(value).length <= 200 && Object.entries(value).every(([key, item]) => key.length > 0 && key.length <= 120 && validTree(item, depth + 1))
);

const legacyDraft = (value: JsonDraft): JsonObject => {
  if (!exact(value, ['title', 'summary', 'sections']) || typeof value.title !== 'string' || !value.title.trim()
    || value.title.length > 300 || typeof value.summary !== 'string' || value.summary.length > 5_000
    || !Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 100) throw new Error('invalid');
  for (const section of value.sections) {
    if (!object(section) || !exact(section, ['title', 'content']) || typeof section.title !== 'string'
      || !section.title.trim() || section.title.length > 300 || typeof section.content !== 'string'
      || section.content.length > 20_000) throw new Error('invalid');
  }
  return value;
};

/**
 * Validates both the accepted `studio-artifact-1` shape and PR B structured
 * output. PR B validation receives the exact server-selected source identities;
 * output cannot introduce an unselected source or silently omit coverage.
 */
export const validateStudioDraft = (
  value: unknown,
  selectedSourceVersionIds?: readonly string[],
  allowedSourceAnchors?: readonly StudioCanonicalSourceAnchorDto[],
): JsonObject => {
  if (!object(value) || !validTree(value) || JSON.stringify(value).length > 500_000) throw new Error('invalid');
  const draft = value as JsonDraft;
  if (draft.contractVersion === undefined) return legacyDraft(draft);
  if (draft.contractVersion !== 'studio-artifact-2' || !exact(draft, ['contractVersion', 'title', 'summary', 'sections', 'coverage'])
    || typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 300
    || typeof draft.summary !== 'string' || draft.summary.length > 5_000
    || !Array.isArray(draft.sections) || draft.sections.length < 1 || draft.sections.length > 100) throw new Error('invalid');
  const selected = selectedSourceVersionIds ? [...selectedSourceVersionIds] : null;
  if (!selected || selected.some(id => !UUID.test(id)) || new Set(selected).size !== selected.length) throw new Error('invalid');
  const selectedSet = new Set(selected); const anchored = new Set<string>(); const sectionIds = new Set<string>();
  const anchorKey = (anchor: StudioCanonicalSourceAnchorDto) => `${anchor.sourceVersionId}\u0000${anchor.locator}\u0000${anchor.anchorHash}`;
  const allowedAnchorKeys = allowedSourceAnchors === undefined ? null : new Set(allowedSourceAnchors.map(anchor => {
    if (!UUID.test(anchor.sourceVersionId) || !anchor.locator.trim() || anchor.locator.length > 500 || !HASH.test(anchor.anchorHash)) throw new Error('invalid');
    return anchorKey(anchor);
  }));
  if (allowedAnchorKeys && allowedAnchorKeys.size !== allowedSourceAnchors?.length) throw new Error('invalid');
  for (const rawSection of draft.sections) {
    if (!object(rawSection) || !exact(rawSection, ['id', 'title', 'body', 'sourceAnchors', 'labels'])
      || typeof rawSection.id !== 'string' || !SECTION_ID.test(rawSection.id) || sectionIds.has(rawSection.id)
      || typeof rawSection.title !== 'string' || !rawSection.title.trim() || rawSection.title.length > 300
      || typeof rawSection.body !== 'string' || rawSection.body.length > 20_000 || !Array.isArray(rawSection.sourceAnchors)) throw new Error('invalid');
    sectionIds.add(rawSection.id);
    const labels = uniqueStrings(rawSection.labels, 3);
    if (!labels || labels.some(label => !['human_authored', 'template_required', 'assumption'].includes(label))) throw new Error('invalid');
    for (const rawAnchor of rawSection.sourceAnchors) {
      if (!object(rawAnchor) || !exact(rawAnchor, ['sourceVersionId', 'locator', 'anchorHash'])
        || typeof rawAnchor.sourceVersionId !== 'string' || !selectedSet.has(rawAnchor.sourceVersionId)
        || typeof rawAnchor.locator !== 'string' || !rawAnchor.locator.trim() || rawAnchor.locator.length > 500
        || typeof rawAnchor.anchorHash !== 'string' || !HASH.test(rawAnchor.anchorHash)
        || allowedAnchorKeys && !allowedAnchorKeys.has(anchorKey(rawAnchor as unknown as StudioCanonicalSourceAnchorDto))) throw new Error('invalid');
      anchored.add(rawAnchor.sourceVersionId);
    }
    if (rawSection.sourceAnchors.length === 0 && labels.length === 0) throw new Error('invalid');
  }
  if (!object(draft.coverage) || !exact(draft.coverage, ['selectedSourceVersionIds', 'coveredSourceVersionIds', 'complete'])) throw new Error('invalid');
  const declaredSelected = uniqueStrings(draft.coverage.selectedSourceVersionIds, 20);
  const declaredCovered = uniqueStrings(draft.coverage.coveredSourceVersionIds, 20);
  if (!declaredSelected || !declaredCovered || draft.coverage.complete !== true
    || declaredSelected.length !== selected.length || declaredSelected.some((id, index) => id !== selected[index])
    || declaredCovered.length !== selected.length || declaredCovered.some(id => !selectedSet.has(id))
    || anchored.size !== selected.length || selected.some(id => !anchored.has(id) || !declaredCovered.includes(id))) throw new Error('invalid');
  return value;
};

const failureCode = (error: unknown): StudioGenerationFailureCode => {
  if (error instanceof StudioProviderGatewayError) {
    const map: Record<StudioProviderGatewayError['code'], StudioGenerationFailureCode> = {
      PROVIDER_ROUTE_UNAVAILABLE: 'PROVIDER_GOVERNANCE_BLOCKED', PROVIDER_REQUEST_FAILED: 'PROVIDER_REQUEST_FAILED',
      PROVIDER_RATE_LIMITED: 'PROVIDER_RATE_LIMITED', PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
      PROVIDER_CANCELLED: 'PROVIDER_CANCELLED', PROVIDER_OUTPUT_INVALID: 'PROVIDER_OUTPUT_INVALID',
      PROVIDER_MODEL_MISMATCH: 'PROVIDER_MODEL_MISMATCH', PROVIDER_USAGE_INVALID: 'PROVIDER_USAGE_INVALID',
      SOURCE_COVERAGE_INCOMPLETE: 'SOURCE_COVERAGE_INCOMPLETE',
    };
    return map[error.code];
  }
  if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'PROVIDER_EFFECT_UNCERTAIN') return 'GENERATION_UNCERTAIN';
  return 'PROVIDER_REQUEST_FAILED';
};

const budgetInput = (claim: StudioGenerationClaim): ProviderBudgetReservationInput => ({
  authority: {
    actorId: claim.actorId, organizationId: claim.organizationId, workspaceId: claim.workspaceId,
    authorizationVersion: claim.authorizationVersion,
  },
  execution: {
    receiptId: claim.receiptId, jobId: claim.attemptId, executionToken: claim.executionToken,
    executionFence: claim.executionFence, routeId: claim.providerPlan.routeId,
    providerConfigId: claim.providerPlan.providerConfigId, provider: claim.providerPlan.provider,
    capability: 'studio.document.generate', model: claim.providerPlan.model,
  },
  estimatedInputTokens: estimateStudioProviderInputTokens({
    sourcePackage: claim.sourcePackage,
    templatePayload: claim.templatePayload,
    manualBrief: claim.manualBrief,
  }),
  maximumOutputTokens: claim.maximumOutputTokens,
});

export const studioBudgetRpc = <T>(
  name: string,
  args: Record<string, unknown>,
  invoke: typeof rpc = rpc,
): Promise<T> => {
  const mapped = {
    enterprise_ai_reserve_provider_budget: 'studio_artifact_reserve_provider_budget_v2',
    enterprise_ai_settle_provider_budget_v2: 'studio_artifact_settle_provider_budget_v2',
    enterprise_ai_mark_provider_budget_uncertain_v2: 'studio_artifact_mark_provider_budget_uncertain_v2',
    enterprise_ai_release_provider_budget_v2: 'studio_artifact_release_provider_budget_v2',
  }[name];
  if (!mapped) throw new Error('STUDIO_BUDGET_RPC_UNAVAILABLE');
  const { p_job: p_attempt, ...rest } = args;
  return invoke<T>(mapped, { ...rest, p_attempt });
};

export const executeClaimedStudioGeneration = async (
  claim: StudioGenerationClaim,
  deps: StudioGenerationDependencies,
): Promise<StudioGenerationFinalization> => {
  let stagedContent: JsonObject | undefined;
  let postEffectPhase = false;
  const runBudgeted = deps.runBudgeted ?? ((input, effect, options) => runBudgetedProviderEffect(
    input, effect, { ...options, invoke: studioBudgetRpc },
  ));
  try {
    if (!claim.providerAllowed || claim.reconcileOnly) {
      // Reconcile-only claims may already own a staged provider response. Any
      // finalize ambiguity must preserve that effect for the next fence owner.
      postEffectPhase = true;
      const reconciled = await deps.finalize({
        attemptId: claim.attemptId, executionToken: claim.executionToken, executionFence: claim.executionFence,
        sourcePackageHead: claim.sourcePackageHead, templateHead: claim.templateHead,
        expectedArtifactHead: claim.expectedArtifactHead,
      });
      if (reconciled.state === 'completed') return { state: 'completed', resource: reconciled.resource ?? {} };
      if (reconciled.state === 'stale') return { state: 'stale', resource: reconciled.resource };
      return { state: 'in_progress', resource: reconciled.resource };
    }
    const execution = await runBudgeted(budgetInput(claim), async () => deps.runProvider({
      organizationId: claim.organizationId, workspaceId: claim.workspaceId, actorId: claim.actorId,
      plan: claim.providerPlan, sourcePackage: claim.sourcePackage, templatePayload: claim.templatePayload,
      manualBrief: claim.manualBrief, maximumOutputTokens: claim.maximumOutputTokens,
      timeoutMs: claim.timeoutMs, signal: deps.signal,
    }), {
      signal: deps.signal,
      classifyFailure: error => error instanceof StudioProviderGatewayError
        ? { effectMayHaveOccurred: error.effectMayHaveOccurred, failureClass: error.code.toLowerCase() }
        : { effectMayHaveOccurred: true, failureClass: 'studio_provider_unknown' },
      beforeSettle: async (providerResult: StudioProviderGatewayResult, _reservation: ProviderBudgetReservation) => {
        // The provider returned. From here onward a terminal failure write could
        // erase a staged/effected attempt and permit a duplicate provider call.
        postEffectPhase = true;
        let content: JsonObject;
        try { content = validateStudioDraft(providerResult.content, claim.selectedSourceVersionIds, claim.sourceAnchors); }
        catch {
          if (JSON.stringify(providerResult.content).length > 500_000) throw new StudioProviderGatewayError('PROVIDER_OUTPUT_INVALID', true);
          throw new StudioProviderGatewayError('SOURCE_COVERAGE_INCOMPLETE', true);
        }
        stagedContent = content;
        await deps.stage({
          attemptId: claim.attemptId, executionToken: claim.executionToken, executionFence: claim.executionFence,
          providerOperationId: providerResult.providerOperationId, response: content,
        });
      },
    });
    postEffectPhase = true;
    // A reservation replay means the provider effect is already staged or
    // uncertain. Finalize/reconcile from durable server state only.
    if (execution.kind === 'executed' && !stagedContent) throw new Error('stage missing');
    const finalized = await deps.finalize({
      attemptId: claim.attemptId, executionToken: claim.executionToken, executionFence: claim.executionFence,
      sourcePackageHead: claim.sourcePackageHead, templateHead: claim.templateHead,
      expectedArtifactHead: claim.expectedArtifactHead,
    });
    if (finalized.state === 'completed') return { state: 'completed', resource: finalized.resource ?? {} };
    if (finalized.state === 'stale') return { state: 'stale', resource: finalized.resource };
    return { state: 'in_progress', resource: finalized.resource };
  } catch (error) {
    const code = failureCode(error);
    if (postEffectPhase || code === 'GENERATION_UNCERTAIN'
      || error instanceof StudioProviderGatewayError && error.effectMayHaveOccurred) {
      return { state: 'uncertain', failureCode: 'GENERATION_UNCERTAIN' };
    }
    try { await deps.fail(claim.attemptId, code); }
    catch { return { state: 'uncertain', failureCode: 'GENERATION_UNCERTAIN' }; }
    return { state: 'failed', failureCode: code };
  }
};
