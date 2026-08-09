import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import PilotOperationsPanel, { type PilotOperationRequest } from '../../components/admin/PilotOperationsPanel';

function Harness() {
  const [pending, setPending] = useState<PilotOperationRequest['action'] | null>(null);
  const [result, setResult] = useState<{kind:'success'|'blocked';message:string}|null>(null);
  const request = (value: PilotOperationRequest) => {
    setPending(value.action);
    setTimeout(() => { setPending(null); setResult(value.action === 'simulate_promotion' ? { kind:'blocked', message:'LIVE_ACTIVATION_NOT_AUTHORIZED: no mutation occurred.' } : { kind:'success', message:`${value.action} request accepted by the deterministic non-live fixture.` }); }, 50);
  };
  return <main className="min-h-screen p-4"><PilotOperationsPanel onRequest={request} pendingAction={pending} actionResult={result} projection={{
    release:{candidateLabel:'ws6-candidate',commitSha:'cff9c00d59418936d993da33377a449d1a4d1d68',lifecycle:'validated'},
    environment:{label:'pilot_candidate',type:'pilot_candidate',lifecycle:'configured_non_live',version:7},
    controls:{maintenance:false,readOnly:false,disabledFeatures:[]},
    promotion:{eligible:false,blockers:['LIVE_ACTIVATION_NOT_AUTHORIZED'],rollbackEligible:true,rollbackTargetLabel:'accepted-main'},
    provider:{configured:true,enabled:false},health:{schemaCompatible:true,queueState:'healthy',reconciliationState:'healthy'},
    recovery:{backupState:'passed',restoreState:'passed'},truth:'not_proven_hosted_live',liveActivationAuthorized:false,
  }}/></main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
