import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import SyntheticUserManagement from '../../components/admin/SyntheticUserManagement';
import { SyntheticAdminOutcomeUnknown, type SyntheticAdminTransport } from '../../services/syntheticAdminClient';
import type { SyntheticAdminAssignableRolePreset, SyntheticAdminEnvelope, SyntheticAdminRolePreset,
  SyntheticAdminState, SyntheticAdminStudioVariant } from '../../services/syntheticAdminContract';
import { SYNTHETIC_ADMIN_ROLE_PRESETS, SyntheticAdminError } from '../../services/syntheticAdminContract';

const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const OTHER_WS='33333333-3333-4333-8333-333333333334';
const ACTOR='11111111-1111-4111-8111-111111111111';
const RESERVATION='44444444-4444-4444-8444-444444444444';
const LOGIN=`synthetic-${RESERVATION}@avalaos.invalid`;
const mode=new URLSearchParams(location.search).get('mode') ?? 'ready';
const boundVariant:SyntheticAdminStudioVariant|null=mode==='studio_author'?'studio-author'
  :mode==='studio_reviewer'?'studio-reviewer':mode==='studio_approver'?'studio-approver':null;
let baseRolePreset:SyntheticAdminRolePreset=boundVariant==='studio-reviewer'?'reviewer':boundVariant==='studio-approver'?'approver':'author';
let accountState:SyntheticAdminState=mode==='late'||boundVariant?'active':mode==='ban_pending'?'ban_required':'reserved';
let rolePreset:SyntheticAdminAssignableRolePreset=baseRolePreset;
let version=mode==='late'||mode==='ban_pending'||boundVariant?2:1;
let label=mode==='late'||mode==='ban_pending'?'Existing synthetic actor':boundVariant?'Prebound Studio actor':'';
let executeCalls=0;
let reserveCalls=0;
let reconcileCalls=0;
let operatorAssessRead=mode==='operator_access_granted';
let heldList=false;
let releaseHeldList=()=>{};
const events:Array<{operation:string;workspaceId:string;requestId?:string;idempotencyKey?:string;passwordSubmitted?:boolean;rolePreset?:unknown;payloadKeys:string[]}>=[];
(window as any).__syntheticAdminEvents=events;

const response=()=>({status:accountState,reservationId:RESERVATION,loginId:LOGIN,version});
const item=()=>({reservationId:RESERVATION,label,loginId:LOGIN,rolePreset,baseRolePreset,studioVariant:boundVariant,
  studioVariantActive:boundVariant!==null&&rolePreset===boundVariant,
  assignableRolePresets:boundVariant?[baseRolePreset,boundVariant]:[...SYNTHETIC_ADMIN_ROLE_PRESETS],state:accountState,version});
const transport:SyntheticAdminTransport=async(body:SyntheticAdminEnvelope)=>{
  events.push({operation:body.operation,workspaceId:body.workspaceId,requestId:body.requestId,idempotencyKey:body.idempotencyKey,
    payloadKeys:Object.keys(body.payload).sort(),...(body.operation==='execute'?{passwordSubmitted:typeof body.payload.password==='string'&&String(body.payload.password).length>=12}:{}),
    ...(body.operation==='assign_role'?{rolePreset:body.payload.rolePreset}:{})});
  if(body.operation==='list'){
    if(mode==='late'&&body.workspaceId===WS&&!heldList){
      heldList=true;
      await new Promise<void>(resolve=>{releaseHeldList=resolve});
    }
    return{status:'listed',roster:body.workspaceId===WS&&label?[item()]:[],nextCursor:null};
  }
  if(body.workspaceId!==WS) throw new Error('WRONG_WORKSPACE');
  if(body.operation==='grant_operator_assess_read'){
    operatorAssessRead=true;
    return{status:'operator_access_granted',version:version+1};
  }
  if(body.operation==='remove_operator_assess_read'){
    operatorAssessRead=false;
    return{status:'operator_access_removed',version:version+1};
  }
  if(body.operation==='reserve'){
    reserveCalls++;
    if(mode==='reserve_error'&&reserveCalls===1) throw new SyntheticAdminError('PERMISSION_DENIED');
    label=String(body.payload.label);
    rolePreset=body.payload.rolePreset as SyntheticAdminRolePreset;
    baseRolePreset=rolePreset;
    if(mode==='reserve_busy'&&reserveCalls===1) await new Promise<void>(resolve=>{releaseHeldList=resolve});
    if(mode==='reserve_uncertain'&&reserveCalls===1) throw new SyntheticAdminOutcomeUnknown();
    return response();
  }
  if(body.payload.reservationId!==RESERVATION) throw new Error('WRONG_RESERVATION');
  if(body.operation==='execute'){
    executeCalls++;
    accountState='active';version++;
    if(mode==='uncertain') throw new SyntheticAdminOutcomeUnknown();
    if(mode==='late_execute') await new Promise<void>(resolve=>{releaseHeldList=resolve});
    return response();
  }
  if(body.operation==='reconcile') {
    reconcileCalls++;
    if(mode==='ban_pending') { accountState=reconcileCalls===1?'ban_uncertain':'revoked'; version++; }
    return response();
  }
  if(body.operation==='assign_role'){
    if(body.payload.expectedVersion!==version) throw new Error('VERSION_CONFLICT');
    const requested=body.payload.rolePreset as SyntheticAdminAssignableRolePreset;
    if(boundVariant ? requested!==baseRolePreset&&requested!==boundVariant
      : !(SYNTHETIC_ADMIN_ROLE_PRESETS as readonly string[]).includes(requested)) throw new Error('UNASSIGNABLE_ROLE');
    rolePreset=requested;
    if(!boundVariant) baseRolePreset=requested as SyntheticAdminRolePreset;
    version++;
    if(mode==='uncertain_role') throw new SyntheticAdminOutcomeUnknown();
    return boundVariant?{status:accountState,reservationId:RESERVATION,version,rolePreset,baseRolePreset,studioVariant:boundVariant,
      studioVariantActive:rolePreset===boundVariant}:response();
  }
  if(body.operation==='revoke'){
    if(body.payload.expectedVersion!==version) throw new Error('VERSION_CONFLICT');
    accountState='revoked';version++;
    if(mode==='uncertain_revoke') throw new SyntheticAdminOutcomeUnknown();
    return response();
  }
  throw new Error('UNEXPECTED_OPERATION');
};

function Harness(){
  const [workspaceId,setWorkspaceId]=useState(WS);
  const [authorizationVersion,setAuthorizationVersion]=useState(7);
  const [authorityRefresh,setAuthorityRefresh]=useState(0);
  const capabilities=mode==='denied'?['org.admin']:[
    'org.admin','admin.synthetic.users.manage',...(operatorAssessRead?['assess.read']:[]),
  ];
  const tenant={userId:ACTOR,organizationId:ORG,organizationName:'Synthetic CI org',workspaceId,
    workspaceName:workspaceId===WS?'Exploratory workspace':'Other workspace',authorizationVersion,capabilities};
  return <main className="mx-auto max-w-5xl p-4 sm:p-8"><h1 className="mb-5 text-2xl font-bold">Synthetic Admin browser contract</h1>
    <div className="mb-5 flex flex-wrap gap-2"><button type="button" className="rounded-lg border p-2" onClick={()=>{setWorkspaceId(OTHER_WS);setAuthorizationVersion(version=>version+1)}}>Switch workspace and authority</button><button type="button" className="rounded-lg border p-2" onClick={()=>releaseHeldList()}>Release delayed response</button></div>
    <SyntheticUserManagement tenantContext={{...tenant,authorizationVersion:authorizationVersion+authorityRefresh}}
      sessionState="ready" transport={transport} onAuthorityChanged={async()=>setAuthorityRefresh(value=>value+1)}/>
    <p className="mt-4 text-xs">Mocked synthetic browser contract; no hosted account is created.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
