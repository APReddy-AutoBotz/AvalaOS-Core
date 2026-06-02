# No Formula Change Without Versioning

- Any change to:
  - weights
  - variables
  - transforms
  - thresholds
  - modifiers
  - hard-stop rules
  requires:
  1. score version increment
  2. regression run
  3. change log note
- Unversioned score changes are release blockers.