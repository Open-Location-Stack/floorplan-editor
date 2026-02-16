---
name: increment-slice-guardrails
description: Apply incremental delivery guardrails from planning docs by requiring vertical slices, explicit exit criteria, and architecture/risks documentation per increment.
---

# Skill: increment-slice-guardrails

## Purpose
- Keep delivery incremental, test-backed, and architecture-aware.
- Avoid big-bang implementation drift.

## Source
- `docs/IMPLEMENTATION_PLAN_V1.md` sections "2. Delivery Strategy", "7. Incremental Execution Plan", and "8. Agentic Feedback Loop for Ongoing Evolution".

## Slice Rules
- Work in small 1-3 day slices.
- Prefer vertical slices over subsystem-first expansion.
- Each slice must produce:
  - Shippable code behind stable UX behavior.
  - Tests and guardrails for introduced behavior.
  - Short ADR/changelog notes for architectural choices.

## Per-Increment Workflow
1. Identify the target increment and its exit criteria.
2. Implement only scope needed to satisfy that increment.
3. Add or update tests mapped to increment risks.
4. Record architectural decisions and follow-up risks.
5. Verify exit criteria and report any remaining gaps.

## Exit Handling
- Do not declare increment complete if any listed exit criterion is unmet.
- Carry remaining risks or out-of-scope items into explicit follow-ups.

## Notes
- Use this skill together with DoD and quality-gate skills to close an increment safely.
