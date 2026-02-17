import { describe, expect, it } from "vitest";
import { exportGeoJson, parseGeoJsonImport } from "./geojson";

describe("geojson import/export", () => {
  it("fails on invalid JSON", () => {
    const result = parseGeoJsonImport("not-json");

    expect(result.ok).toBe(false);
  });

  it("imports and exports deterministic geojson", () => {
    const raw = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "f1",
          geometry: {
            type: "Point",
            coordinates: [1, 2],
          },
          properties: {
            kind: "amenity",
            name: "Test",
          },
        },
      ],
    });

    const imported = parseGeoJsonImport(raw);
    expect(imported.ok).toBe(true);

    if (imported.ok) {
      const output = exportGeoJson(imported.features);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe("FeatureCollection");
      expect(parsed.features).toHaveLength(1);
      expect(parsed.features[0].id).toBe("f1");
    }
  });

  it("drops relationship features on import", () => {
    const raw = JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "r1",
          feature_type: "relationship",
          geometry: {
            type: "LineString",
            coordinates: [
              [1, 2],
              [1.001, 2.001],
            ],
          },
          properties: {
            kind: "relationship",
            name: "Contains relationship",
            origin: { id: "a", feature_type: "unit" },
            destination: { id: "b", feature_type: "opening" },
            direction: "directed",
          },
        },
        {
          type: "Feature",
          id: "u1",
          feature_type: "unit",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 2],
                [1.001, 2],
                [1.001, 2.001],
                [1, 2.001],
                [1, 2],
              ],
            ],
          },
          properties: {
            kind: "unit",
            category: "room",
            name: "Unit",
            level_id: "f1",
          },
        },
      ],
    });

    const imported = parseGeoJsonImport(raw);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.features).toHaveLength(1);
    expect(imported.features[0]?.id).toBe("u1");
    expect(imported.features[0]?.feature_type).toBe("unit");
  });
});
