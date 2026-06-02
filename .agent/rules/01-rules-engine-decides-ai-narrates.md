# Rules Engine Decides, AI Narrates

- Deterministic business logic is the source of truth.
- LLM output may explain, summarize, and format.
- LLM output may not:
  - change scores
  - alter formulas
  - alter thresholds
  - override approval logic
  - silently change recommendation categories
- If deterministic logic and narrative conflict, deterministic logic wins.