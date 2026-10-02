import { runRetainedEvidenceContract } from './runRetainedEvidenceContract.mjs';

runRetainedEvidenceContract({
  label: 'PR_A',
  exactHead: '460c44864b9d240321e727945411ced51dd0fe30',
  acceptedBase: '5433cad41721355e3ec5a29bc2f87772540c77b5',
  acceptedParentChain: [
    {
      commit: '5433cad41721355e3ec5a29bc2f87772540c77b5',
      parent: '11e670003a73b0ab5a28650b70afac4b267760f4',
    },
    {
      commit: '11e670003a73b0ab5a28650b70afac4b267760f4',
      parent: '460c44864b9d240321e727945411ced51dd0fe30',
    },
  ],
  npmScript: 'test:transcript-flow:evidence-contract',
});
