import { describe, expect, it } from "vitest";
import type { FloorFeature } from "../types";
import { firstValidSelection, resolveSelection } from "./selection";

const building = { id: "b1", name: "Building" };
const floor = { id: "f1", buildingId: "b1", name: "Floor" };
const feature: FloorFeature = {
  type: "Feature" as const,
  id: "shape-1",
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [0, 0] as [number, number],
        [1, 0] as [number, number],
        [1, 1] as [number, number],
        [0, 1] as [number, number],
        [0, 0] as [number, number],
      ],
    ],
  },
  properties: {
    kind: "unit",
    floorId: "f1",
  },
};

describe("selection", () => {
  it("resolves feature to floor and building", () => {
    const resolved = resolveSelection(
      { kind: "feature", id: "shape-1" },
      {
        buildings: [building],
        floors: [floor],
        features: [feature],
      },
    );

    expect(resolved?.building.id).toBe("b1");
    expect(resolved?.floor?.id).toBe("f1");
    expect(resolved?.feature?.id).toBe("shape-1");
  });

  it("returns undefined for dangling selection", () => {
    const resolved = resolveSelection(
      { kind: "feature", id: "missing" },
      {
        buildings: [building],
        floors: [floor],
        features: [feature],
      },
    );

    expect(resolved).toBeUndefined();
  });

  it("returns first valid selection", () => {
    const selection = firstValidSelection({
      buildings: [building],
      floors: [floor],
      features: [feature],
    });

    expect(selection).toEqual({ kind: "level", id: "f1" });
  });
});
