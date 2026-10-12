import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { downloadAndVerifyAuthenticatedEdgeSources } from './runAuthenticatedHostedAcceptance.mjs';

const exec = promisify(execFile);
const binary = process.env.AUTHENTICATED_TEST_CLI_BINARY || 'supabase';
const temporary = await mkdtemp(path.join(os.tmpdir(), 'authenticated-cli-integration-'));
const project = 'abcdefghijklmnopqrst';
const fakeToken = 'sbp_' + '0'.repeat(40);
const privateMarker = 'fixture-sensitive-value-must-never-appear';
const requests = [];
const blockedExternal = [];
const downloadDirectories = [];
const server = createServer((request, response) => {
  if (request.url === `/v1/projects/${project}/functions/tenant-session/body`) {
    requests.push({ path: request.url, authorization: request.headers.authorization });
    response.writeHead(403, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: privateMarker }));
  } else {
    // Docker liveness and any accidental proxy traffic fail locally.
    blockedExternal.push(request.url);
    response.writeHead(503);
    response.end('offline fixture');
  }
});
server.on('connect', (request, socket) => {
  blockedExternal.push('CONNECT');
  socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const profile = path.join(temporary, 'profile.json');
  await writeFile(profile, JSON.stringify({ name: 'acceptance-offline', api_url: origin,
    dashboard_url: origin, project_host: 'fixture.invalid' }));
  const environment = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
    'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  Object.assign(environment, { SUPABASE_HOME: path.join(temporary, 'cli-home'),
    SUPABASE_ACCESS_TOKEN: fakeToken, SUPABASE_TELEMETRY_DISABLED: 'true', CI: 'true',
    HTTP_PROXY: origin, HTTPS_PROXY: origin, ALL_PROXY: origin,
    http_proxy: origin, https_proxy: origin, all_proxy: origin,
    NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
    DOCKER_HOST: origin.replace('http:', 'tcp:') });
  const version = await exec(binary, ['--version'], { env: environment, timeout: 30000, windowsHide: true });
  assert.equal(version.stdout.trim(), '2.101.0', 'integration must use the workflow-pinned CLI');
  let failure;
  try {
    await downloadAndVerifyAuthenticatedEdgeSources({ projectRef: project, backendDigest: 'sha256:' + '0'.repeat(64) }, {
      managementToken: fakeToken,
      cli: async (_command, args, options) => {
        downloadDirectories.push(options.cwd);
        assert.equal(await readFile(path.join(options.cwd, 'supabase/config.toml'), 'utf8'),
          `project_id = "${project}"\n`);
        return exec(binary, [...args, '--profile', profile], {
          cwd: options.cwd, env: environment, encoding: 'utf8', timeout: 30000,
          maxBuffer: 128 * 1024, windowsHide: true,
        });
      },
    });
  } catch (error) { failure = error; }
  assert.ok(failure, 'the local forbidden response must stop source verification');
  assert.equal(requests.length, 1, 'the real CLI must reach only the loopback fixture download');
  assert.equal(requests[0].authorization, 'Bearer ' + fakeToken);
  assert.match(failure.message, /^AUTHENTICATED_HOSTED_RUNNER_[A-Z0-9_]+$/);
  assert.equal(failure.message.includes(privateMarker), false);
  for (const directory of downloadDirectories) {
    await assert.rejects(readFile(path.join(directory, 'supabase/config.toml')), { code: 'ENOENT' });
  }
  console.log(JSON.stringify({ status: 'PASS', cliVersion: '2.101.0', loopbackDownloads: requests.length,
    sourceVerificationDenied: true, ownedTemporaryFilesRemoved: true, hostedRequests: 0 }));
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith('authenticated-cli-integration-'));
  await rm(temporary, { recursive: true, force: true });
}
