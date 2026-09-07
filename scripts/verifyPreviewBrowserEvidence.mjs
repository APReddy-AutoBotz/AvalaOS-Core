import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTROLLED_PREVIEW_BRANCH,
  CONTROLLED_PREVIEW_ORIGIN,
  CONTROLLED_PREVIEW_PR,
  CONTROLLED_PREVIEW_PROJECTS,
  CONTROLLED_PREVIEW_SCENARIOS,
  CONTROLLED_PREVIEW_WORKFLOW,
  CONTROLLED_PREVIEW_EVIDENCE_PROFILE,
  controlledPreviewTitle,
} from './previewBrowserEvidenceContract.mjs';

const SHA = /^[0-9a-f]{40}$/u;
const DEPLOY_ID = /^[0-9a-f]{24}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const RUN_ATTEMPT = /^[1-9][0-9]{0,9}$/u;

const canonical = value => JSON.stringify(value, Object.keys(value ?? {}).sort());
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const immutableDeployOrigin = deployId => `https://${deployId}--avalaos-pilot.netlify.app`;

const collectResults = report => {
  const results = [];
  const walk = suite => {
    for (const spec of suite?.specs ?? []) {
      for (const item of spec?.tests ?? []) {
        results.push({
          title: spec.title,
          project: item.projectName,
          expectedStatus: item.expectedStatus,
          status: item.status,
          annotations: item.annotations,
          attempts: item.results ?? [],
        });
      }
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return results;
};

export const validateControlledPreviewResultInventory = ({ report, expected }) => {
  const errors = [];
  const profile = CONTROLLED_PREVIEW_EVIDENCE_PROFILE;
  if (!report || typeof report !== 'object' || Array.isArray(report)) return ['controlled-preview-report-invalid'];
  if (!Array.isArray(report.errors) || report.errors.length !== 0) errors.push('controlled-preview-report-errors');
  const metadata = report.config?.metadata;
  const expectedMetadataKeys = [
    'actualWorkers',
    'canonicalAlias',
    'ci',
    'configPath',
    'deployId',
    'evidenceKind',
    'exactCommand',
    'exactHead',
    'executionKind',
    'immutableDeployOriginDigest',
    'previewEvidenceKind',
    'schemaVersion',
    'sourcePaths',
    'targetOrigin',
    'titlePrefix',
    'workflowRuntime',
  ].sort();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
    || canonical(Object.keys(metadata).sort()) !== canonical(expectedMetadataKeys)
    || metadata.actualWorkers !== 1) errors.push('controlled-preview-metadata-shape');
  if (!metadata?.ci || typeof metadata.ci !== 'object' || Array.isArray(metadata.ci)
    || Object.keys(metadata.ci).length !== 0) errors.push('controlled-preview-ci-metadata');
  if (metadata?.schemaVersion !== 'acceptance-report-profile-v1') errors.push('controlled-preview-metadata-schema');
  if (metadata?.previewEvidenceKind !== profile.evidenceKind) errors.push('controlled-preview-evidence-kind');
  if (metadata?.executionKind !== profile.executionKind) errors.push('controlled-preview-execution-kind');
  if (metadata?.evidenceKind !== 'hosted-preview-acceptance') errors.push('controlled-preview-hosted-profile-kind');
  if (metadata?.titlePrefix !== profile.titlePrefix) errors.push('controlled-preview-title-prefix');
  if (metadata?.configPath !== profile.configPath) errors.push('controlled-preview-config');
  if (metadata?.exactHead !== expected.releaseSha) errors.push('controlled-preview-head');
  if (metadata?.deployId !== expected.deployId) errors.push('controlled-preview-deploy');
  if (metadata?.targetOrigin !== CONTROLLED_PREVIEW_ORIGIN || metadata?.canonicalAlias !== CONTROLLED_PREVIEW_ORIGIN) errors.push('controlled-preview-origin');
  if (metadata?.immutableDeployOriginDigest !== digest(immutableDeployOrigin(expected.deployId))) errors.push('controlled-preview-immutable-origin');
  if (canonical(metadata?.exactCommand) !== canonical(['npx', 'playwright', 'test', '--config=playwright.controlled-preview-boundary.config.ts', '--workers=1'])) errors.push('controlled-preview-command');
  if (canonical(metadata?.sourcePaths) !== canonical(['tests/browser/controlledPreviewBoundary.spec.ts', 'scripts/previewBrowserEvidenceContract.mjs'])) errors.push('controlled-preview-source');
  if (expected.executionKind !== profile.executionKind) errors.push('controlled-preview-expected-execution-kind');
  if (expected.artifactPath !== profile.artifactPath || expected.configPath !== profile.configPath) errors.push('controlled-preview-artifact-binding');
  if (!SHA.test(expected.releaseSha ?? '') || !DEPLOY_ID.test(expected.deployId ?? '')) errors.push('controlled-preview-identity-shape');
  if (expected.workflowPath !== CONTROLLED_PREVIEW_WORKFLOW
    || expected.githubActions !== 'true'
    || expected.eventName !== 'pull_request'
    || expected.prNumber !== CONTROLLED_PREVIEW_PR
    || expected.headRef !== CONTROLLED_PREVIEW_BRANCH
    || expected.headRepository !== expected.repository
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(expected.repository ?? '')
    || !RUN_ID.test(String(expected.runId ?? ''))
    || !RUN_ATTEMPT.test(String(expected.runAttempt ?? ''))) {
    errors.push('controlled-preview-workflow-source');
  }
  const workflowRuntime = metadata?.workflowRuntime;
  const expectedRuntimeKeys = [
    'authority', 'eventName', 'headRef', 'headRepository', 'prNumber', 'releaseSha',
    'repository', 'runAttempt', 'runId', 'workflowPath', 'workflowRef', 'workflowSha',
  ].sort();
  if (!workflowRuntime || typeof workflowRuntime !== 'object' || Array.isArray(workflowRuntime)
    || canonical(Object.keys(workflowRuntime).sort()) !== canonical(expectedRuntimeKeys)
    || workflowRuntime.authority !== 'github-actions'
    || workflowRuntime.workflowPath !== expected.workflowPath
    || workflowRuntime.workflowRef !== expected.workflowRef
    || workflowRuntime.repository !== expected.repository
    || workflowRuntime.eventName !== expected.eventName
    || workflowRuntime.runId !== String(expected.runId)
    || workflowRuntime.runAttempt !== String(expected.runAttempt)
    || workflowRuntime.workflowSha !== expected.workflowSha
    || workflowRuntime.releaseSha !== expected.releaseSha
    || workflowRuntime.prNumber !== expected.prNumber
    || workflowRuntime.headRef !== expected.headRef
    || workflowRuntime.headRepository !== expected.headRepository
    || !SHA.test(workflowRuntime.workflowSha ?? '')
    || typeof expected.workflowRef !== 'string'
    || !expected.workflowRef.startsWith(`${expected.repository}/${CONTROLLED_PREVIEW_WORKFLOW}@refs/`)) {
    errors.push('controlled-preview-workflow-runtime');
  }

  const actual = collectResults(report);
  const expectedKeys = CONTROLLED_PREVIEW_PROJECTS.flatMap(project =>
    CONTROLLED_PREVIEW_SCENARIOS.map(scenario => `${project}\0${controlledPreviewTitle(scenario)}`));
  const actualKeys = actual.map(item => `${item.project}\0${item.title}`);
  if (actual.length === 0 || actual.length !== expectedKeys.length) errors.push('controlled-preview-result-count');
  if (new Set(actualKeys).size !== actualKeys.length
    || canonical([...actualKeys].sort()) !== canonical([...expectedKeys].sort())) errors.push('controlled-preview-result-inventory');
  for (const item of actual) {
    const key = `${item.project}:${item.title}`;
    if (!item.title.startsWith(`${profile.titlePrefix} `)) errors.push(`controlled-preview-result-prefix:${key}`);
    if (!CONTROLLED_PREVIEW_PROJECTS.includes(item.project)) errors.push(`controlled-preview-result-project:${key}`);
    if (item.expectedStatus !== 'passed' || item.status !== 'expected') errors.push(`controlled-preview-result-status:${key}`);
    if (!Array.isArray(item.annotations) || item.annotations.length !== 0) errors.push(`controlled-preview-result-annotation:${key}`);
    if (item.attempts.length !== 1
      || item.attempts[0]?.status !== 'passed'
      || (item.attempts[0]?.retry ?? 0) !== 0
      || item.attempts[0]?.error
      || (Array.isArray(item.attempts[0]?.errors) && item.attempts[0].errors.length > 0)) {
      errors.push(`controlled-preview-result-attempt:${key}`);
    }
    if ((item.attempts[0]?.attachments ?? []).length !== 0) errors.push(`controlled-preview-result-attachment:${key}`);
  }
  return [...new Set(errors)];
};

export const buildControlledPreviewResultInventory = ({ report, expected }) => {
  const errors = validateControlledPreviewResultInventory({ report, expected });
  if (errors.length) throw new Error(`CONTROLLED_PREVIEW_RESULT_INVENTORY_REJECTED:${errors.join(',')}`);
  const profile = CONTROLLED_PREVIEW_EVIDENCE_PROFILE;
  const results = collectResults(report).map(item => {
    const scenario = CONTROLLED_PREVIEW_SCENARIOS.find(value => item.title === controlledPreviewTitle(value));
    return { scenarioId: scenario.id, project: item.project, status: 'PASS' };
  }).sort((left, right) => `${left.project}:${left.scenarioId}`.localeCompare(`${right.project}:${right.scenarioId}`));
  return {
    schemaVersion: 'preview-browser-result-inventory-v1',
    evidenceKind: profile.evidenceKind,
    executionKind: profile.executionKind,
    titlePrefix: profile.titlePrefix,
    exactHead: expected.releaseSha,
    deployId: expected.deployId,
    workflowPath: expected.workflowPath,
    workflowRunId: String(expected.runId),
    workflowRunAttempt: String(expected.runAttempt),
    configPath: profile.configPath,
    sourceArtifactPath: profile.artifactPath,
    controlledHumanDisposition: 'not_run',
    summary: { total: results.length, passed: results.length, failed: 0, blocked: 0, skipped: 0 },
    results,
    inventoryDigest: digest(JSON.stringify(results)),
  };
};

const parseArgs = argv => {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('CONTROLLED_PREVIEW_RESULT_INVENTORY_USAGE');
    result[key.slice(2)] = value;
  }
  return result;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const profile = CONTROLLED_PREVIEW_EVIDENCE_PROFILE;
  if (args.report !== profile.artifactPath || args.output !== profile.inventoryPath) throw new Error('CONTROLLED_PREVIEW_RESULT_INVENTORY_PATH');
  const report = JSON.parse(readFileSync(path.resolve(args.report), 'utf8'));
  const expected = {
    releaseSha: process.env.EXPECTED_RELEASE_SHA,
    deployId: process.env.EXPECTED_NETLIFY_DEPLOY_ID,
    executionKind: process.env.ACCEPTANCE_EXECUTION_KIND,
    artifactPath: args.report,
    configPath: profile.configPath,
    workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
    githubActions: process.env.GITHUB_ACTIONS,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    workflowSha: process.env.GITHUB_SHA,
    eventName: process.env.GITHUB_EVENT_NAME,
    prNumber: Number(process.env.PR_NUMBER),
    headRef: process.env.PR_HEAD_REF,
    headRepository: process.env.PR_HEAD_REPOSITORY,
    repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  const inventory = buildControlledPreviewResultInventory({ report, expected });
  writeFileSync(path.resolve(args.output), `${JSON.stringify(inventory, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: 'verified', evidenceKind: inventory.evidenceKind, total: inventory.summary.total, digest: inventory.inventoryDigest }));
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch { process.stderr.write('CONTROLLED_PREVIEW_RESULT_INVENTORY_REJECTED\n'); process.exitCode = 1; }
}
