import assert from 'node:assert/strict';
import { LegacyDeliveryPersistenceError, callLegacyDeliveryRpc, type LegacyDeliveryRpcTransport } from './legacyDeliveryDb';

const main = async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const transport: LegacyDeliveryRpcTransport = {
    url: 'https://synthetic.invalid',
    serviceRoleKey: 'test-only-service-role',
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch,
  };
  const args = { p_actor_id: '11111111-1111-4111-8111-111111111111', p_action: 'task.create' };
  assert.deepEqual(await callLegacyDeliveryRpc(transport, 'legacy_delivery_apply_command', args), { ok: true });
  assert.equal(requests[0].url, 'https://synthetic.invalid/rest/v1/rpc/legacy_delivery_apply_command');
  assert.deepEqual(JSON.parse(requests[0].init?.body as string), args);
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, 'Bearer test-only-service-role');
  assert.equal(requests[0].init?.redirect, 'error');

  await assert.rejects(callLegacyDeliveryRpc({ ...transport, fetcher: (async () => new Response('{}', { status: 500 })) as typeof fetch },
    'legacy_delivery_query', {}), LegacyDeliveryPersistenceError);
  await assert.rejects(callLegacyDeliveryRpc({ ...transport, fetcher: (async () => new Response('[]', {
    status: 200, headers: { 'Content-Length': '12500001' },
  })) as typeof fetch }, 'legacy_delivery_query', {}), LegacyDeliveryPersistenceError);
  await assert.rejects(callLegacyDeliveryRpc({ ...transport, fetcher: (async () => { throw new Error('network'); }) as typeof fetch },
    'legacy_delivery_query', {}), LegacyDeliveryPersistenceError);
  console.log('legacy delivery database transport: exact RPC path, bounded response and fail-closed errors passed');
};

main().catch(error => { console.error(error); process.exitCode = 1; });
