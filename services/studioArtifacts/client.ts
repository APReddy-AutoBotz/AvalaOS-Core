import type { TenantContextProjection } from '../../types';
import { supabase } from '../supabaseClient';
import { STUDIO_ARTIFACT_LIFECYCLES, STUDIO_ARTIFACT_TYPES, type StudioArtifactProjectionDto, type StudioArtifactType, type StudioCommandEnvelope, type StudioCommandType } from './contracts';

export class StudioArtifactBoundaryError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'VERSION_CONFLICT' | 'AUTHORIZATION_REVOKED' | 'READ_ONLY' | 'OFFLINE') { super(code); }
}

export interface StudioHandoffOption { id: string; caseId: string; label: string; sourcePackageHash: string }
export interface StudioCommandCommit { receiptId: string; resourceId: string; outcome: 'committed' | 'replayed' }
export interface StudioArtifactTransport {
  readHandoffs(context: TenantContextProjection): Promise<unknown>;
  readProjection(context: TenantContextProjection, handoffId: string, artifactType: StudioArtifactType): Promise<unknown>;
  invoke(envelope: StudioCommandEnvelope<Record<string, unknown>>): Promise<unknown>;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

const ancestryKeys = ['organizationId','workspaceId','caseId','sourceCaseVersionId','sourceCaseVersion','decisionId','decisionVersion','reviewResolutionId','governResolutionId','studioHandoffId','sourcePackageHash','sourceSchemaVersion','ruleSetVersion','reviewSchemaVersion','reviewSequence'] as const;
const decodeAncestry = (value: unknown) => {
  if (!object(value) || !exact(value, ancestryKeys) || !uuid(value.organizationId) || !uuid(value.workspaceId) || !uuid(value.caseId) || !uuid(value.sourceCaseVersionId) || !positive(value.sourceCaseVersion) || !uuid(value.decisionId) || !positive(value.decisionVersion) || !uuid(value.reviewResolutionId) || !uuid(value.governResolutionId) || !uuid(value.studioHandoffId) || !hash(value.sourcePackageHash) || !text(value.sourceSchemaVersion) || !text(value.ruleSetVersion) || !text(value.reviewSchemaVersion) || !positive(value.reviewSequence)) throw new StudioArtifactBoundaryError('UNAVAILABLE');
  return value as unknown as StudioArtifactProjectionDto['ancestry'];
};
const versionKeys = ['id','version','parentVersionId','lifecycle','templateVersion','contentSchemaVersion','projectionVersion','content','contentHash','authorId','createdAt'] as const;
const decodeVersion = (value: unknown) => {
  if (!object(value) || !exact(value, versionKeys) || !uuid(value.id) || !positive(value.version) || !(value.parentVersionId === null || uuid(value.parentVersionId)) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !text(value.templateVersion) || !text(value.contentSchemaVersion) || !text(value.projectionVersion) || !object(value.content) || !hash(value.contentHash) || !uuid(value.authorId) || !date(value.createdAt)) throw new StudioArtifactBoundaryError('UNAVAILABLE');
  return value as unknown as StudioArtifactProjectionDto['currentVersion'];
};

export const decodeStudioArtifactProjection = (value: unknown, context: TenantContextProjection): StudioArtifactProjectionDto => {
  const keys = ['id','artifactType','aggregateVersion','lifecycle','ancestry','currentVersion','currentApprovedVersion','versions','readOnly'] as const;
  if (!object(value) || !exact(value, keys) || !uuid(value.id) || !STUDIO_ARTIFACT_TYPES.includes(value.artifactType as never) || !positive(value.aggregateVersion) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !Array.isArray(value.versions) || typeof value.readOnly !== 'boolean') throw new StudioArtifactBoundaryError('UNAVAILABLE');
  const ancestry = decodeAncestry(value.ancestry); const currentVersion = decodeVersion(value.currentVersion);
  const currentApprovedVersion = value.currentApprovedVersion === null ? null : decodeVersion(value.currentApprovedVersion);
  const versions = value.versions.map(decodeVersion);
  if (ancestry.organizationId !== context.organizationId || ancestry.workspaceId !== context.workspaceId || currentVersion.lifecycle !== value.lifecycle || !versions.some(item => item.id === currentVersion.id) || (currentApprovedVersion && (currentApprovedVersion.lifecycle !== 'approved' || !versions.some(item => item.id === currentApprovedVersion.id))) || new Set(versions.map(item => item.version)).size !== versions.length) throw new StudioArtifactBoundaryError('UNAVAILABLE');
  return { id: value.id as string, artifactType: value.artifactType as StudioArtifactType, aggregateVersion: value.aggregateVersion as number, lifecycle: value.lifecycle as StudioArtifactProjectionDto['lifecycle'], ancestry, currentVersion, currentApprovedVersion, versions, readOnly: value.readOnly as boolean };
};

export const decodeStudioHandoffs = (value: unknown): StudioHandoffOption[] => {
  if (!Array.isArray(value)) throw new StudioArtifactBoundaryError('UNAVAILABLE');
  return value.map(item => { const keys=['id','caseId','label','sourcePackageHash']; if (!object(item) || !exact(item,keys) || !uuid(item.id) || !uuid(item.caseId) || !text(item.label) || !hash(item.sourcePackageHash)) throw new StudioArtifactBoundaryError('UNAVAILABLE'); return item as unknown as StudioHandoffOption; });
};

const defaultTransport: StudioArtifactTransport = {
  async readHandoffs(context) { const {data,error}=await supabase.rpc('studio_artifact_handoffs',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId}); if(error) throw new StudioArtifactBoundaryError('UNAVAILABLE'); return data; },
  async readProjection(context,handoffId,artifactType) { const {data,error}=await supabase.rpc('studio_artifact_projection',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId,p_handoff_id:handoffId,p_artifact_type:artifactType}); if(error) throw new StudioArtifactBoundaryError('UNAVAILABLE'); return data; },
  async invoke(envelope) { const {data,error}=await supabase.functions.invoke('studio-artifact-command',{body:envelope}); if(error) throw new StudioArtifactBoundaryError('UNAVAILABLE'); return data; },
};
export const readStudioHandoffs = async (context: TenantContextProjection, transport=defaultTransport) => decodeStudioHandoffs(await transport.readHandoffs(context));
export const readStudioArtifact = async (context: TenantContextProjection,handoffId:string,type:StudioArtifactType,transport=defaultTransport) => decodeStudioArtifactProjection(await transport.readProjection(context,handoffId,type),context);
export const executeStudioArtifactCommand = async (context:TenantContextProjection, commandType:StudioCommandType, projection:StudioArtifactProjectionDto|null, payload:Record<string,unknown>, idempotencyKey:string, transport=defaultTransport):Promise<StudioCommandCommit> => {
  const envelope:StudioCommandEnvelope<Record<string,unknown>>={requestId:crypto.randomUUID(),idempotencyKey,commandType,organizationId:context.organizationId,workspaceId:context.workspaceId,authorizationVersion:context.authorizationVersion,expectedAggregateVersion:projection?.aggregateVersion??0,expectedArtifactVersion:projection?.currentVersion.version??null,payload};
  const value=await transport.invoke(envelope); const keys=['ok','outcome','receiptId','resourceId'];
  if(!object(value)||!exact(value,keys)||value.ok!==true||(value.outcome!=='committed'&&value.outcome!=='replayed')||!uuid(value.receiptId)||!uuid(value.resourceId)) throw new StudioArtifactBoundaryError('UNAVAILABLE');
  return {outcome:value.outcome,receiptId:value.receiptId,resourceId:value.resourceId};
};
