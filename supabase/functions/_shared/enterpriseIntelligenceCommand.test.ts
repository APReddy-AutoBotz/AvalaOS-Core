import assert from 'node:assert/strict';
import { EnterpriseCommandError, enterpriseCommandErrorBody, parseEnterpriseCommandEnvelope } from './enterpriseIntelligenceCommand';
import { hashReceiptValue } from './enterpriseReceipt';

const base = {
  commandType: 'evidence.candidate.review',
  requestId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: 'review-candidate-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  payload: { candidateId: '44444444-4444-4444-8444-444444444444', status: 'accepted' },
};

const test = (name: string, callback: () => void) => {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
};

test('parses a strict tenant-scoped command envelope', () => {
  const parsed = parseEnterpriseCommandEnvelope(base);
  assert.equal(parsed.commandType, 'evidence.candidate.review');
  assert.equal(parsed.workspaceId, base.workspaceId);
});

test('rejects unknown commands and raw secret fields', () => {
  assert.throws(
    () => parseEnterpriseCommandEnvelope({ ...base, commandType: 'provider.fallback' }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_COMMAND',
  );
  assert.throws(
    () => parseEnterpriseCommandEnvelope({ ...base, payload: { ...base.payload, apiKey: 'never' } }),
    (error: unknown) => error instanceof EnterpriseCommandError && error.code === 'INVALID_PAYLOAD',
  );
});

test('rejects malformed ids and unsafe idempotency keys', () => {
  assert.throws(() => parseEnterpriseCommandEnvelope({ ...base, requestId: 'not-a-uuid' }), /INVALID_PAYLOAD/);
  assert.throws(() => parseEnterpriseCommandEnvelope({ ...base, idempotencyKey: 'bad key' }), /INVALID_COMMAND/);
});

test('receipt finalization failure is explicit and fail-closed', () => {
  const error = new EnterpriseCommandError('RECEIPT_FINALIZATION_FAILED');
  assert.equal(error.status, 503);
  assert.deepEqual(enterpriseCommandErrorBody(error), {
    ok: false,
    error: {
      code: 'RECEIPT_FINALIZATION_FAILED',
      message: 'The Enterprise Intelligence command could not be completed.',
    },
  });
});

const firstAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const replayAttemptHash = await hashReceiptValue({ ...base, requestId: null });
const changedPayloadHash = await hashReceiptValue({ ...base, requestId: null, payload: { ...base.payload, status: 'rejected' } });
assert.equal(firstAttemptHash, replayAttemptHash);
assert.notEqual(firstAttemptHash, changedPayloadHash);
console.log('ok - requestId is correlation-only while changed payloads conflict');
