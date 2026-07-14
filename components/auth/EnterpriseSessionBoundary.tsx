import React from 'react';
import { useOrganizationContext } from './OrganizationProvider';
import { EnterpriseSessionStatePanel } from './EnterpriseSessionStatePanel';


export const EnterpriseSessionStateView: React.FC = () => {
  const { sessionState, sessionMessage, refreshOrgs } = useOrganizationContext();
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 dark:bg-slate-950" aria-live="polite">
    <EnterpriseSessionStatePanel state={sessionState} message={sessionMessage} onRefresh={() => refreshOrgs()} />
  </main>;
};

export const EnterpriseSessionToolbar: React.FC = () => {
  const {
    organizations,
    currentOrganization,
    workspaces,
    currentWorkspace,
    sessionState,
    sessionMessage,
    selectOrganization,
    selectWorkspace,
  } = useOrganizationContext();

  return <section className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950" aria-label="Enterprise workspace context">
    <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        Organization
        <select aria-label="Organization" value={currentOrganization?.id || ''} onChange={event => selectOrganization(event.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="flex-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
        Workspace
        <select aria-label="Workspace" value={currentWorkspace?.id || ''} onChange={event => selectWorkspace(event.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold normal-case tracking-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
          {workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className={`rounded-xl px-4 py-2 text-xs font-black ${sessionState === 'read_only' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
        {sessionState === 'read_only' ? 'Read-only maintenance' : 'Server context active'}
      </div>
    </div>
    {sessionMessage && <p className="mx-auto mt-2 max-w-7xl text-xs font-semibold text-amber-700" role="status">{sessionMessage}</p>}
  </section>;
};
