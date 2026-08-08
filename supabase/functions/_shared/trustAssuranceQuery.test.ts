import assert from 'node:assert/strict';
import { applyTrustAssuranceRuntimeConfiguration, decodeTrustAssuranceQueryRequest, trustAssuranceMutationsReadOnly } from './trustAssuranceQuery';

const request = {
  organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  authorizationVersion: 2,
  view: 'internal' as const,
};
assert.deepEqual(decodeTrustAssuranceQueryRequest(request), request);
for (const invalid of [
  { ...request, unexpected: true },
  { ...request, organizationId: 'not-a-uuid' },
  { ...request, workspaceId: 'not-a-uuid' },
  { ...request, authorizationVersion: 0 },
  { ...request, authorizationVersion: 1.5 },
  { ...request, view: 'public' },
]) assert.throws(() => decodeTrustAssuranceQueryRequest(invalid), /VALIDATION_FAILED/);

const internal = { mode: 'server_authoritative', readOnly: false, claims: [] };
assert.deepEqual(applyTrustAssuranceRuntimeConfiguration('internal', internal, true), { ...internal, readOnly: true });
assert.deepEqual(applyTrustAssuranceRuntimeConfiguration('internal', internal, false), internal);
const buyer = { mode: 'published_snapshot', publication: {}, claims: [] };
assert.equal(applyTrustAssuranceRuntimeConfiguration('buyer', buyer, true), buyer, 'buyer-safe output is unchanged');
assert.equal(trustAssuranceMutationsReadOnly(true, false), false);
assert.equal(trustAssuranceMutationsReadOnly(true, true), true);
assert.equal(trustAssuranceMutationsReadOnly(false, false), true);
assert.equal(trustAssuranceMutationsReadOnly(false, true), true);
console.log('Trust Assurance query tests passed');
