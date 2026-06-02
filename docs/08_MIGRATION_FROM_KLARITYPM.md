# Migration From KlarityPM

KlarityPM was the historical/internal prototype name for this codebase.

AvalaOS Core is the new public product direction and repository target for `APReddy-AutoBotz/AvalaOS-Core`.

## Migration Rules

- This was a controlled brand and product-positioning migration, not a rewrite.
- No scoring behavior was intentionally changed.
- No scoring regression tests were removed.
- No compliance claims were added.
- Browser-stored API keys were not reintroduced as pilot or production behavior.
- Server-side AI through Supabase Edge Functions remains the pilot and production requirement.
- KlarityFlow Health remains separate and is not renamed in this slice.

## Historical References

The old name may remain only in this migration note or archive/history context. Current user-visible product, module, metadata, and documentation surfaces should use AvalaOS Core and Avala module names.
