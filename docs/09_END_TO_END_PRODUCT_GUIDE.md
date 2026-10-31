# AvalaOS Core: end-to-end product guide

This guide explains the product goal, users, inputs, module behavior, outputs, and handoffs. It summarizes existing scope; it does not authorize new functionality. [Implementation status](05_IMPLEMENTATION_STATUS.md) owns the dated verification snapshot and [delivery roadmap](04_MVP_ROADMAP.md) lists the remaining gates. Detailed domain contracts remain authoritative through the [authority map](architecture/document-authority-map.md).

## Goal and success criteria

AvalaOS Core helps an organization decide what to automate, why it is suitable, what controls and human decisions are required, and what evidence supports delivery. It is a governed AI and automation delivery platform, not an automation runtime or a general project-management replacement.

**Evaluate before you automate. Govern before you execute.**

A successful business journey produces a defensible decision, reviewed and approved documentation, an explicitly accepted delivery package, and a traceable monitoring baseline. Every output must retain its source versions, owner, review state, limitations, and permitted next actions. A generated draft is not an approval; an approval is not execution; a passing source test is not production readiness.

## Users and responsibilities

| User | Responsibility |
| --- | --- |
| Business/process owner or author | Supply process facts, source documents, assumptions, and intended outcomes. |
| Independent reviewer | Check evidence, completeness, contradictions, source coverage, and required controls. |
| Approver | Make the applicable human decision on the exact reviewed version. Separation-of-duty rules still apply. |
| Delivery owner | Accept eligible handoffs, organize work, assign ownership, record blockers and human decisions. |
| Portfolio/executive reader | Inspect authorized value, risk, dependencies, and evidence limitations. |
| Platform administrator | Configure tenant/workspace access and permitted providers; administration does not automatically confer business approval authority. |

## Supported routes

```text
Sources/manual facts -> Assess -> review/approval + Govern -> explicit Studio handoff
Sources/manual brief ------------------------------------> Studio
Studio -> review/approval -> explicit Delivery handoff -> Delivery package approval -> Monitor baseline
Manual planning package -------------------------------> Delivery
```

Assess, Studio, and Delivery may start independently, and users may stop after a module. Govern applies decision controls; it is not a separate content-authoring start. Monitor opens an existing authorized baseline and does not create upstream work.

Direct Studio and Delivery paths are durably **not_assessed / planning_only**. They must not claim assessment ancestry, automation suitability, risk acceptance, or execution readiness. Assess-to-Delivery, Assess-to-Monitor, and Studio-to-Monitor shortcuts are not supported routes.

Completion never automatically creates the next module's resource. Each handoff requires explicit user action, fresh server authorization, eligible current source state, exact immutable version binding, target acceptance, and independent approval where policy requires it. Changes, rejection, withdrawal, stale versions, or loss of authority block the affected transition.

## Modules: inputs, behavior, outputs, and limits

| Module / capability | Inputs | How it should work | Output and next use |
| --- | --- | --- | --- |
| Source Library / Enterprise Intelligence | Supported documents, transcripts, selected source versions, manual facts | Extract bounded untrusted material; retain provenance; let humans review proposed mappings. Assess and Studio select independent immutable source sets. AI suggestions do not become approved facts automatically. | Versioned sources, source sets, grounded candidates, and input bundles for the selected consumer. |
| Assess | Process facts, owners, systems, data, judgment, risks, evidence, and assumptions | Apply the versioned deterministic model. V2 decomposes the process into primitives and eligible combinations of human work, rules, integration, workflow, UI automation, intelligence, and controls. Finalization creates reviewer-ready state, not approval. | Immutable decision versions, Decision Pack, fitment/rationale, evidence gaps, controls, and eligible handoff after required review/approval. V1 and V2 are distinct models. |
| Govern | Exact Assess decision, evidence, review and approval ancestry | Resolve action-specific controls and permitted/blocked actions with human authority, expected versions, receipt and audit. Never infer authorization from a route, cached role, or AI output. | Govern resolution and handoff eligibility. No agent, bot, RPA or external-system execution. |
| Studio | Accepted Assess handoff, independent transcript bundle, hybrid bundle, or manual brief; eligible template | Bind exact source package/template versions; produce validated drafts; support editing and immutable revisions; require independent review and separate final approval. | Governed artifact versions and approved handoff candidates. Current canonical aggregate types are BRD, FRD and PDD. Private Markdown/PDF/DOCX renditions are formats, not additional artifact types. |
| Delivery | Accepted current approved Studio handoff, or explicit manual planning package | Retain source ancestry; manage versioned work-item packages, ownership, blockers and human decisions; review/approve the exact package and item versions. | Approved delivery package and eligible immutable Monitor baseline. It is not Jira replacement or automatic ticket/task execution. |
| Monitor | Exact approved Delivery package and canonical accepted item-version set | Show freshly authorized, minimized, read-only baseline/outcome projections. Surface gaps and blockers without inventing completion or live signals. | Evidence-backed portfolio/baseline visibility. No task editing, inferred completion, live telemetry or execution authority. |
| Application Portfolio / Modernization (Assess extension) | Application inventory, metadata, dependencies, process relationships and reviewed evidence | Evaluate deterministic dimensions and modernization prerequisites; derive dispositions from canonical approved records. Missing evidence or hard gates remain visible. | Application Decision Packs, Process × Application matrix, modernization dispositions and dependency waves/snapshots. No autonomous rebuild, scanning or roadmap approval. |
| Economics / calibration (Assess extension) | Versioned assumptions, reviewed economic scenarios and recorded outcomes | Keep economic review and outcome evidence separate from deterministic decision law; expose confidence and insufficient data. | Economic scenarios, outcome history and calibration reporting; no guaranteed ROI or savings. |
| Assemble Phase 1 | Approved eligible modernization assessment | Prepare a governed draft blueprint with execution/tool/telemetry controls disabled. | Proposed structure and rationale only. No code execution, deployment, tools or autonomous agents. |
| Trust / Assurance Evidence Hub | Versioned claims and sanitized evidence references | Bind exact claim/evidence versions; apply human review and publication separation; expose only the authorized current snapshot with limitations. | Internal evidence-gap view and buyer-safe published snapshot. No automatic security, compliance or certification claim. |
| Admin / AI Controls / Pilot Operations | Tenant/workspace memberships, capabilities, provider policy, secret references and authorized operational configuration | Enforce fresh server authorization, provider/model/endpoint eligibility, budgets, audit and fail-closed runtime configuration. Operational actions have separate authorization. | Authorized configuration and operational/readiness projections. Browser keys, demo identities and UI claims are never production authority. |

## Input and artifact scope

- Source Library supports bounded text-oriented inputs including TXT, Markdown, CSV, VTT, SRT, meeting-note text and supported text PDF/DOCX extraction. Native Assess separately supports bounded structured CSV/XLSX field mapping; this does not imply Studio XLSX mapping.
- Audio/video transcription, OCR, URL/cloud-drive retrieval and archive expansion are outside the described ingestion scope.
- BRD/FRD/PDD are the canonical Studio aggregate types. Broader PRD/SDD-oriented content and diagram aspirations are not a claim of independently accepted artifact types. Approved tenant custom template/output design is governed by the multi-source architecture, not implied by the canonical aggregate union.
- Manual Studio sources retain their manual/not-assessed truth. Reusing a transcript between Assess and Studio does not share a mutable source set or silently create a handoff.

## Worked example: invoice exception handling

1. An author records invoice-exception facts, evidence, systems and business assumptions.
2. Assess creates the deterministic decision and required controls, with gaps and confidence visible.
3. Eligible humans review the evidence and approve or reject the exact version; Govern resolves the applicable action constraints.
4. An explicit accepted handoff creates a Studio source package. Studio creates a draft BRD/FRD/PDD, followed by human edits, independent review and final approval.
5. Delivery explicitly accepts the approved artifact version, organizes the work package and obtains the required package approval.
6. Monitor displays the exact eligible baseline and recorded evidence. It does not execute invoice processing or claim realized savings without evidence.

This describes the intended connected contract. The canonical disposable walkthrough passes locally through Monitor, including edited BRD v2 and persistence after sign-out/sign-in. This is separate from complete integrated acceptance of the unchanged catalog; see the current status page and draft PR for exact-candidate CI.

### Reproduce the canonical disposable walkthrough

With Node 22, Docker and Chromium available, run `npm ci`, `npx playwright install chromium`, then `npm run test:canonical-ap-invoice-exception` from the repository root. The same command is a Core CI job. An optional `-- pixel-7-chromium` selects the mobile viewport. The runner builds the actual application, creates isolated PostgreSQL 16/PostgREST services, drives the UI and production handlers, verifies committed lineage independently, and removes its owned services. It never connects to a hosted environment or enables providers.

The walkthrough creates **AP Invoice Exception Handling**, saves process facts and evidence, completes deterministic assessment and independent Govern decisions, edits a BRD into version 2, obtains independent Studio and Delivery approvals, and checks the read-only Monitor baseline after refresh and sign-out/sign-in. Four synthetic business actors preserve separation: the Delivery owner who consumes the handoff differs from its requester, reviewer and approver. It exercises rejected authority, stale commands, exact replays and a failed synthetic generation. Password sessions and generated text are synthetic test boundaries; database constraints, RLS, production commands and application UI are exercised locally.

Each run retains its result, cleanup report, source/artifact digest manifest, representative rendered Decision Pack/BRD text and bounded screenshots beneath `output/local-private/primary-lifecycle-timeout-local/canonical-*`. Inspect `review-manifest.json` and `result.json`; a failed or incomplete run is not a walkthrough pass. Failure traces remain local and are excluded from the CI review archive. This evidence is separate from the unchanged acceptance catalog and hosted authentication, live AI generation, telemetry, deployment and complete product acceptance.

## Failure and safety behavior

Unauthorized, foreign-tenant, stale, revoked, expired or mismatched requests fail closed. A committed operation followed by a failed projection reload must report stale/read-only state rather than imply the operation did not commit or show false success. Replays must not duplicate effects. AI output is untrusted and cannot decide scores, risk gates, approvals or regulated decisions. Missing configuration cannot silently switch pilot/production to demo data.

The canonical PR C Delivery/Monitor path and the authenticated legacy Delivery compatibility path are separate contracts. The latter publishes approved Studio content into legacy Docs/task-import structures, records Delivery-owned human outcomes, and saves a Delivery Pack snapshot. Success in one path does not substitute for evidence in the other.

## Where to read more

- [Assess V2 authority](architecture/assess-v2-decision-intelligence-architecture.md)
- [Cross-module source and handoff contract](planning/governed-multisource-transcript-module-handoff-plan.md)
- [Studio generation and review](architecture/studio-governed-artifact-authority.md) and [private artifacts](architecture/studio-private-artifact-authority.md)
- [Enterprise Intelligence, Delivery/Monitor and Assemble](architecture/enterprise-intelligence-authority.md)
- [Application Portfolio](architecture/application-portfolio-assessment-architecture.md)
- [Trust / Assurance](architecture/trust-assurance-evidence-hub.md)
- [Authenticated compatibility acceptance](planning/authenticated-product-acceptance.md)
- [Current status](05_IMPLEMENTATION_STATUS.md) and [remaining work](04_MVP_ROADMAP.md)
