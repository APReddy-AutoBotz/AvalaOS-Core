import { supabaseEnv } from './supabase.ts';
import {
  assertStorageBucketName,
  assertTenantStoragePath,
  buildStorageObjectUrl,
  selectSourceUploadsBucket,
} from './storageBoundary.ts';

export { assertTenantStoragePath } from './storageBoundary.ts';

export const resolveSourceUploadsBucket = () => selectSourceUploadsBucket(
  Deno.env.get('SOURCE_UPLOADS_BUCKET'),
  Deno.env.get('SOURCE_UPLOADS_BUCKET_ALLOWLIST'),
);

export const uploadTextArtifact = async (input: {
  orgId: string;
  artifactType: string;
  extension: string;
  contentType: string;
  content: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  const bucket = Deno.env.get('EXPORTS_BUCKET') || 'klarity-exports';
  assertStorageBucketName(bucket);
  const artifactId = crypto.randomUUID();
  const safeType = input.artifactType.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const path = `${input.orgId}/${safeType}/${artifactId}.${input.extension}`;

  const response = await fetch(buildStorageObjectUrl(url, bucket, path), {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': input.contentType,
      'x-upsert': 'true',
    },
    body: input.content,
  });

  if (!response.ok) {
    throw new Error('Storage upload failed.');
  }

  return {
    artifactId,
    bucket,
    path,
  };
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
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error('Storage download failed.');
  }

  return response.blob();
};
