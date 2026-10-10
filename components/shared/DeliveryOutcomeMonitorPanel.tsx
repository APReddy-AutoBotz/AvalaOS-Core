import React, { useEffect, useState } from 'react';
import type { StudioDeliveryScope, StudioDeliveryTransport } from '../../services/productAcceptanceBridge/client';
import type { StudioDeliveryOutcomeQueryResult } from '../../services/productAcceptanceBridge/contracts';
import {
  isCompleteStudioDeliveryOutcomeProjection,
  loadCompleteStudioDeliveryOutcomeProjection,
} from '../../services/productAcceptanceBridge/outcomePaging';
import StatusBadge from './ui/StatusBadge';

export type DeliveryOutcomeMonitorPanelProps = {
  scope: StudioDeliveryScope;
  projectId: string;
  projection?: StudioDeliveryOutcomeQueryResult | null;
  transport?: StudioDeliveryTransport;
  loadProjection?: (scope: StudioDeliveryScope, projectId: string) => Promise<StudioDeliveryOutcomeQueryResult>;
};

const defaultLoad = (scope: StudioDeliveryScope, projectId: string, transport?: StudioDeliveryTransport) => loadCompleteStudioDeliveryOutcomeProjection(scope, projectId, transport);

export default function DeliveryOutcomeMonitorPanel({ scope, projectId, projection, transport, loadProjection }: DeliveryOutcomeMonitorPanelProps) {
  const key = `${scope.actorId}:${scope.organizationId}:${scope.workspaceId}:${scope.authorizationVersion}:${projectId}`;
  const suppliedProjection = projection && isCompleteStudioDeliveryOutcomeProjection(projection, projectId) ? projection : null;
  const [loaded, setLoaded] = useState<{ key: string; projection: StudioDeliveryOutcomeQueryResult } | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'unavailable'>(suppliedProjection ? 'loaded' : projection ? 'unavailable' : 'loading');
  useEffect(() => {
    if (projection) { setLoaded(null); setState(isCompleteStudioDeliveryOutcomeProjection(projection, projectId) ? 'loaded' : 'unavailable'); return; }
    let current = true; setLoaded(null); setState('loading');
    (loadProjection ? loadProjection(scope, projectId) : defaultLoad(scope, projectId, transport)).then(value => {
      if (!current) return;
      if (!isCompleteStudioDeliveryOutcomeProjection(value, projectId)) { setLoaded(null); setState('unavailable'); return; }
      setLoaded({ key, projection: value }); setState('loaded');
    }).catch(() => { if (!current) return; setState('unavailable'); });
    return () => { current = false; };
  }, [key, projection, loadProjection, transport]);
  const value = suppliedProjection ?? (loaded?.key === key ? loaded.projection : null);
  return <section data-testid="authoritative-delivery-outcomes" data-monitor-mode="read-only" className="av-surface p-5" aria-labelledby="authoritative-delivery-outcomes-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="av-eyebrow">Avala Monitor · recorded outcomes</p><h2 id="authoritative-delivery-outcomes-title" className="mt-2 text-xl font-black">Authoritative Delivery outcomes</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Read only. Each item is a human record bound to an exact imported task, legacy document generation, and approved Studio artifact version. Monitor never infers or writes an outcome.</p></div><StatusBadge tone="info">Read only</StatusBadge></div>
    {state === 'loading' && <p role="status" className="mt-4 font-bold">Loading exact recorded outcomes.</p>}
    {state === 'unavailable' && <p role="alert" className="mt-4 rounded-xl border border-red-500 p-3 font-bold">Recorded outcomes are unavailable. Legacy task state is not substituted.</p>}
    {state === 'loaded' && value?.items.length === 0 && <p className="mt-4 rounded-xl bg-[var(--av-color-bg-subtle)] p-4 font-bold">No human outcome is recorded for an authoritative imported task in this project.</p>}
    {value && value.items.length > 0 && <ul className="mt-4 space-y-3">{value.items.map(item => <li key={item.outcomeId} data-testid={`authoritative-delivery-outcome-${item.outcomeId}`} className="rounded-xl border border-[var(--av-color-border)] p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={item.status === 'achieved' ? 'success' : item.status === 'partial' ? 'warning' : 'danger'}>{item.status.replaceAll('_', ' ')}</StatusBadge><span className="text-xs font-black">Outcome v{item.version} · task v{item.taskVersion}</span></div><h3 className="mt-3 font-black">{item.label}</h3><p className="mt-1 text-sm">{item.detail}</p><p className="mt-3 break-all text-xs font-semibold text-[var(--av-color-text-muted)]">Exact task {item.taskId} · document {item.documentGenerationId} · Studio version {item.studioArtifactVersionId}</p></li>)}</ul>}
  </section>;
}
