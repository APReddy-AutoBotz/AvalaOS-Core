import {
  assertWorkspaceStoragePath,
  buildStorageObjectUrl,
  buildStorageRemovalUrl,
  selectStudioPrivateArtifactsBucket,
} from './storageBoundary.ts';
import { sha256Hex, type StudioRenditionFormat } from './studioPrivateArtifactRenderer.ts';

export type StudioStoredObjectExpectation = Readonly<{
  organizationId: string;
  workspaceId: string;
  objectKey: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
}>;
export type StudioStorageVerification = Readonly<{
  status: 'verified';
  byteLength: number;
  sha256: string;
  mimeType: string;
}>;
export type StudioStorageProbe = { status: 'missing' } | StudioStorageVerification;
export type StudioStorageDeleteResult = Readonly<{ status: 'deleted' | 'missing' }>;

export interface StudioPrivateArtifactStorage {
  uploadCreateOnly(input: StudioStoredObjectExpectation & { bytes: Uint8Array }): Promise<StudioStorageVerification>;
  probeExact(input: StudioStoredObjectExpectation): Promise<StudioStorageProbe>;
  downloadExact(input: StudioStoredObjectExpectation): Promise<Uint8Array>;
  deleteExact(input: Pick<StudioStoredObjectExpectation, 'organizationId' | 'workspaceId' | 'objectKey'>): Promise<StudioStorageDeleteResult>;
}

export type StudioStorageErrorCode =
  | 'INVALID_OBJECT_KEY'
  | 'DUPLICATE_OBJECT'
  | 'UPLOAD_FAILED'
  | 'READBACK_FAILED'
  | 'READBACK_OVERSIZED'
  | 'OBJECT_MISMATCH'
  | 'DELETE_FAILED';
export class StudioStorageError extends Error {
  constructor(readonly code: StudioStorageErrorCode) {
    super(code);
    this.name = 'StudioStorageError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
const extensions: Record<StudioRenditionFormat, string> = { markdown: 'md', pdf: 'pdf', docx: 'docx' };
const MAX_READBACK_BYTES = 5_000_000;

export const buildStudioPrivateArtifactObjectKey = (input: {
  organizationId: string;
  workspaceId: string;
  opaqueObjectId: string;
  format: StudioRenditionFormat;
}) => {
  if (!uuid.test(input.opaqueObjectId)) throw new StudioStorageError('INVALID_OBJECT_KEY');
  const objectKey = `${input.organizationId}/${input.workspaceId}/studio-artifacts/${input.opaqueObjectId}.${extensions[input.format]}`;
  try {
    assertWorkspaceStoragePath(input.organizationId, input.workspaceId, objectKey);
  } catch {
    throw new StudioStorageError('INVALID_OBJECT_KEY');
  }
  return objectKey;
};

const assertExpectation = (input: StudioStoredObjectExpectation) => {
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > MAX_READBACK_BYTES ||
      !hash.test(input.sha256) || !input.mimeType || input.mimeType.length > 160) {
    throw new StudioStorageError('OBJECT_MISMATCH');
  }
  try {
    assertWorkspaceStoragePath(input.organizationId, input.workspaceId, input.objectKey);
  } catch {
    throw new StudioStorageError('INVALID_OBJECT_KEY');
  }
};

const authHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
});

const readBounded = async (response: Response, limit: number) => {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limit)) {
    throw new StudioStorageError('READBACK_OVERSIZED');
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) throw new StudioStorageError('READBACK_OVERSIZED');
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new StudioStorageError('READBACK_OVERSIZED');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof StudioStorageError) throw error;
    throw new StudioStorageError('READBACK_FAILED');
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
};

export const createStudioPrivateArtifactStorage = (config: Readonly<{
  supabaseUrl: string;
  serviceRoleKey: string;
  configuredBucket?: string;
  configuredBucketAllowlist?: string;
  fetch?: typeof globalThis.fetch;
}>): StudioPrivateArtifactStorage => {
  if (!config.serviceRoleKey) throw new StudioStorageError('UPLOAD_FAILED');
  const bucket = selectStudioPrivateArtifactsBucket(config.configuredBucket, config.configuredBucketAllowlist);
  const request = config.fetch ?? globalThis.fetch;

  const fetchExact = async (input: StudioStoredObjectExpectation): Promise<{ verification: StudioStorageProbe; bytes?: Uint8Array }> => {
    assertExpectation(input);
    let response: Response;
    try {
      response = await request(buildStorageObjectUrl(config.supabaseUrl, bucket, input.objectKey), {
        method: 'GET',
        redirect: 'error',
        headers: { ...authHeaders(config.serviceRoleKey), 'Accept-Encoding': 'identity' },
      });
    } catch {
      throw new StudioStorageError('READBACK_FAILED');
    }
    if (response.status === 404) return { verification: { status: 'missing' } };
    if (!response.ok) throw new StudioStorageError('READBACK_FAILED');
    const responseMime = response.headers.get('content-type');
    const bytes = await readBounded(response, input.byteLength);
    const actualHash = await sha256Hex(bytes);
    if (bytes.byteLength !== input.byteLength || actualHash !== input.sha256 || responseMime !== input.mimeType) {
      throw new StudioStorageError('OBJECT_MISMATCH');
    }
    return { verification: { status: 'verified', byteLength: bytes.byteLength, sha256: actualHash, mimeType: responseMime }, bytes };
  };
  const probeExact = async (input: StudioStoredObjectExpectation) => (await fetchExact(input)).verification;
  const downloadExact = async (input: StudioStoredObjectExpectation) => {
    const result = await fetchExact(input); if (!result.bytes) throw new StudioStorageError('READBACK_FAILED'); return result.bytes;
  };

  return {
    async uploadCreateOnly(input) {
      assertExpectation(input);
      if (input.bytes.byteLength !== input.byteLength || await sha256Hex(input.bytes) !== input.sha256) {
        throw new StudioStorageError('OBJECT_MISMATCH');
      }
      let response: Response;
      try {
        response = await request(buildStorageObjectUrl(config.supabaseUrl, bucket, input.objectKey), {
          method: 'POST',
          redirect: 'error',
          headers: {
            ...authHeaders(config.serviceRoleKey),
            'Content-Type': input.mimeType,
            'x-upsert': 'false',
          },
          body: input.bytes,
        });
      } catch {
        throw new StudioStorageError('UPLOAD_FAILED');
      }
      if (response.status === 409) throw new StudioStorageError('DUPLICATE_OBJECT');
      if (!response.ok) throw new StudioStorageError('UPLOAD_FAILED');
      const verified = await probeExact(input);
      if (verified.status !== 'verified') throw new StudioStorageError('OBJECT_MISMATCH');
      return verified;
    },
    probeExact,
    downloadExact,
    async deleteExact(input) {
      try {
        assertWorkspaceStoragePath(input.organizationId, input.workspaceId, input.objectKey);
      } catch {
        throw new StudioStorageError('INVALID_OBJECT_KEY');
      }
      let response: Response;
      try {
        response = await request(buildStorageRemovalUrl(config.supabaseUrl, bucket), {
          method: 'DELETE',
          redirect: 'error',
          headers: { ...authHeaders(config.serviceRoleKey), 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [input.objectKey] }),
        });
      } catch {
        throw new StudioStorageError('DELETE_FAILED');
      }
      if (response.status === 404) return { status: 'missing' };
      if (!response.ok) throw new StudioStorageError('DELETE_FAILED');
      let body: unknown;
      try { body = await response.json(); } catch { throw new StudioStorageError('DELETE_FAILED'); }
      if (!Array.isArray(body)) throw new StudioStorageError('DELETE_FAILED');
      if (body.length === 0) return { status: 'missing' };
      if (!body.every((entry) => typeof entry === 'object' && entry !== null &&
          'name' in entry && entry.name === input.objectKey &&
          (!('bucket_id' in entry) || entry.bucket_id === bucket))) {
        throw new StudioStorageError('DELETE_FAILED');
      }
      return { status: 'deleted' };
    },
  };
};

type FakeObject = { bytes: Uint8Array; sha256: string; mimeType: string };
export class DeterministicFakeStudioPrivateArtifactStorage implements StudioPrivateArtifactStorage {
  readonly operationCounts = { upload: 0, probe: 0, download: 0, delete: 0 };
  private readonly objects = new Map<string, FakeObject>();
  private nextUploadFailure = false;
  private nextProbeFailure = false;
  private nextDeleteFailure = false;

  failNextUpload() { this.nextUploadFailure = true; }
  failNextProbe() { this.nextProbeFailure = true; }
  failNextDelete() { this.nextDeleteFailure = true; }
  hasObjectForTest(objectKey: string) { return this.objects.has(objectKey); }
  removeObjectForTest(objectKey: string) { this.objects.delete(objectKey); }
  corruptObjectForTest(objectKey: string) {
    const existing = this.objects.get(objectKey);
    if (existing) this.objects.set(objectKey, { ...existing, bytes: new Uint8Array([0]) });
  }

  async uploadCreateOnly(input: StudioStoredObjectExpectation & { bytes: Uint8Array }) {
    this.operationCounts.upload += 1;
    assertExpectation(input);
    if (this.nextUploadFailure) { this.nextUploadFailure = false; throw new StudioStorageError('UPLOAD_FAILED'); }
    if (this.objects.has(input.objectKey)) throw new StudioStorageError('DUPLICATE_OBJECT');
    if (input.bytes.byteLength !== input.byteLength || await sha256Hex(input.bytes) !== input.sha256) throw new StudioStorageError('OBJECT_MISMATCH');
    this.objects.set(input.objectKey, { bytes: input.bytes.slice(), sha256: input.sha256, mimeType: input.mimeType });
    return { status: 'verified' as const, byteLength: input.byteLength, sha256: input.sha256, mimeType: input.mimeType };
  }

  async probeExact(input: StudioStoredObjectExpectation): Promise<StudioStorageProbe> {
    this.operationCounts.probe += 1;
    assertExpectation(input);
    if (this.nextProbeFailure) { this.nextProbeFailure = false; throw new StudioStorageError('READBACK_FAILED'); }
    const object = this.objects.get(input.objectKey);
    if (!object) return { status: 'missing' };
    const actualHash = await sha256Hex(object.bytes);
    if (object.bytes.byteLength !== input.byteLength || actualHash !== input.sha256 || object.mimeType !== input.mimeType) throw new StudioStorageError('OBJECT_MISMATCH');
    return { status: 'verified', byteLength: object.bytes.byteLength, sha256: actualHash, mimeType: object.mimeType };
  }


  async downloadExact(input: StudioStoredObjectExpectation) {
    this.operationCounts.download += 1;
    const verification = await this.probeExact(input);
    if (verification.status === 'missing') throw new StudioStorageError('READBACK_FAILED');
    return this.objects.get(input.objectKey)!.bytes.slice();
  }
  async deleteExact(input: Pick<StudioStoredObjectExpectation, 'organizationId' | 'workspaceId' | 'objectKey'>) {
    this.operationCounts.delete += 1;
    try { assertWorkspaceStoragePath(input.organizationId, input.workspaceId, input.objectKey); } catch { throw new StudioStorageError('INVALID_OBJECT_KEY'); }
    if (this.nextDeleteFailure) { this.nextDeleteFailure = false; throw new StudioStorageError('DELETE_FAILED'); }
    if (!this.objects.delete(input.objectKey)) return { status: 'missing' as const };
    return { status: 'deleted' as const };
  }
}
