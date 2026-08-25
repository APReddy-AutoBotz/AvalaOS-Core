# Cleanup and rollback

## Per-run cleanup

1. Stop local preview, Edge, and test processes without touching unrelated processes.
2. Remove only the exact disposable PostgreSQL container/volume and synthetic database created for the recorded run ID.
3. Remove only synthetic rows/objects whose tenant/workspace and run marker match the campaign manifest; never use a broad production or workspace-root target.
4. Confirm zero claimed receipts, pending managed-secret writes, unfinished cleanup intents, duplicate effects, or provider routes left enabled by the run.
5. Delete generated artifacts only from `output/full-platform/<run-id>/` after the sanitized summary and defect ledger are preserved as required.
6. Leave `.env.openai.local` and `.env.groq.local` ignored and untracked; do not read, copy, attach, commit, or delete them. The user controls key rotation/revocation.
7. Run `git status --short` and confirm the campaign did not modify protected local state or tracked product files unexpectedly.

## Failure behavior

On a tenant, authority, secret, provider, cost, route, evidence-integrity, or cleanup mismatch, stop the affected track. Record a sanitized `blocked`, `confirmed source defect`, or `suspected defect requiring deeper validation` result. Do not reinterpret it as PASS, switch targets, use another tenant, or broaden authority.

## Code rollback/read-only fallback

A later code fix must remain in the implementation PR with its focused regression, full applicable rerun, sanitized evidence, and rollback note. Rollback is feature/route disablement or read-only projection while immutable records are preserved, followed by an additive forward fix. Do not rewrite scoring history, acceptance provenance, receipts, reviews, approvals, or historical evidence. Any rollback of PR #255 evidence contracts must stop evidence publication and controlled human testing until catalog, provenance, exact assertions, composite bindings, observers, reports, and workflows are compatible again.

This campaign itself authorizes no deployment rollback, hosted mutation, credential rotation, incident action, merge, or PR readiness transition.
