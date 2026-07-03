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
