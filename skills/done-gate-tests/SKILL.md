---
name: done-gate-tests
description: Enforce completion gating by running the full validation suite and only declaring work done when all required checks pass.
---

# Skill: done-gate-tests

## Purpose
- Prevent false "done" states by requiring full local validation before final handoff.

## When to use
- Any coding task that changes source code, tests, config, build tooling, or dependencies.
- Any request that asks if a fix is complete, stable, or ready.

## Inputs
- Repository root with npm scripts configured.
- Optional: list of changed files to include in the final report.

## Workflow
1) After implementing changes, run the required validation commands from repo root in this exact order:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test -- --run`
   - `npm run test:browser`
   - `npm run test:e2e`
   - `npm run build`
2) If any command fails:
   - Do not declare completion.
   - Fix the issue and rerun the full sequence.
3) Only after all commands pass, summarize completion and include the commands that were run.
4) If a command cannot be run due to environment constraints, explicitly state that the task is not fully validated.

## Validation
- Required gate is green only when all six commands succeed in one post-change run.

## Notes
- For documentation-only edits, this skill can be skipped if no executable code changed.
- If e2e is flaky, rerun once; if still failing, report as not done.
