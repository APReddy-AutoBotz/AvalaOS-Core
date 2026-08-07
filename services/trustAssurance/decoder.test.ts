import assert from 'node:assert/strict';
import { decodeBuyerSafeProjection } from './decoder';
const valid={mode:'published_snapshot',publication:{publicId:'pub-1',snapshotHash:'a'.repeat(64),publishedAt:'2026-08-07T00:00:00Z'},claims:[{wording:'Source behavior is tested.',effectiveProofStatus:'verified',proofBoundary:'verified_with_evidence',lastReviewedAt:'2026-08-06T00:00:00Z',evidence:[{summary:'Focused source tests passed.',referenceType:'test_report',referenceValue:'tests/trust-assurance',freshness:'current'}],limitationDisclosure:'Source-only.',doesNotProve:['Hosted behavior']}]} as const;
assert.equal(decodeBuyerSafeProjection(valid).claims[0].wording,'Source behavior is tested.');
assert.throws(()=>decodeBuyerSafeProjection({...valid,internalNotes:'secret'}),/MALFORMED/);
assert.throws(()=>decodeBuyerSafeProjection({...valid,claims:[{...valid.claims[0],ownerEmail:'person@example.com'}]}),/MALFORMED/);
assert.throws(()=>decodeBuyerSafeProjection({...valid,mode:'draft'}),/MALFORMED/);
console.log('Trust Assurance decoder tests passed');
