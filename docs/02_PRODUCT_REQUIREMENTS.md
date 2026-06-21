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

## Avala Govern Lite

- Add a visible governance card in the post-assessment Decision Pack or Handoff Pack flow.
- Minimum fields: agent or automation name, mapped process, business owner, technical owner, technology pattern, systems accessed, tools used, data sensitivity, autonomy level, risk level, allowed actions, blocked actions, human approval required, evidence required, review frequency, audit status.
- Show autonomy level, risk level, approval requirement, evidence requirement, and blocked actions.
- Do not build runtime monitoring, agent execution, MCP controls, or A2A controls in this slice.

## Avala Delivery Lite

- Import or review approved work item candidates.
- Support board, owner, status, blockers, and handoff lineage.
- Stay intentionally lighter than Jira-style project management.

## Avala Monitor

- Show portfolio visibility over value, risk, blockers, and delivery status.
- Surface evidence-backed signals, not unsupported compliance claims.

## Avala Admin / Avala AI Controls

- Manage organization profile, users, modules, provider settings, key references, audit, and security settings.
- Do not reintroduce browser-stored provider keys for production or pilot behavior.

## Module Naming Boundary

Avala Govern Lite and Avala Delivery Lite remain canonical names for the current baseline. "Lite" indicates intentionally bounded governance and delivery scope. It does not mean obsolete branding, and it must not be removed through docs cleanup unless a later approved product milestone changes the module scope.

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
