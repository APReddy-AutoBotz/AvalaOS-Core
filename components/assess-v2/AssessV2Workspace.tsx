import React, { useMemo, useState } from 'react';
import type { Assessment } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import {
  cloneAssessV1ToV2,
  createAssessV2Case,
  finalizeAssessV2Case,
  readAssessV2Case,
  saveAssessV2Draft,
  type AssessV2DraftInput,
  type AssessV2ReadProjection,
} from '../../services/assessV2Client';
import { buildDecisionPackRenderModel } from '../../services/assessV2/decisionVersion';

interface Props {
  processId: string;
  processName: string;
  processDescription: string;
  v1Assessment: Assessment | null;
}

const emptyDraft = (caseId: string, name: string, description: string): AssessV2DraftInput => ({
  caseId,
  name,
  description,
  primitives: [{ id: crypto.randomUUID(), type: 'Investigate', name: 'Investigate exception', description: 'Human-led investigation of the exception path', inputs: [], outputs: [], rules: [], exceptionIds: [], evidenceIds: [], facts: {} }],
  edges: [],
  decisionPoints: [],
  exceptionPaths: [],
  applicationAssets: [],
  interactions: [],
  evidenceLinks: [],
  candidateEvaluations: [],
  gateResults: [],
  controlRequirements: [],
  modernizationDispositions: [],
});

const capabilityCopy: Record<string, string> = {
  'assess.v2.create': 'Create a V2 case',
  'assess.v2.clone': 'Clone V1 suggestions',
  'assess.v2.write': 'Save authoring changes',
  'assess.v2.finalize': 'Finalize the decision',
};

export default function AssessV2Workspace({ processId, processName, processDescription, v1Assessment }: Props) {
  const { tenantContext, sessionState, handleEnterpriseBoundary } = useOrganizationContext();
  const [draft, setDraft] = useState<AssessV2DraftInput | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [result, setResult] = useState<AssessV2ReadProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const capabilities = tenantContext?.capabilities ?? [];
  const can = (capability: string) => sessionState === 'ready' && capabilities.includes(capability);
  const isReadOnly = sessionState !== 'ready' || result?.case.status === 'reviewer-ready';
  const missing = useMemo(() => Object.keys(capabilityCopy).filter(item => !capabilities.includes(item)), [capabilities]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await action(); }
    catch (error) {
      handleEnterpriseBoundary(error);
      setMessage(error instanceof Error ? error.message : 'The Assess V2 action could not be completed.');
    } finally { setBusy(false); }
  };

  const start = (clone: boolean) => run(async () => {
    if (!tenantContext) throw new Error('A server-issued workspace context is required.');
    const caseId = crypto.randomUUID();
    const nextDraft = emptyDraft(caseId, processName, processDescription || 'Decision-intelligence assessment');
    const resource = clone && v1Assessment
      ? await cloneAssessV1ToV2(tenantContext, {
          caseId,
          sourceAssessmentId: v1Assessment.id,
          name: processName,
          description: processDescription || 'Cloned from V1 as unverified source facts.',
        })
      : await createAssessV2Case(tenantContext, { caseId, processId, name: processName, description: processDescription || 'Decision-intelligence assessment' });
    setDraft(nextDraft);
    setVersion(resource.version);
    setMessage(clone ? 'V1 values were imported as suggestions only. Validate them before finalization.' : 'V2 case created.');
  });

  const save = () => run(async () => {
    if (!tenantContext || !draft || version === null) throw new Error('No editable V2 case is open.');
    const resource = await saveAssessV2Draft(tenantContext, draft, version);
    setVersion(resource.version);
    setMessage('Draft saved as a new immutable authoring version.');
  });

  const finalize = () => run(async () => {
    if (!tenantContext || !draft || version === null) throw new Error('No V2 case is ready to finalize.');
    const resource = await finalizeAssessV2Case(tenantContext, draft.caseId, version);
    const projection = await readAssessV2Case(resource.caseId);
    if (!projection?.decision) throw new Error('The server committed finalization but no readable Decision Pack is available.');
    setVersion(resource.version);
    setResult(projection);
    setMessage('Reviewer-ready Decision Pack finalized. It is read-only.');
  });

  const renderModel = result?.decision ? buildDecisionPackRenderModel(result.decision) : null;

  return (
    <section className="premium-surface rounded-3xl p-6" data-testid="assess-v2-workspace" aria-labelledby="assess-v2-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a6a00] dark:text-[#ffcf45]">Decision intelligence foundation</p>
          <h2 id="assess-v2-title" className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Avala Assess V2</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Compose the least-complex operating model across process primitives. V2 is additive; it never rewrites the V1 score or recommendation.</p>
        </div>
        {!draft && (
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !can('assess.v2.create')} onClick={() => start(false)} className="rounded-xl bg-[#002C4B] px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Create V2 case</button>
            <button disabled={busy || !v1Assessment || !can('assess.v2.create') || !can('assess.v2.clone')} onClick={() => start(true)} className="rounded-xl px-4 py-2.5 text-sm font-black btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Clone V1 as suggestions</button>
          </div>
        )}
      </div>

      {v1Assessment && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><strong>Legacy V1 Â· assess-core-2026-05.</strong> Final recommendation: {v1Assessment.scores?.recommendation?.category || 'not finalized'}. Any cloned values are unverified suggestions, not evidence.</div>}
      {missing.length > 0 && <p className="mt-4 text-xs font-semibold text-slate-500" role="status">Unavailable actions: {missing.map(item => capabilityCopy[item]).join(', ')}. Server capabilities control every mutation.</p>}
      {message && <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200" role="status">{message}</p>}

      {draft && !result && (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-800 dark:text-slate-100">Case name<input aria-label="V2 case name" disabled={isReadOnly} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-sm font-black text-slate-800 dark:text-slate-100">Description<textarea aria-label="V2 case description" disabled={isReadOnly} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-950" /></label>
          </div>
          <div>
            <h3 className="text-lg font-black text-[#002C4B] dark:text-white">Process primitives</h3>
            {draft.primitives.map((primitive: any, index) => <label key={primitive.id} className="mt-3 block text-sm font-black text-slate-700 dark:text-slate-200">Primitive {index + 1}<input aria-label={`Primitive ${index + 1} name`} value={primitive.name} onChange={event => setDraft({ ...draft, primitives: draft.primitives.map((item: any, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-950" /></label>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || isReadOnly || !can('assess.v2.write')} onClick={save} className="rounded-xl bg-[#002C4B] px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Save V2 draft</button>
            <button disabled={busy || isReadOnly || !can('assess.v2.finalize')} onClick={finalize} className="rounded-xl bg-[#ffbc03] px-4 py-2.5 text-sm font-black text-[#002C4B] disabled:cursor-not-allowed disabled:opacity-50">Finalize reviewer-ready Decision Pack</button>
          </div>
        </div>
      )}

      {renderModel && (
        <div className="mt-6 space-y-5" data-testid="assess-v2-decision-pack">
          <div className="rounded-2xl bg-[#002C4B] p-5 text-white"><p className="text-xs font-black uppercase tracking-wider text-[#ffcf45]">Read-only Â· reviewer-ready</p><h3 className="mt-2 text-2xl font-black">{renderModel.title}</h3><p className="mt-2 text-sm font-semibold text-white/75">{renderModel.subtitle}</p><p className="mt-4 text-sm font-black">{renderModel.processReadiness} Â· {renderModel.confidence}</p></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><h4 className="font-black text-slate-900 dark:text-white">Composed operating model</h4><ul className="mt-3 space-y-2">{renderModel.composition.map(item => <li key={item.primitiveId} className="rounded-xl bg-slate-50 p-3 text-sm font-semibold dark:bg-slate-900"><strong>{item.primitiveId}</strong>: {item.components.join(' + ')}</li>)}</ul></div>
            <div><h4 className="font-black text-slate-900 dark:text-white">Required controls</h4><ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-semibold">{renderModel.controlsAndApprovals.map(item => <li key={item}>{item}</li>)}</ul></div>
          </div>
          <p className="text-xs font-semibold text-slate-500">V2 approval, Govern resolution, Studio generation, export, and external sharing are not available in this foundation boundary.</p>
        </div>
      )}
    </section>
  );
}
