import type { StudioPrivateArtifactReconciliationOperationResult } from './studioPrivateArtifactDb.ts';
import type { StudioPrivateArtifactDueWork } from './studioPrivateArtifactRpcContract.ts';

export type StudioPrivateArtifactReconciliationKind = 'rendition' | 'deletion' | 'due';
export interface StudioPrivateArtifactReconciliationDependencies {
  configuredWorkerSecret?: string;
  loadDue?(limit: number): Promise<readonly StudioPrivateArtifactDueWork[]>;
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

const parseDueLimit = async (request: Request) => {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  let value: unknown;
  try { value = await request.json(); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 &&
      Number.isSafeInteger(record.limit) &&
      Number(record.limit) >= 1 &&
      Number(record.limit) <= 50
    ? Number(record.limit)
    : null;
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
  try {
    if (kind === 'due') {
      const limit = await parseDueLimit(request);
      if (!limit) return response(400, { error: 'invalid_request' });
      if (!dependencies.loadDue) return response(503, { status: 'unavailable' });
      const due = await dependencies.loadDue(limit);
      const counts: Record<string, number> = {
        attempted: 0,
        available: 0,
        deleted: 0,
        replay: 0,
        failed: 0,
        reconciliation_required: 0,
        not_executable: 0,
        unavailable: 0,
      };
      for (const item of due) {
        counts.attempted += 1;
        try {
          const result = item.kind === 'rendition'
            ? await dependencies.reconcileRendition(item.attemptId)
            : await dependencies.reconcileDeletion(item.attemptId);
          counts[result.status] += 1;
        } catch {
          counts.unavailable += 1;
        }
      }
      return response(200, { status: 'processed', ...counts });
    }
    const attemptId = await parseAttempt(request);
    if (!attemptId) return response(400, { error: 'invalid_request' });
    const result = kind === 'rendition'
      ? await dependencies.reconcileRendition(attemptId)
      : await dependencies.reconcileDeletion(attemptId);
    return response(200, { status: result.status, ...('failureCode' in result ? { failureCode: result.failureCode } : {}) });
  } catch {
    return response(503, { status: 'unavailable' });
  }
};
