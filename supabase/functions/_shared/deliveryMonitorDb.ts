import { rpc } from './supabase.ts';

export type DeliveryMonitorRpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

export interface DeliveryMonitorDatabase {
  execute(command: Record<string, unknown>): Promise<unknown>;
  loadDeliveryProjection(organizationId: string, workspaceId: string, query?: Record<string, unknown>): Promise<unknown>;
  loadMonitorProjection(organizationId: string, workspaceId: string, query?: Record<string, unknown>): Promise<unknown>;
}

export const createDeliveryMonitorDatabase = (
  invoke: DeliveryMonitorRpc = rpc,
): DeliveryMonitorDatabase => ({
  execute: command => invoke('enterprise_delivery_monitor_command', { p_command: command }),
  loadDeliveryProjection: (organizationId, workspaceId, query = {}) => invoke(
    'enterprise_delivery_workspace_projection',
    { p_org: organizationId, p_workspace: workspaceId, p_query: query },
  ),
  loadMonitorProjection: (organizationId, workspaceId, query = {}) => invoke(
    'enterprise_monitor_approved_baselines_projection',
    { p_org: organizationId, p_workspace: workspaceId, p_query: query },
  ),
});
