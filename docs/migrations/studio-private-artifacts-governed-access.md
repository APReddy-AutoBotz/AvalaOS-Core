# Studio private artifacts governed access migration

Status: Studio PR B candidate source contract. This document is not hosted, deployment, Storage-provider, pilot, production, security-certification, or compliance evidence.

## Authority and data flow

`20260729163251_studio_private_artifact_authority.sql` is an additive boundary over exact current approved PR A artifact versions. `document_generations` remains legacy/unverified and cannot enter this authority. The browser receives only `studio_private_artifact_projection(organization, workspace, artifact_version)` and cannot choose storage, hashes, MIME, renderer, ancestry, lifecycle, retention, hold, or deletion authority. All mutation and provider-completion RPCs are service-role-only and revalidate the current active human, organization/workspace membership, narrow capability, and authorization version before inspecting receipts or resources.

Six capabilities are independent: rendition generation, download, retention management, legal-hold management, deletion request, and deletion approval. Eleven new tables force RLS and have no browser table grants. Immutable triggers reject hard deletion and metadata rewrite; controlled saga fields are the only mutable columns.

## Rendition saga

`studio_private_artifact_command_claim(jsonb)` accepts `studio.rendition.generate` only for the aggregate's exact current `approved` version. A new committed command returns one `renditionClaim`; exact replay returns the committed safe response without another claim. The service starts the attempt, deterministically renders, uploads create-only to the exact server-derived object key, and reports verified hash, byte length, MIME, safe filename, and fixed renderer version. Completion creates one canonical rendition and snapshots the active retention policy atomically with audit. Failure creates a durable failed attempt and no available rendition.

The canonical renderer versions are `studio-markdown-1`, `studio-pdf-1`, and `studio-docx-1`. The claim also carries the exact immutable Studio template version and `studio-artifact-1` schema version. The production normalizer consumes the accepted PR A heading/body fixture, title/summary/section content, template-keyed BRD/FRD/PDD inventories, and bounded nested JSON without silent field loss. PostgreSQL does not render or move bytes; it authorizes and records the external side-effect saga.

## Private Storage contract

The migration never creates or alters provider-owned Storage schemas or tables. The only accepted bucket authority is exactly `studio-private-artifacts`; SQL constraints, conditional Storage bootstrap, and service configuration reject archive or comma-delimited alternatives. If both `storage.buckets` and `storage.objects` already exist, the migration upserts that exact bucket as non-public and adds a restrictive anon/authenticated denial policy for it. Service code uses the provider API; direct SQL metadata deletion is prohibited. Object keys are exact opaque rendition bindings under tenant/workspace `studio-artifacts` prefixes and never appear in the browser projection, command receipt response, or audit metadata.

## Retention and legal hold

A system policy provides the safe default: indefinite retention. It is explicitly not a legal or regulatory claim. Tenant/workspace/artifact-type policies are immutable versions. Availability snapshots the selected policy. Later policy publication never rewrites a rendition snapshot; `studio_rendition_retention_extensions` can only extend it or make it indefinite.

Legal holds are append-only place/release events. Sensitive rationale remains internal. Active state is derived from an unmatched place event. Hold and deletion commands serialize on the same rendition advisory and row lock.

## Governed deletion

An authorized requester creates an immutable request and evaluation snapshot. A different currently authorized human must approve or reject it. Approval rechecks effective retention and every active hold in the locked transaction. Only a newly committed eligible approval returns one internal `deletionClaim`. Provider failure records `deletion_failed`; provider success changes the rendition to `deleted` only after the external delete completed. Hash, size, MIME, format, ancestry, receipt, resolution, audit, and tombstone metadata remain durable. No metadata row has a hard-delete path.

## Download

`studio_artifact_download_claim(jsonb)` performs fresh authorization before receipt or rendition inspection and requires `available`. A new claim returns the internal binding only to the service-held caller; exact successful replay returns the same strictly decoded private binding with the original receipt so the broker can verify and return the exact file again. Failed receipts require a new idempotency key. `studio_artifact_download_complete(receipt)` and `studio_artifact_download_fail(receipt, failure_code)` make completion or failure durable and auditable. Edge must return attachment headers and bytes; no signed URL is persisted or audited. If a provider-signed URL is ever required, the Edge boundary must cap it at 60 seconds; this migration does not issue one.

## Verification

- `studioPrivateArtifactRpcContract.test.ts` parses the candidate migration and proves every production RPC function name and exact argument-key set, strict claim vocabulary, and replay rule against the authoritative typed manifest.
- `node scripts/checkStudioPrivateArtifactMigrationContract.mjs` checks the capabilities, exact functions, forced-RLS inventory source, ACLs, safe projection, current-approved ancestry, no-shortening/hold/deletion guards, conditional private bucket, and absence of provider schema creation.
- `node scripts/testStudioPrivateArtifactMigrations.mjs` declares and executes 62 PostgreSQL 16 scenarios: the original 46 authority, rendition, retention/hold, deletion, download, and real cross-layer cases plus 16 production reconciliation, race, exhaustion, hold/retention recheck, and exact-bucket-authority cases. It also runs fresh full-chain, accepted-main upgrade, dirty atomic rejection, and conditional Storage-stub paths. Without `STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL`, PostgreSQL execution is reported as not run.
- The retained PR A migration harness now accepts this additive chronological tip while preserving its membership-forward-fix and PR A checks.

Executed local evidence for this hardening candidate: the complete Studio private-artifact source suite passed; deterministic renderer tests passed 27/27; focused coverage passed 69/69 at 100% lines/functions and 93.67% branches; the strict worker suite passed 8/8; repository and Edge typechecks, production build, secret hygiene, AI-boundary scan, diff check, and dependency audit passed with zero reported vulnerabilities. The isolated local PostgreSQL 16 harness passed 62/62 scenarios across fresh, accepted-main upgrade, dirty atomic rejection, conditional Storage, authority, lifecycle, real two-connection race, recovery, replay, retention/hold, exhaustion, and exact bucket boundaries. Reconciliation evidence recorded one rendition provider upload, three deletion presence probes, and one provider delete. The previously published 30/30 desktop/Pixel 7 result predates this correction, while exact-head Studio browser CI is green for the published predecessor SHA; all exact-head workflows must rerun after this correction commit before acceptance.

## Rollback and recovery

Set `enabled=false`, `read_only=true`, `provider_enabled=false`, `download_enabled=false`, and `deletion_enabled=false` in the single runtime-control row through an approved forward operational change. Stop renderer/upload/download/delete workers. Retain safe projections and every committed metadata, receipt, hold, deletion, and audit row. Reconcile external orphan/missing objects from attempt state and exact hashes through an additive forward fix; never restore browser authority, make the bucket public, hard-delete metadata, or destructively down-migrate.

No deployment, hosted/live Supabase access, provider integration, public sharing, Delivery/Monitor work, scoring change, readiness claim, security certification, or compliance claim is made.
