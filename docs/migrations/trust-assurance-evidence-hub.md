# Trust Assurance Evidence Hub migration contract

## Reservation and compatibility

The currently published file, `20260807120000_trust_assurance_evidence_hub.sql`, is an additive migration after the accepted-main maximum `20260730190000`, but its timestamp is **not collision-safe**: active Draft PR #221 already owns `20260807120000_enterprise_review_action_replay_authority.sql` and currently extends through at least `20260807130000_provider_secret_cleanup_recovery.sql`.

Renaming the Trust migration is a mandatory post-#221 convergence blocker. Do not choose a replacement while PR #221 is moving. After PR #221 is human-merged, determine the final accepted canonical migration maximum and rename this file once to a unique timestamp strictly later than that maximum. The Trust migration must remain otherwise independent of PR #221 tables, functions, and migrations. Feature scripts discover the migration by the stable `*_trust_assurance_evidence_hub.sql` suffix, and the workflow uses the same suffix glob, so the convergence rename does not require changing test logic. The migration never edits accepted blobs, seeds tenants, deletes history, or supplies a destructive down migration.

## Controls

The migration adds normalized claim/evidence aggregates and immutable versions, exact-version links, immutable reviews/snapshots/publications, an atomic current-publication pointer, Trust-specific durable receipts, and append-only sanitized audits. Primary/composite foreign keys enforce organization/workspace lineage. Checks bound vocabulary, length, JSON shape, hashes, reference safety, lifecycle, and optimistic versions. Unique constraints enforce version/hash identity and one current publication per scope.

All canonical tables enable and force RLS. `PUBLIC`, `anon`, and `authenticated` receive no table mutation privileges. The mutation dispatcher, selected-aggregate lock helper, and active-participant helper are `SECURITY DEFINER`, revoked from browser roles, and executable only by `service_role`; fresh publisher authority precedes receipt inspection. Append-only triggers reject updates/deletes to versions/events/receipts/audits. Publication uses one database transaction and deterministic lock order: snapshot/publication scope; every exact selected claim aggregate sorted by UUID; every exact selected evidence aggregate sorted by UUID; then stored creator/reviewer participant authority rows in the accepted order. Current-version, scope, lifecycle, hash, evidence law, review, and participant truth are revalidated while those locks remain held through publication effects and commit.

## Application/upgrade verification

CI applies the accepted canonical chain plus this migration to disposable PostgreSQL 16 for fresh, accepted-main upgrade, and populated two-tenant upgrade cases. It verifies dirty/incompatible preflight rejection where applicable, transaction rollback, exact replay/conflict, immutable records, review invalidation, RLS/ACL, cross-tenant/workspace non-disclosure, current-version rules, creator/reviewer profile and membership revocation, deterministic revocation/publication locking, and one atomic current publication. Controlled multi-connection cases prove publication-first exclusion and mutation-first stale rejection for claim revision, evidence withdrawal, and evidence supersession without sleep-based race assumptions. Reapplication is not promised because canonical migration runners record applied migrations; schema repair uses a forward migration.

## Rollback

Set feature disabled/read-only before a forward repair. Do not run destructive SQL. Existing claims, evidence, reviews, audits, snapshots, publication events, and the current buyer-safe pointer remain readable through authorized server projections. This is source-level posture only; hosted rollback was not run.
