# Authenticated controls acceptance

This Track C slice executes the production control boundaries for EI-003, STUDIO-007, ADMIN-001 through ADMIN-004, and AI-001 through AI-006. It does not change product authority, provider runtime configuration, scoring, or deployment state.

`scripts/testEnterpriseIntelligenceAcceptancePostgres.mjs` owns EI-003. The measured observation invokes the production Enterprise Intelligence query handler, resolves fresh authority through the real `get_tenant_context` RPC under the authenticated actor role, loads the current-tenant projection, and denies a foreign tenant before projection loading. Before and after database snapshots must be equal. This disposable PostgreSQL result can be retained as executed evidence when its existing cleanup and exact-source bindings pass.

`scripts/authenticatedControlsFixture.mjs` is mounted into the existing loopback lifecycle fixture. It accepts the parent fixture's serialized `actorQuery` and `serviceQuery` adapters and returns `null` for routes it does not own. Authentication in this fixture is explicitly `fixture_transport`. Its normal `/functions/v1/*` routes execute these production boundaries:

- Enterprise Intelligence query and tenant-authority resolution for server capability projection.
- Provider lifecycle commands with a synthetic, no-egress secret backend. `provider.secret.bind` performs one logical configuration transition, one synthetic secret write, one receipt completion, and one privileged-audit observation while provider requests and routes remain off.
- Synthetic Admin endpoint denial for a non-admin actor.
- Pilot Operations query through the actual database projection RPC behind the product client, using a non-live, read-only local environment row prepared outside measurement.
- Studio private-download denial before claim, rendition lookup, or synthetic-byte storage access.

`scripts/authenticatedControlsPostgresAdapter.mjs` closes the durable AI-004 preparation gap. The parent fixture supplies the authenticated actor transaction and service-role transaction. Setup creates one synthetic provider configuration with no key reference. The measured command then claims and plans a real enterprise receipt, executes `provider.secret.bind` through production lifecycle code, persists the real provider transition, key reference and privileged audit, and completes the receipt. The raw synthetic key exists only in the no-egress in-memory secret backend and is cleared during cleanup. The adapter returns counters and safe booleans; it never returns the raw value or generated server reference.

The local artifact uses the common per-case frame from `scripts/authenticatedControlsAcceptance.mjs`. It records production API observations, zero-effect measurements for read-only and denial cases, and the exact AI-004 mutation counts. Missing counters or a mismatched before/after delta blocks the case. It must keep `hostedRequirementSatisfied: false`. These local results prepare the 47-case authenticated run; they do not replace real Supabase Auth, a matching deployed release, both desktop and Pixel 7 browser projects, or hosted cleanup evidence.

The connected browser runner must observe every UI assertion on desktop and Pixel 7 before these local cases can be retained as `actual-ui`. A visible navigation item alone cannot prove ADMIN-002; the corresponding server request must return the actual database-derived denial. When a capability correctly hides or disables AI-003 or STUDIO-007, the browser issues an authenticated bypass request to the same production endpoint and requires its authority denial. AI-004 browser evidence must contain only safe booleans and counters. The traffic observer excludes only the raw `providerKey` field of the exact authorized bind request and scans all other function request fields, responses, and browser storage. Raw key material and server secret references are forbidden in responses, browser storage, traffic capture, retained evidence, and logs.

Focused verification:

```text
node --test scripts/authenticatedControlsAcceptance.test.mjs scripts/authenticatedControlsFixture.test.mjs scripts/authenticatedControlsPostgresAdapter.test.mjs scripts/enterpriseIntelligenceAcceptanceEvidence.test.mjs
```

Rollback is file-local: remove the authenticated controls fixture, frame builder, their focused tests, and the EI-003 retained-suite additions. No migration, hosted resource, provider configuration, or production data requires reversal. If fixture preparation fails, retain the case as `BLOCKED` or `not-run`; do not manufacture a PASS or privileged audit.
