import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const POLICY = Object.freeze({ schema: 1, campaign: 'assess-studio-20260917', capNanos: 10_000_000_000,
  carryNanos: 846_060_800, model: 'gpt-4.1-mini-2025-04-14', inputLimit: 1_047_576,
  outputLimit: 4096, maxCalls: 16, endpoint: 'https://api.openai.com/v1/chat/completions' });
export const costNanos = (input, output) => input * 400 + output * 1600;
const reserveNanos = costNanos(POLICY.inputLimit, POLICY.outputLimit);
const fail = () => { throw new Error('SYNTHETIC_AI_BUDGET_REJECTED'); };
const int = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => names.includes(key)) && names.every(key => Object.hasOwn(value, key));
const safeDirectory = directory => {
  const absolute = resolve(directory);
  for (let cursor = absolute;; cursor = dirname(cursor)) {
    if (lstatSync(cursor).isSymbolicLink()) fail();
    if (dirname(cursor) === cursor) break;
  }
  if (realpathSync(absolute).toLowerCase() !== absolute.toLowerCase()) fail();
  return absolute;
};
const load = filename => {
  if (lstatSync(filename).isSymbolicLink() || lstatSync(filename).size > 100_000) fail();
  const value = JSON.parse(readFileSync(filename, 'utf8'));
  if (!exact(value, ['schema', 'campaign', 'capNanos', 'carryNanos', 'entries'])
    || value.schema !== POLICY.schema || value.campaign !== POLICY.campaign
    || value.capNanos !== POLICY.capNanos || value.carryNanos !== POLICY.carryNanos
    || !Array.isArray(value.entries) || value.entries.length > POLICY.maxCalls) fail();
  const ids = new Set();
  for (const entry of value.entries) {
    if (!exact(entry, ['id', 'requestHash', 'state', 'reservedNanos', 'chargedNanos', 'httpStatus', 'usage'])
      || !/^(assess|studio)-[a-z0-9-]{1,80}$/.test(entry.id) || ids.has(entry.id)
      || !/^[a-f0-9]{64}$/.test(entry.requestHash)
      || !['uncertain', 'settled', 'budget_integrity_violation'].includes(entry.state)
      || entry.reservedNanos !== reserveNanos || !int(entry.chargedNanos)
      || entry.chargedNanos > reserveNanos
      || !(entry.httpStatus === null || Number.isInteger(entry.httpStatus) && entry.httpStatus >= 100 && entry.httpStatus <= 599)) fail();
    ids.add(entry.id);
    if (entry.state === 'settled') {
      if (!validUsage(entry.usage) || costNanos(entry.usage.inputTokens, entry.usage.outputTokens) !== entry.chargedNanos) fail();
    } else if (entry.chargedNanos !== reserveNanos || entry.usage !== null) fail();
  }
  if (charge(value) > POLICY.capNanos) fail();
  return value;
};
const charge = ledger => ledger.carryNanos + ledger.entries.reduce((sum, entry) => sum + entry.chargedNanos, 0);
const validUsage = usage => exact(usage, ['inputTokens', 'outputTokens', 'totalTokens'])
  && int(usage.inputTokens) && int(usage.outputTokens) && int(usage.totalTokens)
  && usage.inputTokens <= POLICY.inputLimit && usage.outputTokens <= POLICY.outputLimit
  && usage.totalTokens > 0 && usage.totalTokens === usage.inputTokens + usage.outputTokens;
const durable = (filename, data, createOnly = false) => {
  if (createOnly) {
    const fd = openSync(filename, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(data, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
    return;
  }
  const temporary = `${filename}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(data, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
  // Failed replacement deliberately leaves reservation/lock recovery fail-closed.
  renameSync(temporary, filename);
};
export const initializeCampaign = directory => {
  const filename = join(safeDirectory(directory), 'ledger.json');
  if (existsSync(filename)) return load(filename);
  const value = { schema: POLICY.schema, campaign: POLICY.campaign, capNanos: POLICY.capNanos, carryNanos: POLICY.carryNanos, entries: [] };
  durable(filename, value, true); return value;
};
export const inspectCampaign = directory => load(join(safeDirectory(directory), 'ledger.json'));

export function validateCampaignRequest(url, init) {
  if (String(url) !== POLICY.endpoint || init?.method !== 'POST' || init.redirect !== 'error'
    || typeof init.body !== 'string' || Buffer.byteLength(init.body) > 120_000) fail();
  const body = JSON.parse(init.body);
  if (body.model !== POLICY.model || !Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1
    || body.max_tokens > POLICY.outputLimit || body.stream || body.n || body.tools?.length
    || !Array.isArray(body.messages) || body.messages.length !== 2
    || body.messages[0].role !== 'system' || body.messages[1].role !== 'user'
    || body.messages.some(message => typeof message.content !== 'string')) fail();
  return body;
}

/** Local single-operator budget, not hosted authorization. Holds its lock through effect and accounting. */
export async function campaignFetch(directory, id, url, init, fetchImpl = fetch) {
  validateCampaignRequest(url, init);
  if (!/^(assess|studio)-[a-z0-9-]{1,80}$/.test(id)) fail();
  const safe = safeDirectory(directory); const filename = join(safe, 'ledger.json');
  const lock = join(safe, 'ledger.lock');
  let fd; try { fd = openSync(lock, 'wx', 0o600); } catch { throw new Error('SYNTHETIC_AI_CAMPAIGN_LOCKED'); }
  let persistenceFailed = false;
  const save = ledger => { try { durable(filename, ledger); } catch { persistenceFailed = true; fail(); } };
  try {
    const ledger = load(filename); const requestHash = hash(`${POLICY.endpoint}\n${init.body}`);
    const prior = ledger.entries.find(entry => entry.id === id);
    if (prior) throw new Error(prior.requestHash === requestHash ? 'SYNTHETIC_AI_REPLAY_NO_EFFECT' : 'SYNTHETIC_AI_REPLAY_CONFLICT');
    if (ledger.entries.length >= POLICY.maxCalls || ledger.entries.some(entry => entry.state === 'budget_integrity_violation')
      || charge(ledger) + reserveNanos > POLICY.capNanos) fail();
    const entry = { id, requestHash, state: 'uncertain', reservedNanos: reserveNanos, chargedNanos: reserveNanos, httpStatus: null, usage: null };
    ledger.entries.push(entry); save(ledger); // before effect: crash remains charged
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(65000)]) : AbortSignal.timeout(65000);
    const received = await fetchImpl(url, { ...init, signal });
    const reader = received.body?.getReader(); const chunks = []; let bytes = 0;
    if (reader) {
      try {
        while (true) {
          signal.throwIfAborted();
          const item = await reader.read();
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > 1_000_000) { await reader.cancel(); fail(); }
          chunks.push(item.value);
        }
      } finally { reader.releaseLock(); }
    }
    const response = new Response(Buffer.concat(chunks), { status: received.status, headers: received.headers });
    entry.httpStatus = response.status; save(ledger);
    if (response.ok) {
      let body;
      try { body = await response.clone().json(); } catch { return response; }
      const usage = { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, totalTokens: body.usage?.total_tokens };
      const requested = JSON.parse(init.body).max_tokens;
      if (body.model !== POLICY.model || !validUsage(usage) || usage.outputTokens > requested) {
        entry.state = 'budget_integrity_violation'; save(ledger); fail();
      }
      entry.state = 'settled'; entry.usage = usage; entry.chargedNanos = costNanos(usage.inputTokens, usage.outputTokens);
      save(ledger); // account even if the subsequent application validator rejects output
    }
    return response;
  } finally {
    closeSync(fd);
    // A failed durable write cannot silently release the campaign for another call.
    if (!persistenceFailed) unlinkSync(lock);
  }
}
