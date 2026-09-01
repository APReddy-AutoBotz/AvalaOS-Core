import { spawnSync } from 'node:child_process';
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

export const runRetainedEvidenceContract = ({ label, exactHead, npmScript }) => {
  if (!/^[A-Z0-9_]+$/u.test(label)) throw new Error('PR_C_RETAINED_LABEL');
  if (!/^[0-9a-f]{40}$/u.test(exactHead)) throw new Error(`PR_C_RETAINED_${label}_HEAD`);
  if (!/^[a-z0-9:-]+$/u.test(npmScript)) throw new Error(`PR_C_RETAINED_${label}_SCRIPT`);

  const root = process.cwd();
  assertSucceeded(
    run(root, 'git', ['cat-file', '-e', `${exactHead}^{commit}`]),
    `PR_C_RETAINED_${label}_HEAD_MISSING`,
  );
  assertSucceeded(
    run(root, 'git', ['merge-base', '--is-ancestor', exactHead, 'HEAD']),
    `PR_C_RETAINED_${label}_HEAD_NOT_ANCESTOR`,
  );

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), `avalaos-pr-c-retained-${label.toLowerCase()}-`));
  const checkout = path.join(temporaryRoot, 'repository');
  const temporaryReal = realpathSync(temporaryRoot);

  try {
    assertSucceeded(
      run(root, 'git', ['clone', '--shared', '--no-checkout', '--no-tags', root, checkout]),
      `PR_C_RETAINED_${label}_CLONE_FAILED`,
    );
    assertSucceeded(
      run(root, 'git', ['-C', checkout, 'checkout', '--detach', exactHead]),
      `PR_C_RETAINED_${label}_CHECKOUT_FAILED`,
    );

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
