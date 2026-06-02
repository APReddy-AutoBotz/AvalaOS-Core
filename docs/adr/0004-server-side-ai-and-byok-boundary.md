# ADR 0004: Server-Side AI And BYOK Boundary

## Status

Accepted.

## Context

Browser-side provider execution and raw provider keys are not acceptable for pilot or production behavior.

## Decision

Pilot and production AI execution must use server-side services with auditable provider configuration and secure key references.

## Consequences

Local browser-side demo fallback must remain transitional and unsuitable for real customer data.

## Non-Goals

This ADR does not deploy server-side AI or change provider behavior.

## Verification Impact

Security review must check key handling, AI execution path, and audit evidence.
