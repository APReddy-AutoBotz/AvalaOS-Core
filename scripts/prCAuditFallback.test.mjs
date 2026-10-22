import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { runPrCEvidenceCommand } from './prCEvidenceCommandRunner.mjs';
import { expectedPrCCommandRegistry } from './transcriptFlowPrCEvidenceContract.mjs';

const command = expectedPrCCommandRegistry(process.cwd()).find(item => item.id === 'audit').command;
const names = ['pr-c-audit-prod', 'pr-c-audit-dev', 'pr-c-audit-optional', 'pr-c-audit-transitive'];

async function probe(mode, auditCommand = command) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'pr-c-audit-'));
  const manifest = { name: 'pr-c-audit-root', version: '1.0.0',
    dependencies: { [names[0]]: '1.0.0' }, devDependencies: { [names[1]]: '1.0.0' },
    optionalDependencies: { [names[2]]: '1.0.0' } };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
    packages: { '': manifest, ...Object.fromEntries(names.map((name, index) => [`node_modules/${name}`, {
      version: '1.0.0', ...(index === 0 ? { dependencies: { [names[3]]: '1.0.0' } } : {}),
      ...(index === 1 ? { dev: true } : {}), ...(index === 2 ? { optional: true } : {}),
    }])) } };
  const inputs = { 'package.json': JSON.stringify(manifest), 'package-lock.json': JSON.stringify(lock) };
  for (const [name, bytes] of Object.entries(inputs)) writeFileSync(path.join(cwd, name), bytes);
  writeFileSync(path.join(cwd, 'user.npmrc'), '');
  writeFileSync(path.join(cwd, 'global.npmrc'), '');
  const requests = [];
  let bulkBody;
  let quickBody;
  const server = http.createServer(async (request, response) => {
    requests.push(request.url);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let bytes = Buffer.concat(chunks);
    if (request.headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes);
    const send = (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
    if (request.url.endsWith('/advisories/bulk')) {
      bulkBody = JSON.parse(bytes);
      send(503, { error: 'LOCAL_FIXTURE_BULK_UNAVAILABLE' });
    } else if (request.url.endsWith('/audits/quick')) {
      quickBody = JSON.parse(bytes);
      if (!quickBody.dependencies || mode === 'endpoint-error') return send(400, { error: 'Invalid package tree' });
      if (mode === 'timeout') return;
      if (mode === 'malformed') { response.writeHead(200); response.end('{'); return; }
      const severity = ['low', 'moderate', 'high', 'critical'].includes(mode) ? mode : null;
      send(200, { advisories: severity ? { 123456: { id: 123456, url: 'https://example.invalid/advisory',
        title: 'Synthetic audit fixture', severity, vulnerable_versions: '<2.0.0', module_name: names[1] } } : {} });
    } else if (names.includes(decodeURIComponent(request.url.slice(1)))) {
      const name = decodeURIComponent(request.url.slice(1));
      send(200, { name, 'dist-tags': { latest: '2.0.0' }, versions: {
        '1.0.0': { name, version: '1.0.0' }, '2.0.0': { name, version: '2.0.0' },
      } });
    } else send(404, { error: 'UNEXPECTED_LOCAL_FIXTURE_REQUEST' });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|pathext|systemroot|comspec)$/i.test(key)));
  Object.assign(environment, { HOME: cwd, USERPROFILE: cwd, TEMP: cwd, TMP: cwd,
    npm_config_userconfig: path.join(cwd, 'user.npmrc'), npm_config_globalconfig: path.join(cwd, 'global.npmrc'),
    npm_config_cache: path.join(cwd, 'cache'), npm_config_registry: `http://127.0.0.1:${server.address().port}`,
    npm_config_fetch_retries: '0', npm_config_fetch_timeout: '1000', npm_config_logs_max: '0' });
  try {
    const result = await runPrCEvidenceCommand({ command: `${auditCommand} --json`, commandId: 'audit', cwd, environment,
      spawnImpl: (executable, args, options) => spawn(executable, args, { ...options, timeout: 15000 }),
      stdoutSink: { write() {} }, stderrSink: { write() {} } });
    assert.equal(result.signal, null);
    assert.equal(result.error, null);
    for (const [name, bytes] of Object.entries(inputs)) assert.equal(readFileSync(path.join(cwd, name), 'utf8'), bytes);
    assert.equal(requests.filter(url => url.endsWith('/advisories/bulk')).length, 1);
    assert.equal(requests.filter(url => url.endsWith('/audits/quick')).length, 1);
    assert.deepEqual(Object.keys(bulkBody).sort(), [...names].sort());
    if (auditCommand === command) {
      assert.deepEqual(Object.keys(quickBody.dependencies).sort(), [...names].sort());
      assert.deepEqual(quickBody.requires, { ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.dependencies });
    }
    return { status: result.status, invalidPackageTree: /Invalid package tree/.test(result.stdout + result.stderr),
      report: (() => { try { return JSON.parse(result.stdout); } catch { return null; } })() };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(cwd), path.resolve(tmpdir()));
    assert.ok(path.basename(cwd).startsWith('pr-c-audit-'));
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('the original v3 quick fallback reproduces Invalid package tree and fails closed', async () => {
  const result = await probe('clean', 'npm audit --audit-level=moderate');
  assert.notEqual(result.status, 0);
  assert.equal(result.invalidPackageTree, true);
});
for (const mode of ['clean', 'low', 'moderate', 'high', 'critical', 'endpoint-error', 'malformed', 'timeout']) {
  test(`the PR C audit preserves complete scope and fails closed: ${mode}`, async () => {
    const result = await probe(mode);
    assert.equal(result.status === 0, mode === 'clean' || mode === 'low');
    if (['low', 'moderate', 'high', 'critical'].includes(mode)) assert.equal(result.report?.metadata?.vulnerabilities?.[mode], 1);
  });
}
