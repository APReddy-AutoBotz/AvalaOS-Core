# Process evidence Studio: SDD and governed flows

## Implemented boundary

Studio now treats SDD as the fourth canonical governed document type. The active `studio-sdd-1` system template generates distinct architecture, component, interface, data, security, operations, design-decision, and open-question/proposal sections. It also generates the As-Is and To-Be Mermaid flows in that same provider call.

Both flow sections remain canonical structured document content. They use the existing source-anchor contract, provider budget and route controls, immutable version chain, independent author/reviewer/approver separation, and private rendition path. The browser renders a strict sanitized preview and edits the Mermaid source through the normal structured editor.

When the document's source binding differs from the aggregate's current package, or the package projection is stale, the editor displays **Needs review**. The author chooses the affected sections from the outline. The governed generation command binds those section IDs and the exact artifact, current head, approved head, package and template before provider work. Its validated full response remains a staged candidate. During finalization, the database atomically replaces only the selected sections in the exact expected parent, appends one immutable draft, and records per-section source-package and origin-version attribution. Unselected authored sections, their attribution, every approved revision and the current approved head remain preserved. Missing or duplicate selected sections, a changed head, a changed binding, or an idempotency substitution fails closed without a partially replaced current document.

Provider-free controlled-human generation does not support selected refresh and fails before changing content. Full-generation clients may omit the new selector and retain the previous command shape. Legacy sections using either `id` or `key` remain compatible; content without a stable section identity remains readable and does not become selectable refresh authority.

Older BRD, FRD, PDD, SDD, and flow-less `studio-artifact-1` content remains readable. No existing system template is updated or deleted.

## Acceptance checks

- The migration chain admits `sdd` at Studio, rendition, handoff, Delivery-lineage, and strict decoding boundaries without widening unrelated enums.
- `studio-sdd-1` is inserted without changing existing immutable system templates.
- Generated flow bodies must begin with `flowchart TD` or `flowchart LR`, contain an edge, and reject directives, click actions, URLs, HTML scripting/style containers, and data or JavaScript schemes.
- Provider instructions prohibit invented connections and require unknown transitions to remain explicit.
- SDD instructions retain missing technical facts as questions or proposals and prohibit invented API, interface, security, topology, service-level, cost, or readiness claims.
- Source-package changes project a needs-review state while preserving authored and approved history.
- Selected refresh uses one generation attempt and one final artifact version; the browser does not generate a full head and then attempt a second corrective save.
- Exact request replay returns the same attempt/version, while changed section selection under the same idempotency key is rejected.

## Verification and proof boundary

Focused source-contract tests cover provider instructions, valid Mermaid flow output with one edge per line, unsafe/ambiguous flow rejection, legacy document readability, strict decoding, selected-section command bounds, compatibility command shape, and removal of browser-side merge authority. The full migration chain and populated legacy Studio/Delivery/Monitor fixture passed on disposable loopback PostgreSQL 16. The atomic selective-finalization scenario, required merge gates and authorized nonproduction provider run remain separately reported controller-owned gates. Mocked and deterministic tests are not evidence that a real provider generated all four document types.

## Review checks for the stacked change

The same nonproduction pull-request checks used for main also run when the base is either milestone branch. Only the pull-request branch filters change. Hosted actions, push triggers, manual activation, protected environments and the established actor separation retain their existing controls.

Executed locally: the 108-migration PostgreSQL 16 source replay and authenticated exercise replay passed on the isolated cluster. The ordinary structured editor persisted edits to SDD text and both flows on Desktop Chrome and Pixel 7 with fixture transport. BRD, PDD and FRD keep their distinct templates. Fresh provider output for each of BRD, PDD, FRD and SDD is still unverified.

## Safe rollback

Set Studio runtime control to read-only and disable provider execution. Keep all SDD artifacts, staged candidates, refresh bindings, per-section source bindings and revisions readable. Do not delete or rewrite approved/history rows. A forward fix may disable new selected refresh while retaining the prior full-generation path, or supersede `studio-sdd-1`; it must not update or delete this immutable template or any approved artifact history.
