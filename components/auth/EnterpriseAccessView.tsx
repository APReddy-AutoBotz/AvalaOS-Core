import React, { useMemo, useState } from 'react';
import { MOCK_LOGIN_PROFILES, MOCK_USERS } from '../../data/mockData';
import { CheckCircleIcon, KeyIcon, UsersIcon } from '../shared/icons';
import { AvalaAppIcon, AvalaWordmark } from '../shared/brand';
import { useAuth } from './AuthProvider';
import { getRuntimeBoundaryError, isLocalRuntimeEnabled } from '../../services/supabaseClient';

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

  const selectPersona = (userId: string) => {
    const profile = MOCK_LOGIN_PROFILES.find(item => item.userId === userId);
    const user = MOCK_USERS.find(item => item.id === userId);
    if (!profile || !user) return;
    setSelectedUserId(userId);
    setEmail(user.email);
    setPassword(profile.password);
    setError(null);
  };

  const enterPersona = async () => {
    const profile = MOCK_LOGIN_PROFILES.find(item => item.userId === selectedUserId);
    const user = MOCK_USERS.find(item => item.id === selectedUserId);
    if (!profile || !user) return;
    await submitLogin(user.email, profile.password);
  };

  const returnToSite = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="access-page min-h-screen bg-[var(--av-color-bg)] text-[var(--av-color-text)]">
      <a href="#access-main" className="av-skip-link">Skip to access</a>
      <header className="border-b border-[var(--av-color-border)] bg-[var(--av-color-surface)]">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <button type="button" onClick={returnToSite} className="flex items-center gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-[var(--av-focus-ring)]" aria-label="Return to AvalaOS public site">
            <AvalaAppIcon className="h-9 w-9" />
            <div className="hidden min-[420px]:block"><AvalaWordmark className="h-7 w-[142px]" /><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--av-color-text-subtle)]">Explore the platform</p></div>
          </button>
          <button type="button" onClick={returnToSite} className="btn-ghost min-h-10 px-3 text-sm font-bold">Back to public site</button>
        </div>
      </header>

      <main id="access-main" className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(390px,0.72fr)] lg:items-center lg:gap-20 lg:py-16">
        <section aria-labelledby="access-title" className="max-w-2xl">
          <p className="av-eyebrow">{isDemoMode ? 'Controlled product sandbox' : 'Enterprise workspace'}</p>
          <h1 id="access-title" className="av-display-title mt-4">{isDemoMode ? 'Explore the product by role.' : 'Sign in to your enterprise workspace.'}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--av-color-text-muted)]">{isDemoMode ? 'Choose a synthetic persona to see how the same governed lifecycle adapts to assessment, review, delivery, executive visibility, and platform administration.' : 'Use your organization account to access the governed workspace. Your organization configuration and server-issued session determine what is available.'}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {['Deterministic decisions', 'Human review', 'Traceable handoff'].map(item => <div key={item} className="av-public-panel flex items-center gap-2 p-4 text-sm font-bold"><CheckCircleIcon className="h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{item}</div>)}
          </div>
          <div className="av-public-panel mt-5 p-5"><p className="av-eyebrow">Product boundaries</p><div className="mt-3 grid gap-2 text-sm font-bold text-[var(--av-color-text)] sm:grid-cols-2"><span>Editable review drafts</span><span>Readiness, lineage, blockers</span><span>Monitor readiness, lineage, blocker, and value signals</span><span>Human sign-off</span><span>Provider-aware controls</span></div><p className="mt-4 text-xs leading-5 text-[var(--av-color-text-muted)]">AvalaOS does not execute bots, RPA jobs, agents, or external systems from this exploration surface.</p></div>
          <p className="mt-7 text-sm leading-6 text-[var(--av-color-text-muted)]">{isDemoMode ? 'Sandbox data is synthetic and local to this product exploration. No live systems or external execution are involved.' : 'Use your organization account to access governed assessments, documents, delivery work, and monitor views.'}</p>
        </section>

        <section aria-labelledby="entry-title" className="av-public-panel p-5 shadow-[var(--av-shadow-md)] sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--av-color-border)] pb-5"><div><p className="av-eyebrow">{isDemoMode ? 'Synthetic data only' : 'Server-authenticated access'}</p><h2 id="entry-title" className="mt-2 text-2xl font-bold text-[var(--av-color-text)]">{isDemoMode ? 'Choose a role' : 'Sign in securely'}</h2></div><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--av-color-bg-subtle)] text-[var(--av-color-brand-primary)]"><KeyIcon className="h-5 w-5" /></span></div>

          {isDemoMode ? (
            <div className="pt-5">
              <div role="group" aria-label="Choose a sandbox persona" className="grid gap-2.5 sm:grid-cols-2">
                {enrichedProfiles.map(profile => {
                  const user = profile.user!;
                  const isSelected = selectedUserId === profile.userId;
                  const initials = user.name.split(' ').map(part => part[0]).join('');
                  return <button key={profile.userId} type="button" aria-pressed={isSelected} onClick={() => selectPersona(profile.userId)} className={`min-h-[96px] rounded-xl border p-3 text-left transition ${isSelected ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-bg-subtle)] shadow-sm' : 'border-[var(--av-color-border)] bg-[var(--av-color-surface)] hover:border-[var(--av-color-border-strong)] hover:bg-[var(--av-color-bg-subtle)]'}`}><span className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--av-color-brand-primary)] text-xs font-bold text-white dark:text-[#001b2f]">{initials}</span><span className="min-w-0"><span className="block text-xs font-bold text-[var(--av-color-text)]">{profile.label}</span><span className="mt-1 block truncate text-[11px] font-semibold text-[var(--av-color-text-muted)]">{user.name}</span><span className="mt-1 block text-[10px] leading-4 text-[var(--av-color-text-subtle)]">{profile.description}</span></span></span></button>;
                })}
              </div>
              {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
              <div className="mt-5 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--av-color-brand-primary)] text-sm font-bold text-white dark:text-[#001b2f]"><UsersIcon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--av-color-text)]">{selectedProfile?.user?.name}</p><p className="truncate text-xs text-[var(--av-color-text-muted)]">{selectedProfile?.user?.roleTitle}</p></div></div><button type="button" onClick={enterPersona} disabled={loading || !selectedUserId} className="btn-primary mt-4 flex min-h-11 w-full items-center justify-center text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Opening sandbox…' : `Enter sandbox as ${selectedProfile?.label || 'selected role'}`}</button></div>
            </div>
          ) : (
            <form onSubmit={event => { event.preventDefault(); void submitLogin(); }} className="pt-6">
              {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
              <div className="space-y-4"><div><label htmlFor="work-email" className="av-form-label">Work email</label><input id="work-email" type="email" value={email} onChange={event => setEmail(event.target.value)} className="av-input mt-2" placeholder="name@company.com" autoComplete="email" required /></div><div><label htmlFor="workspace-password" className="av-form-label">Password</label><input id="workspace-password" type="password" value={password} onChange={event => setPassword(event.target.value)} className="av-input mt-2" placeholder="Password" autoComplete="current-password" required /></div></div>
              <button type="submit" disabled={loading} className="btn-primary mt-5 flex min-h-11 w-full items-center justify-center text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in to AvalaOS'}</button>
              <p className="mt-4 text-center text-xs leading-5 text-[var(--av-color-text-subtle)]">Authentication and session authority remain unchanged. Access is subject to your organization configuration.</p>
            </form>
          )}
        </section>
      </main>
    </div>
  );
};

export default EnterpriseAccessView;
