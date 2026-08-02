# AvalaOS Enterprise UI Rebaseline

## Purpose

This document records the presentation-focused rebaseline for the AvalaOS Core public website, sandbox entry point, and authenticated product shell, together with the limited client context-safety work required to prevent stale tenant-scoped projections from remaining visible.

The product story is:

`Evidence → deterministic decision → human governance → governed artifact → delivery handoff → outcome visibility`

The implementation preserves product decision law, scoring, server command behavior, RLS, migrations, storage/export policy, and provider boundaries. It does not establish pilot, production, hosted, deployment, storage, security, certification, or compliance readiness.

## Scope and boundaries

In scope:

- Public pathname experiences for Home, Platform, Solutions, Trust & BYOK, and Sandbox/sign-in.
- A shared semantic visual language for public and authenticated surfaces.
- Authenticated information architecture: Home, Assess, Govern, Studio, Delivery, Monitor, and separate Admin.
- A read-only Govern presentation resolved through current user, organization, workspace, session, permission, and server-capability context.
- Home command-center, Assess catalog, Studio, Delivery, Monitor, Application Portfolio, and Admin presentation improvements.
- Studio recoverability for validation, provider, authorization, context, version-conflict, offline, and projection-reload failure states.
- Immediate clearing and sequence-gated loading of client process and handoff projections when tenant context is missing or changes.
- An isolated synthetic marketing-capture build that is unavailable in a normal production build.
- Responsive layout, keyboard navigation, focus treatment, skip links, semantic labels, reduced-motion handling, vertical scrolling, screenshot capture, and print/PDF output.

Out of scope:

- New entitlements, `View` enum values, scoring formulas, weights, thresholds, hard stops, recommendation logic, migrations, RLS, Edge functions, storage/export policy, provider execution, or server command behavior.
- Live infrastructure inspection or mutation. The accepted deployment disposition remains **NOT DEPLOYED**; this work adds no deployment-readiness proof.
- Treating routes, browser state, local demo data, synthetic capture data, legacy document records, cached permissions, or handoff counts as server authorization.
- A durable routed Govern destination. Govern remains shell state in this PR; a dedicated route is a follow-up if product scope authorizes it.

## Public experience

The public experience is separate from the authenticated shell and is selected by pathname without introducing a second application router:

| Path | Experience | Primary purpose |
| --- | --- | --- |
| `/` | Home | Explain the product law, lifecycle, differentiation, roles, and next step. |
| `/platform` | Platform | Show Assess → Govern → Studio → Delivery → Monitor with product captures. |
| `/solutions` | Solutions | Connect operating problems to governed outputs without unsupported quantified claims. |
| `/trust` | Trust & BYOK | Explain provider boundaries, human governance, evidence, and proof-safe readiness language. |
| `/sandbox` | Sandbox/sign-in | Select synthetic local personas or authenticate through the existing server path. |

Public CTAs update the pathname, reset scroll position, open the access experience, or return to the public site. The shared access CTA is `Access AvalaOS`. Local-demo access is identified as synthetic; enterprise access asks the user to sign in to an organization. No public CTA claims execution or production availability.

The Home print layout includes a static five-stage lifecycle so the product law remains legible without interactive tabs. Public CTA bands and interactive chrome are omitted from print.

## Authenticated information architecture and authority

The sidebar preserves existing technical view identifiers while presenting the enterprise hierarchy:

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

Deep destinations remain grouped under their owning module. Document Vault and Studio Templates are under Studio. Board, List, Backlog, Roadmap, Calendar, Timeline, Capacity, Sprints, Delivery Pack, Timesheets, and Automations remain under Delivery.

Govern is a read-only presentation, not a new product entitlement. Its dedicated resolver verifies that:

- the current user, organization, workspace, and server-issued session context agree;
- the authority projection is current, online, and not revoked;
- the required view capability is present without mutating the user object; and
- a context change or denial closes the Govern presentation.

For presentation only, a verified server capability of `assess.read` satisfies the existing Assess review-view requirement. This does not synthesize a permission, does not modify `user.permissions`, and does not authorize any mutation. Unrelated capabilities do not grant the view, and all command authority remains server-gated.

Govern cards use source-linked references and handoff states (`Submitted`, `Accepted`, `Completed`) without presenting those states as approval evidence. Admin remains the existing organization/workspace workbench; no new authorization model is introduced.

## Shared visual language

Semantic CSS variables in `index.css` are the visual source for new UI work:

- Brand: primary navy, hover navy, yellow accent.
- Surface: page background, cards, raised controls, borders, and strong borders.
- Content: primary, muted, and subtle text.
- State: success, warning, danger, info, and focus ring.
- Geometry: control/panel radii and small/medium/large shadows.

Shared primitives include `PageHeader`, `StatusBadge`, `.av-surface`, `.av-stat-strip`, `.av-input`, `.av-form-label`, `.av-icon-button`, and `.av-skip-link`. The existing `ArchitectureFlow` remains cohesive and was retained; this pass did not add an unnecessary extraction layer.

The legacy Tailwind aliases remain for existing surfaces. Duplicate inline HTML CSS was removed from `index.html`; the application stylesheet remains the CSS import authority.

## Product surfaces

### Home

`CustomDashboardView` is a role-based command center separating attention signals, open work, review needs, handoffs, Monitor availability, and personal tasks.

### Govern

`GovernView` composes review queue, material-risk count, ledger references, handoff state, source assumptions, and links to existing Assess/Studio surfaces. It is intentionally read-only and exposes capture-state density without creating command authority.

### Studio

`StudioArtifactWorkspace` leads with a business-readable committed artifact preview. Source context, artifact type, lifecycle, version history, review authority, structured JSON, rationale, conditions, and action controls are separated into a three-region layout with a sticky contextual action bar.

Invalid structured JSON is field-scoped, marked with `aria-invalid`, and immediately clears when corrected; no command is issued for invalid input. The last committed projection remains visible when a provider request, pre-commit command, version check, authorization check, connectivity check, or committed-projection reload fails. Recoverable alerts explain the failure and expose a safe reload action where applicable. A committed projection is cleared only for a genuine identity/context change.

The legacy generated-document repository remains an explicitly **unverified projection** and is not described as the canonical private-artifact surface. In local demo mode, Artifact Workspace receives no command capability, so mutation and private-download controls remain blocked.

### Client context safety

Process and handoff services clear their current presentation immediately when organization/workspace context is absent or changes. Request sequence gates prevent a late response for tenant A from replacing tenant B's projection. Scoped responses are not persisted in browser storage. This is limited client presentation safety, not a replacement for server authorization or tenant isolation.

### Delivery and Monitor

Delivery destinations and handlers are unchanged. `PortfolioView` is a read-only Monitor overview based on loaded project/task/user records and explicitly distinguishes disposition, risk, blockers, open work, and the absence of a realized-outcome field. Project links continue to use the existing authorized Delivery workspace.

## Isolated marketing capture

Eight synthetic product screenshots are committed at a 1440×900 viewport:

- `public/marketing/screenshots/home-command-center.png`
- `public/marketing/screenshots/assess-process-catalog.png`
- `public/marketing/screenshots/govern-workbench.png`
- `public/marketing/screenshots/studio-artifact-workspace.png`
- `public/marketing/screenshots/application-portfolio-readiness.png`
- `public/marketing/screenshots/delivery-board.png`
- `public/marketing/screenshots/monitor-overview.png`
- `public/marketing/screenshots/admin-controls.png`

The captures contain no browser chrome, localhost URL, secret, customer data, signed URL, or production identifier. Application Portfolio uses a populated, read-only synthetic readiness state. Studio uses decoder-validated synthetic tenant scope, ancestry, hashes, lifecycle, and reviewer context.

In a production-mode build, capture fixtures are reachable only when `VITE_AVALA_MARKETING_CAPTURE=true` is injected by `npm run build:marketing-capture`; development and test modes may exercise the same policy for deterministic verification. The capture command enters `/sandbox?capture=<scenario>`, requires the build marker, verifies fixture density and read-only state, resets every relevant scroll container, and then captures the image. A normal production build ignores/removes the capture query and passes `npm run verify:marketing-capture-isolation`.

Commands:

```text
npm run build:marketing-capture
npm run capture:ui-rebaseline
npm run build
npm run verify:marketing-capture-isolation
```

## Accessibility, responsive behavior, and scrolling

- Public/access experiences and the authenticated App expose skip links and semantic landmarks.
- Sidebar buttons expose `aria-current`; mobile navigation exposes `aria-expanded`/`aria-controls`, traps focus while open, closes on Escape/backdrop, restores focus, and is inert while closed.
- Repeated rendition controls include their format in the accessible name, and retention inputs are format-associated.
- Form labels, status announcements, table headers, and focus-visible rings are retained or added.
- `prefers-reduced-motion` disables nonessential motion.
- Responsive grids, overflow wrappers, and stacked layouts cover phone through wide-desktop widths.
- Public pages scroll at the document level. Authenticated content scrolls within `#app-main`; the fixed header/sidebar remain stable while the complete public, product, and Admin content remains reachable.

The final responsive verifier covers seven viewports, including 1366×768, with 70 route/theme/viewport captures. It checks critical/serious axe findings, horizontal overflow, vertical reachability, mobile focus behavior, lifecycle keyboard operation, and skip-link focus.

## Print/PDF treatment

Print is A4 with 12 mm margins, auto-height roots, no fixed/sticky chrome, no skipped CTA content, atomic decision/role cards, atomic Platform stage sections, a compact two-column Trust control grid, and a compact footer. Home uses an in-band AvalaOS signoff to avoid a footer-only page. Generated PDF browser headers and footers are disabled.

`npm run verify:print` checks auto-height, fixed-position removal, hidden interactive content, lifecycle availability, image readiness, compact footer behavior, content gaps, and minimum PDF size. Final generated PDFs were rendered and visually inspected:

| Route | Pages | Result |
| --- | ---: | --- |
| Home | 4 | Populated; no blank or footer-only page. |
| Platform | 7 | One coherent lifecycle stage per flow; no orphaned heading. |
| Solutions | 4 | Populated; no clipping. |
| Trust & BYOK | 2 | Compact control grid; no clipping. |

## Executed verification

Executed on the PR branch:

- `npm ci` — passed; 201 packages audited with 0 vulnerabilities reported.
- `npm audit --audit-level=moderate` — passed with 0 vulnerabilities.
- `npm test` — passed, including typecheck, deterministic scoring, access/state, authority, context-safety, capture-policy, buyer, security, supplemental, Edge typecheck, and PR1A–PR1E gates.
- `npm run test:pr1f` and `npm run test:pr1g` — passed.
- `npm run test:studio-artifacts` — passed: 31 command, 12 generation, 13 DB, 5 RPC, 3 provider, 17 client, 6 validation, and 16 workspace assertions/scenarios.
- `npm run test:studio-artifacts-coverage` — passed at 99.31% lines, 91.61% branches, and 97.14% functions.
- `npm run test:studio-private-artifacts` — passed, including 27 client, 37 rendition UI, and 16 workspace assertions.
- `npm run test:studio-private-artifacts-coverage` — passed: 69 scenarios, 100% lines/functions and 93.67% branches for the private command surface.
- `npm run test:ai-boundary-static` — passed with zero forbidden hits and zero stale allowlist entries.
- `npm run test:secret-hygiene` — passed with zero forbidden hits and zero tracked `.env` files.
- Retained browser config — 34/34 passed across desktop and mobile.
- PR1D browser config — 36/36 passed across desktop and mobile.
- PR1E browser config — 2/2 passed across desktop and mobile.
- PR1F browser config — 2/2 passed across desktop and mobile.
- PR1G browser config — 4/4 passed across desktop and mobile.
- Studio governed-artifact browser config — 14/14 passed across desktop and mobile.
- Studio private-artifact browser config — 30/30 passed across desktop and Pixel 7.
- `npm run verify:ui-rebaseline` — passed 70 route/theme/viewport captures.
- `npm run verify:print` — passed for Home, Platform, Solutions, and Trust & BYOK.
- `npm run capture:ui-rebaseline` — passed for all eight isolated synthetic screenshots.

The browser total is 122 passing test invocations across retained and dedicated configurations. Expected mocked network failures used to prove fail-closed behavior remain visible in console evidence but do not fail the suites.

Not run and not implied:

- Live Supabase, Storage, RLS, Edge, deployed RPC, hosted, pilot, production, deployment, or incident checks.
- Real deployed private-artifact compatibility or readiness proof.

## Rollback and fallback

The safe rollback is to revert PR #219. The read-only fallback is to keep the existing view identifiers, server contracts, and action handlers while removing the public shell, capture-only fixture wiring, and presentational wrappers. Client sequence guards can be reverted independently if an integration issue is found, but doing so would restore the stale-presentation risk they close.

No migration rollback, credential change, endpoint disablement, storage action, or live-system intervention is required.
