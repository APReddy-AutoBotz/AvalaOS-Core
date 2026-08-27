# AvalaOS Core Source Of Truth

## Governed multi-source transcript PR A implementation candidate

PR A from `docs/planning/governed-multisource-transcript-module-handoff-plan.md` is implemented in the working tree based on `5518413a947030de2af0144f143c4ee97f72fc08`. It adds default-off immutable Source Library sets and input bundles; exact source-set-version, bundle-version, extraction-job, binding, candidate, preview-batch, and Assess-draft lineage; selective staleness of only unconsumed dependants; transcript-assisted review/conflict/batch-apply authority; first-class Groq through the shared server gateway; atomic fenced provider budgets; durable cleanup recovery; responsive Candidate Review UI; and assertion-owned process-lifecycle evidence. Source-only query authority is limited to source/source-set/input-bundle projections; every Assess-owned collection and mixed Assess staleness selector requires `assess.v2.read`. Historical consumed ancestry remains readable, the initial default-off path preserves the legacy single-source review projection, and existing Assess scoring law is unchanged. Executed assertions emit and cryptographically bind their actual runtime persona, canonical capabilities, tenant scope, fixtures, and lineage. The local proof boundary is 33 exact commands, 194 executed assertion markers, six explicit `not_run` results, 68 source-provenance entries, mocked providers, disposable PostgreSQL 16, Desktop Chrome, and Pixel 7. This establishes only a local implementation candidate. Final exact-head CI, hosted/live infrastructure, real providers, deployment, pilot, production, security certification, and compliance certification remain `not_run` or unproven. PR B and PR C have not started.

## Workstream 6 pilot operations candidate

PR #226 merged as `5bfcdf9a93391e1488b626b37ff3e2112e2f3f97` and accepted only the disposable/local pilot evidence boundary. Draft PR #227 is the separately authorized non-production Pilot Operations candidate. It may establish source and exact-head disposable CI proof for release/environment authority, tenant bootstrap, sanitized observability, recovery, operational controls, and non-live promotion simulation. Hosted/live activation, deployment, production, real secrets/providers/customer data, security certification, and compliance certification remain `not_proven_hosted_live`; `LIVE_ACTIVATION_NOT_AUTHORIZED` is the next AP stop gate.

## Post-V1-RC disposable pilot acceptance candidate

PR #225 merged as `c0a6196b18a9725eb162e56e86435aa4d0e402d1` and accepted the V1 release-candidate source/local/exact-head CI proof boundary. Draft PR #226 is the separately authorized disposable/local pilot-acceptance exercise. Its repository-owned workflow composes accepted authority suites, disposable PostgreSQL 16, synthetic provider/storage boundaries, Desktop Chrome and Pixel 7 browser projects, and a fail-closed exact-head manifest. Until authoritative GitHub Actions completes, its status is `configured_not_live_verified`; a successful run may establish only `proven_disposable_pilot_evidence`. Hosted/live infrastructure, deployment, real providers, production, security certification, and compliance certification remain `not_proven_hosted_live`. The next milestone requires separate approval and is not a production cutover.

## Historical pre-RC candidate context

Enterprise Intelligence PR #221 and Trust Assurance PR #222 are contained in post-Trust-Hub `main` merge `095ba67adeb1ac89c4b3b2f46734e06815e335b0`. Draft PR #225 starts from child seed `ce8d92415e8b0ee42f7fdfe034310a5246dc132f` and is the active V1 release-candidate/pilot-readiness proof milestone. Its proof remains bounded to source, local synthetic, and exact-head CI evidence: no hosted deployment, live provider/Vault/Supabase validation, pilot acceptance, production readiness, security certification, or compliance certification is established. Assemble remains at the accepted documentation/Phase-1 boundary.

## Studio PR B accepted corrective closure

PR #217 accepted head `c83d456501741dbeecc864846fe7419c8d9046e7` merged as `372ed0880950d3209f79139704d3935b49c294d0`. Corrective PR #218 accepted head `f713d30cfe64040a143c9442a18064b3523c1d94` merged as and is contained in verified main baseline `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`. PR #218 corrects the five PR #217 projection/RPC, strict-decoder, command-translation, crash-recovery, and hold/deletion-serialization findings; both PRs have zero unresolved review threads. The accepted migration remains unchanged at blob `3383268eab95d1b2f12f4bb8a77246e63c3e30a3`. Authority remains server-side and fail closed; legacy document exports stay non-canonical. Source and CI acceptance is not hosted, deployment, pilot, production, readiness, security-certification, or compliance proof.

## Studio PR A active authority

PR 1G remains accepted at the required `4ac6ca16b1513561779c53bbfb71cfb5a9160061` starting authority. PR A establishes governed structured-JSON artifact generation, immutable revision/review, and three-person approval authority. Private storage, file renditions, brokered download, retention, legal hold, and deletion remain outside PR A authority and are addressed by the accepted Studio PR B boundary above. Legacy `document_generations` rows remain unverified and non-canonical.


AvalaOS Core is the governed AI and automation delivery platform.

Canonical tagline: **Evaluate before you automate. Govern before you execute.**

This file governs product scope, maturity, readiness/proof boundaries, and the accepted implementation sequence.

## Minimum Reading Sequence

1. This file
2. `AGENTS.md`
3. `docs/strategy/gpt-5.6-sol-enterprise-acceleration-plan.md`
4. `docs/architecture/current-to-target-enterprise-architecture.md`
5. `docs/quality/gpt-5.6-sol-enterprise-risk-and-evidence-register.md`
6. `PLANS.md` for substantial implementation
7. A task-specific document selected through `docs/architecture/document-authority-map.md`

Do not read the full historical planning/evidence corpus by default.

## Authority Precedence

- `AGENTS.md` governs agent execution, approval requirements, safety constraints, delegation, and delivery discipline.
- This file governs product scope, maturity, readiness/proof boundaries, and the accepted implementation sequence.
- Domain documents govern only the areas assigned by `docs/architecture/document-authority-map.md`.
- No document has blanket precedence outside its assigned domain.
- If a genuine conflict crosses these boundaries and cannot be resolved safely, stop and request AP clarification.

## Accepted Source Baseline

- Repository: `APReddy-AutoBotz/AvalaOS-Core`
- Branch: `main`
- Rebaseline anchor: `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`
- Latest accepted repository baseline: PR #205, AvalaOS Enterprise Rebaseline, merged as `4cf0a8c5c566d5bcf9035c87ce456b354bc0ee68`.
- Latest accepted source hardening before the rebaseline: PR #204, Server-Side Export Storage and Signed URL Guard Hardening Implementation Gate.
- PR 1A is accepted through PR #206 at `3ef9c9ae1b91881d12fab8d753ba152ec078c3fa`. PR 1B is accepted on `main` at `de87c86`. PR #208 / PR 1C, PR #209 / PR 1D, PR #211 / PR 1E, and PR #212 / PR 1F are accepted; PR 1F merged as `480cc9b943e8b51b074873c20c2a9f30dc6521c2`.

## Maturity Verdict

> AvalaOS Core is a credible deterministic enterprise demo with substantial source-level governance scaffolding, but not yet a coherent server-authoritative, tenant-safe pilot or production platform.

## Accepted Capabilities

- React/Vite TypeScript product shell and role-aware demo journeys.
- Avala Assess process catalog, guided assessment, deterministic scoring, Decision Pack, review concepts, and handoff scaffolding.
- Locked deterministic scoring regression harness.
- Avala Studio document generation/review workspace and work-item preparation.
- Avala Govern governance/control-plane models and human approval concepts.
- Avala Delivery boards, policies, retained-lineage scaffolding, and delivery packs.
- Server-side AI/provider-governance sources and selected fail-closed provider controls.
- Canonical Supabase migration groundwork plus additional legacy schema contracts.
- Source-level product-action, workflow, artifact export, storage, and signed-URL guard hardening through PR #204.
- Extensive historical planning and evidence records, preserved as history.

## Not Accepted Or Proven

- One reproducible migration chain for the complete runtime-assumed schema. PR 1A adds executed fresh/upgrade evidence only for its minimum AI audit boundary.
- Uniform server-authoritative identity, RBAC, workspace authorization, and immediate revocation.
- Enterprise Assess persistence and server scoring parity.
- Complete RLS and two-tenant non-disclosure proof across pilot paths.
- Atomic privileged audit across all state changes.
- Safe private storage/export behavior in a deployed environment.
- Browser E2E, accessibility, responsive-state, and performance evidence. PR 1A adds candidate coverage and migration gates but does not supply browser execution evidence.
- Hosted, deployment, rollback, incident, backup/restore, operational, pilot, production, buyer, release-candidate, security, or compliance readiness.

## P0 Stop Gate

`P0-001` was a confirmed source defect in the service-role document-extraction Storage path. The AP manually inspected the intended Supabase project and classified the function as **NOT DEPLOYED**.

- The repository did not access live infrastructure and did not request or record a project reference, organization, URL, credential, screenshot, or infrastructure identifier.
- The isolated source remediation and negative tests remain the first logical PR 1A commit.
- The not-deployed decision permitted broader PR 1A implementation; it is not deployment, hosted, storage, security, pilot, or production readiness proof.
- Do not inspect or mutate live infrastructure, deploy, disable endpoints, review production logs, rotate credentials, or perform incident actions without separate explicit approval.
- Evidence excludes secrets, raw logs, signed URLs, customer data, object identifiers, and infrastructure identifiers.

## Product And Security Law

- Deterministic scoring remains deterministic.
- Scoring formulas, weights, thresholds, hard stops, and recommendation logic require an explicit score version change and regression tests.
- AI cannot decide scores, risk gates, approvals, or regulated decisions.
- Pilot and production cannot use browser-held provider secrets, browser AI execution, demo identity, mock persistence, or silent fallback success.
- Client claims, email matching, demo personas, cached permissions, routes, and UI state are not server authorization.
- Humans approve material risk; privileged decisions require evidence and audit.
- No unsupported compliance claims are made.
- Avala Govern is a governance/control-plane surface, not runtime agent execution.
- Avala Delivery is a governed workbench, not a Jira replacement.
- Runtime AGS, MCP, A2A, autonomous agent execution, bot execution, RPA job execution, and external-system actions remain out of scope.
- KlarityFlow Health remains separate unless explicitly opened.

## Active Enterprise Sequence

1. PR #205, the one-time docs/config enterprise rebaseline, is accepted and merged.
2. PR 1A, Platform Safety and Fail-Closed Runtime Foundation, is accepted through PR #206.
3. PR 1B, Server-Authoritative Identity, RBAC, RLS, and Assess, is accepted on `main` at `de87c86`.
4. PR #208 / PR 1C, Enterprise Assess UI Cutover, Govern Resolution, and Studio Handoff, is accepted at the PR #208 merge baseline.
5. PR 1D is accepted; PR #211 / PR 1E governed review, approval, action-specific Govern resolution, and durable Studio source handoff is accepted.
6. PR #212 / PR 1F Assess V2 economics, calibration reporting, realized outcomes, and portfolio intelligence is accepted and post-merge verified.
7. Application Portfolio & AI-Assisted Modernization Assessment is accepted through PR #214 and corrective PR #215 after PR 1F; Studio governed generation is accepted through PR #216 and private-artifact authority through PR #217 plus corrective PR #218.
8. Continue through Delivery/lineage, Monitor/Admin/Trust, and deployment/pilot control as defined by the acceleration plan.

PR 1C remains one substantial vertical PR. It does not authorize deployment, live-system access, later workstreams, or a readiness claim. Routine plan-only, evidence-only, reconciliation-only, post-merge-only, and closure-only PRs remain prohibited.

## Evidence Authority

- Active status lives in this file, the acceleration plan, target architecture, risk register, implementation status, roadmap, task ledger, and readiness gates.
- Historical evidence and post-merge verification under `docs/quality/` are immutable records of what was checked at the time.
- Historical records never override current authority and are read only when task-specific evidence is required.
- Correct current drift in active documents; do not rewrite historical evidence.

## PR 1D Current Authority

PR 1D closure baseline `779a4801aa7c6660ad4581f8e334f5ad422519e7` remains retained and its decisions remain immutable.

### PR 1E Accepted Closure

PR #211 is accepted with head `be502c9faf4f768d3a60e2f9debd5ffc40b6b66e`, merge commit and post-merge verified main `d3074e5b99b3d40f33a472679b7a861bcac1700a`, successful exact-head workflow `29760010656`, successful post-merge main workflow `29802046983`, and zero unresolved review threads. The closure evidence is `docs/quality/pr1e-assess-v2-governed-review-approval-studio-handoff-post-merge-verification.md`.

V1 `assess-core-2026-05` scoring remains unchanged and PR 1D decisions remain immutable. PR 1E review, approval, action-specific Govern resolution, and durable Studio-source handoff are accepted. Hosted/live validation and deployment were not run. PR 1F and PR 1G Application Portfolio Assessment are accepted.


## PR 1F Accepted Closure

PR #212 is accepted with head `f793f9dd9f75adf874fa3ee82b1f4adb2b2734f6`, merge and verified main `480cc9b943e8b51b074873c20c2a9f30dc6521c2`, successful exact-head workflows `29842917740` and `29842914443`, successful merge-triggered main workflow `29844001756`, and zero unresolved review threads. PR 1F adds versioned economics, deterministic scenarios, independent economic review, append-only realized outcomes, transparent calibration reporting with **Insufficient Data** status, and tenant/workspace portfolio dispositions. V1 scoring is unchanged, PR 1D decisions remain immutable, and PR 1E authority is unchanged. Deployment and hosted/live validation were not run; PR 1G Application Portfolio Assessment is accepted; broader Studio/private-artifact work is not started. Closure evidence: `docs/quality/pr1f-assess-v2-economics-calibration-portfolio-intelligence-post-merge-verification.md`.

PR #214 accepted head `cc741f2d44304c57b493834eaa0219c524819ff8` is merged as `4fd672981b397207d46c8c9ccfe038e98012fe4e`; corrective PR #215 accepted head `8fee4cf23b04e6b89323bf73329b18ac28d65aa7` is merged as `46b860445996f8be5b0e53138d455c60f7b24a5a`. Executed post-merge verification passed PostgreSQL 16 with 114 scenarios passed and 0 failed, including cross-workspace receipt denial, same-workspace exact replay, authorization-before-receipt inspection, and assessment/snapshot concurrency; focused coverage is 96.53% lines, 80.46% branches, and 95.74% functions. The four late PR #214 authority/concurrency findings are corrected, replied to, and resolved. Exact-main CI and PR 1G workflows passed; Supabase smoke was skipped only under its configured non-live condition. No deployment, hosted/live validation, production certification, scoring formula, weight, threshold, or decision-law change occurred.

## Accepted Trust Assurance baseline

Trust Assurance PR #222 and Enterprise Intelligence PR #221 are contained in post-Trust-Hub main `095ba67adeb1ac89c4b3b2f46734e06815e335b0`. Trust retains the unique forward migration `20260808190000_trust_assurance_evidence_hub.sql`, explicit claim/evidence selection, three-person publication separation, and HTTPS-only pilot/production server configuration. Draft PR #225 must bind any positive Trust workflow claim to an exact workflow/run/head/result identity; when Trust has not run for the candidate, its RC state is `not_run` rather than inferred from repository source or historical acceptance. Source and CI evidence do not establish hosted, deployment, pilot, production, security, compliance, or buyer readiness.
