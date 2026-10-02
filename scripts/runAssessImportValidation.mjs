import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { childEnvironment, sanitizedCapture } from './runCreationAccessValidation.mjs';
import { assessImportCommands, validateAssessImportDatabaseUrl, isAssessImportSnapshotPath, observedAssessImportResults } from './assessImportValidationContract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', `safe.directory=${root}`, ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const snapshot = () => [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(isAssessImportSnapshotPath))].sort()
  .map(path => {
    const binary = /\.(?:xlsx|docx|pdf)$/.test(path);
    return { path, canonicalization: binary ? 'bytes' : 'utf8-crlf-to-lf',
      sha256: hash(binary ? readFileSync(join(root, path)) : readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n')) };
  });
const [group, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('ASSESS_IMPORT_UNEXPECTED_ARGUMENT');
const commands = assessImportCommands(group, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts);
const databaseUrl = group === 'postgres' ? validateAssessImportDatabaseUrl(process.env.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL) : undefined;
const sourceFiles = snapshot(); const sourceDigest = hash(JSON.stringify(sourceFiles)); const runId = randomUUID();
const directory = join(root, 'output/assess-import/validation', `${group}-${runId}`);
mkdirSync(directory, { recursive: true });
const manifest = { schemaVersion: 1, evidenceKind: 'command-execution-only-not-exact-assertion-or-hosted-proof', runId, group,
  baseHead: git(['rev-parse', 'HEAD']), sourceDigest, sourceFiles, nodeVersion: process.version,
  ciRunId: process.env.GITHUB_RUN_ID || null, ciRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  status: 'running', commands: [], startedAt: new Date().toISOString() };
// An interrupted first command must remain an explicit incomplete attempt.
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const npm = process.platform === 'win32' ? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js') : resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
for (const command of commands) {
  if (hash(JSON.stringify(snapshot())) !== sourceDigest) { manifest.status = 'source_changed'; break; }
  const environment = childEnvironment(command.name, process.env, root);
  if (databaseUrl) environment.ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL = databaseUrl;
  if (databaseUrl && command.name === 'test:assess-import:retained-postgres') environment.TRANSCRIPT_FLOW_MIGRATION_DATABASE_URL = databaseUrl;
  const startedAt = new Date().toISOString();
  const result = await new Promise(resolveResult => {
    const capture = sanitizedCapture(() => {}, 8_000_000);
    const child = spawn(process.execPath, [npm, 'run', command.name], { cwd: root, env: environment, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => capture.append(chunk)); child.stderr.on('data', chunk => capture.append(chunk));
    const stopOwnedChild = () => {
      if (!Number.isInteger(child.pid) || child.exitCode !== null) return;
      if (process.platform === 'win32') {
        // This PID was returned by our own spawn. Terminate its test-only tree,
        // never a port owner, process-name match or unrelated user's workload.
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
      }
    };
    const timer = setTimeout(() => { timedOut = true; stopOwnedChild(); }, 30 * 60_000);
    child.once('error', () => { clearTimeout(timer); resolveResult({ exitCode: null, timedOut, spawnFailed: true, ...capture.finish() }); });
    child.once('close', code => { clearTimeout(timer); resolveResult({ exitCode: code, timedOut, spawnFailed: false, ...capture.finish() }); });
  });
  const stable = hash(JSON.stringify(snapshot())) === sourceDigest;
  const passed = result.exitCode === 0 && !result.timedOut && !result.spawnFailed && !result.truncated && stable;
  // Record sanitized output identity, never raw logs/document/provider content.
  // Command success is deliberately not converted into exact assertion PASS.
  manifest.commands.push({ ...command, argv: ['node', 'npm-cli.js', 'run', command.name], startedAt, endedAt: new Date().toISOString(),
    exitCode: result.exitCode, status: passed ? 'passed' : 'failed', sourceStable: stable,
    timedOut: result.timedOut, truncated: result.truncated, spawnFailed: result.spawnFailed,
    observedTestOutput: observedAssessImportResults(result.output), sanitizedOutputSha256: hash(result.output) });
  console.log(`${command.name}: ${passed ? 'passed' : 'failed'}`);
  if (!passed) console.log(result.output.split('\n').filter(line => /(?:error|fail|not ok|assert|missing|invalid)/iu.test(line)).slice(-12).join('\n'));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (!passed) { manifest.status = stable ? 'failed' : 'source_changed'; break; }
}
if (manifest.status === 'running') manifest.status = manifest.commands.length === commands.length ? 'passed' : 'failed';
manifest.endedAt = new Date().toISOString();
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Assess import ${group}: ${manifest.status}; ${manifest.commands.length}/${commands.length} commands; source ${sourceDigest}.`);
process.exitCode = manifest.status === 'passed' ? 0 : 1;
