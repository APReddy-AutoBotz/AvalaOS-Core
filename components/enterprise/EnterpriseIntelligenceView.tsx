import React, { useMemo, useState } from 'react';
import type { Organization, EnterpriseWorkspace, User } from '../../types';
import {
  ASSEMBLE_COMPONENT_CATALOG,
  ENTERPRISE_AI_CAPABILITIES,
  ENTERPRISE_AI_PROVIDERS,
  EVIDENCE_CANDIDATE_FIELDS,
  type EnterpriseAiCapability,
  type EnterpriseAiProvider,
} from '../../services/enterpriseIntelligence';
import { bytesToBase64, enterpriseIntelligenceClient } from '../../services/enterpriseIntelligenceClient';

type TabId = 'controls' | 'intake' | 'review' | 'modernization' | 'handoff' | 'delivery' | 'monitor' | 'assemble';

const tabs: Array<{ id: TabId; label: string; eyebrow: string }> = [
  { id: 'controls', label: 'AI Controls', eyebrow: 'Admin' },
  { id: 'intake', label: 'Evidence Intake', eyebrow: 'Assess' },
  { id: 'review', label: 'Candidate Review', eyebrow: 'Assess' },
  { id: 'modernization', label: 'Modernization', eyebrow: 'Assess' },
  { id: 'handoff', label: 'Studio Handoff', eyebrow: 'Studio → Delivery' },
  { id: 'delivery', label: 'Work Package', eyebrow: 'Delivery' },
  { id: 'monitor', label: 'Monitor Baseline', eyebrow: 'Monitor' },
  { id: 'assemble', label: 'Assemble Blueprint', eyebrow: 'Assemble Phase 1' },
];

const panelClass = 'premium-surface rounded-3xl border border-[var(--av-color-border)] p-5 shadow-sm';
const inputClass = 'mt-1 min-h-10 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] px-3 text-sm text-[var(--av-color-text)]';
const buttonClass = 'inline-flex min-h-10 items-center justify-center rounded-xl bg-[#ffbc03] px-4 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50';

const EvidenceStatus = ({ label }: { label: string }) => <span className="rounded-full border border-[var(--av-color-border-strong)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--av-color-text-muted)]">{label}</span>;

const fieldLabel = (label: string, required = false) => <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">{label}{required ? ' *' : ''}</span>;

export default function EnterpriseIntelligenceView({
  organization,
  workspace,
  currentUser,
}: {
  organization: Organization | null;
  workspace: EnterpriseWorkspace | null;
  currentUser: User | null;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('controls');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Server-gated controls are ready. No provider secret is accepted in this browser surface.');
  const [providerForm, setProviderForm] = useState({
    provider: 'openai' as EnterpriseAiProvider,
    displayName: '',
    endpoint: '',
    deployment: '',
    defaultModel: '',
    secretReference: '',
  });
  const [selectedCapabilities, setSelectedCapabilities] = useState<EnterpriseAiCapability[]>([...ENTERPRISE_AI_CAPABILITIES]);
  const [sourceFile, setSourceFile] = useState<{ name: string; type: string; size: number; base64: string } | null>(null);
  const [sourceReceipt, setSourceReceipt] = useState<{ sourceId: string; sourceVersionId: string; displayName: string; status: string } | null>(null);
  const [candidates, setCandidates] = useState<Array<{ id: string; field: string; value: string; confidence: number; status: string; sourceLocator: string }>>([]);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingCandidateValue, setEditingCandidateValue] = useState('');
  const [modernizationIds, setModernizationIds] = useState({ applicationId: '', assessmentVersionId: '' });
  const [decisionId, setDecisionId] = useState('');
  const [blueprintName, setBlueprintName] = useState('');
  const [blueprintJson, setBlueprintJson] = useState('');
  const [studioHandoff, setStudioHandoff] = useState({ studioDocumentId: '', studioVersion: '', studioContentHash: '' });
  const [handoffResult, setHandoffResult] = useState<{ packageVersionId?: string; workPackageId?: string; itemIds?: string[] } | null>(null);
  const [monitorForm, setMonitorForm] = useState({ packageVersionId: '', approvedItemIds: '' });
  const [approvalForm, setApprovalForm] = useState({ resourceType: 'delivery_work_package', resourceId: '', rationale: '' });

  const organizationId = organization?.id || '';
  const workspaceId = workspace?.id || '';
  const actorId = currentUser?.id || '';
  const workspaceReady = Boolean(organizationId && workspaceId && actorId);
  const activeTabMeta = useMemo(() => tabs.find(tab => tab.id === activeTab) || tabs[0], [activeTab]);

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setMessage('Working on a server-authorized command…');
    try {
      await action();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The command failed. No success state was recorded.');
    } finally {
      setBusy(false);
    }
  };

  const handleProviderRegister = () => run(async () => {
    await enterpriseIntelligenceClient.registerProvider({
      organizationId,
      workspaceId,
      ...providerForm,
      modelAllowlist: providerForm.defaultModel ? [providerForm.defaultModel] : [],
      capabilities: selectedCapabilities,
    });
  }, 'Provider metadata and capability routes were recorded as pending review. Routes remain disabled until an authorized administrator enables them.');

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 12_000_000) {
      setMessage('Evidence is limited to 12 MB per source.');
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    setSourceFile({ name: file.name, type: file.type || 'text/plain', size: file.size, base64: bytesToBase64(bytes) });
    setMessage('Source is staged in memory only. Submit to send it to server-managed private storage.');
  };

  const handleSourceCreate = () => {
    if (!sourceFile) return;
    run(async () => {
      const result = await enterpriseIntelligenceClient.createEvidenceSource({
        organizationId,
        workspaceId,
        displayName: sourceFile.name,
        filename: sourceFile.name,
        mimeType: sourceFile.type,
        contentBase64: sourceFile.base64,
      }) as { sourceId: string; sourceVersionId: string; displayName: string; status: string };
      setSourceReceipt(result);
    }, 'Source version committed to private server-managed storage. Candidate extraction remains a separate AI draft step.');
  };

  const handleExtract = () => {
    if (!sourceReceipt) return;
    run(async () => {
      const result = await enterpriseIntelligenceClient.extractEvidence({ organizationId, workspaceId, sourceId: sourceReceipt.sourceId, sourceVersionId: sourceReceipt.sourceVersionId }) as { candidates?: Array<{ id: string; field: string; value: string; confidence: number; status: string; sourceLocator: string }> };
      setCandidates(result.candidates || []);
      setActiveTab('review');
    }, 'AI extraction produced reviewable candidates. Nothing was accepted into Assess automatically.');
  };

  const reviewCandidate = (candidateId: string, status: 'accepted' | 'rejected') => run(async () => {
    await enterpriseIntelligenceClient.reviewEvidenceCandidate({ organizationId, workspaceId, candidateId, status });
    setCandidates(previous => previous.map(candidate => candidate.id === candidateId ? { ...candidate, status } : candidate));
  }, `Candidate marked ${status}; the review decision remains attributable to the human reviewer.`);

  const saveCandidateEdit = (candidateId: string) => run(async () => {
    await enterpriseIntelligenceClient.reviewEvidenceCandidate({ organizationId, workspaceId, candidateId, status: 'edited', value: editingCandidateValue, reason: 'Human review edit' });
    setCandidates(previous => previous.map(candidate => candidate.id === candidateId ? { ...candidate, value: editingCandidateValue, status: 'edited' } : candidate));
    setEditingCandidateId(null);
  }, 'Candidate edit recorded with append-only review history.');

  const acceptAllCandidates = () => run(async () => {
    const pending = candidates.filter(candidate => candidate.status === 'suggested');
    await Promise.all(pending.map(candidate => enterpriseIntelligenceClient.reviewEvidenceCandidate({ organizationId, workspaceId, candidateId: candidate.id, status: 'accepted' })));
    setCandidates(previous => previous.map(candidate => candidate.status === 'suggested' ? { ...candidate, status: 'accepted' } : candidate));
  }, 'All currently suggested candidates were accepted into the governed draft.');

  const evaluateModernization = () => run(async () => {
    const result = await enterpriseIntelligenceClient.evaluateModernization({ organizationId, workspaceId, ...modernizationIds }) as { decisionId?: string; decision?: { primaryDisposition?: string; blockers?: string[] } };
    if (result.decisionId) setDecisionId(result.decisionId);
    setMessage(`Deterministic modernization decision is ${result.decision?.primaryDisposition || 'in review'} and requires human approval. ${result.decision?.blockers?.length ? `Blockers: ${result.decision.blockers.join(', ')}` : ''}`);
  }, 'Modernization assessment recorded for Govern review.');

  const createHandoff = () => run(async () => {
    const result = await enterpriseIntelligenceClient.handoffStudioDocument({ organizationId, workspaceId, studioDocumentId: studioHandoff.studioDocumentId, studioVersion: Number(studioHandoff.studioVersion), studioContentHash: studioHandoff.studioContentHash }) as { packageVersionId?: string; workPackageId?: string; itemIds?: string[] };
    setHandoffResult(result);
    setApprovalForm(form => ({ ...form, resourceId: result.workPackageId || form.resourceId }));
    setMonitorForm(form => ({ ...form, packageVersionId: result.packageVersionId || form.packageVersionId, approvedItemIds: result.itemIds?.join(', ') || form.approvedItemIds }));
  }, 'Exact approved Studio version was snapshotted into a Delivery work-package draft with lineage.');

  const recordIndependentReview = () => run(async () => {
    await enterpriseIntelligenceClient.recordReview({ organizationId, workspaceId, ...approvalForm });
  }, 'Independent review event recorded against the current resource hash. A different authorized person must approve it.');

  const recordApproval = () => run(async () => {
    await enterpriseIntelligenceClient.recordApproval({ organizationId, workspaceId, ...approvalForm, outcome: 'approved' });
  }, 'Approval recorded. The resource may now be consumed only where its server lifecycle permits.');

  const createBaseline = () => run(async () => {
    await enterpriseIntelligenceClient.createMonitorBaseline({ organizationId, workspaceId, packageVersionId: monitorForm.packageVersionId, approvedItemIds: monitorForm.approvedItemIds.split(',').map(value => value.trim()).filter(Boolean) });
  }, 'Monitor baseline is staged for approval. Live telemetry and external delivery-system sync remain disabled.');

  const createBlueprint = () => run(async () => {
    const result = await enterpriseIntelligenceClient.createAssembleBlueprint({ organizationId, workspaceId, modernizationDecisionId: decisionId, name: blueprintName }) as { components?: unknown[]; readableDocument?: string; [key: string]: unknown };
    setBlueprintJson(JSON.stringify(result, null, 2));
  }, 'Assemble Phase 1 blueprint draft created. It is not code, deployment, or an approval.');

  const deliveryApprovalPanel = activeTab === 'delivery' ? <section className={panelClass} aria-labelledby="ei-approval-heading">
    <p className="av-eyebrow">Govern approval boundary</p>
    <h2 id="ei-approval-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Independent review and approval</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">The server requires a reviewer distinct from the creator and a different approver. Resource hashes and authorization versions are rechecked server-side.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <label>{fieldLabel('Resource type', true)}<select className={inputClass} value={approvalForm.resourceType} onChange={event => setApprovalForm(form => ({ ...form, resourceType: event.target.value }))}><option value="delivery_work_package">Delivery work package</option><option value="modernization_decision">Modernization decision</option><option value="monitor_baseline">Monitor baseline</option><option value="assemble_blueprint">Assemble blueprint</option><option value="evidence_candidate">Evidence candidate</option></select></label>
      <label>{fieldLabel('Resource ID', true)}<input className={inputClass} value={approvalForm.resourceId} onChange={event => setApprovalForm(form => ({ ...form, resourceId: event.target.value }))} placeholder="UUID" /></label>
      <label>{fieldLabel('Rationale', true)}<input className={inputClass} value={approvalForm.rationale} onChange={event => setApprovalForm(form => ({ ...form, rationale: event.target.value }))} placeholder="Review rationale" /></label>
    </div>
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="min-h-10 rounded-xl border border-[var(--av-color-border-strong)] px-4 text-xs font-black" disabled={busy || !approvalForm.resourceId || approvalForm.rationale.trim().length < 4} onClick={recordIndependentReview}>Record independent review</button><button type="button" className={buttonClass} disabled={busy || !approvalForm.resourceId || approvalForm.rationale.trim().length < 4} onClick={recordApproval}>Record approval</button></div>
  </section> : null;

  if (!workspaceReady) {
    return <div className="mx-auto max-w-4xl p-8"><div className={panelClass}><p className="av-eyebrow">Enterprise Intelligence unavailable</p><h1 className="mt-2 text-2xl font-black text-[var(--av-color-text)]">A tenant workspace is required.</h1><p className="mt-3 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">The server command boundary needs an organization, workspace, and authenticated actor. No local or browser fallback is available.</p></div></div>;
  }

  return <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-4 overflow-y-auto p-4 sm:p-6" data-testid="enterprise-intelligence-workspace">
    <header className={panelClass}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="av-eyebrow">{activeTabMeta.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--av-color-text)]">Enterprise Intelligence</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">BYOK, evidence capture, governed Studio handoff, deterministic modernization, Delivery/Monitor lineage, and Assemble Phase 1 blueprints in one reviewable path.</p>
        </div>
        <div className="flex flex-wrap gap-2"><EvidenceStatus label="Server-gated" /><EvidenceStatus label="Human approval" /><EvidenceStatus label="No live sync" /></div>
      </div>
      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Enterprise Intelligence surfaces">
        {tabs.map(tab => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-black transition ${activeTab === tab.id ? 'bg-[#002C4B] text-white' : 'bg-[var(--av-color-bg-subtle)] text-[var(--av-color-text-muted)] hover:text-[var(--av-color-text)]'}`}>{tab.label}</button>)}
      </nav>
      <p className="mt-3 text-xs font-semibold text-[var(--av-color-text-muted)]" aria-live="polite">{message}</p>
    </header>

    {activeTab === 'controls' && <section className={panelClass} aria-labelledby="ei-controls-heading">
      <p className="av-eyebrow">Admin AI Controls</p><h2 id="ei-controls-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Register a provider reference</h2>
      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">Only an opaque server reference is accepted here. The raw key belongs in the approved server SecretStore or Vault adapter and never enters app tables, browser state, URLs, prompts, or audit metadata.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label>{fieldLabel('Provider', true)}<select className={inputClass} value={providerForm.provider} onChange={event => setProviderForm(form => ({ ...form, provider: event.target.value as EnterpriseAiProvider }))}>{ENTERPRISE_AI_PROVIDERS.map(provider => <option key={provider} value={provider}>{provider}</option>)}</select></label>
        <label>{fieldLabel('Display name', true)}<input className={inputClass} value={providerForm.displayName} onChange={event => setProviderForm(form => ({ ...form, displayName: event.target.value }))} placeholder="Claims AI - primary" /></label>
        <label>{fieldLabel('Default model', true)}<input className={inputClass} value={providerForm.defaultModel} onChange={event => setProviderForm(form => ({ ...form, defaultModel: event.target.value }))} placeholder="approved-model-id" /></label>
        <label>{fieldLabel('Tenant-bound secret reference', true)}<input className={inputClass} value={providerForm.secretReference} onChange={event => setProviderForm(form => ({ ...form, secretReference: event.target.value }))} placeholder={`AVALA_PROVIDER_SECRET_OPENAI_${organizationId.replaceAll('-', '').toUpperCase()}_PRIMARY`} autoComplete="off" /></label>
        <label>{fieldLabel('Endpoint (Azure / compatible)')}<input className={inputClass} value={providerForm.endpoint} onChange={event => setProviderForm(form => ({ ...form, endpoint: event.target.value }))} placeholder="https://approved-endpoint.example" /></label>
        <label>{fieldLabel('Deployment (Azure)')}<input className={inputClass} value={providerForm.deployment} onChange={event => setProviderForm(form => ({ ...form, deployment: event.target.value }))} placeholder="deployment-name" /></label>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{ENTERPRISE_AI_CAPABILITIES.map(capability => <label key={capability} className="flex items-center gap-2 rounded-xl border border-[var(--av-color-border)] px-3 py-2 text-xs font-bold text-[var(--av-color-text)]"><input type="checkbox" checked={selectedCapabilities.includes(capability)} onChange={event => setSelectedCapabilities(previous => event.target.checked ? [...previous, capability] : previous.filter(item => item !== capability))} />{capability}</label>)}</div>
      <button type="button" className={`${buttonClass} mt-5`} disabled={busy || !providerForm.displayName || !providerForm.defaultModel || !providerForm.secretReference} onClick={handleProviderRegister}>Register pending-review provider</button>
    </section>}

    {activeTab === 'intake' && <section className={panelClass} aria-labelledby="ei-intake-heading">
      <p className="av-eyebrow">Assess Evidence Intake</p><h2 id="ei-intake-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Upload a governed source version</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">Supported: TXT, Markdown, CSV, VTT/SRT, meeting notes, text PDF, and DOCX. No live bots, connectors, audio, OCR, email, or external system sync is invoked.</p>
      <label className="mt-5 block rounded-2xl border border-dashed border-[var(--av-color-border-strong)] p-6 text-center"><span className="text-sm font-black text-[var(--av-color-text)]">Choose a source file</span><input className="mt-3 block w-full text-sm" type="file" accept=".txt,.md,.markdown,.csv,.vtt,.srt,.pdf,.docx" onChange={event => void handleFile(event.target.files?.[0])} /></label>
      {sourceFile && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold"><span>{sourceFile.name} · {Math.round(sourceFile.size / 1024)} KB</span><EvidenceStatus label="Staged in memory" /></div>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy || !sourceFile} onClick={handleSourceCreate}>Store private source version</button><button type="button" className="min-h-10 rounded-xl border border-[var(--av-color-border-strong)] px-4 text-sm font-black" disabled={busy || !sourceReceipt} onClick={handleExtract}>Run AI extraction draft</button></div>
      {sourceReceipt && <div className="mt-5 rounded-2xl border border-emerald-300/50 bg-emerald-50/40 p-4 text-sm font-bold text-[var(--av-color-text)]">Committed source: {sourceReceipt.displayName} · {sourceReceipt.status}. Private storage paths remain server-only.</div>}
    </section>}

    {activeTab === 'review' && <section className={panelClass} aria-labelledby="ei-review-heading">
      <p className="av-eyebrow">Assess Candidate Review</p><h2 id="ei-review-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Review AI suggestions before Assess draft</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">AI suggestions are not scores, gates, approvals, or recommendations. Accept, reject, or edit each candidate with source locator and confidence visible.</p>
      {candidates.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[var(--av-color-border-strong)] p-8 text-center text-sm font-bold text-[var(--av-color-text-muted)]">No candidates are loaded. Upload a source and run the server-authorized extraction step.</div> : <><div className="mt-5 flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={busy || !candidates.some(candidate => candidate.status === 'suggested')} onClick={acceptAllCandidates}>Accept all suggested</button><EvidenceStatus label="Human review required" /></div><div className="mt-4 grid gap-4">{candidates.map(candidate => <article key={candidate.id} className="grid gap-4 rounded-2xl border border-[var(--av-color-border)] p-4 lg:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><EvidenceStatus label={candidate.field.replaceAll('_', ' ')} /><EvidenceStatus label={`${Math.round(candidate.confidence * 100)}% confidence`} /><EvidenceStatus label={candidate.status} /></div>{editingCandidateId === candidate.id ? <textarea className="mt-3 min-h-24 w-full rounded-xl border border-[var(--av-color-border-strong)] bg-[var(--av-color-bg)] p-3 text-sm font-bold text-[var(--av-color-text)]" value={editingCandidateValue} onChange={event => setEditingCandidateValue(event.target.value)} /> : <p className="mt-3 text-sm font-bold text-[var(--av-color-text)]">{candidate.value}</p>}<p className="mt-2 text-xs font-semibold text-[var(--av-color-text-muted)]">Source locator: {candidate.sourceLocator}</p></div><div className="flex items-center gap-2 lg:flex-col lg:items-stretch">{editingCandidateId === candidate.id ? <button type="button" className={buttonClass} disabled={busy || !editingCandidateValue.trim()} onClick={() => saveCandidateEdit(candidate.id)}>Save edit</button> : <button type="button" className="min-h-10 rounded-xl border border-[var(--av-color-border-strong)] px-4 text-xs font-black" disabled={busy || candidate.status === 'rejected'} onClick={() => { setEditingCandidateId(candidate.id); setEditingCandidateValue(candidate.value); }}>Edit</button>}<button type="button" className={buttonClass} disabled={busy || candidate.status === 'accepted'} onClick={() => reviewCandidate(candidate.id, 'accepted')}>Accept into draft</button><button type="button" className="min-h-10 rounded-xl border border-rose-300 px-4 text-xs font-black text-rose-700" disabled={busy || candidate.status === 'rejected'} onClick={() => reviewCandidate(candidate.id, 'rejected')}>Reject</button></div></article>)}</div></>}
      <p className="mt-5 text-xs font-bold text-[var(--av-color-text-muted)]">Fields covered: {EVIDENCE_CANDIDATE_FIELDS.join(' · ')}</p>
    </section>}

    {activeTab === 'modernization' && <section className={panelClass} aria-labelledby="ei-modernization-heading">
      <p className="av-eyebrow">Modernization &amp; Assemble Assessment</p><h2 id="ei-modernization-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">A separate, versioned deterministic disposition model</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">PR1G scoring and decision law remain untouched. This model consumes an exact approved application assessment and produces a reviewable primary disposition, alternative, blockers, conflicts, and eligibility for human approval.</p>
      <div className="mt-5 rounded-2xl border border-amber-300/60 bg-amber-50/40 p-4 text-sm font-bold text-[var(--av-color-text)]">Modernization factors are derived on the server from the exact approved PR1G application assessment, immutable dimensions, recommendation, metadata, and dependency ancestry. Browser-supplied factor bands are ignored.</div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label>{fieldLabel('Approved application ID', true)}<input className={inputClass} value={modernizationIds.applicationId} onChange={event => setModernizationIds(ids => ({ ...ids, applicationId: event.target.value }))} placeholder="UUID from approved PR1G application" /></label><label>{fieldLabel('Approved assessment version ID', true)}<input className={inputClass} value={modernizationIds.assessmentVersionId} onChange={event => setModernizationIds(ids => ({ ...ids, assessmentVersionId: event.target.value }))} placeholder="UUID from approved PR1G assessment" /></label></div>
      <button type="button" className={`${buttonClass} mt-5`} disabled={busy || !modernizationIds.applicationId || !modernizationIds.assessmentVersionId} onClick={evaluateModernization}>Evaluate deterministic disposition</button>
      {decisionId && <div className="mt-4 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">Decision recorded for Govern review: <code>{decisionId}</code>. Assemble eligibility is server-checked after approval.</div>}
    </section>}

    {activeTab === 'handoff' && <section className={panelClass} aria-labelledby="ei-handoff-heading">
      <p className="av-eyebrow">Studio Delivery Handoff</p><h2 id="ei-handoff-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Handoff the exact current approved Studio version</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">The server re-reads Studio authority and rejects stale, non-approved, cross-tenant, or mismatched hashes. Completed work is never silently overwritten.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3"><label>{fieldLabel('Studio document ID', true)}<input className={inputClass} value={studioHandoff.studioDocumentId} onChange={event => setStudioHandoff(form => ({ ...form, studioDocumentId: event.target.value }))} placeholder="UUID" /></label><label>{fieldLabel('Approved version', true)}<input className={inputClass} value={studioHandoff.studioVersion} onChange={event => setStudioHandoff(form => ({ ...form, studioVersion: event.target.value }))} placeholder="4" /></label><label>{fieldLabel('Content hash', true)}<input className={inputClass} value={studioHandoff.studioContentHash} onChange={event => setStudioHandoff(form => ({ ...form, studioContentHash: event.target.value }))} placeholder="64-char SHA-256" /></label></div>
      <button type="button" className={`${buttonClass} mt-5`} disabled={busy || !studioHandoff.studioDocumentId || !studioHandoff.studioVersion || !studioHandoff.studioContentHash} onClick={createHandoff}>Create governed work-package draft</button>
      {handoffResult && <div className="mt-4 rounded-2xl bg-[var(--av-color-bg-subtle)] p-4 text-sm font-bold">Work package: {handoffResult.workPackageId} · version: {handoffResult.packageVersionId}. Review and approval are still required.</div>}
    </section>}

    {activeTab === 'delivery' && <section className={panelClass} aria-labelledby="ei-delivery-heading"><p className="av-eyebrow">Avala Delivery</p><h2 id="ei-delivery-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Template-first work package</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">Epic → Story → Task hierarchy, milestones, dependencies, risks, acceptance criteria, NFRs, owners, readiness, and immutable source lineage are reviewed in Delivery before any Monitor baseline exists.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[var(--av-color-bg-subtle)] p-4"><p className="text-2xl font-black">{handoffResult ? '1' : '0'}</p><p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Draft packages</p></div><div className="rounded-2xl bg-[var(--av-color-bg-subtle)] p-4"><p className="text-2xl font-black">{handoffResult ? 'Lineage linked' : 'Waiting'}</p><p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">Studio source</p></div><div className="rounded-2xl bg-[var(--av-color-bg-subtle)] p-4"><p className="text-2xl font-black">No</p><p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--av-color-text-muted)]">External publish</p></div></div><p className="mt-5 text-xs font-bold text-[var(--av-color-text-muted)]">Approval is a distinct human action with create/review/approve separation. AI-generated work items remain drafts.</p></section>}

    {activeTab === 'monitor' && <section className={panelClass} aria-labelledby="ei-monitor-heading"><p className="av-eyebrow">Avala Monitor</p><h2 id="ei-monitor-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Create a read-only project baseline</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">Monitor receives only approved Delivery items, milestones, dependencies, blockers, risks, readiness, value signals, evidence, and exact source version. No live telemetry, Jira, Azure DevOps, bots, or agents are connected.</p><label className="mt-5 block">{fieldLabel('Approved work-package version ID', true)}<input className={inputClass} value={monitorForm.packageVersionId} onChange={event => setMonitorForm(form => ({ ...form, packageVersionId: event.target.value }))} placeholder="UUID" /></label><label className="mt-4 block">{fieldLabel('Approved item IDs (comma separated)')}<input className={inputClass} value={monitorForm.approvedItemIds} onChange={event => setMonitorForm(form => ({ ...form, approvedItemIds: event.target.value }))} placeholder="item-uuid-1, item-uuid-2" /></label><button type="button" className={`${buttonClass} mt-5`} disabled={busy || !monitorForm.packageVersionId} onClick={createBaseline}>Stage Monitor baseline</button></section>}

    {activeTab === 'assemble' && <section className={panelClass} aria-labelledby="ei-assemble-heading"><p className="av-eyebrow">Assemble Phase 1</p><h2 id="ei-assemble-heading" className="mt-2 text-xl font-black text-[var(--av-color-text)]">Blueprint workspace</h2><p className="mt-2 text-sm font-semibold leading-6 text-[var(--av-color-text-muted)]">Blueprints are structured JSON plus a readable document. The catalog covers {ASSEMBLE_COMPONENT_CATALOG.slice(0, -1).join(', ')}, and Agent Tools remain disabled by default. The workflow is draft → edit → review → approval → publish; this surface cannot execute any of those side effects.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label>{fieldLabel('Approved modernization decision ID', true)}<input className={inputClass} value={decisionId} onChange={event => setDecisionId(event.target.value)} placeholder="UUID" /></label><label>{fieldLabel('Blueprint name', true)}<input className={inputClass} value={blueprintName} onChange={event => setBlueprintName(event.target.value)} placeholder="Claims intake blueprint" /></label></div><button type="button" className={`${buttonClass} mt-5`} disabled={busy || !decisionId || !blueprintName} onClick={createBlueprint}>Create draft blueprint</button>{blueprintJson && <pre className="mt-5 max-h-[32rem] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-5 text-slate-100" aria-label="Structured Assemble blueprint">{blueprintJson}</pre>}</section>}
    {deliveryApprovalPanel}
  </div>;
}
