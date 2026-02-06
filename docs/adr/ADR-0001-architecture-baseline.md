# ADR-0001: V1 Architecture Baseline

## Status
Accepted

## Context
The repository started as a template and needs to support a floor plan editor with map rendering, geometry utilities, persistence, and import/export while remaining maintainable.

## Decision
Adopt bounded modules under `src/lib/`:
- `config`: runtime configuration contract.
- `map`: map lifecycle and source/layer management.
- `geometry`: deterministic area/length and unit conversion utilities.
- `editor`: command-based feature state with undo/redo.
- `validation`: strict GeoJSON input validation.
- `importExport`: normalization and deterministic export formatting.
- `persistence`: versioned IndexedDB repository.
- `logging`: lightweight structured client logging.

UI is split into `src/components/` and `src/features/`.

## Consequences
- Clear ownership boundaries for future increments.
- Domain logic remains testable without rendering the full UI.
- Some advanced behaviors (full map drawing interactions and IMDF adapters) remain phased follow-up work.
