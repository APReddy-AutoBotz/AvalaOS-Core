import { TRUST_OPERATIONS, type TrustCommandRequest, type TrustCommandResponse } from '../../../services/trustAssurance/contracts.ts';
import { sha256Hex } from '../../../services/trustAssurance/domain.ts';
import type { TenantContext } from './tenantAuthority.ts';

export const TRUST_OPERATION_CAPABILITY: Record<TrustCommandRequest['operation'], string> = {
  'claim.create':'trust.manage','claim.revise':'trust.manage','evidence.register':'trust.manage','evidence.supersede':'trust.manage','evidence.withdraw':'trust.manage','evidence.link':'trust.manage',
  'resource.review':'trust.review','snapshot.create':'trust.manage','snapshot.review':'trust.review','snapshot.publish':'trust.publish','snapshot.withdraw':'trust.publish',
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed=['requestId','idempotencyKey','operation','organizationId','workspaceId','expectedAuthorizationVersion','expectedVersion','payload'];
export const decodeTrustCommandRequest=(value:unknown):TrustCommandRequest=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('VALIDATION_FAILED');const row=value as Record<string,unknown>;
  if(Object.keys(row).some(key=>!allowed.includes(key))||Object.keys(row).length<7||typeof row.requestId!=='string'||!uuid.test(row.requestId)||typeof row.idempotencyKey!=='string'||row.idempotencyKey.length<1||row.idempotencyKey.length>200||
    typeof row.operation!=='string'||!TRUST_OPERATIONS.includes(row.operation as TrustCommandRequest['operation'])||typeof row.organizationId!=='string'||!uuid.test(row.organizationId)||!(row.workspaceId===null||(typeof row.workspaceId==='string'&&uuid.test(row.workspaceId)))||
    !Number.isSafeInteger(row.expectedAuthorizationVersion)||(row.expectedAuthorizationVersion as number)<1||(row.expectedVersion!==undefined&&(!Number.isSafeInteger(row.expectedVersion)||(row.expectedVersion as number)<1))||!row.payload||typeof row.payload!=='object'||Array.isArray(row.payload))throw new Error('VALIDATION_FAILED');
  return row as unknown as TrustCommandRequest;
};
export const canonicalTrustRequestHash=(request:TrustCommandRequest)=>sha256Hex({operation:request.operation,organizationId:request.organizationId,workspaceId:request.workspaceId,expectedVersion:request.expectedVersion??null,payload:request.payload});
export type TrustCommandDependencies={resolveAuthority:(request:TrustCommandRequest)=>Promise<TenantContext>;execute:(input:TrustCommandRequest&{actorId:string;requestHash:string})=>Promise<TrustCommandResponse>;featureEnabled:boolean;readOnly:boolean};
export const executeTrustCommand=async(value:unknown,deps:TrustCommandDependencies):Promise<TrustCommandResponse>=>{
  if(!deps.featureEnabled||deps.readOnly)return{ok:false,code:'FEATURE_DISABLED',message:'Trust Assurance mutations are disabled.'};
  let request:TrustCommandRequest;try{request=decodeTrustCommandRequest(value)}catch{return{ok:false,code:'VALIDATION_FAILED',message:'Request is invalid.'}}
  let authority:TenantContext;try{authority=await deps.resolveAuthority(request)}catch(error){return{ok:false,code:error instanceof Error&&error.message==='AUTHORIZATION_STALE'?'AUTHORIZATION_STALE':'ACCESS_DENIED',message:'The requested resource is unavailable.'}}
  if(authority.organizationId!==request.organizationId||(request.workspaceId!==null&&authority.workspaceId!==request.workspaceId)||!authority.capabilities.includes(TRUST_OPERATION_CAPABILITY[request.operation]))return{ok:false,code:'ACCESS_DENIED',message:'The requested resource is unavailable.'};
  return deps.execute({...request,actorId:authority.userId,requestHash:await canonicalTrustRequestHash(request)});
};
