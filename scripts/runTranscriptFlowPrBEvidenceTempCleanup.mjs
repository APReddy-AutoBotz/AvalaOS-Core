import { chmodSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';

export const PR_B_EVIDENCE_COMPILER_OUTPUTS = Object.freeze([
  '.agent/enterprise-intelligence-tests',
  '.agent/pr1f-coverage',
  '.agent/pr1g-parity-bridge',
  '.agent/pr1g-projection-bridge',
]);
export const PR_B_EVIDENCE_COMPILER_OUTPUT = PR_B_EVIDENCE_COMPILER_OUTPUTS[0];

const defaultFileSystem = Object.freeze({ chmodSync, existsSync, lstatSync, readdirSync, realpathSync, rmSync });

const comparisonPath = value => process.platform === 'win32' ? value.toLowerCase() : value;
const isStrictChild = (candidate, parent) => comparisonPath(candidate).startsWith(`${comparisonPath(parent)}${path.sep}`);

const validateGeneratedTree = (directory, targetRoot, fileSystem) => {
  for (const entry of fileSystem.readdirSync(directory)) {
    const candidate = path.resolve(directory, entry);
    if (!isStrictChild(candidate, targetRoot)) throw new Error(`PR_B_TEMP_CLEANUP_CHILD_CONTAINMENT:${candidate}`);
    const stat = fileSystem.lstatSync(candidate);
    if (stat.isSymbolicLink()) throw new Error(`PR_B_TEMP_CLEANUP_NESTED_LINK:${candidate}`);
    if (!stat.isDirectory() && stat.nlink > 1) throw new Error(`PR_B_TEMP_CLEANUP_HARDLINK:${candidate}`);
    if (stat.isDirectory()) validateGeneratedTree(candidate, targetRoot, fileSystem);
  }
};

const makeGeneratedTreeWritable = (directory, fileSystem) => {
  for (const entry of fileSystem.readdirSync(directory)) {
    const candidate = path.resolve(directory, entry);
    const stat = fileSystem.lstatSync(candidate);
    if (stat.isDirectory()) makeGeneratedTreeWritable(candidate, fileSystem);
    fileSystem.chmodSync(candidate, stat.isDirectory() ? 0o700 : 0o600);
  }
};

export const createPrBEvidenceCompilerOutputCleanup = (fileSystem = defaultFileSystem) => (root, trackedFiles = []) => {
  if (['chmodSync', 'existsSync', 'lstatSync', 'readdirSync', 'realpathSync', 'rmSync']
    .some(method => typeof fileSystem?.[method] !== 'function')) {
    throw new TypeError('PR_B_TEMP_CLEANUP_INVALID_FILESYSTEM');
  }
  const resolvedRoot = path.resolve(root);
  const agentRoot = path.resolve(resolvedRoot, '.agent');
  const targets = PR_B_EVIDENCE_COMPILER_OUTPUTS.map(relative => {
    const target = path.resolve(resolvedRoot, relative);
    const expected = path.join(agentRoot, path.basename(relative));
    if (!isStrictChild(target, agentRoot) || target !== expected) {
      throw new Error(`PR_B_TEMP_CLEANUP_CONTAINMENT:${target}`);
    }
    return { relative, target };
  });

  const normalizedTracked = trackedFiles.map(value => value.replaceAll('\\', '/'));
  if (normalizedTracked.some(value => !PR_B_EVIDENCE_COMPILER_OUTPUTS.some(relative => (
    value === relative || value.startsWith(`${relative}/`)
  )))) {
    throw new Error('PR_B_TEMP_CLEANUP_TRACKED_SCOPE');
  }
  if (normalizedTracked.length > 0) throw new Error('PR_B_TEMP_CLEANUP_TRACKED_STATE');
  if (fileSystem.existsSync(agentRoot) && fileSystem.lstatSync(agentRoot).isSymbolicLink()) {
    throw new Error('PR_B_TEMP_CLEANUP_AGENT_LINK');
  }
  if (!fileSystem.existsSync(agentRoot)) return false;
  const realAgentRoot = fileSystem.realpathSync(agentRoot);
  const validatedTargets = [];
  for (const { target } of targets) {
    if (!fileSystem.existsSync(target)) continue;
    if (fileSystem.lstatSync(target).isSymbolicLink()) throw new Error('PR_B_TEMP_CLEANUP_TARGET_LINK');
    const realTarget = fileSystem.realpathSync(target);
    if (!isStrictChild(realTarget, realAgentRoot)) throw new Error(`PR_B_TEMP_CLEANUP_REALPATH:${realTarget}`);
    validateGeneratedTree(target, target, fileSystem);
    validatedTargets.push(target);
  }
  for (const target of validatedTargets) {
    makeGeneratedTreeWritable(target, fileSystem);
    fileSystem.chmodSync(target, 0o700);
    try {
      fileSystem.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      throw new Error(`PR_B_TEMP_CLEANUP_FAILED:${error?.code || 'unknown'}:${target}`, { cause: error });
    }
  }
  return validatedTargets.length > 0;
};

export const cleanupPrBEvidenceCompilerOutput = createPrBEvidenceCompilerOutputCleanup();
