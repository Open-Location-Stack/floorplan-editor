import { describe, expect, it } from "vitest";
import { sanitizeProjectSnapshot } from "./projectSnapshotSanitizer";

describe("sanitizeProjectSnapshot", () => {
  it("drops invalid features and overlays and backfills floor ids", () => {
    const sanitized = sanitizeProjectSnapshot({
      id: "p1",
      name: "project",
      version: 3,
      updatedAt: "2026-02-06T00:00:00.000Z",
      buildings: [{ id: "b1", name: "Building A" }],
      floors: [{ id: "f1", buildingId: "b1", name: "Floor A" }],
      features: [
        {
          type: "Feature",
          id: "ok-point",
          geometry: { type: "Point", coordinates: [5, 52] },
          properties: { kind: "amenity" },
        },
        {
          type: "Feature",
          id: "ok-relationship",
          geometry: {
            type: "LineString",
            coordinates: [
              [5, 52],
              [5.001, 52.001],
            ],
          },
          properties: { kind: "relationship" },
        },
        {
          type: "Feature",
          id: "broken",
          geometry: { type: "Polygon", coordinates: [[[5, 52]]] },
          properties: { kind: "unit" },
        },
      ],
      overlays: [
        {
          id: "overlay-ok",
          floorId: "f1",
          imageName: "x.png",
          imageDataUrl: "data:image/png;base64,abc",
          opacity: 120,
          corners: {
            topLeft: [0, 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
        {
          id: "overlay-bad",
          floorId: "missing",
          imageName: "x.png",
          imageDataUrl: "",
          opacity: 40,
          corners: {
            topLeft: [0, 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
      lockedFeatureIds: ["ok-point", "missing-feature", "ok-point", ""],
      lockedOverlayFloorIds: ["f1", "missing-floor", "f1", ""],
    });

    expect(sanitized.features).toHaveLength(2);
    expect(sanitized.features[0]?.properties.floorId).toBe("f1");
    expect(sanitized.features.some((feature) => feature.properties.kind === "relationship")).toBe(
      true,
    );
    expect(sanitized.overlays).toHaveLength(1);
    expect(sanitized.overlays[0]?.opacity).toBe(100);
    expect(sanitized.overlays[0]?.visible).toBe(true);
    expect(sanitized.lockedFeatureIds).toEqual(["ok-point"]);
    expect(sanitized.lockedOverlayFloorIds).toEqual(["f1"]);
  });

  it("keeps project empty when building/floor data is missing", () => {
    const sanitized = sanitizeProjectSnapshot({
      id: "p2",
      name: "project",
      version: 3,
      updatedAt: "2026-02-06T00:00:00.000Z",
      features: [],
      overlays: [],
    });

    expect(sanitized.buildings).toHaveLength(0);
    expect(sanitized.floors).toHaveLength(0);
  });

  it("uses 30 as default overlay opacity when missing", () => {
    const sanitized = sanitizeProjectSnapshot({
      id: "p3",
      name: "project",
      version: 3,
      updatedAt: "2026-02-06T00:00:00.000Z",
      buildings: [{ id: "b1", name: "Building A" }],
      floors: [{ id: "f1", buildingId: "b1", name: "Floor A" }],
      features: [],
      overlays: [
        {
          id: "overlay-default-opacity",
          floorId: "f1",
          imageName: "x.png",
          imageDataUrl: "data:image/png;base64,abc",
          corners: {
            topLeft: [0, 0],
            topRight: [1, 0],
            bottomRight: [1, -1],
            bottomLeft: [0, -1],
          },
          updatedAt: "2026-02-06T00:00:00.000Z",
        },
      ],
    } as never);

    expect(sanitized.overlays[0]?.opacity).toBe(30);
  });
});
