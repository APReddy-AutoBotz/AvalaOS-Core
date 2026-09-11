import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import GovernedDeliveryWorkspace, { MonitorApprovedBaselinePanel } from '../../../components/delivery/GovernedDeliveryWorkspace';
import PortfolioView from '../../../components/shared/PortfolioView';
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
const initialDelivery: DeliveryWorkspaceProjection = { contractVersion: 'enterprise-delivery-workspace-2', organizationId, workspaceId, featureFlags: flags, readOnly: false, page: { packageLimit: 100, packageHasMore: false, handoffLimit: 100, handoffHasMore: false, itemHistoryLimit: 250, eventHistoryLimit: 50, handoffTargetItemLimit: 250, baselineEligibilityLimit: 100, baselineEligibilityHasMore: false, baselineEligibilityCursorApplied: false }, eligibleStudioArtifacts: [candidate], baselineEligibility: [], inbox: [initialHandoff], outbox: [], packages: [initialPackage], actions: ['delivery.handoff.request', 'delivery.package.create.manual'] };
const initialMonitor: MonitorApprovedBaselinesProjection = { contractVersion: 'enterprise-monitor-approved-baselines-2', organizationId, workspaceId, featureFlags: { monitorApprovedBaselineEnabled: true }, readOnly: true, liveTelemetryConnected: false, baselines: [], actions: [] };

function Harness() {
  const params = new URLSearchParams(location.search);
  const fixtureState = params.get('state') ?? '';
  const [view, setView] = useState<'delivery' | 'enterprise-monitor' | 'primary-monitor' | 'context-monitor'>((params.get('view') as 'delivery' | 'enterprise-monitor' | 'primary-monitor' | 'context-monitor') ?? 'delivery');
  const [delivery, setDelivery] = useState<DeliveryWorkspaceProjection>(() => {
    if (fixtureState === 'revoked') return { ...initialDelivery, readOnly: true, inbox: initialDelivery.inbox.map(value => ({ ...value, actions: [] })), packages: initialDelivery.packages.map(value => ({ ...value, actions: [], items: value.items.map(entry => ({ ...entry, actions: [] })) })), actions: [] };
    if (fixtureState === 'stale') return { ...initialDelivery, inbox: [{ ...initialHandoff, status: 'stale', actions: [] }] };
    if (fixtureState === 'wrong-workspace' || fixtureState === 'cross-org') return { ...initialDelivery, eligibleStudioArtifacts: [], inbox: [], outbox: [], packages: [] };
    if (fixtureState === 'consumed') return { ...initialDelivery, inbox: [{ ...initialHandoff, status: 'consumed', version: 4, actions: [] }] };
    if (fixtureState === 'planning') return { ...initialDelivery, eligibleStudioArtifacts: [{ ...candidate, lineageClassification: 'not_assessed', planningOnly: true }], inbox: [{ ...initialHandoff, lineageClassification: 'not_assessed', planningOnly: true }] };
    if (fixtureState === 'approval-ready') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'review', reviewState: 'approved', approvalState: 'pending', blockers: [], blockerCount: 0, actions: ['delivery.package.approval.resolve'] }] };
    if (fixtureState === 'approved') return { ...initialDelivery, baselineEligibility: [{ workPackageId: deliveryPackageId, workPackageVersionId: deliveryPackageVersionId, workPackageVersion: 1, acceptedItemCount: 1, lineageClassification: 'assessed', planningOnly: false, action: 'monitor.baseline.create' }], packages: [{ ...initialPackage, status: 'approved', reviewState: 'approved', approvalState: 'approved', acceptedItemCount: 1, blockers: [], blockerCount: 0, actions: [] }] };
    if (fixtureState === 'blocked') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1, acceptedItemCount: undefined, items: initialPackage.items.map(entry => ({ ...entry, actions: [] })), actions: ['delivery.package.revision.commit'] }] };
    if (fixtureState === 'blocked-small' || fixtureState === 'blocked-failure') return { ...initialDelivery, packages: [{ ...initialPackage, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1,
      acceptedItemCount: undefined, items: initialPackage.items.slice(0, 1).map(entry => ({ ...entry, actions: [] })), itemPage: { limit: 100, hasMore: false, cursorApplied: false, isComplete: true }, actions: ['delivery.package.revision.commit'] }] };
    if (fixtureState === 'paginated') return { ...initialDelivery, packages: [{ ...initialPackage, items: initialPackage.items.slice(0, 100), itemPage: { limit: 100, hasMore: true, cursorApplied: false, isComplete: false, nextCursor: { version: 1, id: uuid(1100) } } }] };
    return initialDelivery;
  });
  const [monitor, setMonitor] = useState(initialMonitor);
  const [status, setStatus] = useState('Committed Delivery projection loaded.');
  const [error, setError] = useState('');
  const [pageBusy, setPageBusy] = useState(false);
  const pageLoadAttempts = useRef(0);

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
        return { ...current, outbox: [...current.outbox, { ...initialHandoff, id: uuid(10), direction: 'outbox', status: 'requested', actions: ['delivery.handoff.withdraw'] }] };
      }
      if (command.action === 'delivery.handoff.review.resolve' || command.action === 'delivery.handoff.approval.resolve' || command.action === 'delivery.handoff.withdraw' || command.action === 'delivery.handoff.consume') {
        const update = (value: typeof initialHandoff) => {
          if (value.id !== command.handoffId) return value;
          if (command.action === 'delivery.handoff.review.resolve') return { ...value, version: value.version + 1, status: command.outcome === 'approved' ? 'approval_ready' as const : command.outcome, actions: command.outcome === 'approved' ? ['delivery.handoff.approval.resolve' as const] : [] };
          if (command.action === 'delivery.handoff.approval.resolve') return { ...value, version: value.version + 1, status: command.outcome, actions: command.outcome === 'approved' ? ['delivery.handoff.consume' as const] : [] };
          if (command.action === 'delivery.handoff.withdraw') return { ...value, version: value.version + 1, status: 'withdrawn' as const, actions: [] };
          return { ...value, version: value.version + 1, status: 'consumed' as const, actions: [] };
        };
        return { ...current, inbox: current.inbox.map(value => update(value as typeof initialHandoff)), outbox: current.outbox.map(value => update(value as typeof initialHandoff)) };
      }
      if (command.action === 'delivery.package.create.manual') {
        const manualId = uuid(50);
        const manualItem = item(251);
        return { ...current, packages: [...current.packages, { ...initialPackage, id: manualId, currentVersionId: uuid(51), label: command.manualBrief, sourcePackage: { version: 1, sourceMode: 'manual', lineageClassification: 'not_assessed', planningOnly: true }, items: [{ ...manualItem, aggregateId: uuid(53), currentVersionId: uuid(54), title: command.items[0].title, description: command.items[0].description, sourceCitation: undefined }], blockers: ['1 work item decision unresolved.'], blockerCount: 1 }] };
      }
      if (command.action === 'delivery.item.review') return { ...current, packages: current.packages.map(pkg => {
        if (!pkg.items.some(entry => entry.aggregateId === command.itemAggregateId)) return pkg;
        const remaining = pkg.items.filter(entry => entry.aggregateId !== command.itemAggregateId && !entry.decision).length;
        const acceptedItemCount = pkg.items.filter(entry => entry.aggregateId === command.itemAggregateId ? command.outcome === 'accepted' : entry.decision?.outcome === 'accepted').length;
        return { ...pkg, aggregateVersion: pkg.aggregateVersion + 1, items: pkg.items.map(entry => entry.aggregateId !== command.itemAggregateId ? entry : command.outcome === 'edited' ? { ...entry, aggregateVersion: entry.aggregateVersion + 1, version: entry.version + 1, currentVersionId: uuid(5_000 + entry.version), status: 'edited', title: command.authored.title, description: command.authored.description, acceptanceCriteria: command.authored.acceptanceCriteria, nonFunctionalRequirements: command.authored.nonFunctionalRequirements, history: [...entry.history.filter(history => history.version !== entry.version), { version: entry.version, status: entry.status, title: entry.title, description: entry.description, acceptanceCriteria: entry.acceptanceCriteria, nonFunctionalRequirements: entry.nonFunctionalRequirements, createdAt: '2026-08-31T06:00:00.000Z' }], diffs: [...entry.diffs, { fromVersion: entry.version, toVersion: entry.version + 1, changedFields: ['title', 'description'] }] } : { ...entry, aggregateVersion: entry.aggregateVersion + 1, status: command.outcome, decision: { outcome: command.outcome, rationale: command.rationale }, actions: [] } as typeof entry), blockers: remaining ? [`${remaining} work item decisions unresolved.`] : [], blockerCount: remaining, acceptedItemCount: remaining ? undefined : acceptedItemCount, actions: ['delivery.package.review.resolve'] };
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
        return { ...pkg, currentVersion: pkg.currentVersion + 1, currentVersionId: uuid(70 + pkg.currentVersion), aggregateVersion: pkg.aggregateVersion + 1, status: 'draft', reviewState: 'not_requested', approvalState: 'not_requested',
          blockers: [`${pkg.items.length} work item decisions unresolved.`], blockerCount: pkg.items.length, acceptedItemCount: undefined, actions: ['delivery.item.review'], items: pkg.items.map((entry, index) => {
            const revision = revisions.get(entry.aggregateId);
            return { ...entry, currentVersionId: uuid(6_000 + index), aggregateVersion: entry.aggregateVersion + 1, version: entry.version + 1, status: revision ? 'edited' as const : 'proposed' as const,
              ...(revision ? { title: revision.authored.title, description: revision.authored.description, acceptanceCriteria: revision.authored.acceptanceCriteria, nonFunctionalRequirements: revision.authored.nonFunctionalRequirements } : {}),
              decision: undefined, actions: ['delivery.item.review' as const] };
          }) };
      }) };
      if (command.action === 'delivery.package.review.resolve') return { ...current, packages: current.packages.map(pkg => pkg.id !== command.workPackageId ? pkg : command.outcome === 'approved'
        ? { ...pkg, status: 'review', reviewState: 'approved', blockers: [], blockerCount: 0, actions: ['delivery.package.approval.resolve'] }
        : command.outcome === 'changes_requested'
          ? { ...pkg, status: 'blocked', reviewState: 'changes_requested', blockers: ['Independent review requested changes.'], blockerCount: 1, actions: ['delivery.package.revision.commit'] }
          : { ...pkg, status: 'rejected', reviewState: 'rejected', blockers: [], blockerCount: 0, actions: [] }) };
      if (command.action === 'delivery.package.approval.resolve') {
        const approved = command.outcome === 'approved';
        return { ...current, packages: current.packages.map(pkg => pkg.id !== command.workPackageId ? pkg : { ...pkg, status: command.outcome, approvalState: command.outcome, actions: [] }),
          baselineEligibility: approved ? [{ workPackageId: command.workPackageId, workPackageVersionId: command.expectedPackageVersionId, workPackageVersion: command.expectedPackageVersion,
            acceptedItemCount: current.packages.find(pkg => pkg.id === command.workPackageId)?.acceptedItemCount ?? 1, lineageClassification: 'assessed', planningOnly: false, action: 'monitor.baseline.create' }] : [] };
      }
      return current;
    });
    if (command.action === 'monitor.baseline.create') setMonitor(current => current.baselines.length ? current : { ...current, baselines: [{ id: uuid(90), version: 1, status: 'approved', readiness: 'review_required', lineageClassification: 'assessed', planningOnly: false, workPackageId: command.workPackageId, workPackageVersion: command.expectedPackageVersion, acceptedItemCount: 1, acceptedItems: [{ version: 2, type: 'milestone', title: 'Canonical work item 001', status: 'accepted' }], milestones: ['Canonical work item 001'], dependencies: [], blockers: [], risks: [] }] });
    setStatus(`${command.action} committed and exact projection reloaded.`);
  };

  return <main className="min-h-screen bg-[var(--av-color-bg-subtle)] p-4 text-[var(--av-color-text)] sm:p-6"><nav aria-label="Harness views" className="mx-auto mb-4 flex max-w-7xl flex-wrap gap-2">{(['delivery', 'enterprise-monitor', 'primary-monitor', 'context-monitor'] as const).map(value => <button key={value} type="button" onClick={() => setView(value)} className="min-h-10 rounded-xl border px-3 font-black">{value.replace('-', ' ')}</button>)}</nav><div className="mx-auto max-w-7xl">{view === 'delivery' ? <GovernedDeliveryWorkspace projection={delivery} monitorProjection={fixtureState === 'no-monitor' ? undefined : monitor} busy={pageBusy} status={status} error={error} onAction={act} onLoadNextPage={loadNextPage}/> : view === 'enterprise-monitor' ? <MonitorApprovedBaselinePanel projection={monitor} heading="Enterprise Intelligence canonical baseline"/> : view === 'primary-monitor' ? <PortfolioView projects={[]} tasks={[]} users={[]} onUpdateProjectStage={() => undefined} onScopeChange={() => undefined} onViewChange={() => undefined} canonicalMonitorProjection={monitor}/> : <ContextMonitorHarness/>}</div></main>;
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

createRoot(document.getElementById('root')!).render(<Harness/>);
