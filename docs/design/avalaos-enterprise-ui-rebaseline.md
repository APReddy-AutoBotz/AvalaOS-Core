# AvalaOS Enterprise UI Rebaseline

## Purpose

This document records the UI-only rebaseline for the AvalaOS Core public website, sandbox entry point, and authenticated product shell. The work makes the product story legible as:

`Evidence → deterministic decision → human governance → governed artifact → delivery handoff → outcome visibility`

The implementation preserves existing view identifiers, access metadata, handlers, persistence contracts, and product decision law. It does not establish pilot, production, hosted, deployment, storage, security, certification, or compliance readiness.

## Scope and boundaries

In scope:

- Public pathname experiences for Home, Platform, Solutions, Trust & BYOK, and Sandbox/sign-in.
- A shared semantic visual language for public and authenticated surfaces.
- Authenticated information architecture: Home, Assess, Govern, Studio, Delivery, Monitor, and separate Admin.
- Read-only Govern composition using existing process and handoff projections, guarded by the existing Assess access contract.
- Home command-center and Monitor presentation improvements.
- Studio Artifact Workspace presentation, tenant/workspace projection clearing, and fail-closed action affordances.
- Responsive layout, keyboard navigation, focus treatment, skip links, semantic labels, reduced-motion handling, and product screenshot capture.
- Document-level vertical scrolling for public pages while preserving the authenticated shell's internal workspace scroll region.

Out of scope:

- New module entitlements, `View` enum values, scoring formulas, weights, thresholds, hard stops, recommendation logic, migrations, RLS, Edge functions, storage/export policy, provider execution, or server command behavior.
- Live infrastructure inspection or mutation. Deployment status remains **NOT DEPLOYED** and deployment status unknown beyond the accepted source records.
- Treating browser UI, local demo data, legacy document records, or handoff-ledger counts as server authorization or proof of readiness.

## Public experience

The public experience is separate from the authenticated shell and is selected by pathname without introducing a second application router:

| Path | Experience | Primary purpose |
| --- | --- | --- |
| `/` | Home | Explain the product law, lifecycle, differentiation, roles, and next step. |
| `/platform` | Platform | Show Assess → Govern → Studio → Delivery → Monitor with real product screenshots. |
| `/solutions` | Solutions | Connect operating problems to governed outputs without unsupported quantified claims. |
| `/trust` | Trust & BYOK | Explain provider/configuration boundaries, human governance, evidence, and proof-safe readiness language. |
| `/sandbox` | Sandbox/sign-in | Select synthetic local personas or authenticate through the existing server path. |

Public CTAs are functional: they update the pathname, reset scroll position, open the sandbox, or return to the public site. No public CTA claims execution or production availability.

## Authenticated information architecture

The sidebar preserves existing technical view identifiers while presenting the requested enterprise hierarchy:

```text
Home

Lifecycle
  Assess
  Govern
  Studio
  Delivery
  Monitor

Administration
  Admin
```

Deep destinations are grouped under their owning module. Document Vault and Studio Templates are under Studio. Board, List, Backlog, Roadmap, Calendar, Timeline, Capacity, Sprints, Delivery Pack, Timesheets, and Automations remain under Delivery.

Govern is a UI-level read-only overview. It does not add a product module or entitlement. App re-checks the existing Process Catalog access decision before rendering it, and context changes close or deny the view when that access boundary no longer permits it. Its cards use source-linked references and handoff states (`Submitted`, `Accepted`, `Completed`) without presenting them as approval evidence.

Admin remains the existing organization/workspace workbench. Its visibility and transition checks are aligned around the existing role/permission/capability presentation contract; no new authorization model is introduced.

## Shared visual language

Semantic CSS variables in `index.css` are the visual source for new UI work:

- Brand: primary navy, hover navy, yellow accent.
- Surface: page background, cards, raised controls, borders, and strong borders.
- Content: primary, muted, and subtle text.
- State: success, warning, danger, info, and focus ring.
- Geometry: control/panel radii and small/medium/large shadows.

Shared primitives:

- `PageHeader` for consistent page-level hierarchy, descriptions, actions, and metadata.
- `StatusBadge` for state labels with text and a non-color status dot.
- `.av-surface`, `.av-stat-strip`, `.av-input`, `.av-form-label`, `.av-icon-button`, and `.av-skip-link` for shared treatment.

The legacy Tailwind color aliases remain for existing surfaces; the rebaseline does not rewrite unrelated product behavior. Duplicate inline HTML CSS was removed from `index.html`; the application stylesheet remains the single CSS import authority.

## Product surfaces

### Home

`CustomDashboardView` is presented as a role-based command center. It separates attention signals, open work, review needs, handoffs, and Monitor availability from the personal task list.

### Govern

`GovernView` composes review queue, material-risk count, current ledger references, handoff state, source assumptions, and deep links to the existing Assess/Studio action surfaces. It is intentionally read-only.

### Studio

`StudioArtifactWorkspace` now leads with a business-readable committed artifact preview. Source context, artifact type, lifecycle, version history, review authority, structured JSON, rationale, conditions, and action controls are separated into a three-region layout with a sticky contextual action bar. Advanced JSON remains available under a disclosure control.

The legacy generated document repository remains visible as an explicitly **unverified projection** and is not described as the canonical private artifact surface. In local demo mode, the Artifact Workspace receives a zero-capability context so its read/command actions remain blocked while the UI and failure state can be reviewed.

Tenant/workspace context changes clear process, handoff, and Studio projections before loading the next context. Sequence guards prevent a late response from replacing a newer context’s data.

### Delivery

Operational delivery views retain their existing destinations and handlers. The rebaseline changes grouping and page hierarchy, not delivery command semantics.

### Monitor

`PortfolioView` is a read-only Monitor overview based on loaded project/task/user records. It presents disposition, risk, open work, blockers, and explicit absence of a realized outcome field. Project links continue to open the existing authorized Delivery workspace.

## Marketing screenshot inventory

Screenshots were captured from the local synthetic product using Playwright at a 1440×900 desktop viewport. They contain no browser chrome, live URLs, secrets, customer data, signed URLs, or production identifiers.

- `public/marketing/screenshots/home-command-center.png`
- `public/marketing/screenshots/assess-process-catalog.png`
- `public/marketing/screenshots/govern-workbench.png`
- `public/marketing/screenshots/studio-artifact-workspace.png`
- `public/marketing/screenshots/delivery-board.png`
- `public/marketing/screenshots/monitor-overview.png`
- `public/marketing/screenshots/admin-controls.png`

The deterministic capture entry point is `scripts/ui-rebaseline-browser-capture.mjs`. Public pages use these files with explicit dimensions, lazy loading below the fold, descriptive alt text, and a light browser-frame treatment.

## Accessibility and responsive treatment

- Public and access experiences have skip links and semantic landmarks.
- Authenticated App content has a skip link to `#app-main`.
- Sidebar buttons expose `aria-current`; mobile navigation exposes `aria-expanded`/`aria-controls`, closes on Escape/backdrop, contains focus while open, returns focus to the opener, and is hidden from pointer/focus interaction while closed.
- Repeated rendition controls include their format in the accessible name, and retention inputs are format-associated.
- Form labels, status announcements, table column headers, and focus-visible rings are retained or added.
- `prefers-reduced-motion` disables nonessential motion.
- Layouts use responsive grids, overflow wrappers, and stacked public/product sections for narrow widths.

## Verification record

Executed evidence on the rebaseline branch:

- `npm.cmd run typecheck` — passed.
- `npm.cmd run test:view-access-guard` — passed.
- `npm.cmd run test:view-state-persistence` — passed.
- `npm.cmd run test:module-journey-lifecycle` — passed.
- `npm.cmd run test:studio-private-artifacts-client` — passed: 27 client, 37 rendition UI, and 10 workspace contract assertions.
- `npm.cmd run test:requirements` — passed deterministic scoring regression; no scoring sources changed.
- `npm.cmd run test:buyer-demo-copy` — passed.
- `node scripts/ui-rebaseline-browser-capture.mjs` — passed; 7 screenshots captured.

Additional local browser scroll verification passed: the public Home reached the document bottom, and Admin Workbench reached the `#app-main` bottom without moving the outer page.

Planned verification or not run in this UI-only branch:

- Live Supabase, Storage, RLS, Edge, deployed RPC, hosted, pilot, production, and incident checks — **not run** by instruction.
- Full authenticated production-mode browser/axe/performance suite — planned verification; local screenshot capture is executed evidence for the listed local synthetic states only.
- Real deployed private-artifact RPC compatibility — planned verification; this change does not alter the canonical migration/client contract.

## Rollback and fallback

The safe rollback is to revert this single UI branch/PR. A read-only fallback is to keep existing view identifiers and action handlers while removing the new public shell and presentational wrappers. No migration rollback, credential change, endpoint disablement, storage action, or live-system intervention is required.
