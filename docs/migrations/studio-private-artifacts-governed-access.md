# Studio private artifacts governed access migration

Status: Studio PR B candidate source contract. This document is not hosted, deployment, Storage-provider, pilot, production, security-certification, or compliance evidence.

## Authority and data flow

`20260729163251_studio_private_artifact_authority.sql` is an additive boundary over exact current approved PR A artifact versions. `document_generations` remains legacy/unverified and cannot enter this authority. The browser receives only `studio_private_artifact_projection(organization, workspace, artifact_version)` and cannot choose storage, hashes, MIME, renderer, ancestry, lifecycle, retention, hold, or deletion authority. All mutation and provider-completion RPCs are service-role-only and revalidate the current active human, organization/workspace membership, narrow capability, and authorization version before inspecting receipts or resources.

Six capabilities are independent: rendition generation, download, retention management, legal-hold management, deletion request, and deletion approval. Eleven new tables force RLS and have no browser table grants. Immutable triggers reject hard deletion and metadata rewrite; controlled saga fields are the only mutable columns.

## Rendition saga

`studio_private_artifact_command_claim(jsonb)` accepts `studio.rendition.generate` only for the aggregate's exact current `approved` version. A new committed command returns one `renditionClaim`; exact replay returns the committed safe response without another claim. The service starts the attempt, deterministically renders, uploads create-only to the exact server-derived object key, and reports verified hash, byte length, MIME, safe filename, and fixed renderer version. Completion creates one canonical rendition and snapshots the active retention policy atomically with audit. Failure creates a durable failed attempt and no available rendition.

The supported source contracts are `studio-markdown-1`, `studio-pdf-1`, and `studio-docx-1`. PostgreSQL does not render or move bytes. It authorizes and records the external side-effect saga.

## Private Storage contract

The migration never creates or alters provider-owned Storage schemas or tables. If both `storage.buckets` and `storage.objects` already exist, it upserts `studio-private-artifacts` as non-public and adds a restrictive anon/authenticated denial policy for that bucket. Service code uses the provider API; direct SQL metadata deletion is prohibited. Object keys are exact opaque attempt bindings under tenant/workspace prefixes and never appear in the browser projection, command receipt response, or audit metadata.

## Retention and legal hold

A system policy provides the safe default: indefinite retention. It is explicitly not a legal or regulatory claim. Tenant/workspace/artifact-type policies are immutable versions. Availability snapshots the selected policy. Later policy publication never rewrites a rendition snapshot; `studio_rendition_retention_extensions` can only extend it or make it indefinite.

Legal holds are append-only place/release events. Sensitive rationale remains internal. Active state is derived from an unmatched place event. Hold and deletion commands serialize on the same rendition advisory and row lock.

## Governed deletion

An authorized requester creates an immutable request and evaluation snapshot. A different currently authorized human must approve or reject it. Approval rechecks effective retention and every active hold in the locked transaction. Only a newly committed eligible approval returns one internal `deletionClaim`. Provider failure records `deletion_failed`; provider success changes the rendition to `deleted` only after the external delete completed. Hash, size, MIME, format, ancestry, receipt, resolution, audit, and tombstone metadata remain durable. No metadata row has a hard-delete path.

## Download

`studio_artifact_download_claim(jsonb)` performs fresh authorization before receipt or rendition inspection and requires `available`. A new claim returns the internal binding only to the service-held caller; exact replay returns no executable claim. `studio_artifact_download_complete(receipt)` and `studio_artifact_download_fail(receipt, failure_code)` make completion or failure durable and auditable. Edge must return attachment headers and bytes; no signed URL is persisted or audited. If a provider-signed URL is ever required, the Edge boundary must cap it at 60 seconds; this migration does not issue one.

## Verification

- `node scripts/checkStudioPrivateArtifactMigrationContract.mjs` checks the capabilities, exact functions, forced-RLS inventory source, ACLs, safe projection, current-approved ancestry, no-shortening/hold/deletion guards, conditional private bucket, and absence of provider schema creation.
- `node scripts/testStudioPrivateArtifactMigrations.mjs` declares and executes 40 PostgreSQL 16 scenarios: 9 authority/isolation, 11 rendition, 7 retention/hold, 7 deletion, and 6 download. It also runs fresh full-chain, accepted-main upgrade, dirty atomic rejection, and conditional Storage-stub paths. Without `STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL`, PostgreSQL execution is reported as not run.
- The retained PR A migration harness now accepts this additive chronological tip while preserving its membership-forward-fix and PR A checks.

## Rollback and recovery

Set `enabled=false`, `read_only=true`, `provider_enabled=false`, `download_enabled=false`, and `deletion_enabled=false` in the single runtime-control row through an approved forward operational change. Stop renderer/upload/download/delete workers. Retain safe projections and every committed metadata, receipt, hold, deletion, and audit row. Reconcile external orphan/missing objects from attempt state and exact hashes through an additive forward fix; never restore browser authority, make the bucket public, hard-delete metadata, or destructively down-migrate.

No deployment, hosted/live Supabase access, provider integration, public sharing, Delivery/Monitor work, scoring change, readiness claim, security certification, or compliance claim is made.
