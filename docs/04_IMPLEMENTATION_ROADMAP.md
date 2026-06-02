# KlarityPM Implementation Roadmap

Last Updated: 2026-05-08  
Owner: Product / Engineering

## What This Doc Is

This doc defines the ordered implementation roadmap for taking KlarityPM from production-transition build to investor demo, enterprise pilot, beta, and GA readiness.

## What This Doc Is Not

This is not the implementation status ledger. It describes priority and sequence. Current reality lives in `05_CURRENT_IMPLEMENTATION_STATUS.md`.

## Phase 0: Documentation And Product Baseline

Priority: P0.

- Consolidate docs into canonical structure.
- Archive duplicates.
- Update README/index.
- Define golden path.
- Freeze uncontrolled feature expansion.
- Keep only credible modules in the main product narrative.

Acceptance:

- Canonical documentation set exists: one index plus six narrative docs.
- Superseded docs are archived.
- README points to the canonical docs.
- Product direction is clear for founder, developer, investor, and enterprise buyer review.

## Phase 1: Immediate Technical Hardening

Priority: P0.

- Apply live `delivery_role_policies.sql`.
- Apply live `docs_role_policies.sql`.
- Apply live `timesheet_role_policies.sql`.
- Run delivery role smoke tests.
- Add production fail-fast env handling.
- Hide or complete incomplete OpenAI provider.
- Remove or disable unsafe client-side BYOK from demo and pilot paths.

Acceptance:

- Live Supabase policies match the authored role/RLS policy files.
- Smoke tests pass after migration.
- Demo/pilot paths do not expose unsafe or incomplete AI provider setup.

Phase 1 -> Phase 2 gate:

Do not proceed to Funding Demo Readiness unless:

- Pending RLS migrations are applied or explicitly marked as a demo-only limitation.
- Delivery role smoke tests are run or clearly marked NOT RUN.
- Unsafe browser BYOK is hidden/disabled in demo path.
- Incomplete OpenAI provider is hidden or completed.
- Main navigation has no broken primary-flow placeholders.

## Phase 2: Funding Demo Readiness

Priority: P1.

- Polish one seeded enterprise scenario.
- Ensure Assess -> Docs -> Delivery -> Monitor works smoothly.
- Add/export Decision Pack.
- Validate Assess business value using annualized effort, scoring formula summary, and golden fixtures.
- Polish Docs Forge output.
- Ensure imported backlog has lineage.
- Make Monitor leadership-grade.
- Hide broken or placeholder screens.

Acceptance:

- Investor Demo Mode can tell one complete enterprise story without manual explanation.
- Monitor clearly shows what is moving, blocked, risky, and valuable.
- Docs output is credible, structured, editable, and exportable.

Phase 2 -> Phase 3 gate:

Do not proceed to Enterprise Pilot Readiness unless:

- Golden path works end-to-end.
- Decision Pack export exists.
- Assess scoring uses annualized value math and passes golden fixture regressions.
- Docs output is credible and exportable.
- Backlog import has lineage.
- Monitor shows persisted or clearly traceable lifecycle data.
- Demo-only data assumptions are clearly separated from real tenant behavior.

## Phase 3: Enterprise Pilot Readiness

Priority: P1.

- Real org onboarding.
- Invitation flow.
- Server-side AI provider execution.
- Encrypted BYOK/key reference model.
- Evidence upload/access logging.
- Document versioning.
- Basic audit export.
- Playwright E2E golden path.
- Observability/error tracking.
- Security buyer checklist.

Acceptance:

- A real enterprise pilot can be configured without demo-only assumptions.
- Tenant isolation and role enforcement are demonstrable.
- AI usage is server-side, logged, governed, and not dependent on browser-stored keys.

Phase 3 -> Phase 4 gate:

Do not proceed to Enterprise Beta unless:

- Real org onboarding works.
- Invitation flow works.
- Tenant isolation is demonstrated.
- Server-side AI is implemented.
- Encrypted BYOK/key reference model exists.
- Critical audit events exist.
- Playwright golden path E2E exists.
- Security buyer checklist exists.

## Phase 4: Enterprise Beta

Priority: P2.

- SSO/OIDC/SAML if first enterprise customer requires it.
- Advanced RBAC.
- Retention/deletion workflow.
- Admin role management.
- Jira or Azure DevOps integration, choose only one initially.
- Backup/restore runbook.
- Incident response runbook.

Acceptance:

- The product can pass deeper buyer security and IT review for a controlled beta.
- One external delivery integration works reliably with handoff lineage.

## Phase 5: Enterprise GA

Priority: P2.

- SCIM.
- SIEM export.
- DLP/PII detection.
- Load testing.
- Accessibility audit.
- Compliance documentation.
- Multi-region/data residency options if needed.

Acceptance:

- KlarityPM has the controls, evidence, runbooks, and operational maturity expected for enterprise GA.

## Recommended Implementation Order

1. Finish documentation baseline and README.
2. Apply pending RLS migrations and run smoke tests.
3. Hide incomplete provider/module paths.
4. Move AI execution behind server-side boundaries.
5. Add Decision Pack and Docs export.
6. Back Monitor with persisted lifecycle and handoff events.
7. Add golden path Playwright E2E.
8. Add enterprise admin/security controls.

## P0 Engineering Plan

### 1. Apply Pending Live RLS Migrations

- [x] `docs/schema/delivery_role_policies.sql`.
- [x] `docs/schema/docs_role_policies.sql`.
- [x] `docs/schema/timesheet_role_policies.sql`.
- [x] `docs/schema/ai_governance_jobs.sql`.
- [x] `docs/schema/storage_buckets.sql`.

Current status: applied from this workspace through the Supabase session pooler connection.

### 2. Run Smoke And Regression Tests

- [x] Delivery smoke test.
- [x] Delivery role smoke test.
- [x] Assess/handoff RLS regression.
- [x] Docs smoke coverage through delivery smoke temporary document insert/update/delete.
- [x] Timesheet smoke coverage through delivery smoke temporary timesheet insert/update/delete.
- [x] Unit tests.
- [x] Production build.
- [x] Dependency audit.

Do not mark Supabase smoke tests as passed unless they actually run against the target database.

### 3. Hide Or Complete Unsafe/Incomplete Provider Paths

- [x] Incomplete OpenAI provider hidden/disabled from the demo provider selection and removed from the active provider implementation.
- [x] Browser-stored BYOK disabled in the Docs Forge demo path; stale local API key storage is cleared on app load.
- [ ] Client-side AI calls in demo/pilot path.

### 4. Prepare Server-Side AI Migration

- [x] Edge Function client boundaries for document generation and section refinement.
- [x] Edge Function client boundaries for text extraction, generated-document export, and Decision Pack export.
- [x] Provider abstraction changes to ignore browser-supplied keys and route through the orchestrator.
- [x] AI governance/job migration contract for key references, prompt templates, generation jobs, and usage events.
- [x] Edge Function source authored for document generation, section refinement, provider connection testing, and usage logging.
- [x] Edge Function source authored for text extraction, generated-document Markdown/JSON export, and Decision Pack Markdown/JSON export.
- [x] Decision Pack JSON/Markdown export action wired into the Assess cockpit with server-side Edge export when enabled and local deterministic demo fallback when disabled.
- [x] Generated document JSON/Markdown export action wired into the Docs workspace with server-side Edge export when enabled and local deterministic demo fallback when disabled.
- [ ] Encrypted key reference implementation in a server-side vault or managed secret store.
- [ ] Deployed Edge Functions.
- [ ] Server-side binary PDF/DOCX extraction and branded DOCX/PDF rendering.
- [ ] Prompt injection defense implementation.
- [ ] Human review gate.

### 5. Prepare Funding Demo Hardening

- One seeded enterprise scenario.
- Remove broken placeholders.
- Polish golden path.
- Assess annualized value model and scoring fixture regressions are complete.
- Decision Pack JSON/Markdown export. Branded PDF export remains pending.
- Docs output quality and JSON/Markdown export. Branded DOCX/PDF export remains pending.
- Backlog lineage.
- Monitor dashboard with leadership-grade metrics.

### 6. Prepare Enterprise Pilot Hardening

- Real org onboarding.
- Invitations.
- Role enforcement.
- Tenant isolation proof.
- Audit export.
- Security buyer checklist.
- Data retention/deletion plan.

## Strict Roadmap Rule

No generic project management expansion until the golden path is stable, tested, and demo-ready.

Do not build Jira replacement features, random modules, or broad reporting surfaces until Assess -> Docs -> Delivery -> Monitor is reliable, traceable, exportable, and credible for demo/pilot use.

## File And Module Areas Likely Affected

- `docs/` and `README.md` for documentation baseline.
- `docs/schema/` and Supabase test scripts for RLS hardening.
- `services/aiOrchestrator.ts`, provider files, and future Edge Functions for server-side AI.
- `components/docs/`, `services/docsService.ts`, and Docs adapters for versions/export.
- `components/assess/`, `services/scoringEngine.ts`, and assessment adapters for Decision Pack export.
- `components/delivery/`, `services/deliveryService.ts`, and delivery policies for persistence and permission coverage.
- Monitor/portfolio components and adapters for leadership dashboards.

## Risks

- Over-expanding into generic project management would dilute the product moat.
- Browser-side AI and BYOK handling block enterprise pilot readiness.
- RLS policies that are authored but not live-applied create false confidence.
- Demo polish without export, audit, and lineage may fail buyer scrutiny.
