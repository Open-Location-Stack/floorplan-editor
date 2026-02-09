# Branch Protection Guardrails

Apply these settings to the default branch in GitHub repository settings.

## Required status checks
Require these CI jobs to pass before merge:
- `typecheck`
- `lint`
- `unit-tests`
- `browser-smoke`
- `e2e`
- `build`

## Recommended protection settings
- Require pull request before merging.
- Require approvals (at least 1).
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.
- Do not allow bypassing required checks.
- Do not allow force pushes.

## Why
These checks prevent shipping regressions from type errors, lint issues, test failures,
MapLibre/browser-only failures, and build-time breakages.
