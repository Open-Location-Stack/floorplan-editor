# Repository Guidelines

## Project Structure & Module Organization
- `src/main.tsx` bootstraps the React/Vite entry point, while `src/App.tsx` renders the cost estimator UI.
- Domain logic lives in `src/lib/`, with unit tests co-located as `*.test.ts`; shared test setup is in `src/test/setup.ts`.
- `src/index.css` hosts Tailwind v4 directives (`@import "tailwindcss";`, `@plugin "daisyui"`) plus DaisyUI theme hooks; TypeScript config remains in `tsconfig*.json`.
- `vite.config.ts` registers `@tailwindcss/vite` alongside the React SWC plugin and wires Vitest globals for browser-like testing.

## Build, Test, and Development Commands
- Install dependencies with `npm install` after cloning.
- `npm run dev` starts the Vite dev server at `http://localhost:5173` for live reloading.
- `npm run build` type-checks (`tsc --noEmit`) and emits a production bundle in `dist/`.
- `npm run preview` serves the built bundle locally to verify deployment artifacts.
- `npm run test` runs the Vitest suite in a jsdom environment; append flags like `--runInBand` if diagnostics need isolation.
- `npm run lint` runs Biome for formatting/linting; `npm run typecheck` performs type-driven checks via the TypeScript compiler.

## Coding Style & Naming Conventions
- Use TypeScript functional components; name React components and files in PascalCase (e.g., `CostSummary.tsx`) and utilities in camelCase (`formatCurrency.ts`).
- Maintain 2-space indentation, double quotes, and trailing commas per Prettier defaults; rely on editor formatting and `npm run lint` to catch type regressions.
- Prefer Tailwind utility classes and DaisyUI primitives for styling; reserve `src/index.css` for shared tokens, `@theme` definitions, or global resets that Tailwind/DaisyUI cannot express inline.

## Testing Guidelines
- Place tests next to the code they cover as `moduleName.test.ts`; use Vitest globals (e.g., `describe`, `expect`) configured in `vite.config.ts`.
- Leverage `@testing-library/react` helpers for component behavior and `src/test/setup.ts` for shared mocks or extensions.
- Cover calculator edge cases (zero values, large areas) and user interaction flows; ensure new logic includes deterministic assertions before merging.

## Commit & Pull Request Guidelines
- Compose commits with short, imperative subjects (`Add halls summary row`), mirroring existing Git history and keeping them under ~72 characters.
- Document notable changes in the commit body or PR description, linking issues when relevant and noting any configuration updates.
- For PRs, provide a concise summary, test evidence (`npm run lint && npm run test`), and UI screenshots or GIFs when visuals change.
- Confirm all required commands pass locally and that builds remain warning-free prior to requesting review.

## Environment Notes
- Tailwind 4 no longer uses a JS config; declare content sources, plugins, and DaisyUI customizations via the directives in `src/index.css`.
- When adding path aliases or environment variables, update both `tsconfig.json` and `vite.config.ts` to keep runtime and tests aligned.

## Agent Skills
- Agentic tools should look for reusable workflows in `skills/<skill-name>/SKILL.md`.
- Use `skills/_template/SKILL.md` as the starting point for new skills and keep them short, task-focused, and validation-aware.
