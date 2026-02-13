import { describe, expect, it } from "vitest";
import { migrateProjectSnapshotToNavigationGraphV5 } from "./v5";

describe("migrateProjectSnapshotToNavigationGraphV5", () => {
  it("converts legacy opening lines into navigation edges and endpoint nodes", () => {
    const migrated = migrateProjectSnapshotToNavigationGraphV5({
      id: "default-project",
      name: "Legacy",
      version: 5,
      updatedAt: "2026-02-13T00:00:00.000Z",
      buildings: [{ id: "building-1", name: "B1" }],
      floors: [{ id: "floor-1", buildingId: "building-1", name: "L1" }],
      features: [
        {
          type: "Feature",
          id: "opening-1",
          feature_type: "opening",
          geometry: {
            type: "LineString",
            coordinates: [
              [5.12, 52.09],
              [5.121, 52.0905],
            ],
          },
          properties: {
            level_id: "floor-1",
            floorId: "floor-1",
            category: "pedestrian",
            name: { en: "Path 1" },
          },
        },
      ],
      overlays: [],
    });

    expect(migrated.version).toBeGreaterThanOrEqual(6);
    const edgeFeatures = migrated.features.filter(
      (feature) => feature.feature_type === "formation:navigation-edge",
    );
    const nodeFeatures = migrated.features.filter(
      (feature) => feature.feature_type === "formation:navigation-node",
    );

    expect(edgeFeatures).toHaveLength(1);
    expect(nodeFeatures.length).toBeGreaterThanOrEqual(2);
    expect(edgeFeatures[0]?.properties["formation:from_node_id"]).toBeTruthy();
    expect(edgeFeatures[0]?.properties["formation:to_node_id"]).toBeTruthy();
    expect(edgeFeatures[0]?.properties["formation:path_category"]).toBe("pedestrian");
  });
});
