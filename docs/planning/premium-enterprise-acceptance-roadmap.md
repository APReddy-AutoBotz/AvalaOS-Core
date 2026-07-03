# Premium Enterprise Acceptance Roadmap

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Product Naming Decision

Avala Govern and Avala Delivery are the buyer-facing canonical product names for the premium enterprise baseline.

The previous buyer-facing names, Avala Govern Lite and Avala Delivery Lite, should no longer appear in buyer-facing UI or current canonical product positioning. The word "Lite" may remain only in historical evidence, migration notes, temporary internal implementation identifiers, and this roadmap's naming-decision explanation.

## Rationale

The previous "Lite" label was used as a proof-boundary and scope-control marker. That helped avoid unsupported claims while the governance and delivery surfaces were intentionally bounded.

For premium enterprise buyers, "Lite" can signal unfinished, limited, demo-only, or non-premium maturity. The proof boundary now moves out of the module name and into Trust Center proof statuses, claim maps, evidence references, limitation disclosures, acceptance gates, and AP-approved evidence requirements.

## Scope Boundaries

Avala Govern is the governance and control-plane layer for automation, AI, agents, approvals, risk, evidence, allowed actions, blocked actions, AI/provider controls, and audit posture.

Avala Govern does not execute bots, agents, RPA jobs, external-system actions, MCP controls, A2A controls, live runtime enforcement, or deployment/runtime actions in the current baseline. Any such capability requires a future AP-approved milestone with implementation scope, verification, and evidence before it may be claimed.

Avala Delivery is the governed delivery workbench for approved work items, owners, blockers, handoff lineage, delivery packs, evidence checklists, and downstream delivery handoff.

Avala Delivery is not a Jira replacement. It governs automation and AI delivery readiness and can later integrate with downstream delivery systems after separate approval.

## Roadmap Phases

1. Claim-safe UI cleanup and full-name buyer-facing naming.
2. Trust metadata and Trust Center proof-status model.
3. Admin workbench tabs.
4. Premium workbench navigation and Next Decision panels.
5. Buyer acceptance pack.
6. Future AP-approved proof track for DB/RLS/artifact/hosted/deployment evidence.

## Proof Boundary Model

Capability maturity is evidence-gated. Trust Center statuses, claim maps, evidence references, limitation disclosures, and acceptance gates carry the proof boundary. Module names do not imply runtime execution, hosted readiness, production readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, buyer readiness, product readiness, release-candidate readiness, or compliance certification.

Current proof boundaries remain preserved:

- no root cause inferred
- local DB unresolved
- schema not proven
- RLS not proven
- RLS helper behavior not newly validated
- artifact SELECT isolation not verified
- tenant isolation not newly verified
- hosted readiness not proven
- production readiness not proven
- local startup success not proven
- deployment readiness not proven
- operational readiness not proven
- security readiness not proven
- buyer readiness not proven
- product readiness not proven
- release-candidate readiness not proven