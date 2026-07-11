import { supabaseEnv } from './supabase.ts';
import {
  assertTenantStoragePath,
  buildStorageObjectUrl,
  selectSourceUploadsBucket,
} from './storageBoundary.ts';

export { assertTenantStoragePath } from './storageBoundary.ts';

export const resolveSourceUploadsBucket = () => selectSourceUploadsBucket(
  Deno.env.get('SOURCE_UPLOADS_BUCKET'),
  Deno.env.get('SOURCE_UPLOADS_BUCKET_ALLOWLIST'),
);

export const prepareTextArtifact = (input: {
  orgId: string;
  bucket: string;
  artifactType: string;
  extension: string;
}) => {
  const artifactId = crypto.randomUUID();
  const safeType = input.artifactType.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const path = `${input.orgId}/${safeType}/${artifactId}.${input.extension}`;
  assertTenantStoragePath(input.orgId, path);
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

export const removeTextArtifact = async (
  artifact: { artifactId: string; bucket: string; path: string },
  orgId: string,
) => {
  const { url, serviceRoleKey } = supabaseEnv();
  assertTenantStoragePath(orgId, artifact.path);
  const response = await fetch(buildStorageObjectUrl(url, artifact.bucket, artifact.path), {
    method: 'DELETE',
    redirect: 'error',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok && response.status !== 404) throw new Error('Storage compensation failed.');
};

export const downloadStoredFile = async (input: {
  orgId: string;
  bucket: string;
  storagePath: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  assertTenantStoragePath(input.orgId, input.storagePath);
  const response = await fetch(buildStorageObjectUrl(url, input.bucket, input.storagePath), {
    method: 'GET',
    redirect: 'error',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error('Storage download failed.');
  return response.blob();
};
