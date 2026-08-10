import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PilotOperationsPanel from './PilotOperationsPanel';

const html = renderToStaticMarkup(<PilotOperationsPanel projection={{
  release: { candidateLabel: 'candidate-7', commitSha: 'a'.repeat(40), lifecycle: 'validated' },
  environment: { label: 'Pilot candidate', type: 'pilot_candidate', lifecycle: 'configured', version: 4 },
  controls: { maintenance: false, readOnly: true, disabledFeatures: [] },
  promotion: { eligible: false, blockers: ['missing_evidence'], liveStopGates: ['LIVE_ACTIVATION_NOT_AUTHORIZED'], rollbackEligible: false },
  provider: { configured: true, enabled: false },
  health: { schemaCompatible: true, queueState: 'healthy', reconciliationState: 'healthy' }, recovery: { backupState: 'passed', restoreState: 'passed' },
  truth: 'not_proven_hosted_live', liveActivationAuthorized: false,
}} />);
assert.match(html, /Hosted\/live activation is not authorized or proven/);
assert.match(html, /LIVE_ACTIVATION_NOT_AUTHORIZED/);
assert.doesNotMatch(html, /secret|credential|database_url/i);
assert.match(renderToStaticMarkup(<PilotOperationsPanel projection={null} error="Projection denied" />), /role="alert"/);
console.log('Pilot Operations panel: safe projection, live stop gate, and error state passed.');
