# AvalaOS Core Technical Architecture

This is the current architecture reading entry point. [Detailed architecture](architecture/current-to-target-enterprise-architecture.md) and the [authority map](architecture/document-authority-map.md) own domain detail. [Implementation status](05_IMPLEMENTATION_STATUS.md) owns current proof. The PR1A-era prototype defect list is historical and must not be read as a fresh inventory of unresolved defects.

## Application and authority

AvalaOS uses a React/Vite TypeScript frontend, typed Edge/API command and query boundaries, PostgreSQL authority and canonical migrations, and governed private artifact/provider services. Explicit demo/test modes remain distinct from pilot/production.

```text
Browser projection and user intent
  -> authenticated typed command/query
  -> fresh server identity, tenant/workspace/resource capability checks
  -> deterministic policy, expected version, idempotency and lifecycle validation
  -> transactional state / receipt / audit where the domain requires it
  -> sanitized non-disclosing response and authorized read projection
```

The browser is not authorization. Service-role access does not replace fresh application authorization. PostgreSQL constraints/RLS and exact domain transitions provide additional protection. A local or CI exercise proves only its stated source/runtime boundary, not all deployed behavior.

## External effects and versioning

Provider invocation and private object storage are external effects and are not claimed to be atomic with PostgreSQL. Domain-specific durable attempts, fences, staged results, reconciliation and cleanup surround those effects. Uncertain outcomes remain uncertain; a retry must not duplicate an effect. AI may propose editable content but cannot decide deterministic scores, risk gates, approvals or regulated outcomes.

Assess decisions, Studio source/template/artifact versions, Delivery package/item versions and Monitor baselines preserve exact lineage. A changed source does not rewrite an earlier approved output. Handoffs require explicit target acceptance; independent module starts retain their not-assessed/planning-only limits.

## Runtime and data boundaries

- `local_demo` and `automated_test` permit explicitly labeled fixtures within their own scope.
- `pilot` and `production` require server-owned identity, permissions, data, audit, storage and governed AI settings. Missing configuration fails closed, without demo fallback or browser-held provider keys.
- `supabase/migrations/` is canonical migration authority. `docs/schema/` is historical/reference material, not a competing deployment chain.
- Configuration, source implementation, disposable tests, integrated synthetic acceptance and production verification are separate evidence levels.
- Real infrastructure, credentials, deployment/migration and provider effects require their own authorization.

## Current acceptance-harness correction

The browser harness must settle the old actor's admitted action, response body, work queue and exact causal completion before replacing the shared session. A rejected drain prevents navigation/session replacement. The current correction wires the existing boundary into downstream and assessment-scenario entries; it changes no product command, permission, schema or scoring rule. Local loopback Chromium proof does not establish real-auth or hosted correctness.

See [current status](05_IMPLEMENTATION_STATUS.md) for the verified PR345 baseline, current local correction and the older integrated 61 PASS / 47 BLOCKED result. V1 `assess-core-2026-05` and Assess V2 remain distinct versioned contracts; neither is reinterpreted by this documentation.
