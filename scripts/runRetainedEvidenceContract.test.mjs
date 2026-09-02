import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertRetainedCommitChain, createRetainedCheckout } from './runRetainedEvidenceContract.mjs';

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

const git = (root, args) => {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed: ${result.error?.message || result.stderr}`,
  );
  return result.stdout.trim();
};

test('creates a self-contained historical checkout without shared object alternates', () => {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'avalaos-retained-checkout-test-'));
  const source = path.join(temporaryRoot, 'source');
  const checkout = path.join(temporaryRoot, 'checkout');

  try {
    mkdirSync(source);
    git(source, ['init', '--quiet']);
    git(source, ['config', 'user.name', 'AvalaOS Test']);
    git(source, ['config', 'user.email', 'test@avalaos.invalid']);
    writeFileSync(path.join(source, 'retained.txt'), 'retained\n');
    git(source, ['add', 'retained.txt']);
    git(source, ['commit', '--quiet', '-m', 'retained']);
    const retainedHead = git(source, ['rev-parse', 'HEAD']);
    writeFileSync(path.join(source, 'current.txt'), 'current\n');
    git(source, ['add', 'current.txt']);
    git(source, ['commit', '--quiet', '-m', 'current']);

    createRetainedCheckout({
      root: source,
      checkout,
      label: 'TEST',
      exactHead: retainedHead,
    });

    assert.equal(git(checkout, ['rev-parse', 'HEAD']), retainedHead);
    assert.equal(existsSync(path.join(checkout, '.git', 'objects', 'info', 'alternates')), false);
    rmSync(source, { recursive: true, force: true });
    assert.equal(git(checkout, ['cat-file', '-t', `${retainedHead}^{tree}`]), 'tree');
    assert.equal(
      readFileSync(path.join(checkout, 'retained.txt'), 'utf8').replace(/\r\n/gu, '\n'),
      'retained\n',
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

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
