# FORMATION Building & Floor Plan Editor - V1 Implementation Plan

## 1. Outcomes for Version 1
- Deliver a production-ready, browser-based floor plan editor with:
  - Map rendering via MapLibre + MapTiler basemap.
  - Floor image overlay alignment.
  - Draw/edit/select/delete for points, lines, polygons.
  - Measurements (area/length) with unit conversions.
  - Local-first project persistence (IndexedDB).
  - GeoJSON import/export with validation.
- Achieve maintainability standards:
  - Clear module boundaries.
  - Automated quality gates.
  - High-confidence tests for critical paths.

## 2. Delivery Strategy
- Work in small increments (1-3 day slices).
- Each slice must produce:
  - Shippable code behind stable UX behavior.
  - Tests and guard rails for introduced functionality.
  - Short ADR/changelog note for architectural decisions.
- Prefer vertical slices over big-bang subsystem builds.

## 3. Sub-Agent Model (Execution Roles)
Use dedicated sub-agents (or equivalent focused workstreams) with strict ownership:

1. `Architecture Agent`
- Owns boundaries, ADRs, cross-module contracts, dependency decisions.
- Rejects coupling violations and undocumented architectural drift.

2. `Map Agent`
- Owns MapLibre bootstrapping, sources/layers lifecycle, MapTiler integration.
- Ensures map performance and stable map interaction model.

3. `Geometry Agent`
- Owns geospatial utilities (`@turf/turf`, `proj4`) and deterministic calculations.
- Enforces numeric precision policy and invariant checks.

4. `Editor Agent`
- Owns drawing/editing workflows, selection model, undo/redo.
- Preserves UX consistency across all geometry types.

5. `Data Agent`
- Owns import/export adapters (GeoJSON first, IMDF later), schemas, validation.
- Prevents malformed data from entering domain state.

6. `Persistence Agent`
- Owns IndexedDB repository, migrations, and offline reliability.
- Guarantees backward-compatible project loading.

7. `Quality Agent`
- Owns tests, lint/type gate hardening, CI workflow, coverage thresholds.
- Blocks merges when guard rails regress.

## 4. Quality Bar and Guard Rails
- Mandatory checks on every PR/merge:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Add CI pipeline to run checks on push + PR.
- Add required status checks in repo settings.
- Add branch protection for mainline.
- Enforce conventional, focused commits and PR templates with test evidence.

## 5. Test Strategy
- Unit tests:
  - Geometry math, conversions, projection helpers, validators.
- Component tests:
  - Tool modes, selection state, edit interactions, keyboard behavior.
- Integration tests:
  - Import -> edit -> save -> reload -> export workflows.
- E2E smoke (Playwright):
  - App boots, map renders, create polygon, measurement visible, save/load works.
- Coverage targets for V1:
  - 85%+ on core domain modules (`src/lib/**`).
  - 70%+ on UI interaction modules.

## 6. Architecture Baseline (Target)
- `src/lib/map/`: map setup, source/layer registry, map event adapters.
- `src/lib/geometry/`: all calculations and topology helpers.
- `src/lib/editor/`: tool state machine, commands, undo/redo.
- `src/lib/validation/`: schema + business-rule validators.
- `src/lib/importExport/`: GeoJSON/IMDF adapters.
- `src/lib/persistence/`: IndexedDB gateway + migrations.
- `src/components/`: presentational + container UI components.
- `src/features/`: vertical feature composition when complexity grows.

## 7. Incremental Execution Plan

### Increment 0: Foundations and Guard Rails
- Add CI workflow and PR template.
- Add `.env.example` with `VITE_MAPTILER_API_KEY`.
- Add runtime config validator for required env vars.
- Add test harness improvements and baseline coverage reporting.
- Exit criteria:
  - CI green on all required checks.
  - Missing API key produces explicit UI error state.

### Increment 1: Map Core
- Integrate MapLibre map container with MapTiler style.
- Implement map lifecycle and resize handling.
- Add source/layer manager abstraction (avoid ad-hoc map calls in UI).
- Tests:
  - Map bootstrap unit tests (mocked).
  - Basic render smoke test.
- Exit criteria:
  - Deterministic map initialization.
  - Clean separation between React and map imperative API.

### Increment 2: Geometry Service
- Implement reusable measurement utilities (area, length, units).
- Add precision/rounding policy and regression fixtures.
- Tests:
  - Deterministic numeric tests, edge cases, large geometry inputs.
- Exit criteria:
  - Geometry outputs stable and verified across representative datasets.

### Increment 3: Editing MVP
- Introduce drawing/editing controls and feature selection.
- Implement command-based undo/redo stack.
- Add keyboard shortcuts and state synchronization between map + UI.
- Tests:
  - Command stack tests.
  - Selection/edit flow component tests.
- Exit criteria:
  - Users can create/edit/delete geometry with reliable undo/redo.

### Increment 4: Persistence MVP
- Add IndexedDB project repository and versioned schema.
- Auto-save with debounced writes and explicit save status indicator.
- Tests:
  - Migration tests.
  - Save/load round-trip integration tests.
- Exit criteria:
  - Created projects survive reload and schema upgrades.

### Increment 5: GeoJSON Import/Export
- Add strict import validation and user-facing error diagnostics.
- Implement normalized internal model mapping.
- Add export pipeline with deterministic output formatting.
- Tests:
  - Invalid/valid import fixtures.
  - Export round-trip correctness tests.
- Exit criteria:
  - Reliable import/export for supported GeoJSON feature types.

### Increment 6: Floor Plan Overlay Alignment
- Add image upload and corner-based georeferencing controls.
- Persist overlay transforms per floor/level.
- Tests:
  - Transform persistence and reload behavior.
- Exit criteria:
  - Overlay alignment is editable, persisted, and predictable.

### Increment 7: Hardening and Release Readiness
- Performance tuning for large feature sets.
- Error boundary + structured client logging.
- Accessibility and keyboard audit for core flows.
- E2E smoke suite and release checklist.
- Exit criteria:
  - V1 release candidate with documented known limitations.

## 8. Agentic Feedback Loop for Ongoing Evolution
- Every increment outputs:
  - `docs/adr/ADR-xxxx-<topic>.md` for architecture decisions.
  - `docs/changelog/increment-xx.md` with scope, risks, and follow-ups.
- Add lightweight observability:
  - Client-side error reporting hook.
  - Performance marks around heavy edit operations.
- Add backlog hygiene loop:
  - Classify defects as architecture, correctness, UX, or performance.
  - Feed recurring issue types into coding standards/tests.
- Quarterly refactoring budget:
  - Reserve planned effort to reduce complexity and retire temporary patterns.

## 9. Definition of Done (Per Increment)
- Feature behavior implemented and documented.
- Tests added/updated and passing in CI.
- No lint/type/build regressions.
- Public interfaces reviewed for stability.
- Failure modes handled with actionable messages.

## 10. Immediate Next Actions
1. Create branch `codex/v1-increment-0-foundations`.
2. Implement Increment 0 end-to-end (CI, env contract, guard rails).
3. Run full checks and open PR with:
   - Test evidence.
   - Risk notes.
   - ADR for architecture baseline.
