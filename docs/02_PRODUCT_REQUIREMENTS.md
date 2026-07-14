# AvalaOS Core Product Requirements

## Product Requirement

AvalaOS Core must support a complete governed lifecycle from assessment to monitoring without rewriting existing deterministic scoring behavior.

## Avala Assess

- Capture process intake, owners, systems, data profile, judgment profile, risk profile, evidence, and assumptions.
- Calculate deterministic fitment, business value, risk gates, confidence, priority, and handoff eligibility.
- Preserve scoring regression tests.
- Generate a Decision Pack and Handoff Pack from deterministic results and reviewed inputs.

## Avala Studio

- Generate governed BRD, PRD, PDD, SDD-oriented content, diagrams, quality gaps, approvals, and work item candidates.
- Keep generated content editable and reviewable.
- Require human approval before downstream handoff.
- Use server-side AI for pilot and production. Browser-side AI is local transitional behavior only.

## Avala Govern

- Add a visible governance card in the post-assessment Decision Pack or Handoff Pack flow.
- Minimum fields: agent or automation name, mapped process, business owner, technical owner, technology pattern, systems accessed, tools used, data sensitivity, autonomy level, risk level, allowed actions, blocked actions, human approval required, evidence required, review frequency, audit status.
- Show autonomy level, risk level, approval requirement, evidence requirement, and blocked actions.
- Do not build runtime monitoring, agent execution, bot execution, RPA job execution, external-system actions, MCP controls, or A2A controls in this slice.

## Avala Delivery

- Import or review approved work item candidates.
- Support governed workbench views for board, owner, status, blockers, handoff lineage, delivery packs, evidence checklists, and downstream delivery handoff.
- Stay outside Jira replacement scope.

## Avala Monitor

- Show portfolio visibility over value, risk, blockers, and delivery status.
- Surface evidence-backed signals, not unsupported compliance claims.

## Avala Admin / Avala AI Controls

- Manage organization profile, users, modules, provider settings, key references, audit, and security settings.
- Do not reintroduce browser-stored provider keys for production or pilot behavior.

## Module Naming And Proof Boundary

Avala Govern and Avala Delivery are the buyer-facing canonical names for the premium enterprise baseline. Proof boundaries must be carried through claim controls, Trust Center proof statuses, evidence references, limitation disclosures, and acceptance gates. Module names must not imply runtime execution, hosted readiness, production readiness, deployment readiness, RLS readiness, tenant-isolation proof, security readiness, buyer readiness, product readiness, release-candidate readiness, or compliance certification.

## Enterprise Readiness Requirements

- M5 authority, ownership, RLS, audit, export, and deployment readiness must be tracked as evidence-backed milestones.
- M5.2 authority migrations and ownership columns are prerequisites for future tenant-isolation policy work, not proof that tenant isolation is complete.
- M5.3 is the RLS policy design and test plan. Implementation and policy evidence require a later approved milestone.
- KlarityFlow Health remains outside core AvalaOS scope unless explicitly approved as separate Health work.

## Acceptance Requirements

- UI uses AvalaOS Core and Avala module names.
- No current user-visible old branding remains outside migration notes.
- Scoring behavior is unchanged.
- No unsupported compliance claims are introduced.

## PR 1D Current Authority

PR #208 / PR 1C is accepted at `30883509b46b848eaf1d0d5fc4bb5898bade98a3`; Workstream 1A-1C is accepted at source/CI level. PR 1D is the active substantial Avala Assess V2 decision-correctness boundary. V1 `assess-core-2026-05` remains an unchanged legacy deterministic heuristic. PR 1E (review/approval and handoff authority) and PR 1F (calibration and economics) follow before broader Studio/private-artifact expansion. Hosted, deployment, pilot, production, security-certification, buyer, and compliance readiness remain unproven. Routine micro-PRs and plan/evidence/reconciliation/closure-only PRs remain prohibited.

PR 1D requires explicit V2 cases, immutable authoring/decision versions, primitives, decisions, exceptions, application interactions, evidence links, a versioned deterministic rule registry, action-specific controls, modernization dispositions, and a read-only executive Decision Pack. V1 import is explicit and unverified; V2 finalization ends reviewer-ready.
