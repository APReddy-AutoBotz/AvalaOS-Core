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

The deterministic finalization validator accepts evidence claims only when they exactly match the V2 field registry, an imported V1 fact on the locked case, or a bounded V1 evidence-provenance identifier on a real clone. This validation correction changes neither the database schema nor any score/rule/decision version.

## Final acceptance draft atomicity and V1 requested-change reopen

The corrected V2 draft upsert locks the case and rechecks exact successful receipt replay before it validates the draft lifecycle and expected version. A stale version or non-draft case now returns `VERSION_CONFLICT` before `pr1b_claim_command`, so the failed command cannot commit an `in_progress` receipt, authoring revision, child row, case-head change, or privileged audit. Same-key concurrent requests still produce one commit and one exact replay.

The existing service-role-only V1 response-upsert RPC remains protected by fresh `assess.response.write` authority, tenant/workspace ancestry, optimistic versioning, strict payload validation, idempotency, and atomic audit. It now accepts mutable `Draft` rows and the narrowly authorized `Changes Requested` reopen transition only. Saving reviewer-requested corrections atomically writes the responses, returns the assessment to `Draft`, clears the prior deterministic `scores` and `score_version`, increments the version, and records sanitized reopen metadata. Approved, rejected, in-review, ready-for-review, handed-off, archived, deleted, cross-tenant, stale-authority, and stale-version rows cannot use response upsert to reopen or mutate lifecycle state.

Executed isolated PostgreSQL 15 verification passed: stale-version and reviewer-ready V2 draft conflicts left case state, immutable versions, decision-owned rows, receipts, and audits unchanged; one valid same-key draft race still yielded one commit and one replay. The same harness proved `Changes Requested -> Draft` clears both score columns with one successful receipt/audit and exact replay, while an unrelated locked V1 status returns `VERSION_CONFLICT` with no response, lifecycle, score, receipt, or audit change. No hosted or live database was accessed.

Rollback remains feature disablement or read-only maintenance with all V1/V2 rows, scores, receipts, audits, and immutable history preserved, followed by another additive forward fix. Do not restore post-claim V2 conflict handling, reopen locked V1 lifecycle states broadly, retain stale scores on a reopened draft, destructively reverse migrations, or alter `assess-core-2026-05` scoring behavior.
