# Process evidence Studio: SDD and governed flows

## Implemented boundary

Studio now treats SDD as the fourth canonical governed document type. The active `studio-sdd-1` system template generates distinct architecture, component, interface, data, security, operations, design-decision, and open-question/proposal sections. It also generates the As-Is and To-Be Mermaid flows in that same provider call.

Both flow sections remain canonical structured document content. They use the existing source-anchor contract, provider budget and route controls, immutable version chain, independent author/reviewer/approver separation, and private rendition path. The browser renders a strict sanitized preview and edits the Mermaid source through the normal structured editor.

When the exact source package is stale, the editor displays **Needs review**. The author chooses the affected sections from the outline and commits a new immutable revision. Sections the author does not edit, all approved revisions, source anchors, and the current approved head remain preserved.

Older BRD, FRD, PDD, SDD, and flow-less `studio-artifact-1` content remains readable. No existing system template is updated or deleted.

## Acceptance checks

- The migration chain admits `sdd` at Studio, rendition, handoff, Delivery-lineage, and strict decoding boundaries without widening unrelated enums.
- `studio-sdd-1` is inserted without changing existing immutable system templates.
- Generated flow bodies must begin with `flowchart TD` or `flowchart LR`, contain an edge, and reject directives, click actions, URLs, HTML scripting/style containers, and data or JavaScript schemes.
- Provider instructions prohibit invented connections and require unknown transitions to remain explicit.
- SDD instructions retain missing technical facts as questions or proposals and prohibit invented API, interface, security, topology, service-level, cost, or readiness claims.
- Source-package changes project a needs-review state while preserving authored and approved history.

## Verification and proof boundary

Focused source-contract tests cover provider instructions, valid Mermaid flow output with one edge per line, unsafe/ambiguous flow rejection, legacy document readability, strict decoding, and TypeScript compilation. Applying the full migration chain and the authorized nonproduction provider run remain controller-owned merge gates. Mocked and deterministic tests are not evidence that a real provider generated all four document types.

## Safe rollback

Set Studio runtime control to read-only and disable provider execution. Keep all SDD artifacts and revisions readable. A later forward migration may supersede `studio-sdd-1`; it must not update or delete this immutable template or any approved artifact history.
