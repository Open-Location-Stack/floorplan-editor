# IMDF Test Building Fixtures

This directory contains third-party IMDF archives used to verify import compatibility.

## Fixtures

- `osmtomimdf-test-building.zip`
  - Source: https://github.com/danielrotaermel/osmtoimdf
  - Purpose: degraded/compatibility case with known schema and reference quality issues.
- `ogc-imdf-pdhoward-venue.zip`
  - Source: https://github.com/pdhoward/imdf/tree/2393db97ced4e00cb42d4f39714c6e14234a8a87/venue
  - Purpose: canonical-valid compatibility fixture with `.geojson` collection names.
- `ogc-imdf-open-imdf-demo.zip`
  - Source: https://github.com/CUSCRD/Open-IMDF/tree/271801f84cbe6f222de04eb056a43cd048c44ce6/dev_demo_sample_data/data
  - Purpose: canonical-valid compatibility fixture with broad IMDF collection coverage.

## Provenance Metadata

- `ogc-imdf-sources.json` records:
  - pinned commit SHAs,
  - upstream source URLs,
  - source-to-archive filename mappings.

## Regenerating Fixtures

Run:

```bash
node scripts/fetch-ogc-imdf-fixtures.mjs
```

The script fetches files from pinned commits and rebuilds the OGC-aligned fixture archives deterministically.
