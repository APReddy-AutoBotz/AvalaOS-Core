/** Only the new creation-access endpoints use this bounded ingress reader. */
export class CreationAccessBodyError extends Error {
  constructor() { super('CREATION_ACCESS_INVALID_BODY'); }
}

export type CreationAccessBodyLimits = { maxBytes: number; minCodeUnits?: number; maxCodeUnits?: number; timeoutMs?: number };
const DEFAULT_TIMEOUT_MS = 8000;

export const readBoundedCreationJson = async (request: Request, limits: CreationAccessBodyLimits): Promise<unknown> => {
  if (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 2 || limits.maxBytes > 32768)
    throw new CreationAccessBodyError();
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > limits.maxBytes))
    throw new CreationAccessBodyError();
  if (!request.body) throw new CreationAccessBodyError();
  const reader = request.body.getReader();
  const timeoutMs = Number.isSafeInteger(limits.timeoutMs) && (limits.timeoutMs || 0) > 0
    && (limits.timeoutMs || 0) <= DEFAULT_TIMEOUT_MS ? limits.timeoutMs as number : DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let total = 0;
  const chunks: Uint8Array[] = [];
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      reject(new CreationAccessBodyError());
    }, timeoutMs);
  });
  const effect = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > limits.maxBytes) throw new CreationAccessBodyError();
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if ((limits.minCodeUnits !== undefined && text.length < limits.minCodeUnits) ||
          (limits.maxCodeUnits !== undefined && text.length > limits.maxCodeUnits))
        throw new CreationAccessBodyError();
      return JSON.parse(text) as unknown;
    } catch { throw new CreationAccessBodyError(); }
    finally { void reader.cancel().catch(() => undefined); }
  };
  try { return await Promise.race([effect(), deadline]); }
  finally { if (timeoutId) clearTimeout(timeoutId); }
};
