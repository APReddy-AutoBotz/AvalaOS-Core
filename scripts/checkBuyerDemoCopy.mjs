import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const assertFileDoesNotInclude = (path, phrase, reason) => {
  assert.equal(read(path).includes(phrase), false, `${path} should not include "${phrase}". ${reason}`);
};
const assertFileDoesNotMatch = (path, pattern, reason) => {
  assert.doesNotMatch(read(path), pattern, `${path} should not match ${pattern}. ${reason}`);
};

const header = read('components/shared/Header.tsx');
assert.match(header, />\s*Sign Out\s*<\/button>/, 'Header profile action should say Sign Out.');
assert.doesNotMatch(header, />\s*Switch\s*<\/button>/, 'Header sign-out action should not say Switch.');
assert.ok(header.includes('Open readiness and blocker signals'), 'Monitor header action should use readiness/blocker signal wording.');

const sidebar = read('components/shared/Sidebar.tsx');
assert.ok(sidebar.includes("label: 'Avala Portfolio'"), 'Sidebar should use Avala Portfolio label.');
assert.equal(sidebar.includes("label: 'Portfolio'"), false, 'Sidebar should not expose plain Portfolio label.');
assert.match(sidebar, /View\.DOCS_FORGE,\s*icon:\s*DocumentTextIcon,\s*label:\s*'Avala Studio'/s);
assert.match(sidebar, /View\.DOCS,\s*icon:\s*ClipboardDocumentIcon,\s*label:\s*'Document Vault'/s);
assert.equal(
  sidebar.match(/View\.DOCS_FORGE,\s*icon:\s*([A-Za-z0-9_]+)/s)?.[1],
  'DocumentTextIcon',
);
assert.equal(
  sidebar.match(/View\.DOCS,\s*icon:\s*([A-Za-z0-9_]+)/s)?.[1],
  'ClipboardDocumentIcon',
);

const orgSetup = read('components/auth/OrganizationSetupView.tsx');
assert.ok(orgSetup.includes('Review Access'), 'Reviewer-like access copy should be review-capable.');
assert.equal(orgSetup.includes('View Only'), false, 'Reviewer-like access copy should not say View Only.');

const trustCenterPanel = read('components/admin/TrustCenterPanel.tsx');
assert.ok(trustCenterPanel.includes('Trust Center proof states do not imply production readiness'), 'Trust Center panel should preserve proof-state limitation copy.');
assert.ok(trustCenterPanel.includes('No evidence records available.'), 'Trust Center panel should include safe empty evidence state.');
assert.ok(trustCenterPanel.includes('No claim controls available.'), 'Trust Center panel should include safe empty claim-control state.');

const adminWorkbench = read('components/admin/AdminWorkbench.tsx');
assert.ok(adminWorkbench.includes('Admin Workbench'), 'Admin Workbench shell should render the Admin Workbench title.');
assert.ok(adminWorkbench.includes('Sectioned admin structure'), 'Admin Workbench shell should preserve proof-safe structure copy.');

const adminOverview = read('components/admin/AdminOverviewPanel.tsx');
assert.ok(adminOverview.includes('Trust Center proof states are evidence-gated'), 'Admin overview should preserve evidence-gated proof state copy.');
assert.ok(adminOverview.includes('Review Trust Center blocked/evidence-required claims'), 'Admin overview should include the next admin decision list.');

const adminWorkbenchModel = read('services/adminWorkbenchModel.ts');
assert.ok(adminWorkbenchModel.includes("key: 'trust_center'"), 'Admin Workbench model should include the Trust Center section.');
assert.ok(adminWorkbenchModel.includes("label: 'AI Controls'"), 'Admin Workbench model should include the AI Controls section.');

const buyerAcceptancePackModel = read('services/buyerAcceptancePackModel.ts');
assert.ok(buyerAcceptancePackModel.includes('Avala Govern'), 'Buyer Acceptance Pack model should preserve the Avala Govern full name.');
assert.ok(buyerAcceptancePackModel.includes('Avala Delivery'), 'Buyer Acceptance Pack model should preserve the Avala Delivery full name.');
assert.ok(buyerAcceptancePackModel.includes('draft foundation'), 'Buyer Acceptance Pack model should frame the pack as a draft foundation.');
assert.ok(buyerAcceptancePackModel.includes('not an approval, export, readiness artifact, or compliance artifact'), 'Buyer Acceptance Pack model should preserve proof-safe pack boundary copy.');
assert.equal(buyerAcceptancePackModel.includes("packStatus: 'approved_for_review'"), false, 'Buyer Acceptance Pack model should not mark the generated pack approved.');

const moduleConfig = read('constants/moduleConfig.ts');
assert.ok(moduleConfig.includes('Draft editable review documents'), 'Avala Studio module copy should frame drafts as editable review documents.');
assert.ok(moduleConfig.includes('human sign-off'), 'Avala Studio module copy should require human sign-off.');
assert.ok(moduleConfig.includes('Readiness, lineage, blockers, value signals'), 'Avala Monitor module copy should use readiness/lineage/blocker/value signal wording.');
assert.equal(/telemetry/i.test(moduleConfig), false, 'Avala Monitor module copy should not imply telemetry.');

const login = read('components/auth/LoginView.tsx');
assert.ok(login.includes('Editable review drafts'), 'Login module pillar should frame Studio outputs as editable review drafts.');
assert.ok(login.includes('Readiness, lineage, blockers'), 'Login module pillar should frame Monitor as readiness/lineage/blocker visibility.');
assert.ok(login.includes('Monitor readiness, lineage, blocker, and value signals'), 'Login proof points should use safe Monitor wording.');
assert.ok(login.includes('does not execute bots, RPA jobs, agents, or external systems'), 'Login should state AvalaOS execution boundary.');

const landing = read('components/shared/LandingPage.tsx');
assert.ok(landing.includes('editable drafts, human sign-off'), 'Studio landing copy should include editable drafts and human sign-off.');
assert.ok(landing.includes('Generated drafts remain editable review artifacts.'), 'Studio controls should frame generated drafts as editable review artifacts.');
assert.ok(landing.includes('requires SME validation'), 'No-source fallback should require SME validation.');

const docsForge = read('components/docs/DocsForgeView.tsx');
assert.ok(docsForge.includes('editable review drafts that require human sign-off'), 'Assess-to-Studio copy should require human sign-off.');

const govern = read('components/assess/AvalaGovernLiteCardPanel.tsx');
assert.ok(govern.includes('does not run bots, execute RPA jobs or agents, update external systems'), 'Avala Govern copy should state the execution boundary.');

const app = read('App.tsx');
assert.ok(app.includes('Return to Avala Studio or Document Vault'), 'Missing document data fallback should guide the buyer back to Studio or Vault.');
assert.ok(app.includes('source context attached'), 'Missing document data fallback should mention source context.');

const currentBuyerFacingSources = [
  'README.md',
  'docs/00_SOURCE_OF_TRUTH.md',
  'docs/01_PRODUCT_STRATEGY.md',
  'docs/02_PRODUCT_REQUIREMENTS.md',
  'docs/03_TECHNICAL_ARCHITECTURE.md',
  'docs/04_MVP_ROADMAP.md',
  'docs/05_IMPLEMENTATION_STATUS.md',
  'docs/06_SECURITY_AND_GOVERNANCE.md',
  'docs/07_AVALA_GOVERN_FRAMEWORK.md',
  'docs/quality/readiness-gates.md',
  'docs/planning/milestone-roadmap.md',
  'docs/task-ledger.md',
  'docs/planning/premium-enterprise-acceptance-roadmap.md',
  'components/auth/OnboardingWizard.tsx',
  'components/auth/LoginView.tsx',
  'components/shared/Sidebar.tsx',
  'components/admin/AdminWorkbench.tsx',
  'components/admin/AdminSectionNav.tsx',
  'components/admin/AdminOverviewPanel.tsx',
  'components/admin/TrustCenterPanel.tsx',
  'components/assess/AvalaGovernLiteCardPanel.tsx',
  'services/adminWorkbenchModel.ts',
  'services/buyerAcceptancePackModel.ts',
  'services/trustCenterPresentation.ts',
  'constants/moduleConfig.ts',
  'services/assessmentExportService.ts',
  'services/deliveryPackService.ts',
  'services/deliveryPackExportService.ts',
  'services/prompts.ts',
];

const blockedReadinessClaims = [
  'PostgreSQL database provisioned',
  'RLS security policies active',
  'Avala Assess ready',
  'Your workspace is ready for guided discovery.',
];

for (const sourcePath of currentBuyerFacingSources) {
  for (const phrase of blockedReadinessClaims) {
    assertFileDoesNotInclude(sourcePath, phrase, 'Unsupported onboarding or platform readiness wording must stay out of buyer-facing copy.');
  }
}

const oldNameBannedSources = currentBuyerFacingSources.filter(path => path !== 'docs/planning/premium-enterprise-acceptance-roadmap.md');
for (const sourcePath of oldNameBannedSources) {
  assertFileDoesNotInclude(sourcePath, 'Avala Govern Lite', 'Use Avala Govern for buyer-facing copy.');
  assertFileDoesNotInclude(sourcePath, 'Avala Delivery Lite', 'Use Avala Delivery for buyer-facing copy.');
}

const adminWorkbenchBuyerFacingSources = [
  'components/admin/AdminWorkbench.tsx',
  'components/admin/AdminSectionNav.tsx',
  'components/admin/AdminOverviewPanel.tsx',
  'services/adminWorkbenchModel.ts',
];

const unsupportedAdminWorkbenchClaims = [
  /production ready/i,
  /security ready/i,
  /compliance certified/i,
  /tenant isolation verified/i,
  /RLS active/i,
  /RLS verified/i,
  /RLS ready/i,
  /deployment ready/i,
  /buyer ready/i,
  /product ready/i,
];

for (const sourcePath of adminWorkbenchBuyerFacingSources) {
  for (const pattern of unsupportedAdminWorkbenchClaims) {
    assertFileDoesNotMatch(sourcePath, pattern, 'Admin Workbench copy must remain proof-safe.');
  }
}

const premiumRoadmap = read('docs/planning/premium-enterprise-acceptance-roadmap.md');
assert.ok(premiumRoadmap.includes('Avala Govern and Avala Delivery are the buyer-facing canonical product names'), 'Premium roadmap should record the new naming decision.');
assert.ok(premiumRoadmap.includes('Avala Govern Lite and Avala Delivery Lite'), 'Premium roadmap should document the prior names only in the naming-decision explanation.');
assert.ok(premiumRoadmap.includes('does not execute bots, agents, RPA jobs, external-system actions'), 'Premium roadmap should preserve the Avala Govern execution boundary.');
assert.ok(premiumRoadmap.includes('Avala Delivery is not a Jira replacement'), 'Premium roadmap should preserve the Avala Delivery scope boundary.');

const onboarding = read('components/auth/OnboardingWizard.tsx');
assert.ok(onboarding.includes('Demo workspace prepared'), 'Onboarding should use demo-safe workspace wording.');
assert.ok(onboarding.includes('Evidence-first governance path available'), 'Onboarding should describe governance availability without RLS claims.');
assert.ok(onboarding.includes('Avala Assess demo flow available'), 'Onboarding should describe the Assess demo flow without readiness claims.');
assert.equal(/workspace is ready/i.test(onboarding), false, 'Onboarding should not use generic workspace readiness claims.');

console.log('Buyer-demo copy regression passed.');
