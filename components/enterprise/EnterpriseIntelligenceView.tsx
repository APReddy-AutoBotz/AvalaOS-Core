import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EnterpriseWorkspace, Organization, User } from '../../types';
import {
  ASSEMBLE_COMPONENT_CATALOG,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  classifyEvidenceFile,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
  type EnterpriseApprovalResourceType,
  type EnterpriseIntelligenceProjection,
} from '../../services/enterpriseIntelligence';
import { bytesToBase64, enterpriseIntelligenceClient, getProviderLifecycleAuthorizationVersion } from '../../services/enterpriseIntelligenceClient';
import { getRuntimeDataAccess } from '../../services/supabaseClient';
import { TranscriptSourceLibrary } from './TranscriptSourceLibrary';
import { AssessTranscriptCandidateReview } from './AssessTranscriptCandidateReview';

type TabId = 'controls' | 'intake' | 'source-library' | 'review' | 'modernization' | 'handoff' | 'delivery' | 'monitor' | 'assemble';
const tabs: Array<{ id: TabId; label: string; eyebrow: string }> = [
  { id: 'controls', label: 'AI Controls', eyebrow: 'Admin' },
  { id: 'intake', label: 'Evidence Intake', eyebrow: 'Assess' },
  { id: 'source-library', label: 'Source Library', eyebrow: 'Assess' },
  { id: 'review', label: 'Candidate Review', eyebrow: 'Assess' },
  { id: 'modernization', label: 'Modernization', eyebrow: 'Assess' },
  { id: 'handoff', label: 'Studio Handoff', eyebrow: 'Studio to Delivery' },
  { id: 'delivery', label: 'Work Package', eyebrow: 'Delivery' },
  { id: 'monitor', label: 'Monitor Baseline', eyebrow: 'Monitor' },
  { id: 'assemble', label: 'Assemble Blueprint', eyebrow: 'Assemble Phase 1' },
];

const panel = 'premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm';
const input = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 text-sm text-[var(--av-color-text)]';
const primary = 'inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ffbc03] px-4 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--av-color-border-strong)] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50';
const label = (value: string) => <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">{value}</span>;
const Badge = ({ children }: { children: React.ReactNode }) => <span className="rounded-full border border-[var(--av-color-border-strong)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">{children}</span>;

export default function EnterpriseIntelligenceView({ organization, workspace, currentUser }: {
  organization: Organization | null;
  workspace: EnterpriseWorkspace | null;
  currentUser: User | null;
}) {
  const organizationId = organization?.id || '';
  const workspaceId = workspace?.id || '';
  const serverAuthorityReady = (() => {
    try { return getRuntimeDataAccess() === 'server'; } catch { return false; }
  })();
  const scopeReady = Boolean(organizationId && workspaceId && currentUser?.id);
  const [activeTab, setActiveTab] = useState<TabId>('controls');
  const [projection, setProjection] = useState<EnterpriseIntelligenceProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [transcriptReviewActivated, setTranscriptReviewActivated] = useState(false);
  const [status, setStatus] = useState('Loading committed Enterprise Intelligence state.');
  const [error, setError] = useState('');
  const [providerForm, setProviderForm] = useState({ provider: 'openai' as EnterpriseAiProvider, displayName: '', endpoint: '', deployment: '', defaultModel: '' });
  const [providerId, setProviderId] = useState('');
  const [providerKey, setProviderKey] = useState('');
  const [routeRoleSelections, setRouteRoleSelections] = useState<Record<string, string[]>>({});
  const [sourceFile, setSourceFile] = useState<{ name: string; mimeType: string; size: number; base64: string; note: string } | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [assessDraftId, setAssessDraftId] = useState('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [studioDocumentId, setStudioDocumentId] = useState('');
  const [workPackageId, setWorkPackageId] = useState('');
  const [decisionId, setDecisionId] = useState('');
  const [blueprintName, setBlueprintName] = useState('');
  const [approvalId, setApprovalId] = useState('');
  const [approvalRationale, setApprovalRationale] = useState('');

  const reload = useCallback(async () => {
    if (!serverAuthorityReady) {
      setProjection(null);
      setError('');
      setStatus('Enterprise Intelligence requires a server-authorized workspace. The local sandbox does not execute provider or persistence calls.');
      return;
    }
    if (!scopeReady) {
      setStatus('Select an authorized organization and workspace to load committed Enterprise Intelligence state.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await enterpriseIntelligenceClient.loadProjection({
        organizationId,
        workspaceId,
        expectedAuthorizationVersion: projection?.authorizationVersion,
      });
      setProjection(next);
      setReloadRequired(false);
      setStatus(next.availability === 'blocked' ? 'Server access is blocked for this workspace.' : 'Committed server state loaded.');
    } catch (cause) {
      setReloadRequired(true);
      setError(cause instanceof Error ? cause.message : 'Committed state could not be loaded.');
      setStatus('Projection unavailable. No local fallback or success state is shown.');
    } finally {
      setBusy(false);
    }
  }, [organizationId, workspaceId, scopeReady, serverAuthorityReady, projection?.authorizationVersion]);

  useEffect(() => { void reload(); }, [organizationId, workspaceId]);
  useEffect(() => { setTranscriptReviewActivated(false); }, [organizationId, workspaceId]);
  useEffect(() => {
    if (projection?.transcriptFlow.features.assessMultisourceApplyEnabled) setTranscriptReviewActivated(true);
  }, [projection?.transcriptFlow.features.assessMultisourceApplyEnabled]);

  const mutate = async (action: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (!projection || reloadRequired) return false;
    setBusy(true);
    setError('');
    setStatus('Submitting one server-authorized command.');
    try {
      const result = await action();
      try {
        const next = await enterpriseIntelligenceClient.loadProjection({
          organizationId,
          workspaceId,
          expectedAuthorizationVersion: getProviderLifecycleAuthorizationVersion(result) || projection.authorizationVersion,
        });
        setProjection(next);
        setStatus(success);
        return true;
      } catch (reloadError) {
        setReloadRequired(true);
        setStatus('Command committed, but projection reload failed. Reload committed state before another mutation.');
        setError(reloadError instanceof Error ? reloadError.message : 'Projection reload failed.');
        return false;
      }
    } catch (cause) {
      setStatus('The command was not confirmed. No success state was recorded.');
      setError(cause instanceof Error ? cause.message : 'The governed command failed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectedProvider = projection?.providers.find(item => item.id === providerId);
  const selectedApproval = projection?.approvalResources.find(item => item.id === approvalId);
  const locked = busy || reloadRequired || !projection || projection.availability === 'blocked' || projection.availability === 'stale' || projection.availability === 'unavailable';
  const active = tabs.find(tab => tab.id === activeTab) || tabs[0];
  const acceptedForSource = projection?.evidenceCandidates.filter(item => item.sourceId === sourceId && ['accepted', 'edited'].includes(item.status)) || [];
  const selectableCandidateIds = new Set(acceptedForSource.map(item => item.id));

  useEffect(() => {
    if (!projection) return;
    if (!projection.providers.some(item => item.id === providerId)) setProviderId(projection.providers[0]?.id || '');
    setRouteRoleSelections(current => Object.fromEntries(projection.providers.flatMap(provider => provider.routes.map(route => [
      route.id,
      current[route.id]?.filter(roleId => provider.eligibleRouteRoles.some(option => option.id === roleId)).length
        ? current[route.id].filter(roleId => provider.eligibleRouteRoles.some(option => option.id === roleId))
        : route.allowedRoleIds,
    ]))));
    if (!projection.evidenceSources.some(item => item.id === sourceId)) setSourceId(projection.evidenceSources[0]?.id || '');
    if (!projection.assessDrafts.some(item => item.id === assessDraftId)) setAssessDraftId(projection.assessDrafts[0]?.id || '');
    setSelectedCandidateIds(current => current.filter(id => projection.evidenceCandidates.some(item => item.id === id && ['accepted', 'edited'].includes(item.status))));
    if (!projection.applications.some(item => item.id === applicationId)) setApplicationId(projection.applications.find(item => item.modernizationState === 'eligible')?.id || '');
    if (!projection.studioDocuments.some(item => item.id === studioDocumentId)) setStudioDocumentId(projection.studioDocuments.find(item => item.handoffState !== 'already_handed_off')?.id || '');
    if (!projection.deliveryPackages.some(item => item.id === workPackageId)) setWorkPackageId(projection.deliveryPackages.find(item => item.status === 'approved')?.id || '');
    if (!projection.modernizationDecisions.some(item => item.id === decisionId)) setDecisionId(projection.modernizationDecisions.find(item => item.assembleEligible)?.id || '');
    if (!projection.approvalResources.some(item => item.id === approvalId)) setApprovalId(projection.approvalResources[0]?.id || '');
  }, [projection]);

  const scope = projection ? { organizationId, workspaceId, expectedAuthorizationVersion: projection.authorizationVersion } : null;
  const onFile = async (file?: File) => {
    if (!file) return;
    const support = classifyEvidenceFile(file.name, file.type, file.size);
    if (!support.supported || !support.mimeType) {
      setSourceFile(null); setError(support.message); return;
    }
    setError('');
    setSourceFile({ name: file.name, mimeType: support.mimeType, size: file.size, base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())), note: support.message });
  };

  if (!serverAuthorityReady) return <div className="mx-auto max-w-4xl p-8"><section className={panel}><h1 className="text-2xl font-black">Enterprise Intelligence unavailable</h1><p className="mt-3 text-sm font-semibold">Enterprise Intelligence requires a server-authorized workspace. The local synthetic sandbox sends no provider or persistence requests.</p></section></div>;
  if (!scopeReady) return <div className="mx-auto max-w-4xl p-8"><section className={panel}><h1 className="text-2xl font-black">Enterprise Intelligence unavailable</h1><p className="mt-3 text-sm font-semibold">Select an authenticated tenant workspace. There is no local authority fallback.</p></section></div>;

  return <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto p-4 sm:p-6" data-testid="enterprise-intelligence-workspace">
    <header className={panel}>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="av-eyebrow">{active.eyebrow}</p><h1 className="mt-2 text-3xl font-black">Enterprise Intelligence</h1><p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--av-color-text-muted)]">BYOK, evidence-to-Assess promotion, approved Studio handoff, Delivery/Monitor lineage, modernization, and draft-only Assemble blueprints.</p></div><div className="flex gap-2"><Badge>Server authority</Badge><Badge>Human approval</Badge><Badge>No live sync</Badge></div></div>
      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Enterprise Intelligence surfaces">{tabs.map(tab => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-black ${activeTab === tab.id ? 'bg-[#002C4B] text-white' : 'bg-[var(--av-color-bg-subtle)]'}`}>{tab.label}</button>)}</nav>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={secondary} disabled={busy} onClick={() => void reload()}>Reload committed state</button><span role="status" className="text-xs font-semibold">{status}</span></div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50/50 p-3 text-sm font-bold text-rose-800">{error}</p>}
    </header>

    {activeTab === 'controls' && <section className={panel}><p className="av-eyebrow">Provider lifecycle</p><h2 className="mt-2 text-xl font-black">Register, bind, validate, activate, rotate, disable, or revoke</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">A raw key is sent once only to the dedicated authenticated secret endpoint. The projection contains only safe credential and validation states.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><label>{label('Provider')}<select className={input} value={providerForm.provider} onChange={event => setProviderForm(value => ({ ...value, provider: event.target.value as EnterpriseAiProvider }))}>{ENTERPRISE_AI_PROVIDERS.map(value => <option key={value}>{value}</option>)}</select></label><label>{label('Display name')}<input className={input} value={providerForm.displayName} onChange={event => setProviderForm(value => ({ ...value, displayName: event.target.value }))} /></label><label>{label('Default model')}<input className={input} value={providerForm.defaultModel} onChange={event => setProviderForm(value => ({ ...value, defaultModel: event.target.value }))} /></label><label>{label('Endpoint (Azure or compatible)')}<input className={input} value={providerForm.endpoint} onChange={event => setProviderForm(value => ({ ...value, endpoint: event.target.value }))} /></label><label>{label('Deployment (Azure)')}<input className={input} value={providerForm.deployment} onChange={event => setProviderForm(value => ({ ...value, deployment: event.target.value }))} /></label></div>
      <button type="button" className={`${primary} mt-4`} disabled={locked || !scope || !providerForm.displayName.trim() || !providerForm.defaultModel.trim()} onClick={() => scope && void mutate(() => enterpriseIntelligenceClient.registerProvider({ ...scope, ...providerForm, modelAllowlist: [providerForm.defaultModel], capabilities: [...ENTERPRISE_AI_CAPABILITIES] }), 'Provider registered as pending review. Routes remain disabled.')}>Register provider metadata</button>
      <div className="mt-6 grid gap-4 md:grid-cols-2"><label>{label('Configured provider')}<select className={input} value={providerId} onChange={event => setProviderId(event.target.value)}><option value="">Select a provider</option>{projection?.providers.map(item => <option key={item.id} value={item.id}>{item.displayName} — {item.status}</option>)}</select></label><label>{label('Provider key (sent once)')}<input className={input} type="password" autoComplete="new-password" value={providerKey} onChange={event => setProviderKey(event.target.value)} /></label></div>
      {selectedProvider && <div className="mt-4 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">Credential: {selectedProvider.credentialState.replaceAll('_', ' ')} · Validation: {selectedProvider.validationState.replaceAll('_', ' ')} · Budget: {selectedProvider.budgetState.replaceAll('_', ' ')}</div>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primary} disabled={locked || !scope || !providerId || providerKey.length < 8} onClick={() => scope && void mutate(async () => { try { await enterpriseIntelligenceClient.bindProviderSecret({ ...scope, providerConfigId: providerId, providerKey }); } finally { setProviderKey(''); } }, 'Secret bound through the approved backend; raw key discarded from form state.')}>Bind key securely</button><button type="button" className={secondary} disabled={locked || !scope || !providerId} onClick={() => scope && void mutate(() => enterpriseIntelligenceClient.validateProvider({ ...scope, providerConfigId: providerId }), 'Provider validation recorded.')}>Validate</button><button type="button" className={secondary} disabled={locked || !scope || !providerId} onClick={() => scope && void mutate(() => enterpriseIntelligenceClient.activateProvider({ ...scope, providerConfigId: providerId }), 'Validated provider activated.')}>Activate</button><button type="button" className={secondary} disabled={locked || !scope || !providerId || providerKey.length < 8} onClick={() => scope && void mutate(async () => { try { await enterpriseIntelligenceClient.rotateProviderSecret({ ...scope, providerConfigId: providerId, providerKey }); } finally { setProviderKey(''); } }, 'Provider key rotated and revalidated.')}>Rotate key</button><button type="button" className="min-h-10 rounded-xl border border-rose-300 px-4 text-sm font-black text-rose-700 disabled:opacity-50" disabled={locked || !scope || !providerId} onClick={() => scope && void mutate(() => enterpriseIntelligenceClient.revokeProvider({ ...scope, providerConfigId: providerId }), 'Provider revoked and all routes disabled.')}>Revoke</button></div>
      <div className="mt-5 grid gap-3">{selectedProvider?.routes.map(route => {
        const selectedRoles = routeRoleSelections[route.id] || route.allowedRoleIds;
        return <article key={route.id} className="rounded-2xl border border-[var(--av-color-border)] p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black">{route.capability}</p><p className="text-xs font-semibold text-[var(--av-color-text-muted)]">{route.modelLabel} · {route.availability.replaceAll('_', ' ')}</p></div><button type="button" className={secondary} disabled={locked || !scope || (!route.enabled && selectedRoles.length === 0)} onClick={() => scope && void mutate(() => enterpriseIntelligenceClient.toggleProviderRoute({ ...scope, providerConfigId: selectedProvider.id, routeId: route.id, capability: route.capability, enabled: !route.enabled, ...(!route.enabled ? { allowedRoles: selectedRoles } : {}) }), `Route ${route.enabled ? 'disabled' : 'enabled'}.`)}>{route.enabled ? 'Disable route' : 'Enable route'}</button></div><fieldset className="mt-3"><legend className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Authorized roles</legend><div className="mt-2 flex flex-wrap gap-3">{selectedProvider.eligibleRouteRoles.map(option => <label key={option.id} className="flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectedRoles.includes(option.id)} disabled={locked || route.enabled} onChange={() => setRouteRoleSelections(current => ({ ...current, [route.id]: selectedRoles.includes(option.id) ? selectedRoles.filter(id => id !== option.id) : [...selectedRoles, option.id] }))} />{option.label} <span className="text-xs text-[var(--av-color-text-muted)]">({option.scope === 'workspace' ? 'workspace' : 'organization admin'})</span></label>)}</div>{selectedProvider.eligibleRouteRoles.length === 0 && <p className="mt-2 text-xs font-semibold text-rose-700">No active role is eligible for this workspace route.</p>}</fieldset></article>;
      })}</div>
    </section>}

    {activeTab === 'source-library' && projection ? <TranscriptSourceLibrary
      key={`source-library:${organizationId}:${workspaceId}:${projection.authorizationVersion}:${projection.availability}:${reloadRequired}:${projection.transcriptFlow.sourceSets.map(item => `${item.id}:${item.versionSelector}:${item.version}`).join('|')}`}
      projection={projection.transcriptFlow}
      locked={locked}
      onCommitSourceSet={async sourceSet => {
        const committed = await mutate(() => enterpriseIntelligenceClient.commitTranscriptSourceSet({ organizationId, workspaceId, ...sourceSet }), 'Immutable Assess source-set version committed.');
        if (!committed) throw new Error('The source-set version was not confirmed. Keep this edit and reload committed state before retrying.');
      }}
      onLockInputBundle={bundle => mutate(() => enterpriseIntelligenceClient.lockTranscriptInputBundle({ organizationId, workspaceId, ...bundle }), 'Exact Assess input bundle locked.')}
      onSetJourneyState={journey => mutate(() => enterpriseIntelligenceClient.setTranscriptJourneyState({ organizationId, workspaceId, ...journey }), journey.status === 'stopped' ? 'Assess journey stopped after committed state.' : 'Assess journey state committed.')}
    /> : null}

    {activeTab === 'intake' && <section className={panel}><p className="av-eyebrow">Evidence capture</p><h2 className="mt-2 text-xl font-black">Upload a bounded private source</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">TXT, Markdown, CSV, VTT/SRT, text PDFs, and DOCX are supported. Scanned PDFs fail truthfully because OCR is not enabled.</p><label className="mt-5 block">{label('Evidence document')}<input className="mt-2 block w-full" type="file" accept=".txt,.md,.markdown,.csv,.vtt,.srt,.pdf,.docx" onChange={event => void onFile(event.target.files?.[0])} /></label>{sourceFile && <p className="mt-3 text-sm font-bold">{sourceFile.name} · {Math.ceil(sourceFile.size / 1024)} KB. {sourceFile.note}</p>}<button type="button" className={`${primary} mt-4`} disabled={locked || !sourceFile} onClick={() => sourceFile && void mutate(() => enterpriseIntelligenceClient.createEvidenceSource({ organizationId, workspaceId, displayName: sourceFile.name, filename: sourceFile.name, mimeType: sourceFile.mimeType, contentBase64: sourceFile.base64 }), 'Private source version committed.')}>Store private source</button>
      <label className="mt-6 block">{label('Committed evidence source')}<select className={input} value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Select a source</option>{projection?.evidenceSources.map(item => <option key={item.id} value={item.id}>{item.displayName} — {item.versionLabel} — {item.failureCode ? item.failureCode.replaceAll('_', ' ') : item.extractionState.replaceAll('_', ' ')}</option>)}</select></label><button type="button" className={`${secondary} mt-4`} disabled={locked || !sourceId || projection?.evidenceSources.find(item => item.id === sourceId)?.extractionState === 'failed'} onClick={() => void mutate(() => enterpriseIntelligenceClient.extractEvidence({ organizationId, workspaceId, sourceId }), 'Extraction completed; candidates require human review.')}>Run governed extraction</button>
    </section>}

    {activeTab === 'review' && projection && (projection.transcriptFlow.features.assessMultisourceApplyEnabled || transcriptReviewActivated) ? <AssessTranscriptCandidateReview
      key={`candidate-review:${organizationId}:${workspaceId}:${projection.authorizationVersion}:${projection.availability}:${reloadRequired}:${projection.transcriptFlow.inputBundles.map(item => `${item.id}:${item.versionSelector}:${item.version}:${item.status}`).join('|')}:${projection.assessDrafts.map(item => `${item.id}:${item.versionLabel}`).join('|')}`}
      projection={projection.transcriptFlow}
      assessDrafts={projection.assessDrafts}
      locked={locked}
      onExtract={input => mutate(() => enterpriseIntelligenceClient.extractTranscriptAssessBundle({ organizationId, workspaceId, ...input }), 'Multi-source extraction completed; candidates require human review.')}
      onReview={input => mutate(() => enterpriseIntelligenceClient.reviewTranscriptAssessCandidate({ organizationId, workspaceId, ...input }), input.status === 'edited' ? 'Candidate edit and rationale committed as immutable history.' : `Candidate ${input.status}.`)}
      onPreview={input => mutate(() => enterpriseIntelligenceClient.previewTranscriptAssessApply({ organizationId, workspaceId, ...input }), 'Exact Assess draft changes previewed; no draft mutation occurred.')}
      onResolveConflict={input => mutate(() => enterpriseIntelligenceClient.resolveTranscriptAssessConflict({ organizationId, workspaceId, ...input }), 'Conflict resolution and rationale committed.')}
      onApply={input => mutate(() => enterpriseIntelligenceClient.applyTranscriptAssessPreview({ organizationId, workspaceId, ...input }), 'Selected batch applied atomically as one new Assess draft version.')}
    /> : activeTab === 'review' && projection && <section className={panel}>
      <p className="av-eyebrow">Assess draft promotion</p><h2 className="mt-2 text-xl font-black">Review and select anchored candidates</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label>{label('Evidence source')}<select className={input} value={sourceId} onChange={event => { setSourceId(event.target.value); setSelectedCandidateIds([]); }}><option value="">Select a source</option>{projection?.evidenceSources.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label>{label('Editable Assess draft')}<select className={input} value={assessDraftId} onChange={event => setAssessDraftId(event.target.value)}><option value="">Select a governed draft</option>{projection?.assessDrafts.map(item => <option key={item.id} value={item.id}>{item.label} — {item.versionLabel}</option>)}</select></label>
      </div>
      {projection?.assessDrafts.length === 0 && <p className="mt-3 rounded-xl bg-[var(--av-color-bg-subtle)] p-3 text-sm font-bold">Create an editable governed draft in Assess V2, then reload committed state here.</p>}
      <div className="mt-5 grid gap-3">{projection?.evidenceCandidates.filter(item => !sourceId || item.sourceId === sourceId).map(item => {
        const selectable = ['accepted', 'edited'].includes(item.status) && item.provenanceState === 'anchored';
        const selected = selectedCandidateIds.includes(item.id);
        return <article key={item.id} className="rounded-2xl border border-[var(--av-color-border)] p-4"><div className="flex flex-wrap items-center gap-2">{selectable && <label className="flex min-h-10 items-center gap-2 text-sm font-black"><input type="checkbox" checked={selected} onChange={() => setSelectedCandidateIds(current => selected ? current.filter(id => id !== item.id) : [...current, item.id])} />Select for promotion</label>}<Badge>{item.field.replaceAll('_', ' ')}</Badge><Badge>{item.provenanceState}</Badge><Badge>{item.status}</Badge></div><p className="mt-3 text-sm font-bold">{item.value}</p><p className="mt-2 text-xs font-semibold text-[var(--av-color-text-muted)]">{item.sourceLocator} · {Math.round(item.confidence * 100)}% confidence</p><div className="mt-3 flex gap-2"><button type="button" className={primary} disabled={locked || item.status === 'accepted'} onClick={() => void mutate(() => enterpriseIntelligenceClient.reviewEvidenceCandidate({ organizationId, workspaceId, candidateId: item.id, status: 'accepted' }), 'Candidate accepted with provenance.')}>Accept</button><button type="button" className={secondary} disabled={locked || item.status === 'rejected'} onClick={() => void mutate(() => enterpriseIntelligenceClient.reviewEvidenceCandidate({ organizationId, workspaceId, candidateId: item.id, status: 'rejected' }), 'Candidate rejected.')}>Reject</button></div></article>;
      })}</div>
      <div className="mt-5 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">Accepted candidates: {acceptedForSource.length}. Selected: {selectedCandidateIds.filter(id => selectableCandidateIds.has(id)).length}. Promotion provenance: {projection?.assessPromotion.provenanceComplete ? 'complete' : 'incomplete'}. Idempotency: {projection?.assessPromotion.idempotencyState.replaceAll('_', ' ')}.</div>
      <button type="button" className={`${primary} mt-4`} disabled={locked || !sourceId || !assessDraftId || selectedCandidateIds.length === 0 || selectedCandidateIds.some(id => !selectableCandidateIds.has(id)) || !projection?.assessPromotion.provenanceComplete} onClick={() => void mutate(() => enterpriseIntelligenceClient.promoteEvidenceToAssess({ organizationId, workspaceId, sourceId, assessDraftId, candidateIds: selectedCandidateIds }), 'Selected evidence promoted into a new Assess draft version.')}>Promote selected evidence to Assess draft</button>
    </section>}

    {activeTab === 'modernization' && <section className={panel}><p className="av-eyebrow">Modernization and Assemble assessment</p><h2 className="mt-2 text-xl font-black">Evaluate the current approved application assessment</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">The server derives the exact approved assessment, factors, model version, blockers, and conflicts. PR1G scoring law is unchanged.</p><label className="mt-5 block">{label('Approved application')}<select className={input} value={applicationId} onChange={event => setApplicationId(event.target.value)}><option value="">Select an application</option>{projection?.applications.map(item => <option key={item.id} value={item.id}>{item.name} — {item.approvedAssessmentLabel} — {item.modernizationState.replaceAll('_', ' ')}</option>)}</select></label><button type="button" className={`${primary} mt-4`} disabled={locked || !applicationId} onClick={() => void mutate(() => enterpriseIntelligenceClient.evaluateModernization({ organizationId, workspaceId, applicationId }), 'Deterministic modernization decision recorded for review.')}>Evaluate disposition</button><div className="mt-5 grid gap-3">{projection?.modernizationDecisions.map(item => <article key={item.id} className="rounded-2xl border border-[var(--av-color-border)] p-4"><p className="font-black">{item.applicationName}: {item.primaryDisposition.replaceAll('_', ' ')}</p><p className="mt-1 text-sm font-semibold">Status {item.status}; Assemble {item.assembleEligible ? 'eligible' : 'not eligible'}.</p>{item.blockers.length > 0 && <p className="mt-2 text-xs font-bold">Blockers: {item.blockers.join(', ')}</p>}</article>)}</div></section>}

    {activeTab === 'handoff' && <section className={panel}><p className="av-eyebrow">Studio to Delivery</p><h2 className="mt-2 text-xl font-black">Select a current approved document</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Version and content hash are derived and rechecked on the server; this browser never supplies them.</p><label className="mt-5 block">{label('Approved Studio document')}<select className={input} value={studioDocumentId} onChange={event => setStudioDocumentId(event.target.value)}><option value="">Select a document</option>{projection?.studioDocuments.map(item => <option key={item.id} value={item.id}>{item.label} — {item.approvedVersionLabel} — {item.handoffState.replaceAll('_', ' ')}</option>)}</select></label><button type="button" className={`${primary} mt-4`} disabled={locked || !studioDocumentId} onClick={() => void mutate(() => enterpriseIntelligenceClient.handoffStudioDocument({ organizationId, workspaceId, studioDocumentId }), 'Approved Studio document handed off to a governed Delivery draft.')}>Create Delivery draft</button></section>}

    {activeTab === 'delivery' && <section className={panel}><p className="av-eyebrow">Delivery and approval</p><h2 className="mt-2 text-xl font-black">Reloadable work packages with exact lineage</h2><div className="mt-5 grid gap-3">{projection?.deliveryPackages.map(item => <article key={item.id} className="rounded-2xl border border-[var(--av-color-border)] p-4"><div className="flex flex-wrap gap-2"><Badge>{item.status}</Badge><Badge>{item.lineageState}</Badge></div><p className="mt-3 font-black">{item.label} · {item.currentVersionLabel}</p><p className="mt-1 text-sm font-semibold">{item.sourceLabel}; {item.items.length} canonical items.</p></article>)}</div><div className="mt-6 grid gap-4 md:grid-cols-2"><label>{label('Review or approval resource')}<select className={input} value={approvalId} onChange={event => setApprovalId(event.target.value)}><option value="">Select a governed resource</option>{projection?.approvalResources.map(item => <option key={`${item.resourceType}-${item.id}`} value={item.id}>{item.label} — {item.separationOfDuties.replaceAll('_', ' ')}</option>)}</select></label><label>{label('Rationale')}<input className={input} value={approvalRationale} onChange={event => setApprovalRationale(event.target.value)} /></label></div>{selectedApproval && <p className="mt-3 text-sm font-bold">Review: {selectedApproval.independentReviewState.replaceAll('_', ' ')} · Approval: {selectedApproval.approvalState.replaceAll('_', ' ')}</p>}<div className="mt-4 flex gap-2"><button type="button" className={secondary} disabled={locked || !selectedApproval || approvalRationale.trim().length < 4 || selectedApproval.separationOfDuties !== 'eligible_for_review'} onClick={() => selectedApproval && void mutate(() => enterpriseIntelligenceClient.recordReview({ organizationId, workspaceId, resourceType: selectedApproval.resourceType as EnterpriseApprovalResourceType, resourceId: selectedApproval.id, rationale: approvalRationale }), 'Independent review recorded against current server state.')}>Record independent review</button><button type="button" className={primary} disabled={locked || !selectedApproval || approvalRationale.trim().length < 4 || selectedApproval.separationOfDuties !== 'eligible_for_approval'} onClick={() => selectedApproval && void mutate(() => enterpriseIntelligenceClient.recordApproval({ organizationId, workspaceId, resourceType: selectedApproval.resourceType, resourceId: selectedApproval.id, outcome: 'approved', rationale: approvalRationale }), 'Approval recorded after separation-of-duties checks.')}>Approve</button></div></section>}

    {activeTab === 'monitor' && <section className={panel}><p className="av-eyebrow">Monitor baseline</p><h2 className="mt-2 text-xl font-black">Derive a baseline from an approved Delivery package</h2><label className="mt-5 block">{label('Approved work package')}<select className={input} value={workPackageId} onChange={event => setWorkPackageId(event.target.value)}><option value="">Select a package</option>{projection?.deliveryPackages.map(item => <option key={item.id} value={item.id}>{item.label} — {item.status} — {item.lineageState}</option>)}</select></label><button type="button" className={`${primary} mt-4`} disabled={locked || !workPackageId || projection?.deliveryPackages.find(item => item.id === workPackageId)?.status !== 'approved'} onClick={() => void mutate(() => enterpriseIntelligenceClient.createMonitorBaseline({ organizationId, workspaceId, workPackageId }), 'Read-only Monitor baseline created from approved canonical items.')}>Create Monitor baseline</button><div className="mt-5 grid gap-3">{projection?.monitorBaselines.map(item => <article key={item.id} className="rounded-2xl border border-[var(--av-color-border)] p-4"><p className="font-black">{item.label}: {item.status}</p><p className="mt-1 text-sm font-semibold">{item.approvedItemCount} approved items · lineage {item.lineageComplete ? 'complete' : 'incomplete'} · live telemetry disabled.</p></article>)}</div></section>}

    {activeTab === 'assemble' && <section className={panel}><p className="av-eyebrow">Assemble Phase 1</p><h2 className="mt-2 text-xl font-black">Create a draft-only blueprint</h2><p className="mt-2 text-sm font-semibold text-[var(--av-color-text-muted)]">Catalog: {ASSEMBLE_COMPONENT_CATALOG.join(', ')}. Code generation, deployment, infrastructure changes, credential access, source calls, and runtime agents remain disabled.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label>{label('Approved eligible modernization decision')}<select className={input} value={decisionId} onChange={event => setDecisionId(event.target.value)}><option value="">Select a decision</option>{projection?.modernizationDecisions.filter(item => item.assembleEligible).map(item => <option key={item.id} value={item.id}>{item.applicationName} — {item.primaryDisposition.replaceAll('_', ' ')}</option>)}</select></label><label>{label('Blueprint name')}<input className={input} value={blueprintName} onChange={event => setBlueprintName(event.target.value)} /></label></div><button type="button" className={`${primary} mt-4`} disabled={locked || !decisionId || !blueprintName.trim()} onClick={() => void mutate(() => enterpriseIntelligenceClient.createAssembleBlueprint({ organizationId, workspaceId, modernizationDecisionId: decisionId, name: blueprintName }), 'Assemble blueprint draft created; no execution occurred.')}>Create blueprint draft</button><div className="mt-5 grid gap-3">{projection?.blueprints.map(item => <article key={item.id} className="rounded-2xl border border-[var(--av-color-border)] p-4"><p className="font-black">{item.name} · {item.versionLabel}</p><p className="mt-1 text-sm font-semibold">{item.status} · {item.disposition.replaceAll('_', ' ')} · {item.components.length} components · runtime agents disabled.</p></article>)}</div></section>}
  </div>;
}
