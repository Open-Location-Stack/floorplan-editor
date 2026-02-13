# Repository Guidelines

## Project Structure & Module Organization
- `src/main.tsx` bootstraps the React/Vite entry point, while `src/App.tsx` renders the cost estimator UI.
- Domain logic lives in `src/lib/`, with unit tests co-located as `*.test.ts`; shared test setup is in `src/test/setup.ts`.
- `src/index.css` hosts Tailwind v4 directives (`@import "tailwindcss";`, `@plugin "daisyui"`) plus DaisyUI theme hooks; TypeScript config remains in `tsconfig*.json`.
- `vite.config.ts` registers `@tailwindcss/vite` alongside the React SWC plugin and wires Vitest globals for browser-like testing.

## Build, Test, and Development Commands
- Install dependencies with `npm install` after cloning.
- Install local git hooks once per clone with `npm run setup:hooks` (enables pre-push validation).
- `npm run dev` starts the Vite dev server at `http://localhost:5173` for live reloading.
- `npm run build` type-checks (`tsc --noEmit`) and emits a production bundle in `dist/`.
- `npm run preview` serves the built bundle locally to verify deployment artifacts.
- `npm run test` runs the Vitest suite in a jsdom environment; append flags like `--runInBand` if diagnostics need isolation.
- `npm run lint` runs Biome for formatting/linting; `npm run typecheck` performs type-driven checks via the TypeScript compiler.
- `npm run validate:all` runs the full completion gate (`typecheck`, `lint`, `test`, `test:browser`, `test:e2e`, `build`).

## Coding Style & Naming Conventions
- Use TypeScript functional components; name React components and files in PascalCase (e.g., `CostSummary.tsx`) and utilities in camelCase (`formatCurrency.ts`).
- Maintain 2-space indentation, double quotes, and trailing commas per Prettier defaults; rely on editor formatting and `npm run lint` to catch type regressions.
- Prefer Tailwind utility classes and DaisyUI primitives for styling; reserve `src/index.css` for shared tokens, `@theme` definitions, or global resets that Tailwind/DaisyUI cannot express inline.

## Testing Guidelines
- Place tests next to the code they cover as `moduleName.test.ts`; use Vitest globals (e.g., `describe`, `expect`) configured in `vite.config.ts`.
- Leverage `@testing-library/react` helpers for component behavior and `src/test/setup.ts` for shared mocks or extensions.
- Cover calculator edge cases (zero values, large areas) and user interaction flows; ensure new logic includes deterministic assertions before merging.
- Bug fix policy: each production bug fix must add at least one regression test that fails on old behavior and passes with the fix.
- Test run hygiene policy:
  - Never start a new test command if a previous test process is still running.
  - Before any new run, check for active test processes (for example `vitest`, `npm run test`, Playwright) and either wait for completion or explicitly terminate the stale run first.
  - If a prior run hangs or does not finish, kill that run, identify the root cause (e.g., infinite loop, unresolved async handle, recursive render), fix it, and only then start the next run.
  - Do not paper over hangs by repeatedly launching additional runs in parallel.

## Commit & Pull Request Guidelines
- Compose commits with short, imperative subjects (`Add halls summary row`), mirroring existing Git history and keeping them under ~72 characters.
- Document notable changes in the commit body or PR description, linking issues when relevant and noting any configuration updates.
- For PRs, provide a concise summary, test evidence (`npm run lint && npm run test`), and UI screenshots or GIFs when visuals change.
- Confirm all required commands pass locally and that builds remain warning-free prior to requesting review.

## Definition Of Done
- Do not declare a coding task complete unless all commands below pass in one final post-change run:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test -- --run`
  - `npm run test:browser`
  - `npm run test:e2e`
  - `npm run build`
- If any command fails or cannot run, report the task as not fully validated.

## Environment Notes
- Tailwind 4 no longer uses a JS config; declare content sources, plugins, and DaisyUI customizations via the directives in `src/index.css`.
- When adding path aliases or environment variables, update both `tsconfig.json` and `vite.config.ts` to keep runtime and tests aligned.

## Agent Skills
- Agentic tools should look for reusable workflows in `skills/<skill-name>/SKILL.md`.
- Use `skills/_template/SKILL.md` as the starting point for new skills and keep them short, task-focused, and validation-aware.
- IMDF guardrail policy: for any IMDF schema, IMDF import/export, IMDF validation, or IMDF editor-field change, use `skills/imdf-schema-guardrail/SKILL.md`.
- Any change incompatible with IMDF specifications is not acceptable and must be treated as a hard failure.
