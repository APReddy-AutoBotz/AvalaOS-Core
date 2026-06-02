# Avala Govern AGS

## Purpose

Define and protect Avala Govern as the control layer for agents and automations.

## When To Use

Use for agent registry, autonomy, risk, approvals, evidence, allowed actions, blocked actions, run logs, and audit status.

## Non-Negotiable Rules

- Govern before execution.
- Humans approve risk.
- Agents and automations act only within governed boundaries.
- M0.2 does not add runtime AGS, MCP, A2A, or agent execution behavior.

## Inputs

- Governance docs
- Process mapping
- System and data access context

## Outputs

- Governance card requirements
- Risk and autonomy classification
- Evidence and approval requirements

## Acceptance Criteria

- Autonomy and risk levels are explicit.
- Allowed and blocked actions are documented.
- Audit and evidence requirements are clear.

## Common Failure Modes

- Treating Govern as a runtime execution engine in an unapproved milestone.
- Missing owner or approval fields.
- Allowing agent action without evidence boundaries.

## Verification Checklist

- Check governance model docs.
- Check no runtime behavior was added.
- Check approvals and evidence are represented.
