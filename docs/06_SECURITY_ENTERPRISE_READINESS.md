# KlarityPM Security And Enterprise Readiness

Last Updated: 2026-05-08  
Owner: Product / Engineering

## What This Doc Is

This doc defines KlarityPM's current security blockers, enterprise pilot minimums, GA controls, and AI governance requirements.

## What This Doc Is Not

This is not a legal policy, DPA, privacy policy, or compliance certification. It is an engineering and product readiness guide for enterprise review preparation.

## 1. Current Security Blockers

- Client-side AI calls.
- Browser BYOK/localStorage.
- Incomplete role/RLS enforcement.
- Incomplete audit coverage.
- Incomplete production PDF/DOCX extraction.
- Unsanitized Markdown/Mermaid risk if any rendering path bypasses sanitization.
- Incomplete OpenAI provider if visible to users.

These blockers must be treated as pilot-readiness blockers, not cosmetic issues.

## 2. Enterprise Pilot Minimum

Required before a real enterprise pilot:

- Tenant isolation proof.
- RLS smoke/regression tests.
- Server-side AI.
- Encrypted key reference model.
- Audit events for critical actions.
- Basic audit export.
- Privacy/security notes.
- Data retention/deletion plan.
- Provider data handling notes.

Buyer-facing security notes should clearly explain:

- What data is stored.
- Where AI calls are executed.
- Which provider receives what data.
- Whether provider training is disabled.
- How BYOK is stored or referenced.
- How access is logged.
- How tenant isolation is enforced.

## 3. Data Classification

Pilot readiness requires a simple data classification model.

- Public: approved marketing copy, public documentation, and non-sensitive product screenshots.
- Internal: product plans, implementation notes, non-secret operational logs, and non-customer test data.
- Tenant Confidential: customer process descriptions, transcripts, uploaded source files, generated documents, assessments, decisions, delivery work, comments, and audit history.
- Restricted: API keys, BYOK references, access tokens, passwords, secrets, security findings, support access logs, and regulated personal data.

Handling rules:

- Tenant Confidential data must be tenant-scoped and protected by RLS.
- Restricted data must not be stored in browser localStorage or exposed to client logs.
- AI provider calls must treat prompts, uploaded source material, generated documents, and decision packs as Tenant Confidential unless explicitly marked otherwise.
- Audit logs should record access and changes without leaking Restricted data values.

## 4. Pilot Data Rules

Allowed in demo:

- Seeded demo data.
- Synthetic documents.
- Synthetic transcripts.
- Non-sensitive process examples.
- Fake customer/vendor/invoice/order data.

Allowed in enterprise pilot only after pilot minimum controls:

- Real process descriptions.
- Internal SOPs.
- Customer transcripts.
- Generated decision packs.
- Generated BRDs/PDDs.
- Real delivery work items.

Not allowed before server-side AI and secure BYOK/key reference:

- Customer confidential documents.
- Production transcripts.
- Regulated personal data.
- Raw API keys in browser storage.
- Secrets in logs.
- Unrestricted file URLs.
- Cross-tenant test data.

## 5. Enterprise GA Controls

Required or expected for GA, depending on buyer segment:

- SSO/OIDC/SAML.
- SCIM.
- SIEM export.
- Advanced audit.
- DPA.
- Subprocessors list.
- Backup/restore.
- Incident response.
- Access controls.
- Data residency.
- Retention and deletion workflow.
- Support access controls.
- Accessibility audit.
- Load testing.

## 6. AI Governance

Required:

- Prompt versioning.
- Usage logging.
- Token/cost tracking.
- Model/provider policy.
- Prompt injection defense.
- Human review gates.
- Source traceability.
- Provider routing policy.
- Rate limits and failure handling.

Assess rule:

- AI must not decide final scores, gates, risk tiers, or recommendations.
- Deterministic engines own these decisions.
- AI may narrate, summarize, explain, or suggest clarifying questions.

Docs rule:

- AI-generated sections must expose citations, assumptions, quality gaps, and review status.
- High-risk outputs must require human approval before handoff.

Delivery rule:

- AI can suggest work items, risks, dependencies, or summaries.
- Humans must approve imported delivery work and ownership changes.

## Enterprise Readiness Position

KlarityPM is currently suitable for controlled product demonstration and development validation. It is not yet ready for unsupervised enterprise pilot or GA deployment until the pilot minimum controls are implemented and verified.
