import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "../types";
import mixedFloorCollection from "./__fixtures__/mixed-floor-feature-collection.json";
import {
  exportFloorGeoJson,
  exportImdfDataset,
  IMDF_DATASET_TYPES,
  sortFeaturesForRendering,
} from "./export";
import { imdfCollectionFileName } from "./fileNames";
import { importFloorGeoJson } from "./import";
import { validateImdfDatasetFiles } from "./validate";

const fixture = mixedFloorCollection as unknown as FeatureCollection;

describe("imdf export/import", () => {
  it("exports one floor with normalized metadata", () => {
    const collection = exportFloorGeoJson({
      building: { id: "b1", name: "Building" },
      floor: { id: "f1", buildingId: "b1", name: "Floor" },
      features: [
        {
          type: "Feature",
          id: "feature-1",
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
      ],
    });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.feature_type).toBe("unit");
    expect(collection.features[0]?.properties.building_ids).toBeUndefined();
  });

  it("round-trips a floor feature collection", () => {
    const raw = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "shape-1",
          geometry: {
            type: "LineString",
            coordinates: [
              [5, 52],
              [5.001, 52.001],
            ],
          },
          properties: {
            category: "pedestrian",
          },
        },
      ],
    });

    const imported = importFloorGeoJson({
      buildingId: "b1",
      level_id: "f1",
      raw,
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }

    const exported = exportFloorGeoJson({
      building: { id: "b1", name: "Building" },
      floor: { id: "f1", buildingId: "b1", name: "Floor" },
      features: imported.features,
    });

    expect(exported.features).toHaveLength(1);
    expect(exported.features[0]?.properties.level_id).toBe("f1");
  });

  it("applies deterministic render ordering", () => {
    const ordered = sortFeaturesForRendering([
      {
        type: "Feature",
        id: "b",
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
      {
        type: "Feature",
        id: "a",
        feature_type: "level",
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

    expect(ordered[0]?.feature_type).toBe("level");
    expect(ordered[1]?.feature_type).toBe("unit");
  });

  it("exports a proper IMDF package with required files", () => {
    const dataset = exportImdfDataset({
      building: { id: "building-1", name: "HQ Building" },
      floor: { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
      features: fixture.features,
    });

    expect(Object.keys(dataset.files)).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "venue.json",
        "building.json",
        "footprint.json",
        "level.json",
        "unit.json",
        "opening.json",
        "relationship.json",
      ]),
    );

    for (const type of IMDF_DATASET_TYPES) {
      const collection = dataset.files[imdfCollectionFileName(type)];
      expect(collection).toBeDefined();
      if (!collection || !("features" in collection) || !Array.isArray(collection.features)) {
        continue;
      }

      expect(
        collection.features.every(
          (feature) =>
            typeof feature === "object" &&
            feature !== null &&
            "feature_type" in feature &&
            feature.feature_type === type,
        ),
      ).toBe(true);
    }
  });

  it("exports opening paths and derived containment relationships", () => {
    const dataset = exportImdfDataset({
      building: { id: "building-1", name: "HQ Building" },
      floor: { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
      features: fixture.features,
    });

    const openingCollection = dataset.files["opening.json"];
    const relationshipCollection = dataset.files["relationship.json"];

    expect(openingCollection).toBeDefined();
    expect(relationshipCollection).toBeDefined();
    if (
      !openingCollection ||
      !("features" in openingCollection) ||
      !Array.isArray(openingCollection.features) ||
      !relationshipCollection ||
      !("features" in relationshipCollection) ||
      !Array.isArray(relationshipCollection.features)
    ) {
      return;
    }

    expect(openingCollection.features.length).toBeGreaterThan(0);
    expect(relationshipCollection.features.length).toBeGreaterThan(0);

    const validation = validateImdfDatasetFiles(dataset.files);
    expect(validation.errors).toEqual([]);
  });
});
