---
name: increment-definition-of-done
description: Apply the per-increment definition of done from the planning docs and block completion claims until behavior, tests, interfaces, and failure handling are all covered.
---

# Skill: increment-definition-of-done

## Purpose
- Enforce the per-increment Definition of Done captured in planning docs.
- Prevent marking work complete when quality evidence is incomplete.

## Source
- `docs/IMPLEMENTATION_PLAN_V1.md` section "9. Definition of Done (Per Increment)".

## Workflow
1. Verify feature behavior is implemented and documented.
2. Verify tests were added or updated for changed behavior.
3. Run required quality checks and ensure they pass in CI/local validation.
4. Confirm no lint, typecheck, or build regressions are introduced.
5. Review changed public interfaces for stability and backward compatibility.
6. Confirm failure modes are handled with actionable user-facing messages.
7. If any item fails, mark work as not done and continue iteration.

## Completion Criteria
- Treat the increment as done only when every DoD item is satisfied together.
- Report unmet items explicitly instead of using partial completion language.

## Notes
- This skill captures planning-level DoD. If repo-level gates are stricter, follow the stricter gates.
