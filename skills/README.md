# Skills

This directory is for agentic coding tools (Codex, Claude Code, etc.). Each skill
lives in its own folder and exposes a `SKILL.md` file at that folder's root.

## Structure
- `skills/<skill-name>/SKILL.md`
- Optional: `skills/<skill-name>/references/`, `scripts/`, or `assets/`

## Conventions
- Keep skill names lowercase with hyphens.
- `SKILL.md` should be short, task-focused, and include:
  - When to use the skill
  - Required inputs
  - Step-by-step workflow
  - Validation or test guidance

## Template
See `skills/_template/SKILL.md` for a starting point.

## Included skills
- `build-test-run`: run, build, test, lint, and preview the app.
- `dependency-updates`: update npm dependencies and verify the project.
- `project-setup`: install dependencies, reset node_modules when needed, and verify setup.
