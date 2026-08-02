# AvalaOS marketing, client, investor deck suite and Avala Assemble brand exploration

## Summary

- Adds a premium, source-backed 10-slide executive product overview.
- Adds an 18-slide client transformation deck: 14 core slides plus consulting-partner and enterprise-CoE modules.
- Adds a 15-slide investor discussion deck with commercial inputs deliberately left for AP confirmation.
- Adds a 6-slide internal Avala Assemble brand evolution board with three original concepts and a recommended evolutionary direction.
- Adds the internal messaging and claim book, 30-claim ledger, configurable inputs, speaker notes, PDFs, slide PNGs, contact sheets, font licenses, and deterministic generation/verification tooling.

## Review entry points

- [Marketing contact sheet](marketing/thumbnails/contact-sheet.png)
- [Client contact sheet](client/thumbnails/contact-sheet.png)
- [Investor contact sheet](investor/thumbnails/contact-sheet.png)
- [Brand board contact sheet](brand/thumbnails/contact-sheet.png)
- [Messaging and claim book](AvalaOS-Messaging-and-Claim-Book.md)
- [Claim ledger](source/claim-ledger.md)
- [Verification evidence](VERIFICATION.md)

## Claim boundaries

- Deployment disposition remains **NOT DEPLOYED**; hosted, pilot, production, storage, security, compliance, and commercial readiness are not claimed.
- BYOK is described only as `BYOK-ready architecture`, `Designed for customer-controlled model access`, and deployment-dependent provider availability.
- Delivery prepares source-linked governed work; Monitor provides read-only recorded-data visibility and does not create tasks or claim live telemetry.
- Avala Assemble is explicitly labelled roadmap vision, not a current application-generation or deployment capability.
- All product captures and the AP Invoice Exception journey are synthetic; fixture counts, names, and outcomes are not customer proof.

## Executed verification

- `npm.cmd --prefix tools/decks run build` — passed through the manifest-validated renderer wrapper.
- `npm.cmd --prefix tools/decks run verify` — 33 checks passed, 0 failures.
- Bundled slide overflow test — all 4 decks passed; no overflow detected.
- Visual inspection — all 4 contact sheets and all 49 full-resolution slide PNGs reviewed.
- `npm.cmd --prefix tools/decks audit` — 0 known vulnerabilities.
- `git diff --check` — passed.

## Scope and rollback

Only `docs/marketing/decks/**` and `tools/decks/**` change. No product code, current product screenshot, public page, scoring logic, schema, migration, authorization rule, service, runtime behavior, or production brand asset changes. Revert the deck-suite commits to remove the work without affecting product behavior.
