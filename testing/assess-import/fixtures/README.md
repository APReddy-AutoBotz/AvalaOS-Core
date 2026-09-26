# Synthetic Assess import fixtures

All files are fictional. The meeting and SOP intentionally disagree on manual effort; no confidence score may silently resolve that conflict. Unknown volume and application permissions must remain unknown. The transcript contains a deliberate prompt-injection line, and the CSV contains inert formula-looking text.

`tests/fixtures/assessImportSpreadsheets.ts` generates bounded XLSX bytes in memory for parser and browser tests. The generator supports multiple sheets, explicit coordinates and hostile ZIP variants. Generated workbooks are test artifacts, not application dependencies. Formula expressions/cached values, hidden sheets and spreadsheet error cells are excluded with visible warnings. Numeric date serials are retained as raw numbers and are not guessed into dates.

These fixtures do not prove hosted provider behavior, document truth, evidence approval or production readiness.
