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

## Bounded acceptance run after implementation

Use an isolated nonproduction workspace and synthetic files. Obtain a server-authorized extraction route and Studio generation route for the exact candidate, model and spending ceiling. Preflight the existing reservation and replay controls and stop on an unknown outcome. Do not transfer an earlier exercise's allowance. Keep current actor timeouts. Allocate at most two Assess extraction requests (one per case) and one generation per selected document type, plus separate flow/proposal calls only if the implemented design requires them and the run budget explicitly includes them. Never auto-retry a billed or ambiguous operation.

Main case input: a support transcript says a coordinator reads the emailed request, records its purpose and sends unusual requests to a reviewer. The SOP says the reviewer can ask for evidence or approve. The flowchart branches on whether evidence is complete. In the intake UI correct the responsible role from coordinator to request owner and record the reason. Verify the correction survives reload, retains its source distinction, and reaches assessment and document inputs. Require an explicit question about interface availability. No source specifies a particular endpoint, cost or ROI.

Contrast input: an approved internal service exposes an authorized read-only lookup of a submitted reference. The policy has one exact match rule. Valid references route to the existing queue and failures go to the operator. Record that rule and interface evidence in the draft and inspect the per-step recommendation. Verify that unresolved evidence changes the explanation. Do not establish provider proof using prewritten recommendations.

For the main case generate the BRD and one technical document, edit a section and a diagram node, reload and finalize with independent actors. Check the other document types through focused generation. Change a draft fact, verify the approved revision survives and choose which dependent draft to update. Edit and select a subset of proposals, confirm, retry and verify exactly one board record for each selected item. Change a description and status, reopen and inspect requirement links. Record sanitized output summaries and exact candidate identity.

## Rollback and proof limits

Revert the candidate's intake and presentation changes together with their coupled checks. Preserve original source bytes, source selectors, prior immutable drafts, approvals and board records. Existing read authority, action-specific checks and idempotency continue to govern every mutation. Hosted inspection, provider activation, deployment and merge are outside this repository change.
