import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = '30883509b46b848eaf1d0d5fc4bb5898bade98a3';
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
  if (!source.includes(marker) || !source.includes(baseline)) throw new Error(`PR1D_DOC_AUTHORITY_MISSING: ${file}`);
}

const architecture = read(canonicalFiles[0]);
for (const phrase of [
  'assess-core-2026-05', 'reviewer_ready', 'SHA-256', 'PR 1E', 'PR 1F',
  'additive PR 1D correction migration', 'canonical JSON text', 'PostgreSQL',
  'submitted and unvalidated', 'imported fact and evidence counts',
  'assess.v2.read', 'assess.v2.create', 'assess.v2.clone', 'assess.v2.draft.write', 'assess.v2.finalize',
]) {
  if (!architecture.includes(phrase)) throw new Error(`PR1D_ARCHITECTURE_CONTRACT_MISSING: ${phrase}`);
}

const migration = read(canonicalFiles[2]);
for (const phrase of [
  '20260714120000_pr1d_assess_v2_decision_intelligence.sql',
  '20260715120000_pr1d_decision_integrity_correction.sql',
  'forward-only', 'submitted/unvalidated', 'canonical input/evidence/output JSON text',
  'recomputes each UTF-8 SHA-256 digest',
]) {
  if (!migration.includes(phrase)) throw new Error(`PR1D_MIGRATION_DOC_CONTRACT_MISSING: ${phrase}`);
}

const evidence = read(canonicalFiles[1]);
for (const phrase of [
  'Correction verification ledger', 'Not Run', 'Hosted/live Supabase',
  '98.51% lines, 84.16% branches, 96.04% functions', 'buyer acceptance', 'additive forward fix',
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
