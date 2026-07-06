import assert from 'node:assert/strict';

import {
  EXPORT_ARTIFACT_TYPES,
  EXPORT_PROHIBITED_METADATA_FIELDS,
  buildExportArtifactControlSnapshot,
} from './exportArtifactControlModel';
import {
  getExportArtifactBoundaryRows,
  getExportArtifactReadOnlySummary,
  getExportArtifactStatusLabel,
  getStorageAccessPolicyRows,
  summarizeExportArtifactStatuses,
} from './exportArtifactControlPresentation';

console.log('Running M5.5c export artifact control presentation tests...');

const snapshot = buildExportArtifactControlSnapshot();

assert.equal(getExportArtifactStatusLabel('model_only'), 'Model Only');
assert.equal(getExportArtifactStatusLabel('planned'), 'Planned');
assert.equal(getExportArtifactStatusLabel('blocked'), 'Blocked');
assert.equal(getExportArtifactStatusLabel('evidence_required'), 'Evidence Required');
assert.equal(getExportArtifactStatusLabel('generated'), 'Generated');

const statusSummary = summarizeExportArtifactStatuses(snapshot);
assert.deepEqual(statusSummary.map(summary => summary.status), [
  'model_only',
  'planned',
  'blocked',
  'evidence_required',
  'generated',
]);
assert.equal(statusSummary.find(summary => summary.status === 'generated')?.count, 0);
assert.equal(statusSummary.reduce((total, summary) => total + summary.count, 0), snapshot.exportBoundaryContracts.length);

const artifactRows = getExportArtifactBoundaryRows(snapshot);
assert.equal(artifactRows.length, EXPORT_ARTIFACT_TYPES.length);
assert.ok(artifactRows.every(row => row.modelOnly));
assert.ok(artifactRows.every(row => row.artifactGenerated === false));
assert.ok(artifactRows.every(row => row.apApprovalRequiredBeforeExecution));
assert.ok(artifactRows.every(row => row.allowedMetadataFieldCount > 0));
assert.ok(artifactRows.every(row => row.prohibitedMetadataFieldCount === EXPORT_PROHIBITED_METADATA_FIELDS.length));
assert.ok(artifactRows.every(row => row.requiredFutureProofCount > 0));
assert.ok(artifactRows.every(row => row.sourceEvidenceReferenceCount > 0));
assert.ok(artifactRows.every(row => row.readOnlySummary.includes('Read-only export/artifact summary')));
assert.ok(artifactRows.every(row => row.readOnlySummary.includes('no export, PDF, download, storage write, signed URL, approval, browser, screenshot, status-change, or readiness evidence action is exposed')));
assert.ok(artifactRows.every(row => row.prohibitedOutputSummary.includes('remain prohibited')));
assert.ok(artifactRows.some(row => row.id === 'buyer_acceptance_pack_pdf' && row.artifactStatus === 'blocked'));
assert.ok(artifactRows.some(row => row.id === 'trust_center_export' && row.artifactStatus === 'evidence_required'));

const storageRows = getStorageAccessPolicyRows(snapshot);
assert.equal(storageRows.length, snapshot.storageAccessPolicies.length);
assert.ok(storageRows.every(row => row.modelOnly));
assert.ok(storageRows.every(row => row.liveStorageAccessAllowed === false));
assert.ok(storageRows.every(row => row.liveSignedUrlGenerationAllowed === false));
assert.ok(storageRows.every(row => row.privateStorageRequired));
assert.ok(storageRows.every(row => row.accessRoleCount > 0));
assert.ok(storageRows.every(row => row.auditMetadataFieldCount > 0));
assert.ok(storageRows.every(row => row.prohibitedMetadataFieldCount === EXPORT_PROHIBITED_METADATA_FIELDS.length));
assert.ok(storageRows.every(row => row.readOnlySummary.includes('Read-only storage policy summary')));
assert.ok(storageRows.every(row => row.readOnlySummary.includes('no live storage access, storage object, signed URL, public link, file output, or readiness evidence action is exposed')));

const presentationCopy = [
  ...artifactRows.flatMap(row => [
    row.label,
    row.artifactStatusLabel,
    row.readOnlySummary,
    row.prohibitedOutputSummary,
  ]),
  ...storageRows.flatMap(row => [
    row.label,
    row.readOnlySummary,
  ]),
].join('\n');

assert.doesNotMatch(presentationCopy, /Avala Govern Lite|Avala Delivery Lite/);
assert.doesNotMatch(presentationCopy, /\bproduction ready\b|\bhosted ready\b|\bdeployment ready\b|\bsecurity ready\b|\bbuyer ready\b|\bproduct ready\b/i);
assert.doesNotMatch(presentationCopy, /\bbrowser walkthrough complete\b|\bscreenshot proof captured\b|\bexport ready\b|\bPDF ready\b|\bdownload ready\b|\bstorage ready\b|\bartifact storage ready\b/i);
assert.doesNotMatch(presentationCopy, /\bapproval workflow ready\b|\bworkflow ready\b|\bcompliance certified\b/i);

const adminSummary = getExportArtifactReadOnlySummary(snapshot);
assert.equal(adminSummary.headline, 'Export and artifact storage control contracts');
assert.match(adminSummary.summary, /modeled for review only/i);
assert.match(adminSummary.summary, /AP approval remains ungranted/i);
assert.equal(adminSummary.artifactContractCount, snapshot.exportBoundaryContracts.length);
assert.equal(adminSummary.storagePolicyCount, snapshot.storageAccessPolicies.length);
assert.equal(adminSummary.blockedClaimCount, snapshot.blockedReadinessClaims.length);
assert.equal(adminSummary.generatedArtifactsAllowed, false);
assert.equal(adminSummary.liveStorageExecutionAllowed, false);
assert.equal(adminSummary.liveSignedUrlGenerationAllowed, false);
assert.deepEqual(adminSummary.artifactStatusSummary, statusSummary);
assert.match(adminSummary.readOnlyNotice, /Read-only summary only/i);
assert.match(adminSummary.readOnlyNotice, /no export, PDF, download, storage write, signed URL, approval, browser, screenshot, status change, or readiness evidence action is exposed/i);

console.log('M5.5c export artifact control presentation tests passed.');
