import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GovernedDeliveryWorkspace, { MonitorApprovedBaselinePanel } from './GovernedDeliveryWorkspace';
import type { DeliveryWorkspaceProjection, MonitorApprovedBaselinesProjection } from '../../services/deliveryMonitor';

const id = (value: number) => `${String(value).padStart(8, '0')}-0000-4000-8000-${String(value).padStart(12, '0')}`;
const delivery: DeliveryWorkspaceProjection = {
  contractVersion: 'enterprise-delivery-workspace-2', organizationId: id(1), workspaceId: id(2), readOnly: false,
  featureFlags: { moduleHandoffsEnabled: true, directDeliveryPlanningEnabled: true, deliveryItemReviewEnabled: true, monitorApprovedBaselineEnabled: true },
  page: { packageLimit: 100, packageHasMore: false, handoffLimit: 100, handoffHasMore: false, itemHistoryLimit: 250, eventHistoryLimit: 50, handoffTargetItemLimit: 250,
    baselineEligibilityLimit: 100, baselineEligibilityHasMore: false, baselineEligibilityCursorApplied: false },
  eligibleStudioArtifacts: [], baselineEligibility: [], inbox: [], outbox: [], actions: ['delivery.package.create.manual'],
  packages: [{
    id: id(3), currentVersionId: id(4), currentVersion: 2, aggregateVersion: 1, status: 'draft', label: 'Synthetic governed package',
    sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true },
    items: [{ aggregateId: id(6), currentVersionId: id(7), aggregateVersion: 1, version: 1, status: 'proposed', type: 'task', title: 'Synthetic task', description: 'Bounded planning task.', acceptanceCriteria: ['Human confirmation'], nonFunctionalRequirements: ['No execution'], history: [], diffs: [], actions: ['delivery.item.review'] }],
    itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true }, historyPage: { limit: 50, reviewHasMore: false, approvalHasMore: false }, reviewState: 'not_requested', approvalState: 'not_requested', blockers: ['1 work item decision unresolved.'], blockerCount: 1, reviewHistory: [], approvalHistory: [], actions: [],
  }],
};
const monitor: MonitorApprovedBaselinesProjection = { contractVersion: 'enterprise-monitor-approved-baselines-2', organizationId: id(1), workspaceId: id(2), featureFlags: { monitorApprovedBaselineEnabled: true }, readOnly: true, liveTelemetryConnected: false, baselines: [], actions: [] };

const html = renderToStaticMarkup(<GovernedDeliveryWorkspace projection={delivery} monitorProjection={monitor} onAction={() => undefined}/>);
assert.match(html, /Canonical Delivery proposals/);
assert.match(html, /Not assessed · Planning only/);
assert.match(html, /no fabricated Studio or Assess citation/i);
assert.match(html, /Version diff and history/);
assert.match(html, /Create manual planning package/);
assert.match(html, /Live telemetry is disabled/);
assert.match(html, /All 1 canonical items are loaded from 1 bounded server page/);
assert.doesNotMatch(renderToStaticMarkup(<MonitorApprovedBaselinePanel projection={monitor}/>), /Complete task|Change due date|Execute task|Upload transcript/);

const paged: DeliveryWorkspaceProjection = {
  ...delivery,
  packages: [{
    ...delivery.packages[0],
    itemPage: { limit: 100, hasMore: true, cursorApplied: false, isComplete: false, nextCursor: { version: 1, id: id(6) } },
    actions: ['delivery.package.review.resolve'],
  }],
};
const pagedHtml = renderToStaticMarkup(<GovernedDeliveryWorkspace projection={paged} monitorProjection={monitor} onAction={() => undefined} onLoadNextPage={() => undefined}/>);
assert.match(pagedHtml, /1 canonical items are loaded from 1 bounded server page; package completeness is not inferred/);
assert.match(pagedHtml, /Load next bounded page/);
assert.match(pagedHtml, /Approve package review<\/button>/);
assert.match(pagedHtml, /disabled=""[^>]*>Approve package review|Approve package review<\/button>/);
const blockedComplete: DeliveryWorkspaceProjection = { ...delivery, packages: [{ ...delivery.packages[0], status: 'blocked', reviewState: 'changes_requested', actions: ['delivery.package.revision.commit'] }] };
const blockedCompleteHtml = renderToStaticMarkup(<GovernedDeliveryWorkspace projection={blockedComplete} monitorProjection={monitor} onAction={() => undefined}/>);
assert.match(blockedCompleteHtml, /Blocked package recovery/);
assert.match(blockedCompleteHtml, /Prepare blocked package recovery/);
assert.doesNotMatch(blockedCompleteHtml, /Load every canonical descendant page before recovery can begin/);
const blockedPagedHtml = renderToStaticMarkup(<GovernedDeliveryWorkspace projection={{ ...paged, packages: [{ ...paged.packages[0], status: 'blocked', reviewState: 'changes_requested', actions: ['delivery.package.revision.commit'] }] }} monitorProjection={monitor} onAction={() => undefined} onLoadNextPage={() => undefined}/>);
assert.match(blockedPagedHtml, /Load every canonical descendant page before recovery can begin/);
assert.match(blockedPagedHtml, /disabled=""[^>]*>Prepare blocked package recovery/);
console.log('Governed Delivery presentation: canonical items, planning-only truth, history, and read-only Monitor assertions passed.');
