# PR 1A Required AI Audit Migration

Canonical migration: `supabase/migrations/20260710120000_pr1a_required_ai_audit.sql`

## Purpose

PR 1A reconciles the minimum canonical AI audit contract required for fail-closed privileged AI operations. It does not claim that the complete PR 1B runtime schema, RLS policy set, or tenant-isolation proof is finished.

The migration:

- creates or reconciles `ai_generation_jobs` and `ai_usage_events` with organization, user, operation, provider, model, lifecycle, request, token, cost, timestamp, and sanitized error fields required by the current Edge audit helpers;
- adds validated value and non-negative constraints plus supporting indexes;
- enforces allowed AI-job lifecycle transitions with a trigger;
- removes legacy browser policies from the two privileged audit tables; and
- enables and forces RLS while intentionally adding no browser policies, so browser access remains fail closed.

## Executed Verification

`npm run test:migrations:pr1a` runs against disposable PostgreSQL 15 databases and verifies:

1. fresh application of the complete canonical migration chain;
2. idempotent reapplication of the PR 1A migration;
3. upgrade from the committed targeted legacy AI-audit fixture;
4. RLS enabled and forced with no browser policies;
5. validated constraints and required indexes;
6. invalid lifecycle transition rejection; and
7. invalid negative-token rejection.

The final fresh and supported-upgrade paths passed. The harness removes its temporary databases and container. It does not touch an existing application database and is not hosted or production evidence.

## Rollback

Use a forward migration or read-only maintenance mode. Do not drop these tables or erase audit history as a routine rollback. If the application change must be backed out, preserve the additive schema and keep privileged operations fail closed until a compatible forward fix is accepted.
