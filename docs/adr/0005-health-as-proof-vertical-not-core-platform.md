# ADR 0005: Health As Proof Vertical Not Core Platform

## Status

Accepted.

## Context

Health proof work may support demos, but the core platform remains AvalaOS Core.

## Decision

Health remains a separate proof vertical. It must not be renamed, merged into core platform scope, or modified during non-Health milestones.

## Consequences

Core milestones may reference Health only for separation or proof-story planning.

## Non-Goals

This ADR does not modify Health implementation.

## Verification Impact

Changed-file review must flag Health implementation file changes during non-Health milestones.
