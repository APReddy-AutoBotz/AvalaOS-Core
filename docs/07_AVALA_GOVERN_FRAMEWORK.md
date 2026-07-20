# Avala Govern Framework

## Avala Govern

Avala Govern is the governance and control-plane layer added to the post-assessment flow. It gives reviewers a compact card for the agent or automation being considered before any downstream execution or delivery handoff.

## Naming And Proof Boundary

Avala Govern is the buyer-facing canonical name for the current governance surface. Scope boundaries are handled through claim controls, evidence references, limitation disclosures, Trust Center proof statuses, and AP-approved acceptance gates. Future expansion into richer policy objects, runtime controls, MCP controls, A2A controls, or live monitoring requires an explicitly approved milestone.

## Minimum Card Fields

- `agentOrAutomationName`
- `mappedProcessId`
- `businessOwner`
- `technicalOwner`
- `technologyPattern`
- `systemsAccessed`
- `toolsUsed`
- `dataSensitivity`
- `autonomyLevel`
- `riskLevel`
- `allowedActions`
- `blockedActions`
- `humanApprovalRequired`
- `evidenceRequired`
- `reviewFrequency`
- `auditStatus`

## Autonomy Levels

- L1 Observe
- L2 Advise
- L3 Act With Approval
- L4 Autonomous Within Guardrails
- L5 Blocked / Not Allowed

## Risk Levels

- Low
- Medium
- High
- Critical
- Blocked

## Current Scope

The current implementation derives a governance card from existing assessment and process data. It displays autonomy level, risk level, human approval requirement, evidence requirement, blocked actions, and audit status in the Decision Pack flow.

## Out Of Scope

- Real agent execution.
- Runtime monitoring.
- MCP controls.
- A2A controls.
- Replacing deterministic scoring or reviewer approvals.

## Control References

- `docs/governance/agent-autonomy-levels.md`
- `docs/governance/agent-risk-model.md`
- `docs/governance/agent-registry-model.md`
- `docs/governance/hitl-policy-model.md`
- `docs/governance/evidence-requirements-model.md`

## PR 1D Current Authority

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

Accepted Govern/Studio behavior remains V1-only. PR 1D V2 decisions may state controls and approvals required but cannot record approval, resolve Govern, grant exceptions, or create a Studio handoff; PR 1E owns that authority.
