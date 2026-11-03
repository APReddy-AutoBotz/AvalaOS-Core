# Process evidence to confirmed delivery work

## Acceptance and ownership

The process owner supplies fresh source files, corrects the proposed facts and reviews the recommendation. The document author edits selected outputs. Existing independent reviewers and approvers act on exact revisions. A Delivery user selects proposed work and confirms it onto the board. Acceptance ends after reopening an edited board item and following its requirement back to the finalized source. A second assessment must demonstrate a materially different recommendation.

One milestone has three review boundaries. Intake and Assess own reviewed facts and the deterministic decision. Studio owns revisioned documents and flows and explicit updates after source changes. Delivery owns proposal selection, idempotent import and ongoing board edits. Each boundary should carry its own behavior, tests and rollback. The first candidate addresses intake and Assess. No schema or score change is required for presentation alone.

## Map at main 88d06437

| Capability | Baseline and evidence |
| --- | --- |
| Intake and correction | Implemented for supported text and structured files. The production XLSX parser probe read two sheets and six cells. The existing browser exercise uploaded multiple files, edited a candidate, resolved conflict, applied and reopened using fixture transport. See AssessSupportingDocumentIntake and tests/browser/assessImport.spec.ts. |
| Current assessment and recommendation | Partial. Process-scoped discovery and immutable decisions exist. The normal page exposes separate engine choices. services/assessV2/evaluator.ts evaluates component fit per primitive, interactions and human controls. It needs a business-readable explanation and must distinguish missing evidence from an explicit decision against AI. |
| Flowchart intake | Missing a declared branch-aware format at baseline. Text storage alone provides no proof of branch extraction. |
| BRD | Canonical structured artifact with generated sections, edits and independent approval. Earlier real-provider component results and a prepared approved BRD exist. Fresh generation on this candidate is not run. |
| PDD | Canonical template. Fresh generation, process-specific content inspection and edit persistence on this candidate are not run. |
| FRD | Canonical template. Fresh generation and inspection of requirements, exceptions, acceptance criteria and traceability on this candidate are not run. |
| SDD | Missing from the canonical type union in studioArtifactTemplateContract. No fresh generation run. |
| Editable flows and downstream review | Partial. Legacy Mermaid display exists. Canonical generated and editable As-Is/To-Be revisions, retention of manual changes and explicit regeneration after source changes require implementation and verification. |
| Delivery proposals and board | Partial. StudioApprovedArtifactPublish accepts manually authored work. Board import supports item selection, server-side unique source indices and persistent task changes. Requirement-derived proposal generation and the full fresh-source confirmation journey remain open. |
| Fresh end-to-end proof | Blocked for provider execution. The accepted preview is provider-off. A diagnostic ping or synthetic approval replay cannot exercise extraction and generation. |

## Studio implementation candidate

The [Studio PR](process-evidence-studio-sdd-and-flows.md) adds SDD to the governed document types. Its canonical SDD includes the editable As-Is and To-Be flows in the same generation request. Real output quality for BRD, PDD, FRD and SDD must still be checked separately on the proposed run below.

## Bounded acceptance run after implementation

Use an isolated nonproduction workspace and synthetic files. Obtain a server-authorized extraction route and Studio generation route for the exact candidate, model and spending ceiling. Preflight the existing reservation and replay controls and stop on an unknown outcome. Do not transfer an earlier exercise's allowance. Keep current actor timeouts. Allocate at most two Assess extraction requests (one per case) and one generation per selected document type, plus separate flow/proposal calls only if the implemented design requires them and the run budget explicitly includes them. Never auto-retry a billed or ambiguous operation.

Main case input: a support transcript says a coordinator reads the emailed request, records its purpose and sends unusual requests to a reviewer. The SOP says the reviewer can ask for evidence or approve. The flowchart branches on whether evidence is complete. In the intake UI correct the responsible role from coordinator to request owner and record the reason. Verify the correction survives reload, retains its source distinction, and reaches assessment and document inputs. Require an explicit question about interface availability. No source specifies a particular endpoint, cost or ROI.

Contrast input: an approved internal service exposes an authorized read-only lookup of a submitted reference. The policy has one exact match rule. Valid references route to the existing queue and failures go to the operator. Record that rule and interface evidence in the draft and inspect the per-step recommendation. Verify that unresolved evidence changes the explanation. Do not establish provider proof using prewritten recommendations.

For the main case generate the BRD and one technical document, edit a section and a diagram node, reload and finalize with independent actors. Check the other document types through focused generation. Change a draft fact, verify the approved revision survives and choose which dependent draft to update. Edit and select a subset of proposals, confirm, retry and verify exactly one board record for each selected item. Change a description and status, reopen and inspect requirement links. Record sanitized output summaries and exact candidate identity.

## Rollback and proof limits

Revert the candidate's intake and presentation changes together with their coupled checks. Preserve original source bytes, source selectors, prior immutable drafts, approvals and board records. Existing read authority, action-specific checks and idempotency continue to govern every mutation. Hosted inspection, provider activation, deployment and merge are outside this repository change.

## First implementation boundary

Open the process, choose Open current assessment and start or resume the working draft. The source picker accepts the transcript, SOP and .mmd files under tests/fixtures/process-evidence. Read both labeled branches before storing. Compare source statements with the proposed facts, edit with a reason, resolve conflicts, apply and reopen. In a finalized assessment, inspect Process recommendation, the per-step alternatives and the separate governed review state. History and audit details retain engine and record identifiers. The reference-lookup file supplies the contrasting case for the later provider run.

Executed local checks include the production XLSX probe, locked scoring regression, Assess recommendation model and presentation checks, application and Edge typechecks, and PR 1D source boundaries. The baseline and implementation intake suites passed 32 Desktop/Pixel cases each with fixture transport. A separate two-viewport check selected three fresh source files and displayed both labeled flowchart outcomes and the return edge before analysis. The deterministic contrast selected a non-AI operating model with API, rules/workflow and human approval. Neither browser run submitted these sources to a real model.

The first wider PR 1D run passed 55 of 60. Four assertions across two viewports still expected old approval or audit copy and one desktop catalog check timed out during overlapping builds. All six rechecks passed across Desktop and Pixel after rebuilding serially and updating the selectors to inspect finalized status and the collapsed audit section. An independent broad synthetic acceptance run passed 68 of 69 and failed a simulated read-only logout check. Required exact-head GitHub jobs and their current results are linked from the PR. The local Linux Docker engine was unavailable. The complete fresh-to-board journey and all four fresh document-generation runs remain not run.

The canonical disposable AP journey and Core quality gates passed in CI on 3cf0f122. The local synthetic read-only fixture also failed at the identical request-inventory assertion on the unchanged main tree. Follow-up verification binds the five Edge closures which now import the flowchart parser, checks the exact process heading when a restricted reviewer opens a record, and exercises the standard legacy entry where the current-assessment capability is unavailable. The loopback multipart probe verified 252 closure entries, including rejection of stale, missing and extra source dependencies.
## Reviewed Assess corrections and acceptance boundaries

The normal process summary should reflect the process's current case and decision. Earlier assessments and their scores belong in History. A non-AI design can be sufficient even when an AI alternative is eligible. Interface availability is assessed for each named read/write operation. A prohibited write must stay prohibited when a read on the same step is ready.

The bounded Mermaid format accepts one node declaration or directed edge per line. Separate chained arrows or semicolon-separated statements onto distinct source lines before upload. A final semicolon on one statement is allowed. The intake preview and the server parser reject a compound line before returning any partial graph. Image and PDF flowchart interpretation, including branches inferred from graphical layout or pixels, remains outstanding. Extracting a PDF text layer does not establish that capability.

## Proposed nonproduction generation run — approval pending

| Binding | Proposed value |
| --- | --- |
| Workspace | One isolated synthetic workspace with the logical name `process-evidence-acceptance-2026-11-03`. Bind its actual tenant/workspace and a single nonproduction server target privately before the run. This proposal does not assert that the workspace exists. |
| UI and inputs | Pin the integrated candidate commit. Upload `support-meeting.txt`, `request-sop.md` and `request-review.mmd` together. Start the separate contrast from `reference-lookup.txt`. All four inputs are under `tests/fixtures/process-evidence/`. |
| Provider | First-party OpenAI, pinned model `gpt-4.1-mini-2025-04-14`, via the existing server-held provider configuration and shared gateway. Verify model availability, reservation and rate configuration before any egress. |
| Validation | At most **1** outbound provider effect from `/functions/v1/enterprise-provider-lifecycle`, command `provider.validate`. Omit if a valid authorized validation receipt already applies. |
| Assess | At most **2** outbound effects from `/functions/v1/enterprise-intelligence-command`, command `assess.document-map.analyze`, operation `assess.evidence.extract`. One exact source bundle for each case. |
| Studio | At most **5** outbound effects from `/functions/v1/studio-artifact-command`, command `studio.generation.request`, operation `studio.document.generate`. Generate BRD, PDD, FRD and SDD once each, including the flows in the document run. Reserve one optional user-selected refresh after changing an input. |
| Delivery | **0** provider effects. Generate proposals from the actual approved requirement content. The Delivery user can edit, select and confirm through the existing server-authorized board path. |
| Aggregate ceiling | **8 provider calls total and USD 4.00 total**, whichever limit binds first. A failed or ambiguous attempt counts. No automatic paid retry, activation, or transfer from a previous campaign. Enforce the cap in the server ledger before permitting egress. If the configured worst-case reservations do not fit, stop before the first call. |

Use separate source author, reviewer, final approver and eligible Delivery actor sessions. No source changes may silently replace approved content. For the main case, correct the responsible role with a rationale, reopen the draft, finalize the assessment and complete the actual Govern/Studio handoff. Generate and inspect each selected output for source coverage and open technical questions. Save a text change and a flow change, reload, and run applicable independent approvals on the exact revision. Exercise a source change and selected update without overwriting the approved version. Review requirement-linked proposals and confirm a proper subset. Reload the normal board, follow one requirement link, update a description and allowed status, and check replay creates no duplicate. Capture only sanitized business outcomes, counts and status. The contrast ends at the assessment recommendation.

The outstanding authorization is the privately bound workspace/target, enabled server routes for the named operations and model, authorized human sessions, and the fresh hard campaign limits above. The existing acceptance preview is provider-off. A saved credential or an unused balance in a previous campaign grants no authority to send these inputs.
