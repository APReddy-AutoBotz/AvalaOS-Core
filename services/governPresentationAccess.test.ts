import assert from 'node:assert/strict';
import type { EnterpriseSessionState, Organization, TenantContextProjection, User } from '../types';
import { resolveGovernPresentationAccess } from './governPresentationAccess';

const organization: Organization = {
  id: 'org-a',
  name: 'Synthetic organization',
  profile: { industry: '', size: '', geography: '', strategicGoals: '' },
  subscriptionTier: 'Enterprise',
  members: [],
  enabledModules: ['assess', 'docs', 'delivery', 'monitor'],
};
const workspace = { id: 'workspace-a', organizationId: organization.id, name: 'Workspace A' };
const reader: User = {
  id: 'reader',
  name: 'Assessment reader',
  email: 'reader@example.test',
  orgRole: 'Contributor',
  permissions: ['project.read'],
};
const reviewer: User = {
  ...reader,
  id: 'reviewer',
  email: 'reviewer@example.test',
  permissions: ['assessment.review', 'process.approve'],
};
const context = (userId: string, capabilities = ['assess.read']): TenantContextProjection => ({
  userId,
  organizationId: organization.id,
  organizationName: organization.name,
  workspaceId: workspace.id,
  workspaceName: workspace.name,
  authorizationVersion: 3,
  capabilities,
});
const decide = (
  user: User,
  tenantContext: TenantContextProjection | null,
  sessionState: EnterpriseSessionState = 'ready',
) => resolveGovernPresentationAccess({
  user,
  organization,
  workspace,
  tenantContext,
  sessionState,
});

const readerDecision = decide(reader, context(reader.id));
assert.equal(readerDecision.allowed, true);
assert.equal(readerDecision.readOnly, true);
assert.equal(readerDecision.hasReviewAuthority, false);
assert.equal(reader.permissions?.includes('assessment.review'), false);

const reviewerDecision = decide(reviewer, context(reviewer.id));
assert.equal(reviewerDecision.allowed, true);
assert.equal(reviewerDecision.hasReviewAuthority, true);
assert.equal(reviewerDecision.hasApprovalAuthority, true);

assert.equal(decide(reader, context(reader.id, [])).reason, 'missing_assess_read');
for (const state of ['stale', 'revoked', 'offline'] as EnterpriseSessionState[]) {
  const decision = decide(reader, context(reader.id), state);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'authority_unavailable');
}

const workspaceB = { id: 'workspace-b', organizationId: organization.id, name: 'Workspace B' };
const mismatched = resolveGovernPresentationAccess({
  user: reader,
  organization,
  workspace: workspaceB,
  tenantContext: context(reader.id),
  sessionState: 'ready',
});
assert.equal(mismatched.allowed, false);
assert.equal(mismatched.reason, 'context_mismatch');
assert.equal(mismatched.contextKey, null);

console.log('govern presentation access: 17 read-only, authority, fail-closed, and context assertions passed');
