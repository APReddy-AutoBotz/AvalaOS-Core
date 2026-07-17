import React, { useMemo, useState } from 'react';
import { MOCK_LOGIN_PROFILES, MOCK_USERS } from '../../data/mockData';
import {
  BuildingOfficeIcon,
  ChartBarIcon,
  ChartPieIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClipboardListIcon,
  DocumentTextIcon,
  KeyIcon,
  UsersIcon,
  ViewBoardsIcon,
} from '../shared/icons';
import { AvalaHeroLogo } from '../shared/brand';
import { useAuth } from './AuthProvider';
import { getRuntimeBoundaryError, isLocalRuntimeEnabled } from '../../services/supabaseClient';

const valuePillars = [
  { label: 'Avala Assess', detail: 'Deterministic fit and recommendation', icon: ClipboardListIcon },
  { label: 'Avala Govern', detail: 'Human risk resolution', icon: ClipboardDocumentListIcon },
  { label: 'Avala Studio', detail: 'Editable review drafts', icon: DocumentTextIcon },
  { label: 'Avala Delivery', detail: 'Evidence-backed handoff', icon: ViewBoardsIcon },
  { label: 'Avala Monitor', detail: 'Readiness, lineage, blockers', icon: ChartBarIcon },
];

const decisionSignals = [
  { label: 'RPA fit', value: 84, tone: 'bg-amber-400' },
  { label: 'AI fit', value: 71, tone: 'bg-[#0b5f8a]' },
  { label: 'Human review', value: 43, tone: 'bg-slate-400' },
];

const proofPoints = [
  'Deterministic Assess scoring',
  'Human approval for material risk',
  'Evidence linked to every decision',
  'Monitor readiness, lineage, blocker, and value signals',
];

const EnterpriseAccessView: React.FC = () => {
  const { signIn } = useAuth();
  const isDemoMode = isLocalRuntimeEnabled();
  const runtimeBoundaryError = getRuntimeBoundaryError();
  const [email, setEmail] = useState(isDemoMode ? MOCK_USERS[0]?.email || '' : '');
  const [password, setPassword] = useState(isDemoMode ? 'demo123' : '');
  const [selectedUserId, setSelectedUserId] = useState(MOCK_LOGIN_PROFILES[0]?.userId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(runtimeBoundaryError?.message || null);

  const enrichedProfiles = useMemo(() => MOCK_LOGIN_PROFILES.map(profile => ({
    ...profile,
    user: MOCK_USERS.find(user => user.id === profile.userId),
  })).filter(profile => profile.user), []);

  const selectedProfile = enrichedProfiles.find(profile => profile.userId === selectedUserId);

  const submitLogin = async (loginEmail = email, loginPassword = password) => {
    setLoading(true);
    setError(null);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitLogin();
  };

  const selectPersona = (userId: string) => {
    const profile = MOCK_LOGIN_PROFILES.find(item => item.userId === userId);
    const user = MOCK_USERS.find(item => item.id === userId);
    if (!profile || !user) return;

    setSelectedUserId(userId);
    setEmail(user.email);
    setPassword(profile.password);
    setError(null);
  };

  const enterPersona = async (userId: string) => {
    const profile = MOCK_LOGIN_PROFILES.find(item => item.userId === userId);
    const user = MOCK_USERS.find(item => item.id === userId);
    if (!profile || !user) return;

    selectPersona(userId);
    await submitLogin(user.email, profile.password);
  };

  return (
    <div className="app-shell enterprise-landing h-screen overflow-y-auto text-slate-900">
      <main className="mx-auto grid min-h-screen w-full max-w-[1560px] gap-5 p-3 sm:p-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(430px,0.75fr)] xl:gap-6 xl:p-7">
        <section
          aria-labelledby="landing-title"
          className="landing-story-surface relative isolate overflow-hidden rounded-[28px] border border-white/80 px-5 py-6 shadow-[0_28px_80px_rgba(2,31,55,0.12)] sm:px-8 sm:py-8 lg:px-11 lg:py-10"
        >
          <div className="landing-story-grid absolute inset-0 -z-10" aria-hidden="true" />

          <header className="landing-brand-banner flex flex-col gap-5 rounded-[24px] border border-white/10 bg-[#00182a] px-5 py-5 shadow-[0_24px_60px_rgba(0,24,42,0.24)] sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <AvalaHeroLogo className="h-auto w-full max-w-[590px]" />
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <p className="max-w-[230px] text-left text-[10px] font-semibold uppercase leading-4 tracking-[0.18em] text-slate-300 lg:text-right">
                Governed AI &amp; Automation Delivery OS
              </p>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-300/35 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-100">
                <CheckCircleIcon className="h-4 w-4 text-amber-300" />
                Human-governed by design
              </div>
            </div>
          </header>

          <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(330px,0.95fr)] lg:items-center lg:gap-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0b5f8a]">
                Governed decision intelligence
              </p>
              <h1 id="landing-title" className="mt-4 max-w-2xl text-[2.05rem] font-bold leading-[1.1] tracking-[-0.03em] text-[#021f37] sm:text-[2.4rem] lg:text-[2.2rem] 2xl:text-[2.55rem]">
                <span>Evaluate before you automate.</span>{' '}
                <span className="text-[#0b5f8a]">Govern before you execute.</span>
              </h1>
              <p className="mt-5 max-w-xl text-[15px] font-normal leading-6 text-slate-600">
                Turn process evidence into deterministic recommendations, human-approved controls, and traceable delivery handoffs—before any execution system takes over.
              </p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white/85 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Control layer, not execution runtime</p>
                <p className="mt-1.5 text-sm font-normal leading-6 text-slate-600">
                  AvalaOS governs handoff and does not execute bots, RPA jobs, agents, or external systems.
                </p>
              </div>
            </div>

            <section aria-label="Governed lifecycle preview" className="landing-product-preview relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(2,31,55,0.14)] sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#002c4b] via-[#0b5f8a] to-[#ffbc03]" />
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Decision record</p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.02em] text-[#021f37]">AP Invoice Exception Handling</h2>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
                  Human reviewed
                </span>
              </div>

              <div className="grid gap-5 py-5 sm:grid-cols-[132px_1fr] sm:items-center">
                <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-[conic-gradient(#ffbc03_0deg,#ffbc03_313deg,#e8eef3_313deg)] shadow-inner">
                  <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-white shadow-sm">
                    <span className="text-4xl font-bold tabular-nums text-[#021f37]">87</span>
                    <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Decision score</span>
                  </div>
                </div>
                <div className="space-y-3.5">
                  {decisionSignals.map(signal => (
                    <div key={signal.label}>
                      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>{signal.label}</span>
                        <span className="tabular-nums text-[#021f37]">{signal.value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${signal.tone}`} style={{ width: `${signal.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#0b5f8a]/15 bg-[#eef7fb] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0b5f8a]">Governed recommendation</p>
                    <p className="mt-1 text-sm font-semibold text-[#021f37]">Workflow automation with AP owner review</p>
                  </div>
                  <CheckCircleIcon className="h-6 w-6 shrink-0 text-[#0b5f8a]" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50 py-3 text-center">
                <div><p className="text-lg font-bold tabular-nums text-[#021f37]">12</p><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Evidence</p></div>
                <div><p className="text-lg font-bold tabular-nums text-[#021f37]">3</p><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Artifacts</p></div>
                <div><p className="text-lg font-bold tabular-nums text-[#021f37]">v3</p><p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Decision</p></div>
              </div>
            </section>
          </div>

          <div className="grid gap-3 border-y border-slate-200/80 py-5 sm:grid-cols-2 lg:grid-cols-4">
            {proofPoints.map(point => (
              <div key={point} className="flex items-start gap-2.5 text-sm font-medium leading-5 text-slate-700">
                <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{point}</span>
              </div>
            ))}
          </div>

          <section aria-labelledby="lifecycle-heading" className="border-t border-slate-200/80 pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">One governed lifecycle</p>
                <h2 id="lifecycle-heading" className="mt-1 text-xl font-bold tracking-[-0.02em] text-[#021f37]">Decision quality before delivery velocity</h2>
              </div>
              <p className="max-w-md text-sm font-normal leading-6 text-slate-500">A control layer before and around downstream execution tools—not a ticketing or automation runtime replacement.</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {valuePillars.map((pillar, index) => (
                <div key={pillar.label} className="group relative min-w-0 rounded-2xl border border-slate-200 bg-white/85 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#0b5f8a]/30 hover:shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef7fb] text-[#0b5f8a]">
                      <pillar.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-600">0{index + 1}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[#021f37]">{pillar.label}</h3>
                  <p className="mt-1 text-xs font-normal leading-5 text-slate-500">{pillar.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside aria-labelledby="access-heading" className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(2,31,55,0.1)] sm:p-7 xl:sticky xl:top-7 xl:max-h-[calc(100vh-3.5rem)] xl:self-start xl:overflow-y-auto">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0b5f8a]">
                {isDemoMode ? 'Controlled product sandbox' : 'Enterprise workspace'}
              </p>
              <h2 id="access-heading" className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#021f37]">
                {isDemoMode ? 'Explore by role' : 'Sign in securely'}
              </h2>
              <p className="mt-2 text-sm font-normal leading-6 text-slate-500">
                {isDemoMode
                  ? 'Choose a synthetic persona to see how the same governed lifecycle adapts to each responsibility.'
                  : 'Use your organization account to access governed assessments, documents, delivery work, and monitor views.'}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0b5f8a]">
              <KeyIcon className="h-5 w-5" />
            </div>
          </header>

          {isDemoMode ? (
            <div className="pt-5">
              <div role="group" aria-label="Choose a sandbox persona" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-2">
                {enrichedProfiles.map((profile, index) => {
                  const user = profile.user!;
                  const isSelected = selectedUserId === profile.userId;
                  const initials = user.name.split(' ').map(part => part[0]).join('');
                  return (
                    <button
                      key={profile.userId}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectPersona(profile.userId)}
                      onDoubleClick={() => enterPersona(profile.userId)}
                      className={`min-h-[92px] rounded-2xl border p-3 text-left transition duration-200 ${index === enrichedProfiles.length - 1 ? 'sm:col-span-2 xl:col-span-2' : ''} ${isSelected
                        ? 'border-[#0b5f8a] bg-[#eef7fb] shadow-[0_10px_28px_rgba(11,95,138,0.12)]'
                        : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #002c4b, #0b5f8a)' }}>
                          {initials}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold leading-4 text-[#021f37]">{profile.label}</span>
                          <span className="mt-1 block truncate text-[11px] font-medium text-slate-600">{user.name}</span>
                          <span className="mt-1 block max-h-8 overflow-hidden text-[10px] font-normal leading-4 text-slate-600">{profile.description}</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #002c4b, #0b5f8a)' }}>
                    {selectedProfile?.user?.name.split(' ').map(part => part[0]).join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#021f37]">{selectedProfile?.user?.name}</p>
                    <p className="truncate text-xs font-normal text-slate-500">{selectedProfile?.user?.roleTitle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => enterPersona(selectedUserId)}
                  disabled={loading || !selectedUserId}
                  className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#002c4b] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(2,44,75,0.2)] transition hover:-translate-y-0.5 hover:bg-[#073b60] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Opening sandbox…' : `Enter sandbox as ${selectedProfile?.label || 'selected role'}`}
                </button>
                <p className="mt-2 text-center text-[10px] font-normal leading-4 text-slate-600">Synthetic data only. No live systems or external execution.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="pt-6">
              {error && (
                <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="work-email" className="mb-2 block text-xs font-semibold text-slate-700">Work email</label>
                  <input
                    id="work-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-normal text-[#021f37] outline-none transition focus:border-[#0b5f8a] focus:ring-4 focus:ring-[#0b5f8a]/10"
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="workspace-password" className="mb-2 block text-xs font-semibold text-slate-700">Password</label>
                  <input
                    id="workspace-password"
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-normal text-[#021f37] outline-none transition focus:border-[#0b5f8a] focus:ring-4 focus:ring-[#0b5f8a]/10"
                    placeholder="Password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center rounded-xl bg-[#002c4b] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(2,44,75,0.2)] transition hover:-translate-y-0.5 hover:bg-[#073b60] disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in to workspace'}
              </button>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-[#021f37]">Organization-scoped access</p>
                <p className="mt-1 text-xs font-normal leading-5 text-slate-500">Identity, role, workspace, and resource authority are revalidated for governed actions.</p>
              </div>
            </form>
          )}

          <footer className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5 text-center">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <BuildingOfficeIcon className="mx-auto h-4 w-4 text-[#0b5f8a]" />
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Org scope</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <UsersIcon className="mx-auto h-4 w-4 text-[#0b5f8a]" />
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Role views</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <ChartPieIcon className="mx-auto h-4 w-4 text-[#0b5f8a]" />
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Evidence</p>
            </div>
          </footer>
        </aside>
      </main>
    </div>
  );
};

export default EnterpriseAccessView;
