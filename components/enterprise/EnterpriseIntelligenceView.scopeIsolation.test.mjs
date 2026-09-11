import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/enterprise/EnterpriseIntelligenceView.tsx', 'utf8');
const workbenchStart = source.indexOf('function EnterpriseIntelligenceWorkbench');

test('the complete Enterprise workbench is keyed by actor, organization, and workspace', () => {
  assert.notEqual(workbenchStart, -1);
  const outer = source.slice(0, workbenchStart);
  const workbench = source.slice(workbenchStart);

  assert.equal(outer.includes('const scopeKey = `${organizationId}:${workspaceId}:${actorId}`;'), true);
  assert.match(outer, /<EnterpriseIntelligenceWorkbench\s+key=\{scopeKey\}/u);
  for (const state of [
    'projectionState', 'busy', 'reloadRequired', 'transcriptReviewActivated', 'status', 'error', 'providerForm', 'providerId',
    'providerKey', 'routeRoleSelections', 'sourceFile', 'sourceId', 'assessDraftId', 'selectedCandidateIds',
    'applicationId', 'decisionId', 'blueprintName',
  ]) {
    assert.match(workbench, new RegExp(`\\[${state},\\s+set`, 'u'), `${state} must remain inside the scope-keyed workbench`);
  }
  for (const child of ['TranscriptSourceLibrary', 'AssessTranscriptCandidateReview', 'GovernedDeliveryWorkspace', 'MonitorApprovedBaselinePanel']) {
    assert.match(workbench, new RegExp(`<${child}`, 'u'), `${child} must be rendered inside the scope-keyed workbench`);
  }
});

test('file reads and mutation finalizers are fenced before state writes', () => {
  const workbench = source.slice(workbenchStart);

  assert.match(workbench, /const fileReadEpoch = useRef\(0\);/u);
  assert.match(workbench, /return \(\) => \{\s+projectionRequestEpoch\.current \+= 1;\s+fileReadEpoch\.current \+= 1;/u);
  assert.match(workbench, /const bytes = await file\.arrayBuffer\(\);\s+if \(!isCurrent\(\)\) return;\s+setSourceFile/u);
  assert.match(workbench, /const mutate = async \(action: \(isCurrent: \(\) => boolean\) => Promise<unknown>/u);
  assert.match(workbench, /const result = await action\(isCurrent\);/u);
  assert.match(workbench, /bindProviderSecret[\s\S]*?finally \{ if \(isCurrent\(\)\) setProviderKey\(''\); \}/u);
  assert.match(workbench, /rotateProviderSecret[\s\S]*?finally \{ if \(isCurrent\(\)\) setProviderKey\(''\); \}/u);
});
