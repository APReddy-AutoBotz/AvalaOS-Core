# Premium Enterprise Trust Center Proof-Status Foundation

## Purpose

This slice creates the typed Trust Center foundation for premium enterprise claim control. It gives future Avala Admin and Avala Monitor Trust Center surfaces a deterministic baseline for proof statuses, proof boundaries, evidence references, module capability states, buyer-safe limitation disclosures, and buyer acceptance artifacts.

## Current Baseline

PR #161 established Avala Govern and Avala Delivery as the buyer-facing canonical product names. Scope control now lives in claim controls, Trust Center proof statuses, evidence references, limitation disclosures, and AP acceptance gates rather than in the previous buyer-facing module naming.

Current evidence supports deterministic demo/scoring behavior, configured governance and delivery workbench surfaces, static copy/name guardrails, and docs-only proof boundaries. It does not prove production readiness, hosted readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, buyer readiness, product readiness, release-candidate readiness, or compliance certification.

## Why Trust Center Foundation Comes After PR #161

The Trust Center foundation depends on the PR #161 naming decision because buyer-facing capability labels must now use Avala Govern and Avala Delivery. The proof boundary is no longer carried by the word "Lite"; it is carried by structured metadata and explicit limitation disclosures.

## Proof-Status Vocabulary

- `demo`: available for controlled demo behavior only.
- `planned`: planned but not implemented or accepted.
- `configured`: configured or represented in the current baseline without broader readiness proof.
- `evidence_required`: blocked on future AP-approved evidence before the claim can be accepted.
- `verified`: accepted only for claims genuinely backed by current evidence.
- `blocked`: not claimable until AP approval and future evidence exist.

## Readiness Domains

The foundation defines readiness domains for security, tenant isolation, AI controls, evidence, export, deployment, operations, buyer readiness, product readiness, and release-candidate readiness.

Most readiness domains remain `evidence_required` or `blocked`. The model must not turn planning records, synthetic-only boundaries, or PR #161 naming cleanup into production readiness or compliance claims.

## Claim-Control Model

Each claim control records an id, label, buyer-safe claim text, proof status, proof boundary, evidence reference, blocked wording, owner, optional review date, and readiness domain.

Blocked or evidence-required claims include RLS readiness, tenant-isolation proof, hosted readiness, production readiness, deployment readiness, operational readiness, security readiness, buyer readiness, product readiness, release-candidate readiness, compliance certification, local startup success, artifact SELECT isolation, schema readiness, and RLS helper readiness.

## Module Capability State Model

Module capability states describe what can be safely said about each current module:

- Avala Assess: deterministic assessment and scoring behavior is regression-tested for the current demo baseline, but this does not imply production readiness.
- Avala Govern: governance/control-plane cards support review of risk, evidence, allowed actions, blocked actions, and approval posture, but Avala Govern does not execute bots, agents, RPA jobs, external-system actions, MCP controls, A2A controls, or live runtime enforcement.
- Avala Studio: generated documents are editable review drafts requiring human sign-off, not AI final approval or autonomous document acceptance.
- Avala Delivery: a governed delivery workbench for approved work items, owners, blockers, handoff lineage, delivery packs, and evidence checklists; it is not a Jira replacement and does not prove hosted Delivery runtime readiness.
- Avala Monitor: can show value, risk, blockers, lineage, and visibility signals, but does not prove live production telemetry or runtime monitoring.
- Avala Admin / AI Controls: records the provider, BYOK, and server-side AI governance direction, but does not prove production security readiness.

## Buyer Acceptance Artifact Model

The foundation defines buyer acceptance artifacts for future claim maps, evidence indexes, limitation disclosures, control summaries, and buyer acceptance packs. This slice models the artifacts but does not produce a buyer acceptance pack.

## Current Blocked/Evidence-Required Claims

The following claims remain blocked or evidence-required:

- RLS readiness
- tenant-isolation proof
- hosted readiness
- production readiness
- deployment readiness
- operational readiness
- security readiness
- buyer readiness
- product readiness
- release-candidate readiness
- compliance certification
- local startup success
- artifact SELECT isolation
- schema readiness
- RLS helper readiness

## What This Slice Implements

- `services/trustCenterModel.ts` typed proof-status, proof-boundary, readiness-domain, claim-control, evidence, module-state, buyer-artifact, and snapshot model.
- A deterministic current-baseline Trust Center snapshot with fixed generated timestamp and static evidence references.
- `services/trustCenterModel.test.ts` regression tests for vocabulary stability, blocked readiness claims, limitation disclosures, deterministic output, buyer-facing naming, and deferred internal identifiers.
- A package test script for the Trust Center model.

## What This Slice Does Not Implement

- No full Trust Center UI.
- No Avala Admin tab split.
- No scoring, gate, risk, recommendation, or assessment-output behavior change.
- No internal AvalaGovernLiteCard, AvalaGovernLiteCardPanel, avalaGovernLiteService, buildAvalaGovernLiteCard, governLite, avalaGovernLite, or JSON wire-key rename.
- No Supabase schema, SQL, migration, RLS policy, Edge Function, deployment, CI, provider behavior, runtime adapter, or generated-output change.
- No readiness evidence.

## Future UI Slice: Avala Admin Trust Center

A future AP-approved UI slice can render this model inside Avala Admin as Trust Center tabs for claims, evidence, module capabilities, limitation disclosures, and buyer acceptance artifacts. That future slice must preserve the same proof boundaries unless new AP-approved evidence changes them.

## Future Proof Track: DB/RLS/Artifact/Hosted/Deployment Evidence

Future DB, RLS, artifact, hosted, and deployment evidence must be approved before execution. The approval must define exact assertion scope, run count, output boundaries, stop conditions, allowed evidence fields, prohibited evidence fields, and proof-boundary updates before any claim can move from `evidence_required` or `blocked` to `verified`.

## Acceptance Criteria

- Trust Center model types exist and match the required vocabulary.
- Current snapshot is deterministic and buyer-safe.
- Blocked readiness domains are not marked verified.
- Avala Govern and Avala Delivery use the full buyer-facing names.
- Limitation disclosures preserve the current proof boundary.
- Tests cover vocabulary, domains, blocked readiness claims, limitation disclosures, deterministic output, unsupported certification wording, naming, and deferred internal identifiers.
- No prohibited runtime, DB, RLS, artifact, hosted, deployment, provider, classifier, schema, or real assertion execution is performed.