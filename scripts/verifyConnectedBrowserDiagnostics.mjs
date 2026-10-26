import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONNECTED_BROWSER_PARENT_BYTE_CAP,
  connectedBrowserDiagnosticPaths,
  connectedBrowserSourceBindings,
  resolveConnectedBrowserDiagnosticIdentity,
  validateConnectedBrowserDiagnostic,
} from './connectedBrowserDiagnostics.mjs';

export const verifyConnectedBrowserDiagnostics = async (options = {}) => {
  const paths = connectedBrowserDiagnosticPaths(options.workspaceRoot);
  const before = await lstat(paths.finalPath, { bigint: true }).catch(() => null);
  if (!before || before.isSymbolicLink() || !before.isFile()
    || before.size > BigInt(CONNECTED_BROWSER_PARENT_BYTE_CAP)) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED');
  }
  let handle;
  try { handle = await open(paths.finalPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); } catch {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED');
  }
  let value;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.size > BigInt(CONNECTED_BROWSER_PARENT_BYTE_CAP)) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED');
    }
    const buffer = Buffer.alloc(CONNECTED_BROWSER_PARENT_BYTE_CAP + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > CONNECTED_BROWSER_PARENT_BYTE_CAP) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED');
    }
    const serialized = buffer.subarray(0, bytesRead).toString('utf8');
    const after = await lstat(paths.finalPath, { bigint: true });
    const same = !after.isSymbolicLink() && opened.dev === before.dev && opened.ino === before.ino
      && after.dev === before.dev && after.ino === before.ino && opened.size === before.size
      && after.size === before.size && opened.mtimeNs === before.mtimeNs && after.mtimeNs === before.mtimeNs;
    if (!same || Buffer.byteLength(serialized, 'utf8') > CONNECTED_BROWSER_PARENT_BYTE_CAP) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED');
    }
    value = JSON.parse(serialized);
  } catch (error) {
    if (error?.message === 'CONNECTED_BROWSER_DIAGNOSTIC_FILE_REJECTED') throw error;
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_JSON_REJECTED');
  } finally { await handle.close(); }
  const diagnostic = validateConnectedBrowserDiagnostic(value);
  if (!diagnostic || (diagnostic.phase !== 'complete' && options.retainIncomplete !== true)) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_SCHEMA_REJECTED');
  }
  const runtimeEnvironment = options.environment ?? process.env;
  const runtimeIsCi = runtimeEnvironment.GITHUB_ACTIONS === 'true';
  if (runtimeIsCi && diagnostic.identity.environment !== 'ci') {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_IDENTITY_REJECTED');
  }
  if (runtimeIsCi) {
    const expected = resolveConnectedBrowserDiagnosticIdentity(options.environment ?? process.env,
      diagnostic.identity.nonce);
    for (const key of Object.keys(expected)) if (diagnostic.identity[key] !== expected[key]) {
      throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_IDENTITY_REJECTED');
    }
  }
  const currentBindings = await connectedBrowserSourceBindings(paths.workspaceRoot);
  if (JSON.stringify(currentBindings) !== JSON.stringify(diagnostic.sourceBindings)) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_SOURCE_REJECTED');
  }
  if (diagnostic.status === 'incomplete' && options.retainIncomplete !== true) {
    throw new Error('CONNECTED_BROWSER_DIAGNOSTIC_INCOMPLETE');
  }
  return diagnostic;
};

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) verifyConnectedBrowserDiagnostics({ retainIncomplete: process.argv.includes('--retain-incomplete') }).then(value => {
  console.log(`CONNECTED_BROWSER_DIAGNOSTIC_VERIFIED:${value.status}`);
}).catch(() => {
  console.error('CONNECTED_BROWSER_DIAGNOSTIC_VERIFICATION_FAILED');
  process.exitCode = 1;
});
