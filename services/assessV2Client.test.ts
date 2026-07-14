import assert from 'node:assert/strict';

import type { TenantContextProjection } from '../types';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';

const context: TenantContextProjection = {
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Avala',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  workspaceName: 'Assess',
  authorizationVersion: 7,
  capabilities: ['assess.v2.finalize'],
};
const caseId = '44444444-4444-4444-8444-444444444444';
const envelope = buildAssessV2CommandEnvelope(
  context,
  'assessment_v2.finalize',
  { caseId },
  `assessment_v2.finalize:${caseId}:2`,
  2,
  '55555555-5555-4555-8555-555555555555',
);

assert.equal(envelope.commandType, 'assessment_v2.finalize');
assert.equal(envelope.authorizationVersion, 7);
assert.deepEqual(envelope.payload, { caseId });
assert.deepEqual(Object.keys(envelope.payload), ['caseId']);
assert.equal('decision' in envelope.payload, false);
assert.equal('inputSnapshot' in envelope.payload, false);
assert.equal('inputHash' in envelope.payload, false);
const createEnvelope=buildAssessV2CommandEnvelope(context,'assessment_v2.create',{caseId},'assessment_v2.create:case',undefined,'66666666-6666-4666-8666-666666666666');
assert.equal('expectedVersion' in createEnvelope,false);
console.log('Assess V2 client boundary regression passed.');
