# PR #217 Studio Private Artifacts Governed Access Post-Merge Verification

Status: executed source and CI closure on 2026-08-04. This is a documentation-only verification record; it changes no product behavior, migration, workflow, dependency, or test.

## Accepted lineage

| Boundary | Accepted head | Merge / verified main |
| --- | --- | --- |
| PR #217 — Studio private artifacts | `c83d456501741dbeecc864846fe7419c8d9046e7` | Merge commit `372ed0880950d3209f79139704d3935b49c294d0` |
| PR #218 — corrective forward fix | `f713d30cfe64040a143c9442a18064b3523c1d94` | Merge commit `bc6dfcde2806bd0ea2067d64baf6fea91d32c207` |
| Verified current-main implementation baseline before this closure commit | — | `bc6dfcde2806bd0ea2067d64baf6fea91d32c207` |

Git ancestry checks confirmed the PR #218 accepted head and merge commit are contained in the verified current-main implementation baseline. The accepted PR #217 migration remains unchanged:

- file: `supabase/migrations/20260729163251_studio_private_artifact_authority.sql`;
- blob: `3383268eab95d1b2f12f4bb8a77246e63c3e30a3`.

## PR #217 findings closed by PR #218

| PR #217 thread | Finding | Accepted corrective evidence |
| --- | --- | --- |
| `PRRT_kwDOSup7LM6VJnsX` | Production projection RPC arguments did not match the migration signature. | The production adapter calls `studio_private_artifact_projection` with exactly `p_org`, `p_workspace`, and `p_artifact_version`. |
| `PRRT_kwDOSup7LM6VJnsb` | The projection response did not match the strict public decoder. | The RPC and client share one exact public DTO; private attempts and Storage coordinates remain excluded and unsafe shapes fail closed. |
| `PRRT_kwDOSup7LM6VJnsg` | Public retention, hold, and deletion bodies were forwarded without translation to private SQL vocabulary. | The Edge boundary explicitly translates public commands, rationale, extension, hold identity, outcome, and expected-version values before private execution. |
| `PRRT_kwDOSup7LM6VJnsp` | Crash windows could strand rendition or deletion attempts after a committed claim or provider effect. | Service-only due work, leases, fences, claim-time authority rechecks, bounded recovery, and `committed_reconciliation_pending` preserve and resume uncertain work. |
| `PRRT_kwDOSup7LM6VJnsu` | Legal-hold placement could race an in-flight physical deletion. | Retention, holds, deletion approval, and provider execution serialize on the rendition; execution-time authority, hold, retention, lifecycle, and fence checks precede provider authority. |

Merged PR #218 retained 394/394 PostgreSQL 16 scenarios, including the original five correction areas plus concurrency, lease, replay, due-work, audit rollback, provider-outcome, and bounded deletion-exhaustion evidence. Focused private-artifact coverage passed 87/87 at 98.42% lines, 86.26% branches, and 100% functions.

Each PR #217 thread received a finding-specific reply citing the merged PR #218 evidence and was resolved. Thread-aware verification then recorded zero unresolved threads on PR #217 and zero on PR #218.

## CI results

PR #218 exact accepted head `f713d30cfe64040a143c9442a18064b3523c1d94`:

- Studio Governed Artifacts — run `30878485490` — success;
- AvalaOS Core CI — run `30878485492` — success;
- PR 1G Application Portfolio — run `30878485521` — success.

Verified current-main implementation baseline `bc6dfcde2806bd0ea2067d64baf6fea91d32c207`:

- AvalaOS Core CI — run `30880317185` — success.

`Studio Governed Artifacts` and `PR 1G Application Portfolio` are pull-request/workflow-dispatch workflows rather than main-push workflows; their exact-head PR #218 results above are the applicable accepted evidence. `AvalaOS Core CI` is the required main-push workflow and succeeded on the merge baseline.

## Non-claims

No live Supabase, hosted database, Storage, Edge worker, scheduler, deployment, backup/restore, incident, credential, production log, pilot, production, security-certification, legal-retention sufficiency, or compliance validation was accessed or performed. Source and CI acceptance does not establish deployment, hosted-infrastructure, operational, pilot, production, security, or compliance readiness.

The final annotated tag is permitted only after the documentation-only closure commit reaches current main, its required push-triggered CI succeeds, and PR #217 remains at zero unresolved review threads.
