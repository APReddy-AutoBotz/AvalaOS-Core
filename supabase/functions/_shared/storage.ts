import { supabaseEnv } from './supabase.ts';

const encodeStoragePath = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export const assertTenantStoragePath = (orgId: string, storagePath: string) => {
  if (!storagePath || storagePath.includes('..') || storagePath.startsWith('/') || /^https?:\/\//i.test(storagePath)) {
    throw new Error('Invalid storage path.');
  }
  if (!storagePath.startsWith(`${orgId}/`)) {
    throw new Error('Storage path is not scoped to the organization.');
  }
};

export const uploadTextArtifact = async (input: {
  orgId: string;
  artifactType: string;
  extension: string;
  contentType: string;
  content: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  const bucket = Deno.env.get('EXPORTS_BUCKET') || 'klarity-exports';
  const artifactId = crypto.randomUUID();
  const safeType = input.artifactType.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const path = `${input.orgId}/${safeType}/${artifactId}.${input.extension}`;

  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': input.contentType,
      'x-upsert': 'true',
    },
    body: input.content,
  });

  if (!response.ok) {
    throw new Error(`Storage upload failed (${response.status}). Confirm the ${bucket} bucket exists and is private.`);
  }

  return {
    artifactId,
    bucket,
    path,
  };
};

export const downloadStoredFile = async (input: {
  bucket: string;
  storagePath: string;
}) => {
  const { url, serviceRoleKey } = supabaseEnv();
  const response = await fetch(`${url}/storage/v1/object/${input.bucket}/${encodeStoragePath(input.storagePath)}`, {
    method: 'GET',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Storage download failed (${response.status}).`);
  }

  return response.blob();
};
