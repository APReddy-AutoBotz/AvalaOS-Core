import type { AssessV2Authority } from './assessV2Command.ts';

export const ASSESS_V2_REVIEW_COMMANDS = [
  'assessment_v2.review.assign', 'assessment_v2.evidence.attest',
  'assessment_v2.review.resolve', 'assessment_v2.revision.start',
  'assessment_v2.govern.resolve', 'assessment_v2.studio.handoff',
] as const;
export type AssessV2ReviewCommandType = typeof ASSESS_V2_REVIEW_COMMANDS[number];
export const ASSESS_V2_REVIEW_CAPABILITY: Record<AssessV2ReviewCommandType, string> = {
  'assessment_v2.review.assign': 'assess.v2.review',
  'assessment_v2.evidence.attest': 'assess.v2.evidence.attest',
  'assessment_v2.review.resolve': 'assess.v2.approve',
  'assessment_v2.revision.start': 'assess.v2.draft.write',
  'assessment_v2.govern.resolve': 'assess.v2.govern.resolve',
  'assessment_v2.studio.handoff': 'assess.v2.studio.handoff',
};

export type ReviewPayload = Record<string, unknown> & { caseId: string; decisionId: string };
export interface AssessV2ReviewEnvelope { requestId:string; idempotencyKey:string; commandType:AssessV2ReviewCommandType; organizationId:string; workspaceId:string; authorizationVersion:number; expectedVersion:number; payload:ReviewPayload }
export interface AssessV2ReviewAtomicCommand extends AssessV2ReviewEnvelope { actorId:string }
export interface AssessV2ReviewDependencies {
  authenticate(request:Request):Promise<{id:string}>;
  loadFreshAuthority(input:{request:Request;actorId:string;organizationId:string;workspaceId:string}):Promise<AssessV2Authority|null>;
  executeAtomicReviewCommand(command:AssessV2ReviewAtomicCommand):Promise<{outcome:'committed'|'replayed';resource:Record<string,unknown>}>;
}
export type AssessV2ReviewErrorCode = 'INVALID_COMMAND'|'COMMAND_NOT_SUPPORTED'|'AUTHENTICATION_REQUIRED'|'RESOURCE_NOT_AVAILABLE'|'AUTHORITY_STALE'|'PERMISSION_DENIED'|'VERSION_CONFLICT'|'IDEMPOTENCY_CONFLICT'|'FEATURE_DISABLED'|'READ_ONLY'|'COMMAND_UNAVAILABLE';
export class AssessV2ReviewError extends Error { constructor(public code:AssessV2ReviewErrorCode){super(code)} get status(){return this.code==='AUTHENTICATION_REQUIRED'?401:this.code==='PERMISSION_DENIED'?403:['VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','AUTHORITY_STALE'].includes(this.code)?409:this.code==='RESOURCE_NOT_AVAILABLE'?404:this.code==='COMMAND_UNAVAILABLE'?503:400} }

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, KEY=/^[A-Za-z0-9._:-]{8,128}$/;
const bad=():never=>{throw new AssessV2ReviewError('INVALID_COMMAND')};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:bad();
const exact=(o:Record<string,unknown>,keys:string[])=>{if(Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>o[k]===undefined))bad()};
const uuid=(v:unknown)=>typeof v==='string'&&UUID.test(v)?v:bad();
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max?v.trim():bad();
const array=(v:unknown,max:number)=>Array.isArray(v)&&v.length>0&&v.length<=max?v:bad();
const enumValue=<T extends string>(v:unknown,values:readonly T[])=>typeof v==='string'&&values.includes(v as T)?v as T:bad();
const baseKeys=['caseId','decisionId','reviewVersion'];
const parsePayload=(type:AssessV2ReviewCommandType,value:unknown):ReviewPayload=>{
  const p=object(value); let out:ReviewPayload;
  const common={caseId:uuid(p.caseId),decisionId:uuid(p.decisionId),reviewVersion:Number.isSafeInteger(p.reviewVersion)&&Number(p.reviewVersion)>0?Number(p.reviewVersion):bad()};
  if(type==='assessment_v2.review.assign') { exact(p,[...baseKeys,'reviewerId']); out={...common,reviewerId:uuid(p.reviewerId)}; }
  else if(type==='assessment_v2.evidence.attest') { exact(p,[...baseKeys,'evidenceId','claimIds','outcome','rationale']); out={...common,evidenceId:uuid(p.evidenceId),claimIds:array(p.claimIds,100).map(x=>text(x,300)),outcome:enumValue(p.outcome,['accepted','rejected','needs-more-information'] as const),rationale:text(p.rationale,4000)}; if(new Set(out.claimIds as string[]).size!==(out.claimIds as string[]).length)bad(); }
  else if(type==='assessment_v2.review.resolve') { exact(p,[...baseKeys,'resolution','rationale','conditions']); out={...common,resolution:enumValue(p.resolution,['approved','changes_requested','rejected'] as const),rationale:text(p.rationale,4000),conditions:Array.isArray(p.conditions)&&p.conditions.length<=100?p.conditions.map(x=>text(x,500)):bad()}; }
  else if(type==='assessment_v2.revision.start') { exact(p,[...baseKeys,'rationale']); out={...common,rationale:text(p.rationale,4000)}; }
  else if(type==='assessment_v2.govern.resolve') { exact(p,[...baseKeys,'rationale']); out={...common,rationale:text(p.rationale,4000)}; }
  else { exact(p,baseKeys); out=common; }
  if(JSON.stringify(out).length>200000)bad(); return out;
};
export const isAssessV2ReviewCommand=(value:unknown):value is AssessV2ReviewCommandType=>typeof value==='string'&&ASSESS_V2_REVIEW_COMMANDS.includes(value as AssessV2ReviewCommandType);
export const parseAssessV2ReviewEnvelope=(value:unknown):AssessV2ReviewEnvelope=>{const e=object(value);exact(e,['requestId','idempotencyKey','commandType','organizationId','workspaceId','authorizationVersion','expectedVersion','payload']);if(!isAssessV2ReviewCommand(e.commandType))throw new AssessV2ReviewError(typeof e.commandType==='string'?'COMMAND_NOT_SUPPORTED':'INVALID_COMMAND');return {requestId:uuid(e.requestId),idempotencyKey:typeof e.idempotencyKey==='string'&&KEY.test(e.idempotencyKey)?e.idempotencyKey:bad(),commandType:e.commandType,organizationId:uuid(e.organizationId),workspaceId:uuid(e.workspaceId),authorizationVersion:Number.isSafeInteger(e.authorizationVersion)&&Number(e.authorizationVersion)>0?Number(e.authorizationVersion):bad(),expectedVersion:Number.isSafeInteger(e.expectedVersion)&&Number(e.expectedVersion)>0?Number(e.expectedVersion):bad(),payload:parsePayload(e.commandType,e.payload)}};
