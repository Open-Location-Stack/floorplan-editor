import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "../types";
import mixedFloorCollection from "./__fixtures__/mixed-floor-feature-collection.json";
import { exportImdfDataset } from "./export";
import { validateFloor, validateImdfDatasetFiles } from "./validate";

const fixture = mixedFloorCollection as unknown as FeatureCollection;

describe("validateFloor", () => {
  it("reports missing required IMDF properties as errors", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "shape-1",
        feature_type: "unit",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {
          level_id: "f1",
        },
      },
    ]);

    expect(result.errors.some((error) => error.includes("missing required"))).toBe(true);
  });

  it("reports missing level_id", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "shape-1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: {},
      },
    ]);

    expect(result.errors.some((error) => error.includes("not assigned to level_id f1"))).toBe(true);
  });

  it("accepts valid relationship references", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "unit-a",
        feature_type: "unit",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        properties: {
          level_id: "f1",
          name: { en: "Unit A" },
          category: "room",
        },
      },
      {
        type: "Feature",
        id: "unit-b",
        feature_type: "unit",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        },
        properties: {
          level_id: "f1",
          name: { en: "Unit B" },
          category: "room",
        },
      },
      {
        type: "Feature",
        id: "relationship-1",
        feature_type: "relationship",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: {
          level_id: "f1",
          name: { en: "contains" },
          direction: "directed",
          origin: { id: "unit-a", feature_type: "unit" },
          destination: { id: "unit-b", feature_type: "unit" },
        },
      },
    ]);

    expect(result.errors).toEqual([]);
  });

  it("includes feature name in warnings when available", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "fixture-1",
        feature_type: "formation:unknown",
        geometry: {
          type: "Point",
          coordinates: [0, 0],
        },
        properties: {
          level_id: "f1",
          name: { en: "Coffee Cart" },
        },
      },
    ]);

    expect(result.warnings).toContain('Feature "Coffee Cart" (id: fixture-1) has no IMDF type.');
  });

  it("rejects openings with missing required category", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "edge-f1",
        feature_type: "opening",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: {
          level_id: "f1",
          name: { en: "Path 1" },
        },
      },
    ]);

    expect(result.errors.some((error) => error.includes("missing required category"))).toBe(true);
  });
});

describe("validateImdfDatasetFiles", () => {
  it("passes for exported IMDF packages", () => {
    const dataset = exportImdfDataset({
      building: { id: "building-1", name: "HQ Building" },
      floor: { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
      features: fixture.features,
    });

    const result = validateImdfDatasetFiles(dataset.files);
    expect(result.errors).toEqual([]);
  });

  it("fails when required files are missing", () => {
    const result = validateImdfDatasetFiles({});
    expect(result.errors.some((error) => error.includes("manifest.json"))).toBe(true);
    expect(result.errors.some((error) => error.includes("venue.json"))).toBe(true);
  });

  it("accepts datasets that omit optional collection files", () => {
    const result = validateImdfDatasetFiles({
      "manifest.json": {
        version: "1.0.0",
        files: [
          { name: "venue.json" },
          { name: "building.json" },
          { name: "footprint.json" },
          { name: "level.json" },
          { name: "unit.json" },
        ],
      },
      "venue.json": { type: "FeatureCollection", features: [] },
      "building.json": { type: "FeatureCollection", features: [] },
      "footprint.json": { type: "FeatureCollection", features: [] },
      "level.json": { type: "FeatureCollection", features: [] },
      "unit.json": { type: "FeatureCollection", features: [] },
    });

    expect(result.errors).toEqual([]);
  });

  it("fails when labels are strings instead of label objects", () => {
    const result = validateImdfDatasetFiles({
      "manifest.json": {
        version: "1.0.0",
        files: [{ name: "unit.json" }],
      },
      "venue.json": { type: "FeatureCollection", features: [] },
      "building.json": {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "ee6ba3dc-66ce-4c39-9be4-c4cc850bcf31",
            feature_type: "building",
            geometry: null,
            properties: {
              name: "Invalid label",
              venue_id: "7c3c7d7d-5f7f-4d77-b59b-c1230ef6762a",
            },
          },
        ],
      },
      "footprint.json": { type: "FeatureCollection", features: [] },
      "level.json": { type: "FeatureCollection", features: [] },
      "unit.json": { type: "FeatureCollection", features: [] },
    });

    expect(result.errors.some((error) => error.includes("label object"))).toBe(true);
  });

  it("accepts legacy .geojson filenames", () => {
    const result = validateImdfDatasetFiles({
      "manifest.json": {
        version: "1.0.0",
        files: [
          { name: "venue.geojson" },
          { name: "building.geojson" },
          { name: "footprint.geojson" },
          { name: "level.geojson" },
          { name: "unit.geojson" },
        ],
      },
      "venue.geojson": { type: "FeatureCollection", features: [] },
      "building.geojson": { type: "FeatureCollection", features: [] },
      "footprint.geojson": { type: "FeatureCollection", features: [] },
      "level.geojson": { type: "FeatureCollection", features: [] },
      "unit.geojson": { type: "FeatureCollection", features: [] },
    });

    expect(result.errors).toEqual([]);
  });

  it("accepts non-standard category strings for category fields that allow custom values", () => {
    const result = validateImdfDatasetFiles({
      "manifest.json": {
        version: "1.0.0",
        files: [
          { name: "venue.json" },
          { name: "building.json" },
          { name: "footprint.json" },
          { name: "level.json" },
          { name: "unit.json" },
          { name: "opening.json" },
        ],
      },
      "venue.json": { type: "FeatureCollection", features: [] },
      "building.json": { type: "FeatureCollection", features: [] },
      "footprint.json": { type: "FeatureCollection", features: [] },
      "level.json": { type: "FeatureCollection", features: [] },
      "unit.json": { type: "FeatureCollection", features: [] },
      "opening.json": {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "94a50cc0-86d2-45cc-9f2b-c6fdb0f58d8d",
            feature_type: "opening",
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            properties: {
              level_id: "7be1a1e0-4aeb-40d7-af49-f2fdb292f90f",
              category: "pedestrian.principal",
            },
          },
        ],
      },
    });

    expect(
      result.errors.some((error) => error.includes("properties.category must be one of")),
    ).toBe(false);
  });

  it("does not require opening name labels in import-lenient mode", () => {
    const result = validateImdfDatasetFiles(
      {
        "manifest.json": {
          version: "1.0.0",
          files: [
            { name: "venue.json" },
            { name: "building.json" },
            { name: "footprint.json" },
            { name: "level.json" },
            { name: "unit.json" },
            { name: "opening.json" },
          ],
        },
        "venue.json": { type: "FeatureCollection", features: [] },
        "building.json": { type: "FeatureCollection", features: [] },
        "footprint.json": { type: "FeatureCollection", features: [] },
        "level.json": { type: "FeatureCollection", features: [] },
        "unit.json": { type: "FeatureCollection", features: [] },
        "opening.json": {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "f8ce278f-f30a-45ca-b087-f5d6797e75a8",
              feature_type: "opening",
              geometry: {
                type: "LineString",
                coordinates: [
                  [0, 0],
                  [1, 1],
                ],
              },
              properties: {
                level_id: "7be1a1e0-4aeb-40d7-af49-f2fdb292f90f",
                category: "pedestrian.principal",
              },
            },
          ],
        },
      },
      { mode: "import-lenient" },
    );

    expect(
      result.warnings.some((warning) => warning.includes("missing required properties.name")),
    ).toBe(false);
  });

  it("downgrades recoverable schema issues in import-lenient mode", () => {
    const result = validateImdfDatasetFiles(
      {
        "manifest.json": {
          version: "1.0.0.rc.1",
        },
        "venue.json": {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "7c3c7d7d-5f7f-4d77-b59b-c1230ef6762a",
              feature_type: "venue",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                    [0, 0],
                  ],
                ],
              },
              properties: { name: { en: "Venue" } },
            },
          ],
        },
        "building.json": {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "ee6ba3dc-66ce-4c39-9be4-c4cc850bcf31",
              feature_type: "building",
              geometry: null,
              properties: {
                name: { en: "Building" },
              },
            },
          ],
        },
        "footprint.json": { type: "FeatureCollection", features: [] },
        "level.json": { type: "FeatureCollection", features: [] },
        "unit.json": { type: "FeatureCollection", features: [] },
      },
      { mode: "import-lenient" },
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("manifest.json files"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("venue_id"))).toBe(true);
  });
});
