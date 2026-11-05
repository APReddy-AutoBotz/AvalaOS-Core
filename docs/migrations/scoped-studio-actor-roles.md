# Scoped Studio actor role provisioning

Migration `20261106012001_scoped_studio_actor_roles.sql` adds three optional,
exclusive Studio role variants to the existing synthetic-admin flow. It does
not modify a shared preset role. Each dedicated role retains its actor's exact
live base-role capability set and adds only the approved capabilities below.

| Variant | Required base | Added capabilities |
| --- | --- | --- |
| `studio-author` | `author` | `studio.handoffs.read`, `studio.handoffs.request`, `studio.handoffs.consume`, `studio.templates.read`, `studio.artifacts.rendition.generate`, `studio.artifacts.download` |
| `studio-reviewer` | `reviewer` | `studio.handoffs.read`, `studio.handoffs.review` |
| `studio-approver` | `approver` | `studio.handoffs.read`, `studio.handoffs.approve` |

The ten grants above are the complete increment. Existing base capabilities are
copied, not reinterpreted. A variant role with an extra or missing capability,
a stale JSON permission mirror, another member, or a shared-preset identity is
rejected whenever its binding is inserted, listed, assigned or restored.

## Private setup contract

Only a database owner/private operator setup transaction may insert
`public.synthetic_admin_studio_actor_role_bindings`. `service_role` has read
access for server operations but no insert, update or delete privilege. Binding
rows are immutable and identify recipients by exact target, account and actor
UUIDs; labels, email addresses and role names are never recipient selectors.

Before setup, verify providers are off, no campaign or route is enabled, no
authenticated synthetic exercise or permit is active, and no reservation is
reserved, uncertain or transfer-pending. Obtain the three exact active account
IDs from the already verified synthetic-admin roster. Do not query by label.

For each account, use a private transaction with explicit UUID parameters:

```sql
BEGIN;

-- Private inputs: target_id, account_id, actor_id, operator_actor_id,
-- base_preset, base_role_id, variant, and a fresh variant_role_id.
-- Resolve base_role_id from the exact target/base preset, then assert that the
-- account's auth_user_id is actor_id and its one active workspace membership
-- currently uses that base_role_id.

INSERT INTO public.roles(
  id,org_id,workspace_id,name,slug,scope,permissions,status,is_system,
  created_by,updated_by
)
SELECT
  :variant_role_id,target.org_id,target.workspace_id,
  'Dedicated scoped Studio role',:private_unique_slug,'workspace',
  to_jsonb(ARRAY(
    SELECT DISTINCT capability ORDER BY capability
    FROM unnest(
      ARRAY(SELECT capability_key FROM public.role_capabilities
        WHERE role_id=:base_role_id ORDER BY capability_key)
      || public.synthetic_admin_studio_variant_increment(:variant)
    ) capability
  )),'active',false,:operator_actor_id,:operator_actor_id
FROM public.synthetic_admin_targets target
WHERE target.id=:target_id AND target.operator_actor_id=:operator_actor_id
  AND target.enabled AND target.synthetic_only
  AND NOT target.production_authorized AND NOT target.customer_data_authorized
  AND NOT target.real_provider_calls_authorized;

INSERT INTO public.role_capabilities(role_id,capability_key)
SELECT :variant_role_id,capability
FROM (
  SELECT capability_key AS capability FROM public.role_capabilities
    WHERE role_id=:base_role_id
  UNION
  SELECT unnest(public.synthetic_admin_studio_variant_increment(:variant))
) exact_capabilities;

INSERT INTO public.synthetic_admin_studio_actor_role_bindings(
  target_id,account_id,actor_id,base_preset,base_role_id,
  variant,variant_role_id,configured_by
) VALUES(
  :target_id,:account_id,:actor_id,:base_preset,:base_role_id,
  :variant,:variant_role_id,:operator_actor_id
);

COMMIT;
```

The insertion trigger repeats the exact target/account/actor/base/variant,
tenant, membership, capability and provider-off checks. A zero-row role insert,
wrong UUID, shared role, drifted baseline, or nonempty variant role aborts the
transaction. Run this transaction once for each of the three variants; the
table permits exactly one account and one variant role per profile.

## Normal assignment and restoration

All role changes use the service-only RPC:

```text
public.synthetic_admin_assign_studio_variant(
  p_actor uuid,
  p_org uuid,
  p_workspace uuid,
  p_authorization_version bigint,
  p_fingerprint text,
  p_request_id uuid,
  p_key text,
  p_reservation_id uuid,
  p_expected_version bigint,
  p_preset text
)
```

For a bound account, `p_preset` may be only its exact variant or its recorded
base preset. Selecting the variant switches the one active workspace membership
from the base role to the dedicated role. Selecting the base restores it. Both
directions require the expected account version, current operator authority,
provider-off state and settled reservations; each increments the account and
authorization versions and writes an immutable command receipt and privileged
audit. Replays with the same key and payload return the committed response;
changed replays fail.

For an unbound account, the RPC delegates to the existing four-preset role
assignment and preserves its legacy response. Direct calls to the old
`synthetic_admin_assign_role` reject bound accounts so restoration cannot bypass
the safety checks. The roster always returns `baseRolePreset`, nullable
`studioVariant`, boolean `studioVariantActive`, and the exact
`assignableRolePresets` allowlist.

## Installed roster lookup correction

Migration `20261106012003_scoped_studio_role_lookup.sql` is the forward-only
correction for the installed roster routine. The original routine used
`binding` as both a PL/pgSQL record and a SQL join alias. PostgreSQL rejected
the normal roster query with SQLSTATE `42702` because `binding.target_id` was
ambiguous. The correction replaces only `public.synthetic_admin_list(...)`,
renames the record to `binding_row` and the join alias to `role_binding`, and
keeps the response, target authority, validation loop, ACL and fixed search path
unchanged. Its predecessor and postcondition guards reject substituted sources.

Focused disposable PostgreSQL verification must exercise an unbound account
through legacy assignment and current roster reload, plus a prebound account
before activation, after variant activation and after base restoration. Each
reload must show the exact effective role, base role, variant state, allowlist
and current account version. The route, audit, idempotency and provider-off
checks remain owned by the original role and route migrations.

## Safe fallback and rollback

Before disabling this capability, restore each bound actor through the normal
RPC to its recorded base preset and verify its refreshed authorization version
and exact base membership. Leave immutable bindings, receipts and audits in
place. Disable the Edge/UI route if restoration cannot be proven. Do not delete
bindings, rewrite audit history, mutate shared preset roles, or destructively
down-migrate. Any schema correction is a forward migration while providers stay
off and reservations remain settled.
