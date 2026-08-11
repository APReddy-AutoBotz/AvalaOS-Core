import { PILOT_OPERATIONS_LIVE_STOP, type PilotOperation, type PilotOperationsCommand } from './pilotOperationsContracts.ts';
import type { TenantContext } from './tenantAuthority.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPS = new Set<PilotOperation>(['register_environment','register_release_candidate','validate_release_candidate','approve_promotion','simulate_promotion','supersede_release_candidate','rollback_non_live_promotion','bind_provider_reference','bootstrap_tenant','deprovision_tenant','reactivate_tenant','set_runtime_control','record_recovery_drill']);
const REQUIRED: Record<PilotOperation, string> = {
  register_environment:'operations.manage', register_release_candidate:'release.manage', validate_release_candidate:'release.validate',
  approve_promotion:'release.approve', simulate_promotion:'release.promote', supersede_release_candidate:'release.manage', rollback_non_live_promotion:'release.promote',
  bind_provider_reference:'byok.manage', bootstrap_tenant:'org.admin', deprovision_tenant:'org.admin', reactivate_tenant:'org.admin',
  set_runtime_control:'operations.manage', record_recovery_drill:'operations.manage',
};

export class PilotOperationsCommandError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export const decodePilotOperationsCommand = (value: unknown): PilotOperationsCommand => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PilotOperationsCommandError('VALIDATION_FAILED');
  const v=value as Record<string,unknown>; const operation=v.operation as PilotOperation;
  if (!OPS.has(operation) || typeof v.organizationId!=='string'||!UUID.test(v.organizationId)||typeof v.workspaceId!=='string'||!UUID.test(v.workspaceId)||
      typeof v.requestId!=='string'||!UUID.test(v.requestId)||typeof v.idempotencyKey!=='string'||v.idempotencyKey.length<8||v.idempotencyKey.length>200||
      !Number.isSafeInteger(v.expectedAuthorizationVersion)||(v.expectedAuthorizationVersion as number)<1||
      !Number.isSafeInteger(v.expectedVersion)||(v.expectedVersion as number)<0||
      !v.payload||typeof v.payload!=='object'||Array.isArray(v.payload)) throw new PilotOperationsCommandError('VALIDATION_FAILED');
  const payload=v.payload as Record<string,unknown>;
  if (Object.keys(payload).some(k=>/(secret|token|credential|password|database.?url|signed.?url)/i.test(k))) throw new PilotOperationsCommandError('VALIDATION_FAILED');
  if(operation==='rollback_non_live_promotion'&&(!UUID.test(String(payload.candidateId??''))||!UUID.test(String(payload.rollbackTargetCandidateId??''))||!UUID.test(String(payload.environmentId??''))||!Number.isSafeInteger(payload.rollbackTargetVersion))) throw new PilotOperationsCommandError('VALIDATION_FAILED');
  if (payload.liveActivation===true || payload.target==='hosted' || payload.target==='production') throw new PilotOperationsCommandError(PILOT_OPERATIONS_LIVE_STOP);
  return {operation,organizationId:v.organizationId,workspaceId:v.workspaceId,requestId:v.requestId,idempotencyKey:v.idempotencyKey,expectedAuthorizationVersion:v.expectedAuthorizationVersion as number,expectedVersion:v.expectedVersion as number,payload};
};

export const authorizePilotOperationsCommand = (command:PilotOperationsCommand, authority:TenantContext): void => {
  if(authority.organizationId!==command.organizationId||authority.workspaceId!==command.workspaceId) throw new PilotOperationsCommandError('ACCESS_DENIED');
  if(authority.authorizationVersion!==command.expectedAuthorizationVersion) throw new PilotOperationsCommandError('AUTHORIZATION_STALE');
  if(!authority.capabilities.includes(REQUIRED[command.operation])) throw new PilotOperationsCommandError('ACCESS_DENIED');
};

export const canonicalPilotOperationsPayload = (command:PilotOperationsCommand): string => JSON.stringify({operation:command.operation,organizationId:command.organizationId,workspaceId:command.workspaceId,expectedVersion:command.expectedVersion,payload:Object.fromEntries(Object.entries(command.payload).sort(([a],[b])=>a.localeCompare(b)))});
