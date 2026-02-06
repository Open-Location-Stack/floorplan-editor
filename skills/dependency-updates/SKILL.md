# Skill: dependency-updates

## Purpose
- Safely update npm dependencies and verify the project still builds and tests.

## When to use
- You are asked to update dependencies, refresh the lockfile, or address security advisories.
- You need to align versions after adding/removing packages.

## Inputs
- Optional: target packages and version ranges.
- Optional: constraints (e.g., only patch/minor).

## Workflow
1) Inspect `package.json` and `package-lock.json` for current versions.
2) Choose the update approach:
   - Targeted: `npm install <pkg>@<version>`.
   - Batch: `npm update` (respects semver ranges).
3) If the user specifies constraints (patch/minor), honor them.
4) After updating, run validation in this order unless instructed otherwise:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
5) Summarize updated packages and note any breaking changes or required follow-ups.

## Validation
- Ensure `package-lock.json` stays in sync with `package.json`.
- Do not delete the lockfile unless explicitly asked.

## Notes
- Prefer targeted updates when only a few packages are requested.
- If upgrades could be breaking (major bumps), call that out before proceeding.
