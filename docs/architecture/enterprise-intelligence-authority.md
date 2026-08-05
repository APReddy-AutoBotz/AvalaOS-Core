# Enterprise Intelligence Authority

## Status and boundary

This document is the active authority for the Enterprise Intelligence vertical: multi-provider BYOK, document and transcript ingestion into Assess, approved Studio documents to Delivery and Monitor, Modernization & Assemble assessment, and Assemble Phase 1 blueprints.

The implementation is proposed in one substantial Draft PR from branch `codex/enterprise-intelligence-byok-ingestion-delivery-assemble` at required baseline `cafed0ba8b4790536c4e1305dbbf1cdf6ef2e4f5`. It is source-level implementation evidence only. Deployment status is unknown; live infrastructure, hosted schema, provider calls, telemetry, pilot, production, buyer, security-certification, and compliance readiness are not claimed.

Existing Assess scoring law, weights, thresholds, hard stops, and recommendation logic remain authoritative and unchanged. Enterprise Intelligence may consume an approved Assess result and its committed evidence, but it does not replace or reinterpret the Assess scoring model.

## Product law

- Assess before automation.
- Govern before execution.
- Humans approve risk.
- Evidence proves every decision.

The vertical stops at governed drafts. It does not introduce runtime agents, MCP, A2A, Agent Tools, browser-side provider secrets, browser-side AI execution, live telemetry, or autonomous execution.

## BYOK provider authority

The server owns provider configuration, route eligibility, secret resolution, endpoint selection, allowed roles, model capability, validation freshness, and budget enforcement. Browser state is a projection and never supplies provider authority.

Supported provider identities are `openai`, `azure_openai`, `anthropic`, `gemini`, and `openai_compatible`. A route is eligible only when all of the following are true:

- the provider configuration is active and belongs to the current organization and workspace;
- the capability is explicitly allowed;
- the model is in the server-committed model allowlist;
- the opaque secret reference is provider-specific and tenant-bound;
- the secret resolves through the server environment or Vault store, never through a browser payload;
- the provider endpoint is first-party or present in the server endpoint allowlist, with credentials, query strings, fragments, private addresses, and redirects rejected;
- provider validation has a committed `last_validated_at` value;
- the current normalized actor role is permitted by `allowed_roles`; and
- the configured daily request and monthly token budgets have not been exceeded.

The governed lifecycle is register metadata, bind a raw key through the dedicated authenticated endpoint or bind an explicitly pre-provisioned server reference, validate, activate, enable or disable capability routes, rotate, and revoke. A writable Vault-compatible backend stores new raw keys; the environment backend is deliberately read-only and accepts only tenant-bound pre-provisioned references. Rotation validates the replacement before the database switches references. Revocation retires the provider/key metadata and disables every associated route across all organization workspaces in one database transaction.

A deterministic replacement-key validation rejection is terminal only after the writable backend confirms removal of the newly written replacement. The prior active key reference and every route remain unchanged. If cleanup fails, the claimed receipt retains a server-only cleanup-required marker and one later fenced owner retries the idempotent removal before recording `VALIDATION_FAILED`; no secret reference enters the response. A pre-provisioned read-only reference has no cleanup effect. Once validation succeeds, any unknown transition outcome, committed transition with a lost response, or receipt-finalization response loss retains the stable planned secret and IDs for reconciliation instead of deleting a possibly committed credential.

Key material is represented in application tables only by an opaque reference containing the organization binding and a truncated one-way fingerprint. Raw keys, access tokens, signed URLs, endpoint credentials, and provider responses containing secrets are not persisted in application tables, command receipts, audit metadata, browser storage, URLs, logs, or evidence. External provider calls are non-atomic effects: the durable command receipt and job state surround them, and failed calls remain failed rather than becoming a success projection.

## Evidence ingestion into Assess

The canonical source is a private object in the server-controlled `source_uploads` bucket under the current tenant/workspace path. The command accepts bounded text-oriented documents and transcripts: plain text, Markdown, CSV, VTT, SRT, meeting notes, text PDF literals, DOCX text, and the corresponding supported MIME aliases. Individual sources are limited to 12 MiB.

Ingestion records the source and immutable source version in one service-only database transaction after the object is uploaded. The source bytes and extracted text each receive SHA-256 hashes. Extraction is bounded and treats source content as untrusted data. No OCR, audio transcription, remote URL fetch, archive expansion, or instruction execution is part of this vertical.

AI extraction may propose candidates, but every candidate must include a server-safe excerpt and locator that can be found in the server-extracted source text. The server recomputes the candidate provenance hash from the source-version identity, source-byte hash, extracted-text hash, locator, excerpt, and value. Human review is a separate command; edits append an immutable candidate-edit record and preserve the source anchor. Candidate approval is not inferred from client state.

Promotion requires the user to select a server-projected editable Assess V2 draft and one or more accepted or edited candidates. The browser supplies only those safe selector identities. The server re-derives the current draft version and validates candidate tenant, source version, status, provenance hash, locator, excerpt hash, and current case version. Human-entered fields are not silently overwritten: incompatible values create a reviewable conflict record. Successful field promotions are versioned and retain candidate, source/version, locator, excerpt hash, confidence, reviewer/edit history, and promotion-receipt ancestry. Approved assessments and deterministic scoring are immutable to this path.

## Assess and Modernization authority

Modernization is a separate deterministic disposition model, versioned as `modernization-disposition-1`. It requires an approved, current PR1G application assessment, exact application and metadata ancestry, and the committed recommendation and dimension rows. The server derives modernization factors from those canonical records; browser-supplied factor values are ignored.

Unknown high-impact factors produce a hard stop for modernization. A modernization assessment records the source decision model version, the derived factors, the deterministic disposition, and the evidence ancestry. It does not change PR1G scoring or make an unsupported compliance, savings, or readiness claim.

## Approved Studio to Delivery and Monitor

Delivery handoff requires the current approved Studio artifact aggregate, its current approved version, exact source lineage, and a matching content hash. A stale or changed Studio version is rejected. The server, not the browser, creates canonical work-item IDs and stores the package, package version, and work items in one service-only transaction.

Delivery and Monitor consume the committed package version and canonical work-item rows. They do not trust browser-provided item IDs, package JSON, or completion counts. Monitor can establish only a deterministic baseline: the package is approved, every required item is present exactly once, no blocker remains, and all supplied approved item IDs match the canonical item set. Live telemetry, task execution, due-date mutation, and completion inference are out of scope.

## Assemble Phase 1 blueprints

Assemble requires an approved modernization assessment with an eligible deterministic disposition. Phase 1 creates a draft blueprint with schema version `assemble-blueprint-1`. The blueprint starts with high-impact automation, execution, agent, tool, and telemetry controls disabled. It contains proposed structure and rationale only; it cannot run work, call tools, deploy, or claim an operational outcome.

## Authorization, approval, and persistence

Every mutating command resolves organization membership, workspace membership, normalized organization/workspace roles, and capability grants on the server. An authorization version is captured and rechecked before execution. Capability checks are operation-specific; read permissions do not authorize mutation.

High-impact approval has three distinct people: the creator, an independent reviewer who records a review event against the current resource hash, and the approver who records the final approval. The server re-resolves the reviewer and approver and rejects stale resource hashes, stale authorization versions, self-review, duplicate terminal transitions, and missing review events.

Mutations use service-role-only database RPCs for the receipt claim and every canonical provider, ingestion, modernization, approval, Delivery, Monitor, and Assemble commit. Claims occur before stable IDs or external effects. Each canonical mutation records its receipt-linked safe effect journal entry in the same database transaction. Repeated requests replay the committed result or stable failure; an in-progress request is not executed twice. New tables are additive, forced to RLS, and expose only capability-scoped projections to the browser. Sensitive provider tables and source objects remain server-only.

### Command receipts and runtime controls

The database classifies every supported command before a new receipt is created. Provider lifecycle commands map to `provider`; source creation, extraction, candidate review, and Assess promotion map to `ingestion`; modernization, Studio handoff, Monitor baseline, and non-Assemble approval commands map to `delivery`; blueprint creation and Assemble-blueprint approval commands map to `assemble`. An unknown command or an approval command without an authoritative resource type is rejected.

For a new request, global read-only and the classified area control are checked before the receipt, Storage, provider, or domain effect. Disabling one area does not disable another. The idempotency key identifies the logical command; the request ID is transport correlation only and is excluded from the canonical request hash. For provider lifecycle commands, `expectedAuthorizationVersion` is also excluded because it is a per-attempt precondition rather than command identity. Receipt identity is organization, workspace, actor, operation, idempotency key, and canonical business-payload hash. The first request ID remains immutable and later IDs are append-only replay evidence. Therefore the same key and payload with a different request ID or refreshed authorization version converges on one receipt, while a changed business payload remains an idempotency conflict.

Receipt completion and failed/blocked finalization are idempotent durable records of an already-started command, not new product actions. Every provider attempt authenticates the actor against the supplied current authorization version, and the locked database transition independently rechecks current authority. A stale version with retained authority leaves the receipt recoverable; a refreshed attempt acquires a newer fence and reuses the same plan and IDs. Confirmed authority removal permits no provider mutation, cleans any uncommitted writable secret, and records one stable non-disclosing blocked result. Claimed receipts carry a bounded lease, persisted execution plan, owner token, monotonic execution fence, and reconciliation count. If a finalization response is lost, the handler reloads the exact terminal receipt. If a domain effect committed first, it reloads and reconciles the receipt from the append-only effect journal without repeating the effect. After lease expiry, one fenced worker may recover with the same plan; stale fences are rejected. `RECEIPT_FINALIZATION_FAILED` is returned only when neither terminal receipt nor authoritative effect evidence can be recovered.

## Rollback and read-only fallback

The first rollback action is to disable affected provider routes and stop new commands. Existing committed evidence, reviews, approvals, packages, and blueprints remain available as read-only projections. The migration is additive; correction uses forward migration or a controlled source-level disablement. No destructive deletion, live endpoint change, credential rotation, deployment action, or hosted rollback is authorized by this document.

## Readiness boundary

Executed local evidence for this correction includes the feature-owned static boundary and CI-contract scans; deterministic command and thirteen mocked provider-lifecycle cases; full retained repository tests; TypeScript and Edge checks; 141 static migration assertions; and a disposable PostgreSQL 16 run covering fresh/upgrade/dirty paths plus twenty Enterprise authority scenarios. The executable cases retain the previous scenarios and add organization-versus-workspace provider authority; request-ID and authorization-version convergence; changed-payload conflict; stable-plan, newer-fence recovery; retained-authority success; removed-authority blocked replay with zero provider mutation; completion/failure response loss; durable-effect reconciliation; stale-fence rejection; immutable effect evidence; zero duplicate effects; and zero remaining claimed receipts. The retained browser suite could not launch Chromium in the local Windows environment (`spawn EPERM`), so browser execution is not claimed locally and remains an exact-head CI gate. Real provider validation, live Vault integration, hosted deployment, live Storage, telemetry, and infrastructure checks are not run and require separate explicit authority; no pilot or production claim follows from this evidence.
