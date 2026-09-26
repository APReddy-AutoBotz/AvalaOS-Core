# Assess / Studio local AI-output correction evidence

## Scope and current status

Date: 2026-09-17. Base HEAD: `94f318c44d59b20212efe329bca09ab959e0ca63`.
This is uncommitted working-tree evidence, not exact-head CI, hosted execution,
human acceptance or production readiness. The governing plan is
`docs/planning/assess-studio-ai-output-correction.md`.

The live component harness uses production prompts, gateway, secret resolver,
output validation and the actual Studio material loader with synthetic committed-row
fixtures. Authority is simulated; no real document is approved, staged or handed off.
The saved OpenAI key is read only into process memory. Existing hosted targets stay
provider-free. No deployment, push, merge or schema change occurred.

## Retained executed evidence before citation-reference correction

- Assess focused suite: 6/6 tests passed.
- Studio template/provider/generation: 59 assertion markers passed across three isolated commands.
- Budget and production-material fixtures: 13/13 tests passed, including changed provenance,
  timeout, concurrency, replay, usage/model substitution and oversized response rejection.
- Native feature: 10/10 commands passed, manifest
  `output/assess-import/validation/feature-4ee63a2d-b50a-42a7-99fb-e67b861b0979/manifest.json`.
- Retained regression: 1/1 aggregate command (11 suites), manifest
  `output/assess-import/validation/regression-24a0b311-fa53-4510-922f-373be4f379bc/manifest.json`.
- Browser: 32/32 Desktop/Pixel scenarios, zero skipped/flaky/unexpected,
  `output/playwright/assess-import/d8761a44ad38aeae9db95236/results.json`;
  canonical browser manifest
  `output/assess-import/validation/browser-5e08cde1-a7b8-4568-a4af-0bc909373d6c/manifest.json`.
- The three canonical groups above bind source digest
  `ea470c7ee1fd5cef93dc763ffeb28b7fbc88de24be01acc857dd3e30cac0e096`.
- Application/Edge typechecks, AI-boundary (zero forbidden), secret hygiene (zero forbidden),
  workflow YAML, isolated deterministic scoring and dependency audit (zero vulnerabilities) passed.
- Earlier feature attempts stopped `source_changed` during concurrent edits. Their partial
  passes are not substituted for the completed frozen-source run.

These results precede the new citation-reference implementation and must not be
represented as final-source acceptance for that change.

## Real-provider attempts

Evidence directory: `output/testing/synthetic-ai-campaign-20260917/`.
Model: `gpt-4.1-mini-2025-04-14`. Total cap: USD 10. Initial uncertain carry: USD 0.8460608.

| Attempt | Result | Input / output tokens | Meaning |
| --- | --- | --- | --- |
| assess-assess-corrected-1 | passed | 1149 / 112 | One grounded proposal, exact target, no rejected mappings |
| studio-pdd-corrected-1 | failed | 3306 / 868 | Strict completion validation rejected output |
| studio-pdd-diagnostic-2 | failed | 3306 / 868 | Five exact sections/titles, unique bodies, exact coverage; canonical citations mismatched |

Subsequent immutable attempts `anchor-refs-3`, `content-review-4`, `semantic-5`
and `semantic-oracle-6` pass strict template/citation validation but expose semantic
or campaign-oracle failures. Attempt 4 weakened the no-payment prohibition and
added compliance wording. Attempt 5 preserved the unconditional prohibition; its
original scope-phrase-only oracle was too narrow. Attempt 6 accepts that equivalent
scope statement but rejects the actual AP analyst to API analyst change.
Conservative campaign charge through attempt 6: USD 0.8613748; provider invoice
not independently verified. Reports may retain bounded sanitized synthetic draft
sections for human inspection, never raw provider envelopes, credentials or headers.
Architecture and security review conditionally approved a Studio-only readable
JSON-string frame for verification; encoding causation is not established.

## Final frozen-source verification and retained blocker

Final canonical source digest:
`9301b44630a431a05d3da14074bba4ac3da73ba9262589a305ffea130983b041`.

- Feature 10/10: `output/assess-import/validation/feature-5f9934f3-74bd-4016-b2b4-6362539d35a6/manifest.json`.
- Regression 1/1 aggregate: `output/assess-import/validation/regression-2e00e74c-b9ca-46ba-9da6-9593339d2011/manifest.json`.
- Desktop/Pixel browser 32/32: `output/assess-import/validation/browser-2c2d5909-32dd-4dfc-90dc-c1be68792882/manifest.json`.
- Studio focused contract: 66 assertion markers, three isolated suites passed.
- Budget/fixture command: 13/13 passed. Shared-gateway hostile JSON framing,
  exact non-Studio compatibility and pre-effect authorization substitutions passed.
- Application and Edge typechecks, workflow YAML, AI boundary and secret hygiene passed.
- Scoring regression passed in an isolated directory. Direct scoring-law CLI rejected
  inherited environment; the unchanged checker passed with sanitized environment and
  exact canonical hash `c06bd2ddab219755d13d45ee55793b2245da52e2e7ee1dc82cb0fb5d2d326c90`.
- Dependency audit found zero vulnerabilities. Browser gate built the current app.
- Independent read-only security review found no blocker in the bounded framing diff;
  semantic fidelity remained explicitly inconclusive before the live retest.

Final immutable attempt `studio-pdd-readable-7` failed: four sections versus five
required, although emitted anchors were canonical. Usage: 1877 input / 561 output
tokens. Provider/runtime source digest:
`c00ff9bf509bfc6f7d44e7056dec857c155d7742c35400295b42d1639b71b14b`.
Campaign ledger has eight new attempts; total conservative charge including the
earlier carry is **USD 0.8630232 / USD 10**. No further paid calls are running.
Provider invoice is unverified. No invalid draft was accepted or approved.

At that intermediate boundary, the blocker was reliable template completeness/semantic fidelity.
The next correction was an OpenAI schema-enforced structured-output
contract with exact token-reservation accounting and adapter tests, preserving all
post-response provenance and semantic checks. Its subsequent implementation follows.

## Subsequent completed component correction

The above failure triggered the in-scope OpenAI Studio structured-output correction.
It now sends a bounded strict JSON schema, reserves its full serialized overhead,
and retains all exact post-response validators. The scope oracle was extracted and
tested for equivalent unconditional prohibitions and document-level summary content;
AP-to-API corruption, lost threshold, invented compliance and conditional permissions
still fail. Earlier failed reports were not rewritten or relabelled.

Final real-provider source digest:
`1de0e639feffa5662cf2973a670352036b87b225f1ddd622e3a2d90778811dfc`.

| Immutable attempt | Result | Input / output tokens |
| --- | --- | --- |
| studio-pdd-strict-schema-8 | failed original narrow scope oracle; five sections/citations valid | 2079 / 435 |
| studio-pdd-final-oracle-9 | passed all fixture checks | 2079 / 382 |
| studio-brd-strict-final-1 | passed all fixture checks | 2086 / 532 |
| studio-frd-strict-final-1 | passed all fixture checks | 2090 / 503 |

The final successful draft sections and summaries are retained in their sanitized
reports under `output/testing/synthetic-ai-campaign-20260917/`. They preserve the
AP analyst/finance manager roles, USD 5000 threshold and payment-execution exclusion.
BRD risks include generated analysis and still require human review; these drafts
are not approved documents. The governed SDD path does not exist.

Current campaign: 12 new ledger attempts, **USD 0.86932 / USD 10** conservative charge
including the earlier carry; new measured usage costs USD 0.0232592 at the verified
rates. Provider invoice remains unverified. No further paid calls are running.
Budget/fixture/oracle tests pass 15/15; Studio focused markers pass 67/67; shared
gateway schema serialization, reservation and pre-effect rejection tests pass.
Final-source canonical digest:
`213f3337e8ed1ad11087c0235507c14d583dd682d67a79aa17c5e2514e4a5499`.

- Feature 10/10: `output/assess-import/validation/feature-79ebf0ce-01ee-405f-811d-acb9b7a651c6/manifest.json`.
- Regression 1/1 aggregate: `output/assess-import/validation/regression-66bc8b10-dd86-4f03-a7ea-6a4070cad385/manifest.json`.
- Browser 32/32, zero skipped/flaky/unexpected:
  `output/assess-import/validation/browser-7e45d322-0e2b-40dc-b0be-ba3733d2c415/manifest.json` and
  `output/playwright/assess-import/a3b8aec97ec1f5a236e48bd8/results.json`.
- Final application/Edge typechecks, workflow YAML, AI boundary and secret hygiene
  passed; static forbidden findings are zero. Browser gate rebuilt the app.
- Independent final schema/security review found no source-security blocker in
  the canonical path. It explicitly retained the limitation that the generic internal
  gateway accepts a bounded schema from an already-authorized OpenAI Studio caller;
  the current canonical builder, not every conceivable future caller, owns exact
  output constraints. General semantic fidelity remains inconclusive.
- Final `git diff --check` passed. No commit, push, deployment, live database change,
  document approval or handoff was performed. Unrelated local state was preserved.

This completes the local correction/component-verification boundary, not the full
screen-by-screen hosted AI campaign. Prior source hashes above remain historical
attempts rather than substitute proof for this final source.

## Pending / not run

Citation-reference tests and final live PDD/BRD/FRD fixture checks passed as recorded
above. This governed path's canonical artifact inventory is
BRD/FRD/PDD; SDD is not supported here. Hosted field-by-field AI integration,
approval/handoff, full workflow movement, human acceptance and deployment remain
not run. No new database migration was introduced, so no new migration-chain
execution is claimed. The bounded final framing security review completed, but
this is not a full-platform security certification or a successful AI campaign.
