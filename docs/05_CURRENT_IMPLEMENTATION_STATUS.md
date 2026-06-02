# KlarityPM Current Implementation Status

Last Updated: 2026-05-16  
Owner: Product / Engineering

## What This Doc Is

This is the only living implementation status ledger. It records what is implemented, what was previously passed, what was verified in the current pass, what is migration-ready but not live-applied, what remains pending for production readiness, current blockers, and next engineering actions.

## What This Doc Is Not

This is not the roadmap, product strategy, or requirements document. Do not duplicate future plans here unless they are needed to explain current status or the next immediate engineering action.

## 1. Overall State

Current state: production-transition build, not production ready.

The app demonstrates the intended Assess -> Docs -> Delivery -> Monitor lifecycle with Supabase-backed slices, deterministic Assess scoring, premium UI direction, seeded demo personas, release checks, Docs Forge, Delivery persistence, and handoff ledger foundations.

It still needs server-side AI/BYOK, full Docs persistence and versioning, broader API/RLS authorization, audit expansion, E2E tests, production environment hardening, observability, and enterprise controls before pilot or production use.

## 2. Completed

### Platform And Architecture

- Modular frontend structure under auth, assess, docs, delivery, and shared areas.
- Supabase client setup.
- Supabase Auth provider and organization provider.
- Seeded Acme demo organization, personas, roles, memberships, Assess catalog, and Delivery data.
- Service adapter pattern started.
- Lazy-loaded module views and vendor chunking.
- GitHub Actions CI workflow exists.
- Release scripts exist for typecheck, scoring regression, delivery policy regression, build, audit, Supabase smoke, Assess RLS regression, and migration execution.
- Hardcoded Groq fallback key and API key debug logging were removed from tracked source.
- Vulnerable `@google/genai` SDK was removed and Gemini usage moved to a lightweight REST adapter.
- `npm audit --audit-level=moderate` reports 0 vulnerabilities in the latest local check.

### UI And Product Experience

- Premium navy/amber brand direction is applied across the app.
- Logo lockup refined for current KlarityPM visual identity.
- Landing/login page supports role-based demo exploration.
- Role-aware demo personas include Executive Sponsor, Business Analyst, Project Manager, Process Owner, Developer, AI Lead, QA Reviewer, and Platform Admin.
- Left navigation was simplified around real user intent.
- Standalone Team Delivery and Insights nav items were removed because they duplicated or under-delivered value.
- Module-aware navigation supports Assess-only, Docs-only, Delivery-only, Monitor-only, or bundled workspaces.
- Lifecycle journey strip supports Assess -> Docs -> Delivery -> Monitor.

### Assess

- Deterministic multi-engine scoring exists in pure TypeScript.
- Gate Engine, readiness engines, Technology Fit, governance risk, HITL, value, confidence, final recommendation, and handoff readiness are implemented.
- Business value scoring now annualizes value from annual volume and average effort per case, derives annual manual effort, estimated saved hours, annual savings, build/run cost bands, payback band, and net first-year savings.
- Technology fit covers RPA, API Automation, Workflow, GenAI, RAG, Document Intelligence, Agentic, HITL Control Tower, Process Redesign, and Human-Led.
- Decision Pack, Handoff Pack, engine traceability, input hash, score version, scoring formula summary, and operating model recommendation exist.
- Guided Assessment UI uses the Assess enterprise question bank, confidence controls, evidence/assumption capture, reviewer overlays, and governance settings.
- Review comments, approval history, override reasons, locked metadata, and lifecycle actions exist in the Assess flow.
- Supabase migrations exist for Assess review/audit and handoff ledger.
- Transactional assessment transition RPC contract exists.
- Assess/handoff RLS regression SQL exists and has previously passed against the live Supabase project.

### Docs

- Docs Forge UI exists for generating BRD/FRD/PDD-style artifacts, diagrams, quality gates, approvals, citations, and work items.
- Docs provider/adapter boundary exists.
- Generated document save/update persists through the Docs adapter when Supabase is configured.
- Document generation repository maps Supabase rows to app models and resolves project app IDs to PostgreSQL UUIDs.
- Supabase Delivery smoke includes temporary document generation insert/update/delete coverage.
- Gemini, Groq, and OpenAI provider abstraction files exist.
- Docs-to-Delivery handoff ledger event is recorded when generated work items are imported.
- Generated work item import persists imported epics/tasks through Delivery adapter when Supabase is configured.
- Groq document generation calls the Groq chat API instead of returning static invoice demo artifacts.
- Generated documents are normalized against the selected template so required template sections are not silently dropped.
- Missing generated template sections are surfaced in the Quality Gate as explicit gaps.
- Mermaid code blocks inside generated document sections render as diagrams in the document body.
- No-source document generation produces industry baseline starter sections and validation work items instead of blank missing-section warnings.
- Generated document workspace supports section-level in-app editing, AI refinement, Word-compatible download, browser print/PDF export, and structured JSON/Markdown export.
- Generated document sections have dedicated Markdown table/list/blockquote styling instead of flat paragraph rendering.

### Delivery

- Projects, epics, sprints, tasks, task comments, and task activity history are Supabase-backed for the first delivery slice.
- Stable `app_id` mapping preserves prototype UI IDs while PostgreSQL keeps UUID primary keys.
- Delivery provider fetches projects/tasks/epics/sprints through the adapter.
- Project lifecycle updates persist through the Delivery adapter and are covered by Supabase Delivery smoke.
- Task create/update/status/sprint/delete paths route through the adapter.
- Task comments use authenticated user IDs.
- Task activity history is generated for common edits and persisted in tenant-scoped sidecar tables.
- Backlog drag/drop ordering persists through task metadata `orderRank`.
- Pure TypeScript Delivery policy layer exists for PM, BA, developer, executive, and admin task behavior.
- Dependency gates block active/done movement while predecessor tasks are unfinished.
- Reorder permissions are restricted to Project Manager/Admin/backlog manager behavior in the app policy layer.
- Timesheet entries load/save/delete through a Supabase adapter when Supabase is configured.
- Timesheet logging is guarded in the UI flow.
- Sprint status/capacity updates are wired through the Delivery adapter and provider.
- Sprint Planning start/complete actions call the persisted sprint update path.
- Board UI hides unavailable add/delete actions and disables drag for users who cannot update a task.
- Delivery role/RLS migration is authored and live-applied from this workspace.
- Docs role/RLS migration is authored and live-applied from this workspace.
- Timesheet role/RLS migration is authored and live-applied from this workspace.
- Supabase Delivery smoke test has previously passed using seeded Project Manager persona.

### Security And Release Gates

- Supabase RLS is enabled on core tables.
- Membership lookup RLS policies are applied.
- Assess review events and audit events have immutability triggers in schema.
- Task comments and activity sidecars have tenant-scoped RLS policies.
- Local deterministic scoring regression passes.
- Local Delivery policy regression passes.
- Production build passes.
- Local audit passes with 0 moderate-or-higher vulnerabilities.
- Browser-stored BYOK is disabled in the Docs Forge demo path; stale local API key storage is cleared on app load.
- OpenAI is removed from the demo provider selector and the incomplete OpenAI provider implementation is no longer active.
- AI orchestrator can route document generation and section refinement through Supabase Edge Functions when `VITE_AI_EDGE_FUNCTIONS_ENABLED=true`.
- Edge client methods exist for text extraction, generated-document export, and Decision Pack export.
- Assess cockpit has Decision Pack JSON/Markdown export actions. When Edge Functions are enabled, the action uses server-side export storage; otherwise it uses a deterministic local demo export.
- Docs workspace has generated document JSON/Markdown export actions. When Edge Functions are enabled and the generation is persisted, the action uses server-side export storage; otherwise it uses a deterministic local demo export.
- Dashboard AI insights and sprint planning no longer call browser-side providers directly; they are disabled until server-side AI workflows exist.
- AI governance/job migration contract is authored and live-applied from this workspace.
- Storage bucket migration is authored, live-applied, and verified for private source upload and export buckets.
- Supabase Edge Function source is authored for `ai-generate-document`, `ai-refine-section`, `ai-provider-test-connection`, `ai-usage-log`, `extract-document-text`, `export-document`, and `export-decision-pack`.
- Export function source supports generated-document Markdown/JSON exports and Decision Pack Markdown/JSON exports.
- Extraction function source supports text, Markdown, CSV, and JSON extraction boundaries.

## 3. Previously Passed

These checks are documented as previously passed in the project history, but were not all re-run in the current pass.

- Assess/handoff RLS regression SQL previously passed against the live Supabase project.
- Supabase Delivery smoke previously passed using seeded Project Manager persona.
- Supabase Delivery smoke previously covered temporary document generation insert/update/delete.
- Supabase Delivery smoke previously covered task comments, task activity visibility, task metadata ordering, and temporary timesheet visibility through RLS.

## 4. Verified In Current Pass

Latest verified results:

- `npm.cmd run test:scoring`: PASS for Assess annualized value, golden fixtures, monotonic tests, and polarity regressions.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd run build`: PASS.
- `npm.cmd run test`: PASS.
- `npm.cmd audit --audit-level=moderate`: NOT RUN in this pass.
- Supabase Delivery smoke test: NOT RUN in this pass.
- Supabase Delivery role smoke test: NOT RUN in this pass.
- Assess/handoff RLS regression: NOT RUN in this pass.
- Live RLS migration apply: NOT RUN in this pass.
- Supabase Storage bucket migration apply: NOT RUN in this pass.
- Supabase Storage bucket metadata verification: NOT RUN in this pass.
- Supabase Edge Function local serve/typecheck: NOT RUN.

Notes:

- Assess scoring regression now covers AP invoice automation, support summarization, HR onboarding, high-risk claims triage, low-value monitor/deprioritize, annual effort monotonicity, governance risk monotonicity, evidence confidence monotonicity, and goal-ambiguity polarity.
- `npm.cmd run test` ran typecheck, deterministic scoring regression, and delivery policy regression.
- Prior Supabase and audit checks remain documented below, but only the commands explicitly marked PASS in this current pass were re-run.
- `npm.cmd audit --audit-level=moderate` previously reported 0 vulnerabilities.
- `docs/schema/delivery_role_policies.sql`, `docs/schema/docs_role_policies.sql`, `docs/schema/timesheet_role_policies.sql`, and `docs/schema/ai_governance_jobs.sql` were applied through the Supabase session pooler connection.
- First live smoke run exposed an infinite-recursion delete policy on `tasks` and an overly strict test expectation for PostgREST zero-row RLS updates. The delivery policy SQL and role smoke test were corrected, the delivery policy was re-applied, and both live smoke tests then passed.
- Delivery smoke verified project visibility, project lifecycle update, temporary document insert/update/delete, sprint insert/update/delete, task insert/update/delete, task comments/activity visibility, timesheet insert/update, and order-rank persistence.
- Delivery role smoke verified Project Manager task insert/update, BA and Executive task update denial through RLS no-row mutation, BA comment insert, developer own-task update, and developer assignment-change denial.
- Assess/handoff RLS regression SQL was re-run and passed.
- `docs/schema/storage_buckets.sql` was applied live and verified private `source-uploads` and `klarity-exports` buckets plus org-scoped storage object policies.
- Supabase Edge Function source was not locally served or Deno typechecked because `deno` and `supabase` CLI are not installed in this workspace environment.

## 5. Migration-Ready But Not Live-Applied

- No P0 migration contracts are currently waiting for live application from this workspace.
- Future migrations are still needed for document versions, approval audit, export artifact records, evidence assets, notifications, and broader audit/event coverage.

## 6. Pending For Production Readiness

### Platform

- OpenAPI contract.
- Generated typed API client.
- TanStack Query migration for server state.
- Production fail-fast env handling.
- CI migration dry-run and automated RLS execution.
- Component and Playwright E2E tests.
- Observability, monitoring, backup/restore, and incident runbooks.

### Auth, RBAC, And Enterprise Controls

- Invitation flow.
- Password reset validation.
- OAuth, SSO/OIDC/SAML, MFA, and SCIM.
- Full role-specific API/RLS enforcement across Assess, Docs, Delivery, Monitor, and admin settings.
- Admin role management UI backed by server state.
- Audit export, read audit, retention/deletion, DPA, Privacy Policy, subprocessors list, and support access controls.

### AI And BYOK

- Move all AI calls behind backend or Edge Function boundaries.
- Remove browser API key persistence.
- Encrypted BYOK vault or key reference model.
- Server-side provider routing, prompt registry, model governance, usage audit, token/cost tracking, rate limits, retries, and prompt injection tests.
- Deployed Supabase Edge Functions for `ai-generate-document`, `ai-refine-section`, provider connection tests, usage logging, extraction, and export.
- Edge Function deployment and environment secret setup in Supabase.
- End-to-end upload/extract/export smoke tests through deployed Edge Functions.
- Complete or hide OpenAI provider from production UI until server-backed.

### Assess

- Full server/database persistence for every Assess entity.
- Evidence file upload/storage/history/access logs.
- Exportable Decision Pack. JSON/Markdown UI integration exists; branded PDF rendering is still pending.
- Additional expert-mode score trace UI for formula weights beyond the current Decision Pack formula summary.
- Server-side entitlement enforcement.
- E2E test for create process -> complete assessment -> approval -> handoff.

### Docs

- Server-side generation jobs.
- Document versions, diffing/redlines, approvals, locked baselines, and export pipeline.
- Approval audit and provider-cost tracking.
- Sanitized Markdown/Mermaid rendering path.
- Server-side DOCX/PDF export service with branded headers/footers, page numbers, diagram rendering, and approval metadata.
- Server-side PDF/DOCX text extraction for uploaded source files.
- Current extraction/export Edge Function source covers only text-like source extraction and Markdown/JSON exports until a binary extraction/rendering service is added.
- Disable or complete the OpenAI provider before production because the current provider abstraction exists but is not a real generation path.

### Delivery And Monitor

- Expand live role/RLS enforcement beyond the current Delivery, Docs, Timesheet, Assess/handoff slices.
- Add sprint create/edit UI and capacity planning controls beyond start/complete.
- Mentions and notifications.
- Delivery audit events beyond comments/activity sidecars.
- Monitor dashboards backed by persisted Assess, Docs, Delivery, value, audit, and usage events.

## 7. Current Blockers

- Browser-side AI calls and browser-stored provider keys are not acceptable for enterprise pilot or GA.
- Browser-stored provider keys are now disabled in the Docs Forge demo path, but browser-side AI calls still remain and must move behind server-side boundaries.
- Pending role/RLS migrations must be live-applied and smoke-tested.
- Docs requires server-side generation jobs, versions, approval audit, and production export.
- Monitor requires persisted lifecycle data, not only demo or derived local state.
- E2E coverage for the golden path is not yet in place.

## 8. Verification Commands

Safe local checks:

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Supabase migration/smoke checks require `DATABASE_URL`:

```powershell
npm.cmd run db:migrate -- docs/schema/delivery_role_policies.sql
npm.cmd run db:migrate -- docs/schema/docs_role_policies.sql
npm.cmd run db:migrate -- docs/schema/timesheet_role_policies.sql
npm.cmd run db:migrate -- docs/schema/ai_governance_jobs.sql
npm.cmd run test:supabase:delivery-roles
```

Current pass status for Supabase migration/smoke checks: PASS for the listed P0 checks.

Current pass status for live migration apply: PASS through the Supabase session pooler connection.

## 9. Next Recommended Engineering Actions

1. Deploy and verify Supabase Edge Functions for server-side AI, extraction, and export.
2. Add Docs versioning, approvals, and server-side DOCX/PDF export.
3. Back Monitor with persisted lifecycle and handoff events.
4. Add Playwright golden path E2E.
