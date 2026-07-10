import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_SOURCE_UPLOADS_BUCKET,
  STORAGE_CONFIGURATION_ERROR,
  STORAGE_PATH_INVALID_ERROR,
  STORAGE_PATH_SCOPE_ERROR,
  assertTenantStoragePath,
  buildStorageObjectUrl,
  selectSourceUploadsBucket,
} from './storageBoundary';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrgId = '22222222-2222-4222-8222-222222222222';

const assertErrorMessage = (operation: () => unknown, expectedMessage: string) => {
  assert.throws(operation, (error: unknown) => (
    error instanceof Error && error.message === expectedMessage
  ));
};

const main = () => {
  assert.equal(selectSourceUploadsBucket(), DEFAULT_SOURCE_UPLOADS_BUCKET);
  assert.equal(
    selectSourceUploadsBucket('tenant-source', 'source-uploads,tenant-source'),
    'tenant-source',
  );

  for (const [bucket, allowlist] of [
    ['attacker-bucket', 'source-uploads'],
    ['source-uploads/escape', 'source-uploads/escape'],
    ['https://attacker.invalid', 'https://attacker.invalid'],
    [' source-uploads', ' source-uploads'],
    ['', 'source-uploads'],
  ]) {
    assertErrorMessage(
      () => selectSourceUploadsBucket(bucket, allowlist),
      STORAGE_CONFIGURATION_ERROR,
    );
  }

  const validPath = `${orgId}/incoming/Quarterly report.md`;
  assert.doesNotThrow(() => assertTenantStoragePath(orgId, validPath));

  const invalidPaths = [
    '',
    `${orgId}`,
    `/${orgId}/document.txt`,
    `${orgId}/document.txt/`,
    `${orgId}//document.txt`,
    `${orgId}/./document.txt`,
    `${orgId}/../document.txt`,
    `${orgId}/%2e%2e/document.txt`,
    `${orgId}/%252e%252e/document.txt`,
    `${orgId}/%2f/document.txt`,
    `${orgId}\\document.txt`,
    `${orgId}/https://attacker.invalid/document.txt`,
    `${orgId}/document.txt?download=1`,
    `${orgId}/document.txt#fragment`,
    `${orgId}/decomposed-e\u0301.txt`,
    `${orgId}/confusable\uff0fslash.txt`,
    `${orgId}/control\u0000.txt`,
    ` ${orgId}/document.txt`,
  ];

  for (const storagePath of invalidPaths) {
    assertErrorMessage(
      () => assertTenantStoragePath(orgId, storagePath),
      STORAGE_PATH_INVALID_ERROR,
    );
  }

  assertErrorMessage(
    () => assertTenantStoragePath(orgId, `${otherOrgId}/document.txt`),
    STORAGE_PATH_SCOPE_ERROR,
  );
  assertErrorMessage(
    () => assertTenantStoragePath(orgId, `${orgId}-other/document.txt`),
    STORAGE_PATH_SCOPE_ERROR,
  );

  assert.equal(
    buildStorageObjectUrl('https://example.supabase.co', 'source-uploads', validPath),
    `https://example.supabase.co/storage/v1/object/source-uploads/${orgId}/incoming/Quarterly%20report.md`,
  );
  assert.equal(
    buildStorageObjectUrl('http://127.0.0.1:54321', 'source-uploads', validPath),
    `http://127.0.0.1:54321/storage/v1/object/source-uploads/${orgId}/incoming/Quarterly%20report.md`,
  );

  for (const invalidBaseUrl of [
    'http://example.supabase.co',
    'ftp://example.supabase.co',
    'https://example.supabase.co/alternate',
    'https://example.supabase.co?redirect=1',
    'https://example.supabase.co#fragment',
    'https://user:password@example.supabase.co',
  ]) {
    assertErrorMessage(
      () => buildStorageObjectUrl(invalidBaseUrl, 'source-uploads', validPath),
      STORAGE_CONFIGURATION_ERROR,
    );
  }

  const functionSource = fs.readFileSync(
    'supabase/functions/extract-document-text/index.ts',
    'utf8',
  );
  assert.doesNotMatch(functionSource, /\bbody\.bucket\b/);
  assert.match(functionSource, /const bucket = resolveSourceUploadsBucket\(\);/);
  assert.match(functionSource, /downloadStoredFile\(\{ orgId, bucket, storagePath \}\)/);

  const storageSource = fs.readFileSync('supabase/functions/_shared/storage.ts', 'utf8');
  assert.match(storageSource, /redirect: 'error'/);
  assert.doesNotMatch(storageSource, /Storage download failed \(\$\{response\.status\}\)/);

  console.log('P0 Storage boundary regression suite passed.');
};

main();
