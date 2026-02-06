# Vite + React + DaisyUI Template

Minimal Vite + React 19 starter wired with Tailwind CSS 4, DaisyUI themes, and Vitest. Use it as a foundation for your next TypeScript front-end without hauling in application-specific code.

## Features
- Vite dev server with React SWC and fast HMR.
- Tailwind CSS v4 directives with DaisyUI light/dark themes.
- Ready-to-use theme toggle with local storage persistence.
- Vitest + Testing Library configured for browser-like component tests.
- Type-driven linting via the TypeScript compiler.

## Getting Started

```bash
git clone <repo-url>
cd vite-ts-template
nvm use
npm install
npm run dev
```

Visit the dev server at `http://localhost:5173`.

## Available Scripts
- `npm run dev` – start the Vite dev server with hot module replacement.
- `npm run build` – type-check then emit a production bundle to `dist/`.
- `npm run preview` – serve the production build for smoke testing.
- `npm run test` – execute Vitest unit tests in a jsdom environment.
- `npm run lint` – run Biome for linting and formatting checks.
- `npm run lint:fix` – apply Biome fixes.
- `npm run format` – format the codebase with Biome.
- `npm run typecheck` – run TypeScript in `--noEmit` mode for static analysis.

## Project Structure
- `src/main.tsx` – entry point that mounts the React app.
- `src/App.tsx` – starter UI with hello world copy and theme toggle.
- `src/App.test.tsx` – sample Vitest suite exercising the template.
- `src/test/setup.ts` – shared Testing Library and Vitest setup.
- `src/index.css` – Tailwind directives (`@import "tailwindcss";`, `@plugin "daisyui"`) and global resets.
- `vite.config.ts` – registers React SWC, `@tailwindcss/vite`, and Vitest globals.

## Template TODO Checklist
Run through these before kicking off a new project:
- [ ] Update the project name, description, and author fields in `package.json`.
- [ ] Choose a license and add `LICENSE` if required by your organization.
- [ ] Reset or remove `README.md` sections that no longer fit your app.
- [ ] Update `.nvmrc` and `engines.node` if you need a different Node baseline.
- [ ] Decide whether to keep Biome defaults or customize `biome.json`.
- [ ] Adjust DaisyUI theme names, colors, or add additional themes in `src/index.css`.
- [ ] Replace the placeholder UI in `src/App.tsx` with your first feature.
- [ ] Add environment variables and document them in `.env.example` if needed.
- [ ] Configure CI (e.g., GitHub Actions) to run `npm run lint && npm run test`.
- [ ] Remove or tailor this checklist once setup is complete.

## Deployment
Run `npm run build`, then deploy the contents of `dist/` to your preferred static hosting provider (e.g., Vercel, Netlify, S3 + CloudFront).
