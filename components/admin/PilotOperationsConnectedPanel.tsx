import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EnterpriseSessionState, TenantContextProjection } from '../../types';
import { PilotOperationsClient } from '../../services/pilotOperations/client';
import type { PilotOperationsProjection } from '../../services/pilotOperations/operationsModel';
import type { PilotOperation, PilotOperationsCommand } from '../../supabase/functions/_shared/pilotOperationsContracts';
import PilotOperationsPanel, { type PilotOperationRequest } from './PilotOperationsPanel';

const resultKind=(code:string):'error'|'stale'|'revoked'|'blocked'=>code==='VERSION_CONFLICT'||code==='AUTHORIZATION_STALE'||code==='EVIDENCE_STALE'?'stale':code==='ACCESS_DENIED'||code==='TENANT_DEPROVISIONED'?'revoked':code==='FEATURE_DISABLED'||code==='ENVIRONMENT_BLOCKED'||code==='MAINTENANCE_ACTIVE'||code==='READ_ONLY_ACTIVE'||code==='MAINTENANCE_MODE'||code==='READ_ONLY_MODE'||code==='EVIDENCE_NOT_VERIFIED'||code==='PREFLIGHT_BLOCKED'||code==='LIVE_ACTIVATION_NOT_AUTHORIZED'?'blocked':'error';
const commandFor=(request:PilotOperationRequest,projection:PilotOperationsProjection):{operation:PilotOperation;payload:Record<string,unknown>}=>{
  const ids=projection.authority;
  if(!ids)throw new Error('OPERATIONS_PROJECTION_UNAVAILABLE');
  if(request.action==='validate')return{operation:'validate_release_candidate',payload:{candidateId:ids.releaseId,environmentId:ids.environmentId}};
  if(request.action==='approve')return{operation:'approve_promotion',payload:{candidateId:ids.releaseId,environmentId:ids.environmentId}};
  if(request.action==='simulate_promotion')return{operation:'simulate_promotion',payload:{candidateId:ids.releaseId,environmentId:ids.environmentId,target:'non_live'}};
  if(request.action==='maintenance')return{operation:'set_runtime_control',payload:{environmentId:ids.environmentId,maintenance:!projection.controls.maintenance,readOnly:projection.controls.readOnly,disabledFeatures:projection.controls.disabledFeatures}};
  if(request.action==='read_only')return{operation:'set_runtime_control',payload:{environmentId:ids.environmentId,maintenance:projection.controls.maintenance,readOnly:!projection.controls.readOnly,disabledFeatures:projection.controls.disabledFeatures}};
  throw new Error('PREFLIGHT_BLOCKED');
};

export const PilotOperationsConnectedPanel:React.FC<{tenantContext:TenantContextProjection|null;selectionState?:EnterpriseSessionState;client?:PilotOperationsClient}>=({tenantContext,selectionState='ready',client:providedClient})=>{
  const clientRef=useRef<PilotOperationsClient|null>(null);if(!clientRef.current)clientRef.current=providedClient??new PilotOperationsClient();const client=providedClient??clientRef.current;
  const [projection,setProjection]=useState<PilotOperationsProjection|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[pending,setPending]=useState<PilotOperationRequest['action']|null>(null),[actionResult,setActionResult]=useState<{kind:'success'|'error'|'stale'|'revoked'|'blocked';message:string}|null>(null);const generation=useRef(0);
  const load=useCallback(async(selected:TenantContextProjection,token:number)=>{setLoading(true);setError(null);try{const next=await client.projection({organizationId:selected.organizationId,workspaceId:selected.workspaceId,expectedAuthorizationVersion:selected.authorizationVersion});if(generation.current===token)setProjection(next)}catch(cause){if(generation.current===token){setProjection(null);setError(cause instanceof Error?cause.message:'PERSISTENCE_UNAVAILABLE')}}finally{if(generation.current===token)setLoading(false)}},[client]);
  const key=tenantContext?`${tenantContext.organizationId}:${tenantContext.workspaceId}:${tenantContext.authorizationVersion}`:'none';
  useEffect(()=>{const token=++generation.current;setActionResult(null);if(selectionState!=='ready'||!tenantContext||!tenantContext.capabilities.includes('operations.read')){setLoading(false);setProjection(null);setError(selectionState==='stale'?'AUTHORIZATION_STALE':selectionState==='blocked'||selectionState==='read_only'?'ENVIRONMENT_BLOCKED':'ACCESS_DENIED');return}void load(tenantContext,token);return()=>{if(generation.current===token)generation.current++}},[key,selectionState,load,tenantContext]);
  const request=async(input:PilotOperationRequest)=>{if(!tenantContext||!projection||pending)return;setPending(input.action);setActionResult(null);try{const mapped=commandFor(input,projection);const command:PilotOperationsCommand={...mapped,organizationId:tenantContext.organizationId,workspaceId:tenantContext.workspaceId,requestId:crypto.randomUUID(),idempotencyKey:`pilot-ui-${mapped.operation}-${crypto.randomUUID()}`,expectedAuthorizationVersion:tenantContext.authorizationVersion,expectedVersion:input.expectedVersion};await client.command(command);await load(tenantContext,generation.current);setActionResult({kind:'success',message:'Authoritative command committed and server projection reloaded.'})}catch(cause){const code=cause instanceof Error?cause.message:'PERSISTENCE_UNAVAILABLE';setActionResult({kind:resultKind(code),message:code})}finally{setPending(null)}};
  return <PilotOperationsPanel projection={projection} loading={loading} error={error} pendingAction={pending} actionResult={actionResult} onRequest={input=>void request(input)}/>;
};
