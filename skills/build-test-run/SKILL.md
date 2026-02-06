# Skill: build-test-run

## Purpose
- Run, build, test, and lint the Vite + React project with repo-approved commands.

## When to use
- You need to start the dev server, build for production, run tests, or lint.
- You are asked to validate changes before review.

## Inputs
- Optional: which commands to run (dev/build/preview/test/lint).
- Optional: extra flags for test runs (e.g., `--runInBand`).

## Workflow
1) Read `AGENTS.md` to confirm the official commands.
2) If the user requested a specific task, run only that command.
3) Otherwise, default to this order for validation:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
4) For interactive usage:
   - Dev server: `npm run dev` (note it runs at `http://localhost:5173`).
   - Preview: `npm run preview` after a successful build.
5) Report results succinctly and include the exact command(s) used.

## Validation
- Use the exact npm scripts from `AGENTS.md`.
- If a command fails, stop and surface the error summary and next steps.

## Notes
- Tests run in a jsdom environment via Vitest.
- Keep output summaries short; do not paste full logs unless requested.
