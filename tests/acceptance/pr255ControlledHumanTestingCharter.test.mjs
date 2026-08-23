import assert from 'node:assert/strict';
import fs from 'node:fs';

const charter = fs.readFileSync(new URL('../../docs/quality/pr255-controlled-human-testing-charter.md', import.meta.url), 'utf8');
const bindings = JSON.parse(fs.readFileSync(new URL('./execution-bindings.json', import.meta.url), 'utf8'));
const blockedHostedIds = bindings.hostedTests.filter(item => item.scenario === null).map(item => item.testId).sort();

assert.equal(blockedHostedIds.length, 15, 'the charter exclusion contract must track exactly the 15 blocked hosted/server-authority cases');
const charterExcludedIds = [...charter.matchAll(/^- `([A-Z0-9]+-[0-9]{3})`$/gmu)].map(([, id]) => id).sort();
assert.deepEqual(charterExcludedIds, blockedHostedIds, 'the charter exclusions must exactly match the canonical blocked hosted bindings');

assert.match(charter, /Status: prepared, not executed\./u, 'preparation must not be represented as executed human evidence');
assert.match(charter, /synthetic, non-evidentiary UX and product exploration/u, 'human testing must remain non-evidentiary product exploration');
assert.match(charter, /cannot clear any acceptance-catalog `BLOCKED` case[\s\S]*107 planned provenance scopes/u, 'human observation must not promote blocked planned execution scopes');
assert.doesNotMatch(charter, /\b[0-9a-f]{40}\b/u, 'the charter must resolve the candidate SHA at execution time rather than self-stale');
assert.match(charter, /release_sha[\s\S]*deploy_id[\s\S]*immutable_url[\s\S]*hosted_nonproduction_pilot/u, 'preflight must bind the execution-time release, deploy, immutable URL, and environment');
for (const header of ['x-avalaos-release', 'x-avalaos-netlify-deploy-id', 'x-avalaos-environment']) {
  assert.match(charter, new RegExp(header, 'u'), `preflight must verify ${header}`);
}
for (const device of ['Desktop', 'Pixel 7']) assert.match(charter, new RegExp(device, 'u'), `${device} must remain in scope`);
for (const persona of ['Process Analyst', 'AP Process Owner', 'Delivery Lead', 'Control Reviewer', 'Automation Contributor', 'Buyer Viewer', 'Platform Admin']) {
  assert.match(charter, new RegExp(`\\| ${persona.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} \\|`, 'u'), `${persona} must have a representative human-observation surface`);
}
for (const stopCondition of [
  'response-header mismatch',
  'authority, websocket, event-stream, or unexpected-origin request',
  'accepted-versus-denied route confusion',
  'surviving sign-out unexpectedly',
  'real customer, employee, PHI, provider, BYOK',
]) assert.match(charter, new RegExp(stopCondition, 'u'), `missing fail-closed stop condition: ${stopCondition}`);
assert.match(charter, /Sanitized text-only defect record/u, 'defects must use the sanitized text-only format');
assert.match(charter, /Do not capture or attach screenshots, video, traces, HAR files[\s\S]*raw network logs/u, 'retained human records must exclude rich or raw diagnostic capture');
assert.match(charter, /revert the complete coherent PR #255 remediation set/u, 'rollback must cover the coherent remediation rather than a fictitious single commit');
assert.match(charter, /not pilot readiness, production readiness[\s\S]*RLS or tenant-isolation proof[\s\S]*security certification[\s\S]*compliance certification/u, 'human exploration must retain explicit readiness and certification non-claims');

console.log('PR #255 controlled human testing charter is bounded, current, and fail-closed.');
