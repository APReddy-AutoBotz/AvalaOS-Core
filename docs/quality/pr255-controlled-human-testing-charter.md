# PR #255 Controlled Human Testing Charter

Status: prepared, not executed. This charter authorizes no deployment, live-system access, or readiness decision.

## Purpose and proof boundary

Controlled human testing is limited to synthetic, non-evidentiary UX and product exploration of the exact immutable PR preview. It may identify usability, navigation, responsive-layout, keyboard, copy, or visible failure-state defects. It cannot clear any acceptance-catalog `BLOCKED` case, promote any of the 107 planned provenance scopes, replace an automated assertion, or authorize pilot, production, hosted tenant/RLS, security, buyer, or compliance acceptance.

The controller may hand this charter to named internal testers only after all entry gates below pass for the candidate at execution time. The charter does not hard-code a candidate commit or deploy because both identities must be resolved afresh immediately before each session.

## Execution-time identity preflight

The controller records these values in the private session record before opening a browser:

- `release_sha`: the 40-character lowercase result of `git rev-parse HEAD` on the checked-out PR branch.
- `deploy_id`: the 24-character lowercase deploy identity returned by the preview headers.
- `immutable_url`: `https://<deploy_id>--avalaos-pilot.netlify.app` with no path, query, fragment, credentials, or preview-alias substitution.
- `environment`: exactly `hosted_nonproduction_pilot`.

For both the preview alias preflight and the immutable URL, an HTTPS `HEAD /` response must be successful and must expose all three matching headers:

- `x-avalaos-release` equals `release_sha`.
- `x-avalaos-netlify-deploy-id` equals `deploy_id`.
- `x-avalaos-environment` equals `hosted_nonproduction_pilot`.

The controller must also confirm the exact-head Preview Exhaustive Browser QA workflow is green, including its immutable-preview accessibility/performance, Desktop Chrome, and Pixel 7 jobs. Any mismatch, missing header, mutable alias fallback, pending/failed required job, or candidate advancement stops the session before persona entry.

## Testers, devices, and data

- Testers: named internal humans briefed on this charter; no external users.
- Desktop: current stable Google Chrome using a new disposable browser profile at default zoom.
- Mobile: Pixel 7 viewport/device emulation in current stable Chrome DevTools, using a separate disposable browser profile.
- Data: only the product's bundled synthetic sandbox personas and synthetic records.
- Prohibited inputs: customer or employee data, PHI, credentials, tokens, secrets, real provider state, real BYOK configuration, production identifiers, or copied live-system content.

The seven bounded personas are Process Analyst, AP Process Owner, Delivery Lead, Control Reviewer, Automation Contributor, Buyer Viewer, and Platform Admin.

## Allowed observational flows

Each device pass begins at the immutable URL, observes the public landing and `/sandbox`, and then uses each persona exactly once. The tester may use navigation, scope selection among bundled synthetic records, theme controls, keyboard traversal, viewport rotation/resizing within the device profile, refresh, and sign-out. The representative surface is:

| Persona | Required read-only surface |
| --- | --- |
| Process Analyst | Assess → Process Catalog |
| AP Process Owner | Assess → Process Catalog |
| Delivery Lead | Delivery → Overview / Board |
| Control Reviewer | Delivery → Overview / Board |
| Automation Contributor | Delivery → Overview / Board |
| Buyer Viewer | Monitor |
| Platform Admin | Admin / Intelligence |

On every persona path, the tester observes that the selected identity is visible, the representative lazy-loaded surface finishes rendering, content remains within the viewport, keyboard focus is visible and ordered, and sign-out returns to the synthetic Sandbox selector. Observation must not create, edit, approve, delete, export, download, upload, invite, enable, execute, or persist a business record.

`/sandbox` and its descendants are accepted Sandbox routes. They must not be reported as denied-route proof. `/sign-in` remains the separate server-authenticated entry surface and must never expose Sandbox persona selection.

## Immediate stop conditions

Stop the affected device session, make no further product interactions, and notify the controller when any of these occurs:

- release SHA, deploy ID, immutable URL, or required response-header mismatch;
- any credential-bearing, provider, BYOK, mutation, authority, websocket, event-stream, or unexpected-origin request;
- provider/network traffic after sign-out or traffic that appears after the bounded observer quiescence point;
- accepted-versus-denied route confusion, including treating an accepted `/sandbox/*` descendant as denial evidence;
- persona, tenant, workspace, project, or view state surviving sign-out unexpectedly;
- a request to use real customer, employee, PHI, provider, BYOK, credential, secret, production, or live-system state;
- navigation to `avalaos.com`, another production target, or any non-chartered external surface;
- unexpected mutation, export/download, external side effect, authentication prompt, data disclosure, or inability to return to the Sandbox selector;
- any instruction to bypass, weaken, skip, or reinterpret a failed automated or human gate.

Do not retry against another branch, mutable alias, deployment, environment, persona, or live system as a workaround.

## Excluded acceptance cases

The following 15 server-authority or otherwise blocked cases are excluded from human execution and remain `BLOCKED`. A human observation must not clear, pass, or supply proxy evidence for them:

- `ASSESS-002`
- `ASSESS-003`
- `DELIVERY-009`
- `MONITOR-001`
- `MONITOR-002`
- `MONITOR-003`
- `MONITOR-004`
- `ADMIN-002`
- `ADMIN-003`
- `E2E-002`
- `E2E-005`
- `E2E-006`
- `E2E-007`
- `SAFETY-001`
- `SAFETY-003`

## Sanitized text-only defect record

For each observation, record only: private session ID, execution-time release SHA and deploy ID, device, persona, surface, expected visible behavior, sanitized actual visible behavior, reproduction steps using synthetic labels, severity, and `STOPPED` or `OBSERVED`. Do not capture or attach screenshots, video, traces, HAR files, console dumps, raw network logs, response bodies, header dumps, signed URLs, storage identifiers, customer data, PHI, credentials, tokens, secrets, literal unexpected origins, or production infrastructure identifiers.

Allowed final session dispositions are `STOPPED`, `COMPLETED_WITH_FINDINGS`, or `COMPLETED_NO_OBSERVED_UX_DEFECTS`. None is an acceptance-catalog `PASS` or a readiness verdict.

## Rollback and read-only fallback

Human testing has no deployment or data rollback authority. On a stop condition, close the disposable browser profiles, preserve only the sanitized text record, leave the immutable preview unchanged, and return control to the PR controller. Do not redeploy, mutate hosted state, delete evidence, clean repository state, or switch to another candidate.

If a code rollback is required, the controller must revert the complete coherent PR #255 remediation set that introduced the affected behavior and simultaneously stop acceptance publication and human testing. Older provenance, assertion, composite-evidence, observer, or report validators must not be used to accept newer artifacts. The safe fallback is read-only review of the last controller-verified exact immutable preview while a forward fix is prepared.

## Explicit non-claims

Preparation or completion of this charter is not pilot readiness, production readiness, deployment acceptance, hosted tenant authorization, RLS or tenant-isolation proof, server-authority proof, security certification, compliance certification, buyer acceptance, accessibility certification, performance certification, operational readiness, or permission to merge or mark PR #255 Ready.
