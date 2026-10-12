import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalDigest } from './assessV1OracleEvidence.mjs';
import {
  collectAuthenticatedEdgeRuntimeClosure,
  downloadAndVerifyAuthenticatedEdgeSources,
} from './runAuthenticatedHostedAcceptance.mjs';

const project = 'abcdefghijklmnopqrst';
const fakeToken = 'sbp_' + '0'.repeat(40);
const fakeDeploymentId = '00000000-0000-4000-8000-000000000001';
const fakeVersion = 17;
const functions = Object.freeze([
  'tenant-session', 'process-command', 'assess-command', 'assess-v2-command',
  'studio-artifact-command', 'studio-artifact-download', 'studio-delivery-authority-command',
  'legacy-delivery-command', 'legacy-delivery-query', 'studio-delivery-outcome-query',
  'enterprise-intelligence-query', 'synthetic-admin', 'pilot-operations-query',
  'enterprise-provider-lifecycle', 'enterprise-provider-lifecycle-authority',
  'enterprise-provider-lifecycle-recovery',
]);
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const normalize = value => value.toString('utf8').replace(/\r\n/gu, '\n');
const deployments = new Map(functions.map(slug => [slug, {
  id: fakeDeploymentId,
  version: fakeVersion,
  status: 'ACTIVE',
}]));
let failureStage = 'STARTUP';

async function repositoryClosures(root) {
  const closures = new Map();
  const compared = {};
  const sourceSnapshot = {};
  for (const slug of functions) {
    const closure = await collectAuthenticatedEdgeRuntimeClosure(root, slug);
    const entries = [];
    for (const [normalizedRelative, sourcePath] of closure) {
      const bytes = await readFile(sourcePath);
      const repositoryRelative = path.relative(root, sourcePath).replaceAll('\\', '/');
      assert.equal(repositoryRelative.startsWith('../'), false);
      entries.push({ normalizedRelative, repositoryRelative, sourcePath, bytes });
      compared[`${slug}:${normalizedRelative}`] = sha(normalize(bytes));
      sourceSnapshot[repositoryRelative] = sha(bytes);
    }
    closures.set(slug, entries);
  }
  assert.equal(Object.keys(compared).length, 216);
  assert.ok(closures.get('studio-artifact-command').some(entry =>
    entry.repositoryRelative === 'services/enterpriseIntelligence.ts'));
  assert.ok(closures.get('enterprise-intelligence-query').some(entry =>
    entry.repositoryRelative === 'services/enterpriseIntelligence.ts'));
  assert.ok(closures.get('legacy-delivery-command').some(entry =>
    entry.repositoryRelative === 'services/legacyDelivery/contracts.ts'));
  return { backendDigest: canonicalDigest(compared), closures, sourceSnapshot };
}

function variantEntries(entries, scenario) {
  const result = entries.map(entry => ({ ...entry, bytes: Buffer.from(entry.bytes) }));
  if (scenario === 'stale') {
    const target = result.find(entry => entry.normalizedRelative === '_shared/tenantSession.ts');
    assert.ok(target);
    target.bytes = Buffer.concat([target.bytes, Buffer.from('\n// stale fixture byte\n')]);
  } else if (scenario === 'missing') {
    result.pop();
  } else if (scenario === 'extra') {
    result.push({
      normalizedRelative: 'services/unexpectedMultipartFixture.ts',
      repositoryRelative: 'services/unexpectedMultipartFixture.ts',
      bytes: Buffer.from("export const unexpectedMultipartFixture = true;\n"),
    });
  }
  return result;
}

async function multipartPayload(slug, entries, expectedModuleCount) {
  const originalSize = entries.reduce((total, entry) => total + entry.bytes.length, 0);
  const metadata = {
    deployment_id: `${project}_${fakeDeploymentId}_${fakeVersion}`,
    original_size: originalSize,
    compressed_size: Math.max(1, Math.floor(originalSize / 2)),
    module_count: expectedModuleCount,
    deno2_entrypoint_path: `source/supabase/functions/${slug}/index.ts`,
  };
  assert.deepEqual(Object.keys(metadata), [
    'deployment_id', 'original_size', 'compressed_size', 'module_count', 'deno2_entrypoint_path',
  ]);
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  for (const entry of entries) {
    form.append('file', new File([entry.bytes], `source/${entry.repositoryRelative}`));
  }
  const request = new Request('http://127.0.0.1/multipart', { method: 'POST', body: form });
  const contentType = request.headers.get('content-type');
  assert.match(contentType, /^multipart\/form-data; boundary=/u);
  const body = Buffer.from(await request.arrayBuffer());
  return { body, contentType };
}

async function buildPayloads(closures) {
  const payloads = new Map();
  for (const slug of functions) {
    payloads.set(`success:${slug}`, await multipartPayload(
      slug, variantEntries(closures.get(slug), 'success'), closures.get(slug).length));
  }
  for (const scenario of ['stale', 'missing', 'extra']) {
    payloads.set(`${scenario}:${functions[0]}`,
      await multipartPayload(functions[0], variantEntries(closures.get(functions[0]), scenario),
        closures.get(functions[0]).length));
  }
  return payloads;
}

async function currentSourceSnapshot(root, paths) {
  return Object.fromEntries(await Promise.all(Object.keys(paths).map(async relative =>
    [relative, sha(await readFile(path.join(root, ...relative.split('/'))))])));
}

async function main() {
  const root = process.cwd();
  const requests = [];
  let server;
  let serverClosed = true;
  let passResult;
  try {
    failureStage = 'SOURCE_GRAPH';
    const { backendDigest, closures, sourceSnapshot } = await repositoryClosures(root);
    failureStage = 'MULTIPART_BUILD';
    const payloads = await buildPayloads(closures);

    let scenario = 'success';
    failureStage = 'LOOPBACK_START';
    server = createServer((request, response) => {
      const match = /^\/multipart\/(success|stale|missing|extra)\/([^/]+)$/u.exec(request.url ?? '');
      const requestScenario = match?.[1];
      const slug = match?.[2];
      const payload = payloads.get(`${requestScenario}:${slug}`);
      if (request.method !== 'GET' || requestScenario !== scenario || !payload
        || request.headers.authorization !== `Bearer ${fakeToken}`
        || request.headers.accept !== 'multipart/form-data'
        || request.headers['user-agent'] !== 'avalaos-authenticated-acceptance') {
        requests.push({ scenario, rejected: true });
        response.writeHead(503, { 'content-type': 'text/plain' });
        response.end('offline fixture');
        return;
      }
      requests.push({ scenario, slug, authorized: true });
      response.writeHead(200, {
        'content-type': payload.contentType,
        'content-length': payload.body.length,
      });
      response.end(payload.body);
    });
    server.on('connect', (_request, socket) => {
      requests.push({ scenario, rejected: true });
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    });
    serverClosed = false;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const fetchImpl = async (input, init) => {
      const slug = scenario === 'success' ? functions[requests.length] : functions[0];
      assert.equal(String(input), `https://api.supabase.com/v1/projects/${project}/functions/${slug}/body`);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), `Bearer ${fakeToken}`);
      assert.equal(headers.get('accept'), 'multipart/form-data');
      assert.equal(headers.get('user-agent'), 'avalaos-authenticated-acceptance');
      assert.ok(init?.signal instanceof AbortSignal);
      return fetch(`${origin}/multipart/${scenario}/${slug}`, { ...init, redirect: 'error' });
    };
    const config = { projectRef: project, backendDigest };

    failureStage = 'SUCCESS_VERIFY';
    const success = await downloadAndVerifyAuthenticatedEdgeSources(config, {
      root, managementToken: fakeToken, fetchImpl, deployments,
    });
    assert.deepEqual(success, { backendDigest, files: 216 });
    for (const [negative, code] of [
      ['stale', 'BACKEND_SOURCE_FILE_MISMATCH'],
      ['missing', 'BACKEND_DEPENDENCY_CLOSURE_MISSING'],
      ['extra', 'BACKEND_DEPENDENCY_CLOSURE_EXTRA'],
    ]) {
      failureStage = `${negative.toUpperCase()}_VERIFY`;
      scenario = negative;
      await assert.rejects(downloadAndVerifyAuthenticatedEdgeSources(config, {
        root, managementToken: fakeToken, fetchImpl, deployments,
      }), new RegExp(`^Error: AUTHENTICATED_HOSTED_RUNNER_${code}$`, 'u'));
    }

    failureStage = 'FINAL_ASSERTIONS';
    assert.equal(requests.some(request => request.rejected), false);
    assert.deepEqual(requests.map(request => `${request.scenario}:${request.slug}`), [
      ...functions.map(slug => `success:${slug}`),
      'stale:tenant-session', 'missing:tenant-session', 'extra:tenant-session',
    ]);
    assert.ok(requests.every(request => request.authorized === true));
    assert.deepEqual(await currentSourceSnapshot(root, sourceSnapshot), sourceSnapshot);
    passResult = {
      status: 'PASS', transport: 'multipart/form-data', loopbackDownloads: requests.length,
      successfulClosures: 216, deepEnterpriseIntelligenceSourceVerified: true,
      deepLegacyContractsSourceVerified: true, staleSourceRejected: true,
      missingDependencyRejected: true, extraDependencyRejected: true,
      repositorySourcesUnchanged: true, temporaryOutputs: 0, childProcesses: 0, hostedRequests: 0,
    };
  } finally {
    let cleanupFailed = false;
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        serverClosed = !server.listening;
      }
    } catch { cleanupFailed = true; }
    if (!serverClosed) cleanupFailed = true;
    if (cleanupFailed) {
      failureStage = 'CLEANUP';
      throw new Error('AUTHENTICATED_SUPABASE_MULTIPART_FIXTURE_CLEANUP_FAILED');
    }
  }
  console.log(JSON.stringify(passResult));
}

await main().catch(error => {
  const sanitized = /^AUTHENTICATED_HOSTED_RUNNER_[A-Z0-9_]+$/u.test(error?.message ?? '')
    ? error.message : 'FIXTURE_ASSERTION';
  console.error(`AUTHENTICATED_SUPABASE_MULTIPART_FIXTURE_${failureStage}_${sanitized}_FAILED`);
  process.exitCode = 1;
});
