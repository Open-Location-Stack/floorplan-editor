# Skill: dependency-updates

## Purpose
- Keep npm dependencies current with stable releases, refresh stale transitive dependencies, and verify the full repo quality gate.

## When to use
- You are asked to upgrade/update dependencies or "bring everything to latest."
- You are asked to fix `npm audit` findings.
- You need to refresh lockfile-resolved transitives that are outdated but still semver-compatible.

## Inputs
- Optional: scope (`all`, `dependencies`, `devDependencies`, or package subset).
- Optional: allowed change level (`patch/minor only` vs `latest`).
- Optional: security policy (`fail on high/critical`, `fix all possible`).

## Workflow
1) Confirm no stale test runners exist before any test command:
   - `pgrep -af "vitest|npm run test|playwright|test:e2e|node .*vitest"`
2) Inspect baseline state:
   - `npm outdated`
   - `npm audit --json`
   - `git status --short`
3) Apply updates based on requested scope:
   - Full latest sweep:
     - `npm install $(node -p 'Object.keys(require("./package.json").dependencies).map(d=>\`${d}@latest\`).join(" ")')`
     - `npm install -D $(node -p 'Object.keys(require("./package.json").devDependencies).map(d=>\`${d}@latest\`).join(" ")')`
   - Within-range transitive refresh/security:
     - `npm update`
     - `npm audit fix`
   - Targeted package update:
     - `npm install <pkg>@<version>`
4) Re-check security and staleness:
   - `npm outdated` (expect empty unless intentionally pinned)
   - `npm audit --audit-level=high`
5) Run Definition-of-Done validation in exact repo order:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run test -- --run`
   - `npm run test:browser`
   - `npm run test:e2e`
   - `npm run build`
   - Before each test command, repeat stale-runner check from step 1.
6) Report outcome with:
   - Files changed (`package.json`, `package-lock.json`, and others if any).
   - Remaining advisories or blockers.
   - Any warnings that are non-blocking (for example informational config-schema mismatch).

## Validation
- Keep `package-lock.json` committed and in sync with `package.json`.
- Do not delete lockfile unless explicitly requested.
- Do not mark task complete unless all DoD commands pass in one post-change run.
- If audit findings remain, explain whether they are actionable (`fixAvailable: true`) and why.

## Notes
- `npm install` updates direct dependencies but may keep older lockfile-resolved transitives that still satisfy ranges.
- `npm update` and `npm audit fix` are required to avoid getting stuck on stale transitive versions.
- Prefer frequent small updates (weekly lockfile refresh) plus periodic full `@latest` sweeps (monthly) to reduce risk and drift.
