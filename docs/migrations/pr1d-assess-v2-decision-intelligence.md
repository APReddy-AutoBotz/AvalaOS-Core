# PR 1D Assess V2 Decision Intelligence Migration

Migrations:

- foundation: `20260714120000_pr1d_assess_v2_decision_intelligence.sql`
- additive integrity correction: `20260715120000_pr1d_decision_integrity_correction.sql`

The foundation migration keeps V1 `assess-core-2026-05` records and behavior unchanged. It adds a tenant-owned V2 case head, immutable normalized authoring revisions, version-owned primitives/edges/assets/interactions/evidence, and immutable server-generated decision snapshots and SHA-256 references. The correction is forward-only: it leaves the accepted foundation file unchanged, adds durable imported-fact storage, replaces the clone/load contract, and replaces the finalization RPC with a database-verified canonical-text contract.

V1 clone uses the shared TypeScript compatibility converter on the server only after fresh authority resolution confirms `assess.v2.clone`, `assess.v2.create`, and V1 `assess.read`; denial happens before the service-role V1 load. The private database RPC independently repeats all three checks before it locks the exact same-tenant V1 source, binds its assessment, process, workspace, organization, and frozen score version to the server-produced projection, validates the projection's provenance and allowlisted fact/evidence/agent shapes, persists it in the first immutable case version, and returns the actual imported counts. Imported V1 evidence is represented by the server's canonical projection as `submitted/unvalidated`: import never upgrades it to validated evidence. When a reviewer saves a clone, the current immutable head is authoritative for each evidence ID; the read projection adds an original imported evidence item only when that ID is absent from the current head, and returns the unique result in deterministic ID order. This preserves imported suggestions across later versions without duplicating IDs or masking reviewer-authored changes. The clone does not copy V1 scores, recommendations, Govern outcomes, Studio handoffs, or unrestricted raw source payloads, and it never mutates the V1 record.

Authenticated users have capability-scoped read access only. `PUBLIC`, `anon`, and `authenticated` cannot execute V2 private mutation RPCs or directly mutate V2 tables. The base `pr1d_assert_enabled()` and `pr1d_resource(uuid,uuid,uuid)` `SECURITY DEFINER` helpers are owner-only implementation details: the additive correction explicitly revokes direct execution from every PostgREST role, including `service_role`, while private owner-executed RPCs retain their intended internal use. Each RPC independently rechecks current actor, tenant/workspace ancestry, capability, authorization version, idempotency, and optimistic version. The canonical mutation capabilities are `assess.v2.create`, `assess.v2.clone`, `assess.v2.draft.write`, and `assess.v2.finalize`; `assess.v2.read` owns read projection.

Finalize accepts no client decision material. The Edge handler loads locked server facts, executes the shared deterministic evaluator, and supplies canonical input/evidence/output JSON text, equivalent snapshots, and SHA-256 digests to the corrected private RPC. PostgreSQL parses and compares each canonical value, verifies all organization/workspace/case/source/schema/rule-set/decision bindings, recomputes each UTF-8 SHA-256 digest, and rejects a mismatch before state, immutable decision, receipt, or privileged audit persistence. The obsolete overload that accepted snapshots plus arbitrary hash-shaped strings is removed and not executable by any role.

## Verification and proof boundary

Planned focused verification covers exact nested validation, finalize injection rejection, independent authority, server evaluation/hash generation, and sanitized failures. The corrected disposable PostgreSQL harness must cover the full migration chain, exact RPC and helper ACLs, forced RLS, two-tenant isolation, persisted clone facts/evidence and counts, real canonical digests, input/evidence/output mismatch rejection, binding rejection, replay/conflict behavior, genuine two-session concurrency, no-side-effect failures, immutable history, audit rollback, disable/read-only fallback, and the PR 1C resubmission forward fix. Exact results are recorded only after execution in the active PR 1D evidence document; no hosted or live system is accessed.

This source and disposable-test evidence does not establish deployment, pilot, production, storage, security, compliance, scientific calibration, guaranteed ROI, or buyer readiness.

## Rollback and recovery

Disable V2 or set its runtime control to read-only, preserve all V1/V2 rows, imported facts/evidence, canonical snapshots/text, receipts, hashes, audits, and the corrected helper ACLs, then ship another additive forward fix. Do not grant direct helper execution as a rollback shortcut, destructively reverse either PR 1D migration, restore browser authority, silently reinterpret V2 through V1, or mutate finalized evidence.


## P1 independent evidence-attestation correction

PR 1D permits only author-controlled evidence submission (suggested or submitted, with validated false). It does not create evidence approval, independent reviewer attestation, reviewer assignment, Govern resolution, Studio handoff, export, or sharing. The Edge parser rejects validated/rejected states, reviewer IDs, and review receipt/attestation fields; an additive database trigger independently rejects author-attestation payloads even if a private RPC is called directly.

Verified confidence is reserved for an immutable, server-authoritative, independently authorized evidence-attestation projection. That projection and its review command are PR 1E work. Consequently the PR 1D authoring/finalization path is reviewer-ready only and submitted claim-linked evidence can be no higher than Partially Evidenced; V1 imports remain submitted, unvalidated, and provenance-linked. Rollback remains the existing V2 disable/read-only fallback; no destructive migration rollback is permitted.

### Authoring completeness acceptance

The browser acceptance path must prove a scaffolded case can supply a known user-sourced primitive fact, an application lifecycle fact, and an accountable owner through displayed controls before server finalization. Rollback remains V2 disable/read-only with records preserved.


### Locked-row clone projection acceptance

The correction migration derives the canonical imported-fact and imported-evidence arrays inside the private clone RPC from the locked V1 row. It mirrors the TypeScript contract for declared section ordering, missing and empty response normalization, assumptions, deterministic evidence IDs, linked claims, owners, and last-link fact association, then rejects any non-exact caller projection before claiming an idempotency receipt. The isolated migration harness includes fabricated allowed-section fact and fabricated evidence-owner cases and requires zero case, receipt, privileged-audit, or evidence writes.

## Final review replay and claim-registration correction

The corrected private finalize replay RPC locks the singleton runtime control, preserves `FEATURE_DISABLED` when V2 is disabled, revalidates current finalize authority, and permits an exact succeeded receipt to replay while the runtime is read-only. Missing receipts still return `READ_ONLY`, and mismatched receipt scope, case, version, status, or key remains an idempotency conflict. The disposable PostgreSQL harness covers all three outcomes.

The deterministic finalization validator accepts evidence claims only when they exactly match the V2 field registry, an imported V1 fact on the locked case, or an identifier in the server-projected `sourceV1.importedEvidenceClaimIds` set. PostgreSQL derives that ordered, deduplicated set only from evidence attached to the immutable version-1 `v1_clone`; it never derives membership from author-editable current evidence, identifier syntax, or a recomputed deterministic UUID. This validation correction changes neither any score/rule/decision version nor the accepted clone input RPC shape.

## Final acceptance draft atomicity and V1 requested-change reopen

The corrected V2 draft upsert locks the case and rechecks exact successful receipt replay before it validates the draft lifecycle and expected version. A stale version or non-draft case now returns `VERSION_CONFLICT` before `pr1b_claim_command`, so the failed command cannot commit an `in_progress` receipt, authoring revision, child row, case-head change, or privileged audit. Same-key concurrent requests still produce one commit and one exact replay.

The existing service-role-only V1 response-upsert RPC remains protected by fresh `assess.response.write` authority, tenant/workspace ancestry, optimistic versioning, strict payload validation, idempotency, and atomic audit. It now accepts mutable `Draft` rows and the narrowly authorized `Changes Requested` reopen transition only. Saving reviewer-requested corrections atomically writes the responses, returns the assessment to `Draft`, clears the prior deterministic `scores` and `score_version`, increments the version, and records sanitized reopen metadata. Approved, rejected, in-review, ready-for-review, handed-off, archived, deleted, cross-tenant, stale-authority, and stale-version rows cannot use response upsert to reopen or mutate lifecycle state.

Executed isolated PostgreSQL 15 verification passed: stale-version and reviewer-ready V2 draft conflicts left case state, immutable versions, decision-owned rows, receipts, and audits unchanged; one valid same-key draft race still yielded one commit and one replay. The same harness proved `Changes Requested -> Draft` clears both score columns with one successful receipt/audit and exact replay, while an unrelated locked V1 status returns `VERSION_CONFLICT` with no response, lifecycle, score, receipt, or audit change. No hosted or live database was accessed.

Rollback remains feature disablement or read-only maintenance with all V1/V2 rows, scores, receipts, audits, and immutable history preserved, followed by another additive forward fix. Do not restore post-claim V2 conflict handling, reopen locked V1 lifecycle states broadly, retain stale scores on a reopened draft, destructively reverse migrations, or alter `assess-core-2026-05` scoring behavior.

## Final P1 imported-evidence provenance correction

The load-for-finalize projection now exposes `sourceV1.importedEvidenceClaimIds` as immutable version-1 clone evidence provenance. The evaluator requires exact membership in that server-derived set before accepting any `v1.evidence.*` claim. A syntactically valid but fabricated claim authored into a later V2 draft therefore cannot acquire imported provenance or pass finalization validation.

The disposable PostgreSQL regression proves the authoritative set contains the real imported evidence claim, remains unchanged after draft evidence is replaced with a fabricated identifier, and remains bound into the final input snapshot without the fabricated identifier. Edge command and domain regressions prove the fabricated claim is rejected before atomic finalization while an actually imported claim remains accepted. Rollback remains V2 disable/read-only with immutable history preserved, followed by another additive forward fix; do not restore prefix-only trust or derive provenance from mutable evidence.

## Final P2 create and clone receipt replay correction

The additive correction replaces the create RPC and hardens the corrected clone RPC so each locks runtime control, revalidates current tenant/workspace authority, and checks an exact succeeded receipt before consulting mutable process or V1-source lifecycle state. Exact committed responses can replay after a parent/source soft delete and during read-only maintenance; disabled mode remains fail-closed. New work still locks and validates the active parent/source before receipt claim and mutation.

Executed disposable PostgreSQL 15 verification proves create and clone replay after source deletion without additional case, immutable version, evidence, receipt, or privileged-audit writes. Missing receipts return `NOT_FOUND` in normal mode and create no receipt; read-only misses return `READ_ONLY`; mismatched hashes, workspace scope, resource IDs, failed receipts, and in-progress receipts return `IDEMPOTENCY_CONFLICT`; current authority revocation blocks replay. A genuine two-session same-key create yields one commit and one replay. Rollback remains disable/read-only plus an additive forward fix; do not delete committed receipts or restore mutable-resource checks before exact replay.

## Final P2 create-case agent-necessity compatibility correction

The additive correction sets the future `agent_necessity` column default and explicitly seeds every new V2 create version with the five canonical unknown, user-sourced `CaseFact` objects. A freshly created, unsaved case can therefore be loaded by the existing editor without dereferencing null fact entries.

For supported upgrades, the load projection normalizes only the exact legacy version-1 `create` all-null shape. It does not rewrite the immutable stored version, and near-match malformed, draft, or cloned rows are not normalized. Disposable PostgreSQL 15 verification proves both a fresh unsaved create and the exact legacy projection, preserves the raw legacy row, and proves the near-match guard. Rollback remains V2 disable/read-only with immutable history preserved, followed by another additive forward fix; do not restore nullable create facts or rewrite accepted history.

## Final P1 Edge/Deno import-resolution correction

This correction makes no schema change: the accepted foundation migration and both additive migrations remain unchanged. Every relative import reachable from the Assess V2 Edge entry point now carries an explicit `.ts` specifier, including the shared command boundary, V1 compatibility converter, and deterministic V2 evaluator. The recursive TypeScript-AST guard resolves the complete graph and is aggregated into `lint:pr1d`, so an extensionless or missing local Edge dependency fails the feature-owned CI gate.

The repository's Node test transpiler rewrites explicit TypeScript extensions when emitting CommonJS tests, preserving existing V1 compatibility and V2 domain/command execution. This is source compatibility evidence only, not hosted Edge or deployment proof.

Rollback remains V2 disable/read-only with all data and decisions preserved, followed by a forward fix; do not modify migration history or restore extensionless Deno imports.

## Final P2 Edge clone-replay preflight correction

The additive correction adds a private service-role replay helper for `assessment_v2.clone_from_v1`. It locks runtime control, revalidates the three clone capabilities, locks the actor-scoped receipt, and verifies the exact succeeded response against the immutable version-1 `v1_clone` row before returning it. The helper is revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` can invoke the RPC, and the Edge handler calls it before any V1 source read.

Normal-mode misses return `NOT_FOUND` and fall through to the existing locked active-source clone RPC. An exact replay remains non-mutating after source deletion and during read-only maintenance; a read-only miss returns `READ_ONLY`, disabled mode returns `FEATURE_DISABLED`, and scope, source, case, name, description, receipt-status, contract, or count mismatches return `IDEMPOTENCY_CONFLICT`. Current `assess.v2.clone`, `assess.v2.create`, and `assess.read` authority remains mandatory.

Executed disposable PostgreSQL 15.8 verification proves the helper ACL, exact replay after source deletion, unchanged case/version/evidence/receipt/audit state, normal and read-only misses, disabled mode, request mismatches, wrong source/case, and authority revocation. Edge command tests prove exact replay and every fail-closed preflight outcome occurs before the V1 loader.

Rollback remains V2 disable/read-only with committed receipts and immutable clone versions preserved, followed by an additive forward fix. Do not grant browser roles helper execution or restore mutable source validation ahead of exact replay.

## Final P2 evidence-quality and status-null correction

The additive evidence-attestation migration now rejects `payload->>'status' IS NULL` before evaluating the `suggested`/`submitted` allowlist. This closes the SQL three-valued-logic path for omitted and JSON-null status while preserving an exact existing or newly inserted submitted/unvalidated author-evidence row. The populated upgrade and fresh-chain assertions run inside the complete disposable PostgreSQL 15.8 matrix.

The Govern Lite compatibility projection now treats only missing or `undefined` legacy `metadata.evidenceQuality` as insufficient evidence, producing the existing quality gap and preventing L4 autonomy without throwing. Present malformed values remain strict-normalizer failures. No score, threshold, recommendation, rule-set, decision version, approval state, or database authority changes.

Rollback remains V2 disable/read-only with evidence and history preserved, followed by an additive forward fix. Do not restore a status predicate that admits SQL `NULL`, coerce malformed evidence-quality values, or remove the conservative missing-quality gap.

## Final P1 normal-draft audit correction

The corrected `pr1b_upsert_assessment_responses` RPC now supplies `'{}'::jsonb` to `privileged_audit_events.metadata` for an ordinary Draft save and preserves the explicit reopen metadata for `Changes Requested`. Both paths keep assessment mutation, succeeded command receipt, and privileged audit atomic; the non-null audit column can no longer turn a valid normal save into a sanitized unavailable response after rollback.

Executed disposable PostgreSQL 15.8 evidence proves an ordinary Draft save commits, remains Draft, increments the version, persists the exact response payload, records one succeeded receipt and one audit with an empty JSON metadata object, and returns the same resource on exact replay. Existing reopen, disallowed-state, stale-version, and resubmission assertions continue to pass.

No V1 score, formula, threshold, recommendation, score version, lifecycle authority, or V2 behavior changes. Rollback must preserve audit/receipt atomicity and use another additive forward correction; it must not restore SQL `NULL` for required audit metadata.

## Final P2 V2 runtime-state presentation correction

No migration changes are required. The existing Edge and private PostgreSQL boundaries already return stable `READ_ONLY` and `FEATURE_DISABLED` codes. The client compatibility parser now preserves both codes and the enterprise session policy maps each to the mutation-blocking `read_only` state with distinct maintenance and disabled messages.

The safe fallback does not clear valid tenant authority, does not substitute demo data, and keeps existing committed V2 decisions readable. Unknown server payloads remain fail-closed as `COMMAND_UNAVAILABLE`; offline transport remains `OFFLINE`.

Focused TypeScript regressions cover nested and top-level code envelopes, distinct copy, retained authority, and read-only state. Rollback remains V2 disable/read-only with data, immutable decisions, receipts, and audits preserved; do not restore error-code collapse or a generic error state that hides the required safe fallback.

## Final P2 financial-action, decision-time evidence, and draft replay correction

The deterministic rule registry remains `assess-v2-rules-2026-07`, but the decision-output version advances to `assess-v2-decision-2026-07-19` because financial write action classification and finalization-time evidence freshness can change the immutable output. The server-supplied finalization timestamp now drives every evidence-validity decision. Technically Ready financial writes remain approval-bound and autonomously prohibited; no scoring formula, threshold, hard stop, recommendation, or V1 `assess-core-2026-05` behavior changes.

The corrected `pr1d_upsert_assess_v2_draft` function locks the singleton runtime-control row, rejects disabled mode, revalidates current `assess.v2.draft.write` authority, and then checks the actor-scoped receipt before enforcing the read-only mutation gate. Only an exact succeeded receipt whose workspace, request hash, case ID, Draft status, and committed version match is replayed. A read-only miss returns `READ_ONLY`; a mismatch or non-succeeded receipt returns `IDEMPOTENCY_CONFLICT`; disabled mode remains fail-closed. Normal-mode receipt misses retain the locked case/status/version checks before command claim and mutation.

The disposable migration matrix covers exact read-only replay, read-only miss, stale authorization, disabled mode, and workspace, resource, version, request-hash, and receipt-status mismatches with unchanged domain/version/audit state. Rollback remains feature disablement or read-only maintenance followed by another additive forward correction; immutable receipts and decisions are preserved.

## Final P2/P1 read-only discovery and immutable imported-evidence correction

The client read boundary now permits discovery and reload in both `ready` and `read_only` when valid tenant context includes `assess.v2.read`. All mutation capability checks and create/clone exposure remain `ready`-only.

The corrected draft RPC compares each same-ID authored evidence payload with the locked immutable version-1 `v1_clone` row before receipt claim. Exact imported evidence round-trip is omitted from the new authoring version, while altered same-ID author evidence returns `INVALID_COMMAND` with zero receipt, version, evidence, case-head, or audit side effects. The load projection also defensively prefers the immutable clone row over any current-version collision. The rule set remains `assess-v2-rules-2026-07`, the decision version remains `assess-v2-decision-2026-07-19`, and the accepted foundation migration remains unchanged.

Rollback remains V2 disable/read-only with immutable clone provenance, decisions, receipts, and audits preserved, followed by another additive forward correction. Do not restore mutable imported-evidence shadowing or block authorized reads during read-only maintenance.

## Final P1/P2 Edge-shaped imported-evidence save and client reload correction

The corrected draft collision check removes only the immutable row's server-only `reviewerIds` and `contradictory` keys before comparing it with author input. This admits the normal Edge-shaped payload while preserving all author-visible state, owner, claims, source provenance, and validation fields. Supplying server-only evidence fields or altering an author-visible field returns `INVALID_COMMAND` before command claim with zero domain, receipt, or audit writes; an accepted save still creates no imported-evidence shadow row.

The direct browser read path now loads imported evidence from the tenant-scoped version-1 `v1_clone` row and gives those immutable rows precedence over same-ID current-version rows. It also reconstructs the canonical imported `v1.evidence.*` claim IDs and clone timestamp rather than dropping provenance on later draft reloads.

The focused disposable PostgreSQL 16 matrix covers the normal Edge-shaped save and state, owner, claim, provenance, and server-only-field collisions. Rollback remains V2 disable/read-only with records preserved, followed by an additive forward correction; no destructive down-migration is authorized.
