import React, { useEffect, useMemo, useState } from 'react';
import type { Assessment } from '../../types';
import { useOrganizationContext } from '../auth/OrganizationProvider';
import {
  cloneAssessV1ToV2,
  createAssessV2Case,
  draftFromAssessmentCase,
  finalizeAssessV2Case,
  findAssessV2CaseForProcess,
  readAssessV2Case,
  saveAssessV2Draft,
  type AssessV2DraftInput,
  type AssessV2ReadProjection,
} from '../../services/assessV2Client';
import { ASSESS_V2_CAPABILITIES } from '../../services/assessV2/capabilities';
import { buildDecisionPackRenderModel } from '../../services/assessV2/decisionVersion';
import { FIELD_REGISTRY } from '../../services/assessV2/registry';
import { createUnknownAgentNecessityFacts, type CaseFact, type PrimitiveType } from '../../services/assessV2/types';
import { ASSESS_V1_SCORE_VERSION } from '../../services/assessV1Compatibility';
import AssessV2ReviewWorkspace from './AssessV2ReviewWorkspace';
import AssessV2EconomicsWorkspace from './AssessV2EconomicsWorkspace';
import AssessApplicationPortfolioWorkspace from './AssessApplicationPortfolioWorkspace';

interface Props { processId: string; processName: string; processDescription: string; v1Assessment: Assessment | null }
type DiscoveryState = 'waiting' | 'loading' | 'ready' | 'failed';

const primitiveTypes: PrimitiveType[] = ['Capture', 'Extract', 'Classify', 'Validate', 'Calculate', 'Reconcile', 'Retrieve', 'Investigate', 'Decide', 'Approve', 'Route', 'Execute', 'Communicate', 'Monitor', 'Audit'];
const agentKeys = ['irreducibleAmbiguity', 'adaptiveNextStep', 'toolOrPathSelection', 'incrementalValue', 'controllable'] as const;
const dispositions = ['Monitor / Do Nothing', 'Simplify', 'Redesign', 'Human-Led', 'Existing Product Configuration', 'Custom Application'] as const;
const primitiveFactKeys = ['primitive.rulesStable', 'primitive.workflowPatternKnown', 'primitive.documentQualityRepresentative', 'primitive.exceptionSamplesAvailable', 'primitive.ambiguityCharacterized', 'primitive.controlRequirementsKnown', 'primitive.interfaceDependencyKnown'] as const;
const unknownInteractionFacts = () => ({
  interfaceAvailable: null, operationCovered: null, apiDocumented: null, machineIdentity: null, leastPrivilege: null,
  dataQuality: null, dataClassified: null, auditable: null, idempotent: null, compensatable: null, rollback: null,
  testEnvironment: null, monitored: null, uiStable: null, eventSemantics: null, errorContract: null, capacityKnown: null,
  accountableOwner: null, highImpact: false, financialAction: false, untrustedContentWithTools: false,
});
type InteractionFactKey = keyof ReturnType<typeof unknownInteractionFacts>;
const interactionFactKeys = Object.keys(unknownInteractionFacts()) as InteractionFactKey[];
const contextualInteractionFacts = new Set<InteractionFactKey>(['highImpact', 'financialAction', 'untrustedContentWithTools']);
const V1_CLONE_ELIGIBLE_STATUSES = new Set<Assessment['status']>(['Approved', 'Handed Off to Docs']);
const V1_CLONE_UNAVAILABLE_MESSAGE = `V1 cloning is unavailable. Clone requires an Approved or Handed Off to Docs assessment finalized with ${ASSESS_V1_SCORE_VERSION}.`;
const isEligibleV1CloneSource = (assessment: Assessment | null): assessment is Assessment => Boolean(
  assessment && V1_CLONE_ELIGIBLE_STATUSES.has(assessment.status) &&
    (assessment.scores?.scoreVersion ?? assessment.scoreVersion) === ASSESS_V1_SCORE_VERSION,
);
const emptyDraft = (caseId: string, name: string, description: string): AssessV2DraftInput => ({
  caseId, name, description, primitives: [], edges: [], decisionPoints: [], exceptionPaths: [], applicationAssets: [],
  interactions: [], evidenceLinks: [], agentNecessity: createUnknownAgentNecessityFacts(), candidateEvaluations: [],
  gateResults: [], controlRequirements: [], modernizationDispositions: [],
});
const toAuthorDraft = (draft: AssessV2DraftInput): AssessV2DraftInput => ({
  ...draft,
  evidenceLinks: draft.evidenceLinks.map(item => {
    const { reviewerIds: _reviewerIds, contradictory: _contradictory, ...submission } = item as typeof item & { reviewerIds?: unknown; contradictory?: unknown };
    return submission;
  }),
});
const authorDraftFingerprint = (draft: AssessV2DraftInput): string => JSON.stringify(toAuthorDraft(draft));

const scaffold = (draft: AssessV2DraftInput): AssessV2DraftInput => {
  const first = crypto.randomUUID(); const second = crypto.randomUUID(); const asset = crypto.randomUUID(); const evidence = crypto.randomUUID();
  return { ...draft,
    primitives: [
      { id: first, type: 'Capture', name: 'Capture request', description: 'Capture the request and required source facts.', inputs: ['request'], outputs: ['case'], volumeShare: null, manualEffort: null, rules: [], exceptionIds: [], evidenceIds: [evidence], facts: {}, businessDisposition: 'Simplify' },
      { id: second, type: 'Decide', name: 'Review exception', description: 'A human reviews exceptions and records the outcome.', inputs: ['case'], outputs: ['decision'], volumeShare: null, manualEffort: null, rules: ['Evidence must be reviewed'], exceptionIds: [], evidenceIds: [evidence], facts: {}, businessDisposition: 'Human-Led' },
    ],
    edges: [{ id: crypto.randomUUID(), fromPrimitiveId: first, toPrimitiveId: second, condition: 'Request captured' }],
    decisionPoints: [{ id: crypto.randomUUID(), primitiveId: second, name: 'Approve outcome', ruleDescription: 'Approve only when required evidence is present.', outcomeLabels: ['Approve', 'Escalate'], evidenceIds: [evidence] }],
    exceptionPaths: [{ id: crypto.randomUUID(), fromPrimitiveId: first, name: 'Incomplete request', trigger: 'Required source facts are absent.', resolutionPrimitiveIds: [second], evidenceIds: [evidence] }],
    applicationAssets: [{ id: asset, name: 'System of record', strategicLifespan: 'unknown', technicalHealth: 'unknown', businessCriticality: 'high', ownershipModel: 'unknown', vendorRoadmap: 'unknown', operatingStability: 'unknown', accountableOwner: null, evidenceIds: [evidence] }],
    interactions: [{ id: crypto.randomUUID(), assetId: asset, primitiveId: first, operationName: 'Read request', mode: 'read', dataClassification: 'Unknown', facts: unknownInteractionFacts(), evidenceIds: [evidence] }],
    evidenceLinks: [...draft.evidenceLinks, { id: evidence, claimIds: ['primitive.businessDisposition', 'interaction.interfaceAvailable'], sourceType: 'document', status: 'submitted', validated: false, owner: 'Assessment owner', capturedAt: new Date().toISOString() }],
  };
};

const capabilityCopy: Record<string, string> = {
  [ASSESS_V2_CAPABILITIES.read]: 'Read a V2 case', [ASSESS_V2_CAPABILITIES.create]: 'Create a V2 case',
  [ASSESS_V2_CAPABILITIES.clone]: 'Clone V1 suggestions', [ASSESS_V2_CAPABILITIES.draftWrite]: 'Save authoring changes',
  [ASSESS_V2_CAPABILITIES.finalize]: 'Finalize the decision',
};
const sectionClass = 'rounded-2xl border border-slate-200 p-2 sm:p-4 dark:border-slate-700';
const inputClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold dark:border-slate-700 dark:bg-slate-950';
const list = (items: string[]) => items.length ? <ul className="mt-2 list-disc space-y-1 pl-2 text-sm font-semibold sm:pl-5">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">None recorded.</p>;

export default function AssessV2Workspace({ processId, processName, processDescription, v1Assessment }: Props) {
  const {
    tenantContext,
    sessionState,
    assessV2OperationalState,
    assessV2OperationalMessage,
    handleAssessV2Boundary,
  } = useOrganizationContext();
  const [draft, setDraft] = useState<AssessV2DraftInput | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [result, setResult] = useState<AssessV2ReadProjection | null>(null);
  const [importedFacts, setImportedFacts] = useState<AssessV2ReadProjection['case']['importedFacts']>([]);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>('waiting');
  const capabilities = tenantContext?.capabilities ?? [];
  const canRead = Boolean(tenantContext) && ['ready', 'read_only'].includes(sessionState) && capabilities.includes(ASSESS_V2_CAPABILITIES.read);
  const can = (capability: string) => sessionState === 'ready' && assessV2OperationalState === 'ready' && capabilities.includes(capability);
  const isReadOnly = sessionState !== 'ready' || assessV2OperationalState === 'read_only' || result?.case.status === 'reviewer-ready';
  const missing = useMemo(() => Object.keys(capabilityCopy).filter(item => !capabilities.includes(item)), [capabilities]);
  const claimOptions = useMemo(() => [...new Set([...FIELD_REGISTRY.map(field => field.fieldId), ...importedFacts.map(fact => fact.fieldId)])], [importedFacts]);
  const v1CloneEligible = isEligibleV1CloneSource(v1Assessment);
  const structuralGaps = useMemo(() => draft ? [
    draft.primitives.length < 2 && 'at least two process primitives', !draft.edges.length && 'a process edge',
    !draft.decisionPoints.length && 'a decision point', !draft.exceptionPaths.length && 'an exception path',
    !draft.applicationAssets.length && 'an application asset', !draft.interactions.length && 'an application interaction',
    !draft.evidenceLinks.length && 'linked evidence',
    draft.primitives.some(item => !item.name.trim() || !item.description.trim()) && 'a meaningful name and description for every primitive',
    draft.interactions.some(item => !draft.primitives.some(primitive => primitive.id === item.primitiveId) || !draft.applicationAssets.some(asset => asset.id === item.assetId)) && 'valid primitive and application references for every interaction',
    draft.evidenceLinks.some(item => !item.claimIds.length) && 'an exact claim for every evidence item',
    !draft.primitives.some(item => (Object.values(item.facts) as CaseFact[]).some(fact => fact.value !== null && fact.status !== 'unknown' && fact.source !== 'template')) && 'at least one known process fact',
    !draft.applicationAssets.some(item => Boolean(item.accountableOwner?.trim()) && [item.strategicLifespan, item.technicalHealth, item.businessCriticality, item.ownershipModel, item.vendorRoadmap, item.operatingStability].some(value => value !== 'unknown')) && 'application lifecycle and accountable owner facts',
  ].filter(Boolean) as string[] : [], [draft]);
  const hasUnsavedChanges = draft !== null && savedDraftFingerprint !== authorDraftFingerprint(draft);

  useEffect(() => {
    let cancelled = false;
    setDraft(null); setVersion(null); setResult(null); setImportedFacts([]); setSavedDraftFingerprint(null); setMessage(null);
    if (!['ready', 'read_only'].includes(sessionState) || !tenantContext) {
      setDiscoveryState('waiting');
      return () => { cancelled = true; };
    }
    if (!tenantContext.capabilities.includes(ASSESS_V2_CAPABILITIES.read)) {
      setDiscoveryState('ready');
      return () => { cancelled = true; };
    }
    setDiscoveryState('loading');
    void (async () => {
      try {
        const caseId = await findAssessV2CaseForProcess(tenantContext, processId);
        if (cancelled) return;
        if (!caseId) { setDiscoveryState('ready'); return; }
        const projection = await readAssessV2Case(caseId);
        if (cancelled) return;
        if (!projection) throw new Error('The existing V2 case is not available.');
        setVersion(projection.case.version);
        setImportedFacts(projection.case.importedFacts ?? []);
        if (projection.decision) {
          setResult(projection); setDraft(null);
          setMessage('Existing reviewer-ready Decision Pack reopened in read-only mode.');
        } else {
          const resumedDraft = draftFromAssessmentCase(projection.case, projection.name, projection.description);
          setResult(null); setDraft(resumedDraft); setSavedDraftFingerprint(authorDraftFingerprint(resumedDraft));
          setMessage('Existing V2 draft resumed from the current immutable authoring version.');
        }
        setDiscoveryState('ready');
      } catch (error) {
        if (cancelled) return;
        handleAssessV2Boundary(error);
        setDiscoveryState('failed');
        setMessage('Existing V2 case discovery failed. Create and clone remain unavailable to prevent a duplicate case.');
      }
    })();
    return () => { cancelled = true; };
  }, [handleAssessV2Boundary, processId, sessionState, tenantContext]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(null); try { await action(); } catch (error) { handleAssessV2Boundary(error); setMessage(error instanceof Error ? error.message : 'The Assess V2 action could not be completed.'); } finally { setBusy(false); } };
  const start = (clone: boolean) => {
    if (clone && !v1CloneEligible) {
      setMessage(V1_CLONE_UNAVAILABLE_MESSAGE);
      return;
    }
    return run(async () => {
    if (!tenantContext) throw new Error('A server-issued workspace context is required.');
    if (discoveryState !== 'ready') throw new Error('Existing V2 case discovery must complete before a case can be created.');
    const caseId = crypto.randomUUID(); const description = processDescription || 'Decision-intelligence assessment';
    const resource = clone && v1Assessment
      ? await cloneAssessV1ToV2(tenantContext, { caseId, sourceAssessmentId: v1Assessment.id, name: processName, description })
      : await createAssessV2Case(tenantContext, { caseId, processId, name: processName, description });
    if (clone) {
      const projection = await readAssessV2Case(caseId);
      if (!projection) throw new Error('The cloned V2 case is not available.');
      const facts = projection.case.importedFacts ?? [];
      const clonedDraft = draftFromAssessmentCase(projection.case, projection.name, projection.description);
      setImportedFacts(facts); setDraft(clonedDraft); setSavedDraftFingerprint(authorDraftFingerprint(clonedDraft));
      setMessage(`Imported ${resource.importedFactCount ?? facts.length} V1 fact suggestions and ${resource.importedEvidenceCount ?? projection.case.evidence.length} evidence suggestions. Imported claims: ${facts.map(fact => fact.fieldId).join(', ')}. Submit evidence for independent review; PR 1D does not validate evidence.`);
    } else {
      const createdDraft = emptyDraft(caseId, processName, description);
      setDraft(createdDraft); setSavedDraftFingerprint(authorDraftFingerprint(createdDraft));
    }
    setVersion(resource.version);
    if (!clone) setMessage('V2 case created. Add the minimum assessment structure before finalization.');
    });
  };
  const save = () => run(async () => { if (!tenantContext || !draft || version === null) throw new Error('No editable V2 case is open.'); const authorDraft = toAuthorDraft(draft); const resource = await saveAssessV2Draft(tenantContext, authorDraft, version); setVersion(resource.version); setSavedDraftFingerprint(authorDraftFingerprint(authorDraft)); setMessage('Draft saved as a new immutable authoring version.'); });
  const reload = () => run(async () => { if (!draft) throw new Error('No V2 case is open.'); const projection = await readAssessV2Case(draft.caseId); if (!projection) throw new Error('The V2 case is not available.'); const reloadedDraft = projection.decision ? null : draftFromAssessmentCase(projection.case, projection.name, projection.description); setVersion(projection.case.version); setImportedFacts(projection.case.importedFacts ?? []); setResult(projection.decision ? projection : null); setDraft(reloadedDraft); setSavedDraftFingerprint(reloadedDraft ? authorDraftFingerprint(reloadedDraft) : null); setMessage(projection.decision ? 'Reviewer-ready Decision Pack reloaded.' : 'Current immutable draft projection reloaded.'); });
  const finalize = () => run(async () => { if (!tenantContext || !draft || version === null) throw new Error('No V2 case is ready to finalize.'); if (hasUnsavedChanges) throw new Error('Save the current V2 authoring changes before finalization.'); if (structuralGaps.length) throw new Error(`Complete ${structuralGaps.join(', ')} before finalization.`); const resource = await finalizeAssessV2Case(tenantContext, draft.caseId, version); const projection = await readAssessV2Case(resource.caseId); if (!projection?.decision) throw new Error('The server committed finalization but no readable Decision Pack is available.'); setVersion(resource.version); setResult(projection); setDraft(null); setSavedDraftFingerprint(null); setMessage('Reviewer-ready Decision Pack finalized. It is read-only.'); });
  const renderModel = result?.decision ? buildDecisionPackRenderModel(result.decision) : null;
  const updatePrimitive = (index: number, value: Record<string, unknown>) => draft && setDraft({ ...draft, primitives: draft.primitives.map((item, i) => i === index ? { ...item, ...value } : item) });
  const updatePrimitiveFact = (index: number, fieldId: typeof primitiveFactKeys[number], value: boolean | null) => { if (!draft) return; const primitive = draft.primitives[index]; updatePrimitive(index, { facts: { ...primitive.facts, [fieldId]: { fieldId, value, status: value === null ? 'unknown' : 'known', evidenceIds: primitive.evidenceIds, source: 'user' } } }); };
  const updateAsset = (index: number, value: Record<string, unknown>) => draft && setDraft({ ...draft, applicationAssets: draft.applicationAssets.map((item, i) => i === index ? { ...item, ...value } : item) });
  const movePrimitive = (index: number, offset: number) => { if (!draft) return; const next = [...draft.primitives]; const target = index + offset; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setDraft({ ...draft, primitives: next }); };
  const updateInteraction = (index: number, value: Record<string, unknown>) => draft && setDraft({ ...draft, interactions: draft.interactions.map((item, i) => i === index ? { ...item, ...value } : item) });
  const updateInteractionFact = (index: number, key: InteractionFactKey, value: boolean | null) => draft && updateInteraction(index, { facts: { ...draft.interactions[index].facts, [key]: value } });
  const addImportedFactReview = (fieldId: string) => draft && setDraft({ ...draft, evidenceLinks: [...draft.evidenceLinks, { id: crypto.randomUUID(), claimIds: [fieldId], sourceType: 'document', status: 'submitted', validated: false, owner: 'Assessment reviewer', capturedAt: new Date().toISOString() }] });

  return <section className="premium-surface rounded-3xl p-2 sm:p-6" data-testid="assess-v2-workspace" aria-labelledby="assess-v2-title">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="max-w-3xl"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a6a00] dark:text-[#ffcf45]">Decision intelligence foundation</p><h2 id="assess-v2-title" className="mt-2 text-2xl font-black text-[#002C4B] dark:text-white">Avala Assess V2</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">Compose the least-complex operating model across process primitives. V2 is additive; it never rewrites the V1 score or recommendation.</p></div>
      {sessionState === 'ready' && discoveryState === 'ready' && !draft && !result && <div className="flex flex-wrap gap-2"><button disabled={busy || !can(ASSESS_V2_CAPABILITIES.read) || !can(ASSESS_V2_CAPABILITIES.create)} onClick={() => start(false)} className="rounded-xl bg-[#002C4B] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Create V2 case</button><button disabled={busy || !v1CloneEligible || !can(ASSESS_V2_CAPABILITIES.read) || !can(ASSESS_V2_CAPABILITIES.create) || !can(ASSESS_V2_CAPABILITIES.clone)} onClick={() => start(true)} className="rounded-xl px-4 py-2.5 text-sm font-black btn-ghost disabled:opacity-50">Clone V1 as suggestions</button></div>}
    </div>
    {discoveryState === 'loading' && <p className="mt-4 text-sm font-semibold text-slate-500" role="status">Checking for an existing V2 case for this process.</p>}
    {discoveryState === 'failed' && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">Existing V2 case lookup is unavailable. Create and clone are blocked to prevent a duplicate case.</p>}
    {assessV2OperationalState === 'read_only' && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950" role="status">{assessV2OperationalMessage || 'Avala Assess V2 changes are blocked. Existing V2 records remain available.'}</p>}
    {v1Assessment && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><strong>Legacy V1 | {v1Assessment.scoreVersion || 'score version unavailable'}.</strong> Final recommendation: {v1Assessment.scores?.recommendation?.category || 'not finalized'}. Cloned values remain unverified suggestions until reviewed.</div>}
    {v1Assessment && !v1CloneEligible && <p data-testid="assess-v2-clone-unavailable" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950" role="status">{V1_CLONE_UNAVAILABLE_MESSAGE}</p>}
    {missing.length > 0 && <p className="mt-4 text-xs font-semibold text-slate-500" role="status">Unavailable actions: {missing.map(item => capabilityCopy[item]).join(', ')}. Server capabilities control every mutation.</p>}
    {message && <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200" role="status">{message}</p>}

    {draft && !result && importedFacts && importedFacts.length > 0 && <div data-testid="assess-v2-imported-suggestions" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><h4 className="font-black">Imported V1 suggestions</h4><p className="mt-1">These are unverified source facts. Review a suggestion by linking editable V2 evidence to its exact claim; imported source data remains immutable.</p><ul className="mt-2 space-y-2">{importedFacts.map(fact => <li key={fact.fieldId}><span className="font-black">{fact.fieldId}</span>: {fact.value === null ? 'Unknown' : String(fact.value)} ({fact.status}, {fact.source}) <button type="button" onClick={() => addImportedFactReview(fact.fieldId)} className="ml-2 rounded-lg border border-amber-400 px-2 py-1 font-black">Add review evidence</button></li>)}</ul></div>}

    {draft && !result && <div className="mt-6 space-y-5">
      <details open className={sectionClass}><summary className="cursor-pointer text-lg font-black">1. Scope and structure</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-black">Case name<input aria-label="V2 case name" disabled={isReadOnly} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={inputClass}/></label><label className="text-sm font-black">Description<textarea aria-label="V2 case description" disabled={isReadOnly} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} min-h-24`}/></label></div>
        {!draft.primitives.length && <button type="button" onClick={() => setDraft(scaffold(draft))} className="mt-4 rounded-xl bg-[#ffbc03] px-4 py-2 text-sm font-black text-[#002C4B]">Add minimum working structure</button>}
        <div className="mt-4 space-y-3">{draft.primitives.map((primitive, index) => <fieldset key={primitive.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><legend className="font-black">Primitive {index + 1}</legend><div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-black">Name<input aria-label={`Primitive ${index + 1} name`} value={primitive.name} onChange={event => updatePrimitive(index, { name: event.target.value })} className={inputClass}/></label><label className="text-xs font-black">Description<input aria-label={`Primitive ${index + 1} description`} value={primitive.description} onChange={event => updatePrimitive(index, { description: event.target.value })} className={inputClass}/></label><label className="text-xs font-black">Type<select aria-label={`Primitive ${index + 1} type`} value={primitive.type} onChange={event => updatePrimitive(index, { type: event.target.value })} className={inputClass}>{primitiveTypes.map(type => <option key={type}>{type}</option>)}</select></label><label className="text-xs font-black">Business disposition<select aria-label={`Primitive ${index + 1} disposition`} value={primitive.businessDisposition ?? ''} onChange={event => updatePrimitive(index, { businessDisposition: event.target.value || undefined })} className={inputClass}><option value="">Not selected</option>{dispositions.map(item => <option key={item}>{item}</option>)}</select></label></div><div className="mt-3 grid gap-2 md:grid-cols-3">{primitiveFactKeys.map(fieldId => { const fact = primitive.facts[fieldId]; return <label key={fieldId} className="text-xs font-black">{fieldId}<select aria-label={`Primitive ${index + 1} ${fieldId}`} value={fact?.value === true ? 'true' : fact?.value === false ? 'false' : 'unknown'} onChange={event => updatePrimitiveFact(index, fieldId, event.target.value === 'unknown' ? null : event.target.value === 'true')} className={inputClass}><option value="unknown">Unknown</option><option value="true">Known: yes</option><option value="false">Known: no</option></select></label>; })}</div><div className="mt-2 flex gap-2"><button type="button" aria-label={`Move primitive ${index + 1} up`} onClick={() => movePrimitive(index, -1)} className="btn-ghost rounded-lg px-2">Up</button><button type="button" aria-label={`Move primitive ${index + 1} down`} onClick={() => movePrimitive(index, 1)} className="btn-ghost rounded-lg px-2">Down</button><button type="button" onClick={() => setDraft({ ...draft, primitives: draft.primitives.filter((_, i) => i !== index) })} className="btn-ghost rounded-lg px-2 text-red-700">Remove</button></div></fieldset>)}<button type="button" onClick={() => setDraft({ ...draft, primitives: [...draft.primitives, { id: crypto.randomUUID(), type: 'Capture', name: 'New primitive', description: '', inputs: [], outputs: [], volumeShare: null, manualEffort: null, rules: [], exceptionIds: [], evidenceIds: [], facts: {} }] })} className="btn-ghost rounded-xl px-3 py-2 text-sm font-black">Add primitive</button></div>
      </details>
      <details className={sectionClass}><summary className="cursor-pointer text-lg font-black">2. Flow, decisions and exceptions</summary><div className="mt-4 grid gap-4 lg:grid-cols-3"><div><h4 className="font-black">Process edges</h4>{draft.edges.map(edge => <div key={edge.id} className="mt-2 text-sm">{draft.primitives.find(p => p.id === edge.fromPrimitiveId)?.name} {'->'} {draft.primitives.find(p => p.id === edge.toPrimitiveId)?.name}</div>)}<button type="button" disabled={draft.primitives.length < 2} onClick={() => setDraft({ ...draft, edges: [...draft.edges, { id: crypto.randomUUID(), fromPrimitiveId: draft.primitives[0].id, toPrimitiveId: draft.primitives[1].id, condition: 'Continue' }] })} className="mt-2 btn-ghost rounded-lg px-2 py-1">Add edge</button></div><div><h4 className="font-black">Decision points</h4>{draft.decisionPoints.map((item, index) => <fieldset key={item.id} className="mt-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900"><label className="text-xs font-black">Decision name<input aria-label={`Decision ${index + 1} name`} value={item.name} onChange={event => setDraft({ ...draft, decisionPoints: draft.decisionPoints.map((point, i) => i === index ? { ...point, name: event.target.value } : point) })} className={inputClass}/></label><label className="mt-2 block text-xs font-black">Decision rule<input aria-label={`Decision ${index + 1} rule`} value={item.ruleDescription} onChange={event => setDraft({ ...draft, decisionPoints: draft.decisionPoints.map((point, i) => i === index ? { ...point, ruleDescription: event.target.value } : point) })} className={inputClass}/></label></fieldset>)}<button type="button" disabled={!draft.primitives.length} onClick={() => setDraft({ ...draft, decisionPoints: [...draft.decisionPoints, { id: crypto.randomUUID(), primitiveId: draft.primitives[0].id, name: 'Decision', ruleDescription: 'Document the decision rule.', outcomeLabels: ['Continue', 'Escalate'], evidenceIds: [] }] })} className="mt-2 btn-ghost rounded-lg px-2 py-1">Add decision point</button></div><div><h4 className="font-black">Exception paths</h4>{draft.exceptionPaths.map((item, index) => <fieldset key={item.id} className="mt-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900"><label className="text-xs font-black">Exception name<input aria-label={`Exception ${index + 1} name`} value={item.name} onChange={event => setDraft({ ...draft, exceptionPaths: draft.exceptionPaths.map((path, i) => i === index ? { ...path, name: event.target.value } : path) })} className={inputClass}/></label><label className="mt-2 block text-xs font-black">Exception trigger<input aria-label={`Exception ${index + 1} trigger`} value={item.trigger} onChange={event => setDraft({ ...draft, exceptionPaths: draft.exceptionPaths.map((path, i) => i === index ? { ...path, trigger: event.target.value } : path) })} className={inputClass}/></label></fieldset>)}<button type="button" disabled={draft.primitives.length < 2} onClick={() => setDraft({ ...draft, exceptionPaths: [...draft.exceptionPaths, { id: crypto.randomUUID(), fromPrimitiveId: draft.primitives[0].id, name: 'Exception', trigger: 'Document the exception trigger.', resolutionPrimitiveIds: [draft.primitives[1].id], evidenceIds: [] }] })} className="mt-2 btn-ghost rounded-lg px-2 py-1">Add exception path</button></div></div></details>
      <details className={sectionClass}><summary className="cursor-pointer text-lg font-black">3. Applications and interactions</summary><div className="mt-4 space-y-3">{draft.applicationAssets.map((asset, index) => <fieldset key={asset.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><legend className="font-black">Application {index + 1}</legend><label className="text-xs font-black">Application name<input aria-label={`Application ${index + 1} name`} value={asset.name} onChange={event => setDraft({ ...draft, applicationAssets: draft.applicationAssets.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} className={inputClass}/></label><div className="mt-3 grid gap-3 md:grid-cols-3"><label className="text-xs font-black">Strategic lifespan<select aria-label={`Application ${index + 1} strategic lifespan`} value={asset.strategicLifespan} onChange={event => updateAsset(index, { strategicLifespan: event.target.value })} className={inputClass}>{['unknown','short','medium','long'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Technical health<select aria-label={`Application ${index + 1} technical health`} value={asset.technicalHealth} onChange={event => updateAsset(index, { technicalHealth: event.target.value })} className={inputClass}>{['unknown','healthy','constrained','end-of-life'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Business criticality<select aria-label={`Application ${index + 1} business criticality`} value={asset.businessCriticality} onChange={event => updateAsset(index, { businessCriticality: event.target.value })} className={inputClass}>{['unknown','low','medium','high','critical'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Ownership model<select aria-label={`Application ${index + 1} ownership model`} value={asset.ownershipModel} onChange={event => updateAsset(index, { ownershipModel: event.target.value })} className={inputClass}>{['unknown','source-owned','vendor-owned','shared'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Vendor roadmap<select aria-label={`Application ${index + 1} vendor roadmap`} value={asset.vendorRoadmap} onChange={event => updateAsset(index, { vendorRoadmap: event.target.value })} className={inputClass}>{['unknown','supportive','constrained','end-of-life'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Operating stability<select aria-label={`Application ${index + 1} operating stability`} value={asset.operatingStability} onChange={event => updateAsset(index, { operatingStability: event.target.value })} className={inputClass}>{['unknown','stable','variable','unstable'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-black">Accountable owner<input aria-label={`Application ${index + 1} accountable owner`} value={asset.accountableOwner ?? ''} onChange={event => updateAsset(index, { accountableOwner: event.target.value || null })} className={inputClass}/></label></div></fieldset>)}<button type="button" onClick={() => setDraft({ ...draft, applicationAssets: [...draft.applicationAssets, { id: crypto.randomUUID(), name: 'Application', strategicLifespan: 'unknown', technicalHealth: 'unknown', businessCriticality: 'unknown', ownershipModel: 'unknown', vendorRoadmap: 'unknown', operatingStability: 'unknown', accountableOwner: null, evidenceIds: [] }] })} className="btn-ghost rounded-lg px-2 py-1">Register asset</button>{draft.interactions.map((interaction, index) => <fieldset key={interaction.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><legend className="font-black">Interaction {index + 1}</legend><div className="grid gap-3 md:grid-cols-3"><label className="text-xs font-black">Operation name<input aria-label={`Interaction ${index + 1} operation name`} value={interaction.operationName} onChange={event => updateInteraction(index, { operationName: event.target.value })} className={inputClass}/></label><label className="text-xs font-black">Declared mode<select aria-label={`Interaction ${index + 1} mode`} value={interaction.mode} onChange={event => updateInteraction(index, { mode: event.target.value as typeof interaction.mode })} className={inputClass}>{['read','write','event','ui','operational'].map(mode => <option key={mode}>{mode}</option>)}</select></label><label className="text-xs font-black">Data classification<select aria-label={`Interaction ${index + 1} data classification`} value={interaction.dataClassification} onChange={event => updateInteraction(index, { dataClassification: event.target.value })} className={inputClass}>{['Unknown','Public','Internal','Confidential','Restricted'].map(item => <option key={item}>{item}</option>)}</select></label></div><div className="mt-3 grid gap-2 md:grid-cols-3">{interactionFactKeys.map(key => contextualInteractionFacts.has(key) ? <label key={key} className="text-xs font-black"><input type="checkbox" checked={interaction.facts[key] === true} onChange={event => updateInteractionFact(index, key, event.target.checked)} className="mr-2"/>{key}</label> : <label key={key} className="text-xs font-black">{key}<select aria-label={`Interaction ${index + 1} ${key}`} value={interaction.facts[key] === null ? 'unknown' : String(interaction.facts[key])} onChange={event => updateInteractionFact(index, key, event.target.value === 'unknown' ? null : event.target.value === 'true')} className={inputClass}><option value="unknown">Unknown</option><option value="true">Known: yes</option><option value="false">Known: no</option></select></label>)}</div></fieldset>)}<button type="button" disabled={!draft.applicationAssets.length || !draft.primitives.length} onClick={() => setDraft({ ...draft, interactions: [...draft.interactions, { id: crypto.randomUUID(), assetId: draft.applicationAssets[0].id, primitiveId: draft.primitives[0].id, operationName: 'Read', mode: 'read', dataClassification: 'Unknown', facts: unknownInteractionFacts(), evidenceIds: [] }] })} className="btn-ghost rounded-lg px-2 py-1">Add interaction</button></div></details>
      <details className={sectionClass}><summary className="cursor-pointer text-lg font-black">4. Agent necessity and evidence</summary><div className="mt-4 grid gap-3 md:grid-cols-2">{agentKeys.map(key => { const fact = draft.agentNecessity[key]; return <label key={key} className="text-xs font-black">{key}<select value={fact.value === null ? 'unknown' : String(fact.value)} onChange={event => setDraft({ ...draft, agentNecessity: { ...draft.agentNecessity, [key]: { ...fact, value: event.target.value === 'unknown' ? null : event.target.value === 'true', status: event.target.value === 'unknown' ? 'unknown' : 'known' } } })} className={inputClass}><option value="unknown">Unknown</option><option value="true">Known: yes</option><option value="false">Known: no</option></select></label>; })}</div><div className="mt-4 space-y-3">{draft.evidenceLinks.map((item, index) => <fieldset key={item.id} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><legend className="font-black">Evidence {index + 1}</legend><label className="text-xs font-black">Exact claim IDs<input aria-label={`Evidence ${index + 1} claim IDs`} value={item.claimIds.join(', ')} onChange={event => setDraft({ ...draft, evidenceLinks: draft.evidenceLinks.map((link, i) => i === index ? { ...link, claimIds: event.target.value.split(',').map(value => value.trim()).filter(Boolean) } : link) })} className={inputClass}/></label><fieldset className="mt-3"><legend className="text-xs font-black">Exact decision claims</legend><p className="mt-1 text-xs text-slate-500">Select the specific V2 claims this evidence supports.</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{claimOptions.map(claimId => <label key={claimId} className="text-xs"><input type="checkbox" checked={item.claimIds.includes(claimId)} onChange={event => setDraft({ ...draft, evidenceLinks: draft.evidenceLinks.map((link, i) => i === index ? { ...link, claimIds: event.target.checked ? [...new Set([...link.claimIds, claimId])] : link.claimIds.filter(id => id !== claimId) } : link) })} className="mr-2"/>{claimId}</label>)}</div></fieldset><label className="mt-2 block text-xs font-black">Evidence source<select aria-label={`Evidence ${index + 1} source`} value={item.sourceType} onChange={event => setDraft({ ...draft, evidenceLinks: draft.evidenceLinks.map((link, i) => i === index ? { ...link, sourceType: event.target.value as typeof link.sourceType } : link) })} className={inputClass}>{['system-record','document','interview','observation','test','template'].map(sourceType => <option key={sourceType}>{sourceType}</option>)}</select></label><label className="mt-2 block text-xs font-black">Owner<input aria-label={`Evidence ${index + 1} owner`} value={item.owner ?? ''} onChange={event => setDraft({ ...draft, evidenceLinks: draft.evidenceLinks.map((link, i) => i === index ? { ...link, owner: event.target.value } : link) })} className={inputClass}/></label><label className="mt-2 block text-xs font-black">Submission status<select aria-label={`Evidence ${index + 1} submission status`} value={item.status} onChange={event => { const status = event.target.value as typeof item.status; setDraft({ ...draft, evidenceLinks: draft.evidenceLinks.map((link, i) => i === index ? { ...link, status, validated: false } : link) }); }} className={inputClass}>{['suggested','submitted'].map(status => <option key={status}>{status}</option>)}</select></label></fieldset>)}<button type="button" onClick={() => setDraft({ ...draft, evidenceLinks: [...draft.evidenceLinks, { id: crypto.randomUUID(), claimIds: ['assessment.scope'], sourceType: 'document', status: 'submitted', validated: false, capturedAt: new Date().toISOString() }] })} className="mt-2 btn-ghost rounded-lg px-2 py-1">Add linked evidence</button></div></details>
      {structuralGaps.length > 0 && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="status">Before finalization, add: {structuralGaps.join(', ')}.</p>}
      {hasUnsavedChanges && <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950" role="status">Unsaved V2 authoring changes are visible. Save the draft before finalizing.</p>}
      <div className="flex flex-wrap gap-2"><button disabled={busy || isReadOnly || !can(ASSESS_V2_CAPABILITIES.draftWrite)} onClick={save} className="rounded-xl bg-[#002C4B] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Save V2 draft</button><button disabled={busy || !canRead} onClick={reload} className="btn-ghost rounded-xl px-4 py-2.5 text-sm font-black disabled:opacity-50">Reload current draft</button><button disabled={busy || isReadOnly || hasUnsavedChanges || structuralGaps.length > 0 || !can(ASSESS_V2_CAPABILITIES.finalize)} onClick={finalize} className="rounded-xl bg-[#ffbc03] px-4 py-2.5 text-sm font-black text-[#002C4B] disabled:opacity-50">Finalize reviewer-ready Decision Pack</button></div>
    </div>}

    {renderModel && <div className="mt-6 space-y-5" data-testid="assess-v2-decision-pack">
      <div className="rounded-2xl bg-[#002C4B] p-2 text-white sm:p-5"><p className="text-xs font-black uppercase tracking-wider text-[#ffcf45]">Read-only | reviewer-ready</p><h3 className="mt-2 text-2xl font-black">{renderModel.title}</h3><p className="mt-2 text-sm font-semibold text-white/75">{renderModel.subtitle}</p><p className="mt-4 text-sm font-black">Deterministic evaluation completed; independent evidence and governance review not yet completed.</p><p className="mt-1 text-sm font-semibold text-white/75">{renderModel.processReadiness} | {renderModel.confidence}</p><p className="mt-2 text-sm font-black text-[#ffcf45]">Hard stop: prohibited actions cannot proceed.</p></div>
      <section className={sectionClass}><h4 className="font-black">Executive decision</h4><p className="mt-2 text-sm font-semibold">{renderModel.executiveDecision}</p><h4 className="mt-4 font-black">Assessment boundary</h4><p className="mt-2 text-sm font-semibold">{renderModel.assessmentBoundary}</p></section>
      <section className={sectionClass}><h4 className="font-black">Process primitives, decisions and exceptions</h4>{list(renderModel.primitivesDecisionsAndExceptions.primitives.map(item => `${item.name} (${item.type})`))}{list(renderModel.primitivesDecisionsAndExceptions.decisionPoints.map(item => `Decision: ${item.name} - ${item.ruleDescription}`))}{list(renderModel.primitivesDecisionsAndExceptions.exceptionPaths.map(item => `Exception: ${item.name} - ${item.trigger}`))}</section>
      <section className={sectionClass}><h4 className="font-black">Candidate evaluations</h4><p className="mt-1 text-xs text-slate-500">Fit and evidence confidence are separate. No single Best Technology is selected.</p><div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable candidate evaluations"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Primitive</th><th className="p-2">Component</th><th className="p-2">Fit</th><th className="p-2">Confidence</th></tr></thead><tbody>{renderModel.candidateAlternatives.map((item, index) => <tr key={`${item.primitiveId}-${item.component}-${index}`}><td className="p-2">{item.primitiveId}</td><td className="p-2">{item.component}</td><td className="p-2 font-black">{item.fit}</td><td className="p-2">{item.confidence}</td></tr>)}</tbody></table></div></section>
      <div className="grid gap-4 lg:grid-cols-2"><section className={sectionClass}><h4 className="font-black">Composed operating model</h4>{list(renderModel.composition.map(item => `${item.primitiveId}: ${item.components.join(' + ')}`))}</section><section className={sectionClass}><h4 className="font-black">Required controls</h4>{list(renderModel.controlsAndApprovals)}</section></div>
      <section className={sectionClass}><h4 className="font-black">Application-interaction readiness</h4>{renderModel.interactions.map(item => <div key={item.interactionId} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900"><p className="font-black">{item.interactionId}</p><p className="mt-1">{Object.entries(item.readiness).map(([mode, readiness]) => `${mode}: ${readiness}`).join(' | ')}</p></div>)}<div className="mt-4 grid gap-4 md:grid-cols-3"><div><h5 className="font-black">Allowed actions</h5>{list(renderModel.allowedActions)}</div><div><h5 className="font-black">Approval-bound actions</h5>{list(renderModel.approvalBoundActions)}</div><div><h5 className="font-black">Prohibited actions</h5>{list(renderModel.prohibitedActions)}</div></div></section>
      <section className={sectionClass}><h4 className="font-black">Modernization dispositions</h4>{list(renderModel.modernization.map(item => `${item.assetId}: ${item.dispositions.join(', ')} - ${item.rationale.join(' ')}`))}</section>
      <div className="grid gap-4 lg:grid-cols-2"><section className={sectionClass}><h4 className="font-black">Claim-linked evidence</h4>{renderModel.evidenceAndAssumptions.evidence.length ? <ul className="mt-2 space-y-2 text-sm">{renderModel.evidenceAndAssumptions.evidence.map(item => <li key={item.id} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900"><p className="font-black">{item.claimIds.join(', ') || 'No claim selected'}</p><p className="mt-1">Source: {item.sourceType} | Submission: {item.status} | Independent review: pending | Owner: {item.owner || 'unassigned'}</p></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No evidence was recorded.</p>}<h4 className="mt-4 font-black">Evidence gaps</h4>{list(renderModel.evidenceAndAssumptions.gaps)}<h4 className="mt-4 font-black">Assumptions</h4>{list(renderModel.evidenceAndAssumptions.assumptions)}</section><section className={sectionClass}><h4 className="font-black">Alternatives considered</h4>{list(renderModel.alternativesConsidered)}<h4 className="mt-4 font-black">Open remediation actions</h4>{list(renderModel.openRemediationActions)}<h4 className="mt-4 font-black">What would change the decision</h4>{list(renderModel.whatWouldChangeDecision)}</section></div>
      <section className={sectionClass}><h4 className="font-black">Immutable references</h4><dl className="mt-3 grid gap-2 text-xs md:grid-cols-2"><div><dt className="font-black">Schema version</dt><dd>{renderModel.references.schemaVersion}</dd></div><div><dt className="font-black">Rule-set version</dt><dd>{renderModel.references.ruleSetVersion}</dd></div><div><dt className="font-black">Decision version</dt><dd>{renderModel.references.decisionVersion}</dd></div><div><dt className="font-black">Input hash</dt><dd className="break-all">{renderModel.references.inputHash}</dd></div><div><dt className="font-black">Evidence hash</dt><dd className="break-all">{renderModel.references.evidenceHash}</dd></div><div><dt className="font-black">Output hash</dt><dd className="break-all">{renderModel.references.outputHash}</dd></div></dl></section>
      <section className={sectionClass}><h4 className="font-black">Explicit non-claims</h4><div className="mt-2 space-y-1 text-sm font-semibold">{renderModel.nonClaims.map(item => { const copy = item === 'No deployment, pilot, production, security, compliance, or buyer-acceptance readiness claim' ? 'No deployment, pilot, production, security, compliance, or buyer-acceptance readiness claim is made.' : item; return <p key={item}>{copy}</p>; })}</div><p className="mt-4 text-xs font-semibold text-slate-500">V2 approval, Govern resolution, Studio generation, export, and external sharing are not available in this foundation boundary.</p><p className="mt-2 text-xs font-semibold text-slate-500">PR 1E approval, Govern resolution, and durable Studio source handoff require the separate server-authoritative governed review journey below.</p></section>
      <AssessV2ReviewWorkspace initialCaseId={result?.case.id} />
      {tenantContext && result?.case.id && result?.decision.id && <AssessV2EconomicsWorkspace tenantContext={tenantContext} caseId={result.case.id} decisionId={result.decision.id} />}
    </div>}
    <AssessApplicationPortfolioWorkspace tenantContext={tenantContext} readOnly={isReadOnly} offline={sessionState === 'offline'} />
  </section>;
}
