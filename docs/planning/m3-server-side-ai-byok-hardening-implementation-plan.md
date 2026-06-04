# M3 Server-Side AI / BYOK Hardening Implementation Plan

## Goal

Move AvalaOS Core toward enterprise pilot readiness by hardening AI execution boundaries, provider configuration, BYOK/key-reference handling, prompt/version governance, AI usage logging, and safe failure behavior.

M3 is approved as a roadmap, not as one implementation PR. This M3.0 record is planning-only and does not approve implementation of all M3 slices at once.

## Scope

- Inventory current AI execution paths and define an explicit mode contract for local demo, internal development, pilot, and production.
- Plan safe browser AI boundary lockdown without making one unsafe removal of all transitional fallback behavior.
- Plan tenant-scoped Edge provider configuration and server-side key-reference resolution.
- Plan prompt key/version governance, job lifecycle audit, usage/token/cost logging, and safe failure behavior.
- Plan read-only first Avala AI Controls readiness surface.
- Plan source-content safety boundaries, including binary upload restrictions for pilot mode.
- Preserve deterministic scoring as the source of truth for scores, gates, risk tiers, recommendations, approvals, and compliance status.

## Out Of Scope

- Implementing M3 code in M3.0.
- New AI features.
- New model providers unless separately justified and approved.
- Scoring changes.
- Health changes.
- Package or dependency changes.
- Schema, RLS, or Supabase Function changes unless separately justified and approved in a future slice.
- Admin UI implementation in M3.0.
- Runtime agents, MCP/A2A, external execution behavior, or compliance certification claims.
- Production customer data handling.

## Current AI Architecture Findings

- `services/aiOrchestrator.ts` routes generation and refinement through Edge Functions only when `VITE_AI_EDGE_FUNCTIONS_ENABLED` is true and Supabase is configured.
- Browser provider code still exists in `services/geminiService.ts`, `services/geminiProvider.ts`, and `services/groqProvider.ts`; this is a transitional demo/internal-dev risk that must be mode-gated before pilot.
- `App.tsx` clears the legacy local API key, but `StorageKeys.API_KEY`, `userApiKey`, and downstream props still exist and need inventory before lockdown.
- Docs Forge currently reads uploaded file text in the browser before generation.
- Supabase Edge Function sources exist for document generation, section refinement, provider test, usage logging, text extraction, document export, and decision-pack export.
- `docs/schema/ai_governance_jobs.sql` already defines `ai_provider_configs`, `prompt_templates`, `ai_generation_jobs`, and `ai_usage_events`.
- Edge job/usage logging exists, but provider config, key-reference resolution, prompt version recording, and fail-closed audit enforcement are not fully wired.
- AI Insights and sprint planning are already disabled in pilot-safe client paths.
- Current UI accepts PDF/DOCX uploads, but the current safe extraction path is not production-ready for binary formats.

## Mode Matrix

| Mode | Allowed AI Behavior | Key / Provider Boundary | Failure Rule |
| --- | --- | --- | --- |
| `local-demo` | Prepared demo data and synthetic-only fallback are allowed. | No real customer data. No expectation of pilot controls. | Demo may use prepared artifacts or synthetic fallback when clearly scoped to local demo. |
| `internal-dev` | Transitional fallback may exist only when clearly labeled. | Must not be used for real customer data. Browser provider paths must be visible as dev-only. | Fail or warn clearly when a path is not pilot-safe. |
| `pilot` | Server-side Edge AI only. | No browser-stored raw API keys. No browser-side provider execution. Server resolves approved provider config and key reference. | Fail closed if provider config, key reference, auth, org membership, prompt version, or usage audit is missing. |
| `production` | Server-side Edge AI only. | Same as pilot, with production deployment controls and no client-exposed provider secrets. | Fail closed on any missing required control or audit evidence. |

## Safe Browser Fallback Sequence

1. Inventory all browser AI paths, including provider classes, local key state, provider env variables, file reading, and disabled AI surfaces.
2. Define mode detection and behavior contract before removing fallback code.
3. Gate pilot and production behavior first so real customer data cannot reach browser-side provider execution or browser-stored raw keys.
4. Keep or remove demo fallback only through explicit `local-demo` mode and synthetic/prepared data rules.
5. Add tests and static scans for forbidden browser-key/provider paths in pilot and production modes.
6. Remove transitional fallback only after AP approves the relevant hardening slice and verification evidence.

## BYOK / Key-Reference Plan

- Use `ai_provider_configs.key_reference` as the tenant-scoped reference to a server-side secret, not as raw key storage.
- Resolve key references server-side through an allowlisted resolver such as `env:GROQ_API_KEY` or `env:GEMINI_API_KEY`.
- Do not pass raw provider keys from browser payloads.
- Do not store provider secrets in browser state, local storage, client env variables, logs, or database rows.
- Record `provider_config_id`, provider type, selected model, and status in job/usage evidence.
- Defer any schema/RLS changes for provider config writes unless separately approved.

## Provider Configuration Model

- Supported first-stage providers remain the existing Gemini/Groq paths unless AP approves another provider.
- Provider config must include display name, provider type, key-reference status, default model, model policy status, and active/disabled/pending state.
- Pilot/production generation must fail closed if no active tenant-scoped provider config can be resolved.
- Provider test must be audited and must not expose raw provider payloads or secrets.

## Prompt Registry / Versioning Plan

- First stage can use server-side prompt key/version constants in Edge Function shared code.
- Every AI job should record prompt key/version and model.
- DB-backed prompt administration can be deferred unless separately approved.
- Prompt changes must be treated as governed version changes and must not alter deterministic scoring or recommendation logic.
- Prompt instructions must state that AI drafts documents, summarizes context, or refines editable sections only; it must not decide scores, gates, risk tiers, recommendations, approvals, or compliance status.

## AI Generation Job Lifecycle

- Standard states: queued, running, succeeded, failed, and cancelled where supported by existing schema.
- Required metadata: org, user, job type, provider config, prompt key/version, model, input references, output reference, status timestamps, and sanitized errors.
- Pilot/production behavior should fail closed if job creation or usage audit persistence cannot be enforced.
- Audit failures may remain best-effort only in local-demo/internal-dev, and must be clearly labeled as not pilot-safe.

## Usage / Token / Cost Logging

- Usage events should be recorded server-side from provider responses, not trusted client-submitted usage values.
- Required usage fields: provider, model, prompt key/version, input tokens, output tokens, total tokens, output artifact type, output reference where available, and cost estimate when available.
- Usage logging must not include raw prompts, raw provider keys, uploaded source bodies, or provider secret material.
- `ai-usage-log` should be reviewed in a later implementation slice so pilot usage is not client-spoofable.

## Source Safety And Binary Upload Boundary

- Current UI accepts PDF/DOCX, but current safe extraction is not production-ready for binary formats.
- Pilot mode must restrict unsupported binary extraction or fail gracefully before AI generation.
- Production PDF/DOCX extraction is out of scope unless separately approved.
- Source handling must enforce tenant storage scope, file type, size limits, missing-source warnings, and prompt-injection checks.
- Generated documents must remain editable drafts and must flag missing or thin source material.

## Supabase Edge Function Impact

- Future implementation slices may touch Edge Function shared AI, audit, HTTP, provider config, and safety helpers only after AP approval.
- Pilot/production Edge functions must authenticate the user, verify active org membership, resolve provider config server-side, resolve the key reference server-side, bind a prompt key/version, create an AI job, record usage, and return sanitized output.
- Missing controls must fail closed.
- No Supabase Function changes are part of M3.0.

## UI / Admin Impact

- First Admin AI Controls slice must be read-only.
- Read-only fields: provider status, key-reference status, model policy status, usage/job readiness, and pilot readiness.
- No browser raw-key entry is allowed.
- Docs Forge should eventually surface pilot-safe disabled/fail-closed states when server-side AI controls are unavailable.
- No Admin UI is part of M3.0.

## Export / Extraction Boundary Review

- Existing server-side export paths are Markdown/JSON oriented and intentionally narrow.
- Decision-pack export must continue to reflect deterministic Assess outputs and must not let AI rewrite scores, recommendations, gates, or approval status.
- Binary extraction and production-grade PDF/DOCX processing require separate approval and evidence.

## Files Likely Touched In Future Slices

- `services/aiOrchestrator.ts`
- `services/aiEdgeClient.ts`
- `services/geminiService.ts`
- `services/geminiProvider.ts`
- `services/groqProvider.ts`
- `services/storage.ts`
- `App.tsx`
- Docs Forge and Workspace components that pass `userApiKey` or provider props
- Supabase Edge AI/audit shared helpers and AI functions
- Read-only Admin AI Controls components
- Targeted AI boundary tests and scan scripts

M3.0 changes only planning/evidence docs.

## Proposed New Files For Future Slices

- Server-side provider config resolver helper.
- Server-side prompt registry constants helper.
- Server-side source safety helper.
- Read-only AI Controls component.
- AI boundary scan script and focused tests.

These are future-slice candidates only and are not created by M3.0.

## Data / Schema Impact

- No M3.0 schema changes.
- Existing schema already contains AI provider configs, prompt templates, generation jobs, and usage events.
- Any schema/RLS migration required by a future slice must stop for AP approval before implementation.
- Package changes are not needed for M3.0.

## Test Plan

Future implementation slices should include:

- Existing deterministic scoring regression through `npm run test`.
- Typecheck and production build.
- Static AI boundary scan for forbidden browser keys/provider execution in pilot/production.
- Edge/provider config tests where feasible.
- Supabase smoke checks when live project access is configured.
- Wording scan for old branding, unsupported compliance claims, and unsafe AI-decision phrasing.

M3.0 verification is docs-only and records the required commands in the M3.0 evidence file.

## Security Verification Plan

- Verify no browser-side raw provider secrets are needed for pilot/production.
- Verify pilot/production AI can run only through authenticated, tenant-scoped Edge paths.
- Verify provider config and key-reference lookup are server-side.
- Verify prompt key/version is recorded.
- Verify usage audit is enforced before pilot approval.
- Verify AI cannot decide scores, gates, risk tiers, recommendations, approvals, or compliance status.
- Verify binary extraction is restricted or fails gracefully in pilot when unsupported.

## Acceptance Criteria

- M3.0 creates a planning record and slice roadmap only.
- Old M3 stub is clearly superseded and does not conflict with the AP-approved plan.
- Mode matrix is documented.
- Safe browser fallback sequence is documented.
- Read-only first Admin AI Controls slice is documented.
- Prompt registry first stage is documented as server-side constants, with DB-backed prompt admin deferred.
- Binary PDF/DOCX mismatch and pilot fail-closed behavior are documented.
- Stop conditions are documented exactly as approved.
- Verification evidence confirms no implementation/code behavior change.

## Stop Conditions

Stop implementation if:

- scoring changes are required
- Health changes are required
- schema/RLS migrations are required without AP approval
- browser raw keys are needed
- provider secrets would appear in client env, browser state, logs, or DB rows
- usage audit cannot be enforced for pilot behavior
- Edge tenant provider config cannot be verified
- copy implies AI decides scores, approvals, risk gates, or compliance status

## Suggested Branch Name

`milestone/m3.0-ai-boundary-planning`

## Suggested Commit Message

`M3.0 plan server-side AI and BYOK hardening`

## Whether Package / Schema Changes Are Needed

- Package changes: no.
- Package-lock changes: no.
- Schema changes: no for M3.0.
- Supabase Function changes: no for M3.0.

## Recommended Implementation Slices

See `docs/planning/m3-slice-roadmap.md`.
