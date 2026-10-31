# AvalaOS Core Product Requirements

## Product Requirement

AvalaOS Core must support a complete governed lifecycle from assessment to monitoring without rewriting existing deterministic scoring behavior.

## Avala Assess

- Capture process intake, owners, systems, data profile, judgment profile, risk profile, evidence, and assumptions.
- Calculate deterministic fitment, business value, risk gates, confidence, priority, and handoff eligibility.
- Preserve scoring regression tests.
- Generate a Decision Pack and Handoff Pack from deterministic results and reviewed inputs.

## Avala Studio

- Support canonical governed BRD/FRD/PDD artifacts, quality gaps, human approvals and work-item candidates. PRD/SDD-oriented content and wider diagram aspirations do not imply independently accepted canonical artifact types.
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

- Source support, local fixtures, exact-head CI, release verification, integrated synthetic acceptance, human UAT and production approval are separate gates.
- Current evidence and missing proof are recorded in [implementation status](05_IMPLEMENTATION_STATUS.md); the required sequence is in the [roadmap](04_MVP_ROADMAP.md).
- Older M5/PR1D planning statements describe historical stages and must not replace current domain authority or evidence.
- KlarityFlow Health remains outside core AvalaOS scope unless explicitly approved as separate Health work.

## Acceptance Requirements

- UI uses AvalaOS Core and Avala module names.
- No current user-visible old branding remains outside migration notes.
- Scoring behavior is unchanged.
- No unsupported compliance claims are introduced.

## Module inputs, outputs and acceptance

The [end-to-end product guide](09_END_TO_END_PRODUCT_GUIDE.md) defines supported inputs, user responsibilities, module outputs, failure behavior and handoffs. Assess, Studio and Delivery may start independently. Every downstream resource requires explicit current authorization and target acceptance; direct paths cannot fabricate Assess ancestry. Monitor remains read-only.

Each implementation must preserve exact versions, tenant boundaries, deterministic decisions, human approval, audit/receipt behavior, safe failure/replay and accessible loading/error/recovery states. Feature-owned executable criteria and the acceptance catalog provide detailed checks. Passing a local test does not satisfy a separate real-auth, deployed or human-UAT requirement.
