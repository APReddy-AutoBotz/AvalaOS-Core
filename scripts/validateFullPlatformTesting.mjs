import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveInventory,
  loadExecutionBindings,
  loadInventoryDocument,
  loadProofOwnerRegistry,
  loadSourceProvenance,
  validateSourceProvenance,
} from './exhaustiveAcceptanceModel.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDirectory, '..');
const definitionRoot = path.join(repoRoot, 'testing', 'full-platform');

const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const canonical = value => JSON.stringify(value);
const sorted = values => [...values].sort((left, right) => left.localeCompare(right));
const unique = values => [...new Set(values)];
const sha256 = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

export const fileSha256 = relativePath => sha256(fs.readFileSync(path.join(repoRoot, relativePath)));

export const caseGroupPaths = [
  'testing/full-platform/cases/public-sandbox.json',
  'testing/full-platform/cases/identity-tenant.json',
  'testing/full-platform/cases/assess-govern.json',
  'testing/full-platform/cases/studio-private-artifacts.json',
  'testing/full-platform/cases/delivery-monitor.json',
  'testing/full-platform/cases/intelligence-byok.json',
  'testing/full-platform/cases/trust-admin-operations.json',
  'testing/full-platform/cases/adversarial.json',
];

const requiredPersonaLabels = [
  'Process Analyst',
  'AP Process Owner',
  'Delivery Lead',
  'Control Reviewer',
  'Automation Contributor',
  'Buyer Viewer',
  'Platform Admin',
];

const requiredRelationshipIds = [
  'REL-IDENTITY-SCOPE',
  'REL-ASSESS-SCORING',
  'REL-GOVERN-APPROVAL',
  'REL-STUDIO-PRIVATE',
  'REL-DELIVERY-MONITOR',
  'REL-BYOK-ROUTING',
  'REL-INGEST-ASSESS',
  'REL-TRUST-OPERATIONS',
  'REL-BROWSER-SESSION',
  'REL-IDEMPOTENT-EFFECT',
];

const expectedGroupIds = caseGroupPaths.map(groupPath => path.basename(groupPath, '.json'));
const hostedExecutionCommand = ['npx', 'playwright', 'test', '--config=playwright.exhaustive-acceptance.config.ts'];

const parseVisibleViews = source => {
  const match = source.match(/export enum View\s*\{(?<body>[\s\S]*?)\n\}/u);
  if (!match?.groups?.body) return [];
  return [...match.groups.body.matchAll(/^\s*[A-Z_]+\s*=\s*'([^']+)'/gmu)].map(([, value]) => value);
};

export const loadCampaignDefinition = () => ({
  campaign: readJson('testing/full-platform/campaign.json'),
  views: readJson('testing/full-platform/views.json'),
  personas: readJson('testing/full-platform/personas.json'),
  world: readJson('testing/full-platform/synthetic-world.json'),
  providerPolicy: readJson('testing/full-platform/provider-budget-policy.json'),
  relationships: readJson('testing/full-platform/relationships.json'),
  groups: caseGroupPaths.map(readJson),
  catalog: readJson('tests/acceptance/catalog/test-catalog.json'),
  inventory: loadInventoryDocument(),
  bindings: loadExecutionBindings(),
  provenance: loadSourceProvenance(),
  proofOwners: loadProofOwnerRegistry(),
  viewSource: fs.readFileSync(path.join(repoRoot, 'types.ts'), 'utf8'),
  cleanupText: fs.readFileSync(path.join(definitionRoot, 'cleanup-and-rollback.md'), 'utf8'),
  campaignSchema: readJson('testing/full-platform/schemas/campaign.schema.json'),
  runEvidenceSchema: readJson('testing/full-platform/schemas/run-evidence.schema.json'),
});

const validateCampaignHeader = (definition, errors) => {
  const campaign = definition.campaign ?? {};
  const expectedSources = {
    canonicalCatalogSource: 'tests/acceptance/catalog/test-catalog.json',
    canonicalInventorySource: 'tests/acceptance/inventory.json',
    canonicalProvenanceSource: 'tests/acceptance/source-provenance.json',
    canonicalExecutionBindingsSource: 'tests/acceptance/execution-bindings.json',
    visibleViewSource: 'types.ts',
    personaSource: 'data/mockData.ts',
    outputRoot: 'output/full-platform',
    trackedDefinitionRoot: 'testing/full-platform',
  };
  if (campaign.schemaVersion !== 'avalaos-full-platform-campaign/v1') errors.push('campaign-schema-version');
  if (campaign.status !== 'planned_verification') errors.push('campaign-status-must-remain-planned');
  for (const [key, value] of Object.entries(expectedSources)) if (campaign[key] !== value) errors.push(`campaign-${key}`);
  if (campaign.outputRoot?.startsWith(campaign.trackedDefinitionRoot ?? 'testing/full-platform')) errors.push('generated-output-inside-tracked-definition');
  if (!fs.existsSync(path.join(repoRoot, campaign.rollbackDocument ?? 'missing'))) errors.push('rollback-document-missing');
  for (const [key, expected] of Object.entries({ visibleViews: 24, catalogCases: 108, catalogBranches: 108, personas: 7, organizations: 2, workspaces: 2 })) {
    if (campaign.requiredCounts?.[key] !== expected) errors.push(`required-count:${key}`);
  }
  for (const rule of ['catalogMembershipIsExecutionProof', 'suiteSuccessSynthesizesExactTestPass', 'uiVisibilityProvesServerAuthority', 'plannedScopeMayProducePass', 'compositeEvidenceMayOmitComponent']) {
    if (campaign.evidenceRules?.[rule] !== false) errors.push(`evidence-rule-fail-open:${rule}`);
  }
  for (const rule of ['exactHeadRequired', 'exactRunAttemptRequired', 'canonicalCommandRequired', 'tenantWorkspaceBindingRequired', 'sanitizedOutputsOnly']) {
    if (campaign.evidenceRules?.[rule] !== true) errors.push(`evidence-rule-disabled:${rule}`);
  }
};

const validateViews = (definition, errors) => {
  const declared = definition.views?.views?.map(item => item.view) ?? [];
  const sourceViews = parseVisibleViews(definition.viewSource ?? '');
  if (declared.length !== 24 || unique(declared).length !== 24) errors.push('visible-view-count');
  if (canonical(sorted(declared)) !== canonical(sorted(sourceViews))) errors.push('visible-view-source-drift');
  for (const item of definition.views?.views ?? []) {
    if (!['active', 'deferred', 'decision_pending'].includes(item.sourceStatus)) errors.push(`visible-view-status:${item.view ?? 'missing'}`);
  }
};

const validatePersonas = (definition, errors) => {
  const personas = definition.personas?.personas ?? [];
  const labels = personas.map(item => item.label);
  if (personas.length !== 7 || unique(labels).length !== 7 || canonical(sorted(labels)) !== canonical(sorted(requiredPersonaLabels))) errors.push('persona-matrix');
  for (const persona of personas) {
    if (!(persona.positiveCapabilities?.length > 0) || !(persona.negativeCapabilities?.length > 0)) errors.push(`persona-capability-pair:${persona.id ?? 'missing'}`);
    if (!(definition.views?.views ?? []).some(item => item.view === persona.representativeView)) errors.push(`persona-representative-view:${persona.id ?? 'missing'}`);
  }
};

const validateWorld = (definition, errors) => {
  const organizations = definition.world?.organizations ?? [];
  const workspaces = definition.world?.workspaces ?? [];
  if (organizations.length !== 2 || unique(organizations.map(item => item.organizationId)).length !== 2) errors.push('synthetic-world-organizations');
  if (workspaces.length !== 2 || unique(workspaces.map(item => item.workspaceId)).length !== 2) errors.push('synthetic-world-workspaces');
  for (const workspace of workspaces) {
    const owner = organizations.find(item => item.organizationId === workspace.organizationId);
    if (!owner || !owner.workspaceIds?.includes(workspace.workspaceId)) errors.push(`synthetic-world-workspace-owner:${workspace.workspaceId ?? 'missing'}`);
  }
  const pairs = definition.world?.requiredNegativePairs ?? [];
  if (pairs.length !== 2 || pairs.some(item => item.actorOrganizationId === item.targetOrganizationId || item.expected !== 'non_disclosing_denial')) errors.push('synthetic-world-negative-pairs');
};

const validateProviderPolicy = (definition, errors) => {
  const policy = definition.providerPolicy ?? {};
  const providers = policy.providers ?? [];
  if (canonical(sorted(providers.map(item => item.provider))) !== canonical(['groq', 'openai'])) errors.push('provider-policy-providers');
  if (providers.some(item => item.serverOnly !== true)) errors.push('provider-policy-server-only');
  const ceilings = policy.hardCeilings ?? {};
  if (policy.liveCallsEnabled === false) {
    for (const key of ['campaignRequests', 'requestsPerProvider', 'inputTokensPerRequest', 'outputTokensPerRequest', 'estimatedCampaignUsd']) {
      if (ceilings[key] !== null) errors.push(`provider-disabled-ceiling:${key}`);
    }
    if (providers.some(item => item.approvedModel !== null)) errors.push('provider-disabled-model');
  } else {
    for (const key of ['campaignRequests', 'requestsPerProvider', 'inputTokensPerRequest', 'outputTokensPerRequest', 'estimatedCampaignUsd', 'concurrency']) {
      if (!(typeof ceilings[key] === 'number' && Number.isFinite(ceilings[key]) && ceilings[key] > 0)) errors.push(`provider-live-ceiling:${key}`);
    }
    if (providers.some(item => typeof item.approvedModel !== 'string' || !item.approvedModel)) errors.push('provider-live-model');
  }
  const diagnostic = policy.localDiagnosticGate ?? {};
  const diagnosticModels = diagnostic.models ?? [];
  const diagnosticCeilings = diagnostic.hardCeilings ?? {};
  if (
    diagnostic.enabledByDefault !== false
    || diagnostic.evidenceBoundary !== 'local_nonproduction_diagnostic_not_pr255_acceptance'
    || diagnostic.execution !== 'serial_no_retry'
  ) errors.push('provider-diagnostic-boundary');
  if (canonical(diagnosticModels.map(item => [item.provider, item.model])) !== canonical([
    ['openai', 'gpt-4.1-nano'],
    ['groq', 'openai/gpt-oss-20b'],
  ])) errors.push('provider-diagnostic-models');
  if (
    diagnosticCeilings.campaignRequests !== 2
    || diagnosticCeilings.inputTokens !== 256
    || diagnosticCeilings.outputTokens !== 192
    || diagnosticCeilings.totalTokens !== 448
    || diagnosticCeilings.estimatedCampaignUsd !== 0.001
    || diagnosticCeilings.concurrency !== 1
  ) errors.push('provider-diagnostic-ceilings');
};

const validateRelationships = (definition, errors) => {
  const contracts = definition.relationships?.contracts ?? [];
  const ids = contracts.map(item => item.id);
  if (canonical(sorted(ids)) !== canonical(sorted(requiredRelationshipIds))) errors.push('relationship-contract-set');
  for (const contract of contracts) {
    if (!(contract.consumers?.length > 0) || !(contract.invariants?.length > 0) || !(contract.negativeCases?.length > 0)) errors.push(`relationship-incomplete:${contract.id ?? 'missing'}`);
  }
};

const validateCatalogCoverage = (definition, errors) => {
  const catalogCases = definition.catalog?.cases ?? [];
  const catalogIds = catalogCases.map(item => item.testId);
  const branches = catalogCases.flatMap(item => item.branchIds ?? []);
  if (catalogIds.length !== 108 || unique(catalogIds).length !== 108) errors.push('canonical-catalog-case-count');
  if (branches.length !== 108 || unique(branches).length !== 108) errors.push('canonical-catalog-branch-count');
  const groupIds = definition.groups?.map(item => item.groupId) ?? [];
  if (canonical(sorted(groupIds)) !== canonical(sorted(expectedGroupIds))) errors.push('case-group-set');
  const assignedIds = [];
  for (const group of definition.groups ?? []) {
    if (group.schemaVersion !== 'avalaos-full-platform-case-group/v1') errors.push(`case-group-schema:${group.groupId ?? 'missing'}`);
    if (group.status !== 'planned_verification') errors.push(`case-group-status:${group.groupId ?? 'missing'}`);
    if (group.canonicalMetadataSource !== 'tests/acceptance/catalog/test-catalog.json') errors.push(`case-group-catalog:${group.groupId ?? 'missing'}`);
    if ('coverageStatus' in group || 'outcome' in group || 'executed' in group) errors.push(`case-group-evidence-claim:${group.groupId ?? 'missing'}`);
    if (!(group.verificationLayers?.length > 0) || !(group.requiredVariations?.length > 0) || !(group.relationships?.length > 0)) errors.push(`case-group-incomplete:${group.groupId ?? 'missing'}`);
    for (const relationship of group.relationships ?? []) if (!requiredRelationshipIds.includes(relationship)) errors.push(`case-group-relationship:${group.groupId}:${relationship}`);
    assignedIds.push(...(group.testIds ?? []));
  }
  const duplicates = assignedIds.filter((item, index) => assignedIds.indexOf(item) !== index);
  if (duplicates.length) errors.push(`case-group-duplicates:${sorted(unique(duplicates)).join(',')}`);
  if (canonical(sorted(assignedIds)) !== canonical(sorted(catalogIds))) errors.push('case-group-catalog-coverage');

  const provenanceErrors = validateSourceProvenance(definition.catalog, definition.bindings, definition.provenance, repoRoot, definition.proofOwners);
  if (provenanceErrors.length) errors.push(`canonical-source-provenance:${provenanceErrors.join(',')}`);
  try {
    const inventory = deriveInventory(definition.catalog, definition.inventory, definition.provenance, definition.bindings);
    if (inventory.length !== 108 || inventory.some(item => item.coverageStatus !== 'SOURCE_BACKED')) errors.push('canonical-inventory-coverage');
  } catch (error) {
    errors.push(`canonical-inventory:${error instanceof Error ? error.message : String(error)}`);
  }
};

const validateSafetyDocuments = (definition, errors) => {
  if (!definition.campaignSchema || !definition.runEvidenceSchema) errors.push('schema-document-missing');
  for (const required of ['output/full-platform/<run-id>/', '.env.openai.local', '.env.groq.local', 'Do not rewrite scoring history']) {
    if (!definition.cleanupText?.includes(required)) errors.push(`cleanup-contract:${required}`);
  }
  const serialized = canonical({
    campaign: definition.campaign,
    views: definition.views,
    personas: definition.personas,
    world: definition.world,
    providerPolicy: definition.providerPolicy,
    relationships: definition.relationships,
    groups: definition.groups,
  });
  for (const pattern of [/\bsk-[A-Za-z0-9_-]{12,}\b/u, /\bgsk_[A-Za-z0-9_-]{12,}\b/u, /Bearer\s+[A-Za-z0-9._~-]{12,}/iu, /[?&](?:token|key|signature)=/iu]) {
    if (pattern.test(serialized)) errors.push('tracked-definition-sensitive-value');
  }
};

export const validateCampaignDefinition = definition => {
  const errors = [];
  validateCampaignHeader(definition, errors);
  validateViews(definition, errors);
  validatePersonas(definition, errors);
  validateWorld(definition, errors);
  validateProviderPolicy(definition, errors);
  validateRelationships(definition, errors);
  validateCatalogCoverage(definition, errors);
  validateSafetyDocuments(definition, errors);
  return errors;
};

const canonicalBindingKey = binding => `${binding.bindingKind}:${binding.ownerId}`;

export const expectedRunBindings = (testId, bindings) => {
  const expected = [];
  for (const retained of bindings.retainedSuites ?? []) {
    if (retained.testIds?.includes(testId)) expected.push({
      bindingKind: 'retained-assertion',
      ownerId: retained.suiteId,
      canonicalCommand: retained.command,
      assertionIds: [`${retained.suiteId}::${testId}`],
    });
  }
  for (const oracle of bindings.oracleTests ?? []) {
    if (oracle.testId !== testId) continue;
    const assertionId = (bindings.oracleExecution?.assertionIdFormat ?? '')
      .replace('{testId}', testId)
      .replace('{scenario}', oracle.scenario);
    expected.push({
      bindingKind: 'oracle-scenario',
      ownerId: oracle.scenario,
      canonicalCommand: bindings.oracleExecution?.command ?? [],
      assertionIds: assertionId ? [assertionId] : [],
    });
  }
  for (const hosted of bindings.hostedTests ?? []) {
    if (hosted.testId !== testId) continue;
    expected.push({
      bindingKind: 'hosted-scenario',
      ownerId: hosted.scenario,
      canonicalCommand: hostedExecutionCommand,
      assertionIds: (hosted.projects ?? []).map(project => `hosted::${testId}::${hosted.scenario}::${project}`),
    });
  }
  for (const server of bindings.serverTests ?? []) {
    if (server.testId !== testId) continue;
    expected.push({
      bindingKind: 'server-assertion',
      ownerId: server.suiteId,
      canonicalCommand: server.command,
      assertionIds: server.assertionIds ?? [`${server.suiteId}::${testId}`],
    });
  }
  return expected.sort((left, right) => canonicalBindingKey(left).localeCompare(canonicalBindingKey(right)));
};

const validateSourceProof = (testCase, proof, errors) => {
  const expected = sorted(testCase.sourceReference ?? []);
  const actual = sorted((proof ?? []).map(item => item.path));
  if (canonical(actual) !== canonical(expected)) {
    errors.push(`source-proof-paths:${testCase.testId}`);
    return;
  }
  for (const item of proof ?? []) {
    const resolved = path.resolve(repoRoot, item.path);
    if (!resolved.startsWith(`${repoRoot}${path.sep}`) || !fs.existsSync(resolved) || fileSha256(item.path) !== item.sha256) errors.push(`source-proof-digest:${testCase.testId}:${item.path}`);
  }
};

export const validateRunEvidence = (run, definition = loadCampaignDefinition()) => {
  const errors = [];
  if (run?.schemaVersion !== 'avalaos-full-platform-run-evidence/v1') errors.push('run-schema-version');
  if (run?.campaignId !== definition.campaign?.campaignId) errors.push('run-campaign-id');
  const identity = run?.executionIdentity ?? {};
  if (!/^[0-9a-f]{40}$/u.test(identity.headSha ?? '')) errors.push('run-head-sha');
  if (identity.runAttempt !== identity.latestRunAttempt) errors.push('stale-run-attempt');
  const workspace = (definition.world?.workspaces ?? []).find(item => item.workspaceId === identity.workspaceId);
  if (!workspace || workspace.organizationId !== identity.organizationId) errors.push('execution-scope-mismatch');

  const catalogCases = definition.catalog?.cases ?? [];
  const catalogById = new Map(catalogCases.map(item => [item.testId, item]));
  const testResults = run?.testResults ?? [];
  const resultIds = testResults.map(item => item.testId);
  const duplicateResultIds = unique(resultIds.filter((item, index) => resultIds.indexOf(item) !== index));
  if (duplicateResultIds.length) errors.push(`duplicate-test-results:${sorted(duplicateResultIds).join(',')}`);
  const coverage = run?.coverage ?? {};
  if (coverage.catalogCases !== catalogCases.length) errors.push('coverage-catalog-count');
  if (coverage.recordedTestIds !== unique(resultIds).length) errors.push('coverage-recorded-count');
  const hasExactCatalogCoverage = canonical(sorted(unique(resultIds))) === canonical(sorted(catalogCases.map(item => item.testId)));
  if (coverage.complete !== hasExactCatalogCoverage) errors.push('coverage-completeness-mismatch');
  if (run?.status === 'executed evidence' && !hasExactCatalogCoverage) errors.push('partial-campaign-executed-claim');

  for (const result of testResults) {
    const testCase = catalogById.get(result.testId);
    if (!testCase) {
      errors.push(`unknown-test-result:${result.testId ?? 'missing'}`);
      continue;
    }
    const expectedBindings = expectedRunBindings(result.testId, definition.bindings ?? {});
    const bindingResults = result.bindingResults ?? [];
    const expectedByKey = new Map(expectedBindings.map(binding => [canonicalBindingKey(binding), binding]));
    const actualKeys = bindingResults.map(canonicalBindingKey);
    const duplicateBindingKeys = unique(actualKeys.filter((item, index) => actualKeys.indexOf(item) !== index));
    if (duplicateBindingKeys.length) errors.push(`duplicate-binding-results:${result.testId}:${sorted(duplicateBindingKeys).join(',')}`);
    if (canonical(sorted(actualKeys)) !== canonical(sorted([...expectedByKey.keys()]))) {
      errors.push(`canonical-binding-set:${result.testId}`);
      if (expectedBindings.length > 1) errors.push(`composite-binding-incomplete:${result.testId}`);
    }
    for (const bindingResult of bindingResults) {
      const binding = expectedByKey.get(canonicalBindingKey(bindingResult));
      if (!binding) continue;
      if (canonical(bindingResult.canonicalCommand) !== canonical(binding.canonicalCommand)) errors.push(`canonical-command:${result.testId}:${canonicalBindingKey(bindingResult)}`);
      const outcomes = bindingResult.assertionOutcomes ?? [];
      const outcomeIds = outcomes.map(item => item.assertionId);
      if (!outcomes.length || unique(outcomeIds).length !== outcomeIds.length) errors.push(`assertion-outcome-set:${result.testId}:${canonicalBindingKey(bindingResult)}`);
      if (bindingResult.suiteExitCode === 0 && outcomes.some(item => item.outcome === 'skipped' || item.outcome === 'not_run')) errors.push(`green-suite-skipped-assertion:${result.testId}`);
      if (result.status === 'executed evidence' && (bindingResult.suiteExitCode !== 0 || outcomes.length === 0 || outcomes.some(item => item.outcome !== 'passed'))) errors.push(`assertion-not-passed:${result.testId}`);
      if (canonical(sorted(outcomeIds)) !== canonical(sorted(binding.assertionIds))) errors.push(`canonical-assertions:${result.testId}:${canonicalBindingKey(bindingResult)}`);
    }
    if (result.status === 'executed evidence' && bindingResults.length !== expectedBindings.length) errors.push(`assertion-not-passed:${result.testId}`);
    validateSourceProof(testCase, result.sourceProof, errors);
  }

  if (
    run?.status === 'executed evidence'
    && testResults.some(item => item.status !== 'executed evidence')
  ) errors.push('campaign-status-not-derived');

  const browser = run?.browserSession ?? {};
  const personaSensitive = ['SANDBOX-003', 'SANDBOX-004', 'SANDBOX-007', 'SANDBOX-008', 'SANDBOX-009'];
  if (personaSensitive.some(testId => browser.testIds?.includes(testId))) {
    if (canonical(sorted(browser.personasCompleted ?? [])) !== canonical(sorted(requiredPersonaLabels))) errors.push('browser-partial-persona-coverage');
  }
  const observer = browser.observer ?? {};
  if (observer.startedBeforeEntry !== true || observer.endedAfterSignOutQuietWindow !== true || observer.quietWindowRestartedOnLateRequest !== true) errors.push('browser-observer-window');
  if ((observer.postObserverProviderRequests ?? []).length !== 0) errors.push('post-observer-provider-traffic');
  const sandboxRoute = (browser.routeAssertions ?? []).find(item => item.pathClass === 'sandbox_descendant');
  if (!sandboxRoute || sandboxRoute.classification !== 'accepted_synthetic') errors.push('accepted-denied-route-confusion');

  const sanitization = run?.sanitization ?? {};
  for (const key of ['rawSecrets', 'rawPrompts', 'rawResponses', 'rawLogs', 'signedUrls', 'customerData', 'realProviderIdentifiers', 'productionIdentifiers']) {
    if (sanitization[key] !== false) errors.push(`sanitization:${key}`);
  }
  return errors;
};

export const validateFullPlatformTesting = () => validateCampaignDefinition(loadCampaignDefinition());

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const errors = validateFullPlatformTesting();
  if (errors.length) {
    console.error(`Full-platform campaign validation failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Full-platform campaign validation passed: 24 views, 108 canonical acceptance cases, 7 personas, 2 organizations, 2 workspaces, fail-closed provider and evidence contracts.');
  }
}
