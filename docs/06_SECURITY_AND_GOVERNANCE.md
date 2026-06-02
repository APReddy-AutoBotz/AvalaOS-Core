# AvalaOS Core Security And Governance

## Security Position

AvalaOS Core is suitable for controlled product demonstration and development validation. Enterprise pilot readiness requires verified server-side AI execution, BYOK/key reference controls, RLS enforcement, audit coverage, secure exports, and deployment runbooks.

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

## Governance Controls

Avala Govern Lite records autonomy, risk, approval, evidence, allowed actions, blocked actions, review frequency, and audit status. It is a governance surface, not a runtime execution controller.

## Compliance Language

No SOC 2, HIPAA, GDPR, GxP, ISO, or similar compliance claims are made in this documentation. Such claims require formal validation and explicit product/legal support.
