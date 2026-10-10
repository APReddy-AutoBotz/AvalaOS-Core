import assert from 'node:assert/strict';
import {
  assertLegacyDeliveryCreateProjectionSupported,
  assertLegacyDeliveryUpdateProjectionSupported,
  mapLegacyDeliveryTask,
  resolveLegacyDeliveryImportSelection,
} from './deliveryAdapter';
import type { LegacyDeliveryTaskProjection } from '../legacyDelivery/contracts';
import type { WorkItem } from '../../types';

const source: WorkItem[] = [
  { type: 'Epic', title: 'Govern intake', description: 'Group governed intake work.', acceptanceCriteria: [] },
  { type: 'Story', title: 'Review request', description: 'Review one request.', acceptanceCriteria: ['Decision is recorded.'] },
  { type: 'Task', title: 'Publish result', description: 'Publish the approved result.', acceptanceCriteria: ['Only approved results publish.'] },
];
const serverSource = source.map((item, sourceIndex) => ({ sourceIndex, ...item }));

assert.deepEqual(
  resolveLegacyDeliveryImportSelection(source, [source[2], source[0], source[1]], serverSource),
  [0, 1, 2],
  'modal selections become sorted server source indices',
);
assert.throws(
  () => resolveLegacyDeliveryImportSelection(
    source.map((item, index) => index === 1 ? { ...item, title: 'Changed in the browser' } : item),
    [source[1]],
    serverSource,
  ),
  /changed after it was opened/,
  'client content drift fails before an import command is built',
);

const mappedTask = mapLegacyDeliveryTask({
  id: 'a2000000-0000-4000-8000-000000000040', version: 1, mutable: true,
  projectId: 'a2000000-0000-4000-8000-000000000018', title: 'Server task', description: '', status: 'To Do',
  priority: 'Medium', type: 'Task', assigneeIds: [], dependencyIds: [], ownerId: 'a2000000-0000-4000-8000-000000000001', reporterId: null,
  sourceLineage: null, sourceEpicIndex: null, sourceEpicTitle: null, retentionState: 'active', retentionClass: 'none',
  retentionReason: null, deletionRequestedAt: null, deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
});
assert.doesNotThrow(() => assertLegacyDeliveryCreateProjectionSupported({ title: 'Supported', projectId: mappedTask.projectId }));
assert.throws(
  () => assertLegacyDeliveryCreateProjectionSupported({ title: 'Unsupported', projectId: mappedTask.projectId, storyPoints: 3 }),
  /story points.*read-only planning fields/,
  'create rejects unsupported planning data instead of silently dropping it',
);
assert.doesNotThrow(() => assertLegacyDeliveryUpdateProjectionSupported(mappedTask, { ...mappedTask, status: 'In Progress' }));
assert.throws(
  () => assertLegacyDeliveryUpdateProjectionSupported(mappedTask, { ...mappedTask, dueDate: '2026-10-20' }),
  /dueDate/,
  'update rejects unsupported mixed edits instead of reporting false success',
);
assert.throws(
  () => resolveLegacyDeliveryImportSelection(source, [source[0]], serverSource),
  /Story or Task/,
  'an epic-only selection cannot create an empty authoritative import',
);

const projection: LegacyDeliveryTaskProjection = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 3,
  mutable: true,
  projectId: '22222222-2222-4222-8222-222222222222',
  title: 'Review request',
  description: 'Review one request.',
  status: 'In Progress',
  priority: 'High',
  type: 'Story',
  assigneeIds: ['33333333-3333-4333-8333-333333333333'],
  dependencyIds: [],
  ownerId: '44444444-4444-4444-8444-444444444444',
  reporterId: null,
  sourceLineage: {
    schemaVersion: 'legacy-delivery-lineage.v1',
    importId: '66666666-6666-4666-8666-666666666666',
    documentGenerationId: '55555555-5555-4555-8555-555555555555',
    documentSourceDigest: 'a'.repeat(64),
    sourceItemIndex: 1,
    sourceProcessId: '77777777-7777-4777-8777-777777777777',
    sourceAssessmentId: '88888888-8888-4888-8888-888888888888',
    sourceEpicIndex: 0,
    sourceEpicTitle: 'Govern intake',
  },
  sourceEpicIndex: 0,
  sourceEpicTitle: 'Govern intake',
  retentionState: 'active',
  retentionClass: 'none',
  retentionReason: null,
  deletionRequestedAt: null,
  deletionRequestedBy: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:01:00Z',
};
const mapped = mapLegacyDeliveryTask(projection);
assert.equal(mapped.version, 3);
assert.equal(mapped.readOnlyHistorical, false);
assert.equal(mapped.epicId, 'legacy-source-epic:55555555-5555-4555-8555-555555555555:0');
assert.deepEqual(mapped.assigneeIds, projection.assigneeIds);

const historical = mapLegacyDeliveryTask({ ...projection, version: null, mutable: false, sourceLineage: null, sourceEpicIndex: null, sourceEpicTitle: null });
assert.equal(historical.version, undefined);
assert.equal(historical.readOnlyHistorical, true);
assert.equal(historical.epicId, undefined);

console.log('legacy Delivery adapter projection and selection tests passed');
