# M5 Enterprise Readiness Planning Gate

Milestone: `M4.5 Buyer-Demo RC Closure And M5 Enterprise Readiness Planning Gate`

Branch: `milestone/m4.5-buyer-demo-rc-closure-m5-readiness-gate`

## Purpose

This planning gate defines the M5 enterprise-readiness track for AvalaOS Core after the buyer-demo release candidate has been closed as ready.

This is planning only. It does not implement M5, change runtime behavior, change product UI, change scoring, change schema/RLS, change provider execution, change deployment configuration, or touch Health work.

## Why M5 Is Needed

M4.5 closes buyer-demo readiness for a controlled AP Invoice Exception workflow. That readiness is not the same as enterprise-production readiness.

M5 is needed because secure hosted pilots require credible environment boundaries, secret hygiene, auth, organization/workspace persistence, RLS design, evidence and audit persistence, export policy, deployment evidence, and pilot operations controls.

## Current State

- Buyer-demo RC is ready for the governed AP workflow.
- The local/demo data model is still not enterprise production persistence.
- Production Supabase, auth, RLS, audit, export, and deployment hardening has not started in this milestone.
- Server-side provider direction exists, but pilot and production claims require deployed evidence and environment-specific validation.
- Audit and export coverage exist in slices, but not as complete enterprise operations coverage.

## M5 Objective

Make AvalaOS Core enterprise-readiness credible for secure hosted pilots without overclaiming compliance.

## M5 Non-Goals

- No compliance certification claim.
- No AGI claims.
- No runtime agent execution engine.
- No broad feature expansion before persistence and security gates.
- No production deployment claim without deployment evidence.
- No browser-side provider secrets or browser-side AI execution for pilot or production behavior.

## Proposed M5 Sequence

1. `M5.0 Enterprise Supabase Readiness Plan`
2. `M5.1 Environment Config And Secret Hygiene Gate`
3. `M5.2 Supabase Auth / Organization / Workspace Schema Plan`
4. `M5.3 RLS Policy Design And Test Plan`
5. `M5.4 Evidence, Lineage, And Audit Persistence Plan`
6. `M5.5 Export Controls And Review Artifact Policy Plan`
7. `M5.6 Deployment Readiness And Pilot Operations Pack`

## Required M5 Decisions Before Implementation

Before implementation begins, M5 must decide:

- Supabase project and environment strategy.
- Local, dev, staging, and prod boundaries.
- Auth model.
- Organization and workspace model.
- User roles and permissions.
- Evidence retention model.
- Audit event model.
- Export control model.
- Deployment target.
- Backup and restore expectations.

## Personal Supabase Caution

- Personal Supabase may be used only as dev/staging validation.
- No hardcoded project IDs, URLs, API keys, or secrets may be committed.
- No personal values may be committed.
- Enterprise architecture must remain environment-replaceable.
- Pilot and production behavior must use environment-owned configuration and server-side secret handling.

## M5 Safety Rules

- No browser secrets.
- No provider keys in client code.
- No raw provider secrets in database rows, logs, or evidence records.
- No unsupported compliance claims.
- No AI-owned deterministic decisions.
- No deployment claim without deployment evidence.
- No change to deterministic scoring formulas, weights, thresholds, hard stops, or recommendation logic without an explicit score version change and regression tests.

## Recommended Next Milestone

`M5.0 Enterprise Supabase Readiness Plan`
