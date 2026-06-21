# AvalaOS Core Security And Governance

## Security Position

AvalaOS Core is suitable for controlled product demonstration and development validation. Enterprise pilot readiness requires verified server-side AI execution, BYOK/key reference controls, RLS enforcement, tenant-isolation tests, audit coverage, secure exports, and deployment runbooks.

## AI Controls

- AI must not decide final scores, gates, risk tiers, or recommendations.
- AI-generated documents must remain editable and subject to human approval.
- Pilot and production AI must use server-side execution.
- Raw provider keys must not be stored in the browser for pilot or production behavior.

## Data And Evidence Controls

- Evidence and assumptions should be linked to scoring fields where possible.
- Sensitive evidence requires reviewer attention.
- Generated baseline sections must state when source material was absent or thin.
- Handoff decisions should preserve source, owner, decision, and evidence references.
- Historical evidence docs under `docs/quality/` prove what was verified at the time, but current canonical docs define the active product baseline.

## Enterprise Readiness Controls

- M5.2 authority and ownership groundwork is a prerequisite for tenant-isolation policy work.
- M5.2g-a `delivery_work_items` authority table readiness is fail-closed because RLS is enabled with no policies. This is not evidence of usable tenant isolation.
- M5.3 documents RLS policy design and test planning only. Policy implementation, tests, and post-merge proof require a later approved milestone.
- No documentation cleanup may imply deployment readiness, RLS enforcement, or compliance certification without supporting evidence.

## Governance Controls

Avala Govern Lite records autonomy, risk, approval, evidence, allowed actions, blocked actions, review frequency, and audit status. It is a governance surface, not a runtime execution controller.

## Health Boundary

KlarityFlow Health remains a separate proof vertical. Health proof-pack records must not be treated as core AvalaOS implementation evidence unless AP explicitly opens Health scope.

## Compliance Language

No SOC 2, HIPAA, GDPR, GxP, ISO, or similar compliance claims are made in this documentation. Such claims require formal validation and explicit product/legal support.
