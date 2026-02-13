import { describe, expect, it } from "vitest";
import { migrateProjectSnapshotToNavigationGraphV5 } from "./v5";

describe("migrateProjectSnapshotToNavigationGraphV5", () => {
  it("bumps legacy snapshots to v6 and keeps features unchanged", () => {
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
    expect(migrated.features).toHaveLength(1);
    expect(migrated.features[0]?.feature_type).toBe("opening");
  });
});
