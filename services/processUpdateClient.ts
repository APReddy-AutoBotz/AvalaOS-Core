import type { AssessProcess, TenantContextProjection } from '../types';
import { supabase } from './supabaseClient';
import {
  buildProcessUpdateEnvelope,
  parseProcessUpdateResource,
  ProcessUpdateError,
  type ProcessUpdateEnvelope,
  type ProcessUpdateInput,
} from './processUpdateContract';

export type ProcessUpdateTransport = {
  invoke(envelope: ProcessUpdateEnvelope): Promise<unknown>;
  read(envelope: ProcessUpdateEnvelope): Promise<unknown>;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const codes = new Set(['INVALID_COMMAND', 'AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'AUTHORITY_STALE', 'FEATURE_DISABLED', 'READ_ONLY', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT']);
const errorFrom = (value: unknown): ProcessUpdateError | null => {
  if (!object(value) || !object(value.error) || typeof value.error.code !== 'string') return null;
  return codes.has(value.error.code) ? new ProcessUpdateError(value.error.code as ProcessUpdateError['code']) : new ProcessUpdateError('COMMAND_UNAVAILABLE');
};

export const defaultProcessUpdateTransport: ProcessUpdateTransport = {
  async invoke(envelope) {
    const { data, error } = await supabase.functions.invoke('process-command', { body: envelope });
    if (!error) return data;
    let body: unknown;
    try { body = await (error as { context?: Response }).context?.clone().json(); } catch { /* Controlled unknown outcome. */ }
    const domain = errorFrom(body);
    if (domain) throw domain;
    throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  },
  async read(envelope) {
    const { data, error } = await supabase.from('assess_processes')
      .select('id,org_id,workspace_id,owner_id,name,description,department,criticality,status,template_id,authority_version,created_at,updated_at,update_receipt_id,update_request_id,update_idempotency_key')
      .eq('id', envelope.payload.processId).eq('org_id', envelope.organizationId)
      .eq('workspace_id', envelope.workspaceId).is('deleted_at', null).maybeSingle();
    if (error) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
    if (!data) return null;
    return {
      id: data.id, orgId: data.org_id, workspaceId: data.workspace_id, ownerId: data.owner_id,
      name: data.name, description: data.description, department: data.department,
      criticality: data.criticality, status: data.status, templateId: data.template_id,
      version: data.authority_version, receiptId: data.update_receipt_id, requestId: data.update_request_id,
      idempotencyKey: data.update_idempotency_key, createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
};

/** Success is presented only after an independently scoped committed read. */
export const updateProcessViaCommand = async (
  context: TenantContextProjection,
  process: AssessProcess,
  input: ProcessUpdateInput,
  transport: ProcessUpdateTransport = defaultProcessUpdateTransport,
  anchor?: { requestId: string; idempotencyKey: string },
): Promise<{ process: AssessProcess & { version: number }; anchor: ProcessUpdateEnvelope }> => {
  if (!Number.isSafeInteger(process.version) || Number(process.version) < 1) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  const envelope = buildProcessUpdateEnvelope(context, process.id, process.version as number, input, anchor);
  let outcome: unknown;
  let claimedReceiptId: string | null = null;
  try { outcome = await transport.invoke(envelope); }
  catch (error) { if (!(error instanceof ProcessUpdateError) || error.code !== 'COMMAND_UNAVAILABLE') throw error; }
  if (outcome !== undefined) {
    const domain = errorFrom(outcome);
    if (domain) throw domain;
    if (!object(outcome) || outcome.ok !== true || !['committed', 'replayed'].includes(outcome.outcome as string)) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
    parseProcessUpdateResource(outcome.resource, envelope, context.userId);
    claimedReceiptId = (outcome.resource as Record<string, unknown>).receiptId as string;
  }
  const read = await transport.read(envelope);
  if (!read) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  const committed = parseProcessUpdateResource(read, envelope, context.userId);
  if (claimedReceiptId !== null && (!object(read) || read.receiptId !== claimedReceiptId)) throw new ProcessUpdateError('COMMAND_UNAVAILABLE');
  return { process: committed, anchor: envelope };
};
