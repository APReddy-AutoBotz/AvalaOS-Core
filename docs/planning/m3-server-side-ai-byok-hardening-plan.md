# M3 Server-Side AI BYOK Hardening Plan

## Goal

Harden server-side AI execution, provider controls, key references, audit, and deployment readiness.

## Scope

Supabase Edge Function readiness, provider test path, usage audit, secure exports, and BYOK/key-reference model.

## Explicit Out Of Scope

Browser-side provider secrets, AI score decisions, new scoring formulas, and compliance certification claims.

## Files Allowed

AI boundary docs, approved server-side AI services, Supabase function sources, tests, and runbooks.

## Acceptance Criteria

Pilot and production AI paths are server-side, auditable, and controlled by approved provider configuration.

## Verification Commands

`npm run typecheck`, `npm run test`, `npm run build`, targeted AI service smoke checks when configured.

## Risks

Secret leakage, unclear provider ownership, unaudited usage.

## Stop Conditions

Raw browser provider keys, unlogged AI usage, or AI changing deterministic decisions.
