import assert from 'node:assert/strict';
import { createDeliveryMonitorDatabase } from './deliveryMonitorDb';

const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
const database = createDeliveryMonitorDatabase(async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  calls.push({ name, args });
  return { name, args } as T;
});
const organizationId = '40000000-0000-4000-8000-000000000001';
const workspaceId = '40000000-0000-4000-8000-000000000002';

const run = async () => {
  await database.execute({ action: 'delivery.handoff.consume' });
  await database.loadDeliveryProjection(organizationId, workspaceId);
  await database.loadMonitorProjection(organizationId, workspaceId, { baselineId: '40000000-0000-4000-8000-000000000003' });
  assert.deepEqual(calls, [
    { name: 'enterprise_delivery_monitor_command', args: { p_command: { action: 'delivery.handoff.consume' } } },
    { name: 'enterprise_delivery_workspace_projection', args: { p_org: organizationId, p_workspace: workspaceId, p_query: {} } },
    { name: 'enterprise_monitor_approved_baselines_projection', args: { p_org: organizationId, p_workspace: workspaceId, p_query: { baselineId: '40000000-0000-4000-8000-000000000003' } } },
  ]);
};

run().catch(error => { console.error(error); process.exitCode = 1; });
