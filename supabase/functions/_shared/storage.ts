declare const Deno: { env: { get: (key: string) => string | undefined } };
import { supabaseEnv } from './supabase.ts';
import {
  assertTenantStoragePath,
  assertWorkspaceStoragePath,
  buildStorageObjectUrl,
  buildStorageRemovalUrl,
  selectSourceUploadsBucket,
} from './storageBoundary.ts';

export { assertTenantStoragePath } from './storageBoundary.ts';

export const resolveSourceUploadsBucket = () => selectSourceUploadsBucket(
  Deno.env.get('SOURCE_UPLOADS_BUCKET'),
  Deno.env.get('SOURCE_UPLOADS_BUCKET_ALLOWLIST'),
);

export const assertSourceUploadsBucket = (bucket: string) => {
  if (bucket !== resolveSourceUploadsBucket()) throw new Error('Source uploads bucket is not server-authorized.');
  return bucket;
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
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  if (input.artifact.bucket === resolveSourceUploadsBucket()) assertSourceUploadsBucket(input.artifact.bucket);
  if (input.workspaceId) assertWorkspaceStoragePath(input.orgId, input.workspaceId, input.artifact.path);
  else assertTenantStoragePath(input.orgId, input.artifact.path);
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
