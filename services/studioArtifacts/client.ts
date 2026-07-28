import type { TenantContextProjection } from '../../types';
import { supabase } from '../supabaseClient';
import {
  STUDIO_ARTIFACT_LIFECYCLES,
  STUDIO_ARTIFACT_TYPES,
  type StudioArtifactApprovalDto,
  type StudioArtifactProjectionDto,
  type StudioArtifactReviewDto,
  type StudioArtifactType,
  type StudioCommandEnvelope,
  type StudioCommandResponse,
  type StudioCommandType,
} from './contracts';

export const STUDIO_SAFE_ERROR_CODES = [
  'RESOURCE_NOT_AVAILABLE', 'AUTHORITY_STALE', 'PERMISSION_DENIED', 'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT', 'SEPARATION_OF_DUTY', 'FEATURE_DISABLED', 'READ_ONLY',
  'INVALID_COMMAND', 'GENERATION_FAILED', 'COMMAND_UNAVAILABLE',
] as const;
export type StudioSafeErrorCode = (typeof STUDIO_SAFE_ERROR_CODES)[number];

export class StudioArtifactBoundaryError extends Error {
  constructor(public readonly code: StudioSafeErrorCode) { super(code); this.name = 'StudioArtifactBoundaryError'; }
}

export interface StudioHandoffOption { id: string; caseId: string; label: string; sourcePackageHash: string }
export interface StudioEligibleReviewer { actorId: string; displayName: string }
export interface StudioArtifactTransport {
  readHandoffs(context: TenantContextProjection): Promise<unknown>;
  readProjection(context: TenantContextProjection, handoffId: string, artifactType: StudioArtifactType): Promise<unknown>;
  readEligibleReviewers(context: TenantContextProjection, artifactId: string, artifactVersionId: string): Promise<unknown>;
  invoke(envelope: StudioCommandEnvelope<Record<string, unknown>>): Promise<unknown>;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const unavailable = (): never => { throw new StudioArtifactBoundaryError('RESOURCE_NOT_AVAILABLE'); };

const ancestryKeys = ['organizationId','workspaceId','caseId','sourceCaseVersionId','sourceCaseVersion','decisionId','decisionVersion','reviewResolutionId','governResolutionId','studioHandoffId','sourcePackageHash','sourceSchemaVersion','ruleSetVersion','reviewSchemaVersion','reviewSequence'] as const;
const decodeAncestry = (value: unknown) => {
  if (!object(value) || !exact(value, ancestryKeys) || !uuid(value.organizationId) || !uuid(value.workspaceId) || !uuid(value.caseId) || !uuid(value.sourceCaseVersionId) || !positive(value.sourceCaseVersion) || !uuid(value.decisionId) || !text(value.decisionVersion) || !uuid(value.reviewResolutionId) || !uuid(value.governResolutionId) || !uuid(value.studioHandoffId) || !hash(value.sourcePackageHash) || !text(value.sourceSchemaVersion) || !text(value.ruleSetVersion) || !text(value.reviewSchemaVersion) || !positive(value.reviewSequence)) unavailable();
  return value as unknown as StudioArtifactProjectionDto['ancestry'];
};
const versionKeys = ['id','version','parentVersionId','lifecycle','templateVersion','contentSchemaVersion','projectionVersion','content','contentHash','authorId','createdAt'] as const;
const decodeVersion = (value: unknown) => {
  if (!object(value) || !exact(value, versionKeys) || !uuid(value.id) || !positive(value.version) || !(value.parentVersionId === null || uuid(value.parentVersionId)) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !text(value.templateVersion) || !text(value.contentSchemaVersion) || !text(value.projectionVersion) || !object(value.content) || !hash(value.contentHash) || !uuid(value.authorId) || !date(value.createdAt)) unavailable();
  return value as unknown as StudioArtifactProjectionDto['currentVersion'];
};
const conditions = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length <= 20 && value.every(item => text(item) && item.length <= 500);
const decodeReview = (value: unknown): StudioArtifactReviewDto | null => {
  if (value === null) return null;
  const keys=['assignmentId','reviewerId','outcome','rationale','conditions'] as const;
  if (!object(value)||!exact(value,keys)||!uuid(value.assignmentId)||!uuid(value.reviewerId)||!(value.outcome===null||['approved','changes_requested','rejected'].includes(value.outcome as string))||!(value.rationale===null||text(value.rationale))||!conditions(value.conditions)) unavailable();
  return value as unknown as StudioArtifactReviewDto;
};
const decodeApproval = (value: unknown): StudioArtifactApprovalDto | null => {
  if (value === null) return null;
  const keys=['approverId','outcome','rationale','conditions','supersededVersionId'] as const;
  if (!object(value)||!exact(value,keys)||!uuid(value.approverId)||!['approved','rejected'].includes(value.outcome as string)||!text(value.rationale)||!conditions(value.conditions)||!(value.supersededVersionId===null||uuid(value.supersededVersionId))) unavailable();
  return value as unknown as StudioArtifactApprovalDto;
};

export const decodeStudioArtifactProjection = (value: unknown, context: Pick<TenantContextProjection,'organizationId'|'workspaceId'>): StudioArtifactProjectionDto => {
  const keys = ['id','artifactType','aggregateVersion','lifecycle','ancestry','currentVersion','currentApprovedVersion','versions','review','approval','readOnly'] as const;
  if (!object(value) || !exact(value, keys) || !uuid(value.id) || !STUDIO_ARTIFACT_TYPES.includes(value.artifactType as never) || !positive(value.aggregateVersion) || !STUDIO_ARTIFACT_LIFECYCLES.includes(value.lifecycle as never) || !Array.isArray(value.versions) || typeof value.readOnly !== 'boolean') unavailable();
  const record=value as Record<string,unknown>;
  const ancestry=decodeAncestry(record.ancestry), currentVersion=decodeVersion(record.currentVersion), currentApprovedVersion=record.currentApprovedVersion===null?null:decodeVersion(record.currentApprovedVersion), versions=(record.versions as unknown[]).map(decodeVersion), review=decodeReview(record.review), approval=decodeApproval(record.approval);
  const ordered=versions.every((item,index)=>index===0||versions[index-1].version<item.version);
  if (ancestry.organizationId!==context.organizationId||ancestry.workspaceId!==context.workspaceId||currentVersion.lifecycle!==record.lifecycle||versions.at(-1)?.id!==currentVersion.id||!ordered||(currentApprovedVersion&&(currentApprovedVersion.lifecycle!=='approved'||!versions.some(item=>item.id===currentApprovedVersion.id)))) unavailable();
  return {id:record.id as string,artifactType:record.artifactType as StudioArtifactType,aggregateVersion:record.aggregateVersion as number,lifecycle:record.lifecycle as StudioArtifactProjectionDto['lifecycle'],ancestry,currentVersion,currentApprovedVersion,versions,review,approval,readOnly:record.readOnly as boolean};
};

export const decodeStudioHandoffs = (value: unknown): StudioHandoffOption[] => {
  if (!Array.isArray(value)) unavailable();
  return (value as unknown[]).map(item=>{const keys=['id','caseId','label','sourcePackageHash'];if(!object(item)||!exact(item,keys)||!uuid(item.id)||!uuid(item.caseId)||!text(item.label)||!hash(item.sourcePackageHash)) unavailable();return item as unknown as StudioHandoffOption;});
};
export const decodeStudioEligibleReviewers = (value: unknown): StudioEligibleReviewer[] => {
  if(!Array.isArray(value)) unavailable();
  return (value as unknown[]).map(item=>{if(!object(item)||!exact(item,['actorId','displayName'])||!uuid(item.actorId)||!text(item.displayName)) unavailable();return item as unknown as StudioEligibleReviewer;});
};

export const decodeStudioSafeError = (value: unknown): StudioArtifactBoundaryError => {
  const candidates:unknown[]=[value];
  if(object(value)){candidates.push(value.code,value.errorCode,value.details);if(object(value.error))candidates.push(value.error.code,value.error.errorCode);}
  const code=candidates.find(candidate=>typeof candidate==='string'&&STUDIO_SAFE_ERROR_CODES.includes(candidate as StudioSafeErrorCode));
  return new StudioArtifactBoundaryError((code as StudioSafeErrorCode|undefined)??'COMMAND_UNAVAILABLE');
};
const decodeInvocationError=async(error:unknown):Promise<StudioArtifactBoundaryError>=>{
  if(object(error)&&object(error.context)&&typeof error.context.json==='function'){
    try{return decodeStudioSafeError(await (error.context.json as ()=>Promise<unknown>)());}catch{return new StudioArtifactBoundaryError('COMMAND_UNAVAILABLE');}
  }
  return decodeStudioSafeError(error);
};

export const decodeStudioCommandResponse = (value:unknown):StudioCommandResponse => {
  const keys=['ok','outcome','receiptId','resourceId','resource'] as const;
  if(!object(value)||!exact(value,keys)||value.ok!==true||!['committed','replayed','generation_completed','generation_failed'].includes(value.outcome as string)||!uuid(value.receiptId)||!uuid(value.resourceId)||!object(value.resource)) unavailable();
  return value as unknown as StudioCommandResponse;
};

export const studioArtifactDefaultTransport:StudioArtifactTransport={
  async readHandoffs(context){const {data,error}=await supabase.rpc('studio_artifact_handoffs',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId});if(error)throw decodeStudioSafeError(error);return data;},
  async readProjection(context,handoffId,artifactType){const {data,error}=await supabase.rpc('studio_artifact_projection',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId,p_handoff_id:handoffId,p_artifact_type:artifactType});if(error)throw decodeStudioSafeError(error);return data;},
  async readEligibleReviewers(context,artifactId,artifactVersionId){const {data,error}=await supabase.rpc('studio_artifact_eligible_reviewers',{p_org_id:context.organizationId,p_workspace_id:context.workspaceId,p_artifact_id:artifactId,p_artifact_version_id:artifactVersionId});if(error)throw decodeStudioSafeError(error);return data;},
  async invoke(envelope){const {data,error}=await supabase.functions.invoke('studio-artifact-command',{body:envelope});if(error)throw await decodeInvocationError(error);return data;},
};
export const readStudioHandoffs=async(context:TenantContextProjection,transport=studioArtifactDefaultTransport)=>decodeStudioHandoffs(await transport.readHandoffs(context));
export const readStudioArtifact=async(context:TenantContextProjection,handoffId:string,type:StudioArtifactType,transport=studioArtifactDefaultTransport)=>decodeStudioArtifactProjection(await transport.readProjection(context,handoffId,type),context);
export const readStudioEligibleReviewers=async(context:TenantContextProjection,artifactId:string,versionId:string,transport=studioArtifactDefaultTransport)=>decodeStudioEligibleReviewers(await transport.readEligibleReviewers(context,artifactId,versionId));
export const executeStudioArtifactCommand=async(context:TenantContextProjection,commandType:StudioCommandType,projection:StudioArtifactProjectionDto|null,payload:Record<string,unknown>,idempotencyKey:string,transport=studioArtifactDefaultTransport):Promise<StudioCommandResponse>=>{
  const envelope:StudioCommandEnvelope<Record<string,unknown>>={requestId:crypto.randomUUID(),idempotencyKey,commandType,organizationId:context.organizationId,workspaceId:context.workspaceId,authorizationVersion:context.authorizationVersion,expectedAggregateVersion:projection?.aggregateVersion??0,expectedArtifactVersion:commandType==='studio.artifact.generation.request'?null:projection?.currentVersion.version??null,payload};
  try{return decodeStudioCommandResponse(await transport.invoke(envelope));}catch(error){if(error instanceof StudioArtifactBoundaryError)throw error;throw decodeStudioSafeError(error);}
};
