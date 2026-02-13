import { describe, expect, it } from "vitest";
import type { FloorFeature } from "../types";
import { applyContainmentParent, resolvePendingContainmentParent } from "./containment";

const unitFeature: FloorFeature = {
  type: "Feature",
  id: "unit-1",
  feature_type: "unit",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [5, 52],
        [5.0001, 52],
        [5.0001, 52.0001],
        [5, 52],
      ],
    ],
  },
  properties: {
    level_id: "level-1",
    name: { en: "Unit" },
  },
};

const amenityFeature: FloorFeature = {
  type: "Feature",
  id: "amenity-1",
  feature_type: "amenity",
  geometry: {
    type: "Point",
    coordinates: [5, 52],
  },
  properties: {
    level_id: "level-1",
    name: { en: "Amenity" },
  },
};

describe("containment helpers", () => {
  it("resolves selected container feature as pending containment parent", () => {
    expect(resolvePendingContainmentParent(unitFeature)).toEqual({
      parentId: "unit-1",
      parentType: "unit",
    });
  });

  it("does not resolve non-container features as pending containment parents", () => {
    expect(resolvePendingContainmentParent(amenityFeature)).toBeUndefined();
  });

  it("applies and clears containment properties", () => {
    const withParent = applyContainmentParent(
      {
        name: { en: "Path 1" },
      },
      {
        parentId: "unit-1",
        parentType: "unit",
      },
    );
    expect(withParent["formation:containment_parent_id"]).toBe("unit-1");
    expect(withParent["formation:containment_parent_type"]).toBe("unit");

    const cleared = applyContainmentParent(withParent, undefined);
    expect(cleared["formation:containment_parent_id"]).toBeUndefined();
    expect(cleared["formation:containment_parent_type"]).toBeUndefined();
  });
});
