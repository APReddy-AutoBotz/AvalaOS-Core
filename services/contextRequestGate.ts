export interface ClientRequestContext {
  organizationId: string;
  workspaceId: string;
  actorId?: string;
}

export interface ClientRequestTicket {
  sequence: number;
  contextKey: string;
}

export const clientRequestContextKey = (context: ClientRequestContext) =>
  `${context.actorId ?? 'anonymous'}:${context.organizationId}:${context.workspaceId}`;

/** In-memory stale-response suppression; no context or response is persisted. */
export function createContextRequestGate() {
  let sequence = 0;
  let activeContextKey: string | null = null;

  return {
    start(context: ClientRequestContext): ClientRequestTicket {
      activeContextKey = clientRequestContextKey(context);
      return { sequence: ++sequence, contextKey: activeContextKey };
    },
    invalidate() {
      sequence += 1;
      activeContextKey = null;
    },
    accepts(ticket: ClientRequestTicket, context: ClientRequestContext) {
      const contextKey = clientRequestContextKey(context);
      return ticket.sequence === sequence
        && ticket.contextKey === contextKey
        && activeContextKey === contextKey;
    },
    activeContext() {
      return activeContextKey;
    },
  };
}
