import type { TenantContextProjection } from '../../types';
import type { ControlledHumanBackendAttestation, ControlledHumanBrowserBinding } from '../runtimeMode';
import type { ControlledHumanCommandAnchor } from '../supabaseClient';
import type { StudioSourcePackageIdentity } from './client';
import type { StudioCommandResponse } from './contracts';

export const PR_C_CONTROLLED_HUMAN_SYNTHETIC_GENERATION_CONTRACT =
  'pr-c-controlled-human-synthetic-studio-generation-1' as const;

export type PrCControlledHumanSyntheticTemplate =
  | { kind: 'system'; versionId: string; version: string; hash: string }
  | { kind: 'tenant'; templateId: string; versionId: string; version: number; hash: string };

export type PrCControlledHumanSyntheticGenerationInput = Readonly<{
  sourcePackage: StudioSourcePackageIdentity;
  template: PrCControlledHumanSyntheticTemplate;
  /** Retained by the UI for an exact-operation retry after response loss. */
  requestId?: string;
}>;

export type PrCControlledHumanSyntheticGenerationResource = Readonly<{
  artifactId: string;
  versionId: string;
  version: number;
  sourcePackageId: string;
  sourcePackageVersion: number;
  sourcePackageHash: string;
  templateVersionId: string;
  templateVersion: string | number;
  templateHash: string;
  generationKind: 'synthetic_controlled_human';
  synthetic: true;
}>;

export type PrCControlledHumanSyntheticGenerationResponse = StudioCommandResponse & Readonly<{
  outcome: 'generation_completed';
  commandOutcome: 'committed' | 'replayed';
  resource: PrCControlledHumanSyntheticGenerationResource;
}>;

type InvocationResult = { data: unknown; error: unknown };
type BindingResolution =
  | { status: 'ready'; binding: ControlledHumanBrowserBinding }
  | { status: 'disabled' }
  | { status: 'blocked'; error: Error };
type Dependencies = Readonly<{
  enabled(): boolean;
  resolveBinding(): BindingResolution;
  attest(): Promise<ControlledHumanBackendAttestation | null>;
  invoke(body: Record<string, unknown>): Promise<InvocationResult>;
  requestId(): string;
  begin?(input: { action: string; targetFamily: string; targetId: string; expectedVersion: number; selectorBindings: Record<string, unknown> }): Promise<ControlledHumanCommandAnchor | null>;
  complete?(anchor: ControlledHumanCommandAnchor): Promise<unknown>;
}>;

export class PrCControlledHumanSyntheticGenerationBoundaryError extends Error {
  readonly code: 'COMMAND_UNAVAILABLE' | 'MALFORMED_RESULT';
  constructor(code: 'COMMAND_UNAVAILABLE' | 'MALFORMED_RESULT') {
    super(code);
    this.name = 'PrCControlledHumanSyntheticGenerationBoundaryError';
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key)) && keys.every(key => key in value);
};
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const hash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const validTemplate = (template: PrCControlledHumanSyntheticTemplate) => template.kind === 'system'
  ? uuid(template.versionId) && typeof template.version === 'string' && template.version.length > 0
    && template.version.length <= 80 && hash(template.hash)
  : template.kind === 'tenant' && uuid(template.templateId) && uuid(template.versionId)
    && positive(template.version) && hash(template.hash);
const canonicalJson = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
    : JSON.stringify(value);
const digestValue = async (value: unknown) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return `sha256:${Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const loadDefaultDependencies = async (): Promise<Dependencies> => {
  const runtime = await import('../supabaseClient');
  return {
    enabled: runtime.isControlledHumanRuntimeEnabled,
    resolveBinding: runtime.getControlledHumanBrowserBinding,
    attest: runtime.requireControlledHumanBackendAttestation,
    invoke: async body => runtime.supabase.functions.invoke('pr-c-controlled-human-synthetic-generation', { body }),
    requestId: () => crypto.randomUUID(),
    begin: runtime.beginControlledHumanCommand,
    complete: runtime.completeControlledHumanCommand,
  };
};

export const buildPrCControlledHumanSyntheticGenerationCommand = (
  context: TenantContextProjection,
  input: PrCControlledHumanSyntheticGenerationInput,
  idempotencyKey: string,
  requestId: string,
  binding: ControlledHumanBrowserBinding,
  attestation: ControlledHumanBackendAttestation,
) => {
  const source = input.sourcePackage;
  if (!uuid(context.userId) || !uuid(context.organizationId) || !uuid(context.workspaceId) || !Number.isSafeInteger(context.authorizationVersion)
    || context.authorizationVersion < 1 || !context.capabilities.includes('studio.artifacts.generate')
    || !uuid(requestId) || !KEY.test(idempotencyKey)
    || !uuid(source.artifactId) || !uuid(source.sourcePackageId) || !positive(source.sourcePackageVersion)
    || !positive(source.version) || source.version !== source.sourcePackageVersion || !positive(source.routePolicyVersion)
    || !hash(source.sourcePackageHash) || !Number.isSafeInteger(source.aggregateVersion) || source.aggregateVersion < 0
    || !validTemplate(input.template)
    || !(source.currentVersionId === null || uuid(source.currentVersionId))
    || !(source.currentApprovedVersionId === null || uuid(source.currentApprovedVersionId))
    || attestation.releaseSha !== binding.releaseSha || attestation.reviewHeadSha !== binding.reviewHeadSha
    || attestation.deployId !== binding.deployId || attestation.deployOrigin !== binding.deployOrigin
    || attestation.exerciseDigest !== binding.exerciseDigest || attestation.targetFingerprint !== binding.targetFingerprint
    || attestation.attested !== true || attestation.contractVersion !== 'pr-c-controlled-human-attestation-1'
    || attestation.environmentClass !== 'hosted_nonproduction_pilot' || attestation.prNumber !== 264
    || attestation.migrationTip !== '20260904120000' || !DIGEST.test(attestation.personaManifestDigest)
    || !DIGEST.test(attestation.fixtureManifestDigest)
    || attestation.productionAuthorized !== false || attestation.customerDataAuthorized !== false
    || attestation.realProviderCallsAuthorized !== false) {
    throw new PrCControlledHumanSyntheticGenerationBoundaryError('COMMAND_UNAVAILABLE');
  }
  return {
    contractVersion: PR_C_CONTROLLED_HUMAN_SYNTHETIC_GENERATION_CONTRACT,
    requestId,
    idempotencyKey,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    authorizationVersion: context.authorizationVersion,
    environmentClass: attestation.environmentClass,
    prNumber: attestation.prNumber,
    releaseSha: attestation.releaseSha,
    reviewHeadSha: attestation.reviewHeadSha,
    deployId: attestation.deployId,
    deployOrigin: attestation.deployOrigin,
    exerciseDigest: attestation.exerciseDigest,
    targetFingerprint: attestation.targetFingerprint,
    artifactId: source.artifactId,
    sourcePackageId: source.sourcePackageId,
    sourcePackageVersion: source.sourcePackageVersion,
    sourcePackageHash: source.sourcePackageHash,
    expectedAggregateVersion: source.aggregateVersion,
    expectedCurrentVersionId: source.currentVersionId,
    expectedApprovedVersionId: source.currentApprovedVersionId,
    template: input.template,
  } as const;
};

const decode = (
  value: unknown,
  source: StudioSourcePackageIdentity,
  template: PrCControlledHumanSyntheticTemplate,
): PrCControlledHumanSyntheticGenerationResponse => {
  if (!object(value) || !exact(value, ['ok', 'outcome', 'commandOutcome', 'receiptId', 'resourceId', 'resource'])
    || value.ok !== true || value.outcome !== 'generation_completed'
    || (value.commandOutcome !== 'committed' && value.commandOutcome !== 'replayed')
    || !uuid(value.receiptId) || value.resourceId !== source.artifactId || !object(value.resource)) {
    throw new PrCControlledHumanSyntheticGenerationBoundaryError('MALFORMED_RESULT');
  }
  const resource = value.resource;
  if (!exact(resource, ['artifactId', 'versionId', 'version', 'sourcePackageId', 'sourcePackageVersion', 'sourcePackageHash', 'templateVersionId', 'templateVersion', 'templateHash', 'generationKind', 'synthetic'])
    || resource.artifactId !== source.artifactId || !uuid(resource.versionId) || !positive(resource.version)
    || resource.sourcePackageId !== source.sourcePackageId || resource.sourcePackageVersion !== source.sourcePackageVersion
    || resource.sourcePackageHash !== source.sourcePackageHash || resource.templateVersionId !== template.versionId
    || resource.templateVersion !== template.version || resource.templateHash !== template.hash
    || resource.generationKind !== 'synthetic_controlled_human' || resource.synthetic !== true) {
    throw new PrCControlledHumanSyntheticGenerationBoundaryError('MALFORMED_RESULT');
  }
  return value as unknown as PrCControlledHumanSyntheticGenerationResponse;
};

export const executePrCControlledHumanSyntheticGeneration = async (
  context: TenantContextProjection,
  input: PrCControlledHumanSyntheticGenerationInput,
  idempotencyKey: string,
  providedDependencies?: Dependencies,
): Promise<PrCControlledHumanSyntheticGenerationResponse> => {
  const dependencies = providedDependencies ?? await loadDefaultDependencies();
  if (!dependencies.enabled()) throw new PrCControlledHumanSyntheticGenerationBoundaryError('COMMAND_UNAVAILABLE');
  const resolution = dependencies.resolveBinding();
  if (resolution.status !== 'ready') throw new PrCControlledHumanSyntheticGenerationBoundaryError('COMMAND_UNAVAILABLE');
  const attestation = await dependencies.attest();
  if (!attestation) throw new PrCControlledHumanSyntheticGenerationBoundaryError('COMMAND_UNAVAILABLE');
  const anchor = dependencies.begin ? await dependencies.begin({
    action: 'pr_c.controlled_human.synthetic_studio_generate',
    targetFamily: 'studio_artifact',
    targetId: input.sourcePackage.artifactId,
    expectedVersion: input.sourcePackage.aggregateVersion,
    selectorBindings: {
      artifactId: input.sourcePackage.artifactId, sourcePackageId: input.sourcePackage.sourcePackageId,
      sourcePackageVersion: input.sourcePackage.sourcePackageVersion, sourcePackageHash: input.sourcePackage.sourcePackageHash,
      templateKind: input.template.kind,
      ...(input.template.kind === 'tenant' ? { templateId: input.template.templateId } : {}),
      templateVersionId: input.template.versionId, templateVersionDigest: await digestValue(input.template.version),
      templateHash: input.template.hash, expectedCurrentVersionId: input.sourcePackage.currentVersionId,
      expectedApprovedVersionId: input.sourcePackage.currentApprovedVersionId,
    },
  }) : null;
  const command = buildPrCControlledHumanSyntheticGenerationCommand(
    context, input, anchor?.businessIdempotencyKey ?? idempotencyKey, anchor?.requestId ?? input.requestId ?? dependencies.requestId(), resolution.binding, attestation,
  );
  const { data, error } = await dependencies.invoke(command);
  if (error) throw new PrCControlledHumanSyntheticGenerationBoundaryError('COMMAND_UNAVAILABLE');
  const decoded = decode(data, input.sourcePackage, input.template);
  if (anchor && dependencies.complete) await dependencies.complete(anchor);
  return decoded;
};
