# PR 1D Avala Assess V2 Decision Intelligence Evidence

Status: executed local source, browser, build, and disposable-database evidence

Baseline: PR #208 / PR 1C accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`

This evidence belongs to the substantial PR 1D implementation boundary. It does not establish hosted, deployment, pilot, production, security-certification, buyer, compliance, scientific-calibration, or guaranteed-economic readiness.

## Acceptance criteria disposition

- V1 `assess-core-2026-05` formulas, weights, thresholds, hard stops, recommendation logic, records, Govern provenance, and Studio lineage remain unchanged.
- V1 presentation is explicitly marked `Legacy V1`; the final recommendation remains visible. Historical 0–100 evidence metadata and canonical V1 1–5 evidence metadata are normalized only at the Govern compatibility boundary.
- V2 cases, immutable authoring versions, primitives, edges, decision points, exception paths, application facts, evidence, and decision-owned derived results use additive tenant/workspace-owned storage.
- V2 finalization accepts exactly `{ caseId }` from the browser. The server reloads locked facts, applies the versioned deterministic evaluator, builds canonical domain-separated SHA-256 snapshots, and atomically records the decision, reviewer-ready state, receipt, and privileged audit.
- V2 ends at `reviewer_ready`. V2 approval, Govern resolution, Studio handoff, export, and external sharing are absent and reserved for later approved work.
- V1-to-V2 clone is explicit, preserves the V1 source, and imports allowlisted facts/evidence as unverified suggestions.
- The AP invoice-exception fixture proves primitive decomposition, independent component/application evaluation, explicit exception paths, evidence-qualified categorical outcomes, and a composed operating model without a whole-process technology winner.
- Runtime disable and read-only controls provide the safe fallback. Durable rows, receipts, snapshots, hashes, and audits are preserved for a forward fix.

## Executed evidence

| Verification | Result |
| --- | --- |
| `npm.cmd ci` | Passed; 200 packages installed, 0 audit vulnerabilities. |
| `npm run test:pr1d` | Passed: source/CI/migration contracts, V1 compatibility, V2 registry/evaluator/digests, Edge commands, presentation, Govern regression, coverage, and docs. |
| `npm run test:pr1d-coverage` | Passed: 98.25% lines, 92.37% functions, 80.05% branches. |
| `npm run test:migrations:pr1d` against isolated PostgreSQL 15 | Passed: full chain, private RPC ACLs, forced RLS, two-tenant isolation, clone preservation, replay/conflict behavior, genuine two-session draft concurrency, immutable decision-owned outputs, injected audit-failure rollback, disable/read-only fallback, and V1 resubmission. Disposable database and container removed. |
| `npm.cmd run test:browser:pr1d` | Passed with the PR-owned production-preview configuration for desktop and mobile Chromium. Covered capability visibility, create, clone-as-unverified, edit/save, exact finalize payload, read-only Decision Pack, accessibility, overflow, sanitized failure, and interaction timing. |
| `npm.cmd test` | Passed complete repository regression, including frozen deterministic V1 scoring and retained PR 1A/1B/1C gates. |
| `npm.cmd run build` | Passed production Vite build. |
| `npm run typecheck` and `npm run typecheck:edge` | Passed directly and within the aggregate regression. |
| `git diff --check` | Passed; line-ending notices only. |

The repository has no generic `lint` script. `lint:pr1d` is the applicable feature-owned lint/contract command and passed. No live or hosted infrastructure, production data, logs, secrets, storage objects, deployment controls, or incident actions were accessed.

## Rollback and recovery

Set the V2 runtime control to disabled or read-only, leave V1 behavior available, preserve all V2 history and evidence, and ship an additive forward fix. Do not down-migrate destructively, mutate immutable decisions, reinterpret V2 through V1 scoring, restore browser-side decision authority, or claim that local evidence proves hosted readiness.
