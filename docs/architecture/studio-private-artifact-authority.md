# Studio Private Artifact Authority

Status: Studio PR B implementation candidate. This document defines source architecture and verification obligations; it is not deployment, hosted Storage, pilot, production, security-certification, or compliance evidence.

## Objective and boundary

Studio PR B extends only the current approved canonical BRD, FRD, or PDD version accepted through PR #216. It creates deterministic Markdown, PDF, and DOCX renditions; stores them in a private server-controlled bucket; brokers authenticated downloads; snapshots versioned retention; supports governed legal holds; and requires independent approval before physical deletion.

The browser is an untrusted command client and strict projection. It cannot supply or override artifact ancestry, approval state, renderer or template versions, content hash, byte length, MIME type, storage provider, bucket, object key, retention evaluation, hold state, lifecycle, or service execution identity. Legacy `document_generations`, browser export helpers, local downloads, and the historical export Edge functions remain non-canonical.

## Trust and data flow

```text
Approved Studio artifact version
  -> authenticated PR B command
  -> fresh actor, organization, workspace, capability, and authorization-version check
  -> atomic database claim and immutable receipt
  -> deterministic server renderer
  -> durable rendered metadata and opaque object binding
  -> create-only private upload
  -> exact-byte readback and hash/size/type verification
  -> atomic available rendition, retention snapshot, and audit
  -> strict tenant/workspace projection
  -> authenticated brokered download
```

Database and Storage are not one transaction. Every external effect is surrounded by durable attempt state. Exact command replay returns the original receipt and never emits another render, upload, deletion, or download claim. Bounded service reconciliation uses committed attempt state and provider verification; it never trusts browser assertions.

## Canonical model

The additive PR B migration owns:

- immutable rendition attempts and canonical rendition metadata for one exact approved artifact version and format;
- versioned retention policies plus append-only extensions that cannot shorten a rendition snapshot;
- append-only legal-hold placement and release events;
- immutable deletion requests, independent resolutions, and execution attempts;
- actor-scoped command and download receipts;
- a private runtime control and an explicitly private bucket contract.

Rendition metadata preserves organization, workspace, artifact, artifact-version, format, MIME type, safe filename, byte length, SHA-256, renderer/template/schema versions, retention snapshot, lifecycle, and immutable deletion tombstone evidence. Bucket and object key remain private service fields and never appear in client projections, audits, logs, or evidence.

All new tables use enabled and forced RLS. Browser roles receive no table mutation or direct private-table read grant. Only exact projection RPCs are client-executable. Mutation and internal lifecycle helpers are private to the service execution role and independently reauthorize current identity, membership, capability, authorization version, scope, ancestry, expected version, and separation of duty.

## Renditions

Supported formats and renderer versions are:

| Format | Renderer | Contract |
| --- | --- | --- |
| Markdown | `markdown-v1` | UTF-8, fixed title/summary/section order, deterministic LF newlines, executable HTML and unsafe Markdown escaped. |
| PDF | `pdf-v1` | Valid PDF with deterministic objects/metadata, wrapped semantic text, a standard safe font, and no JavaScript, actions, forms, attachments, embedded files, or external references. |
| DOCX | `docx-v1` | Valid deterministic OOXML ZIP, explicit business-brief styles and page geometry, no macros, OLE/ActiveX, external relationships, remote images, or active content. |

The rendition lifecycle is:

```text
requested -> rendering -> uploading -> available
     \           \            \
      +-----------+-------------> failed

available -> deletion_requested -> deleting -> deleted
                                   \-------> deletion_failed
```

`available` is committed only after create-only upload and exact-byte verification. A provider or database failure cannot create a false available rendition. A deleted rendition retains immutable ancestry, format, hash, byte length, receipt, resolution, execution, and audit references.

## Private Storage and download

The canonical bucket is non-public. Object keys are generated only by server code, are opaque, include organization and workspace scope, contain no email, title, process name, or customer-controlled path fragment, and pass the accepted canonical origin/path/encoding guards. Browser roles cannot upload, overwrite, list, read, or delete canonical objects.

Downloads use `studio-artifact-download`, not a raw Storage URL. The broker authenticates the JWT, loads fresh authority, verifies `studio.artifacts.download`, binds exact tenant/workspace/artifact/rendition ancestry, claims a durable receipt, downloads and verifies the exact private bytes under service authority, and returns:

- the exact MIME type;
- a sanitized `Content-Disposition: attachment` filename;
- `Cache-Control: private, no-store`;
- `X-Content-Type-Options: nosniff`.

No signed URL is issued, persisted, logged, or returned. The maximum signed-URL TTL for this boundary is therefore **not applicable**.

## Retention, legal hold, and deletion

Availability atomically snapshots the active versioned retention policy. A fail-closed system default uses indefinite retention and makes no legal or regulatory claim. Later policy versions do not rewrite existing snapshots. An authorized append-only extension may lengthen a finite retention period or make it indefinite; shortening is prohibited.

Legal-hold placement and release are separately authorized append-only events. Projections expose only safe hold status, not sensitive rationale. Any active hold blocks physical deletion.

Deletion requires:

1. an active authorized requester;
2. a durable request over one exact rendition and lifecycle version;
3. a different active authorized human to approve or reject;
4. an execution-time lock and fresh authority, retention, hold, and lifecycle recheck;
5. service-role physical deletion;
6. a verified provider result before committing `deleted`.

Retention, hold placement/release, deletion resolution, and execution serialize on the rendition so a concurrent hold cannot be bypassed. Provider failure commits `deletion_failed`, not `deleted`. A physical delete followed by database completion failure remains nonterminal until reconciliation verifies provider absence and writes the tombstone.

## Capabilities

- `studio.artifacts.rendition.generate`
- `studio.artifacts.download`
- `studio.artifacts.retention.manage`
- `studio.artifacts.legal_hold.manage`
- `studio.artifacts.delete.request`
- `studio.artifacts.delete.approve`

Existing `studio.artifacts.read` continues to authorize the safe artifact/rendition projection. Broad administrator status alone is not sufficient authority.

## Failure, reconciliation, and rollback

Stable public failures distinguish unavailable authority, stale authorization, permission denial, version/idempotency conflict, separation of duty, invalid command, rendering/storage failure, retention or hold blocking, download unavailability, read-only mode, and command unavailability without disclosing resource existence or internal provider details.

Rollback is fail-closed feature disablement: disable PR B mutation and provider execution, retain read-only committed projections and private objects, and apply an additive forward fix. Never make the bucket public, restore browser Storage authority, issue permanent links, hard-delete canonical metadata, shorten retention, release holds as rollback, or edit an accepted migration.

## Verification and non-claims

Acceptance requires source guards; deterministic renderer and fake-Storage tests; PostgreSQL 16 fresh, upgrade, dirty-data, RLS, authority, replay, concurrency, retention, hold, deletion, and download scenarios; strict client decoder tests; production-preview desktop/mobile browser, keyboard, responsive, performance-budget, and axe evidence; focused coverage; build; dependency audit; and secret hygiene.

Hosted/live Supabase, provider Storage, deployment, backup/restore, incident, release, pilot, production, buyer, security-certification, jurisdiction-specific retention, and compliance validation remain **not run**. This PR does not change Assess scoring, formulas, weights, thresholds, hard stops, or decision law, and it does not implement Delivery or Monitor.
