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
  AvalaWordmark,
  SparklesIcon,
  UsersIcon,
  ViewBoardsIcon,
} from '../shared/icons';
import { useAuth } from './AuthProvider';
import { isSupabaseConfigured } from '../../services/supabaseClient';

const valuePillars = [
  { label: 'Avala Assess', detail: 'Deterministic fit score', icon: ClipboardListIcon },
  { label: 'Avala Govern Lite', detail: 'Decision Pack controls', icon: ClipboardDocumentListIcon },
  { label: 'Avala Studio', detail: 'BRD, PDD, handoff pack', icon: DocumentTextIcon },
  { label: 'Avala Delivery Lite', detail: 'Traceable backlog', icon: ViewBoardsIcon },
  { label: 'Avala Monitor', detail: 'Value, risk, blockers', icon: ChartBarIcon },
];

const readinessRows = [
  { label: 'RPA fit', value: 84, tone: 'from-amber-400 to-amber-500' },
  { label: 'GenAI fit', value: 71, tone: 'from-[#002C4B] to-[#073B60]' },
  { label: 'Human review', value: 43, tone: 'from-slate-300 to-slate-400' },
];

const proofPoints = [
  'Deterministic Assess scoring',
  'Govern Lite human review and evidence controls',
  'Docs and delivery handoff lineage',
  'Leadership monitor and risk visibility',
  'Server-side AI governance path',
];

const LoginView: React.FC = () => {
  const { signIn } = useAuth();
  const isDemoMode = !isSupabaseConfigured();
  const [email, setEmail] = useState(isDemoMode ? MOCK_USERS[0]?.email || '' : '');
  const [password, setPassword] = useState(isDemoMode ? 'demo123' : '');
  const [selectedUserId, setSelectedUserId] = useState(MOCK_LOGIN_PROFILES[0]?.userId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrichedProfiles = useMemo(() => MOCK_LOGIN_PROFILES.map(profile => ({
    ...profile,
    user: MOCK_USERS.find(user => user.id === profile.userId),
  })).filter(profile => profile.user), []);

  const selectedUser = MOCK_USERS.find(user => user.email === email);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="app-shell h-screen overflow-y-auto bg-soft-gradient text-slate-900 font-sans">
      <div className="min-h-full px-4 py-5 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-7xl grid min-h-[calc(100vh-4rem)] gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
          
          {/* LEFT COLUMN: Visuals & Value Prop */}
          <section className="relative overflow-hidden rounded-[34px] p-6 shadow-2xl sm:p-8 lg:p-10 flex flex-col justify-between border border-white/60">
            {/* Clean Office Background Image */}
            <img 
              alt="Office collaboration background" 
              className="absolute inset-0 w-full h-full object-cover scale-105 blur-[3px] opacity-85 grayscale-[20%]" 
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=2070&q=80" 
              style={{ filter: 'brightness(0.95)' }} 
            />
            {/* Soft overlay to ensure readability */}
            <div className="absolute inset-0 bg-[#fffcf5]/80 backdrop-blur-sm"></div>

            <div className="relative z-10 flex flex-col h-full">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div className="flex flex-col items-start gap-4">
                  <div className="glass-card bg-[#fffcf5]/80 px-4 py-2.5 rounded-2xl border border-white/80 shadow-md backdrop-blur-md flex items-center">
                    <AvalaWordmark className="h-14 w-[230px]" />
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#021f37]/80 ml-2">
                    Governed AI & Automation Delivery OS
                  </div>
                </div>
                <div className="hidden glass-card px-4 py-2 rounded-2xl md:flex items-center gap-3 border border-white/60 shadow-sm bg-white/50 backdrop-blur-md">
                  <div className="relative">
                    <svg className="w-5 h-5 text-[#ffbc03]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
                    </svg>
                    <div className="absolute -bottom-1 -right-1 bg-[#ffbc03] rounded-full p-0.5 border border-white">
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                  </div>
                  <div className="leading-tight">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-slate-500">Governance</p>
                    <p className="text-xs font-bold text-[#021f37]">BYOK planned</p>
                  </div>
                </div>
              </div>

              <div className="grid flex-1 gap-10 xl:grid-cols-[1fr_1fr] xl:items-center mt-2">
                <div className="pr-4">
                  <h1 className="max-w-xl font-serif text-5xl font-medium leading-[1.1] text-[#021f37] sm:text-6xl tracking-wide drop-shadow-sm">
                    Evaluate. Govern.<br/>Deliver. Prove.
                  </h1>
                  <p className="mt-6 max-w-sm text-[15px] font-medium leading-relaxed text-[#021f37]/80">
                    Turn messy process input into deterministic recommendations, governed documents, approval-ready work items, and evidence-backed visibility.
                  </p>

                  <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    {valuePillars.map((pillar, i) => {
                      const borders = ['border-[#002C4B]', 'border-[#ffbc03]', 'border-[#d99d00]', 'border-[#073B60]', 'border-[#4f6f85]'];
                      const iconBgs = ['bg-[#002C4B]/10 text-[#002C4B]', 'bg-[#ffbc03]/20 text-[#7a5600]', 'bg-[#ffbc03]/15 text-[#002C4B]', 'bg-[#073B60]/10 text-[#073B60]', 'bg-slate-100 text-[#002C4B]'];
                      return (
                        <div key={pillar.label} className={`glass-card p-5 rounded-2xl border-l-4 ${borders[i]} border-t border-r border-b border-white/60 shadow-lg flex items-center gap-5 hover:bg-white/40 transition-colors`}>
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${iconBgs[i]}`}>
                            <pillar.icon className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="text-lg font-bold text-[#021f37]">{pillar.label}</div>
                            <div className="text-sm font-medium text-[#021f37]/70">{pillar.detail}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="glass-card bg-white/60 p-8 rounded-3xl shadow-2xl border border-white/80 w-full relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#002C4B] via-[#ffbc03] to-[#073B60] opacity-90"></div>
                  <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#021f37]/60">Decision cockpit</div>
                      <div className="mt-1.5 text-2xl font-bold text-[#021f37] tracking-tight">AP Invoice Exception Handling</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-8">
                    <div className="flex items-center gap-10 justify-center">
                      <div className="relative w-36 h-36 shrink-0">
                        <svg className="gauge-svg w-36 h-36 drop-shadow-md" viewBox="0 0 100 100">
                          <circle className="gauge-track" cx="50" cy="50" fill="none" r="40" strokeWidth="8" stroke="rgba(255,255,255,0.5)"></circle>
                          <circle className="gauge-fill" cx="50" cy="50" fill="none" r="40" strokeDasharray="251.2" strokeDashoffset="32" strokeWidth="8"></circle>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-5xl font-bold text-[#021f37]">87</span>
                          <span className="text-[10px] font-bold text-[#021f37]/60 uppercase tracking-widest mt-1">readiness</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-4 flex-1">
                        {readinessRows.map(row => (
                          <div key={row.label} className="w-full">
                            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
                              <span className="text-[#021f37]/80">{row.label}</span>
                              <span className="text-[#021f37]">{row.value}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-white/50 shadow-inner">
                              <div className={`h-full rounded-full bg-gradient-to-r ${row.tone} shadow-sm`} style={{ width: `${row.value}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5 mt-2">
                      <div className="glass-card bg-white/50 py-5 px-4 rounded-2xl text-center border border-white/60 shadow-sm">
                        <div className="text-4xl font-semibold text-[#021f37]">3</div>
                        <div className="text-[11px] font-bold text-[#021f37]/60 mt-1.5 uppercase tracking-wider">Docs</div>
                      </div>
                      <div className="glass-card bg-white/50 py-5 px-4 rounded-2xl text-center border border-white/60 shadow-sm">
                        <div className="text-4xl font-semibold text-[#021f37]">18</div>
                        <div className="text-[11px] font-bold text-[#021f37]/60 mt-1.5 uppercase tracking-wider">Work items</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Proof Points */}
              <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {proofPoints.map(point => (
                  <div key={point} className="flex items-center gap-3 text-[13px] font-semibold text-[#021f37]/90 bg-white/50 px-4 py-2.5 rounded-xl backdrop-blur-md border border-white/60 shadow-sm w-full">
                    <CheckCircleIcon className="h-4 w-4 shrink-0 text-[#002C4B] drop-shadow-sm" />
                    <span className="truncate">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Auth & Roles */}
          <section className="relative overflow-hidden rounded-[34px] border border-white/80 glass-card p-6 shadow-2xl sm:p-8 flex flex-col">
            <div className="flex h-full flex-col max-w-md mx-auto w-full">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    {isDemoMode ? 'Controlled product sandbox' : 'Enterprise workspace'}
                  </div>
                  <h2 className="mt-2 text-3xl font-serif text-[#021f37]">
                    {isDemoMode ? 'Choose a role' : 'Sign in'}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {isDemoMode
                      ? 'Explore role-aware Avala Assess, Avala Govern Lite, Avala Studio, Avala Delivery Lite, and Avala Monitor flows with synthetic data.'
                      : 'Use your organization account to access governed assessments, documents, delivery work, and monitor views.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
                  <KeyIcon className="h-6 w-6 text-[#002C4B]" />
                </div>
              </div>

              {isDemoMode && (
              <div className="flex-1 min-h-0 relative mb-6">
                 {/* Scrollable Role List */}
                <div className="absolute inset-0 overflow-y-auto pr-2 space-y-3">
                  {enrichedProfiles.map(profile => {
                    const user = profile.user!;
                    const isSelected = selectedUserId === profile.userId;

                    return (
                      <button
                        key={profile.userId}
                        type="button"
                        onClick={() => selectPersona(profile.userId)}
                        onDoubleClick={() => enterPersona(profile.userId)}
                        className={`group w-full rounded-2xl border p-4 text-left transition-all duration-200 ${
                          isSelected
                            ? 'border-[#ffbc03] bg-white/90 shadow-lg shadow-[#ffbc03]/20'
                            : 'border-white/60 bg-white/40 hover:-translate-y-0.5 hover:border-[#ffbc03]/70 hover:bg-white/70'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${profile.accent} text-lg font-black text-white shadow-md`}>
                            {user.name.split(' ').map(part => part[0]).join('')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-[#021f37]">{profile.label}</span>
                            </div>
                            <div className="mt-0.5 truncate text-xs font-semibold text-slate-700">{user.name} / {user.roleTitle}</div>
                            <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500">{profile.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              <form onSubmit={handleSubmit} className="mt-auto space-y-5 rounded-2xl border border-white/60 bg-white/50 p-5 shadow-inner">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Work Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (isDemoMode) {
                          const nextUser = MOCK_USERS.find(user => user.email.toLowerCase() === e.target.value.trim().toLowerCase());
                          if (nextUser) setSelectedUserId(nextUser.id);
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 text-sm font-semibold text-[#021f37] outline-none transition-all focus:border-[#ffbc03] focus:ring-2 focus:ring-[#ffbc03]/30"
                      placeholder="name@company.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/60 bg-white/80 px-4 py-3 text-sm font-semibold tracking-widest text-slate-900 outline-none transition-all focus:border-[#ffbc03] focus:ring-2 focus:ring-[#ffbc03]/30"
                      placeholder={isDemoMode ? 'Sandbox password' : 'Password'}
                      required
                    />
                  </div>
                </div>

                {isDemoMode && selectedUser && (
                  <div className="flex max-h-16 flex-wrap gap-2 overflow-hidden">
                    {(selectedUser.permissions || []).slice(0, 5).map(permission => (
                      <span key={permission} className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                        {permission}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl px-5 py-3 text-sm font-bold text-[#021f37] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg transition-transform hover:-translate-y-0.5"
                    style={{ background: 'linear-gradient(135deg, #fce08b 0%, #fcb712 100%)' }}
                  >
                    {loading ? (
                      <svg className="animate-spin h-5 w-5 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : 'Enter Workspace'}
                  </button>
                  <button
                    type="button"
                    onClick={() => enterPersona(selectedUserId)}
                    disabled={loading || !selectedUserId}
                    hidden={!isDemoMode}
                    className="glass-button-secondary rounded-xl px-5 py-3 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Enter Sandbox
                  </button>
                </div>
              </form>

              {/* Bottom Stats */}
              {isDemoMode ? (
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <BuildingOfficeIcon className="mx-auto mb-1 h-5 w-5 text-[#002C4B]" />
                  <div className="text-lg font-bold text-[#021f37]">1</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Enterprise org</div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <UsersIcon className="mx-auto mb-1 h-5 w-5 text-[#ffbc03]" />
                  <div className="text-lg font-bold text-[#021f37]">{enrichedProfiles.length}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Demo roles</div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <ChartPieIcon className="mx-auto mb-1 h-5 w-5 text-[#073B60]" />
                  <div className="text-lg font-bold text-[#021f37]">1</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Demo story</div>
                </div>
              </div>
              ) : (
              <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <BuildingOfficeIcon className="mx-auto mb-1 h-5 w-5 text-[#002C4B]" />
                  <div className="text-lg font-bold text-[#021f37]">Auth</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Configured</div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <UsersIcon className="mx-auto mb-1 h-5 w-5 text-[#ffbc03]" />
                  <div className="text-lg font-bold text-[#021f37]">RBAC</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Roles</div>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <ChartPieIcon className="mx-auto mb-1 h-5 w-5 text-[#073B60]" />
                  <div className="text-lg font-bold text-[#021f37]">Audit</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Trace</div>
                </div>
              </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
