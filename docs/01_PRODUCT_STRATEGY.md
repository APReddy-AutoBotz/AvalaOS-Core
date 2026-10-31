# AvalaOS Core Product Strategy

AvalaOS Core is the governed AI and automation delivery platform for teams that need to evaluate processes, generate delivery-ready documentation, govern agents and automations, manage human approvals, and prove decisions with evidence.

Canonical tagline: Evaluate before you automate. Govern before you execute.

## Positioning

AvalaOS Core is not a generic project management system. It owns the governed work before and around delivery execution: intake, fitment, deterministic scoring, recommendations, evidence, documentation, approvals, handoff, and value visibility.

Primary category language: Governed AI & Automation Delivery OS.

## Module Strategy

- Avala Assess: process intake, deterministic scoring, automation/AI/RPA/workflow/HITL/agentic fitment, decision packs.
- Avala Studio: canonical BRD/FRD/PDD artifacts, governed editing/review/approval and work-item preparation; wider document/diagram ambitions are distinct from verified support.
- Avala Govern: governance and control-plane surfaces for agents and automations covering autonomy, risk, approvals, evidence, allowed actions, blocked actions, AI/provider controls, and audit posture.
- Avala Delivery: governed delivery workbench for approved work items, owners, status, blockers, handoff lineage, delivery packs, and downstream delivery handoff.
- Avala Monitor: value, risk, blockers, portfolio visibility.
- Avala Admin / Avala AI Controls: organization, users, providers, BYOK/key reference, audit, security settings.

## Product Boundaries

AvalaOS Core should not compete directly with Jira, Azure DevOps, ServiceNow, UiPath, Power Automate, or execution runtimes. Those systems may manage tickets, workflow execution, RPA bots, service processes, or downstream engineering delivery.

AvalaOS Core provides the governed control layer that explains what should be automated, why, with which controls, and what evidence supports the decision.

Avala Govern does not execute bots, agents, RPA jobs, external-system actions, MCP controls, A2A controls, or live runtime enforcement in the current baseline. Avala Delivery is not a Jira replacement; it governs automation and AI delivery readiness around downstream delivery systems.

## Personas

- Business owner: needs a defensible recommendation and value/risk evidence.
- Automation lead: needs fitment, documentation, approvals, and handoff lineage.
- Reviewer or approver: needs evidence, assumptions, controls, and blocked actions.
- Delivery lead: needs approved work items and scope boundaries.
- Executive or portfolio owner: needs value, risk, blockers, and confidence visibility.
- Platform admin: needs module access, AI controls, audit, and security settings.

## Differentiation

AvalaOS Core creates traceability from process idea to governed delivery evidence. Its core value is not task volume; it is decision quality, auditability, and governed handoff.

## Current product and delivery boundary

[End-to-end product guide](09_END_TO_END_PRODUCT_GUIDE.md) defines the supported starts, module inputs/outputs and explicit handoffs. [Implementation status](05_IMPLEMENTATION_STATUS.md) and [roadmap](04_MVP_ROADMAP.md) separate implemented contracts, executed evidence and pending readiness gates; old PR1D milestone language is not the active delivery status.

Assess V2 selects the least-complex eligible mix of human-led work, rules, integration, workflow, UI automation, intelligence, and controls. It does not claim scientific validation, expert calibration, guaranteed ROI or deployment readiness. Independent Studio/Delivery starts remain planning-only and not assessed.

BRD/FRD/PDD are the current canonical Studio aggregate types; PRD/SDD/diagram ambitions do not establish additional implemented type support. Source ingestion, Application Portfolio, Modernization, economics, Trust/Assurance, and draft-only Assemble Phase 1 extend the core modules under their own domain authority. No runtime agent, bot, RPA, MCP or A2A execution is part of the current baseline.
