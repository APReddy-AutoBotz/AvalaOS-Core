export const DEFAULT_SOURCE_UPLOADS_BUCKET = 'source-uploads';

export const STORAGE_CONFIGURATION_ERROR = 'Storage configuration is invalid.';
export const STORAGE_PATH_INVALID_ERROR = 'Invalid storage path.';
export const STORAGE_PATH_SCOPE_ERROR = 'Storage path is not scoped to the organization.';

const bucketNamePattern = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/;
const organizationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenPathCharacterPattern = /[%\\:?#\u0000-\u001f\u007f\u2044\u2215\u29f8\uff0f]/u;

const configurationError = (): never => {
  throw new Error(STORAGE_CONFIGURATION_ERROR);
};

const pathError = (): never => {
  throw new Error(STORAGE_PATH_INVALID_ERROR);
};

export const assertStorageBucketName = (bucket: string) => {
  if (!bucket || bucket !== bucket.trim() || !bucketNamePattern.test(bucket)) {
    configurationError();
  }
};

const selectAllowlistedBucket = (
  configuredBucket: string,
  configuredAllowlist: string,
) => {
  const allowedBuckets = configuredAllowlist.split(',');

  if (!allowedBuckets.length || allowedBuckets.length > 16) configurationError();
  for (const allowedBucket of allowedBuckets) assertStorageBucketName(allowedBucket);
  assertStorageBucketName(configuredBucket);

  if (!new Set(allowedBuckets).has(configuredBucket)) configurationError();
  return configuredBucket;
};

export const selectSourceUploadsBucket = (
  configuredBucket?: string,
  configuredAllowlist?: string,
) => selectAllowlistedBucket(
  configuredBucket ?? DEFAULT_SOURCE_UPLOADS_BUCKET,
  configuredAllowlist ?? DEFAULT_SOURCE_UPLOADS_BUCKET,
);

export const selectExportsBucket = (
  configuredBucket?: string,
  configuredAllowlist?: string,
) => {
  if (configuredBucket === undefined || configuredAllowlist === undefined) {
    configurationError();
  }
  return selectAllowlistedBucket(configuredBucket, configuredAllowlist);
};

export const assertCanonicalStoragePath = (storagePath: string) => {
  if (
    !storagePath ||
    storagePath.length > 1024 ||
    storagePath !== storagePath.trim() ||
    storagePath.normalize('NFC') !== storagePath ||
    forbiddenPathCharacterPattern.test(storagePath)
  ) {
    pathError();
  }

  const segments = storagePath.split('/');
  if (
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    pathError();
  }
};

export const assertTenantStoragePath = (orgId: string, storagePath: string) => {
  if (!organizationIdPattern.test(orgId)) pathError();
  assertCanonicalStoragePath(storagePath);

  const [tenantSegment] = storagePath.split('/');
  if (tenantSegment !== orgId) {
    throw new Error(STORAGE_PATH_SCOPE_ERROR);
  }
};

const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname === '::1';

const canonicalSupabaseOrigin = (supabaseUrl: string) => {
  if (!supabaseUrl || supabaseUrl !== supabaseUrl.trim()) configurationError();

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    configurationError();
  }

  if (
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)))
  ) {
    configurationError();
  }

  return parsed.origin;
};

export const encodeStoragePath = (storagePath: string) => {
  assertCanonicalStoragePath(storagePath);
  return storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
};

export const buildStorageObjectUrl = (
  supabaseUrl: string,
  bucket: string,
  storagePath: string,
) => {
  const origin = canonicalSupabaseOrigin(supabaseUrl);
  assertStorageBucketName(bucket);
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = encodeStoragePath(storagePath);
  const routePrefix = `/storage/v1/object/${encodedBucket}/`;
  const objectUrl = new URL(`${routePrefix}${encodedPath}`, `${origin}/`);

  if (objectUrl.origin !== origin || !objectUrl.pathname.startsWith(routePrefix)) {
    configurationError();
  }

  return objectUrl.toString();
};
