import assert from 'node:assert/strict';
import { CANONICAL_RC_JOURNEY, RC_MODULE_EVIDENCE, releaseCandidateIdentity, validateCanonicalRcJourney } from './releaseCandidateReadinessModel';

assert.deepEqual(validateCanonicalRcJourney(), []);
assert.equal(CANONICAL_RC_JOURNEY[0].fixtureId, 'assess-proc-ap-invoice-exception');
assert.equal(CANONICAL_RC_JOURNEY.at(-1)?.fixtureId, 'pack-ap-invoice-exception');
assert.match(CANONICAL_RC_JOURNEY[2].authorityBoundary, /not a canonical governed Studio/i);
assert.ok(CANONICAL_RC_JOURNEY.every(item => /synthetic|legacy demo/i.test(item.authorityBoundary)));
assert.equal(releaseCandidateIdentity().buildIdentityProven, false);
assert.equal(releaseCandidateIdentity('a'.repeat(40)).buildIdentityProven, true);
assert.equal(RC_MODULE_EVIDENCE.find(item => item[0] === 'Trust Assurance')?.[1], 'not_run_on_candidate');
assert.deepEqual(RC_MODULE_EVIDENCE.map(item => item[1]), ['not_run_on_candidate', 'not_run_on_candidate', 'not_run_on_candidate', 'not_proven_hosted_or_live']);

const broken = CANONICAL_RC_JOURNEY.map(item => ({ ...item }));
broken[2].fixtureEvidenceRef = 'browser-invented-id';
assert.match(validateCanonicalRcJourney(broken).join(' '), /Studio fixture evidence/);
console.log('V1 RC readiness model tests passed');
