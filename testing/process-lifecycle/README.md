# Governed process-lifecycle fixtures

This directory contains deterministic, synthetic fixtures for the governed multi-source transcript acceptance suites. The fixtures contain no customer data, provider secrets, storage locators, signed URLs, or live infrastructure identifiers.

PR A owns the Assess transcript, provider-mock, authority, recovery, and evidence contracts in this directory. Studio, Delivery, Monitor, and cross-module handoff scenarios remain reserved for PR B and PR C.

Run-specific sanitized results belong under ignored `output/process-lifecycle/<base-git-sha>/<working-tree-digest>/<run-attempt>/`; they are never treated as hosted or real-provider proof. Each executed assertion emits its actual runtime persona, effective canonical capabilities, organization, workspace, fixture IDs, and explicit source-set/input-bundle/extraction/candidate/Assess lineage. The evidence runner preserves that emitted context, binds it through canonical SHA-256 context, marker, command-record, and stdout digests, and the independent verifier compares it with the governed per-assertion expectation. Registry context is used only for explicit `executed: false` / `not_run` records.

Persona and emitted capability arrays must be sorted, unique, and present in the authoritative capability inventory parsed from the repository's ordered migration chain. `AUTH-001` through `AUTH-004` are owned only by the exact API command assertions; unrelated PostgreSQL, default-off, and browser checks cannot produce them. A green command exit without every exact registered marker is not evidence. The verifier rejects duplicate assertion records and requires the exact governed cardinality: 194 executed records plus six explicit `not_run` records, 200 total.
