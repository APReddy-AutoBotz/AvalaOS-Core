# M1 Avala Govern Lite Hardening Plan

## Goal

Harden Govern Lite as the visible control layer for agent and automation review.

## Scope

Governance card fields, owner model, evidence rules, approval state, blocked actions, and audit status.

## Explicit Out Of Scope

Runtime agent execution, MCP/A2A controls, scoring formula changes, and Delivery expansion.

## Files Allowed

Governance docs, existing Govern UI/model files when approved, tests, and evidence docs.

## Acceptance Criteria

Governance card captures owner, autonomy, risk, approvals, evidence, allowed actions, blocked actions, and audit status.

## Verification Commands

`npm run typecheck`, `npm run test`, `npm run build`.

## Risks

Overstating runtime control or adding unapproved execution behavior.

## Stop Conditions

Agent execution behavior, scoring changes, missing owner fields, or unsupported claims.
