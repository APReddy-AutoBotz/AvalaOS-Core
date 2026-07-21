# PR 1E Governed Review Candidate Evidence

Base: `779a4801aa7c6660ad4581f8e334f5ad422519e7`.

## Implemented boundary

Additive immutable V2 review assignments, evidence attestations, review resolutions, action-specific Govern resolutions, durable Studio handoff/source records, typed Edge commands, tenant-scoped read projections, enterprise review workspace, and PR-owned CI are included. V1 scoring and PR 1D decisions are unchanged.

Reviewer assignment is an end-to-end server-authoritative path: the browser reads a tenant/workspace/case/decision-scoped eligible-reviewer projection, presents a selector rather than a UUID field, and submits only a selected projected actor. The server revalidates active identity, current authorization version, review, evidence-attestation and approval capabilities, exact ancestry, and author/reviewer separation before committing `in_review` and queue visibility.

## Executed evidence

- `npm ci`: passed.
- `npm audit --audit-level=moderate`: passed; zero vulnerabilities.
- TypeScript and Edge typecheck: passed.
- `npm run test:pr1e`: passed.
- Focused PR 1E coverage after governed-review correction: 98.47% lines, 97.78% functions, 83.72% branches.
- The corrected PR 1E migration validates every command-specific state, lineage, separation-of-duty, evidence, review, Govern, control-disposition, and handoff condition before receipt claim; exact succeeded replay remains before mutable-resource checks.
- Review persistence separates `review_schema_version` from `review_sequence` and binds the immutable decision ID/version and `decision.source_version_id` authoring version. Assignment and acting-reviewer authorization versions are retained separately.
- Approval confidence uses the assignment's locked material-claim registry, not the set of evidence rows. Missing, unrelated, expired, contradictory, rejected, needs-information, or unattested evidence cannot yield `Verified`.
- Requested-change revision copies the decision source version's immutable `source_snapshot`, `imported_facts`, imported evidence rows, and claim identifiers without accepting browser replacements.
- Every PR 1E direct-table read policy requires current workspace capability plus an active same-tenant parent case and valid case/decision/source ancestry. PostgreSQL 16 CI owns executable cross-tenant and parent-soft-delete coverage.
- Govern records one explicit disposition per server-derived required control. Studio handoff rejects absent, unknown, unresolved, or unsatisfied conditional controls.
- Retained deterministic V1 scoring, PR 1A, PR 1B, PR 1C, and corrected PR 1D gates: passed through the recorded focused reruns; the initial aggregate run stopped only on stale additive-capability test expectations, which were corrected.
- AI boundary: 15 patterns, 742 allowed, zero forbidden, zero stale allowlist entries.
- Secret hygiene: five rules, 759 allowed classified hits, zero forbidden, zero tracked environment files.
- Production build and `git diff --check`: passed.
- PR 1E deterministic pilot-fixture browser journeys: 2 passed (Chromium desktop and Pixel 7 mobile). Each scenario selects an eligible reviewer, commits assignment, exposes the assigned queue, exercises recoverable false-success denial, blocks incomplete approval, completes independent attestations, approves to `Verified`, proves unresolved controls block Govern, resolves all controls, commits Studio handoff, reloads the durable handoff, runs keyboard checks, axe serious/critical checks, and verifies no viewport overflow. No hosted or live infrastructure was used.

## Blocked or not run

- Local PostgreSQL 16 execution: blocked because no disposable PostgreSQL server was listening. Feature-owned PostgreSQL 16 CI is configured; its result must be taken from the draft PR workflow.
- Hosted/live infrastructure, deployment, storage, production logs, secrets, incident, backup/restore, pilot, production, buyer, security-certification, and compliance validation: not run and outside scope.

## Rollback

Disable the V2 review command boundary or set the existing V2 runtime control to read-only. Preserve immutable review, attestation, approval, Govern, handoff, receipt, and audit history. Use additive forward-fix migrations; do not destructively roll back accepted data or restore browser authority.
