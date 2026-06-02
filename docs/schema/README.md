# KlarityPM Supabase Schema Migrations

Last Updated: 2026-05-08

This folder contains the SQL contracts used to move KlarityPM from prototype data into a Supabase/Postgres-backed production path.

This README is an operational migration guide. Canonical product status and roadmap decisions live in:

- `../05_CURRENT_IMPLEMENTATION_STATUS.md`
- `../04_IMPLEMENTATION_ROADMAP.md`

Do not commit database passwords, service-role keys, or project-specific secrets into these files. Apply migrations by setting `DATABASE_URL` in the shell environment and running:

```powershell
node scripts\applySupabaseMigrations.mjs docs\schema\<file-name>.sql
```

## Recommended Apply Order

1. `initial_schema.sql`
   - Core organizations, profiles, roles, memberships, audit events, Assess, Delivery, Docs, and timesheet tables.

2. `platform_rls_membership_policies.sql`
   - Membership lookup policies required so tenant-scoped RLS rules can resolve the current user's active organizations.

3. `assess_review_audit.sql`
   - Assess review events, audit event extensions, append-only triggers, and transactional assessment transition RPC.

4. `handoff_ledger_entries.sql`
   - Shared Assess -> Docs -> Delivery -> Monitor handoff ledger.

5. `delivery_app_id_mapping.sql`
   - Stable `app_id` mapping for projects, epics, sprints, and tasks while retaining UUID primary keys.

6. `delivery_comments_activity.sql`
   - Tenant-scoped task comments and append-only task activity sidecar tables.

7. `demo_seed_acme.sql`
   - Acme demo organization, profiles, memberships, roles, and Assess process catalog records.

8. `demo_seed_delivery.sql`
   - Demo projects, epics, sprints, and tasks for the Delivery module.

9. `delivery_role_policies.sql`
   - Role-aware delivery mutation policies, task update trigger checks, dependency gate enforcement, epic/sprint RLS policies, and seeded demo role alignment.

10. `docs_role_policies.sql`
   - Role-aware document generation read/generate/review/delete policies and `updated_at` maintenance.

11. `timesheet_role_policies.sql`
   - Role-aware timesheet read/log/update/delete policies, unique org/user/task/date enforcement, and `updated_at` maintenance.

12. `ai_governance_jobs.sql`
   - Server-side AI provider config references, prompt templates, generation jobs, usage events, and tenant-scoped RLS policies.

13. `storage_buckets.sql`
   - Private Supabase Storage buckets for source uploads and generated exports, plus org-scoped object policies.

14. `rls_regression_assess_handoff.sql`
   - Regression checks for Assess review event visibility, cross-tenant write denial, review-event immutability, handoff ledger tenant isolation, and transition RPC tenant checks.

## Current Live Verification

The following checks have been run successfully against the live Supabase project:

- Assess/handoff RLS regression SQL.
- Supabase Auth login and organization lookup for a seeded demo persona.
- Delivery smoke test for project/task visibility and temporary task create/update/delete.
- Delivery smoke test for task comments and task activity visibility through RLS.
- Delivery smoke test for task metadata `orderRank` persistence.
- Delivery smoke test for temporary timesheet insert/update visibility through RLS.
- Delivery smoke test for temporary document generation insert/update/delete visibility through RLS.
- Delivery smoke test for sprint insert/update/delete through role-aware RLS.
- Delivery role smoke test for PM mutation, BA/Executive no-row task update denial, developer own-task update, and developer assignment-change denial.

## Migration Status

- [x] `initial_schema.sql`
- [x] `platform_rls_membership_policies.sql`
- [x] `assess_review_audit.sql`
- [x] `handoff_ledger_entries.sql`
- [x] `delivery_app_id_mapping.sql`
- [x] `delivery_comments_activity.sql`
- [x] `demo_seed_acme.sql`
- [x] `demo_seed_delivery.sql`
- [x] `delivery_role_policies.sql` has been applied live from this workspace.
- [x] `docs_role_policies.sql` has been applied live from this workspace.
- [x] `timesheet_role_policies.sql` has been applied live from this workspace.
- [x] `ai_governance_jobs.sql` has been applied live from this workspace.
- [x] `storage_buckets.sql` has been applied live from this workspace.
- [x] `rls_regression_assess_handoff.sql` has passed live.
- [x] `scripts/supabaseDeliveryRoleSmoke.mjs` has passed live after `delivery_role_policies.sql` was applied.

## Remaining Migration Gaps

- New schema migrations still need CI migration validation before repeatable production release.
- Private Supabase Storage buckets are defined in `storage_buckets.sql` and confirmed live. Defaults expected by the authored functions are `source-uploads` and `klarity-exports` unless overridden with `SOURCE_UPLOADS_BUCKET` and `EXPORTS_BUCKET`.
- Document versions, approval audit, and export records.
- Sprint mutation RLS must be applied before live sprint start/complete behavior works through the hosted database.
- Sprint create/edit UI, capacity, notification, and mention hardening.
- Broader audit event coverage and audit export support.
- CI execution for migration validation and RLS regression checks.
