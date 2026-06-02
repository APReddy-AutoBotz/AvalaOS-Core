# Avala Govern Framework

## Avala Govern Lite

Avala Govern Lite is the lightweight governance layer added to the post-assessment flow. It gives reviewers a compact card for the agent or automation being considered before any downstream execution or delivery handoff.

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

- Observe
- Advise
- Act With Approval
- Autonomous Within Guardrails

## Risk Levels

- Low
- Medium
- High
- Critical
- Blocked

## Current Scope

The current implementation derives a lightweight card from existing assessment and process data. It displays autonomy level, risk level, human approval requirement, evidence requirement, blocked actions, and audit status in the Decision Pack flow.

## Out Of Scope

- Real agent execution.
- Runtime monitoring.
- MCP controls.
- A2A controls.
- Replacing deterministic scoring or reviewer approvals.
