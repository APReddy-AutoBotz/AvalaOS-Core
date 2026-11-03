# Process evidence Studio: SDD and governed flows

## Implemented boundary

Studio now treats SDD as the fourth canonical governed document type. The active `studio-sdd-1` system template generates distinct architecture, component, interface, data, security, operations, design-decision, and open-question/proposal sections. It also generates the As-Is and To-Be Mermaid flows in that same provider call.

Both flow sections remain canonical structured document content. They use the existing source-anchor contract, provider budget and route controls, immutable version chain, independent author/reviewer/approver separation, and private rendition path. The browser renders a strict sanitized preview and edits the Mermaid source through the normal structured editor.

Mermaid source editing is text editing with a graphical preview; it is not a graphical diagram editor. Canonical schema-v2 SDD PDF renditions render the validated As-Is and To-Be syntax as bounded vector nodes, decisions, arrows and branch labels. Cycle/back transitions and transitions crossing a nine-node page group are retained in explicit full-label transition lists rather than silently dropped. Existing `studio-artifact-1` PDF bytes still use the frozen legacy serializer under `studio-pdf-1`; its regression fixture remains fixed at SHA-256 `2e1fa0766956d060e057bb4af85d9304e80b42560b6a05e9bfaac1df68d7fff7`.

When the document's source binding differs from the aggregate's current package, or the package projection is stale, the editor displays **Needs review**. The author chooses the affected sections from the outline. The governed generation command binds those section IDs and the exact artifact, current head, approved head, package and template before provider work. Its validated full response remains a staged candidate. During finalization, the database atomically replaces only the selected sections in the exact expected parent, appends one immutable draft, and records per-section source-package and origin-version attribution. Unselected authored sections, their attribution, every approved revision and the current approved head remain preserved. Missing or duplicate selected sections, a changed head, a changed binding, or an idempotency substitution fails closed without a partially replaced current document.

Refresh selection does not lock ordinary manual editing. If any section is dirty when an update is requested, a keyboard-contained confirmation requires Save changes, explicit discard, or cancel. Save completes and reloads the durable revision before the selected generation request is issued; discard restores the current durable document before generation. Focus returns to the update control after cancel.

Changed inputs are adopted through an explicit ordinary UI choice. Direct/manual package creation and independently approved Assess handoff consumption carry the exact displayed artifact, predecessor package/version, aggregate version, current head and approved head. The server locks and revalidates those selectors, inserts an immutable successor package with `replaces_source_package_id`, and advances only the aggregate package binding/version. It does not rewrite either document head. Cross-package selected refresh validates refreshed anchors against the successor package and carried anchors against each section's retained predecessor binding; the resulting coverage is the exact union of anchors in the committed revision.

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

Focused source-contract tests cover provider instructions, valid Mermaid flow output with one edge per line, unsafe/ambiguous flow rejection, legacy document readability, strict decoding, selected-section command bounds, exact successor-package selectors, compatibility command shape, and removal of browser-side merge authority. The full migration chain and populated legacy Studio/Delivery/Monitor fixture passed on disposable loopback PostgreSQL 16. On disposable PostgreSQL 16, STUDIO-REFRESH-001 exercised the selected refresh, carried source, subsequent human edit, reload and independent approval. STUDIO-REFRESH-002 and STUDIO-REFRESH-003 exercised source adoption and a second independently approved Assess handoff onto the same document. The provider run requires a separately bound workspace and permit. Mocked and deterministic tests are not evidence that a real provider generated all four document types.

The focused SDD/PDF cross-layer proof ran transactionally against the disposable nonproduction database at migration tip `20261103104435`. The database issued the rendition and download claims; the production Edge renderer/saga created one object and one available rendition; the database issued and replayed the broker download claim; exact-byte retrieval ran twice; and the transaction rolled back after the governed deletion/tombstone assertions. The retained broker bytes are a synthetic, provider-free sample, not a claim of real document generation: `output/pdf/synthetic-sdd-db-cross-layer.pdf`, 4,339 bytes, SHA-256 `92f36ceb8ba54d42854dc0acfeaf7ab8d7aaca7a81a7276bfb0874e3c0667f19`. Both rendered pages were visually inspected. The ordinary `StudioArtifactRenditions` UI/client contract points Generate PDF and Download PDF at the same signed-in server command/download routes, but this focused proof did not run that UI against a hosted signed-in environment.

## Review checks for the stacked change

The same nonproduction pull-request checks used for main also run when the base is either milestone branch. Only the pull-request branch filters change. Hosted actions, push triggers, manual activation, protected environments and the established actor separation retain their existing controls.

Executed locally: the 108-migration PostgreSQL 16 source replay and authenticated exercise replay passed on the isolated cluster. The ordinary structured editor persisted edits to SDD text and both flows on Desktop Chrome and Pixel 7 with fixture transport. The refresh selector, switching from BRD to PDD, and exact-document reload also passed on both devices. BRD, PDD and FRD keep their distinct templates. Fresh provider output for each of BRD, PDD, FRD and SDD is still unverified.

## Safe rollback

Set Studio runtime control to read-only and disable provider execution. Keep all SDD artifacts, predecessor/successor source packages, staged candidates, refresh bindings, per-section source bindings and revisions readable. Do not delete or rewrite approved/history rows. A forward fix may hide changed-source adoption and disable new selected refresh while retaining the prior full-generation path, or supersede `studio-sdd-1`; it must not update or delete an immutable package/template or any approved artifact history.

If schema-v2 PDF diagram rendering must be withdrawn, block new SDD PDF rendition requests while leaving committed rendition rows and exact downloads readable. Do not fall back to a different serializer under an existing durable renderer binding. The schema-1 `studio-pdf-1` serializer and frozen hash remain unchanged.
