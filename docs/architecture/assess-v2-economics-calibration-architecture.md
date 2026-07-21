# Avala Assess V2 Economics, Calibration, and Portfolio Architecture

Status: PR 1F active candidate.

## Versions

- Economic model version: `assess-v2-economics-model-2026-07`.
- Formula version: `assess-v2-economics-formulas-2026-07`.
- Calibration status for this PR: **Insufficient Data** with sample count `0` because the repository has no real independently reviewed realized-outcome corpus.

## Domain boundary

PR 1F is additive to exact organization, workspace, case, source authoring version, immutable V2 decision version, approved PR 1E review, model version, and formula version. It does not change V1 `assess-core-2026-05`, PR 1D technical-fit/component/modernization/action-control decisions, or PR 1E review, approval, Govern, and Studio-source authority.

## Benefit and cost categories

Benefits are typed as capacity released, avoidable cash expenditure, revenue protected, revenue enabled, expected loss or risk avoided, quality value, SLA/cycle-time value, safety or customer/patient protection value, or other explicitly typed value. Costs are typed as discovery/design, engineering/integration, licences, workflow/RPA/AI/OCR/model usage, cloud/infrastructure, testing/validation, security/governance, training/change management, support/maintenance, monitoring/operations, or contingency.

Every value carries unit, quantity/range, period, evidence IDs, accountable owner, confidence, and explicit cash inclusion. Capacity release is reported as hours/FTE-equivalent capacity and is not cash savings unless an independently evidenced realization mechanism and non-overlap explanation are present.

## Formula architecture

The server-side deterministic formula suite calculates conservative/base/upside scenarios for capacity released, annual avoidable cash benefit, annual revenue value, annual expected risk-adjusted value, quality/SLA/safety value, one-time cost, annual recurring cost, TCO, net annual benefit, cumulative net value, payback, ROI, and NPV when discount-rate inputs exist. Risk avoided is probability times exposure times control effectiveness. Scenario traces identify formula version, scenario, units, and the capacity-versus-cash boundary.

Sensitivity and break-even reporting is deterministic over material inputs: transaction volume, manual effort, adoption, automation coverage, labour cost, implementation cost, recurring cost, event probability, impact, and control effectiveness. PR 1F does not add Monte Carlo simulation.

## Review lifecycle

Economics uses `draft -> reviewer_ready -> in_review -> approved | changes_requested | rejected -> superseded`. Approval requires a current approved PR 1E review, complete assumptions, no unresolved double counting, complete currency/period information, independent reviewer different from author, evidence-backed cash-savings classification, conditions/rationale, and atomic version/receipt/audit persistence. Changes requested create a new immutable economics version; prior approvals do not authorize changed versions.

## Realized outcomes and calibration

Realized outcomes are append-only and linked to an exact approved economics version. Estimated values cannot be recorded as realized outcomes. Outcomes require independent review before calibration qualification. Calibration reports sample count, cohort, coverage, variance, bias, mean absolute error where valid, predicted-range coverage, realization and cost-overrun ratios, payback accuracy, and missing-data rate. Synthetic fixtures are visibly marked synthetic and excluded.

Calibration never rewrites forecasts, changes formulas, changes thresholds or weights, or promotes a model version automatically. `Calibrated for Defined Cohort` requires a later approved versioned policy and real reviewed samples; PR 1F remains **Insufficient Data**.

## Portfolio intelligence

Portfolio views are tenant/workspace scoped over exact approved V2 decisions and economics versions. They show independent dimensions: reviewed technical readiness, evidence confidence, business-value range, cost range, expected risk-adjusted value, payback range, implementation complexity, time to value, strategic importance, and unresolved dependencies. Hard technical and governance gates run before priority calculation. Dispositions are `Proceed to controlled design`, `Validate assumptions first`, `Redesign process first`, `Monitor`, and `Do not prioritize currently`.

Cross-currency ranking or aggregation is blocked unless a later versioned approved conversion-rate record exists. PR 1F does not implement company-wide application inventory, repository scanning, architecture scanning, private artifacts, Studio mutation, runtime agents, RPA execution, MCP, or A2A.

## Rollback

Rollback is fail-closed feature disablement or read-only maintenance, preserving immutable economics versions, realized outcomes, calibration snapshots, receipts, and audits. Forward fixes must be additive; do not destructively down-migrate forecasts or outcomes.
