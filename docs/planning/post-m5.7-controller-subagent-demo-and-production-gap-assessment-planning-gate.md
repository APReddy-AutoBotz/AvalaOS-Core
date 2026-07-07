# Post-M5.7 Controller/Subagent Demo and Production Gap Assessment Planning Gate

## Purpose

This docs/model-only milestone defines a grouped controller/subagent planning gate after PR #194. It moves the static proof hardening track toward a future consolidated real-demo and production-readiness gap assessment without starting execution, collecting readiness evidence, or marking any readiness domain complete.

This milestone does not execute browser, database, RLS, deployment, export, provider, classifier, workflow, storage, rollback, incident, backup, restore, or real assertion workflows.

## Accepted Baseline

- Latest accepted closure: PR #194 - Post-M5.7 Static Proof Surface Inventory and Control Matrix Gate
- Accepted/head commit: `e5743088d1d54e81e8120428ecb1b36c9b0afca3`
- Merge commit: `267809e0b7f42f8d9c9f894ccc2c3f3f379940e5`
- Post-merge verification/current main/tag target: `0c0a853a67fad24dc41d7e6b80a4a42df80a3d64`
- Tag: `avalaos-core-post-m5.7-static-proof-surface-inventory-and-control-matrix-gate`

## Preserved Browser And Proof Boundary

- PR #194 remains accepted as docs/model-only static proof surface inventory and control matrix work.
- Browser evidence remains paused.
- PR #191 remains stopped observation evidence only.
- Completed observation passes remain 0.
- No browser was launched.
- No approved surface was observed.
- No browser evidence was created.
- No readiness evidence was created.
- No readiness domain is complete.
- No next execution milestone was started.

## Controller/Subagent Operating Model

| Role | Ownership | Required boundary |
| --- | --- | --- |
| Main Codex controller | Owns final decisions, consolidation, proof boundaries, file ownership, PR scope, final output, branch, commit, push, and PR creation. | Must keep all work inside the approved milestone scope and stop if a requested action would require execution or readiness proof. |
| Subagents | Produce scoped findings for the controller only. | Findings are advisory. They do not approve readiness, decide milestone completion, create commits, push branches, or open PRs. |
| Controller consolidation | Converts subagent findings into one enterprise execution plan with ordered gaps, risks, dependencies, and future milestone recommendations. | Must preserve unapproved domains and avoid readiness claims. |
| Final PR | Created only by the controller after local review and verification. | Draft PR only unless AP explicitly asks otherwise. |

Subagents may not modify files directly unless the controller explicitly grants that in a later approved milestone. Subagents may not open PRs independently. Subagents may not approve readiness, expand product scope, change score logic, change risk gates, execute workflows, or treat findings as proof.

## Global Forbidden Actions

The controller and all subagents must not perform these actions in this milestone:

- browser retry
- browser launch
- browser automation
- screenshots
- screenshot folder creation
- browser artifact creation
- raw browser output capture
- DOM dumps, console dumps, HAR files, traces, or videos
- export/PDF/download artifact generation
- storage object or signed URL creation
- workflow/status changes
- approval workflow execution
- DB/RLS/artifact/schema checks
- artifact SELECT checks
- tenant-isolation checks
- SQL/migration/schema/policy inspection
- Supabase execution
- Docker execution
- hosted/deployment validation
- provider/classifier execution
- rollback/incident/backup/restore execution
- real assertions
- readiness evidence
- readiness claims
- next execution milestone start

## Subagent Workstreams

| Workstream | Allowed inspection scope | Forbidden actions | Expected output format | Proof-boundary language |
| --- | --- | --- | --- | --- |
| Demo/UI path inspection subagent | Static repository planning docs, existing buyer/admin walkthrough docs, canonical roadmap/readiness/ledger entries, and non-executing source references if later approved by the controller. | Browser launch, browser automation, screenshots, DOM/console/HAR/trace/video capture, workflow/status changes, export/download generation, or readiness claims. | `surface`, `expected future observation need`, `known blocker or ambiguity`, `dependency`, `risk`, `recommended future milestone`. | Static inspection findings only; not browser evidence, not walkthrough completion, not buyer readiness. |
| Code/build/test health subagent | Package script inventory, existing test/evidence docs, static source references, and prior verification summaries. | Runtime app launch, dev server startup, provider execution, DB/Supabase/Docker execution, code changes without controller approval, or readiness claims. | `area`, `current static signal`, `missing verification`, `dependency`, `risk`, `recommended future milestone`. | Build/test health planning only; build success is not runtime readiness or production readiness. |
| Supabase/RLS/tenant-isolation gap subagent | Canonical docs, accepted RLS planning evidence, readiness gates, task ledger, and source-of-truth statements. | SQL/migration/schema/policy inspection, Supabase execution, DB checks, RLS helper checks, artifact SELECT checks, tenant-isolation checks, or readiness claims. | `domain`, `accepted baseline`, `unproven behavior`, `required later assertion`, `dependency`, `risk`, `recommended future milestone`. | Planning gap only; no schema availability, RLS behavior, artifact SELECT isolation, tenant isolation, or DB readiness proof. |
| Export/storage/download gap subagent | Static planning/evidence docs, accepted export/artifact control docs, readiness gates, and task ledger entries. | Export/PDF/download generation, storage access, storage object creation, signed URL generation, workflow/status changes, or readiness claims. | `artifact surface`, `accepted control`, `unproven behavior`, `dependency`, `risk`, `recommended future milestone`. | Static planning only; no export readiness, storage readiness, download readiness, or artifact proof. |
| Hosted/deployment/ops/security gap subagent | Static deployment/operations/security planning docs, existing evidence summaries, package/config references if later approved by the controller. | Hosted validation, deployment validation, startup/readiness checks, rollback/incident/backup/restore execution, Docker/Supabase execution, provider/classifier execution, or readiness claims. | `ops domain`, `accepted planning baseline`, `unproven operational behavior`, `dependency`, `risk`, `recommended future milestone`. | Operational gap planning only; no hosted, deployment, security, backup, restore, incident, rollback, or production readiness proof. |
| Proof/readiness/copy-boundary subagent | Source of truth, roadmap, readiness gates, task ledger, accepted evidence docs, buyer/admin copy guardrails, and proof-status language. | Readiness approval, readiness-domain completion, unsupported compliance claims, browser evidence substitution, or scope expansion. | `copy/proof surface`, `allowed language`, `prohibited language`, `unproven domain`, `required companion limitation`, `recommended future milestone`. | Copy and proof-boundary findings only; not readiness evidence and not an approval decision. |

## Consolidated Planning Output Structure

The controller must consolidate future subagent findings into one enterprise execution plan with this structure:

1. Real demo gap list
2. Production readiness gap list
3. Dependency order
4. Risk level
5. Recommended grouped execution milestones
6. What can be safely done next
7. What remains unapproved

The consolidated output must separate accepted static evidence from unproven execution behavior. It must preserve that browser evidence remains paused, PR #191 remains stopped observation evidence only, completed observation passes remain 0, and PR #194 remains docs/model-only static proof surface inventory/control matrix work.

## Real Demo Gap List Template

| Gap | Current accepted baseline | Future proof needed | Dependency | Risk level | Safe next milestone |
| --- | --- | --- | --- | --- | --- |
| Browser walkthrough completion | Browser evidence paused; PR #191 stopped before browser launch with 0 completed observation passes. | AP-approved compliant observation channel and bounded browser evidence plan. | AP approval, output boundaries, stop conditions. | High | Manual browser evidence channel decision and execution plan. |
| Buyer/admin surface confidence | Static proof surfaces and copy controls accepted. | AP-approved observation or static alternative proof with accepted evidence. | Demo/UI inspection findings and proof-boundary review. | Medium | Demo/UI gap assessment consolidation. |
| Export/download demonstration | Export/artifact control hardening accepted only as static/model work. | AP-approved export/download evidence with prohibited-output controls. | Export/storage gap assessment and artifact output plan. | High | Export/storage proof plan before execution. |

## Production Readiness Gap List Template

| Gap | Current accepted baseline | Future proof needed | Dependency | Risk level | Safe next milestone |
| --- | --- | --- | --- | --- | --- |
| RLS and tenant isolation | RLS planning and preparation accepted; real DB/RLS/artifact execution remains unperformed. | AP-approved DB/RLS assertions, artifact SELECT checks, and tenant-isolation evidence. | Exact assertion scope, safe environment, output boundaries. | High | RLS/tenant-isolation execution approval gate. |
| Hosted deployment and operations | Hosted/deployment/operations preparation accepted only as planning/control hardening. | AP-approved hosted/deployment/startup/ops verification. | Environment classification, rollback/incident/backup/restore scope. | High | Hosted/deployment/ops execution approval gate. |
| Provider/classifier behavior | Server-side provider direction and control planning exist. | AP-approved provider/classifier execution evidence with secret redaction and audit boundaries. | Secret hygiene, server-only controls, audit scope. | High | Provider/classifier evidence approval gate. |
| Approval workflow behavior | Approval-boundary and read-only surfaces accepted. | AP-approved workflow execution evidence and status-transition proof. | Workflow scope, actor authority, audit output limits. | High | Approval workflow execution approval gate. |

## Recommended Grouped Execution Milestones

| Order | Future grouped milestone | Objective | Required AP state | Readiness boundary |
| --- | --- | --- | --- | --- |
| 1 | Controller/Subagent Static Gap Assessment Execution | Run scoped static inspections and consolidate gap findings only. | AP approval for exact inspection files and subagent scope. | Findings are not readiness evidence. |
| 2 | Demo Evidence Channel Approval Gate | Decide whether browser evidence can resume through a compliant human-observation channel or an approved non-browser alternative. | AP go/no-go with exact output boundaries and stop conditions. | Approval gate only unless execution is explicitly included. |
| 3 | Real Demo Evidence Execution Gate | Execute the selected real-demo evidence path. | Explicit AP execution approval, run count, artifacts allowed/prohibited. | Evidence is limited to the selected scope and does not imply production readiness. |
| 4 | Production Readiness Evidence Batch 1 | DB/RLS/tenant-isolation and export/storage proof planning or execution, depending on AP scope. | Separate AP approval per execution domain. | No readiness domain complete until assertions execute and are accepted. |
| 5 | Production Readiness Evidence Batch 2 | Hosted/deployment/ops/security, provider/classifier, and approval workflow proof planning or execution, depending on AP scope. | Separate AP approval per execution domain. | No hosted, production, security, or pilot readiness claim without accepted evidence. |

## What Can Be Safely Done Next

The next safe step is a separate AP-approved static gap assessment milestone that authorizes the controller to assign the six subagent workstreams to inspect only explicitly listed static repository surfaces and return findings to the controller. That next milestone should define exact allowed files, prohibited files, subagent output templates, no-commit rules, consolidation format, and proof-boundary language before any subagent starts.

## What Remains Unapproved

Browser retry, browser launch, browser automation, screenshots, browser artifacts, export/PDF/download artifacts, storage objects, signed URLs, workflow/status changes, approval workflow execution, DB/RLS/artifact/schema checks, artifact SELECT checks, tenant-isolation checks, SQL/migration/schema/policy inspection, Supabase execution, Docker execution, hosted/deployment validation, provider/classifier execution, rollback/incident/backup/restore execution, real assertions, readiness evidence, readiness claims, readiness-domain completion, and the next execution milestone remain unapproved.

## Readiness Boundary

No readiness domain is complete because of this milestone. This milestone does not claim browser verification, walkthrough completion, buyer readiness, product readiness, release-candidate readiness, production readiness, hosted readiness, deployment readiness, security readiness, operational readiness, pilot readiness, compliance certification, RLS readiness, tenant-isolation proof, root-cause proof, frontend-fix proof, local startup readiness proof, export/PDF/download readiness, approval-workflow readiness, or readiness evidence.