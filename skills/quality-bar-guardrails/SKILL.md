---
name: quality-bar-guardrails
description: Enforce mandatory validation guardrails from planning docs, including required checks on each PR or merge and guardrail regression blocking.
---

# Skill: quality-bar-guardrails

## Purpose
- Preserve the quality bar and avoid guardrail regressions.
- Standardize validation evidence for PR and merge readiness.

## Source
- `docs/IMPLEMENTATION_PLAN_V1.md` sections "4. Quality Bar and Guard Rails" and "5. Test Strategy".
- `docs/TECHNICAL_PLAN.md` section "10. Testing and Quality Gates".

## Required Checks
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

## Workflow
1. Run all required checks before declaring readiness.
2. If any check fails, treat it as a hard stop and fix before proceeding.
3. Ensure test coverage includes impacted layer(s): unit, component, integration, and smoke where relevant.
4. Include concise test evidence in the change summary or PR notes.
5. Reject completion if guardrails were weakened without explicit architectural decision.

## Validation Expectations
- Mandatory checks pass in one post-change run.
- No unexplained skips for quality checks.
- New functionality ships with corresponding automated tests.

## Notes
- If branch protection and CI policies exist, align local validation with those policies.
