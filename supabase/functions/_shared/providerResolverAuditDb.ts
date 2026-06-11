import { ProviderResolverAuditEventShell, assertAuditMetadataIsSafe } from './providerResolverAudit.ts';
import { insertRow } from './supabase.ts';

const toAuditStatus = (status: ProviderResolverAuditEventShell['status']) =>
  status === 'allowed' ? 'recorded' : status;

export const persistProviderResolverAuditEvent = async (
  event: ProviderResolverAuditEventShell,
  deps: {
    insert?: (table: string, row: Record<string, unknown>) => Promise<unknown>;
  } = {},
) => {
  assertAuditMetadataIsSafe(event.metadata);

  if (!event.orgId || !event.provider) {
    return { status: 'skipped' as const, reason: 'missing_safe_audit_context' as const };
  }

  await (deps.insert || insertRow)('ai_provider_audit_events', {
    schema_version: event.schemaVersion,
    event_type: event.eventType,
    org_id: event.orgId,
    workspace_id: event.workspaceId || null,
    provider: event.provider,
    provider_config_id: event.providerConfigId || null,
    key_ref_id: event.keyRefId || null,
    operation: event.operation || null,
    mode: event.mode || null,
    policy_result: event.policyResult,
    status: toAuditStatus(event.status),
    failure_class: event.failureClass || null,
    actor_id: event.actorId || null,
    service_context: event.serviceContext,
    correlation_id: event.correlationId,
    evidence_ref: event.evidenceRef || null,
    metadata: event.metadata,
  });

  return { status: 'persisted' as const };
};
