import assert from 'node:assert/strict';
import { applyTrustAssuranceRuntimeConfiguration } from './trustAssuranceQuery';

const internal = { mode: 'server_authoritative', readOnly: false, claims: [] };
assert.deepEqual(applyTrustAssuranceRuntimeConfiguration('internal', internal, true), { ...internal, readOnly: true });
assert.deepEqual(applyTrustAssuranceRuntimeConfiguration('internal', internal, false), internal);
const buyer = { mode: 'published_snapshot', publication: {}, claims: [] };
assert.equal(applyTrustAssuranceRuntimeConfiguration('buyer', buyer, true), buyer, 'buyer-safe output is unchanged');
console.log('Trust Assurance query tests passed');
