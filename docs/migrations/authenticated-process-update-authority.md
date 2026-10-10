# Authenticated Assess process update authority

Migration `20261010051413_authenticated_process_update_authority.sql` adds a narrow server authority for editing the name, description, department, and criticality of an owned Assess process. It does not change process status, discovery completion, scores, score versions, thresholds, hard stops, recommendations, or any Assess V2 decision.

Historical processes remain read-only because their new `authority_version` is `NULL`. Only processes created after the migration receive version `1`. Each accepted update requires a current server-issued tenant context, both `assess.read` and `assess.process.update`, current ownership, the exact process version, and an enabled non-read-only workspace control. The service-only RPC commits one receipt and one privileged audit with the process update.

## Install and rollout

The migration requires the exact nonproduction predecessor marker `20261010051100`. It rejects production/customer/provider authorization, marker drift, an active controlled-human exercise, pre-existing process-update schema, or a partially installed authority. The marker advances to `20261010051413` only after the complete authority installs in the same transaction.

Writes default off because installation creates no `process_update_workspace_controls` row. Enabling the boundary requires a separately authorized workspace control row. Browser, anonymous, and authenticated roles cannot update the authority columns directly or execute `update_assess_process(...)`; the Edge command route authenticates the actor and refreshes current authority before invoking the service-role RPC.

## Focused verification

`node scripts/testAuthenticatedConnectedPostgres.mjs` applies the real migration chain to disposable local PostgreSQL and verifies:

- an owned current process commits exactly one metadata update, receipt, and privileged audit;
- exact replay returns the committed resource without another effect;
- replay after ownership loss is denied without disclosing the earlier response;
- capability revocation and stale authority deny the command without writes;
- anonymous and authenticated roles cannot update authority columns or execute the RPC directly; and
- a historical `NULL`-version process remains unchanged and read-only.

The authenticated browser fixture uses the production process command route for the visible save, denial, offline, server-error, and timeout journeys. The fixture withholds dispatch for transport failures, so no deferred handler can write after the zero-effect measurement. These checks use synthetic data and disposable local PostgreSQL only and are not hosted or production evidence.

## Rollback and recovery

For operational rollback, set `enabled=false`, set `read_only=true`, or remove the workspace control row. Existing process values, receipts, and audits remain available through their existing authorized read paths. Do not null versions or delete committed history.

If an application release must be reverted, keep the migration installed and remove the process edit UI from the older release. The database continues to fail closed because writes require an explicit enabled control and current authority.

Schema removal is forward-only. A corrective migration may remove the new routine, control table, and columns only after proving no versioned process update has committed and after reconciling the hosted marker chain.
