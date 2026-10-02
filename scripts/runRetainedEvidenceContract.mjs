import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

const run = (root, executable, args, options = {}) => spawnSync(executable, args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
  ...options,
});

const emit = result => {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
};

const assertSucceeded = (result, code) => {
  emit(result);
  if (result.error) throw new Error(`${code}:${result.error.code || result.error.message}`);
  if (result.status !== 0) throw new Error(`${code}:${result.status ?? 'unknown'}`);
};

const assertSha = (value, code) => {
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new Error(code);
};

const readGitObject = (root, args) => run(root, 'git', args, {
  env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
});

const selfContainedGitEnvironment = () => {
  const environment = { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' };
  delete environment.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  delete environment.GIT_OBJECT_DIRECTORY;
  return environment;
};

const commitParents = (root, label, commit) => {
  const result = readGitObject(root, ['cat-file', '-p', commit]);
  if (result.error || result.status !== 0) {
    assertSucceeded(result, `PR_C_RETAINED_${label}_PARENT_READ`);
  }
  return result.stdout.split(/\r?\n/gu).flatMap(line => {
    const match = line.match(/^parent ([0-9a-f]{40})$/u);
    return match ? [match[1]] : [];
  });
};

export const assertRetainedCommitChain = ({
  root = process.cwd(), label, exactHead, acceptedBase, acceptedParentChain,
}) => {
  if (!/^[A-Z0-9_]+$/u.test(label)) throw new Error('PR_C_RETAINED_LABEL');
  assertSha(exactHead, `PR_C_RETAINED_${label}_HEAD`);
  assertSha(acceptedBase, `PR_C_RETAINED_${label}_ACCEPTED_BASE`);
  if (!Array.isArray(acceptedParentChain) || acceptedParentChain.length === 0) {
    throw new Error(`PR_C_RETAINED_${label}_PARENT_CHAIN`);
  }

  const referencedCommits = new Set([acceptedBase, exactHead]);
  for (const [index, edge] of acceptedParentChain.entries()) {
    if (!edge || JSON.stringify(Object.keys(edge).sort()) !== JSON.stringify(['commit', 'parent'])) {
      throw new Error(`PR_C_RETAINED_${label}_PARENT_EDGE_FIELDS:${index}`);
    }
    assertSha(edge.commit, `PR_C_RETAINED_${label}_PARENT_EDGE_COMMIT:${index}`);
    assertSha(edge.parent, `PR_C_RETAINED_${label}_PARENT_EDGE_PARENT:${index}`);
    referencedCommits.add(edge.commit);
    referencedCommits.add(edge.parent);
  }

  for (const commit of referencedCommits) {
    assertSucceeded(
      readGitObject(root, ['cat-file', '-e', `${commit}^{commit}`]),
      `PR_C_RETAINED_${label}_COMMIT_MISSING:${commit}`,
    );
  }

  let cursor = acceptedBase;
  const visited = new Set([cursor]);
  for (const [index, edge] of acceptedParentChain.entries()) {
    if (edge.commit !== cursor) {
      throw new Error(`PR_C_RETAINED_${label}_PARENT_CHAIN_DISCONNECTED:${index}`);
    }
    if (!commitParents(root, label, edge.commit).includes(edge.parent)) {
      throw new Error(`PR_C_RETAINED_${label}_PARENT_EDGE_MISMATCH:${edge.commit}:${edge.parent}`);
    }
    if (visited.has(edge.parent)) throw new Error(`PR_C_RETAINED_${label}_PARENT_CHAIN_CYCLE:${index}`);
    visited.add(edge.parent);
    cursor = edge.parent;
  }
  if (cursor !== exactHead) throw new Error(`PR_C_RETAINED_${label}_PARENT_CHAIN_TERMINUS:${cursor}`);

  return {
    acceptedBase,
    exactHead,
    parentEdges: acceptedParentChain.length,
  };
};

export const createRetainedCheckout = ({ root, checkout, label, exactHead }) => {
  if (!/^[A-Z0-9_]+$/u.test(label)) throw new Error('PR_C_RETAINED_LABEL');
  assertSha(exactHead, `PR_C_RETAINED_${label}_HEAD`);
  const gitEnvironment = selfContainedGitEnvironment();
  const retainedBranch = `pr-c-retained/${label.toLowerCase()}-${process.pid}-${randomUUID()}`;
  const retainedRef = `refs/heads/${retainedBranch}`;

  assertSucceeded(
    run(root, 'git', ['update-ref', retainedRef, exactHead], {
      env: gitEnvironment,
    }),
    `PR_C_RETAINED_${label}_SOURCE_REF_CREATE_FAILED`,
  );

  try {
    assertSucceeded(
      run(root, 'git', [
        'clone', '--no-local', '--no-checkout', '--no-tags',
        '--single-branch', '--branch', retainedBranch, root, checkout,
      ], {
        env: gitEnvironment,
      }),
      `PR_C_RETAINED_${label}_CLONE_FAILED`,
    );
    if (existsSync(path.join(checkout, '.git', 'objects', 'info', 'alternates'))) {
      throw new Error(`PR_C_RETAINED_${label}_CHECKOUT_SHARED_OBJECTS`);
    }
    assertSucceeded(
      run(root, 'git', ['-C', checkout, 'checkout', '--detach', exactHead], {
        env: gitEnvironment,
      }),
      `PR_C_RETAINED_${label}_CHECKOUT_FAILED`,
    );

    const checkedOutHead = run(root, 'git', ['-C', checkout, 'rev-parse', 'HEAD'], {
      env: gitEnvironment,
    });
    assertSucceeded(checkedOutHead, `PR_C_RETAINED_${label}_CHECKOUT_HEAD_READ`);
    if (checkedOutHead.stdout.trim() !== exactHead) {
      throw new Error(`PR_C_RETAINED_${label}_CHECKOUT_HEAD_MISMATCH`);
    }
  } finally {
    assertSucceeded(
      run(root, 'git', ['update-ref', '-d', retainedRef], {
        env: gitEnvironment,
      }),
      `PR_C_RETAINED_${label}_SOURCE_REF_DELETE_FAILED`,
    );
  }
};

export const runRetainedEvidenceContract = ({
  label, exactHead, acceptedBase, acceptedParentChain, npmScript,
}) => {
  if (!/^[a-z0-9:-]+$/u.test(npmScript)) throw new Error(`PR_C_RETAINED_${label}_SCRIPT`);

  const root = process.cwd();
  const retainedLineage = assertRetainedCommitChain({
    root,
    label,
    exactHead,
    acceptedBase,
    acceptedParentChain,
  });

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), `avalaos-pr-c-retained-${label.toLowerCase()}-`));
  const checkout = path.join(temporaryRoot, 'repository');
  const temporaryReal = realpathSync(temporaryRoot);

  try {
    createRetainedCheckout({ root, checkout, label, exactHead });

    const dependencyRoot = path.join(checkout, 'node_modules');
    for (const packageName of ['typescript', '@types/node', 'undici-types']) {
      const packageSource = path.dirname(require.resolve(`${packageName}/package.json`));
      if (!existsSync(packageSource)) continue;
      const packageTarget = path.join(dependencyRoot, ...packageName.split('/'));
      mkdirSync(path.dirname(packageTarget), { recursive: true });
      cpSync(packageSource, packageTarget, { recursive: true });
    }

    const retainedOptions = {
      cwd: checkout,
      encoding: 'utf8',
      env: {
        ...process.env,
        PR_C_RETAINED_EXACT_HEAD: exactHead,
      },
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    };
    const retained = process.platform === 'win32'
      ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${npmScript}`], retainedOptions)
      : spawnSync('npm', ['run', npmScript], retainedOptions);
    emit(retained);
    if (retained.error) {
      throw new Error(`PR_C_RETAINED_${label}_COMMAND_START:${retained.error.code || retained.error.message}`);
    }
    if (retained.status !== 0) {
      throw new Error(`PR_C_RETAINED_${label}_CONTRACT_FAILED:${retained.status ?? 'unknown'}`);
    }

    process.stdout.write(`PR_C_RETAINED_EVIDENCE_CONTRACT ${JSON.stringify({
      label,
      exactHead,
      retainedLineage,
      command: `npm run ${npmScript}`,
      result: 'passed',
    })}\n`);
  } finally {
    const resolvedTemporary = realpathSync(temporaryRoot);
    if (resolvedTemporary !== temporaryReal || path.dirname(resolvedTemporary) !== realpathSync(os.tmpdir())) {
      throw new Error(`PR_C_RETAINED_${label}_TEMP_BOUNDARY`);
    }
    rmSync(resolvedTemporary, { recursive: true, force: true });
  }
};
