# FORMATION Building & Floor Plan Editor - Design Plan

## 1. Product Goal
Build a browser-based, map-first editor that lets non-GIS users create, edit, and maintain indoor floor plans aligned to real-world coordinates, with import/export in OGC IMDF/GeoJSON and reliable local-first persistence.

## 2. Context and Assumptions
Reasonable assumptions based on [tryformation.com](https://tryformation.com):
- FORMATION is map-first and indoor/outdoor oriented.
- Primary users are operations/event/building teams, not GIS specialists.
- Fast onboarding matters (simple controls, clear workflows, minimal jargon).
- Navigation and wayfinding are core outcomes, so path editing is a first-class feature.

Assumptions for this phase:
- Single-user, browser-local editing first (no backend sync yet).
- Desktop-first UX with responsive behavior for tablets.
- IMDF 1.0.0 compatibility target.
- Multi-site, multi-building projects are in scope from day one.
- Address search/repositioning will use OpenCage geocoding (API key injected via environment config later).

## 3. Primary Users
- Facility/operations managers maintaining building maps.
- Event/site coordinators preparing temporary or seasonal floor layouts.
- Non-technical staff importing plans and adjusting geometry.

User characteristics:
- Comfortable with map apps, not with GIS tooling or coordinate systems.
- Need visual feedback, guardrails, and sensible defaults.

## 4. Functional Requirements
### 4.1 Building/Floor CRUD
- Create, rename, duplicate, and delete buildings.
- Create, rename, reorder, and delete floors.
- Edit floor level metadata (ordinal, display name, optional altitude metadata).
- Quick inline editing in lists/tables.
- Support multiple campuses/sites globally in one project.

### 4.2 Floor Plan Image Workflow
- Upload raster floor plan image (PNG/JPG/WebP).
- Overlay image on map with controls:
  - Move
  - Rotate
  - Scale
  - Opacity/transparency
- Save georeferenced image transform per floor.
- Replace image while preserving existing alignment by default (assuming unchanged aspect ratio).
- Provide a reset/re-align action when replacement image needs a new transform.

### 4.3 Geometry Authoring
- Draw/edit/delete IMDF-relevant geometry across polygon/line/point types.
- Minimum supported out of the gate:
  - `venue`, `building`, `level`, `unit`, `section`, `opening`, `detail`, `amenity`, `anchor`
- Extended set for “full range” target:
  - `fixture`, `kiosk`, `footprint`, `geofence`, `occupant`, `relationship`, `address`
- Snap tools, undo/redo, and topology hints (close polygon, avoid self-intersections).

### 4.4 Navigable Paths
- Draw paths over floor plans.
- Associate path segments with floors/levels.
- Validate path connectivity and endpoint placement.
- Export paths in GeoJSON (and mapped to IMDF structures where applicable).
- Store paths as an explicit graph model (`nodes`/`edges`) with map-rendered geometry derived from graph state.

### 4.5 Import/Export
- Export per-floor IMDF/GeoJSON.
- Export full zip-based project package (buildings + floors + features + images + transforms).
- Import package to restore complete editor state.
- Keep IMDF imports without images fully editable and allow optional image attachment later.
- Export image transform metadata JSON containing corner coordinates in WGS84.

## 5. Non-Functional Requirements
- Full viewport workspace (graphics-first UI).
- Smooth interaction on large plans (thousands of features).
- Local-first persistence and recovery after refresh/crash.
- Deterministic export output and schema validation.
- Accessibility baseline: keyboard support for key actions, readable contrast, explicit labels.

## 6. Proposed Technical Architecture
### 6.1 Frontend
- React + TypeScript + Vite (existing stack).
- Map rendering: `maplibre-gl`.
- Geocoding/search: OpenCage API integration for address-to-coordinate lookup and map repositioning.
- Editing layer:
  - Option A: custom editor tools over MapLibre sources/layers.
  - Option B: integrate an editing helper library where it reduces complexity.
- State management: Zustand (or Redux Toolkit) with domain slices.

### 6.2 Persistence
- IndexedDB for project data, geometries, and binary image blobs.
- `localStorage` for lightweight UI preferences (active floor, panel state, theme).
- Versioned local schema + migration mechanism.

### 6.3 Data Model (logical)
- `Project`
- `Site` (belongs to Project; global location grouping)
- `Building` (belongs to Site/Project)
- `Floor` (belongs to Building)
- `ImageOverlay` (belongs to Floor; includes transform and opacity)
- `ImdfFeature` (typed geo feature, linked to Floor/Building/Venue scope)
- `PathNetwork` (graph by floor: explicit `PathNode` + `PathEdge`)

## 7. IMDF Strategy
Implement a schema-driven IMDF module:
- Internal canonical feature format with adapters per IMDF feature type.
- Validation rules:
  - required properties per feature type
  - UUID requirements
  - geometry-type constraints
  - cross-reference integrity (e.g., `level_id`, `unit_id`)
- Import parser tolerant of partial datasets; exporter always emits valid GeoJSON with IMDF-recommended/required properties.

Packaging targets:
- Standard IMDF archive layout (`manifest.json` + type-specific `.geojson` files).
- FORMATION project bundle (zip, day-one) including:
  - IMDF files
  - image assets
  - `image-overlays.json` (corner coordinates, opacity, image linkage)

## 8. Image Georeferencing Design
Store four corner coordinates per image overlay:
- `topLeft`, `topRight`, `bottomRight`, `bottomLeft` in `[lng, lat]`.

Editor behavior:
- Initial placement from map center + guessed scale.
- Handles for translate/rotate/scale.
- Opacity slider (0-100%).
- Optional lock toggle to prevent accidental movement.

Export format (`image-overlays.json`):
- Floor/building IDs
- Image file reference
- Corner coordinates
- Opacity and z-order
- Timestamp/version metadata

## 9. UX Principles for Non-GIS Users
- Replace GIS jargon with plain language (`Floor`, `Room`, `Door`, `Path`).
- Step-by-step “guided mode” for first map creation:
  1. Create building
  2. Add floor
  3. Upload and align image
  4. Draw walls/rooms
  5. Draw paths
  6. Export
- Persistent validation panel with actionable fixes.
- Feature templates and presets (room, hallway, elevator, stairs, restroom, etc.).

## 10. UI Layout (Full Viewport)
- Top bar: project actions (new/import/export/validate) + global search (OpenCage geocoding).
- Left panel: building/floor hierarchy + feature catalog.
- Center: full-size MapLibre canvas.
- Right panel: selected feature properties + style + IMDF fields.
- Bottom/status bar: zoom, cursor coordinates, validation summary.

## 11. Validation and Error Handling
- Inline validation on edit.
- Pre-export validation gate with severity levels:
  - Error (blocks export when GeoJSON is invalid)
  - Warning (IMDF-recommended fields missing; export still allowed with notice)
- Auto-save snapshots and restore prompt on load.

## 12. Delivery Plan (Phased)
### Phase 1 - Local-first MVP
- Building/floor CRUD.
- Multi-site + multi-building project support.
- Image upload + alignment + opacity.
- OpenCage-powered address search and map repositioning.
- Draw/edit core geometry (`level`, `unit`, `opening`, `section`, `amenity`).
- Local persistence (IndexedDB + localStorage).
- Zip bundle export/import (IMDF/GeoJSON + images + image overlay metadata).

### Phase 2 - IMDF Compliance + Paths
- IMDF archive import/export.
- Path authoring + connectivity checks.
- Validation engine and repair suggestions.

### Phase 3 - Full IMDF Coverage + Polish
- Remaining IMDF feature types.
- Guided onboarding, presets, advanced snapping.
- Performance optimizations for large sites.

## 13. Testing Strategy
- Unit tests for model transforms and IMDF adapters.
- Integration tests for import/export round trips.
- UI tests for map editing interactions and keyboard flows.
- Golden-file tests for deterministic IMDF exports.

## 14. Risks and Mitigations
- Complex geometry editing UX:
  - Mitigation: guided tools, snapping, robust undo/redo.
- IMDF compliance complexity:
  - Mitigation: schema-first validation and staged feature support.
- Browser storage limits with large images:
  - Mitigation: compression options, image size checks, cleanup tooling.

## 15. Decisions Captured
1. Support multi-site, multi-building projects worldwide in a single project.
2. Enforce valid GeoJSON exports and include IMDF-recommended/required properties.
3. Use explicit graph-based path modeling (`nodes`/`edges`).
4. Preserve image alignment on replacement by default; provide reset/re-align.
5. Keep IMDF imports without images fully editable; image attachment stays optional.
6. Ship zip-based project bundles from day one.
