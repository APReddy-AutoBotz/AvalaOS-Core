# Studio AI output correction notes

Status: local source correction verified on working-tree head `94f318c44d59b20212efe329bca09ab959e0ca63`; no commit, push, deployment, hosted mutation, provider call, or readiness claim was performed by this slice.

## Confirmed defect

The Studio provider instruction described the `studio-artifact-2` response only at a high level. The two persisted template payload unions were sent as untrusted input but were not normalized into a trusted output contract. Completion validation checked the structured artifact and citation coverage, but did not bind returned section IDs, titles, order, or required bodies to the exact selected template. A retained synthetic PDD response consequently returned array-shaped coverage and reused one generic body for all five template sections; it was rejected, but the prompt did not give the provider the exact shape needed to produce a valid correction.

After the template correction, a bounded real-provider component attempt returned all five exact PDD sections and titles, unique non-empty bodies, and exact coverage, but all five emitted citation triples failed canonical anchor membership. The canonical triples were available only inside the length-framed BASE64URL evidence payload. Requiring the provider to reproduce arbitrary locators plus long hashes was an addressability defect; the strict membership validator behaved correctly and remains unchanged. The failed attempt is retained under `output/testing/synthetic-ai-campaign-20260917/` and is not promoted to PASS.

After opaque citation references corrected that failure, the next retained real-provider component attempt passed exact template, coverage, and canonical-anchor validation but exposed a semantic-fidelity defect. It omitted the explicit exclusion “Payment execution is outside scope,” weakened an unconditional “No payment may be executed by this workflow” prohibition into conditional permission, and added unsupported compliance/assurance language. The sanitized result is retained as `studio-pdd-content-review-4.json`; structural success is not promoted to content-quality PASS.

## Correction

- `normalizeStudioArtifactTemplate` fail-closed normalizes immutable system payloads `{artifactType, sections}` and approved tenant payloads `{sectionDefinitions, fieldSchema}` into one bounded section contract.
- The trusted provider instruction now declares the exact top-level, section, anchor, label, and coverage fields; safe section IDs, order, required state, and selected source-version IDs; and prohibits duplicated normalized bodies across required sections. Immutable system titles are included directly. Tenant-authored titles remain inside the framed untrusted template data and are copied by safe ID; they are never promoted into the system instruction. Completion still requires their exact normalized title.
- New generation completion passes the raw server-selected template payload into validation. It rejects omitted, extra, duplicate, reordered, or renamed sections; blank required bodies; duplicate normalized required bodies; malformed coverage; and covered-source order drift.
- Citation membership, exact canonical-anchor validation, output-size limits, budget ownership, staging, fencing, response-loss behavior, and human review/approval authority are unchanged.
- The historical `studio-artifact-1` reader remains available when no generation template is supplied. A new provider completion with a selected template must use `studio-artifact-2`.
- The provider wire format now uses deterministic server-issued `anchor-NNNN` references. The caller-bound canonical catalog is validated before effect for exact shape, selected-source membership, uniqueness, and complete selected-source representation. Accepted facts receive a reference only through an exact source/hash/locator match; no fallback or invented reference exists.
- The framed untrusted payload contains a safe catalog projection (`anchorRef`, source-version UUID, SHA-256 hash) and keeps arbitrary locators, tenant titles, and source text out of the trusted instruction. The adapter rejects unknown, malformed, duplicate-within-section, or legacy full-triple wire references and expands valid references to the exact server canonical triples before normal completion validation and staging.
- The trusted drafting contract now requires exact semantic preservation of prohibitions, scope exclusions, numeric thresholds, and actors; forbids converting unconditional prohibitions into conditional permission; requires an explicit exclusion in the summary when the selected template has no scope section; and forbids unsupported compliance, policy-conformity, accuracy, accountability, completeness, timeliness, or control-effectiveness assurance.

Canonical immutable system sections remain:

- BRD: `summary`, `objectives`, `scope`, `requirements`, `risks`
- FRD: `summary`, `functionalRequirements`, `rules`, `interfaces`, `acceptanceCriteria`
- PDD: `summary`, `process`, `roles`, `controls`, `exceptions`

## Executed focused verification

All commands used the isolated `scripts/runEnterpriseIntelligenceTest.mjs` runner and local synthetic/mocked inputs. They made no paid or real-provider request.

1. `node scripts/runEnterpriseIntelligenceTest.mjs supabase/functions/_shared/studioArtifactTemplateContract.ts supabase/functions/_shared/studioArtifactTemplateContract.test.ts`
2. `node scripts/runEnterpriseIntelligenceTest.mjs supabase/functions/_shared/studioArtifactProvider.ts supabase/functions/_shared/studioArtifactProvider.test.ts`
3. `node scripts/runEnterpriseIntelligenceTest.mjs supabase/functions/_shared/studioArtifactGeneration.ts supabase/functions/_shared/studioArtifactGeneration.test.ts`

Final result after the semantic-contract correction: three commands passed with 66 assertion-owned markers (template 3, provider 29, generation 34). The cases include both persisted template unions, all six provider identities through the mocked unified gateway, malformed/instruction-bearing template and source-selector rejection before provider effect, hostile tenant titles retained outside the trusted instruction, explicit trusted shape and semantic-fidelity instructions, retained legacy reading, exact tenant and system PDD validation, adversarial omission/extra/rename/order/blank/duplicate-body/coverage failures, opaque catalog framing, exact reference expansion, no-fabrication behavior, Assess-handoff reference binding, invalid reference rejection, and generation-to-provider canonical-anchor propagation.

## Rollback

Controller integration subsequently added Studio-only bounded readable JSON-string
framing (BASE64URL unchanged elsewhere), then OpenAI-only strict response schemas
after a live omitted-section failure. Schema bytes are included in reservation;
post-response validation and human review remain mandatory. Final focused Studio
markers are 67/67; campaign fixtures/oracles are 15/15. Final PDD/BRD/FRD real-provider
fixtures pass, without proving general semantic accuracy. The authoritative complete
chronology, failed attempts, final-source gates and spending are in
`docs/quality/assess-studio-ai-output-correction-evidence.md`.

Rolling back the integrated correction must also remove the Studio-only frame,
OpenAI schema attachment and corresponding schema-estimation overhead together;
never remove the pre-existing server authorization, output validation or spending
ledger records as a shortcut.

Rollback is a source-only revert of the template normalizer import, trusted prompt builder, selected-source/template/canonical-anchor provider bindings, opaque reference adapter, and fourth `templatePayload` validation argument. It requires no database rollback. Existing aggregate/version/attempt/reservation/staged-response records remain immutable and readable. If generation must be disabled while a forward repair is prepared, use the existing Studio generation feature controls and retain committed attempts for bounded reconciliation; do not erase a possibly completed provider effect.
