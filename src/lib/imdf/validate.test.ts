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
          kind: "unit",
          floorId: "f1",
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
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: {
          kind: "opening",
          floorId: "f1",
        },
      },
    ]);

    expect(result.errors).toContain("Feature shape-1 is not assigned to level_id f1.");
  });

  it("accepts valid relationship references", () => {
    const result = validateFloor("f1", [
      {
        type: "Feature",
        id: "unit-a",
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
          kind: "unit",
          imdfType: "unit",
          floorId: "f1",
          level_id: "f1",
          name: { en: "Unit A" },
          category: "room",
        },
      },
      {
        type: "Feature",
        id: "unit-b",
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
          kind: "unit",
          imdfType: "unit",
          floorId: "f1",
          level_id: "f1",
          name: { en: "Unit B" },
          category: "room",
        },
      },
      {
        type: "Feature",
        id: "relationship-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: {
          kind: "relationship",
          imdfType: "relationship",
          floorId: "f1",
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
    expect(result.errors.some((error) => error.includes("venue.geojson"))).toBe(true);
  });

  it("accepts datasets that omit optional collection files", () => {
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

  it("fails when labels are strings instead of label objects", () => {
    const result = validateImdfDatasetFiles({
      "manifest.json": {
        version: "1.0.0",
        files: [{ name: "unit.geojson" }],
      },
      "venue.geojson": { type: "FeatureCollection", features: [] },
      "building.geojson": {
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
      "footprint.geojson": { type: "FeatureCollection", features: [] },
      "level.geojson": { type: "FeatureCollection", features: [] },
      "unit.geojson": { type: "FeatureCollection", features: [] },
    });

    expect(result.errors.some((error) => error.includes("label object"))).toBe(true);
  });
});
