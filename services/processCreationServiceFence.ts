import type { AssessProcess, EnterpriseSessionState, TenantContextProjection } from '../types';

export const processScopeKey = (actorId: string | undefined, organizationId: string | undefined, workspaceId: string | undefined): string | null =>
  actorId && organizationId && workspaceId ? `${actorId}:${organizationId}:${workspaceId}` : null;

/** This is a UI-response fence, not authorization. Server authority stays in the command. */
export const processReadAuthorityKey = (input: {
  actorId?: string;
  organizationId?: string;
  workspaceId?: string;
  sessionState: EnterpriseSessionState;
  tenantContext: TenantContextProjection | null;
  localAuthority: boolean;
}): string | null => {
  const scope = processScopeKey(input.actorId,input.organizationId,input.workspaceId);
  if (!scope || !['ready','read_only'].includes(input.sessionState)) return null;
  if (input.localAuthority) return `${scope}:local:${input.sessionState}`;
  const context = input.tenantContext;
  if (!context || context.userId !== input.actorId || context.organizationId !== input.organizationId || context.workspaceId !== input.workspaceId ||
    !context.capabilities.includes('assess.read') || !Number.isSafeInteger(context.authorizationVersion) || context.authorizationVersion < 1) return null;
  return `${scope}:server:${input.sessionState}:v${context.authorizationVersion}:${[...context.capabilities].sort().join(',')}`;
};

export const visibleProcessesForAuthority = (processes: AssessProcess[], settledKey: string | null, authorityKey: string | null) =>
  authorityKey && settledKey === authorityKey ? processes : [];

export const creationCompletionMatchesAuthority = (expectedKey: string | null, currentKey: string | null) =>
  Boolean(expectedKey && currentKey && expectedKey === currentKey);

type Listener = (scopeKey: string) => void;
const listeners = new Set<Listener>();
export const subscribeProcessCreation = (listener: Listener) => { listeners.add(listener); return () => listeners.delete(listener); };
/** A scope-only invalidation; no resource payload or browser claim is broadcast. */
export const announceProcessCreation = (scopeKey: string) => { for (const listener of [...listeners]) listener(scopeKey); };
