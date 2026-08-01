import React, { useEffect, useMemo, useState } from 'react';
import EnterpriseAccessView from '../auth/EnterpriseAccessView';
import { AvalaAppIcon, AvalaWordmark } from '../shared/brand';
import {
  ChartPieIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  ClipboardListIcon,
  DocumentTextIcon,
  MoonIcon,
  SunIcon,
  ViewBoardsIcon,
} from '../shared/icons';

type PublicRoute = 'home' | 'platform' | 'solutions' | 'trust' | 'sandbox';
type LifecycleStage = 'assess' | 'govern' | 'studio' | 'delivery' | 'monitor';

const routeForPath = (pathname: string): PublicRoute => {
  if (pathname.startsWith('/platform')) return 'platform';
  if (pathname.startsWith('/solutions')) return 'solutions';
  if (pathname.startsWith('/trust')) return 'trust';
  if (pathname.startsWith('/sandbox') || pathname.startsWith('/sign-in')) return 'sandbox';
  return 'home';
};

const pathForRoute: Record<PublicRoute, string> = {
  home: '/',
  platform: '/platform',
  solutions: '/solutions',
  trust: '/trust',
  sandbox: '/sandbox',
};

const screenshotPaths = {
  home: '/marketing/screenshots/home-command-center.png',
  assess: '/marketing/screenshots/assess-process-catalog.png',
  govern: '/marketing/screenshots/govern-workbench.png',
  studio: '/marketing/screenshots/studio-artifact-workspace.png',
  delivery: '/marketing/screenshots/delivery-board.png',
  monitor: '/marketing/screenshots/monitor-overview.png',
  admin: '/marketing/screenshots/admin-controls.png',
} as const;

const lifecycleContent: Record<LifecycleStage, {
  label: string;
  outcome: string;
  detail: string;
  points: string[];
  screenshot: string;
}> = {
  assess: {
    label: 'Assess',
    outcome: 'Turn process evidence into a deterministic recommendation.',
    detail: 'Start with the work as it is, then make fitment and risk visible before a delivery commitment.',
    points: ['Evidence-qualified intake', 'Versioned decision packs', 'AI, workflow, RPA, and human fitment'],
    screenshot: screenshotPaths.assess,
  },
  govern: {
    label: 'Govern',
    outcome: 'Resolve material risk with a human-owned control boundary.',
    detail: 'Keep assumptions, evidence gaps, review status, and handoff readiness in view for the people accountable for the decision.',
    points: ['Review and approval context', 'Controls and evidence gaps', 'Traceable readiness for handoff'],
    screenshot: screenshotPaths.govern,
  },
  studio: {
    label: 'Studio',
    outcome: 'Prepare governed artifacts from approved source context.',
    detail: 'Create structured delivery documents and revisions while retaining source lineage, review state, and immutable version context.',
    points: ['Governed source intake', 'Human-readable artifact preview', 'Version and rendition controls'],
    screenshot: screenshotPaths.studio,
  },
  delivery: {
    label: 'Delivery',
    outcome: 'Hand approved work to the teams and tools that execute it.',
    detail: 'Make ownership, blockers, acceptance context, and evidence-backed source lineage easy to carry forward.',
    points: ['Approved work items', 'Owners and blockers', 'Delivery Pack lineage'],
    screenshot: screenshotPaths.delivery,
  },
  monitor: {
    label: 'Monitor',
    outcome: 'See readiness, value, risk, and lineage across governed work.',
    detail: 'Keep portfolio visibility honest: show what is recorded, what is blocked, and what still needs evidence.',
    points: ['Portfolio disposition', 'Readiness and blocker signals', 'Recorded outcomes and lineage'],
    screenshot: screenshotPaths.monitor,
  },
};

const moduleIcon: Record<LifecycleStage, React.FC<{ className?: string }>> = {
  assess: ClipboardListIcon,
  govern: ClipboardDocumentListIcon,
  studio: DocumentTextIcon,
  delivery: ViewBoardsIcon,
  monitor: ChartPieIcon,
};

const rolePreviews = [
  { label: 'Process Analyst', detail: 'Assessment inventory, evidence gaps, and the next decision action.', screenshot: screenshotPaths.assess },
  { label: 'Process Owner', detail: 'Review context, material risk, and approval-ready handoff status.', screenshot: screenshotPaths.govern },
  { label: 'Control Reviewer', detail: 'Controls, assumptions, and exact artifact state before approval.', screenshot: screenshotPaths.studio },
  { label: 'Delivery Lead', detail: 'Approved work, ownership, blockers, and source lineage.', screenshot: screenshotPaths.delivery },
  { label: 'Buyer / Executive', detail: 'Read-only portfolio disposition, readiness, and value visibility.', screenshot: screenshotPaths.monitor },
  { label: 'Platform Admin', detail: 'Organization authority, provider configuration, and trust surfaces.', screenshot: screenshotPaths.admin },
];

const proofPoints = [
  ['01', 'Deterministic fitment', 'Recommendations stay explainable and versioned.'],
  ['02', 'Human approval', 'Material risk remains with accountable people.'],
  ['03', 'Evidence-linked decisions', 'Claims, assumptions, and gaps stay visible.'],
  ['04', 'Traceable handoff', 'Approved context carries into delivery.'],
];

interface ProductShotProps {
  src: string;
  alt: string;
  label?: string;
  className?: string;
}

const ProductShot: React.FC<ProductShotProps> = ({ src, alt, label = 'AvalaOS product view', className = '' }) => (
  <figure className={`av-product-shot overflow-hidden rounded-[var(--av-radius-panel)] border border-white/10 bg-[#07182a] shadow-[0_24px_70px_rgba(0,23,42,0.22)] ${className}`}>
    <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d2238] px-4 py-3" aria-hidden="true">
      <span className="h-2.5 w-2.5 rounded-full bg-[#f28b82]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#f7c65d]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#72c59b]" />
      <span className="ml-2 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
    </div>
    <div className="relative aspect-[16/10] overflow-hidden bg-[#102d47]">
      <img src={src} alt={alt} loading="lazy" width="1440" height="900" className="h-full w-full object-cover object-top" />
    </div>
  </figure>
);

const PublicHeader: React.FC<{ route: PublicRoute; onNavigate: (route: PublicRoute) => void; dark: boolean; onToggleTheme: () => void }> = ({ route, onNavigate, dark, onToggleTheme }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems: Array<[PublicRoute, string]> = [['platform', 'Platform'], ['solutions', 'Solutions'], ['trust', 'Trust & BYOK']];

  const go = (next: PublicRoute) => {
    onNavigate(next);
    setMobileOpen(false);
  };

  return (
    <header className="public-header sticky top-0 z-40 border-b border-[var(--av-color-border)]/80 bg-[var(--av-color-bg)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <a href="/" onClick={event => { event.preventDefault(); go('home'); }} className="flex shrink-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--av-focus-ring)]" aria-label="AvalaOS home">
          <AvalaAppIcon className="h-9 w-9" />
          <div className="hidden min-[420px]:block">
            <AvalaWordmark className="h-7 w-[142px]" />
            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--av-color-text-subtle)]">Governed decision intelligence</p>
          </div>
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Public site">
          {navItems.map(([value, label]) => (
            <a key={value} href={pathForRoute[value]} onClick={event => { event.preventDefault(); go(value); }} aria-current={route === value ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${route === value ? 'bg-[var(--av-color-bg-subtle)] text-[var(--av-color-brand-primary)]' : 'text-[var(--av-color-text-muted)] hover:bg-[var(--av-color-bg-subtle)] hover:text-[var(--av-color-text)]'}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <button type="button" onClick={onToggleTheme} className="av-icon-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}</button>
          <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-ghost inline-flex min-h-10 items-center px-3 text-sm font-bold">Open sandbox</a>
          <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-primary inline-flex min-h-10 items-center px-4 text-sm font-bold">Sign in</a>
        </div>
        <button type="button" className="av-icon-button md:hidden" aria-label={mobileOpen ? 'Close public navigation' : 'Open public navigation'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>
          <span aria-hidden="true" className="flex w-4 flex-col gap-1"><span className="h-0.5 w-full rounded-full bg-current" /><span className="h-0.5 w-full rounded-full bg-current" /><span className="h-0.5 w-full rounded-full bg-current" /></span>
        </button>
      </div>
      {mobileOpen && (
        <nav className="border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)] px-5 py-4 md:hidden" aria-label="Mobile public site">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {navItems.map(([value, label]) => <a key={value} href={pathForRoute[value]} onClick={event => { event.preventDefault(); go(value); }} aria-current={route === value ? 'page' : undefined} className="rounded-lg px-3 py-3 text-sm font-bold text-[var(--av-color-text)] hover:bg-[var(--av-color-bg-subtle)]">{label}</a>)}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--av-color-border)] pt-3">
              <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-ghost inline-flex min-h-11 items-center justify-center text-sm font-bold">Open sandbox</a>
              <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-primary inline-flex min-h-11 items-center justify-center text-sm font-bold">Sign in</a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};

const PublicFooter: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const go = (route: PublicRoute) => onNavigate(route);
  return (
    <footer className="border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3"><AvalaAppIcon className="h-8 w-8" /><span className="font-display text-lg font-semibold tracking-[0.1em] text-[var(--av-color-text)]">AVALA<span className="text-[var(--av-color-accent)]">OS</span></span></div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--av-color-text-muted)]">Evaluate before you automate. Govern before you execute.</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--av-color-text-muted)]" aria-label="Footer">
          <a href="/platform" onClick={event => { event.preventDefault(); go('platform'); }} className="hover:text-[var(--av-color-text)]">Platform</a>
          <a href="/solutions" onClick={event => { event.preventDefault(); go('solutions'); }} className="hover:text-[var(--av-color-text)]">Solutions</a>
          <a href="/trust" onClick={event => { event.preventDefault(); go('trust'); }} className="hover:text-[var(--av-color-text)]">Trust &amp; BYOK</a>
          <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="hover:text-[var(--av-color-text)]">Sandbox / sign in</a>
        </nav>
      </div>
    </footer>
  );
};

const LifecycleTour: React.FC = () => {
  const [active, setActive] = useState<LifecycleStage>('assess');
  const current = lifecycleContent[active];
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="lifecycle-title">
      <div className="max-w-2xl"><p className="av-eyebrow">The governed lifecycle</p><h2 id="lifecycle-title" className="av-public-heading mt-3">One connected path from evidence to outcome visibility.</h2><p className="mt-5 text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS keeps every decision connected to the work that follows, while leaving execution with the systems and teams already authorized to perform it.</p></div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <div className="flex flex-col gap-2" role="tablist" aria-label="AvalaOS lifecycle stages">
          {(Object.keys(lifecycleContent) as LifecycleStage[]).map((stage, index) => {
            const Icon = moduleIcon[stage];
            const selected = active === stage;
            return <button key={stage} type="button" role="tab" aria-selected={selected} aria-controls={`lifecycle-panel-${stage}`} onClick={() => setActive(stage)} className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition ${selected ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-surface)] shadow-[var(--av-shadow-sm)]' : 'border-transparent hover:border-[var(--av-color-border)] hover:bg-[var(--av-color-surface)]'}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? 'bg-[var(--av-color-brand-primary)] text-white' : 'bg-[var(--av-color-bg-subtle)] text-[var(--av-color-text-muted)]'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold text-[var(--av-color-text)]"><span className="text-xs font-semibold text-[var(--av-color-text-subtle)]">0{index + 1}</span>{lifecycleContent[stage].label}</span><span className="mt-1 block text-sm leading-5 text-[var(--av-color-text-muted)]">{lifecycleContent[stage].outcome}</span></span><ChevronRightIcon className={`h-4 w-4 shrink-0 transition ${selected ? 'text-[var(--av-color-accent)]' : 'text-[var(--av-color-text-subtle)] group-hover:translate-x-0.5'}`} /></button>;
          })}
        </div>
        <div id={`lifecycle-panel-${active}`} role="tabpanel" aria-label={`${current.label} overview`} className="av-public-panel overflow-hidden p-3 sm:p-5">
          <ProductShot src={current.screenshot} alt={`${current.label} view in AvalaOS`} label={`Avala ${current.label}`} />
          <div className="grid gap-5 p-2 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(210px,0.7fr)] sm:p-4 sm:pt-7"><div><p className="av-eyebrow">{current.label}</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">{current.outcome}</h3><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{current.detail}</p></div><ul className="space-y-3 text-sm font-semibold text-[var(--av-color-text)]">{current.points.map(point => <li key={point} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{point}</li>)}</ul></div>
        </div>
      </div>
    </section>
  );
};

const HomePage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const [role, setRole] = useState(rolePreviews[0]);
  return <>
    <main>
      <section className="av-public-hero overflow-hidden"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center lg:gap-16 lg:py-24"><div><p className="av-eyebrow">Governed AI and automation decision intelligence</p><h1 className="av-display-title mt-5 max-w-2xl">Evaluate before you automate.<br /><span>Govern before you execute.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS turns process evidence into deterministic recommendations, human-approved controls, governed artifacts, and traceable delivery handoffs.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => onNavigate('platform')} className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-bold">Explore the platform <ChevronRightIcon className="h-4 w-4" /></button><button type="button" onClick={() => onNavigate('sandbox')} className="btn-ghost inline-flex min-h-12 items-center justify-center px-5 text-sm font-bold">Open sandbox</button></div><p className="mt-5 text-xs font-semibold text-[var(--av-color-text-subtle)]">Synthetic sandbox available for product exploration. No live execution.</p></div><ProductShot src={screenshotPaths.home} alt="AvalaOS Home command center showing attention, governed handoffs, and next actions" label="AvalaOS Home · AP Invoice Exception Handling" className="lg:translate-y-3" /></div></section>
      <section className="border-y border-[var(--av-color-border)] bg-[var(--av-color-surface)]"><div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[var(--av-color-border)] px-5 sm:grid-cols-2 sm:px-8 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{proofPoints.map(([number, title, detail]) => <div key={title} className="flex gap-3 px-0 py-5 sm:px-6 lg:py-6 first:sm:pl-0 last:sm:pr-0"><span className="font-mono text-xs font-bold text-[var(--av-color-accent)]">{number}</span><div><p className="text-sm font-bold text-[var(--av-color-text)]">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">{detail}</p></div></div>)}</div></section>
      <LifecycleTour />
      <section className="border-y border-[var(--av-color-border)] bg-[var(--av-color-surface)]"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:py-28"><div><p className="av-eyebrow">Decision layer, not a task list</p><h2 className="av-public-heading mt-3">Make the right work visible before execution begins.</h2><p className="mt-5 text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS sits around execution tools as a governed decision and delivery layer. It helps teams decide what should be automated, govern how risk is resolved, prepare approved work, and monitor what is ready.</p><div className="mt-7 grid gap-3 sm:grid-cols-2">{['Decide what should be automated', 'Resolve risk and evidence', 'Prepare approved delivery context', 'Monitor readiness and lineage'].map(item => <div key={item} className="flex gap-2 text-sm font-bold text-[var(--av-color-text)]"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{item}</div>)}</div></div><div className="av-public-panel p-6"><p className="av-eyebrow">What AvalaOS owns</p><div className="mt-5 space-y-4">{[['Evidence', 'Source context, assumptions, and claims'], ['Decision', 'Deterministic fitment and recommendation'], ['Governance', 'Human review and material-risk approval'], ['Handoff', 'Structured artifacts and traceable delivery context']].map(([title, detail], index) => <div key={title} className="flex gap-4 border-b border-[var(--av-color-border)] pb-4 last:border-0 last:pb-0"><span className="font-mono text-xs font-bold text-[var(--av-color-accent)]">0{index + 1}</span><div><p className="font-bold text-[var(--av-color-text)]">{title}</p><p className="mt-1 text-sm leading-6 text-[var(--av-color-text-muted)]">{detail}</p></div></div>)}</div></div></div></section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="role-preview-title"><div className="max-w-2xl"><p className="av-eyebrow">Explore by responsibility</p><h2 id="role-preview-title" className="av-public-heading mt-3">A clear next action for every governed role.</h2></div><div className="mt-10 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{rolePreviews.map(preview => <button type="button" key={preview.label} onClick={() => setRole(preview)} aria-pressed={role.label === preview.label} className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm font-bold transition lg:w-full ${role.label === preview.label ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-surface)] text-[var(--av-color-text)] shadow-sm' : 'border-transparent text-[var(--av-color-text-muted)] hover:border-[var(--av-color-border)] hover:bg-[var(--av-color-surface)]'}`}>{preview.label}</button>)}</div><div className="av-public-panel grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-center"><ProductShot src={role.screenshot} alt={`${role.label} view in AvalaOS`} label={role.label} /><div><p className="av-eyebrow">{role.label}</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">See the work that matters to you.</h3><p className="mt-3 text-sm leading-6 text-[var(--av-color-text-muted)]">{role.detail} Every surface stays tied to the same evidence, authority, and lifecycle context.</p><button type="button" onClick={() => onNavigate('sandbox')} className="btn-ghost mt-6 inline-flex min-h-10 items-center gap-2 px-3 text-sm font-bold">Open the sandbox <ChevronRightIcon className="h-4 w-4" /></button></div></div></div></section>
      <section className="av-trust-band"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24"><div><p className="av-eyebrow text-amber-300">Enterprise control over models, evidence, and decisions</p><h2 className="mt-4 max-w-xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Designed for customer-controlled model access and human governance.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Provider configuration, explicit runtime boundaries, review separation, audit context, and fail-closed states are visible parts of the current source foundation. Deployment and hosted readiness remain explicit boundaries.</p><button type="button" onClick={() => onNavigate('trust')} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-bold text-white hover:bg-white/10">Read the trust model <ChevronRightIcon className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2">{['Provider choice', 'Customer-controlled configuration', 'Human approval', 'Evidence and audit', 'Authority checks where supported', 'Fail-closed states where supported'].map(item => <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-bold text-slate-100">{item}</div>)}</div></div></section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24"><div className="flex flex-col gap-6 rounded-[var(--av-radius-panel)] border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between"><div><p className="av-eyebrow">Start with the decision</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[var(--av-color-text)]">Explore how AvalaOS connects evidence to governed delivery.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => onNavigate('platform')} className="btn-primary inline-flex min-h-11 items-center justify-center px-4 text-sm font-bold">Explore platform</button><button type="button" onClick={() => onNavigate('sandbox')} className="btn-ghost inline-flex min-h-11 items-center justify-center px-4 text-sm font-bold">Open sandbox</button></div></div></section>
    </main>
  </>;
};

const PlatformPage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const sections: Array<[LifecycleStage, string, string]> = [
    ['assess', 'Avala Assess', 'Process intake, deterministic fitment, Decision Packs, and application portfolio assessment where implemented.'],
    ['govern', 'Avala Govern', 'Review, controls, evidence, assumptions, approval context, and governed handoff readiness.'],
    ['studio', 'Avala Studio', 'Governed source intake, structured artifacts, human review, immutable versions, and private renditions where authorized.'],
    ['delivery', 'Avala Delivery', 'Approved work, ownership, blockers, Delivery Packs, and source lineage for the teams that execute.'],
    ['monitor', 'Avala Monitor', 'Portfolio visibility across disposition, value signals, risk, blockers, readiness, and lineage.'],
  ];
  return <main><section className="av-public-hero"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><p className="av-eyebrow">Platform tour</p><h1 className="av-display-title mt-5 max-w-4xl">The decision and delivery layer around execution.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS connects the evidence, decision, governance, artifact, delivery, and visibility surfaces teams need before an execution system takes over.</p></div></section><div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">{sections.map(([stage, title, description], index) => { const item = lifecycleContent[stage]; return <section key={stage} className={`grid gap-10 border-b border-[var(--av-color-border)] py-16 last:border-0 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24 ${index % 2 ? 'lg:[&>div:first-child]:order-2' : ''}`}><ProductShot src={item.screenshot} alt={`${title} product view in AvalaOS`} label={title} /><div><p className="av-eyebrow">0{index + 1} · {item.label}</p><h2 className="av-public-heading mt-3">{title}</h2><p className="mt-5 text-lg leading-8 text-[var(--av-color-text-muted)]">{description}</p><ul className="mt-7 space-y-3 text-sm font-bold text-[var(--av-color-text)]">{item.points.map(point => <li key={point} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{point}</li>)}</ul></div></section>; })}<section className="rounded-[var(--av-radius-panel)] bg-[#07182a] p-7 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">The AvalaOS architecture story</p><div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">{['Evidence', 'Deterministic decision', 'Human governance', 'Governed artifact', 'Delivery handoff', 'Outcome visibility'].map((item, index) => <React.Fragment key={item}><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-center text-sm font-bold text-white">{item}</div>{index < 5 && <ChevronRightIcon className="mx-auto hidden h-4 w-4 shrink-0 text-amber-300 md:block" />}</React.Fragment>)}</div></section><div className="mt-10 flex justify-center"><button type="button" onClick={() => onNavigate('sandbox')} className="btn-primary inline-flex min-h-11 items-center px-5 text-sm font-bold">Explore the sandbox</button></div></div></main>;
};

const SolutionsPage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const solutions = [
    ['Automation and AI opportunity assessment', 'Teams need a defensible way to decide where automation, AI, workflow, RPA, or human review belongs.', 'Evidence → deterministic fitment → Decision Pack', screenshotPaths.assess],
    ['Application modernization and AI readiness', 'Portfolio leaders need to see system constraints, dependencies, controls, and evidence gaps before selecting a path.', 'Application context → readiness evidence → governed disposition', screenshotPaths.monitor],
    ['Governed delivery preparation', 'Delivery teams need approved context and clear ownership without losing the reasoning that led to the work.', 'Approved decision → governed artifact → source-linked work', screenshotPaths.studio],
    ['Portfolio governance and evidence visibility', 'Executives need honest readiness, risk, blocker, and outcome visibility that does not manufacture certainty.', 'Handoff lineage → readiness signals → recorded outcomes', screenshotPaths.monitor],
  ];
  return <main><section className="av-public-hero"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><p className="av-eyebrow">Solutions</p><h1 className="av-display-title mt-5 max-w-4xl">Start with the operating problem, then govern the work that follows.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS gives transformation, automation, governance, and delivery leaders one evidence-backed path from decision quality to handoff.</p></div></section><div className="mx-auto grid max-w-7xl gap-6 px-5 pb-20 sm:px-8 md:grid-cols-2 lg:pb-28">{solutions.map(([title, problem, flow, screenshot], index) => <article key={title} className="av-public-panel overflow-hidden"><ProductShot src={screenshot} alt={`${title} product view in AvalaOS`} label={`Solution 0${index + 1}`} className="rounded-none border-0 shadow-none" /><div className="p-6 sm:p-7"><p className="av-eyebrow">0{index + 1}</p><h2 className="mt-3 text-xl font-bold text-[var(--av-color-text)]">{title}</h2><p className="mt-3 text-sm leading-6 text-[var(--av-color-text-muted)]">{problem}</p><p className="mt-5 border-t border-[var(--av-color-border)] pt-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--av-color-brand-primary)]">{flow}</p></div></article>)}</div><section className="av-trust-band"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="av-eyebrow text-amber-300">A governed starting point</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">Explore the platform with synthetic data.</h2></div><button type="button" onClick={() => onNavigate('sandbox')} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#07182a] hover:bg-amber-100">Open sandbox</button></div></section></main>;
};

const TrustPage: React.FC = () => <main><section className="av-public-hero"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24"><p className="av-eyebrow">Trust &amp; BYOK</p><h1 className="av-display-title mt-5 max-w-4xl">Control the model boundary. Keep the decision boundary human.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS is designed around explicit authority, evidence, deterministic policy, and human review. Provider configuration and deployment are visible boundaries, not marketing footnotes.</p></div></section><div className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28"><section className="grid gap-6 lg:grid-cols-2"><div className="av-public-panel p-7 sm:p-9"><p className="av-eyebrow">Control model</p><h2 className="mt-3 text-2xl font-bold text-[var(--av-color-text)]">Evidence flows into a governed decision.</h2><div className="mt-8 space-y-3">{['Evidence and assumptions', 'Deterministic scoring and recommendation', 'Human review for material risk', 'Governed artifact and handoff', 'Readiness, value, and blocker visibility'].map((item, index) => <div key={item} className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--av-color-brand-primary)] text-xs font-bold text-white">{index + 1}</span><span className="text-sm font-bold text-[var(--av-color-text)]">{item}</span></div>)}</div></div><div className="rounded-[var(--av-radius-panel)] bg-[#07182a] p-7 sm:p-9"><p className="av-eyebrow text-amber-300">Architecture boundary</p><div className="mt-8 flex flex-wrap items-center gap-2 text-sm font-bold text-white">{['Provider choice', 'Server-side secret boundary', 'Policy + authority', 'Audit context'].map((item, index) => <React.Fragment key={item}><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">{item}</span>{index < 3 && <ChevronRightIcon className="h-4 w-4 text-amber-300" />}</React.Fragment>)}</div><p className="mt-8 text-sm leading-6 text-slate-300">BYOK-ready architecture means approved model providers can be configured under enterprise control where the current source foundation and deployment configuration support it. AvalaOS does not claim that every provider, environment, or deployment path is already available.</p></div></section><section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[['Human-governed boundaries', 'AI may draft or transform content; it does not decide scores, risk gates, approvals, or regulated decisions.'], ['Authority boundary', 'The browser presents projections and existing actions. Current source surfaces retain their configured access, lifecycle, and version checks where supported; hosted readiness is not implied.'], ['Claim-safe readiness', 'Deployment, hosted validation, pilot, production, certification, and compliance claims remain explicit and configuration-dependent.'], ['Review separation', 'Review and approval are distinct governance concepts where the current source contract supports them.'], ['Evidence and audit', 'Claims, assumptions, receipts, and source references are kept visible as part of decision quality.'], ['Fail-closed states', 'Offline, stale, revoked, read-only, blocked, and reload-failure states are presented without silent success where the current source surface supports the state.']].map(([title, detail]) => <article key={title} className="av-public-panel p-6"><h2 className="text-base font-bold text-[var(--av-color-text)]">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{detail}</p></article>)}</section><p className="mx-auto mt-12 max-w-3xl text-center text-sm leading-6 text-[var(--av-color-text-muted)]">AvalaOS is a governance and decision layer around execution tools. It is not an RPA runtime, autonomous agent runner, or Jira replacement.</p></div></main>;

const PublicWebsite: React.FC = () => {
  const [route, setRoute] = useState<PublicRoute>(() => routeForPath(window.location.pathname));
  const [dark, setDark] = useState(() => window.localStorage.getItem('avalaos-public-theme') === 'dark');

  useEffect(() => {
    const handlePopState = () => setRoute(routeForPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    window.localStorage.setItem('avalaos-public-theme', dark ? 'dark' : 'light');
    document.title = route === 'home' ? 'AvalaOS Core | Governed AI and Automation Decision Intelligence' : `AvalaOS Core | ${route === 'trust' ? 'Trust & BYOK' : route[0].toUpperCase() + route.slice(1)}`;
  }, [dark, route]);

  const navigate = (nextRoute: PublicRoute) => {
    const nextPath = pathForRoute[nextRoute];
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const content = useMemo(() => {
    if (route === 'sandbox') return <EnterpriseAccessView />;
    if (route === 'platform') return <PlatformPage onNavigate={navigate} />;
    if (route === 'solutions') return <SolutionsPage onNavigate={navigate} />;
    if (route === 'trust') return <TrustPage />;
    return <HomePage onNavigate={navigate} />;
  }, [route]);

  if (route === 'sandbox') return content;
  return <div className="public-site min-h-screen bg-[var(--av-color-bg)] text-[var(--av-color-text)]"><a href="#public-main" className="av-skip-link">Skip to content</a><PublicHeader route={route} onNavigate={navigate} dark={dark} onToggleTheme={() => setDark(value => !value)} /><div id="public-main">{content}</div><PublicFooter onNavigate={navigate} /></div>;
};

export default PublicWebsite;
