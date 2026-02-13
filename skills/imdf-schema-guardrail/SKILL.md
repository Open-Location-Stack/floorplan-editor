# Skill: imdf-schema-guardrail

## Purpose
- Enforce IMDF schema compatibility for all IMDF-related code changes and prevent alias regressions.

## When to use
- Any change under `src/lib/imdf/**`.
- Any change to feature property typing in `src/lib/types.ts`.
- Any change to IMDF import/export/validation paths.
- Any change to IMDF-facing editor UI in `src/components/Sidebar/**` or `src/features/editor/**`.
- Any change to IMDF fixtures/tests in `src/lib/imdf/**`.

## Inputs
- OGC IMDF 1.0.0 specification as source of truth.
- Changed files in the current diff.

## Workflow
1) Identify all IMDF entities touched and confirm required/optional properties from spec.
2) Validate canonical mapping in code:
   - Feature type consistency.
   - Level reference consistency.
   - Building reference consistency.
   - Relationship/containment consistency.
3) Reject duplicate semantic aliases in new code unless explicitly required for compatibility tests.
4) Verify containment relationships are generated from hierarchy logic and are not user-editable.
5) Update tests/fixtures with canonical schema expectations for changed paths.
6) Run the full done gate before declaring completion.

## Validation
- `npm run typecheck`
- `npm run lint`
- `npm run test -- --run`
- `npm run test:browser`
- `npm run test:e2e`
- `npm run build`

## Notes
- IMDF incompatibility is a hard failure.
- If extension data is needed, namespace it under `formation:*`.
- Relationship features should be derived from containment hierarchy and not exposed as a user-editable feature type.
