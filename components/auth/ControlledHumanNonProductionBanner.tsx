import React, { useState } from 'react';
import {
  armControlledHumanStep,
  ControlledHumanSafeStepBinding,
  ControlledHumanSafeStepAnchor,
  ControlledHumanStepBindingOption,
  getControlledHumanBrowserBinding,
  getLastCompletedControlledHumanProof,
  listControlledHumanStepBindings,
} from '../../services/supabaseClient';
import { completedControlledHumanOptions, controlledHumanStepKey, selectControlledHumanProof } from './controlledHumanProofSelection';

const ControlledHumanNonProductionBanner: React.FC = () => {
  const binding = getControlledHumanBrowserBinding();
  const [options, setOptions] = useState<ControlledHumanStepBindingOption[]>([]);
  const [selected, setSelected] = useState('');
  const [selectedCompleted, setSelectedCompleted] = useState('');
  const [safeBinding, setSafeBinding] = useState<ControlledHumanSafeStepBinding | null>(null);
  const [safeAnchor, setSafeAnchor] = useState<ControlledHumanSafeStepAnchor | null>(null);
  const [message, setMessage] = useState('Sign in, select the next exact step, and arm it before performing the action.');
  const [pending, setPending] = useState(false);
  if (binding.status === 'disabled') return null;

  if (binding.status === 'blocked') {
    return (
      <section
        data-testid="controlled-human-environment-blocked"
        role="alert"
        className="border-b border-red-300 bg-red-50 px-4 py-3 text-center text-sm font-bold text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      >
        Controlled test environment blocked. Environment verification did not match; sign-in and workspace access remain disabled.
      </section>
    );
  }

  const refresh = async () => {
    setPending(true); setSafeBinding(null); setSafeAnchor(null);
    try {
      const records = await listControlledHumanStepBindings();
      setOptions(records);
      const proof=selectControlledHumanProof(records,selectedCompleted,getLastCompletedControlledHumanProof());
      setSelectedCompleted(proof?.key??'');setSafeAnchor(proof?.proof.safeAnchor??null);setSafeBinding(proof?.proof.safeBinding??null);
      const first = records.find(record => record.state === 'unanchored');
      setSelected(first ? `${first.checkpointId}:${first.stepId}` : '');
      setMessage(first ? 'Choose and arm the next step before performing its application action. The application will reuse the server-issued request and complete only from its exact receipt/audit.' : 'All server-observable steps for this signed-in persona are completed.');
    } catch {
      setMessage('Sign in as the assigned synthetic persona, then refresh evidence steps. No evidence was recorded.');
    } finally { setPending(false); }
  };

  const arm = () => {
    const option = options.find(record => `${record.checkpointId}:${record.stepId}` === selected && record.state === 'unanchored');
    if (!option) return;
    try {
      armControlledHumanStep(option);
      setSafeAnchor(null); setSafeBinding(null);
      setMessage('Step armed in this browser tab. Perform exactly the selected application action now, then refresh. No post-action event selection is possible.');
    } catch {
      setMessage('Arming rejected. Refresh and do not perform the action; no evidence was recorded.');
    }
  };

  const copy = async () => {
    if (!safeBinding || !safeAnchor) return;
    try { await navigator.clipboard.writeText(JSON.stringify({ serverAnchor: safeAnchor, serverBinding: safeBinding })); setMessage('Sanitized preanchor and completion copied.'); }
    catch { setMessage('Clipboard unavailable. Copy the sanitized JSON shown below; do not add raw identifiers.'); }
  };

  const unbound = options.filter(record => record.state === 'unanchored');
  const completed = completedControlledHumanOptions(options);
  const chooseCompleted=(key:string)=>{setSelectedCompleted(key);const proof=selectControlledHumanProof(options,key,null);setSafeAnchor(proof?.proof.safeAnchor??null);setSafeBinding(proof?.proof.safeBinding??null);};
  return <section data-testid="controlled-human-nonproduction-banner" role="status"
    className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
    <p className="text-center">Controlled human test · synthetic non-production data only · no customer data or real provider calls</p>
    <details className="mx-auto mt-2 max-w-5xl text-left">
      <summary className="cursor-pointer text-center">Two-phase exact action evidence</summary>
      <p className="mt-2 text-xs font-semibold">{message}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void refresh()} disabled={pending} className="rounded-lg border border-amber-700 px-3 py-2 disabled:opacity-50">Refresh evidence steps</button>
        <select aria-label="Controlled-human evidence step" value={selected} onChange={event => setSelected(event.target.value)} disabled={pending || unbound.length === 0}
          className="min-w-72 rounded-lg border border-amber-700 bg-white px-3 py-2 text-slate-950">
          <option value="">Select the next action before performing it</option>
          {unbound.map(record => <option key={`${record.checkpointId}:${record.stepId}`} value={`${record.checkpointId}:${record.stepId}`}>{record.checkpointId} · {record.stepId} · {record.action}</option>)}
        </select>
        <button type="button" onClick={arm} disabled={pending || !selected} className="rounded-lg bg-amber-900 px-3 py-2 text-white disabled:opacity-50">Arm before action</button>
        <select aria-label="Completed controlled-human evidence step" value={selectedCompleted} onChange={event=>chooseCompleted(event.target.value)} disabled={pending||completed.length===0}
          className="min-w-72 rounded-lg border border-amber-700 bg-white px-3 py-2 text-slate-950">
          <option value="">Select completed proof to inspect or copy</option>
          {completed.map(record=><option key={controlledHumanStepKey(record)} value={controlledHumanStepKey(record)}>{record.checkpointId} · {record.stepId}</option>)}
        </select>
        {safeBinding && safeAnchor && <button type="button" onClick={() => void copy()} className="rounded-lg border border-amber-700 px-3 py-2">Copy sanitized proof pair</button>}
      </div>
      {safeAnchor && <pre data-testid="controlled-human-safe-anchor" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-950">{JSON.stringify(safeAnchor, null, 2)}</pre>}
      {safeBinding && <pre data-testid="controlled-human-safe-binding" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs text-slate-950">{JSON.stringify(safeBinding, null, 2)}</pre>}
    </details>
  </section>;
};

export default ControlledHumanNonProductionBanner;
