# Authenticated Studio publication and Delivery outcome migration

Migration `20261010051100_authenticated_studio_delivery_outcome_monitor.sql` adds the production boundary from one exact, current, approved assessed Studio artifact version to one immutable legacy Docs generation. A human supplies the bounded structured work-item payload. The boundary never parses BRD prose and never invokes an AI provider to generate tasks. The materialized generation includes a legacy-compatible primary `brd`, `frd`, or `pdd` document derived only from the approved Studio title and ordered section identifiers, titles, and bodies. It also retains the complete approved Studio content unchanged as `approvedStudioContent`, preserving its summary, source anchors, labels, citations, and other source metadata without manufacturing quality, diagram, approval, or document content.

The same boundary lets an authorized Delivery user record an explicit outcome against one exact current authoritative imported task. Each immutable outcome version retains the legacy import, document generation, publication, Studio artifact version, task version, recorder, authorization version, receipt, and privileged audit identity. Monitor uses a separate stable query that reads only the current outcome version through that complete ancestry. It performs no write and supplies no inference or legacy fallback.

Delivery task assignment uses a separate read-only projection in this boundary. It requires the same current assignment authority as the existing `task.assign` mutation and one exact active project. It returns only IDs and bounded display names for profiles whose profile, organization membership, and exact workspace membership are all active and not deleted. It does not return emails, roles, capabilities, inactive members, or foreign-tenant members. Users without assignment authority can continue bounded `task.update.own` edits; the client preserves the existing assignment and does not request this directory.

Delivery can also save one immutable, point-in-time Delivery Pack state. The browser identifies only the project. The server locks that active project, derives every current active authoritative task, validates each imported task's exact import, document generation, Studio publication, process, and assessment ancestry, and hashes the ordered snapshot. One command creates one snapshot, one receipt, and one privileged audit event atomically. This operation does not export a pack, create tasks, infer outcomes, or change scoring.

## Install and rollout

The migration requires the exact nonproduction predecessor marker `20261010025331`. It rejects production/customer/provider authorization, drifted retained marker consumers, and any controlled-human exercise that is not deprovisioned. The marker advances to `20261010051100` only after the complete schema, functions, triggers, grants, and revokes install in the same transaction.

New writes default off because installation creates no `studio_delivery_workspace_controls` row. A separately authorized operator may enable `publication_writes_enabled`, `outcome_writes_enabled`, or `pack_writes_enabled` for an eligible workspace only after deployment and source verification. This repository change does not enable any control.

Only the service role can execute:

- `studio_delivery_apply_command(...)` through `studio-delivery-authority-command`
- `studio_delivery_outcome_query(...)` through `studio-delivery-outcome-query`
- `studio_delivery_pack_snapshot_query(...)` through the same authenticated read endpoint
- `studio_delivery_assignee_query(...)` through the same authenticated read endpoint

Browser, authenticated, anonymous, and service-role direct access to publication, outcome, snapshot, and receipt tables remains revoked. The Edge handlers authenticate the actor and current tenant/capability version before the RPC, and recheck current authority after a committed or replayed command.

The materialized `document_generations` row intentionally retains the established Docs read boundary: an active member of its exact workspace with `assess.read` may read it through the existing RLS policy when the active project and Assess source chain also match. The `assess.read` requirement comes from the existing RLS policies on that source chain; the row is not protected by the narrower Studio publication capability. Foreign users, deactivated workspace members, and members without source-chain read authority receive zero rows. Publication bindings, human outcomes, saved pack snapshots, receipts, and audits remain service-only and capability-projected.

The legacy Delivery adapter explicitly maps the authoritative task lineage's `sourceProcessId`, `sourceAssessmentId`, and `documentGenerationId` to the UI lineage fields while retaining the complete canonical lineage record. A published `studio-approved-work-items.v1` generation is therefore shown as linked. Its publication proves that the exact Studio artifact version was approved, but the legacy generation does not contain detailed Studio approval, quality, decision, Govern, or audit history. The Delivery Pack identifies that history as unavailable in this projection and directs review to Studio. It does not substitute the project's V1 source anchor as a V2 decision, mark absent quality history as not required, or manufacture approval and audit events.

Studio publication requires an active project whose source process matches the approved Studio artifact's exact server-derived V2 case, decision, and Govern ancestry. Existing projects may retain their independently bound same-process V1 source anchor. A native current-assessment project instead binds the exact V2 case, decision and Govern resolution directly and keeps both the project and publication `source_assessment_id` null; publication never fabricates clone ancestry. Its safe response and imported task lineage include the exact V2 case and decision IDs whenever that V1 field is null. When the V2 case is an actual V1 clone, its source assessment and score version must exactly match the project anchor. The command creates a new historical `document_generations` row and never changes an earlier generation.

Additive migration `20261103104435_delivery_requirement_bound_proposals.sql` keeps that authority and adds exact approved-requirement bindings. The replacement service RPC strips browser-visible links before invoking the accepted publication command, then validates every link against an explicit requirement line in the exact approved artifact and commits immutable binding rows in the same transaction. It rejects invented links and changed-link idempotency replays. The Edge adapter no longer grants the service role direct execution of the older publication RPC.

Newly bound imports copy the stable proposal origin, artifact aggregate identity, exact approved revision and exact section links into immutable task lineage. The origin hashes the stable artifact aggregate, work-item type and canonically sorted section/requirement identities: link reordering is invariant; stable requirement IDs survive title/wording revisions while exact historical quotes remain retained; a future revision of the same declared requirement cannot silently duplicate a confirmed item; and identical text in an unrelated artifact remains distinct. A bound-only import authority materializes explicitly selected Epics as normal persistent work items, including Epic-only selections; the prior importer continues treating Epics as grouping labels for every unbound legacy document. Normal Delivery detail discloses the approved artifact/revision, section and quote without adding Studio access. A second project task with the same origin is rejected. Existing publications have no binding rows, bypass the new binding trigger, and retain their accepted import behavior. Rollback disables new publication writes and retains all bindings and imported tasks for read-only inspection and additive forward repair.

Before materialization, the command requires a bounded approved title and one to 100 ordered sections. Every section must have one stable `id` or `key`, one non-empty title, and one bounded `body` or `content`; duplicate or conflicting keys and bodies are rejected. Malformed approved content fails closed with no publication, generation, receipt, or audit effect.

## Focused verification

The disposable PostgreSQL test `node scripts/studioDeliveryAuthorityPostgres.mjs` applies the real migration chain and verifies:

- dirty predecessor marker rejection with transactional zero-schema-effect rollback;
- default-off denial with zero receipt, document, publication, outcome, or audit effect;
- exact approved-version publication, immutable document binding, receipt and audit atomicity;
- exact primary-document title and ordered sections derived from the approved version, with unchanged approved source metadata and malformed-content zero-effect denial;
- native V2 publication through an exact same-process legacy project anchor without changing the case's null clone source;
- matching cloned-V2 publication, plus clone source/score mismatch, different-process project anchor, and foreign-tenant project denial with zero effects;
- exact replay, changed-payload conflict, and second-publication version conflict;
- unchanged legacy import of prior publications, plus requirement-bound import with artifact/revision details, canonical link-order replay, same-artifact origin stability, distinct-artifact separation and once-only board materialization;
- explicit first and successor outcome versions with stale-version rejection;
- default-off, exact replay, changed-payload conflict, immutable history, exact ancestry, and read-only latest projection for Delivery Pack snapshots;
- exact project/task/import/document/Studio lineage and foreign-project non-disclosure;
- complete, zero-write assignee projection for current assignment authority, including inactive-member filtering, stale-authority, unauthorized-role, and foreign-project denial;
- exact canonical-to-UI Delivery lineage mapping, plus published Studio Pack behavior that preserves linked ancestry while leaving unprojected decision, Govern, quality, approval-detail, and audit history explicitly unavailable;
- source-authorized active-member Docs visibility plus foreign-user, missing-source-authority, and deactivated-membership denial;
- a zero-write Monitor query; and
- no direct browser-role reads of the new authority tables.

Focused contract, client, Edge handler, and UI tests cover bounded decoding, retry identity, refreshed authorization, read-only query behavior, human-authored work-item validation, and explicit no-inference UI copy. These checks use synthetic repository data and disposable local PostgreSQL only. They are not hosted or production evidence.

## Rollback and recovery

For operational rollback, set all three workspace controls to `false` or remove the workspace control row. Existing publications, document generations, outcome versions, Delivery Pack snapshots, receipts, and audits remain readable through their authorized projections. The assignee projection is read-only and can be removed from Edge routing and the client independently without changing stored state. Do not delete or rewrite history.

If an application release must be reverted, keep the migration installed and remove the new UI entry points and Edge routing from the older release. The database continues to fail closed because writes remain disabled unless the workspace control is explicitly enabled.

Schema removal is forward-only. A corrective migration may remove unused routines and columns only after proving there are no publication, outcome, or pack snapshot rows and after reconciling the hosted marker chain. Any committed history requires retention rather than destructive rollback.

### Project Delivery board verification

On Desktop Chrome and Pixel 7, the connected disposable PostgreSQL journey confirmed one Epic and two Tasks and opened approved source details from the project board. A description and allowed status survived reload. The board displayed an unassigned date without inventing one. The separate Work Items entry remains available for publication and import. The fixture used synthetic approved content. Fresh extraction and provider-generated documents require the bounded nonproduction run.

### Current assessment project binding

A finalized Assess V2 decision with approved review, resolved Govern controls and a committed Studio handoff can create or replay one active Delivery project through the normal **Open Studio for this process** action. The project stores the exact case, decision and Govern resolution. Publication and requirement-bound import accept this current-assessment ancestry with a null compatibility-assessment reference. The server does not create a V1 assessment.

Project creation requires the existing `project.manage` or administrative authority; `studio.artifacts.publish` by itself is insufficient. The connected low-suitability and strong-automation scenarios start without a compatibility assessment or pre-created Delivery project, invoke the authenticated project RPC through that UI action, and use the resulting project for publication without a fixture-side source rebind.

Executed local evidence uses synthetic repository facts, a disposable PostgreSQL database, and real production route handlers/RPCs. It is not a hosted or provider-backed generation claim. Through ordinary Chromium UI actions, each scenario finalized a fresh deterministic assessment, used separate reviewer/approver sessions, created the native project, generated and edited a Studio BRD, independently approved its exact revision, edited and selected one requirement-derived proposal, published it, opened the resulting Document Vault record, selected the item for import, and confirmed it once on the normal Delivery board. The item remained visible after reload. Both scenarios had zero compatibility assessments, zero pre-seeded Delivery projects, zero non-loopback requests and zero provider/paid calls. The focused output is `output/current-assessment-delivery-browser/browser-chromium-desktop.json`.

The focused PostgreSQL regression separately proves that a publisher without `project.manage` cannot create the project, while an authorized project manager can create and replay it. It publishes and imports one requirement-bound native item, then advances the same project to a directly superseding approved decision/handoff. The earlier publication and imported item remain immutable and present. A non-successor or rollback decision remains rejected.

Rollback places Studio and Delivery writes in read-only mode and hides the action while retaining the project, immutable assessment ancestry, publication, generated document and imported board items. Existing V1-bound projects remain readable and use their prior validation path.
