import type { LegacyDeliveryErrorCode, LegacyDeliveryErrorResponse } from '../../../services/legacyDelivery/contracts.ts';

export const LEGACY_DELIVERY_MAX_BODY_BYTES = 32_768;
const LEGACY_DELIVERY_BODY_TIMEOUT_MS = 8_000;

export const legacyDeliveryCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class LegacyDeliveryBodyError extends Error {
  constructor() {
    super('LEGACY_DELIVERY_INVALID_BODY');
    this.name = 'LegacyDeliveryBodyError';
  }
}

export const legacyDeliveryResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...legacyDeliveryCorsHeaders,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  },
});

export const legacyDeliveryError = (code: LegacyDeliveryErrorCode, status: number): Response => {
  const messages: Record<LegacyDeliveryErrorCode, string> = {
    INVALID_COMMAND: 'Request is invalid.',
    AUTHENTICATION_REQUIRED: 'Authentication is required.',
    RESOURCE_UNAVAILABLE: 'The requested resource is unavailable.',
    AUTHORIZATION_STALE: 'Authorization changed. Refresh the workspace before retrying.',
    IDEMPOTENCY_CONFLICT: 'The command identity was already used for a different request.',
    VERSION_CONFLICT: 'The resource changed before the command could be committed.',
    FEATURE_DISABLED: 'Legacy Delivery mutations are disabled.',
    READ_ONLY: 'Legacy Delivery is read-only.',
    COMMAND_IN_PROGRESS: 'The command is still being reconciled.',
    PERSISTENCE_UNAVAILABLE: 'Legacy Delivery is unavailable.',
  };
  const body: LegacyDeliveryErrorResponse = { ok: false, error: { code, message: messages[code] } };
  return legacyDeliveryResponse(body, status);
};

export const handleLegacyDeliveryOptions = (request: Request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: { ...legacyDeliveryCorsHeaders, 'Cache-Control': 'no-store' } })
  : null;

export const readBoundedLegacyDeliveryJson = async (request: Request): Promise<unknown> => {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > LEGACY_DELIVERY_MAX_BODY_BYTES)) {
    throw new LegacyDeliveryBodyError();
  }
  if (!request.body) throw new LegacyDeliveryBodyError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new LegacyDeliveryBodyError());
    }, LEGACY_DELIVERY_BODY_TIMEOUT_MS);
  });
  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > LEGACY_DELIVERY_MAX_BODY_BYTES) throw new LegacyDeliveryBodyError();
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return JSON.parse(text) as unknown;
    } catch {
      throw new LegacyDeliveryBodyError();
    } finally {
      void reader.cancel().catch(() => undefined);
    }
  };
  try {
    return await Promise.race([read(), deadline]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};
