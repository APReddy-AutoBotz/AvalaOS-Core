import React from 'react';
import type { ImmutableDecisionVersionV2 } from '../../services/assessV2/types.ts';
import { buildAssessmentRecommendationModel } from '../../services/assessV2/recommendationModel.ts';

const operationBoundary = {
  Ready: 'API use supported',
  Conditional: 'API use requires the recorded conditions and controls',
  Unknown: 'API use remains unproven for this operation',
  Prohibited: 'API use prohibited for this operation',
  'Not Applicable': 'API use does not apply to this operation',
};

const list = (items: readonly string[], empty: string) => items.length
  ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{items.map(item => <li key={item}>{item}</li>)}</ul>
  : <p className="mt-2 text-sm text-slate-500">{empty}</p>;

export const AssessmentRecommendation: React.FC<{ decision: ImmutableDecisionVersionV2 }> = ({ decision }) => {
  const model = buildAssessmentRecommendationModel(decision.inputSnapshot, decision.outputSnapshot);
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950" data-testid="assessment-recommendation">
    <p className="text-xs font-black uppercase tracking-wider text-slate-500">Process recommendation</p>
    <h4 className="mt-2 text-xl font-black">{model.headline}</h4>
    <p className="mt-2 text-sm font-semibold">{model.explanation}</p>
    <p className="mt-2 text-xs text-slate-500">Review and approval status is recorded in the governed review section below.</p>

    <div className="mt-5 space-y-4">
      {model.steps.map(step => <article key={step.primitiveId} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900" data-testid={`assessment-step-${step.primitiveId}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h5 className="font-black">{step.name}</h5><p className="text-xs text-slate-500">{step.type}{step.businessDisposition ? ` · ${step.businessDisposition}` : ''}</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black dark:bg-slate-950">{step.evidenceConfidence}</span>
        </div>
        <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">Recommended combination</p>
        <p className="mt-1 text-sm font-semibold">{step.components.length ? step.components.join(' + ') : 'No automated component established'}</p>
        {list(step.reasons, 'No supporting reason is available.')}
        {step.apiOperations.length > 0 && <div className="mt-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">API operations</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{step.apiOperations.map(operation =>
            <li key={operation.interactionId}><strong>{operation.name} ({operation.mode})</strong> &mdash; {operationBoundary[operation.readiness]}
              {operation.evidenceGaps.length > 0 && <span> &middot; {operation.evidenceGaps.join(' / ')}</span>}
            </li>)}</ul>
        </div>}
        {step.humanJudgment && <div className="mt-3 rounded-lg border border-[#ffbc03]/50 bg-[#ffbc03]/10 p-3"><p className="text-sm font-black">Human judgment required</p><p className="mt-1 text-sm">{step.humanJudgmentReason}</p></div>}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Alternatives</p>{list(step.alternatives.map(item => `${item.optionalAi ? 'Optional AI alternative: ' : ''}${item.component} (${item.fit}, ${item.confidence}) — ${item.reason}`), 'No evidence-supported alternative was identified.')}</div>
          <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Step gaps</p>{list(step.evidenceGaps, 'No step-specific gap was recorded.')}</div>
        </div>
      </article>)}
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div><h5 className="font-black">Process evidence gaps</h5>{list(model.evidenceGaps, 'No process-level gap was recorded.')}</div>
      <div><h5 className="font-black">Assumptions to review</h5>{list(model.assumptions, 'No assumption was recorded.')}</div>
    </div>
  </section>;
};
