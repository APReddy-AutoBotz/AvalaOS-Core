export type { PilotOperationsCommand, PilotOperationsErrorCode, PilotOperationsProjection } from '../../supabase/functions/_shared/pilotOperationsContracts';

export interface PilotOperationsTransport { command(body: unknown): Promise<unknown>; query(body: unknown): Promise<unknown>; }
