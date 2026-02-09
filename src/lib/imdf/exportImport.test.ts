import { describe, expect, it } from "vitest";
import { exportFloorGeoJson, sortFeaturesForRendering } from "./export";
import { importFloorGeoJson } from "./import";

describe("imdf export/import", () => {
  it("exports one floor with normalized metadata", () => {
    const collection = exportFloorGeoJson({
      building: { id: "b1", name: "Building" },
      floor: { id: "f1", buildingId: "b1", name: "Floor" },
      features: [
        {
          type: "Feature",
          id: "feature-1",
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
          },
        },
      ],
    });

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties.imdfType).toBe("unit");
    expect(collection.features[0]?.properties.buildingId).toBe("b1");
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
            kind: "path",
          },
        },
      ],
    });

    const imported = importFloorGeoJson({
      buildingId: "b1",
      floorId: "f1",
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
    expect(exported.features[0]?.properties.floorId).toBe("f1");
  });

  it("applies deterministic render ordering", () => {
    const ordered = sortFeaturesForRendering([
      {
        type: "Feature",
        id: "b",
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
        },
      },
      {
        type: "Feature",
        id: "a",
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
          kind: "level",
          floorId: "f1",
        },
      },
    ]);

    expect(ordered[0]?.properties.kind).toBe("level");
    expect(ordered[1]?.properties.kind).toBe("unit");
  });
});
