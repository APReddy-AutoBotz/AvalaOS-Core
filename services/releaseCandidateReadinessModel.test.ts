import assert from 'node:assert/strict';
import { CANONICAL_RC_JOURNEY, RC_MODULE_EVIDENCE, releaseCandidateIdentity, validateCanonicalRcJourney } from './releaseCandidateReadinessModel';

assert.deepEqual(validateCanonicalRcJourney(), []);
assert.equal(CANONICAL_RC_JOURNEY[0].resourceId, 'assess-proc-ap-invoice-exception');
assert.equal(CANONICAL_RC_JOURNEY.at(-1)?.resourceId, 'pack-ap-invoice-exception');
assert.equal(releaseCandidateIdentity().buildIdentityProven, false);
assert.equal(releaseCandidateIdentity('a'.repeat(40)).buildIdentityProven, true);
assert.ok(RC_MODULE_EVIDENCE.some(item => item[1] === 'not_proven_hosted_or_live'));

const broken = CANONICAL_RC_JOURNEY.map(item => ({ ...item }));
broken[2].evidenceRef = 'browser-invented-id';
assert.match(validateCanonicalRcJourney(broken).join(' '), /Studio evidence/);
console.log('V1 RC readiness model tests passed');
