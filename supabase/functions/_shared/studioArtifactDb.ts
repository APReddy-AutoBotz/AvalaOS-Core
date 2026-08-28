import { getAuthUser, postgrest, supabaseEnv } from './supabase.ts';
import {
  STUDIO_SAFE_ERROR_CODES,
  StudioArtifactError,
  type JsonObject,
  type StudioArtifactAtomicCommand,
  type StudioArtifactAuthority,
  type StudioArtifactDomainErrorCode,
  type StudioAtomicCommandResult,
} from './studioArtifactCommand.ts';
import type { StudioArtifactCommandDependencies } from './studioArtifactHandler.ts';
import {
  executeClaimedStudioGeneration,
  type StudioGenerationClaim,
  type StudioGenerationFailureCode,
} from './studioArtifactGeneration.ts';
import { callStudioArtifactProvider } from './studioArtifactProvider.ts';
import { ENTERPRISE_AI_PROVIDERS } from '../../../services/enterpriseIntelligence.ts';
import {
  STUDIO_TEMPLATE_ARTIFACT_CLASSES,
  STUDIO_TEMPLATE_LIFECYCLES,
  type StudioTemplateProjectionDto,
  type StudioTemplateProjectionRootDto,
  type StudioTemplateSectionDefinition,
  type StudioCanonicalSourceAnchorDto,
} from '../../../services/studioArtifacts/contracts.ts';

/** Centralized RPC inventory; migrations and adapters must move in lockstep. */
export const STUDIO_RPC = {
  authority: 'studio_artifact_authority',
  artifactCommand: 'studio_artifact_command_claim',
  sourcePackageCommand: 'studio_artifact_source_package_create',
  manualBriefMaterial: 'studio_artifact_manual_brief_material_retrieve',
  handoffCommand: 'enterprise_assess_studio_handoff_command',
  templateCommand: 'studio_tenant_template_command',
  generationRequest: 'studio_artifact_generation_request_v2',
  generationClaim: 'studio_artifact_generation_claim_v2',
  generationStage: 'studio_artifact_generation_stage_v2',
  generationFinalize: 'studio_artifact_generation_finalize_v2',
  generationCancel: 'studio_artifact_generation_cancel_v2',
  generationTimeout: 'studio_artifact_generation_timeout_v2',
  generationFail: 'studio_artifact_generation_fail_v2',
  artifactSummaryProjection: 'studio_artifact_summary_projection_v2',
} as const;

type RpcError = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
const exactRpcSignals: Record<string, StudioArtifactDomainErrorCode> = {
  INVALID_COMMAND: 'INVALID_COMMAND', INVALID_TEMPLATE_STRUCTURE: 'INVALID_COMMAND',
  VERSION_CONFLICT: 'VERSION_CONFLICT', IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  STUDIO_SEPARATION_OF_DUTY: 'SEPARATION_OF_DUTY', STUDIO_FEATURE_DISABLED: 'FEATURE_DISABLED',
  PR1B_AUTHORIZATION_STALE: 'AUTHORITY_STALE', COMMAND_IN_PROGRESS: 'COMMAND_IN_PROGRESS',
  RESOURCE_NOT_AVAILABLE: 'RESOURCE_NOT_AVAILABLE', STUDIO_RESOURCE_STALE: 'RESOURCE_STALE',
  STUDIO_SOURCE_COVERAGE_INCOMPLETE: 'SOURCE_COVERAGE_INCOMPLETE',
  STUDIO_HANDOFF_NOT_ELIGIBLE: 'HANDOFF_NOT_ELIGIBLE', STUDIO_HANDOFF_STALE: 'HANDOFF_STALE',
  HANDOFF_EXPIRED: 'HANDOFF_EXPIRED',
  STUDIO_TEMPLATE_NOT_APPROVED: 'TEMPLATE_NOT_APPROVED', STUDIO_PROVIDER_ROUTE_UNAVAILABLE: 'PROVIDER_ROUTE_UNAVAILABLE',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED', STUDIO_RECEIPT_FINALIZATION_FAILED: 'RECEIPT_FINALIZATION_FAILED',
  SOURCE_PACKAGE_STALE: 'RESOURCE_STALE', TEMPLATE_STALE: 'TEMPLATE_NOT_APPROVED',
  PROVIDER_ROUTE_UNAVAILABLE: 'PROVIDER_ROUTE_UNAVAILABLE', STUDIO_READ_ONLY: 'READ_ONLY',
  STUDIO_IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT', STALE_EXECUTION_FENCE: 'RESOURCE_STALE',
  INVALID_GENERATION_RESPONSE: 'GENERATION_FAILED',
};
export const decodeStudioRpcError = (error: unknown): StudioArtifactError => {
  const candidate = error && typeof error === 'object' ? error as RpcError : {};
  for (const field of [candidate.code, candidate.message, candidate.details, candidate.hint]) {
    if (typeof field !== 'string') continue;
    const token = field.trim();
    if (STUDIO_SAFE_ERROR_CODES.includes(token as StudioArtifactDomainErrorCode)) return new StudioArtifactError(token as StudioArtifactDomainErrorCode);
    if (exactRpcSignals[token]) return new StudioArtifactError(exactRpcSignals[token]);
  }
  return new StudioArtifactError('COMMAND_UNAVAILABLE');
};

type Rpc = <T>(name: string, args: JsonObject) => Promise<T>;
const rpc: Rpc = async <T>(name: string, args: JsonObject): Promise<T> => {
  const { url, serviceRoleKey } = supabaseEnv(); let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', redirect: 'error',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  } catch { throw new StudioArtifactError('COMMAND_UNAVAILABLE'); }
  if (!response.ok) {
    let body: unknown; try { body = await response.json(); } catch { body = {}; }
    throw decodeStudioRpcError(body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

const object = (value: unknown): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  return value as JsonObject;
};
const string = (value: unknown): string => typeof value === 'string' && value.trim() ? value : (() => { throw new StudioArtifactError('COMMAND_UNAVAILABLE'); })();
const integer = (value: unknown, minimum = 0): number => Number.isSafeInteger(value) && Number(value) >= minimum ? Number(value) : (() => { throw new StudioArtifactError('COMMAND_UNAVAILABLE'); })();
const field = (value: JsonObject, camel: string, snake?: string) => value[camel] ?? (snake ? value[snake] : undefined);
const RPC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const durableUuid = (value: unknown): string => {
  const selector = string(value);
  if (!RPC_UUID.test(selector)) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  return selector;
};

const normalizeCommandResult = (command: StudioArtifactAtomicCommand, value: unknown): StudioAtomicCommandResult => {
  const row = object(value); const outcomeValue = field(row, 'outcome');
  if (outcomeValue !== 'committed' && outcomeValue !== 'replayed' && outcomeValue !== 'command_in_progress') {
    throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  }
  const outcome = outcomeValue;
  const resourceId = durableUuid(field(row, 'resourceId', 'resource_id') ?? field(row, 'artifactId', 'artifact_id')
    ?? field(row, 'handoffId', 'handoff_id') ?? field(row, 'templateId', 'template_id') ?? field(row, 'sourcePackageId', 'source_package_id'));
  const receiptId = durableUuid(field(row, 'receiptId', 'receipt_id'));
  const rawPlan = field(row, 'generationClaim', 'generation_claim') ?? field(row, 'generationPlan', 'generation_plan');
  const generationClaim = rawPlan && typeof rawPlan === 'object' && !Array.isArray(rawPlan) ? {
    ...(rawPlan as JsonObject),
    actorId: command.actorId,
    organizationId: command.organizationId,
    workspaceId: command.workspaceId,
    authorizationVersion: command.authorizationVersion,
    requestId: command.requestId,
    receiptId,
    sourcePackageVersion: command.payload.sourcePackageVersion,
    expectedTemplateVersion: command.payload.template && typeof command.payload.template === 'object'
      ? (command.payload.template as JsonObject).version : undefined,
  } : undefined;
  const safeFields = (names: ReadonlyArray<readonly [string, string?]>): JsonObject => Object.fromEntries(names.flatMap(([camel, snake]) => {
    const item = field(row, camel, snake);
    return item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? [[camel, item]] : [];
  }));
  const resource = command.commandType === 'studio.generation.request'
    ? safeFields([['artifactId', 'resource_id'], ['attemptId', 'attempt_id'], ['state']])
    : command.commandType === 'studio.source-package.create'
      ? safeFields([['artifactId', 'artifact_id'], ['sourcePackageId', 'source_package_id'], ['sourceMode', 'source_mode'], ['lineageClassification', 'lineage_classification'], ['planningOnly', 'planning_only']])
      : command.commandType.startsWith('studio.handoff.')
        ? safeFields([['handoffId', 'handoff_id'], ['version'], ['status'], ['resourceId', 'resource_id'], ['sourcePackageId', 'source_package_id']])
        : command.commandType.startsWith('studio.template.')
          ? safeFields([['templateId', 'template_id'], ['templateVersionId', 'template_version_id'], ['version'], ['status']])
          : row;
  return {
    outcome, receiptId, resourceId, resource,
    ...(generationClaim ? { generationClaim } : {}),
  };
};

const templateRpcCommand = (command: StudioArtifactAtomicCommand) => {
  const payload = command.payload;
  const create = command.commandType === 'studio.template.create';
  const revise = command.commandType === 'studio.template.revise';
  let translated = payload;
  if (create || revise) {
    translated = {
      name: payload.name, description: payload.description,
      artifactClass: payload.artifactClass ?? 'custom',
      sectionDefinitions: payload.sections, fieldSchema: {},
      rendererCompatibilityVersion: payload.rendererVersion,
      contentSchemaVersion: 'studio-structured-document-2',
    };
  }
  return {
    actorId: command.actorId, organizationId: command.organizationId, workspaceId: command.workspaceId,
    requestId: command.requestId, authorizationVersion: command.authorizationVersion,
    expectedVersion: command.expectedAggregateVersion, idempotencyKey: command.idempotencyKey,
    commandType: command.commandType,
    templateId: create ? command.requestId : payload.templateId,
    payload: translated,
  };
};

const handoffRpcCommand = (command: StudioArtifactAtomicCommand) => {
  const payload = command.payload;
  const request = command.commandType === 'studio.handoff.request';
  const bundle = request && payload.targetInputBundle && typeof payload.targetInputBundle === 'object' && !Array.isArray(payload.targetInputBundle)
    ? payload.targetInputBundle as JsonObject : null;
  const translatedPayload = request ? {
    upstreamHandoffId: payload.upstreamHandoffId,
    artifactType: payload.artifactType,
    ...(bundle ? {
      targetInputBundleId: bundle.id,
      targetInputBundleVersionId: bundle.versionId,
      targetInputBundleVersion: bundle.version,
    } : {}),
  } : command.commandType === 'studio.handoff.withdraw'
    ? { reason: payload.rationale }
    : payload;
  return {
    actorId: command.actorId, organizationId: command.organizationId, workspaceId: command.workspaceId,
    requestId: command.requestId, authorizationVersion: command.authorizationVersion,
    expectedVersion: command.expectedAggregateVersion, idempotencyKey: command.idempotencyKey,
    commandType: command.commandType.replace(/^studio\./, ''),
    handoffId: request ? command.requestId : payload.handoffId,
    payload: translatedPayload,
  };
};

const sha256Hex = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const derivedUuid = async (namespace: string, identity: string) => {
  const hex = await sha256Hex(`${namespace}\u0000${identity}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const sourcePackageRpcCommand = async (command: StudioArtifactAtomicCommand) => {
  const payload = command.payload;
  const stableIdentity = `${command.organizationId}\u0000${command.actorId}\u0000${command.idempotencyKey}`;
  const bundle = payload.studioInputBundle && typeof payload.studioInputBundle === 'object' && !Array.isArray(payload.studioInputBundle)
    ? payload.studioInputBundle as JsonObject : null;
  const translated = payload.sourceMode === 'manual_brief' ? {
    sourceMode: payload.sourceMode, artifactType: payload.artifactType,
    // Raw authored material crosses only this service-role RPC. SQL hashes it
    // and stores it in the forced-private material relation transactionally.
    manualBrief: string(payload.manualBrief),
  } : {
    sourceMode: payload.sourceMode, artifactType: payload.artifactType,
    studioInputBundleId: bundle?.id, studioInputBundleVersionId: bundle?.versionId,
    studioInputBundleVersion: bundle?.version,
  };
  return {
    actorId: command.actorId, organizationId: command.organizationId, workspaceId: command.workspaceId,
    artifactId: await derivedUuid('studio-artifact', stableIdentity),
    sourcePackageId: await derivedUuid('studio-source-package', stableIdentity),
    requestId: command.requestId, idempotencyKey: command.idempotencyKey,
    authorizationVersion: command.authorizationVersion, payload: translated,
  };
};

const generationRequestRpcCommand = (command: StudioArtifactAtomicCommand) => {
  const payload = command.payload;
  const template = object(payload.template);
  return {
    actorId: command.actorId,
    organizationId: command.organizationId,
    workspaceId: command.workspaceId,
    requestId: command.requestId,
    idempotencyKey: command.idempotencyKey,
    authorizationVersion: command.authorizationVersion,
    artifactId: payload.artifactId,
    sourcePackageId: payload.sourcePackageId,
    templateKind: template.kind,
    templateVersionId: template.versionId,
    expectedAggregateVersion: command.expectedAggregateVersion,
    expectedCurrentVersionId: payload.expectedCurrentVersionId,
    expectedApprovedVersionId: payload.expectedApprovedVersionId,
  };
};

export const executeStudioAtomicCommand = async (
  command: StudioArtifactAtomicCommand,
  invoke: Rpc = rpc,
): Promise<StudioAtomicCommandResult> => {
  let name: string; let args: JsonObject;
  if (command.commandType.startsWith('studio.template.')) {
    name = STUDIO_RPC.templateCommand; args = { p_command: templateRpcCommand(command) };
  } else if (command.commandType.startsWith('studio.handoff.')) {
    name = STUDIO_RPC.handoffCommand; args = { p_command: handoffRpcCommand(command) };
  } else if (command.commandType === 'studio.source-package.create') {
    name = STUDIO_RPC.sourcePackageCommand; args = { p_command: await sourcePackageRpcCommand(command) };
  } else if (command.commandType === 'studio.generation.request') {
    name = STUDIO_RPC.generationRequest; args = { p_command: generationRequestRpcCommand(command) };
  } else {
    name = STUDIO_RPC.artifactCommand; args = { p_command: command };
  }
  return normalizeCommandResult(command, await invoke<unknown>(name, args));
};

type Postgrest = <T>(path: string, init?: RequestInit) => Promise<T>;
type GenerationPackageRow = {
  id: string; artifact_id: string; org_id: string; workspace_id: string; version: number;
  source_mode: 'assess_handoff' | 'direct_transcript_bundle' | 'assess_plus_transcript_bundle' | 'manual_brief';
  assess_handoff_id: string | null; studio_input_bundle_version_id: string | null;
  manual_brief_hash: string | null; package_hash: string;
  candidate_manifest: unknown; candidate_manifest_hash: string; candidate_count: number;
  anchor_manifest: unknown; anchor_manifest_hash: string; anchor_count: number;
};

const queryOne = async <T>(query: string, read: Postgrest): Promise<T> => {
  const rows = await read<T[]>(query, { method: 'GET' });
  if (rows.length !== 1) throw new StudioArtifactError('RESOURCE_STALE');
  return rows[0];
};

const projectionUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectionHash = /^[0-9a-f]{64}$/;
const templateProjectionActions = new Set([
  'studio.template.revise', 'studio.template.review.submit', 'studio.template.review.resolve',
  'studio.template.approval.resolve', 'studio.template.deprecate', 'studio.template.replace',
  'studio.generation.request',
]);
const exactProjectionKeys = (value: JsonObject, keys: readonly string[]) => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
};
const projectionText = (value: unknown, maximum: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  return value;
};
const projectionVersion = (ownership: 'system' | 'tenant', value: unknown) => ownership === 'system'
  ? projectionText(value, 80)
  : integer(value, 1);
const projectionSections = (value: unknown): StudioTemplateSectionDefinition[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  const ids = new Set<string>();
  return value.map(raw => {
    const section = object(raw); exactProjectionKeys(section, ['id', 'title', 'required', 'fieldKind']);
    const id = projectionText(section.id, 80);
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id) || ids.has(id) || typeof section.required !== 'boolean'
      || !['narrative', 'requirements', 'rules', 'controls', 'risks', 'interfaces', 'acceptance_criteria'].includes(String(section.fieldKind))) {
      throw new StudioArtifactError('COMMAND_UNAVAILABLE');
    }
    ids.add(id);
    return { id, title: projectionText(section.title, 160), required: section.required, fieldKind: section.fieldKind } as StudioTemplateSectionDefinition;
  });
};

/** Strict decoder for the authenticated safe projection; provider instructions never enter this DTO. */
export const decodeStudioTemplateProjection = (value: unknown): StudioTemplateProjectionRootDto => {
  const root = object(value); exactProjectionKeys(root, ['organizationId', 'workspaceId', 'templates']);
  const organizationId = projectionText(root.organizationId, 36); const workspaceId = projectionText(root.workspaceId, 36);
  if (!projectionUuid.test(organizationId) || !projectionUuid.test(workspaceId) || !Array.isArray(root.templates) || root.templates.length > 200) {
    throw new StudioArtifactError('COMMAND_UNAVAILABLE');
  }
  const templates = root.templates.map(raw => {
    const template = object(raw);
    exactProjectionKeys(template, [
      'ownership', 'templateId', 'templateVersionId', 'version', 'name', 'description', 'artifactClass', 'lifecycle',
      'templateHash', 'rendererVersion', 'contentSchemaVersion', 'sections', 'replacement', 'actions',
    ]);
    if (template.ownership !== 'system' && template.ownership !== 'tenant') throw new StudioArtifactError('COMMAND_UNAVAILABLE');
    const ownership = template.ownership;
    const templateId = projectionText(template.templateId, 36); const templateVersionId = projectionText(template.templateVersionId, 36);
    if (!projectionUuid.test(templateId) || !projectionUuid.test(templateVersionId)
      || !STUDIO_TEMPLATE_ARTIFACT_CLASSES.includes(template.artifactClass as never)
      || !STUDIO_TEMPLATE_LIFECYCLES.includes(template.lifecycle as never)
      || typeof template.templateHash !== 'string' || !projectionHash.test(template.templateHash)
      || !Array.isArray(template.actions) || template.actions.length > 10
      || template.actions.some(action => typeof action !== 'string' || !templateProjectionActions.has(action))
      || new Set(template.actions).size !== template.actions.length) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
    let replacement: StudioTemplateProjectionDto['replacement'] = null;
    if (template.replacement !== null) {
      const item = object(template.replacement); exactProjectionKeys(item, ['templateId', 'templateVersionId', 'version']);
      const replacementTemplateId = projectionText(item.templateId, 36); const replacementTemplateVersionId = projectionText(item.templateVersionId, 36);
      if (!projectionUuid.test(replacementTemplateId) || !projectionUuid.test(replacementTemplateVersionId)) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
      replacement = { templateId: replacementTemplateId, templateVersionId: replacementTemplateVersionId, version: projectionVersion(ownership, item.version) };
    }
    return {
      ownership, templateId, templateVersionId, version: projectionVersion(ownership, template.version),
      name: projectionText(template.name, 160),
      description: typeof template.description === 'string' && template.description.length <= 2_000 ? template.description : (() => { throw new StudioArtifactError('COMMAND_UNAVAILABLE'); })(),
      artifactClass: template.artifactClass, lifecycle: template.lifecycle, templateHash: template.templateHash,
      rendererVersion: projectionText(template.rendererVersion, 80), contentSchemaVersion: projectionText(template.contentSchemaVersion, 80),
      sections: projectionSections(template.sections), replacement, actions: template.actions,
    } as StudioTemplateProjectionDto;
  });
  return { organizationId, workspaceId, templates };
};

/**
 * Reloads only exact, server-bound generation material after the fenced claim.
 * Uploaded-but-unselected sources are unreachable from these joins.
 */
export async function loadStudioGenerationMaterial(
  plan: JsonObject,
  read: Postgrest = postgrest,
  invoke: Rpc = rpc,
): Promise<{
  sourcePackage: JsonObject; selectedSourceVersionIds: string[]; sourceAnchors: StudioCanonicalSourceAnchorDto[]; manualBrief: string | null;
  templatePayload: JsonObject; providerPlan: StudioGenerationClaim['providerPlan'];
}> {
  const org = string(field(plan, 'organizationId', 'organization_id'));
  const workspace = string(field(plan, 'workspaceId', 'workspace_id'));
  const actor = string(field(plan, 'actorId', 'actor_id'));
  const artifactId = string(field(plan, 'artifactId', 'artifact_id'));
  const sourcePackageId = string(field(plan, 'sourcePackageId', 'source_package_id'));
  const sourcePackageHash = string(field(plan, 'sourcePackageHash', 'source_package_hash'));
  const requestedPackageVersion = integer(field(plan, 'sourcePackageVersion', 'source_package_version'), 1);
  const encode = encodeURIComponent;
  const packageRow = await queryOne<GenerationPackageRow>(
    `studio_artifact_source_packages?select=id,artifact_id,org_id,workspace_id,version,source_mode,assess_handoff_id,studio_input_bundle_version_id,manual_brief_hash,package_hash,candidate_manifest,candidate_manifest_hash,candidate_count,anchor_manifest,anchor_manifest_hash,anchor_count&id=eq.${encode(sourcePackageId)}&artifact_id=eq.${encode(artifactId)}&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&limit=1`, read,
  );
  if (packageRow.package_hash !== sourcePackageHash || packageRow.version !== requestedPackageVersion) throw new StudioArtifactError('RESOURCE_STALE');

  let assessPackage: JsonObject | null = null;
  const selectedSourceVersionIds: string[] = [];
  const acceptedFacts: JsonObject[] = [];
  const expectedAnchors: StudioCanonicalSourceAnchorDto[] = [];
  if (packageRow.assess_handoff_id) {
    const handoff = await queryOne<{ id: string; source_version_id: string; package: JsonObject; package_hash: string }>(
      `assess_v2_studio_handoffs?select=id,source_version_id,package,package_hash&id=eq.${encode(packageRow.assess_handoff_id)}&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&limit=1`, read,
    );
    assessPackage = object(handoff.package);
    selectedSourceVersionIds.push(handoff.source_version_id);
    if (!projectionUuid.test(handoff.source_version_id) || !projectionHash.test(handoff.package_hash)) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    expectedAnchors.push({ sourceVersionId: handoff.source_version_id, locator: 'assess:accepted-handoff', anchorHash: handoff.package_hash });
  }
  if (packageRow.studio_input_bundle_version_id) {
    const bundleItems = await read<Array<{ source_set_version_id: string; ordinal: number }>>(
      `enterprise_module_input_bundle_items?select=source_set_version_id,ordinal&input_bundle_version_id=eq.${encode(packageRow.studio_input_bundle_version_id)}&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&order=ordinal.asc&limit=20`, { method: 'GET' },
    );
    if (!bundleItems.length || bundleItems.length > 20) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    const setIds = bundleItems.map(item => item.source_set_version_id);
    const sourceItems = await read<Array<{ source_version_id: string; ordinal: number; source_set_version_id: string; semantic_role: string }>>(
      `enterprise_source_set_version_items?select=source_version_id,ordinal,source_set_version_id,semantic_role&source_set_version_id=in.(${setIds.map(encode).join(',')})&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&order=source_set_version_id.asc,ordinal.asc&limit=400`, { method: 'GET' },
    );
    for (const item of sourceItems) if (!selectedSourceVersionIds.includes(item.source_version_id)) selectedSourceVersionIds.push(item.source_version_id);
    if (!selectedSourceVersionIds.length || selectedSourceVersionIds.length > 20) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    const sourceOnlyIds = [...new Set(sourceItems.map(item => item.source_version_id))];
    if (!Array.isArray(packageRow.candidate_manifest) || packageRow.candidate_manifest.length !== packageRow.candidate_count
      || packageRow.candidate_count < sourceOnlyIds.length || packageRow.candidate_count > 2000
      || !projectionHash.test(packageRow.candidate_manifest_hash)
      || packageRow.candidate_manifest_hash !== String(field(plan, 'candidateManifestHash', 'candidate_manifest_hash'))) {
      throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    }
    const manifest = packageRow.candidate_manifest.map(raw => {
      const item = object(raw); exactProjectionKeys(item, [
        'candidateId', 'candidateVersion', 'candidateProvenanceHash', 'anchorHash', 'sourceId',
        'sourceVersionId', 'extractionJobId', 'fieldKey', 'locator',
      ]);
      if (!projectionUuid.test(String(item.candidateId)) || !projectionUuid.test(String(item.sourceId))
        || !projectionUuid.test(String(item.sourceVersionId)) || !projectionUuid.test(String(item.extractionJobId))
        || !Number.isSafeInteger(item.candidateVersion) || Number(item.candidateVersion) < 1
        || !projectionHash.test(String(item.candidateProvenanceHash)) || !projectionHash.test(String(item.anchorHash))
        || !sourceOnlyIds.includes(String(item.sourceVersionId))) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
      return item;
    });
    const candidateIds = manifest.map(item => String(item.candidateId));
    if (new Set(candidateIds).size !== candidateIds.length) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    const candidates = await read<Array<{
      id: string; source_id: string; source_version_id: string; ai_job_id: string; version: number;
      provenance_hash: string; field_key: string; value: string; source_locator: string;
      excerpt_hash: string; suggestion_status: string; reviewed_by: string | null; reviewed_at: string | null;
    }>>(
      `enterprise_evidence_candidates?select=id,source_id,source_version_id,ai_job_id,version,provenance_hash,field_key,value,source_locator,excerpt_hash,suggestion_status,reviewed_by,reviewed_at&id=in.(${candidateIds.map(encode).join(',')})&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&order=source_version_id.asc,field_key.asc,id.asc&limit=2000`, { method: 'GET' },
    );
    if (candidates.length !== manifest.length) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    for (const binding of manifest) {
      const candidate = candidates.find(item => item.id === binding.candidateId);
      if (!candidate || candidate.suggestion_status !== 'accepted' || !candidate.reviewed_by || !candidate.reviewed_at
        || candidate.source_id !== binding.sourceId || candidate.source_version_id !== binding.sourceVersionId
        || candidate.ai_job_id !== binding.extractionJobId || candidate.version !== binding.candidateVersion
        || candidate.provenance_hash !== binding.candidateProvenanceHash || candidate.excerpt_hash !== binding.anchorHash
        || candidate.field_key !== binding.fieldKey || candidate.source_locator !== binding.locator) {
        throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
      }
    }
    for (const sourceVersionId of sourceOnlyIds) {
      if (!candidates.some(candidate => candidate.source_version_id === sourceVersionId)) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    }
    for (const candidate of candidates) acceptedFacts.push({
      sourceVersionId: candidate.source_version_id, field: candidate.field_key,
      value: candidate.value, locator: candidate.source_locator, anchorHash: candidate.excerpt_hash,
    });
    for (const candidate of candidates) expectedAnchors.push({
      sourceVersionId: candidate.source_version_id, locator: candidate.source_locator, anchorHash: candidate.excerpt_hash,
    });
  }
  const anchorKey = (anchor: StudioCanonicalSourceAnchorDto) => `${anchor.sourceVersionId}\u0000${anchor.locator}\u0000${anchor.anchorHash}`;
  const sourceAnchors = [...new Map(expectedAnchors.map(anchor => [anchorKey(anchor), anchor])).values()]
    .sort((left, right) => anchorKey(left).localeCompare(anchorKey(right), 'en'));
  if (!Array.isArray(packageRow.anchor_manifest) || packageRow.anchor_manifest.length !== packageRow.anchor_count
    || packageRow.anchor_count > 2001 || !projectionHash.test(packageRow.anchor_manifest_hash)
    || packageRow.anchor_manifest_hash !== String(field(plan, 'anchorManifestHash', 'anchor_manifest_hash'))
    || packageRow.anchor_count !== Number(field(plan, 'anchorCount', 'anchor_count'))) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
  const persistedAnchors = packageRow.anchor_manifest.map(raw => {
    const anchor = object(raw); exactProjectionKeys(anchor, ['sourceVersionId', 'locator', 'anchorHash']);
    const sourceVersionId = projectionText(anchor.sourceVersionId, 36);
    const locator = projectionText(anchor.locator, 500);
    const anchorHash = projectionText(anchor.anchorHash, 64);
    if (!projectionUuid.test(sourceVersionId) || !projectionHash.test(anchorHash)) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
    return { sourceVersionId, locator, anchorHash };
  });
  const expectedAnchorKeys = new Set(sourceAnchors.map(anchorKey));
  if (persistedAnchors.length !== sourceAnchors.length
    || new Set(persistedAnchors.map(anchorKey)).size !== persistedAnchors.length
    || persistedAnchors.some(anchor => !expectedAnchorKeys.has(anchorKey(anchor)))) {
    throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');
  }
  selectedSourceVersionIds.splice(0,selectedSourceVersionIds.length,...[...new Set(sourceAnchors.map(anchor => anchor.sourceVersionId))].sort());
  let manualBrief: string | null = null;
  if (packageRow.source_mode === 'manual_brief') {
    // This runs only after claim_v2 has reauthorized and fenced the attempt.
    // The RPC is service-role-only and returns no material for other modes.
    const rawMaterial = await invoke<unknown>(STUDIO_RPC.manualBriefMaterial, {
      p_org: org, p_workspace: workspace, p_source_package: sourcePackageId,
    });
    if (!rawMaterial || typeof rawMaterial !== 'object' || Array.isArray(rawMaterial)) throw new StudioArtifactError('RESOURCE_STALE');
    const material = rawMaterial as JsonObject;
    exactProjectionKeys(material, ['sourcePackageId', 'manualBrief', 'manualBriefHash']);
    const materialSourcePackageId = projectionText(material.sourcePackageId, 36);
    const materialHash = typeof material.manualBriefHash === 'string' ? material.manualBriefHash : '';
    manualBrief = projectionText(material.manualBrief, 20_000);
    if (materialSourcePackageId !== sourcePackageId || !projectionUuid.test(materialSourcePackageId)
      || !projectionHash.test(materialHash) || materialHash !== packageRow.manual_brief_hash
      || await sha256Hex(manualBrief) !== materialHash) throw new StudioArtifactError('RESOURCE_STALE');
  }
  const sourcePackage: JsonObject = {
    contractVersion: 'studio-source-package-2', sourceMode: packageRow.source_mode,
    assessPackage, acceptedFacts, selectedSourceVersionIds, sourceAnchors,
  };
  if (new TextEncoder().encode(JSON.stringify(sourcePackage)).length > 110_000) throw new StudioArtifactError('SOURCE_COVERAGE_INCOMPLETE');

  const templateKind = string(field(plan, 'templateKind', 'template_kind'));
  const templateVersionId = string(field(plan, 'templateVersionId', 'template_version_id'));
  const templateHash = string(field(plan, 'templateHash', 'template_hash'));
  let templatePayload: JsonObject;
  if (templateKind === 'system') {
    const row = await queryOne<{ id: string; template_version: string; provider_instructions: JsonObject; template_hash: string }>(
      `studio_system_template_versions?select=id,template_version,provider_instructions,template_hash&id=eq.${encode(templateVersionId)}&superseded_at=is.null&limit=1`, read,
    );
    if (row.template_hash !== templateHash || row.template_version !== String(field(plan, 'templateVersion', 'template_version'))) throw new StudioArtifactError('TEMPLATE_NOT_APPROVED');
    templatePayload = object(row.provider_instructions);
  } else if (templateKind === 'tenant') {
    const row = await queryOne<{ id: string; version: number; section_definitions: unknown; field_schema: unknown; template_hash: string; status: string }>(
      `studio_tenant_template_versions?select=id,version,section_definitions,field_schema,template_hash,status&id=eq.${encode(templateVersionId)}&org_id=eq.${encode(org)}&workspace_id=eq.${encode(workspace)}&status=eq.approved&limit=1`, read,
    );
    if (row.template_hash !== templateHash || String(row.version) !== String(field(plan, 'templateVersion', 'template_version'))) throw new StudioArtifactError('TEMPLATE_NOT_APPROVED');
    templatePayload = { sectionDefinitions: row.section_definitions, fieldSchema: row.field_schema };
  } else throw new StudioArtifactError('TEMPLATE_NOT_APPROVED');

  const provider = string(field(plan, 'provider'));
  if (!ENTERPRISE_AI_PROVIDERS.includes(provider as never)) throw new StudioArtifactError('PROVIDER_ROUTE_UNAVAILABLE');
  const routeId = string(field(plan, 'providerRouteId', 'provider_route_id'));
  const providerConfigId = string(field(plan, 'providerConfigId', 'provider_config_id'));
  const model = string(field(plan, 'model'));
  const config = await queryOne<{ id: string; provider: string; key_ref_id: string; endpoint_url?: string | null; deployment_name?: string | null; model_allowlist: string[]; status: string }>(
    `ai_provider_configs?select=id,provider,key_ref_id,endpoint_url,deployment_name,model_allowlist,status&id=eq.${encode(providerConfigId)}&org_id=eq.${encode(org)}&status=eq.active&deleted_at=is.null&limit=1`, read,
  );
  if (config.provider !== provider || !config.model_allowlist.includes(model) || !config.key_ref_id) throw new StudioArtifactError('PROVIDER_ROUTE_UNAVAILABLE');
  const resolverDecision = {
    status: 'allowed', futureSecretLookupEligible: true, provider, routeId, providerConfigId,
    keyRefId: config.key_ref_id, keyRefResolverType: 'server_reference', operation: 'studio.document.generate',
    capability: 'studio.document.generate', mode: 'pilot', orgId: org, workspaceId: workspace, actorId: actor,
    correlationId: string(field(plan, 'requestId', 'request_id')), evidenceRef: '', policyResult: 'allowed', model,
    endpoint: config.endpoint_url || undefined, deployment: config.deployment_name || undefined, auditEvent: {},
  } as StudioGenerationClaim['providerPlan']['resolverDecision'];
  return {
    sourcePackage, selectedSourceVersionIds, sourceAnchors, manualBrief, templatePayload,
    providerPlan: {
      provider: provider as StudioGenerationClaim['providerPlan']['provider'], routeId, providerConfigId, model,
      ...(config.endpoint_url ? { endpoint: config.endpoint_url } : {}),
      ...(config.deployment_name ? { deployment: config.deployment_name } : {}), resolverDecision,
    },
  };
}

export const claimStudioGeneration = async (
  initial: JsonObject,
  invoke: Rpc = rpc,
  loadMaterial: (plan: JsonObject) => Promise<{
    sourcePackage: JsonObject; selectedSourceVersionIds: string[]; sourceAnchors: StudioCanonicalSourceAnchorDto[]; manualBrief: string | null;
    templatePayload: JsonObject; providerPlan: StudioGenerationClaim['providerPlan'];
  }> = loadStudioGenerationMaterial,
): Promise<StudioGenerationClaim> => {
  const attemptId = string(field(initial, 'attemptId', 'attempt_id'));
  const executionToken = typeof field(initial, 'executionToken', 'execution_token') === 'string'
    ? string(field(initial, 'executionToken', 'execution_token')) : crypto.randomUUID();
  const value = object(await invoke<unknown>(STUDIO_RPC.generationClaim, {
    p_attempt_id: attemptId, p_execution_token: executionToken, p_lease_seconds: 45,
  }));
  const plan = { ...initial, ...value };
  const claimed = {
    attemptId: durableUuid(field(plan, 'attemptId', 'attempt_id')),
    executionToken: durableUuid(field(value, 'executionToken', 'execution_token')),
    executionFence: integer(field(value, 'executionFence', 'execution_fence'), 1),
  };
  let material: Awaited<ReturnType<typeof loadMaterial>>;
  try { material = await loadMaterial(plan); }
  catch { throw new StudioGenerationMaterialLoadError(claimed); }
  const templateVersion = string(field(plan, 'templateVersion', 'template_version'));
  const expectedTemplateVersion = field(initial, 'expectedTemplateVersion', 'expected_template_version');
  if (expectedTemplateVersion !== undefined && String(expectedTemplateVersion) !== templateVersion) throw new StudioArtifactError('TEMPLATE_NOT_APPROVED');
  return {
    attemptId: claimed.attemptId, artifactId: string(field(plan, 'artifactId', 'artifact_id')),
    receiptId: string(field(plan, 'receiptId', 'receipt_id')), organizationId: string(field(plan, 'organizationId', 'organization_id')),
    workspaceId: string(field(plan, 'workspaceId', 'workspace_id')), actorId: string(field(plan, 'actorId', 'actor_id')),
    authorizationVersion: integer(field(plan, 'authorizationVersion', 'authorization_version'), 1), requestId: string(field(plan, 'requestId', 'request_id')),
    executionToken: claimed.executionToken, executionFence: claimed.executionFence,
    leaseExpiresAt: string(field(value, 'leaseExpiresAt', 'lease_expires_at')),
    sourcePackageId: string(field(plan, 'sourcePackageId', 'source_package_id')),
    sourcePackageVersion: integer(field(initial, 'sourcePackageVersion', 'source_package_version'), 1),
    sourcePackage: material.sourcePackage, sourcePackageHash: string(field(plan, 'sourcePackageHash', 'source_package_hash')),
    selectedSourceVersionIds: material.selectedSourceVersionIds,
    sourceAnchors: material.sourceAnchors,
    sourcePackageHead: integer(field(initial, 'sourcePackageVersion', 'source_package_version'), 1),
    templateId: string(field(plan, 'templateVersionId', 'template_version_id')),
    templateVersionId: string(field(plan, 'templateVersionId', 'template_version_id')),
    templateVersion, templatePayload: material.templatePayload,
    templateHash: string(field(plan, 'templateHash', 'template_hash')),
    templateHead: Number.isSafeInteger(Number(templateVersion)) && Number(templateVersion) > 0 ? Number(templateVersion) : 1,
    expectedArtifactHead: integer(field(plan, 'expectedAggregateVersion', 'expected_aggregate_version')),
    manualBrief: material.manualBrief,
    providerPlan: material.providerPlan,
    maximumOutputTokens: integer(field(plan, 'maximumOutputTokens', 'maximum_output_tokens'), 1),
    timeoutMs: 30_000,
    providerAllowed: field(value, 'providerAllowed', 'provider_allowed') === true,
    reconcileOnly: field(value, 'reconcileOnly', 'reconcile_only') === true,
  };
};

export const stageStudioGeneration = (input: {
  attemptId: string; executionToken: string; executionFence: number; providerOperationId?: string; response: JsonObject;
}, invoke: Rpc = rpc) => invoke<unknown>(STUDIO_RPC.generationStage, {
  p_attempt_id: input.attemptId, p_execution_token: input.executionToken, p_execution_fence: input.executionFence,
  p_provider_operation_id: input.providerOperationId ?? null, p_response: input.response,
});

export const finalizeStudioGeneration = async (input: {
  attemptId: string; executionToken: string; executionFence: number;
}, invoke: Rpc = rpc): Promise<{ state: 'completed' | 'stale'; resource: JsonObject }> => {
  const value = object(await invoke<unknown>(STUDIO_RPC.generationFinalize, {
    p_attempt_id: input.attemptId, p_execution_token: input.executionToken, p_execution_fence: input.executionFence,
  }));
  exactProjectionKeys(value, ['outcome', 'attemptId', 'state', 'artifactId', 'versionId', 'stale']);
  const outcome = field(value, 'outcome'); const state = field(value, 'state');
  const attemptId = durableUuid(field(value, 'attemptId'));
  const artifactId = durableUuid(field(value, 'artifactId'));
  const versionId = durableUuid(field(value, 'versionId'));
  const stale = field(value, 'stale');
  if ((outcome !== 'committed' && outcome !== 'replayed') || (state !== 'completed' && state !== 'stale_completed')
    || attemptId !== input.attemptId || typeof stale !== 'boolean' || stale !== (state === 'stale_completed')) {
    throw new StudioArtifactError('RECEIPT_FINALIZATION_FAILED');
  }
  const resource: JsonObject = { outcome, attemptId, state, artifactId, versionId, stale };
  return { state: state === 'stale_completed' ? 'stale' : 'completed', resource };
};

export const cancelStudioGeneration = (input: {
  attemptId: string; actorId: string; reason: string;
}, invoke: Rpc = rpc) => invoke<unknown>(STUDIO_RPC.generationCancel, {
  p_attempt_id: input.attemptId, p_actor: input.actorId, p_reason: input.reason,
});

/** Service-scheduler-only timeout; no caller supplies a duration or deadline. */
export const timeoutStudioGeneration = (attemptId: string, invoke: Rpc = rpc) =>
  invoke<unknown>(STUDIO_RPC.generationTimeout, { p_attempt_id: attemptId });

type StudioTerminalGenerationFailureCode = Exclude<StudioGenerationFailureCode, 'GENERATION_UNCERTAIN'>;
export const failStudioGeneration = (input: {
  attemptId: string; executionToken: string; executionFence: number; failureCode: StudioTerminalGenerationFailureCode;
}, invoke: Rpc = rpc) => invoke<unknown>(STUDIO_RPC.generationFail, {
  p_attempt_id: input.attemptId, p_execution_token: input.executionToken,
  p_fence: input.executionFence, p_failure_code: input.failureCode,
}).then(raw => {
  const value = object(raw);
  exactProjectionKeys(value, ['outcome', 'attemptId', 'state', 'failureCode', 'executionFence']);
  const outcome = field(value, 'outcome');
  const attemptId = durableUuid(field(value, 'attemptId'));
  const executionFence = integer(field(value, 'executionFence'), 1);
  if ((outcome !== 'committed' && outcome !== 'replayed') || attemptId !== input.attemptId
    || field(value, 'state') !== 'failed' || field(value, 'failureCode') !== input.failureCode
    || executionFence !== input.executionFence) throw new StudioArtifactError('COMMAND_UNAVAILABLE');
});

type ClaimedGenerationResult = Awaited<ReturnType<typeof executeClaimedStudioGeneration>>;
type FencedGenerationFailure = Readonly<{
  attemptId: string; executionToken: string; executionFence: number; failureCode: StudioTerminalGenerationFailureCode;
}>;
class StudioGenerationMaterialLoadError extends Error {
  constructor(readonly claim: Omit<FencedGenerationFailure, 'failureCode'>) { super('studio generation material unavailable'); }
}

/**
 * Claiming also loads the exact source/template material. Both occur before the
 * provider boundary, so a failure can be made terminal when the attempt id is
 * durable and the failure RPC succeeds. If that write cannot be proven, retain
 * an uncertain result for reconciliation instead of throwing past the receipt.
 */
export const executeStudioGenerationDependency = async (
  initial: JsonObject,
  dependencies: {
    claim?: (plan: JsonObject) => Promise<StudioGenerationClaim>;
    execute?: (claim: StudioGenerationClaim) => Promise<ClaimedGenerationResult>;
    fail?: (input: FencedGenerationFailure) => Promise<void>;
  } = {},
): Promise<ClaimedGenerationResult> => {
  let claim: StudioGenerationClaim;
  try {
    claim = await (dependencies.claim ?? claimStudioGeneration)(initial);
  } catch (error) {
    // A claim RPC failure yields no trusted token/fence and must never invoke an
    // unfenced terminal write. Lease/timeout reconciliation owns that state.
    if (!(error instanceof StudioGenerationMaterialLoadError)) {
      return { state: 'uncertain', failureCode: 'GENERATION_UNCERTAIN' };
    }
    try {
      await (dependencies.fail ?? failStudioGeneration)({
        ...error.claim, failureCode: 'GENERATION_START_CONFLICT',
      });
      return { state: 'failed', failureCode: 'GENERATION_START_CONFLICT' };
    } catch {
      return { state: 'uncertain', failureCode: 'GENERATION_UNCERTAIN' };
    }
  }
  return (dependencies.execute ?? (value => executeClaimedStudioGeneration(value, {
    runProvider: input => callStudioArtifactProvider(input),
    stage: input => stageStudioGeneration(input).then(() => undefined),
    finalize: input => finalizeStudioGeneration(input),
    fail: (id, code) => code === 'GENERATION_UNCERTAIN'
      ? Promise.reject(new StudioArtifactError('GENERATION_FAILED'))
      : failStudioGeneration({
        attemptId: id, executionToken: value.executionToken, executionFence: value.executionFence, failureCode: code,
      }),
  })))(claim);
};

export const studioArtifactDependencies: StudioArtifactCommandDependencies = {
  authenticate: request => getAuthUser(request),
  // Service role is transport only; this private RPC reauthorizes the human.
  loadFreshAuthority: async ({ actorId, organizationId, workspaceId }) => {
    const rows = await rpc<StudioArtifactAuthority[]>(STUDIO_RPC.authority, {
      p_actor_id: actorId, p_organization_id: organizationId, p_workspace_id: workspaceId,
    });
    return rows[0] ?? null;
  },
  executeAtomicCommand: command => executeStudioAtomicCommand(command),
  executeClaimedGeneration: initial => executeStudioGenerationDependency(initial),
};
