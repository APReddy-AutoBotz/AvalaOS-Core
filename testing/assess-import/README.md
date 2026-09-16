# Native Assess supporting-document verification

This directory contains synthetic-only inputs and a repeatable local verification guide. It does not contain credentials, customer documents, provider keys or production evidence. The feature is default-off and is not activated in the existing exploratory preview by these repository changes.

## Intended user journey

1. In the process catalog, open **View**, choose **New assessment (V2)** if needed, and save its draft. Existing manual assessment remains available without importing documents.
2. Use **Supporting documents** inside that case to select one or more documents. The queue is bounded to 20 files and 12 MB total; it exists only in memory until the user stores the sources.
3. Use **Store private source** for each queued file. Select the exact stored source versions and **Commit source set**. Select that Assess-owned set, **Lock analysis bundle**, and select the resulting **Locked source bundle**. Assess and Studio can use different source sets; uploading here does not hand documents to Studio automatically.
4. Use **Analyze selected documents**. An enabled server-side workspace route and governed provider budget are required. Uploading successfully does not mean analysis ran. Disabled features, missing routes, oversized inputs and insufficient permissions must show explicit messages.
5. Review suggestions with their source excerpts/coordinates, destination fields, existing values and proposed values. Accept, edit with a rationale, or reject each suggestion. Unsupported information remains unknown or evidence-only.
6. Select the reviewed suggestions and preview them. Resolve conflicting source suggestions and any change to a manual value explicitly, with a rationale: retain the manual value, select a candidate, or author a supported value. Check each displayed **Final resolved value** before applying. A missing, incomplete, stale or unresolved preview must not be applicable.
7. Use **Apply reviewed batch** once, then reload the case. The result is a new immutable draft version, not an approval, verified evidence, direct write of a score or downstream handoff. Later deterministic evaluation can reflect the reviewed inputs; its formulas and gates are unchanged.
8. If new process steps/applications were added, another analysis of the same retained sources can suggest facts and relationships for those newly created entities. Missing risk facts must not be invented.

Changes of user, organization, workspace, authority version, process, case or case head invalidate pending UI state. Unsaved local edits must be saved before preview/apply. The client retries a lost response within the same invocation using the original request identity. If the outcome remains uncertain, mutations stay disabled until an explicit authoritative reload. Do not assume success or start a new paid analysis to work around uncertainty.

## Inputs and limits

Supported: plain text, Markdown, text transcripts, CSV, DOCX main-document text, limited text-layer PDFs and bounded non-macro XLSX workbooks. OCR/scanned image PDFs, audio/video, old DOC/XLS, encrypted workbooks, macros, embedded/external data and formula calculation are outside this slice. Spreadsheet formulas and their cached results are excluded; hidden sheets are excluded with a warning; numeric dates are not inferred from cell formatting.

The fixtures here model a synthetic process transcript, SOP and tabular process information. XLSX files are generated from reviewed source in `tests/fixtures/assessImportSpreadsheets.ts`, avoiding opaque binary fixtures. All browser AI/transport responses are mocked and labelled as such. PostgreSQL tests apply real migrations to uniquely owned disposable databases.

## Local commands

Run from the repository root with Node 22 and installed dependencies:

```text
node scripts/runAssessImportValidation.mjs feature
node scripts/runAssessImportValidation.mjs postgres
node scripts/runAssessImportValidation.mjs regression
node scripts/runAssessImportValidation.mjs browser
node scripts/runAssessImportValidation.mjs static
```

The PostgreSQL group requires `ASSESS_DOCUMENT_MAPPING_POSTGRES_ADMIN_URL` to point to an explicitly owned, disposable PostgreSQL 16 server on loopback, with the `/postgres` admin database and an explicit port. Remote targets, alternate databases and routing query parameters are rejected. Never point it at a hosted or personal persistent database.

The five groups currently bind 22 reviewed npm commands. Manifests are retained in unique `output/assess-import/validation/<group>-<run-id>/` directories and include the exact effective source digest, canonical command, status and sanitized assertion summaries. A green command exit is not converted into an exact Test-ID PASS. Source changes during a command invalidate its result. Browser JSON/screenshots are retained separately under unique `output/playwright/assess-import/` runs.

Also run dependency audit, retained native Assess and transcript-review browser suites, the PR C provenance/evidence contracts and `git diff --check` as directed by the active plan. Results and failed attempts must be reported truthfully; skipped or mocked work is not live-provider or human acceptance.

## Boundaries after local completion

Local success does not deploy migrations/functions, enable a provider route, activate the preview feature, spend provider credits, complete human acceptance, authorize merge or establish production readiness. Those actions require their own approval and exact-environment verification. Rollback disables new document-mapping effects while preserving sources, lineage, receipts, reviews and committed draft history; manual Assess remains the fallback where independently enabled.
