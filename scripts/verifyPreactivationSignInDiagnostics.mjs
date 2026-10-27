import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { preactivationSignInSourceBindings, readPreactivationSignInParent,
  resolvePreactivationSignInIdentity } from './preactivationSignInDiagnostics.mjs';

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const verifyPreactivationSignInDiagnostics = async ({
  workspaceRoot = process.cwd(), environment = process.env, retainIncomplete = false,
} = {}) => {
  const result = await readPreactivationSignInParent(workspaceRoot);
  if (result.state !== 'available') throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_PARENT_REJECTED');
  const { parent } = result;
  const runtimeIdentity = resolvePreactivationSignInIdentity(environment, parent.identity.nonce);
  if (runtimeIdentity.environment !== parent.identity.environment) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_IDENTITY_REJECTED');
  }
  if (runtimeIdentity.environment === 'ci' && !sameJson(runtimeIdentity, parent.identity)) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_IDENTITY_REJECTED');
  }
  if (runtimeIdentity.environment === 'local'
    && ['headSha', 'runAttempt', 'workflow', 'logicalJob', 'command', 'environment', 'nonce']
      .some(key => runtimeIdentity[key] !== parent.identity[key])) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_IDENTITY_REJECTED');
  }
  const expectedSources = await preactivationSignInSourceBindings(workspaceRoot);
  if (!sameJson(expectedSources, parent.sourceBindings)) {
    throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_SOURCE_REJECTED');
  }
  const terminal = ['passed', 'failed'].includes(parent.status);
  if (!terminal && !retainIncomplete) throw new Error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_INCOMPLETE');
  return Object.freeze({ status: parent.status, terminal, retainedIncomplete: !terminal && retainIncomplete });
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  const accepted = process.argv.length === 2
    || (process.argv.length === 3 && process.argv[2] === '--retain-incomplete');
  if (!accepted) {
    console.error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_VERIFY_FAILED');
    process.exitCode = 1;
  } else {
    verifyPreactivationSignInDiagnostics({ retainIncomplete: process.argv.includes('--retain-incomplete') })
      .then(result => {
        console.log(result.terminal
          ? 'PREACTIVATION_SIGN_IN_DIAGNOSTIC_VERIFY_PASS'
          : 'PREACTIVATION_SIGN_IN_DIAGNOSTIC_VERIFY_INCOMPLETE');
      })
      .catch(() => {
        console.error('PREACTIVATION_SIGN_IN_DIAGNOSTIC_VERIFY_FAILED');
        process.exitCode = 1;
      });
  }
}
