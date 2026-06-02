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

## Acceptance Requirements

- UI uses AvalaOS Core and Avala module names.
- No current user-visible old branding remains outside migration notes.
- Scoring behavior is unchanged.
- No unsupported compliance claims are introduced.
