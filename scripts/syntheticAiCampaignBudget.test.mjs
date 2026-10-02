import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { campaignFetch, costNanos, initializeCampaign, inspectCampaign, POLICY, validateCampaignRequest, sealCampaignForHostedTransfer } from './syntheticAiCampaignBudget.mjs';
const directory = () => { const dir = mkdtempSync(join(tmpdir(), 'avala-ai-budget-')); initializeCampaign(dir); return dir; };
const options = (extra = {}) => ({ method: 'POST', redirect: 'error', body: JSON.stringify({ model: POLICY.model, max_tokens: 1000, temperature: 0, tools: [], messages: [{ role: 'system', content: 'Trusted test contract.' }, { role: 'user', content: 'Synthetic only.' }], ...extra }) });
const reply = (extra = {}) => new Response(JSON.stringify({ model: POLICY.model, usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }, choices: [{ message: { content: '{"invalid":"business output"}' } }], ...extra }), { status: 200 });
test('integer campaign carries previous uncertain usage and prices undiscounted tokens', () => {
  const ledger = inspectCampaign(directory()); assert.equal(ledger.carryNanos, 846060800); assert.equal(ledger.capNanos, 10000000000); assert.equal(costNanos(100, 50), 120000);
});
test('endpoint, redirect, model, output, tools, multiplicity and oversized input deny before effect', () => {
  for (const [url, init] of [ ['https://api.openai.com.evil.test/v1/chat/completions', options()], [POLICY.endpoint, { ...options(), redirect: 'follow' }], [POLICY.endpoint, options({ model: 'other-model' })], [POLICY.endpoint, options({ max_tokens: 4097 })], [POLICY.endpoint, options({ tools: [{}] })], [POLICY.endpoint, options({ n: 2 })], [POLICY.endpoint, options({ messages: [{ role: 'system', content: 'x'.repeat(120001) }, { role: 'user', content: 's' }] })] ]) assert.throws(() => validateCampaignRequest(url, init));
});
test('actual usage settles before invalid application output; ledger omits content and secrets', async () => {
  const dir = directory(); await campaignFetch(dir, 'assess-first', POLICY.endpoint, options(), async () => reply());
  assert.equal(inspectCampaign(dir).entries[0].state, 'settled'); assert.equal(inspectCampaign(dir).entries[0].chargedNanos, 120000);
  const raw = readFileSync(join(dir, 'ledger.json'), 'utf8'); for (const forbidden of ['Synthetic only', 'Trusted test', 'choices', 'headers', 'Bearer']) assert.ok(!raw.includes(forbidden));
});
test('same-key replay and changed-payload substitution never dispatch twice', async () => {
  const dir = directory(); let effects = 0; const transport = async () => { effects++; return reply(); };
  await campaignFetch(dir, 'assess-repeat', POLICY.endpoint, options(), transport);
  await assert.rejects(campaignFetch(dir, 'assess-repeat', POLICY.endpoint, options(), transport), /REPLAY_NO_EFFECT/);
  await assert.rejects(campaignFetch(dir, 'assess-repeat', POLICY.endpoint, options({ temperature: 0.1 }), transport), /REPLAY_CONFLICT/); assert.equal(effects, 1);
});
test('concurrent caller loses exclusive lock while first effect is unresolved', async () => {
  const dir = directory(); let release; let effects = 0; const pending = new Promise(resolve => { release = resolve; });
  const first = campaignFetch(dir, 'assess-concurrent', POLICY.endpoint, options(), async () => { effects++; await pending; return reply(); });
  await assert.rejects(campaignFetch(dir, 'studio-concurrent', POLICY.endpoint, options(), async () => { effects++; return reply(); }), /LOCKED/);
  release(); await first; assert.equal(effects, 1);
});
test('timeout and HTTP failure retain reservation and prevent replay', async () => {
  const dir = directory(); await assert.rejects(campaignFetch(dir, 'assess-timeout', POLICY.endpoint, options(), async () => { throw new Error('timeout'); }));
  const entry = inspectCampaign(dir).entries[0]; assert.equal(entry.state, 'uncertain'); assert.equal(entry.chargedNanos, entry.reservedNanos);
  await assert.rejects(campaignFetch(dir, 'assess-timeout', POLICY.endpoint, options(), async () => reply()), /REPLAY_NO_EFFECT/);
  await campaignFetch(dir, 'studio-http', POLICY.endpoint, options(), async () => new Response('', { status: 429 })); assert.equal(inspectCampaign(dir).entries[1].state, 'uncertain');
});
test('model mismatch and excessive, inconsistent or missing usage halt campaign', async () => {
  for (const extra of [{ model: 'different' }, { usage: { prompt_tokens: 1, completion_tokens: 1001, total_tokens: 1002 } }, { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 9 } }, { usage: null }]) {
    const dir = directory(); await assert.rejects(campaignFetch(dir, 'assess-bad', POLICY.endpoint, options(), async () => reply(extra)));
    assert.equal(inspectCampaign(dir).entries[0].state, 'budget_integrity_violation'); await assert.rejects(campaignFetch(dir, 'studio-after', POLICY.endpoint, options(), async () => reply()));
  }
});
test('malformed response, forged ledger and stale lock fail closed', async () => {
  const dir = directory(); await campaignFetch(dir, 'assess-malformed', POLICY.endpoint, options(), async () => new Response('{', { status: 200 })); assert.equal(inspectCampaign(dir).entries[0].state, 'uncertain');
  for (const mutation of [l => { l.capNanos++; }, l => { l.carryNanos = 0; }, l => { l.entries[0].chargedNanos = 0; }, l => { l.entries[0].extra = 'forged'; }]) {
    const changed = inspectCampaign(dir); mutation(changed); const next = directory(); writeFileSync(join(next, 'ledger.json'), JSON.stringify(changed)); assert.throws(() => inspectCampaign(next));
  }
  writeFileSync(join(dir, 'ledger.lock'), 'crash-owned'); await assert.rejects(campaignFetch(dir, 'studio-stale', POLICY.endpoint, options(), async () => reply()), /LOCKED/); assert.equal(readFileSync(join(dir, 'ledger.lock'), 'utf8'), 'crash-owned');
});
test('oversized provider response retains the pre-effect reservation', async () => {
  const dir = directory();
  await assert.rejects(campaignFetch(dir, 'assess-oversized', POLICY.endpoint, options(), async () => new Response('x'.repeat(1000001))));
  const entry = inspectCampaign(dir).entries[0];
  assert.equal(entry.state, 'uncertain'); assert.equal(entry.chargedNanos, entry.reservedNanos);
});

test('finite call limit cannot reset with a new operation name', async () => {
  const dir = directory(); let effects = 0; const transport = async () => { effects++; return new Response('', { status: 503 }); };
  for (let i = 0; i < POLICY.maxCalls; i++) await campaignFetch(dir, `assess-limit-${i}`, POLICY.endpoint, options(), transport);
  await assert.rejects(campaignFetch(dir, 'studio-over', POLICY.endpoint, options(), transport)); assert.equal(effects, POLICY.maxCalls);
  assert.ok(inspectCampaign(dir).entries.reduce((n, e) => n + e.chargedNanos, POLICY.carryNanos) < POLICY.capNanos);
});

const hostedTarget = `sha256:${'a'.repeat(64)}`;
const transferReady = async () => {
  const dir = directory();
  // Exactly 23,259,200 nanos, plus the retained 846,060,800 carry.
  await campaignFetch(dir, 'assess-transfer', POLICY.endpoint, options(), async () => reply({
    usage: { prompt_tokens: 57948, completion_tokens: 50, total_tokens: 57998 },
  }));
  return dir;
};

test('hosted transfer binds exact carry and target, preserves ledger, and closes local paid execution', async () => {
  const dir = await transferReady(), before = readFileSync(join(dir, 'ledger.json'));
  const seal = sealCampaignForHostedTransfer(dir, hostedTarget, 869320000);
  assert.equal(seal.carryNanos, 869320000); assert.match(seal.sealDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(sealCampaignForHostedTransfer(dir, hostedTarget, 869320000), seal);
  assert.deepEqual(readFileSync(join(dir, 'ledger.json')), before);
  assert.throws(() => sealCampaignForHostedTransfer(dir, `sha256:${'b'.repeat(64)}`, 869320000));
  let effects = 0;
  await assert.rejects(campaignFetch(dir, 'studio-after-transfer', POLICY.endpoint, options(), async () => { effects++; return reply(); }), /TRANSFERRED/);
  assert.equal(effects, 0); assert.deepEqual(readFileSync(join(dir, 'ledger.json')), before);
});

test('transfer rejects incorrect carry, target, unresolved effect and concurrent paid execution', async () => {
  const dir = directory();
  assert.throws(() => sealCampaignForHostedTransfer(dir, hostedTarget, 869320000));
  assert.throws(() => sealCampaignForHostedTransfer(dir, hostedTarget, POLICY.carryNanos));
  assert.throws(() => sealCampaignForHostedTransfer(dir, 'unbound', 869320000));
  let release; const pending = new Promise(resolve => { release = resolve; });
  const effect = campaignFetch(dir, 'assess-in-flight', POLICY.endpoint, options(), async () => { await pending; throw new Error('timeout'); });
  assert.throws(() => sealCampaignForHostedTransfer(dir, hostedTarget, 869320000), /LOCKED/);
  release(); await assert.rejects(effect);
  assert.throws(() => sealCampaignForHostedTransfer(dir, hostedTarget, 869320000));
});

test('partial or forged transfer seals fail closed without provider effects', async () => {
  const dir = await transferReady(); writeFileSync(join(dir, 'hosted-transfer.json'), '{');
  assert.throws(() => sealCampaignForHostedTransfer(dir, hostedTarget, 869320000));
  let effects = 0;
  await assert.rejects(campaignFetch(dir, 'studio-forged-seal', POLICY.endpoint, options(), async () => { effects++; return reply(); }), /TRANSFERRED/);
  assert.equal(effects, 0);
});
