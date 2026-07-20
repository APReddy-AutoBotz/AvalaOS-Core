import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const baselines = ['779a4801aa7c6660ad4581f8e334f5ad422519e7','2c288870f14755c24da4f8c6465271cc2365ebbc','30883509b46b848eaf1d0d5fc4bb5898bade98a3'];
const marker = '## PR 1D Current Authority';
const activeFiles = [
  'README.md',
  'docs/00_SOURCE_OF_TRUTH.md',
  'docs/01_PRODUCT_STRATEGY.md',
  'docs/02_PRODUCT_REQUIREMENTS.md',
  'docs/03_TECHNICAL_ARCHITECTURE.md',
  'docs/04_MVP_ROADMAP.md',
  'docs/05_IMPLEMENTATION_STATUS.md',
  'docs/06_SECURITY_AND_GOVERNANCE.md',
  'docs/07_AVALA_GOVERN_FRAMEWORK.md',
  'docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md',
  'docs/architecture/current-to-target-enterprise-architecture.md',
  'docs/architecture/document-authority-map.md',
  'docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md',
  'docs/quality/readiness-gates.md',
  'docs/quality/verification-command-matrix.md',
  'docs/task-ledger.md',
];
const canonicalFiles = [
  'docs/architecture/assess-v2-decision-intelligence-architecture.md',
  'docs/quality/pr1d-assess-v2-decision-intelligence-evidence.md',
  'docs/migrations/pr1d-assess-v2-decision-intelligence.md',
];

for (const file of activeFiles) {
  const source = read(file);
  if (!source.includes(marker) || !baselines.some(baseline => source.includes(baseline))) throw new Error(`PR1D_DOC_AUTHORITY_MISSING: ${file}`);
}

const architecture = read(canonicalFiles[0]);
for (const phrase of [
  'assess-core-2026-05', 'reviewer_ready', 'SHA-256', 'PR 1E', 'PR 1F',
  'additive PR 1D correction migration', 'canonical JSON text', 'PostgreSQL',
  'submitted and unvalidated', 'imported fact and evidence counts',
  'assess.v2.read', 'assess.v2.create', 'assess.v2.clone', 'assess.v2.draft.write', 'assess.v2.finalize',
  'Edge/Deno import-resolution compatibility correction', 'explicit `.ts` specifier',
  'Edge clone-replay preflight correction', 'server-owned replay helper',
  'before the mutable V1 source load',
  'Final evidence-quality and author-status boundary correction', 'SQL three-valued logic',
  'absent or `undefined` value as insufficient evidence',
  'Final normal-draft atomic audit correction', 'empty JSON object',
  'An audit failure rolls back the response update and receipt',
  'Final V2 runtime-state presentation correction', 'distinct user-facing messages',
  'Existing committed V2 decisions remain readable',
  'Final financial-action, decision-time evidence, and draft replay correction',
  'assess-v2-decision-2026-07-19', 'server finalization timestamp',
  'Technically Ready financial writes remain approval-bound',
  'exact succeeded draft receipt',
  'Final read-only discovery and immutable imported-evidence correction',
  'read-only sessions continue V2 case discovery',
  'immutable version-1 clone evidence row',
  'never creates a mutable shadow row',
  'Final Edge-shaped clone authoring and immutable client reload correction',
  'client-authorable projection',
  'immutable imported evidence wins every same-ID collision',
  'Final candidate-confidence and private fact-validation correction',
  'assess-v2-decision-2026-07-19-2',
  '`Verified` remains unreachable',
  'fresh submitted exact required claim',
  'private service-role draft RPC',
]) {
  if (!architecture.includes(phrase)) throw new Error(`PR1D_ARCHITECTURE_CONTRACT_MISSING: ${phrase}`);
}

const migration = read(canonicalFiles[2]);
for (const phrase of [
  '20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  '20260715120000_pr1d_decision_integrity_correction.sql',
  'forward-only', 'submitted/unvalidated', 'canonical input/evidence/output JSON text',
  '20260719130000_pr1d_author_fact_validation.sql',
  'recomputes each UTF-8 SHA-256 digest', 'sourceV1.importedEvidenceClaimIds',
  'immutable version-1 clone evidence', 'fabricated claim',
  'Final P2 create and clone receipt replay correction', 'two-session same-key create',
  'Final P2 create-case agent-necessity compatibility correction', 'exact legacy version-1',
  'freshly created, unsaved case',
  'Final P1 Edge/Deno import-resolution correction', 'extensionless Deno imports',
  'Final P2 Edge clone-replay preflight correction', 'private service-role replay helper',
  'read-only miss',
  'Final P2 evidence-quality and status-null correction', "payload->>'status' IS NULL",
  'Present malformed values remain strict-normalizer failures',
  'Final P1 normal-draft audit correction', "'{}'::jsonb",
  'ordinary Draft save commits',
  'Final P2 V2 runtime-state presentation correction', 'mutation-blocking `read_only`',
  'does not clear valid tenant authority',
  'Final P2 financial-action, decision-time evidence, and draft replay correction',
  'decision-output version', 'current `assess.v2.draft.write` authority',
  'read-only miss', 'disabled mode remains fail-closed',
  'Final P2/P1 read-only discovery and immutable imported-evidence correction',
  'altered same-ID author evidence', 'before receipt claim',
  'defensively prefers the immutable clone row',
  'assess-v2-decision-2026-07-19',
  'Final P1/P2 Edge-shaped imported-evidence save and client reload correction',
  'server-only evidence fields',
  'tenant-scoped version-1 `v1_clone` row',
  'Final candidate-confidence and private fact-validation correction',
  'exact five-key fact objects', 'before command receipt claim',
  'Trusted immutable `imported_facts`',
]) {
  if (!migration.includes(phrase)) throw new Error(`PR1D_MIGRATION_DOC_CONTRACT_MISSING: ${phrase}`);
}

const evidence = read(canonicalFiles[1]);
for (const phrase of [
  'Correction verification ledger', 'Not Run', 'Hosted/live Supabase',
  '98.53% lines, 84.69% branches, 96.51% functions', '24/24 PR 1D browser journeys',
  'Final review draft-receipt and requested-change correction', 'zero side effects',
  'Final P1 imported-V1 evidence provenance correction', 'sourceV1.importedEvidenceClaimIds',
  'fabricated `v1.evidence.*` claim', 'Final P2 create and clone receipt replay correction',
  'parent/source soft deletion', 'buyer acceptance', 'additive forward fix',
  'Final P2 create-case agent-necessity compatibility correction', 'fresh unsaved V2 case',
  'near-match malformed row',
  'Final P1 Edge/Deno import-resolution correction', '19 TypeScript modules and 40 relative edges',
  'actual `deno check` was not run',
  'Final P2 Edge clone-replay preflight correction', 'before any V1 source read',
  'exact replay after source deletion', 'zero additional case',
  'Final P2 Govern Lite missing-quality and database status-null correction',
  'compatible submitted/unvalidated row preserved', 'direct rejection of omitted and null status',
  'Final P1 normal-draft atomic audit correction', 'normal Draft save commits',
  'one audit with an empty metadata object',
  'Final P2 V2 runtime-state presentation correction', 'nested and top-level runtime codes',
  'distinct maintenance and disabled copy',
  'Final P2 financial-action, decision-time evidence, and draft replay correction',
  'assess-v2-decision-2026-07-19', 'finalization-time expiry',
  'exact succeeded draft replay', 'IDEMPOTENCY_CONFLICT',
  'Final P2/P1 read-only discovery and immutable imported-evidence correction',
  '1 passed (39.8s)', 'zero side effects',
  'exact imported evidence round-trip',
  '32 total', '0 unresolved',
  'Final P1/P2 Edge-shaped imported-evidence save and client reload correction',
  'PostgreSQL 16 migration matrix passed',
  '34 total review threads',
  'Final candidate-confidence and private fact-validation correction',
  'assess-v2-decision-2026-07-19-2',
  'INVALID_COMMAND', 'zero side effects',
]) {
  if (!evidence.includes(phrase)) throw new Error(`PR1D_EVIDENCE_CONTRACT_MISSING: ${phrase}`);
}
if (/80\.0[56]%/.test(evidence)) throw new Error('PR1D_EVIDENCE_STALE_BRANCH_COVERAGE');

for (const file of [...activeFiles, ...canonicalFiles]) {
  const source = read(file);
  if (/Best Technology/i.test(source)) throw new Error(`PR1D_FORBIDDEN_V2_WINNER_COPY: ${file}`);
  if (/\b(?:is|are) scientifically validated|guarantees? ROI|\bproduction-ready\b|\bcompliance-certified\b/i.test(source)) {
    throw new Error(`PR1D_UNSUPPORTED_CLAIM: ${file}`);
  }
}

const markdownLink = /\[[^\]]+\]\((?!https?:|mailto:|#)([^)]+)\)/g;
for (const file of [...activeFiles, ...canonicalFiles]) {
  const source = read(file);
  for (const match of source.matchAll(markdownLink)) {
    const raw = match[1].split('#')[0].replace(/^<|>$/g, '');
    if (!raw) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), raw);
    if (!fs.existsSync(resolved)) throw new Error(`PR1D_BROKEN_RELATIVE_LINK: ${file} -> ${match[1]}`);
  }
}

console.log('PR 1D active authority, correction architecture, evidence accuracy, migration, claims, and links verified.');
