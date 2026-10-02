import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalCommands, groups, isSnapshotPath, snapshotScope } from './creationAccessValidationContract.mjs';
export { canonicalCommands, groups } from './creationAccessValidationContract.mjs';

// Local command evidence, NOT exact Test-ID or hosted acceptance evidence.
// Only this allowlist may execute; neither a supplied manifest nor an env command
// can replace a canonical execution. Each group has its own immutable attempt.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', `safe.directory=${root}`, ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
function snapshot() {
  const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(isSnapshotPath);
  return [...new Set(paths)].sort().map(path => ({ path, sha256: hash(readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')) }));
}
export const sanitize = value => value
  .replace(/\x1b\[[0-9;]*m/g, '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[synthetic-id]')
  .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[local-database]')
  .replace(/\b(?:sk-(?:proj-)?|gsk_|sb_secret_|sbp_)[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
  .replace(/((?:password|authorization|access[_-]?token|service[_-]?role[_-]?key)\s*[=:]\s*)[^\r\n]+/gi, '$1[redacted]');

export function childEnvironment(command, input = process.env, repository = root, platform = process.platform) {
  // Infrastructure locations only. Never inherit provider, DB, CI token, proxy,
  // arbitrary test overrides, Node injection or npm lifecycle configuration.
  const allow = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'XDG_CACHE_HOME', 'LANG', 'LC_ALL'];
  const environment = {};
  for (const [key, value] of Object.entries(input)) if (allow.includes(key.toUpperCase())) environment[key] = value;
  const pathValue = input.PATH ?? input.Path ?? '';
  delete environment.Path; delete environment.PATH;
  environment[platform === 'win32' ? 'Path' : 'PATH'] = `${dirname(process.execPath)}${platform === 'win32' ? ';' : ':'}${pathValue}`;
  environment.npm_config_update_notifier = 'false';
  // Scoring validates its own narrower Git environment and supplies its own
  // explicit safe.directory. Other child scanners need this exact worktree only.
  environment.GIT_CONFIG_COUNT = command === 'test:pr-c-scoring-law-drift' ? '1' : '2';
  environment.GIT_CONFIG_KEY_0 = 'core.fsmonitor'; environment.GIT_CONFIG_VALUE_0 = 'false';
  if (environment.GIT_CONFIG_COUNT === '2') {
    environment.GIT_CONFIG_KEY_1 = 'safe.directory'; environment.GIT_CONFIG_VALUE_1 = repository;
  }
  if (command === 'test:creation-access:postgres') environment.DOCKER_HOST = platform === 'win32'
    ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock';
  return environment;
}

export function sanitizedCapture(emit = () => {}, maximum = 2_000_000) {
  let pending = '', output = '', truncated = false, droppingLine = false;
  const record = line => {
    const safe = sanitize(line);
    if (output.length + safe.length > maximum) { truncated = true; return; }
    output += safe; emit(safe);
  };
  return {
    append(chunk) {
      for (const part of String(chunk).split(/(?<=\n)/)) {
        if (!part) continue;
        if (!droppingLine) pending += part;
        if (pending.length > 16_384) { pending = ''; droppingLine = true; truncated = true; }
        if (part.endsWith('\n')) {
          record(droppingLine ? '[oversized output line suppressed]\n' : pending);
          pending = ''; droppingLine = false;
        }
      }
    },
    finish() { if (pending) record(pending); pending = ''; return { output, truncated }; },
  };
}

async function main() {
  const [group, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('CREATION_VALIDATION_UNEXPECTED_ARGUMENT');
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
  const commands = canonicalCommands(group, scripts);
  const before = snapshot();
  const sourceDigest = hash(JSON.stringify(before));
  const runId = randomUUID();
  const directory = join(root, 'output/creation-access', `validation-${group}-${runId}`);
  mkdirSync(join(root, 'output/creation-access'), { recursive: true });
  mkdirSync(directory, { recursive: false });
  const manifest = { schemaVersion: 2, runId, group, head: git(['rev-parse', 'HEAD']), sourceDigest, snapshotScope,
    sourceFiles: before, nodeVersion: process.version, evidenceKind: 'local-command-execution-only',
    commands: [], status: 'running', startedAt: new Date().toISOString() };
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npm = process.platform === 'win32' ? npmCli : resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
  for (const command of commands) {
    if (hash(JSON.stringify(snapshot())) !== sourceDigest) { manifest.status = 'source_changed'; break; }
    const startedAt = new Date().toISOString();
    const outcome = await new Promise(resolveResult => {
      const child = spawn(process.execPath, [npm, 'run', command.name], { cwd: root, env: childEnvironment(command.name), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let timedOut = false;
      const captured = sanitizedCapture(text => process.stdout.write(text));
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => captured.append(chunk)); child.stderr.on('data', chunk => captured.append(chunk));
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30 * 60_000);
      child.once('error', () => { clearTimeout(timer); resolveResult({ exitCode: null, ...captured.finish(), timedOut, spawnFailed: true }); });
      child.once('close', code => { clearTimeout(timer); resolveResult({ exitCode: code, ...captured.finish(), timedOut, spawnFailed: false }); });
    });
    const text = sanitize(outcome.output);
    const log = `${manifest.commands.length + 1}-${command.name.replace(/:/g, '-')}.log`;
    writeFileSync(join(directory, log), text);
    const stable = hash(JSON.stringify(snapshot())) === sourceDigest;
    const passed = outcome.exitCode === 0 && !outcome.truncated && !outcome.timedOut && !outcome.spawnFailed && stable;
    manifest.commands.push({ ...command, argv: ['node', 'npm-cli.js', 'run', command.name], startedAt, endedAt: new Date().toISOString(), exitCode: outcome.exitCode,
      status: passed ? 'passed' : 'failed', sourceStable: stable, truncated: outcome.truncated, timedOut: outcome.timedOut, log, logSha256: hash(text) });
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (!passed) { manifest.status = stable ? 'failed' : 'source_changed'; break; }
  }
  if (manifest.status === 'running') manifest.status = manifest.commands.length === commands.length ? 'passed' : 'failed';
  manifest.endedAt = new Date().toISOString();
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Creation access ${group}: ${manifest.status}; ${manifest.commands.length}/${commands.length} commands executed; source ${sourceDigest}.`);
  process.exitCode = manifest.status === 'passed' ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
