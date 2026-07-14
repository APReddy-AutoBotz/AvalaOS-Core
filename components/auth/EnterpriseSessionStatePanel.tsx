import React from 'react';

const COPY = {
  empty: ['No enterprise workspace', 'Your account has no active organization and workspace membership.'],
  error: ['Workspace unavailable', 'AvalaOS could not load the server-issued workspace context.'],
  offline: ['You are offline', 'Server-authoritative Assess actions are blocked until connectivity returns.'],
  stale: ['Access context changed', 'Refresh before continuing so the latest authorization version is used.'],
  revoked: ['Workspace access revoked', 'The next privileged action has been denied and this workspace is no longer available.'],
  blocked: ['Enterprise session blocked', 'Required server authority is unavailable. Demo authority will not be substituted.'],
  expired_session: ['Session expired', 'Sign in again before opening enterprise Assess.'],
} as const;

interface EnterpriseSessionStatePanelProps {
  state: string;
  message?: string | null;
  onRefresh: () => void;
}

export const EnterpriseSessionStatePanel: React.FC<EnterpriseSessionStatePanelProps> = ({ state, message, onRefresh }) => {
  const copy = COPY[state as keyof typeof COPY] || ['Workspace unavailable', message || 'The workspace cannot be opened.'];
  return <section data-testid="enterprise-session-boundary" className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-600">Enterprise Assess</p>
    <h1 className="mt-3 text-3xl font-black text-[#002C4B] dark:text-white">{copy[0]}</h1>
    <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{message || copy[1]}</p>
    <button onClick={onRefresh} className="mt-6 rounded-xl bg-[#ffbc03] px-5 py-3 text-sm font-black text-[#002C4B]">Refresh server context</button>
  </section>;
};
