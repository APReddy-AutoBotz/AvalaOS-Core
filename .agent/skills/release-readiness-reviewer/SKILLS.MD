---
name: release-readiness-reviewer
description: Use this skill before releasing a KlarityPM Assess module or major change to verify logic, UX, gating, and handoffs.
---

Release Readiness Reviewer

## Goal
Perform a final pre-release quality gate for a module or release candidate.

## Instructions
1. Review changed areas.
2. Verify:
   - acceptance criteria complete
   - free-trial gating intact
   - role visibility correct
   - audit/version traces present
   - Assess → Docs → Delivery hooks working
3. Run smoke scenarios.
4. Capture release risks and severity.

## Constraints
- Do not approve a release with broken gating.
- Do not approve a release with unversioned scoring changes.
- Do not approve a release if handoff payloads lose rationale or assumptions.

## Output Format
- Release Scope
- Checks Run
- Findings
- Severity
- Go / No-Go