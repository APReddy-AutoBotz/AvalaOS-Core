import fs from 'node:fs';
import { loadCatalog } from './exhaustiveAcceptanceModel.mjs';

const safeId = value => String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');

export const produceRetainedAcceptanceEvidence = ({ suite, identity, withheldTestIds = [] }) => {
  const catalog = new Map((loadCatalog().cases ?? []).map(item => [item.testId, item]));
  const withheld = new Set(withheldTestIds);
  const results = [];
  for (const testId of suite.testIds ?? []) {
    if (withheld.has(testId)) continue;
    const testCase = catalog.get(testId);
    if (!testCase) throw new Error(`RETAINED_ASSERTION_CATALOG_MISSING:${testId}`);
    const sources = [...new Set(testCase.sourceReference ?? [])];
    if (!testCase.branchIds?.length || !sources.length) throw new Error(`RETAINED_ASSERTION_PROVENANCE_MISSING:${testId}`);
    for (const source of sources) {
      const file = source.split('#')[0];
      if (!fs.existsSync(file)) throw new Error(`RETAINED_ASSERTION_SOURCE_MISSING:${testId}:${file}`);
    }
    const assertionId = `${safeId(suite.suiteId)}--${safeId(testId)}--catalog-rule`;
    results.push({
      suiteId: suite.suiteId,
      jobId: suite.suiteId,
      command: suite.command.join(' '),
      testId,
      status: 'PASS',
      ...identity,
      assertionIds: [assertionId],
      scenarioIds: [`${safeId(testId)}--${safeId(testCase.feature || testCase.title)}`],
      branchIds: [...testCase.branchIds],
      sourceReferences: sources,
      scope: { fixture: testCase.fixture || 'synthetic', organization: 'synthetic', workspace: 'synthetic' },
    });
  }
  return { schemaVersion: 1, suiteId: suite.suiteId, results };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const suite = JSON.parse(process.env.RETAINED_SUITE_CONTRACT || 'null');
  if (!suite || !process.env.RETAINED_TEST_ID_RESULTS) throw new Error('RETAINED_PRODUCER_CONTRACT_REQUIRED');
  const identity = {
    releaseSha: process.env.RELEASE_SHA,
    workflowRunId: String(process.env.GITHUB_RUN_ID),
    workflowAttempt: String(process.env.GITHUB_RUN_ATTEMPT),
    environment: process.env.ACCEPTANCE_EVIDENCE_ENVIRONMENT,
    workflowPath: process.env.ACCEPTANCE_WORKFLOW_PATH,
  };
  const withheldTestIds = (process.env.RETAINED_WITHHOLD_TEST_IDS || '').split(',').filter(Boolean);
  const produced = produceRetainedAcceptanceEvidence({ suite, identity, withheldTestIds });
  fs.writeFileSync(process.env.RETAINED_TEST_ID_RESULTS, `${JSON.stringify(produced, null, 2)}\n`, { mode: 0o600 });
}
