# Deck suite verification

Verified on 2026-08-02 from `codex/avalaos-marketing-investor-client-deck-suite`, based on `origin/main` at `67295acbd6b9165d5a09f5bf02605ddb583ea919`.

## Executed evidence

| Gate | Result |
| --- | --- |
| Deterministic build | `npm.cmd --prefix tools/decks run build` — passed. The renderer diagnostic exit was normalized only after the complete four-deck manifest, named artifacts, and slide PNG counts were validated. |
| Artifact verification | `npm.cmd --prefix tools/decks run verify` — 33 checks passed, 0 failures. |
| Overflow test | Bundled `slides_test.py`, invoked through `tools/decks/scripts/run-slides-test.py` — passed for all 4 PPTX files; no overflow detected. |
| Visual review | 4 contact sheets and all 49 full-resolution slide PNGs inspected. Problem-slide collisions, brand recommendation overflow, and the long outcome-state chip were corrected and re-rendered. |
| PPTX re-import | Passed: 10 marketing, 18 client, 15 investor, and 6 brand-board slides. |
| PDF page counts | Passed: 10 marketing, 18 client, 15 investor, and 6 brand-board pages. |
| Speaker notes | Present on all 49 slides, including claim IDs, current/roadmap status, objection response, AP input, and `[Sources]` blocks. |
| Fonts | Outfit and Inter registered from bundled OFL-licensed font files. |
| Claim guard | Passed. No prohibited customer, deployment, pilot, production, compliance, market-size, autonomous-delivery, or current Assemble-generation claim was found in visible copy. |

## Output integrity

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `marketing/AvalaOS-Executive-Product-Overview.pptx` | 1,747,039 | `395005AD88567DF5D65449AA8F61D4771ED11F77F95E518FBDCC0B8DFDC584D4` |
| `marketing/AvalaOS-Executive-Product-Overview.pdf` | 788,378 | `C796233644752BDC3AD2D0FF942B10BB8FDBB4E7AB0055D021312B8686549CC0` |
| `client/AvalaOS-Client-Transformation-Deck.pptx` | 1,786,964 | `9F4FFE7B2BB8BCDBCC400020C53AEC3C29FFBBCC9C2E02DB0FDA42E7A4B9EA6A` |
| `client/AvalaOS-Client-Transformation-Deck.pdf` | 1,181,361 | `CE8161117B3C6EF94FEE36F3D7E456264DF200CD630973A3E51E0FB0CB368133` |
| `investor/AvalaOS-Investor-Deck.pptx` | 920,444 | `53FDB53DA16329EF1CEAAF41D44C9EE73FA8592AD518DE214B5155D5A7F41F79` |
| `investor/AvalaOS-Investor-Deck.pdf` | 615,177 | `8711A79D0814C5BAEE776CF225567CE6C5864C78C35067178E22EE1DD7AE45D3` |
| `brand/AvalaOS-Assemble-Brand-Evolution-Board.pptx` | 335,801 | `7A08C9DBBACDCD753B7B55CE7698765FF8848269AB8DE95C9E99E7D506C3A9CE` |
| `brand/AvalaOS-Assemble-Brand-Evolution-Board.pdf` | 250,925 | `9B2D6E9BFD07750DC304688FAD795F77FB97E36EAEF87482814C18710EB89913` |

## Five review passes

1. Product fidelity — accepted source/CI capabilities are separated from product surfaces, candidate work, deployment proof, and commercial proof.
2. Security and trust — BYOK remains architecture direction; provider availability is deployment-dependent; humans retain approval authority.
3. Narrative and audience — marketing, client, investor, modular-client, and internal-brand stories have distinct purposes and calls to action.
4. Claim integrity — all claims route through `source/claim-ledger.md`; synthetic fixtures are labelled and no fixture outcome is presented as customer evidence.
5. Visual and artifact quality — contact sheets plus every full-size slide were inspected after the final render; PPTX, PDF, notes, PNG, and font checks passed.

## Rollback

This work is isolated to `docs/marketing/decks/**` and `tools/decks/**`. Reverting the deck-suite commits removes all source, generated artifacts, and tooling without changing product runtime, UI, migrations, authorization, scoring, screenshots, or production brand assets.
