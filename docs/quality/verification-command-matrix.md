# Verification Command Matrix

Record the exact exit code and material result for every executed command. Unavailable or unauthorized checks are `blocked` or `not run`, never passed.

## Rebaseline Baseline Set

| Command | Purpose | Pass signal |
| --- | --- | --- |
| `npm ci` | Reproducible dependency install. | Exit 0; lockfile remains unchanged. |
| `npm audit --audit-level=moderate` | Dependency vulnerability gate. | Exit 0. Do not run `npm audit fix` without approval. |
| `npm run typecheck` | Browser/application TypeScript contracts. | Exit 0. Note: current `tsconfig.json` excludes `supabase/`. |
| `npm run test:ai-boundary-static` | Browser/provider boundary source scan. | Exit 0. |
| `npm run test:secret-hygiene` | Secret and unsafe-output source scan. | Exit 0. |
| `npm run test` | Default regression suite. | Exit 0. This does not include all supplemental tests below. |
| `npm run test:evidence-execution-gate` | Evidence execution gate tests omitted from the default chain. | Exit 0. |
| `node scripts/runTypeScriptTest.mjs services/productActionPolicy.ts services/productActionPolicy.test.ts` | Product action policy suite omitted from default chain. | Exit 0. |
| `node scripts/runTypeScriptTest.mjs types.ts services/deliveryWorkflowPolicy.ts services/deliveryWorkflowPolicy.test.ts` | Delivery workflow policy suite omitted from default chain. | Exit 0. |
| `node scripts/runTypeScriptTest.mjs types.ts services/productActionPolicy.ts services/artifactExportPolicy.ts services/artifactExportPolicy.test.ts` | Artifact export policy suite omitted from default chain. | Exit 0. |
| `node scripts/runTypeScriptTest.mjs services/artifactExportHelperGuards.test.ts` | Export/storage/signed-URL helper guard suite omitted from default chain. | Exit 0. |
| `npm run build` | Production bundle compilation. | Exit 0. |
| `codex app-server --strict-config --stdio` | Repository `.codex` schema validation through the supported strict app-server path. | Exit 0 after stdin closes; no unsupported-key error. |
| `git diff --check` | Patch whitespace integrity. | Exit 0. |
| Changed-file review | Scope and historical-evidence check. | Only approved docs/config changed; no historical evidence modified. |

## Missing Shared Gates

The current repository has no standard lint, coverage threshold, browser E2E, accessibility, performance-budget, or migration fresh/upgrade CI command. These are open quality gaps, not passed checks. Feature-specific gates must be added to the implementation PR that first needs them; a shared tooling PR is allowed only after at least two slices need the same infrastructure.

Supabase/database, deployment, environment, storage, log, secret, and live-system checks require explicit authority and are outside the docs/config-only rebaseline.
