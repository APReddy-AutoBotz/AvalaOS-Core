---
name: process-template-pack-builder
description: Use this supplemental skill when creating or updating Avala Assess process template packs.
---

Process Template Pack Builder

## Goal
Create reusable process templates that preserve standardization while allowing controlled organization-specific customization.

## Instructions
1. Build template packs using this taxonomy:
   - Process Family
   - Template Name
   - Description
   - Default Inputs
   - Default Questions
   - Default Risks
   - Default Recommendation Hints
2. Keep core scoring fields standardized.
3. Separate:
   - system-agnostic process structure
   - system context (SAP, Oracle, email+Excel, etc.)
4. Add sensible defaults for starter packs.
5. Mark customizable vs fixed fields.

## Constraints
- Do not hardwire templates to a single ERP.
- Do not let custom fields silently alter core scoring.
- Do not create duplicate templates with overlapping intent.

## Output Format
- Template Pack Summary
- Template Definitions
- Core Fields
- Optional Custom Fields
- Validation Notes
