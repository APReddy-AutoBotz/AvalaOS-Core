# Assessed documentation and planning approval

An assigned independent reviewer may approve a current Assess V2 decision for
documentation and planning after reviewing every submitted evidence item tied
to its material claims. The immutable resolution is
`planning_approved` with purpose `documentation_planning`. It stores the
decision's actual confidence. It does not create a Verified result or a Govern
resolution.

The planning handoff is an assessed source. It binds the current case, source
version, decision, independent review resolution, accepted claim evidence and
unresolved claim questions. Its Govern reference is null by contract. The
server constructs and hashes the package. Browser input supplies only the
planning purpose.

The existing implementation-readiness path is unchanged. Its `approved`
resolution still requires accepted independent evidence for every material
claim, records Verified confidence and requires Govern before Studio handoff.

## Acceptance and evidence

- Current author, reviewer and handoff actors retain separate server-authorized
  identities and current authorization versions.
- Stale source versions, stale reviewer authority, changed replays and a
  planning handoff with Govern authority fail closed.
- Reopening the review before and after handoff returns the same approval
  purpose, actual confidence, accepted evidence and unresolved questions.
- Studio receives `assess-v2-reviewed-planning-handoff.v1` and keeps assessed
  lineage. The remaining Studio and Delivery evidence is recorded with the
  implementation that consumes this contract.

Executed focused verification on 5 November 2026:

- `node scripts/testAssessedPlanningReviewPostgres.mjs` — passed against
  disposable PostgreSQL 16 after applying the complete candidate migration
  chain. It covered partial independent attestation, exact actual-confidence
  preservation, planning resolution and handoff replay, stale version and
  authorization rejection, changed-replay rejection, author/handoff separation,
  explicit Govern rejection, null-Govern package persistence, source-context
  equality and reopening the committed planning projection.
- `node --test scripts/assessedPlanningReviewContract.test.mjs` — 4/4 passed.
- `npm run test:pr1e-workspace`, `npm run test:assess-v2-presentation`,
  `npm run test:pr1e-domain` and `npm run test:pr1e-command` — passed.
- `npm run typecheck` — passed on the integrated working tree. The exact
  candidate must still rerun the normal required merge gates.

## Rollback

Set Assess V2 to read-only before rollback. Disable the planning review and
planning handoff routes while retaining their immutable review, attestation and
handoff history. Keep provider execution disabled. Apply a forward migration
for any repair. Do not delete or rewrite planning resolutions, packages,
documents, approvals or board bindings.
