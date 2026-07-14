# PR 1D Assess V2 Decision Intelligence Migration

Migration: `20260714120000_pr1d_assess_v2_decision_intelligence.sql`

This additive migration keeps V1 `assess-core-2026-05` records and behavior unchanged. It adds a tenant-owned V2 case head, immutable normalized authoring revisions, version-owned primitives/edges/assets/interactions/evidence, and immutable server-generated decision snapshots and SHA-256 references. V1 clone copies only allowlisted source facts as unverified input.

Authenticated users have capability-scoped read access only. `PUBLIC`, `anon`, and `authenticated` cannot execute V2 private mutation RPCs or directly mutate V2 tables. Each RPC independently rechecks current actor, tenant/workspace ancestry, capability, authorization version, idempotency, and optimistic version. Finalize accepts no client decision material; the Edge handler loads locked server facts, executes the shared deterministic evaluator, generates canonical snapshots/hashes, then persists decision, `reviewer_ready` state, receipt, and privileged audit atomically.

## Verification and proof boundary

The focused Edge suite covers exact nested validation, finalize injection rejection, independent authority, server evaluation/hash generation, and sanitized failures. The disposable PostgreSQL harness covers ACL/RLS, two-tenant isolation, immutable history, clone compatibility, idempotency, concurrency, rollback-on-audit-failure, feature disable/read-only fallback, and the PR 1C resubmission forward fix. Exact local results must be recorded by the root controller; no hosted or live system is accessed.

This source and disposable-test evidence does not establish deployment, pilot, production, storage, security, compliance, scientific calibration, guaranteed ROI, or buyer readiness.

## Rollback and recovery

Disable V2 or set its runtime control to read-only, preserve all V1/V2 rows, receipts, snapshots, hashes, and audits, then ship an additive forward fix. Do not destructively down-migrate, restore browser authority, silently reinterpret V2 through V1, or mutate finalized evidence.
