import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

import type { TenantContextProjection } from '../types';
import { ASSESS_V2_CAPABILITIES, ASSESS_V2_COMMAND_CAPABILITY } from './assessV2/capabilities';
import { buildAssessV2CommandEnvelope } from './assessV2ClientContract';
import { readEnterpriseErrorCode } from './enterpriseAssessContract';
import { presentEnterpriseBoundary } from './enterpriseSessionPolicy';

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
assert.deepEqual(Object.values(ASSESS_V2_CAPABILITIES), [
  'assess.v2.read',
  'assess.v2.create',
  'assess.v2.clone',
  'assess.v2.draft.write',
  'assess.v2.finalize',
]);
assert.deepEqual(ASSESS_V2_COMMAND_CAPABILITY, {
  'assessment_v2.create': 'assess.v2.create',
  'assessment_v2.clone_from_v1': 'assess.v2.clone',
  'assessment_v2.draft.upsert': 'assess.v2.draft.write',
  'assessment_v2.finalize': 'assess.v2.finalize',
});
assert.equal(Object.values(ASSESS_V2_CAPABILITIES).includes(['assess', 'v2', 'write'].join('.') as never), false);
for (const code of ['READ_ONLY', 'FEATURE_DISABLED'] as const) {
  assert.equal(readEnterpriseErrorCode({ error: { code } }), code);
  assert.equal(readEnterpriseErrorCode({ code }), code);
  assert.equal(presentEnterpriseBoundary(code).state, 'read_only');
  assert.equal(presentEnterpriseBoundary(code).clearAuthority, false);
}
assert.match(presentEnterpriseBoundary('READ_ONLY').message, /read-only maintenance/);
assert.match(presentEnterpriseBoundary('FEATURE_DISABLED').message, /disabled/);
assert.notEqual(presentEnterpriseBoundary('READ_ONLY').message, presentEnterpriseBoundary('FEATURE_DISABLED').message);
const clientSource = fs.readFileSync('services/assessV2Client.ts', 'utf8');
const immutableProjectionSource = clientSource.match(/export const projectImmutableCloneEvidence = \([\s\S]*?^};/m)?.[0];
assert.ok(immutableProjectionSource, 'immutable clone evidence projection must remain directly testable');
const projectionModule = { exports: {} as Record<string, unknown> };
new Function('exports', 'module', ts.transpileModule(immutableProjectionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(projectionModule.exports, projectionModule);
const projectImmutableCloneEvidence = projectionModule.exports.projectImmutableCloneEvidence as (
  currentEvidence: unknown[],
  importedEvidence: unknown[],
) => { evidence: unknown[]; importedEvidenceClaimIds: string[] };
const immutableImportedEvidence = {
  id: '11111111-1111-4111-8111-111111111111',
  claimIds: ['v1.responses.processStructure.trigger', 'v1.evidence.legacy-evidence-1'],
  sourceType: 'document',
  status: 'submitted',
  validated: false,
};
const authoredEvidence = {
  id: '22222222-2222-4222-8222-222222222222',
  claimIds: ['primitive.intake.structure'],
  sourceType: 'test',
  status: 'submitted',
  validated: false,
};
const alteredImportedCollision = { ...immutableImportedEvidence, claimIds: ['fabricated.claim'] };
const laterCloneProjection = projectImmutableCloneEvidence(
  [authoredEvidence, alteredImportedCollision],
  [immutableImportedEvidence],
);
assert.deepEqual(laterCloneProjection.evidence, [immutableImportedEvidence, authoredEvidence]);
assert.deepEqual(laterCloneProjection.importedEvidenceClaimIds, ['v1.evidence.legacy-evidence-1']);

assert.match(clientSource, /readEnterpriseErrorCode\(payload,/);
assert.match(clientSource, /evidenceIds\.has\(evidence\.id\)/);
assert.match(clientSource, /throw new EnterpriseBoundaryError\('COMMAND_UNAVAILABLE'\)/);
assert.match(clientSource, /assertUniqueAssessV2EvidenceIds\(value\.case_snapshot\)/);
assert.match(clientSource, /findAssessV2CaseForProcess/);
assert.match(clientSource, /capabilities\.includes\(ASSESS_V2_CAPABILITIES\.read\)/);
assert.match(clientSource, /\.eq\('org_id', organizationId\)/);
assert.match(clientSource, /\.eq\('workspace_id', workspaceId\)/);
assert.match(clientSource, /\.eq\('process_id', processId\)/);
assert.match(clientSource, /\.is\('deleted_at', null\)/);
assert.match(clientSource, /\.in\('status', \['draft', 'reviewer_ready'\]\)/);
assert.match(clientSource, /\.eq\('case_id', currentCase\.id\)[\s\S]*\.eq\('org_id', currentCase\.org_id\)[\s\S]*\.eq\('workspace_id', currentCase\.workspace_id\)[\s\S]*\.eq\('version', 1\)[\s\S]*\.eq\('source_kind', 'v1_clone'\)/);
assert.match(clientSource, /child\('assess_v2_evidence_links', immutableCloneVersion\.id\)/);
assert.match(clientSource, /clonedAt: cloneSource && typeof cloneSource\.clonedAt === 'string'/);
assert.match(clientSource, /importedEvidenceClaimIds,/);
console.log('Assess V2 client boundary regression passed.');
