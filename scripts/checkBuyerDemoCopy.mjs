import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

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

const governLite = read('components/assess/AvalaGovernLiteCardPanel.tsx');
assert.ok(governLite.includes('does not run bots, execute RPA jobs or agents, update external systems'), 'Govern Lite copy should state the execution boundary.');

const app = read('App.tsx');
assert.ok(app.includes('Return to Avala Studio or Document Vault'), 'Missing document data fallback should guide the buyer back to Studio or Vault.');
assert.ok(app.includes('source context attached'), 'Missing document data fallback should mention source context.');

console.log('Buyer-demo copy regression passed.');
