import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const PR_A_EVIDENCE_SCOPE = [
  '.github/workflows/transcript-flow-pr-a.yml', '.gitignore', 'package.json', 'vite.config.ts', 'playwright.enterprise-intelligence.config.ts',
  'playwright.pr1d.config.ts', 'playwright.studio-artifacts.config.ts', 'playwright.transcript-flow-pr-a.config.ts',
  'scripts/checkEnterpriseIntelligenceBoundaries.mjs', 'scripts/runTranscriptFlowBrowser.mjs',
  'scripts/runTranscriptFlowBrowser.test.mjs', 'scripts/runTranscriptFlowCoverage.mjs',
  'scripts/runTranscriptFlowEvidence.mjs', 'scripts/testEnterpriseIntelligencePostgres.mjs',
  'scripts/testTranscriptFlowPostgres.mjs', 'scripts/transcriptFlowEvidenceContract.mjs',
  'scripts/transcriptFlowEvidenceContract.test.mjs', 'scripts/transcriptFlowEvidenceScope.mjs', 'scripts/verifyTranscriptFlowEvidence.mjs',
  'components/enterprise/AssessTranscriptCandidateReview.tsx', 'components/enterprise/EnterpriseIntelligenceView.tsx',
  'components/enterprise/TranscriptSourceLibrary.tsx', 'services/enterpriseIntelligence.ts', 'services/enterpriseIntelligence.test.ts',
  'services/enterpriseIntelligenceClient.ts', 'services/transcriptFlow', 'supabase/functions/_shared/enterpriseIntelligenceAi.ts',
  'supabase/functions/_shared/enterpriseIntelligenceAi.test.ts', 'supabase/functions/_shared/enterpriseIntelligenceCommand.ts',
  'supabase/functions/_shared/enterpriseIntelligenceCommand.test.ts', 'supabase/functions/_shared/enterpriseIntelligenceQuery.ts',
  'supabase/functions/_shared/enterpriseIntelligenceQuery.test.ts', 'supabase/functions/_shared/providerBudget.ts',
  'supabase/functions/_shared/providerBudget.test.ts', 'supabase/functions/_shared/providerBudgetMigration.test.ts',
  'supabase/functions/_shared/providerCleanup.ts', 'supabase/functions/_shared/providerCleanup.test.ts',
  'supabase/functions/_shared/providerLifecycle.test.ts', 'supabase/functions/_shared/providerResolver.ts',
  'supabase/functions/_shared/providerResolver.test.ts', 'supabase/functions/_shared/supabase.ts',
  'supabase/functions/_shared/transcriptSourceSetMigration.test.mjs',
  'supabase/migrations/20260825165350_governed_transcript_source_sets_assess.sql',
  'supabase/migrations/20260825165401_unified_provider_budget_authority.sql',
  'supabase/migrations/20260826151538_governed_transcript_authority_forward_fix.sql',
  'testing/process-lifecycle', 'tests/browser/transcriptFlowPrA.spec.ts', 'tests/browser/enterpriseIntelligenceNetworkFixture.ts',
  'tests/browser/enterpriseIntelligence.spec.ts',
  'tests/acceptance/source-provenance.json', 'docs/00_SOURCE_OF_TRUTH.md',
  'docs/architecture/current-to-target-enterprise-architecture.md', 'docs/architecture/enterprise-intelligence-authority.md',
  'docs/planning/governed-multisource-transcript-module-handoff-plan.md',
  'docs/quality/governed-multisource-transcript-pr-a-evidence.md', 'docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md',
  'docs/quality/readiness-gates.md', 'docs/quality/verification-command-matrix.md', 'docs/task-ledger.md',
];

export const PR_A_PROVENANCE_SOURCES = PR_A_EVIDENCE_SCOPE.filter(entry =>
  !entry.startsWith('docs/') && entry !== '.gitignore' && entry !== 'tests/acceptance/source-provenance.json');

const slash = value => value.replaceAll('\\', '/');
const visit = (root, relative, files) => {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) throw new Error(`PR_A_SCOPE_MISSING:${slash(relative)}`);
  const metadata = statSync(absolute);
  if (metadata.isDirectory()) for (const entry of readdirSync(absolute).sort()) visit(root, path.join(relative, entry), files);
  else if (metadata.isFile()) files.push(slash(relative));
};

export const expandPrAScopeEntries = (root, entries) => {
  const files = [];
  for (const entry of entries) visit(root, entry, files);
  return [...new Set(files)].sort();
};

export const collectPrAEvidenceFiles = root => expandPrAScopeEntries(root, PR_A_EVIDENCE_SCOPE);
export const collectPrAProvenanceFiles = root => expandPrAScopeEntries(root, PR_A_PROVENANCE_SOURCES);

export const calculatePrAWorkingTreeDigest = root => {
  const digest = createHash('sha256');
  for (const file of collectPrAEvidenceFiles(root)) {
    const content = readFileSync(path.join(root, file));
    digest.update(`${Buffer.byteLength(file, 'utf8')}:${file}:${content.byteLength}:`);
    digest.update(content);
  }
  return digest.digest('hex');
};

export const isPrASourcePath = file => {
  const value = slash(file);
  return /^(?:components\/enterprise\/(?:AssessTranscriptCandidateReview|EnterpriseIntelligenceView|TranscriptSourceLibrary)\.tsx|services\/enterpriseIntelligence(?:Client|\.test)?\.ts|services\/transcriptFlow\/|supabase\/functions\/_shared\/(?:enterpriseIntelligence(?:Ai|Command|Query)(?:\.test)?|providerBudget(?:Migration\.test|\.test)?|providerCleanup(?:\.test)?|providerLifecycle\.test|providerResolver(?:\.test)?|supabase)\.(?:ts|mjs)|supabase\/migrations\/\d+_[^/]*(?:transcript|provider_budget)[^/]*\.sql|tests\/browser\/(?:transcriptFlowPrA\.spec|enterpriseIntelligenceNetworkFixture|enterpriseIntelligence\.spec)\.ts|vite\.config\.ts|playwright\.(?:enterprise-intelligence|pr1d|studio-artifacts|transcript-flow-pr-a)\.config\.ts|scripts\/(?:.*TranscriptFlow.*|checkEnterpriseIntelligenceBoundaries|testEnterpriseIntelligencePostgres)\.mjs|testing\/process-lifecycle\/|\.github\/workflows\/transcript-flow-pr-a\.yml|package\.json)$/u.test(value);
};

export const collectChangedPrASources = (root, baseGitSha) => {
  const tracked = execFileSync('git', ['diff', '--name-only', baseGitSha, '--'], { cwd: root, encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/u).map(slash).filter(value => value && isPrASourcePath(value)))].sort();
};
