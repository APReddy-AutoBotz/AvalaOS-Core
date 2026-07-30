import type { StudioPrivateArtifactReconciliationOperationResult } from './studioPrivateArtifactDb.ts';

export type StudioPrivateArtifactReconciliationKind = 'rendition' | 'deletion';
export interface StudioPrivateArtifactReconciliationDependencies {
  configuredWorkerSecret?: string;
  reconcileRendition(attemptId: string): Promise<StudioPrivateArtifactReconciliationOperationResult>;
  reconcileDeletion(attemptId: string): Promise<StudioPrivateArtifactReconciliationOperationResult>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const encoder = new TextEncoder();
const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });

const constantTimeSecretMatch = async (presented: string, expected: string) => {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.byteLength ^ b.byteLength;
  for (let index = 0; index < Math.max(a.byteLength, b.byteLength); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
};

export const authenticateStudioPrivateArtifactWorker = async (
  request: Request,
  configuredSecret?: string,
) => {
  if (!configuredSecret || configuredSecret.length < 32 || configuredSecret !== configuredSecret.trim()) return false;
  if (request.headers.has('authorization') || request.headers.has('origin')) return false;
  const presented = request.headers.get('x-avala-studio-worker-secret');
  if (!presented || presented.includes(',') || presented.length > 512) return false;
  return constantTimeSecretMatch(presented, configuredSecret);
};

const parseAttempt = async (request: Request) => {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  let value: unknown;
  try { value = await request.json(); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !UUID.test(String(record.attemptId ?? ''))) return null;
  return String(record.attemptId);
};

export const handleStudioPrivateArtifactReconciliation = async (
  request: Request,
  kind: StudioPrivateArtifactReconciliationKind,
  dependencies: StudioPrivateArtifactReconciliationDependencies,
) => {
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
  if (!(await authenticateStudioPrivateArtifactWorker(request, dependencies.configuredWorkerSecret))) {
    return response(401, { error: 'worker_authentication_required' });
  }
  const attemptId = await parseAttempt(request);
  if (!attemptId) return response(400, { error: 'invalid_request' });
  try {
    const result = kind === 'rendition'
      ? await dependencies.reconcileRendition(attemptId)
      : await dependencies.reconcileDeletion(attemptId);
    return response(200, { status: result.status, ...('failureCode' in result ? { failureCode: result.failureCode } : {}) });
  } catch {
    return response(503, { status: 'unavailable' });
  }
};
