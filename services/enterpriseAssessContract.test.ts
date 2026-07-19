import assert from 'node:assert/strict';
import {
  isEnterpriseObject,
  parseEnterpriseCommandResource,
  parseTenantContextProjection,
  readEnterpriseErrorCode,
} from './enterpriseAssessContract';
import {
  EnterpriseMutationCapability,
  enterpriseActionPolicy,
  presentEnterpriseBoundary,
} from './enterpriseSessionPolicy';

const USER='11111111-1111-4111-8111-111111111111';
const ORG='22222222-2222-4222-8222-222222222222';
const WS='33333333-3333-4333-8333-333333333333';
const ASSESSMENT='44444444-4444-4444-8444-444444444444';
const HANDOFF='55555555-5555-4555-8555-555555555555';
const capabilities: EnterpriseMutationCapability[] = [
  'assess.create','assess.response.write','assess.finalize','govern.resolve','studio.handoff.create',
];
const rawContext = {
  userId: USER,
  organizationId: ORG,
  organizationName: '  Avala Enterprise  ',
  workspaceId: WS,
  workspaceName: '  Governed Assess  ',
  authorizationVersion: 7,
  capabilities: [...capabilities].reverse().concat('govern.resolve'),
};

assert.equal(isEnterpriseObject({}),true);
assert.equal(isEnterpriseObject([]),false);
assert.equal(isEnterpriseObject(null),false);

for (const code of [
  'AUTHENTICATION_REQUIRED','AUTHORITY_STALE','RESOURCE_NOT_AVAILABLE','PERMISSION_DENIED',
  'VERSION_CONFLICT','IDEMPOTENCY_CONFLICT','FEATURE_DISABLED','READ_ONLY',
] as const) {
  assert.equal(readEnterpriseErrorCode({ error: { code } }),code);
  assert.equal(readEnterpriseErrorCode({ code }),code);
}
assert.equal(readEnterpriseErrorCode({ error: { code: 'DATABASE_DETAIL' } }),'COMMAND_UNAVAILABLE');
assert.equal(readEnterpriseErrorCode(undefined,true),'OFFLINE');

const context = parseTenantContextProjection(rawContext);
assert.ok(context);
assert.equal(context.organizationName,'Avala Enterprise');
assert.equal(context.workspaceName,'Governed Assess');
assert.deepEqual(context.capabilities,[...capabilities].sort());
for (const invalid of [
  null,
  { ...rawContext, userId: 'forged' },
  { ...rawContext, organizationId: 'forged' },
  { ...rawContext, organizationName: ' ' },
  { ...rawContext, workspaceId: 'forged' },
  { ...rawContext, workspaceName: '' },
  { ...rawContext, authorizationVersion: 1.5 },
  { ...rawContext, capabilities: 'govern.resolve' },
  { ...rawContext, capabilities: ['govern.resolve',7] },
]) assert.equal(parseTenantContextProjection(invalid),null);

const baseResource = { assessmentId: ASSESSMENT, version: 3, status: 'Approved' };
assert.deepEqual(parseEnterpriseCommandResource(baseResource,'govern.resolve'),baseResource);
assert.deepEqual(parseEnterpriseCommandResource(
  { ...baseResource, version: 4, status: 'Handed Off to Docs', handoffId: HANDOFF },
  'studio_handoff.create',
),{ ...baseResource, version: 4, status: 'Handed Off to Docs', handoffId: HANDOFF });
for (const invalid of [
  null,
  { ...baseResource, assessmentId: 'forged' },
  { ...baseResource, version: 1.2 },
  { ...baseResource, version: 0 },
  { ...baseResource, status: 7 },
  { ...baseResource, status: 'Draft' },
  { ...baseResource, scoreVersion: 7 },
]) assert.equal(parseEnterpriseCommandResource(invalid,'govern.resolve'),null);
assert.equal(parseEnterpriseCommandResource(baseResource,'studio_handoff.create'),null);
assert.equal(parseEnterpriseCommandResource({ ...baseResource, handoffId: 'forged' },'studio_handoff.create'),null);
assert.equal(parseEnterpriseCommandResource(baseResource,'assessment.finalize'),null);

for (const capability of capabilities) {
  assert.deepEqual(enterpriseActionPolicy({
    sessionState:'ready',tenantContext:context,capability,
  }),{ enabled:true,explanation:null });
}
assert.equal(enterpriseActionPolicy({
  sessionState:'ready',tenantContext:{ ...context, capabilities:[] },capability:'govern.resolve',
}).enabled,false);
assert.match(enterpriseActionPolicy({
  sessionState:'ready',tenantContext:{ ...context, capabilities:[] },capability:'govern.resolve',
}).explanation || '',/govern\.resolve/);
assert.match(enterpriseActionPolicy({
  sessionState:'read_only',tenantContext:context,capability:'assess.response.write',
}).explanation || '',/Read-only/);
assert.match(enterpriseActionPolicy({
  sessionState:'stale',tenantContext:context,capability:'assess.finalize',
}).explanation || '',/fresh server-issued/);
assert.deepEqual(enterpriseActionPolicy({
  sessionState:'offline',tenantContext:null,capability:'studio.handoff.create',localAuthority:true,
}),{ enabled:true,explanation:null });

assert.equal(presentEnterpriseBoundary('AUTHENTICATION_REQUIRED').state,'expired_session');
assert.equal(presentEnterpriseBoundary('AUTHENTICATION_REQUIRED').clearAuthority,true);
assert.equal(presentEnterpriseBoundary('AUTHORITY_STALE').state,'stale');
assert.equal(presentEnterpriseBoundary('RESOURCE_NOT_AVAILABLE').clearAuthority,true);
assert.equal(presentEnterpriseBoundary('PERMISSION_DENIED').state,'ready');
assert.equal(presentEnterpriseBoundary('VERSION_CONFLICT').state,'ready');
assert.equal(presentEnterpriseBoundary('IDEMPOTENCY_CONFLICT').state,'ready');
assert.equal(presentEnterpriseBoundary('FEATURE_DISABLED').state,'read_only');
assert.equal(presentEnterpriseBoundary('FEATURE_DISABLED').clearAuthority,false);
assert.match(presentEnterpriseBoundary('FEATURE_DISABLED').message,/disabled/);
assert.equal(presentEnterpriseBoundary('READ_ONLY').state,'read_only');
assert.equal(presentEnterpriseBoundary('READ_ONLY').clearAuthority,false);
assert.match(presentEnterpriseBoundary('READ_ONLY').message,/read-only maintenance/);
assert.notEqual(presentEnterpriseBoundary('FEATURE_DISABLED').message,presentEnterpriseBoundary('READ_ONLY').message);
assert.equal(presentEnterpriseBoundary('COMMAND_UNAVAILABLE').state,'error');
assert.equal(presentEnterpriseBoundary('OFFLINE').state,'offline');
assert.match(presentEnterpriseBoundary('OFFLINE').message,/not be replayed/);

console.log('Enterprise Assess contract, capability, and session policy tests passed.');
