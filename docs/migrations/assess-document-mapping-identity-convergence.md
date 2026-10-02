# Assess document-mapping identity convergence

Migration `20260916151050_assess_document_mapping_identity_convergence.sql` is the forward-only ledger successor for the reviewed Assess supporting-document mapping schema. It does not enable the feature, change scoring, grant privileges, authorize a provider, or alter the controlled-human backend frozen at `20260904120000`.

The migration advances the singleton hosted-nonproduction marker from `20260916003000` to `20260916151050` only when all of these conditions hold atomically:

- the product, environment class, schema contract, old marker, and old marker constraint are exact;
- production, customer-data, and real-provider authorization flags are all false;
- all twelve document-mapping relations, the default-off workspace flag, and the terminal commit RPC exist;
- no controlled-human exercise or recovery authority remains in any lifecycle;
- exactly one locked singleton marker is updated.

Explicit short-lived table locks serialize marker changes and block exercise/recovery inserts until the empty-history check and marker update commit together. Any missing, substituted, reordered, stale, ahead, unsafe, or history-bearing state is rejected. Known precondition failures raise `ASSESS_MAPPING_IDENTITY_PRECONDITION_FAILED`; malformed/missing underlying schema can also fail earlier through PostgreSQL. PostgreSQL rolls back the statement, including the temporary constraint replacement, so the prior marker and constraint remain authoritative.

## Rollback and fallback

There is no down migration. Before application, the safe fallback is to leave the database at `20260916003000`, keep `assess_document_mapping_enabled` false, and use existing Assess data read-only. After successful application, operational fallback remains feature disablement/read-only use; do not rewrite the marker or historical migration bytes. A corrective forward migration requires a separately reviewed exact precondition and ledger successor.

The PR #264 controlled-human database remains pinned to `20260904120000`; this convergence migration must not be applied to that frozen target.
