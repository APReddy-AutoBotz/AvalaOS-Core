# Studio Governed Artifact Authority

Status: PR A implementation boundary. PR 1G remains accepted. This document is source architecture, not deployment or hosted-readiness evidence.

## Scope and trust boundary

PR A converts one accepted PR 1E Studio handoff into one canonical artifact aggregate for each `brd`, `frd`, or `pdd` type. Each aggregate has append-only structured-JSON versions, durable generation attempts, independent human review, separate human approval, and deterministic supersession. The browser is a strict projection and command client. It cannot supply source ancestry, provider instructions, templates, content schemas, renderer authority, approvals, or internal completion operations.

The server derives the exact organization, workspace, case, source case version and number, decision and decision version, approved review resolution, Govern resolution, Studio handoff, package hash, schema version, rule-set version, review schema version, and review sequence from accepted PR 1E relations. Composite keys retain that ancestry. Missing, stale, superseded, unresolved, unapproved, or tenant-mismatched ancestry fails closed without existence disclosure.

## Provider staging

Provider execution is an external effect and is never represented as part of a PostgreSQL transaction. A human command first reauthorizes, claims actor-scoped idempotency, selects an immutable system template, creates or locks the aggregate, and commits a `requested` attempt with receipt and audit. A service-only handler then loads the committed source and template, invokes the governed provider, and treats output as untrusted. Completion validates schema, type, size, and content before atomically appending one draft and marking the attempt completed. Failure records only a sanitized stable code and creates no artifact version. Provider retries cannot duplicate a committed version.

## Lifecycle and people

Generation attempts are `requested`, `generating`, `completed`, or `failed`. Artifact versions are `draft`, `reviewer_ready`, `in_review`, `changes_requested`, `review_rejected`, `approval_ready`, `approved`, `approval_rejected`, or `superseded`. Human revision appends a descendant draft. Review and approval always target the exact current eligible version and expected aggregate version; historical matching states are non-actionable.

The author/requester, reviewer, and final approver must be three different active, freshly authorized humans in the same organization and workspace. Provider or service identities cannot review or approve. Approving a descendant atomically supersedes the previous approved version and advances the sole current-approved pointer; the previous version remains immutable and readable.

## Capabilities and access

| Capability | Authority |
| --- | --- |
| `studio.artifacts.read` | Tenant/workspace-scoped strict read projection only |
| `studio.artifacts.generate` | Request server-controlled generation |
| `studio.artifacts.edit` | Append a human-authored descendant draft |
| `studio.artifacts.review` | Submit, assign, and resolve independent review |
| `studio.artifacts.approve` | Resolve separate final approval |

Mutation RPCs are service-role-only and independently validate active profile, organization and workspace memberships, capability, authorization version, exact ancestry, expected versions, and separation of duty. Authorization precedes receipt or resource inspection. Only the intended forced-RLS read projection is client-executable; internal helpers revoke direct `PUBLIC`, `anon`, `authenticated`, and unnecessary service-role execution.

## Legacy and later work

Existing `document_generations` records remain durable **legacy/unverified** rows. They are not accepted PR 1E descendants and cannot be reviewed, approved, exported, delivered, or treated as canonical. Enterprise Studio paths cannot write them. Clearly labelled local-demo behavior remains isolated from enterprise authority.

PR B remains future work. PR A creates no Storage bucket, object path, signed URL, rendition, PDF/DOCX/Markdown file, export/download authority, retention, legal hold, or deletion behavior. The product states: **“Private export and governed download are not available in this release.”**

## Rollback and non-claims

Rollback is feature disablement: disable mutations and provider generation, retain a read-only projection of every committed aggregate, version, attempt, review, approval, receipt, and audit record, and apply additive forward fixes. Never restore browser authority or legacy enterprise writes. PR A makes no deployment, hosted/live Supabase, private-storage, export correctness, pilot, production, security-certification, or compliance claim and does not alter Assess scoring or decision law.

PR #216 also carries an additive forward correction for the accepted PR 1B shared membership trigger's row-type defect. Table-specific organization and workspace trigger functions preserve strict role scope, tenant, workspace, active-state, and soft-deletion checks without any normal-execution trigger bypass. This is source remediation only: no deployment or live migration has occurred.
