import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import AdminWorkbench from '../../components/admin/AdminWorkbench';
import { PilotOperationsConnectedPanel } from '../../components/admin/PilotOperationsConnectedPanel';
import { PilotOperationsClient } from '../../services/pilotOperations/client';

const ORG='11111111-1111-4111-8111-111111111111',WORKSPACE='22222222-2222-4222-8222-222222222222',ENV='33333333-3333-4333-8333-333333333333',RELEASE='44444444-4444-4444-8444-444444444444';
const params=new URLSearchParams(location.search),state=params.get('state')??'ready';
let version=7,maintenance=state==='maintenance',readOnly=state==='read_only';
const raw=()=>({truthClassification:'not_proven_hosted_live',liveActivationAuthorized:false,environment:{id:ENV,type:'pilot_candidate',lifecycle:'configured_non_live',version,maintenance,readOnly,disabledFeatures:state==='blocked'?['control_plane']:[]},release:{id:RELEASE,gitSha:'1df9dc212df30da89bb510f066fe84ba46fe80e9',lifecycle:'validated',version:5},provider:{configured:true,enabled:false,purpose:'enterprise_intelligence'},blockers:['LIVE_ACTIVATION_NOT_AUTHORIZED','HOSTED_LIVE_NOT_PROVEN']});
const client=new PilotOperationsClient({
  query:async()=>{await new Promise(resolve=>setTimeout(resolve,state==='loading'?350:20));if(state==='error')throw new Error('PERSISTENCE_UNAVAILABLE');return raw()},
  command:async body=>{if(state==='denied')throw new Error('ACCESS_DENIED');if(state==='stale')throw new Error('VERSION_CONFLICT');if(state==='blocked')throw new Error('ENVIRONMENT_BLOCKED');const command=body as {operation:string;payload:Record<string,unknown>};if(command.operation==='set_runtime_control'){maintenance=Boolean(command.payload.maintenance);readOnly=Boolean(command.payload.readOnly);version++}return{resourceId:ENV}},
});
const tenant={userId:'55555555-5555-4555-8555-555555555555',organizationId:ORG,organizationName:'Synthetic CI Organization',workspaceId:WORKSPACE,workspaceName:'Synthetic CI Workspace',authorizationVersion:9,capabilities:['operations.read','operations.manage','release.validate','release.approve','release.promote']};
const empty=<p>Retained Admin section</p>;
function Harness(){return <AdminWorkbench organizationName="Synthetic CI Organization" planLabel="Non-live test" overview={empty} releaseCandidate={empty} pilotOperations={<PilotOperationsConnectedPanel tenantContext={state==='revoked'?null:tenant} selectionState={state==='revoked'?'revoked':'ready'} client={client}/>} organization={empty} modules={empty} trustCenter={empty} buyerAcceptancePack={empty} buyerAcceptanceReviewGate={empty} buyerAcceptanceAdminWalkthrough={empty} evidencePolicy={empty} usersRoles={empty} auditSecurity={empty} aiControls={empty}/>}
createRoot(document.getElementById('root')!).render(<Harness/>);
