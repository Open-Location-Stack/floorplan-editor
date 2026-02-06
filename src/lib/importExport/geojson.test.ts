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
});
