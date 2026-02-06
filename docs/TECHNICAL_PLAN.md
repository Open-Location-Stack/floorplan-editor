# FORMATION Building & Floor Plan Editor - Technical Plan

## 1. Technical Goals
- Build a browser-based, map-first floor plan editor that is fast, reliable, and easy for non-GIS users.
- Use `maplibre-gl` for rendering and interaction.
- Use MapTiler-hosted vector/raster tiles for basemap and context.
- Keep geometry editing precise, deterministic, and testable.
- Preserve offline/local-first behavior with robust local persistence.

## 2. Core Technology Stack
- Frontend framework: React + TypeScript + Vite (existing project standard).
- Map rendering: `maplibre-gl`.
- Basemap/tiles: MapTiler APIs (API key supplied by user at runtime/config).
- UI components: Tailwind CSS v4 + DaisyUI (existing project standard).
- State management:
  - App/UI state: React state + context (expand to Zustand only if complexity grows).
  - Server/cache sync: `@tanstack/react-query` for async workflows and retry behavior.
- Local persistence:
  - Primary: IndexedDB via `idb` for floor/building datasets.
  - Optional export fallback: local file download/import (GeoJSON, IMDF package parts).

## 3. Geospatial Libraries (Widely Used Choices)
- `@turf/turf` (or selective `@turf/*` modules):
  - Area/length calculations, buffers, intersections, clipping, transforms.
  - Industry-standard JS geospatial toolkit for browser use.
- `proj4`:
  - Coordinate transforms when ingesting non-WGS84 source data.
- `mapbox-gl-draw` with MapLibre compatibility package (or MapLibre-native draw control):
  - Interactive geometry drawing/editing (points, lines, polygons).
- `martinez-polygon-clipping` (optional advanced ops):
  - Robust polygon boolean operations where Turf precision/performance may be limiting.
- `geojson-validation` (or schema-based validation with `zod` + custom checks):
  - Validate imported GeoJSON structure before editing pipeline.

## 4. Map + Tiles Integration Plan
- Add MapLibre map bootstrapping module in `src/lib/map/`.
- Configure base style URL and tile sources from MapTiler.
- API key handling:
  - Use Vite env var `VITE_MAPTILER_API_KEY`.
  - Never hardcode keys in source.
  - Add `.env.example` with placeholder key name.
- Support style switching (e.g., streets/satellite/light) via MapTiler style URLs.
- Add graceful fallback UI when key is missing/invalid.

## 5. Data Model and Domain Modules
- Keep a GeoJSON-first internal model for editing operations.
- Recommended module boundaries in `src/lib/`:
  - `geometry/`: geometric operations and measurement utilities.
  - `projection/`: CRS conversion helpers (proj4 wrappers).
  - `validation/`: GeoJSON/IMDF validators.
  - `importExport/`: IMDF + GeoJSON read/write adapters.
  - `persistence/`: IndexedDB repository and versioned migrations.
  - `map/`: MapLibre setup, layer/source registry, draw bindings.

## 6. Editing and Interaction Workflow
- Drawing:
  - Create/edit/select/delete tools for points, lines, polygons.
  - Snapping support (grid/vertex) where feasible.
- Measurement:
  - Live area and length readouts via Turf.
  - Unit controls (m, ft, m2, ft2) with deterministic conversion.
- Floor overlays:
  - Support image overlays (georeferenced via corner control points).
  - Persist transform parameters per floor.
- Undo/redo:
  - Command stack over immutable feature snapshots or operation diffs.

## 7. Import/Export Strategy
- Import:
  - GeoJSON (required).
  - IMDF entities phased in by priority (venues/buildings/levels/units/openings/pathways).
- Export:
  - GeoJSON export of edited layers.
  - IMDF-compliant package export for supported entities.
- Validation gate:
  - Pre-import structural validation.
  - Pre-export consistency checks with actionable errors.

## 8. Persistence and Sync
- Local-first baseline:
  - Store projects in IndexedDB with metadata (version, timestamps, CRS, floor ids).
- Optional remote sync (later phase):
  - API client with optimistic updates and conflict policy.
  - Keep sync transport isolated from editing core.

## 9. Performance Plan
- Render optimization:
  - Use GeoJSON source partitioning by floor/layer type.
  - Debounce expensive recomputations for live editing.
- Compute optimization:
  - Run heavy geometry ops in Web Workers for large plans.
  - Prefer incremental updates over full recompute.
- Load targets:
  - Keep interaction smooth on large feature sets (thousands of features).

## 10. Testing and Quality Gates
- Unit tests (Vitest):
  - Geometry calculations, import/export transforms, validators, unit conversions.
- Component/integration tests:
  - Drawing flows, selection behavior, edit commits, undo/redo.
- Smoke tests:
  - Map initialization with/without MapTiler key.
  - Import invalid/valid GeoJSON and verify error handling.
- CI gates:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## 11. Security and Configuration
- Treat MapTiler API key as a client token with usage limits and domain restrictions.
- Document key provisioning and rotation.
- Avoid logging sensitive env values.

## 12. Delivery Phases
1. Map foundation:
   - MapLibre integration, MapTiler tiles, map state baseline.
2. Core editing:
   - Draw/select/edit/delete, measurement, undo/redo.
3. Data workflows:
   - GeoJSON import/export + validation + IndexedDB persistence.
4. IMDF support:
   - Incremental entity support and conformance checks.
5. Scale and hardening:
   - Worker offloading, performance tuning, UX polish, test expansion.

## 13. Immediate Next Implementation Tasks
1. Add dependencies:
   - `maplibre-gl`, `@turf/turf`, `proj4`, draw-control package, `idb`, `@tanstack/react-query`.
2. Add env contract:
   - `.env.example` with `VITE_MAPTILER_API_KEY=`.
3. Implement map bootstrap component:
   - Initialize MapLibre with MapTiler style URL and key injection.
4. Add first geometry utility module + tests:
   - Area, length, unit conversion.
5. Add IndexedDB project repository skeleton + tests.
