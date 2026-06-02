# Avala Security BYOK

## Purpose

Protect security, provider key, BYOK, audit, and server-side AI boundaries.

## When To Use

Use for AI provider configuration, Edge Functions, secrets, storage, export, audit, and pilot readiness.

## Non-Negotiable Rules

- Raw provider keys must not be stored in the browser for pilot or production behavior.
- Pilot and production AI must run server-side.
- Do not add unsupported compliance claims.

## Inputs

- Security and governance docs
- AI boundary docs
- Environment and provider assumptions

## Outputs

- Security boundary assessment
- BYOK/key-reference requirements
- Verification evidence

## Acceptance Criteria

- Secrets remain server-side or referenced securely.
- AI usage is auditable.
- Claims are limited to implemented and verified controls.

## Common Failure Modes

- Browser-side secrets.
- Provider behavior hidden from audit.
- Compliance wording that sounds certified.

## Verification Checklist

- Scan for browser-side key handling.
- Review AI execution path.
- Review compliance language.
