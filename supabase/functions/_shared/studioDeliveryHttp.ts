import type { StudioDeliveryErrorCode, StudioDeliveryErrorResponse } from '../../../services/productAcceptanceBridge/contracts.ts';

export const STUDIO_DELIVERY_MAX_BODY_BYTES = 512_000;
const BODY_TIMEOUT_MS = 8_000;
export const studioDeliveryCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const messages: Record<StudioDeliveryErrorCode, string> = {
  INVALID_COMMAND: 'Request is invalid.', AUTHENTICATION_REQUIRED: 'Authentication is required.',
  RESOURCE_UNAVAILABLE: 'The requested resource is unavailable.', AUTHORIZATION_STALE: 'Authorization changed. Refresh before retrying.',
  IDEMPOTENCY_CONFLICT: 'The command identity was already used for a different request.', VERSION_CONFLICT: 'The source changed before the command could be committed.',
  FEATURE_DISABLED: 'Studio publication or Delivery outcome writes are disabled.', READ_ONLY: 'The boundary is read-only.',
  COMMAND_IN_PROGRESS: 'The command outcome is still being reconciled.', PERSISTENCE_UNAVAILABLE: 'The Studio-to-Delivery boundary is unavailable.',
};

export const studioDeliveryResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...studioDeliveryCorsHeaders, 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});
export const studioDeliveryError = (code: StudioDeliveryErrorCode, status: number) => {
  const body: StudioDeliveryErrorResponse = { ok: false, error: { code, message: messages[code] } };
  return studioDeliveryResponse(body, status);
};
export const handleStudioDeliveryOptions = (request: Request) => request.method === 'OPTIONS'
  ? new Response('ok', { headers: { ...studioDeliveryCorsHeaders, 'Cache-Control': 'no-store' } }) : null;

export const readBoundedStudioDeliveryJson = async (request: Request): Promise<unknown> => {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > STUDIO_DELIVERY_MAX_BODY_BYTES) || !request.body) throw new Error('INVALID_BODY');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('INVALID_BODY')), BODY_TIMEOUT_MS); });
  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > STUDIO_DELIVERY_MAX_BODY_BYTES) throw new Error('INVALID_BODY');
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch { throw new Error('INVALID_BODY'); }
    finally { void reader.cancel().catch(() => undefined); }
  };
  try { return await Promise.race([read(), deadline]); }
  finally { if (timeout) clearTimeout(timeout); }
};
