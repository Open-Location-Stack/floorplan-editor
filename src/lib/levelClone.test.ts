import { describe, expect, it } from "vitest";
import { cloneLevelWithReferences } from "./levelClone";
import type { FloorFeature, FloorOverlay } from "./types";

const createIdSequence = (...ids: string[]): (() => string) => {
  let index = 0;
  return () => {
    const id = ids[index];
    if (!id) {
      throw new Error("Ran out of test ids.");
    }
    index += 1;
    return id;
  };
};

describe("cloneLevelWithReferences", () => {
  it("deep clones floor data and remaps ids and references", () => {
    const sourceFeatureA: FloorFeature = {
      type: "Feature",
      id: "unit-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5, 52],
            [5.001, 52],
            [5.001, 52.001],
            [5, 52],
          ],
        ],
      },
      properties: {
        kind: "unit",
        name: "Room A",
        floorId: "floor-1",
        buildingId: "building-1",
        id: "unit-1",
        imdf_id: "unit-1",
        level_id: "floor-1",
        building_id: "building-1",
      },
    };

    const sourceFeatureB: FloorFeature = {
      type: "Feature",
      id: "relationship-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [5, 52],
          [5.001, 52.001],
        ],
      },
      properties: {
        kind: "relationship",
        floorId: "floor-1",
        buildingId: "building-1",
        origin_id: "unit-1",
        destination_id: "unit-1",
        linked_feature_ids: ["unit-1", "relationship-1"],
        metadata: {
          anchorFloor: "floor-1",
          relation: {
            sourceId: "relationship-1",
            targetId: "unit-1",
          },
        },
      },
    };

    const sourceOverlay: FloorOverlay = {
      id: "overlay-1",
      floorId: "floor-1",
      imageName: "floor-1.png",
      imageDataUrl: "data:image/png;base64,abc",
      opacity: 70,
      visible: true,
      locked: false,
      corners: {
        topLeft: [5, 52],
        topRight: [5.002, 52],
        bottomRight: [5.002, 51.998],
        bottomLeft: [5, 51.998],
      },
      updatedAt: "2026-02-01T10:00:00.000Z",
    };

    const result = cloneLevelWithReferences({
      level: { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
      levels: [
        { id: "floor-1", buildingId: "building-1", name: "Ground Floor" },
        { id: "floor-2", buildingId: "building-1", name: "Ground Floor copy" },
      ],
      features: [sourceFeatureA, sourceFeatureB],
      overlays: [sourceOverlay],
      createIdFn: createIdSequence("floor-3", "unit-2", "relationship-2", "overlay-2"),
      timestamp: "2026-02-10T12:00:00.000Z",
    });

    expect(result.level.id).toBe("floor-3");
    expect(result.level.name).toBe("Ground Floor copy 2");
    expect(result.features).toHaveLength(2);
    expect(result.overlay?.id).toBe("overlay-2");
    expect(result.overlay?.floorId).toBe("floor-3");
    expect(result.overlay?.updatedAt).toBe("2026-02-10T12:00:00.000Z");

    const clonedUnit = result.features.find((feature) => feature.id === "unit-2");
    const clonedRelationship = result.features.find((feature) => feature.id === "relationship-2");
    const clonedRelationshipProperties = clonedRelationship?.properties as
      | {
          origin_id?: string;
          destination_id?: string;
          linked_feature_ids?: string[];
          metadata?: unknown;
        }
      | undefined;

    expect(clonedUnit).toBeDefined();
    expect(clonedUnit?.properties.floorId).toBe("floor-3");
    expect(clonedUnit?.properties.id).toBe("unit-2");
    expect(clonedUnit?.properties.imdf_id).toBe("unit-2");

    expect(clonedRelationship).toBeDefined();
    expect(clonedRelationship?.properties.floorId).toBe("floor-3");
    expect(clonedRelationshipProperties?.origin_id).toBe("unit-2");
    expect(clonedRelationshipProperties?.destination_id).toBe("unit-2");
    expect(clonedRelationshipProperties?.linked_feature_ids).toEqual(["unit-2", "relationship-2"]);
    expect(clonedRelationshipProperties?.metadata).toEqual({
      anchorFloor: "floor-3",
      relation: {
        sourceId: "relationship-2",
        targetId: "unit-2",
      },
    });

    expect(sourceFeatureA.id).toBe("unit-1");
    expect((sourceFeatureB.properties as { origin_id?: string }).origin_id).toBe("unit-1");
    expect(sourceOverlay.floorId).toBe("floor-1");
  });
});
