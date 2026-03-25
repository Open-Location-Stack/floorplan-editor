# Open Location Stack - Floorplan Editor

Browser-based editor for creating and maintaining building/floor plans on top of a live map.  
The app is local-first (IndexedDB), supports import/export workflows, and is built with React + Vite + TypeScript.

## Status

The map editor is currently still under going a lot of development. While that is happening, expect compatibility breaking changes to import/export formats. A big topic currently is correctness and aligning the format with the specification and what other editors in this space do.

## Features
- Interactive map canvas powered by MapLibre + MapTiler.
- Building/floor hierarchy with selection-aware editing panels.
- Draw/edit/delete support for point, line, and polygon floor features.
- Floorplan image overlays with corner-based alignment.
- Auto-save to IndexedDB with project snapshot sanitization and migration-safe loading.
- GeoJSON and IMDF-oriented import/export + validation utilities.
- Address search/recenter flow via OpenCage geocoding.

## Run Locally
1. Ensure Node.js `>=22` is installed.
2. Install dependencies:

```bash
npm install
```

3. Create a local env file and add required API keys:

```bash
cp .env.example .env
```

Required variables:
- `VITE_MAPTILER_API_KEY` (map rendering)
- `VITE_OPENCAGE_API_KEY` (location search)

4. Start the dev server:

```bash
npm run dev
```

Open `http://localhost:5173`.

## Useful Commands
- `npm run test` for unit tests.
- `npm run test:browser` for browser smoke tests.
- `npm run test:e2e` for Playwright end-to-end tests.
- `npm run typecheck` for TypeScript checks.
- `npm run lint` for Biome lint/format checks.
- `npm run build` for production build output in `dist/`.
- `npm run validate-imdf -- <dataset-dir>` to validate IMDF datasets.

## Licensing
- Third-party attributions and notices: `docs/THIRD_PARTY_NOTICES.md`.
