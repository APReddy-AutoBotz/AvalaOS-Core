import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const writeMode = process.argv.includes('--write');
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

const baseline = '30883509b46b848eaf1d0d5fc4bb5898bade98a3';
const marker = '## PR 1D Current Authority';
const common = `${marker}\n\nPR #208 / PR 1C is accepted at \`${baseline}\`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 \`assess-core-2026-05\` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.\n`;

const specific = new Map([
  ['README.md', `\nAvala Assess V2 decomposes processes into primitives and produces evidence-qualified hybrid operating models rather than one whole-process technology winner. PR 1D finalization ends reviewer-ready; V2 approval, Studio handoff, export, and sharing are not authorized.\n`],
  ['docs/01_PRODUCT_STRATEGY.md', `\nAssess V2 selects the least-complex eligible mix of human-led work, rules, integration, workflow, UI automation, intelligence, and controls. It does not claim scientific validation, expert calibration, guaranteed ROI, buyer approval, or deployment readiness.\n`],
  ['docs/02_PRODUCT_REQUIREMENTS.md', `\nPR 1D requires explicit V2 cases, immutable authoring/decision versions, primitives, decisions, exceptions, application interactions, evidence links, a versioned deterministic rule registry, action-specific controls, modernization dispositions, and a read-only executive Decision Pack. V1 import is explicit and unverified; V2 finalization ends reviewer-ready.\n`],
  ['docs/03_TECHNICAL_ARCHITECTURE.md', `\nThe canonical V2 design is [Assess V2 Decision Intelligence Architecture](architecture/assess-v2-decision-intelligence-architecture.md). V2 uses normalized authoring facts, immutable finalized snapshots, canonical SHA-256 references, private server-authoritative commands, and forced-RLS read projections. V1 and V2 identities, commands, persistence, outputs, and lifecycles are not interchangeable.\n`],
  ['docs/04_MVP_ROADMAP.md', `\nSequence: PR 1D V2 foundation and compatibility -> PR 1E review/approval/handoff -> PR 1F calibration/economics -> Studio/private artifacts. PR 1D does not authorize later stages.\n`],
  ['docs/05_IMPLEMENTATION_STATUS.md', `\nPR 1D candidate scope is additive V2 domain/rules, normalized persistence, typed commands, immutable SHA-256 decision versions, a capability-controlled working UI slice, the canonical AP Invoice Exception V2 outcome, feature-owned tests/CI, and operational read-only rollback. V2 approval and Studio handoff remain not implemented.\n`],
  ['docs/06_SECURITY_AND_GOVERNANCE.md', `\nV2 mutation RPCs are private service-role transport with independent transactional authorization. Authenticated access is forced-RLS read projection only. Server-generated hashes prove snapshot integrity, not truth, calibration, approval, compliance, or readiness.\n`],
  ['docs/07_AVALA_GOVERN_FRAMEWORK.md', `\nAccepted Govern/Studio behavior remains V1-only. PR 1D V2 decisions may state controls and approvals required but cannot record approval, resolve Govern, grant exceptions, or create a Studio handoff; PR 1E owns that authority.\n`],
  ['docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md', `\nPR 1D delivers the V1 compatibility boundary and a working reviewer-ready V2 foundation. PR 1E owns review/approval/handoff authority and PR 1F owns calibration/economics. The three boundaries precede broader Studio/private-artifact work.\n`],
  ['docs/architecture/current-to-target-enterprise-architecture.md', `\nPR 1D adds separate V2 case-authoring, decision-intelligence, command-authority, and read-projection bounded contexts. The detailed target is routed through [Assess V2 Decision Intelligence Architecture](assess-v2-decision-intelligence-architecture.md).\n`],
  ['docs/architecture/document-authority-map.md', `\n| Avala Assess V2 domain, rule, command, persistence, compatibility, and rollback architecture | \`docs/architecture/assess-v2-decision-intelligence-architecture.md\` |\n`],
  ['docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md', `\nPR 1D active risks include V1/V2 type confusion, client-supplied decisions or hashes, incomplete rule-field coverage, template/import values treated as evidence, cross-tenant V2 disclosure, non-atomic finalization, and misleading whole-process technology claims. Closure requires strict typed commands, independent server authorization, forced RLS, immutable canonical SHA-256 snapshots, registry/property tests, genuine two-tenant tests, browser evidence, and explicit non-claims.\n`],
  ['docs/quality/readiness-gates.md', `\nPR 1D passes only with unchanged V1 regressions plus executed V2 source, coverage, disposable migration/RLS, concurrency/idempotency/audit, desktop/mobile browser, accessibility, viewport, performance, security, secret-hygiene, build, documentation, and rollback evidence. Source/CI acceptance is not hosted or operational readiness.\n`],
  ['docs/quality/verification-command-matrix.md', `\nPR 1D feature-owned verification: \`npm run test:pr1d\`, \`npm run test:migrations:pr1d\`, \`npm run test:browser:pr1d\`, and \`npm run test:docs:pr1d\`, in addition to all retained PR 1A/1B/1C, typecheck, audit, security, build, and diff gates. Unavailable checks are Blocked or Not Run, never passed.\n`],
  ['docs/task-ledger.md', `\n| Workstream 1 PR 1D | WS1-PR1D | Active implementation candidate | AP/Codex | V1 compatibility; V2 rules, persistence, commands, working UI, Decision Pack, tests, evidence, rollback | V1 unchanged; reviewer-ready V2; no approval/handoff; exact local/CI evidence | \`docs/architecture/assess-v2-decision-intelligence-architecture.md\` | One draft PR; no merge, tag, deployment, or live validation |\n`],
]);

const stalePatterns = [
  /PR 1C is the active implementation candidate/i,
  /finish PR 1C GitHub CI and review/i,
  /PR 1C is an implementation candidate pending review, GitHub CI, and merge/i,
  /PR 1B is the active substantial vertical implementation boundary/i,
];

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);

if (writeMode) {
  for (const file of activeFiles) {
    let source = read(file);
    if (!source.includes(marker)) source = `${source.trimEnd()}\n\n${common}${specific.get(file) ?? ''}`;
    source = source
      .replaceAll('PR 1C is the active implementation candidate.', 'PR #208 / PR 1C is accepted; PR 1D is the active implementation boundary.')
      .replaceAll('PR 1C, Enterprise Assess UI Cutover, Govern Resolution, and Studio Handoff, is the active implementation candidate.', 'PR #208 / PR 1C, Enterprise Assess UI Cutover, Govern Resolution, and Studio Handoff, is accepted at the PR #208 merge baseline.')
      .replaceAll('and PR 1C is the active implementation candidate', 'and PR #208 / PR 1C is accepted; PR 1D is the active implementation candidate')
      .replaceAll('PR 1C is the active implementation candidate with executed local source, regression, coverage, production build-preview Chromium desktop/mobile, accessibility, viewport, and performance evidence.', 'PR #208 / PR 1C is accepted with source, CI, disposable PostgreSQL, Chromium desktop/mobile, accessibility, viewport, and performance evidence.')
      .replaceAll('Finish PR 1C GitHub CI and review, then merge only through the normal approval process.', 'Complete PR 1D verification and human review; do not merge under the PR 1D implementation task.')
      .replaceAll('PR 1B is the active substantial vertical implementation boundary.', 'PR #208 / PR 1C is accepted; PR 1D is the active substantial vertical implementation boundary.')
      .replaceAll('PR 1C is an implementation candidate pending review, GitHub CI, and merge.', 'PR #208 / PR 1C is accepted; PR 1D is the active implementation candidate.')
      .replaceAll('The accepted source baseline is `main` at `6877bd90f5f93e685b5ec47a0fbafa2c57a99e09`, including PR #204 source-level export/storage/signed-URL guard hardening.', 'The accepted source baseline is PR #208 / PR 1C merged on `main` at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level.')
      .replaceAll('The active first implementation sequence is PR 1A → PR 1B → PR 1C. It begins only after the enterprise rebaseline PR is accepted and merged.', 'PR 1D is the active substantial boundary; PR 1E review/approval/handoff and PR 1F calibration/economics follow before broader Studio/private-artifact expansion.')
      .replaceAll('The source contains a service-role Storage URL escape in the document-extraction path. Deployment status is unknown.', '`P0-001` was AP-classified NOT DEPLOYED and its source remediation is accepted through PR #206; this is not deployment or readiness proof.')
      .replaceAll('Status: target contract with PR 1B accepted and a PR 1C implementation candidate pending review, CI, and merge', 'Status: PR #208 / PR 1C accepted; PR 1D target and implementation contract')
      .replaceAll('Baseline: accepted `main` at `de87c86` through PR 1B; PR 1C candidate evidence is explicitly pending acceptance', 'Baseline: PR #208 / PR 1C accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; PR 1D candidate evidence pending execution and acceptance');
    write(file, source);
  }
}

for (const file of activeFiles) {
  const source = read(file);
  if (!source.includes(marker) || !source.includes(baseline)) throw new Error(`PR1D_DOC_AUTHORITY_MISSING: ${file}`);
  for (const pattern of stalePatterns) if (pattern.test(source)) throw new Error(`PR1D_DOC_STALE_STATUS: ${file}: ${pattern}`);
}

const architecture = read('docs/architecture/assess-v2-decision-intelligence-architecture.md');
for (const phrase of ['assess-core-2026-05', 'reviewer_ready', 'SHA-256', 'PR 1E', 'PR 1F']) {
  if (!architecture.includes(phrase)) throw new Error(`PR1D_ARCHITECTURE_CONTRACT_MISSING: ${phrase}`);
}

const codeAndDocs = [
  ...activeFiles,
  'docs/architecture/assess-v2-decision-intelligence-architecture.md',
  'components/assess-v2',
  'services/assessV2',
].flatMap(entry => {
  const target = path.join(root, entry);
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [entry];
  return fs.readdirSync(target, { recursive: true, withFileTypes: true })
    .filter(item => item.isFile())
    .map(item => path.relative(root, path.join(item.parentPath ?? item.path, item.name)));
});

for (const file of codeAndDocs) {
  const source = read(file);
  if (/Best Technology/i.test(source)) throw new Error(`PR1D_FORBIDDEN_V2_WINNER_COPY: ${file}`);
  if (/\b(?:is|are) scientifically validated|guarantees? ROI|\bproduction-ready\b|\bcompliance-certified\b/i.test(source)) {
    throw new Error(`PR1D_UNSUPPORTED_CLAIM: ${file}`);
  }
}

const markdownLink = /\[[^\]]+\]\((?!https?:|mailto:|#)([^)]+)\)/g;
for (const file of [...activeFiles, 'docs/architecture/assess-v2-decision-intelligence-architecture.md']) {
  const source = read(file);
  for (const match of source.matchAll(markdownLink)) {
    const raw = match[1].split('#')[0].replace(/^<|>$/g, '');
    if (!raw) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), raw);
    if (!fs.existsSync(resolved)) throw new Error(`PR1D_BROKEN_RELATIVE_LINK: ${file} -> ${match[1]}`);
  }
}

console.log(writeMode ? 'PR 1D active authority updated and verified.' : 'PR 1D active authority and claim-safe documentation verified.');
