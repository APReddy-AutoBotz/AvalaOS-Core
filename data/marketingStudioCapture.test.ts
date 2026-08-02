import assert from 'node:assert/strict';
import { readStudioArtifact, readStudioEligibleReviewers, readStudioHandoffs } from '../services/studioArtifacts/client';
import { createMarketingStudioCaptureTransport } from './marketingStudioCapture';

const context = {
  userId: 'a0000000-0000-4000-8000-000000000020',
  organizationId: 'a0000000-0000-4000-8000-000000000021',
  organizationName: 'Capture organization',
  workspaceId: 'a0000000-0000-4000-8000-000000000022',
  workspaceName: 'Capture workspace',
  authorizationVersion: 1,
  capabilities: [],
};

void (async () => {
  const transport = createMarketingStudioCaptureTransport(context);
  const handoffs = await readStudioHandoffs(context, transport);
  assert.equal(handoffs.length, 1);
  const artifact = await readStudioArtifact(context, handoffs[0].id, 'brd', transport);
  assert.equal(artifact.lifecycle, 'in_review');
  assert.equal(artifact.currentApprovedVersion?.lifecycle, 'approved');
  assert.equal((await readStudioEligibleReviewers(context, artifact.id, artifact.currentVersion.id, transport))[0].displayName, 'Priya Nair · Independent reviewer');
  console.log('marketing Studio capture fixture: decoder and reviewer assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
