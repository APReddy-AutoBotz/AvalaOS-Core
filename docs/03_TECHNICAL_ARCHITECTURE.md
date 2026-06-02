# KlarityPM Technical Architecture

Last Updated: 2026-05-08  
Owner: Product / Engineering

## What This Doc Is

This doc defines the target technical architecture for KlarityPM as a low-cost, production-transition enterprise SaaS application.

## What This Doc Is Not

This is not a roadmap or status ledger. It defines the target technical shape. Current implementation gaps are tracked in the status doc.

## 1. Architecture Principle

Use a modular monolith.

Do not introduce microservices unless absolutely needed. The product is still proving and hardening one core lifecycle. Microservices would add operational cost before the domain boundaries are mature.

The codebase should keep strict domain boundaries:

- Auth and organization.
- Assess.
- Docs.
- Delivery.
- Monitor.
- Admin.
- Shared UI and infrastructure.

## 2. Recommended Stack

- React.
- TypeScript.
- Vite.
- Tailwind.
- React Router.
- TanStack Query.
- React Hook Form.
- Zod.
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Supabase Storage.
- Supabase Edge Functions for server-side AI and jobs.
- Vitest.
- Playwright.
- DOMPurify.
- Mermaid rendered safely.

## 3. Frontend Rules

- No product-critical browser localStorage authority.
- No direct AI SDK/API calls from browser in pilot or production paths.
- Use adapters/services for data access.
- Use TanStack Query for server state.
- Use clear loading, error, empty, and permission states.
- Hide incomplete modules from production and demo modes.
- Keep deterministic scoring logic in pure TypeScript modules.
- Keep AI narration separate from scoring decisions.

## 4. Backend/Supabase Rules

- Tenant ID must be resolved from authenticated context.
- Never trust tenant or organization IDs from client payload alone.
- RLS must be enforced for all tenant-scoped tables.
- Migrations must be repeatable.
- RLS regression tests are required.
- Role checks must be enforced in database policies or server-side functions, not only in UI code.

## 5. AI Architecture

All AI calls must move behind backend or Supabase Edge Function boundaries.

Current migration switch:

- `VITE_AI_EDGE_FUNCTIONS_ENABLED=true` routes supported document generation/refinement calls through Supabase Edge Functions.
- Pilot and production must enable server-side AI.
- Transitional local/demo fallback may remain only for synthetic demo data while Edge Functions are being implemented.

Required:

- No browser API key persistence.
- Encrypted BYOK vault or key reference model.
- Server-side provider routing.
- Prompt registry.
- Prompt versioning.
- Usage audit.
- Token and cost tracking.
- Rate limits.
- Retry and failure handling.
- Prompt injection defense.
- Human approval for high-risk outputs.

Deterministic rule:

- AI can narrate, summarize, explain, or suggest clarifying questions.
- AI must not decide final Assess scores, risk tiers, gates, or recommendations.
- Deterministic engines own Assess scoring and recommendations.
- All AI provider execution must be server-side for demo, pilot, and production.
- Browser BYOK/localStorage must be removed or disabled from demo and pilot paths.

## 6. Required Edge Functions

### `ai-generate-document`

Purpose: generate governed documents from assessment/source context.

Inputs:

- Organization ID resolved from auth context.
- Document type.
- Source artifact IDs.
- Template ID.
- Prompt version/key reference.

Outputs:

- Generation job ID.
- Generated document ID/version.
- Sections.
- Citations.
- Assumptions.
- Gaps.
- Usage event.

Security:

- No raw API key in browser.
- Provider key resolved server-side.
- Tenant scoped.
- Prompt and source treated as Tenant Confidential.

Audit/logging:

- Provider, model, prompt version, key reference, user ID, org ID, job ID, token usage, cost estimate, source IDs, output ID, and status.

### `ai-refine-section`

Purpose: refine a specific document section.

Inputs:

- Document ID.
- Version ID.
- Section ID.
- Refinement instruction.
- Source IDs.

Outputs:

- New section draft.
- Citations.
- Assumptions.
- Gaps.
- Usage event.

Security:

- Must validate user access to document and organization.

Audit/logging:

- Same as AI generation plus original section version and new section version.

### `ai-provider-test-connection`

Purpose: test provider configuration without exposing provider secret.

Inputs:

- Provider config reference.
- Model preference.

Outputs:

- Connected/failed status.
- Safe error message.

Security:

- Never return raw key.
- Never log raw key.

Audit/logging:

- Provider, config reference, user, org, status, and timestamp.

### `ai-usage-log`

Purpose: persist AI usage events and cost/token metadata.

Inputs:

- Provider.
- Model.
- Token usage.
- Cost estimate.
- Job ID.
- User ID.
- Org ID.
- Output artifact ID.

Outputs:

- Usage event record.

Security:

- No prompt body unless redacted and approved.

### `extract-document-text`

Purpose: server-side PDF/DOCX/transcript extraction.

Current implementation source status: text, Markdown, CSV, and JSON extraction boundaries are authored. Binary PDF/DOCX extraction still requires a dedicated server-side extractor before pilot use.

Inputs:

- File ID.
- Storage path.
- File type.

Outputs:

- Text extraction result.
- Chunks.
- Extraction status.
- Warnings.

Security:

- Tenant Confidential handling.
- No unrestricted public file access.

Audit/logging:

- File ID, user ID, org ID, extraction status, errors, and timestamp.

### `export-document`

Purpose: server-side DOCX/PDF/Markdown export for generated documents.

Current implementation source status: Markdown and JSON export boundaries are authored. Branded DOCX/PDF rendering still requires a server-side renderer before pilot use.

Inputs:

- Document ID.
- Version ID.
- Export type.

Outputs:

- Export artifact ID/download reference.

Security:

- Validate access.
- Do not expose cross-tenant files.

Audit/logging:

- User, org, document/version, export type, and timestamp.

### `export-decision-pack`

Purpose: export assessment Decision Pack as PDF/JSON.

Current implementation source status: JSON and Markdown export boundaries are authored. Branded PDF rendering still requires a server-side renderer before pilot use.

Inputs:

- Assessment ID.
- Score set ID.
- Export type.

Outputs:

- Export artifact ID/download reference.

Security:

- Validate access to assessment and score set.

Audit/logging:

- User, org, assessment, score version, export type, and timestamp.

## 7. Docs/File Processing

Required:

- Server-side PDF/DOCX extraction.
- Sanitized Markdown rendering.
- Sanitized Mermaid rendering.
- Server-side DOCX/PDF export.
- Branded exports with headers, footers, page numbers, approval metadata, and diagram rendering.

Browser-only `file.text()` is not sufficient for production PDF/DOCX processing.

Current source supports server-side text/Markdown/CSV/JSON extraction and Markdown/JSON export boundaries only. This is useful for the first server boundary but is not enough for enterprise pilot document processing.

## 8. Data Model

Canonical entities:

- organizations.
- organization_members.
- roles.
- permissions.
- audit_events.
- processes.
- assessments.
- assessment_responses.
- evidence_assets.
- assumptions.
- score_sets.
- engine_outputs.
- decision_packs.
- handoff_packs.
- generated_documents.
- document_versions.
- projects.
- epics.
- tasks.
- sprints.
- task_comments.
- task_activity_events.
- ai_provider_configs.
- prompt_templates.
- ai_generation_jobs.
- ai_usage_events.
- notifications.
- integration_connections.

All tenant-scoped records must carry tenant ownership and be protected by RLS.

## 9. Deployment And Operations Architecture

Target low-cost deployment:

- Frontend hosted on Vercel, Netlify, or an equivalent static hosting platform.
- Supabase Cloud for Auth, PostgreSQL, Storage, RLS, and Edge Functions.
- Supabase Edge Functions for AI provider routing, document generation jobs, export jobs, and file extraction orchestration.
- Environment variables managed in the hosting platform and Supabase project settings, never committed to source.

Operational requirements:

- Production startup must fail fast when required environment variables are missing.
- Logs must avoid secrets, API keys, prompts with sensitive content, and tenant-confidential document bodies unless explicitly redacted.
- Error tracking should capture user-safe error context, tenant/org IDs, request IDs, provider IDs, and job IDs.
- AI jobs should be observable by status, provider, token usage, cost estimate, retry count, failure reason, and reviewer outcome.
- Backup/restore and incident response runbooks are required before enterprise beta.

## 10. Testing Architecture

Required:

- Unit tests for deterministic scoring.
- Golden scoring regression fixtures.
- Unit tests for delivery permissions.
- RLS regression tests.
- Playwright E2E for the golden path.
- AI safety tests.
- Build, typecheck, and audit in CI.

Golden path E2E must cover:

Organization -> Process Catalog -> Guided Assessment -> Deterministic Score -> Recommendation -> Decision Pack -> Docs Handoff -> Generated Document -> Work Items -> Delivery Board -> Monitor Dashboard.
