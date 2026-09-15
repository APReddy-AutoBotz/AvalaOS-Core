# Creation access and synthetic Admin remediation

Status: local implementation and verification complete; separately approved
exploratory backend/bootstrap and initial Admin Auth checks executed; joined
browser and exact-head hosted acceptance pending. Baseline: PR #264 branch
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
