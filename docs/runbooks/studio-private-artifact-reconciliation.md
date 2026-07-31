# Studio private-artifact reconciliation runbook

Status: source and disposable-test operating contract for Studio PR B. No worker, schedule, bucket, Edge function, or hosted database deployment is claimed.

## Purpose and authority

This worker recovers durable rendition or deletion attempts after an external Storage outcome or database completion became uncertain. It is service-to-service only. A browser, user JWT, command receipt, email match, route, or UI state cannot invoke or authorize reconciliation.

The canonical Storage bucket is exactly `studio-private-artifacts`. Set both `STUDIO_PRIVATE_ARTIFACTS_BUCKET` and `STORAGE_PRIVATE_BUCKET_ALLOWLIST` to that single value. Do not configure aliases, archive buckets, or comma-delimited alternatives.

## Required configuration

- Deploy the `studio-private-artifact-reconcile` function only through the separately approved deployment process.
- Store `STUDIO_PRIVATE_ARTIFACT_RECONCILIATION_WORKER_SECRET` as a server-held secret of at least 32 characters with no surrounding whitespace. Do not reuse a user JWT, Supabase anon key, service-role key, provider credential, or browser-visible value.
- Keep `verify_jwt = false` only because the handler performs its own dedicated worker-secret authentication. The handler rejects any `Authorization` or `Origin` header and emits no CORS grant.
- Keep runtime mutation and provider controls disabled until the separately approved environment is ready. This PR does not authorize enabling them.

## Invocation contract

An approved internal scheduler or queue consumer sends POST requests to one route:

- `/functions/v1/studio-private-artifact-reconcile/rendition`
- `/functions/v1/studio-private-artifact-reconcile/deletion`
- `/functions/v1/studio-private-artifact-reconcile/due`

Required headers are `Content-Type: application/json` and `x-avala-studio-worker-secret`. A one-attempt body contains exactly one UUID field: `{"attemptId":"<uuid>"}`. The due-work body contains exactly `{"limit":<integer>}` with a limit from 1 through 50. The service-only due RPC selects stale work and returns only work kind plus internal attempt ID; the HTTP response reports only aggregate sanitized counts. Do not send tenant IDs, object keys, bucket names, content, hashes, user tokens, or signed URLs.

Queue only attempt IDs selected from server-side durable reconciliation state. Do not let a caller supply arbitrary attempts. A 200 response reports only a sanitized status and optional stable failure code. A 401, 400, 405, or 503 is not completion evidence.

## Safe retry and crash recovery

1. The claim RPC serializes on the attempt and rechecks current human authority, runtime controls, approved ancestry, and exact Storage metadata. Deletion discovery returns no provider binding. Immediately before deletion, the execution-guard RPC reauthorizes the independent approver, locks the rendition and attempt, rechecks retention, holds, and lifecycle, establishes the provider-effect fence, and only then returns the exact private binding.
2. One active claim transitions the attempt to `reconciling`; a racing worker receives no executable work.
3. A claim left incomplete for five minutes is eligible for recovery. Fresh `requested`, `rendering`, `uploaded`, or provider-execution work remains ineligible until its lease is stale. Never bypass the lease with direct table mutation.
4. Rendition recovery probes the exact expected object. A verified existing object is completed without another upload; a missing object is recreated only from committed approved server content; mismatched bytes fail closed.
5. Deletion recovery probes the exact expected object first. Confirmed absence permits tombstoning without a second delete. Confirmed presence permits one exact delete. Unknown outcomes remain reconcilable.
6. When the durable reconciliation counter reaches three, the claim RPC persists `RECONCILIATION_EXHAUSTED` or `DELETION_RECONCILIATION_EXHAUSTED`. Stop automatic retries and escalate for source/data review; do not reset counters or edit rows.

## Monitoring and evidence hygiene

Monitor aggregate counts by sanitized status and stable failure code. Alert on exhausted attempts, repeated 503 responses, authentication failures, or claims remaining `reconciling` beyond the five-minute recovery window. Evidence may record commit SHA, workflow/run identifiers, scenario counts, and aggregate provider-operation counts. Never record secrets, raw logs, customer content, signed URLs, object keys, object identifiers, bucket internals, or production infrastructure identifiers.

## Stop, rollback, and read-only fallback

Stop the scheduler/queue consumer first. Through a separately approved forward operational change, set the Studio private-artifact runtime controls to disabled/read-only and disable provider, download, and deletion execution. Preserve private objects and every attempt, receipt, hold, deletion, tombstone, and audit row. Continue only read-only safe projections. Recovery is an additive forward fix; never make the bucket public, grant browser Storage access, release holds, shorten retention, hard-delete metadata, reset reconciliation counters, or edit an accepted migration.

Hosted invocation, deployment, provider Storage behavior, backup/restore, incident response, pilot, production, security certification, compliance, and jurisdictional retention sufficiency remain not run.
