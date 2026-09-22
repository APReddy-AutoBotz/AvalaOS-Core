# Studio enabled-state contrast correction — active evidence

## Boundary and retained exact-head failure

Baseline: `c08f42cc9bda1fa9903de56ebdb82a1fc7faec8c`, existing Draft PR #264.
The active AI-output plan owns this bounded implementation and rollback; this is
not an evidence-only PR or a rewrite of closed results. The immutable campaign
expired on 2026-09-19. Preserve USD 1.3407792 conservative charge under the original
USD 10 cap. No paid call, manual hosted-backend mutation, merge or readiness claim
is authorized by this correction. The ordinary preview build was triggered by
the previously authorized push.

At c08, 17 applicable workflows passed; retained PR C `35713213779/1` failed and
the separate hosted-live workflow was intentionally skipped. Command 48 was
`studio-private-browser` / `npm run test:browser:studio-private-artifacts`, exit 1.
The preceding 47 commands passed; the remaining 33 did not run. Its actual browser
result was 51 passed, one failed: Pixel 7 private-rendition serious/critical Axe.
Enabled Markdown/PDF buttons had foreground #7d818c against white, contrast 3.89:1
instead of required 4.5:1. Expected negative database errors were not the cause.

Failed artifact `10688787714`, 501,405 bytes, archive SHA-256
`29ce92db2c142baa9cc12f6be3162f6b0b2ed0924b4f786e1550c689570ab1c6`
is retained under `output/testing/domain-budget-20260922/ci/35713213779-1/`.
Archive integrity and exact manifest identity were checked; no PASS verification
or promotion was performed. Working-tree digest was
`fe7f0451eaf13b1943d0ff9f1d26aa057f3cc0ed575f07dda62ee96b0af91435`.

## Independently verified c08 companion evidence

- Native Assess `35713213727/1`, artifact `10688640611`, SHA-256
  `0a64df30af41a2f2e06e422cd762a53004c8a64af27f167c1e8041ec0e6eb7d8`:
  25 canonical commands, 1,107 source hashes, 14 explicit SQL budget assertions,
  32 browser results, nine rejected provenance substitutions.
- Preview QA `35713213761/1`: 12 boundary cases, 38 Sandbox passes with 30 declared
  skips, two navigation cases, 12 rejected provenance substitutions. Its three
  independently checked artifact archives are retained beside
  `output/testing/domain-budget-20260922/ci/35713213761-1/preview-verification.json`.
  All 28 full-page contrast-incomplete records remain `unresolved_manual`.

These results bind only c08. Neither the 28 manual items nor earlier intermittent
rejected font requests are resolved by unrelated later green invocations.

## Diagnosis and review transition

Root traced async private-projection loading to ready through unchanged native
download guards. `.btn-ghost` animates all properties for 180 ms; removing native
disablement removes `disabled:opacity-50` but animates opacity to one. A read-only
production-CSS browser experiment captured an actual opacity CSSTransition,
enabled opacity 0.5 and Axe contrast 3.41:1 at its start, with zero network requests.
It explains the mechanism; it is not yet actual held-projection component proof.
Quality and security reviewers closed before implementation writes. No security
candidate or authorization change was found in the bounded correction.

## Correction and verification

The exact-path pre-fix regression rejected the old CSS on both Desktop and Pixel:
the actual initially disabled Markdown download became enabled at opacity 0.5.
Retained attempt: `output/testing/domain-budget-20260922/studio-private-download-opacity-before-css/`.
An earlier actual Generate-button reproduction is retained separately and is not
substituted for this download-path proof. The corrected exact-path focused run
passed 2/2, with immediate and first-frame opacity one, zero opacity transitions,
same-element identity through label change and unchanged scoped Axe.

The full canonical `npm run test:browser:studio-private-artifacts` then passed
54/54, 27 Desktop and 27 Pixel, zero failed/skipped. This includes both original
serious/critical Axe cases and the new transition regressions. Only the shared
ghost-button transition changes: background-color, border-color and color keep
their 180 ms ease behavior. Permissions, disabled styling and all failure guards
are unchanged. No test injects CSS, forces reduced motion, waits out the fade,
adds retries or weakens contrast checks.

The first client-contract execution passed its 30-assertion client subcommand but
correctly failed the new CSS mutation test: a generic text replacement could
alter an earlier unrelated rule rather than the ghost-button block. The test
mutations are narrowed to the exact block, require actual byte changes and handle
Windows line endings. This failed test-authoring attempt is retained, not called
a product or browser regression. The full corrected client command passed all
three subcommands (30 client, 46 rendition UI and 16 workspace assertions reported),
including actual-rule rejection of all/opacity/omitted-property mutants.

Additional executed checks: preview-profile contracts 78/78, retained PR C
evidence contracts 64/64, the 108-branch catalog/inventory/source-provenance and
oracle adversaries, and the canonical late-HTTP/WebSocket observer check passed.
The latter was first invoked with the wrong generic TypeScript runner and failed
to find its emitted module; the package-owned
`npm run test:acceptance:network-observer` used the correct existing runner and
passed. No source change was made for that invocation error.

The first broader Sandbox invocation, `1e040e6bfda4896c0e1bdfacdeaa1ba8`, encountered
`browserType.launch: spawn EPERM` in the restricted execution environment before
application assertions. It remains failed/incomplete evidence, not product proof.
The installed Chromium is accessible to the approved external execution context
used by the successful Studio run. Use that bounded context for the new full
Sandbox/navigation invocation, without changing test rules or retries.

The subsequent externally launched Sandbox invocation
`6b25277f6fc5fa2b236e6a6b9b9d8232` completed with 37 passed, one failed and the
30 unchanged declared skips. Pixel SAFETY-007 rejected two direct external
Google-font-assets/font-l-endpoint requests. This is the retained intermittent
network-boundary question, not a contrast or demonstrated AI failure. No
allowlist change was made and no retry-to-green closure is claimed.

A listener-only exact-callback diagnostic then observed four fresh contexts
(Pixel, Desktop, Pixel, Pixel): each completed the assertions and seven persona
attachments with 15 stylesheet responses, zero rejected-font candidates, no
caps/timeouts and no CSS read failure. Same-loader ancestry therefore remains
inconclusive. It does not resolve the failed canonical invocation. All owned
diagnostic browsers/servers closed. Further font diagnostics were stopped when
AP requested prioritizing the actual bounded AI business workflow.

All eight final candidate static/build commands passed, source inventory was
refreshed, and the bounded independent quality review found no commit blocker.
The shared Sandbox invocation remains failed as above; there was no further
retry-to-green run. New exact-head CI owns the complete release-boundary run,
including Sandbox/navigation, before hosted writes. Security review remains
required before push; no hosted acceptance is claimed at the local boundary.

Rollback: withhold acceptance, retain provider-disabled/read-only behavior and
all evidence. Do not reset campaigns, change authority or delete failed history.
