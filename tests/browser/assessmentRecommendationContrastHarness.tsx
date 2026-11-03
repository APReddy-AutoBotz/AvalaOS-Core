import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { AssessmentRecommendation } from '../../components/assess-v2/AssessmentRecommendation.tsx';
import { buildDecisionVersionV2 } from '../../services/assessV2/decisionVersion.ts';
import { AP_INVOICE_EXCEPTION_V2_FIXTURE } from '../../services/assessV2/fixture.ts';

const assessment = structuredClone(AP_INVOICE_EXCEPTION_V2_FIXTURE);
const retained = new Set(assessment.primitives
  .filter(item => ['Capture', 'Validate', 'Route', 'Approve'].includes(item.type))
  .map(item => item.id));
assessment.primitives = assessment.primitives.filter(item => retained.has(item.id));
const [capture, validate, route, approve] = assessment.primitives;
assessment.edges = [
  { id: '74000000-0000-4000-8000-000000000101', fromPrimitiveId: capture.id, toPrimitiveId: validate.id },
  { id: '74000000-0000-4000-8000-000000000102', fromPrimitiveId: validate.id, toPrimitiveId: route.id, condition: 'exception' },
  { id: '74000000-0000-4000-8000-000000000103', fromPrimitiveId: route.id, toPrimitiveId: approve.id },
];
assessment.decisionPoints = assessment.decisionPoints.filter(item => item.primitiveId === validate.id);
assessment.exceptionPaths = assessment.exceptionPaths.map(item => ({
  ...item,
  fromPrimitiveId: validate.id,
  resolutionPrimitiveIds: [route.id, approve.id],
}));
approve.businessDisposition = 'Human-Led';

const readyRead = assessment.interactions.find(item => item.primitiveId === validate.id && item.mode === 'read');
const writeBoundary = AP_INVOICE_EXCEPTION_V2_FIXTURE.interactions.find(item => item.mode === 'write');
if (!readyRead || !writeBoundary) throw new Error('Deterministic contrast fixture is incomplete.');
assessment.interactions = [readyRead, {
  ...structuredClone(writeBoundary),
  id: '76000000-0000-4000-8000-000000000106',
  primitiveId: approve.id,
  operationName: 'Post a human-approved exception outcome',
  facts: { ...writeBoundary.facts, interfaceAvailable: null },
}];

const decision = await buildDecisionVersionV2(
  assessment,
  '77000000-0000-4000-8000-000000000001',
  '2026-11-03T12:00:00.000Z',
);

function ContrastHarness() {
  const [open, setOpen] = useState(false);
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950">
    <p data-testid="contrast-boundary">Deterministic evaluator fixture — not fresh extraction or provider proof.</p>
    <button type="button" aria-controls="contrast" aria-expanded={open} onClick={() => setOpen(true)}>
      Open no-AI contrast assessment
    </button>
    {open && <div id="contrast"><AssessmentRecommendation decision={decision} /></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<ContrastHarness />);
