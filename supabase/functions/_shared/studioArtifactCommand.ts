import type { StudioArtifactType, StudioCommandEnvelope, StudioCommandType } from '../../../services/studioArtifacts/contracts.ts';

export type JsonObject = Record<string, unknown>;
export type StudioArtifactAuthority = Readonly<{ actorId: string; authorizationVersion: number; capabilities: readonly string[] }>;
export type StudioArtifactAtomicCommand = StudioCommandEnvelope<JsonObject> & { actorId: string };

export type StudioArtifactErrorCode = 'METHOD_NOT_ALLOWED'|'AUTHENTICATION_REQUIRED'|'INVALID_COMMAND'|'COMMAND_NOT_SUPPORTED'|'RESOURCE_NOT_AVAILABLE'|'AUTHORITY_STALE'|'PERMISSION_DENIED'|'VERSION_CONFLICT'|'IDEMPOTENCY_CONFLICT'|'FEATURE_DISABLED'|'READ_ONLY'|'COMMAND_UNAVAILABLE';
const statuses: Record<StudioArtifactErrorCode, number> = { METHOD_NOT_ALLOWED:405, AUTHENTICATION_REQUIRED:401, INVALID_COMMAND:400, COMMAND_NOT_SUPPORTED:400, RESOURCE_NOT_AVAILABLE:404, AUTHORITY_STALE:409, PERMISSION_DENIED:403, VERSION_CONFLICT:409, IDEMPOTENCY_CONFLICT:409, FEATURE_DISABLED:503, READ_ONLY:503, COMMAND_UNAVAILABLE:503 };
export class StudioArtifactError extends Error { constructor(public readonly code: StudioArtifactErrorCode) { super(code); } get status(){ return statuses[this.code]; } }
const bad=():never=>{throw new StudioArtifactError('INVALID_COMMAND')};
const object=(v:unknown):JsonObject=>typeof v==='object'&&v!==null&&!Array.isArray(v)?v as JsonObject:bad();
const exact=(v:JsonObject, keys:readonly string[])=>{if(Object.keys(v).length!==keys.length||keys.some(k=>!(k in v))||Object.keys(v).some(k=>!keys.includes(k)))bad()};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=(v:unknown)=>typeof v==='string'&&UUID.test(v)?v:bad();
const integer=(v:unknown, nullable=false)=>nullable&&v===null?null:typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:bad();
const text=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max?v:bad();
const artifactType=(v:unknown):StudioArtifactType=>v==='brd'||v==='frd'||v==='pdd'?v:bad();
const safeJson=(v:unknown,depth=0):unknown=>{if(depth>12)bad();if(v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=20_000||typeof v==='number'&&Number.isFinite(v))return v;if(Array.isArray(v)&&v.length<=200)return v.map(x=>safeJson(x,depth+1));const o=object(v);if(Object.keys(o).length>200)bad();return Object.fromEntries(Object.entries(o).map(([k,x])=>[text(k,120),safeJson(x,depth+1)]));};

const commands: readonly StudioCommandType[]=['studio.artifact.generation.request','studio.artifact.draft.revise','studio.artifact.review.submit','studio.artifact.review.assign','studio.artifact.review.resolve','studio.artifact.approval.resolve'];
export const requiredStudioCapability=(command:StudioCommandType)=>({
  'studio.artifact.generation.request':'studio.artifacts.generate','studio.artifact.draft.revise':'studio.artifacts.edit','studio.artifact.review.submit':'studio.artifacts.edit','studio.artifact.review.assign':'studio.artifacts.review','studio.artifact.review.resolve':'studio.artifacts.review','studio.artifact.approval.resolve':'studio.artifacts.approve',
} as const)[command];

const parsePayload=(command:StudioCommandType, raw:unknown):JsonObject=>{const p=object(raw);
 if(command==='studio.artifact.generation.request'){exact(p,['studioHandoffId','artifactType']);return{studioHandoffId:uuid(p.studioHandoffId),artifactType:artifactType(p.artifactType)};}
 if(command==='studio.artifact.draft.revise'){exact(p,['artifactId','parentVersionId','content']);const content=safeJson(p.content);if(typeof content!=='object'||content===null||Array.isArray(content)||JSON.stringify(content).length>500_000)bad();return{artifactId:uuid(p.artifactId),parentVersionId:uuid(p.parentVersionId),content};}
 if(command==='studio.artifact.review.submit'){exact(p,['artifactId','artifactVersionId']);return{artifactId:uuid(p.artifactId),artifactVersionId:uuid(p.artifactVersionId)};}
 if(command==='studio.artifact.review.assign'){exact(p,['artifactId','artifactVersionId','reviewerId']);return{artifactId:uuid(p.artifactId),artifactVersionId:uuid(p.artifactVersionId),reviewerId:uuid(p.reviewerId)};}
 if(command==='studio.artifact.review.resolve'){exact(p,['artifactId','artifactVersionId','outcome','rationale','conditions']);if(p.outcome!=='approve'&&p.outcome!=='changes_requested'&&p.outcome!=='reject')bad();return{artifactId:uuid(p.artifactId),artifactVersionId:uuid(p.artifactVersionId),outcome:p.outcome,rationale:text(p.rationale,4000),conditions:p.conditions===null?null:text(p.conditions,4000)};}
 exact(p,['artifactId','artifactVersionId','outcome','rationale','conditions']);if(p.outcome!=='approve'&&p.outcome!=='reject')bad();return{artifactId:uuid(p.artifactId),artifactVersionId:uuid(p.artifactVersionId),outcome:p.outcome,rationale:text(p.rationale,4000),conditions:p.conditions===null?null:text(p.conditions,4000)};
};

export const parseStudioArtifactEnvelope=(value:unknown):StudioCommandEnvelope<JsonObject>=>{const e=object(value);exact(e,['requestId','idempotencyKey','commandType','organizationId','workspaceId','authorizationVersion','expectedAggregateVersion','expectedArtifactVersion','payload']);if(typeof e.commandType!=='string'||!commands.includes(e.commandType as StudioCommandType))throw new StudioArtifactError(typeof e.commandType==='string'?'COMMAND_NOT_SUPPORTED':'INVALID_COMMAND');const key=text(e.idempotencyKey,128);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key))bad();return{requestId:uuid(e.requestId),idempotencyKey:key,commandType:e.commandType as StudioCommandType,organizationId:uuid(e.organizationId),workspaceId:uuid(e.workspaceId),authorizationVersion:integer(e.authorizationVersion) as number,expectedAggregateVersion:integer(e.expectedAggregateVersion) as number,expectedArtifactVersion:integer(e.expectedArtifactVersion,true),payload:parsePayload(e.commandType as StudioCommandType,e.payload)};};
export const studioArtifactErrorBody=(e:StudioArtifactError)=>({ok:false,error:{code:e.code,message:'The command could not be completed.'}});
export const asStudioArtifactError=(e:unknown)=>e instanceof StudioArtifactError?e:new StudioArtifactError('COMMAND_UNAVAILABLE');
