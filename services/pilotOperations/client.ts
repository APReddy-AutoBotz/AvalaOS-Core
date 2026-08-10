import { getRuntimeDataAccess, isSupabaseConfigured, supabase } from '../supabaseClient';
import { decodePilotOperationsProjection, type PilotOperationsProjection } from './operationsModel';
import type { PilotOperationsCommand, PilotOperationsErrorCode, PilotOperationsTransport } from './contracts';

const errorCodes = new Set<PilotOperationsErrorCode>([
  'ACCESS_DENIED','AUTHORIZATION_STALE','VALIDATION_FAILED','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT','FEATURE_DISABLED',
  'TENANT_DEPROVISIONED','ENVIRONMENT_BLOCKED','MAINTENANCE_ACTIVE','READ_ONLY_ACTIVE','EVIDENCE_STALE','EVIDENCE_INVALID',
  'MAINTENANCE_MODE','READ_ONLY_MODE','EXPECTED_VERSION_REQUIRED','EVIDENCE_NOT_VERIFIED','PREFLIGHT_BLOCKED','PROVIDER_REFERENCE_STALE','PROVIDER_REFERENCE_INVALID','PERSISTENCE_UNAVAILABLE','ROLLBACK_NOT_ELIGIBLE','SEPARATION_OF_DUTY_REQUIRED','LIVE_ACTIVATION_NOT_AUTHORIZED',
]);
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const errorPayload=async(result:{error:unknown;response?:unknown})=>{if(!result.error)return null;const response=(result.response??(record(result.error)?result.error.context:null)) as {clone?:()=>{json?:()=>Promise<unknown>};json?:()=>Promise<unknown>}|null;try{const source=response?.clone?.()??response;return await source?.json?.()}catch{return null}};
const codeFrom=(value:unknown):PilotOperationsErrorCode|null=>record(value)&&typeof value.code==='string'&&errorCodes.has(value.code as PilotOperationsErrorCode)?value.code as PilotOperationsErrorCode:null;
const configured=()=>{if(getRuntimeDataAccess()!=='server'||!isSupabaseConfigured())throw new Error('PERSISTENCE_UNAVAILABLE')};

export const defaultPilotOperationsTransport: PilotOperationsTransport = {
  async command(body){configured();const result=await supabase.functions.invoke('pilot-operations-command',{body});const value=result.error?await errorPayload(result):result.data;const code=codeFrom(value);if(code)throw new Error(code);if(result.error||!record(value))throw new Error('PERSISTENCE_UNAVAILABLE');return value},
  async query(body){configured();const result=await supabase.functions.invoke('pilot-operations-query',{body});const value=result.error?await errorPayload(result):result.data;const code=codeFrom(value);if(code)throw new Error(code);if(result.error)return Promise.reject(new Error('PERSISTENCE_UNAVAILABLE'));return value},
};

type RawProjection={truthClassification:unknown;liveActivationAuthorized:unknown;environment:unknown;release:unknown;promotedRelease:unknown;provider:unknown;health:unknown;recovery:unknown;blockers:unknown;liveStopGates:unknown;rollback:unknown};
export const decodeServerPilotOperationsProjection=(input:unknown):PilotOperationsProjection=>{
  if(!record(input))throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');const raw=input as unknown as RawProjection;
  if(raw.liveActivationAuthorized!==false||!record(raw.environment)||!record(raw.release)||!Array.isArray(raw.blockers)||!Array.isArray(raw.liveStopGates))throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  const environment=raw.environment, release=raw.release, promotedRelease=record(raw.promotedRelease)?raw.promotedRelease:null, provider=record(raw.provider)?raw.provider:null, health=record(raw.health)?raw.health:null, recovery=record(raw.recovery)?raw.recovery:null, rollback=record(raw.rollback)?raw.rollback:null;
  if(!rollback||!health||!recovery||!exact(rollback,['eligible','reason','targetCandidateId','targetVersion','targetLabel'])||!exact(input,['truthClassification','liveActivationAuthorized','environment','release','promotedRelease','provider','health','recovery','blockers','liveStopGates','rollback'])||!exact(environment,['id','type','lifecycle','version','maintenance','readOnly','disabledFeatures'])||!exact(release,['id','gitSha','lifecycle','version'])||(promotedRelease&&!exact(promotedRelease,['id','gitSha','lifecycle','version']))||(provider&&!exact(provider,['configured','enabled','status','purpose']))||!exact(health,['schemaCompatible','queueState','reconciliationState'])||!exact(recovery,['backupState','restoreState'])||!Array.isArray(environment.disabledFeatures))throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  return decodePilotOperationsProjection({
    authority:{environmentId:environment.id,releaseId:release.id,releaseVersion:release.version,...(rollback.eligible?{rollbackTargetCandidateId:rollback.targetCandidateId,rollbackTargetVersion:rollback.targetVersion}:{})},
    release:{candidateLabel:`Candidate ${String(release.id??'').slice(0,8)}`,commitSha:release.gitSha,lifecycle:release.lifecycle,...(promotedRelease&&promotedRelease.id!==release.id?{promotedHistoryLabel:`Promoted ${String(promotedRelease.id??'').slice(0,8)}`}:{})},
    environment:{label:`Pilot candidate ${String(environment.id??'').slice(0,8)}`,type:environment.type,lifecycle:environment.lifecycle,version:environment.version},
    controls:{maintenance:environment.maintenance,readOnly:environment.readOnly,disabledFeatures:environment.disabledFeatures},
    health:{schemaCompatible:health.schemaCompatible,queueState:health.queueState==='healthy'?'healthy':health.queueState==='degraded'?'degraded':'blocked',reconciliationState:health.reconciliationState==='healthy'?'healthy':health.reconciliationState==='degraded'?'degraded':'blocked'},
    provider:{configured:provider?.configured??false,enabled:provider?.enabled??false,status:provider?.status??'not_configured'},
    recovery:{backupState:recovery.backupState==='completed'?'passed':recovery.backupState,restoreState:recovery.restoreState==='completed'?'passed':recovery.restoreState},
    promotion:{eligible:raw.blockers.length===0,blockers:raw.blockers,liveStopGates:raw.liveStopGates,rollbackEligible:rollback.eligible,...(rollback.reason?{rollbackReason:rollback.reason}:{}),...(rollback.targetLabel?{rollbackTargetLabel:rollback.targetLabel}:{})},
    truth:raw.truthClassification,liveActivationAuthorized:false,
  });
};

export class PilotOperationsClient {
  constructor(private readonly transport: PilotOperationsTransport=defaultPilotOperationsTransport) {}
  command(input:PilotOperationsCommand):Promise<unknown>{return this.transport.command(input)}
  async projection(input:{organizationId:string;workspaceId:string;expectedAuthorizationVersion:number}):Promise<PilotOperationsProjection>{return decodeServerPilotOperationsProjection(await this.transport.query(input))}
}
