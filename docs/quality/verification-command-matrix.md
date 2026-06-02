# Verification Command Matrix

| Command | Use | Pass Signal |
| --- | --- | --- |
| `npm run typecheck` | TypeScript contract check. | Completes with exit code 0. |
| `npm run test` | Regression and policy checks. | Completes with exit code 0. |
| `npm run build` | Production build check. | Completes with exit code 0. |
| `npm audit --audit-level=moderate` | Dependency vulnerability check. | Completes with exit code 0. |
| Wording scan | Old-name and prohibited-claim check. | Remaining hits are allowed and explained. |
| Changed-file review | Scope check. | Files match approved scope. |

Do not run `npm audit fix` unless explicitly approved.
