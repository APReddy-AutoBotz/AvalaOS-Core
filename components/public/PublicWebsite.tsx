import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  applicationPortfolio: '/marketing/screenshots/application-portfolio-readiness.png',
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
  variant?: 'hero' | 'feature' | 'compact';
}

const ProductShot: React.FC<ProductShotProps> = ({
  src,
  alt,
  label = 'AvalaOS product view',
  className = '',
  variant = 'feature',
}) => {
  const showChrome = variant === 'hero';
  return (
    <figure className={`av-product-shot av-product-shot--${variant} ${className}`}>
      {showChrome && (
        <div className="av-product-shot__chrome" aria-hidden="true">
          <span className="av-product-shot__dot av-product-shot__dot--red" />
          <span className="av-product-shot__dot av-product-shot__dot--amber" />
          <span className="av-product-shot__dot av-product-shot__dot--green" />
          <span className="av-product-shot__label">{label}</span>
        </div>
      )}
      <div className="av-product-shot__media">
        <img
          src={src}
          alt={alt}
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          fetchPriority={variant === 'hero' ? 'high' : 'auto'}
          width="1440"
          height="900"
          sizes={variant === 'hero' ? '(min-width: 1024px) 52vw, 100vw' : '(min-width: 1024px) 48vw, 100vw'}
        />
      </div>
      {!showChrome && label && <figcaption className="av-product-shot__caption">{label}</figcaption>}
    </figure>
  );
};

const PublicHeader: React.FC<{
  route: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
  dark: boolean;
  onToggleTheme: () => void;
}> = ({ route, onNavigate, dark, onToggleTheme }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const navItems: Array<[PublicRoute, string]> = [
    ['platform', 'Platform'],
    ['solutions', 'Solutions'],
    ['trust', 'Trust & BYOK'],
  ];

  const go = (next: PublicRoute) => {
    onNavigate(next);
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const menu = mobileMenuRef.current;
    const focusable = (): HTMLElement[] => Array.from(menu?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []) as HTMLElement[];
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.classList.add('av-public-menu-open');
    document.addEventListener('keydown', handleKeyDown);
    focusable()[0]?.focus();
    return () => {
      document.body.classList.remove('av-public-menu-open');
      document.removeEventListener('keydown', handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  return (
    <header className="public-header sticky top-0 z-40 border-b border-[var(--av-color-border)]/80 bg-[var(--av-color-bg)]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <a href="/" onClick={event => { event.preventDefault(); go('home'); }} className="flex shrink-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--av-focus-ring)]" aria-label="AvalaOS home">
          <AvalaAppIcon className="h-9 w-9" />
          <div className="hidden min-[520px]:block">
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
          <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-primary inline-flex min-h-10 items-center px-4 text-sm font-bold">Access AvalaOS</a>
        </div>
        <button ref={menuButtonRef} type="button" className="av-icon-button md:hidden" aria-label={mobileOpen ? 'Close public navigation' : 'Open public navigation'} aria-expanded={mobileOpen} aria-controls="public-mobile-menu" onClick={() => setMobileOpen(open => !open)}>
          <span aria-hidden="true" className="flex w-4 flex-col gap-1"><span className="h-0.5 w-full rounded-full bg-current" /><span className="h-0.5 w-full rounded-full bg-current" /><span className="h-0.5 w-full rounded-full bg-current" /></span>
        </button>
      </div>
      {mobileOpen && (
        <nav ref={mobileMenuRef} id="public-mobile-menu" className="border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)] px-5 py-4 md:hidden" aria-label="Mobile public site">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {navItems.map(([value, label]) => <a key={value} href={pathForRoute[value]} onClick={event => { event.preventDefault(); go(value); }} aria-current={route === value ? 'page' : undefined} className="rounded-lg px-3 py-3 text-sm font-bold text-[var(--av-color-text)] hover:bg-[var(--av-color-bg-subtle)]">{label}</a>)}
            <div className="mt-2 border-t border-[var(--av-color-border)] pt-3">
              <a href="/sandbox" onClick={event => { event.preventDefault(); go('sandbox'); }} className="btn-primary inline-flex min-h-11 w-full items-center justify-center text-sm font-bold">Access AvalaOS</a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
};

const PublicFooter: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => (
  <footer className="public-footer border-t border-[var(--av-color-border)] bg-[var(--av-color-surface)]">
    <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-3"><AvalaAppIcon className="h-8 w-8" /><span className="font-display text-lg font-semibold tracking-[0.1em] text-[var(--av-color-text)]">AVALA<span className="text-[var(--av-color-accent)]">OS</span></span></div>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--av-color-text-muted)]">Evaluate before you automate. Govern before you execute.</p>
      </div>
      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--av-color-text-muted)]" aria-label="Footer">
        <a href="/platform" onClick={event => { event.preventDefault(); onNavigate('platform'); }} className="hover:text-[var(--av-color-text)]">Platform</a>
        <a href="/solutions" onClick={event => { event.preventDefault(); onNavigate('solutions'); }} className="hover:text-[var(--av-color-text)]">Solutions</a>
        <a href="/trust" onClick={event => { event.preventDefault(); onNavigate('trust'); }} className="hover:text-[var(--av-color-text)]">Trust &amp; BYOK</a>
        <a href="/sandbox" onClick={event => { event.preventDefault(); onNavigate('sandbox'); }} className="hover:text-[var(--av-color-text)]">Access AvalaOS</a>
      </nav>
    </div>
  </footer>
);

const LifecycleTour: React.FC = () => {
  const [active, setActive] = useState<LifecycleStage>('assess');
  const current = lifecycleContent[active];
  const stages = Object.keys(lifecycleContent) as LifecycleStage[];
  const move = (direction: 1 | -1) => {
    const nextIndex = (stages.indexOf(active) + direction + stages.length) % stages.length;
    setActive(stages[nextIndex]);
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="lifecycle-title">
      <div className="max-w-2xl"><p className="av-eyebrow">The governed lifecycle</p><h2 id="lifecycle-title" className="av-public-heading mt-3">One connected path from evidence to outcome visibility.</h2><p className="mt-5 text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS keeps every decision connected to the work that follows, while leaving execution with the systems and teams already authorized to perform it.</p></div>
      <div className="av-lifecycle-interactive mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <div className="flex flex-col gap-2" role="tablist" aria-label="AvalaOS lifecycle stages" aria-orientation="vertical">
          {stages.map((stage, index) => {
            const Icon = moduleIcon[stage];
            const selected = active === stage;
            return <button key={stage} type="button" role="tab" tabIndex={selected ? 0 : -1} aria-selected={selected} aria-controls={`lifecycle-panel-${stage}`} onClick={() => setActive(stage)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); move(-1); } else if (event.key === 'Home') { event.preventDefault(); setActive(stages[0]); } else if (event.key === 'End') { event.preventDefault(); setActive(stages[stages.length - 1]); } }} className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition ${selected ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-surface)] shadow-[var(--av-shadow-sm)]' : 'border-transparent hover:border-[var(--av-color-border)] hover:bg-[var(--av-color-surface)]'}`}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${selected ? 'bg-[var(--av-color-brand-primary)] text-white' : 'bg-[var(--av-color-bg-subtle)] text-[var(--av-color-text-muted)]'}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold text-[var(--av-color-text)]"><span className="text-xs font-semibold text-[var(--av-color-text-subtle)]">0{index + 1}</span>{lifecycleContent[stage].label}</span><span className="mt-1 block text-sm leading-5 text-[var(--av-color-text-muted)]">{lifecycleContent[stage].outcome}</span></span><ChevronRightIcon className={`h-4 w-4 shrink-0 transition ${selected ? 'text-[var(--av-color-accent)]' : 'text-[var(--av-color-text-subtle)] group-hover:translate-x-0.5'}`} /></button>;
          })}
        </div>
        <div id={`lifecycle-panel-${active}`} role="tabpanel" aria-label={`${current.label} overview`} className="av-public-panel overflow-hidden p-3 sm:p-5">
          <ProductShot variant="feature" src={current.screenshot} alt={`${current.label} view in AvalaOS`} label={`Avala ${current.label}`} />
          <div className="grid gap-5 p-2 pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(210px,0.7fr)] sm:p-4 sm:pt-7"><div><p className="av-eyebrow">{current.label}</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">{current.outcome}</h3><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{current.detail}</p></div><ul className="space-y-3 text-sm font-semibold text-[var(--av-color-text)]">{current.points.map(point => <li key={point} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{point}</li>)}</ul></div>
        </div>
      </div>
      <ol className="av-lifecycle-print" aria-label="AvalaOS five-stage lifecycle print summary">
        {stages.map((stage, index) => <li key={stage}><span>0{index + 1}</span><div><strong>{lifecycleContent[stage].label}</strong><p>{lifecycleContent[stage].outcome}</p></div></li>)}
      </ol>
    </section>
  );
};

const HomePage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const [role, setRole] = useState(rolePreviews[0]);
  return (
    <main>
      <section className="av-public-hero overflow-hidden"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-14 lg:py-20"><div><p className="av-eyebrow">Governed decision intelligence</p><h1 className="av-display-title av-home-title mt-5">Evaluate before you automate. <span>Govern before you execute.</span></h1><p className="mt-6 max-w-[42rem] text-base leading-7 text-[var(--av-color-text-muted)] sm:text-lg sm:leading-8">Evidence becomes a deterministic recommendation, human approval, a governed artifact, and a traceable delivery handoff.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => onNavigate('platform')} className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm font-bold">Explore the platform <ChevronRightIcon className="h-4 w-4" /></button><button type="button" onClick={() => onNavigate('sandbox')} className="btn-ghost inline-flex min-h-12 items-center justify-center px-5 text-sm font-bold">Access AvalaOS</button></div><p className="mt-5 text-xs font-semibold text-[var(--av-color-text-subtle)]">Synthetic sandbox for product exploration. No live execution.</p></div><ProductShot variant="hero" src={screenshotPaths.home} alt="AvalaOS Home command center showing attention, governed handoffs, and next actions" label="AvalaOS Home - AP Invoice Exception Handling" className="lg:translate-y-2" /></div></section>
      <section className="border-y border-[var(--av-color-border)] bg-[var(--av-color-surface)]"><div className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-[var(--av-color-border)] px-5 sm:grid-cols-2 sm:px-8 sm:divide-x sm:divide-y-0 lg:grid-cols-4">{proofPoints.map(([number, title, detail]) => <div key={title} className="flex gap-3 px-0 py-5 sm:px-6 lg:py-6 first:sm:pl-0 last:sm:pr-0"><span className="font-mono text-xs font-bold text-[var(--av-color-accent)]">{number}</span><div><p className="text-sm font-bold text-[var(--av-color-text)]">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">{detail}</p></div></div>)}</div></section>
      <LifecycleTour />
      <section className="av-print-atomic-section border-y border-[var(--av-color-border)] bg-[var(--av-color-surface)]"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20"><div className="max-w-3xl"><p className="av-eyebrow">Decision boundary</p><h2 className="av-public-heading mt-3">AvalaOS governs the decision. Authorized systems execute the work.</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">The product makes evidence, deterministic policy, human authority, and governed handoff visible before execution begins.</p></div><div className="av-boundary-grid mt-10"><article className="av-boundary-card"><p className="av-eyebrow">AvalaOS governs</p><h3 className="mt-3 text-xl font-bold text-[var(--av-color-text)]">Decision quality and controlled handoff</h3><ul className="mt-5 space-y-3 text-sm font-semibold text-[var(--av-color-text-muted)]">{['Evidence and assumptions', 'Deterministic fitment and recommendation', 'Human review and material-risk approval', 'Governed artifacts, lineage, and readiness'].map(item => <li key={item} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{item}</li>)}</ul></article><article className="av-boundary-card av-boundary-card--execution"><p className="av-eyebrow">Execution systems execute</p><h3 className="mt-3 text-xl font-bold text-[var(--av-color-text)]">Authorized workflow and delivery platforms</h3><ul className="mt-5 space-y-3 text-sm font-semibold text-[var(--av-color-text-muted)]">{['Workflow, RPA, agent, and delivery platforms', 'Organization-owned operational permissions', 'Approved work accepted by accountable teams', 'Recorded outcomes returned to governed visibility'].map(item => <li key={item} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{item}</li>)}</ul></article></div></div></section>
      <section className="av-print-atomic-section mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="role-preview-title"><div className="max-w-2xl"><p className="av-eyebrow">Explore by responsibility</p><h2 id="role-preview-title" className="av-public-heading mt-3">A clear next action for every governed role.</h2></div><div className="mt-10 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{rolePreviews.map(preview => <button type="button" key={preview.label} onClick={() => setRole(preview)} aria-pressed={role.label === preview.label} className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm font-bold transition lg:w-full ${role.label === preview.label ? 'border-[var(--av-color-brand-primary)] bg-[var(--av-color-surface)] text-[var(--av-color-text)] shadow-sm' : 'border-transparent text-[var(--av-color-text-muted)] hover:border-[var(--av-color-border)] hover:bg-[var(--av-color-surface)]'}`}>{preview.label}</button>)}</div><div className="av-public-panel grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-center"><ProductShot variant="compact" src={role.screenshot} alt={`${role.label} view in AvalaOS`} label={role.label} /><div><p className="av-eyebrow">{role.label}</p><h3 className="mt-2 text-xl font-bold text-[var(--av-color-text)]">{role.label} command center</h3><p className="mt-3 text-sm leading-6 text-[var(--av-color-text-muted)]">{role.detail} The surface stays tied to the same evidence, authority, and lifecycle context.</p><p className="mt-5 text-xs font-semibold text-[var(--av-color-text-subtle)]">Synthetic product preview. No live execution.</p></div></div></div></section>
      <section className="av-trust-band"><div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-16"><div><p className="av-eyebrow text-amber-300">Human control at the model boundary</p><h2 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Make authority, evidence, and provider boundaries visible.</h2><p className="mt-4 max-w-xl text-base leading-7 text-slate-300">Control surfaces are explicit in the product experience; provider and deployment availability remains configuration-dependent.</p><button type="button" onClick={() => onNavigate('trust')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-bold text-white hover:bg-white/10">Read the trust model <ChevronRightIcon className="h-4 w-4" /></button></div><div className="grid gap-3 sm:grid-cols-2">{['Provider choice', 'Server-side secret boundary', 'Human authority', 'Evidence and audit', 'Review separation', 'Fail-closed behavior'].map(item => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100"><CheckCircleIcon className="h-4 w-4 shrink-0 text-amber-300" />{item}</div>)}</div></div><div className="av-print-home-signoff"><AvalaAppIcon className="h-6 w-6" /><div><strong>AVALAOS</strong><p>Evaluate before you automate. Govern before you execute.</p></div></div></section>
      <section className="av-print-hide mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16"><div className="flex flex-col gap-5 rounded-[var(--av-radius-panel)] border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="av-eyebrow">Start with the decision</p><h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight text-[var(--av-color-text)]">Explore how evidence becomes governed delivery context.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => onNavigate('platform')} className="btn-primary inline-flex min-h-11 items-center justify-center px-4 text-sm font-bold">Explore platform</button><button type="button" onClick={() => onNavigate('sandbox')} className="btn-ghost inline-flex min-h-11 items-center justify-center px-4 text-sm font-bold">Access AvalaOS</button></div></div></section>
    </main>
  );
};

const ArchitectureFlow: React.FC<{ items: string[]; label: string }> = ({ items, label }) => (
  <ol className={`av-architecture-flow av-architecture-flow--${items.length}`} aria-label={label}>
    {items.map((item, index) => <li key={item} className="av-architecture-step"><span className="av-architecture-step__number">0{index + 1}</span><span>{item}</span></li>)}
  </ol>
);

const PlatformPage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => {
  const sections: Array<[LifecycleStage, string, string]> = [
    ['assess', 'Avala Assess', 'Process intake, deterministic fitment, Decision Packs, and application portfolio assessment.'],
    ['govern', 'Avala Govern', 'Review, controls, evidence, assumptions, approval context, and governed handoff readiness.'],
    ['studio', 'Avala Studio', 'Governed source intake, structured artifacts, human review, immutable versions, and private renditions.'],
    ['delivery', 'Avala Delivery', 'Approved work, ownership, blockers, Delivery Packs, and source lineage for the teams that execute.'],
    ['monitor', 'Avala Monitor', 'Portfolio visibility across disposition, value signals, risk, blockers, readiness, and lineage.'],
  ];
  return <main><section className="av-public-hero"><div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20"><p className="av-eyebrow">Platform tour</p><h1 className="av-display-title av-public-page-title mt-5 max-w-6xl">The decision and delivery layer around execution.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS connects evidence, deterministic decisioning, human governance, governed artifacts, delivery handoff, and outcome visibility before an execution system takes over.</p><p className="mt-5 max-w-2xl text-sm font-semibold leading-6 text-[var(--av-color-text-subtle)]">Availability note: provider, deployment, and private export surfaces remain explicit and configuration-dependent.</p></div></section><div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-20">{sections.map(([stage, title, description], index) => { const item = lifecycleContent[stage]; return <section key={stage} className={`av-platform-stage grid gap-8 border-b border-[var(--av-color-border)] py-14 last:border-0 lg:grid-cols-2 lg:items-center lg:gap-14 lg:py-20 ${index % 2 ? 'lg:[&>div:first-child]:order-2' : ''}`}><ProductShot variant="feature" src={item.screenshot} alt={`${title} product view in AvalaOS`} label={title} /><div><p className="av-eyebrow">0{index + 1} - {item.label}</p><h2 className="av-public-heading mt-3">{title}</h2><p className="mt-5 text-lg leading-8 text-[var(--av-color-text-muted)]">{description}</p><ul className="mt-7 space-y-3 text-sm font-bold text-[var(--av-color-text)]">{item.points.map(point => <li key={point} className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--av-color-success)]" />{point}</li>)}</ul></div></section>; })}<section className="av-architecture-panel"><p className="av-eyebrow text-amber-300">The AvalaOS architecture story</p><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">A connected evidence-to-outcome path keeps authority and handoff context visible across the lifecycle.</p><ArchitectureFlow label="AvalaOS architecture flow" items={['Evidence', 'Deterministic decision', 'Human governance', 'Governed artifact', 'Delivery handoff', 'Outcome visibility']} /></section><div className="mt-8 flex justify-center"><button type="button" onClick={() => onNavigate('sandbox')} className="btn-primary inline-flex min-h-11 items-center px-5 text-sm font-bold">Explore the sandbox</button></div></div></main>;
};

const solutions = [
  { title: 'Automation and AI opportunity assessment', problem: 'Teams need a defensible way to decide where automation, AI, workflow, RPA, or human review belongs.', flow: ['Evidence', 'Deterministic fitment', 'Decision Pack'], screenshot: screenshotPaths.assess },
  { title: 'Application modernization and AI readiness', problem: 'Portfolio leaders need to see system constraints, dependencies, controls, and evidence gaps before selecting a path.', flow: ['Application context', 'Readiness evidence', 'Governed disposition'], screenshot: screenshotPaths.applicationPortfolio },
  { title: 'Governed delivery preparation', problem: 'Delivery teams need approved context and clear ownership without losing the reasoning that led to the work.', flow: ['Approved decision', 'Governed artifact', 'Source-linked work'], screenshot: screenshotPaths.studio },
  { title: 'Portfolio governance and evidence visibility', problem: 'Executives need honest readiness, risk, blocker, and outcome visibility that does not manufacture certainty.', flow: ['Handoff lineage', 'Readiness signals', 'Recorded outcomes'], screenshot: screenshotPaths.monitor },
] as const;

const SolutionsPage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => (
  <main>
    <section className="av-public-hero">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <p className="av-eyebrow">Solutions</p>
        <h1 className="av-display-title av-public-page-title mt-5 max-w-6xl">Start with the operating problem. Govern the work that follows.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS gives transformation and delivery leaders one evidence-backed path from opportunity assessment to governed handoff.</p>
      </div>
    </section>
    <div className="mx-auto max-w-7xl space-y-6 px-5 pb-16 sm:px-8 lg:space-y-8 lg:pb-20">
      {solutions.map((solution, index) => (
        <article key={solution.title} className="av-solution-row">
          <div className={index % 2 ? 'lg:order-2' : ''}><ProductShot variant="feature" src={solution.screenshot} alt={`${solution.title} product view in AvalaOS`} label={solution.title} /></div>
          <div className={`p-6 sm:p-8 lg:p-10 ${index % 2 ? 'lg:order-1' : ''}`}>
            <p className="av-eyebrow">Solution 0{index + 1}</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-[var(--av-color-text)]">{solution.title}</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[var(--av-color-text-muted)]">{solution.problem}</p>
            <ol className="av-mini-flow mt-7" aria-label={`${solution.title} path`}>{solution.flow.map((step, stepIndex) => <li key={step}><span>{stepIndex + 1}</span>{step}{stepIndex < solution.flow.length - 1 && <ChevronRightIcon className="h-4 w-4 text-[var(--av-color-accent)]" aria-hidden="true" />}</li>)}</ol>
          </div>
        </article>
      ))}
    </div>
    <section className="av-print-hide av-trust-band">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-14">
        <div><p className="av-eyebrow text-amber-300">A governed starting point</p><h2 className="mt-3 font-display text-3xl font-semibold text-white">Explore the platform with synthetic data.</h2></div>
        <button type="button" onClick={() => onNavigate('sandbox')} className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center px-5 text-sm font-bold">Explore the synthetic sandbox</button>
      </div>
    </section>
  </main>
);

const TrustPage: React.FC<{ onNavigate: (route: PublicRoute) => void }> = ({ onNavigate }) => (
  <main>
    <section className="av-public-hero">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <p className="av-eyebrow">Trust &amp; BYOK</p>
        <h1 className="av-display-title av-public-page-title mt-5 max-w-6xl">Control the model boundary. Keep the decision boundary human.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--av-color-text-muted)]">AvalaOS makes authority, evidence, deterministic policy, human review, provider configuration, and deployment boundaries explicit.</p>
      </div>
    </section>
    <div className="mx-auto max-w-7xl space-y-8 px-5 pb-16 sm:px-8 lg:space-y-10 lg:pb-20">
      <section className="av-trust-control-grid grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="av-public-panel p-6 sm:p-8"><p className="av-eyebrow">Control model</p><h2 className="mt-3 text-2xl font-bold text-[var(--av-color-text)]">Evidence flows into a governed decision.</h2><ArchitectureFlow label="AvalaOS governed control model" items={['Evidence and assumptions', 'Deterministic policy', 'Human review', 'Governed handoff', 'Outcome visibility']} /></div>
        <div className="av-architecture-panel"><p className="av-eyebrow text-amber-300">Architecture boundary</p><ArchitectureFlow label="AvalaOS model boundary" items={['Provider choice', 'Server-side secret boundary', 'Policy + authority', 'Audit context']} /><p className="mt-7 text-sm leading-6 text-slate-300">Provider and environment availability remains explicit and configuration-dependent.</p></div>
      </section>
      <section className="av-public-panel p-6 sm:p-8"><p className="av-eyebrow">BYOK direction</p><h2 className="mt-3 text-2xl font-bold text-[var(--av-color-text)]">Provider configuration stays under an explicit boundary.</h2><p className="mt-4 max-w-4xl text-base leading-7 text-[var(--av-color-text-muted)]">Approved model providers can be configured under enterprise control when supported by the selected deployment. Provider and environment availability remains explicit and configuration-dependent.</p></section>
      <section>
        <div className="max-w-2xl"><p className="av-eyebrow">Control surfaces</p><h2 className="mt-3 text-2xl font-bold text-[var(--av-color-text)]">Six controls keep the decision boundary legible.</h2></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[
          ['Human authority', 'Accountable people retain approval and material-risk decisions.'],
          ['Model and secret boundary', 'Provider configuration and secrets stay outside the browser decision surface.'],
          ['Review separation', 'Review and approval remain distinct governance steps where the contract supports them.'],
          ['Evidence and audit', 'Claims, assumptions, receipts, and source references stay visible.'],
          ['Fail-closed behavior', 'Stale, offline, revoked, read-only, and blocked states do not become silent success.'],
          ['Deployment transparency', 'Provider, environment, hosted, and deployment availability remains explicit.'],
        ].map(([title, detail]) => <article key={title} className="av-public-panel p-5"><div className="flex gap-3"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--av-color-success)]" /><div><h3 className="text-base font-bold text-[var(--av-color-text)]">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--av-color-text-muted)]">{detail}</p></div></div></article>)}</div>
      </section>
      <section className="av-print-hide rounded-[var(--av-radius-panel)] border border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] p-6 sm:p-8">
        <p className="max-w-4xl text-base leading-7 text-[var(--av-color-text-muted)]">AvalaOS governs the decisions, artifacts, and handoffs around execution. Authorized execution remains in the organization&apos;s workflow, RPA, agent, and delivery platforms.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => onNavigate('sandbox')} className="btn-primary inline-flex min-h-11 items-center justify-center px-5 text-sm font-bold">Explore the synthetic sandbox</button><button type="button" onClick={() => onNavigate('platform')} className="btn-ghost inline-flex min-h-11 items-center justify-center px-5 text-sm font-bold">View the platform</button></div>
      </section>
    </div>
  </main>
);

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
    if (route === 'trust') return <TrustPage onNavigate={navigate} />;
    return <HomePage onNavigate={navigate} />;
  }, [route]);

  if (route === 'sandbox') return content;
  return <div className={`public-site public-site--${route} min-h-screen bg-[var(--av-color-bg)] text-[var(--av-color-text)]`}><a href="#public-main" className="av-skip-link">Skip to content</a><PublicHeader route={route} onNavigate={navigate} dark={dark} onToggleTheme={() => setDark(value => !value)} /><div id="public-main">{content}</div><PublicFooter onNavigate={navigate} /></div>;
};

export default PublicWebsite;
