import type { AssessProcess, TenantContextProjection } from '../types';
import { supabase } from './supabaseClient';
import { buildProcessCreateEnvelope, parseProcessCreateResource, ProcessCreateError, type ProcessCreateEnvelope, type ProcessCreateInput } from './processCreationContract';

export type ProcessCreateTransport = {
  invoke(envelope: ProcessCreateEnvelope): Promise<unknown>;
  read(envelope: ProcessCreateEnvelope): Promise<unknown>;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const codes = new Set(['INVALID_COMMAND', 'AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'AUTHORITY_STALE', 'FEATURE_DISABLED', 'READ_ONLY', 'IDEMPOTENCY_CONFLICT', 'QUOTA_EXCEEDED']);
const errorFrom = (value: unknown): ProcessCreateError | null => {
  if (!object(value) || !object(value.error) || typeof value.error.code !== 'string') return null;
  return codes.has(value.error.code) ? new ProcessCreateError(value.error.code as ProcessCreateError['code']) : new ProcessCreateError('COMMAND_UNAVAILABLE');
};

export const defaultProcessCreateTransport: ProcessCreateTransport = {
  async invoke(envelope) {
    const { data, error } = await supabase.functions.invoke('process-command', { body: envelope });
    if (!error) return data;
    let body: unknown;
    try { body = await (error as { context?: Response }).context?.clone().json(); } catch { /* Controlled unknown outcome. */ }
    const domain = errorFrom(body);
    if (domain) throw domain;
    throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  },
  async read(envelope) {
    const { data, error } = await supabase.from('assess_processes')
      .select('id,org_id,workspace_id,owner_id,name,description,department,criticality,status,template_id,created_at,updated_at,creation_receipt_id,creation_request_id,creation_idempotency_key')
      .eq('id', envelope.payload.processId).eq('org_id', envelope.organizationId)
      .eq('workspace_id', envelope.workspaceId).is('deleted_at', null).maybeSingle();
    if (error) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
    if (!data) return null;
    return {
      id: data.id, orgId: data.org_id, workspaceId: data.workspace_id, ownerId: data.owner_id,
      name: data.name, description: data.description, department: data.department,
      criticality: data.criticality, status: data.status, templateId: data.template_id,
      version: 1, receiptId: data.creation_receipt_id, requestId: data.creation_request_id,
      idempotencyKey: data.creation_idempotency_key, createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },
};

/** A success is presented only after an independently scoped committed read. */
export const createProcessViaCommand = async (
  context: TenantContextProjection,
  input: ProcessCreateInput,
  transport: ProcessCreateTransport = defaultProcessCreateTransport,
  anchor?: { requestId: string; idempotencyKey: string; processId: string },
): Promise<{ process: AssessProcess; anchor: ProcessCreateEnvelope }> => {
  const envelope = buildProcessCreateEnvelope(context, input, anchor);
  let outcome: unknown;
  let claimedReceiptId: string | null = null;
  try { outcome = await transport.invoke(envelope); }
  catch (error) { if (!(error instanceof ProcessCreateError) || error.code !== 'COMMAND_UNAVAILABLE') throw error; }
  if (outcome !== undefined) {
    const domain = errorFrom(outcome);
    if (domain) throw domain;
    if (!object(outcome) || outcome.ok !== true || !['committed', 'replayed'].includes(outcome.outcome as string)) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
    parseProcessCreateResource(outcome.resource, envelope, context.userId);
    claimedReceiptId = (outcome.resource as Record<string, unknown>).receiptId as string;
  }
  const read = await transport.read(envelope);
  if (!read) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  const process = parseProcessCreateResource(read, envelope, context.userId);
  if (claimedReceiptId !== null && (!object(read) || read.receiptId !== claimedReceiptId)) throw new ProcessCreateError('COMMAND_UNAVAILABLE');
  return { process, anchor: envelope };
};
