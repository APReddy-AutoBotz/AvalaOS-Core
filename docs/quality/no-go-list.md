# No-Go List

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

The following are release blockers unless a later approved milestone explicitly changes the rule:

- Unversioned scoring formula, threshold, hard-stop, or recommendation changes.
- AI changing deterministic scoring outputs.
- Claiming "HIPAA compliant", "SOC 2 compliant", "GDPR compliant", or "GxP compliant" without formal validation and approval.
- Copy that says "AI decides score" or "agent decides" instead of deterministic engine or human approval.
- Copy that frames an "autonomous decision" as acceptable without governed boundaries and approval policy.
- Browser-side raw provider secrets for pilot or production behavior.
- Runtime AGS, MCP, A2A, or agent execution behavior during M0.2.
- Delivery scope expanding into a Jira replacement.
- Health implementation changes during non-Health milestones.
- Pushes to a non-AvalaOS-Core remote.
