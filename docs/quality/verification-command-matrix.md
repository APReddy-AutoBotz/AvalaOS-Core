# Verification Command Matrix

Record the exact exit code and material result for every executed command. Unavailable or unauthorized checks are `blocked` or `not run`, never passed.

## PR 1A Required Set

| Command | Purpose | Pass signal |
| --- | --- | --- |
| `npm ci` | Reproducible dependency install when a clean install is required. | Exit 0; lockfile unchanged. |
| `npm audit --audit-level=moderate` | Dependency vulnerability gate. | Exit 0. Do not run `npm audit fix` without approval. |
| `npm run typecheck` | Browser/application TypeScript contracts. | Exit 0. |
| `npm run typecheck:edge` | Edge/shared TypeScript boundary. | Exit 0. |
| `npm run lint:pr1a` | PR 1A fail-closed source invariants. | Exit 0. |
| `npm run test:pr1a` | Runtime, export, audit, rendering, false-success, migration-contract, and owned-module coverage gates. | Exit 0; configured coverage thresholds pass. |
| `npm run test:required-supplemental` | Evidence, product-action, workflow, artifact, and helper-guard suites. | Exit 0. |
| `npm test` | Complete default regression chain, including the supplemental and PR 1A gates. | Exit 0. |
| `npm run test:migrations:pr1a` | Disposable PostgreSQL fresh-chain, targeted upgrade, RLS/constraint, failure, and reapply checks. | Exit 0; temporary state removed. |
| `npm run test:ai-boundary-static` | Browser/provider boundary source scan. | Exit 0; zero forbidden and zero stale entries. |
| `npm run test:secret-hygiene` | Secret and unsafe-output source scan. | Exit 0; zero forbidden hits and zero tracked environment files. |
| `npm run build` | Production bundle compilation. | Exit 0. |
| `codex app-server --strict-config --stdio` | Repository `.codex` schema validation through the supported strict app-server path. | Exit 0 after stdin closes; no unsupported-key error. |
| Markdown link validation | Active and new documentation links. | Repository-supported checker exits 0. |
| `git diff --check` | Patch whitespace integrity. | Exit 0. |
| Changed-file review | Scope and historical-evidence check. | Only approved PR 1A behavior, test, CI, migration, and active evidence files changed; historical evidence remains unchanged. |

## Unavailable Or Separate Gates

Browser E2E, accessibility, responsive-state, and performance execution require an available authorized browser toolchain. In PR 1A the executable Playwright CLI was absent and managed approval denied the third-party package download, so these checks are `blocked`, not passed.

Hosted database, RLS/tenant-isolation, Storage, Edge invocation, deployment, environment, log, secret, incident, rotation, backup/restore, and production checks require separate explicit authority and are not implied by local source or disposable migration evidence.
