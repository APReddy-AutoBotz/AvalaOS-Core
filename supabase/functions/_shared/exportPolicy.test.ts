import assert from 'node:assert/strict';
import {
  ExportAuthoritySnapshot,
  ExportControlError,
  ParsedExportRequest,
  assertExportAuthorized,
  parseDecisionPackExportRequest,
  parseDocumentExportRequest,
  resolveExportRuntimeConfig,
} from './exportPolicy.ts';

const orgId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';

const request: ParsedExportRequest = {
  organizationId: orgId,
  resourceId,
  version: 'v-7',
  exportType: 'json',
};

const snapshot = (): ExportAuthoritySnapshot<{ value: string }> => ({
  requestedOrganizationId: orgId,
  profileActive: true,
  organizationActive: true,
  organizationMembershipActive: true,
  organizationRolePermissions: ['docs.export'],
  workspaceActive: true,
  workspaceMembershipActive: true,
  workspaceRolePermissions: [],
  resource: {
    id: resourceId,
    orgId,
    workspaceId,
    status: 'generated',
    deletedAt: null,
    version: 'v-7',
    payload: { value: 'safe' },
  },
});

const assertControlError = (
  operation: () => unknown,
  code: ExportControlError['code'],
  status: number,
) => assert.throws(operation, (error: unknown) => (
  error instanceof ExportControlError && error.code === code && error.status === status
));

for (const config of [
  {},
  { enabled: 'false', bucket: 'exports', bucketAllowlist: 'exports' },
  { enabled: 'TRUE', bucket: 'exports', bucketAllowlist: 'exports' },
  { enabled: 'true', bucket: undefined, bucketAllowlist: 'exports' },
  { enabled: 'true', bucket: 'exports', bucketAllowlist: undefined },
  { enabled: 'true', bucket: 'attacker', bucketAllowlist: 'exports' },
  { enabled: 'true', bucket: 'https://invalid.example', bucketAllowlist: 'https://invalid.example' },
]) {
  assertControlError(() => resolveExportRuntimeConfig(config), 'EXPORT_DISABLED', 503);
}

assert.deepEqual(
  resolveExportRuntimeConfig({
    enabled: 'true',
    bucket: 'private-exports',
    bucketAllowlist: 'private-exports,archive-exports',
  }),
  { bucket: 'private-exports' },
);

assert.deepEqual(parseDocumentExportRequest({
  organizationId: orgId,
  documentId: resourceId,
  versionId: '2026-07-10T10:00:00.000Z',
  exportType: 'markdown',
}), {
  organizationId: orgId,
  resourceId,
  version: '2026-07-10T10:00:00.000Z',
  exportType: 'markdown',
});

assert.deepEqual(parseDecisionPackExportRequest({
  assessmentId: resourceId,
  scoreSetId: 'v1.0',
  exportType: 'json',
}), {
  organizationId: undefined,
  resourceId,
  version: 'v1.0',
  exportType: 'json',
});

for (const body of [
  null,
  [],
  {},
  { documentId: resourceId, versionId: 'v1', exportType: 'pdf' },
  { documentId: resourceId, exportType: 'json' },
  { documentId: 'not-a-uuid', versionId: 'v1', exportType: 'json' },
  { documentId: resourceId, versionId: ' v1', exportType: 'json' },
  { documentId: resourceId, versionId: 'v1', exportType: 'json', authority: 'admin' },
]) {
  assertControlError(() => parseDocumentExportRequest(body), 'INVALID_EXPORT_REQUEST', 400);
}

assert.deepEqual(
  assertExportAuthorized(request, snapshot(), ['generated']),
  snapshot().resource,
);

const deniedSnapshots: ExportAuthoritySnapshot<{ value: string }>[] = [];
for (const key of [
  'profileActive',
  'organizationActive',
  'organizationMembershipActive',
  'workspaceActive',
  'workspaceMembershipActive',
] as const) {
  deniedSnapshots.push({ ...snapshot(), [key]: false });
}
deniedSnapshots.push(
  { ...snapshot(), organizationRolePermissions: [], workspaceRolePermissions: [] },
  { ...snapshot(), requestedOrganizationId: '44444444-4444-4444-8444-444444444444' },
  {
    ...snapshot(),
    requestedOrganizationId: '44444444-4444-4444-8444-444444444444',
    resource: {
      ...snapshot().resource!,
      orgId: '44444444-4444-4444-8444-444444444444',
    },
  },
  { ...snapshot(), resource: null },
  { ...snapshot(), resource: { ...snapshot().resource!, orgId: '44444444-4444-4444-8444-444444444444' } },
  { ...snapshot(), resource: { ...snapshot().resource!, workspaceId: null } },
  { ...snapshot(), resource: { ...snapshot().resource!, deletedAt: '2026-07-10T00:00:00Z' } },
  { ...snapshot(), resource: { ...snapshot().resource!, status: 'archived' } },
  { ...snapshot(), resource: { ...snapshot().resource!, version: 'stale' } },
);

for (const denied of deniedSnapshots) {
  assertControlError(
    () => assertExportAuthorized(request, denied, ['generated']),
    'EXPORT_NOT_AVAILABLE',
    404,
  );
}

console.log('Edge export policy regression suite passed.');
