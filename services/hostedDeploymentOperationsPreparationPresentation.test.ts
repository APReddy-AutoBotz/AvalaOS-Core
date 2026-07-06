import assert from 'node:assert/strict';

import {
  HOSTED_ENVIRONMENT_CLASS_IDS,
  OPERATIONAL_GATE_CATEGORY_IDS,
  buildHostedDeploymentOperationsPreparationSnapshot,
} from './hostedDeploymentOperationsPreparationModel';
import {
  getHostedDeploymentOperationsPreparationSummary,
  getHostedDeploymentPreparationProofStatusLabel,
  getHostedEnvironmentClassRows,
  getOperationalGateMatrixRows,
  summarizeHostedDeploymentPreparationProofStatuses,
} from './hostedDeploymentOperationsPreparationPresentation';

console.log('Running M5.6b hosted/deployment/operations preparation presentation tests...');

const snapshot = buildHostedDeploymentOperationsPreparationSnapshot();

assert.equal(getHostedDeploymentPreparationProofStatusLabel('unproven'), 'Unproven');
assert.equal(getHostedDeploymentPreparationProofStatusLabel('evidence_required'), 'Evidence Required');
assert.equal(getHostedDeploymentPreparationProofStatusLabel('planned'), 'Planned');
assert.equal(getHostedDeploymentPreparationProofStatusLabel('blocked'), 'Blocked');

const proofSummary = summarizeHostedDeploymentPreparationProofStatuses(snapshot);
assert.deepEqual(proofSummary.map(summary => summary.status), [
  'unproven',
  'evidence_required',
  'planned',
  'blocked',
]);
assert.equal(proofSummary.find(summary => summary.status === 'planned')?.count, 0);
assert.equal(proofSummary.find(summary => summary.status === 'blocked')?.count, 0);
assert.equal(
  proofSummary.reduce((total, summary) => total + summary.count, 0),
  snapshot.environmentClasses.length + snapshot.operationalGateMatrix.length,
);

const environmentRows = getHostedEnvironmentClassRows(snapshot);
assert.equal(environmentRows.length, HOSTED_ENVIRONMENT_CLASS_IDS.length);
assert.deepEqual(environmentRows.map(row => row.id), HOSTED_ENVIRONMENT_CLASS_IDS);
assert.ok(environmentRows.every(row => row.proofStatus === 'unproven' || row.proofStatus === 'evidence_required'));
assert.ok(environmentRows.every(row => row.environmentProbed === false));
assert.ok(environmentRows.every(row => row.hostedValidationPerformed === false));
assert.ok(environmentRows.every(row => row.deploymentValidationPerformed === false));
assert.ok(environmentRows.every(row => row.startupCheckPerformed === false));
assert.ok(environmentRows.every(row => row.readinessCheckPerformed === false));
assert.ok(environmentRows.every(row => row.pilotEvidenceProduced === false));
assert.ok(environmentRows.every(row => row.plannedOwnershipBoundaryCount > 0));
assert.ok(environmentRows.every(row => row.requiredFutureProofCount > 0));
assert.ok(environmentRows.every(row => row.prohibitedOutputFieldCount > 0));
assert.ok(environmentRows.every(row => row.readOnlySummary.includes('Read-only environment-classification summary')));
assert.ok(environmentRows.every(row => row.readOnlySummary.includes('no environment probe, hosted validation, deployment validation, startup check, readiness check, approval, status change, pilot evidence, or readiness evidence action is exposed')));

const gateRows = getOperationalGateMatrixRows(snapshot);
assert.equal(gateRows.length, OPERATIONAL_GATE_CATEGORY_IDS.length);
assert.deepEqual(gateRows.map(row => row.id), OPERATIONAL_GATE_CATEGORY_IDS);
assert.ok(gateRows.every(row => row.proofStatus === 'evidence_required'));
assert.ok(gateRows.every(row => row.gateExecutionPerformed === false));
assert.ok(gateRows.every(row => row.gatePassed === false));
assert.ok(gateRows.every(row => row.gateVerified === false));
assert.ok(gateRows.every(row => row.plannedScopeCount > 0));
assert.ok(gateRows.every(row => row.requiredFutureProofCount > 0));
assert.ok(gateRows.every(row => row.prohibitedOutputFieldCount > 0));
assert.ok(gateRows.every(row => row.readOnlySummary.includes('Read-only operational gate summary')));
assert.ok(gateRows.every(row => row.readOnlySummary.includes('no hosted run, deployment run, startup check, readiness check, rollback execution, incident execution, backup/restore execution, approval, status change, pilot evidence, or readiness evidence action is exposed')));

const summary = getHostedDeploymentOperationsPreparationSummary(snapshot);
assert.equal(summary.headline, 'Hosted, deployment, and operations preparation contracts');
assert.match(summary.summary, /modeled for review only/i);
assert.match(summary.summary, /AP approval remains ungranted/i);
assert.match(summary.summary, /no hosted\/deployment\/startup\/readiness execution is represented/i);
assert.equal(summary.environmentClassCount, HOSTED_ENVIRONMENT_CLASS_IDS.length);
assert.equal(summary.operationalGateCount, OPERATIONAL_GATE_CATEGORY_IDS.length);
assert.equal(summary.blockedClaimCount, snapshot.blockedReadinessClaims.length);
assert.equal(summary.apApprovalGranted, false);
assert.equal(summary.hostedExecutionApproved, false);
assert.equal(summary.hostedValidationPerformed, false);
assert.equal(summary.deploymentValidationPerformed, false);
assert.equal(summary.startupCheckPerformed, false);
assert.equal(summary.readinessCheckPerformed, false);
assert.equal(summary.rollbackExecutionPerformed, false);
assert.equal(summary.incidentExecutionPerformed, false);
assert.equal(summary.backupRestoreExecutionPerformed, false);
assert.equal(summary.pilotEvidenceProduced, false);
assert.equal(summary.readinessEvidenceProduced, false);
assert.deepEqual(summary.proofStatusSummary, proofSummary);
assert.match(summary.readOnlyNotice, /Read-only summary only/i);
assert.match(summary.readOnlyNotice, /no AP approval, hosted validation, deployment validation, startup check, readiness check, Supabase stack, Docker, DB\/RLS\/artifact execution, schema inspection, provider\/classifier execution, rollback execution, incident execution, backup\/restore execution, browser execution, workflow execution, export\/PDF\/download generation, storage access, screenshot capture, status change, pilot evidence, or readiness evidence action is exposed/i);

const presentationCopy = [
  ...environmentRows.flatMap(row => [row.label, row.proofStatusLabel, row.readOnlySummary]),
  ...gateRows.flatMap(row => [row.label, row.proofStatusLabel, row.readOnlySummary]),
  summary.headline,
  summary.summary,
  summary.readOnlyNotice,
].join('\n');

assert.doesNotMatch(presentationCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(presentationCopy, /\bhosted\s+ready\b|\bdeployment\s+ready\b|\bproduction\s+ready\b|\bsecurity\s+ready\b|\boperational\s+ready\b|\bpilot\s+ready\b/i);
assert.doesNotMatch(presentationCopy, /\benvironment[- ]verified\b|\bstartup\s+passed\b|\breadiness\s+check\s+passed\b/i);
assert.doesNotMatch(presentationCopy, /\brollback[- ]ready\b|\bincident[- ]ready\b|\bbackup[- ]ready\b|\brestore[- ]ready\b/i);
assert.doesNotMatch(presentationCopy, /\bRLS\s+(ready|verified|passed|active)\b|\btenant[- ]isolation\s+(ready|verified|proven|passed)\b|\bartifact\s+SELECT\s+(ready|verified|proven|passed)\b|\bschema\s+(ready|verified|proven|available)\b|\blocal\s+(ready|verified|proven)\b/i);
assert.doesNotMatch(presentationCopy, /\bcompliance\s+certified\b|\breadiness\s+evidence\s+(produced|created|available|accepted)\b/i);

console.log('M5.6b hosted/deployment/operations preparation presentation tests passed.');
