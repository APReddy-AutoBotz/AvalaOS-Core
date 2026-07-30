import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeterministicFakeStudioPrivateArtifactStorage,
  StudioStorageError,
  buildStudioPrivateArtifactObjectKey,
  createStudioPrivateArtifactStorage,
} from './studioPrivateArtifactStorage';
import { sha256Hex } from './studioPrivateArtifactRenderer';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const opaqueObjectId = '33333333-3333-4333-8333-333333333333';
const objectKey = buildStudioPrivateArtifactObjectKey({ organizationId, workspaceId, opaqueObjectId, format: 'pdf' });
const bytes = new TextEncoder().encode('private bytes');
const makeExpectation = async () => ({ organizationId, workspaceId, objectKey, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes), mimeType: 'application/pdf' });
const storageError = (code: string) => (error: unknown) => error instanceof StudioStorageError && error.code === code;

void test('storage object keys are opaque and organization/workspace scoped', () => {
  assert.equal(objectKey, `${organizationId}/${workspaceId}/studio-artifacts/${opaqueObjectId}.pdf`);
  assert.doesNotMatch(objectKey, /customer|title|email/iu);
});
void test('storage object key builder rejects invalid opaque and tenant identifiers', () => {
  assert.throws(() => buildStudioPrivateArtifactObjectKey({ organizationId, workspaceId, opaqueObjectId: '../escape', format: 'pdf' }), storageError('INVALID_OBJECT_KEY'));
  assert.throws(() => buildStudioPrivateArtifactObjectKey({ organizationId: 'foreign', workspaceId, opaqueObjectId, format: 'pdf' }), storageError('INVALID_OBJECT_KEY'));
});
void test('fake storage create-only upload verifies exact bytes and hash', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  const result = await storage.uploadCreateOnly({ ...expected, bytes });
  assert.deepEqual(result, { status: 'verified', byteLength: bytes.byteLength, sha256: expected.sha256, mimeType: expected.mimeType });
  assert.equal(storage.operationCounts.upload, 1);
});
void test('fake storage rejects duplicate object keys without overwrite', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  await storage.uploadCreateOnly({ ...expected, bytes });
  await assert.rejects(() => storage.uploadCreateOnly({ ...expected, bytes }), storageError('DUPLICATE_OBJECT'));
  assert.equal((await storage.probeExact(expected)).status, 'verified');
});
void test('fake storage rejects caller hash and size mismatches', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  await assert.rejects(() => storage.uploadCreateOnly({ ...expected, byteLength: expected.byteLength + 1, bytes }), storageError('OBJECT_MISMATCH'));
  await assert.rejects(() => storage.uploadCreateOnly({ ...expected, sha256: '0'.repeat(64), bytes }), storageError('OBJECT_MISMATCH'));
});
void test('fake storage exact readback detects corruption', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  await storage.uploadCreateOnly({ ...expected, bytes });
  storage.corruptObjectForTest(objectKey);
  await assert.rejects(() => storage.probeExact(expected), storageError('OBJECT_MISMATCH'));
});
void test('fake storage reports missing objects unambiguously', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  assert.deepEqual(await storage.probeExact(await makeExpectation()), { status: 'missing' });
});
void test('fake storage deletion distinguishes success and missing', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  await storage.uploadCreateOnly({ ...expected, bytes });
  assert.deepEqual(await storage.deleteExact(expected), { status: 'deleted' });
  assert.deepEqual(await storage.deleteExact(expected), { status: 'missing' });
});
void test('fake storage provider failures never claim success', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  storage.failNextUpload();
  await assert.rejects(() => storage.uploadCreateOnly({ ...expected, bytes }), storageError('UPLOAD_FAILED'));
  storage.failNextDelete();
  await assert.rejects(() => storage.deleteExact(expected), storageError('DELETE_FAILED'));
});
void test('storage adapter fails closed without explicit private allowlisted bucket config', () => {
  assert.throws(() => createStudioPrivateArtifactStorage({ supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only' }), /Storage configuration is invalid/u);
  assert.throws(() => createStudioPrivateArtifactStorage({ supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'public', configuredBucketAllowlist: 'studio-private' }), /Storage configuration is invalid/u);
});
void test('alternate Studio bucket and allowlist fail before any provider request', () => {
  let providerRequests = 0;
  assert.throws(() => createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only',
    configuredBucket: 'studio-private-archive', configuredBucketAllowlist: 'studio-private-archive',
    fetch: (async () => { providerRequests += 1; return new Response(); }) as typeof fetch,
  }), /Storage configuration is invalid/u);
  assert.throws(() => createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only',
    configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts,studio-private-archive',
    fetch: (async () => { providerRequests += 1; return new Response(); }) as typeof fetch,
  }), /Storage configuration is invalid/u);
  assert.equal(providerRequests, 0);
});
void test('HTTP storage upload is create-only, redirect-safe, and readback verified', async () => {
  const expected = await makeExpectation();
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const responses = [
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response(bytes, { status: 200, headers: { 'content-type': expected.mimeType, 'content-length': String(bytes.byteLength) } }),
  ];
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only',
    configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async (url, init) => { calls.push([url, init]); return responses.shift()!; }) as typeof fetch,
  });
  await storage.uploadCreateOnly({ ...expected, bytes });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1]?.method, 'POST');
  assert.equal(calls[0][1]?.redirect, 'error');
  assert.equal((calls[0][1]?.headers as Record<string, string>)['x-upsert'], 'false');
  assert.equal(calls[1][1]?.method, 'GET');
  assert.equal(calls[1][1]?.redirect, 'error');
  assert.equal((calls[1][1]?.headers as Record<string, string>)['Accept-Encoding'], 'identity');
});
void test('HTTP storage maps provider conflict to duplicate without details', async () => {
  const expected = await makeExpectation();
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async () => new Response('provider path detail', { status: 409 })) as typeof fetch,
  });
  await assert.rejects(() => storage.uploadCreateOnly({ ...expected, bytes }), (error: unknown) => error instanceof Error && error.message === 'DUPLICATE_OBJECT' && !error.message.includes(objectKey));
});
void test('HTTP storage bounds readback by exact expected byte length', async () => {
  const expected = await makeExpectation();
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async () => new Response(new Uint8Array(bytes.byteLength + 1), { status: 200, headers: { 'content-type': expected.mimeType, 'content-length': String(bytes.byteLength + 1) } })) as typeof fetch,
  });
  await assert.rejects(() => storage.probeExact(expected), storageError('READBACK_OVERSIZED'));
});
void test('HTTP storage verifies MIME as well as exact size and hash', async () => {
  const expected = await makeExpectation();
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/plain', 'content-length': String(bytes.byteLength) } })) as typeof fetch,
  });
  await assert.rejects(() => storage.probeExact(expected), storageError('OBJECT_MISMATCH'));
});
void test('HTTP deletion uses exact prefix and distinguishes deleted from missing', async () => {
  const expected = await makeExpectation();
  const calls: RequestInit[] = [];
  const responses = [new Response(JSON.stringify([{ name: objectKey, bucket_id: 'studio-private-artifacts' }]), { status: 200 }), new Response('[]', { status: 200 })];
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async (_url, init) => { calls.push(init!); return responses.shift()!; }) as typeof fetch,
  });
  assert.deepEqual(await storage.deleteExact(expected), { status: 'deleted' });
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].body, JSON.stringify({ prefixes: [objectKey] }));
  assert.deepEqual(await storage.deleteExact(expected), { status: 'missing' });
});
void test('HTTP deletion rejects ambiguous or malformed provider responses', async () => {
  const expected = await makeExpectation();
  for (const response of [new Response('{}', { status: 200 }), new Response(JSON.stringify([{ name: 'other' }]), { status: 200 }), new Response('detail', { status: 500 })]) {
    const storage = createStudioPrivateArtifactStorage({
      supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
      fetch: (async () => response) as typeof fetch,
    });
    await assert.rejects(() => storage.deleteExact(expected), storageError('DELETE_FAILED'));
  }
});

void test('fake storage broker download returns an isolated exact byte copy', async () => {
  const storage = new DeterministicFakeStudioPrivateArtifactStorage();
  const expected = await makeExpectation();
  await storage.uploadCreateOnly({ ...expected, bytes });
  const downloaded = await storage.downloadExact(expected);
  assert.deepEqual(downloaded, bytes);
  downloaded[0] ^= 0xff;
  assert.deepEqual(await storage.downloadExact(expected), bytes);
});
void test('HTTP broker download uses one bounded verified GET and returns no URL', async () => {
  const expected = await makeExpectation();
  let calls = 0;
  const storage = createStudioPrivateArtifactStorage({
    supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', configuredBucket: 'studio-private-artifacts', configuredBucketAllowlist: 'studio-private-artifacts',
    fetch: (async () => { calls += 1; return new Response(bytes, { status: 200, headers: { 'content-type': expected.mimeType, 'content-length': String(bytes.byteLength) } }); }) as typeof fetch,
  });
  assert.deepEqual(await storage.downloadExact(expected), bytes);
  assert.equal(calls, 1);
});
