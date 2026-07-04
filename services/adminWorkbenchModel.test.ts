import assert from 'node:assert/strict';

import {
  ADMIN_WORKBENCH_SECTIONS,
  getAdminSectionByKey,
  getDefaultAdminSection,
  isAdminSectionKey,
} from './adminWorkbenchModel';

console.log('Running Admin Workbench model tests...');

assert.deepEqual(ADMIN_WORKBENCH_SECTIONS.map(section => section.key), [
  'overview',
  'organization',
  'modules',
  'trust_center',
  'buyer_acceptance_pack',
  'buyer_acceptance_review_gate',
  'evidence_policy',
  'users_roles',
  'audit_security',
  'ai_controls',
]);

assert.equal(getDefaultAdminSection().key, 'overview');

const trustCenterSection = getAdminSectionByKey('trust_center');
assert.ok(trustCenterSection);
assert.equal(trustCenterSection.label, 'Trust Center');

const buyerAcceptancePackSection = getAdminSectionByKey('buyer_acceptance_pack');
assert.ok(buyerAcceptancePackSection);
assert.equal(buyerAcceptancePackSection.label, 'Buyer Acceptance Pack');
assert.doesNotMatch(
  buyerAcceptancePackSection.description + '\n' + (buyerAcceptancePackSection.proofSafeDisclosure || ''),
  /approved for buyer use|readiness approved|export available|PDF available|download available|compliance certified|production ready/i,
);

const buyerAcceptanceReviewGateSection = getAdminSectionByKey('buyer_acceptance_review_gate');
assert.ok(buyerAcceptanceReviewGateSection);
assert.equal(buyerAcceptanceReviewGateSection.label, 'Review Rehearsal Gate');
assert.equal(buyerAcceptanceReviewGateSection.shortLabel, 'Review Gate');
assert.equal(
  ADMIN_WORKBENCH_SECTIONS.findIndex(section => section.key === 'buyer_acceptance_review_gate'),
  ADMIN_WORKBENCH_SECTIONS.findIndex(section => section.key === 'buyer_acceptance_pack') + 1,
);
assert.equal(
  ADMIN_WORKBENCH_SECTIONS.findIndex(section => section.key === 'buyer_acceptance_review_gate'),
  ADMIN_WORKBENCH_SECTIONS.findIndex(section => section.key === 'evidence_policy') - 1,
);
assert.doesNotMatch(
  buyerAcceptanceReviewGateSection.description + '\n' + (buyerAcceptanceReviewGateSection.proofSafeDisclosure || ''),
  /approved for buyer use|readiness approved|export available|PDF available|download available|compliance certified|production ready/i,
);
assert.match(
  buyerAcceptanceReviewGateSection.proofSafeDisclosure || '',
  /read-only.*not an approval.*not an export.*not readiness evidence.*not compliance evidence.*no PDF\/download generated/i,
);

const aiControlsSection = getAdminSectionByKey('ai_controls');
assert.ok(aiControlsSection);
assert.doesNotMatch(
  `${aiControlsSection.description}\n${aiControlsSection.proofSafeDisclosure || ''}`,
  /production security readiness/i,
);

const unsupportedCopy = [
  /production ready/i,
  /security ready/i,
  /compliance certified/i,
  /tenant isolation verified/i,
  /RLS ready/i,
  /deployment ready/i,
  /buyer ready/i,
  /product ready/i,
];

const sectionCopy = ADMIN_WORKBENCH_SECTIONS
  .flatMap(section => [section.label, section.shortLabel, section.description, section.proofSafeDisclosure || ''])
  .join('\n');

for (const pattern of unsupportedCopy) {
  assert.doesNotMatch(sectionCopy, pattern);
}

assert.doesNotMatch(sectionCopy, /Avala Govern Lite/);
assert.doesNotMatch(sectionCopy, /Avala Delivery Lite/);

assert.equal(isAdminSectionKey('overview'), true);
assert.equal(isAdminSectionKey('trust_center'), true);
assert.equal(isAdminSectionKey('buyer_acceptance_pack'), true);
assert.equal(isAdminSectionKey('buyer_acceptance_review_gate'), true);
assert.equal(isAdminSectionKey('not_a_section'), false);
assert.equal(getAdminSectionByKey('not_a_section'), undefined);

console.log('Admin Workbench model tests passed.');