import {
  queryStudioDeliveryOutcomes,
  type StudioDeliveryScope,
  type StudioDeliveryTransport,
} from './client';
import type { StudioDeliveryOutcomeQueryResult } from './contracts';

const MAX_OUTCOME_PAGES = 100;

type QueryPage = (
  scope: StudioDeliveryScope,
  input: { projectId: string; limit: number; cursor: string | null },
  transport?: StudioDeliveryTransport,
) => Promise<StudioDeliveryOutcomeQueryResult>;

export const isCompleteStudioDeliveryOutcomeProjection = (
  value: StudioDeliveryOutcomeQueryResult,
  projectId: string,
) => value.projectId === projectId && value.page.hasMore === false && value.page.nextCursor === null;

export const loadCompleteStudioDeliveryOutcomeProjection = async (
  scope: StudioDeliveryScope,
  projectId: string,
  transport?: StudioDeliveryTransport,
  queryPage: QueryPage = queryStudioDeliveryOutcomes,
): Promise<StudioDeliveryOutcomeQueryResult> => {
  const items: StudioDeliveryOutcomeQueryResult['items'][number][] = [];
  const outcomeIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < MAX_OUTCOME_PAGES; pageIndex += 1) {
    const page = await queryPage(scope, { projectId, limit: 100, cursor }, transport);
    if (page.projectId !== projectId) throw new Error('OUTCOME_PROJECT_MISMATCH');
    for (const item of page.items) {
      if (item.projectId !== projectId || outcomeIds.has(item.outcomeId)) throw new Error('OUTCOME_PAGE_CONFLICT');
      outcomeIds.add(item.outcomeId);
      items.push(item);
    }
    if (!page.page.hasMore) {
      if (page.page.nextCursor !== null) throw new Error('OUTCOME_PAGE_CONFLICT');
      return {
        ok: true,
        schemaVersion: page.schemaVersion,
        projectId,
        items,
        page: { limit: 100, nextCursor: null, hasMore: false },
      };
    }
    if (!page.page.nextCursor || cursors.has(page.page.nextCursor)) throw new Error('OUTCOME_PAGE_CONFLICT');
    cursors.add(page.page.nextCursor);
    cursor = page.page.nextCursor;
  }
  throw new Error('OUTCOME_PAGE_LIMIT_EXCEEDED');
};
