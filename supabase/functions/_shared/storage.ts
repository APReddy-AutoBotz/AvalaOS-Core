declare const Deno: { env: { get: (key: string) => string | undefined } };
import { supabaseEnv } from './supabase.ts';
import {
  assertTenantStoragePath,
  assertWorkspaceStoragePath,
  buildStorageObjectUrl,
  buildStorageRemovalUrl,
  EVIDENCE_SOURCE_BUCKET,
  selectSourceUploadsBucket,
} from './storageBoundary.ts';

export { assertTenantStoragePath } from './storageBoundary.ts';

export const STORAGE_EXTERNAL_OPERATION_TIMEOUT_MS = 15_000;

export class StorageArtifactError extends Error {
  constructor(public readonly code: 'CONFLICT' | 'UNCERTAIN') {
    super(code);
    this.name = 'StorageArtifactError';
  }
}

const fetchStorageWithDeadline = async (
  input: string,
  init: RequestInit,
  timeoutMs = STORAGE_EXTERNAL_OPERATION_TIMEOUT_MS,
) => {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    // Awaiting fetch after abort is the settlement boundary: ownership must not
    // be released while the external request can still be executing.
    throw new StorageArtifactError('UNCERTAIN');
  } finally {
    clearTimeout(deadline);
  }
};

export const resolveSourceUploadsBucket = (): typeof EVIDENCE_SOURCE_BUCKET => selectSourceUploadsBucket(
  Deno.env.get('SOURCE_UPLOADS_BUCKET'),
  Deno.env.get('SOURCE_UPLOADS_BUCKET_ALLOWLIST'),
);

export const assertSourceUploadsBucket = (bucket: string) => {
  resolveSourceUploadsBucket();
  if (bucket !== EVIDENCE_SOURCE_BUCKET) throw new Error('Source uploads bucket is not server-authorized.');
  return EVIDENCE_SOURCE_BUCKET;
};

export const prepareTextArtifact = (input: {
  orgId: string;
  workspaceId?: string;
  bucket: string;
  artifactType: string;
  extension: string;
  artifactId?: string;
}) => {
  const artifactId = input.artifactId || crypto.randomUUID();
  const safeType = input.artifactType.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const path = input.workspaceId
    ? `${input.orgId}/${input.workspaceId}/${safeType}/${artifactId}.${input.extension}`
    : `${input.orgId}/${safeType}/${artifactId}.${input.extension}`;
  if (input.workspaceId) assertWorkspaceStoragePath(input.orgId, input.workspaceId, path);
  else assertTenantStoragePath(input.orgId, path);
  return { artifactId, bucket: input.bucket, path };
};

export const uploadTextArtifact = async (input: {
  artifact: { artifactId: string; bucket: string; path: string };
  orgId: string;
  contentType: string;
  content: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  assertTenantStoragePath(input.orgId, input.artifact.path);
  const response = await fetch(buildStorageObjectUrl(url, input.artifact.bucket, input.artifact.path), {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': input.contentType,
      'x-upsert': 'false',
    },
    body: input.content,
  });
  if (!response.ok) throw new Error('Storage upload failed.');
  return input.artifact;
};

export const uploadBinaryArtifact = async (input: {
  artifact: { artifactId: string; bucket: string; path: string };
  orgId: string;
  workspaceId?: string;
  contentType: string;
  content: Uint8Array;
  timeoutMs?: number;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  if (input.artifact.bucket === resolveSourceUploadsBucket()) assertSourceUploadsBucket(input.artifact.bucket);
  if (input.workspaceId) assertWorkspaceStoragePath(input.orgId, input.workspaceId, input.artifact.path);
  else assertTenantStoragePath(input.orgId, input.artifact.path);
  const response = await fetchStorageWithDeadline(buildStorageObjectUrl(url, input.artifact.bucket, input.artifact.path), {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': input.contentType,
      'x-upsert': 'false',
    },
    body: input.content,
  }, input.timeoutMs);
  if (await isStorageConflictResponse(response)) throw new StorageArtifactError('CONFLICT');
  if (!response.ok) throw new StorageArtifactError('UNCERTAIN');
  return input.artifact;
};

const readBoundedStorageResponse = async (response: Response, maximumBytes: number) => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) return null;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= maximumBytes ? bytes : null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.length;
    if (length > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const readStorageErrorIdentity = async (response: Response) => {
  if (response.ok) return null;
  const bytes = await readBoundedStorageResponse(response, 4_096);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const error = value as Record<string, unknown>;
    return {
      statusCode: typeof error.statusCode === 'number' || typeof error.statusCode === 'string'
        ? String(error.statusCode)
        : '',
      error: typeof error.error === 'string' ? error.error : '',
    };
  } catch {
    return null;
  }
};

const isStorageConflictResponse = async (response: Response) => {
  if (response.status === 409) return true;
  if (response.status !== 400) return false;
  const identity = await readStorageErrorIdentity(response);
  return identity?.statusCode === '409'
    && (identity.error === 'Duplicate' || identity.error === 'Conflict');
};

const isStorageMissingResponse = async (response: Response) => {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  const identity = await readStorageErrorIdentity(response);
  return identity?.statusCode === '404';
};

export const inspectBinaryArtifact = async (input: {
  orgId: string;
  workspaceId?: string;
  bucket: string;
  storagePath: string;
  maximumBytes: number;
  timeoutMs?: number;
}): Promise<{ state: 'absent' } | { state: 'present'; content: Uint8Array | null }> => {
  const { url, serviceRoleKey } = supabaseEnv();
  if (input.bucket === resolveSourceUploadsBucket()) assertSourceUploadsBucket(input.bucket);
  if (input.workspaceId) assertWorkspaceStoragePath(input.orgId, input.workspaceId, input.storagePath);
  else assertTenantStoragePath(input.orgId, input.storagePath);
  const response = await fetchStorageWithDeadline(buildStorageObjectUrl(url, input.bucket, input.storagePath), {
    method: 'GET',
    redirect: 'error',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  }, input.timeoutMs);
  // Supabase Storage can wrap its canonical 404 identity in an HTTP 400.
  // Other 400 responses remain uncertain and never authorize a write.
  if (await isStorageMissingResponse(response)) return { state: 'absent' };
  if (!response.ok) throw new StorageArtifactError('UNCERTAIN');
  return { state: 'present', content: await readBoundedStorageResponse(response, input.maximumBytes) };
};

export const removeTextArtifact = async (
  artifact: { artifactId: string; bucket: string; path: string },
  orgId: string,
  workspaceId?: string,
) => {
  const { url, serviceRoleKey } = supabaseEnv();
  if (workspaceId) assertWorkspaceStoragePath(orgId, workspaceId, artifact.path);
  else assertTenantStoragePath(orgId, artifact.path);
  const response = await fetch(buildStorageRemovalUrl(url, artifact.bucket), {
    method: 'DELETE',
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [artifact.path] }),
  });
  if (!response.ok) throw new Error('Storage compensation failed.');
  let removed: unknown;
  try {
    removed = await response.json();
  } catch {
    throw new Error('Storage compensation failed.');
  }
  if (!Array.isArray(removed)) throw new Error('Storage compensation failed.');
  if (removed.length === 0) return;
  if (!removed.every((entry) => (
    typeof entry === 'object' && entry !== null &&
    'name' in entry && typeof entry.name === 'string' &&
    (!('bucket_id' in entry) || (
      typeof entry.bucket_id === 'string' && entry.bucket_id === artifact.bucket
    ))
  ))) throw new Error('Storage compensation failed.');
  if (!removed.some((entry) => entry.name === artifact.path)) {
    throw new Error('Storage compensation failed.');
  }
};

export const downloadStoredFile = async (input: {
  orgId: string;
  workspaceId?: string;
  bucket: string;
  storagePath: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  if (input.bucket === resolveSourceUploadsBucket()) assertSourceUploadsBucket(input.bucket);
  if (input.workspaceId) assertWorkspaceStoragePath(input.orgId, input.workspaceId, input.storagePath);
  else assertTenantStoragePath(input.orgId, input.storagePath);
  const response = await fetch(buildStorageObjectUrl(url, input.bucket, input.storagePath), {
    method: 'GET',
    redirect: 'error',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error('Storage download failed.');
  return response.blob();
};
