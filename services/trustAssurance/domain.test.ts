import assert from 'node:assert/strict';
import { canonicalJson, deriveEffectiveProofStatus, deriveFreshness, sha256Hex, validateSnapshotPublication } from './domain';

assert.equal(deriveFreshness(new Date('2026-08-07T12:00:00Z'), '2026-08-08T00:00:00Z', '2026-08-07T00:00:00Z'), 'expired');
assert.equal(deriveFreshness(new Date('2026-08-07T12:00:00Z'), '2026-08-07T00:00:00Z', null), 'review_due');
assert.equal(deriveEffectiveProofStatus('configured', [], '', []).status, 'configured', 'stored non-verified status is preserved');
const verified = deriveEffectiveProofStatus('verified', [{ relationship:'supports', lifecycle:'active', freshness:'current', approved:true, result:'performed' }], 'Source-only evidence.', ['Hosted behavior']);
assert.equal(verified.status, 'verified');
for (const evidence of [
  [{ relationship:'supports', lifecycle:'superseded', freshness:'current', approved:true, result:'performed' }] as const,
  [{ relationship:'supports', lifecycle:'active', freshness:'expired', approved:true, result:'performed' }] as const,
  [{ relationship:'supports', lifecycle:'active', freshness:'current', approved:true, result:'not_run' }] as const,
]) assert.equal(deriveEffectiveProofStatus('verified', evidence, 'Limited.', ['Production']).status, 'evidence_required');
const contradicted = deriveEffectiveProofStatus('verified', [
  { relationship:'supports', lifecycle:'active', freshness:'current', approved:true, result:'performed' },
  { relationship:'contradicts', lifecycle:'active', freshness:'review_due', approved:false, result:'performed' },
], 'Limited.', ['Production']);
assert.deepEqual(contradicted.blockedReasons, ['CURRENT_CONTRADICTION']);
assert.equal(canonicalJson({b:2,a:[{z:1,y:2}]}), '{"a":[{"y":2,"z":1}],"b":2}');
Promise.all([sha256Hex({b:2,a:1}),sha256Hex({a:1,b:2})]).then(([a,b])=>assert.equal(a,b));
assert.deepEqual(validateSnapshotPublication({creatorId:'a',reviewerId:'b',publisherId:'c',reviewedHash:'h',snapshotHash:'h',claims:[{current:true,effectiveProofStatus:'verified',selectedEvidenceCurrent:true,limitationDisclosure:'Limited.',doesNotProve:['Hosted']}]}), []);
assert.ok(validateSnapshotPublication({creatorId:'a',reviewerId:'a',publisherId:'a',reviewedHash:'old',snapshotHash:'new',claims:[]}).includes('SEPARATION_OF_DUTY_REQUIRED'));
console.log('Trust Assurance domain tests passed');
