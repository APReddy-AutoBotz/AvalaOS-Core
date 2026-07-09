# Post-M5.7 Server-Side Export Storage and Signed URL Guard Hardening Implementation Gate

Reference: `docs/00_SOURCE_OF_TRUTH.md`.

## Purpose

This milestone hardens export, storage-object, and signed URL helper boundaries after PR #203. PR #203 introduced central artifact export policy decisions and UI-level guards. This gate adds source-level defense in depth at the lower helper and Edge-client call boundaries so export/download/storage/signed URL behavior fails closed unless an explicit allowed artifact decision is supplied.

This is product-grade source hardening only. It is not browser evidence, export evidence, storage proof, signed URL proof, hosted proof, DB/RLS proof, or readiness evidence.

## Controller and Subagent Model

The main Codex controller owns the implementation, final decisions, consolidation, file ownership, branch, commit, push, and draft PR. Subagents produced findings only. No subagent committed, pushed, opened a PR, approved readiness, executed runtime/browser/database/deployment/export/provider workflows, or produced prohibited artifacts.

## Static Inventory Summary

The controller consolidated nine findings-only workstreams:

| Workstream | Consolidated finding | Controller disposition |
| --- | --- | --- |
| Export Helper Inventory | Local helper, Edge export, and signed URL helper boundaries still had direct side-effect paths behind caller guards. | Added helper-level assertions before Blob/object URL, Edge export, and signed URL operations. |
| Edge Export Client | `exportDocument`, `exportDecisionPack`, and `createSignedDownloadUrl` needed explicit artifact-decision enforcement before invoking Supabase Edge/storage clients. | Added fail-closed Edge-client guard requirements. |
| Local Export Helper | Document, assessment, and delivery-pack helpers needed their own policy assertion before creating downloadable output. | Added helper-level export assertions before render/download content generation. |
| Storage and Signed URL | Direct storage and signed URL helpers must not execute without explicit allowed storage/signed URL authority. | Added signed URL helper guard; server-side Supabase function changes remain unapproved. |
| Artifact Policy Integration | Existing central policy should remain the authority, with helper-level checks as enforcement. | Extended policy service with execution guard helpers and mismatch reasons. |
| UI and Caller Compatibility | Workspace and Guided Assessment callers already resolve policy decisions and should pass them into lower helpers. | Passed explicit artifact decisions into helper/Edge calls and preserved disabled UI behavior. |
| Audit and Evidence | Guard audit payloads must avoid raw storage paths, signed URLs, bucket names, and unsafe refs. | Added sanitized execution guard and attempt audit envelopes. |
| Test/Quality | Focused tests should prove fail-closed helper behavior without generating files, storage objects, or signed URLs. | Added focused helper guard tests and preserved existing focused policy tests. |
| Proof/Boundary | Copy must not imply export readiness, browser proof, storage proof, or runtime proof. | Preserved non-readiness language and corrected stale copy. |

## Implementation Scope

Implemented source changes:

- Central artifact policy execution guard helpers now require an explicit allowed decision and check action, artifact type, and output compatibility before export, storage-object, or signed URL helpers can proceed.
- Local document, assessment, and delivery-pack export helpers assert policy authority before generating downloadable content or initiating local download behavior.
- Edge export client methods assert policy authority before invoking export Edge functions or creating signed URLs.
- Workspace and Guided Assessment callers pass the resolved artifact decisions to helper boundaries.
- Guard audit envelopes sanitize identifiers and refs and exclude raw storage paths, bucket names, signed URLs, public URLs, and object paths.
- Focused tests cover missing decisions, pending decisions, action mismatch, artifact type mismatch, output mismatch, signed URL guard behavior, and sanitized audit envelopes.

## Non-Goals

This milestone does not:

- Modify Supabase Edge functions, SQL, migrations, RLS policies, schema, hosted deployment, provider execution, or runtime infrastructure.
- Generate export/PDF/download/Markdown/JSON/ZIP artifacts.
- Create storage objects, signed URLs, public URLs, object URLs as proof, or external share links.
- Launch a browser, start a dev server, run browser automation, or capture screenshots.
- Execute DB/RLS/artifact/schema checks, Supabase commands, Docker, deployment validation, approval workflows, workflow/status changes, provider/classifier logic, or live/local real assertions.
- Mark any readiness domain complete.

## Acceptance Criteria

- Helper-level export/storage/signed URL guard functions fail closed without an explicit allowed artifact policy decision.
- Edge export and signed URL client methods enforce the helper guard before Supabase client calls.
- Local export/download helpers enforce the helper guard before local artifact/download generation behavior.
- UI callers pass central artifact policy decisions into lower helper boundaries.
- Audit envelopes remain sanitized and do not include raw storage/signed URL details.
- Focused tests cover helper-level fail-closed behavior and audit sanitization without generating artifacts.
- Roadmap, readiness gates, and task ledger preserve source-level/non-readiness boundaries.

## Recommended Next Safe Path

The safe next path is another source-only or static-inspection gate that closes remaining unapproved gaps before any runtime proof:

1. Server-side Edge Function Export Authority Refactor Gate: move equivalent fail-closed checks into Supabase Edge functions without executing them.
2. Export Artifact Runtime Proof AP Decision Gate: define exact AP approval text, run count, stop conditions, prohibited outputs, and evidence boundaries before any export/storage/signed URL execution.
3. Storage Object and Signed URL Runtime Evidence Gate: only after AP approval, validate storage/signed URL behavior without exposing raw paths or signed links.

No next execution milestone is started by this gate.