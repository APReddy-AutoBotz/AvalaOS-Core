# ADR 0003: Avala Govern As Control Layer

## Status

Accepted.

## Context

Agents and automations need governance before execution, even when runtime controls are not yet implemented.

## Decision

Avala Govern is the control layer for registry, ownership, autonomy, risk, approvals, evidence, allowed actions, blocked actions, audit status, and decision history.

## Consequences

Governance fields must be explicit before higher-autonomy behavior is approved.

## Non-Goals

M0.2 does not add live agent execution, MCP, A2A, or runtime AGS controls.

## Verification Impact

Future Govern changes must verify ownership, risk, approval, evidence, and audit fields.
