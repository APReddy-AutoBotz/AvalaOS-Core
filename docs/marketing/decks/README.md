# AvalaOS deck suite

This directory contains one source-backed visual system and four editable presentations:

- Marketing / Executive Product Overview — 10 slides.
- Client Transformation Deck — 14 core slides plus 4 modular appendix slides.
- Investor Deck — 15 slides.
- Avala Assemble Brand Evolution Board — 6 internal slides.

The source pack includes the narrative, claim ledger, configurable inputs, external-input register, and visual system. Every external claim is mapped to a claim ID and speaker-note source block. Every committed product screenshot is labelled as a synthetic product preview.

## Build

The isolated generator is under `tools/decks/` and uses the Codex-bundled `@oai/artifact-tool` runtime. From the repository root:

```powershell
npm.cmd --prefix tools/decks install
node C:\Users\mailt\.codex\plugins\cache\openai-primary-runtime\presentations\26.801.11242\skills\presentations\container_tools\setup_artifact_tool_workspace.mjs --workspace tools/decks
npm.cmd --prefix tools/decks run build
npm.cmd --prefix tools/decks run verify
```

Generated PPTX, PDF, slide PNG, and contact-sheet outputs are committed with the editable source. The PDF files are deterministic full-slide render exports.

See `VERIFICATION.md` for executed results, artifact hashes, and rollback guidance.

## Boundaries

- No product component, service, scoring, authorization, RLS, migration, Edge, runtime, public page, current screenshot, or production brand asset is modified.
- Studio private artifacts remain candidate-only.
- Delivery and Monitor are described with the accepted handoff/visibility split.
- Avala Assemble remains a visibly labelled roadmap vision.
