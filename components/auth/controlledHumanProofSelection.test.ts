import assert from 'node:assert/strict';
import { completedControlledHumanOptions, controlledHumanStepKey, selectControlledHumanProof } from './controlledHumanProofSelection';

type ControlledHumanStepBindingOption=Parameters<typeof completedControlledHumanOptions>[0][number];

const digest=(value:string)=>`sha256:${value.padEnd(64,'0')}`;
const completed=(checkpointId:string,stepId:string,index:number):ControlledHumanStepBindingOption=>({
  checkpointId,stepId,action:`action.${index}`,observationKind:'server_event',state:'completed',
  safeAnchor:{contractVersion:'pr-c-controlled-human-step-anchor-1',stepId,action:`action.${index}`,targetFamily:'resource',targetDigest:digest(`target${index}`),expectedVersion:index,
    transitionKind:'increment_one',selectorDigest:digest(`selector${index}`),intentDigest:digest(`intent${index}`),requestDigest:digest(`request${index}`),challengeToken:digest(`anchor${index}`),anchoredAt:'2026-09-04T10:00:00.000Z'},
  safeBinding:{contractVersion:'pr-c-controlled-human-step-binding-3',stepId,action:`action.${index}`,result:'succeeded',resourceFamily:'resource',resourceDigest:digest(`target${index}`),expectedVersion:index,
    observedVersion:index+1,requestDigest:digest(`request${index}`),receiptDigest:digest(`receipt${index}`),auditDigest:digest(`audit${index}`),intentDigest:digest(`intent${index}`),denialCodeDigest:digest('denial'),bindingToken:digest(`binding${index}`),anchorToken:digest(`anchor${index}`),
    causalParentBindingToken:digest(`parent-binding${index}`),causalParentResourceDigest:digest(`parent-resource${index}`),causalLineageDigest:digest(`lineage${index}`),issuedAt:'2026-09-04T10:00:01.000Z'},
});

const first=completed('CH-01','first-step',1),second=completed('CH-02','second-step',2);
const options: ControlledHumanStepBindingOption[]=[first,{...first,checkpointId:'CH-03',stepId:'pending-step',state:'unanchored',safeAnchor:null,safeBinding:null},second];
assert.deepEqual(completedControlledHumanOptions(options).map(controlledHumanStepKey),['CH-01:first-step','CH-02:second-step']);
assert.equal(selectControlledHumanProof(options,'CH-01:first-step',null)?.proof.safeBinding.bindingToken,first.safeBinding!.bindingToken);
assert.equal(selectControlledHumanProof(options,'CH-02:second-step',null)?.proof.safeBinding.bindingToken,second.safeBinding!.bindingToken);
assert.equal(selectControlledHumanProof(options,'',{safeAnchor:second.safeAnchor!,safeBinding:second.safeBinding!})?.key,'CH-02:second-step');
assert.equal(selectControlledHumanProof(options,'',null)?.key,'CH-02:second-step','fallback must be the latest completion rather than the first');
console.log('controlled-human proof selection: multi-step completed selection and just-completed proof passed');
