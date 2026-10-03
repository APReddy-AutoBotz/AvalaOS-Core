import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import GovernedDeliveryWorkspace, { MonitorApprovedBaselinePanel } from '../../../components/delivery/GovernedDeliveryWorkspace';
import PortfolioView from '../../../components/shared/PortfolioView';
import controlledHumanFixture from '../../../testing/process-lifecycle/fixtures/delivery-monitor-pr-c/controlled-human-environment.json';
import {
  createDeliveryItemPageFixture,
  decodeDeliveryWorkspaceProjection,
  mergeDeliveryItemPage,
  type DeliveryItemPageRequest,
  type DeliveryMonitorCommandInput,
  type DeliveryPackageProjection,
  type DeliveryWorkspaceProjection,
  type MonitorApprovedBaselinesProjection,
} from '../../../services/deliveryMonitor';

const uuid = (number: number) => `${String(number).padStart(8, '0')}-0000-4000-8000-${String(number).padStart(12, '0')}`;
const organizationId = uuid(1);
const workspaceId = uuid(2);
const artifactId = uuid(3);
const artifactVersionId = uuid(4);
const deliveryPackageId = uuid(6);
const deliveryPackageVersionId = uuid(7);
const handoffId = uuid(8);
const directArtifactId = uuid(55);
const directArtifactVersionId = uuid(56);
const directPackageId = uuid(57);
const directPackageVersionId = uuid(58);
const accessibilityPackageId = uuid(60);
const sequenceTargetItemId = uuid(1_230);
const itemTypes = ['milestone', 'dependency', 'risk', 'story', 'epic', 'task'] as const;

const item = (index: number) => ({
  aggregateId: uuid(1_000 + index),
  currentVersionId: uuid(2_000 + index),
  aggregateVersion: 1,
  version: 1,
  status: 'proposed' as const,
  type: itemTypes[index % itemTypes.length],
  title: `Canonical work item ${String(index).padStart(3, '0')}`,
  description: `Deterministic governed proposal ${index}.`,
  acceptanceCriteria: [`Exact proposal ${index} is reviewed by a human.`],
  nonFunctionalRequirements: ['No execution or live telemetry authority.'],
  sourceCitation: { artifactVersion: 4, artifactType: 'brd' as const, sectionLocator: `brd.sections.requirements-${String(index).padStart(3, '0')}` },
  history: [],
  diffs: [],
  actions: ['delivery.item.review' as const],
});

const initialItems = Array.from({ length: 250 }, (_, index) => item(index + 1));
const productionDeliveryPage = (start: number, count: number): DeliveryWorkspaceProjection => {
  const decoded = decodeDeliveryWorkspaceProjection(createDeliveryItemPageFixture({ start, count }));
  return {
    ...decoded,
    packages: decoded.packages.map(deliveryPackage => ({
      ...deliveryPackage,
      id: deliveryPackageId,
      currentVersionId: deliveryPackageVersionId,
      label: 'Invoice exception governed delivery',
      sourcePackage: {
        version: 1,
        sourceMode: 'studio_handoff',
        lineageClassification: 'assessed',
        planningOnly: false,
        studioArtifactType: 'brd',
        studioArtifactVersion: 4,
      },
      acceptedItemCount: 250,
    })),
  };
};
const initialPackage: DeliveryPackageProjection = productionDeliveryPage(1, 100).packages[0];

// Exercise the SQL-to-canonical decoder with retained, versioned decision history.
const decodePackageDecisionState = (pkg: DeliveryPackageProjection): DeliveryPackageProjection => {
  const raw = createDeliveryItemPageFixture({ start: 1, count: 1, total: 1 });
  Object.assign(raw.packages[0], { currentVersion: pkg.currentVersion, status: pkg.status,
    reviewHistory: pkg.reviewHistory, approvalHistory: pkg.approvalHistory });
  const decoded = decodeDeliveryWorkspaceProjection(raw).packages[0];
  return { ...pkg, reviewState: decoded.reviewState, approvalState: decoded.approvalState };
};

const initialHandoff = {
  id: handoffId, version: 1, direction: 'inbox' as const, status: 'target_review' as const,
  sourceArtifactVersion: 4,
  targetWorkspaceId: workspaceId, lineageClassification: 'assessed' as const, planningOnly: false,
  preview: { artifactType: 'brd' as const, proposedItemCount: 250, sourceCoverageLabel: '250/250 exact cited proposals', blockers: [] },
  targetItems: initialItems.map((value, index) => ({ clientKey: `proposal-${String(index + 1).padStart(3, '0')}`, type: value.type, title: value.title, description: value.description, acceptanceCriteria: value.acceptanceCriteria, nonFunctionalRequirements: value.nonFunctionalRequirements, ordinal: index + 1, sourceSectionLocator: value.sourceCitation!.sectionLocator })),
  history: [{ version: 1, status: 'target_review' as const, createdAt: '2026-08-31T06:00:00.000Z' }],
  reviewHistory: [], approvalHistory: [],
  historyPage: { eventLimit: 50, historyHasMore: false, reviewHasMore: false, approvalHasMore: false },
  actions: ['delivery.handoff.review.resolve' as const], createdAt: '2026-08-31T06:00:00.000Z',
};

const flags = { moduleHandoffsEnabled: true, directDeliveryPlanningEnabled: true, deliveryItemReviewEnabled: true, monitorApprovedBaselineEnabled: true };
const candidate: DeliveryWorkspaceProjection['eligibleStudioArtifacts'][number] = {
  studioArtifactId: artifactId, studioArtifactVersionId: artifactVersionId, studioArtifactVersion: 4,
  artifactType: 'brd', aggregateVersion: 4,
  lineageClassification: 'assessed', planningOnly: false,
  proposalItems: initialItems.map((value, index) => ({ clientKey: `proposal-${String(index + 1).padStart(3, '0')}`, type: value.type, title: value.title, description: value.description, acceptanceCriteria: value.acceptanceCriteria, nonFunctionalRequirements: value.nonFunctionalRequirements, sourceSectionLocator: value.sourceCitation!.sectionLocator })),
};
const directPlanningCandidate: DeliveryWorkspaceProjection['eligibleStudioArtifacts'][number] = {
  ...candidate,
  studioArtifactId: directArtifactId,
  studioArtifactVersionId: directArtifactVersionId,
  studioArtifactVersion: 1,
  artifactType: 'pdd',
  aggregateVersion: 1,
  lineageClassification: 'not_assessed',
  planningOnly: true,
  proposalItems: [{
    ...candidate.proposalItems[0],
    clientKey: 'synthetic-direct-pdd-item',
    type: 'task',
    title: 'Synthetic direct PDD planning item',
    description: 'Provider-free planning output from the deterministic CH-10 PDD fixture.',
    sourceSectionLocator: 'pdd.sections.planning-scope',
  }],
};
const accessibilityPackage: DeliveryPackageProjection = {
  ...initialPackage,
  id: accessibilityPackageId,
  currentVersionId: uuid(61),
  label: controlledHumanFixture.seed.manualPlanningPackage.brief,
  sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true },
  items: [{
    ...item(252), aggregateId: uuid(62), currentVersionId: uuid(63),
    title: controlledHumanFixture.seed.manualPlanningPackage.items[0].title,
    description: controlledHumanFixture.seed.manualPlanningPackage.items[0].description,
    acceptanceCriteria: controlledHumanFixture.seed.manualPlanningPackage.items[0].acceptanceCriteria,
    nonFunctionalRequirements: controlledHumanFixture.seed.manualPlanningPackage.items[0].nonFunctionalRequirements,
    sourceCitation: undefined,
  }],
  blockers: ['1 work item decision unresolved.'], blockerCount: 1,
  acceptedItemCount: undefined,
  itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true },
};
const initialDelivery: DeliveryWorkspaceProjection = { contractVersion: 'enterprise-delivery-workspace-2', organizationId, workspaceId, featureFlags: flags, readOnly: false, page: { packageLimit: 100, packageHasMore: false, handoffLimit: 100, handoffHasMore: false, itemHistoryLimit: 250, eventHistoryLimit: 50, handoffTargetItemLimit: 250, baselineEligibilityLimit: 100, baselineEligibilityHasMore: false, baselineEligibilityCursorApplied: false }, eligibleStudioArtifacts: [candidate], baselineEligibility: [], inbox: [initialHandoff], outbox: [], packages: [initialPackage], actions: ['delivery.handoff.request', 'delivery.package.create.manual'] };
const initialMonitor: MonitorApprovedBaselinesProjection = { contractVersion: 'enterprise-monitor-approved-baselines-2', organizationId, workspaceId, featureFlags: { monitorApprovedBaselineEnabled: true }, readOnly: true, liveTelemetryConnected: false, baselines: [], actions: [] };
const unrelatedMonitorBaseline: MonitorApprovedBaselinesProjection['baselines'][number] = { id: uuid(91), version: 1, status: 'approved', readiness: 'review_required', lineageClassification: 'not_assessed', planningOnly: true, workPackageId: uuid(60), workPackageVersion: 1, acceptedItemCount: 1, acceptedItems: [{ version: 1, type: 'task', title: 'Seeded unrelated planning item', status: 'accepted' }], milestones: [], dependencies: [], blockers: [], risks: [] };
const retainedMonitorBaseline: MonitorApprovedBaselinesProjection['baselines'][number] = { id: uuid(92), version: 3, status: 'approved', readiness: 'review_required', lineageClassification: 'assessed', planningOnly: false, workPackageId: deliveryPackageId, workPackageVersion: 2, acceptedItemCount: 2, acceptedItems: [{ version: 2, type: 'milestone', title: 'Retained milestone', status: 'accepted' }, { version: 1, type: 'risk', title: 'Retained risk', status: 'accepted' }], milestones: ['Retained milestone'], dependencies: [], blockers: [], risks: ['Retained risk'] };

declare global {
  interface Window {
    __prCConnectedSnapshot?: { delivery: DeliveryWorkspaceProjection; monitor: MonitorApprovedBaselinesProjection };
  }
}

function Harness() {
  const params = new URLSearchParams(location.search);
  const fixtureState = params.get('state') ?? '';
  const [view, setView] = useState<'delivery' | 'enterprise-monitor' | 'primary-monitor' | 'context-monitor'>((params.get('view') as 'delivery' | 'enterprise-monitor' | 'primary-monitor' | 'context-monitor') ?? 'delivery');
  const [delivery, setDelivery] = useState<DeliveryWorkspaceProjection>(() => {
    if (fixtureState === 'connected-remaining' && window.__prCConnectedSnapshot) return window.__prCConnectedSnapshot.delivery;
    if (fixtureState === 'handoff-outbox') {
      const handoff: DeliveryWorkspaceProjection['outbox'][number] = { ...initialHandoff, direction: 'outbox', status: 'requested' };
      return { ...initialDelivery, inbox: [{ ...initialHandoff, id: uuid(12) }], outbox: params.has('duplicate-handoff') ? [handoff, handoff] : [handoff] };
    }
    if (params.has('duplicate-handoff')) return { ...initialDelivery, inbox: [initialHandoff, initialHandoff] };
    if (fixtureState === 'synthetic-preview') return { ...initialDelivery, eligibleStudioArtifacts: [{ ...candidate, proposalItems: candidate.proposalItems.slice(0, controlledHumanFixture.seed.assessedStudioArtifact.sectionCount) }] };
    if (fixtureState === 'revoked') return { ...initialDelivery, readOnly: true, inbox: initialDelivery.inbox.map(value => ({ ...value, actions: [] })), packages: initialDelivery.packages.map(value => ({ ...value, actions: [], items: value.items.map(entry => ({ ...entry, actions: [] })) })), actions: [] };
    if (fixtureState === 'stale') return { ...initialDelivery, inbox: [{ ...initialHandoff, status: 'stale', actions: [] }] };
    if (fixtureState === 'wrong-workspace' || fixtureState === 'cross-org') return { ...initialDelivery, eligibleStudioArtifacts: [], inbox: [], outbox: [], packages: [] };
    if (fixtureState === 'consumed') return { ...initialDelivery, inbox: [{ ...initialHandoff, status: 'consumed', version: 4, actions: [] }] };
    if (fixtureState === 'planning') return { ...initialDelivery, eligibleStudioArtifacts: [{ ...candidate, lineageClassification: 'not_assessed', planningOnly: true }, { ...candidate, studioArtifactId: uuid(55), studioArtifactVersionId: uuid(56), studioArtifactVersion: 2, artifactType: 'pdd', aggregateVersion: 2, lineageClassification: 'not_assessed', planningOnly: true }], inbox: [{ ...initialHandoff, lineageClassification: 'not_assessed', planningOnly: true }] };
    if (fixtureState === 'connected-remaining') return { ...initialDelivery, eligibleStudioArtifacts: [directPlanningCandidate], inbox: [], outbox: [], packages: [accessibilityPackage] };
    if (fixtureState === 'approved-studio-no-delivery') return { ...initialDelivery, eligibleStudioArtifacts: [{ ...candidate, lineageClassification: 'not_assessed', planningOnly: true }], inbox: [], outbox: [], packages: [{ ...initialPackage, id: uuid(61), currentVersionId: uuid(62), label: 'Seeded manual PDD planning package', sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true }, items: [{ ...item(252), sourceCitation: undefined }], actions: [] }] };
    if (fixtureState === 'approval-ready') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'review', reviewState: 'approved', approvalState: 'pending', blockers: [], blockerCount: 0, actions: ['delivery.package.approval.resolve'] }] };
    if (fixtureState === 'approved') return { ...initialDelivery, baselineEligibility: [{ workPackageId: deliveryPackageId, workPackageVersionId: deliveryPackageVersionId, workPackageVersion: 1, acceptedItemCount: 1, lineageClassification: 'assessed', planningOnly: false, action: 'monitor.baseline.create' }], packages: [{ ...initialPackage, status: 'approved', reviewState: 'approved', approvalState: 'approved', acceptedItemCount: 1, blockers: [], blockerCount: 0, actions: [],
      items: [{ ...initialPackage.items[0], type: 'milestone', status: 'accepted', decision: { outcome: 'accepted', rationale: 'Exact approved fixture decision.' }, actions: [] }],
      itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true } }] };
    if (fixtureState === 'blocked' || fixtureState === 'blocked-seeded-baseline') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1, acceptedItemCount: undefined, items: initialPackage.items.map(entry => ({ ...entry, actions: [] })), actions: ['delivery.package.revision.commit'] }] };
    if (fixtureState === 'blocked-small' || fixtureState === 'blocked-failure') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1,
      acceptedItemCount: undefined, items: initialPackage.items.slice(0, 1).map(entry => ({ ...entry, actions: [] })), itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true }, actions: ['delivery.package.revision.commit'] }] };
    if (fixtureState === 'paginated') return { ...initialDelivery, packages: [{ ...initialPackage, items: initialPackage.items.slice(0, 100), itemPage: { limit: 100, hasMore: true, cursorApplied: false, isComplete: false, nextCursor: { version: 1, id: uuid(1100) } } }] };
    return initialDelivery;
  });
  const [monitor, setMonitor] = useState<MonitorApprovedBaselinesProjection>(() => {
    if (fixtureState === 'connected-remaining' && window.__prCConnectedSnapshot) return window.__prCConnectedSnapshot.monitor;
    if (fixtureState === 'blocked-seeded-baseline') return { ...initialMonitor, baselines: [unrelatedMonitorBaseline] };
    if (fixtureState === 'monitor-history-readonly') return { ...initialMonitor, featureFlags: { monitorApprovedBaselineEnabled: false }, baselines: [retainedMonitorBaseline, unrelatedMonitorBaseline] };
    return initialMonitor;
  });
  // Fixture transport only: preserve actually committed projections across the
  // real document reload used by the hosted CH-11 preparation.
  useEffect(() => {
    if (fixtureState === 'connected-remaining') window.__prCConnectedSnapshot = { delivery, monitor };
  }, [fixtureState, delivery, monitor]);
  const [status, setStatus] = useState('Committed Delivery projection loaded.');
  const [error, setError] = useState('');
  const [pageBusy, setPageBusy] = useState(false);
  const pageLoadAttempts = useRef(0);
  const baselineReload = useRef<(() => void) | null>(null);
  const baselineCommandCount = useRef(0);
  const [baselinePhase, setBaselinePhase] = useState('idle');

  const acceptOtherSequenceItems = () => {
    setDelivery(current => ({ ...current, packages: current.packages.map(pkg => {
      if (pkg.id !== deliveryPackageId || !pkg.itemPage.isComplete || pkg.items.length !== 250) return pkg;
      let acceptedNow = 0;
      const items = pkg.items.map(entry => {
        if (entry.aggregateId === sequenceTargetItemId || ['accepted', 'rejected'].includes(entry.status)) return entry;
        acceptedNow += 1;
        return { ...entry, aggregateVersion: entry.aggregateVersion + 1, status: 'accepted' as const,
          decision: { outcome: 'accepted' as const, rationale: 'Authorized synthetic prerequisite accepted the exact current proposal.' }, actions: [] };
      });
      const unresolved = items.filter(entry => !['accepted', 'rejected'].includes(entry.status)).length;
      const acceptedItemCount = items.filter(entry => entry.status === 'accepted').length;
      return { ...pkg, aggregateVersion: pkg.aggregateVersion + acceptedNow, items,
        blockers: unresolved ? [`${unresolved} work item decision${unresolved === 1 ? '' : 's'} unresolved.`] : [], blockerCount: unresolved,
        acceptedItemCount: unresolved ? undefined : acceptedItemCount,
        actions: unresolved ? ['delivery.item.review'] : ['delivery.package.review.resolve'] };
    }) }));
    setStatus('Authorized synthetic prerequisites accepted every non-target current proposal.');
  };

  const loadProductionDeliveryPage = async (input: {
    organizationId: string;
    workspaceId: string;
    deliveryItemPage: DeliveryItemPageRequest;
  }) => {
    await new Promise(resolve => setTimeout(resolve, 20));
    if (input.organizationId !== organizationId
      || input.workspaceId !== workspaceId
      || input.deliveryItemPage.packageId !== deliveryPackageId
      || input.deliveryItemPage.limit !== 100) throw new Error('ENTERPRISE_PROJECTION_UNAVAILABLE');
    const start = input.deliveryItemPage.cursor.id === uuid(1_100) ? 101
      : input.deliveryItemPage.cursor.id === uuid(1_200) ? 201 : 0;
    if (!start || input.deliveryItemPage.cursor.version !== 1) throw new Error('ENTERPRISE_PROJECTION_UNAVAILABLE');
    const page = productionDeliveryPage(start, start === 101 ? 100 : 50);
    if (fixtureState !== 'blocked') return page;
    const blockedPage: DeliveryWorkspaceProjection = { ...page, packages: page.packages.map(pkg => ({ ...pkg, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1,
      acceptedItemCount: undefined, items: pkg.items.map(entry => ({ ...entry, actions: [] })), actions: ['delivery.package.revision.commit'] })) };
    return blockedPage;
  };

  const loadNextPage = async (deliveryPackage: DeliveryPackageProjection) => {
    const cursor = deliveryPackage.itemPage.nextCursor;
    if (!cursor) return;
    const request: DeliveryItemPageRequest = { packageId: deliveryPackage.id, cursor, limit: 100 };
    setPageBusy(true);
    setError('');
    setStatus(`Loading the next authorized bounded page after ${deliveryPackage.items.length} canonical items.`);
    try {
      pageLoadAttempts.current += 1;
      if (fixtureState === 'pagination-failure' && pageLoadAttempts.current === 1) throw new Error('ENTERPRISE_PROJECTION_UNAVAILABLE');
      const page = await loadProductionDeliveryPage({ organizationId, workspaceId, deliveryItemPage: request });
      setDelivery(current => mergeDeliveryItemPage(current, page, request));
      const loaded = deliveryPackage.items.length + page.packages[0].items.length;
      setStatus(page.packages[0].itemPage.hasMore
        ? `${loaded} canonical items loaded from bounded authorized pages. More items are available.`
        : `All ${loaded} canonical items loaded from bounded authorized pages.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ENTERPRISE_PROJECTION_UNAVAILABLE');
      setStatus('The next item page was not loaded. Previously loaded items remain unchanged; retry the same server cursor.');
    } finally {
      setPageBusy(false);
    }
  };

  const act = async (command: DeliveryMonitorCommandInput) => {
    setError('');
    if (fixtureState === 'command-failure' || fixtureState === 'blocked-failure') return false;
    if (delivery.readOnly) { setError('Permission denied. No committed state changed.'); return; }
    setDelivery(current => {
      if (command.action === 'delivery.handoff.request') {
        const existing = current.outbox.length > 0;
        if (existing) return current;
        const selected = current.eligibleStudioArtifacts.find(value => value.studioArtifactId === command.studioArtifactId
          && value.studioArtifactVersionId === command.studioArtifactVersionId);
        if (!selected) return current;
        const requested = {
          ...initialHandoff, id: uuid(10), direction: 'outbox' as const, status: 'requested' as const,
          sourceArtifactVersion: selected.studioArtifactVersion, lineageClassification: selected.lineageClassification,
          planningOnly: selected.planningOnly,
          preview: { artifactType: selected.artifactType, proposedItemCount: selected.proposalItems.length,
            sourceCoverageLabel: `${selected.proposalItems.length}/${selected.proposalItems.length} exact cited proposals`, blockers: [] },
          targetItems: selected.proposalItems.map((value, index) => ({ ...value, ordinal: index + 1 })),
          history: [{ version: 1, status: 'requested' as const, createdAt: '2026-08-31T06:00:00.000Z' }],
          actions: fixtureState === 'connected-remaining' ? ['delivery.handoff.review.resolve' as const] : ['delivery.handoff.withdraw' as const],
        };
        return { ...current, outbox: [...current.outbox, requested] };
      }
      if (command.action === 'delivery.handoff.review.resolve' || command.action === 'delivery.handoff.approval.resolve' || command.action === 'delivery.handoff.withdraw' || command.action === 'delivery.handoff.consume') {
        const update = (value: typeof initialHandoff) => {
          if (value.id !== command.handoffId) return value;
          if (command.action === 'delivery.handoff.review.resolve') return { ...value, version: value.version + 1, status: command.outcome === 'approved' ? 'approval_ready' as const : command.outcome, actions: command.outcome === 'approved' ? ['delivery.handoff.approval.resolve' as const] : [] };
          if (command.action === 'delivery.handoff.approval.resolve') return { ...value, version: value.version + 1, status: command.outcome, actions: command.outcome === 'approved' ? ['delivery.handoff.consume' as const] : [] };
          if (command.action === 'delivery.handoff.withdraw') return { ...value, version: value.version + 1, status: 'withdrawn' as const, actions: [] };
          return { ...value, version: value.version + 1, status: 'consumed' as const, actions: [] };
        };
        const selected = [...current.inbox, ...current.outbox].find(value => value.id === command.handoffId);
        const consumedPackage = fixtureState === 'connected-remaining' && command.action === 'delivery.handoff.consume' && selected
          ? {
              ...initialPackage, id: directPackageId, currentVersionId: directPackageVersionId,
              label: controlledHumanFixture.seed.directStudioArtifact.title,
              sourcePackage: { version: 1, sourceMode: 'studio_handoff' as const, lineageClassification: 'not_assessed' as const,
                planningOnly: true, studioArtifactType: 'pdd' as const, studioArtifactVersion: selected.sourceArtifactVersion },
              items: selected.targetItems.map((value, index) => ({ ...item(270 + index), aggregateId: uuid(270 + index), currentVersionId: uuid(370 + index),
                type: value.type, title: value.title, description: value.description, acceptanceCriteria: value.acceptanceCriteria,
                nonFunctionalRequirements: value.nonFunctionalRequirements,
                sourceCitation: { artifactVersion: selected.sourceArtifactVersion, artifactType: 'pdd' as const, sectionLocator: value.sourceSectionLocator } })),
              blockers: [`${selected.targetItems.length} work item decision${selected.targetItems.length === 1 ? '' : 's'} unresolved.`],
              blockerCount: selected.targetItems.length,
              acceptedItemCount: undefined,
              itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true },
            }
          : undefined;
        return { ...current, inbox: current.inbox.map(value => update(value as typeof initialHandoff)), outbox: current.outbox.map(value => update(value as typeof initialHandoff)),
          packages: consumedPackage && !current.packages.some(value => value.id === directPackageId) ? [...current.packages, consumedPackage] : current.packages };
      }
      if (command.action === 'delivery.package.create.manual') {
        const manualId = uuid(50);
        const manualItem = item(251);
        return { ...current, packages: [...current.packages, { ...initialPackage, id: manualId, currentVersionId: uuid(51), label: command.manualBrief, sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true }, items: [{ ...manualItem, aggregateId: uuid(53), currentVersionId: uuid(54), title: command.items[0].title, description: command.items[0].description, sourceCitation: undefined }], blockers: ['1 work item decision unresolved.'], blockerCount: 1, acceptedItemCount: undefined, itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true } }] };
      }
      if (command.action === 'delivery.item.review') return { ...current, packages: current.packages.map(pkg => {
        if (!pkg.items.some(entry => entry.aggregateId === command.itemAggregateId)) return pkg;
        const items = pkg.items.map(entry => entry.aggregateId !== command.itemAggregateId ? entry : command.outcome === 'edited' ? { ...entry, aggregateVersion: entry.aggregateVersion + 1, version: entry.version + 1, currentVersionId: uuid(5_000 + entry.version), status: 'edited' as const, title: command.authored.title, description: command.authored.description, acceptanceCriteria: command.authored.acceptanceCriteria, nonFunctionalRequirements: command.authored.nonFunctionalRequirements, decision: undefined, actions: ['delivery.item.review' as const], history: [...entry.history.filter(history => history.version !== entry.version), { version: entry.version, status: entry.status, title: entry.title, description: entry.description, acceptanceCriteria: entry.acceptanceCriteria, nonFunctionalRequirements: entry.nonFunctionalRequirements, createdAt: '2026-08-31T06:00:00.000Z' }], diffs: [...entry.diffs, { fromVersion: entry.version, toVersion: entry.version + 1, changedFields: ['title', 'description'] }] } : { ...entry, aggregateVersion: entry.aggregateVersion + 1, status: command.outcome, decision: { outcome: command.outcome, rationale: command.rationale }, actions: [] } as typeof entry);
        const unresolved = items.filter(entry => !['accepted', 'rejected'].includes(entry.status)).length;
        const acceptedItemCount = items.filter(entry => entry.status === 'accepted').length;
        return { ...pkg, aggregateVersion: pkg.aggregateVersion + 1, items,
          blockers: unresolved ? [`${unresolved} work item decision${unresolved === 1 ? '' : 's'} unresolved.`] : [], blockerCount: unresolved,
          acceptedItemCount: unresolved ? undefined : acceptedItemCount,
          actions: unresolved ? ['delivery.item.review'] : ['delivery.package.review.resolve'] };
      }) };
      if (command.action === 'delivery.package.revision.commit') return { ...current, packages: current.packages.map(pkg => {
        if (pkg.id !== command.workPackageId) return pkg;
        const revisions = new Map(command.itemRevisions.map(entry => [entry.itemAggregateId, entry]));
        const expected = new Map(command.expectedItems.map(entry => [entry.itemAggregateId, entry]));
        const exactDescendants = command.expectedItems.length === pkg.items.length && pkg.items.every(entry => {
          const identity = expected.get(entry.aggregateId);
          return identity?.expectedAggregateVersion === entry.aggregateVersion && identity.expectedItemVersionId === entry.currentVersionId;
        });
        const exactSelected = command.itemRevisions.every(entry => {
          const identity = expected.get(entry.itemAggregateId);
          return identity?.expectedAggregateVersion === entry.expectedAggregateVersion && identity.expectedItemVersionId === entry.expectedItemVersionId;
        });
        if (!exactDescendants || !exactSelected || command.expectedPackageAggregateVersion !== pkg.aggregateVersion) return pkg;
        return decodePackageDecisionState({ ...pkg, currentVersion: pkg.currentVersion + 1, currentVersionId: uuid(70 + pkg.currentVersion), aggregateVersion: pkg.aggregateVersion + 1, status: 'draft',
          blockers: [`${pkg.items.length} work item decisions unresolved.`], blockerCount: pkg.items.length, acceptedItemCount: undefined, actions: ['delivery.item.review'], items: pkg.items.map((entry, index) => {
            const revision = revisions.get(entry.aggregateId);
            return { ...entry, currentVersionId: uuid(6_000 + index), aggregateVersion: entry.aggregateVersion + 1, version: entry.version + 1, status: revision ? 'edited' as const : 'proposed' as const,
              ...(revision ? { title: revision.authored.title, description: revision.authored.description, acceptanceCriteria: revision.authored.acceptanceCriteria, nonFunctionalRequirements: revision.authored.nonFunctionalRequirements } : {}),
              decision: undefined, actions: ['delivery.item.review' as const] };
          }) });
      }) };
      if (command.action === 'delivery.package.review.resolve') return { ...current, packages: current.packages.map(pkg => {
        if (pkg.id !== command.workPackageId) return pkg;
        if (!pkg.itemPage.isComplete || pkg.items.some(entry => !['accepted', 'rejected'].includes(entry.status))) return pkg;
        const reviewed = { ...pkg, reviewHistory: [...pkg.reviewHistory, { packageVersion: pkg.currentVersion,
          acceptedItemCount: pkg.acceptedItemCount ?? 0, outcome: command.outcome, rationale: command.rationale, createdAt: '2026-08-31T06:10:00.000Z' }] };
        return decodePackageDecisionState(command.outcome === 'approved'
          ? { ...reviewed, status: 'review' as const, blockers: [], blockerCount: 0, actions: ['delivery.package.approval.resolve' as const] }
          : command.outcome === 'changes_requested'
            ? { ...reviewed, status: 'blocked' as const, blockers: ['Independent review requested changes.'], blockerCount: 1, actions: ['delivery.package.revision.commit' as const] }
            : { ...reviewed, status: 'rejected' as const, blockers: [], blockerCount: 0, actions: [] });
      }) };
      if (command.action === 'delivery.package.approval.resolve') {
        const approved = command.outcome === 'approved';
        const selectedPackage = current.packages.find(pkg => pkg.id === command.workPackageId);
        const selector = selectedPackage && approved ? { workPackageId: command.workPackageId, workPackageVersionId: command.expectedPackageVersionId,
          workPackageVersion: command.expectedPackageVersion, acceptedItemCount: selectedPackage.acceptedItemCount ?? 0,
          lineageClassification: selectedPackage.sourcePackage.lineageClassification, planningOnly: selectedPackage.sourcePackage.planningOnly,
          action: 'monitor.baseline.create' as const } : undefined;
        return { ...current, packages: current.packages.map(pkg => pkg.id !== command.workPackageId || pkg.reviewState !== 'approved' ? pkg : decodePackageDecisionState({ ...pkg, status: command.outcome, actions: [],
          approvalHistory: [...pkg.approvalHistory, { packageVersion: pkg.currentVersion, acceptedItemCount: pkg.acceptedItemCount ?? 0,
            outcome: command.outcome, rationale: command.rationale, createdAt: '2026-08-31T06:11:00.000Z' }] })),
          baselineEligibility: selector ? [...current.baselineEligibility.filter(value => value.workPackageId !== selector.workPackageId), selector] : current.baselineEligibility };
      }
      return current;
    });
    if (command.action === 'monitor.baseline.create') {
      baselineCommandCount.current += 1;
      if (params.has('baseline-reload')) {
        // Production confirms the command before awaiting its projection reload.
        setBaselinePhase('committed');
        await new Promise<void>(resolve => { baselineReload.current = resolve; });
        if (params.get('baseline-reload') === 'failed') return false;
      }
      const deliveryPackage = delivery.packages.find(pkg => pkg.id === command.workPackageId && pkg.status === 'approved');
      const acceptedItems = deliveryPackage?.items.filter(entry => entry.status === 'accepted') ?? [];
      if (deliveryPackage && deliveryPackage.itemPage.isComplete && acceptedItems.length === deliveryPackage.acceptedItemCount) setMonitor(current => current.baselines.some(value => value.workPackageId === command.workPackageId) ? current : { ...current, baselines: [...current.baselines, { id: fixtureState === 'connected-remaining' && command.workPackageId !== directPackageId ? uuid(95) : uuid(90), version: 1, status: 'approved', readiness: 'review_required', lineageClassification: deliveryPackage.sourcePackage.lineageClassification, planningOnly: deliveryPackage.sourcePackage.planningOnly, workPackageId: command.workPackageId, workPackageVersion: command.expectedPackageVersion, acceptedItemCount: acceptedItems.length, acceptedItems: acceptedItems.map(entry => ({ version: entry.version, type: entry.type, title: entry.title, status: 'accepted' })), milestones: acceptedItems.filter(entry => entry.type === 'milestone').map(entry => entry.title), dependencies: acceptedItems.filter(entry => entry.type === 'dependency').map(entry => entry.title), blockers: [], risks: acceptedItems.filter(entry => entry.type === 'risk').map(entry => entry.title) }] });
    }
    setStatus(`${command.action} committed and exact projection reloaded.`);
  };

  return <main className="min-h-screen bg-[var(--av-color-bg-subtle)] p-4 text-[var(--av-color-text)] sm:p-6"><nav aria-label="Harness views" className="mx-auto mb-4 flex max-w-7xl flex-wrap gap-2">{(['delivery', 'enterprise-monitor', 'primary-monitor', 'context-monitor'] as const).map(value => <button key={value} type="button" onClick={() => setView(value)} className="min-h-10 rounded-xl border px-3 font-black">{value.replace('-', ' ')}</button>)}{fixtureState === 'full-sequence' && <button type="button" data-testid="accept-sequence-prerequisites" onClick={acceptOtherSequenceItems} className="min-h-10 rounded-xl border px-3 font-black">Apply authorized acceptance prerequisites</button>}{params.has('baseline-reload') && <button type="button" data-testid="resolve-baseline-reload" style={{ position: 'fixed', top: 0, left: 0, zIndex: 100 }} data-command-count={baselineCommandCount.current} data-phase={baselinePhase} disabled={baselinePhase !== 'committed'} onClick={() => { baselineReload.current?.(); baselineReload.current = null; }}>Resolve committed baseline projection</button>}</nav><div className="mx-auto max-w-7xl">{view === 'delivery' ? <GovernedDeliveryWorkspace projection={delivery} monitorProjection={['no-monitor','blocked-seeded-baseline'].includes(fixtureState) ? undefined : monitor} busy={pageBusy} status={status} error={error} onAction={act} onLoadNextPage={loadNextPage}/> : view === 'enterprise-monitor' ? <MonitorApprovedBaselinePanel projection={monitor} heading="Enterprise Intelligence canonical baseline"/> : view === 'primary-monitor' ? <PortfolioView projects={[]} tasks={[]} users={[]} onUpdateProjectStage={() => undefined} onScopeChange={() => undefined} onViewChange={() => undefined} canonicalMonitorProjection={monitor}/> : <ContextMonitorHarness/>}</div></main>;
}

const contextProjection = (targetWorkspaceId: string, targetBaselineId: string): MonitorApprovedBaselinesProjection => ({
  ...initialMonitor, workspaceId: targetWorkspaceId, baselines: [{
    id: targetBaselineId, version: 1, status: 'approved', readiness: 'review_required', lineageClassification: 'assessed', planningOnly: false,
    workPackageId: deliveryPackageId, workPackageVersion: 1,
    acceptedItemCount: 1, acceptedItems: [{ version: 2, type: 'milestone', title: 'Canonical work item 001', status: 'accepted' }],
    milestones: ['Canonical work item 001'], dependencies: [], blockers: [], risks: [],
  }],
});
const otherWorkspaceId = uuid(300);
const initialContextActorId = uuid(301);
const delayedContextActorId = uuid(302);
const finalContextActorId = uuid(303);
const loadContextProjection = async ({ actorId: selectedActorId, workspaceId: selectedWorkspaceId }: { actorId: string; organizationId: string; workspaceId: string; expectedAuthorizationVersion?: number }) => {
  if (selectedWorkspaceId === otherWorkspaceId && selectedActorId === initialContextActorId) await new Promise(resolve => setTimeout(resolve, 350));
  if (selectedActorId === delayedContextActorId) await new Promise(resolve => setTimeout(resolve, 500));
  const targetBaselineId = selectedActorId === delayedContextActorId
    ? uuid(93)
    : selectedActorId === finalContextActorId
      ? uuid(94)
      : selectedWorkspaceId === otherWorkspaceId
        ? uuid(92)
        : uuid(90);
  return contextProjection(selectedWorkspaceId, targetBaselineId);
};
function ContextMonitorHarness() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId);
  const [selectedActorId, setSelectedActorId] = useState(initialContextActorId);
  return <><div className="mb-3 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedWorkspaceId(otherWorkspaceId)} className="min-h-10 rounded-xl border px-3 font-black">Switch workspace context</button><button type="button" onClick={() => setSelectedActorId(delayedContextActorId)} className="min-h-10 rounded-xl border px-3 font-black">Start delayed actor context</button><button type="button" onClick={() => setSelectedActorId(finalContextActorId)} className="min-h-10 rounded-xl border px-3 font-black">Switch to final actor context</button></div><PortfolioView projects={[]} tasks={[]} users={[]} onUpdateProjectStage={() => undefined} onScopeChange={() => undefined} onViewChange={() => undefined} canonicalMonitorContext={{ actorId: selectedActorId, organizationId, workspaceId: selectedWorkspaceId, expectedAuthorizationVersion: 9 }} loadCanonicalMonitorProjection={loadContextProjection}/></>;
}

function DelayedProjectionHarness() {
  const [ready, setReady] = useState(false);
  return ready ? <Harness/> : <button data-testid="resolve-delayed-projection" onClick={() => setReady(true)}>Load committed projection</button>;
}

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('delayed-projection') ? <DelayedProjectionHarness/> : <Harness/>);
