import { runRetainedEvidenceContract } from './runRetainedEvidenceContract.mjs';

runRetainedEvidenceContract({
  label: 'PR_B',
  exactHead: 'fe3ebfb900bc163df2e436ec5b11f8751f9b79ea',
  acceptedBase: '5433cad41721355e3ec5a29bc2f87772540c77b5',
  acceptedParentChain: [
    {
      commit: '5433cad41721355e3ec5a29bc2f87772540c77b5',
      parent: 'fe3ebfb900bc163df2e436ec5b11f8751f9b79ea',
    },
  ],
  npmScript: 'test:transcript-flow:studio-evidence-contract',
});
