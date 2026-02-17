# Skill: imdf-schema-guardrail

## Purpose

The main goal of this project is being able to work with IMDF floor plans produced by third party tools and to be able to produce new IMDF floor plans.

- Enforce IMDF schema compatibility for all IMDF-related code changes and prevent regressions, rogue schema breakage, rogue property additions, etc.
- Anything non standard should be removed after confirming.

## When to use
- Any change under `src/lib/imdf/**`.
- Any change to feature property typing in `src/lib/types.ts`.
- Any change to IMDF import/export/validation paths.
- Any change to IMDF-facing editor UI in `src/components/Sidebar/**` or `src/features/editor/**`.
- Any change to IMDF fixtures/tests in `src/lib/imdf/**`.

## Inputs
- OGC IMDF 1.0.0 specification as source of truth.

## IMDF compatibility

- Use only property names from the official IMDF specifications.
- Current use of non IMDF sanctioned properties is to be discouraged/discontinued ASAP
- Backward compatibility with earlier development releases of this project is explicitly NOT a goal.
- Apple IMDF properties from earlier versions support should be lenient: normalize on import but do not preserve
- (currently broken) Avoid duplicating name e.g. building_id and buildingId and use only the official names.
- (currently broken) Category values are tricky as there are many things that have a category in IMDF but they are effectively very different in which categories are supported on each. Examples, amenities categories would be different from openings categories. Refer to the specification for correct values and do not assume they can be reused.
  - Do not use enums for this as legacy categories and non standard categories may appear in imported data and may need to be supported
  - Do not normalize these fields
  - In the UI use a combo box style free form text input with a popup to select common values in that context

## FORMATION Extensions to IMDF

- We added the ability to associate a scaled and rotated bitmap with a level. The properties for this should remain supported.
- Geometries and bitmaps can be locked. That state is stored separately from the floor plan data and linked by id

## Openings and Relations

- Openings are stored as path segments that connect to each other by id. Additionally relations are used to construct relations between features.
- Semantics for both are defined by the IMDF specification. Do not improvise new ways to interpret this
- The goal of openings is to construct a navigation graph for dijkstra style routing across levels. This graph is transient data that should NOT be stored in the IMDF data and is not to be exported with it.

## Workflow

- When adding new properties or data types consider whether they are IMDF standard. If not, confirm before adding them.
- Avoid mixing non standard properties with standard ones. If they are needed at all.
- When tests break always prioritize IMDF specification compliance.

## Validation
- Run the full completion gate chain defined in `skills/build-test-run/SKILL.md`.

## Notes
- IMDF incompatibility is a hard failure.
- If extension data is needed, namespace it under `formation:*`. Be very conservative with this and confirm any new properties with the user.
- Relationship features should be derived from containment hierarchy and not exposed as a user-editable feature type. The place from which features are created (a level or a unit) indicates containment. Containment relations should not be editable.
