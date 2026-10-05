import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PilotOperationsPanel from './PilotOperationsPanel';

const html = renderToStaticMarkup(<PilotOperationsPanel projection={{
  release: { candidateLabel: 'candidate-7', commitSha: 'a'.repeat(40), lifecycle: 'validated' },
  environment: { label: 'Pilot candidate', type: 'pilot_candidate', lifecycle: 'configured', version: 4 },
  controls: { maintenance: false, readOnly: true, disabledFeatures: [] },
  promotion: { eligible: false, blockers: ['missing_evidence'], liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED'], rollbackEligible: false, rollbackReason: 'READ_ONLY_MODE' },
  provider: { configured: true, enabled: false },
  health: { schemaCompatible: true, queueState: 'healthy', reconciliationState: 'healthy' }, recovery: { backupState: 'passed', restoreState: 'passed' },
  truth: 'not_proven_hosted_live', liveActivationAuthorized: false,
}} />);
assert.match(html, /Hosted\/live activation is not authorized or proven/);
assert.match(html, /LIVE_ACTIVATION_NOT_AUTHORIZED/);
assert.doesNotMatch(html, /secret|credential|database_url/i);
assert.match(renderToStaticMarkup(<PilotOperationsPanel projection={null} error="Projection denied" />), /role="alert"/);
const emptyHtml = renderToStaticMarkup(<PilotOperationsPanel projection={{
  authority: { environmentId: '11111111-1111-4111-8111-111111111111' },
  release: null,
  environment: { label: 'Pilot candidate', type: 'pilot_candidate', lifecycle: 'active_non_live', version: 7 },
  controls: { maintenance: false, readOnly: true, disabledFeatures: [] },
  promotion: { eligible: false, blockers: ['CANDIDATE_NOT_APPROVED'], liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED'], rollbackEligible: false, rollbackReason: 'READ_ONLY_MODE' },
  provider: { configured: false, enabled: false, status: 'not_configured' },
  health: { schemaCompatible: false, queueState: 'healthy', reconciliationState: 'healthy' },
  recovery: { backupState: 'not_run', restoreState: 'not_run' },
  truth: 'not_proven_hosted_live', liveActivationAuthorized: false,
}} onRequest={() => { throw new Error('disabled actions must not dispatch'); }} actionAvailability={{ maintenance: true, read_only: true }} />);
assert.match(emptyHtml, /No release candidate registered/);
assert.match(emptyHtml, /Read-only on/);
assert.match(emptyHtml, /Backup: not_run/);
assert.match(emptyHtml, /Restore: not_run/);
assert.match(emptyHtml, /<button[^>]*disabled=""[^>]*>validate<\/button>/);
assert.match(emptyHtml, /<button[^>]*>maintenance<\/button>/);
console.log('Pilot Operations panel: 10 safe, empty-release, live-stop, recovery, and error assertions passed.');
