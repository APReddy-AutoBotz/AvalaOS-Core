import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import {
  attestAssessV2Evidence,
  describeReviewError,
  handoffAssessV2Studio,
  readAssessV2ReviewQueue,
  readAssessV2ReviewWorkspace,
  resolveAssessV2Govern,
  resolveAssessV2Review,
  startAssessV2Revision,
  type AssessV2ReviewProjection,
  type AssessV2ReviewQueueItem,
} from '../../services/assessV2ReviewClient';
import { ASSESS_V2_REVIEW_CAPABILITIES, type EvidenceAttestationOutcome, type ReviewResolution } from '../../services/assessV2ReviewClientContract';

interface Props { initialCaseId?: string }
type LoadState = 'loading' | 'ready' | 'empty' | 'failed';
const panel = 'rounded-2xl border border-slate-200 p-3 sm:p-4 dark:border-slate-700';
const input = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-950';
const statusCopy: Record<AssessV2ReviewProjection['status'], string> = {
  reviewer_ready: 'Reviewer-ready', in_review: 'In review', approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Rejected',
};
const outcomeCopy: Record<string, string> = { submitted: 'Evidence submitted', accepted: 'Evidence accepted', rejected: 'Evidence rejected', 'needs-more-information': 'Evidence needs information' };

export default function AssessV2ReviewWorkspace({ initialCaseId }: Props) {
  const { tenantContext, sessionState, assessV2OperationalState, handleAssessV2Boundary } = useOrganizationContext();
  const [queue, setQueue] = useState<AssessV2ReviewQueueItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(initialCaseId ?? '');
  const [review, setReview] = useState<AssessV2ReviewProjection | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading assigned reviews.');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [reviewRationale, setReviewRationale] = useState('');
  const [conditions, setConditions] = useState('');
  const [governRationale, setGovernRationale] = useState('');
  const capabilities = tenantContext?.capabilities ?? [];
  const hasReviewAccess = capabilities.some(capability => Object.values(ASSESS_V2_REVIEW_CAPABILITIES).includes(capability as never));
  const isReadOnly = sessionState !== 'ready' || assessV2OperationalState === 'read_only';
  const can = (capability: string) => !isReadOnly && capabilities.includes(capability);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('offline', refresh); };
  }, []);

  const load = useCallback(async (caseId?: string) => {
    if (!tenantContext) { setLoadState('empty'); setMessage('A server-issued workspace context is required.'); return; }
    if (!hasReviewAccess) { setLoadState('empty'); setMessage('No governed review capability is assigned.'); return; }
    setLoadState('loading'); setMessage('Loading assigned reviews.');
    try {
      const assigned = await readAssessV2ReviewQueue(tenantContext);
      setQueue(assigned);
      const target = caseId || selectedCaseId || initialCaseId || assigned[0]?.caseId;
      if (!target) { setReview(null); setLoadState('empty'); setMessage('No assigned reviews.'); return; }
      const current = await readAssessV2ReviewWorkspace(tenantContext, target);
      setSelectedCaseId(target); setReview(current); setLoadState('ready'); setMessage('Current committed review loaded.');
    } catch (error) {
      setReview(null); setLoadState('failed'); setMessage(describeReviewError(error, online));
    }
  }, [hasReviewAccess, initialCaseId, online, selectedCaseId, tenantContext]);

  useEffect(() => { void load(initialCaseId); }, [initialCaseId, tenantContext]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = async (action: () => Promise<AssessV2ReviewProjection>, success: string) => {
    if (!online) { setMessage('Offline. Review changes were not submitted.'); return; }
    setBusy(true); setMessage('Saving. Success will appear only after the server commits.');
    try { const committed = await action(); setReview(committed); setMessage(success); }
    catch (error) { handleAssessV2Boundary(error); setMessage(describeReviewError(error, online)); }
    finally { setBusy(false); }
  };

  const attest = (evidenceId: string, claimIds: string[], outcome: EvidenceAttestationOutcome) => {
    if (!tenantContext || !review) return;
    const rationale = rationales[evidenceId]?.trim() ?? '';
    if (!rationale) { setMessage('Reviewer rationale is required for evidence attestation.'); return; }
    void commit(() => attestAssessV2Evidence(tenantContext, review, evidenceId, claimIds, outcome, rationale), `Evidence attestation committed: ${outcomeCopy[outcome]}.`);
  };
  const resolveReview = (resolution: ReviewResolution) => {
    if (!tenantContext || !review || !reviewRationale.trim()) { setMessage('Reviewer rationale is required for review resolution.'); return; }
    void commit(() => resolveAssessV2Review(tenantContext, review, resolution, reviewRationale.trim(), conditions.split('\n').map(item => item.trim()).filter(Boolean)), `Review resolution committed: ${statusCopy[resolution]}.`);
  };
  const evidenceCoverage = useMemo(() => review ? review.requiredClaimIds.map(claimId => ({ claimId, accepted: review.evidence.some(item => item.status === 'accepted' && item.claimIds.includes(claimId)) })) : [], [review]);

  return <section className="mt-6 rounded-3xl border-2 border-[#ffbc03]/50 p-3 sm:p-5" aria-labelledby="v2-review-title" data-testid="assess-v2-review-workspace">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a6a00]">Governed enterprise review</p><h3 id="v2-review-title" className="mt-1 text-xl font-black">Review, approval, Govern and Studio handoff</h3><p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">The server authorizes every action. This browser never supplies reviewer identity, approval authority, Govern categories, confidence, or the Studio package.</p></div><button type="button" disabled={busy || !tenantContext} onClick={() => void load()} className="btn-ghost rounded-xl px-3 py-2 text-sm font-black disabled:opacity-50">Reload committed state</button></div>

    {!online && <p role="alert" className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-950">Offline. Committed information may be viewed, but mutations are blocked.</p>}
    {isReadOnly && <p role="status" className="mt-4 rounded-xl border border-blue-300 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Read-only mode. Reads and exact committed replays remain available; new review mutations are blocked.</p>}
    <p className="mt-4 text-sm font-semibold" role="status" aria-live="polite">{message}</p>
    {loadState === 'loading' && <div className="mt-4 animate-pulse rounded-xl bg-slate-100 p-6" aria-label="Loading review workspace" />}
    {loadState === 'empty' && <div className={`${panel} mt-4`}><h4 className="font-black">Assigned-review queue</h4><p className="mt-2 text-sm text-slate-500">No assigned reviews.</p></div>}
    {loadState === 'failed' && <div className={`${panel} mt-4`} role="alert"><h4 className="font-black">Review unavailable</h4><p className="mt-2 text-sm">Persistence failed, or the review may be stale, revoked, conflicted, offline, or unavailable. Reload to request the current non-disclosing server projection.</p></div>}

    {queue.length > 0 && <nav className={`${panel} mt-4`} aria-label="Assigned-review queue"><h4 className="font-black">Assigned-review queue</h4><ul className="mt-2 grid gap-2 sm:grid-cols-2">{queue.map(item => <li key={item.assignmentId}><button type="button" aria-current={item.caseId === selectedCaseId ? 'page' : undefined} onClick={() => void load(item.caseId)} className="w-full rounded-xl border border-slate-200 p-3 text-left disabled:opacity-50" disabled={busy}><span className="block font-black">{item.caseName}</span><span className="text-xs">{statusCopy[item.status]}{item.dueAt ? ` · due ${item.dueAt}` : ''}</span></button></li>)}</ul></nav>}

    {review && loadState === 'ready' && <div className="mt-4 space-y-4">
      <header className="rounded-2xl bg-[#002C4B] p-4 text-white"><div className="flex flex-wrap gap-2 text-xs font-black uppercase"><span>{statusCopy[review.status]}</span><span>·</span><span>{review.confidence}</span><span>·</span><span>Review v{review.reviewVersion}</span></div><h4 className="mt-2 text-xl font-black">{review.caseName}</h4><p className="mt-1 text-sm text-white/75">Case v{review.caseVersion} · Decision {review.decisionVersion} · Author {review.authorLabel} · Reviewer {review.reviewerLabel}</p></header>

      <section className={panel} aria-labelledby="evidence-review-title"><h4 id="evidence-review-title" className="font-black">Independent evidence attestation</h4><p className="mt-1 text-xs text-slate-500">Evidence submission and independent attestation are separate immutable acts. Exact claim ancestry is shown below.</p>{review.evidence.length === 0 ? <p className="mt-3 text-sm text-slate-500">No submitted evidence.</p> : <div className="mt-3 space-y-3">{review.evidence.map(item => <article key={item.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-black">{outcomeCopy[item.status]}</h5><span className="text-xs">Captured {item.capturedAt}{item.expiresAt ? ` · expires ${item.expiresAt}` : ''}</span></div><p className="mt-2 break-all text-xs font-semibold">Evidence {item.id}</p><p className="mt-1 text-sm">Exact claims: <strong>{item.claimIds.join(', ')}</strong></p><p className="mt-1 text-xs">Source: {item.sourceType} · Submitter: {item.submitterLabel}</p>{item.rationale && <p className="mt-2 text-sm">Committed rationale: {item.rationale}</p>}{item.status === 'submitted' && <><label className="mt-3 block text-xs font-black">Reviewer rationale<textarea value={rationales[item.id] ?? ''} onChange={event => setRationales(current => ({ ...current, [item.id]: event.target.value }))} rows={2} className={input} /></label><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.attest)} onClick={() => attest(item.id, item.claimIds, 'accepted')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Accept evidence</button><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.attest)} onClick={() => attest(item.id, item.claimIds, 'needs-more-information')} className="btn-ghost rounded-lg px-3 py-2 text-xs font-black disabled:opacity-50">Request more information</button><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.attest)} onClick={() => attest(item.id, item.claimIds, 'rejected')} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Reject evidence</button></div></>}</article>)}</div>}</section>

      <section className={panel}><h4 className="font-black">Evidence coverage and reviewed confidence</h4><p className="mt-2 text-sm font-black">{review.confidence}</p><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{evidenceCoverage.map(item => <li key={item.claimId}>{item.accepted ? 'Accepted' : 'Unresolved'} · {item.claimId}</li>)}</ul></section>

      <section className={panel}><h4 className="font-black">Review resolution</h4><label className="mt-2 block text-xs font-black">Review rationale<textarea rows={3} value={reviewRationale} onChange={event => setReviewRationale(event.target.value)} className={input}/></label><label className="mt-2 block text-xs font-black">Approval conditions, one per line<textarea rows={2} value={conditions} onChange={event => setConditions(event.target.value)} className={input}/></label><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.approve)} onClick={() => resolveReview('approved')} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50">Approve reviewed decision</button><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.review)} onClick={() => resolveReview('changes_requested')} className="btn-ghost rounded-lg px-3 py-2 text-sm font-black disabled:opacity-50">Request changes</button><button disabled={busy || !can(ASSESS_V2_REVIEW_CAPABILITIES.review)} onClick={() => resolveReview('rejected')} className="rounded-lg bg-red-700 px-3 py-2 text-sm font-black text-white disabled:opacity-50">Reject decision</button></div>{review.status === 'changes_requested' && <button disabled={busy || isReadOnly} onClick={() => tenantContext && void commit(() => startAssessV2Revision(tenantContext, review, reviewRationale || 'Start requested revision'), 'New immutable draft revision committed.')} className="mt-3 btn-ghost rounded-lg px-3 py-2 text-sm font-black disabled:opacity-50">Start new draft revision</button>}</section>

      <section className={panel}><h4 className="font-black">Avala Govern action and control review</h4><p className="mt-1 text-xs text-slate-500">Categories are server-derived. Prohibitions and approval boundaries cannot be relaxed here.</p><div className="mt-3 grid gap-3 md:grid-cols-2"><div><h5 className="font-black">Action boundaries</h5><ul className="mt-2 space-y-1 text-sm">{review.actions.map(action => <li key={action.id}><strong>{action.category}</strong> · {action.label}</li>)}</ul></div><div><h5 className="font-black">Required controls</h5><ul className="mt-2 space-y-1 text-sm">{review.controls.map(control => <li key={control.id}>{control.resolved ? 'Resolved' : 'Unresolved'} · {control.label}</li>)}</ul></div></div><label className="mt-3 block text-xs font-black">Govern rationale<textarea rows={2} value={governRationale} onChange={event => setGovernRationale(event.target.value)} className={input}/></label><button disabled={busy || review.status !== 'approved' || !governRationale.trim() || !can(ASSESS_V2_REVIEW_CAPABILITIES.governResolve)} onClick={() => tenantContext && void commit(() => resolveAssessV2Govern(tenantContext, review, governRationale.trim()), 'Govern resolution committed.' )} className="mt-3 rounded-lg bg-[#002C4B] px-3 py-2 text-sm font-black text-white disabled:opacity-50">Resolve Govern controls</button><p className="mt-2 text-sm font-black">Govern: {review.governStatus === 'resolved' ? 'Govern resolved' : 'Pending'}</p></section>

      <section className={panel}><h4 className="font-black">Durable Avala Studio handoff</h4><p className="mt-1 text-sm">The server composes and atomically persists the governed source package. Browser-supplied handoff content is never accepted.</p><button disabled={busy || review.status !== 'approved' || review.governStatus !== 'resolved' || !can(ASSESS_V2_REVIEW_CAPABILITIES.studioHandoff)} onClick={() => tenantContext && void commit(() => handoffAssessV2Studio(tenantContext, review), 'Studio handoff committed.' )} className="mt-3 rounded-lg bg-[#ffbc03] px-3 py-2 text-sm font-black text-[#002C4B] disabled:opacity-50">Create durable Studio handoff</button><p className="mt-2 text-sm font-black">{review.handoffStatus === 'committed' ? `Handed off to Studio${review.handedOffAt ? ` · ${review.handedOffAt}` : ''}` : review.handoffStatus === 'ready' ? 'Ready for Studio handoff' : 'Studio handoff not ready'}</p></section>
    </div>}
  </section>;
}
