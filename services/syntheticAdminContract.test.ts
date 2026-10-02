import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSyntheticAdminEnvelope, SyntheticAdminError } from './syntheticAdminContract.ts';

const id = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const workspace = '33333333-3333-4333-8333-333333333333';
const write = { organizationId: org, workspaceId: workspace, expectedAuthorizationVersion: 4,
  requestId: id, idempotencyKey: 'request-key-12345678' };

test('synthetic password boundaries match Auth before consuming a provisioning claim', () => {
  for (const length of [12, 72]) assert.equal(parseSyntheticAdminEnvelope({ ...write, operation: 'execute',
    payload: { reservationId: id, password: 'Aa1!' + 'x'.repeat(length - 4) } }).operation, 'execute');
  for (const length of [11, 73, 128]) assert.throws(() => parseSyntheticAdminEnvelope({ ...write, operation: 'execute',
    payload: { reservationId: id, password: 'Aa1!' + 'x'.repeat(length - 4) } }),
  (error: unknown) => error instanceof SyntheticAdminError && error.errorCode === 'INVALID_REQUEST');
});

test('synthetic Admin contract accepts an exact reserve and list envelope', () => {
  const reserve = parseSyntheticAdminEnvelope({ ...write, operation: 'reserve', payload: { label: 'Author A', rolePreset: 'author' } });
  assert.equal(reserve.operation, 'reserve');
  assert.deepEqual(reserve.payload, { label: 'Author A', rolePreset: 'author' });
  const list = parseSyntheticAdminEnvelope({ organizationId: org, workspaceId: workspace,
    expectedAuthorizationVersion: 4, operation: 'list', payload: { limit: 20 } });
  assert.equal(list.operation, 'list');
});

test('synthetic Admin contract rejects extra authority, arbitrary roles, and malformed secrets', () => {
  const variants = [
    { ...write, operation: 'reserve', payload: { label: 'A', rolePreset: 'admin' } },
    { ...write, operation: 'reserve', payload: { label: 'A', rolePreset: 'author', capabilities: ['org.admin'] } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'short' } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'lowercase-only-123' } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'UppercaseOnly123' } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'Upper case-Only123' } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'Unicode-Éxample123!' } },
    { ...write, operation: 'execute', payload: { reservationId: id, password: 'safe-long-value', authUserId: id } },
    { ...write, operation: 'assign_role', payload: { reservationId: id, expectedVersion: 1, rolePreset: 'owner' } },
    { ...write, operation: 'revoke', payload: { reservationId: id, expectedVersion: 0 } },
    { ...write, operation: 'reserve', payload: { label: 'A', rolePreset: 'author' }, actorId: id },
    { ...write, workspaceId: org, operation: 'list', payload: {} },
  ];
  for (const variant of variants) assert.throws(() => parseSyntheticAdminEnvelope(variant),
    (error: unknown) => error instanceof SyntheticAdminError && error.errorCode === 'INVALID_REQUEST');
});
