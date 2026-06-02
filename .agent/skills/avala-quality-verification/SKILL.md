# Avala Quality Verification

## Purpose

Ensure every milestone closes with evidence, acceptance status, and safe changed-file scope.

## When To Use

Use before final reports, commits, pushes, PRs, tags, and release gates.

## Non-Negotiable Rules

- Do not mark final pass before verification is complete.
- Do not push unverified changes.
- Do not tag until the approved milestone policy allows it.

## Inputs

- Changed files
- Verification command output
- Wording scan results
- Acceptance criteria

## Outputs

- Evidence review
- Pass or blocked decision
- Final report facts

## Acceptance Criteria

- Required commands pass or blockers are reported.
- Wording scan is reviewed.
- Changed files match approved scope.

## Common Failure Modes

- Reporting pass before checks complete.
- Omitting allowed reasons for risky wording.
- Staging unrelated changes.

## Verification Checklist

- Run required commands.
- Run wording scan.
- Review changed files.
- Confirm remotes before push.
