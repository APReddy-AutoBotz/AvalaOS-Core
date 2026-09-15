# Creation access and synthetic Admin remediation

Status: local implementation and verification complete; actual joined exploratory
browser and independent SQL readback passed on head `3352f5ff`; the two retained CI
source defects are locally corrected, with 28/28 commands and 156/156 browser
checks passed. New exact-head CI remains pending. Baseline: PR #264 branch
`controller/governed-delivery-monitor-pr-c-20260831`, head
`a8548ba74651ff997f970947a86b5156a1463b13`.
Final local evidence and bounded review disposition:
`docs/quality/creation-access-remediation-evidence.md`.

## Approval and outcome

AP approved this focused repair on 2026-09-15 after reporting that authenticated
test accounts could not use creation actions. Deliver supported, server-authorized
creation journeys and Admin-managed synthetic test users without changing scores,
production, or the existing PR264 acceptance fixtures. Login alone is not acceptance.

The source reproduction returned `missing_permission` for four legacy actions:
process creation, assessment editing, document generation, and task creation. The
hosted Auth mapper deliberately contains identity only, but the legacy action
checker reads `User.permissions`. Separately, process creation directly inserts
without workspace ancestry; the canonical schema denies that browser write.
Application Portfolio reads run without their distinct read capability. The Admin
Users/Roles section is a read-only placeholder.

## Boundaries and execution phases

Architecture, security, and quality findings completed read-only before writes.
The managed workspace-write profile is now used only for this approved slice.
Only the controller delegates; no descendants; at most three implementation workers.
Two existing agents supplied read-only security/quality findings when new reviewer
slots were unavailable. No reviewer runs during implementation.

- Keep the current branch; no new PR, merge, production deployment, real provider,
  customer data, or AvalaOS.com action.
- Preserve the stash without inspection and unrelated user files/directories.
- Do not grant the twelve controlled-human personas new capabilities or change
  their fixture, inventory, bootstrap, signed evidence, or seeded backend.
- That backend has exact global identity counts. Exploratory Admin activation
  requires a separate synthetic backend and explicit target/cost approval later.
- No role-label, email, user-editable metadata, browser flag, cached permission,
  or browser service key supplies server authorization.
- Do not enable legacy direct writers by translating new capabilities into old
  permission names. Route supported journeys to existing governed components;
  unsupported legacy operations remain unavailable with an explanation.

## Implementation tracks

1. Process track: explicit `assess.process.create`, typed `process-command`,
   service-only atomic persistence, workspace-scoped default-off controls, bounded
   fields/quota, actor-derived owner, strict template handling, exact receipt and
   audit, authoritative reload, and accessible creation UI.
2. Admin authority track: strict public contracts, separate default-off synthetic
   target registry, private mutation/read handlers, immutable role presets,
   bounded owned roster, Auth provisioning saga, assignment/revocation, and SQL/API
   adversarial tests. The initial Admin is operator-bootstrapped, never self-granted.
3. Admin/UI track: current-context Admin Users screen, temporary password memory
   only, safe roster/status, fixed role choices, unknown-outcome recovery, scope
   fencing, capability-aware portfolio reads, clearer optional V1/V2 labels.
4. Controller: shared App/action routing, execution/test tooling, bootstrap
   containment, migration/CI/provenance integration, active documents, full
   verification, independent final review, and final disposition.

## Authority, data flow, and failure behavior

Every new request validates a strict envelope and fresh actor/organization/workspace
and authorization version. PostgreSQL independently repeats the authority check
inside the transaction. Process creation commits domain state, one exact receipt,
and sanitized audit atomically. Quotas serialize; foreign selectors, changed-key
payloads, arbitrary owners, stale authority, and audit failures produce no effect.
Read-only mode may recover an exact already-committed result, never a new mutation.

Auth provisioning is not a cross-system transaction. Reserve metadata and an exact
Auth UUID durably; claim one credential-bearing execution fence; call Auth once;
observe the exact UUID; reauthorize and atomically activate profile/memberships.
A timeout, lost response, malformed result, or post-Auth SQL failure stays unknown
or requires cleanup. Reconciliation looks up only the reserved UUID and never
turns a 404 into permission for another create. Passwords are never stored in
receipts/audit/browser storage, returned in roster, or included in evidence.
Preset roles cannot grant new Admin authority. Assignment/revoke act only on the
new subsystem's same-tenant owned bindings with expected versions. Application
suspension and authorization-version invalidation precede separately tracked Auth
disable; a valid old JWT must not retain application permissions.

All async UI completions are bound to actor, organization, workspace, and authority
epoch. Scope changes synchronously clear sensitive drafts/passwords and fence late
results. Failure cannot show optimistic success. Unknown create results lock fresh
creation until authoritative reconciliation.

## Acceptance and verification

Required positive journey: synthetic Admin provisions an author and role; the
author signs in, creates a process, creates a V2 assessment, saves, and reopens its
committed state. Role-specific document and Delivery entry points must reach
governed workflows. Each evidence claim distinguishes mocked Auth, disposable SQL,
browser fixture execution, and actual hosted login; none substitutes for another.

Required negatives: no authority; ordinary/forged/revoked Admin; wrong workspace;
stale version; foreign/unknown preset; fixed-exercise target; production marker;
quota race; concurrent create; changed replay; atomic audit failure; lost Auth/SQL
response; stale execution fence; reconciliation 404; revoked manager before
activation; revoked user's next request; password persistence; late prior-scope
UI result; denied portfolio read; and no provider egress.

The controller will register exact focused commands with the implemented test
files before execution. Retained gates include:

    npm run typecheck
    npm run typecheck:edge
    npm run test:product-action-policy
    npm run test:view-access-guard
    npm run test:product-navigation-controller
    npm run test:tenant-authority
    npm run test:admin-workbench
    npm run test:workflow-yaml
    npm run test:ai-boundary-static
    npm run test:secret-hygiene
    npm run test:scoring
    npm run test:pr-c-scoring-law-drift
    npm run build
    git diff --check

Also require feature-owned unit/Edge tests, disposable PostgreSQL fresh/upgrade,
RLS/ACL/rollback/concurrency tests, Desktop Chrome + Pixel 7 and accessibility,
changed-critical-module coverage, and retained Assess/Studio/Delivery regressions.
Use task-owned temporary paths and serial heavy commands. Existing untracked test
artifacts are not expendable. Check disk reserve and Docker before database work;
an unavailable gate is `not run`/`blocked`, not PASS. Retain sanitized source-bound
results under `output/creation-access/`; never record secrets or raw hosted logs.

## Rollout, rollback, and remaining approvals

### Final-review corrective pass

All three independent final read-only reviewers completed before this corrective
write phase. Frozen findings are Auth-ban recovery after a lost SQL response,
correlated ban-completion audit, missing supported Studio/Delivery preset
permissions, the revoked subject's next real SQL request, modal/Admin busy/error
accessibility, independently pinned execution content, and committed-patch CI
verification. The controller owns final integration and reruns. A source-supported
custom Auth UUID contract does not prove the deployed Auth version: exact-target
Auth creation/login remains a separately approved hosted gate. The joined Admin
provisioning → actual author sign-in → process → V2 save/reopen journey remains
pending; disconnected local fixtures cannot satisfy it.

Migrations are additive and generated with the installed CLI. Existing data and
scoring remain unchanged. New process/Admin mutations are disabled by default;
safe rollback disables their controls and preserves committed history and bounded
reconciliation. Do not restore browser table writes or destructively down-migrate.

AP subsequently approved the separate exploratory project at quoted $0/month and
pausing MockMate with data preserved. New-target bootstrap and initial Admin
Auth/session/empty-roster/signout checks passed after all 74 canonical migrations.
The isolated draft site contains public dev/build settings only; no production
deployment, real provider, or old-backend change is authorized. Joined browser
creation and exact-head CI/preview must pass before user-facing activation.
Existing PR264 evidence remains immutable, bound to its old head;
new changes require their own exact-head CI/preview evidence. Final merge still
requires AP confirmation after the applicable human gate. No production readiness
or universal-creation PASS is inferred.

### Joined exploratory proof and retained CI correction

The subsequent immutable draft at `3352f5ffeb08d493ec6202ce65dae28608e07502`
passed the joined journey and independent database readback after its own
creation-access CI, full asset binding and 75-migration forward verification.
The existing twelve-persona backend remains untouched. Credentials are displayed
only by a locally run interactive viewer, pinned to that tested draft; later
repository commits do not imply that draft contains the newer source.

Read-only quality/security review identified two retained CI defects: App's
presentation accessor throws before blocked routes can render; the full-chain
PR C PostgreSQL test still expects the frozen old marker. The corrective slice
preserves service authorization, public CTA navigation, the partial upgrade tip
and the old human backend. Add full-App Desktop/Pixel blocked-route/no-egress
regressions and run the retained PR C suite inside the disposable PG16 runner.
Refresh the fresh assertion context only from its executed marker. Rerun the
canonical local matrix, evidence contracts and exact-head CI before acceptance.
Rollback keeps authority denial and disables exploratory mutations if needed;
never weaken the route/attestation gate or destructively reset retained data.

### Retained Sandbox fixture corrective boundary

Exact head `c038bbd2a6c3c8ff861fd0dcc22d46eea5cb364c` passed all 28 creation-access
CI commands. PR C run `35019735530` and preview run `35019735541`, both attempt 1,
independently reproduced ten local Sandbox failures: eight obsolete combined
Admin locators and two expectations of Draft immediately after process creation.
All three read-only reviews completed before corrective writes. Preserve product
authority, scoring, migration history, Test IDs and all seven persona journeys.
Update the tests to visit Admin Workbench / Users / Roles separately from Assess
-> Enterprise Intelligence's unavailable Sandbox boundary. For incomplete
discovery, create a Not Started process, start its legacy assessment, save an
incomplete draft, reopen it and prove Draft with no score or decision pack.
Correct the parallel full-platform fixture and bind source-contract adversarial
tests to these semantic steps. No extra skips or weaker network observer are
permitted. Run Desktop/Pixel Sandbox, navigation and full-platform fixture suites,
affected evidence/provenance contracts, typecheck and patch checks. Retain the
failed attempts unchanged; new-head CI remains required. Rollback reverts these
fixture/contract changes together, leaving fail-closed product behavior intact.

The corrected fixture subsequently exposed a real local navigation defect:
defined empty server capabilities rejected the synthetic Admin destination after
click. A second read-only architecture/security/quality wave completed before
fixing App's local-only undefined/server-defined capability distinction and one
guarded Admin callback. Verify actual committed URL/persistence, reload/history,
multiple initial scopes and non-Admin rejection; preserve server empty/stale
capability denial. This implementation and its browser/contract tests belong to
the same corrective boundary. Rollback reverts the App/Sidebar navigation delta
with its tests without granting local role authority to server sessions.

The corrected candidate passed all 86 affected Desktop/Pixel browser checks,
20 selected canonical authority/regression/static/coverage commands, catalog and
adversarial evidence contracts, and final independent read-only reviews.
The 30 pre-existing server-only Sandbox skips remain `not_run`. No database or
command implementation changed in this navigation delta; the exact-head CI must
repeat the full 28-command creation-access pipeline and retained PostgreSQL/PR C
pipeline after push. Commit one coherent corrective slice on the existing branch,
verify its exact-head CI/preview artifacts, retain the independently tested
exploratory draft at its own immutable head, and stop before Ready/merge or any
claim that synthetic accounts replace the three required humans.
