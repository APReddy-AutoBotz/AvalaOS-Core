import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRetainedCommitChain } from './runRetainedEvidenceContract.mjs';

const acceptedBase = '5433cad41721355e3ec5a29bc2f87772540c77b5';
const acceptedFirstParent = '11e670003a73b0ab5a28650b70afac4b267760f4';
const retainedPrAHead = '460c44864b9d240321e727945411ced51dd0fe30';
const retainedPrBHead = 'fe3ebfb900bc163df2e436ec5b11f8751f9b79ea';

const prAParentChain = [
  { commit: acceptedBase, parent: acceptedFirstParent },
  { commit: acceptedFirstParent, parent: retainedPrAHead },
];
const prBParentChain = [
  { commit: acceptedBase, parent: retainedPrBHead },
];

test('accepts the exact retained PR A merge-parent chain', () => {
  assert.deepEqual(assertRetainedCommitChain({
    label: 'PR_A',
    exactHead: retainedPrAHead,
    acceptedBase,
    acceptedParentChain: prAParentChain,
  }), {
    acceptedBase,
    exactHead: retainedPrAHead,
    parentEdges: 2,
  });
});

test('accepts the exact retained PR B merge-parent chain', () => {
  assert.deepEqual(assertRetainedCommitChain({
    label: 'PR_B',
    exactHead: retainedPrBHead,
    acceptedBase,
    acceptedParentChain: prBParentChain,
  }), {
    acceptedBase,
    exactHead: retainedPrBHead,
    parentEdges: 1,
  });
});

test('rejects a historical head that is not a direct parent at the declared edge', () => {
  assert.throws(() => assertRetainedCommitChain({
    label: 'PR_A',
    exactHead: retainedPrAHead,
    acceptedBase,
    acceptedParentChain: [{ commit: acceptedBase, parent: retainedPrAHead }],
  }), /PR_C_RETAINED_PR_A_PARENT_EDGE_MISMATCH/u);
});

test('rejects a disconnected accepted merge-parent chain', () => {
  assert.throws(() => assertRetainedCommitChain({
    label: 'PR_A',
    exactHead: retainedPrAHead,
    acceptedBase,
    acceptedParentChain: [
      ...prBParentChain,
      { commit: acceptedFirstParent, parent: retainedPrAHead },
    ],
  }), /PR_C_RETAINED_PR_A_PARENT_CHAIN_DISCONNECTED:1/u);
});

test('rejects a chain that does not terminate at the retained exact head', () => {
  assert.throws(() => assertRetainedCommitChain({
    label: 'PR_A',
    exactHead: retainedPrAHead,
    acceptedBase,
    acceptedParentChain: [{ commit: acceptedBase, parent: acceptedFirstParent }],
  }), /PR_C_RETAINED_PR_A_PARENT_CHAIN_TERMINUS/u);
});
