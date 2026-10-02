import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { campaignRoot, loadSyntheticAiModules } from './loadSyntheticAiModules.mjs';
import { assessFixture, fixtureId, fixtureOrg, studioFixture } from './syntheticAiCampaignFixtures.mjs';
import { campaignFetch, initializeCampaign, inspectCampaign, POLICY } from './syntheticAiCampaignBudget.mjs';
import { evaluateSyntheticStudioFacts } from './syntheticAiCampaignOracle.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const keyReference = 'AVALA_PROVIDER_SECRET_OPENAI_11111111111141118111111111111111_QA';
const directory = join(campaignRoot, 'output/testing/synthetic-ai-campaign-20260917');
function fingerprint() {
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: campaignRoot, encoding: 'utf8', windowsHide: true }).split('\0')
    .filter(p => /^(supabase\/functions\/|services\/|scripts\/)/.test(p) && /\.(?:ts|mjs)$/.test(p));
  return hash(JSON.stringify([...new Set(paths)].sort().map(p => [p, hash(readFileSync(join(campaignRoot, p), 'utf8').replace(/\r\n/g, '\n'))])));
}
export async function runSyntheticAiCampaign(argv = process.argv.slice(2)) {
  const execute = argv.includes('--execute');
  const kind = argv.find(a => a.startsWith('--case='))?.slice(7) || 'assess';
  const attempt = argv.find(a => a.startsWith('--attempt='))?.slice(10) || 'corrected-1';
  if (argv.some(a => a !== '--execute' && !/^--case=(assess|pdd|brd|frd)$/.test(a) && !/^--attempt=[a-z0-9-]{1,30}$/.test(a)) || !/^[a-z0-9-]{1,30}$/.test(attempt) || !['assess','pdd','brd','frd'].includes(kind)) throw new Error('SYNTHETIC_CAMPAIGN_ARGUMENT_REJECTED');
  const sourceDigest = fingerprint();
  const api = await loadSyntheticAiModules();
  const capability = kind === 'assess' ? 'assess.evidence.extract' : 'studio.document.generate';
  const decision = { status: 'allowed', futureSecretLookupEligible: true, provider: 'openai', routeId: fixtureId(8), providerConfigId: fixtureId(9), keyRefId: fixtureId(10), keyRefResolverType: 'server_reference', operation: capability, capability, mode: 'pilot', orgId: fixtureOrg, workspaceId: fixtureId(11), actorId: fixtureId(12), correlationId: 'local-component-only', policyResult: 'allowed', model: POLICY.model, auditEvent: {} };
  const material = kind === 'assess' ? assessFixture() : await studioFixture(api.loadStudioGenerationMaterial, POLICY.model, kind);
  assert.equal(sourceDigest, fingerprint());
  if (!execute) {
    console.log(JSON.stringify({ status: 'PREFLIGHT_PASS', kind, sourceDigest, noProviderCalls: true, productionMaterialLoader: kind !== 'assess' })); return;
  }
  if (!process.env[keyReference]?.startsWith('sk-')) throw new Error('SYNTHETIC_CAMPAIGN_KEY_UNAVAILABLE');
  mkdirSync(directory, { recursive: true });
  initializeCampaign(directory);
  const operationId = `${kind === 'assess' ? 'assess' : 'studio'}-${kind}-${attempt}`;
  const output = join(directory, `${operationId}.json`);
  if (existsSync(output)) throw new Error('SYNTHETIC_CAMPAIGN_ATTEMPT_RETAINED');
  const report = { schema: 1, kind, attempt, sourceDigest, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: campaignRoot, encoding: 'utf8', windowsHide: true }).trim(), evidenceKind: 'real-provider-component-only', hostedProof: false, syntheticAuthority: true, status: 'running', checks: {}, error: null };
  const retain = () => writeFileSync(output, JSON.stringify(report, null, 2));
  writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('SYNTHETIC_UNEXPECTED_NETWORK'); };
  const deps = {
    secretBackend: new api.EnvironmentProviderSecretBackend(name => name === keyReference ? process.env[keyReference] : undefined),
    lookupKeyRef: async () => ({ id: fixtureId(10), org_id: fixtureOrg, provider: 'openai', resolver_type: 'server_reference', secret_ref: keyReference, status: 'active' }),
    fetchImpl: async (url, init) => { assert.equal(sourceDigest, fingerprint()); return campaignFetch(directory, operationId, url, init, realFetch); },
  };
  try {
    if (kind === 'assess') {
      const { source, target } = material;
      const result = await api.runGovernedProviderRequest({ provider: 'openai', model: POLICY.model, capability,
        untrustedSource: api.frameAssessMappingSources([source], [target]), taskInstruction: api.buildAssessDocumentMappingTaskInstruction([target]), maxOutputTokens: 1500, timeoutMs: 60000,
        authorization: { organizationId: fixtureOrg, workspaceId: fixtureId(11), actorId: fixtureId(12), providerConfigId: fixtureId(9), capability, routeEnabled: true, resolverDecision: decision } }, deps);
      const decoded = await api.decodeGroundedAssessMappingProposalResult({ value: api.parseJsonObjectResponse(result.output), targets: [target], sources: [source], createProposalId: () => fixtureId(80) });
      report.checks = { oneGroundedProposal: decoded.proposals.length === 1, noRejectedProposals: decoded.warnings.length === 0,
        correctTarget: decoded.proposals.every(p => p.targetSelectorId === target.selectorId),
        invoiceExceptions: decoded.proposals.some(p => /invoice exceptions/i.test(String(p.proposedValue))), purchaseOrders: decoded.proposals.some(p => /purchase orders/i.test(String(p.proposedValue))) };
    } else {
      const result = await api.callStudioArtifactProvider({ organizationId: fixtureOrg, workspaceId: fixtureId(11), actorId: fixtureId(12), plan: material.providerPlan,
        sourcePackage: material.sourcePackage, templatePayload: material.templatePayload, selectedSourceVersionIds: material.selectedSourceVersionIds, canonicalSourceAnchors: material.sourceAnchors, manualBrief: material.manualBrief, maximumOutputTokens: POLICY.outputLimit, timeoutMs: 60000 }, { runGateway: input => api.runGovernedProviderRequest(input, deps) });
      const expected = api.normalizeStudioArtifactTemplate(material.templatePayload);
      const sections = Array.isArray(result.content.sections) ? result.content.sections : [];
      const anchorKey = a => JSON.stringify([a?.sourceVersionId, a?.locator, a?.anchorHash]);
      const canonicalAnchors = new Set(material.sourceAnchors.map(anchorKey));
      report.diagnostics = {
        contractVersion: result.content.contractVersion === 'studio-artifact-2',
        sectionCount: sections.length,
        templateCount: expected.sections.length,
        sectionIdsMatch: sections.every((s, i) => s.id === expected.sections[i]?.id),
        sectionTitlesMatch: sections.every((s, i) => s.title === expected.sections[i]?.title),
        bodiesNonempty: sections.every(s => typeof s.body === 'string' && s.body.trim().length > 0),
        uniqueBodies: new Set(sections.map(s => String(s.body).trim().replace(/\s+/g, ' ').toLowerCase())).size === sections.length,
        anchorsCanonical: sections.every(s => Array.isArray(s.sourceAnchors) && s.sourceAnchors.every(a => canonicalAnchors.has(anchorKey(a)))),
        anchorCount: sections.reduce((n, s) => n + (s.sourceAnchors?.length || 0), 0),
        selectedCoverage: JSON.stringify(result.content.coverage?.selectedSourceVersionIds) === JSON.stringify(material.selectedSourceVersionIds),
        coveredCoverage: JSON.stringify(result.content.coverage?.coveredSourceVersionIds) === JSON.stringify(material.selectedSourceVersionIds),
        complete: result.content.coverage?.complete === true,
      };
      api.validateStudioDraft(result.content, material.selectedSourceVersionIds, material.sourceAnchors, material.templatePayload);
      const syntheticDraft = result.content.sections.map(({ id, title, body }) => ({ id, title, body }));
      const safeDraft = JSON.stringify({ summary: result.content.summary, sections: syntheticDraft });
      if (safeDraft.length > 50000 || /sk-[a-z0-9]|bearer\s|https?:\/\/|[a-z0-9._%+-]+@[a-z0-9.-]+/i.test(safeDraft)) throw new Error('SYNTHETIC_DRAFT_RETENTION_REJECTED');
      report.syntheticDraft = syntheticDraft;
      report.syntheticSummary = result.content.summary;
      report.checks = { productionMaterialLoaded: true, strictTemplateAndCoverage: true, ...evaluateSyntheticStudioFacts(result.content) };
    }
    report.status = Object.values(report.checks).every(Boolean) ? 'passed' : 'failed';
  } catch (error) {
    report.status = 'failed'; report.error = typeof error?.code === 'string' && /^[A-Z_]{3,80}$/.test(error.code) ? error.code : 'OUTPUT_OR_CAMPAIGN_VALIDATION_FAILED';
  } finally {
    globalThis.fetch = realFetch; retain();
  }
  const ledger = inspectCampaign(directory);
  console.log(JSON.stringify({ ...report, ledger: { carryNanos: ledger.carryNanos, chargedNanos: ledger.entries.reduce((n, e) => n + e.chargedNanos, ledger.carryNanos), usage: ledger.entries.find(e => e.id === operationId)?.usage || null, invoiceVerified: false } }));
  if (report.status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runSyntheticAiCampaign(); } catch { console.error('SYNTHETIC_CAMPAIGN_PREFLIGHT_REJECTED'); process.exitCode = 1; }
}
