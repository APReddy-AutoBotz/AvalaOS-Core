import assert from 'node:assert/strict';
import {
  isCompleteStudioDeliveryOutcomeProjection,
  loadCompleteStudioDeliveryOutcomeProjection,
} from './outcomePaging';
import type { StudioDeliveryOutcomeQueryResult } from './contracts';

const id = (digit: string) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const projectId = id('1');
const scope = {
  actorId: id('2'), organizationId: id('3'), workspaceId: id('4'), authorizationVersion: 1,
};
const item = (digit: string): StudioDeliveryOutcomeQueryResult['items'][number] => ({
  outcomeId: id(digit), version: 1, taskId: id('5'), taskVersion: 1, projectId,
  status: 'partial', label: `Outcome ${digit}`, detail: `Recorded detail ${digit}`,
  documentGenerationId: id('6'), studioArtifactId: id('7'), studioArtifactVersionId: id('8'),
  recordedBy: scope.actorId, recordedAt: '2026-10-10T00:00:00.000Z',
});
const page = (
  items: StudioDeliveryOutcomeQueryResult['items'],
  nextCursor: string | null,
): StudioDeliveryOutcomeQueryResult => ({
  ok: true, schemaVersion: 'studio-delivery-outcome-query.v1', projectId, items,
  page: { limit: 100, nextCursor, hasMore: nextCursor !== null },
});

const main = async () => {
  const requested: Array<string | null> = [];
  const result = await loadCompleteStudioDeliveryOutcomeProjection(scope, projectId, undefined, async (_scope, input) => {
    requested.push(input.cursor);
    return input.cursor === null ? page([item('9')], id('a')) : page([item('b')], null);
  });
  assert.deepEqual(requested, [null, id('a')]);
  assert.deepEqual(result.items.map(value => value.outcomeId), [id('9'), id('b')]);
  assert.equal(isCompleteStudioDeliveryOutcomeProjection(result, projectId), true);

  await assert.rejects(
    loadCompleteStudioDeliveryOutcomeProjection(scope, projectId, undefined, async () => page([item('9')], id('a'))),
    /OUTCOME_PAGE_CONFLICT/u,
  );

  await assert.rejects(
    loadCompleteStudioDeliveryOutcomeProjection(scope, projectId, undefined, async (_scope, input) => ({
      ...page([item(input.cursor === null ? '9' : 'b')], null), projectId: id('c'),
    })),
    /OUTCOME_PROJECT_MISMATCH/u,
  );

  assert.equal(isCompleteStudioDeliveryOutcomeProjection(page([], id('a')), projectId), false);
  console.log('Delivery outcome Monitor paging: complete bounded projection and fail-closed pagination passed');
};
void main().catch(error => { console.error(error instanceof Error ? error.message : 'OUTCOME_PAGING_TEST_FAILED'); process.exitCode = 1; });
