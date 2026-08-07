# Trust Assurance Evidence Hub migration contract

## Reservation and compatibility

`20260807120000_trust_assurance_evidence_hub.sql` is an additive migration reserved after accepted-main maximum `20260730190000`. It does not depend on PR #221 tables/functions/migrations. Managed publication must compare the refreshed PR #221 migration list; any collision requires a new later timestamp before publication. The migration never edits accepted blobs, seeds tenants, deletes history, or supplies a destructive down migration.

## Controls

The migration adds normalized claim/evidence aggregates and immutable versions, exact-version links, immutable reviews/snapshots/publications, an atomic current-publication pointer, Trust-specific durable receipts, and append-only sanitized audits. Primary/composite foreign keys enforce organization/workspace lineage. Checks bound vocabulary, length, JSON shape, hashes, reference safety, lifecycle, and optimistic versions. Unique constraints enforce version/hash identity and one current publication per scope.

All canonical tables enable and force RLS. `PUBLIC`, `anon`, and `authenticated` receive no table mutation privileges. The mutation dispatcher is `SECURITY DEFINER`, revoked from browser roles, and executable only by `service_role`; its fresh-authority assertion precedes receipt inspection. Append-only triggers reject updates/deletes to versions/events/receipts/audits. Publication uses one database transaction and locks the snapshot/receipt.

## Application/upgrade verification

CI applies the accepted canonical chain plus this migration to disposable PostgreSQL 16 for fresh, accepted-main upgrade, and populated two-tenant upgrade cases. It must verify dirty/incompatible preflight rejection where applicable, transaction rollback, exact replay/conflict, concurrency winner, immutable records, review invalidation, RLS/ACL, cross-tenant/workspace non-disclosure, current-version rules, and one atomic current publication. Reapplication is not promised because canonical migration runners record applied migrations; schema repair uses a forward migration.

## Rollback

Set feature disabled/read-only before a forward repair. Do not run destructive SQL. Existing claims, evidence, reviews, audits, snapshots, publication events, and the current buyer-safe pointer remain readable through authorized server projections. This is source-level posture only; hosted rollback was not run.
