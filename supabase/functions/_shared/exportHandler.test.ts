import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeExport, ExportExecutionDependencies } from './exportHandler.ts';
import { ExportAuthoritySnapshot, ExportControlError, ParsedExportRequest } from './exportPolicy.ts';

type Payload = { title: string };

const orgId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

const request: ParsedExportRequest = {
  organizationId: orgId,
  resourceId,
  version: 'v1',
  exportType: 'json',
};

const authority = (): ExportAuthoritySnapshot<Payload> => ({
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
    version: 'v1',
    payload: { title: 'Authoritative' },
  },
});

const dependencies = (events: string[]): ExportExecutionDependencies<Payload> => ({
  authenticate: async () => {
    events.push('authenticate');
    return { id: userId };
  },
  loadAuthority: async () => {
    events.push('load-authority');
    return authority();
  },
  createRequiredAudit: async input => {
    events.push(`audit-create:${input.orgId}:${input.userId}`);
    return { id: 'audit-1' };
  },
  completeRequiredAudit: async (_jobId, status) => {
    events.push(`audit-complete:${status}`);
  },
  prepareArtifact: input => {
    events.push(`prepare:${input.bucket}`);
    return { artifactId: 'artifact-1', bucket: input.bucket, path: `${input.orgId}/artifact-1.json` };
  },
  render: payload => {
    events.push(`render:${payload.title}`);
    return JSON.stringify(payload);
  },
  upload: async input => {
    events.push(`upload:${input.artifact.bucket}`);
    return input.artifact;
  },
  remove: async artifact => {
    events.push(`remove:${artifact.path}`);
  },
});

const run = (deps: ExportExecutionDependencies<Payload>) => executeExport({
  request,
  runtimeConfig: {
    enabled: 'true',
    bucket: 'private-exports',
    bucketAllowlist: 'private-exports',
  },
  jobType: 'export_document',
  artifactType: 'generated-document',
  allowedStatuses: ['generated'],
  dependencies: deps,
});

const rejectsWith = async (
  operation: () => Promise<unknown>,
  code: ExportControlError['code'],
) => assert.rejects(operation, (error: unknown) => (
  error instanceof ExportControlError && error.code === code
));

const main = async () => {
  const events: string[] = [];
  const result = await run(dependencies(events));
  assert.equal(result.artifact.bucket, 'private-exports');
  assert.deepEqual(events, [
    'authenticate',
    'load-authority',
    'prepare:private-exports',
    `audit-create:${orgId}:${userId}`,
    'render:Authoritative',
    'upload:private-exports',
    'audit-complete:succeeded',
  ]);

  const disabledEvents: string[] = [];
  await rejectsWith(() => executeExport({
    request,
    runtimeConfig: {},
    jobType: 'export_document',
    artifactType: 'generated-document',
    allowedStatuses: ['generated'],
    dependencies: dependencies(disabledEvents),
  }), 'EXPORT_DISABLED');
  assert.deepEqual(disabledEvents, []);

  const authEvents: string[] = [];
  const authDependencies = dependencies(authEvents);
  authDependencies.authenticate = async () => { throw new Error('raw auth detail'); };
  await rejectsWith(() => run(authDependencies), 'AUTHENTICATION_REQUIRED');

  const authorityEvents: string[] = [];
  const authorityDependencies = dependencies(authorityEvents);
  authorityDependencies.loadAuthority = async () => { throw new Error('raw database detail'); };
  await rejectsWith(() => run(authorityDependencies), 'EXPORT_AUTHORITY_UNAVAILABLE');

  const deniedEvents: string[] = [];
  const deniedDependencies = dependencies(deniedEvents);
  deniedDependencies.loadAuthority = async () => ({ ...authority(), organizationRolePermissions: [] });
  await rejectsWith(() => run(deniedDependencies), 'EXPORT_NOT_AVAILABLE');
  assert.equal(deniedEvents.some(event => event.startsWith('audit-create')), false);
  assert.equal(deniedEvents.some(event => event.startsWith('upload')), false);

  const createAuditEvents: string[] = [];
  const createAuditDependencies = dependencies(createAuditEvents);
  createAuditDependencies.createRequiredAudit = async () => { throw new Error('audit database detail'); };
  await rejectsWith(() => run(createAuditDependencies), 'EXPORT_AUDIT_UNAVAILABLE');
  assert.equal(createAuditEvents.some(event => event.startsWith('render')), false);

  const uploadEvents: string[] = [];
  const uploadDependencies = dependencies(uploadEvents);
  uploadDependencies.upload = async () => { throw new Error('storage provider detail'); };
  await rejectsWith(() => run(uploadDependencies), 'EXPORT_FAILED');
  assert.equal(uploadEvents.includes('audit-complete:failed'), true);

  const failedAuditEvents: string[] = [];
  const failedAuditDependencies = dependencies(failedAuditEvents);
  failedAuditDependencies.upload = async () => { throw new Error('upload failed'); };
  failedAuditDependencies.completeRequiredAudit = async () => { throw new Error('audit failed'); };
  await rejectsWith(() => run(failedAuditDependencies), 'EXPORT_AUDIT_UNAVAILABLE');

  const completionEvents: string[] = [];
  const completionDependencies = dependencies(completionEvents);
  completionDependencies.completeRequiredAudit = async () => { throw new Error('audit failed'); };
  await rejectsWith(() => run(completionDependencies), 'EXPORT_AUDIT_UNAVAILABLE');

  const supabaseSource = readFileSync('supabase/functions/_shared/supabase.ts', 'utf8');
  assert.doesNotMatch(supabaseSource, /await response\.text\(\)/);
  assert.doesNotMatch(supabaseSource, /Supabase REST request failed \(\$\{response\.status\}\)/);

  for (const endpoint of [
    'supabase/functions/export-document/index.ts',
    'supabase/functions/export-decision-pack/index.ts',
  ]) {
    const source = readFileSync(endpoint, 'utf8');
    assert.match(source, /executeExport/);
    assert.match(source, /EDGE_EXPORTS_ENABLED/);
    assert.match(source, /EXPORTS_BUCKET_ALLOWLIST/);
    assert.doesNotMatch(source, /resolveOrgId|postgrest/);
    assert.doesNotMatch(source, /safeErrorMessage/);
  }

  console.log('Edge export execution regression suite passed.');
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
